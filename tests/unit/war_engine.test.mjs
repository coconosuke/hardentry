import { test, ok, near } from '../lib/t.mjs';
import { createGame, step } from '../../src/engine/engine.js';
import { heightAt } from '../../src/war/world.js';
import { WAR_SPEED } from '../../src/engine/move.js';

function game() { return createGame({ map: 'riverbend', mode: 'war', size: 'small', seed: 3 }); }
const inp = (a, o = {}) => ({ [a.id]: Object.assign({ mx: 0, mz: 0, yaw: a.yaw, pitch: 0, stance: 0, lean: 0, sprint: false, fire: false, ads: false, act: null }, o) });

test('war engine: 本陣に出て、地形の上に立つ', () => {
  const G = game(), a = G.S.actors[0];
  ok(G.w.war && G.S.war, '大規模戦の世界');
  for (let i = 0; i < 30; i++) step(G, inp(a));
  near(a.y, heightAt(G.w, a.x, a.z), 0.06, `地面の高さ ${a.y.toFixed(2)} vs ${heightAt(G.w, a.x, a.z).toFixed(2)}`);
  const [hx, hz] = G.S.m.hq[0];
  ok(Math.hypot(a.x - hx, a.z - hz) < 20, '本陣の近く');
});

test('war engine: 歩く・走る（まっすぐ走ると速くなる）・坂を上る', () => {
  const G = game(), a = G.S.actors[0];
  for (let i = 0; i < 20; i++) step(G, inp(a));
  const x0 = a.x, z0 = a.z;
  for (let i = 0; i < 60; i++) step(G, inp(a, { mz: 1 }));
  const walk = Math.hypot(a.x - x0, a.z - z0);
  ok(walk > 2.6 && walk < 3.6, `1秒歩く ${walk.toFixed(2)}m`);
  const x1 = a.x, z1 = a.z;
  for (let i = 0; i < 60; i++) step(G, inp(a, { mz: 1, sprint: true }));
  const run1 = Math.hypot(a.x - x1, a.z - z1);
  ok(run1 > 4.8 && run1 < 6.2, `走り始めの1秒 ${run1.toFixed(2)}m`);
  for (let i = 0; i < 180; i++) step(G, inp(a, { mz: 1, sprint: true }));
  const x2 = a.x, z2 = a.z;
  for (let i = 0; i < 60; i++) step(G, inp(a, { mz: 1, sprint: true }));
  const run2 = Math.hypot(a.x - x2, a.z - z2);
  ok(run2 > run1 + 0.3 && run2 <= WAR_SPEED.sprint2 + 0.05, `走り続けると速い ${run2.toFixed(2)}m`);
  near(a.y, heightAt(G.w, a.x, a.z), 0.08, '地面に沿う');
});

test('war engine: 撃った弾が地面と建物に当たる・遠くまで飛ぶ', () => {
  const G = game(), a = G.S.actors[0];
  for (let i = 0; i < 40; i++) step(G, inp(a));
  // 下を向いて撃つ → 地面に当たる
  let evs = [];
  for (let i = 0; i < 20; i++) evs.push(...step(G, inp(a, { pitch: -0.6, fire: i < 2 })));
  const imp = evs.find(e => e.e === 'imp');
  ok(imp && imp.m === 19, `地面に当たる ${JSON.stringify(imp)}`);
  // 遠くの空へ: 1.5秒たっても消えない（400m より遠くまで）
  const G2 = game(), b = G2.S.actors[0];
  for (let i = 0; i < 40; i++) step(G2, inp(b));
  step(G2, inp(b, { pitch: 0.02, fire: true }));
  let far = null;
  for (let i = 0; i < 70 && !far; i++) for (const e of step(G2, inp(b, { pitch: 0.02 }))) if (e.e === 'imp') far = e;
  ok(far && Math.hypot(far.x - b.x, far.z - b.z) > 600, `弾が 600m より遠くまで飛ぶ（2°上へ。東の山に当たる） ${far && Math.hypot(far.x - b.x, far.z - b.z).toFixed(0)}m`);
});

test('war engine: 範囲の外に10秒いると死ぬ（戻ると数え直し）', () => {
  const G = game(), a = G.S.actors[0];
  for (let i = 0; i < 10; i++) step(G, inp(a));
  const r = G.S.m.rect;
  a.x = r[0] - 5; a.z = (r[1] + r[3]) / 2; a.y = heightAt(G.w, a.x, a.z);
  let evs = [];
  for (let i = 0; i < 60 * 5; i++) evs.push(...step(G, inp(a)));
  ok(a.alive && a.oob > 4.9, '5秒はまだ生きている');
  a.x = r[0] + 5; for (let i = 0; i < 5; i++) step(G, inp(a));
  ok(a.oob === 0, '戻ると消える');
  a.x = r[0] - 5;
  for (let i = 0; i < 60 * 10 + 5; i++) evs.push(...step(G, inp(a)));
  ok(!a.alive && evs.some(e => e.e === 'kill' && e.kind === 'oob'), '10秒で死ぬ');
});
