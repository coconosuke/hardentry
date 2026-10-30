// 弾と当たり: 弾丸は速さと重力を持ち、1ステップごとの線分で当たりを調べる。材質を貫通して弱まる（RoNの式）。
// ダメージは PvE（RoN換算・防具・負傷・出血）と PvP（R6寄り・頭は即死・手足75%・ダウン）の2系統。
import { raycast, CS, levelOfY } from './world.js';
import { MATS, M, BODY_PEN } from './data/materials.js';
import { WEAPONS, AMMO } from './data/weapons.js';
import { PLATE, HELMET } from './data/equipment.js';
import { computePose, hitCapsules, rayCapsule, POSE_LEN, NBONE } from './pose.js';
import { holdOf, poseState } from './actor.js';
import { hrand } from './rng.js';

const G = 9.81;
// モードのきまり（engine が入れる）: canDown(S, a)
export const hooks = { canDown: null };
const _rc = { out: [], seenProp: new Set(), seenDoor: new Set() };
const _bones = new Float32Array(NBONE * 12);

// 姿勢の入力（エンジンの人 → pose.js）
export function poseInput(a, o = {}) {
  o.x = a.x; o.y = a.y; o.z = a.z; o.yaw = a.yaw; o.pitch = a.pitch + (a.ws ? a.ws.rp * Math.PI / 180 : 0); o.h = a.h;
  o.stance = a.st; o.lean = a.lean; o.moveX = a.mvx; o.moveZ = a.mvz; o.phase = a.phase;
  o.hold = holdOf(a); o.ads = a.ads; o.low = Math.max(a.low, a.sprint ? 0 : 0); o.reload = a.ws && a.ws.st === 'reload' && a.ws.rd ? 1 - a.ws.t / a.ws.rd : -1;
  o.fire = a.fireK || 0; o.state = poseState(a); o.stateT = a.stateT; o.fallYaw = a.fallYaw; o.seed = a.look ? a.look.seed : 0; o.throwT = a.throwT;
  return o;
}
const _pi = {};
// 人の当たりのカプセル（そのステップで1回だけ計算）
export function capsOf(S, a) {
  if (a._capT === S.t && a._caps) return a._caps;
  const r = computePose(poseInput(a, _pi), _bones);
  a._caps = hitCapsules(_bones, POSE_LEN, r.s, a._caps || []);
  a._eye = r.eye;
  a._capT = S.t;
  return a._caps;
}
export function eyeOf(S, a) {
  if (a._capT === S.t && a._eye) return a._eye;
  capsOf(S, a);
  return a._eye;
}

export function spawnBullet(S, a, W, wi, am, dx, dy, dz, m, extraPellet) {
  const eye = eyeOf(S, a);
  const v = (W.vel || 400) * (m ? m.vel : 1);
  const b = {
    x: eye[0], y: eye[1], z: eye[2], vx: dx * v, vy: dy * v, vz: dz * v,
    pen: am.pen, pen0: Math.max(1, am.pen), k: 1, owner: a.id, team: a.team, wid: wi.id, cal: W.cal, am: wi.am,
    t: 0, dist: 0, pellet: !!am.pellets, tr: !extraPellet && (a.stats.sh % 3 === 0 || W.cat === 'pistol' || W.cat === 'shotgun'),
    lag: a.lag || 0, skip: a.id, less: !!W.less,
  };
  S.bullets.push(b);
  return b;
}

// すべての弾を1ステップ進める
export function stepBullets(S, w, dt, ev) {
  const B = S.bullets;
  for (let i = B.length - 1; i >= 0; i--) {
    const b = B[i];
    if (!stepBullet(S, w, b, dt, ev)) { B[i] = B[B.length - 1]; B.pop(); }
  }
}

function stepBullet(S, w, b, dt, ev) {
  b.t += dt;
  if (b.t > 2.0 || b.dist > 400) return false;
  const vx = b.vx, vy = b.vy - G * dt * 0.5, vz = b.vz;
  const sp = Math.hypot(vx, vy, vz);
  const segL = sp * dt;
  const dx = vx / sp, dy = vy / sp, dz = vz / sp;
  // 世界との当たり
  const hits = raycast(w, b.x, b.y, b.z, dx, dy, dz, segL, S.doors, _rc).slice();
  // 人との当たり
  for (const a of S.actors) {
    if (a.id === b.skip && b.dist < 2) continue;
    if (!a.alive && !a.dead) continue;
    if (a.isDrone) {
      const t = raySphere(b.x, b.y, b.z, dx, dy, dz, segL, a.x, a.y + 0.08, a.z, 0.16);
      if (t >= 0) hits.push({ t0: t, t1: t + 0.1, kind: 'actor', a, part: 'drone' });
      continue;
    }
    // おおまかな判定（体を包む球）
    const cx = a.x, cy = a.y + 0.9, cz = a.z;
    const ox = cx - b.x, oy = cy - b.y, oz = cz - b.z;
    const tc = ox * dx + oy * dy + oz * dz;
    if (tc < -1.3 || tc > segL + 1.3) continue;
    const d2 = ox * ox + oy * oy + oz * oz - tc * tc;
    if (d2 > 1.6 * 1.6) {
      continue;
    }
    // 近くを抜けた（制圧）
    if (a.alive && a.team !== b.team && d2 < 2.2 && a.id !== b.owner) { a._whiz = Math.max(a._whiz || 0, 1 - Math.sqrt(d2) / 1.5); a.whizBy = b.owner; a.whizT = S.t; }
    const caps = capsOf(S, a);
    let best = -1, bp = null;
    for (const c of caps) {
      const t = rayCapsule(b.x, b.y, b.z, dx, dy, dz, segL, c.a, c.b, c.r);
      if (t >= 0 && (best < 0 || t < best)) { best = t; bp = c; }
    }
    if (best >= 0) hits.push({ t0: best, t1: best + 0.25, kind: 'actor', a, part: bp.part, cap: bp });
  }
  hits.sort((p, q) => p.t0 - q.t0);
  for (const h of hits) {
    if (h.t0 > segL) break;
    const hx = b.x + dx * h.t0, hy = b.y + dy * h.t0, hz = b.z + dz * h.t0;
    if (h.kind === 'actor') {
      const a = h.a;
      if (a.alive || a.dead) {
        const dist = b.dist + h.t0;
        applyBulletHit(S, w, a, b, h.part, hx, hy, hz, dx, dy, dz, dist, ev);
        if (b.less) return false;
        b.pen -= BODY_PEN;
        b.k = Math.max(0, b.pen / b.pen0);
        if (b.pen <= 0) { return false; }
        b.skip = a.id;
      }
      continue;
    }
    const mat = MATS[h.mat];
    if (!mat) continue;
    if (h.kind === 'edge') return false;
    // 割れる物
    if (h.mat === M.GLASS) { breakGlass(S, w, h, ev); b.pen -= 30; b.k = Math.max(0.05, b.pen / b.pen0); continue; }
    if (h.mat === M.GLASSBROKEN) continue;
    if (h.kind === 'bar') { damageBarricade(S, w, h.id, b.pellet ? 3 : 1, ev); }
    if (h.kind === 'block' && mat.hp > 0 && b.pellet && b.dist < 6) { damageBlock(S, w, h.k, h.q, 8, ev); }
    const thick = Math.min(1.5, Math.max(0.01, h.t1 - h.t0));
    const cost = h.kind === 'slab' || h.kind === 'stair' ? 1e9 : mat.pen * thick;
    const stop = b.less || cost >= b.pen;
    ev.push({ e: 'imp', x: hx, y: hy, z: hz, nx: h.nx || 0, ny: h.ny || 0, nz: h.nz || 0, m: h.mat, k: h.kind, pen: !stop, o: b.owner, w: b.wid });
    if (stop) {
      // 跳ね返りは小さい音だけ
      return false;
    }
    b.pen -= cost;
    b.k = Math.max(0.05, b.pen / b.pen0);
    // 出口
    ev.push({ e: 'imp', x: b.x + dx * h.t1, y: b.y + dy * h.t1, z: b.z + dz * h.t1, nx: dx, ny: dy, nz: dz, m: h.mat, k: h.kind, exit: 1, o: b.owner });
  }
  b.x += dx * segL; b.y += dy * segL; b.z += dz * segL;
  b.vy -= G * dt; b.dist += segL;
  return true;
}

function raySphere(ox, oy, oz, dx, dy, dz, maxT, cx, cy, cz, r) {
  const lx = ox - cx, ly = oy - cy, lz = oz - cz;
  const bq = lx * dx + ly * dy + lz * dz, cq = lx * lx + ly * ly + lz * lz - r * r;
  const h = bq * bq - cq; if (h < 0) return -1;
  const t = -bq - Math.sqrt(h); return t >= 0 && t <= maxT ? t : -1;
}

export function breakGlass(S, w, h, ev) {
  const k = h.k, q = h.q;
  if (k == null) return;
  // 同じ窓のガラスはまとめて割れる
  const b = k * 4;
  let any = false;
  for (let qq = 0; qq < 4; qq++) if (w.blocks[b + qq] === M.GLASS) { w.blocks[b + qq] = M.GLASSBROKEN; any = true; }
  if (any) { S.bdiff[k] = 1; ev.push({ e: 'glass', k, x: h.x, q }); }
}

// 壁のブロックを傷める（散弾・爆発）。壊れたら穴になる
export function damageBlock(S, w, k, q, dmg, ev) {
  const bi = k * 4 + q;
  const m = w.blocks[bi];
  if (!m || !MATS[m] || !MATS[m].hp) return false;
  if (S.reinf && S.reinf[k]) return false;
  const hp = w.bhp[bi] - dmg;
  if (hp > 0) { w.bhp[bi] = hp; return false; }
  w.blocks[bi] = 0; w.bhp[bi] = 0;
  S.bdiff[k] = 1;
  ev.push({ e: 'block', k, q, m });
  return true;
}

export function damageBarricade(S, w, did, dmg, ev) {
  const ds = S.doors[did];
  if (!ds || ds.bar <= 0) return;
  ds.bar -= dmg;
  if (ds.bar <= 0) { ds.bar = 0; ev.push({ e: 'barbreak', d: did }); }
  else ev.push({ e: 'barhit', d: did });
}

// ---- ダメージ ----
// 部位が防具に覆われているか: 胸は前と後ろ（撃たれた向き）、重いベストは腹と脇も
function plateSide(a, dx, dz) {
  // 弾の向きと体の前の内積: 正なら後ろから
  const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
  return dx * fx + dz * fz > 0 ? 'back' : 'front';
}

export function applyBulletHit(S, w, a, b, part, hx, hy, hz, dx, dy, dz, dist, ev) {
  const shooter = S.byId[b.owner];
  const W = WEAPONS[b.wid];
  if (part === 'drone') { killDrone(S, a, b.owner, ev); return; }
  if (a.dead) { ev.push({ e: 'blood', x: hx, y: hy, z: hz, dx, dy, dz, n: 1, id: a.id }); return; }
  if (S.pvp) return applyPvP(S, w, a, b, shooter, W, part, hx, hy, hz, dx, dy, dz, dist, ev);
  return applyPvE(S, w, a, b, shooter, W, part, hx, hy, hz, dx, dy, dz, dist, ev);
}

function applyPvE(S, w, a, b, shooter, W, part, hx, hy, hz, dx, dy, dz, dist, ev) {
  const am = AMMO[b.cal][b.am];
  const rnd = (k) => hrand(a.id, S.t, k + (b.owner << 4));
  // 非致死
  if (am.less) {
    const L = am.less;
    if (L.tase) {
      const range = W.range || 7.6;
      if (dist <= range) { a.tased = L.tase; a.stun = Math.max(a.stun, L.tase); ev.push({ e: 'tase', id: a.id, by: b.owner }); harm(S, a, shooter, 'less', 0, part, ev); }
      return;
    }
    let st = L.stun;
    if (part === 'head') st *= 1.6;
    a.stun = Math.max(a.stun, st);
    if (a.ai) a.ai.morale = Math.max(0, (a.ai.morale ?? 0.5) - L.morale);
    if (L.gas) S.clouds.push({ x: hx, y: hy, z: hz, r: 0.9, t: 3.5, type: 'pepper', max: 1.2 });
    let d = am.dmg * (part === 'head' ? (dist < 3 ? 6 : 2.5) : 1);
    if (d > 0) hurt(S, w, a, d, part, shooter, b, dx, dz, ev, 'less');
    ev.push({ e: 'hit', id: a.id, by: b.owner, part, d, less: 1, x: hx, y: hy, z: hz });
    harm(S, a, shooter, 'less', d, part, ev);
    return;
  }
  let d = am.dmg * b.k;
  let blocked = false, pen = true;
  const ar = a.armor;
  // 部位の倍率
  if (part === 'head') {
    // 顔か頭の上・後ろか
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    const face = (-dx * fx - dz * fz) > 0.45 && dy > -0.6;
    if (face && ar.face > 0) { ar.face--; if (rnd(1) < 0.33 || am.apen < 3) { blocked = true; d *= 0.08; ev.push({ e: 'rico', id: a.id, x: hx, y: hy, z: hz }); } }
    else if (!face && ar.helm > 0) { ar.helm--; blocked = true; d *= 0.06; if (rnd(2) < (HELMET[ar.helmet] || HELMET.none).rico) d = 0; ev.push({ e: 'rico', id: a.id, x: hx, y: hy, z: hz }); }
    if (!blocked) d *= am.head;
  } else if (part === 'neck') d *= 1.4;
  else if (part === 'arm' || part === 'leg') d *= am.limb;
  else {
    // 胴: 防具
    const cov = { none: [], light: ['chest'], heavy: ['chest', 'belly', 'pelvis'] }[ar.vest] || [];
    if (cov.includes(part)) {
      const P = PLATE[ar.plate];
      const side = plateSide(a, dx, dz);
      if (am.apen > P.prot) { d *= 0.85; }
      else {
        pen = false;
        const key = side === 'back' ? 'pb' : 'pf';
        if (P.hits > 0 && ar[key] > 0) { ar[key]--; d *= 0; blocked = true; ev.push({ e: 'plate', id: a.id, left: ar[key], side, x: hx, y: hy, z: hz }); }
        else d *= 1 - (P.hits > 0 ? P.after : P.red);
        if (P.spall && rnd(3) < 0.25) { d += 4; }
      }
    }
  }
  // 容疑者 → 隊員（人）の1発の上限（RoN: ふつう70/むずかしい80 → ×0.625）
  if (shooter && shooter.kind === 'sus' && a.kind === 'swat' && a.pid != null) d = Math.min(d, S.rules.cap || 44);
  // 怯み（容疑者と市民だけ）
  if (a.kind !== 'swat' && a.ai) { a.ai.stagger = Math.max(a.ai.stagger || 0, blocked ? 0.7 : 0.45); if (a.ai.morale != null) a.ai.morale -= blocked ? 0.15 : 0.08; }
  // 負傷と出血（隊員と、撃たれて生き残った人）
  if (d > 0 && !blocked) {
    if (part === 'arm') a.inj.arm = 1;
    if (part === 'leg') a.inj.leg = Math.min(4, a.inj.leg + 1);
    if (pen && (part === 'arm' || part === 'leg' || part === 'belly' || part === 'chest' || part === 'pelvis') && rnd(4) < 0.28) a.bleed = Math.max(a.bleed, 1.9);
  }
  if (d > 0) ev.push({ e: 'blood', x: hx, y: hy, z: hz, dx, dy, dz, n: Math.min(4, 1 + d / 30), id: a.id });
  // エイムパンチ（受けたダメージで決まる）
  a.flinch = Math.max(a.flinch, Math.min(1, 1 - Math.exp(-d / 30)));
  ev.push({ e: 'hit', id: a.id, by: b.owner, part, d, blocked, x: hx, y: hy, z: hz });
  if (d > 0) hurt(S, w, a, d, part, shooter, b, dx, dz, ev, 'bullet');
  harm(S, a, shooter, 'gun', d, part, ev);
}

// 体力を減らし、倒れる・死ぬを決める
export function hurt(S, w, a, d, part, shooter, b, dx, dz, ev, kind) {
  if (!a.alive) return;
  a.hp -= d;
  if (shooter) { a.dmgBy[shooter.id] = (a.dmgBy[shooter.id] || 0) + d; shooter.stats.dmg += d; if (shooter.id !== a.id) shooter.stats.hi++; }
  a.lastHit = { by: shooter ? shooter.id : -1, t: S.t, part, kind };
  if (a.hp > 0) return;
  // 倒れる向き: 弾の向き
  a.fallYaw = Math.atan2(dx || 0, dz || 1) - a.yaw + (hrand(a.id, S.t, 9) - 0.5) * 0.8;
  const vital = part === 'head' || part === 'neck';
  if (a.kind === 'swat' && a.pid == null && !S.pvp) {
    // AI隊員: 行動不能（作戦の残りは動けない）
    a.hp = 0; downActor(S, a, shooter, ev, true);
    return;
  }
  if ((a.kind === 'sus' || a.kind === 'civ') && !vital && a.hp > -45 && kind !== 'blast' && hrand(a.id, S.t, 11) < 0.55) {
    // 容疑者・市民: 行動不能（まだ生きている。放っておくと出血で死ぬことがある）
    a.hp = 1; downActor(S, a, shooter, ev, false);
    return;
  }
  killActor(S, a, shooter, ev, kind, part);
}

export function downActor(S, a, by, ev, permanent) {
  if (a.down) return;
  a.down = true; a.downT = 0; a.stateT = 0; a.comply = 0; a.adsOn = false; a.ads = 0;
  a.bleedOut = permanent ? 0 : 45 + hrand(a.id, S.t, 3) * 90;
  dropWeapon(S, a, ev);
  ev.push({ e: 'down', id: a.id, by: by ? by.id : -1 });
}

export function killActor(S, a, by, ev, kind = 'bullet', part = '') {
  if (a.dead) return;
  a.alive = false; a.dead = true; a.down = false; a.stateT = a.down ? a.stateT : 0; a.comply = 0; a.hp = Math.min(0, a.hp);
  a.vx = a.vz = 0; a.act = null; a.ads = 0; a.dbno = 0;
  dropWeapon(S, a, ev);
  const killer = by && by.id !== a.id ? by : (a.lastHit && S.byId[a.lastHit.by]);
  const assists = [];
  for (const [id, dmg] of Object.entries(a.dmgBy)) { if (killer && +id === killer.id) continue; if (dmg >= 30 && S.byId[id]) assists.push(+id); }
  ev.push({ e: 'kill', id: a.id, by: killer ? killer.id : -1, kind, part, as: assists, hs: part === 'head' });
}

export function dropWeapon(S, a, ev) {
  if (a.kind === 'swat' && !S.pvp) return; // 隊員の銃は落とさない
  const wi = a.ws && a.ws.slot >= 0 ? a.inv.w[a.ws.slot] : null;
  const list = a.kind === 'sus' ? a.inv.w.filter(Boolean) : (wi ? [wi] : []);
  for (const x of list) {
    if (x.dropped) continue;
    x.dropped = true;
    S.items.push({ id: S.nextItem++, kind: 'weapon', wid: x.id, x: a.x + (hrand(a.id, S.t, 5) - 0.5) * 0.6, y: a.y + 0.03, z: a.z + (hrand(a.id, S.t, 6) - 0.5) * 0.6, yaw: hrand(a.id, S.t, 7) * 6.28, ev: a.kind === 'sus', from: a.id, w: x });
  }
  if (a.kind === 'sus' || a.kind === 'civ') { a.inv.w = [null, null]; a.ws.slot = -1; }
  ev.push({ e: 'drop', id: a.id });
}

function killDrone(S, a, by, ev) {
  if (!a.alive) return;
  a.alive = false; a.dead = true;
  ev.push({ e: 'dronedead', id: a.id, by });
}

// PvP（R6寄り）: 頭は即死（散弾の粒は1.5倍）、胴100%、手足75%、距離で減衰。ダウン（DBNO）はモードが決める
function applyPvP(S, w, a, b, shooter, W, part, hx, hy, hz, dx, dy, dz, dist, ev) {
  if (!W.pvp) return;
  if (shooter && shooter.team === a.team && shooter.id !== a.id && !S.rules.ff) return;
  if (a.spawnProt > 0) return;
  const P = W.pvp;
  let d = P.dmg * b.k;
  const [f0, f1, fm] = P.fall || [20, 35, 0.7];
  if (dist > f0) d *= dist >= f1 ? fm : 1 - (1 - fm) * (dist - f0) / (f1 - f0);
  let head = false;
  if (part === 'head') { if (b.pellet) d *= 1.5; else { d = 999; head = true; } }
  else if (part === 'arm' || part === 'leg') d *= 0.75;
  else if (part === 'neck') d *= 1.2;
  ev.push({ e: 'blood', x: hx, y: hy, z: hz, dx, dy, dz, n: Math.min(4, 1 + d / 25), id: a.id });
  a.flinch = Math.max(a.flinch, Math.min(1, 1 - Math.exp(-d / 30)));
  ev.push({ e: 'hit', id: a.id, by: b.owner, part, d: Math.min(d, a.hp + (a.down ? 20 : 0)), x: hx, y: hy, z: hz, hs: head });
  pvpDamage(S, a, d, shooter, part, dx, dz, ev, head ? 'head' : 'bullet');
}

export function pvpDamage(S, a, d, shooter, part, dx, dz, ev, kind) {
  if (!a.alive) return;
  if (shooter) { a.dmgBy[shooter.id] = (a.dmgBy[shooter.id] || 0) + d; if (shooter.id !== a.id) { shooter.stats.dmg += d; shooter.stats.hi++; } }
  a.lastHit = { by: shooter ? shooter.id : -1, t: S.t, part, kind };
  if (a.down && a.dbno) {
    a.dbno -= d;
    if (a.dbno <= 0) killActor(S, a, shooter, ev, kind, part);
    return;
  }
  a.hp -= d;
  if (a.hp > 0) return;
  a.fallYaw = Math.atan2(dx || 0, dz || 1) - a.yaw;
  // ダウンできるか（モードの規則）
  const canDown = !!(S.rules.dbno && kind !== 'head' && kind !== 'blast' && a.dbnoCount < 1 && hooks.canDown && hooks.canDown(S, a));
  if (canDown) {
    a.hp = 0; a.down = true; a.dbno = 20; a.dbnoCount++; a.downT = 0; a.stateT = 0; a.ads = 0; a.adsOn = false; a.sprint = false;
    a.bleedOut = 0;
    ev.push({ e: 'down', id: a.id, by: shooter ? shooter.id : -1, dbno: 1 });
    return;
  }
  killActor(S, a, shooter, ev, kind, part);
}

// 交戦規定の記録（モードが採点に使う）
function harm(S, a, shooter, how, d, part, ev) {
  if (!shooter || S.pvp) return;
  if (shooter.kind === 'swat' && (a.kind === 'sus' || a.kind === 'civ' || a.kind === 'swat')) {
    S.harms.push({ t: S.t, by: shooter.id, tgt: a.id, how, d, part, kind: a.kind, threat: a.ai ? (S.t - (a.ai.threatT ?? -1e9)) * S.dt < 2.0 : false, warned: a.ai ? a.ai.warned || 0 : 0, armed: !!(a.inv.w[0] || a.inv.w[1]), comply: a.comply, cuffed: a.cuffed, down: a.down || !a.alive });
  }
}
