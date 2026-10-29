// 人を置く道具（モードが使う）
import { createActor } from '../actor.js';
import { rnd, rndPick } from '../rng.js';
import { SUSPECTS, CIVILIANS, LOADOUTS } from '../data/npc.js';
import { CS, LH, groundAt, nearestFloor } from '../world.js';

export function cellPos(w, x, z, L = 0) {
  const p = nearestFloor(w, L, x * CS, z * CS, 4) || [x * CS, z * CS];
  return { x: p[0], z: p[1], y: groundAt(w, p[0], p[1], L * LH + 0.4) };
}
function pickWeighted(r, list) {
  let sum = 0; for (const [, wt] of list) sum += wt;
  let x = rnd(r) * sum;
  for (const [v, wt] of list) { x -= wt; if (x <= 0) return v; }
  return list[0][0];
}
export function spawnSwat(S, w, o) {
  const p = o.cell ? cellPos(w, o.x, o.z, o.L || 0) : { x: o.x, z: o.z, y: o.y ?? 0 };
  const a = createActor(S, { kind: 'swat', team: o.team ?? 0, pid: o.pid ?? null, name: o.name, x: p.x, y: p.y, z: p.z, yaw: o.yaw || 0, hp: o.pid != null ? 100 : (S.pvp ? 100 : 150), lo: o.lo || LOADOUTS.red1, h: o.h || 1.8 });
  a.role = o.role || 'swat';
  a.squad = o.squad || null;
  if (o.pid == null) a.ai = { type: 'swat', squad: o.squad || 'red', slot: o.slot || 0, mode: 'follow', st: 'idle' };
  return a;
}
export function spawnSuspect(S, w, x, z, L, prof, o = {}) {
  const P = SUSPECTS[prof] || SUSPECTS.thug;
  const r = S.rng;
  const p = cellPos(w, x, z, L);
  let wid = o.weapon || pickWeighted(r, P.weapons);
  if (wid === 'none') wid = null;
  const armored = rnd(r) < P.armor;
  const lo = { primary: wid ? { id: wid, ammo: 'ap' } : null, secondary: null, vest: armored ? 'light' : 'none', plate: 'kevlar', helmet: prof === 'pro' && rnd(r) < 0.3 ? 'helmet' : 'none' };
  const a = createActor(S, { kind: 'sus', team: 1, name: P.name, x: p.x, y: p.y, z: p.z, yaw: o.yaw ?? rnd(r) * Math.PI * 2, hp: 100, lo, h: 1.66 + rnd(r) * 0.24 });
  const m0 = P.morale[0], m1 = P.morale[1];
  a.ai = { type: 'sus', prof, morale: m0 + (m1 - m0) * rnd(r), aggr: P.aggr, hidden: rnd(r) < P.hidden, react: P.react, acc: P.acc, st: 'idle', home: [p.x, p.z], L, warned: 0, threatT: -1e9, training: !!P.training, active: !!P.active, guard: !!P.guard, hostage: o.hostage ?? null, wantHide: rnd(r) < P.hide, wantFlee: rnd(r) < P.flee, wantAmbush: rnd(r) < P.ambush };
  if (a.ai.hidden && !wid) { a.inv.w[1] = null; }
  // 隠し武器: 見えない拳銃を持つ（投降のふりから撃つ）
  if (a.ai.hidden) { a.inv.w[1] = { id: rndPick(r, ['m1911', 'makarov', 'g18']), att: { sight: 'iron', muzzle: 'none', grip: 'none', light: false }, am: 'ap', mode: 0, mag: 7, ch: 1, mags: [7], res: 0, hiddenGun: true }; }
  a.tag = o.tag || null;
  return a;
}
export function spawnCivilian(S, w, x, z, L, prof, o = {}) {
  const P = CIVILIANS[prof] || CIVILIANS.adult;
  const r = S.rng;
  const p = cellPos(w, x, z, L);
  const a = createActor(S, { kind: 'civ', team: 2, name: P.name, x: p.x, y: p.y, z: p.z, yaw: o.yaw ?? rnd(r) * Math.PI * 2, hp: 100, lo: {}, h: 1.58 + rnd(r) * 0.28 });
  a.ai = { type: 'civ', prof, comply: P.comply, stubborn: rnd(r) < P.stubborn, st: 'idle', home: [p.x, p.z], L, warned: 0, wantHide: rnd(r) < P.hide, wantFlee: rnd(r) < P.flee, slow: !!P.slow, bound: !!P.bound, morale: 0.5 };
  if (P.bound) { a.comply = 2; a.ai.st = 'bound'; }
  a.tag = o.tag || null;
  return a;
}
