// 人（隊員・容疑者・市民・ボット・プレイヤー）。状態は関数を含まないデータだけ。
import { WEAPONS } from './data/weapons.js';
import { PLATE, HELMET, GEAR, LONG } from './data/equipment.js';

export const KIND = { SWAT: 'swat', SUS: 'sus', CIV: 'civ', BOT: 'bot' };

// 武器を1丁持たせる
export function makeWeapon(o) {
  if (!o || !o.id || !WEAPONS[o.id]) return null;
  const W = WEAPONS[o.id];
  const am = o.ammo && W.ammo.includes(o.ammo) ? o.ammo : W.ammo[0];
  const w = { id: o.id, att: { sight: o.sight || 'iron', muzzle: W.integral ? W.integral : (o.muzzle || 'none'), grip: o.grip || 'none', light: o.light !== false }, am, mode: 0, lightOn: false };
  if (W.tube || W.breakAction) { w.mag = W.mag; w.ch = W.chamber ? 1 : 0; w.res = W.spare; w.mags = null; }
  else { w.mag = W.mag; w.ch = W.chamber ? 1 : 0; w.mags = []; for (let i = 0; i < (o.spare ?? W.spare); i++) w.mags.push(W.mag); w.res = 0; }
  return w;
}

// 装備の定義から持ち物を作る
export function makeInventory(lo) {
  const inv = {
    w: [makeWeapon(lo.primary), makeWeapon(lo.secondary)],
    gear: [], long: lo.long && LONG[lo.long] ? lo.long : 'none', longN: 0,
    always: { cuffs: 99, chem: 8 },
  };
  for (const [id, n] of (lo.gear || [])) if (GEAR[id] && n > 0) inv.gear.push({ id, n: Math.min(n, GEAR[id].max) });
  if (inv.long === 'm320') inv.m320 = { ...LONG.m320.rounds, sel: 'flash' };
  return inv;
}

export function makeArmor(lo) {
  const vest = lo.vest || 'none', plate = PLATE[lo.plate] ? lo.plate : 'ceramic';
  const P = PLATE[plate];
  return { vest, plate, pf: P.hits || 0, pb: P.hits || 0, helm: (HELMET[lo.helmet] || HELMET.none).dur, helmet: lo.helmet || 'none', head: lo.head || 'none', face: lo.head === 'facemask' ? 2 : 0 };
}

let _nextLook = 1;
export function createActor(S, o) {
  const a = {
    id: S.nextId++, kind: o.kind, team: o.team ?? 0, pid: o.pid ?? null, name: o.name || '', role: o.role || o.kind,
    look: o.look || { seed: (S.nextId * 7919 + _nextLook++) >>> 0 },
    x: o.x, y: o.y ?? 0, z: o.z, vx: 0, vy: 0, vz: 0, yaw: o.yaw || 0, pitch: 0, h: o.h || 1.8,
    ground: true, stance: 0, st: 0, lean: 0, leanIn: 0, phase: 0, mvx: 0, mvz: 0, spd: 0, vault: null, sprint: false,
    hp: o.hp ?? 100, maxHp: o.hp ?? 100, alive: true, dead: false, down: false, downT: 0, cuffed: false, comply: 0, // comply: 0 自由, 1 手を上げた, 2 ひざまずいた
    stun: 0, flash: 0, gas: 0, tased: 0, deaf: 0, supp: 0, bleed: 0, inj: { arm: 0, leg: 0, head: 0 }, flinch: 0,
    armor: makeArmor(o.lo || {}), inv: makeInventory(o.lo || {}),
    ws: { slot: 0, next: -1, st: 'draw', t: 0.4, cd: 0, trigWas: false, rp: 0, ry: 0, bloom: 0, shots: 0, lastShot: -99, rk: null, rd: 0, gear: -1, pumpNeed: false, barrel: 0 },
    ads: 0, adsOn: false, low: 0, lowOn: false, light: false, nvg: false,
    act: null, // 時間のかかる動作 { k, t, dur, tgt }
    stateT: 0, fallYaw: 0, throwT: 0, fireK: 0,
    stats: { k: 0, d: 0, a: 0, sh: 0, hi: 0, dmg: 0, arrest: 0, rescue: 0 },
    lastHit: null, dmgBy: {}, spawnProt: 0, dbno: 0, dbnoCount: 0, revivedT: 0,
    ai: o.ai || null, tag: o.tag || null, carry: null, spot: 0, seenBy: 0,
  };
  if (!a.inv.w[0] && a.inv.w[1]) a.ws.slot = 1;
  if (!a.inv.w[0] && !a.inv.w[1]) a.ws.slot = -1;
  S.actors.push(a);
  return a;
}

export function curWeapon(a) { const s = a.ws.slot; return s >= 0 ? a.inv.w[s] : null; }
export function curW(a) { const w = curWeapon(a); return w ? WEAPONS[w.id] : null; }
export function holdOf(a) {
  if (a.cuffed || a.comply || a.down || a.dead) return 'none';
  if (a.ws.slot === 2) return 'none';
  const W = curW(a);
  if (!W) return 'none';
  return W.cat === 'pistol' || (W.cat === 'less' && W.model === 'taser') ? 'pistol' : W.cat === 'shotgun' ? 'shotgun' : W.cat === 'smg' ? 'smg' : 'rifle';
}
// 体の状態 → 姿勢の名前
export function poseState(a) {
  if (a.dead) return 'dead';
  if (a.down) return 'down';
  if (a.cuffed) return 'cuffed';
  if (a.comply === 2) return 'kneel';
  if (a.comply === 1) return 'hands';
  if (a.stun > 0 || a.flash > 0.4 || a.tased > 0) return 'stun';
  if (a.ai && a.ai.cower) return 'cower';
  if (a.inv.long === 'shield' && a.ws.slot === 1 && !a.vault) return 'shield';
  return 'normal';
}
// 立っている高さ
export function bodyHeight(a) { return a.st < 1 ? 1.8 - 0.6 * a.st : 1.2 - 0.7 * (a.st - 1); }
export function isThreatCapable(a) { return a.alive && !a.down && !a.cuffed && !a.comply; }
// 弾倉の合計
export function ammoCount(w) {
  if (!w) return [0, 0];
  if (w.mags) return [w.mag + (w.ch || 0), w.mags.reduce((s, m) => s + m, 0)];
  return [w.mag + (w.ch || 0), w.res];
}
