// 容疑者と市民のAI（Ready Or Not のように）: 士気と呼びかけで投降、偽装投降、隠れる・待ち伏せ・逃げる、人質犯、乱射犯
import { baseInput, pushAct, visibility, detect, lastSeen, seenAgo, goTo, steerToward, aimAt, trigger, hearNearest, randomCellInRoom, roomAtPos, aimingAt, canFight, hasGun, angDiff, yawTo, turnToward, SKILL } from './common.js';
import { eyeOf, dropWeapon } from '../combat.js';
import { curWeapon, curW } from '../actor.js';
import { hrand } from '../rng.js';
import { los, CS } from '../world.js';
import { roomGraph } from './nav.js';
import { isOpen } from '../doors.js';

const sec = (S, t0) => (S.t - t0) * S.dt;

// ---- 呼びかけを聞いたか（自分に向いた警官の声）
function shoutsAtMe(S, w, a) {
  let n = 0, by = null;
  for (const s of S.shouts) {
    const b = S.byId[s.by];
    if (!b || b.kind === a.kind || b.team === a.team) continue;
    if (b.kind !== 'swat') continue;
    const dx = a.x - s.x, dz = a.z - s.z, d = Math.hypot(dx, dz);
    if (d > 15 || Math.abs(a.y - s.y) > 2) continue;
    const facing = Math.abs(angDiff(yawTo(dx, dz), s.yaw)) < 0.95 || d < 4;
    if (!facing) continue;
    const e = eyeOf(S, a);
    if (!los(w, e[0], e[1], e[2], s.x, s.y + 1.6, s.z, S.doors) && d > 3) continue;
    n++; by = b;
  }
  return n ? { n, by } : null;
}

function policeList(S) { return S.actors.filter(b => b.kind === 'swat' && b.alive && !b.down); }

// ---- 容疑者
export function thinkSuspect(S, w, a, dt, ctx) {
  const ai = a.ai;
  const inp = baseInput(a);
  if (!a.alive || a.down || a.cuffed) { inp.stance = 0; return inp; }
  const sk0 = SKILL[S.rules.diff] || SKILL.normal;
  const sk = { ...sk0, err: sk0.err / (ai.acc || 1), react: sk0.react.map(r => r * (ai.react || 1)) };
  if (ai.training) { sk.err *= 1.6; }
  // 状態の時間
  ai.stT = (ai.stT || 0) + dt;
  if (ai.stagger > 0) ai.stagger -= dt;
  // 怯み・閃光・テーザー中は何もしない（エンジンが動きを止める）
  if (a.tased > 0 || a.flash > 0.8 || a.stun > 0.6 || ai.stagger > 0) { ai.alert = true; ai.alertT = ai.alertT ?? S.t; inp.low = true; return inp; }
  const police = ctx.police;
  // 見る
  let tgt = null, td = 1e9, nVis = 0;
  for (const b of police) {
    const v = visibility(S, w, a, b, { fov: ai.alert ? 95 : 70 });
    if (detect(S, a, b, v, dt)) {
      nVis++;
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d < td) { td = d; tgt = b; }
    }
  }
  // 聞く（銃声・扉を壊す音・閃光・足音）
  const h = hearNearest(S, w, a, 28);
  if (h && !tgt) {
    if (!ai.alert) { ai.alert = true; ai.alertT = S.t; }
    if (h.k !== 'step' || h.loud > 0.5) { ai.alertPos = [h.x, h.y, h.z]; ai.heardT = S.t; }
    if (h.k === 'shot' || h.k === 'boom' || h.k === 'breach') ai.morale = Math.max(0, (ai.morale ?? 0.5) - 0.004);
  }
  if (tgt) { if (!ai.alert) { ai.alert = true; ai.alertT = S.t; } ai.alertPos = [tgt.x, tgt.y, tgt.z]; }
  // 呼びかけ
  const sh = shoutsAtMe(S, w, a);
  if (sh && ai.st !== 'surr' && ai.st !== 'fake') {
    ai.warned = (ai.warned || 0) + 1;
    ai.alert = true; ai.alertT = ai.alertT ?? S.t;
    ai.morale = Math.max(0, (ai.morale ?? 0.5) - 0.05);
    const armed = hasGun(a);
    let p = 0.05 + (1 - (ai.morale ?? 0.5)) * 0.8 - (ai.aggr || 0.5) * 0.22;
    p += Math.max(0, nVis - 1) * 0.12;
    if (a.hp < 60) p += 0.18;
    if (!armed) p += 0.35;
    if (a.gas > 0 || a.stun > 0 || a.flash > 0) p += 0.25;
    p += Math.min(3, ai.warned - 1) * 0.08;
    if (ai.hidden) p += 0.25; // 偽装投降をするつもり
    if (ai.active) p *= 0.25;
    const r = hrand(a.id, S.t, 71);
    if ((ai.morale ?? 0.5) <= 0.02 || r < p) { surrender(S, w, a, ctx); return inp; }
    if (armed && ai.st !== 'fight' && r > 0.85 - (ai.aggr || 0.5) * 0.3) { ai.st = 'fight'; ai.stT = 0; ai.reactT = S.t; pushAct(inp, { a: 'shout', line: 'sus_refuse' }); }
  }
  // 投降中
  if (ai.st === 'surr') return surrState(S, w, a, inp, dt, ctx, sk);
  if (ai.st === 'fake') return fakeState(S, w, a, inp, dt, ctx, sk);
  // 武器がない（拾う力もない）: 逃げるか投降
  if (!hasGun(a)) {
    if (tgt && td < 9) { if (hrand(a.id, S.t, 72) < 0.03) surrender(S, w, a, ctx); }
    return fleeOrHide(S, w, a, inp, dt, tgt);
  }
  // 人質犯: 警官を見たら（または近くで突入・銃声を聞いたら）、しばらくして人質を撃つ。足音だけでは数え始めない
  if (ai.hostage != null && !ai.execArmed) {
    // 見えても遠い（窓ごしに外の警官など）うちは数え始めない。14m 以内に来たら
    if (tgt && td < 14 && Math.abs(tgt.y - a.y) < 2) ai.execArmed = 1;
    else if (h && (h.k === 'breach' || h.k === 'boom' || (h.k === 'shot' && h.team !== a.team))) {
      // 壁ごし・別の階の音は届く距離が短い（12m → 壁ごし7m、別の階6m）
      const sameL = Math.abs(h.y - a.y) < 1.6;
      const open = sameL && los(w, a.x, a.y + 1.5, a.z, h.x, h.y + 1.0, h.z, S.doors);
      const R = (h.k === 'boom' ? 14 : 12) * (open ? 1 : sameL ? 0.6 : 0.5);
      if (Math.hypot(h.x - a.x, h.z - a.z) < R) ai.execArmed = 2;
    }
  }
  if (ai.hostage != null && ai.execArmed) {
    const hs = S.byId[ai.hostage];
    if (hs && hs.alive && !hs.cuffed) {
      // 見たとき: 難しさの秒数。音だけ: その倍
      if (ai.execAt == null) ai.execAt = S.t + Math.round((S.m.execDelay || 9) * (ai.execArmed === 2 ? 2 : 1) / S.dt * (0.8 + 0.4 * hrand(a.id, 1, 73)));
      if (S.t >= ai.execAt && (!tgt || td > 6)) {
        // 人質を撃つ
        const e2 = eyeOf(S, hs);
        aimAt(S, a, inp, hs.x, hs.y + 1.1, hs.z, sk, dt, { id: hs.id, errMul: 0.3 });
        ai.threatT = S.t;
        trigger(S, a, inp, sk, true);
        if (!ai.execSaid) { ai.execSaid = true; pushAct(inp, { a: 'shout', line: 'sus_exec' }); }
        return inp;
      }
    }
  }
  // 乱射犯: 市民を探して撃つ
  if (ai.active && !tgt) {
    let civ = null, cd = 1e9;
    for (const c of ctx.civs) {
      if (!c.alive || c.cuffed) continue;
      const v = visibility(S, w, a, c, { fov: 100, maxD: 30 });
      if (v > 0.2) { const d = Math.hypot(c.x - a.x, c.z - a.z); if (d < cd) { cd = d; civ = c; } }
    }
    if (civ) {
      const off = aimAt(S, a, inp, civ.x, civ.y + 1.2, civ.z, sk, dt, { id: civ.id });
      ai.threatT = S.t;
      trigger(S, a, inp, sk, off < 0.12);
      if (cd > 6) goTo(S, w, a, inp, civ.x, civ.y, civ.z, { speed: 0.7, look: true });
      return inp;
    }
    return roam(S, w, a, inp, dt);
  }
  // 戦う
  if (tgt) {
    if (ai.st !== 'fight') {
      // 見つけた: 戦うか、逃げるか、投降するか
      const m = ai.morale ?? 0.5;
      const close = td < 4;
      let choice = 'fight';
      const r = hrand(a.id, S.t, 74);
      if (ai.wantFlee && td > 6 && r < 0.5) choice = 'flee';
      else if (m < 0.25 && r < 0.4) choice = 'surr';
      else if (close && m < 0.5 && r < 0.3) choice = 'surr';
      if (choice === 'surr') { surrender(S, w, a, ctx); return inp; }
      if (choice === 'flee') { ai.st = 'flee'; ai.stT = 0; ai.fleeTo = null; }
      else { ai.st = 'fight'; ai.stT = 0; ai.reactT = S.t; ai.reactD = sk.react[0] + (sk.react[1] - sk.react[0]) * hrand(a.id, S.t, 75); }
    }
  }
  if (ai.st === 'fight') return fight(S, w, a, inp, dt, ctx, sk, tgt, td);
  if (ai.st === 'flee' || ai.st === 'hide') return fleeOrHide(S, w, a, inp, dt, tgt);
  if (ai.alert) return alerted(S, w, a, inp, dt, ctx, sk);
  return idle(S, w, a, inp, dt);
}

function surrender(S, w, a, ctx) {
  const ai = a.ai;
  if (ai.hidden && hrand(a.id, S.t, 76) < 0.75) {
    // 偽装投降: 手を上げるが、隠した拳銃を持ったまま
    ai.st = 'fake'; ai.stT = 0; a.comply = 1; a.stateT = 0;
    const hid = a.inv.w[1];
    a.inv.w[1] = null;
    if (a.inv.w[0]) { a.ws.slot = 0; dropWeapon(S, a, []); }
    a.inv.w = [null, hid];
    a.ws.slot = -1;
    return;
  }
  ai.st = 'surr'; ai.stT = 0; a.comply = 1; a.stateT = 0;
  if (a.inv.w[0] || a.inv.w[1]) dropWeapon(S, a, []);
  a.inv.w = [null, null]; a.ws.slot = -1;
  ai.saidT = S.t;
}
function surrState(S, w, a, inp, dt, ctx, sk) {
  const ai = a.ai;
  inp.mx = 0; inp.mz = 0;
  // 呼びかけが続く・時間がたつとひざまずく
  if (a.comply === 1 && (ai.stT > 2.2 || shoutsAtMe(S, w, a))) { a.comply = 2; a.stateT = 0; }
  // 近くの警官を見る
  let near = null, nd = 1e9;
  for (const b of ctx.police) { const d = Math.hypot(b.x - a.x, b.z - a.z); if (d < nd) { nd = d; near = b; } }
  if (near && nd < 8) inp.yaw = turnToward(a.yaw, yawTo(near.x - a.x, near.z - a.z), 1.5 * dt);
  return inp;
}
function fakeState(S, w, a, inp, dt, ctx, sk) {
  const ai = a.ai;
  inp.mx = 0; inp.mz = 0;
  if (a.comply === 1 && ai.stT > 1.5) { a.comply = 2; a.stateT = 0; }
  // 近くに警官が来て、自分を狙っていないとき（よそ見・作業中）に撃つ
  const gun = a.inv.w[1];
  if (!gun) { ai.st = 'surr'; return inp; }
  for (const b of ctx.police) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d > 4.5) continue;
    const watched = aimingAt(b, a, 0.3) && b.ads > 0.3;
    const busy = b.act && b.act.k !== 'restrain';
    const restrainingMe = b.act && b.act.k === 'restrain' && b.act.id === a.id;
    if ((!watched || busy || restrainingMe) && ai.stT > 2 && hrand(a.id, S.t, 77) < (restrainingMe ? 0.04 : 0.012)) {
      // 隠した拳銃を抜く
      a.comply = 0; a.stateT = 0; ai.st = 'fight'; ai.stT = 0;
      gun.hiddenGun = false; a.ws.slot = 1; a.ws.st = 'draw'; a.ws.t = 0.35;
      ai.reactT = S.t; ai.reactD = 0.2; ai.threatT = S.t; ai.fakeDraw = true;
      pushAct(inp, { a: 'shout', line: 'sus_fake' });
      return inp;
    }
  }
  return inp;
}
function fight(S, w, a, inp, dt, ctx, sk, tgt, td) {
  const ai = a.ai;
  inp.low = false;
  if (!tgt) {
    // 見失った: 最後に見た所を狙ったまま、少し待つ
    const ago = ai.lastTgt != null ? seenAgo(S, a, ai.lastTgt) : 1e9;
    if (ago > 4) { ai.st = 'alert'; ai.stT = 0; return inp; }
    const m = ai.lastTgt != null ? lastSeen(S, a, ai.lastTgt) : null;
    if (m) aimAt(S, a, inp, m.x, m.y + 1.2, m.z, sk, dt, { id: -1 });
    inp.ads = true;
    if (ago > 2 && ai.wantAmbush) inp.stance = 1;
    return inp;
  }
  ai.lastTgt = tgt.id;
  const W = curW(a);
  const reacted = sec(S, ai.reactT ?? S.t) >= (ai.reactD ?? 0.5);
  const tx = tgt.x, ty = tgt.y + (tgt.st > 1.5 ? 0.3 : tgt.st > 0.5 ? 0.9 : 1.3), tz = tgt.z;
  const off = aimAt(S, a, inp, tx, ty, tz, sk, dt, { id: tgt.id });
  ai.threatT = S.t;
  inp.ads = td > 5;
  if (reacted) trigger(S, a, inp, sk, off < 0.1 + (td < 4 ? 0.15 : 0));
  // 動き: ときどき横へ、近すぎたら下がる
  if (ai.stT > 1.2) {
    const side = hrand(a.id, Math.floor(S.t / 50), 78) < 0.5 ? -1 : 1;
    if (hrand(a.id, Math.floor(S.t / 40), 79) < 0.4) inp.mx = side * 0.6;
    if (td < 2.5) inp.mz = -0.6;
    if (ai.wantAmbush && hrand(a.id, Math.floor(S.t / 90), 80) < 0.5) inp.stance = 1;
  }
  // 撃たれて弱った・弾が切れた → 投降・逃げる
  if ((a.hp < 35 || ai.morale < 0.1) && hrand(a.id, S.t, 81) < 0.004) { surrender(S, w, a, ctx); }
  return inp;
}
function alerted(S, w, a, inp, dt, ctx, sk) {
  const ai = a.ai;
  inp.low = !ai.wantAmbush;
  const p = ai.alertPos;
  if (ai.wantAmbush) {
    // 待ち伏せ: 音のした方の入口を狙って、しゃがむ
    if (p) aimAt(S, a, inp, p[0], p[1] + 1.3, p[2], sk, dt, { id: -2, errMul: 1.5 });
    inp.stance = 1; inp.ads = true;
    return inp;
  }
  if (ai.wantHide && !ai.hidSpot) {
    ai.st = 'hide'; ai.stT = 0;
    return fleeOrHide(S, w, a, inp, dt, null);
  }
  // 音の方を向いて、少し近づく（調べる）か待つ
  if (p) {
    const d = Math.hypot(p[0] - a.x, p[2] - a.z);
    if (ai.aggr > 0.7 && d > 4 && sec(S, ai.alertT) < 20) { goTo(S, w, a, inp, p[0], p[1], p[2], { speed: 0.5, unlock: true }); inp.low = true; }
    else aimAt(S, a, inp, p[0], p[1] + 1.3, p[2], sk, dt, { id: -2, errMul: 2 });
  }
  if (sec(S, ai.alertT) > 45 && !ai.heardT) { ai.alert = false; }
  return inp;
}
function idle(S, w, a, inp, dt) {
  const ai = a.ai;
  inp.low = true;
  // 見回り: ときどき部屋の中を歩く
  if (!ai.walkTo || ai.stT > 12) {
    ai.stT = 0;
    if (hrand(a.id, S.t, 82) < 0.5) {
      const room = roomAtPos(w, ai.home[0], a.y, ai.home[1]);
      const c = room >= 0 ? randomCellInRoom(S, w, room, a.id) : null;
      ai.walkTo = c ? [c[0], c[1], c[2]] : null;
    } else ai.walkTo = null;
  }
  if (ai.walkTo) {
    const r = goTo(S, w, a, inp, ai.walkTo[0], ai.walkTo[1], ai.walkTo[2], { speed: 0.4, unlock: true });
    if (r === 'arrived' || r === 'blocked') ai.walkTo = null;
  } else {
    inp.yaw = a.yaw + Math.sin(S.t * S.dt * 0.4 + a.id) * 0.004;
  }
  return inp;
}
function roam(S, w, a, inp, dt) {
  const ai = a.ai;
  if (!ai.roamTo || ai.stT > 25) {
    ai.stT = 0;
    const rooms = w.rooms.filter(r => !r.out && r.cells.length > 8 && r.L === Math.max(0, Math.floor((a.y + 0.4) / 3)));
    const r = rooms[Math.floor(hrand(a.id, S.t, 83) * rooms.length)];
    const c = r ? randomCellInRoom(S, w, r.id, a.id) : null;
    ai.roamTo = c ? [c[0], c[1], c[2]] : null;
  }
  if (ai.roamTo) { const r = goTo(S, w, a, inp, ai.roamTo[0], ai.roamTo[1], ai.roamTo[2], { speed: 0.75, unlock: true }); if (r === 'arrived' || r === 'blocked') ai.roamTo = null; }
  return inp;
}
// 逃げる・隠れる: 警官から遠い部屋へ。着いたら隠れる（しゃがむ）か待ち伏せ
function fleeOrHide(S, w, a, inp, dt, tgt) {
  const ai = a.ai;
  if (!ai.fleeTo) {
    const here = roomAtPos(w, a.x, a.y, a.z);
    const rg = roomGraph(w);
    let best = null, bs = -1e9;
    const from = tgt ? [tgt.x, tgt.z] : ai.alertPos ? [ai.alertPos[0], ai.alertPos[2]] : [a.x, a.z];
    // 隠れるなら同じ部屋の家具のかげ、逃げるなら隣の部屋
    if (ai.st === 'hide' || !tgt) {
      let hp = null, hd = 1e9;
      for (const p of w.props) {
        if (!p.hide || Math.abs(p.y - a.y) > 1.5) continue;
        const d = Math.hypot(p.x - a.x, p.z - a.z);
        if (d < hd && d < 10) { hd = d; hp = p; }
      }
      if (hp) { ai.fleeTo = [hp.x + (hp.w / 2 + 0.35) * Math.sign(a.x - hp.x || 1) * 0.5, hp.y, hp.z + (hp.d / 2 + 0.35) * Math.sign(a.z - hp.z || 1) * 0.5]; ai.hidSpot = true; }
    }
    if (!ai.fleeTo && here >= 0) {
      for (const p of rg.adj[here] || []) {
        if (p.type !== 'door' && p.type !== 'open' && p.type !== 'stair') continue;
        const other = p.a === here ? p.b : p.a;
        const r = w.rooms[other];
        if (!r || r.out) continue;
        const s = Math.hypot(r.cx - from[0], r.cz - from[1]) + hrand(a.id, other, 84) * 3;
        if (s > bs) { bs = s; best = r; }
      }
      if (best) { const c = randomCellInRoom(S, w, best.id, a.id); if (c) ai.fleeTo = [c[0], c[1], c[2]]; }
    }
    if (!ai.fleeTo) ai.fleeTo = [a.x, a.y, a.z];
  }
  const r = goTo(S, w, a, inp, ai.fleeTo[0], ai.fleeTo[1], ai.fleeTo[2], { speed: 1, unlock: true });
  if (r === 'arrived' || r === 'blocked') {
    inp.stance = 1;
    if (hasGun(a) && ai.wantAmbush !== false && ai.alertPos) { a.ai.st = 'alert'; a.ai.wantAmbush = true; }
    else ai.cowerT = S.t;
  }
  return inp;
}

// ---- 市民
export function thinkCiv(S, w, a, dt, ctx) {
  const ai = a.ai;
  const inp = baseInput(a);
  if (!a.alive || a.down || a.cuffed) return inp;
  ai.stT = (ai.stT || 0) + dt;
  if (ai.bound) { a.comply = 2; return inp; }
  if (a.tased > 0 || a.stun > 0.6 || a.flash > 0.8) { ai.cower = true; return inp; }
  // こわい音: 縮こまるか、逃げる・隠れる
  const h = hearNearest(S, w, a, 22, (x) => x.k === 'shot' || x.k === 'boom' || x.k === 'breach' || x.k === 'shout');
  if (h && !ai.scared) { ai.scared = true; ai.scaredT = S.t; ai.from = [h.x, h.y, h.z]; ai.stT = 0; }
  // 呼びかけ
  const sh = shoutsAtMe(S, w, a);
  if (sh) {
    ai.warned = (ai.warned || 0) + 1;
    let p = (ai.comply ?? 0.75) + (ai.warned - 1) * 0.15 - (ai.stubborn ? 0.45 : 0);
    if (a.gas > 0 || a.stun > 0) p += 0.3;
    if (hrand(a.id, S.t, 91) < p) {
      a.comply = a.comply ? 2 : 1; a.stateT = 0; ai.cower = false; ai.st = 'comply'; ai.stT = 0;
      pushAct(inp, { a: 'shout', line: 'civ_ok' });
      return inp;
    } else if (ai.stubborn) pushAct(inp, { a: 'shout', line: 'civ_refuse' });
  }
  if (ai.st === 'comply') {
    if (a.comply === 1 && ai.stT > 2.5) { a.comply = 2; a.stateT = 0; }
    return inp;
  }
  if (ai.scared) {
    if (ai.wantFlee && !ai.fled) {
      if (!ai.fleeTo) {
        const here = roomAtPos(w, a.x, a.y, a.z);
        const rg = roomGraph(w);
        let best = null, bs = -1e9;
        for (const p of (here >= 0 ? rg.adj[here] : []) || []) {
          if (p.type !== 'door' && p.type !== 'open') continue;
          const other = p.a === here ? p.b : p.a;
          const r = w.rooms[other]; if (!r) continue;
          const s = Math.hypot(r.cx - ai.from[0], r.cz - ai.from[2]) + hrand(a.id, other, 92) * 4;
          if (s > bs) { bs = s; best = r; }
        }
        const c = best ? randomCellInRoom(S, w, best.id, a.id + 7) : null;
        ai.fleeTo = c ? [c[0], c[1], c[2]] : [a.x, a.y, a.z];
      }
      const r = goTo(S, w, a, inp, ai.fleeTo[0], ai.fleeTo[1], ai.fleeTo[2], { speed: ai.slow ? 0.5 : 1, unlock: true });
      if (r === 'arrived' || r === 'blocked' || ai.stT > 12) { ai.fled = true; ai.cower = true; }
      return inp;
    }
    ai.cower = true;
    // 縮こまって、ときどき顔を上げる
    return inp;
  }
  // ふだん: その場で少し動く
  if (hrand(a.id, Math.floor(S.t / 120), 93) < 0.3 && ai.stT > 6) {
    ai.stT = 0;
    const room = roomAtPos(w, a.x, a.y, a.z);
    const c = room >= 0 ? randomCellInRoom(S, w, room, a.id + 3) : null;
    ai.walkTo = c ? [c[0], c[1], c[2]] : null;
  }
  if (ai.walkTo) { const r = goTo(S, w, a, inp, ai.walkTo[0], ai.walkTo[1], ai.walkTo[2], { speed: 0.35, unlock: true }); if (r !== 'moving' && r !== 'door') ai.walkTo = null; }
  return inp;
}
