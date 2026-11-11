// 弾と当たり: 弾丸は速さと重力を持ち、1ステップごとの線分で当たりを調べる。材質を貫通して弱まる（RoNの式）。
// ダメージは PvE（RoN換算・防具・負傷・出血）と PvP（R6寄り・頭は即死・手足75%・ダウン）の2系統。
import { raycast, CS, LH, levelOfY, glassPane } from './world.js';
import { MATS, M, BODY_PEN } from './data/materials.js';
import { WEAPONS, AMMO } from './data/weapons.js';
import { PLATE, HELMET, SHIELD } from './data/equipment.js';
import { computePose, hitCapsules, rayCapsule, POSE_LEN, NBONE } from './pose.js';
import { holdOf, poseState } from './actor.js';
import { ACT_POSE } from './data/acts.js';
import { hrand } from './rng.js';
import { hitBar, bashBar } from './barricade.js';
import { meleeDeps } from './deploy.js';

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
  // 動作（拘束・作業・拾う・無線…）とその進み、手の行き先（体の向きの座標）
  const x = a.act;
  o.act = x ? (x.pose || ACT_POSE[x.k] || null) : a.peek ? 'peek' : null;
  o.actT = x ? Math.min(1, x.t / Math.max(0.05, x.dur)) : a.peek ? 1 : 0;
  o.actP = toLocal(a, x ? x.tgt : a.peek ? [a.peek.x, a.peek.y, a.peek.z] : null, o.actP);
  o.gest = a.gest ? a.gest.k : null; o.gestT = a.gest ? Math.min(1, a.gest.t / a.gest.dur) : 0;
  o.gestP = toLocal(a, a.gest ? a.gest.tgt : null, o.gestP);
  o.cuffT = a.cuffK || 0;
  return o;
}
// 世界の点 → 体の向きの座標（+Z 前、+X 左、Y は足元から）
function toLocal(a, p, out) {
  if (!p) return null;
  const dx = p[0] - a.x, dz = p[2] - a.z, c = Math.cos(a.yaw), s = Math.sin(a.yaw);
  const o = out || [0, 0, 0];
  o[0] = dx * c - dz * s; o[1] = p[1] - a.y; o[2] = dx * s + dz * c;
  return o;
}
const _pi = {};
// 人の当たりのカプセル（そのステップで1回だけ計算）
export function capsOf(S, a) {
  if (a._capT === S.t && a._caps) return a._caps;
  const r = computePose(poseInput(a, _pi), _bones);
  a._caps = hitCapsules(_bones, POSE_LEN, r.s, a._caps || []);
  a._eye = r.eye;
  a._shieldF = r.shield || null;
  // 両手首のまん中（拘束で相手の手首を取るのに使う）
  const wl = 7 * 12, wr = 10 * 12, W = a._wr || (a._wr = [0, 0, 0]);
  W[0] = (_bones[wl] + _bones[wr]) / 2; W[1] = (_bones[wl + 1] + _bones[wr + 1]) / 2; W[2] = (_bones[wl + 2] + _bones[wr + 2]) / 2;
  a._capT = S.t;
  return a._caps;
}
export function wristsOf(S, a) { capsOf(S, a); return a._wr.slice(); }
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
    // 防弾盾（前から当たったときだけ）
    if (a._shieldF && a.alive) { const t = rayShield(b.x, b.y, b.z, dx, dy, dz, segL, a._shieldF); if (t >= 0) hits.push({ t0: t, t1: t + 0.03, kind: 'shield', a }); }
  }
  // 監視カメラ（対戦）: 1発で壊れる
  if (S.cams && S.cams.length && w._cams) for (let i = 0; i < S.cams.length; i++) {
    const c = S.cams[i], K = w._cams[i];
    if (!c.ok || !K) continue;
    const t = raySphere(b.x, b.y, b.z, dx, dy, dz, segL, K.x, K.y, K.z, 0.11);
    if (t >= 0) hits.push({ t0: t, t1: t + 0.05, kind: 'cam', i });
  }
  hits.sort((p, q) => p.t0 - q.t0);
  for (const h of hits) {
    if (h.t0 > segL) break;
    const hx = b.x + dx * h.t0, hy = b.y + dy * h.t0, hz = b.z + dz * h.t0;
    if (h.kind === 'cam') { breakCamAt(S, h.i, b.owner, ev, hx, hy, hz); b.pen -= 40; b.k = Math.max(0.05, b.pen / b.pen0); if (b.pen <= 0) return false; continue; }
    if (h.kind === 'shield') {
      const a = h.a, sf = a._shieldF;
      const am = AMMO[b.cal] && AMMO[b.cal][b.am];
      if (!b.less && am && am.apen > SHIELD.prot) {
        // 抜ける（7.62×51mmの徹甲弾）
        ev.push({ e: 'imp', x: hx, y: hy, z: hz, nx: sf.f[0], ny: sf.f[1], nz: sf.f[2], m: M.METAL, k: 'shield', pen: true, o: b.owner, w: b.wid });
        b.pen -= 450; b.k = Math.max(0.05, b.pen / b.pen0);
        if (b.pen <= 0) return false;
        continue;
      }
      ev.push({ e: 'imp', x: hx, y: hy, z: hz, nx: sf.f[0], ny: sf.f[1], nz: sf.f[2], m: M.METAL, k: 'shield', pen: false, o: b.owner, w: b.wid });
      ev.push({ e: 'shieldhit', id: a.id, by: b.owner, x: hx, y: hy, z: hz, less: b.less ? 1 : 0 });
      a.flinch = Math.max(a.flinch || 0, b.less ? 0.08 : 0.2);
      return false;
    }
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
    if (h.mat === M.GLASS) {
      // 同じ弾がもう割った板（1枚ぜんぶ割れる）は素通り
      if (h.k != null && w.blocks[h.k * 4 + (h.q | 0)] !== M.GLASS) continue;
      breakGlass(S, w, h, ev); b.pen -= 30; b.k = Math.max(0.05, b.pen / b.pen0); continue;
    }
    if (h.mat === M.GLASSBROKEN) continue;
    if (h.kind === 'bar') hitBar(S, w, h.bar, h.pc, b.pellet ? 2 : 1, ev, { x: hx, y: hy, z: hz, by: b.owner });
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

// 盾の板（中心 p、前 f、上 u、左 l）と線の交わり。前から当たったときだけ
function rayShield(ox, oy, oz, dx, dy, dz, maxT, sf) {
  const n = sf.f, den = dx * n[0] + dy * n[1] + dz * n[2];
  if (den > -1e-4) return -1;
  const t = ((sf.p[0] - ox) * n[0] + (sf.p[1] - oy) * n[1] + (sf.p[2] - oz) * n[2]) / den;
  if (t < 0 || t > maxT) return -1;
  const px = ox + dx * t - sf.p[0], py = oy + dy * t - sf.p[1], pz = oz + dz * t - sf.p[2];
  if (Math.abs(px * sf.l[0] + py * sf.l[1] + pz * sf.l[2]) > SHIELD.hw) return -1;
  if (Math.abs(px * sf.u[0] + py * sf.u[1] + pz * sf.u[2]) > SHIELD.hh) return -1;
  return t;
}
function raySphere(ox, oy, oz, dx, dy, dz, maxT, cx, cy, cz, r) {
  const lx = ox - cx, ly = oy - cy, lz = oz - cz;
  const bq = lx * dx + ly * dy + lz * dz, cq = lx * lx + ly * ly + lz * lz - r * r;
  const h = bq * bq - cq; if (h < 0) return -1;
  const t = -bq - Math.sqrt(h); return t >= 0 && t <= maxT ? t : -1;
}

export function breakGlass(S, w, h, ev) {
  const k = h.k, q = h.q;
  if (k == null) return false;
  // 同じ窓のガラスは1枚ぜんぶ割れる（窓は左右に続くマスまで、ガラスの壁は1.5mの板）
  const ks = [];
  for (const kk of glassPane(w, k)) {
    const b = kk * 4;
    let any = false;
    for (let qq = 0; qq < 4; qq++) if (w.blocks[b + qq] === M.GLASS) { w.blocks[b + qq] = M.GLASSBROKEN; any = true; }
    if (any) { S.bdiff[kk] = 1; ks.push(kk); }
  }
  if (ks.length) {
    const WD = w.W * w.D, L = Math.floor(k / WD), r = k % WD;
    ev.push({ e: 'glass', k, ks, x: h.x, q, by: h.by ?? -1, px: (r % w.W + 0.5) * CS, py: L * LH + 1.2, pz: (Math.floor(r / w.W) + 0.5) * CS });
  }
  return ks.length > 0;
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
  // 交戦規定の判定は、撃たれる前の状態で（この弾で倒れたことを「倒れている人を撃った」にしない）
  const pre = { down: a.down || !a.alive, dead: !a.alive, cuffed: a.cuffed, comply: a.comply, armed: !!(a.inv.w[0] || a.inv.w[1]) };
  const rnd = (k) => hrand(a.id, S.t, k + (b.owner << 4));
  // 非致死
  if (am.less) {
    const L = am.less;
    if (L.tase) {
      const range = W.range || 7.6;
      if (dist <= range) { a.tased = L.tase; a.stun = Math.max(a.stun, L.tase); ev.push({ e: 'tase', id: a.id, by: b.owner }); harm(S, a, shooter, 'less', 0, part, ev, pre); }
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
    harm(S, a, shooter, 'less', d, part, ev, pre);
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
  harm(S, a, shooter, 'gun', d, part, ev, pre);
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
  a.vx = a.vz = 0; if (a.act && a.act.k === 'restrain') { const b = S.byId[a.act.id]; if (b) { b.cuffBy = null; b.cuffYaw = null; b.cuffK = 0; } } a.act = null; a.ads = 0; a.dbno = 0;
  dropWeapon(S, a, ev);
  const killer = by && by.id !== a.id ? by : (a.lastHit && S.byId[a.lastHit.by]);
  const assists = [];
  for (const [id, dmg] of Object.entries(a.dmgBy)) { if (killer && +id === killer.id) continue; if (dmg >= 30 && S.byId[id]) assists.push(+id); }
  ev.push({ e: 'kill', id: a.id, by: killer ? killer.id : -1, kind, part, as: assists, hs: part === 'head' });
}

export function dropWeapon(S, a, ev) {
  // 隊員の銃は落とさない。対戦では誰も落とさない（復活のたびに床に銃が増え続けた。R6 と同じく落とさない）
  if (S.pvp || a.kind === 'swat') return;
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

// ---- 近接（銃床で殴る。シージと同じく、バリケードは3回で壊れる）
// 押して 0.16 秒で当たり、0.6 秒で次を振れる。届くのは目から 1.35m。
// 対戦: 胴に 50（3回で倒れる）と大きなよろめき。作戦: 容疑者・市民は 18 と 2.2 秒の怯み（拘束できる）、士気が下がる。
//   従っている人・市民を殴ると交戦規定の違反（非致死の力）。味方はよろめくだけ
export const MELEE = { hit: 0.16, dur: 0.6, reach: 1.35, pvp: 50, pve: 18 };
const _rcM = { out: [], seenProp: new Set(), seenDoor: new Set(), barSolid: true }; // バリケードは穴の所を殴っても板に当たる（残っている段を落とす）
export function startMelee(S, w, a, ev) {
  if (!a.alive || a.down || a.cuffed || a.comply || a.act || a.melee || a.vault || a.peek || a.isDrone) return false;
  const ws = a.ws;
  if (ws.st === 'reload' || ws.st === 'shell' || ws.st === 'pump') { ws.st = 'ready'; ws.t = 0; } // 近接はリロードを止める（弾は入らない）
  a.melee = { t: 0, hit: false };
  const eye = eyeOf(S, a), cp = Math.cos(a.pitch);
  a.gest = { k: 'push', t: 0, dur: 0.42, tgt: [eye[0] + Math.sin(a.yaw) * cp * 0.75, eye[1] + Math.sin(a.pitch) * 0.75 - 0.15, eye[2] + Math.cos(a.yaw) * cp * 0.75] };
  ev.push({ e: 'melee', id: a.id });
  return true;
}
export function stepMelee(S, w, a, dt, ev) {
  const m = a.melee;
  if (!m) return;
  if (!a.alive || a.down || a.cuffed) { a.melee = null; return; }
  m.t += dt;
  if (!m.hit && m.t >= MELEE.hit) { m.hit = true; meleeHit(S, w, a, ev); }
  if (m.t >= MELEE.dur) a.melee = null;
}
function meleeHit(S, w, a, ev) {
  const eye = eyeOf(S, a), cp = Math.cos(a.pitch);
  const dx = Math.sin(a.yaw) * cp, dy = Math.sin(a.pitch), dz = Math.cos(a.yaw) * cp, R = MELEE.reach;
  // 人（体の当たりを少し太らせて）とドローン
  let best = null, bt = R;
  for (const b of S.actors) {
    if (b === a || !b.alive) continue;
    if (Math.hypot(b.x - a.x, b.z - a.z) > R + 0.8 || Math.abs(b.y - a.y) > 2) continue;
    if (b.isDrone) {
      const cx = b.x - eye[0], cy = b.y + 0.08 - eye[1], cz = b.z - eye[2], t = cx * dx + cy * dy + cz * dz;
      if (t > 0 && t < bt && Math.hypot(cx - dx * t, cy - dy * t, cz - dz * t) < 0.22) { bt = t; best = { b, t, part: 'drone' }; }
      continue;
    }
    for (const c of capsOf(S, b)) {
      const t = rayCapsule(eye[0], eye[1], eye[2], dx, dy, dz, R, c.a, c.b, c.r + 0.12);
      if (t >= 0 && t < bt) { bt = t; best = { b, t, part: c.part }; }
    }
  }
  // 監視カメラ（手の届く高さなら殴って壊せる）
  if (S.cams && w._cams) for (let i = 0; i < S.cams.length; i++) {
    const K = w._cams[i];
    if (!S.cams[i].ok || !K) continue;
    const t = raySphere(eye[0], eye[1], eye[2], dx, dy, dz, R, K.x, K.y, K.z, 0.2);
    if (t >= 0 && t < bt) { bt = t; best = { cam: i, t }; }
  }
  if (best && best.cam != null) {
    const hits0 = raycast(w, eye[0], eye[1], eye[2], dx, dy, dz, best.t, S.doors, _rcM);
    if (!hits0.some(h => !(h.kind === 'slab' && h.ny > 0.5) && h.mat !== M.GLASSBROKEN && h.t0 < best.t - 0.05)) { breakCamAt(S, best.cam, a.id, ev, eye[0] + dx * best.t, eye[1] + dy * best.t, eye[2] + dz * best.t); ev.push({ e: 'meleehit', id: a.id, k: 'cam' }); return; }
    best = null; bt = R;
  }
  // 物（壁・扉・バリケード・ガラス・家具）
  const hits = raycast(w, eye[0], eye[1], eye[2], dx, dy, dz, R, S.doors, _rcM);
  let wh = null;
  for (const h of hits) { if (h.kind === 'slab' && h.ny > 0.5) continue; if (h.mat === M.GLASSBROKEN) continue; wh = h; break; }
  if (wh && wh.t0 < bt) {
    const x = eye[0] + dx * wh.t0, y = eye[1] + dy * wh.t0, z = eye[2] + dz * wh.t0;
    if (wh.kind === 'bar') bashBar(S, w, wh.bar, y, ev, a.id);
    else if (wh.mat === M.GLASS) breakGlass(S, w, Object.assign({}, wh, { by: a.id }), ev);
    ev.push({ e: 'meleehit', id: a.id, k: wh.kind === 'bar' ? 'bar' : wh.kind === 'door' ? 'door' : 'wall', m: wh.mat, x, y, z });
    if (wh.kind === 'door') ev.push({ e: 'door', d: wh.id, k: 'knock', id: a.id, loud: 0.45 });
    return;
  }
  // 有刺鉄線（足元）を殴る: 2回で壊れる
  if (!best && meleeDeps(S, w, a, eye, dx, dy, dz, R, ev)) { ev.push({ e: 'meleehit', id: a.id, k: 'wire' }); return; }
  if (!best) { ev.push({ e: 'meleehit', id: a.id, k: 'air' }); return; }
  const b = best.b, x = eye[0] + dx * best.t, y = eye[1] + dy * best.t, z = eye[2] + dz * best.t;
  if (best.part === 'drone') { killDrone(S, b, a.id, ev); ev.push({ e: 'meleehit', id: a.id, k: 'drone', x, y, z }); return; }
  ev.push({ e: 'meleehit', id: a.id, k: 'body', tgt: b.id, x, y, z });
  b.flinch = Math.max(b.flinch || 0, 0.8);
  // 押されて少し下がる
  b.vx = (b.vx || 0) + dx * 1.6; b.vz = (b.vz || 0) + dz * 1.6;
  if (S.pvp) {
    if (b.team === a.team && !S.rules.ff) return;
    if (b.spawnProt > 0) return;
    b.stun = Math.max(b.stun, 0.35);
    ev.push({ e: 'hit', id: b.id, by: a.id, part: 'chest', d: Math.min(MELEE.pvp, b.hp + (b.down ? 20 : 0)), x, y, z, hs: false, melee: 1 });
    pvpDamage(S, b, MELEE.pvp, a, 'chest', dx, dz, ev, 'melee');
    return;
  }
  if (b.kind === 'swat') return; // 味方はよろめくだけ
  b.stun = Math.max(b.stun, 2.2);
  if (b.ai && b.ai.morale != null) b.ai.morale -= 0.4;
  ev.push({ e: 'hit', id: b.id, by: a.id, part: 'chest', d: MELEE.pve, x, y, z, hs: false, melee: 1 });
  S.harms.push({ t: S.t, by: a.id, tgt: b.id, how: 'melee', d: MELEE.pve, part: 'chest', kind: b.kind, threat: b.ai ? (S.t - (b.ai.threatT ?? -1e9)) * S.dt < 2 : false, warned: b.ai ? b.ai.warned || 0 : 0, armed: !!(b.inv.w[0] || b.inv.w[1]), comply: b.comply, cuffed: b.cuffed, down: b.down });
  hurt(S, w, b, MELEE.pve, 'chest', a, null, dx, dz, ev, 'melee');
}

// 監視カメラを壊す（弾・近接・爆発）
export function breakCamAt(S, i, by, ev, x, y, z) {
  const c = S.cams && S.cams[i];
  if (!c || !c.ok) return false;
  c.ok = 0; c.use = -1;
  ev.push({ e: 'camdead', i, by, x, y, z });
  return true;
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
  // レディオアノットの味つけ: 腕を撃たれると狙いがぶれ、脚を撃たれると遅くなる（そのラウンドの間。作戦より軽め）
  if (part === 'arm') a.inj.arm = 1; else if (part === 'leg') a.inj.leg = Math.min(2, (a.inj.leg || 0) + 1);
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
function harm(S, a, shooter, how, d, part, ev, pre = null) {
  // 死んだ体に当たった弾（同じ瞬間の散弾・連射の残り）は数えない
  if (!shooter || S.pvp || (pre && pre.dead)) return;
  if (shooter.kind === 'swat' && (a.kind === 'sus' || a.kind === 'civ' || a.kind === 'swat')) {
    const st = pre || { down: a.down || !a.alive, cuffed: a.cuffed, comply: a.comply, armed: !!(a.inv.w[0] || a.inv.w[1]) };
    S.harms.push({ t: S.t, by: shooter.id, tgt: a.id, how, d, part, kind: a.kind, threat: a.ai ? (S.t - (a.ai.threatT ?? -1e9)) * S.dt < 2.0 : false, warned: a.ai ? a.ai.warned || 0 : 0, armed: st.armed, comply: st.comply, cuffed: st.cuffed, down: st.down });
  }
}
