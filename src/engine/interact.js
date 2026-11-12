// 調べる・使う: 見ている物（扉・人・落ちている物・爆弾・壁）と、そのときできる操作。時間のかかる動作の進み。
import { raycast, los, CS, LH, levelOfY, NB, isWallish, C, leafEnd, pushOut, rayBox } from './world.js';
import { M, MATS } from './data/materials.js';
import { GEAR, LONG, HAND_LONG } from './data/equipment.js';
import { doorOp, sideOf, isClosed, detonateC2, triggerTrap } from './doors.js';
import { eyeOf, dropWeapon, capsOf, wristsOf, startMelee } from './combat.js';
import { throwNade, launchNade } from './nades.js';
import { placeBar, clearBar, bashBar } from './barricade.js';
import { curW } from './actor.js';
import { startReload, switchTo, m320Next, cancelReload } from './weapon.js';
import { ACT_POSE, REACH_D, STAND_D, ALIGN_T } from './data/acts.js';
import { depSpot, placeDep, removeDep, DEP_WHY } from './deploy.js';

const _rc = { out: [], seenProp: new Set(), seenDoor: new Set() };
export const REACH = 2.3;

// 時間（秒）
export const ACT_T = {
  restrain: 2.8, report: 0.6, collect: 1.2, pick: 6.0, lockgun: 2.0, wedge: 1.5, unwedge: 2.0, c2: 2.5, ram: 0.8, breach: 0.7, mirror: 2.4, mirrorP: 0.8, wand: 0.6, disarm: 3.0,
  bar: 1.5, unbar: 1.6, trap: 3.0, bash: 0.55, bandage: 3.5, plant: 7.0, defuse: 7.0, revive: 4.0, reinforce: 4.5, frame: 4.0, bombdefuse: 6.0, kick: 0.45, wall: 0.3, deppick: 1.0,
};
export const OP_NAME = {
  open: '開ける', peek: '少し開ける', close: '閉める', kick: '蹴る', pick: 'ピッキング', lockgun: 'ロックピックガン', wedge: 'ウェッジ', unwedge: 'ウェッジを外す', c2: 'C2を仕掛ける',
  ram: '破城槌', breach: '散弾で開ける', mirror: 'ミラーで見る', wand: 'オプティワンド', disarm: '罠を外す', bar: 'バリケード', unbar: 'バリケードを外す', trap: '罠を仕掛ける', bash: 'バリケードを壊す',
  restrain: '拘束', report: 'TOCに報告', collect: '証拠を回収', revive: '手当て', plant: '解除装置を設置', defuse: '解除装置を外す', pickup: '拾う', reinforce: '補強', frame: '壁用の爆破薬', bombdefuse: '爆弾を解除', det: '起爆',
  deploy: '置く', deppick: '盾を拾う',
};

// ---- 手が届くか: 距離と、間に家具・壁・扉・人がないか（オブジェクト越し・離れた所からはできない）
const _rr = { out: [], seenProp: new Set(), seenDoor: new Set() };
// 手の線（腕の高さ）: 途中に壁・閉じた扉・バリケード・動かない家具があれば届かない（椅子など低くて動かせる物は越えられる）
function reachLine(S, w, x0, y0, z0, x1, y1, z1, skipDoor = -1, skipProp = -1, skipBar = -1) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz);
  if (L < 0.05) return true;
  const hits = raycast(w, x0, y0, z0, dx / L, dy / L, dz / L, L, S.doors, _rr);
  for (const h of hits) {
    if (h.t0 >= L - 0.04) break;
    if (h.kind === 'prop') { const pr = w.props[h.id]; if (!pr || !pr.solid || h.id === skipProp) continue; return false; }
    if ((h.kind === 'door' || h.kind === 'bar') && h.id === skipDoor && skipDoor >= 0) continue;
    if (h.kind === 'bar' && h.bar === skipBar) continue;
    if (h.kind === 'block' && h.mat === M.GLASSBROKEN) continue;
    return false;
  }
  return true;
}
// 上から見た線分と四角（x0,z0〜x1,z1）が交わるか
function segRect(ax, az, bx, bz, x0, z0, x1, z1) {
  if (x1 <= x0 || z1 <= z0) return false;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const clip = (p, q) => { if (Math.abs(p) < 1e-9) return q >= 0; const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; };
  return clip(-dx, ax - x0) && clip(dx, x1 - ax) && clip(-dz, az - z0) && clip(dz, z1 - az) && t0 <= t1;
}
function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
const _bcSeen = new Set();
// 体と体（手を当てる所）の間: 腰の高さまでの家具の箱（テーブルは天板の下のすき間も含めて、上から見た広さ全部）と、ほかの人の体
// 直前の bodyClear で間に立っていた人（AI なら脇へよけてもらう）
export let BLOCKER = null;
export function bodyClear(S, w, a, tx, tz, L, o = {}) {
  const x0 = a.x, z0 = a.z;
  BLOCKER = null;
  if (Math.hypot(tx - x0, tz - z0) < 0.06) return true;
  const base = L * LH;
  const i0 = Math.max(0, Math.floor((Math.min(x0, tx) - 1.0) / CS)), i1 = Math.min(w.W - 1, Math.floor((Math.max(x0, tx) + 1.0) / CS));
  const j0 = Math.max(0, Math.floor((Math.min(z0, tz) - 1.0) / CS)), j1 = Math.min(w.D - 1, Math.floor((Math.max(z0, tz) + 1.0) / CS));
  _bcSeen.clear();
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const near = w.propNear.get(w.idx(L, i, j));
    if (!near) continue;
    for (const pid of near) {
      if (_bcSeen.has(pid)) continue;
      _bcSeen.add(pid);
      const p = w.props[pid];
      if (!p || p.alive === false || !p.solid || pid === o.skipProp || p.L !== L) continue;
      for (const b of p.boxes) {
        if (b[4] - base < 0.28 || b[1] - base > 1.45) continue;
        if (segRect(x0, z0, tx, tz, b[0] + 0.025, b[2] + 0.025, b[3] - 0.025, b[5] - 0.025)) return false;
      }
    }
  }
  for (const b of S.actors) {
    if (b === a || b.id === o.skipId || b.isDrone || !b.alive || b.down) continue;
    if (Math.abs(b.y - a.y) > 1.2) continue;
    if (distSeg(b.x, b.z, x0, z0, tx, tz) < 0.22) { BLOCKER = b; return false; }
  }
  return true;
}
// 落ちている物が載っている家具（その家具は越えて手を伸ばせる）
function supportProp(w, it) {
  const L = levelOfY(it.y + 0.1);
  const near = w.propNear.get(w.idx(L, Math.floor(it.x / CS), Math.floor(it.z / CS)));
  if (!near) return -1;
  for (const pid of near) {
    const p = w.props[pid]; if (!p || p.alive === false || !p.solid) continue;
    for (const b of p.boxes) if (it.x >= b[0] - 0.05 && it.x <= b[3] + 0.05 && it.z >= b[2] - 0.05 && it.z <= b[5] + 0.05 && Math.abs(it.y - b[4]) < 0.12) return pid;
  }
  return -1;
}
// 人の手を当てる所: 立っている・ひざをついている人は体の中心、倒れた人は胸
export function personPoint(S, b) {
  if (b.down || b.dead) {
    const caps = capsOf(S, b); const c = caps.find(q => q.part === 'chest');
    if (c) return [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2, (c.a[2] + c.b[2]) / 2];
    return [b.x, b.y + 0.25, b.z];
  }
  return [b.x, b.y + 0.9, b.z];
}
// 扉の手を当てる所（自分の側の面から少し手前）: ノブ・錠（ピッキング・C2・蹴り）・扉の下（ウェッジ・ミラー・罠）
export function doorPoint(w, d, side, op) {
  let hx = d.cx, hz = d.cz;
  if (!d.double) { const lf = d.leaves[0]; hx = lf.hx + lf.dx * (lf.len - 0.12); hz = lf.hz + lf.dz * (lf.len - 0.12); }
  const low = op === 'wedge' || op === 'unwedge' || op === 'mirror' || op === 'disarm' || op === 'trap' || op === 'wand';
  const mid = op === 'bar' || op === 'unbar' || op === 'bash';
  const hy = d.L * LH + (low ? 0.1 : op === 'kick' || op === 'bash' ? 0.55 : op === 'c2' ? 1.05 : op === 'bar' || op === 'unbar' ? 1.0 : 0.98);
  const bx = low || mid ? d.cx : op === 'kick' ? (d.cx + hx) / 2 : hx, bz = low || mid ? d.cz : op === 'kick' ? (d.cz + hz) / 2 : hz;
  return [bx + d.nx * side * 0.14, hy, bz + d.nz * side * 0.14];
}
// バリケード（窓・ガラスの壁）の手を当てる所: 自分の側の板の面、横は枠の内側、高さ y
export function barPoint(s, a, y) {
  const along = s.axis === 0 ? a.x : a.z;
  const u = Math.max(s.a0 + 0.15, Math.min(s.a1 - 0.15, along));
  const across = (s.axis === 0 ? a.z : a.x) - s.c, sd = across >= 0 ? 1 : -1, off = s.th / 2 + 0.03;
  return s.axis === 0 ? [u, y, s.c + sd * off] : [s.c + sd * off, y, u];
}
// ノブを回したあと扉を押す・引く手の当て所: 自分に近い葉の面（自分の側）、自由端から 0.22m。
// 押し開けるときは胸の高さ（手のひらで押す）、閉めるときは腰の高さ（端を持って引く・押す）
export function pushPoint(S, w, a, did, op) {
  const d = w.doors[did], ds = S.doors[did];
  if (!d || !ds || ds.broken) return null;
  let best = null, bd = 1e9;
  for (let li = 0; li < d.leaves.length; li++) {
    const lf = d.leaves[li], [ex, ez] = leafEnd(lf, ds.ang[li]);
    const f = Math.max(0.3, (lf.len - 0.22) / lf.len);
    const px = lf.hx + (ex - lf.hx) * f, pz = lf.hz + (ez - lf.hz) * f;
    const dd = Math.hypot(px - a.x, pz - a.z);
    if (dd < bd) { bd = dd; best = [px, pz]; }
  }
  if (!best) return null;
  const dx = a.x - best[0], dz = a.z - best[1], l = Math.hypot(dx, dz) || 1;
  return [best[0] + dx / l * 0.05, d.L * LH + (op === 'close' ? 1.05 : 1.38), best[1] + dz / l * 0.05];
}
// 扉の開口（線分）からの距離
function doorDist(d, x, z) {
  const along = d.axis === 0 ? x : z, across = (d.axis === 0 ? z : x) - d.c;
  const ex = Math.max(0, d.a0 - along, along - d.a1);
  return Math.hypot(across, ex);
}
// 動作 op が、いまの位置から目標に届くか。slack: 動作の最中は少しゆるめる（寄りながら行うため）
// 届かない理由（直前の reachOK）: 'dist' 離れている、'block' 間に物・人・壁がある
export let REACH_WHY = 'dist';
export function reachOK(S, w, a, k, id, op, slack = 0) {
  const lim = (REACH_D[op] ?? 1.0) + slack;
  REACH_WHY = 'dist';
  if (lim >= 90) return true;
  const L = levelOfY(a.y + 0.2);
  if (k === 'person') {
    const b = S.byId[id]; if (!b) return false;
    if (Math.abs(b.y - a.y) > 0.7) return false;
    const low = b.down || b.dead;
    if (op === 'report') {
      if (Math.hypot(b.x - a.x, b.z - a.z) > lim) return false;
      const e = eyeOf(S, a); return reachLine(S, w, e[0], e[1], e[2], b.x, b.y + (low ? 0.3 : b.cuffed || b.comply === 2 ? 0.8 : 1.1), b.z);
    }
    const tp = personPoint(S, b);
    if (Math.hypot(tp[0] - a.x, tp[2] - a.z) > lim) return false;
    REACH_WHY = 'block';
    if (!bodyClear(S, w, a, tp[0], tp[2], L, { skipId: b.id })) return false;
    return reachLine(S, w, a.x, a.y + 1.0, a.z, tp[0], tp[1], tp[2]) && reachLine(S, w, a.x, a.y + 0.5, a.z, tp[0], b.y + (low ? 0.2 : 0.45), tp[2]);
  }
  if (k === 'item') {
    const it = S.items.find(x => x.id === id); if (!it || it.gone) return false;
    if (Math.hypot(it.x - a.x, it.z - a.z) > lim || it.y - a.y > 1.45 || a.y - it.y > 0.35) return false;
    const sp = supportProp(w, it);
    REACH_WHY = 'block';
    if (!bodyClear(S, w, a, it.x, it.z, L, { skipProp: sp })) return false;
    return reachLine(S, w, a.x, a.y + 1.1, a.z, it.x, it.y + 0.08, it.z, -1, sp);
  }
  if (k === 'door') {
    const d = w.doors[id], ds = S.doors[id]; if (!d || Math.abs(a.y - d.L * LH) > 0.8) return false;
    // 開いている扉（閉める・押し開ける）は、板のいちばん近い所に手が届けばよい
    if (ds && !ds.broken && (op === 'close' || op === 'open') && d.leaves.some((lf, li) => Math.abs(ds.ang[li] || 0) > 0.2)) {
      let best = 1e9, bx = 0, bz = 0;
      d.leaves.forEach((lf, li) => {
        const [ex, ez] = leafEnd(lf, ds.ang[li] || 0), vx = ex - lf.hx, vz = ez - lf.hz, vv = vx * vx + vz * vz || 1;
        const t = Math.max(0.15, Math.min(1, ((a.x - lf.hx) * vx + (a.z - lf.hz) * vz) / vv));
        const qx = lf.hx + vx * t, qz = lf.hz + vz * t, dd = Math.hypot(a.x - qx, a.z - qz);
        if (dd < best) { best = dd; bx = qx; bz = qz; }
      });
      if (best > lim) return false;
      REACH_WHY = 'block';
      if (!bodyClear(S, w, a, bx, bz, d.L)) return false;
      return reachLine(S, w, a.x, a.y + 1.0, a.z, bx, d.L * LH + 1.0, bz, id);
    }
    const side = sideOf(d, a.x, a.z) || 1;
    // 開口の中（扉の線の上）に立っていたら、横からは操作できない
    const across = (a.x - d.cx) * d.nx + (a.z - d.cz) * d.nz;
    if (Math.abs(across) < 0.1) return false;
    const P = doorPoint(w, d, side, op);
    if (Math.hypot(P[0] - a.x, P[2] - a.z) > lim && doorDist(d, a.x, a.z) > lim) return false;
    if (Math.hypot(P[0] - a.x, P[2] - a.z) > lim + 0.35) return false;
    REACH_WHY = 'block';
    if (!bodyClear(S, w, a, P[0], P[2], d.L)) return false;
    return reachLine(S, w, a.x, a.y + 1.0, a.z, P[0], Math.max(P[1], d.L * LH + 0.5), P[2], id);
  }
  if (k === 'bar') {
    const s = w.bars[id]; if (!s || Math.abs(a.y - s.L * LH) > 0.8) return false;
    const P = barPoint(s, a, Math.min(s.L * LH + 1.3, (s.y0 + s.y1) / 2));
    if (Math.hypot(P[0] - a.x, P[2] - a.z) > lim + 0.2) return false;
    REACH_WHY = 'block';
    if (!bodyClear(S, w, a, P[0], P[2], s.L)) return false;
    return reachLine(S, w, a.x, a.y + 1.0, a.z, P[0], P[1], P[2], -1, -1, id);
  }
  if (k === 'bomb') {
    const b = S.m.bombs && S.m.bombs.find(q => q.id === id); if (!b) return false;
    if (Math.hypot(b.x - a.x, b.z - a.z) > lim || Math.abs(b.y - a.y) > 1.2) return false;
    REACH_WHY = 'block';
    if (!bodyClear(S, w, a, b.x, b.z, L, { skipProp: supportProp(w, b) })) return false;
    return reachLine(S, w, a.x, a.y + 0.9, a.z, b.x, b.y + 0.15, b.z, -1, supportProp(w, b));
  }
  if (k === 'site') {
    if (op !== 'defuse') return true;
    const q = S.m.defuser; if (!q) return false;
    if (Math.hypot(q.x - a.x, q.z - a.z) > lim || Math.abs(q.y - a.y) > 1.2) return false;
    REACH_WHY = 'block';
    if (!bodyClear(S, w, a, q.x, q.z, L)) return false;
    return reachLine(S, w, a.x, a.y + 0.9, a.z, q.x, q.y + 0.15, q.z);
  }
  if (k === 'wall') {
    const i = id % w.W, j = Math.floor(id / w.W) % w.D;
    const cx = (i + 0.5) * CS, cz = (j + 0.5) * CS;
    // 壁の面（マスの中央の板の手前）までの距離
    const dd = Math.max(Math.abs(cx - a.x), Math.abs(cz - a.z)) - 0.15;
    if (dd > lim) return false;
    REACH_WHY = 'block';
    const fx = Math.abs(cx - a.x) > Math.abs(cz - a.z) ? cx - Math.sign(cx - a.x) * 0.2 : a.x, fz = Math.abs(cx - a.x) > Math.abs(cz - a.z) ? a.z : cz - Math.sign(cz - a.z) * 0.2;
    return bodyClear(S, w, a, fx, fz, L);
  }
  if (k === 'dep') {
    const d = S.deps && S.deps.find(q => q.id === id);
    if (!d) return false;
    return Math.hypot(d.x - a.x, d.z - a.z) <= lim && Math.abs(d.y - a.y) < 0.6;
  }
  return true;
}
// AI: 目標（人・物）に手が届く立ち位置。近い順に、歩ける床のマスから届くかを試す（家具の向こうなら回り込む）
export function approachPoint(S, w, a, k, id, op, nav) {
  const t = k === 'person' ? S.byId[id] : k === 'item' ? S.items.find(x => x.id === id) : k === 'bomb' ? (S.m && S.m.bombs || []).find(x => x.id === id) : null;
  if (!t) return null;
  const tp = k === 'person' ? personPoint(S, t) : [t.x, t.y, t.z];
  const L = levelOfY(t.y + 0.3), lim = REACH_D[op] ?? 1.0, R = Math.ceil(lim / CS) + 1;
  const ci = Math.floor(tp[0] / CS), cj = Math.floor(tp[2] / CS);
  const sx = a.x, sz = a.z, sy = a.y;
  // 同じ部屋の点を先に（扉の向こう側の点を選ぶと、扉の口に立っている相手の体で扉が開かず、回り込めなかった）
  const myRoom = w.roomAt ? w.roomAt[w.idx(levelOfY(a.y + 0.3), Math.floor(a.x / CS), Math.floor(a.z / CS))] : -1;
  const cand = [];
  for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
    if (i < 0 || j < 0 || i >= w.W || j >= w.D) continue;
    const kk = w.idx(L, i, j);
    if (nav && nav.walk[kk] !== 1) continue;
    const x = (i + 0.5) * CS, z = (j + 0.5) * CS, dt = Math.hypot(x - tp[0], z - tp[2]);
    if (dt < 0.45 || dt > lim - 0.08) continue;
    cand.push([Math.hypot(x - sx, z - sz) + dt * 0.5 + (w.roomAt && w.roomAt[kk] !== myRoom ? 3 : 0), x, z]);
  }
  cand.sort((p, q) => p[0] - q[0]);
  let found = null;
  for (const [, x, z] of cand.slice(0, 24)) {
    a.x = x; a.z = z; a.y = L * LH;
    const okR = reachOK(S, w, a, k, id, op);
    a.x = sx; a.z = sz; a.y = sy;
    if (okR) { found = [x, z]; break; }
  }
  a.x = sx; a.z = sz; a.y = sy;
  return found;
}
// 届かない操作に印をつけ、既定の操作は届くものから
function markReach(S, w, a, ctx) {
  for (const o of ctx.ops) { o.far = !reachOK(S, w, a, ctx.k, ctx.id, o.op); o.why = o.far ? REACH_WHY : null; }
  ctx.def = ctx.ops.find(o => !o.far) || ctx.ops[0];
  ctx.far = ctx.ops.every(o => o.far);
  return ctx;
}
// 動作の手の行き先（世界の点）: 体の動きに使う
function actTarget(S, w, a, k, id, op) {
  if (k === 'person') {
    const b = S.byId[id]; if (!b) return null;
    if (op === 'report') return null;
    if (b.down || b.dead) return personPoint(S, b);
    // 手首（背中側の腰）。拘束では毎ステップ、相手の手首を追う
    return wristsOf(S, b);
  }
  if (k === 'item') { const it = S.items.find(x => x.id === id); return it ? [it.x, it.y + 0.05, it.z] : null; }
  if (k === 'door') {
    const d = w.doors[id]; if (!d) return null;
    return doorPoint(w, d, sideOf(d, a.x, a.z) || 1, op);
  }
  if (k === 'bomb') { const b = S.m.bombs && S.m.bombs.find(q => q.id === id); return b ? [b.x, b.y + 0.15, b.z] : null; }
  if (k === 'bar') { const s = w.bars[id]; return s ? barPoint(s, a, Math.min(s.L * LH + 1.4, (s.y0 + s.y1) / 2)) : null; }
  if (k === 'site') {
    if (op === 'defuse' && S.m.defuser) return [S.m.defuser.x, S.m.defuser.y + 0.1, S.m.defuser.z];
    return [a.x + Math.sin(a.yaw) * 0.5, a.y + 0.05, a.z + Math.cos(a.yaw) * 0.5];
  }
  if (k === 'wall') { const i = id % w.W, j = Math.floor(id / w.W) % w.D; const cx = (i + 0.5) * CS, cz = (j + 0.5) * CS; const ax = Math.abs(cx - a.x) > Math.abs(cz - a.z); return [ax ? cx - Math.sign(cx - a.x) * 0.16 : a.x, a.y + 1.15, ax ? a.z : cz - Math.sign(cz - a.z) * 0.16]; }
  if (k === 'dep') { const d = S.deps && S.deps.find(q => q.id === id); return d ? [d.x, d.y + 0.55, d.z] : null; }
  return null;
}
// 動作の立ち位置: 目標の手前（目標から自分への向き、扉は自分の側の正面）。歩ける所で、今の所から体ごと移れるときだけ
function standPoint(S, w, a, k, id, op, tgt) {
  const sd = STAND_D[op];
  if (sd == null || !tgt) return null;
  const L = levelOfY(a.y + 0.2);
  let bx, bz, nx, nz;
  if (k === 'door') {
    const d = w.doors[id]; if (!d) return null;
    const side = sideOf(d, a.x, a.z) || 1;
    nx = d.nx * side; nz = d.nz * side; bx = tgt[0] - nx * 0.14; bz = tgt[2] - nz * 0.14;
  } else if (k === 'bar') {
    const s = w.bars[id]; if (!s) return null;
    const sg = ((s.axis === 0 ? a.z : a.x) - s.c) >= 0 ? 1 : -1;
    nx = s.nx * sg; nz = s.nz * sg; bx = tgt[0] - nx * 0.04; bz = tgt[2] - nz * 0.04;
  } else if (k === 'wall') {
    bx = tgt[0]; bz = tgt[2]; const dx = a.x - bx, dz = a.z - bz, dd = Math.hypot(dx, dz) || 1; nx = dx / dd; nz = dz / dd;
    if (Math.abs(nx) > Math.abs(nz)) { nx = Math.sign(nx); nz = 0; } else { nz = Math.sign(nz); nx = 0; }
  } else {
    const c = k === 'person' ? personPoint(S, S.byId[id]) : tgt;
    bx = c[0]; bz = c[2];
    const dx = a.x - bx, dz = a.z - bz, dd = Math.hypot(dx, dz);
    if (dd < 0.05) return null;
    nx = dx / dd; nz = dz / dd;
  }
  const sx = bx + nx * sd, sz = bz + nz * sd;
  const mv = Math.hypot(sx - a.x, sz - a.z);
  if (mv < 0.04) return null;
  if (mv > (op === 'kick' || op === 'bash' ? 0.4 : 0.85)) return null;
  // 立てる床か（壁・家具に重ならない）
  const i = Math.floor(sx / CS), j = Math.floor(sz / CS);
  if (i < 0 || j < 0 || i >= w.W || j >= w.D) return null;
  const t = w.cell[w.idx(L, i, j)];
  if (t !== C.FLOOR && t !== C.OUT && t !== C.OPEN && t !== C.DOOR) return null;
  const po = pushOut(w, sx, sz, a.y + 0.4, a.y + 1.5, 0.25, S.doors, -1, _po);
  if (po[2] && Math.hypot(po[0], po[1]) > 0.06) return null;
  if (!bodyClear(S, w, a, sx, sz, L, { skipId: k === 'person' ? id : -1 })) return null;
  return [sx, sz];
}
const _po = [0, 0, 0];

// 見ている物を調べる
export function contextOf(S, w, a) {
  if (!a.alive || a.down || a.cuffed) return null;
  const eye = eyeOf(S, a);
  const cp = Math.cos(a.pitch), dx = Math.sin(a.yaw) * cp, dy = Math.sin(a.pitch), dz = Math.cos(a.yaw) * cp;
  const hits = raycast(w, eye[0], eye[1], eye[2], dx, dy, dz, 3.2, S.doors, _rc);
  let wallHit = null, doorHit = null, barHit = null, depHit = null;
  for (const h of hits) {
    if (h.kind === 'dep') { if (!depHit) depHit = h; continue; }
    if (h.kind === 'bar' && h.id < 0) { barHit = h; break; }
    if (h.kind === 'door' || h.kind === 'bar') { doorHit = h; break; }
    if (h.kind === 'block' || h.kind === 'slab' || h.kind === 'prop' || h.kind === 'stair' || h.kind === 'edge') { if (MATS[h.mat] && MATS[h.mat].see) continue; wallHit = h; break; }
  }
  const wallT = wallHit ? wallHit.t0 : barHit ? barHit.t0 : 99;
  // 人（照準の線の近く、2.5m以内）
  let person = null, pd = 1e9;
  for (const b of S.actors) {
    if (b.id === a.id || b.isDrone) continue;
    if (!b.alive && !b.dead) continue;
    const by = b.down || b.dead ? b.y + 0.25 : b.comply === 2 || b.cuffed ? b.y + 0.9 : b.y + 1.2;
    const ox = b.x - eye[0], oy = by - eye[1], oz = b.z - eye[2];
    const t = ox * dx + oy * dy + oz * dz;
    if (t < 0.2 || t > 2.6 || t > wallT + 0.3) continue;
    const perp = Math.sqrt(Math.max(0, ox * ox + oy * oy + oz * oz - t * t));
    const lim = b.down || b.dead ? 0.7 : 0.55;
    if (perp > lim) continue;
    const score = perp + t * 0.15;
    if (score < pd) { pd = score; person = b; }
  }
  if (person) {
    const ops = personOps(S, a, person);
    if (ops.length) return markReach(S, w, a, { k: 'person', id: person.id, ops, def: ops[0], dist: pd });
  }
  // 落ちている物
  let item = null, idist = 1e9;
  for (const it of S.items) {
    if (it.gone) continue;
    const ox = it.x - eye[0], oy = it.y + 0.05 - eye[1], oz = it.z - eye[2];
    const t = ox * dx + oy * dy + oz * dz;
    if (t < 0.1 || t > 2.6 || t > wallT + 0.3) continue;
    const perp = Math.sqrt(Math.max(0, ox * ox + oy * oy + oz * oz - t * t));
    if (perp > 0.6) continue;
    if (perp < idist) { idist = perp; item = it; }
  }
  if (item) {
    const ops = itemOps(S, a, item);
    if (ops.length) return markReach(S, w, a, { k: 'item', id: item.id, ops, def: ops[0] });
  }
  // 置ける盾（味方の盾は拾い直せる）
  if (depHit && depHit.t0 < 2.0 && depHit.t0 < wallT) {
    const d = S.deps && S.deps.find(q => q.id === depHit.id);
    if (d && d.k === 'shield' && d.team === a.team) return markReach(S, w, a, { k: 'dep', id: d.id, ops: [{ op: 'deppick', t: ACT_T.deppick }], def: null });
  }
  // 窓・ガラスの壁のバリケード（見ている板）
  if (barHit && barHit.t0 < 2.6) {
    const ops = barOps(S, w, a, barHit.bar);
    if (ops.length) return markReach(S, w, a, { k: 'bar', id: barHit.bar, ops, def: ops[0], hy: eye[1] + dy * barHit.t0 });
  }
  // 防衛側（対戦）: 板のない窓の枠を見ている → 板を打てる
  if (S.pvp && S.m && a.team === S.m.def && !doorHit && (S.m.phase === 'prep' || S.m.phase === 'action')) {
    const si = emptyFrame(S, w, a, eye, dx, dy, dz, wallT);
    if (si >= 0) return markReach(S, w, a, { k: 'bar', id: si, ops: barOps(S, w, a, si), def: null });
  }
  // 扉（当たった、または近くの扉）
  let did = doorHit ? doorHit.id : -1;
  if (did < 0) {
    let best = 2.0;
    for (const d of w.doors) {
      if (d.L !== levelOfY(a.y + 0.2)) continue;
      const ox = d.cx - a.x, oz = d.cz - a.z, dist = Math.hypot(ox, oz);
      if (dist > 2.2) continue;
      const fwd = (ox * dx + oz * dz) / Math.max(0.01, dist * Math.hypot(dx, dz));
      if (fwd < 0.55) continue;
      if (dist * (1.6 - fwd) < best && dist < wallT + 0.6) { best = dist * (1.6 - fwd); did = d.id; }
    }
  }
  if (did >= 0) {
    const ops = doorOps(S, w, a, did);
    if (ops.length) return markReach(S, w, a, { k: 'door', id: did, ops, def: ops[0], hy: doorHit && doorHit.kind === 'bar' ? eye[1] + dy * doorHit.t0 : null });
  }
  // 対戦: 爆弾の場所・壁・窓
  if (S.pvp && S.m && S.m.sites) {
    const so = siteOps(S, w, a, eye, dx, dz);
    if (so) return markReach(S, w, a, so);
  }
  if (S.pvp && wallHit && wallHit.kind === 'block' && wallHit.t0 < 1.6) {
    const ops = wallOps(S, w, a, wallHit);
    if (ops.length) return markReach(S, w, a, { k: 'wall', id: wallHit.k, ops, def: ops[0], q: wallHit.q });
  }
  // 作戦: 爆弾（爆弾脅迫）
  if (!S.pvp && S.m && S.m.bombs) {
    for (const b of S.m.bombs) {
      if (b.done) continue;
      const dist = Math.hypot(b.x - a.x, b.z - a.z);
      if (dist < 2.2 && Math.abs(b.y - a.y) < 1.5) return markReach(S, w, a, { k: 'bomb', id: b.id, ops: [{ op: 'bombdefuse', t: ACT_T.bombdefuse }], def: null });
    }
  }
  return null;
}

function gearN(a, id) { const g = a.inv.gear.find(x => x.id === id); return g ? g.n : 0; }
function useGear(a, id) { const g = a.inv.gear.find(x => x.id === id); if (g && g.n > 0) { g.n--; return true; } return false; }

export function personOps(S, a, b) {
  const ops = [];
  if (S.pvp) {
    if (b.alive && b.down && b.team === a.team) ops.push({ op: 'revive', t: ACT_T.revive });
    return ops;
  }
  if (b.alive && !b.cuffed && (b.comply >= 1 || b.down || b.tased > 0 || b.stun > 1.0 || b.flash > 1.0) && b.kind !== 'swat') ops.push({ op: 'restrain', t: ACT_T.restrain });
  if ((b.cuffed || b.down || b.dead) && !b.reported) ops.push({ op: 'report', t: ACT_T.report });
  if (b.kind === 'swat' && b.down && !b.reported) ops.push({ op: 'report', t: ACT_T.report });
  return ops;
}
function itemOps(S, a, it) {
  if (S.pvp) {
    if (it.kind === 'defuser' && a.team === S.m.att) return [{ op: 'pickup', t: 0.3 }];
    return [];
  }
  if (it.kind === 'weapon' || it.kind === 'evidence') return [{ op: 'collect', t: ACT_T.collect }];
  return [];
}
// 窓・ガラスの壁のバリケード: 板があれば殴って壊す（防衛側は外すことも）。板がなければ防衛側は打てる
export function barOps(S, w, a, si) {
  const st = S.bars && S.bars[si], ops = [];
  const def = S.pvp && S.m && a.team === S.m.def;
  if (st && st.h) {
    ops.push({ op: 'bash', t: ACT_T.bash });
    if (def) ops.push({ op: 'unbar', t: ACT_T.unbar });
  } else if (def && (S.m.phase === 'prep' || S.m.phase === 'action')) ops.push({ op: 'bar', t: ACT_T.bar });
  return ops;
}
function emptyFrame(S, w, a, eye, dx, dy, dz, maxT) {
  const L = levelOfY(a.y + 0.2);
  let best = -1, bt = Math.min(2.4, maxT);
  for (const s of w.bars) {
    if (s.kind === 'door' || s.L !== L || (S.bars[s.id] && S.bars[s.id].h)) continue;
    if (Math.abs(s.cx - a.x) > 3.2 || Math.abs(s.cz - a.z) > 3.2) continue;
    const r = rayBox(eye[0], eye[1], eye[2], dx, dy, dz, s.box[0] - 0.05, s.y0, s.box[1] - 0.05, s.box[2] + 0.05, s.y1, s.box[3] + 0.05);
    if (r && r[0] >= 0 && r[0] < bt) { bt = r[0]; best = s.id; }
  }
  return best;
}
export function doorOps(S, w, a, did) {
  const ds = S.doors[did], d = w.doors[did];
  const ops = [];
  if (ds.broken) return ops;
  const closed = isClosed(ds);
  const side = sideOf(d, a.x, a.z);
  if (ds.bar > 0) {
    if (S.pvp && a.team === S.m.def) { ops.push({ op: 'unbar', t: ACT_T.unbar }); ops.push({ op: 'bash', t: ACT_T.bash }); }
    else { ops.push({ op: 'bash', t: ACT_T.bash }); if (gearN(a, 'c2')) ops.push({ op: 'c2', t: ACT_T.c2, gear: 'c2' }); if (a.inv.long === 'ram') ops.push({ op: 'ram', t: ACT_T.ram }); if (a.inv.long === 'breacher') ops.push({ op: 'breach', t: ACT_T.breach }); }
    return ops;
  }
  if (ds.c2) ops.push({ op: 'det', t: 0 });
  if (!closed) { ops.push({ op: 'close', t: 0 }); if (Math.abs(ds.ang[0]) < 0.6) ops.push({ op: 'open', t: 0 }); }
  else {
    ops.push({ op: 'open', t: 0 }); ops.push({ op: 'peek', t: 0 });
    ops.push({ op: 'mirror', t: a.pid != null ? ACT_T.mirrorP : ACT_T.mirror });
    if (a.inv.long === 'wand') ops.push({ op: 'wand', t: ACT_T.wand });
    if (ds.wedge) ops.push({ op: 'unwedge', t: ACT_T.unwedge });
    else if (gearN(a, 'wedge')) ops.push({ op: 'wedge', t: ACT_T.wedge, gear: 'wedge' });
    ops.push({ op: 'kick', t: ACT_T.kick });
    if (ds.locked && !ds.lockBroken) { ops.push({ op: gearN(a, 'lockgun') ? 'lockgun' : 'pick', t: gearN(a, 'lockgun') ? ACT_T.lockgun : ACT_T.pick }); }
    if (a.inv.long === 'ram') ops.push({ op: 'ram', t: ACT_T.ram });
    if (a.inv.long === 'breacher') ops.push({ op: 'breach', t: ACT_T.breach });
    if (gearN(a, 'c2') && !ds.c2) ops.push({ op: 'c2', t: ACT_T.c2, gear: 'c2' });
    if (ds.trap && ds.trapSeen) ops.push({ op: 'disarm', t: ACT_T.disarm });
    // 防衛側: 準備中は「バリケード」が既定（押すだけで打てる）。行動中も打てる（メニューから）
    if (S.pvp && a.team === S.m.def && (S.m.phase === 'prep' || S.m.phase === 'action')) { if (S.m.phase === 'prep') ops.unshift({ op: 'bar', t: ACT_T.bar }); else ops.push({ op: 'bar', t: ACT_T.bar }); if (gearN(a, 'claymore') && !ds.trap) ops.push({ op: 'trap', t: ACT_T.trap, gear: 'claymore' }); }
  }
  // 既定の操作: 閉じていれば「開ける」
  return ops;
}
function siteOps(S, w, a, eye, dx, dz) {
  const m = S.m;
  if (m.defuser && m.defuser.planted && a.team === m.def) {
    const p = m.defuser;
    if (Math.hypot(p.x - a.x, p.z - a.z) < 2.2 && Math.abs(p.y - a.y) < 1.5) return { k: 'site', id: -1, ops: [{ op: 'defuse', t: ACT_T.defuse }], def: { op: 'defuse', t: ACT_T.defuse } };
  }
  if (a.carry === 'defuser' && m.phase === 'action' && !(m.defuser && m.defuser.planted)) {
    for (const s of m.sites) {
      if (s.L !== levelOfY(a.y + 0.2) || (m.target != null && s.id !== m.target)) continue;
      if (Math.hypot(s.x - a.x, s.z - a.z) < s.r) return { k: 'site', id: s.id, ops: [{ op: 'plant', t: ACT_T.plant }], def: { op: 'plant', t: ACT_T.plant } };
    }
  }
  return null;
}
function wallOps(S, w, a, h) {
  const ops = [];
  const k = h.k;
  const t = w.cell[k];
  const mat = w.blocks[k * NB + (h.q || 0)];
  if (t !== C.WALL || !(mat === M.DRYWALL || mat === M.WOOD)) return ops;
  if (S.m.def === a.team && S.m.phase === 'prep' && !S.reinf[k] && (S.m.reinfLeft ?? 0) > 0) ops.push({ op: 'reinforce', t: ACT_T.reinforce });
  if (S.m.att === a.team && gearN(a, 'frame')) ops.push({ op: 'frame', t: ACT_T.frame, gear: 'frame' });
  return ops;
}

// 動作を始める（人もAIも同じ）。ac: { a:'use' } | { a:'op', k, id, op } | { a:'shout' } | ...
export function doAction(S, w, a, ac, ev) {
  if (!a.alive) return;
  const kind = ac.a;
  if (kind === 'shout') { shout(S, a, ev, ac.line); return; }
  if (kind === 'cmd') { S.orders.push({ ...ac, by: a.id, t: S.t, n: ++S.cmdSeq }); ev.push({ e: 'cmd', id: a.id, cmd: ac.cmd, team: ac.team || 'gold' }); return; }
  if (kind === 'det') { detonateMine(S, w, a, ev); return; }
  if (kind === 'reload') return; // 銃の側で処理
  // ダッシュを入れ直した（手元が、押し直した・スティックを押し込み直した瞬間に送る）: リロードの最中ならやめる。動くより先なので、そのステップから走る
  if (kind === 'sprint') { cancelReload(a, ev); return; }
  if (kind === 'melee') { startMelee(S, w, a, ev); return; }
  if (kind === 'unlockDoor') { if (a.kind === 'sus' || a.kind === 'civ') doorOp(S, w, a, ac.id, 'unlock', ev); return; }
  if (a.down || a.cuffed || a.comply) return;
  if (kind === 'cancel') { if (a.act) { ev.push({ e: 'actcancel', id: a.id, k: a.act.k }); endCuff(S, a.act); a.act = null; } return; }
  if (kind === 'gear') { selectGear(S, a, ac.id, ev); return; }
  if (kind === 'm320') { m320Next(a, ev); return; }
  if (kind === 'long') { selectLong(S, a, ev); return; }
  if (kind === 'peekend') { if (a.peek) endPeek(S, w, a, ev, 'user'); return; }
  if (kind === 'dropcarry') { if (a.carry === 'defuser') { a.carry = null; S.items.push({ id: S.nextItem++, kind: 'defuser', x: a.x, y: a.y + 0.02, z: a.z }); ev.push({ e: 'defdrop', id: a.id }); } return; }
  if (a.act) return;
  if (kind === 'deploy') { startDeploy(S, w, a, ac.id, ev); return; }
  let ctx = null, op = null;
  if (kind === 'use') { ctx = contextOf(S, w, a); if (!ctx) return; op = ctx.def; }
  else if (kind === 'op') {
    ctx = contextOf(S, w, a);
    if (!ctx || ctx.k !== ac.k || ctx.id !== ac.id) {
      // AIは見ていなくても近ければよい
      if (a.pid == null && ac.k === 'door') ctx = { k: 'door', id: ac.id, ops: doorOps(S, w, a, ac.id) };
      else if (a.pid == null && ac.k === 'person') { const b = S.byId[ac.id]; ctx = b ? { k: 'person', id: ac.id, ops: personOps(S, a, b) } : null; }
      else if (a.pid == null && ac.k === 'item') { const it = S.items.find(x => x.id === ac.id); ctx = it ? { k: 'item', id: ac.id, ops: itemOps(S, a, it) } : null; }
      else if (a.pid == null && ac.k === 'site') { const eye = eyeOf(S, a); ctx = siteOps(S, w, a, eye, 0, 0); }
      else if (a.pid == null && ac.k === 'wall') { const kk = ac.id; ctx = { k: 'wall', id: kk, q: ac.q || 1, ops: wallOps(S, w, a, { k: kk, q: ac.q || 1 }) }; }
      else if (a.pid == null && ac.k === 'bar') ctx = { k: 'bar', id: ac.id, ops: barOps(S, w, a, ac.id) };
      else if (a.pid == null && ac.k === 'bomb') { const b = S.m && S.m.bombs && S.m.bombs.find(q => q.id === ac.id && !q.done); ctx = b ? { k: 'bomb', id: b.id, ops: [{ op: 'bombdefuse', t: ACT_T.bombdefuse }], def: null } : null; }
      if (!ctx) return;
      markReach(S, w, a, ctx);
    }
    op = ctx.ops.find(o => o.op === ac.op);
    if (!op) return;
  } else return;
  startOp(S, w, a, ctx, op, ev);
}

// 扉のノブに手を伸ばす時間（開ける・閉める・少し開ける）
const KNOB_T = 0.24;
function startOp(S, w, a, ctx, op, ev) {
  const id = ctx.id;
  if (op.op === 'det') { detonateMine(S, w, a, ev); return; }
  // 手が届かない（離れている・間に物がある）
  if (op.far ?? !reachOK(S, w, a, ctx.k, id, op.op)) {
    // 間に立っているのが AI の味方なら、脇へよけてもらう（RoN の隊員と同じ）。理由はこの動作で調べ直す
    if (op.far != null) reachOK(S, w, a, ctx.k, id, op.op);
    if (REACH_WHY === 'block' && BLOCKER && BLOCKER.ai && BLOCKER.pid == null && !BLOCKER.act && (BLOCKER.team === a.team || (BLOCKER.kind === 'swat' && a.kind === 'swat'))) {
      const tg = actTarget(S, w, a, ctx.k, id, op.op);
      if (tg) BLOCKER.ai.yieldTo = { until: S.t + Math.round(1.1 / S.dt), ax: a.x, az: a.z, tx: tg[0], tz: tg[2] };
    }
    ev.push({ e: 'deny', id: a.id, why: (op.why || REACH_WHY) === 'block' ? 'blocked' : 'far', op: op.op, k: ctx.k });
    return;
  }
  if (op.op === 'pickup') { const it = S.items.find(x => x.id === id); if (it && !it.gone) { it.gone = true; a.carry = 'defuser'; a.gest = { k: 'grab', t: 0, dur: 0.7, tgt: [it.x, it.y + 0.05, it.z] }; ev.push({ e: 'defpick', id: a.id }); } return; }
  const tgt = actTarget(S, w, a, ctx.k, id, op.op);
  // 扉を開ける・閉める: 左手をノブへ伸ばしてから（銃は右手のまま、歩きながらでもよい）
  if (ctx.k === 'door' && (op.t || 0) === 0) {
    a.act = { k: op.op, t: 0, dur: KNOB_T, kind: 'door', id, still: false, noAds: false, x: a.x, z: a.z, gear: null, pose: 'knob', tgt, quick: true };
    return;
  }
  const dur = (op.t || 0.5) * (a.inj.arm && op.op !== 'report' ? 1.2 : 1);
  const still = op.op !== 'report' && op.op !== 'bash';
  a.act = { k: op.op, t: 0, dur, kind: ctx.k, id, still, noAds: true, x: a.x, z: a.z, gear: op.gear || null, pose: ctx.k === 'bar' && op.op === 'bash' ? 'place' : (ACT_POSE[op.op] || null), tgt, chk: 0, hy: ctx.hy ?? null };
  // 立ち位置へ寄る（はじめの少しの間）
  if (still) { const sp = standPoint(S, w, a, ctx.k, id, op.op, tgt); if (sp) { a.act.stand = sp; a.act.alignT = ALIGN_T[op.op] ?? ALIGN_T.def; } }
  // 拘束: 手を上げて立っている人は、ひざをつかせ、背中を向けさせる（その間は動かない）
  if (op.op === 'restrain') {
    const b = S.byId[id];
    if (b && b.alive) {
      if (!b.down && b.comply === 1) { b.comply = 2; b.stateT = 0; }
      b.cuffBy = a.id;
      b.cuffYaw = !b.down && !b.dead ? Math.atan2(b.x - a.x, b.z - a.z) : null;
      b.cuffK = 0;
    }
  }
  ev.push({ e: 'act', id: a.id, k: op.op, dur, tgt: id, kind: ctx.k });
}
function endCuff(S, x) { if (x.k !== 'restrain') return; const b = S.byId[x.id]; if (b) { b.cuffK = 0; if (b.cuffBy != null) { b.cuffBy = null; b.cuffYaw = null; } } }

// 時間のかかる動作の進み
export function stepActs(S, w, dt, ev) {
  for (const a of S.actors) {
    // 投げ物を持っているとき: 引き金で投げる。特殊装備を持っているとき: 引き金で使う
    if (a.ws && a.ws.slot === 2 && a.alive && !a.down) gearInHand(S, w, a, dt, ev);
    if (a.ws && a.ws.slot === 3 && a.alive && !a.down) longInHand(S, w, a, dt, ev);
    if (a.peek) stepPeek(S, w, a, dt, ev);
    if (a.gest) {
      a.gest.t += dt;
      // 押している間（前の 6 割）は、手は動いていく扉の面について行く
      if (a.gest.did != null && a.gest.t < a.gest.dur * 0.6) { const pp = pushPoint(S, w, a, a.gest.did, a.gest.op); if (pp) a.gest.tgt = pp; }
      if (a.gest.t >= a.gest.dur) a.gest = null;
    }
    const x = a.act;
    if (!x) continue;
    const cancel = (why) => { a.act = null; endCuff(S, x); ev.push({ e: 'actcancel', id: a.id, k: x.k, why }); };
    if (!a.alive || a.down || a.stun > 0.3 || a.flash > 0.5) { cancel('state'); continue; }
    // ノブに手を伸ばす（短い）: 届かなくなったらやめる。終わりに扉を動かし、手で押す・引く
    if (x.quick) {
      x.t += dt;
      if (x.t < x.dur) continue;
      a.act = null;
      if (!reachOK(S, w, a, 'door', x.id, x.k, 0.2)) { ev.push({ e: 'deny', id: a.id, why: 'far', op: x.k, k: 'door' }); continue; }
      const r = doorOp(S, w, a, x.id, x.k, ev);
      if (!r.ok && r.why) ev.push({ e: 'deny', id: a.id, why: r.why, d: x.id });
      else a.gest = { k: 'push', t: 0, dur: x.k === 'peek' ? 0.3 : 0.4, tgt: pushPoint(S, w, a, x.id, x.k) || actTarget(S, w, a, 'door', x.id, x.k), did: x.id, op: x.k };
      continue;
    }
    // 立ち位置へ寄る（体ごと少し動き、目標を向く）
    if (x.stand && x.t < x.alignT) {
      const dx = x.stand[0] - a.x, dz = x.stand[1] - a.z, d = Math.hypot(dx, dz);
      if (d > 0.01) { const st = Math.min(d, 2.0 * dt); a.x += dx / d * st; a.z += dz / d * st; }
      x.x = a.x; x.z = a.z;
    }
    // 動いたら中断（AIは止まって行う）
    if (x.still && Math.hypot(a.x - x.x, a.z - x.z) > 0.5) { cancel('moved'); continue; }
    // 拘束: 手は相手の手首を追う。目は相手の腰の後ろ（手首を回してくる所）
    if (x.k === 'restrain') {
      const b = S.byId[x.id];
      if (b) {
        x.tgt = actTarget(S, w, a, 'person', b.id, 'restrain');
        if (b.down || b.dead) x.look = x.tgt;
        else { const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz) || 1; x.look = [b.x + dx / d * 0.14, b.y + (b.comply === 2 || b.cuffed ? 0.72 : 0.95), b.z + dz / d * 0.14]; }
      }
    }
    // 目標から目をそらした（手元が見えない）。拘束は手元を見ていること
    if (x.tgt && x.kind !== 'self') {
      const tx = x.tgt[0] - a.x, tz = x.tgt[2] - a.z;
      const lim = x.k === 'restrain' ? 1.25 : 1.75;
      if (Math.hypot(tx, tz) > 0.3 && x.t > (x.alignT || 0)) { let da = Math.atan2(tx, tz) - a.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) > lim) { cancel('look'); continue; } }
    }
    // ときどき（0.1秒ごと）、まだ手が届くか（離れた・間に物や人が入った）
    if ((x.chk = (x.chk || 0) + 1) % 6 === 0 && x.kind !== 'self' && x.k !== 'report' && !reachOK(S, w, a, x.kind, x.id, x.k, 0.25)) { cancel('reach:' + REACH_WHY); continue; }
    // 相手が離れた・状態が変わった
    if (x.kind === 'person') {
      const b = S.byId[x.id];
      if (!b) { cancel('gone'); continue; }
      if (x.k === 'restrain' && (b.cuffed || !b.alive || (!b.comply && !b.down && b.tased <= 0 && b.stun <= 0 && b.flash <= 0.2))) { cancel('tgt'); continue; }
      if (x.k === 'restrain') { b.cuffK = Math.min(1, x.t / x.dur); b.cuffBy = a.id; }
    }
    x.t += dt;
    if (x.t < x.dur) continue;
    a.act = null;
    endCuff(S, x);
    finishOp(S, w, a, x, ev);
  }
}

function finishOp(S, w, a, x, ev) {
  const k = x.k;
  if (x.kind === 'door') {
    const did = x.id;
    if (k === 'pick' || k === 'lockgun') { doorOp(S, w, a, did, 'unlock', ev); return; }
    // 人が操作するミラー・オプティワンド: 扉の下からのぞく視点に切り替える
    if ((k === 'mirror' && a.pid != null) || k === 'wand') { startPeek(S, w, a, k, ev, did); return; }
    if (k === 'mirror') {
      // 扉の向こうの人と罠を見る
      const d = w.doors[did], side = -sideOf(d, a.x, a.z);
      const seen = [];
      for (const b of S.actors) {
        if (!b.alive || b.isDrone || Math.abs(b.y - d.L * LH) > 1.6) continue;
        const s = (b.x - d.cx) * d.nx + (b.z - d.cz) * d.nz;
        if (s * side <= 0) continue;
        const room = w.roomAt[w.idx(d.L, Math.floor(b.x / CS), Math.floor(b.z / CS))];
        const dist = Math.hypot(b.x - d.cx, b.z - d.cz);
        if (dist > 9) continue;
        seen.push({ id: b.id, kind: b.kind, armed: !!(b.inv.w[0] || b.inv.w[1]), comply: b.comply, dist: +dist.toFixed(1), room });
        if (b.ai) b.ai.mirroredT = S.t;
        b.spot = Math.max(b.spot || 0, 6);
      }
      const ds = S.doors[did];
      if (ds.trap) ds.trapSeen = true;
      ev.push({ e: 'mirror', id: a.id, d: did, seen, trap: !!ds.trap, locked: !!(ds.locked && !ds.lockBroken) });
      return;
    }
    if (k === 'wedge' && x.gear && !useGear(a, 'wedge')) return;
    if (k === 'c2' && !useGear(a, 'c2')) return;
    if (k === 'trap' && !useGear(a, 'claymore')) return;
    if (k === 'bash') { const d = w.doors[did]; if (S.doors[did].bar > 0) bashBar(S, w, d.bar, x.hy ?? d.L * LH + 0.55, ev, a.id); else doorOp(S, w, a, did, 'kick', ev); return; }
    const r = doorOp(S, w, a, did, k, ev);
    if (!r.ok && r.why) ev.push({ e: 'deny', id: a.id, why: r.why, d: did });
    return;
  }
  if (x.kind === 'bar') {
    const s = w.bars[x.id];
    if (!s) return;
    if (k === 'bash') bashBar(S, w, s.id, x.hy ?? (s.y0 + s.y1) / 2, ev, a.id);
    else if (k === 'unbar') clearBar(S, w, s.id, ev, 'pry', a.id);
    else if (k === 'bar' && !(S.bars[s.id] && S.bars[s.id].h)) placeBar(S, w, s.id, ev, a.id);
    return;
  }
  if (x.kind === 'person') {
    const b = S.byId[x.id];
    if (!b) return;
    if (k === 'restrain') {
      b.cuffed = true; b.comply = 2; b.stateT = 0; b.act = null; b.vx = b.vz = 0;
      if (b.inv.w[0] || b.inv.w[1]) dropWeapon(S, b, ev);
      a.stats.arrest += b.kind === 'sus' ? 1 : 0; a.stats.rescue += b.kind === 'civ' ? 1 : 0;
      ev.push({ e: 'cuffed', id: b.id, by: a.id, kind: b.kind, down: b.down });
      return;
    }
    if (k === 'report') { b.reported = true; ev.push({ e: 'report', id: b.id, by: a.id, kind: b.kind, st: b.dead ? 'dead' : b.down ? 'down' : 'cuffed' }); return; }
    if (k === 'revive') { if (b.down && b.alive) { b.down = false; b.dbno = 0; b.hp = 20; b.stateT = 0; b.revivedT = S.t; ev.push({ e: 'revive', id: b.id, by: a.id }); } return; }
  }
  if (x.kind === 'item') {
    const it = S.items.find(q => q.id === x.id);
    if (!it || it.gone) return;
    if (k === 'collect') { it.gone = true; ev.push({ e: 'evidence', id: it.id, by: a.id, kind: it.kind, wid: it.wid || null, ev: it.ev, obj: it.obj || null }); }
    return;
  }
  if (x.kind === 'bomb' && k === 'bombdefuse') { const b = S.m.bombs.find(q => q.id === x.id); if (b && !b.done) { b.done = true; ev.push({ e: 'bombdone', id: b.id, by: a.id }); } return; }
  if (x.kind === 'site') {
    if (k === 'plant' && a.carry === 'defuser') { a.carry = null; S.m.defuser = { planted: true, x: a.x, y: a.y, z: a.z, t: 0, site: x.id, by: a.id }; ev.push({ e: 'plant', id: a.id, site: x.id }); }
    if (k === 'defuse' && S.m.defuser) { S.m.defuser.disabled = true; ev.push({ e: 'disable', id: a.id }); }
    return;
  }
  if (x.kind === 'wall') {
    const kk = x.id;
    if (k === 'reinforce') { if ((S.m.reinfLeft ?? 0) > 0) { S.reinf[kk] = 1; S.m.reinfLeft--; ev.push({ e: 'reinf', k: kk, id: a.id }); } }
    if (k === 'frame' && useGear(a, 'frame')) { S.mines = S.mines || []; S.mines.push({ k: 'frame', owner: a.id, x: (kk % w.W + 0.5) * CS, y: a.y + 1.0, z: (Math.floor(kk / w.W) % w.D + 0.5) * CS, cell: kk }); ev.push({ e: 'frameset', id: a.id }); }
    return;
  }
  if (k === 'deploy') {
    // 置く直前にもう一度場所を確かめる（人が入った・向きを変えた）
    const G = GEAR[x.g], sp = G && depSpot(S, w, a, G.dep);
    if (!sp) { ev.push({ e: 'deny', id: a.id, why: 'dep' + DEP_WHY }); return; }
    if (useGear(a, x.g)) placeDep(S, w, a, G.dep, sp, ev);
    return;
  }
  if (x.kind === 'dep' && k === 'deppick') {
    const d = S.deps && S.deps.find(q => q.id === x.id);
    if (!d || d.team !== a.team) return;
    removeDep(S, d, ev, 'pick', a.id);
    const gid = d.k === 'shield' ? 'dshield' : 'wire', g = a.inv.gear.find(q => q.id === gid);
    if (g) g.n = Math.min((GEAR[gid].max || 9), g.n + 1); else a.inv.gear.push({ id: gid, n: 1 });
    return;
  }
  if (k === 'bandage') {
    if (S.pvp) { a.hp = Math.min(a.maxHp, a.hp + 40); } else { a.hp = Math.max(a.hp, Math.min(a.maxHp, a.maxHp * 0.5)); a.inj.arm = 0; }
    a.bleed = 0;
    ev.push({ e: 'bandaged', id: a.id });
  }
}

// 呼びかけ（警告）。聞こえた人は AI が投降するか決める
export function shout(S, a, ev, line) {
  if ((S.t - (a._shoutT ?? -999)) * S.dt < 0.75) return false;
  a._shoutT = S.t;
  S.shouts.push({ by: a.id, t: S.t, x: a.x, y: a.y, z: a.z, yaw: a.yaw });
  ev.push({ e: 'shout', id: a.id, line: line ?? -1, x: a.x, y: a.y + 1.6, z: a.z });
  return true;
}

function selectGear(S, a, id, ev) {
  const G = GEAR[id];
  if (!G) return;
  const g = a.inv.gear.find(x => x.id === id);
  if (!g || g.n <= 0) { ev.push({ e: 'deny', id: a.id, why: 'nogear' }); return; }
  if (G.kind === 'heal') { if (a.act) return; if (g.n > 0) { g.n--; a.act = { k: 'bandage', t: 0, dur: ACT_T.bandage, kind: 'self', id: a.id, still: false, noAds: true, x: a.x, z: a.z, pose: 'bandage', tgt: null }; ev.push({ e: 'act', id: a.id, k: 'bandage', dur: ACT_T.bandage }); } return; }
  if (G.kind === 'nade' || G.kind === 'spray' || G.kind === 'deploy') {
    // 手に持つ（slot 2）。引き金で投げる・吹きつける・前に置く
    a.ws.gear = id;
    if (a.ws.slot !== 2) switchTo(S, a, 2, ev);
    ev.push({ e: 'gearsel', id: a.id, g: id });
    return;
  }
  // 扉や壁に使う物（C2・ウェッジなど）は、扉を見て「調べる」から使う
  ev.push({ e: 'gearhint', id: a.id, g: id });
}

function gearInHand(S, w, a, dt, ev) {
  const ws = a.ws, inp = a._inp || {};
  if (ws.st !== 'ready' && ws.st !== 'gear') { ws.gearTrig = !!inp.fire; return; }
  ws.st = 'gear';
  const id = ws.gear;
  const g = a.inv.gear.find(x => x.id === id);
  if (!g || g.n <= 0) { switchTo(S, a, ws.prev >= 0 ? ws.prev : 0, ev); ws.st = 'holster'; return; }
  const press = !!inp.fire && !ws.gearTrig;
  ws.gearTrig = !!inp.fire;
  if (!press) return;
  if (GEAR[id].kind === 'nade') {
    g.n--;
    throwNade(S, a, id, inp.power ?? 0.75, ev);
    if (g.n <= 0 || !inp.keepGear) { ws.next = ws.prev >= 0 ? ws.prev : 0; ws.st = 'holster'; ws.t = 0.35; }
  } else if (GEAR[id].kind === 'deploy') {
    startDeploy(S, w, a, id, ev);
  } else if (GEAR[id].kind === 'spray') {
    spray(S, w, a, ev);
    g.n = Math.max(0, g.n - 0); // 本数ではなく回数で管理（6回）
    ws.sprays = (ws.sprays || 0) + 1;
    if (ws.sprays >= (GEAR.spray.uses || 6)) { g.n = 0; ws.next = ws.prev >= 0 ? ws.prev : 0; ws.st = 'holster'; ws.t = 0.3; }
  }
}

// 置く（置ける盾・有刺鉄線）: ひざをついて前の床に置く。置ける所でなければ理由を知らせる
function startDeploy(S, w, a, id, ev) {
  const G = GEAR[id];
  if (!G || G.kind !== 'deploy' || a.act || a.down || a.cuffed) return;
  if (gearN(a, id) <= 0) { ev.push({ e: 'deny', id: a.id, why: 'nogear' }); return; }
  const sp = depSpot(S, w, a, G.dep);
  if (!sp) { ev.push({ e: 'deny', id: a.id, why: 'dep' + DEP_WHY }); return; }
  const dur = G.place * (a.inj.arm ? 1.2 : 1);
  a.act = { k: 'deploy', t: 0, dur, kind: 'self', id: a.id, still: true, noAds: true, x: a.x, z: a.z, pose: 'kneel', tgt: [sp.x, sp.y + 0.3, sp.z], g: id };
  ev.push({ e: 'act', id: a.id, k: 'deploy', dur, g: id });
}

function spray(S, w, a, ev) {
  ev.push({ e: 'spray', id: a.id });
  const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
  for (const b of S.actors) {
    if (b.id === a.id || !b.alive || b.isDrone) continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d > 3.2 || Math.abs(b.y - a.y) > 1) continue;
    if ((dx * fx + dz * fz) / Math.max(0.01, d) < 0.85) continue;
    if (b.armor && b.armor.head === 'gasmask') continue;
    b.stun = Math.max(b.stun, 3.5); b.gas = Math.max(b.gas, 5);
    if (b.ai && b.ai.morale != null) b.ai.morale -= 0.6;
    S.harms.push({ t: S.t, by: a.id, tgt: b.id, how: 'less', d: 0, part: 'head', kind: b.kind, threat: b.ai ? (S.t - (b.ai.threatT ?? -1e9)) * S.dt < 2 : false, warned: b.ai ? b.ai.warned || 0 : 0, armed: !!(b.inv.w[0] || b.inv.w[1]), comply: b.comply, cuffed: b.cuffed, down: b.down });
    ev.push({ e: 'sprayed', id: b.id, by: a.id });
  }
}

// ---- 特殊装備
// 装備の切り替えから選ぶ: 盾は副武器と一緒に構える。ほかは手に持つ（slot 3）。もう一度選ぶと銃に戻す
function selectLong(S, a, ev) {
  const L = a.inv.long, ws = a.ws;
  if (!L || L === 'none' || !LONG[L]) { ev.push({ e: 'deny', id: a.id, why: 'nolong' }); return; }
  if (L === 'shield') {
    if (ws.slot === 1 && ws.st !== 'holster') { if (a.inv.w[0]) switchTo(S, a, 0, ev); }
    else if (a.inv.w[1]) switchTo(S, a, 1, ev);
    ev.push({ e: 'longsel', id: a.id, k: L, on: ws.next === 1 || (ws.slot === 1 && ws.st !== 'holster') });
    return;
  }
  if (!HAND_LONG[L]) return;
  if (ws.slot === 3 && ws.st !== 'holster') { switchTo(S, a, ws.prev >= 0 && a.inv.w[ws.prev] ? ws.prev : (a.inv.w[0] ? 0 : 1), ev); return; }
  if (switchTo(S, a, 3, ev)) ev.push({ e: 'longsel', id: a.id, k: L, on: true });
}

// 手に持った特殊装備: 引き金で使う
function longInHand(S, w, a, dt, ev) {
  const ws = a.ws, inp = a._inp || {}, L = a.inv.long;
  if (!HAND_LONG[L]) { switchTo(S, a, a.inv.w[0] ? 0 : 1, ev); return; }
  if (ws.st !== 'ready' && ws.st !== 'long') { ws.longTrig = !!inp.fire; return; }
  ws.st = 'long';
  if (ws.lt > 0) {
    ws.lt -= dt;
    if (ws.lt <= 0) { ws.lt = 0; ev.push({ e: 'reloaded', id: a.id }); }
  }
  const press = !!inp.fire && !ws.longTrig;
  ws.longTrig = !!inp.fire;
  if (!press || ws.lt > 0 || a.act || a.peek || a.sprint || a.vault) return;
  if (L === 'm320') {
    const m = a.inv.m320;
    if (!m) return;
    if (!(m[m.sel] > 0)) m320Next(a, null);
    if (!(m[m.sel] > 0)) { ev.push({ e: 'dry', id: a.id }); ev.push({ e: 'deny', id: a.id, why: 'noammo' }); return; }
    m[m.sel]--;
    launchNade(S, a, m.sel, ev);
    a.fireK = 1;
    // 1発ずつ込める（中折れ）。弾が残っていれば自動で込める
    const left = m.flash + m.stinger + m.cs;
    if (!(m[m.sel] > 0)) m320Next(a, null);
    if (left > 0) { ws.lt = LONG.m320.reload || 2.6; ws.rd = ws.lt; ev.push({ e: 'reload', id: a.id, k: 'break', dur: ws.lt, long: 1 }); }
    return;
  }
  if (L === 'wand') {
    // 扉を見ていれば扉の下から、そうでなければ手を伸ばして角の先を
    const c = contextOf(S, w, a);
    if (c && c.k === 'door') { const op = c.ops.find(o => o.op === 'wand'); if (op) { startOp(S, w, a, c, op, ev); return; } }
    startPeek(S, w, a, 'wand', ev, -1);
    return;
  }
  if (L === 'ram' || L === 'breacher') {
    const c = contextOf(S, w, a);
    const want = L === 'ram' ? 'ram' : 'breach';
    if (c && c.k === 'door') { const op = c.ops.find(o => o.op === want); if (op) { startOp(S, w, a, c, op, ev); return; } }
    ev.push({ e: 'deny', id: a.id, why: 'needdoor' });
  }
}

// ---- のぞく（ミラー・オプティワンド）: 扉の下や角の先にカメラを置く。見回すのは画面の側（体は動かない）
export const PEEK = { mirror: { fov: 64, max: 1.25, time: 15 }, wand: { fov: 78, max: 1.6, time: 25 } };
function startPeek(S, w, a, k, ev, did) {
  let x, y, z, yaw0;
  if (did >= 0) {
    const d = w.doors[did], side = -sideOf(d, a.x, a.z);
    // 扉の下から少し差し込む（振り返ると扉の枠と罠が見える）
    const off = (d.th || 0.12) / 2 + 0.16;
    x = d.cx + d.nx * side * off; z = d.cz + d.nz * side * off; y = d.L * LH + 0.06;
    yaw0 = Math.atan2(d.nx * side, d.nz * side);
  } else {
    // 目の高さから少し下、前へ最大 0.6m（壁の手前で止める）
    const e = eyeOf(S, a), fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    const y0 = e[1] - 0.12;
    const hits = raycast(w, e[0], y0, e[2], fx, 0, fz, 0.75, S.doors, _rc);
    let L = 0.6;
    for (const h of hits) { if (h.mat === M.GLASSBROKEN) continue; L = Math.max(0.05, Math.min(L, h.t0 - 0.12)); break; }
    x = e[0] + fx * L; y = y0; z = e[2] + fz * L; yaw0 = a.yaw;
  }
  const P = PEEK[k];
  a.peek = { k, x, y, z, yaw0, door: did, t: 0, max: P.max, fov: P.fov, ax: a.x, az: a.z, spotT: 0, seen: [] };
  peekSpot(S, w, a);
  ev.push({ e: 'peek', id: a.id, k, x, y, z, yaw0, door: did, max: P.max, fov: P.fov, trap: did >= 0 && !!S.doors[did].trap, locked: did >= 0 && !!(S.doors[did].locked && !S.doors[did].lockBroken) });
}
// カメラから見える人（見回せる範囲・10m以内）。見えた人は気づかれやすくなる
function peekSpot(S, w, a) {
  const P = a.peek;
  const seen = [];
  for (const b of S.actors) {
    if (b === a || !b.alive || b.isDrone) continue;
    const dx = b.x - P.x, dz = b.z - P.z, d = Math.hypot(dx, dz);
    if (d > 10 || Math.abs(b.y - (P.y - 0.06)) > 2.2) continue;
    let da = Math.atan2(dx, dz) - P.yaw0; da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > P.max + 0.6) continue;
    if (!los(w, P.x, P.y, P.z, b.x, b.y + 0.9, b.z, S.doors) && !los(w, P.x, P.y, P.z, b.x, b.y + 0.25, b.z, S.doors)) continue;
    seen.push(b.id);
    if (b.ai) b.ai.mirroredT = S.t;
    b.spot = Math.max(b.spot || 0, 6);
  }
  P.seen = seen;
  if (P.door >= 0) { const ds = S.doors[P.door]; if (ds.trap) ds.trapSeen = true; }
}
function stepPeek(S, w, a, dt, ev) {
  const P = a.peek;
  P.t += dt;
  const moved = Math.hypot(a.x - P.ax, a.z - P.az) > 0.35;
  const hurtNow = !a.alive || a.down || a.stun > 0.3 || a.flash > 0.5 || a.flinch > 0.6;
  const dropped = P.k === 'wand' && P.door < 0 && a.ws.slot !== 3;
  if (moved || hurtNow || dropped || a.act || P.t > PEEK[P.k].time) { endPeek(S, w, a, ev, moved ? 'move' : hurtNow ? 'hurt' : 'time'); return; }
  P.spotT -= dt;
  if (P.spotT <= 0) { P.spotT = 0.4; peekSpot(S, w, a); }
}
function endPeek(S, w, a, ev, why) {
  const P = a.peek;
  if (!P) return;
  a.peek = null;
  ev.push({ e: 'peekend', id: a.id, k: P.k, why, n: P.seen.length });
}

// 仕掛けたC2・壁の爆破薬を起爆
function detonateMine(S, w, a, ev) {
  let any = false;
  for (let i = 0; i < w.doors.length; i++) { const ds = S.doors[i]; if (ds.c2 && ds.c2.owner === a.id) { detonateC2(S, w, i, ev); any = true; } }
  if (S.mines) for (let i = S.mines.length - 1; i >= 0; i--) { const m = S.mines[i]; if (m.owner !== a.id) continue; S.mines.splice(i, 1); S.blasts.push({ x: m.x, y: m.y, z: m.z, r: 3.0, dmg: 120, kind: 'frame', by: a.id, t: 0 }); any = true; }
  if (!any) ev.push({ e: 'deny', id: a.id, why: 'nodet' });
}
export { launchNade };
