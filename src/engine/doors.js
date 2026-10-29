// 扉: 開ける（向こうへ押す）・少し開ける・閉める・蹴る・ピッキング・ウェッジ・C2・破城槌・ブリーチングショットガン・ミラー・罠・バリケード
import { leafEnd, CS, LH } from './world.js';
import { hrand } from './rng.js';

export const OPEN_ANG = 1.62;   // 約93°
export const PEEK_ANG = 0.3;    // 約17°

export function makeDoorStates(w, def, rng) {
  return w.doors.map((d, i) => {
    const o = d.opt || {};
    return { ang: d.leaves.map(() => 0), tgt: d.leaves.map(() => 0), spd: d.leaves.map(() => 2.2), locked: !!o.locked, lockBroken: false, wedge: 0, trap: o.trap ? { armed: true, team: 1 } : null, broken: false, bar: 0, c2: null, kicks: 0, lastOp: -1, open: false };
  });
}

// 扉のどちら側にいるか（+1 = 法線の側）
export function sideOf(d, x, z) {
  const s = (x - d.cx) * d.nx + (z - d.cz) * d.nz;
  return s >= 0 ? 1 : -1;
}
// 扉の前（片側）の立つ位置
export function doorFront(d, side, dist = 0.8) {
  return [d.cx + d.nx * side * dist, d.cz + d.nz * side * dist];
}
export function isOpen(ds) { return ds.broken || ds.ang.some(a => Math.abs(a) > 0.6); }
export function isClosed(ds) { return !ds.broken && ds.ang.every(a => Math.abs(a) < 0.05); }

// 人の位置から、向こう側へ開く角度
function awayAngle(d, li, side, amt) {
  const lf = d.leaves[li];
  // +ang で +法線の側へ開く（lf.s で向きが決まる）。人が side にいるなら -side へ
  return -side * lf.s * amt;
}

// 操作。戻り値: { ok, why }
export function doorOp(S, w, a, did, op, ev, opt = {}) {
  const d = w.doors[did], ds = S.doors[did];
  if (!d || !ds) return { ok: false, why: 'none' };
  const side = sideOf(d, a.x, a.z);
  ds.lastOp = S.t;
  if (op === 'open' || op === 'peek') {
    if (ds.broken) return { ok: true };
    if (ds.bar > 0) { ev.push({ e: 'door', d: did, k: 'barred', id: a.id }); return { ok: false, why: 'barred' }; }
    if (ds.locked && !ds.lockBroken && isClosed(ds)) { ev.push({ e: 'door', d: did, k: 'locked', id: a.id }); return { ok: false, why: 'locked' }; }
    if (ds.wedge && isClosed(ds)) { ev.push({ e: 'door', d: did, k: 'wedged', id: a.id }); return { ok: false, why: 'wedged' }; }
    const amt = op === 'peek' ? PEEK_ANG : OPEN_ANG;
    for (let li = 0; li < d.leaves.length; li++) { ds.tgt[li] = awayAngle(d, li, side, amt); ds.spd[li] = op === 'peek' ? 0.8 : 2.0; }
    if (op === 'open' && ds.trap && ds.trap.armed && trapTrips(S, ds, a)) triggerTrap(S, w, did, a, ev);
    ev.push({ e: 'door', d: did, k: op, id: a.id, loud: op === 'peek' ? 0.1 : 0.3 });
    return { ok: true };
  }
  if (op === 'close') {
    if (ds.broken) return { ok: false, why: 'broken' };
    for (let li = 0; li < d.leaves.length; li++) { ds.tgt[li] = 0; ds.spd[li] = 2.2; }
    ev.push({ e: 'door', d: did, k: 'close', id: a.id, loud: 0.35 });
    return { ok: true };
  }
  if (op === 'kick') {
    if (ds.broken) return { ok: false };
    if (ds.bar > 0) { ds.bar = Math.max(0, ds.bar - 20); ev.push({ e: ds.bar > 0 ? 'barhit' : 'barbreak', d: did, id: a.id }); return { ok: true }; }
    ds.kicks++;
    let opens = true;
    if (ds.wedge) opens = false;
    else if (ds.locked && !ds.lockBroken) opens = ds.kicks >= 3 || hrand(did, S.t, a.id) < 0.4;
    ev.push({ e: 'door', d: did, k: opens ? 'kickopen' : 'kickfail', id: a.id, loud: 1.0 });
    if (opens) {
      ds.lockBroken = true;
      for (let li = 0; li < d.leaves.length; li++) { ds.tgt[li] = awayAngle(d, li, side, OPEN_ANG + 0.05); ds.spd[li] = 7.5; }
      if (ds.trap && ds.trap.armed && trapTrips(S, ds, a)) triggerTrap(S, w, did, a, ev);
      awe(S, w, d, -side, 0.12, 0, ev);
    }
    return { ok: opens, why: opens ? '' : (ds.wedge ? 'wedged' : 'held') };
  }
  if (op === 'ram') {
    if (ds.broken) return { ok: false };
    ds.lockBroken = true; ds.locked = false; ds.wedge = 0;
    if (ds.bar > 0) { ds.bar = 0; ev.push({ e: 'barbreak', d: did, id: a.id }); }
    for (let li = 0; li < d.leaves.length; li++) { ds.tgt[li] = awayAngle(d, li, side, OPEN_ANG + 0.1); ds.spd[li] = 10; }
    ev.push({ e: 'door', d: did, k: 'ram', id: a.id, loud: 1.0 });
    if (ds.trap && ds.trap.armed) triggerTrap(S, w, did, a, ev);
    // すぐ後ろの人を怯ませる
    awe(S, w, d, -side, 0.3, 1.6, ev);
    return { ok: true };
  }
  if (op === 'breach') {
    if (ds.broken) return { ok: false };
    ds.lockBroken = true; ds.locked = false; ds.wedge = 0;
    if (ds.trap) { ds.trap = null; ev.push({ e: 'trapoff', d: did }); }
    for (let li = 0; li < d.leaves.length; li++) { ds.tgt[li] = awayAngle(d, li, side, 0.9); ds.spd[li] = 6; }
    ev.push({ e: 'door', d: did, k: 'breach', id: a.id, loud: 1.0 });
    awe(S, w, d, -side, 0.18, 0.4, ev);
    return { ok: true };
  }
  if (op === 'unlock') { ds.locked = false; ev.push({ e: 'door', d: did, k: 'unlock', id: a.id, loud: 0.15 }); return { ok: true }; }
  if (op === 'wedge') { if (!isClosed(ds)) return { ok: false, why: 'open' }; ds.wedge = side; ev.push({ e: 'door', d: did, k: 'wedge', id: a.id, loud: 0.15 }); return { ok: true }; }
  if (op === 'unwedge') { ds.wedge = 0; ev.push({ e: 'door', d: did, k: 'unwedge', id: a.id, loud: 0.1 }); return { ok: true }; }
  if (op === 'disarm') { if (ds.trap) { ds.trap = null; ev.push({ e: 'trapoff', d: did, id: a.id }); } return { ok: true }; }
  if (op === 'c2') { ds.c2 = { owner: a.id, side, t: S.t }; ev.push({ e: 'c2set', d: did, id: a.id }); return { ok: true }; }
  if (op === 'bar') { if (!isClosed(ds) && !ds.broken) { for (let li = 0; li < d.leaves.length; li++) { ds.tgt[li] = 0; ds.ang[li] = 0; } } ds.bar = 60; ev.push({ e: 'barset', d: did, id: a.id }); return { ok: true }; }
  if (op === 'unbar') { ds.bar = 0; ev.push({ e: 'barbreak', d: did, id: a.id, pry: 1 }); return { ok: true }; }
  if (op === 'trap') { ds.trap = { armed: true, team: a.team, by: a.id }; ev.push({ e: 'trapset', d: did, id: a.id }); return { ok: true }; }
  return { ok: false, why: 'op' };
}

function trapTrips(S, ds, a) { return !ds.trap.team || ds.trap.team !== a.team || !S.pvp; }

export function triggerTrap(S, w, did, a, ev) {
  const d = w.doors[did], ds = S.doors[did];
  ds.trap = null;
  const L = d.L;
  ev.push({ e: 'trap', d: did, id: a ? a.id : -1 });
  S.blasts.push({ x: d.cx, y: L * LH + 1.0, z: d.cz, r: 4.0, dmg: 140, kind: 'frag', by: ds.trapBy ?? -1, door: did, t: 0.25 });
}

// 扉の向こうの人を怯ませる（槌・C2・蹴り）
function awe(S, w, d, side, morale, stun, ev) {
  for (const b of S.actors) {
    if (!b.alive || b.down || Math.abs(b.y - d.L * LH) > 1.5) continue;
    const s = (b.x - d.cx) * d.nx + (b.z - d.cz) * d.nz;
    if (s * side <= 0) continue;
    const dist = Math.hypot(b.x - d.cx, b.z - d.cz);
    if (dist > 2.2) continue;
    if (stun) b.stun = Math.max(b.stun, stun * (1 - dist / 2.6));
    if (b.ai && b.ai.morale != null) b.ai.morale -= morale;
  }
}

// 扉の動き（人にぶつかったら止まる）
export function stepDoors(S, w, dt, ev) {
  for (let i = 0; i < w.doors.length; i++) {
    const d = w.doors[i], ds = S.doors[i];
    if (ds.broken) continue;
    for (let li = 0; li < d.leaves.length; li++) {
      const cur = ds.ang[li], tgt = ds.tgt[li];
      if (cur === tgt) continue;
      const step = ds.spd[li] * dt;
      let nxt = Math.abs(tgt - cur) <= step ? tgt : cur + Math.sign(tgt - cur) * step;
      // 人に当たるか
      const lf = d.leaves[li];
      const [ex, ez] = leafEnd(lf, nxt);
      let blocked = null;
      for (const a of S.actors) {
        if (a.dead || a.isDrone || Math.abs(a.y - d.L * LH) > 1.2) continue;
        if (Math.hypot(a.x - lf.hx, a.z - lf.hz) > lf.len + 0.35) continue;
        if (segDist(a.x, a.z, lf.hx, lf.hz, ex, ez) < 0.27) { blocked = a; break; }
      }
      if (blocked) {
        if (ds.spd[li] > 5) { // 蹴った扉は人をはね飛ばす
          blocked.stun = Math.max(blocked.stun, 0.8);
          if (blocked.ai && blocked.ai.morale != null) blocked.ai.morale -= 0.15;
          ds.tgt[li] = nxt = cur;
        } else { ds.tgt[li] = cur; nxt = cur; }
      }
      ds.ang[li] = nxt;
    }
    ds.open = isOpen(ds);
  }
}
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1e-9;
  let t = ((px - ax) * vx + (pz - az) * vz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}

// C2 を起爆: 扉は壊れ、扉の前85°・2.56mは致死、100°・12mは怯み
export function detonateC2(S, w, did, ev) {
  const d = w.doors[did], ds = S.doors[did];
  if (!ds || !ds.c2) return false;
  const c2 = ds.c2; ds.c2 = null;
  ds.broken = true; ds.wedge = 0; ds.locked = false; ds.lockBroken = true; ds.bar = 0;
  if (ds.trap) { ds.trap = null; }
  ev.push({ e: 'c2', d: did, x: d.cx, y: d.L * LH + 1.0, z: d.cz, by: c2.owner });
  const side = -c2.side;
  for (const b of S.actors) {
    if (!b.alive || Math.abs(b.y - d.L * LH) > 1.6) continue;
    const rx = b.x - d.cx, rz = b.z - d.cz, dist = Math.hypot(rx, rz);
    const s = (rx * d.nx + rz * d.nz) * side;
    if (s <= 0.05 && dist > 0.8) {
      // 手前側（置いた側）: 近いと耳と少しの怯み
      if (dist < 4) { b.deaf = Math.max(b.deaf, 2); b.stun = Math.max(b.stun, 0.3); }
      continue;
    }
    const cosA = s / Math.max(0.01, dist);
    if (dist <= 2.56 && cosA >= Math.cos(85 / 2 * Math.PI / 180)) {
      S.blasts.push({ x: d.cx, y: d.L * LH + 1.0, z: d.cz, r: 2.9, dmg: 160, kind: 'c2', by: c2.owner, only: b.id, t: 0 });
    } else if (dist <= 12 && cosA >= Math.cos(100 / 2 * Math.PI / 180)) {
      const k = 1 - dist / 12;
      b.stun = Math.max(b.stun, 1.2 + 3.0 * k);
      b.deaf = Math.max(b.deaf, 3 + 4 * k);
      if (b.ai && b.ai.morale != null) b.ai.morale -= 0.25 + 0.35 * k;
    }
  }
  // 扉のまわりの石膏の壁も少し壊れる
  return true;
}
