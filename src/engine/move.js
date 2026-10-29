// 移動: RoN の速さ（歩き2.4・ゆっくり0.96・しゃがみ1.2）、しゃがみ・伏せ・リーン・乗り越え・階段・PvPのダッシュ
import { groundAt, pushOut, raycast, STEP, CS, LH, levelOfY, cellType, C } from './world.js';
import { curW, bodyHeight } from './actor.js';
import { PLATE, LONG } from './data/equipment.js';
import { FLOORS } from './data/materials.js';

export const SPEED = { walk: 2.4, crouch: 1.2, prone: 0.45, low: 1.2, ads: 0.7, sprint: 4.6, back: 0.8, side: 0.9 };
export const RADIUS = 0.28;
const _po = [0, 0, 0];
const _rc = { out: [], seenProp: new Set(), seenDoor: new Set() };

// PvPの防具の重さ（R6の3段階）
export const PVP_ARMOR = { light: { hp: 100, speed: 1.08 }, medium: { hp: 110, speed: 1.0 }, heavy: { hp: 125, speed: 0.9 } };

export function maxSpeed(S, a, inp) {
  const st = Math.round(a.st);
  let v = st === 0 ? SPEED.walk : st === 1 ? SPEED.crouch : SPEED.prone;
  const W = curW(a);
  if (W) v *= W.move;
  if (a.inv.long && LONG[a.inv.long] && LONG[a.inv.long].move) v *= LONG[a.inv.long].move;
  if (a.lowOn && a.ads < 0.2 && st < 2) v *= 1 + (SPEED.low - 1) * a.low;
  if (a.ads > 0.3) v *= 1 - (1 - SPEED.ads) * a.ads;
  if (a.sprint) v = SPEED.sprint * (W ? Math.min(1, W.move + 0.03) : 1);
  if (S.pvp) v *= (PVP_ARMOR[a.pvpArmor || 'medium'] || PVP_ARMOR.medium).speed;
  else { const P = PLATE[a.armor.plate]; if (P && a.armor.vest !== 'none') v *= P.speed; }
  v *= 1 - 0.025 * Math.min(4, a.inj.leg);
  if (a.bleed > 0) v *= 0.8;
  if (a.stun > 0 || a.flash > 0.5) v *= 0.45;
  if (a.gas > 0 && !(a.armor.head === 'gasmask')) v *= 0.7;
  if (a.comply === 1) v = Math.min(v, 0.9);
  if (a.comply === 2 || a.cuffed || a.down || a.dead || a.tased > 0) v = a.down && S.pvp && a.dbno ? 0.35 : 0;
  if (a.act && a.act.still) v = 0;
  return v;
}

function accelOf(S, a) {
  let ac = 7.0;
  if (!S.pvp && a.armor.vest !== 'none') { const P = PLATE[a.armor.plate]; const n = a.armor.vest === 'heavy' ? 2 : 1; ac *= 1 - (P ? P.accel : 0) * n * 0.6; }
  return ac;
}

// 1人を1ステップ動かす。inp: {mx,mz,yaw,pitch,stance,lean,sprint}
export function moveActor(S, w, a, inp, dt, ev) {
  if (!a.alive && !a.dead) return;
  // 向き（死んでいたら動かない）
  if (!a.dead && !a.tased && !(a.down && !S.pvp)) {
    a.yaw = inp.yaw; a.pitch = Math.max(-1.45, Math.min(1.45, inp.pitch));
  }
  if (a.dead) { settle(S, w, a, dt); a.stateT += dt; return; }
  // 姿勢
  let want = inp.stance | 0;
  if (a.down || a.cuffed || a.comply === 2) want = 0;
  if (a.sprint && want) a.sprint = false;
  const rate = (a.st < 1 && want <= 1) || (a.st <= 1 && want === 0) ? 4.0 : 1.25;
  if (want !== Math.round(a.st) || Math.abs(a.st - want) > 1e-3) {
    // 立ち上がる前に頭がつかえないか
    const target = want;
    if (target < a.st) {
      const hNew = target < 1 ? 1.8 - 0.6 * target : 1.2 - 0.7 * (target - 1);
      pushOut(w, a.x, a.z, a.y + STEP, a.y + hNew, RADIUS - 0.02, S.doors, -1, _po);
      if (_po[2] && (Math.abs(_po[0]) + Math.abs(_po[1])) > 0.12) want = Math.round(a.st);
    }
    const d = want - a.st, stp = rate * dt;
    a.st = Math.abs(d) <= stp ? want : a.st + Math.sign(d) * stp;
  }
  a.stance = want;
  // リーン（壁にめり込まない）
  let lw = inp.lean || 0;
  if (a.sprint || a.st > 1.3 || a.vault || a.down || a.comply || a.cuffed) lw = 0;
  if (lw) {
    const rx = -Math.cos(a.yaw) * lw, rz = Math.sin(a.yaw) * lw;
    const hy = a.y + bodyHeight(a) - 0.25;
    const hits = raycast(w, a.x, hy, a.z, rx, 0, rz, 0.65, S.doors, _rc);
    let lim = 1;
    for (const h of hits) { if (h.kind === 'prop' && h.t0 > 0.6) continue; lim = Math.max(0, Math.min(1, (h.t0 - 0.22) / 0.36)); break; }
    lw *= lim;
  }
  const ld = lw - a.lean, ls = 4.2 * dt;
  a.lean = Math.abs(ld) <= ls ? lw : a.lean + Math.sign(ld) * ls;
  // 乗り越え中
  if (a.vault) { stepVault(S, w, a, dt); a.stateT += dt; return; }
  // 速さ
  let mx = inp.mx || 0, mz = inp.mz || 0;
  let mag = Math.hypot(mx, mz); if (mag > 1) { mx /= mag; mz /= mag; mag = 1; }
  // ダッシュ（PvPだけ。立って前へ）
  a.sprint = !!(S.pvp && inp.sprint && a.st < 0.2 && mz > 0.55 && !a.adsOn && !a.down && !a.act);
  const vmax = maxSpeed(S, a, inp);
  // 後ろ・横は遅い
  let dirMul = 1;
  if (mag > 0.01) { const fz = mz / mag, fx = mx / mag; dirMul = fz >= 0 ? 1 - (1 - SPEED.side) * Math.abs(fx) : SPEED.back + (SPEED.side - SPEED.back) * Math.abs(fx); }
  const tgt = vmax * mag * dirMul;
  // ローカル → 世界（前 = (sin yaw, cos yaw)、右 = (-cos yaw, sin yaw)）
  const sy = Math.sin(a.yaw), cy = Math.cos(a.yaw);
  let dvx = 0, dvz = 0;
  if (mag > 0.01) { const ux = (sy * mz - cy * mx) / mag, uz = (cy * mz + sy * mx) / mag; dvx = ux * tgt; dvz = uz * tgt; }
  const cur = Math.hypot(a.vx, a.vz);
  const ac = (tgt >= cur ? accelOf(S, a) : 10) * dt;
  let ex = dvx - a.vx, ez = dvz - a.vz; const el = Math.hypot(ex, ez);
  if (el > ac) { ex *= ac / el; ez *= ac / el; }
  a.vx += ex; a.vz += ez;
  // 動かす（速いときは2回に分ける）
  const h = bodyHeight(a);
  const n = Math.hypot(a.vx, a.vz) * dt > 0.12 ? 2 : 1;
  const ox = a.x, oz = a.z;
  for (let k = 0; k < n; k++) {
    a.x += a.vx * dt / n; a.z += a.vz * dt / n;
    for (let it = 0; it < 2; it++) {
      pushOut(w, a.x, a.z, a.y + STEP, a.y + h, RADIUS, S.doors, -1, _po);
      if (!_po[2]) break;
      a.x += _po[0]; a.z += _po[1];
    }
  }
  // 実際に動いた分で速さを直す（壁に沿って滑る）
  const mvx = (a.x - ox) / dt, mvz = (a.z - oz) / dt;
  a.vx = a.vx * 0.3 + mvx * 0.7; a.vz = a.vz * 0.3 + mvz * 0.7;
  // 足元
  const g = groundAt(w, a.x, a.z, a.y);
  if (g < -50) { a.y -= 9.8 * dt; if (a.y < -20) { a.y = 0; } }
  else if (a.y - g > 0.04) { a.vy -= 9.8 * dt; a.y += a.vy * dt; if (a.y <= g) { if (a.vy < -6.5 && ev) ev.push({ e: 'fall', id: a.id, v: -a.vy }); a.y = g; a.vy = 0; } }
  else { a.y = g; a.vy = 0; }
  a.ground = a.y - g < 0.05;
  // 歩きの位相と足音
  const dist = Math.hypot(a.x - ox, a.z - oz);
  const stepLen = a.sprint ? 0.95 : a.st > 1.5 ? 0.35 : a.st > 0.5 ? 0.55 : 0.72;
  const before = Math.floor(a.phase / Math.PI);
  a.phase += dist * Math.PI / stepLen;
  if (a.phase > 1e4) a.phase -= 2 * Math.PI * 1000;
  const after = Math.floor(a.phase / Math.PI);
  // ローカルの速さ（アニメ用）
  a.mvx = -(mvx * cy - mvz * sy); a.mvz = mvx * sy + mvz * cy;
  a.spd = Math.hypot(mvx, mvz);
  if (after !== before && ev && a.spd > 0.25) {
    const L = levelOfY(a.y + 0.1);
    const i = Math.floor(a.x / CS), j = Math.floor(a.z / CS);
    const fm = (L < w.NL && i >= 0 && j >= 0 && i < w.W && j < w.D) ? w.floorMat[w.idx(L, i, j)] : 0;
    const F = FLOORS[fm] || FLOORS[1];
    // 音の大きさ: 速さ・姿勢・床・防具（重いと大きい）
    let loud = (a.sprint ? 1.6 : a.spd > 1.8 ? 1.0 : a.spd > 0.9 ? 0.6 : 0.3) * F.loud * (a.st > 0.5 ? 0.6 : 1);
    if (!S.pvp && a.armor.vest === 'heavy') loud *= 1.15;
    ev.push({ e: 'step', id: a.id, x: a.x, y: a.y, z: a.z, f: F.step, loud, foot: after & 1 });
  }
  a.stateT += dt;
}

// 死体が床に落ち着く（階段など）
function settle(S, w, a, dt) {
  const g = groundAt(w, a.x, a.z, a.y + 0.2);
  if (g > -50) { if (a.y > g + 0.02) { a.vy -= 9.8 * dt; a.y = Math.max(g, a.y + a.vy * dt); } else { a.y = g; a.vy = 0; } }
}

// 乗り越え: 前に低い物（0.45〜1.25m）があり、向こうに降りられるとき
export function tryVault(S, w, a) {
  if (a.vault || a.st > 1.2 || a.down || a.comply || a.cuffed || !a.ground) return false;
  const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
  // 前に物があるか（腰の高さ）
  const hitAt = (hh, dist) => { const hs = raycast(w, a.x, a.y + hh, a.z, fx, 0, fz, dist, S.doors, _rc); for (const x of hs) { if (x.kind === 'slab' || x.kind === 'stair') continue; return x; } return null; };
  const low = hitAt(0.5, 1.0);
  if (!low) return false;
  // てっぺんを探す
  let top = -1;
  for (let hh = 0.55; hh <= 1.35; hh += 0.1) { if (!hitAt(hh, low.t0 + 0.6)) { top = hh; break; } }
  if (top < 0 || top > 1.3) return false;
  // 越えた先（物の奥行きぶん進む）
  let far = -1;
  for (let d = low.t0 + 0.4; d <= low.t0 + 1.8; d += 0.1) {
    const x = a.x + fx * d, z = a.z + fz * d;
    const g = groundAt(w, x, z, a.y + 0.3);
    if (g < a.y - 1.2 || g > a.y + 0.4) continue;
    pushOut(w, x, z, g + STEP, g + 1.1, RADIUS, S.doors, -1, _po);
    if (!_po[2]) { far = d; break; }
  }
  if (far < 0) return false;
  // 上に頭がつかえないか（窓の上の壁）: 越える高さ + 0.9m まで空いている
  const clear = hitAt(Math.min(2.0, top + 0.75), low.t0 + 0.4);
  if (clear && top + 0.75 < 1.9) { /* 低い開口: しゃがんで越える */ }
  a.vault = { t: 0, dur: 0.55 + top * 0.25, x0: a.x, z0: a.z, y0: a.y, x1: a.x + fx * (far + 0.05), z1: a.z + fz * (far + 0.05), top: a.y + top, y1: groundAt(w, a.x + fx * far, a.z + fz * far, a.y + 0.3) };
  a.vx = a.vz = 0;
  return true;
}
function stepVault(S, w, a, dt) {
  const v = a.vault;
  v.t += dt;
  const u = Math.min(1, v.t / v.dur);
  const e = u * u * (3 - 2 * u);
  a.x = v.x0 + (v.x1 - v.x0) * e; a.z = v.z0 + (v.z1 - v.z0) * e;
  // 弧: 物の上を越える
  const arc = Math.sin(Math.PI * Math.min(1, u * 1.15));
  a.y = v.y0 + (v.y1 - v.y0) * e + Math.max(0, (v.top - Math.max(v.y0, v.y1)) + 0.15) * arc;
  a.st = Math.max(a.st, 0.55 * arc);
  if (u >= 1) { a.y = v.y1; a.vault = null; a.st = Math.min(a.st, a.stance); }
}

// 人どうしの押し合い
export function separateActors(S, w) {
  const A = S.actors;
  for (let i = 0; i < A.length; i++) {
    const a = A[i]; if (a.dead || a.vault || a.isDrone) continue;
    for (let j = i + 1; j < A.length; j++) {
      const b = A[j]; if (b.dead || b.vault || b.isDrone) continue;
      if (Math.abs(a.y - b.y) > 1.4) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, R = RADIUS * 2 - 0.04;
      if (d2 >= R * R || d2 < 1e-8) continue;
      const d = Math.sqrt(d2), o = (R - d);
      const ha = a.down || a.cuffed || a.comply === 2 ? 0.1 : 1, hb = b.down || b.cuffed || b.comply === 2 ? 0.1 : 1;
      const sa = ha / (ha + hb), sb = hb / (ha + hb);
      a.x -= dx / d * o * sa; a.z -= dz / d * o * sa; b.x += dx / d * o * sb; b.z += dz / d * o * sb;
      for (const c of [a, b]) {
        pushOut(w, c.x, c.z, c.y + STEP, c.y + bodyHeight(c), RADIUS, S.doors, -1, _po);
        if (_po[2]) { c.x += _po[0]; c.z += _po[1]; }
      }
    }
  }
}
