import { test, ok, eq } from '../lib/t.mjs';
import { createGame, step } from '../../src/engine/engine.js';
import { WEAPONS } from '../../src/engine/data/weapons.js';
import { makeWeapon } from '../../src/engine/actor.js';
import { SPRINT_HOLD } from '../../src/engine/move.js';
import { sprintOutT } from '../../src/engine/weapon.js';

// 訓練場で、ダッシュを押したまま走っている人（11-12: ダッシュ中もほかの操作を受け付ける）
function mkRunner(gun = { id: 'mk18', ammo: 'ap' }) {
  const G = createGame({ map: 'training', mode: 'train', seed: 7, team: 1, house: false });
  const p = G.S.actors.find(a => a.pid === 0);
  p.inv.w[0] = makeWeapon(gun);
  p.ws.slot = 0; p.ws.st = 'draw'; p.ws.t = 0.1;
  const run = (o = {}) => step(G, { [p.id]: { mx: 0, mz: 1, yaw: p.yaw, pitch: 0, stance: 0, sprint: true, ...o } });
  for (let i = 0; i < 30; i++) run();
  return { G, p, wi: p.inv.w[0], run };
}
const shotsOf = (ev, p) => ev.filter(e => e.e === 'shot' && e.id === p.id).length;

test('sprint: ダッシュを押していても ADS が先。構えをやめるとまた走る', () => {
  const { p, run } = mkRunner();
  ok(p.sprint, '走っている');
  for (let i = 0; i < 40; i++) run({ ads: true });
  ok(!p.sprint, '構えている間は走らない');
  ok(p.ads > 0.9, `構えられる ${p.ads.toFixed(2)}`);
  for (let i = 0; i < 3; i++) run();
  ok(p.sprint, '構えをやめたらまた走る');
});

test('sprint: ダッシュを押していてもリーンが先。リーンをやめるとまた走る', () => {
  const { p, run } = mkRunner();
  for (let i = 0; i < 30; i++) run({ lean: 1 });
  ok(!p.sprint, 'リーンしている間は走らない');
  ok(p.lean > 0.2, `傾く ${p.lean.toFixed(2)}`);
  for (let i = 0; i < 3; i++) run();
  ok(p.sprint, 'リーンをやめたらまた走る');
});

test('sprint: 引き金を引くと走るのをやめ、銃が上がったら撃つ（短く押しただけでも単発で1発）。少しして、また走る', () => {
  const { G, p, wi, run } = mkRunner();
  wi.mode = Math.max(0, WEAPONS.mk18.modes.indexOf('semi'));
  let ev = run({ fire: true });
  ok(!p.sprint, '走るのをやめる');
  eq(shotsOf(ev, p), 0, '銃を上げている間は撃たない');
  let shots = 0, at = -1;
  for (let i = 1; i <= 20; i++) { ev = run(); const n = shotsOf(ev, p); if (n && at < 0) at = i; shots += n; }
  eq(shots, 1, '引き金は離していても、覚えていた1発を撃つ');
  const T = sprintOutT(WEAPONS.mk18);
  ok(at * G.S.dt >= T - 0.02 && at * G.S.dt <= T + 0.03, `銃を上げる時間 ${(at * G.S.dt).toFixed(2)}秒（${T.toFixed(2)}）`);
  ok(!p.sprint, `撃ってすぐ（${SPRINT_HOLD}秒まで）は走らない`);
  for (let i = 0; i < 12; i++) run();
  ok(p.sprint, 'また走る');
  // 押し続ける（連射）: 押している間は走らない
  wi.mode = Math.max(0, WEAPONS.mk18.modes.indexOf('auto'));
  shots = 0;
  for (let i = 0; i < 40; i++) { ev = run({ fire: true }); shots += shotsOf(ev, p); }
  ok(!p.sprint && shots >= 5, `押している間は撃ち続ける（${shots}発）`);
});

test('sprint: リロードが先（押したままでは走らない）。ダッシュを入れ直すとリロードをやめて走る', () => {
  const { p, wi, run } = mkRunner();
  wi.mag = 5; const n0 = wi.mags.length;
  let ev = run({ act: [{ a: 'reload' }] });
  ok(ev.some(e => e.e === 'reload' && e.id === p.id), 'リロードが始まる');
  eq(p.ws.st, 'reload'); ok(!p.sprint, '走るのをやめる');
  for (let i = 0; i < 30; i++) run();
  eq(p.ws.st, 'reload', '押したままではリロードを続ける'); ok(!p.sprint, 'リロードの間は走らない');
  // 押したままの間は何も起きない。入れ直す（手元が動作 'sprint' を送る）とやめる
  ev = run({ act: [{ a: 'sprint' }] });
  ok(ev.some(e => e.e === 'reloadx' && e.id === p.id), '入れ直すとリロードをやめる');
  eq(p.ws.st, 'ready'); ok(p.sprint, 'すぐ走る');
  eq(wi.mag, 5, '弾倉は替わっていない'); eq(wi.mags.length, n0, '予備の弾倉もそのまま');
  // 最後までリロードすると、押したままのダッシュに戻る
  run({ act: [{ a: 'reload' }] });
  for (let i = 0; i < 260 && p.ws.st === 'reload'; i++) run();
  eq(p.ws.st, 'ready'); ok(wi.mag > 5, '弾倉を替えた');
  run();
  ok(p.sprint, 'リロードが終わるとまた走る');
});

test('sprint: 1発ずつ込める散弾銃は、入れ直してやめても込めた分が残る', () => {
  const { p, wi, run } = mkRunner({ id: 'm4super', ammo: 'buck' });
  wi.mag = 1;
  run({ act: [{ a: 'reload' }] });
  eq(p.ws.st, 'shell', '1発ずつ込める');
  for (let i = 0; i < 200 && wi.mag < 3; i++) run();
  ok(wi.mag >= 3, `込めた ${wi.mag}`);
  const m = wi.mag;
  run({ act: [{ a: 'sprint' }] }); run();
  ok(p.ws.st === 'ready' || p.ws.st === 'pump', `やめる（${p.ws.st}）`);
  ok(wi.mag >= m, '込めた分は残る');
});

test('sprint: ダッシュの入れ直しは、リロードしていなければ何もしない（撃てる・ポンプもそのまま）', () => {
  const { p, wi, run } = mkRunner();
  const st0 = p.ws.st, mag0 = wi.mag;
  const ev = run({ act: [{ a: 'sprint' }] });
  ok(!ev.some(e => e.e === 'reloadx'), 'やめる物がない');
  eq(p.ws.st, st0); eq(wi.mag, mag0); ok(p.sprint, '走ったまま');
});

test('sprint: オンラインの手元の先読み（ゲスト）でも、リロードを始めて・入れ直してやめる（ホストと同じ動き）', async () => {
  const { doAction } = await import('../../src/engine/interact.js');
  const { moveActor } = await import('../../src/engine/move.js');
  const { stepWeapon } = await import('../../src/engine/weapon.js');
  const { G, p, wi } = mkRunner();
  const S = G.S, w = G.w; S.predict = true;
  wi.mag = 5;
  // netgame.js の guestFrame と同じ: 動作は doAction（手元でやるもの）と、銃の動作だけ stepWeapon へ
  const frame = (o = {}) => {
    const cmd = { mx: 0, mz: 1, yaw: p.yaw, pitch: 0, stance: 0, sprint: true, fire: false, ads: false, ...o };
    const ev = [];
    if (cmd.act) for (const ac of cmd.act) doAction(S, w, p, ac, ev);
    const inp = { ...cmd, act: cmd.act ? cmd.act.filter(ac => ac.a === 'reload' || (ac.a === 'mode' && ac.zoom)) : null };
    moveActor(S, w, p, inp, S.dt, ev); stepWeapon(S, w, p, inp, S.dt, ev);
    return ev;
  };
  let ev = frame({ act: [{ a: 'reload' }] });
  eq(p.ws.st, 'reload', '手元でもリロードが始まる'); ok(ev.some(e => e.e === 'reload'), '音を出す出来事');
  for (let i = 0; i < 10; i++) frame();
  ok(!p.sprint, '手元でも走らない（ホストと同じ速さ）');
  ev = frame({ act: [{ a: 'sprint' }] });
  eq(p.ws.st, 'ready', '手元でもやめる'); ok(p.sprint, '走る');
});
