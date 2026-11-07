import { test, ok, eq, near } from '../lib/t.mjs';
import { createGame, step, dump, load } from '../../src/engine/engine.js';
import { WEAPONS } from '../../src/engine/data/weapons.js';
import { eyeOf, killActor as killActorFor } from '../../src/engine/combat.js';

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

// ---- 調べる・使う: 手が届く所でだけ（離れている・間に家具があるとできない）
import { reachOK, doAction } from '../../src/engine/interact.js';
import { addProp } from '../../src/engine/world.js';
function mkPve() {
  const G = createGame({ map: 'suburb', mode: 'pve', mission: 'barricade', diff: 'normal', team: 2, allAI: true, seed: 3 });
  const S = G.S, a = S.actors.find(b => b.kind === 'swat'), b = S.actors.find(x => x.kind === 'sus');
  for (const x of S.actors) x.ai = null;
  return { G, S, w: G.w, a, b };
}
// 何もない所（前庭の芝生の真ん中）に2人を置く
function openSpot(S, w, a, b) {
  a.x = 4.75; a.z = 25.75; a.y = 0; a.yaw = 0; a.pitch = -0.5; a.act = null;
  Object.assign(b, { x: a.x, z: a.z + 0.9, y: 0, yaw: 0, comply: 2, cuffed: false, down: false, alive: true, stateT: 5 });
  for (const o of S.actors) if (o !== a && o !== b) { o.x = 2; o.z = 2; }
}
test('interact: 拘束は手の届く1.0m以内でだけ。離れていると「届かない」で始まらない', () => {
  const { S, w, a, b } = mkPve();
  openSpot(S, w, a, b);
  ok(reachOK(S, w, a, 'person', b.id, 'restrain'), '0.9m: 届く');
  b.z = a.z + 1.3;
  ok(!reachOK(S, w, a, 'person', b.id, 'restrain'), '1.3m: 届かない');
  const ev = [];
  doAction(S, w, a, { a: 'op', k: 'person', id: b.id, op: 'restrain' }, ev);
  ok(!a.act && ev.some(e => e.e === 'deny' && e.why === 'far'), '始まらず「届かない」');
});
test('interact: 拘束は寄って背中から（相手は背を向けてひざをつき、手首を背中へ回される）。約2.8秒', () => {
  const { G, S, w, a, b } = mkPve();
  openSpot(S, w, a, b);
  b.comply = 1; b.yaw = Math.PI; // 手を上げてこちらを向いている
  const ev = [];
  doAction(S, w, a, { a: 'op', k: 'person', id: b.id, op: 'restrain' }, ev);
  ok(a.act && a.act.k === 'restrain' && a.act.pose === 'cuff', '拘束が始まる（手を伸ばす動き）');
  ok(b.comply === 2 && b.cuffBy === a.id, '相手はひざをつき、押さえられる');
  const inp = () => ({ [a.id]: { mx: 0, mz: 0, yaw: Math.atan2(b.x - a.x, b.z - a.z), pitch: -0.6, stance: 0, lean: 0 } });
  let t = 0, done = null;
  while (t < 4 && !done) { const e2 = step(G, inp()); t += S.dt; done = e2.find(e => e.e === 'cuffed'); if (t > 1.0 && t < 1.05) { ok(Math.abs(Math.atan2(Math.sin(b.yaw - Math.atan2(b.x - a.x, b.z - a.z)), Math.cos(b.yaw - Math.atan2(b.x - a.x, b.z - a.z)))) < 0.3, '相手は背中を向けた'); near(Math.hypot(b.x - a.x, b.z - a.z), 0.76, 0.12, '背中のすぐ後ろへ寄った'); ok(b.cuffK > 0.3 && b.cuffK < 0.45, '手首を背中へ回している ' + b.cuffK); } }
  ok(done && b.cuffed, '拘束できた');
  near(t, 2.8, 0.15, 'かかった時間');
  ok(b.cuffBy == null && !b.cuffK, '押さえは解ける');
});
test('interact: 拘束は途中で離れる・目をそらすと中断', () => {
  const { G, S, w, a, b } = mkPve();
  openSpot(S, w, a, b);
  doAction(S, w, a, { a: 'op', k: 'person', id: b.id, op: 'restrain' }, []);
  a.pid = 0; // 入力で向きを変える
  for (let i = 0; i < 40; i++) step(G, { [a.id]: { mx: 0, mz: 0, yaw: Math.atan2(b.x - a.x, b.z - a.z), pitch: -0.6, stance: 0, lean: 0 } });
  ok(a.act, '続いている');
  let c = null;
  for (let i = 0; i < 30 && !c; i++) { const ev = step(G, { [a.id]: { mx: 0, mz: 0, yaw: Math.atan2(b.x - a.x, b.z - a.z) + Math.PI, pitch: 0, stance: 0, lean: 0 } }); c = ev.find(e => e.e === 'actcancel'); }
  ok(c && !a.act && !b.cuffed && b.cuffBy == null, '後ろを向くと中断し、相手は押さえから外れる');
});
test('interact: 間に動かない家具（カウンター・テーブルの下のすき間）や人があると、近くても拘束できない', () => {
  const { S, w, a, b } = mkPve();
  openSpot(S, w, a, b);
  ok(reachOK(S, w, a, 'person', b.id, 'restrain'), '家具なし: 届く');
  const n0 = w.props.length;
  addProp(w, ['counter', a.x / 0.5, (a.z + 0.45) / 0.5, 0, 0, { w: 2.0, d: 0.3 }]);
  ok(!reachOK(S, w, a, 'person', b.id, 'restrain'), 'カウンター越し: 届かない');
  w.props[n0].alive = false;
  addProp(w, ['table', a.x / 0.5, (a.z + 0.45) / 0.5, 0, 0, { w: 1.4, d: 0.4 }]);
  ok(!reachOK(S, w, a, 'person', b.id, 'restrain'), 'テーブル越し（天板の下のすき間）: 届かない');
  w.props[n0 + 1].alive = false;
  ok(reachOK(S, w, a, 'person', b.id, 'restrain'), '家具をどけると届く');
  const c = S.actors.find(o => o !== a && o !== b);
  Object.assign(c, { x: a.x, z: a.z + 0.45, y: 0, alive: true, down: false });
  ok(!reachOK(S, w, a, 'person', b.id, 'restrain'), '間に人がいる: 届かない');
});
test('interact: 扉はノブに手が届く所（約1m）で開けられ、手を伸ばしてから開く。離れていると届かない', () => {
  const { G, S, w, a } = mkPve();
  const d = w.doors.find(q => q.L === 0 && !S.doors[q.id].locked && !q.double && S.doors[q.id].open < 0.05);
  const lf = d.leaves[0], kx = lf.hx + lf.dx * (lf.len - 0.12), kz = lf.hz + lf.dz * (lf.len - 0.12);
  const put = (dist, sg = 1) => { a.x = kx + d.nx * dist * sg; a.z = kz + d.nz * dist * sg; a.y = 0; a.act = null; };
  put(0.75); ok(reachOK(S, w, a, 'door', d.id, 'open'), 'ノブの前0.75m: 届く');
  put(1.6); ok(!reachOK(S, w, a, 'door', d.id, 'open'), '1.6m: 届かない');
  put(0.75, -1); ok(reachOK(S, w, a, 'door', d.id, 'open'), '反対側からも0.75mなら届く');
  put(0.7);
  for (const o of S.actors) if (o !== a) { o.x = 2; o.z = 2; }
  doAction(S, w, a, { a: 'op', k: 'door', id: d.id, op: 'open' }, []);
  ok(a.act && a.act.pose === 'knob', 'ノブへ手を伸ばす');
  ok(S.doors[d.id].tgt.every(v => v === 0), 'まだ開かない');
  for (let i = 0; i < 30; i++) step(G, {});
  ok(!a.act && S.doors[d.id].tgt.some(v => Math.abs(v) > 0.3), '手が届いてから開き始める');
});
test('interact: 落ちている物は1m以内で拾える。テーブル越しは届かず、テーブルの上の物はそばからなら届く', () => {
  const { S, w, a } = mkPve();
  a.x = 4.75; a.z = 25.75; a.y = 0;
  const it = { id: 9001, kind: 'evidence', x: a.x, y: 0.02, z: a.z + 0.8 };
  S.items.push(it);
  ok(reachOK(S, w, a, 'item', it.id, 'collect'), '足もと0.8m: 届く');
  it.z = a.z + 1.4; ok(!reachOK(S, w, a, 'item', it.id, 'collect'), '1.4m: 届かない');
  it.z = a.z + 0.9;
  addProp(w, ['table', a.x / 0.5, (a.z + 0.45) / 0.5, 0, 0, { w: 1.4, d: 0.4 }]);
  ok(!reachOK(S, w, a, 'item', it.id, 'collect'), 'テーブルの向こうの床: 届かない');
  it.z = a.z + 0.45; it.y = 0.76;
  ok(reachOK(S, w, a, 'item', it.id, 'collect'), 'テーブルの上: そばからなら届く');
  w.props[w.props.length - 1].alive = false; // マップは試合のあいだで共有なので片づける
});
test('interact: 半開きの扉は体で押すと開いていく（閉じた扉は押しても開かない）', () => {
  const { G, S, w, a } = mkPve();
  const d = w.doors.find(q => q.L === 0 && !S.doors[q.id].locked && !q.double);
  const ds = S.doors[d.id], lf = d.leaves[0];
  for (const o of S.actors) if (o !== a) { o.x = 2; o.z = 2; }
  a.pid = 0;
  // 閉じた扉の前から扉へ向かって歩く: 開かない
  const side = 1, kx = lf.hx + lf.dx * (lf.len * 0.6), kz = lf.hz + lf.dz * (lf.len * 0.6);
  const walkTo = (n) => { for (let i = 0; i < n; i++) step(G, { [a.id]: { mx: 0, mz: 1, yaw: Math.atan2(-d.nx * side, -d.nz * side), pitch: 0, stance: 0, lean: 0 } }); };
  a.x = kx + d.nx * 0.6; a.z = kz + d.nz * 0.6; a.y = 0; a.vx = a.vz = 0;
  walkTo(60);
  ok(ds.ang.every(v => Math.abs(v) < 0.05), '閉じた扉は体で押しても開かない');
  // 少し開いた扉（向こうへ17°）: 押すと開いていく
  const s0 = Math.sign((a.x - d.cx) * d.nx + (a.z - d.cz) * d.nz) || 1;
  ds.ang[0] = ds.tgt[0] = -s0 * lf.s * 0.3;
  a.x = kx + d.nx * 0.6; a.z = kz + d.nz * 0.6; a.vx = a.vz = 0;
  const a0 = Math.abs(ds.ang[0]);
  walkTo(90);
  ok(Math.abs(ds.ang[0]) > a0 + 0.3, '押した分だけ開く ' + a0.toFixed(2) + ' → ' + Math.abs(ds.ang[0]).toFixed(2));
});
test('interact: AI の隊員の拘束も最後まで続く（よそ見で中断しない）', () => {
  const G = createGame({ map: 'suburb', mode: 'pve', mission: 'barricade', diff: 'normal', team: 2, allAI: true, seed: 3 });
  const S = G.S, w = G.w, a = S.actors.find(b => b.kind === 'swat'), b = S.actors.find(x => x.kind === 'sus');
  for (const x of S.actors) if (x !== a) x.ai = null;
  openSpot(S, w, a, b);
  a.yaw = Math.PI / 2; // 横を向いている
  const ev0 = [];
  doAction(S, w, a, { a: 'op', k: 'person', id: b.id, op: 'restrain' }, ev0);
  ok(a.act && a.act.k === 'restrain', 'AI が拘束を始める ' + JSON.stringify(ev0));
  let done = null, cancel = null;
  for (let i = 0; i < 260 && !done && !cancel; i++) { const ev = step(G, {}); done = ev.find(e => e.e === 'cuffed'); cancel = ev.find(e => e.e === 'actcancel'); }
  ok(done && b.cuffed && !cancel, 'AI の拘束が終わる ' + (cancel ? cancel.why : ''));
});
test('pvp: 対戦では予備の弾倉が減らず、死んでも武器を落とさない', () => {
  const G = createGame({ map: 'motel', mode: 'tdm', teams: [1, 1], seed: 3 });
  const S = G.S, p = S.actors.find(a => a.pid === 0), wi = p.inv.w[0], n0 = wi.mags.length;
  for (let i = 0; i < 200; i++) step(G, {});
  wi.mag = 3;
  step(G, { [p.id]: { yaw: p.yaw, pitch: 0, act: [{ a: 'reload', fast: true }] } });
  for (let i = 0; i < 260; i++) step(G, { [p.id]: { yaw: p.yaw, pitch: 0 } });
  ok(wi.mag >= WEAPONS[wi.id].mag - 1, '装填された ' + wi.mag);
  eq(wi.mags.length, n0, '速いリロードでも本数は同じ');
  ok(wi.mags.every(n => n === WEAPONS[wi.id].mag), '予備はいつも満タン');
  const foe = S.actors.find(a => a.team !== p.team);
  const ev = [];
  killActorFor(S, foe, p, ev);
  eq(S.items.filter(it => it.kind === 'weapon').length, 0, '武器は床に落ちない');
});
test('pve: 作戦では予備の弾倉は減り、容疑者は武器を落とす（証拠）', () => {
  const G = createGame({ map: 'gasstation', mode: 'pve', mission: 'raid', diff: 'normal', team: 1, seed: 3 });
  const S = G.S, p = S.actors.find(a => a.pid === 0), wi = p.inv.w[0], n0 = wi.mags.length;
  for (let i = 0; i < 40; i++) step(G, { [p.id]: { yaw: p.yaw, pitch: 0 } });
  wi.mag = 3;
  step(G, { [p.id]: { yaw: p.yaw, pitch: 0, act: [{ a: 'reload', fast: true }] } });
  for (let i = 0; i < 260; i++) step(G, { [p.id]: { yaw: p.yaw, pitch: 0 } });
  eq(wi.mags.length, n0 - 1, '速いリロードで1本減る');
  const sus = S.actors.find(a => a.kind === 'sus' && a.inv.w.some(Boolean));
  const ev = [];
  killActorFor(S, sus, p, ev);
  ok(S.items.some(it => it.kind === 'weapon' && it.from === sus.id), '容疑者の武器が落ちる');
});
test('move: ダッシュは作戦でも対戦でもできる（前へ・立って・構えていないとき）', () => {
  for (const o of [{ map: 'gasstation', mode: 'pve', mission: 'barricade', diff: 'normal', team: 1, seed: 3 }, { map: 'motel', mode: 'tdm', teams: [1, 1], seed: 3 }]) {
    const G = createGame(o), S = G.S, p = S.actors.find(a => a.pid === 0);
    for (let i = 0; i < 200; i++) step(G, {});
    for (let i = 0; i < 40; i++) step(G, { [p.id]: { mx: 0, mz: 1, yaw: p.yaw, pitch: 0, stance: 0, sprint: true } });
    ok(p.sprint, o.mode + ': 走っている');
  }
});

// ---- バリケード（シージ式）と攻守のモード
import { raycast as rcB, los as losB, pushOut as poB } from '../../src/engine/world.js';
import { hitBar, bashBar, placeBar } from '../../src/engine/barricade.js';
import { isOutside, OUT_GRACE } from '../../src/engine/modes/pvp.js';
import { doorOp as doorOpB } from '../../src/engine/doors.js';
function winSlot(w) { return w.bars.find(s => s.kind === 'win' && s.cols >= 4); }
function across(s, d = 1.5) { const m = (s.a0 + s.a1) / 2, y = (s.y0 + s.y1) / 2; return s.axis === 0 ? { a: [m, y, s.c - d], b: [m, y, s.c + d], dir: [0, 0, 1] } : { a: [s.c - d, y, m], b: [s.c + d, y, m], dir: [1, 0, 0] }; }
test('barricade: 外に面した窓は最初から板（TDM はガラスのまま）。弾2発で穴が開いて見通せ、殴る3回で崩れる', () => {
  const T = createGame({ map: 'bank', mode: 'tdm', teams: [1, 1], seed: 3 });
  eq(T.S.bars.filter(b => b.h).length, 0, 'TDM: 板なし');
  const G = createGame({ map: 'bank', mode: 'pve', mission: 'barricade', team: 1, seed: 3 });
  const { S, w } = G, s = winSlot(w);
  ok(S.bars[s.id].h.length === s.N && w.bars.filter(x => x.kind !== 'door').every(x => S.bars[x.id].h), '作戦: 外の窓はすべて板');
  const k = s.cells[0];
  eq(w.blocks[k * 4 + 1], 0, 'ガラスは外してある');
  const L = across(s);
  ok(!losB(w, ...L.a, ...L.b, S.doors), '板があると見えない');
  const h = rcB(w, ...L.a, ...L.dir, 3, S.doors, {}).find(x => x.kind === 'bar');
  ok(h && h.bar === s.id, '弾は板に当たる');
  const ev = [];
  hitBar(S, w, s.id, h.pc, 1, ev);
  ok(!losB(w, ...L.a, ...L.b, S.doors), '1発ではまだ穴はない');
  hitBar(S, w, s.id, h.pc, 1, ev);
  ok(losB(w, ...L.a, ...L.b, S.doors), '2発で穴: 見通せる');
  ok(ev.some(e => e.e === 'barhit' && e.cut), '削れた音と木っ端');
  bashBar(S, w, s.id, s.y0 + 0.1, ev, -1); bashBar(S, w, s.id, s.y0 + 0.1, ev, -1);
  ok(S.bars[s.id].h, '2回ではまだ残る');
  bashBar(S, w, s.id, s.y0 + 0.1, ev, -1);
  eq(S.bars[s.id].h, '', '3回で崩れる');
  ok(ev.some(e => e.e === 'barbreak'), '崩れた出来事');
  const G2 = load(dump(G));
  eq(G2.S.bars[s.id].h, '', '保存して読み込んでも同じ');
  eq(G2.w.blocks[k * 4 + 1], 0, '読み込んでもガラスはない');
});
test('barricade: 扉のバリケードは人を止め、床すれすれのドローンは下を通す。崩れると通れる', () => {
  const G = createGame({ map: 'bank', mode: 'bomb', teams: [1, 1], seed: 3 });
  const { S, w } = G, d = w.doors.find(x => !x.double), s = w.bars[d.bar];
  const def = S.actors.find(a => a.team === S.m.def);
  def.x = d.cx + d.nx * 0.8; def.z = d.cz + d.nz * 0.8;
  doorOpB(S, w, def, d.id, 'bar', []);
  eq(S.doors[d.id].bar, 1, '扉の状態にも出る');
  const px = d.cx + d.nx * 0.2, pz = d.cz + d.nz * 0.2, base = d.L * 3;
  const o1 = poB(w, px, pz, base + 0.36, base + 1.8, 0.25, S.doors);
  ok(o1[2] && Math.hypot(o1[0], o1[1]) > 0.02, '人は押し戻される');
  const o2 = poB(w, d.cx, d.cz, base + 0.02, base + 0.18, 0.14, S.doors);
  ok(!(o2[2] && Math.hypot(o2[0], o2[1]) > 0.05 && Math.abs((o2[0]) * d.nx + (o2[1]) * d.nz) > 0.05), 'ドローン（床から18cmまで）は扉の線で押し戻されない');
  const ev = [];
  for (let i = 0; i < 3; i++) bashBar(S, w, s.id, base + 1, ev, -1);
  eq(S.doors[d.id].bar, 0, '3回殴ると崩れる');
  const o3 = poB(w, px, pz, base + 0.36, base + 1.8, 0.25, S.doors);
  ok(!(o3[2] && Math.abs(o3[0] * d.nx + o3[1] * d.nz) > 0.05), '崩れたら通れる');
});
test('pvp: 攻守のモードでは攻撃側は準備のあいだ出てこず（人はドローン）、行動開始で選んだ出現地点に出る', () => {
  const G = createGame({ map: 'bank', mode: 'bomb', teams: [2, 2], roster: [{ pid: 0, name: 'P', team: 0 }], seed: 2 });
  const S = G.S, me = S.actors.find(a => a.pid === 0);
  ok(me.staged && !me.alive, '最初は出ていない');
  let evs = [];
  for (let i = 0; i < 60 * 4; i++) evs.push(...step(G, { [me.id]: { yaw: me.yaw, pitch: 0, act: i === 5 ? [{ a: 'zone', z: 2 }] : null } }));
  eq(S.m.phase, 'prep', '準備中');
  ok(evs.some(e => e.e === 'drone' && e.owner === me.id), '準備の始めにドローン');
  eq(me.zone, 2, '出現地点を選べる');
  const atk = S.actors.filter(a => a.team === S.m.att && !a.isDrone);
  ok(atk.every(a => !a.alive && a.staged), '攻撃側は誰も出ていない（撃たれない）');
  for (let i = 0; i < 60 * 46; i++) step(G, {});
  eq(S.m.phase, 'action', '行動開始');
  ok(me.alive && !me.staged, '出てきた');
  ok(atk.some(a => a.carry === 'defuser'), '解除装置は持ったまま');
});
test('pvp: 防衛側は準備中は建物の外に出られず、行動中に外へ出ると2.5秒で居場所が知られる', () => {
  const G = createGame({ map: 'bank', mode: 'elim', teams: [1, 1], roster: [{ pid: 0, name: 'P', team: 1 }], seed: 2 });
  const { S, w } = G, me = S.actors.find(a => a.pid === 0);
  for (let i = 0; i < 60 * 5; i++) step(G, {});
  eq(S.m.phase, 'prep', '殲滅戦にも準備がある');
  eq(me.team, S.m.def, '防衛側');
  ok(!isOutside(w, me), '中にいる');
  // 外のマスへ置いてみる
  let out = null;
  for (let j = 0; j < w.D && !out; j++) for (let i = 0; i < w.W; i++) { const k = w.idx(0, i, j); if (w.cell[k] === 2 && Math.hypot((i + 0.5) * 0.5 - me.x, (j + 0.5) * 0.5 - me.z) < 30) { out = [(i + 0.5) * 0.5, (j + 0.5) * 0.5]; break; } }
  const x0 = me.x, z0 = me.z;
  me.x = out[0]; me.z = out[1];
  step(G, {});
  ok(Math.hypot(me.x - x0, me.z - z0) < 0.5, '準備中は中へ戻される');
  for (let i = 0; i < 60 * 30; i++) step(G, {});
  eq(S.m.phase, 'action', '行動中');
  for (const b of S.actors) if (b.team === S.m.att) b.ai = null; // 撃たれないように相手を止める
  me.x = out[0]; me.z = out[1]; me.vx = me.vz = 0;
  let seen = false;
  for (let i = 0; i < Math.round(60 * (OUT_GRACE + 0.5)); i++) { const ev = step(G, { [me.id]: { yaw: me.yaw, pitch: 0 } }); if (ev.some(e => e.e === 'outside' && e.id === me.id)) seen = true; if (!me.alive) break; }
  ok(seen && me.spot > 0 && me.spotTeam === S.m.att, '外に出て2.5秒で知られる');
});
test('melee: 近接は3回でバリケードを壊す（穴の所を殴っても残りの段が落ちる）。対戦は50、作戦は怯ませて交戦規定に記録', () => {
  const G = createGame({ map: 'suburb', mode: 'pve', mission: 'barricade', team: 1, seed: 3 });
  const { S, w } = G, p = S.actors.find(a => a.pid === 0);
  for (const b of S.actors) if (b !== p) b.ai = null;
  const s = w.bars.find(x => x.kind === 'win' && x.L === 0);
  p.x = s.cx + s.nx * s.out * 0.75; p.z = s.cz + s.nz * s.out * 0.75; p.y = 0; p.vx = p.vz = 0;
  const yaw = Math.atan2(s.cx - p.x, s.cz - p.z);
  let n = 0;
  for (let i = 0; i < 160; i++) { const ev = step(G, { [p.id]: { yaw, pitch: 0, act: i % 40 === 0 ? [{ a: 'melee' }] : null } }); n += ev.filter(e => e.e === 'meleehit' && e.k === 'bar').length; if (!S.bars[s.id].h) break; }
  eq(S.bars[s.id].h, '', '窓のバリケードが壊れた');
  eq(n, 3, '3回で');
  // 作戦: 容疑者を殴る
  const sus = S.byId[S.m.sus[0]];
  p.x = s.cx + s.nx * s.out * 2.5; p.z = s.cz + s.nz * s.out * 2.5; p.vx = p.vz = 0;
  sus.x = p.x + Math.sin(yaw) * 0.9; sus.z = p.z + Math.cos(yaw) * 0.9; sus.y = 0; sus.vx = sus.vz = 0;
  const hp0 = sus.hp;
  for (let i = 0; i < 60; i++) step(G, { [p.id]: { yaw, pitch: 0, act: i === 40 ? [{ a: 'melee' }] : null } });
  ok(sus.hp < hp0 && sus.stun > 1, '怯んだ（拘束できる）');
  ok(S.harms.some(h => h.how === 'melee' && h.tgt === sus.id), '交戦規定の記録');
  // 対戦
  const T = createGame({ map: 'bank', mode: 'tdm', teams: [1, 1], roster: [{ pid: 0, name: 'P', team: 0 }], seed: 3 });
  for (let i = 0; i < 60 * 4; i++) step(T, {});
  const q = T.S.actors.find(a => a.pid === 0), foe = T.S.actors.find(a => a.team === 1);
  foe.ai = null; foe.spawnProt = 0; q.x = 3.25; q.z = 3.25; q.y = 0; foe.x = 3.25; foe.z = 4.2; foe.y = 0; q.vx = q.vz = foe.vx = foe.vz = 0;
  const fh = foe.hp;
  for (let i = 0; i < 30; i++) step(T, { [q.id]: { yaw: 0, pitch: 0, act: i === 0 ? [{ a: 'melee' }] : null } });
  eq(fh - foe.hp, 50, '対戦の近接は50');
});
