// 銃の動き: 撃つ・弾倉（1本ずつ残弾）・通常/速いリロード・1発ずつ込める・ポンプ・持ち替え・反動（BattleBit式）・散らばり
import { WEAPONS, AMMO, ATTACH } from './data/weapons.js';
import { LONG, HAND_LONG } from './data/equipment.js';
import { curWeapon, curW } from './actor.js';
import { spawnBullet } from './combat.js';
import { hrand } from './rng.js';
export { hrand };

const DEG = Math.PI / 180;
export function attMods(wi) {
  const m = { rcv: 1, rch: 1, rcfirst: 1, ads: 0, noise: 1, vel: 1, flash: 1, zoom: 1, scope: false };
  if (!wi) return m;
  const s = ATTACH.sight[wi.att.sight], mu = ATTACH.muzzle[wi.att.muzzle], g = ATTACH.grip[wi.att.grip];
  for (const x of [s, mu, g]) {
    if (!x) continue;
    if (x.rcv) m.rcv *= x.rcv; if (x.rch) m.rch *= x.rch; if (x.rcfirst) m.rcfirst *= x.rcfirst;
    if (x.ads) m.ads += x.ads; if (x.noise) m.noise *= x.noise; if (x.vel) m.vel *= x.vel; if (x.flash != null) m.flash *= x.flash;
    if (x.zoom) m.zoom = Math.max(m.zoom, x.zoom); if (x.scope) m.scope = true;
  }
  if (wi.att.muzzle === 'supp' && WEAPONS[wi.id].integral) m.noise = 0.25;
  return m;
}

// 今の散らばり（度）
export function spreadDeg(S, a, W, wi) {
  const sp = W.sp;
  let s = sp.hip + (sp.ads - sp.hip) * a.ads;
  s += sp.move * Math.min(1.5, a.spd / 2.4) * (1 - 0.6 * a.ads);
  s += a.ws.bloom;
  if (a.st > 1.5) s *= 0.6; else if (a.st > 0.5) s *= 0.8;
  if (a.inj.arm) s *= 1.4;
  if (a.flash > 0.2 || (a.gas > 0 && a.armor.head !== 'gasmask')) s *= 1.6;
  if (a.supp > 0) s *= 1 + 0.4 * a.supp;
  if (!a.ground || a.vault) s += 4;
  return s;
}

// 1ステップ。inp: { fire, ads, low } と act の配列（reload/switch/mode/light）
export function stepWeapon(S, w, a, inp, dt, ev) {
  const ws = a.ws;
  if (a.dead || a.cuffed || (a.down && !S.pvp)) { ws.trigWas = !!inp.fire; return; }
  if (ws.cd > 0) ws.cd -= dt;
  // 反動の戻り（撃ち続けている間は弱く）
  const W = curW(a), wi = curWeapon(a);
  const since = (S.t - ws.lastShot) * S.dt;
  if (W) {
    const ctrl = W.rc.ctrl * (since > 0.12 ? 1 : 0.25);
    const dec = ctrl * dt;
    if (ws.rp > 0) ws.rp = Math.max(0, ws.rp - dec); else ws.rp = Math.min(0, ws.rp + dec);
    ws.ry *= since > 0.12 ? Math.pow(0.02, dt) : Math.pow(0.6, dt);
    if (Math.abs(ws.ry) < 1e-3) ws.ry = 0;
    ws.bloom = Math.max(0, ws.bloom - dt * 3.0);
    if (since > 0.25) ws.shots = 0;
  }
  a.fireK = Math.max(0, a.fireK - dt * 9);
  a.throwT = Math.max(0, a.throwT - dt * 1.8);
  // ADS とローレディ
  const busy = ws.st === 'draw' || ws.st === 'holster' || a.sprint || a.vault || (a.act && a.act.noAds);
  a.adsOn = !!inp.ads && !busy && ws.slot >= 0 && (ws.slot < 2 || (ws.slot === 3 && a.inv.long === 'm320')) && !a.down && !a.peek;
  a.lowOn = !!inp.low && !a.adsOn;
  const adsT = W ? W.ads + attMods(wi).ads : 0.25;
  a.ads = Math.max(0, Math.min(1, a.ads + (a.adsOn ? dt / adsT : -dt / (adsT * 0.8))));
  a.low = Math.max(0, Math.min(1, a.low + (a.lowOn ? dt * 5 : -dt * 6)));
  // 状態の時間
  if (ws.t > 0) ws.t -= dt;
  if (ws.t <= 0) finishState(S, a, ev);
  // 操作
  for (const ac of (inp.act || [])) {
    if (ac.a === 'reload') startReload(S, a, !!ac.fast, ev);
    else if (ac.a === 'switch') switchTo(S, a, ac.slot, ev);
    else if (ac.a === 'mode' && ws.slot === 3) m320Next(a, ev);
    else if (ac.a === 'mode' && W && wi && W.modes.length > 1 && ws.st === 'ready') { wi.mode = (wi.mode + 1) % W.modes.length; ev.push({ e: 'fmode', id: a.id, m: W.modes[wi.mode] }); }
    else if (ac.a === 'light' && wi && wi.att.light) { wi.lightOn = !wi.lightOn; a.light = wi.lightOn; ev.push({ e: 'lightsw', id: a.id, on: wi.lightOn }); }
  }
  if (wi) a.light = !!wi.lightOn; else a.light = false;
  // 撃つ
  const trig = !!inp.fire;
  if (W && wi && trig) tryFire(S, w, a, W, wi, inp, ev);
  if (!trig) ws.burstN = 0;
  ws.trigWas = trig;
}

function finishState(S, a, ev) {
  const ws = a.ws, wi = curWeapon(a), W = curW(a);
  const st = ws.st;
  if (st === 'draw') { ws.st = 'ready'; ws.t = 0; }
  else if (st === 'holster') { ws.slot = ws.next; ws.next = -1; ws.st = 'draw'; const W2 = curW(a); ws.t = W2 ? W2.draw : ws.slot === 3 ? (LONG[a.inv.long] && LONG[a.inv.long].draw) || 0.6 : 0.3; if (ev) ev.push({ e: 'draw', id: a.id, slot: ws.slot }); }
  else if (st === 'reload' && wi && W) {
    // 弾倉を替える
    if (ws.rk === 'rev') { const need = W.mag - wi.mag; const take = Math.min(need, wi.res); wi.mag += take; wi.res -= take; }
    else if (ws.rk === 'break') { const need = W.mag - wi.mag; const take = Math.min(need, wi.res); wi.mag += take; wi.res -= take; }
    else if (wi.mags) {
      // いちばん多い弾倉を入れる。通常は抜いた弾倉を残す、速いときは捨てる
      let bi = -1; for (let i = 0; i < wi.mags.length; i++) if (bi < 0 || wi.mags[i] > wi.mags[bi]) bi = i;
      if (bi >= 0) {
        const nm = wi.mags[bi]; wi.mags.splice(bi, 1);
        if (ws.rk === 'tac' && wi.mag > 0) wi.mags.push(wi.mag);
        wi.mag = nm;
        if (!wi.ch && W.chamber) { if (wi.mag > 0) { wi.mag--; wi.ch = 1; } }
      }
    }
    ws.st = 'ready'; ws.t = 0; ws.rk = null;
    if (ev) ev.push({ e: 'reloaded', id: a.id });
  } else if (st === 'shell' && wi && W) {
    // 1発込めた
    if (wi.res > 0 && wi.mag < W.mag) { wi.mag++; wi.res--; if (ev) ev.push({ e: 'shell', id: a.id }); }
    if (!wi.ch && wi.mag > 0 && W.chamber) { wi.mag--; wi.ch = 1; ws.st = 'pump'; ws.t = (W.pump || 0.35); return; }
    if (wi.mag < W.mag && wi.res > 0 && !ws.stopShell) { ws.t = W.rl.shell; }
    else { ws.st = 'ready'; ws.t = 0; ws.stopShell = false; }
  } else if (st === 'pump' && wi && W) {
    if (!wi.ch && wi.mag > 0) { wi.mag--; wi.ch = 1; }
    ws.st = 'ready'; ws.t = 0;
    if (ev) ev.push({ e: 'pumped', id: a.id });
  } else if (st === 'gear') { /* 投げ物を持っている */ }
}

export function startReload(S, a, fast, ev) {
  const ws = a.ws, wi = curWeapon(a), W = curW(a);
  if (!wi || !W || (ws.st !== 'ready' && ws.st !== 'pump')) return false;
  if (a.sprint || a.vault) return false;
  if (W.tube) {
    if (wi.mag >= W.mag || wi.res <= 0) return false;
    ws.st = 'shell'; ws.t = W.rl.start + W.rl.shell; ws.stopShell = false;
    if (ev) ev.push({ e: 'reload', id: a.id, k: 'shell' });
    return true;
  }
  if (W.revolver || W.breakAction) {
    if (wi.mag >= W.mag || wi.res <= 0) return false;
    ws.st = 'reload'; ws.rk = W.revolver ? 'rev' : 'break'; ws.t = W.rl.tac; ws.rd = ws.t;
    if (ev) ev.push({ e: 'reload', id: a.id, k: ws.rk, dur: ws.t });
    return true;
  }
  if (!wi.mags || !wi.mags.length) return false;
  if (wi.mag >= W.mag && (wi.ch || !W.chamber)) return false;
  const empty = !wi.ch && W.chamber;
  ws.rk = fast ? 'fast' : 'tac';
  ws.t = (fast ? W.rl.fast : W.rl.tac) + (empty ? W.rl.empty : 0);
  if (a.inj.arm) ws.t *= 1.15;
  ws.rd = ws.t; ws.st = 'reload';
  if (ev) ev.push({ e: 'reload', id: a.id, k: ws.rk, dur: ws.t, empty });
  return true;
}

export function switchTo(S, a, slot, ev) {
  const ws = a.ws;
  if (slot === ws.slot && ws.st !== 'holster') return false;
  if (slot >= 0 && slot < 2 && !a.inv.w[slot]) return false;
  if (slot === 3 && !HAND_LONG[a.inv.long]) return false;
  // 持ち替える前の物（特殊装備・投げ物から戻るとき）
  if (ws.slot >= 0 && ws.slot < 2) ws.prev = ws.slot;
  ws.next = slot; ws.st = 'holster'; ws.t = 0.22; ws.rk = null;
  if (ev) ev.push({ e: 'holster', id: a.id });
  return true;
}

// M320 の弾を替える（残っている次の種類へ）
export function m320Next(a, ev) {
  const m = a.inv.m320; if (!m) return;
  const order = ['flash', 'stinger', 'cs'];
  let i = order.indexOf(m.sel);
  for (let n = 0; n < 3; n++) { i = (i + 1) % 3; if (m[order[i]] > 0) break; }
  m.sel = order[i];
  if (ev) ev.push({ e: 'm320sel', id: a.id, sel: m.sel, n: m[m.sel] });
}

function tryFire(S, w, a, W, wi, inp, ev) {
  const ws = a.ws;
  if (a.sprint || a.vault || a.low > 0.5 || (a.act && !a.act.canFire) || a.comply || a.down && !S.pvp) return;
  if (ws.st === 'shell') { if (wi.ch || wi.mag > 0) { ws.stopShell = true; ws.st = 'ready'; ws.t = 0; } else return; }
  if (ws.st !== 'ready') return;
  if (ws.cd > 0) return;
  const mode = W.modes[wi.mode] || 'semi';
  if (mode === 'semi' && ws.trigWas) return;
  if (W.range && a.ai == null) { /* テーザーの射程は弾で判定 */ }
  // 弾があるか
  const hasRound = W.chamber ? wi.ch > 0 : wi.mag > 0;
  if (!hasRound) {
    if (!ws.trigWas) ev.push({ e: 'dry', id: a.id });
    ws.cd = 0.25;
    return;
  }
  // 撃つ
  if (W.chamber) {
    wi.ch = 0;
    if (W.pump) { ws.st = 'pump'; ws.t = W.pump; }
    else if (wi.mag > 0) { wi.mag--; wi.ch = 1; }
  } else wi.mag--;
  ws.cd = 60 / W.rpm;
  const m = attMods(wi);
  const am = AMMO[W.cal][wi.am];
  // 散らばりと反動
  const sh = ws.shots;
  const sprd = spreadDeg(S, a, W, wi) * DEG;
  const baseYaw = a.yaw + ws.ry * DEG, basePitch = a.pitch + ws.rp * DEG;
  const pellets = am.pellets || 1;
  const seed = a.stats.sh + 1;
  for (let p = 0; p < pellets; p++) {
    // 円の中で一様に
    const r1 = hrand(a.id, seed, p * 2 + 1), r2 = hrand(a.id, seed, p * 2 + 2);
    let ang = Math.sqrt(r1) * (pellets > 1 ? Math.max(sprd * 0.4, (am.spread || 3) * DEG * (1 - 0.25 * a.ads)) : sprd), th = r2 * Math.PI * 2;
    if (pellets > 1 && p === 0) ang *= 0.3;
    const yaw = baseYaw + Math.cos(th) * ang, pit = basePitch + Math.sin(th) * ang;
    const cp = Math.cos(pit);
    const dx = Math.sin(yaw) * cp, dy = Math.sin(pit), dz = Math.cos(yaw) * cp;
    spawnBullet(S, a, W, wi, am, dx, dy, dz, m, p > 0);
  }
  // 反動
  let kv = W.rc.v * (sh === 0 ? W.rc.first * m.rcfirst : 1) * m.rcv;
  let kh = (hrand(a.id, seed, 77) * 2 - 1) * W.rc.h * m.rch + W.rc.bias * W.rc.h * 0.6;
  let mul = 1 - 0.2 * a.ads;
  if (a.st > 1.5) mul *= 0.7; else if (a.st > 0.5) mul *= 0.85;
  if (a.inj.arm) mul *= 1.6;
  if (S.rules && S.rules.recoil) mul *= S.rules.recoil;
  ws.rp += kv * mul; ws.ry += kh * mul;
  ws.bloom = Math.min(W.sp.hip * 0.8, ws.bloom + W.sp.hip * 0.1 * (1 - 0.7 * a.ads));
  ws.shots++; ws.lastShot = S.t; a.stats.sh++;
  a.fireK = 1;
  // 音と光（AIは聞く）
  const supp = wi.att.muzzle === 'supp';
  ev.push({ e: 'shot', id: a.id, wid: wi.id, x: a.x, y: a.y, z: a.z, supp, loud: (W.less ? 0.4 : 1) * m.noise, fl: m.flash, n: ws.shots });
}
