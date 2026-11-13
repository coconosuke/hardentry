import { test, ok, near } from '../lib/t.mjs';
import { createGame, step } from '../../src/engine/engine.js';
import { heightAt } from '../../src/war/world.js';
import { WAR_SPEED } from '../../src/engine/move.js';
import { CAP_T, TICKETS, BLEED } from '../../src/engine/modes/war.js';

function game(o = {}) { return createGame({ map: 'riverbend', mode: 'war', size: 'small', seed: 3, bots: false, ...o }); }
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

test('war engine: 拠点を奪う（中立から1人で10秒・敵の拠点は20秒・同じ人数なら止まる・人数で速い）', () => {
  const G = game(), a = G.S.actors[0], f = G.S.m.flags[0];
  const put = (b, x, z) => { b.x = x; b.z = z; b.y = heightAt(G.w, x, z); b.vx = b.vz = 0; };
  put(a, f.x + 2, f.z);
  for (let i = 0; i < Math.round((CAP_T - 0.5) * 60); i++) step(G, inp(a));
  ok(f.owner === -1 && f.prog > 0.9, `9.5秒ではまだ中立 ${f.prog.toFixed(2)}`);
  for (let i = 0; i < 60; i++) step(G, inp(a));
  ok(f.owner === 0 && f.prog >= 1, '10秒で確保');
  // 敵が1人来る: 止まる
  const G2 = game({ bots: true, per: 2 }), me = G2.S.actors[0], foe = G2.S.actors.find(b => b.team === 1), f2 = G2.S.m.flags[1];
  for (const b of G2.S.actors) if (b !== me && b !== foe) { b.alive = false; b.dead = true; }
  foe.ai = null; // 動かない
  f2.owner = 1; f2.prog = -1;
  const put2 = (b, x, z) => { b.x = x; b.z = z; b.y = heightAt(G2.w, x, z); b.vx = b.vz = 0; };
  put2(me, f2.x + 2, f2.z); put2(foe, f2.x - 2, f2.z + 2);
  for (let i = 0; i < 120; i++) step(G2, inp(me));
  ok(Math.abs(f2.prog + 1) < 1e-6 && f2.contested, '同じ人数なら止まる');
  foe.alive = false; foe.dead = true;
  for (let i = 0; i < Math.round(CAP_T * 60) + 2; i++) step(G2, inp(me));
  ok(f2.owner === -1, `10秒で中立 ${f2.prog.toFixed(2)}`);
  for (let i = 0; i < Math.round(CAP_T * 60) + 2; i++) step(G2, inp(me));
  ok(f2.owner === 0, `さらに10秒で確保 ${f2.prog.toFixed(2)}`);
});

test('war engine: チケット（過半数の拠点を持つと相手が減る・出撃で1減る）', () => {
  const G = game(), m = G.S.m, a = G.S.actors[0];
  near(m.tickets[0], TICKETS.small, 1e-9, '小は300');
  // 4つのうち3つを味方、1つを敵
  m.flags.forEach((f, i) => { f.owner = i < 3 ? 0 : 1; f.prog = i < 3 ? 1 : -1; });
  a.x = G.S.m.hq[0][0]; a.z = G.S.m.hq[0][1];
  for (let i = 0; i < 600; i++) step(G, inp(a));
  near(m.tickets[1], TICKETS.small - 2 * BLEED * 10, 0.05, '差2で毎秒0.6');
  near(m.tickets[0], TICKETS.small, 1e-9, '味方は減らない');
});

test('war engine: ボットだけの 16対16 が2分動く（撃ち合い・拠点の取り合い・例外なし）', () => {
  const G = createGame({ map: 'riverbend', mode: 'war', size: 'small', seed: 5, roster: [] });
  ok(G.S.actors.length === 32, `32人 ${G.S.actors.length}`);
  const t0 = performance.now();
  let kills = 0, flags = 0, shots = 0;
  for (let i = 0; i < 60 * 120; i++) for (const e of step(G, {})) { if (e.e === 'kill') kills++; if (e.e === 'flag') flags++; if (e.e === 'shot') shots++; }
  const ms = (performance.now() - t0) / (60 * 120);
  const owned = G.S.m.flags.filter(f => f.owner >= 0).length;
  ok(shots > 50 && kills > 3, `撃ち合い 射撃${shots}・キル${kills}`);
  ok(flags >= 2 && owned >= 2, `拠点の持ち主が変わる ${flags}回・持ち主あり${owned}`);
  ok(ms < 4, `1ステップ ${ms.toFixed(2)}ms`);
  console.log(`  16対16 2分: 射撃${shots} キル${kills} 拠点${flags} チケット${G.S.m.tickets.map(t => t.toFixed(0)).join('/')} ${ms.toFixed(2)}ms/ステップ`);
});

test('war engine: 破片手榴弾（4秒・5mでほぼ致命・15mまで）と衝撃手榴弾（当たると爆発）', async () => {
  const { throwNade } = await import('../../src/engine/nades.js');
  const G = game({ bots: true, per: 3 }), S = G.S, me = S.actors[0];
  const foes = S.actors.filter(b => b.team === 1);
  for (const b of S.actors) if (b !== me && !foes.includes(b)) { b.alive = false; b.dead = true; }
  for (const b of foes) b.ai = null;
  // 平らな所（町の広場）で、敵を 3m と 11m に
  const cx = 790, cz = 705;
  const put = (b, x, z) => { b.x = x; b.z = z; b.y = heightAt(G.w, x, z); b.vx = b.vz = 0; };
  put(me, cx, cz - 20); me.yaw = 0; me.pitch = 0.25;
  put(foes[0], cx + 3, cz); put(foes[1], cx + 11, cz); put(foes[2], cx - 40, cz);
  for (let i = 0; i < 30; i++) step(G, inp(me, { yaw: 0, pitch: 0.25 }));
  // 投げる代わりに足もとへ置く（決まった所で爆発させる）
  const n = throwNade(S, me, 'frag', 0.5, []); n.x = cx; n.y = heightAt(G.w, cx, cz) + 0.1; n.z = cz; n.vx = n.vy = n.vz = 0; n.rest = true;
  let boom = -1, evs = [];
  for (let i = 0; i < 60 * 5 && boom < 0; i++) { const e = step(G, inp(me, { yaw: 0, pitch: 0.25 })); evs.push(...e); if (e.some(x => x.e === 'boom')) boom = i; }
  ok(boom >= 60 * 3.9 && boom <= 60 * 4.1 + 2, `約4秒で爆発 ${(boom / 60).toFixed(2)}秒`);
  const hp = foes.map(b => b.alive ? Math.round(b.hp) : (b.down ? 'down' : 'dead'));
  ok(!foes[0].alive || foes[0].down || foes[0].hp <= 0, `3m は倒れる ${hp[0]}`);
  ok(foes[1].alive && foes[1].hp < foes[1].maxHp && foes[1].hp > foes[1].maxHp / 2, `11m は少し傷つく ${hp[1]}/${foes[1].maxHp}`);
  ok(foes[2].hp === foes[2].maxHp, '40m は無傷');
  // 衝撃手榴弾: 地面に向けて投げる → 当たったら爆発（1秒以内）
  const G2 = game(), b = G2.S.actors[0];
  for (let i = 0; i < 30; i++) step(G2, inp(b));
  b.pitch = -0.6;
  throwNade(G2.S, b, 'impact', 0.6, []);
  let t2 = -1;
  for (let i = 0; i < 120 && t2 < 0; i++) { const e = step(G2, inp(b, { pitch: -0.6 })); if (e.some(x => x.e === 'boom')) t2 = i; }
  ok(t2 >= 0 && t2 < 60, `当たってすぐ爆発 ${t2}`);
});
