// 対戦のボット: TDM（敵を探して撃つ）、殲滅戦（慎重に）、爆弾（攻撃: 場所へ行って設置・守る／防衛: 準備で補強とバリケード、場所を守る、解除）
import { baseInput, pushAct, visibility, detect, lastSeen, seenAgo, goTo, aimAt, trigger, hearNearest, randomCellInRoom, roomAtPos, angDiff, yawTo, turnToward, SKILL } from './common.js';
import { navCell, cellCenter, buildNav, roomGraph } from './nav.js';
import { eyeOf } from '../combat.js';
import { curW, curWeapon, ammoCount } from '../actor.js';
import { hrand } from '../rng.js';
import { CS, LH, NB, C, levelOfY } from '../world.js';
import { M } from '../data/materials.js';
import { isOpen, isClosed, sideOf } from '../doors.js';
import { doorOps } from '../interact.js';

const sec = (S, t0) => (S.t - t0) * S.dt;

export function thinkBot(S, w, a, dt, ctx) {
  const ai = a.ai;
  const inp = baseInput(a);
  if (!a.alive) return inp;
  const sk = SKILL['bot' + (S.rules.botLevel || 2)] || SKILL.bot2;
  const m = S.m || {};
  if (a.down) { inp.mx = 0; inp.mz = 0; return inp; } // ダウン中は這わない（簡単に）
  ai.stT = (ai.stT || 0) + dt;
  // 敵を見る
  let tgt = null, td = 1e9;
  for (const b of ctx.enemies) {
    if (!b.alive) continue;
    const v = visibility(S, w, a, b, { fov: 90, maxD: 60 });
    if (detect(S, a, b, v, dt)) {
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d < td) { td = d; tgt = b; }
      // 味方に知らせる
      const intel = m.intel || (m.intel = {});
      intel[a.team] = { x: b.x, y: b.y, z: b.z, t: S.t, id: b.id };
    }
  }
  if (tgt) {
    if (ai.engId !== tgt.id) { ai.engId = tgt.id; ai.engT = S.t; ai.engD = sk.react[0] + (sk.react[1] - sk.react[0]) * hrand(a.id, S.t, 201); }
    const ty = tgt.y + (tgt.down ? 0.25 : tgt.st > 1.5 ? 0.3 : tgt.st > 0.5 ? 0.95 : 1.3);
    // 頭か胴か（腕前で頭を狙う割合）
    const head = hrand(a.id, Math.floor(S.t / 60), 202) < (S.rules.botLevel >= 3 ? 0.35 : 0.15);
    const off = aimAt(S, a, inp, tgt.x, head ? tgt.y + bodyHead(tgt) : ty, tgt.z, sk, dt, { id: tgt.id });
    inp.ads = td > 4;
    if (sec(S, ai.engT) >= ai.engD) trigger(S, a, inp, sk, off < 0.07 + (td < 5 ? 0.1 : 0));
    // 動き: 横へ、遠ければしゃがむ
    if (sec(S, ai.engT) > 0.6) {
      const ph = Math.floor(S.t / 45);
      const side = hrand(a.id, ph, 203) < 0.5 ? -1 : 1;
      if (hrand(a.id, ph, 204) < 0.55) inp.mx = side * 0.7;
      if (td > 14 && hrand(a.id, ph, 205) < 0.4) inp.stance = 1;
    }
    ai.lastEnemy = [tgt.x, tgt.y, tgt.z];
    return inp;
  }
  ai.engId = null;
  // 弾が少なければ安全なうちにリロード
  const wi = curWeapon(a), W = curW(a);
  if (wi && W) { const [mag] = ammoCount(wi); if (mag < Math.max(1, W.mag * 0.4) && a.ws.st === 'ready') pushAct(inp, { a: 'reload' }); }
  // モードの目的
  if (m.kind === 'bomb') return bombThink(S, w, a, inp, dt, ctx, sk);
  return huntThink(S, w, a, inp, dt, ctx, m.kind === 'elim');
}
function bodyHead(b) { return b.down ? 0.3 : b.st > 1.5 ? 0.42 : b.st > 0.5 ? 1.1 : 1.62; }

// 敵を探す: 味方の目撃・聞こえた銃声・最後に見た所・マップのあちこち
function huntThink(S, w, a, inp, dt, ctx, careful) {
  const ai = a.ai, m = S.m;
  let goal = null;
  const intel = m.intel && m.intel[a.team];
  if (intel && sec(S, intel.t) < 10) goal = [intel.x, intel.y, intel.z];
  const h = hearNearest(S, w, a, 40, (x) => x.k === 'shot' && x.team !== a.team);
  if (h && (!goal || hrand(a.id, S.t, 210) < 0.5)) goal = [h.x, h.y, h.z];
  if (!goal && ai.lastEnemy) { goal = ai.lastEnemy; if (Math.hypot(goal[0] - a.x, goal[2] - a.z) < 2) ai.lastEnemy = null; }
  if (!goal) {
    if (!ai.wander || sec(S, ai.wanderT) > 30) {
      const rooms = w.rooms.filter(r => r.cells.length > 10);
      const r = rooms[Math.floor(hrand(a.id, S.t, 211) * rooms.length)];
      const c = r ? randomCellInRoom(S, w, r.id, a.id) : null;
      ai.wander = c ? [c[0], c[1], c[2]] : null; ai.wanderT = S.t;
    }
    goal = ai.wander;
  }
  if (!goal) return inp;
  const far = Math.hypot(goal[0] - a.x, goal[2] - a.z) > 14;
  const r = goTo(S, w, a, inp, goal[0], goal[1], goal[2], { speed: careful ? 0.75 : 1, r: 1.0, unlock: true });
  if (r === 'arrived' || r === 'blocked') { ai.wander = null; if (ai.lastEnemy && goal === ai.lastEnemy) ai.lastEnemy = null; }
  inp.sprint = !careful && far && r === 'moving' && a.hp > 50;
  // 慎重なとき: ときどき止まって見回す
  if (careful && hrand(a.id, Math.floor(S.t / 90), 212) < 0.25) { inp.mx = inp.mz = 0; inp.yaw = a.yaw + 0.9 * dt; }
  return inp;
}

// 爆弾
function bombThink(S, w, a, inp, dt, ctx, sk) {
  const ai = a.ai, m = S.m;
  const att = a.team === m.att;
  if (m.phase === 'prep') {
    if (att) { inp.mx = inp.mz = 0; inp.yaw = a.yaw + Math.sin(S.t * 0.02 + a.id) * 0.01; return inp; }
    return defendPrep(S, w, a, inp, dt, ctx);
  }
  if (att) {
    const def = m.defuser || {};
    if (def.planted) return holdNear(S, w, a, inp, dt, def.x, def.y, def.z, 6);
    // 解除装置を持っている、または落ちている
    const item = S.items.find(it => it.kind === 'defuser' && !it.gone);
    if (item && !a.carry) {
      const nearest = S.actors.filter(b => b.team === a.team && b.alive && !b.down).sort((p, q) => Math.hypot(p.x - item.x, p.z - item.z) - Math.hypot(q.x - item.x, q.z - item.z))[0];
      if (nearest === a) {
        const r = goTo(S, w, a, inp, item.x, item.y, item.z, { r: 0.6, unlock: true });
        if (Math.hypot(item.x - a.x, item.z - a.z) < 1.0) pushAct(inp, { a: 'op', k: 'item', id: item.id, op: 'pickup' });
        return inp;
      }
    }
    const site = m.sites[m.target ?? (m.target = Math.floor(hrand(m.round || 1, 7, 220) * m.sites.length))];
    if (!site) return inp;
    if (a.carry === 'defuser') {
      const dd = Math.hypot(site.x - a.x, site.z - a.z);
      if (dd < site.r * 0.7 && levelOfY(a.y + 0.2) === site.L) {
        if (!a.act) pushAct(inp, { a: 'op', k: 'site', id: site.id, op: 'plant' });
        inp.mx = inp.mz = 0; inp.stance = 1;
        return inp;
      }
      // 味方が先に入ってから
      const ahead = S.actors.filter(b => b.team === a.team && b !== a && b.alive && Math.hypot(b.x - site.x, b.z - site.z) < dd);
      const r = goTo(S, w, a, inp, site.x, site.y, site.z, { speed: ahead.length ? 0.85 : 0.6, r: 0.6, unlock: true, breakBar: true });
      return inp;
    }
    // 運び手を守りながら場所へ
    const r = goTo(S, w, a, inp, site.x + (hrand(a.id, 3, 221) - 0.5) * 3, site.y, site.z + (hrand(a.id, 4, 222) - 0.5) * 3, { speed: 0.9, r: 1.2, unlock: true, breakBar: true });
    inp.sprint = r === 'moving' && Math.hypot(site.x - a.x, site.z - a.z) > 18;
    return inp;
  }
  // 防衛
  const def = m.defuser || {};
  if (def.planted && !def.disabled) {
    const nearest = S.actors.filter(b => b.team === a.team && b.alive && !b.down).sort((p, q) => Math.hypot(p.x - def.x, p.z - def.z) - Math.hypot(q.x - def.x, q.z - def.z))[0];
    if (nearest === a) {
      const r = goTo(S, w, a, inp, def.x, def.y, def.z, { r: 1.0, unlock: true });
      if (Math.hypot(def.x - a.x, def.z - a.z) < 1.4) { if (!a.act) pushAct(inp, { a: 'op', k: 'site', id: -1, op: 'defuse' }); inp.mx = inp.mz = 0; inp.stance = 1; }
      return inp;
    }
    return holdNear(S, w, a, inp, dt, def.x, def.y, def.z, 5);
  }
  const site = m.sites[a.ai.siteIdx ?? (a.ai.siteIdx = (a.ai.slot || 0) % m.sites.length)];
  return holdNear(S, w, a, inp, dt, site.x, site.y, site.z, 4.5);
}
// 場所の近くで角を見張る
function holdNear(S, w, a, inp, dt, x, y, z, R) {
  const ai = a.ai;
  if (!ai.hold || Math.hypot(ai.hold[0] - x, ai.hold[2] - z) > R + 2) {
    const room = roomAtPos(w, x, y, z);
    const c = room >= 0 ? randomCellInRoom(S, w, room, a.id * 3 + 1) : null;
    ai.hold = c ? [c[0], c[1], c[2]] : [x, y, z];
    // 見る向き: 部屋の入口（扉）の1つ
    const rg = roomGraph(w);
    const ps = room >= 0 ? (rg.adj[room] || []).filter(p => p.type === 'door' || p.type === 'open') : [];
    const p = ps.length ? ps[Math.floor(hrand(a.id, 5, 230) * ps.length)] : null;
    ai.watch = p ? [p.x, y + 1.3, p.z] : null;
  }
  const r = goTo(S, w, a, inp, ai.hold[0], ai.hold[1], ai.hold[2], { r: 0.5, unlock: true });
  if (r !== 'moving') {
    inp.mx = inp.mz = 0;
    if (ai.watch) { inp.yaw = turnToward(a.yaw, yawTo(ai.watch[0] - a.x, ai.watch[2] - a.z), 3 * dt); inp.ads = true; }
    if (hrand(a.id, Math.floor(S.t / 120), 231) < 0.35) inp.stance = 1;
  }
  return inp;
}
// 防衛の準備: 場所のまわりの壁を補強し、扉にバリケード、罠
function defendPrep(S, w, a, inp, dt, ctx) {
  const ai = a.ai, m = S.m;
  if (a.act) { inp.mx = inp.mz = 0; return inp; }
  const site = m.sites[ai.siteIdx ?? (ai.siteIdx = (ai.slot || 0) % m.sites.length)];
  // 仕事を決める: 補強できる壁 → バリケード → 罠
  if (!ai.job || ai.job.done) ai.job = pickPrepJob(S, w, a, site);
  const j = ai.job;
  if (!j) return holdNear(S, w, a, inp, dt, site.x, site.y, site.z, 4);
  const r = goTo(S, w, a, inp, j.x, j.y, j.z, { r: 0.45, unlock: true, noDoors: j.kind !== 'wall' });
  if (r === 'blocked' && !j.tries) { j.tries = 1; }
  if (r !== 'moving' || Math.hypot(j.x - a.x, j.z - a.z) < 0.6) {
    inp.yaw = turnToward(a.yaw, yawTo(j.lx - a.x, j.lz - a.z), 6 * dt);
    inp.pitch = turnToward(a.pitch, 0, 3 * dt);
    if (Math.abs(angDiff(a.yaw, yawTo(j.lx - a.x, j.lz - a.z))) < 0.2) {
      if (j.kind === 'wall') pushAct(inp, { a: 'op', k: 'wall', id: j.k, q: 1, op: 'reinforce' });
      else pushAct(inp, { a: 'op', k: 'door', id: j.id, op: j.kind });
      j.done = true;
    }
  }
  if (r === 'blocked') j.done = true;
  return inp;
}
function pickPrepJob(S, w, a, site) {
  const m = S.m;
  const taken = new Set(S.actors.filter(b => b !== a && b.ai && b.ai.job && !b.ai.job.done).map(b => b.ai.job.key));
  const room = roomAtPos(w, site.x, site.y, site.z);
  if (room < 0) return null;
  const r = w.rooms[room];
  // 補強: 部屋の外周の石膏・木の壁
  if ((m.reinfLeft ?? 0) > 0) {
    let best = null, bd = 1e9;
    for (let j = r.z0 - 1; j <= r.z1 + 1; j++) for (let i = r.x0 - 1; i <= r.x1 + 1; i++) {
      if (i < 0 || j < 0 || i >= w.W || j >= w.D) continue;
      const k = w.idx(r.L, i, j);
      if (w.cell[k] !== C.WALL || S.reinf[k] || taken.has('w' + k)) continue;
      const mat = w.blocks[k * NB + 1];
      if (mat !== M.DRYWALL && mat !== M.WOOD) continue;
      // 部屋の内側の隣のマス
      let ni = -1, nj = -1;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k2 = w.idx(r.L, i + di, j + dj); if (i + di >= 0 && j + dj >= 0 && i + di < w.W && j + dj < w.D && w.roomAt[k2] === room) { ni = i + di; nj = j + dj; break; } }
      if (ni < 0) continue;
      const d = Math.hypot((i + 0.5) * CS - site.x, (j + 0.5) * CS - site.z) + hrand(a.id, k, 240) * 2;
      if (d < bd) { bd = d; best = { kind: 'wall', k, key: 'w' + k, x: (ni + 0.5) * CS, y: r.L * LH, z: (nj + 0.5) * CS, lx: (i + 0.5) * CS, lz: (j + 0.5) * CS }; }
    }
    if (best) return best;
  }
  // バリケード: 部屋の扉
  const rg = roomGraph(w);
  for (const p of rg.adj[room] || []) {
    if (p.type !== 'door' || p.door < 0 || taken.has('d' + p.door)) continue;
    const ds = S.doors[p.door];
    if (!ds || ds.bar > 0 || ds.broken) continue;
    const d = w.doors[p.door];
    // 部屋の内側に立つ
    const inSide = sideOf(d, r.cx, r.cz);
    return { kind: 'bar', id: p.door, key: 'd' + p.door, x: d.cx + d.nx * inSide * 0.7, y: d.L * LH, z: d.cz + d.nz * inSide * 0.7, lx: d.cx, lz: d.cz };
  }
  return null;
}
