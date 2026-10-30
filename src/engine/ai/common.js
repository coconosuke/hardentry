// AIの共通の道具: 見る（明るさ・視野・見通し）、聞く、経路に沿って歩く（扉を開ける）、狙う（反応の遅れ・ぶれ・反動の抑え）
import { occluded, CS, LH, levelOfY, groundAt } from '../world.js';
import { findPath, smoothPath, navCell, cellCenter, buildNav, leafCells } from './nav.js';
import { eyeOf } from '../combat.js';
import { curW, curWeapon, ammoCount } from '../actor.js';
import { hrand, rnd } from '../rng.js';
import { isOpen, isClosed, sideOf } from '../doors.js';

export const TAU = Math.PI * 2;
export const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
export const yawTo = (dx, dz) => Math.atan2(dx, dz);
export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const dist3 = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * 1.5, a.z - b.z);

// 難しさごとの腕前（反応の秒・狙いのぶれの度・回る速さ度/秒・反動を抑える割合）
export const SKILL = {
  easy: { react: [0.55, 0.95], err: 7, turn: 220, comp: 0.45, burst: [2, 5] },
  normal: { react: [0.45, 0.8], err: 5.5, turn: 260, comp: 0.55, burst: [3, 6] },
  hard: { react: [0.3, 0.6], err: 4, turn: 320, comp: 0.7, burst: [3, 7] },
  hardcore: { react: [0.25, 0.5], err: 3.2, turn: 360, comp: 0.75, burst: [3, 8] },
  swat: { react: [0.22, 0.4], err: 2.4, turn: 420, comp: 0.85, burst: [2, 4] },
  bot1: { react: [0.5, 0.9], err: 6, turn: 240, comp: 0.5, burst: [3, 6] },
  bot2: { react: [0.35, 0.65], err: 4.2, turn: 300, comp: 0.65, burst: [3, 7] },
  bot3: { react: [0.22, 0.45], err: 2.8, turn: 380, comp: 0.8, burst: [4, 8] },
};

export function baseInput(a) {
  return { mx: 0, mz: 0, yaw: a.yaw, pitch: a.pitch, fire: false, ads: false, low: false, stance: a.stance | 0, lean: 0, sprint: false, act: null };
}
export function pushAct(inp, ac) { (inp.act || (inp.act = [])).push(ac); }

// その場所の明るさ（光の格子から作った表。0..2）
export function brightCell(w, x, y, z) {
  const b = w._bright;
  if (!b) return 0.6;
  const i = Math.floor(x / CS), j = Math.floor(z / CS);
  if (i < 0 || j < 0 || i >= w.W || j >= w.D) return 0.6;
  const L = Math.max(0, Math.min(w.NL - 1, Math.floor((y + 0.4) / LH)));
  return b[w.idx(L, i, j)];
}

// a から b が見えるか（そのときの見えやすさ 0..1。0は見えない）
export function visibility(S, w, a, b, opt = {}) {
  if (!b.alive && !opt.dead) return 0;
  const e = eyeOf(S, a);
  const bx = b.x, bz = b.z, by = b.y + (b.down || b.dead ? 0.25 : b.st > 1.5 ? 0.3 : b.st > 0.5 ? 0.95 : 1.35);
  const dx = bx - e[0], dy = by - e[1], dz = bz - e[2];
  const d = Math.hypot(dx, dy, dz);
  const maxD = opt.maxD || 45;
  if (d > maxD) return 0;
  // 視野
  const fov = (opt.fov || 75) * Math.PI / 180;
  const ang = Math.abs(angDiff(yawTo(dx, dz), a.yaw));
  if (ang > fov && d > 1.8) return 0;
  // 見通し（胸と頭）
  const blocked1 = occluded(w, e[0], e[1], e[2], bx, by, bz, S.doors, true);
  if (blocked1) {
    const hy = b.y + (b.st > 1.5 ? 0.45 : b.st > 0.5 ? 1.15 : 1.65);
    if (occluded(w, e[0], e[1], e[2], bx, hy, bz, S.doors, true)) return 0;
  }
  // 明るさ: 暗いと見えにくい（ライトや暗視があれば別）
  let L = Math.min(1, brightCell(w, bx, b.y + 1, bz) * 2.2);
  if (b.light) L = Math.max(L, 0.95); // 自分のライトで目立つ
  if (a.light && ang < 0.35 && d < 18) L = Math.max(L, 0.9); // ライトで照らしている
  if (a.nvg || (a.armor && a.armor.head === 'nvg' && a.nvgOn)) L = Math.max(L, 0.85);
  if (b.fireK > 0.3) L = 1; // 撃った光
  let v = Math.max(0.12, L);
  // 姿勢・動き・距離・視野の端
  v *= b.st > 1.5 ? 0.45 : b.st > 0.5 ? 0.75 : 1;
  v *= b.spd > 1.0 ? 1.15 : 1;
  v *= d < 6 ? 1 : d < 20 ? 0.85 : 0.6;
  v *= ang < 0.5 ? 1 : 0.7;
  if (a.flash > 0.4) v *= 0.05;
  if (a.gas > 0 && !(a.armor && a.armor.head === 'gasmask')) v *= 0.6;
  return Math.min(1, v);
}

// 見つける度合いを貯める（見えている間）。戻り値: 見つけたか
export function detect(S, a, b, vis, dt) {
  const mem = a.ai.seen || (a.ai.seen = {});
  let m = mem[b.id];
  if (!m) m = mem[b.id] = { det: 0, t: -1e9, x: b.x, y: b.y, z: b.z };
  if (vis > 0) {
    const rate = a.ai.alert ? 6 : 3;
    m.det = Math.min(1.2, m.det + vis * rate * dt);
    if (m.det >= 1) { m.t = S.t; m.x = b.x; m.y = b.y; m.z = b.z; return true; }
  } else {
    m.det = Math.max(0, m.det - dt * 0.25);
  }
  return false;
}
export function lastSeen(S, a, id) { const m = a.ai.seen && a.ai.seen[id]; return m && m.t > -1e8 ? m : null; }
export function seenAgo(S, a, id) { const m = lastSeen(S, a, id); return m ? (S.t - m.t) * S.dt : 1e9; }

// ---- 経路に沿って歩く。戻り値: 'moving' | 'arrived' | 'blocked' | 'door'
// a.ai.nav = { tk: 目的のマス, path: [...], i, t: 作った時刻, stuck }
export function goTo(S, w, a, inp, tx, ty, tz, o = {}) {
  const ai = a.ai;
  const tk = navCell(w, tx, ty, tz);
  if (tk < 0) return 'blocked';
  const here = navCell(w, a.x, a.y, a.z);
  let nv = ai.nav;
  const arriveR = o.r ?? 0.45;
  // 隊員は鍵のかかった扉を蹴って通る（移動・追従・捜索のとき。突入の命令は扉の操作を自分でする）
  const kick = o.kick ?? (a.kind === 'swat' && !o.noDoors);
  if (Math.hypot(tx - a.x, tz - a.z) < arriveR && Math.abs(levelOfY(ty + 0.3) - levelOfY(a.y + 0.3)) === 0) { ai.nav = null; return 'arrived'; }
  if (!nv || nv.tk !== tk || (S.t - nv.t) * S.dt > 6 || nv.bad) {
    const lc = leafCells(w, S);
    const p = findPath(w, S, here, tk, { unlock: !!(o.unlock || kick), wedgeOK: false, breakBar: !!o.breakBar, avoid: o.avoid, leaf: lc });
    if (!p) {
      // 開いた扉の板が通り道をふさいでいるだけなら、その扉を向こうへ押し開ける（板の陰の袋小路から出る）
      const p2 = lc && lc.size ? findPath(w, S, here, tk, { unlock: !!(o.unlock || kick), wedgeOK: false, breakBar: !!o.breakBar, avoid: o.avoid }) : null;
      if (p2 && !o.noDoors) {
        let bd = 2.6, best = -1;
        for (let i = 0; i < w.doors.length; i++) {
          const d = w.doors[i], ds = S.doors[i];
          if (!ds || ds.broken || !isOpen(ds) || d.L !== levelOfY(a.y + 0.3)) continue;
          const dd = Math.hypot(d.cx - a.x, d.cz - a.z);
          if (dd < bd && p2.slice(0, 12).some(k => w.doorAt[k] === i || lc.has(k))) { bd = dd; best = i; }
        }
        if (best < 0) for (let i = 0; i < w.doors.length; i++) { const d = w.doors[i], ds = S.doors[i]; if (!ds || ds.broken || !isOpen(ds) || d.L !== levelOfY(a.y + 0.3)) continue; const dd = Math.hypot(d.cx - a.x, d.cz - a.z); if (dd < bd) { bd = dd; best = i; } }
        if (best >= 0) {
          const d = w.doors[best];
          steerToward(a, inp, d.cx, d.cz, 0);
          if (!ai.doorT || (S.t - ai.doorT) * S.dt > 1.2) { ai.doorT = S.t; pushAct(inp, { a: 'op', k: 'door', id: best, op: 'close' }); }
          ai.nav = { tk, path: [], i: 0, t: S.t, bad: false, fail: true, soft: true };
          return 'door';
        }
      }
      ai.nav = { tk, path: [], i: 0, t: S.t, bad: false, fail: true };
      return 'blocked';
    }
    const sp = smoothPath(w, here, p);
    nv = ai.nav = { tk, path: sp, i: 0, t: S.t, bad: false, stuck: 0, lx: a.x, lz: a.z };
  }
  if (nv.fail) { if ((S.t - nv.t) * S.dt > (nv.soft ? 0.6 : 1.5)) ai.nav = null; return nv.soft ? 'door' : 'blocked'; }
  // 次の点
  while (nv.i < nv.path.length) {
    const c = cellCenter(w, nv.path[nv.i]);
    const last = nv.i === nv.path.length - 1;
    const dd = Math.hypot(c[0] - a.x, c[2] - a.z);
    if (dd < (last ? arriveR * 0.9 : 0.42) && Math.abs(c[1] - a.y) < 1.2) nv.i++;
    else break;
  }
  let px, pz, py;
  if (nv.i >= nv.path.length) { px = tx; pz = tz; py = ty; }
  else { const c = cellCenter(w, nv.path[nv.i]); px = c[0]; py = c[1]; pz = c[2]; }
  // 扉: 次のマスが閉じた扉なら開ける
  const nk = nv.i < nv.path.length ? nv.path[nv.i] : tk;
  const did = w.doorAt[nk];
  if (did >= 0) {
    const ds = S.doors[did];
    if (ds && !ds.broken && !isOpen(ds)) {
      const d = w.doors[did];
      const dd = Math.hypot(d.cx - a.x, d.cz - a.z);
      if (dd < 1.7) {
        steerToward(a, inp, d.cx, d.cz, 0);
        if (o.noDoors) return 'door';
        // バリケード（対戦）: 壊して通る
        if (ds.bar > 0 && o.breakBar) {
          if (!ai.doorT || (S.t - ai.doorT) * S.dt > 0.7) { ai.doorT = S.t; pushAct(inp, { a: 'op', k: 'door', id: did, op: 'bash' }); }
          return 'door';
        }
        if (!ai.doorT || (S.t - ai.doorT) * S.dt > 1.2) {
          ai.doorT = S.t;
          if (ds.locked && !ds.lockBroken && o.unlock) pushAct(inp, { a: 'unlockDoor', id: did });
          pushAct(inp, { a: 'op', k: 'door', id: did, op: ds.locked && !ds.lockBroken && kick ? 'kick' : 'open' });
        }
        if (ds.wedge || ds.bar > 0 || (ds.locked && !ds.lockBroken && !o.unlock && !kick)) { nv.bad = true; return 'door'; }
        return 'door';
      }
    }
  }
  // 詰まり（動けない）
  const moved = Math.hypot(a.x - nv.lx, a.z - nv.lz);
  if (moved < 0.02) { nv.stuck = (nv.stuck || 0) + S.dt; } else nv.stuck = Math.max(0, (nv.stuck || 0) - S.dt * 2);
  nv.lx = a.x; nv.lz = a.z;
  if (nv.stuck > 1.2) { nv.bad = true; nv.stuck = 0; ai.unstick = { until: S.t + Math.round(0.6 / S.dt), dir: ((a.id + S.t) & 1) ? 1 : -1 }; }
  const spd = o.speed ?? 1;
  // 詰まったら少し横へずれてから進み直す（扉の板・家具の角・人に引っかかったとき）
  if (ai.unstick && S.t < ai.unstick.until) {
    const dx = px - a.x, dz = pz - a.z, l = Math.hypot(dx, dz) || 1;
    steerToward(a, inp, a.x - dz / l * ai.unstick.dir * 2 - dx / l * 0.5, a.z + dx / l * ai.unstick.dir * 2 - dz / l * 0.5, spd, false);
    return 'moving';
  }
  steerToward(a, inp, px, pz, spd, o.faceMove !== false && o.look == null);
  return 'moving';
}
// 世界の向きの移動を、体の向き（yaw）に対する mx/mz にする
export function steerToward(a, inp, x, z, spd = 1, face = false) {
  const dx = x - a.x, dz = z - a.z, L = Math.hypot(dx, dz);
  if (L < 1e-3 || spd <= 0) { inp.mx = 0; inp.mz = 0; return; }
  const ux = dx / L, uz = dz / L;
  const yaw = face ? yawTo(dx, dz) : inp.yaw;
  if (face) inp.yaw = turnToward(a.yaw, yaw, 9 * Math.PI / 180 * 2);
  const sy = Math.sin(inp.yaw), cy = Math.cos(inp.yaw);
  // 前 = (sy, cy)、右 = (-cy, sy)
  const fwd = ux * sy + uz * cy, right = ux * -cy + uz * sy;
  const k = Math.min(1, L / 0.35) * spd;
  inp.mz = fwd * k; inp.mx = right * k;
}
export function turnToward(cur, want, maxStep) {
  const d = angDiff(want, cur);
  if (Math.abs(d) <= maxStep) return want;
  return cur + Math.sign(d) * maxStep;
}

// 狙う: 目標の点へ。反応の遅れのあとで、ぶれ（だんだん小さくなる）を足す。反動を抑える
export function aimAt(S, a, inp, tx, ty, tz, sk, dt, o = {}) {
  const e = eyeOf(S, a);
  const dx = tx - e[0], dy = ty - e[1], dz = tz - e[2];
  const h = Math.hypot(dx, dz);
  let wantYaw = yawTo(dx, dz), wantPitch = Math.atan2(dy, h);
  const ai = a.ai;
  // ぶれ: 目標が変わったら大きく、狙い続けると小さく
  if (ai.aimId !== o.id) { ai.aimId = o.id; ai.aimErr = (sk.err * (0.7 + 0.6 * hrand(a.id, S.t, 31))) * Math.PI / 180; ai.aimT = 0; ai.aimDir = hrand(a.id, S.t, 32) * TAU; }
  ai.aimT = (ai.aimT || 0) + dt;
  const settle = Math.exp(-ai.aimT * 1.6);
  let err = (ai.aimErr || 0) * (0.25 + 0.75 * settle) * (1 + (a.supp || 0) * 1.2) * (a.stun > 0 ? 2.5 : 1) * (o.errMul || 1);
  // 距離が遠いと難しい（角度は小さくなるので少しだけ）
  err *= h > 15 ? 0.8 : 1;
  const wob = ai.aimDir + ai.aimT * 0.9;
  wantYaw += Math.cos(wob) * err; wantPitch += Math.sin(wob) * err * 0.6;
  // 反動を抑える（AIの入力の向きに、反動の逆を足す）
  const W = curW(a);
  if (W) { wantPitch -= (a.ws.rp * Math.PI / 180) * sk.comp; wantYaw -= (a.ws.ry * Math.PI / 180) * sk.comp; }
  const step = sk.turn * Math.PI / 180 * dt * (a.stun > 0 ? 0.3 : 1);
  inp.yaw = turnToward(a.yaw, wantYaw, step);
  inp.pitch = a.pitch + Math.max(-step, Math.min(step, wantPitch - a.pitch));
  return Math.abs(angDiff(inp.yaw, wantYaw)) + Math.abs(inp.pitch - wantPitch);
}

// 撃つかどうか（連射の区切り・単発の間隔）
export function trigger(S, a, inp, sk, onTarget) {
  const ai = a.ai, W = curW(a), wi = curWeapon(a);
  if (!W || !wi) return;
  const [inMag] = ammoCount(wi);
  if (inMag <= 0) { if (a.ws.st === 'ready') pushAct(inp, { a: 'reload' }); return; }
  if (!onTarget) { ai.burst = 0; return; }
  const mode = W.modes[wi.mode] || 'semi';
  if (mode === 'auto') {
    if (!ai.burst) { ai.burst = Math.round(sk.burst[0] + (sk.burst[1] - sk.burst[0]) * hrand(a.id, S.t, 41)); ai.burstN = a.stats.sh; ai.burstGap = 0; }
    if (a.stats.sh - ai.burstN >= ai.burst) {
      ai.burstGap = (ai.burstGap || 0) + S.dt;
      if (ai.burstGap > 0.18 + 0.25 * hrand(a.id, S.t, 42)) { ai.burst = 0; }
      return;
    }
    inp.fire = true;
  } else {
    // 単発: 押して離す
    ai.semiT = (ai.semiT || 0) + S.dt;
    const gap = W.cat === 'shotgun' ? 0.45 : W.cat === 'pistol' ? 0.22 : 0.18;
    if (ai.semiT > gap) { inp.fire = true; ai.semiT = 0; }
  }
}

// 聞こえた音（前のステップの出来事から）: S.heard = [{x,y,z,k,loud,id}]
export function hearNearest(S, w, a, range = 25, filter = null) {
  let best = null, bd = 1e9;
  for (const h of S.heard || []) {
    if (h.id === a.id) continue;
    if (filter && !filter(h)) continue;
    const d = Math.hypot(h.x - a.x, (h.y - a.y) * 2, h.z - a.z);
    const R = range * h.loud;
    if (d > R) continue;
    // 階が違うと聞こえにくい
    const sc = d / R;
    if (sc < bd) { bd = sc; best = h; }
  }
  return best;
}

// 部屋の中のランダムな床のマス（隠れ場所・見回り）
export function randomCellInRoom(S, w, room, k) {
  const r = w.rooms[room];
  if (!r || !r.cells.length) return null;
  const nav = buildNav(w);
  for (let t = 0; t < 12; t++) {
    const c = r.cells[Math.floor(hrand(room, S.t + t * 7, k) * r.cells.length)];
    if (nav.walk[c] === 1) return cellCenter(w, c);
  }
  return null;
}
export function roomAtPos(w, x, y, z) {
  const i = Math.floor(x / CS), j = Math.floor(z / CS);
  if (i < 0 || j < 0 || i >= w.W || j >= w.D) return -1;
  const L = Math.max(0, Math.min(w.NL - 1, Math.floor((y + 0.4) / LH)));
  return w.roomAt[w.idx(L, i, j)];
}
// 相手が自分を狙っているか（銃口の向き）
export function aimingAt(a, b, cone = 0.22) {
  if (!a.alive || a.down) return false;
  const dx = b.x - a.x, dz = b.z - a.z;
  return Math.abs(angDiff(yawTo(dx, dz), a.yaw)) < cone && Math.hypot(dx, dz) < 30;
}
export function canFight(a) { return a.alive && !a.down && !a.cuffed && !a.comply && a.tased <= 0; }
export function hasGun(a) { return !!(a.inv.w[0] || a.inv.w[1]); }
