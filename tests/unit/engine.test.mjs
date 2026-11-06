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
