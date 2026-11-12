// 銃の動き: 撃つ・弾倉（1本ずつ残弾）・通常/速いリロード・1発ずつ込める・ポンプ・持ち替え・反動（BattleBit式）・散らばり
import { WEAPONS, AMMO, ATTACH, zoomsOf } from './data/weapons.js';
import { LONG, HAND_LONG } from './data/equipment.js';
import { curWeapon, curW, magCap } from './actor.js';
import { spawnBullet } from './combat.js';
import { hrand } from './rng.js';
export { hrand };

const DEG = Math.PI / 180;
const _amCache = new WeakMap();
export function attMods(wi) {
  if (!wi) return { rcv: 1, rch: 1, rcfirst: 1, ads: 0, noise: 1, vel: 1, flash: 1, zoom: 1, scope: false, hip: 1, reload: 1, move: 1, spread: 1 };
  const key = wi.att.sight + wi.att.muzzle + wi.att.grip + wi.att.side + wi.att.mag + wi.att.stock;
  const c = _amCache.get(wi);
  if (c && c.key === key) return c.m;
  const m = { rcv: 1, rch: 1, rcfirst: 1, ads: 0, noise: 1, vel: 1, flash: 1, zoom: 1, scope: false, hip: 1, reload: 1, move: 1, spread: 1 };
  const A = ATTACH, a = wi.att;
  for (const x of [A.sight[a.sight], A.muzzle[a.muzzle], A.grip[a.grip], A.side[a.side], A.mag[a.mag], A.stock[a.stock]]) {
    if (!x) continue;
    if (x.rcv) m.rcv *= x.rcv; if (x.rch) m.rch *= x.rch; if (x.rcfirst) m.rcfirst *= x.rcfirst;
    if (x.ads) m.ads += x.ads; if (x.noise) m.noise *= x.noise; if (x.vel) m.vel *= x.vel; if (x.flash != null) m.flash *= x.flash;
    if (x.zoom) m.zoom = Math.max(m.zoom, x.zoom); if (x.scope) m.scope = true;
    if (x.reload) m.reload *= x.reload; if (x.move) m.move *= x.move; if (x.spread) m.spread *= x.spread;
    if (x.hip && !x.laser) m.hip *= x.hip; // レーザーの腰だめは点けている間だけ（spreadDeg）
  }
  if (a.muzzle === 'supp' && WEAPONS[wi.id].integral) m.noise = 0.25;
  m.laserHip = (A.side[a.side] && A.side[a.side].laser && A.side[a.side].hip) || 1;
  _amCache.set(wi, { key, m });
  return m;
}

// 今の散らばり（度）
export function spreadDeg(S, a, W, wi) {
  const sp = W.sp, am = attMods(wi);
  // 腰だめ: 銃床をたたむと良く、レーザーを点けているとさらに良い（構えるほど効かない）
  const hipK = am.hip * (wi && wi.lightOn && wi.att.laser ? am.laserHip : 1);
  let s = sp.hip * hipK + (sp.ads - sp.hip * hipK) * a.ads;
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
  if (!a.alive || a.dead || a.cuffed || (a.down && !S.pvp)) { ws.trigWas = !!inp.fire; return; }
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
  // ADS とローレディ（構えるのはダッシュより先: 構えたい間は走らない。move.js）
  const busy = ws.st === 'draw' || ws.st === 'holster' || a.sprint || a.vault || (a.act && a.act.noAds);
  a.adsOn = !!inp.ads && !busy && canAim(a);
  a.lowOn = !!inp.low && !a.adsOn;
  const adsT = W ? W.ads + attMods(wi).ads : 0.25;
  a.ads = Math.max(0, Math.min(1, a.ads + (a.adsOn ? dt / adsT : -dt / (adsT * 0.8))));
  a.low = Math.max(0, Math.min(1, a.low + (a.lowOn ? dt * 5 : -dt * 6)));
  // 狙撃銃の照準の揺れ（度。構えたときだけ）: しゃがむと半分、伏せると4分の1、動くと大きい、腕のけがで大きい。
  // 時間だけで決まる（乱数なし）ので、オンラインのゲストの手元とホストでほぼ同じになる
  if (W && W.sway && a.ads > 0.01) {
    const t = S.t * S.dt + a.id * 7.3;
    const A = W.sway * a.ads * a.ads * (a.st > 1.5 ? 0.25 : a.st > 0.5 ? 0.5 : 1) * (1 + Math.min(1.5, (a.spd || 0) / 2.4) * 1.5) * (a.inj && a.inj.arm ? 1.8 : 1);
    ws.sx = A * (Math.sin(t * 0.83) * 0.65 + Math.sin(t * 1.91 + 1.3) * 0.35);
    ws.sy = A * (Math.sin(t * 1.17 + 2.1) * 0.6 + Math.sin(t * 0.57 + 0.4) * 0.4);
  } else { ws.sx = 0; ws.sy = 0; }
  // 走るのをやめた: 銃を上げるまで撃てない（重い銃ほど長い 0.1〜0.25秒）。その間に引いた引き金は覚えておき、上がったら撃つ
  if (ws.sprWas && !a.sprint) ws.so = sprintOutT(W);
  ws.sprWas = !!a.sprint;
  if (ws.so > 0) ws.so = Math.max(0, ws.so - dt);
  // 状態の時間
  if (ws.t > 0) ws.t -= dt;
  if (ws.t <= 0) finishState(S, a, ev);
  // 操作
  for (const ac of (inp.act || [])) {
    if (ac.a === 'reload') startReload(S, a, !!ac.fast, ev);
    else if (ac.a === 'switch') switchTo(S, a, ac.slot, ev);
    else if (ac.a === 'mode' && ws.slot === 3) m320Next(a, ev);
    // 倍率を切り替えられる照準器: 構えている間（射撃モードが1つの銃はいつも）は射撃モードのボタンで倍率を切り替える
    else if (ac.a === 'mode' && W && wi && zoomsOf(wi.att) && (ac.zoom != null ? ac.zoom : (W.modes.length <= 1 || a.ads > 0.5))) { const zs = zoomsOf(wi.att); wi.zi = ((wi.zi || 0) + 1) % zs.length; ev.push({ e: 'zoom', id: a.id, z: zs[wi.zi], sight: wi.att.sight }); }
    else if (ac.a === 'mode' && W && wi && W.modes.length > 1 && ws.st === 'ready') { wi.mode = (wi.mode + 1) % W.modes.length; ev.push({ e: 'fmode', id: a.id, m: W.modes[wi.mode] }); }
    else if (ac.a === 'light' && wi && (wi.att.light || wi.att.laser)) { wi.lightOn = !wi.lightOn; ev.push({ e: 'lightsw', id: a.id, on: wi.lightOn }); }
  }
  // a.light: ライトが点いている（レーザーだけなら false）。a.laser: レーザーが点いている
  if (wi) { a.light = !!(wi.lightOn && wi.att.light); a.laser = wi.lightOn && wi.att.laser ? wi.att.laser : null; } else { a.light = false; a.laser = null; }
  // 撃つ
  const trig = !!inp.fire;
  if (W && wi && (trig || ws.pend)) tryFire(S, w, a, W, wi, inp, ev);
  if (!trig) ws.burstN = 0;
  if (!(ws.so > 0)) ws.pend = false; // 銃が上がったときに撃てなかった（リロード中など）: 覚えていた引き金は捨てる
  ws.trigWas = trig;
}

// 構えられる物を持っている（銃・M320）
export function canAim(a) {
  const ws = a.ws;
  return !!ws && ws.slot >= 0 && (ws.slot < 2 || (ws.slot === 3 && a.inv.long === 'm320')) && !a.down && !a.peek;
}
// 走るのをやめてから撃てるまで（秒）。重い銃ほど長い（拳銃 0.1・小銃 0.15・狙撃銃 0.24）
export function sprintOutT(W) { return W ? Math.min(0.25, 0.08 + 0.025 * (W.kg || 3)) : 0.1; }

// リロードをやめる（ダッシュを入れ直したとき）。弾倉を替えるのは終わったときなので、替えていない。
// 1発ずつ込める銃は込めた分が残る。薬室が空で弾があれば、送り込んでから（ポンプ）
export function cancelReload(a, ev) {
  const ws = a.ws, W = curW(a), wi = curWeapon(a);
  if (!ws || (ws.st !== 'reload' && ws.st !== 'shell')) return false;
  if (ws.st === 'shell' && W && wi && W.chamber && !wi.ch && wi.mag > 0) { ws.st = 'pump'; ws.t = W.pump || 0.35; }
  else { ws.st = 'ready'; ws.t = 0; }
  ws.rk = null; ws.stopShell = false;
  if (ev) ev.push({ e: 'reloadx', id: a.id });
  return true;
}

function finishState(S, a, ev) {
  const ws = a.ws, wi = curWeapon(a), W = curW(a);
  const st = ws.st;
  if (st === 'draw') { ws.st = 'ready'; ws.t = 0; }
  else if (st === 'holster') { ws.slot = ws.next; ws.next = -1; ws.st = 'draw'; const W2 = curW(a); ws.t = W2 ? W2.draw : ws.slot === 3 ? (LONG[a.inv.long] && LONG[a.inv.long].draw) || 0.6 : 0.3; if (ev) ev.push({ e: 'draw', id: a.id, slot: ws.slot }); }
  else if (st === 'reload' && wi && W) {
    // 弾倉を替える
    if (ws.rk === 'rev') { const need = magCap(wi) - wi.mag; const take = Math.min(need, wi.res); wi.mag += take; wi.res -= take; }
    else if (ws.rk === 'break') { const need = magCap(wi) - wi.mag; const take = Math.min(need, wi.res); wi.mag += take; wi.res -= take; }
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
    // 対戦: 予備の弾倉は減らない（TDM で弾が尽きると死ぬしかなくなるため。作戦は RoN のとおり減る）
    if (S.pvp) { if (wi.mags) wi.mags = new Array(Math.max(1, wi.spare0 || W.spare || 1)).fill(magCap(wi)); else wi.res = Math.max(wi.res, wi.spare0 || W.spare || 0); }
    ws.st = 'ready'; ws.t = 0; ws.rk = null;
    if (ev) ev.push({ e: 'reloaded', id: a.id });
  } else if (st === 'shell' && wi && W) {
    // 1発込めた
    if (wi.res > 0 && wi.mag < magCap(wi)) { wi.mag++; wi.res--; if (S.pvp) wi.res = Math.max(wi.res, wi.spare0 || W.spare || 0); if (ev) ev.push({ e: 'shell', id: a.id }); }
    if (!wi.ch && wi.mag > 0 && W.chamber) { wi.mag--; wi.ch = 1; ws.st = 'pump'; ws.t = (W.pump || 0.35); return; }
    if (wi.mag < magCap(wi) && wi.res > 0 && !ws.stopShell) { ws.t = W.rl.shell; }
    else { ws.st = 'ready'; ws.t = 0; ws.stopShell = false; }
  } else if (st === 'pump' && wi && W) {
    if (!wi.ch && wi.mag > 0) { wi.mag--; wi.ch = 1; }
    ws.st = 'ready'; ws.t = 0;
    if (ev) ev.push({ e: 'pumped', id: a.id });
  } else if (st === 'gear') { /* 投げ物を持っている */ }
}

export function startReload(S, a, fast, ev) {
  const ws = a.ws, wi = curWeapon(a), W = curW(a);
  // 押してすぐ普通のリロードが始まり、そのまま長押しなら速いリロード（弾倉を落とす）に切り替える
  if (fast && wi && W && ws.st === 'reload' && ws.rk === 'tac' && ws.rd - ws.t < 0.7 && W.rl.fast) {
    const done = ws.rd - ws.t, empty = !wi.ch && W.chamber;
    ws.rk = 'fast'; ws.rd = (W.rl.fast + (empty ? W.rl.empty : 0)) * attMods(wi).reload * (a.inj.arm ? 1.15 : 1); ws.t = Math.max(0.05, ws.rd - done);
    if (ev) ev.push({ e: 'reload', id: a.id, k: 'fast', dur: ws.t, empty, up: 1 });
    return true;
  }
  if (!wi || !W || (ws.st !== 'ready' && ws.st !== 'pump')) return false;
  if (a.vault) return false;
  // 走っていても、リロードが先（走るのをやめる。リロードの間は走らない。ダッシュを入れ直すとやめる。move.js）
  const run = a.sprint;
  if (W.tube) {
    if (wi.mag >= magCap(wi) || wi.res <= 0) return false;
    ws.st = 'shell'; ws.t = W.rl.start + W.rl.shell; ws.stopShell = false; if (run) a.sprint = false;
    if (ev) ev.push({ e: 'reload', id: a.id, k: 'shell' });
    return true;
  }
  if (W.revolver || W.breakAction) {
    if (wi.mag >= magCap(wi) || wi.res <= 0) return false;
    ws.st = 'reload'; ws.rk = W.revolver ? 'rev' : 'break'; ws.t = W.rl.tac; ws.rd = ws.t; if (run) a.sprint = false;
    if (ev) ev.push({ e: 'reload', id: a.id, k: ws.rk, dur: ws.t });
    return true;
  }
  if (!wi.mags || !wi.mags.length) return false;
  if (wi.mag >= magCap(wi) && (wi.ch || !W.chamber)) return false;
  const empty = !wi.ch && W.chamber;
  ws.rk = fast ? 'fast' : 'tac';
  ws.t = ((fast ? W.rl.fast : W.rl.tac) + (empty ? W.rl.empty : 0)) * attMods(wi).reload;
  if (a.inj.arm) ws.t *= 1.15;
  ws.rd = ws.t; ws.st = 'reload'; if (run) a.sprint = false;
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
  if (ws.so > 0) { if (inp.fire && !ws.trigWas) ws.pend = true; return; } // 走るのをやめて銃を上げている間
  if (ws.st === 'shell') { if (wi.ch || wi.mag > 0) { ws.stopShell = true; ws.st = 'ready'; ws.t = 0; } else return; }
  if (ws.st !== 'ready') return;
  if (ws.cd > 0) return;
  const mode = W.modes[wi.mode] || 'semi';
  if (mode === 'semi' && ws.trigWas && !ws.pend) return;
  if (W.range && a.ai == null) { /* テーザーの射程は弾で判定 */ }
  // 弾があるか
  const hasRound = W.chamber ? wi.ch > 0 : wi.mag > 0;
  if (!hasRound) {
    if (!ws.trigWas || ws.pend) ev.push({ e: 'dry', id: a.id });
    ws.cd = 0.25; ws.pend = false;
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
  const baseYaw = a.yaw + (ws.ry + (ws.sx || 0)) * DEG, basePitch = a.pitch + (ws.rp + (ws.sy || 0)) * DEG;
  const pellets = am.pellets || 1;
  const seed = a.stats.sh + 1;
  for (let p = 0; p < pellets; p++) {
    // 円の中で一様に
    const r1 = hrand(a.id, seed, p * 2 + 1), r2 = hrand(a.id, seed, p * 2 + 2);
    let ang = Math.sqrt(r1) * (pellets > 1 ? Math.max(sprd * 0.4, (am.spread || 3) * m.spread * DEG * (1 - 0.25 * a.ads)) : sprd), th = r2 * Math.PI * 2;
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
  ws.shots++; ws.lastShot = S.t; a.stats.sh++; ws.pend = false;
  a.fireK = 1;
  // 音と光（AIは聞く）
  const supp = wi.att.muzzle === 'supp';
  ev.push({ e: 'shot', id: a.id, wid: wi.id, x: a.x, y: a.y, z: a.z, supp, loud: (W.less ? 0.4 : 1) * m.noise, fl: m.flash, n: ws.shots });
  // ボルトアクション: 撃ったらすぐボルトを操作する（音と薬莢は見る側で、操作の進み具合に合わせて出す）
  if (W.bolt && ws.st === 'pump') ev.push({ e: 'bolt', id: a.id, wid: wi.id, dur: ws.t });
}
