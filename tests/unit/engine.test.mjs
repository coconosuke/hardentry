import { test, ok, eq, near } from '../lib/t.mjs';
import { createGame, step, dump, load } from '../../src/engine/engine.js';
import { WEAPONS } from '../../src/engine/data/weapons.js';

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
