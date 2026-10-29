// 投げ物と爆発: 閃光・スティンガー・CSガス・罠（破片）・C2・壁用の爆破薬。ガスの雲。
import { raycast, los, CS, LH, levelOfY, NB } from './world.js';
import { hrand } from './rng.js';
import { eyeOf, hurt, killActor, pvpDamage, damageBlock, breakGlass, downActor } from './combat.js';
import { M, MATS } from './data/materials.js';

const _rc = { out: [], seenProp: new Set(), seenDoor: new Set() };

export function throwNade(S, a, type, power, ev) {
  const eye = eyeOf(S, a);
  const cp = Math.cos(a.pitch + 0.12), v = 4 + 9 * Math.max(0.15, Math.min(1, power));
  const dx = Math.sin(a.yaw) * cp, dy = Math.sin(a.pitch + 0.12), dz = Math.cos(a.yaw) * cp;
  const n = { id: S.nextItem++, type, x: eye[0] + dx * 0.3, y: eye[1] - 0.1, z: eye[2] + dz * 0.3, vx: dx * v + a.vx * 0.5, vy: dy * v + 1.2, vz: dz * v + a.vz * 0.5, t: 0, fuse: type === 'cs' ? 1.6 : 1.5, by: a.id, team: a.team, rest: false };
  S.nades.push(n);
  a.throwT = 1;
  ev.push({ e: 'throw', id: a.id, type, n: n.id });
  return n;
}
// M320 の弾: まっすぐ速く飛び、当たったら作動
export function launchNade(S, a, type, ev) {
  const eye = eyeOf(S, a);
  const cp = Math.cos(a.pitch), v = 55;
  const dx = Math.sin(a.yaw) * cp, dy = Math.sin(a.pitch), dz = Math.cos(a.yaw) * cp;
  S.nades.push({ id: S.nextItem++, type, x: eye[0] + dx * 0.5, y: eye[1] - 0.05, z: eye[2] + dz * 0.5, vx: dx * v, vy: dy * v + 1.5, vz: dz * v, t: 0, fuse: 9, impact: true, by: a.id, team: a.team });
  ev.push({ e: 'launch', id: a.id, type });
}

export function stepNades(S, w, dt, ev) {
  for (let i = S.nades.length - 1; i >= 0; i--) {
    const n = S.nades[i];
    n.t += dt;
    if (!n.rest) {
      n.vy -= 9.81 * dt;
      const sp = Math.hypot(n.vx, n.vy, n.vz);
      if (sp > 0.05) {
        const L = sp * dt, dx = n.vx / sp, dy = n.vy / sp, dz = n.vz / sp;
        const hits = raycast(w, n.x, n.y, n.z, dx, dy, dz, L + 0.06, S.doors, _rc);
        let h = null;
        for (const x of hits) { const m = MATS[x.mat]; if (x.mat === M.GLASSBROKEN) continue; if (x.mat === M.GLASS) { breakGlass(S, w, x, ev); continue; } h = x; break; }
        if (h) {
          const t = Math.max(0, h.t0 - 0.06);
          n.x += dx * t; n.y += dy * t; n.z += dz * t;
          if (n.impact) { n.t = n.fuse; }
          else {
            // 跳ね返り
            const nx = h.nx || 0, ny = h.ny || 0, nz = h.nz || 0;
            const vd = n.vx * nx + n.vy * ny + n.vz * nz;
            n.vx -= 1.6 * vd * nx; n.vy -= 1.6 * vd * ny; n.vz -= 1.6 * vd * nz;
            n.vx *= 0.45; n.vy *= 0.45; n.vz *= 0.45;
            if (ny > 0.6 && Math.abs(n.vy) < 1.2) { n.vy = 0; n.vx *= 0.6; n.vz *= 0.6; if (Math.hypot(n.vx, n.vz) < 0.3) n.rest = true; }
            ev.push({ e: 'bounce', n: n.id, x: n.x, y: n.y, z: n.z, v: sp });
          }
        } else { n.x += n.vx * dt; n.y += n.vy * dt; n.z += n.vz * dt; }
      }
    }
    if (n.t >= n.fuse) { detonate(S, w, n, ev); S.nades.splice(i, 1); }
  }
}

function detonate(S, w, n, ev) {
  const by = S.byId[n.by];
  ev.push({ e: 'nade', type: n.type, x: n.x, y: n.y, z: n.z, by: n.by });
  if (n.type === 'flash') {
    for (const a of S.actors) {
      if (!a.alive || a.isDrone) continue;
      const eye = eyeOf(S, a);
      const dx = n.x - eye[0], dy = n.y - eye[1], dz = n.z - eye[2], d = Math.hypot(dx, dy, dz);
      if (d > 12) continue;
      const see = los(w, eye[0], eye[1], eye[2], n.x, n.y + 0.05, n.z, S.doors);
      // 見ている向き
      const cp = Math.cos(a.pitch), fx = Math.sin(a.yaw) * cp, fy = Math.sin(a.pitch), fz = Math.cos(a.yaw) * cp;
      const facing = (dx * fx + dy * fy + dz * fz) / Math.max(0.01, d);
      let k = (1 - d / 12) * (see ? (facing > 0.3 ? 1 : facing > -0.3 ? 0.65 : 0.35) : (d < 3 ? 0.25 : 0));
      if (a.armor && a.armor.head === 'goggles') k *= 0.4;
      if (k <= 0.02) { if (d < 8) a.deaf = Math.max(a.deaf, 1.5); continue; }
      a.flash = Math.max(a.flash, 0.8 + 4.5 * k);
      a.deaf = Math.max(a.deaf, 2 + 4 * k);
      if (a.ai) { a.stun = Math.max(a.stun, 1.5 + 4 * k); if (a.ai.morale != null) a.ai.morale -= 0.4 * k + 0.1; }
      ev.push({ e: 'flashed', id: a.id, k });
    }
  } else if (n.type === 'stinger') {
    for (const a of S.actors) {
      if (!a.alive || a.isDrone) continue;
      const d = Math.hypot(a.x - n.x, a.y + 1 - n.y, a.z - n.z);
      if (d > 5.5) continue;
      if (!los(w, n.x, n.y + 0.1, n.z, a.x, a.y + 1.0, a.z, S.doors)) continue;
      const k = 1 - d / 5.5;
      a.stun = Math.max(a.stun, (a.ai ? 1.5 : 0.6) + 2.5 * k);
      a.deaf = Math.max(a.deaf, 1.5);
      if (a.ai && a.ai.morale != null) a.ai.morale -= 0.25 + 0.25 * k;
      const dmg = 3 + 7 * k;
      if (S.pvp) pvpDamage(S, a, dmg, by, 'chest', a.x - n.x, a.z - n.z, ev, 'stinger');
      else hurt(S, w, a, dmg, 'chest', by, null, a.x - n.x, a.z - n.z, ev, 'less');
      ev.push({ e: 'stung', id: a.id, k });
      if (by && !S.pvp) S.harms.push({ t: S.t, by: by.id, tgt: a.id, how: 'less', d: dmg, part: 'chest', kind: a.kind, threat: a.ai ? (S.t - (a.ai.threatT ?? -1e9)) * S.dt < 2 : false, warned: a.ai ? a.ai.warned || 0 : 0, armed: !!(a.inv.w[0] || a.inv.w[1]), comply: a.comply, cuffed: a.cuffed, down: a.down });
    }
  } else if (n.type === 'cs') {
    S.clouds.push({ x: n.x, y: n.y, z: n.z, r: 0.5, max: 4.6, t: 20, type: 'cs', L: levelOfY(n.y) });
  } else if (n.type === 'frag') {
    S.blasts.push({ x: n.x, y: n.y + 0.2, z: n.z, r: 5, dmg: 150, kind: 'frag', by: n.by, t: 0 });
  }
}

// ガスの雲: 広がって薄れる。中の人（マスクなし）に効く
export function stepClouds(S, w, dt, ev) {
  for (let i = S.clouds.length - 1; i >= 0; i--) {
    const c = S.clouds[i];
    c.t -= dt;
    c.r = Math.min(c.max, c.r + dt * 1.6);
    if (c.t <= 0) { S.clouds.splice(i, 1); continue; }
    if (S.t % 6 !== 0) continue;
    for (const a of S.actors) {
      if (!a.alive || a.isDrone) continue;
      const d = Math.hypot(a.x - c.x, (a.y + 1.4) - c.y, a.z - c.z);
      if (d > c.r) continue;
      if (a.armor && a.armor.head === 'gasmask') continue;
      // 壁の向こうには届かない
      if (!los(w, c.x, c.y + 0.2, c.z, a.x, a.y + 1.4, a.z, S.doors)) continue;
      const k = c.type === 'pepper' ? 0.6 : 1;
      a.gas = Math.max(a.gas, 4 * k);
      if (a.ai) { if (a.ai.morale != null) a.ai.morale -= 0.05 * k; a.ai.gasCough = 1; }
    }
  }
}

// 爆発（罠・C2・壁の爆破薬）: 見通しのある人にダメージ、石膏の壁を壊す
export function stepBlasts(S, w, dt, ev) {
  for (let i = S.blasts.length - 1; i >= 0; i--) {
    const b = S.blasts[i];
    b.t -= dt;
    if (b.t > 0) continue;
    S.blasts.splice(i, 1);
    const by = S.byId[b.by];
    if (b.kind !== 'c2') ev.push({ e: 'boom', x: b.x, y: b.y, z: b.z, kind: b.kind, r: b.r });
    for (const a of S.actors) {
      if (!a.alive) continue;
      if (b.only != null && a.id !== b.only) continue;
      const d = Math.hypot(a.x - b.x, a.y + 0.9 - b.y, a.z - b.z);
      if (d > b.r) continue;
      if (!los(w, b.x, b.y, b.z, a.x, a.y + 0.9, a.z, S.doors) && !los(w, b.x, b.y, b.z, a.x, a.y + 1.6, a.z, S.doors)) continue;
      const k = Math.pow(1 - d / b.r, 1.3);
      const dmg = b.dmg * k;
      a.stun = Math.max(a.stun, 1.5 * k + 0.5); a.deaf = Math.max(a.deaf, 4);
      if (S.pvp) pvpDamage(S, a, dmg, by, 'chest', a.x - b.x, a.z - b.z, ev, 'blast');
      else {
        let dd = dmg;
        if (a.armor && a.armor.vest !== 'none') dd *= 0.75;
        if (a.kind === 'swat' && a.pid != null && by && by.kind === 'sus') dd = Math.min(dd, 95);
        hurt(S, w, a, dd, 'chest', by, null, a.x - b.x, a.z - b.z, ev, 'blast');
        if (by) S.harms.push({ t: S.t, by: by.id, tgt: a.id, how: 'blast', d: dd, part: 'chest', kind: a.kind, threat: a.ai ? (S.t - (a.ai.threatT ?? -1e9)) * S.dt < 2 : false, warned: a.ai ? a.ai.warned || 0 : 0, armed: !!(a.inv.w[0] || a.inv.w[1]), comply: a.comply, cuffed: a.cuffed, down: a.down });
      }
      if (a.ai && a.ai.morale != null) a.ai.morale -= 0.4 * k;
    }
    // 壁（石膏・木）を壊す
    if (b.kind === 'c2' || b.kind === 'frame' || b.kind === 'frag') {
      const R = b.kind === 'frame' ? 1.4 : b.kind === 'c2' ? 0.9 : 0.6;
      const L = levelOfY(b.y - 1);
      for (let j = Math.floor((b.z - R) / CS); j <= Math.floor((b.z + R) / CS); j++) for (let ii = Math.floor((b.x - R) / CS); ii <= Math.floor((b.x + R) / CS); ii++) {
        if (ii < 0 || j < 0 || ii >= w.W || j >= w.D) continue;
        const k = w.idx(L, ii, j);
        for (let q = 0; q < NB; q++) {
          const y = L * LH + q * 0.7 + 0.35;
          const d = Math.hypot((ii + 0.5) * CS - b.x, y - b.y, (j + 0.5) * CS - b.z);
          if (d > R + 0.35) continue;
          if (b.kind === 'frame' && S.reinf && S.reinf[k]) { S.reinf[k] = 0; }
          damageBlock(S, w, k, q, b.kind === 'frame' ? 999 : b.kind === 'c2' ? 160 : 60, ev);
          if (w.blocks[k * NB + q] === M.GLASS) breakGlass(S, w, { k, q }, ev);
        }
      }
    }
  }
}
