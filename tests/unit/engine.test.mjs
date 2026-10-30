import { test, ok, eq, near } from '../lib/t.mjs';
import { createGame, step, dump, load } from '../../src/engine/engine.js';
import { WEAPONS } from '../../src/engine/data/weapons.js';
import { eyeOf } from '../../src/engine/combat.js';

function mk(o = {}) { return createGame({ map: 'training', mode: 'train', seed: 7, team: 1, house: false, ...o }); }

test('engine: 訓練場で試合を作れる', () => {
  const G = mk();
  ok(G.S.actors.length >= 1, '人がいる');
  const p = G.S.actors[0];
  eq(p.kind, 'swat'); ok(p.inv.w[0] && p.inv.w[0].id === 'mk18', '主武器');
});

test('engine: 前に歩くと進み、壁で止まる', () => {
  const G = mk();
  const p = G.S.actors[0];
  const z0 = p.z;
  for (let i = 0; i < 120; i++) step(G, { [p.id]: { mx: 0, mz: 1, yaw: p.yaw, pitch: 0, stance: 0 } });
  ok(z0 - p.z > 2.0, `北へ進む ${z0 - p.z}`);
  near(Math.hypot(p.vx, p.vz), 2.4 * 0.95, 0.15, '歩きの速さ（Mk18 0.95倍）');
});

test('engine: 撃つと弾が減り、反動で上を向く', () => {
  const G = mk();
  const p = G.S.actors[0];
  for (let i = 0; i < 40; i++) step(G, { [p.id]: { mx: 0, mz: 0, yaw: p.yaw, pitch: 0, stance: 0 } });
  const before = p.inv.w[0].mag;
  let shots = 0;
  for (let i = 0; i < 30; i++) { const ev = step(G, { [p.id]: { mx: 0, mz: 0, yaw: p.yaw, pitch: 0, stance: 0, fire: true } }); shots += ev.filter(e => e.e === 'shot').length; }
  ok(shots >= 6 && shots <= 9, `0.5秒で850発/分 → 7発前後: ${shots}`);
  eq(before - p.inv.w[0].mag, shots, '弾が減る');
  ok(p.ws.rp > 2, '反動で上を向く ' + p.ws.rp);
});

test('engine: dump と load で同じ状態に戻る', () => {
  const G = mk();
  const p = G.S.actors[0];
  for (let i = 0; i < 30; i++) step(G, { [p.id]: { mx: 0.3, mz: 1, yaw: p.yaw + 0.1, pitch: 0.05, stance: 0, fire: i % 7 === 0 } });
  const d = dump(G);
  const G2 = load(JSON.parse(JSON.stringify(d)));
  for (let i = 0; i < 30; i++) { const inp = { mx: -0.3, mz: 1, yaw: p.yaw - 0.1, pitch: 0, stance: 1 }; step(G, { [G.S.actors[0].id]: inp }); step(G2, { [G2.S.actors[0].id]: inp }); }
  const a = G.S.actors[0], b = G2.S.actors[0];
  near(a.x, b.x, 1e-9, 'x'); near(a.z, b.z, 1e-9, 'z'); eq(a.inv.w[0].mag, b.inv.w[0].mag, '弾');
});

test('engine: 通常のリロードは弾倉を残し、速いリロードは捨てる', () => {
  const G = mk();
  const p = G.S.actors[0], wi = p.inv.w[0];
  for (let i = 0; i < 40; i++) step(G, { [p.id]: { yaw: p.yaw, pitch: 0 } });
  wi.mag = 10;
  const n0 = wi.mags.length;
  step(G, { [p.id]: { yaw: p.yaw, pitch: 0, act: [{ a: 'reload' }] } });
  for (let i = 0; i < 200; i++) step(G, { [p.id]: { yaw: p.yaw, pitch: 0 } });
  eq(wi.mags.length, n0, '本数は同じ（10発の弾倉が残る）');
  ok(wi.mags.includes(10), '10発の弾倉');
  wi.mag = 5;
  step(G, { [p.id]: { yaw: p.yaw, pitch: 0, act: [{ a: 'reload', fast: true }] } });
  for (let i = 0; i < 200; i++) step(G, { [p.id]: { yaw: p.yaw, pitch: 0 } });
  eq(wi.mags.length, n0 - 1, '速いリロードは1本減る');
});

test('engine: 右のリーンで目が右へ、左のリーンで左へ動く（表記と向きが合う）', () => {
  const G = mk();
  const p = G.S.actors[0];
  const off = (lean) => { for (let i = 0; i < 60; i++) step(G, { [p.id]: { mx: 0, mz: 0, yaw: p.yaw, pitch: 0, stance: 0, lean } }); const e = eyeOf(G.S, p); return (e[0] - p.x) * -Math.cos(p.yaw) + (e[2] - p.z) * Math.sin(p.yaw); };
  ok(off(1) > 0.2, '右へ ' + off(1));
  ok(off(-1) < -0.2, '左へ ' + off(-1));
});

// ---- 大型装備
import { LOADOUTS } from '../../src/engine/data/npc.js';
import { createActor } from '../../src/engine/actor.js';
function mkLong(long, extra = {}) {
  const lo = { ...LOADOUTS.player, long, ...extra };
  return createGame({ map: 'training', mode: 'train', seed: 7, team: 1, house: false, roster: [{ pid: 0, name: 'リード', lo }] });
}
const idleIn = (p, o = {}) => ({ mx: 0, mz: 0, yaw: p.yaw, pitch: p.pitch || 0, stance: 0, ...o });

test('engine: 大型装備を構える（slot 3）ともう一度で銃に戻す', () => {
  const G = mkLong('m320');
  const p = G.S.actors[0];
  for (let i = 0; i < 30; i++) step(G, { [p.id]: idleIn(p) });
  step(G, { [p.id]: idleIn(p, { act: [{ a: 'long' }] }) });
  for (let i = 0; i < 80; i++) step(G, { [p.id]: idleIn(p) });
  eq(p.ws.slot, 3, 'M320を持つ');
  step(G, { [p.id]: idleIn(p, { act: [{ a: 'long' }] }) });
  for (let i = 0; i < 80; i++) step(G, { [p.id]: idleIn(p) });
  eq(p.ws.slot, 0, '主武器に戻る');
});

test('engine: M320 は撃つと弾が減り、装填のあいだは撃てない。射撃モードで弾を替える', () => {
  const G = mkLong('m320');
  const p = G.S.actors[0];
  step(G, { [p.id]: idleIn(p, { act: [{ a: 'long' }] }) });
  for (let i = 0; i < 80; i++) step(G, { [p.id]: idleIn(p) });
  const m = p.inv.m320;
  eq(m.sel, 'flash');
  let ev = step(G, { [p.id]: idleIn(p, { fire: true }) });
  ok(ev.some(e => e.e === 'launch' && e.type === 'flash'), '閃光弾を撃つ');
  eq(m.flash, 2, '残り2');
  ok(G.S.nades.some(n => n.impact), '当たると作動する弾');
  step(G, { [p.id]: idleIn(p) });
  ev = step(G, { [p.id]: idleIn(p, { fire: true }) });
  ok(!ev.some(e => e.e === 'launch'), '装填中は撃てない');
  step(G, { [p.id]: idleIn(p, { act: [{ a: 'mode' }] }) });
  eq(m.sel, 'stinger', '弾を替える');
  for (let i = 0; i < 200; i++) step(G, { [p.id]: idleIn(p) });
  ev = step(G, { [p.id]: idleIn(p, { fire: true }) });
  ok(ev.some(e => e.e === 'launch' && e.type === 'stinger'), '装填後はスティンガー弾');
});

test('engine: 盾は前からの拳銃弾を止め、横からは止めない', () => {
  const G = mkLong('shield');
  const S = G.S, w = G.w, p = S.actors[0];
  // 副武器へ（盾を構える）
  step(G, { [p.id]: idleIn(p, { act: [{ a: 'switch', slot: 1 }] }) });
  for (let i = 0; i < 60; i++) step(G, { [p.id]: idleIn(p) });
  eq(p.ws.slot, 1);
  // 前 4m に容疑者（拳銃）
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  const s = createActor(S, { kind: 'sus', team: 1, name: '的', x: p.x + fx * 4, y: p.y, z: p.z + fz * 4, yaw: p.yaw + Math.PI, hp: 100, h: 1.75, pid: 9, lo: { primary: null, secondary: { id: 'g17', ammo: 'jhp' } } });
  S.byId[s.id] = s;
  const hp0 = p.hp;
  let blocked = 0, hits = 0;
  for (let i = 0; i < 120; i++) {
    const e = eyeOf(S, p); const se = eyeOf(S, s);
    const dx = e[0] - se[0], dy = (p.y + 1.2) - se[1], dz = e[2] - se[2];
    const yaw = Math.atan2(dx, dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
    const ev = step(G, { [p.id]: idleIn(p), [s.id]: { mx: 0, mz: 0, yaw, pitch, stance: 0, fire: i % 6 === 0 } });
    blocked += ev.filter(x => x.e === 'shieldhit').length; hits += ev.filter(x => x.e === 'hit' && x.id === p.id).length;
  }
  ok(blocked >= 4, '盾に当たる ' + blocked);
  eq(hits, 0, '体には当たらない');
  eq(p.hp, hp0, '体力は減らない');
  // 横に回る
  s.x = p.x + Math.cos(p.yaw) * 3; s.z = p.z - Math.sin(p.yaw) * 3;
  let side = 0;
  for (let i = 0; i < 60; i++) {
    const se = eyeOf(S, s);
    const dx = p.x - se[0], dy = (p.y + 1.25) - se[1], dz = p.z - se[2];
    const ev = step(G, { [p.id]: idleIn(p), [s.id]: { mx: 0, mz: 0, yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)), stance: 0, fire: i % 6 === 0 } });
    side += ev.filter(x => x.e === 'hit' && x.id === p.id).length;
  }
  ok(side >= 1, '横からは当たる ' + side);
});

test('engine: ミラー（人）は扉の向こうにカメラを置き、動くと終わる', () => {
  const G = mk();
  const S = G.S, w = G.w, p = S.actors[0];
  // いちばん近い閉じた扉の前へ
  let best = null, bd = 1e9;
  for (const d of w.doors) { if (d.L !== 0) continue; const dist = Math.hypot(d.cx - p.x, d.cz - p.z); if (dist < bd) { bd = dist; best = d; } }
  ok(best, '扉がある');
  const side = 1;
  p.x = best.cx + best.nx * side * 0.8; p.z = best.cz + best.nz * side * 0.8;
  p.yaw = Math.atan2(-best.nx * side, -best.nz * side);
  for (let i = 0; i < 5; i++) step(G, { [p.id]: idleIn(p) });
  step(G, { [p.id]: idleIn(p, { act: [{ a: 'op', k: 'door', id: best.id, op: 'mirror' }] }) });
  let started = null;
  for (let i = 0; i < 80 && !started; i++) { const ev = step(G, { [p.id]: idleIn(p) }); started = ev.find(e => e.e === 'peek'); }
  ok(started, 'のぞき始める');
  ok(p.peek && p.peek.k === 'mirror', 'ミラーの視点');
  const s2 = (p.peek.x - best.cx) * best.nx + (p.peek.z - best.cz) * best.nz;
  ok(s2 * side < 0, '扉の向こう側にカメラ ' + s2);
  ok(p.peek.y - best.L * 3 < 0.15, '床の近く');
  let ended = null;
  for (let i = 0; i < 60 && !ended; i++) { const ev = step(G, { [p.id]: idleIn(p, { mz: 1 }) }); ended = ev.find(e => e.e === 'peekend'); }
  ok(ended && ended.why === 'move', '動くと終わる');
  eq(p.peek, null);
});
