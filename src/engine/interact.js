// 調べる・使う: 見ている物（扉・人・落ちている物・爆弾・壁）と、そのときできる操作。時間のかかる動作の進み。
import { raycast, CS, LH, levelOfY, NB, isWallish, C } from './world.js';
import { M, MATS } from './data/materials.js';
import { GEAR, LONG } from './data/equipment.js';
import { doorOp, sideOf, isClosed, detonateC2, triggerTrap } from './doors.js';
import { eyeOf, dropWeapon } from './combat.js';
import { throwNade, launchNade } from './nades.js';
import { curW } from './actor.js';
import { startReload, switchTo } from './weapon.js';

const _rc = { out: [], seenProp: new Set(), seenDoor: new Set() };
export const REACH = 2.3;

// 時間（秒）
export const ACT_T = {
  restrain: 1.6, report: 0.6, collect: 1.0, pick: 6.0, lockgun: 2.0, wedge: 1.5, unwedge: 2.0, c2: 2.5, ram: 0.8, breach: 0.7, mirror: 2.4, disarm: 3.0,
  bar: 1.5, unbar: 1.6, trap: 3.0, bash: 0.55, bandage: 3.5, plant: 7.0, defuse: 7.0, revive: 4.0, reinforce: 4.5, frame: 4.0, bombdefuse: 6.0, kick: 0.45, wall: 0.3,
};
export const OP_NAME = {
  open: '開ける', peek: '少し開ける', close: '閉める', kick: '蹴る', pick: 'ピッキング', lockgun: 'ロックピックガン', wedge: 'ウェッジ', unwedge: 'ウェッジを外す', c2: 'C2を仕掛ける',
  ram: '破城槌', breach: '散弾で開ける', mirror: 'ミラーで見る', disarm: '罠を外す', bar: 'バリケード', unbar: 'バリケードを外す', trap: '罠を仕掛ける', bash: 'バリケードを壊す',
  restrain: '拘束', report: 'TOCに報告', collect: '証拠を回収', revive: '手当て', plant: '解除装置を設置', defuse: '解除装置を外す', pickup: '拾う', reinforce: '補強', frame: '壁用の爆破薬', bombdefuse: '爆弾を解除', det: '起爆',
};

// 見ている物を調べる
export function contextOf(S, w, a) {
  if (!a.alive || a.down || a.cuffed) return null;
  const eye = eyeOf(S, a);
  const cp = Math.cos(a.pitch), dx = Math.sin(a.yaw) * cp, dy = Math.sin(a.pitch), dz = Math.cos(a.yaw) * cp;
  const hits = raycast(w, eye[0], eye[1], eye[2], dx, dy, dz, 3.2, S.doors, _rc);
  let wallHit = null, doorHit = null;
  for (const h of hits) {
    if (h.kind === 'door' || h.kind === 'bar') { doorHit = h; break; }
    if (h.kind === 'block' || h.kind === 'slab' || h.kind === 'prop' || h.kind === 'stair' || h.kind === 'edge') { if (MATS[h.mat] && MATS[h.mat].see) continue; wallHit = h; break; }
  }
  const wallT = wallHit ? wallHit.t0 : 99;
  // 人（照準の線の近く、2.5m以内）
  let person = null, pd = 1e9;
  for (const b of S.actors) {
    if (b.id === a.id || b.isDrone) continue;
    if (!b.alive && !b.dead) continue;
    const by = b.down || b.dead ? b.y + 0.25 : b.comply === 2 || b.cuffed ? b.y + 0.9 : b.y + 1.2;
    const ox = b.x - eye[0], oy = by - eye[1], oz = b.z - eye[2];
    const t = ox * dx + oy * dy + oz * dz;
    if (t < 0.2 || t > 2.6 || t > wallT + 0.3) continue;
    const perp = Math.sqrt(Math.max(0, ox * ox + oy * oy + oz * oz - t * t));
    const lim = b.down || b.dead ? 0.7 : 0.55;
    if (perp > lim) continue;
    const score = perp + t * 0.15;
    if (score < pd) { pd = score; person = b; }
  }
  if (person) {
    const ops = personOps(S, a, person);
    if (ops.length) return { k: 'person', id: person.id, ops, def: ops[0], dist: pd };
  }
  // 落ちている物
  let item = null, idist = 1e9;
  for (const it of S.items) {
    if (it.gone) continue;
    const ox = it.x - eye[0], oy = it.y + 0.05 - eye[1], oz = it.z - eye[2];
    const t = ox * dx + oy * dy + oz * dz;
    if (t < 0.1 || t > 2.6 || t > wallT + 0.3) continue;
    const perp = Math.sqrt(Math.max(0, ox * ox + oy * oy + oz * oz - t * t));
    if (perp > 0.6) continue;
    if (perp < idist) { idist = perp; item = it; }
  }
  if (item) {
    const ops = itemOps(S, a, item);
    if (ops.length) return { k: 'item', id: item.id, ops, def: ops[0] };
  }
  // 扉（当たった、または近くの扉）
  let did = doorHit ? doorHit.id : -1;
  if (did < 0) {
    let best = 2.0;
    for (const d of w.doors) {
      if (d.L !== levelOfY(a.y + 0.2)) continue;
      const ox = d.cx - a.x, oz = d.cz - a.z, dist = Math.hypot(ox, oz);
      if (dist > 2.2) continue;
      const fwd = (ox * dx + oz * dz) / Math.max(0.01, dist * Math.hypot(dx, dz));
      if (fwd < 0.55) continue;
      if (dist * (1.6 - fwd) < best && dist < wallT + 0.6) { best = dist * (1.6 - fwd); did = d.id; }
    }
  }
  if (did >= 0) {
    const ops = doorOps(S, w, a, did);
    if (ops.length) return { k: 'door', id: did, ops, def: ops[0] };
  }
  // 対戦: 爆弾の場所・壁・窓
  if (S.pvp && S.m && S.m.sites) {
    const so = siteOps(S, w, a, eye, dx, dz);
    if (so) return so;
  }
  if (S.pvp && wallHit && wallHit.kind === 'block' && wallHit.t0 < 1.6) {
    const ops = wallOps(S, w, a, wallHit);
    if (ops.length) return { k: 'wall', id: wallHit.k, ops, def: ops[0], q: wallHit.q };
  }
  // 作戦: 爆弾（爆弾脅迫）
  if (!S.pvp && S.m && S.m.bombs) {
    for (const b of S.m.bombs) {
      if (b.done) continue;
      const dist = Math.hypot(b.x - a.x, b.z - a.z);
      if (dist < 1.6 && Math.abs(b.y - a.y) < 1.5) return { k: 'bomb', id: b.id, ops: [{ op: 'bombdefuse', t: ACT_T.bombdefuse }], def: { op: 'bombdefuse', t: ACT_T.bombdefuse } };
    }
  }
  return null;
}

function gearN(a, id) { const g = a.inv.gear.find(x => x.id === id); return g ? g.n : 0; }
function useGear(a, id) { const g = a.inv.gear.find(x => x.id === id); if (g && g.n > 0) { g.n--; return true; } return false; }

export function personOps(S, a, b) {
  const ops = [];
  if (S.pvp) {
    if (b.alive && b.down && b.team === a.team) ops.push({ op: 'revive', t: ACT_T.revive });
    return ops;
  }
  if (b.alive && !b.cuffed && (b.comply >= 1 || b.down || b.tased > 0 || b.stun > 1.0 || b.flash > 1.0) && b.kind !== 'swat') ops.push({ op: 'restrain', t: ACT_T.restrain });
  if ((b.cuffed || b.down || b.dead) && !b.reported) ops.push({ op: 'report', t: ACT_T.report });
  if (b.kind === 'swat' && b.down && !b.reported) ops.push({ op: 'report', t: ACT_T.report });
  return ops;
}
function itemOps(S, a, it) {
  if (S.pvp) {
    if (it.kind === 'defuser' && a.team === S.m.att) return [{ op: 'pickup', t: 0.3 }];
    return [];
  }
  if (it.kind === 'weapon' || it.kind === 'evidence') return [{ op: 'collect', t: ACT_T.collect }];
  return [];
}
export function doorOps(S, w, a, did) {
  const ds = S.doors[did], d = w.doors[did];
  const ops = [];
  if (ds.broken) return ops;
  const closed = isClosed(ds);
  const side = sideOf(d, a.x, a.z);
  if (S.pvp && ds.bar > 0) {
    if (a.team === S.m.def) ops.push({ op: 'unbar', t: ACT_T.unbar });
    else { ops.push({ op: 'bash', t: ACT_T.bash }); if (gearN(a, 'c2')) ops.push({ op: 'c2', t: ACT_T.c2, gear: 'c2' }); }
    return ops;
  }
  if (ds.c2) ops.push({ op: 'det', t: 0 });
  if (!closed) { ops.push({ op: 'close', t: 0 }); if (Math.abs(ds.ang[0]) < 0.6) ops.push({ op: 'open', t: 0 }); }
  else {
    ops.push({ op: 'open', t: 0 }); ops.push({ op: 'peek', t: 0 });
    ops.push({ op: 'mirror', t: ACT_T.mirror });
    if (ds.wedge) ops.push({ op: 'unwedge', t: ACT_T.unwedge });
    else if (gearN(a, 'wedge')) ops.push({ op: 'wedge', t: ACT_T.wedge, gear: 'wedge' });
    ops.push({ op: 'kick', t: ACT_T.kick });
    if (ds.locked && !ds.lockBroken) { ops.push({ op: gearN(a, 'lockgun') ? 'lockgun' : 'pick', t: gearN(a, 'lockgun') ? ACT_T.lockgun : ACT_T.pick }); }
    if (a.inv.long === 'ram') ops.push({ op: 'ram', t: ACT_T.ram });
    if (a.inv.long === 'breacher') ops.push({ op: 'breach', t: ACT_T.breach });
    if (gearN(a, 'c2') && !ds.c2) ops.push({ op: 'c2', t: ACT_T.c2, gear: 'c2' });
    if (ds.trap && ds.trapSeen) ops.push({ op: 'disarm', t: ACT_T.disarm });
    if (S.pvp && a.team === S.m.def && S.m.phase === 'prep') { ops.unshift({ op: 'bar', t: ACT_T.bar }); if (gearN(a, 'claymore') && !ds.trap) ops.push({ op: 'trap', t: ACT_T.trap, gear: 'claymore' }); }
  }
  // 既定の操作: 閉じていれば「開ける」
  return ops;
}
function siteOps(S, w, a, eye, dx, dz) {
  const m = S.m;
  if (m.defuser && m.defuser.planted && a.team === m.def) {
    const p = m.defuser;
    if (Math.hypot(p.x - a.x, p.z - a.z) < 1.5 && Math.abs(p.y - a.y) < 1.5) return { k: 'site', id: -1, ops: [{ op: 'defuse', t: ACT_T.defuse }], def: { op: 'defuse', t: ACT_T.defuse } };
  }
  if (a.carry === 'defuser' && m.phase === 'action' && !(m.defuser && m.defuser.planted)) {
    for (const s of m.sites) {
      if (s.L !== levelOfY(a.y + 0.2)) continue;
      if (Math.hypot(s.x - a.x, s.z - a.z) < s.r) return { k: 'site', id: s.id, ops: [{ op: 'plant', t: ACT_T.plant }], def: { op: 'plant', t: ACT_T.plant } };
    }
  }
  return null;
}
function wallOps(S, w, a, h) {
  const ops = [];
  const k = h.k;
  const t = w.cell[k];
  const mat = w.blocks[k * NB + (h.q || 0)];
  if (t !== C.WALL || !(mat === M.DRYWALL || mat === M.WOOD)) return ops;
  if (S.m.def === a.team && S.m.phase === 'prep' && !S.reinf[k] && (S.m.reinfLeft ?? 0) > 0) ops.push({ op: 'reinforce', t: ACT_T.reinforce });
  if (S.m.att === a.team && gearN(a, 'frame')) ops.push({ op: 'frame', t: ACT_T.frame, gear: 'frame' });
  return ops;
}

// 動作を始める（人もAIも同じ）。ac: { a:'use' } | { a:'op', k, id, op } | { a:'shout' } | ...
export function doAction(S, w, a, ac, ev) {
  if (!a.alive) return;
  const kind = ac.a;
  if (kind === 'shout') { shout(S, a, ev, ac.line); return; }
  if (kind === 'cmd') { S.orders.push({ ...ac, by: a.id, t: S.t, n: ++S.cmdSeq }); ev.push({ e: 'cmd', id: a.id, cmd: ac.cmd, team: ac.team || 'gold' }); return; }
  if (kind === 'det') { detonateMine(S, w, a, ev); return; }
  if (kind === 'reload') return; // 銃の側で処理
  if (kind === 'unlockDoor') { if (a.kind === 'sus' || a.kind === 'civ') doorOp(S, w, a, ac.id, 'unlock', ev); return; }
  if (a.down || a.cuffed || a.comply) return;
  if (kind === 'cancel') { if (a.act) { ev.push({ e: 'actcancel', id: a.id, k: a.act.k }); a.act = null; } return; }
  if (kind === 'gear') { selectGear(S, a, ac.id, ev); return; }
  if (kind === 'm320') { if (a.inv.m320) { const order = ['flash', 'stinger', 'cs']; let i = order.indexOf(a.inv.m320.sel); for (let n = 0; n < 3; n++) { i = (i + 1) % 3; if (a.inv.m320[order[i]] > 0) break; } a.inv.m320.sel = order[i]; ev.push({ e: 'm320sel', id: a.id, sel: order[i] }); } return; }
  if (kind === 'dropcarry') { if (a.carry === 'defuser') { a.carry = null; S.items.push({ id: S.nextItem++, kind: 'defuser', x: a.x, y: a.y + 0.02, z: a.z }); ev.push({ e: 'defdrop', id: a.id }); } return; }
  if (a.act) return;
  let ctx = null, op = null;
  if (kind === 'use') { ctx = contextOf(S, w, a); if (!ctx) return; op = ctx.def; }
  else if (kind === 'op') {
    ctx = contextOf(S, w, a);
    if (!ctx || ctx.k !== ac.k || ctx.id !== ac.id) {
      // AIは見ていなくても近ければよい
      if (a.pid == null && ac.k === 'door') ctx = { k: 'door', id: ac.id, ops: doorOps(S, w, a, ac.id) };
      else if (a.pid == null && ac.k === 'person') { const b = S.byId[ac.id]; ctx = b ? { k: 'person', id: ac.id, ops: personOps(S, a, b) } : null; }
      else if (a.pid == null && ac.k === 'item') { const it = S.items.find(x => x.id === ac.id); ctx = it ? { k: 'item', id: ac.id, ops: itemOps(S, a, it) } : null; }
      else if (a.pid == null && ac.k === 'site') { const eye = eyeOf(S, a); ctx = siteOps(S, w, a, eye, 0, 0); }
      else if (a.pid == null && ac.k === 'wall') { const kk = ac.id; ctx = { k: 'wall', id: kk, q: ac.q || 1, ops: wallOps(S, w, a, { k: kk, q: ac.q || 1 }) }; }
      if (!ctx) return;
    }
    op = ctx.ops.find(o => o.op === ac.op);
    if (!op) return;
  } else return;
  startOp(S, w, a, ctx, op, ev);
}

function startOp(S, w, a, ctx, op, ev) {
  const id = ctx.id;
  if (op.op === 'det') { detonateMine(S, w, a, ev); return; }
  if (op.op === 'pickup') { const it = S.items.find(x => x.id === id); if (it && !it.gone) { it.gone = true; a.carry = 'defuser'; ev.push({ e: 'defpick', id: a.id }); } return; }
  if (ctx.k === 'door' && (op.t || 0) === 0) { const r = doorOp(S, w, a, id, op.op, ev); if (!r.ok && r.why) ev.push({ e: 'deny', id: a.id, why: r.why, d: id }); return; }
  const dur = (op.t || 0.5) * (a.inj.arm && op.op !== 'report' ? 1.2 : 1);
  a.act = { k: op.op, t: 0, dur, kind: ctx.k, id, still: op.op !== 'report' && op.op !== 'bash', noAds: true, x: a.x, z: a.z, gear: op.gear || null };
  ev.push({ e: 'act', id: a.id, k: op.op, dur, tgt: id, kind: ctx.k });
}

// 時間のかかる動作の進み
export function stepActs(S, w, dt, ev) {
  for (const a of S.actors) {
    // 投げ物を持っているとき: 引き金で投げる
    if (a.ws && a.ws.slot === 2 && a.alive && !a.down) gearInHand(S, w, a, dt, ev);
    const x = a.act;
    if (!x) continue;
    if (!a.alive || a.down || a.stun > 0.3 || a.flash > 0.5) { a.act = null; ev.push({ e: 'actcancel', id: a.id, k: x.k }); continue; }
    // 動いたら中断（AIは止まって行う）
    if (x.still && Math.hypot(a.x - x.x, a.z - x.z) > 0.5) { a.act = null; ev.push({ e: 'actcancel', id: a.id, k: x.k }); continue; }
    // 相手が離れた・状態が変わった
    if (x.kind === 'person') {
      const b = S.byId[x.id];
      if (!b || Math.hypot(b.x - a.x, b.z - a.z) > 2.8) { a.act = null; ev.push({ e: 'actcancel', id: a.id, k: x.k }); continue; }
      if (x.k === 'restrain' && (b.cuffed || (!b.comply && !b.down && b.tased <= 0 && b.stun <= 0 && b.flash <= 0.2))) { a.act = null; ev.push({ e: 'actcancel', id: a.id, k: x.k }); continue; }
    }
    x.t += dt;
    if (x.t < x.dur) continue;
    a.act = null;
    finishOp(S, w, a, x, ev);
  }
}

function finishOp(S, w, a, x, ev) {
  const k = x.k;
  if (x.kind === 'door') {
    const did = x.id;
    if (k === 'pick' || k === 'lockgun') { doorOp(S, w, a, did, 'unlock', ev); return; }
    if (k === 'mirror') {
      // 扉の向こうの人と罠を見る
      const d = w.doors[did], side = -sideOf(d, a.x, a.z);
      const seen = [];
      for (const b of S.actors) {
        if (!b.alive || b.isDrone || Math.abs(b.y - d.L * LH) > 1.6) continue;
        const s = (b.x - d.cx) * d.nx + (b.z - d.cz) * d.nz;
        if (s * side <= 0) continue;
        const room = w.roomAt[w.idx(d.L, Math.floor(b.x / CS), Math.floor(b.z / CS))];
        const dist = Math.hypot(b.x - d.cx, b.z - d.cz);
        if (dist > 9) continue;
        seen.push({ id: b.id, kind: b.kind, armed: !!(b.inv.w[0] || b.inv.w[1]), comply: b.comply, dist: +dist.toFixed(1), room });
        if (b.ai) b.ai.mirroredT = S.t;
        b.spot = Math.max(b.spot || 0, 6);
      }
      const ds = S.doors[did];
      if (ds.trap) ds.trapSeen = true;
      ev.push({ e: 'mirror', id: a.id, d: did, seen, trap: !!ds.trap, locked: !!(ds.locked && !ds.lockBroken) });
      return;
    }
    if (k === 'wedge' && x.gear && !useGear(a, 'wedge')) return;
    if (k === 'c2' && !useGear(a, 'c2')) return;
    if (k === 'trap' && !useGear(a, 'claymore')) return;
    const r = doorOp(S, w, a, did, k === 'bash' ? 'kick' : k, ev);
    if (!r.ok && r.why) ev.push({ e: 'deny', id: a.id, why: r.why, d: did });
    return;
  }
  if (x.kind === 'person') {
    const b = S.byId[x.id];
    if (!b) return;
    if (k === 'restrain') {
      b.cuffed = true; b.comply = 2; b.stateT = 0; b.act = null; b.vx = b.vz = 0;
      if (b.inv.w[0] || b.inv.w[1]) dropWeapon(S, b, ev);
      a.stats.arrest += b.kind === 'sus' ? 1 : 0; a.stats.rescue += b.kind === 'civ' ? 1 : 0;
      ev.push({ e: 'cuffed', id: b.id, by: a.id, kind: b.kind, down: b.down });
      return;
    }
    if (k === 'report') { b.reported = true; ev.push({ e: 'report', id: b.id, by: a.id, kind: b.kind, st: b.dead ? 'dead' : b.down ? 'down' : 'cuffed' }); return; }
    if (k === 'revive') { if (b.down && b.alive) { b.down = false; b.dbno = 0; b.hp = 20; b.stateT = 0; b.revivedT = S.t; ev.push({ e: 'revive', id: b.id, by: a.id }); } return; }
  }
  if (x.kind === 'item') {
    const it = S.items.find(q => q.id === x.id);
    if (!it || it.gone) return;
    if (k === 'collect') { it.gone = true; ev.push({ e: 'evidence', id: it.id, by: a.id, kind: it.kind, wid: it.wid || null, ev: it.ev, obj: it.obj || null }); }
    return;
  }
  if (x.kind === 'bomb' && k === 'bombdefuse') { const b = S.m.bombs.find(q => q.id === x.id); if (b && !b.done) { b.done = true; ev.push({ e: 'bombdone', id: b.id, by: a.id }); } return; }
  if (x.kind === 'site') {
    if (k === 'plant' && a.carry === 'defuser') { a.carry = null; S.m.defuser = { planted: true, x: a.x, y: a.y, z: a.z, t: 0, site: x.id, by: a.id }; ev.push({ e: 'plant', id: a.id, site: x.id }); }
    if (k === 'defuse' && S.m.defuser) { S.m.defuser.disabled = true; ev.push({ e: 'disable', id: a.id }); }
    return;
  }
  if (x.kind === 'wall') {
    const kk = x.id;
    if (k === 'reinforce') { if ((S.m.reinfLeft ?? 0) > 0) { S.reinf[kk] = 1; S.m.reinfLeft--; ev.push({ e: 'reinf', k: kk, id: a.id }); } }
    if (k === 'frame' && useGear(a, 'frame')) { S.mines = S.mines || []; S.mines.push({ k: 'frame', owner: a.id, x: (kk % w.W + 0.5) * CS, y: a.y + 1.0, z: (Math.floor(kk / w.W) % w.D + 0.5) * CS, cell: kk }); ev.push({ e: 'frameset', id: a.id }); }
    return;
  }
  if (k === 'bandage') {
    if (S.pvp) { a.hp = Math.min(a.maxHp, a.hp + 40); } else { a.hp = Math.max(a.hp, Math.min(a.maxHp, a.maxHp * 0.5)); a.inj.arm = 0; }
    a.bleed = 0;
    ev.push({ e: 'bandaged', id: a.id });
  }
}

// 呼びかけ（警告）。聞こえた人は AI が投降するか決める
export function shout(S, a, ev, line) {
  if ((S.t - (a._shoutT ?? -999)) * S.dt < 0.75) return false;
  a._shoutT = S.t;
  S.shouts.push({ by: a.id, t: S.t, x: a.x, y: a.y, z: a.z, yaw: a.yaw });
  ev.push({ e: 'shout', id: a.id, line: line ?? -1, x: a.x, y: a.y + 1.6, z: a.z });
  return true;
}

function selectGear(S, a, id, ev) {
  const G = GEAR[id];
  if (!G) return;
  const g = a.inv.gear.find(x => x.id === id);
  if (!g || g.n <= 0) { ev.push({ e: 'deny', id: a.id, why: 'nogear' }); return; }
  if (G.kind === 'heal') { if (a.act) return; if (g.n > 0) { g.n--; a.act = { k: 'bandage', t: 0, dur: ACT_T.bandage, kind: 'self', id: a.id, still: false, noAds: true, x: a.x, z: a.z }; ev.push({ e: 'act', id: a.id, k: 'bandage', dur: ACT_T.bandage }); } return; }
  if (G.kind === 'nade' || G.kind === 'spray') {
    // 手に持つ（slot 2）。引き金で投げる・吹きつける
    a.ws.gear = id;
    if (a.ws.slot !== 2) { a.ws.prev = a.ws.slot; switchTo(S, a, 2, ev); }
    ev.push({ e: 'gearsel', id: a.id, g: id });
    return;
  }
  // 扉や壁に使う物（C2・ウェッジなど）は、扉を見て「調べる」から使う
  ev.push({ e: 'gearhint', id: a.id, g: id });
}

function gearInHand(S, w, a, dt, ev) {
  const ws = a.ws, inp = a._inp || {};
  if (ws.st !== 'ready' && ws.st !== 'gear') { ws.gearTrig = !!inp.fire; return; }
  ws.st = 'gear';
  const id = ws.gear;
  const g = a.inv.gear.find(x => x.id === id);
  if (!g || g.n <= 0) { switchTo(S, a, ws.prev >= 0 ? ws.prev : 0, ev); ws.st = 'holster'; return; }
  const press = !!inp.fire && !ws.gearTrig;
  ws.gearTrig = !!inp.fire;
  if (!press) return;
  if (GEAR[id].kind === 'nade') {
    g.n--;
    throwNade(S, a, id, inp.power ?? 0.75, ev);
    if (g.n <= 0 || !inp.keepGear) { ws.next = ws.prev >= 0 ? ws.prev : 0; ws.st = 'holster'; ws.t = 0.35; }
  } else if (GEAR[id].kind === 'spray') {
    spray(S, w, a, ev);
    g.n = Math.max(0, g.n - 0); // 本数ではなく回数で管理（6回）
    ws.sprays = (ws.sprays || 0) + 1;
    if (ws.sprays >= (GEAR.spray.uses || 6)) { g.n = 0; ws.next = ws.prev >= 0 ? ws.prev : 0; ws.st = 'holster'; ws.t = 0.3; }
  }
}

function spray(S, w, a, ev) {
  ev.push({ e: 'spray', id: a.id });
  const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
  for (const b of S.actors) {
    if (b.id === a.id || !b.alive || b.isDrone) continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d > 3.2 || Math.abs(b.y - a.y) > 1) continue;
    if ((dx * fx + dz * fz) / Math.max(0.01, d) < 0.85) continue;
    if (b.armor && b.armor.head === 'gasmask') continue;
    b.stun = Math.max(b.stun, 3.5); b.gas = Math.max(b.gas, 5);
    if (b.ai && b.ai.morale != null) b.ai.morale -= 0.6;
    S.harms.push({ t: S.t, by: a.id, tgt: b.id, how: 'less', d: 0, part: 'head', kind: b.kind, threat: b.ai ? (S.t - (b.ai.threatT ?? -1e9)) * S.dt < 2 : false, warned: b.ai ? b.ai.warned || 0 : 0, armed: !!(b.inv.w[0] || b.inv.w[1]), comply: b.comply, cuffed: b.cuffed, down: b.down });
    ev.push({ e: 'sprayed', id: b.id, by: a.id });
  }
}

// 仕掛けたC2・壁の爆破薬を起爆
function detonateMine(S, w, a, ev) {
  let any = false;
  for (let i = 0; i < w.doors.length; i++) { const ds = S.doors[i]; if (ds.c2 && ds.c2.owner === a.id) { detonateC2(S, w, i, ev); any = true; } }
  if (S.mines) for (let i = S.mines.length - 1; i >= 0; i--) { const m = S.mines[i]; if (m.owner !== a.id) continue; S.mines.splice(i, 1); S.blasts.push({ x: m.x, y: m.y, z: m.z, r: 3.0, dmg: 120, kind: 'frame', by: a.id, t: 0 }); any = true; }
  if (!any) ev.push({ e: 'deny', id: a.id, why: 'nodet' });
}
export { launchNade };
