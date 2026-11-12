// 移動: RoN の速さ（歩き2.4・ゆっくり0.96・しゃがみ1.2）、しゃがみ・伏せ・リーン・乗り越え・飛び降り・落下・階段・PvPのダッシュ
import { groundAt, standAt, ceilAt, pushOut, raycast, STEP, CS, LH, BH, NB, levelOfY, cellType, C, leafEnd, inMap, isWallish } from './world.js';
import { hurt, pvpDamage, breakGlass } from './combat.js';
import { M } from './data/materials.js';
import { OPEN_ANG, isOpen } from './doors.js';
import { KNEEL_ACT } from './data/acts.js';
import { curW, bodyHeight, curWeapon } from './actor.js';
import { attMods, canAim } from './weapon.js';
import { PLATE, LONG } from './data/equipment.js';
import { FLOORS, F as FF } from './data/materials.js';
import { heightAt, raycast as wRaycast } from '../war/world.js';
import { DEP, wireAt, stepWire } from './deploy.js';

// 撃つのをやめてから、また走れるまで（秒。続けて撃つ間に銃が下がらないように）
export const SPRINT_HOLD = 0.4;
export const SPEED = { walk: 2.4, crouch: 1.2, prone: 0.45, low: 1.2, ads: 0.7, sprint: 4.6, back: 0.8, side: 0.9 };
// 大規模戦（research/WARBIT.md の 5）: Battlefield V の速さ（歩き 3.4・しゃがみ 2.1・伏せ 0.85・走る 6.0、ADS の歩きは半分）に近く、
// BattleBit のように、まっすぐ走り続けると数秒で少し速くなる（sprintUp 秒で sprint → sprint2）
export const WAR_SPEED = { walk: 3.3, crouch: 2.0, prone: 0.8, ads: 0.52, sprint: 5.9, sprint2: 6.6, sprintUp: 3.0, back: 0.75, side: 0.9 };
export const RADIUS = 0.28;
const _po = [0, 0, 0];
const _rc = { out: [], seenProp: new Set(), seenDoor: new Set() };
const _pv = [0, 0, 0, 0];

// 乗り越え: 前の物の高さが lo〜hi なら、物の種類を問わず越える（家具・低い壁・手すり・窓・車・ゴミ箱…）。
//  向こうに降りる所があれば越える。向こうの床が低ければ（2階より上の窓・外廊下や吹き抜けの手すり）、越えたところから飛び降りる。
//  向こうに降りる所がなければ（壁ぎわの机・カウンター・車の屋根など）、物の上に乗る（天井が低ければかがむ）。
//  窓のガラスは割って越える（smash 秒かかる）。板を打った窓（バリケード）は崩れるまで越えられない。
//  高い壁・フェンス（tall m 以上。物の上に乗っても）の上は越えない。少し斜め・少しずれて立っていても、近くの通れる線を探す
export const VAULT = { lo: 0.4, hi: 1.45, reach: 1.0, far: 2.6, band: 0.85, tall: 1.9, smash: 0.22, onto: 1.4 };
// 落下: safe m までは何もない。そこからは k×(高さ−safe)^p の傷（1階分≒3mで約15、5mで約58、7mで約114）。
// かがんで着地（受け身）すると傷と怯みが roll 倍。3.5mより高いと脚を痛める（遅くなる）。
// 重い防具ほど傷が大きい（対戦: 軽0.9・中1・重1.15倍。作戦: ベストなし0.9・軽1・重1.12倍、鋼の板はさらに1.06倍）
export const FALL = { safe: 2.0, k: 14, p: 1.3, roll: 0.7, legH: 3.5, pvp: { light: 0.9, medium: 1, heavy: 1.15 }, pve: { none: 0.9, light: 1, heavy: 1.12 }, steel: 1.06 };
export function fallWeight(S, a) {
  if (S.pvp) return FALL.pvp[a.pvpArmor || 'medium'] || 1;
  const v = a.armor ? a.armor.vest : 'none';
  return (FALL.pve[v] || 1) * (v !== 'none' && a.armor.plate === 'steel' ? FALL.steel : 1);
}
export function fallDamage(h) { return h <= FALL.safe ? 0 : FALL.k * Math.pow(h - FALL.safe, FALL.p); }
// PvPの防具の重さ（R6の3段階）
export const PVP_ARMOR = { light: { hp: 100, speed: 1.08 }, medium: { hp: 110, speed: 1.0 }, heavy: { hp: 125, speed: 0.9 } };

export function maxSpeed(S, a, inp) {
  const st = Math.round(a.st);
  if (S.war) return warSpeed(S, a, st);
  let v = st === 0 ? SPEED.walk : st === 1 ? SPEED.crouch : SPEED.prone;
  const W = curW(a);
  if (W) v *= W.move * attMods(curWeapon(a)).move; // ドラム弾倉は重く、縮めた銃床は少し軽い
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
  // 有刺鉄線の上（対戦）: 誰でも遅くなる
  if (S.deps && S.deps.length && !a.isDrone && wireAt(S, a.x, a.z, a.y)) v *= DEP.wire.slow;
  if (a.comply === 1) v = Math.min(v, 0.9);
  if (a.comply === 2 || a.cuffed || a.down || a.dead || a.tased > 0) v = a.down && S.pvp && a.dbno ? 0.35 : 0;
  if (a.act && a.act.still) v = 0;
  return v;
}

function warSpeed(S, a, st) {
  const P = WAR_SPEED, W = curW(a);
  let v = st === 0 ? P.walk : st === 1 ? P.crouch : P.prone;
  if (W) v *= W.move * attMods(curWeapon(a)).move;
  if (a.ads > 0.3) v *= 1 - (1 - P.ads) * a.ads;
  if (a.sprint) v = (P.sprint + (P.sprint2 - P.sprint) * Math.min(1, (a.sprT || 0) / P.sprintUp)) * (W ? Math.min(1, W.move + 0.03) : 1);
  v *= 1 - 0.04 * Math.min(4, a.inj.leg);
  if (a.stun > 0 || a.flash > 0.5) v *= 0.45;
  if (a.down || a.dead) v = a.down && a.dbno ? 0.35 : 0;
  if (a.act && a.act.still) v = 0;
  return v;
}
function accelOf(S, a) {
  let ac = 9.0; // 歩き出しは約0.27秒で全速（重さは残しつつ、指に遅れない）
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
  // 姿勢（家具の上で天井が低いときは、かがむ・伏せる）
  let want = inp.stance | 0;
  const room = ceilAt(w, a.x, a.z, a.y) - a.y;
  if (room < 1.84 && want < 1) want = 1;
  if (room < 1.24) want = 2;
  // ひざをついて行う動作（拘束・ピッキング・解除・拾うなど）の間はしゃがむ
  if (a.act && KNEEL_ACT.has(a.act.k) && want < 1) want = 1;
  if (a.peek && want < 1) want = 1;
  if (a.down || a.cuffed || a.comply === 2) want = 0;
  if (a.sprint && want) a.sprint = false;
  // 息の上がり（0〜1）: 走ると5秒で上がりきり、止まると6秒・歩くと9秒で戻る。構えたときの揺れが大きくなる（weapon.js）
  a.fat = a.sprint ? Math.min(1, (a.fat || 0) + dt / 5) : Math.max(0, (a.fat || 0) - dt / ((a.spd || 0) < 0.3 ? 6 : 9));
  // 引き金を離してからの時間（撃ったあと少しは走らない）。ダッシュを入れ直してリロードをやめるのは、手元が送る動作 'sprint'（interact.js doAction → weapon.js cancelReload）
  a.trigT = inp.fire ? 0 : Math.min(9, (a.trigT ?? 9) + dt);
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
  // リーン（壁にめり込まない）。ダッシュより先（リーンしている間は走らない）
  let lw = inp.lean || 0;
  if (a.st > 1.3 || a.vault || a.down || a.comply || a.cuffed) lw = 0;
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
  const air = a.air ? 1 : 0; // 飛び降りの最中（2階の高さの何もない所を落ちていく）
  // 速さ
  let mx = inp.mx || 0, mz = inp.mz || 0;
  let mag = Math.hypot(mx, mz); if (mag > 1) { mx /= mag; mz /= mag; mag = 1; }
  // ダッシュ: 作戦・対戦とも（スティックを上へ押し込む・Shift）。立って前へ。盾を構えている・運んでいる・拘束されているときは走れない。
  // 押していても、ほかの操作が先（11-12）: 構える・リーン・撃つ（離して0.4秒まで）・リロードの間は走らず、やめるとまた走る
  const reloading = !!a.ws && (a.ws.st === 'reload' || a.ws.st === 'shell');
  const busy = (inp.ads && canAim(a)) || !!inp.lean || a.trigT < SPRINT_HOLD || reloading;
  a.sprint = !!(inp.sprint && !busy && a.st < 0.2 && mz > 0.55 && !a.down && !a.act && !a.cuffed && !a.comply && !(a.ws && a.ws.slot === 1 && a.inv && a.inv.long === 'shield') && !(S.deps && S.deps.length && wireAt(S, a.x, a.z, a.y)));
  // まっすぐ走り続けた時間（大規模戦: 走る速さが少し上がる。向きを大きく変えると戻る）
  if (S.war) { const turn = Math.abs(Math.atan2(Math.sin(a.yaw - (a._sprYaw ?? a.yaw)), Math.cos(a.yaw - (a._sprYaw ?? a.yaw)))); a._sprYaw = a.yaw; a.sprT = a.sprint && Math.abs(mx) < 0.35 ? Math.max(0, (a.sprT || 0) + dt - turn * 1.5) : 0; }
  const vmax = maxSpeed(S, a, inp);
  // 後ろ・横は遅い
  let dirMul = 1;
  const SP = S.war ? WAR_SPEED : SPEED;
  if (mag > 0.01) { const fz = mz / mag, fx = mx / mag; dirMul = fz >= 0 ? 1 - (1 - SP.side) * Math.abs(fx) : SP.back + (SP.side - SP.back) * Math.abs(fx); }
  const tgt = vmax * mag * dirMul;
  // ローカル → 世界（前 = (sin yaw, cos yaw)、右 = (-cos yaw, sin yaw)）
  const sy = Math.sin(a.yaw), cy = Math.cos(a.yaw);
  let dvx = 0, dvz = 0;
  if (mag > 0.01) { const ux = (sy * mz - cy * mx) / mag, uz = (cy * mz + sy * mx) / mag; dvx = ux * tgt; dvz = uz * tgt; }
  const cur = Math.hypot(a.vx, a.vz);
  const ac = (tgt >= cur ? accelOf(S, a) : 10) * dt * (air ? 0.12 : 1); // 宙では向きをほとんど変えられない
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
      pushOut(w, a.x, a.z, a.y + STEP, a.y + h, RADIUS, S.doors, -1, _po, air);
      if (!_po[2]) break;
      a.x += _po[0]; a.z += _po[1];
    }
  }
  // 開いている扉の板に体で当たって進もうとしたら、板は押されて回る（RoN と同じく、半開きの扉は体で押し開けられる）
  if (mag > 0.01) pushLeaves(S, w, a, dvx, dvz, dt);
  // 実際に動いた分で速さを直す（壁に沿って滑る）
  // 押し出された分で速くはならない（重なりを直した分が勢いにならないように）
  const mvx = (a.x - ox) / dt, mvz = (a.z - oz) / dt, sp0 = Math.hypot(a.vx, a.vz);
  let nvx = a.vx * 0.3 + mvx * 0.7, nvz = a.vz * 0.3 + mvz * 0.7;
  const sp1 = Math.hypot(nvx, nvz);
  if (sp1 > sp0 && sp1 > 1e-6) { nvx *= sp0 / sp1; nvz *= sp0 / sp1; }
  a.vx = nvx; a.vz = nvz;
  // 足元（家具の上にも立てる）
  const g = standAt(w, a.x, a.z, a.y);
  if (g < -50) { a.y -= 9.8 * dt; if (a.y < -20) { a.y = 0; } }
  else if (a.y - g > 0.04) {
    if (a.airTop == null) a.airTop = a.y;
    a.vy -= 9.8 * dt; a.y += a.vy * dt;
    if (a.y <= g) { const v = -a.vy, hh = a.airTop - g; a.y = g; a.vy = 0; a.airTop = null; a.air = false; land(S, w, a, hh, v, ev); }
  }
  else { a.y = g; a.vy = 0; a.airTop = null; a.air = false; }
  a.ground = a.y - g < 0.05;
  // 歩きの位相と足音
  const dist = Math.hypot(a.x - ox, a.z - oz);
  if (ev && S.deps && S.deps.length) stepWire(S, a, dist, ev);
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
    const fm = w.war ? warFloor(w, a) : (L < w.NL && i >= 0 && j >= 0 && i < w.W && j < w.D) ? w.floorMat[w.idx(L, i, j)] : 0;
    const F = FLOORS[fm] || FLOORS[1];
    // 音の大きさ: 速さ・姿勢・床・防具（重いと大きい）
    let loud = (a.sprint ? 1.6 : a.spd > 1.8 ? 1.0 : a.spd > 0.9 ? 0.6 : 0.3) * F.loud * (a.st > 0.5 ? 0.6 : 1);
    if (!S.pvp && a.armor.vest === 'heavy') loud *= 1.15;
    ev.push({ e: 'step', id: a.id, x: a.x, y: a.y, z: a.z, f: F.step, loud, foot: after & 1 });
  }
  a.stateT += dt;
}

// 大規模戦の足もとの材質（足音）: 箱の上なら箱の材質、地面なら道・草
function warFloor(w, a) {
  const g = heightAt(w, a.x, a.z);
  if (a.y > g + 0.08) { const r = wRaycast(w, a.x, a.y + 0.3, a.z, 0, -1, 0, 0.6, {}); const h = r[0]; if (h && h.kind === 'box') return h.mat === M.WOOD ? FF.WOOD : h.mat === M.METAL ? FF.METAL : FF.CONCRETE; }
  return w.roadDist && w.roadDist(a.x, a.z) < 4 ? FF.ASPHALT : FF.GRASS;
}
// 死体が床に落ち着く（階段など）
function settle(S, w, a, dt) {
  const g = standAt(w, a.x, a.z, a.y + 0.2);
  if (g > -50) { if (a.y > g + 0.02) { a.vy -= 9.8 * dt; a.y = Math.max(g, a.y + a.vy * dt); } else { a.y = g; a.vy = 0; } }
}

// 乗り越えられるか（ボタンの表示にも使う）。できるなら { top, far, x1, z1, y1, drop, onto, crouch, gk, dur, ... }、できなければ null
// 1) 前1mまでに歩きを止める物がある 2) その上に、越える体（高さ band）が通る高さ top（lo〜hi）がある
// 3) 物の向こうに降りる所がある: 同じ高さの床（±0.5m）か、下の床（飛び降り。宙で体が入り、下に立てる所がある）
// 4) 向こうに降りる所がなければ、物の上面に乗る（かがんだ体が入る広さと天井の高さがあれば）
const _vp = { top: 0, far: 0, x1: 0, z1: 0, y1: 0, drop: 0, onto: 0, crouch: 0, gk: -1, sx: 0, sz: 0, dur: 0 };
function freeAt(S, w, x, z, y0, y1, r, mode) { pushOut(w, x, z, y0, y1, r, S.doors, -1, _pv, mode); return !_pv[2]; }
// 越える体の帯が、高い壁・フェンスの「上」を通るか（窓のように上に壁が残っていれば、開いた所を通るのでよい）
function overTall(w, x, z, yb) {
  if (w.war) return false;
  const i = Math.floor(x / CS), j = Math.floor(z / CS);
  if (!inMap(w, i, j)) return true;
  const L = Math.max(0, Math.min(w.NL - 1, Math.floor((yb + 0.02) / LH))), k = w.idx(L, i, j);
  if (!isWallish(w.cell[k])) return false;
  const base = L * LH;
  let topY = -1, above = false;
  for (let q = 0; q < NB; q++) {
    const m = w.blocks[k * NB + q];
    if (!m || m === M.GLASSBROKEN) continue;
    const y1 = base + (q + 1) * BH;
    if (base + q * BH >= yb - 0.01) above = true; // 帯より上に壁がある（窓の上の壁）
    topY = Math.max(topY, y1);
  }
  return !above && topY - base >= VAULT.tall;
}
// 線（始まり sx,sz・向き fx,fz）に沿って調べる
function planAlong(S, w, a, sx, sz, fx, fz, out) {
  const y = a.y;
  // 1) 前の物（割れていないガラスは越えるときに割るので、無いものとして見る）
  let d0 = -1;
  for (let d = 0.32; d <= VAULT.reach + 1e-6; d += 0.08) {
    if (!freeAt(S, w, sx + fx * d, sz + fz * d, y + STEP + 0.03, y + VAULT.hi - 0.05, 0.05, 7)) { d0 = d; break; }
  }
  if (d0 < 0) return false;
  // 2) てっぺん: 手前からその物の所まで、越える体の帯が通る、いちばん低い高さ（まず物の所だけで当たりを付ける）
  let top = -1;
  const dq = d0 + 0.08;
  for (let n = 0; ; n++) {
    const t = VAULT.lo + n * 0.05;
    if (t > VAULT.hi + 1e-6) break;
    if (!freeAt(S, w, sx + fx * dq, sz + fz * dq, y + t, y + t + VAULT.band, 0.14, 7)) continue;
    let ok = true;
    for (let d = 0.3; d < dq && ok; d += 0.1) ok = freeAt(S, w, sx + fx * d, sz + fz * d, y + t, y + t + VAULT.band, 0.14, 7);
    if (ok) { top = t; break; }
  }
  if (top < 0) return false;
  // 3) 越えた先
  let far = -1, y1 = y, drop = 0, onto = 0, crouch = 0, blocked = 1e9, ox = 0, oz = 0;
  for (let d = d0 + 0.2; d <= d0 + VAULT.far + 1e-6; d += 0.1) {
    const x = sx + fx * d, z = sz + fz * d;
    if (!freeAt(S, w, x, z, y + top, y + top + VAULT.band, 0.2, 7)) { blocked = d; break; } // 越える途中でつかえる（低い天井・壁）
    // 同じ高さの床（越えた物の上には降りない）
    const g = groundAt(w, x, z, y + top);
    if (g < -50 || g > y + 0.45) continue;
    if (g >= y - 0.5) {
      if (freeAt(S, w, x, z, g + STEP, g + 1.1, RADIUS, 6)) { far = d; y1 = g; break; }
      continue;
    }
    // 下へ飛び降りる: 下の床か、下にある物（車の屋根など）の上に降りる
    const gd = standAt(w, x, z, y - 0.5 - STEP);
    if (gd > -50 && gd < y - 0.5 && freeAt(S, w, x, z, y + 0.08, y + 1.2, RADIUS, 7) && freeAt(S, w, x, z, gd + STEP, gd + 1.1, RADIUS, 6)) {
      far = d; y1 = y + 0.05; drop = y1 - gd; break; // 飛び降り: 宙に出て、あとは落ちる
    }
  }
  // 4) 物の上に乗る
  if (far < 0) {
    for (let d = d0 + 0.22; d <= d0 + VAULT.onto + 1e-6 && d < blocked - 0.05; d += 0.08) {
      let x = sx + fx * d, z = sz + fz * d;
      const g = standAt(w, x, z, y + top - STEP + 0.04);
      if (g < y + VAULT.lo - 0.1 || g > y + top + 0.06) continue;
      if (ceilAt(w, x, z, g) - g < 1.25) continue;
      if (!freeAt(S, w, x, z, g + STEP, g + 1.2, RADIUS, 6)) {
        // 壁ぎわの小さな台（ナイトテーブル・テレビ台）: 壁から押し出された所がまだ上面なら、そこに乗る
        const px = x + _pv[0], pz = z + _pv[1];
        if (Math.hypot(_pv[0], _pv[1]) > 0.14 || Math.abs(standAt(w, px, pz, g - STEP + 0.04) - g) > 0.02 || !freeAt(S, w, px, pz, g + STEP, g + 1.2, RADIUS, 6)) continue;
        x = px; z = pz;
      }
      const room = ceilAt(w, x, z, g) - g;
      far = d; y1 = g; onto = 1; ox = x; oz = z;
      crouch = room < 1.84 || !freeAt(S, w, x, z, g + STEP, g + 1.8, RADIUS, 6) ? 1 : 0;
      break;
    }
    if (far < 0) return false;
  }
  // 高い壁・フェンスの上は越えない
  for (let d = d0; d <= far; d += 0.1) if (overTall(w, sx + fx * d, sz + fz * d, y + top)) return false;
  // 割るガラス（帯が通る所）
  let gk = -1;
  for (let d = Math.max(0.3, d0 - 0.1); !w.war && d <= Math.min(far, d0 + 0.9) && gk < 0; d += 0.1) {
    const x = sx + fx * d, z = sz + fz * d, i = Math.floor(x / CS), j = Math.floor(z / CS);
    if (!inMap(w, i, j)) continue;
    const L = Math.max(0, Math.min(w.NL - 1, Math.floor((y + top + 0.02) / LH))), k = w.idx(L, i, j), base = L * LH;
    if (!isWallish(w.cell[k])) continue;
    for (let q = 0; q < NB; q++) if (w.blocks[k * NB + q] === M.GLASS && base + (q + 1) * BH > y + top && base + q * BH < y + top + VAULT.band) { gk = k; break; }
  }
  out.top = y + top; out.far = far; out.x1 = sx + fx * (far + 0.05); out.z1 = sz + fz * (far + 0.05); out.y1 = y1; out.drop = drop;
  if (onto) { out.x1 = ox; out.z1 = oz; }
  out.onto = onto; out.crouch = crouch; out.gk = gk; out.sx = sx; out.sz = sz;
  out.dur = 0.5 + top * 0.25 + 0.12 * Math.max(0, far - d0 - 0.8) + (gk >= 0 ? VAULT.smash : 0);
  return true;
}
// まず向いている線、だめなら左右に少しずらした線、それでもだめなら少し斜めの線
const VLAT = [0, 0.15, -0.15, 0.3, -0.3, 0.45, -0.45], VYAW = [0, 0.3, -0.3];
export function vaultPlan(S, w, a, out = _vp) {
  if (a.vault || a.st > 1.2 || a.down || a.comply || a.cuffed || !a.ground || a.air || a.isDrone || a.dead) return null;
  for (const dy of VYAW) {
    const yaw = a.yaw + dy, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    for (const lat of dy ? [0] : VLAT) {
      const sx = a.x + rx * lat, sz = a.z + rz * lat;
      if (lat && !freeAt(S, w, sx, sz, a.y + STEP, a.y + 1.2, RADIUS - 0.06, 0)) continue;
      if (planAlong(S, w, a, sx, sz, fx, fz, out)) return out;
    }
  }
  return null;
}
export function tryVault(S, w, a, ev) {
  const p = vaultPlan(S, w, a);
  if (!p) return false;
  a.vault = { t: 0, dur: p.dur, x0: a.x, z0: a.z, sx: p.sx, sz: p.sz, y0: a.y, x1: p.x1, z1: p.z1, top: p.top, y1: p.y1, drop: p.drop > 0 ? 1 : 0, onto: p.onto, crouch: p.crouch, pre: p.gk >= 0 ? VAULT.smash : 0 };
  a.vx = a.vz = 0; a.sprint = false;
  // 窓のガラスを割る（手元の先読みでは割らない。ホストが割って知らせる）
  if (p.gk >= 0 && !S.predict && ev) breakGlass(S, w, { k: p.gk, q: 1, x: p.x1, by: a.id }, ev);
  return true;
}
function stepVault(S, w, a, dt) {
  const v = a.vault;
  v.t += dt;
  // ガラスを割る間は、その場で（銃床で割る）
  const pre = v.pre || 0;
  const u = Math.max(0, Math.min(1, (v.t - pre) / Math.max(0.05, v.dur - pre)));
  const e = u * u * (3 - 2 * u);
  // ずらした線へ寄りながら越える（初めの3割で寄せる）
  const sx = v.sx ?? v.x0, sz = v.sz ?? v.z0, kk = Math.min(1, e / 0.3);
  a.x = v.x0 + (sx - v.x0) * kk + (v.x1 - sx) * e; a.z = v.z0 + (sz - v.z0) * kk + (v.z1 - sz) * e;
  // 弧: 物の上を越える
  const arc = Math.sin(Math.PI * Math.min(1, u * 1.15));
  a.y = v.y0 + (v.y1 - v.y0) * e + Math.max(0, (v.top - Math.max(v.y0, v.y1)) + 0.15) * arc;
  a.st = Math.max(a.st, 0.55 * arc);
  if (v.t >= v.dur) {
    a.y = v.y1; a.vault = null; a.st = Math.min(a.st, a.stance);
    if (v.crouch) { a.st = Math.max(a.st, 1); a.stance = Math.max(a.stance, 1); } // 天井が低い上に乗った
    if (v.drop) {
      // 飛び降り: 越えた勢いで少し前へ出て、落ちる
      const dx = v.x1 - v.x0, dz = v.z1 - v.z0, l = Math.hypot(dx, dz) || 1;
      a.air = true; a.ground = false; a.airTop = a.y; a.vy = 0; a.vx = dx / l * 1.1; a.vz = dz / l * 1.1;
    }
  }
}

// 着地: 落ちた高さ h（m）で傷・怯み・脚・音。手元の先読み（通信の相手側）では何もしない（ホストが決める）
function land(S, w, a, h, v, ev) {
  if (S.predict || h < 1.2 || !a.alive || a.isDrone) return;
  const roll = a.stance >= 1 && !a.down; // かがんで着地（受け身）
  const d = Math.round(fallDamage(h) * (roll ? FALL.roll : 1) * fallWeight(S, a));
  const stun = h > FALL.safe ? Math.min(1.3, 0.25 + 0.2 * (h - FALL.safe)) * (roll ? 0.6 : 1) : 0;
  if (ev) ev.push({ e: 'fall', id: a.id, v: Math.round(v * 10) / 10, h: Math.round(h * 10) / 10, d, roll: roll ? 1 : 0, x: a.x, y: a.y, z: a.z, loud: Math.min(2, 0.5 + h * 0.3) });
  if (stun > 0) a.stun = Math.max(a.stun || 0, stun);
  if (d < 1) return;
  if (h > FALL.legH) a.inj.leg = Math.min(S.pvp ? 2 : 4, (a.inj.leg || 0) + 1);
  a.flinch = Math.max(a.flinch || 0, Math.min(1, d / 40));
  if (ev) ev.push({ e: 'hit', id: a.id, by: -1, part: 'leg', d, x: a.x, y: a.y + 0.3, z: a.z, fall: 1 });
  if (S.pvp) pvpDamage(S, a, d, null, 'leg', 0, 0, ev || [], 'fall');
  else hurt(S, w, a, d, 'leg', null, null, 0, 0, ev || [], 'fall');
}

// 人どうしの押し合い
export function separateActors(S, w) {
  const A = S.actors;
  for (let i = 0; i < A.length; i++) {
    const a = A[i]; if (a.dead || a.vault || a.isDrone || a.staged) continue;
    for (let j = i + 1; j < A.length; j++) {
      const b = A[j]; if (b.dead || b.vault || b.isDrone || b.staged) continue;
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

// 体で扉の板を押す: 閉じた扉（掛け金がかかっている）は押せない。板は押す速さに合わせて、蝶番を中心に体から離れる向きへ回る
function pushLeaves(S, w, a, vx, vz, dt) {
  if (w.war) return;
  const L = levelOfY(a.y + 0.3);
  const k = w.idx(L, Math.floor(a.x / CS), Math.floor(a.z / CS));
  const dn = w.doorNear.get(k);
  if (!dn) return;
  for (const did of dn) {
    const d = w.doors[did], ds = S.doors[did];
    if (!ds || ds.broken || ds.bar > 0 || d.L !== L) continue;
    for (let li = 0; li < d.leaves.length; li++) {
      const ang = ds.ang[li];
      if (Math.abs(ang) < 0.05 || ds.tgt[li] !== ang) continue; // 閉じている・動いている最中
      const lf = d.leaves[li], [ex, ez] = leafEnd(lf, ang);
      const lx = ex - lf.hx, lz = ez - lf.hz, len = Math.hypot(lx, lz) || 1, ux = lx / len, uz = lz / len;
      const t = Math.max(0.15, Math.min(1, ((a.x - lf.hx) * ux + (a.z - lf.hz) * uz) / len));
      const cx = lf.hx + ux * len * t, cz = lf.hz + uz * len * t;
      if (Math.hypot(a.x - cx, a.z - cz) > RADIUS + 0.08) continue;
      const nx = -uz, nz = ux, side = Math.sign((a.x - lf.hx) * nx + (a.z - lf.hz) * nz) || 1;
      const push = -(vx * nx + vz * nz) * side;
      if (push < 0.1) continue;
      // どちらへ回すと当たっている所が体から離れるか
      const [ex2, ez2] = leafEnd(lf, ang + 0.01);
      const mx = (lf.hx + (ex2 - lf.hx) * t) - cx, mz = (lf.hz + (ez2 - lf.hz) * t) - cz;
      const dir = (mx * nx + mz * nz) * side < 0 ? 1 : -1;
      const om = Math.min(1.6, push / Math.max(0.3, len * t));
      const nxt = Math.max(-OPEN_ANG - 0.05, Math.min(OPEN_ANG + 0.05, ang + dir * om * dt));
      ds.ang[li] = ds.tgt[li] = nxt;
      ds.open = isOpen(ds);
    }
  }
}
