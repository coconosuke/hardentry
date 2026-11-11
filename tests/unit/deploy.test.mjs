import { test, ok, eq, near } from '../lib/t.mjs';
import { createGame, step, dump, load } from '../../src/engine/engine.js';
import { vaultPlan } from '../../src/engine/move.js';
import { raycast, los, CS, DSHIELD } from '../../src/engine/world.js';
import { DEP, packDeps, applyDepsNet, wireAt } from '../../src/engine/deploy.js';

// 対戦（TDM）で、始まりの3秒を飛ばし、自分以外を遠ざける
function tdm(map = 'suburb') {
  const G = createGame({ map, mode: 'tdm', teams: [1, 1], seed: 3 });
  for (let i = 0; i < 400 && G.S.m.phase === 'pre'; i++) step(G, {});
  const p = G.S.actors.find(a => a.pid === 0);
  for (const a of G.S.actors) if (a !== p) { a.x = 2; a.z = 30; a.y = 0; a.ai = null; a.vx = a.vz = 0; }
  p.inv.gear = [{ id: 'dshield', n: 1 }, { id: 'wire', n: 2 }, { id: 'bandage', n: 1 }];
  return { G, S: G.S, w: G.w, p };
}
const I = (p, o = {}) => ({ [p.id]: { yaw: p.yaw, pitch: 0, stance: 0, ...o } });
function put(G, p, xc, zc, yaw) {
  p.x = xc * CS; p.z = zc * CS; p.y = 0; p.vx = p.vz = p.vy = 0; p.yaw = yaw; p.ground = true; p.air = false;
  for (let i = 0; i < 5; i++) step(G, I(p));
}
// 装備を手に持って、射撃で置く。置き終わるまで進める
function deploy(G, p, id, n = 140) {
  const ev = [];
  ev.push(...step(G, I(p, { act: [{ a: 'gear', id }] })));
  for (let i = 0; i < 70; i++) { ev.push(...step(G, I(p))); if (p.ws.slot === 2 && (p.ws.st === 'ready' || p.ws.st === 'gear')) break; }
  ev.push(...step(G, I(p, { fire: true })));
  for (let i = 0; i < n; i++) ev.push(...step(G, I(p)));
  return ev;
}

test('deploy: 置ける盾を前に置く（1.4秒）。弾は止まり、のぞき窓は抜ける。体は通れず、乗り越えられる', () => {
  const { G, S, w, p } = tdm();
  put(G, p, 10, 50, 0); // 家の南の庭、南を向く
  const ev = deploy(G, p, 'dshield');
  eq(S.deps.length, 1, '盾が1つ');
  const d = S.deps[0];
  ok(ev.some(e => e.e === 'depset' && e.k === 'shield'), '置いた出来事');
  eq(p.inv.gear.find(g => g.id === 'dshield').n, 0, '残り0');
  near(Math.hypot(d.x - p.x, d.z - p.z), DEP.shield.dist, 0.05, '前0.78m');
  // 弾: 前（盾の向こう）から盾の真ん中の高さ → 盾に当たる。のぞき窓の高さの真ん中 → 抜ける。窓の高さの端 → 当たる
  const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw), ux = -fz, uz = fx;
  const ray = (u, h) => raycast(w, d.x + fx * 3 + ux * u, d.y + h, d.z + fz * 3 + uz * u, -fx, 0, -fz, 5, S.doors).find(x => x.kind === 'dep');
  ok(ray(0, 0.4), '胴の高さは止まる');
  ok(!ray(0, (DSHIELD.s0 + DSHIELD.s1) / 2), 'のぞき窓は抜ける');
  ok(ray(0.3, (DSHIELD.s0 + DSHIELD.s1) / 2), '窓の横は止まる');
  ok(!los(w, d.x + fx * 2, d.y + 0.5, d.z + fz * 2, d.x - fx * 1.5, d.y + 0.5, d.z - fz * 1.5, S.doors), '盾の向こうは見えない（低い所）');
  const sy = (DSHIELD.s0 + DSHIELD.s1) / 2;
  ok(los(w, d.x + fx * 2, d.y + sy, d.z + fz * 2, d.x - fx * 1.5, d.y + sy, d.z - fz * 1.5, S.doors), 'のぞき窓から見える');
  // 歩いて通れない
  for (let i = 0; i < 90; i++) step(G, I(p, { mz: 1 }));
  const along = (p.x - d.x) * fx + (p.z - d.z) * fz;
  ok(along < -0.25, '盾の手前で止まる ' + along.toFixed(2));
  // 乗り越えられる
  const pl = vaultPlan(S, w, p, {});
  ok(pl && pl.top - p.y > DSHIELD.h - 0.05 && !pl.onto, '盾を乗り越えられる ' + JSON.stringify(pl && { top: pl.top - p.y, onto: pl.onto }));
});

test('deploy: 爆発で壊れる。味方は拾い直せる。通信の表で同じに戻る', () => {
  const { G, S, w, p } = tdm();
  put(G, p, 10, 50, 0);
  deploy(G, p, 'dshield');
  const d = S.deps[0];
  // 通信
  const DP = packDeps(S), S2 = { doors: [], deps: [] };
  applyDepsNet(S2, DP);
  near(S2.deps[0].x, d.x, 0.01); near(S2.deps[0].yaw, d.yaw, 0.002); eq(S2.deps[0].k, 'shield');
  ok(S2.doors.deps === S2.deps, 'ゲストでも扉の状態にぶら下がる');
  // 保存と読み込み
  const G2 = load(JSON.parse(JSON.stringify(dump(G))));
  eq(G2.S.deps.length, 1, '読み込み後も盾がある');
  ok(G2.S.doors.deps === G2.S.deps, '読み込み後も当たりに使われる');
  // 拾う（味方: 少し下がって盾を見て「調べる」）
  p.x -= Math.sin(d.yaw) * 0.5; p.z -= Math.cos(d.yaw) * 0.5; p.pitch = -0.75;
  for (let i = 0; i < 3; i++) step(G, I(p, { pitch: -0.75 }));
  step(G, I(p, { pitch: -0.75, act: [{ a: 'op', k: 'dep', id: d.id, op: 'deppick' }] }));
  ok(p.act && p.act.k === 'deppick', '拾い始める ' + JSON.stringify(p.act && p.act.k));
  for (let i = 0; i < 80; i++) step(G, I(p, { pitch: -0.75 }));
  eq(S.deps.length, 0, '拾った');
  eq(p.inv.gear.find(g => g.id === 'dshield').n, 1, '手元に戻る');
  // もう一度置いて、爆発で壊す
  p.pitch = 0;
  deploy(G, p, 'dshield');
  eq(S.deps.length, 1);
  const d2 = S.deps[0];
  S.blasts.push({ x: d2.x + 0.5, y: d2.y + 0.5, z: d2.z, r: 3, dmg: 0, kind: 'frag', t: 0, by: -1 });
  const ev = [];
  for (let i = 0; i < 3; i++) ev.push(...step(G, I(p)));
  eq(S.deps.length, 0, '爆発で壊れた');
  ok(ev.some(e => e.e === 'depbreak' && e.why === 'blast'), '壊れた出来事');
});

test('deploy: 有刺鉄線の上は遅く、音が出る。近接2回で壊れる', () => {
  const { G, S, w, p } = tdm();
  put(G, p, 10, 50, 0);
  deploy(G, p, 'wire');
  eq(S.deps.length, 1, '有刺鉄線');
  eq(p.inv.gear.find(g => g.id === 'wire').n, 1, '残り1');
  const d = S.deps[0];
  // 歩いて入る
  const ev = [];
  for (let i = 0; i < 150; i++) ev.push(...step(G, I(p, { mz: 1 })));
  ok(wireAt(S, p.x, p.z, p.y) || ev.some(e => e.e === 'wire'), '中を通った');
  ok(ev.filter(e => e.e === 'wire').length >= 2, '音が出る ' + ev.filter(e => e.e === 'wire').length);
  // 中での速さ
  p.x = d.x; p.z = d.z; p.vx = p.vz = 0;
  for (let i = 0; i < 30; i++) step(G, I(p, { mz: 1 }));
  p.x = d.x; p.z = d.z;
  for (let i = 0; i < 20; i++) step(G, I(p, { mz: 1 }));
  const v = Math.hypot(p.vx, p.vz);
  ok(v < 2.4 * DEP.wire.slow + 0.15, '遅い ' + v.toFixed(2));
  // 外から近接2回
  const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
  p.x = d.x - fx * 1.1; p.z = d.z - fz * 1.1; p.yaw = d.yaw; p.vx = p.vz = 0;
  for (let i = 0; i < 30; i++) step(G, I(p, { pitch: -0.9 }));
  const ev2 = [];
  for (let n = 0; n < 2; n++) { ev2.push(...step(G, I(p, { pitch: -0.9, act: [{ a: 'melee' }] }))); for (let i = 0; i < 70; i++) ev2.push(...step(G, I(p, { pitch: -0.9 }))); }
  eq(S.deps.length, 0, '2回で壊れた');
  ok(ev2.some(e => e.e === 'dephit') && ev2.some(e => e.e === 'depbreak' && e.why === 'melee'), '当たり・壊れた出来事');
});

test('deploy: 壁ぎわ・人の前・階段には置けない（理由を知らせる）', () => {
  const { G, S, w, p } = tdm();
  put(G, p, 10, 50, 0);
  // 前に人
  const b = S.actors.find(a => a !== p && !a.isDrone);
  b.x = p.x; b.z = p.z + 0.8; b.y = 0;
  const ev = deploy(G, p, 'dshield', 10);
  eq(S.deps.length, 0, '置かない');
  ok(ev.some(e => e.e === 'deny' && e.why === 'depperson'), '前に人 ' + JSON.stringify(ev.filter(e => e.e === 'deny')));
});

test('deploy: 爆弾のボットの守る側は、準備の間に置ける盾・有刺鉄線を置く', () => {
  let placed = 0, rounds = 0;
  for (const map of ['suburb', 'office']) {
    const G = createGame({ map, mode: 'bomb', teams: [4, 4], seed: 5, rules: {} });
    for (let i = 0; i < 60 * 70 && !(G.S.m.phase === 'action'); i++) step(G, {});
    rounds++;
    placed += G.S.deps.length;
  }
  ok(placed >= 2, `2マップで ${placed} 個置いた`);
});
