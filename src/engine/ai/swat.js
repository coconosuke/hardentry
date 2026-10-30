// 隊員AI（Ready Or Not の命令を再現）: 追従・移動・待機・援護・スタック・突入（開け方×投げ物）・ミラー・ウェッジ・罠の解除・ピッキング・拘束・投入・捜索して確保
// 命令がなくても: 交戦規定にしたがって撃つ、呼びかける、投降した人を拘束する、倒れた人を報告する
import { baseInput, pushAct, visibility, detect, goTo, steerToward, aimAt, trigger, canFight, hasGun, aimingAt, angDiff, yawTo, turnToward, roomAtPos, hearNearest, SKILL } from './common.js';
import { navCell, cellCenter, nearestWalk, buildNav, snapFloor } from './nav.js';
import { eyeOf } from '../combat.js';
import { curW, curWeapon, ammoCount } from '../actor.js';
import { hrand } from '../rng.js';
import { CS, LH, los, levelOfY } from '../world.js';
import { sideOf, isOpen, isClosed } from '../doors.js';
import { contextOf, doorOps, personOps } from '../interact.js';

const sec = (S, t0) => (S.t - t0) * S.dt;
const TEAMOF = (a) => a.ai.squad || 'red';

// 命令の受け取り（brain から呼ぶ）
export function takeOrders(S, w) {
  if (!S.orders.length) return;
  for (const o of S.orders) {
    const team = o.team || 'gold';
    const mem = S.actors.filter(a => a.kind === 'swat' && a.ai && a.ai.type === 'swat' && a.alive && !a.down && (team === 'gold' || TEAMOF(a) === team)).sort((p, q) => p.ai.slot - q.ai.slot);
    mem.forEach((a, i) => {
      a.ai.order = { ...o, seq: o.n, role: i, cnt: mem.length, ph: 'go', phT: S.t };
      a.ai.leader = o.by;
      a.ai.nav = null;
      if (o.cmd === 'fallin') a.ai.order = null;
    });
  }
  S.orders.length = 0;
}

export function thinkSwat(S, w, a, dt, ctx) {
  const ai = a.ai;
  const inp = baseInput(a);
  if (!a.alive || a.down) return inp;
  const sk = SKILL.swat;
  // 警戒: 撃たれた・弾がそばを抜けた・近くで敵の銃声 → 見つけるのが速くなり、撃ってきた方を見る（6秒）
  {
    let src = null;
    const hs = hearNearest(S, w, a, 22, (h) => h.k === 'shot' && h.team !== a.team && h.team >= 0);
    if (hs) src = [hs.x, hs.y, hs.z];
    const by = (a.lastHit && sec(S, a.lastHit.t) < 0.6 && S.byId[a.lastHit.by]) || (a.whizT != null && sec(S, a.whizT) < 0.6 && S.byId[a.whizBy]) || null;
    if (by && by.team !== a.team) src = [by.x, by.y, by.z];
    if (src) { ai.alarmT = S.t; ai.alarm = src; }
  }
  const alarmed = ai.alarmT != null && sec(S, ai.alarmT) < 6;
  ai.alert = alarmed;
  const alarmYaw = alarmed && ai.alarm ? yawTo(ai.alarm[0] - a.x, ai.alarm[2] - a.z) : null;
  // 見張り: 容疑者・市民
  const threats = [], people = [];
  for (const b of ctx.others) {
    if (b.kind !== 'sus' && b.kind !== 'civ') continue;
    if (!b.alive && !b.dead) continue;
    let v = b.alive ? visibility(S, w, a, b, { fov: 100, maxD: 40 }) : 0;
    // 警戒中: 撃ってきた方（±35°）に見える相手は、暗くても見つけやすい
    if (v > 0 && alarmYaw != null && Math.abs(angDiff(yawTo(b.x - a.x, b.z - a.z), alarmYaw)) < 0.6) v = Math.max(v, 0.7);
    const seen = detect(S, a, b, v, dt);
    if (!seen) continue;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (b.kind === 'sus' && canFight(b) && hasGun(b) && isThreat(S, b)) threats.push({ b, d });
    else people.push({ b, d });
  }
  threats.sort((p, q) => p.d - q.d);
  // 交戦: 差し迫った脅威は撃つ（味方が射線にいなければ）
  if (threats.length) {
    const t = threats[0].b;
    if (ai.engId !== t.id) { ai.engId = t.id; ai.engT = S.t; ai.engD = sk.react[0] + (sk.react[1] - sk.react[0]) * hrand(a.id, S.t, 101); }
    const ty = t.y + (t.st > 1.5 ? 0.3 : t.st > 0.5 ? 0.95 : 1.3);
    const off = aimAt(S, a, inp, t.x, ty, t.z, sk, dt, { id: t.id });
    inp.ads = true;
    const clear = lineClear(S, a, t);
    if (sec(S, ai.engT) >= ai.engD && clear) trigger(S, a, inp, sk, off < 0.08);
    if (!ai.yellT || sec(S, ai.yellT) > 1.6) { ai.yellT = S.t; pushAct(inp, { a: 'shout', line: 'swat_drop' }); }
    // 撃ち合いの最中も命令の動きは止める
    return inp;
  }
  ai.engId = null;
  // 呼びかけ: 従っていない人
  let yelling = null;
  for (const p of people) {
    const b = p.b;
    if (!b.alive || b.cuffed || b.down || b.comply >= 2 || (b.ai && b.ai.bound)) continue;
    if (p.d > 14) continue;
    yelling = b; break;
  }
  if (yelling && (!ai.yellT || sec(S, ai.yellT) > 1.3)) { ai.yellT = S.t; pushAct(inp, { a: 'shout', line: yelling.kind === 'sus' ? 'swat_hands' : 'swat_civ' }); }
  // 命令
  const o = ai.order;
  let busy = false;
  if (o) busy = doOrder(S, w, a, inp, dt, o, ctx, sk, people);
  // 命令がない・終わった: 拘束と報告を自分で、それから追従
  if (!busy) {
    if (autoSecure(S, w, a, inp, dt, people, ctx)) return inp;
    follow(S, w, a, inp, dt, ctx);
  }
  // 呼びかけ相手がいれば、そちらへ銃を向ける（撃たない）
  if (yelling && !a.act) { aimAt(S, a, inp, yelling.x, yelling.y + 1.1, yelling.z, sk, dt, { id: yelling.id, errMul: 0.5 }); inp.ads = Math.hypot(yelling.x - a.x, yelling.z - a.z) < 10; inp.low = false; }
  // 警戒中で相手が見えていない: 撃ってきた方へ向く（扉の操作中は除く）。動く向きは保つ
  else if (alarmYaw != null && !a.act && !(o && (o.stage === 'open' || o.ph === 'doing'))) { lookKeepMove(inp, turnToward(inp.yaw, alarmYaw, 7 * dt)); inp.ads = true; inp.low = false; }
  return inp;
}

// 体の向きだけを変え、世界での動く向きは保つ（mx/mz は体の向きに対する値なので直す）
function lookKeepMove(inp, yaw) {
  const s0 = Math.sin(inp.yaw), c0 = Math.cos(inp.yaw);
  const wx = s0 * inp.mz - c0 * inp.mx, wz = c0 * inp.mz + s0 * inp.mx;
  const s1 = Math.sin(yaw), c1 = Math.cos(yaw);
  inp.yaw = yaw; inp.mz = wx * s1 + wz * c1; inp.mx = -wx * c1 + wz * s1;
}

// 脅威か: 撃った・構えた（直前）・戦っている
export function isThreat(S, b) {
  if (!b.ai) return true;
  if (b.ai.threatT != null && sec(S, b.ai.threatT) < 1.2) return true;
  if (b.ai.st === 'fight' && b.ws && b.ws.slot >= 0 && !b.low) return true;
  return false;
}
// 射線に味方・市民がいないか
function lineClear(S, a, t) {
  const e = eyeOf(S, a);
  const dx = t.x - e[0], dz = t.z - e[2], L = Math.hypot(dx, dz) || 1;
  for (const b of S.actors) {
    if (b === a || b === t || !b.alive || (b.kind !== 'swat' && b.kind !== 'civ')) continue;
    const px = b.x - e[0], pz = b.z - e[2];
    const along = (px * dx + pz * dz) / L;
    if (along < 0.3 || along > L) continue;
    const perp = Math.abs(px * dz - pz * dx) / L;
    if (perp < 0.45 && Math.abs(b.y - a.y) < 1.5) return false;
  }
  return true;
}

function leaderOf(S, a) {
  const id = a.ai.leader;
  let L = id != null ? S.byId[id] : null;
  if (!L || !L.alive || L.down) L = S.actors.find(b => b.pid != null && b.kind === 'swat' && b.alive && !b.down) || S.actors.find(b => b.kind === 'swat' && b.alive && !b.down && b !== a && b.ai && b.ai.slot === 0);
  return L;
}

// 追従: 指揮する人の後ろに、ずらした列で
function follow(S, w, a, inp, dt, ctx) {
  const L = leaderOf(S, a);
  if (!L || L === a) { inp.low = true; return; }
  const rank = (a.ai.slot || 0) + 1;
  const side = rank % 2 ? 0.55 : -0.55;
  const back = 0.9 + rank * 0.85;
  const fx = Math.sin(L.yaw), fz = Math.cos(L.yaw), rx = -fz, rz = fx;
  let tx = L.x - fx * back + rx * side, tz = L.z - fz * back + rz * side;
  // 歩けない所なら近くの床
  const k = navCell(w, tx, L.y, tz);
  const nav = buildNav(w);
  if (k < 0 || !nav.walk[k]) { const k2 = k >= 0 ? nearestWalk(w, k, 3) : -1; if (k2 >= 0) { const c = cellCenter(w, k2); tx = c[0]; tz = c[2]; } else { tx = L.x; tz = L.z; } }
  const d = Math.hypot(tx - a.x, tz - a.z);
  if (d > 0.7) {
    const r = goTo(S, w, a, inp, tx, L.y, tz, { speed: d > 3 ? 1 : 0.6, r: 0.6, faceMove: d > 3 });
    inp.low = d > 2.5;
  }
  // 見張りの向き: 列の順に、前・右・左・後ろ
  const look = [0, 0.7, -0.7, Math.PI][a.ai.slot % 4];
  if (d <= 3) { const want = L.yaw + look; inp.yaw = turnToward(a.yaw, want, 3 * dt); inp.pitch = a.pitch * 0.9; }
  inp.stance = L.stance === 1 ? 1 : 0;
}

// 投降・倒れた人を拘束し、報告する
function autoSecure(S, w, a, inp, dt, people, ctx) {
  const ai = a.ai;
  if (a.act) { inp.mx = inp.mz = 0; return true; }
  // 他の隊員がやっている相手は除く
  const taken = new Set();
  for (const b of S.actors) if (b !== a && b.kind === 'swat' && b.ai && b.ai.secId != null) taken.add(b.ai.secId);
  let best = null, bd = 1e9, op = null;
  for (const p of people) {
    const b = p.b;
    if (taken.has(b.id) || p.d > 9) continue;
    if (b.alive && !b.cuffed && (b.comply >= 1 || b.down || b.tased > 0 || b.stun > 1)) { if (p.d < bd) { bd = p.d; best = b; op = 'restrain'; } }
    else if ((b.cuffed || b.down || b.dead) && !b.reported) { if (p.d + 3 < bd) { bd = p.d + 3; best = b; op = 'report'; } }
  }
  // 倒れた味方の報告
  for (const b of S.actors) if (b.kind === 'swat' && b !== a && b.down && !b.reported && !taken.has(b.id)) { const d = Math.hypot(b.x - a.x, b.z - a.z); if (d < 8 && d + 4 < bd) { bd = d + 4; best = b; op = 'report'; } }
  if (!best) { ai.secId = null; return false; }
  ai.secId = best.id;
  const d = Math.hypot(best.x - a.x, best.z - a.z);
  if (d > 1.4) { goTo(S, w, a, inp, best.x, best.y, best.z, { speed: 0.6, r: 1.2 }); inp.low = true; return true; }
  // 近い: 向いて動作
  inp.yaw = turnToward(a.yaw, yawTo(best.x - a.x, best.z - a.z), 6 * dt);
  inp.pitch = turnToward(a.pitch, -0.6, 3 * dt);
  if (Math.abs(angDiff(inp.yaw, yawTo(best.x - a.x, best.z - a.z))) < 0.3) pushAct(inp, { a: 'op', k: 'person', id: best.id, op });
  return true;
}

// ---- 命令ごとの動き。戻り値: 命令で忙しいか
function doOrder(S, w, a, inp, dt, o, ctx, sk, people) {
  const ai = a.ai;
  const done = () => { ai.order = null; ai.nav = null; return false; };
  if (sec(S, o.phT) > 90) return done();
  switch (o.cmd) {
    case 'move': {
      if (!o.tgt) {
        // 自分の位置: 指示の点のまわりに少しずつずらす。家具の中・壁の向こう・扉の口なら、同じ部屋の近くの床へ
        const off = o.role === 0 ? [0, 0] : [[0.7, 0], [-0.7, 0], [0, -0.8], [0.7, -0.8]][(o.role - 1) % 4];
        const fx = Math.sin(o.yaw || 0), fz = Math.cos(o.yaw || 0);
        const tx = o.x + (-fz) * off[0] + fx * off[1], tz = o.z + fx * off[0] + fz * off[1];
        const kc = navCell(w, o.x, o.y || 0, o.z), room = kc >= 0 ? w.roomAt[kc] : -1;
        o.tgt = snapFloor(w, tx, o.y || 0, tz, room) || snapFloor(w, o.x, o.y || 0, o.z, room) || [o.x, o.z];
      }
      const [tx, tz] = o.tgt;
      const r = goTo(S, w, a, inp, tx, o.y, tz, { speed: 0.8, r: 0.5 });
      inp.low = r === 'moving';
      // 着いた・行けない・近くで詰まった（味方が立っているなど）・時間切れ → その場で待機
      const dd = Math.hypot(tx - a.x, tz - a.z);
      if (dd < 1.8 && los(w, a.x, a.y + 1, a.z, tx, (o.y || 0) + 1, tz, S.doors)) o.nearT = (o.nearT || 0) + S.dt;
      if (r === 'arrived' || r === 'blocked' || (o.nearT || 0) > 1.2 || sec(S, o.phT) > 25) { o.cmd = 'hold'; o.hy = o.yaw; o.doneT = S.t; }
      return true;
    }
    case 'hold': case 'cover': {
      inp.mx = inp.mz = 0;
      // 扉の口（死の漏斗）に立ち止まらない: 近ければ脇へよける
      const dn = nearDoor(w, a);
      if (dn) { steerToward(a, inp, dn.x, dn.z, 0.6, false); return true; }
      const want = o.cmd === 'cover' && o.x != null ? yawTo(o.x - a.x, o.z - a.z) : (o.hy ?? a.yaw);
      inp.yaw = turnToward(a.yaw, want + (o.role % 2 ? 0.25 : -0.25) * (o.cmd === 'hold' ? 1 : 0.3), 4 * dt);
      inp.ads = o.cmd === 'cover';
      return true;
    }
    case 'stack': return stackAt(S, w, a, inp, dt, o, o.side || 'split');
    case 'breach': return breach(S, w, a, inp, dt, o, ctx, sk);
    case 'mirror': case 'wedge': case 'disarm': case 'pick': case 'unwedge': {
      if (o.role !== 0) return stackAt(S, w, a, inp, dt, o, 'split');
      const d = w.doors[o.door]; if (!d) return done();
      if (o.ph === 'done') return done();
      const side = o.side0 ?? (o.side0 = sideOf(d, a.x, a.z));
      const fx = d.cx + d.nx * side * 0.65, fz = d.cz + d.nz * side * 0.65;
      const r = goTo(S, w, a, inp, fx, d.L * LH, fz, { speed: 0.7, r: 0.3, noDoors: true });
      if (r === 'arrived' || Math.hypot(fx - a.x, fz - a.z) < 0.5) {
        inp.yaw = turnToward(a.yaw, yawTo(d.cx - a.x, d.cz - a.z), 6 * dt);
        if (!a.act && o.ph !== 'doing') {
          const ops = doorOps(S, w, a, o.door);
          const want = o.cmd === 'pick' ? (ops.find(x => x.op === 'lockgun') ? 'lockgun' : 'pick') : o.cmd;
          if (!ops.find(x => x.op === want)) { o.ph = 'done'; return true; }
          pushAct(inp, { a: 'op', k: 'door', id: o.door, op: want }); o.ph = 'doing'; o.doT = S.t;
        } else if (!a.act && o.ph === 'doing' && sec(S, o.doT) > 0.3) o.ph = 'done';
      }
      return true;
    }
    case 'restrain': {
      const b = S.byId[o.target];
      if (!b || b.cuffed || !b.alive) return done();
      if (o.role !== 0) return false;
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d > 1.3) { goTo(S, w, a, inp, b.x, b.y, b.z, { speed: 0.7, r: 1.1 }); return true; }
      inp.yaw = turnToward(a.yaw, yawTo(b.x - a.x, b.z - a.z), 6 * dt); inp.pitch = -0.6;
      if (!a.act) pushAct(inp, { a: 'op', k: 'person', id: b.id, op: 'restrain' });
      return true;
    }
    case 'deploy': {
      if (o.role !== 0) return false;
      return throwAt(S, w, a, inp, dt, o.nade, o.x, o.y, o.z, () => { ai.order = null; });
    }
    case 'search': return search(S, w, a, inp, dt, o, people);
  }
  return done();
}

// 扉の口の近く（1m以内）にいたら、よける先（扉の面に沿って脇、自分のいる側）
function nearDoor(w, a) {
  const L = levelOfY(a.y + 0.2);
  for (const d of w.doors) {
    if (d.L !== L) continue;
    const dx = a.x - d.cx, dz = a.z - d.cz;
    if (Math.abs(dx) > 1.4 || Math.abs(dz) > 1.4) continue;
    const along = d.axis === 0 ? dx : dz, across = dx * d.nx + dz * d.nz;
    const half = (d.a1 - d.a0) / 2;
    if (Math.abs(along) < half + 0.25 && Math.abs(across) < 0.9) {
      const sgn = along >= 0 ? 1 : -1, side = across >= 0 ? 1 : -1;
      const tx = d.axis === 0 ? 1 : 0, tz = d.axis === 0 ? 0 : 1;
      return { x: d.cx + tx * sgn * (half + 0.7) + d.nx * side * 0.7, z: d.cz + tz * sgn * (half + 0.7) + d.nz * side * 0.7 };
    }
  }
  return null;
}
// スタック: 扉の手前側の壁ぞいに並ぶ（分割＝左右交互）
function stackPos(S, w, d, side, role, how) {
  const tx = d.axis === 0 ? 1 : 0, tz = d.axis === 0 ? 0 : 1; // 壁にそった向き
  const half = (d.a1 - d.a0) / 2;
  let sgn = how === 'left' ? -1 : how === 'right' ? 1 : (role % 2 ? 1 : -1);
  const rank = how === 'split' ? Math.floor(role / 2) : role;
  const along = half + 0.45 + rank * 0.65;
  const outN = 0.45;
  let x = d.cx + tx * along * sgn + d.nx * side * outN, z = d.cz + tz * along * sgn + d.nz * side * outN;
  return [x, z];
}
function stackAt(S, w, a, inp, dt, o, how) {
  const d = w.doors[o.door]; if (!d) { a.ai.order = null; return false; }
  const side = o.side0 ?? (o.side0 = sideOf(d, S.byId[o.by] ? S.byId[o.by].x : a.x, S.byId[o.by] ? S.byId[o.by].z : a.z));
  const [x, z] = stackPos(S, w, d, side, o.role, how);
  const r = goTo(S, w, a, inp, x, d.L * LH, z, { speed: 0.8, r: 0.3, noDoors: true });
  inp.low = r === 'moving';
  if (r === 'arrived' || (r !== 'moving' && Math.hypot(x - a.x, z - a.z) < 1.2)) {
    inp.yaw = turnToward(a.yaw, yawTo(d.cx - a.x, d.cz - a.z), 5 * dt);
    o.inPos = true;
  } else if (r === 'blocked') {
    // 行けない: 少し待ってだめなら、この命令をやめる（指揮する人が別の道を選ぶ）
    o.blockT = (o.blockT || 0) + S.dt;
    if (o.blockT > 6) { o.inPos = true; o.cantReach = true; }
  }
  return true;
}

// 突入: スタック → 開ける（方法）→ 投げ物 → 入る（左右の角へ）→ 安全を確かめる
function breach(S, w, a, inp, dt, o, ctx, sk) {
  const ai = a.ai;
  const d = w.doors[o.door], ds = S.doors[o.door];
  if (!d || !ds) { ai.order = null; return false; }
  const issuer = S.byId[o.by];
  const side = o.side0 ?? (o.side0 = sideOf(d, issuer ? issuer.x : a.x, issuer ? issuer.z : a.z));
  // 全員で共有する進み具合（同じ命令番号）
  // 突入の命令をまだ実行中の隊員だけ（待機に移った人は数えない。数えると段階が最初に戻る）
  const team = S.actors.filter(b => b.kind === 'swat' && b.ai && b.ai.order && b.ai.order.seq === o.seq && b.ai.order.cmd === 'breach' && b.alive && !b.down);
  const lead = team.reduce((m, b) => (b.ai.order.role < m.ai.order.role ? b : m), team[0] || a);
  const T = lead.ai.order;
  if (!T.stage) { T.stage = 'stack'; T.stT = S.t; }
  const stage = T.stage;
  // 遠い隊員（別の階・8mより先）は待たない（あとから追いつく）
  const far = (b) => levelOfY(b.y + 0.3) !== d.L || Math.hypot(b.x - d.cx, b.z - d.cz) > 8;
  if (stage === 'stack') {
    stackAt(S, w, a, inp, dt, o, 'split');
    if (a === lead) {
      const ready = team.every(b => b.ai.order.inPos || far(b)) || sec(S, T.stT) > 8;
      if (ready) { T.stage = 'open'; T.stT = S.t; T.party = team.filter(b => b.ai.order.inPos).map(b => b.id); pushAct(inp, { a: 'shout', line: 'swat_breaching' }); }
    }
    return true;
  }
  if (stage === 'open') {
    // 開ける人: 必要な道具を持つ隊員
    const need = o.method === 'ram' ? (b) => b.inv.long === 'ram' : o.method === 'breach' ? (b) => b.inv.long === 'breacher' : o.method === 'c2' ? (b) => b.inv.gear.some(g => g.id === 'c2' && g.n > 0) : () => true;
    const opener = team.find(need) || lead;
    if (a !== opener) { stackAt(S, w, a, inp, dt, o, 'split'); return true; }
    if (isOpen(ds) || ds.broken) { T.stage = o.nade && o.nade !== 'none' ? 'nade' : 'enter'; T.stT = S.t; return true; }
    const fx = d.cx + d.nx * side * 0.6, fz = d.cz + d.nz * side * 0.6;
    const r = goTo(S, w, a, inp, fx, d.L * LH, fz, { speed: 0.6, r: 0.25, noDoors: true });
    if (r !== 'arrived' && Math.hypot(fx - a.x, fz - a.z) > 0.45) {
      // 扉の前まで行けない（12秒）: 突入をやめる
      if (sec(S, T.stT) > 12) { for (const b of team) b.ai.order = null; }
      return true;
    }
    inp.yaw = turnToward(a.yaw, yawTo(d.cx - a.x, d.cz - a.z), 6 * dt);
    if (a.act) return true;
    const ops = doorOps(S, w, a, o.door);
    let m = o.method || 'open';
    if (m === 'open' && ds.locked && !ds.lockBroken) { m = 'kick'; if (!T.saidLocked) { T.saidLocked = true; pushAct(inp, { a: 'shout', line: 'swat_locked' }); } }
    if (!ops.find(x => x.op === m)) m = ops.find(x => x.op === 'kick') ? 'kick' : 'open';
    if (m === 'c2') {
      if (!ds.c2) { pushAct(inp, { a: 'op', k: 'door', id: o.door, op: 'c2' }); T.c2T = S.t; return true; }
      // 離れて起爆
      const bx = d.cx + d.nx * side * 3.0, bz = d.cz + d.nz * side * 3.0;
      const r2 = goTo(S, w, a, inp, bx, d.L * LH, bz, { speed: 0.9, r: 0.5, noDoors: true });
      if (r2 !== 'moving' || sec(S, T.c2T) > 6) pushAct(inp, { a: 'det' });
      return true;
    }
    if (!T.opT || sec(S, T.opT) > 0.9) { T.opT = S.t; pushAct(inp, { a: 'op', k: 'door', id: o.door, op: m }); }
    if (sec(S, T.stT) > 20) { T.stage = 'enter'; T.stT = S.t; }
    return true;
  }
  if (stage === 'nade') {
    const thrower = team.find(b => b.inv.gear.some(g => g.id === o.nade && g.n > 0) && b.ai.order.role !== 0) || team.find(b => b.inv.gear.some(g => g.id === o.nade && g.n > 0));
    if (!thrower) { T.stage = 'enter'; T.stT = S.t; return true; }
    if (a !== thrower) { stackAt(S, w, a, inp, dt, o, 'split'); if (T.thrown && sec(S, T.thrown) > 1.7) { T.stage = 'enter'; T.stT = S.t; } return true; }
    const tx = d.cx - d.nx * side * 3.2, tz = d.cz - d.nz * side * 3.2;
    if (!T.thrown) throwAt(S, w, a, inp, dt, o.nade, tx, d.L * LH + 0.5, tz, () => { T.thrown = S.t; });
    else { stackAt(S, w, a, inp, dt, o, 'split'); if (sec(S, T.thrown) > 1.7) { T.stage = 'enter'; T.stT = S.t; } }
    return true;
  }
  if (stage === 'enter') {
    // 入る順: 役の番号順に 0.45秒ずつ
    const myT = o.role * 0.45;
    if (sec(S, T.stT) < myT) { stackAt(S, w, a, inp, dt, o, 'split'); return true; }
    const P = entryPoint(S, w, d, side, o.role);
    const r = goTo(S, w, a, inp, P[0], d.L * LH, P[1], { speed: 0.75, r: 0.35 });
    inp.ads = true; inp.low = false;
    // 入りながら部屋の奥を見る
    const lx = d.cx - d.nx * side * 4, lz = d.cz - d.nz * side * 4;
    const inside = sideOf(d, a.x, a.z) !== side;
    if (inside) { inp.yaw = turnToward(a.yaw, yawTo(P[2] - a.x, P[3] - a.z), 7 * dt); inp.mz = Math.min(inp.mz, 0.8); }
    if (r !== 'moving') { o.inRoom = true; inp.yaw = turnToward(a.yaw, yawTo(P[2] - a.x, P[3] - a.z), 6 * dt); }
    // スタックにいた隊員（party）が部屋に入ったら制圧へ
    const party = T.party && T.party.length ? T.party : team.map(b => b.id);
    if (a === lead && team.every(b => !party.includes(b.id) || b.ai.order.inRoom || !b.alive)) { if (!T.clearT) T.clearT = S.t; if (sec(S, T.clearT) > 1.5) { T.stage = 'clear'; T.stT = S.t; } }
    if (sec(S, T.stT) > 18) { T.stage = 'clear'; T.stT = S.t; }
    return true;
  }
  if (stage === 'clear') {
    if (a === lead && !T.said) { T.said = true; pushAct(inp, { a: 'shout', line: 'swat_clear' }); }
    // その場で見張る。少したったら全員そろって待機へ（指揮する人が動いたら追従へ）
    const P = entryPoint(S, w, d, side, o.role);
    inp.yaw = turnToward(a.yaw, yawTo(P[2] - a.x, P[3] - a.z), 4 * dt);
    if (a === lead && sec(S, T.stT) > 2.5) {
      for (const b of team) { const bo = b.ai.order; b.ai.order = { cmd: 'hold', hy: b.yaw, role: bo.role, seq: bo.seq, cnt: bo.cnt, ph: 'go', phT: S.t, by: bo.by, team: bo.team, t: S.t, doneT: S.t }; }
    }
    return true;
  }
  return false;
}
// 部屋の中の制圧の位置（入口の左右の角、奥）と見る点
function entryPoint(S, w, d, side, role) {
  const nx = -d.nx * side, nz = -d.nz * side; // 部屋の中への向き
  const tx = d.axis === 0 ? 1 : 0, tz = d.axis === 0 ? 0 : 1;
  const sgn = role % 2 ? 1 : -1, rank = Math.floor(role / 2);
  const depth = 0.9 + rank * 1.0, lat = 1.4 + rank * 0.6;
  let x = d.cx + nx * depth + tx * sgn * lat, z = d.cz + nz * depth + tz * sgn * lat;
  const k = navCell(w, x, d.L * LH, z);
  const nav = buildNav(w);
  if (k < 0 || !nav.walk[k]) { const k2 = k >= 0 ? nearestWalk(w, k, 3) : -1; if (k2 >= 0) { const c = cellCenter(w, k2); x = c[0]; z = c[2]; } else { x = d.cx + nx * 1.0; z = d.cz + nz * 1.0; } }
  // 見る点: 反対側の奥の角
  const lx = d.cx + nx * 4.5 - tx * sgn * 2.5, lz = d.cz + nz * 4.5 - tz * sgn * 2.5;
  return [x, z, lx, lz];
}

// 投げ物を点へ
function throwAt(S, w, a, inp, dt, nade, tx, ty, tz, onThrown) {
  const ai = a.ai;
  const has = a.inv.gear.find(g => g.id === nade && g.n > 0);
  if (!has) { onThrown(); return false; }
  const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
  const want = yawTo(dx, dz);
  inp.yaw = turnToward(a.yaw, want, 7 * dt);
  const th = 0.28;
  inp.pitch = turnToward(a.pitch, th - 0.12, 3 * dt);
  if (a.ws.slot !== 2 || a.ws.gear !== nade) { if (!ai.selT || sec(S, ai.selT) > 1) { ai.selT = S.t; pushAct(inp, { a: 'gear', id: nade }); } return true; }
  if ((a.ws.st === 'gear' || a.ws.st === 'ready') && Math.abs(angDiff(a.yaw, want)) < 0.12) {
    const v = Math.sqrt(Math.max(1, d) * 9.81 / Math.sin(2 * th));
    inp.power = Math.max(0.1, Math.min(1, (v - 4) / 9));
    inp.fire = true;
    pushAct(inp, { a: 'shout', line: nade === 'flash' ? 'swat_flash' : nade === 'stinger' ? 'swat_stinger' : 'swat_gas' });
    onThrown();
  }
  return true;
}

// 捜索して確保: 近くの部屋で、投降・倒れた人を拘束して報告し、落ちた武器を回収
function search(S, w, a, inp, dt, o, people) {
  const ai = a.ai;
  if (a.act) { inp.mx = inp.mz = 0; return true; }
  if (sec(S, o.phT) > 30) { ai.order = null; ai.secId = null; return false; }
  const bad = ai.noReach || (ai.noReach = {});
  const room0 = o.room ?? (o.room = roomAtPos(w, a.x, a.y, a.z));
  const taken = new Set();
  for (const b of S.actors) if (b !== a && b.kind === 'swat' && b.ai && b.ai.secId != null) taken.add(b.ai.secId);
  // 人
  let best = null, bd = 1e9, op = null, kind = 'person';
  for (const b of S.actors) {
    if ((b.kind !== 'sus' && b.kind !== 'civ') || taken.has(b.id) || (bad[b.id] && S.t < bad[b.id])) continue;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d > 16 || Math.abs(b.y - a.y) > 2) continue;
    if (b.alive && !b.cuffed && (b.comply >= 1 || b.down)) { if (d < bd) { bd = d; best = b; op = 'restrain'; } }
    else if ((b.cuffed || b.dead || b.down) && !b.reported) { if (d + 2 < bd) { bd = d + 2; best = b; op = 'report'; } }
  }
  // 証拠
  for (const it of S.items) {
    if (it.gone || (it.kind !== 'weapon' && it.kind !== 'evidence') || (bad[-it.id] && S.t < bad[-it.id])) continue;
    const d = Math.hypot(it.x - a.x, it.z - a.z);
    if (d > 14 || taken.has(-it.id) || Math.abs(it.y - a.y) > 2) continue;
    if (d + 1 < bd) { bd = d + 1; best = it; op = 'collect'; kind = 'item'; }
  }
  if (!best) { if (sec(S, o.phT) > 3) ai.order = null; return false; }
  const sid = kind === 'item' ? -best.id : best.id;
  if (ai.secId !== sid) { ai.secId = sid; ai.secT = S.t; }
  const d = Math.hypot(best.x - a.x, best.z - a.z);
  if (d > 1.3) {
    const r = goTo(S, w, a, inp, best.x, best.y, best.z, { speed: 0.7, r: 1.1 }); inp.low = true;
    // 届かない相手・物（8秒）はしばらく後回し
    if (r === 'blocked' || sec(S, ai.secT) > 8) { bad[sid] = S.t + Math.round(30 / S.dt); ai.secId = null; }
    return true;
  }
  inp.yaw = turnToward(a.yaw, yawTo(best.x - a.x, best.z - a.z), 6 * dt); inp.pitch = turnToward(a.pitch, -0.7, 3 * dt);
  pushAct(inp, { a: 'op', k: kind, id: best.id, op });
  return true;
}
