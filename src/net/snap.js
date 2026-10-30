// 通信の中身: ホストのエンジンの状態 → 小さな写し（数を丸めた配列）。ゲストは写しから「見せるための状態」を作る。
// 静かな情報（名前・見た目・装備の種類・目的の一覧）は st、動く情報（位置・姿勢・扉・物・出来事）は g。
import { createActor, makeWeapon } from '../engine/actor.js';
import { makeDoorStates } from '../engine/doors.js';
import { WEAPONS } from '../engine/data/weapons.js';

const r2 = (v) => Math.round(v * 100);
const r3 = (v) => Math.round(v * 1000);
const isNum = (v) => typeof v === 'number' && isFinite(v);
// 送る出来事（見た目・音・HUDに要るもの）
export const NET_EV = new Set(['shot', 'imp', 'blood', 'hit', 'whiz', 'kill', 'down', 'cuffed', 'report', 'evidence', 'bombdone', 'soft', 'glass', 'block', 'reinf', 'door', 'deny', 'nade', 'boom', 'c2', 'flashed', 'stung', 'tase', 'spray', 'reload', 'reloaded', 'shell', 'pumped', 'dry', 'draw', 'fmode', 'lightsw', 'step', 'shout', 'cmd', 'mirror', 'act', 'trap', 'trapset', 'barset', 'c2set', 'barhit', 'barbreak', 'plant', 'disable', 'defpick', 'defdrop', 'spotted', 'drone', 'dronedead', 'phase', 'round', 'roundstart', 'swap', 'respawn', 'matchend', 'end', 'revive', 'bandaged', 'fall', 'throw', 'bounce', 'allbombs', 'trapoff']);
// 出来事の数を丸める（小数2けた）
export function packEvent(e) {
  const o = {};
  for (const k in e) { const v = e[k]; if (k === 's') continue; o[k] = isNum(v) && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v; }
  return o;
}
const FL = { alive: 1, dead: 2, down: 4, cuffed: 8, c1: 16, c2: 32, stun: 64, cower: 128, sprint: 256, ground: 512, light: 1024, nvg: 2048, carry: 4096, reported: 8192, blind: 16384, gas: 32768, spot: 65536 };
const SIDE = ['', 'swat', 'sus'];
function attKey(w) { return w ? [w.id, w.att.sight || 'iron', w.att.muzzle || 'none', w.att.grip || 'none', w.att.light ? 1 : 0, w.am] : null; }

// ---- ホスト: 静かな情報（始まり・入り直し・陣営の交代のとき）
export function packStatic(S) {
  const A = S.actors.filter(a => !a.isDrone).map(a => [a.id, a.kind, a.team, a.pid, a.name || '', a.look ? a.look.seed : 0, a.h || 1.8, a.pvpArmor || '', a.armor ? a.armor.vest : 'none', a.armor ? a.armor.helmet : 'none', a.armor ? a.armor.head : 'none', a.ai && a.ai.prof ? a.ai.prof : '', a.ai ? a.ai.squad || '' : '', a.ai ? a.ai.slot ?? -1 : -1, attKey(a.inv.w[0]), attKey(a.inv.w[1]), a.inv.long || 'none', a.maxHp]);
  const m = S.m || {};
  const M = m.kind === 'pve' ? { kind: 'pve', mission: m.mission, diff: m.diff, sus: m.sus, civ: m.civ, hostages: m.hostages, bombs: (m.bombs || []).map(b => [b.id, r2(b.x), r2(b.y), r2(b.z), b.L || 0]) }
    : m.kind === 'train' ? { kind: 'train' } : { kind: m.kind, sites: (m.sites || []).map(s => [s.id, s.name, r2(s.x), r2(s.y), r2(s.z), r2(s.r)]), winsNeeded: m.winsNeeded, limit: m.limit, timeLimit: m.timeLimit, roundTime: m.roundTime, prepTime: m.prepTime, sizes: m.sizes };
  return { map: S.map, mode: S.mode, pvp: S.pvp, dt: S.dt, rules: S.rules, A, M };
}
// ---- ホスト: 動く情報（毎回）。me: { pid: actorId } の人ごとの詳しい情報も付ける
export function packSnap(S, w, events, mePids, withBlocks) {
  const A = [];
  for (const a of S.actors) {
    if (a.isDrone) { A.push([a.id, r2(a.x), r2(a.y), r2(a.z), r3(a.yaw), r3(a.pitch || 0), -1, a.alive ? 1 : 0, a.owner, a.team]); continue; }
    let f = 0;
    if (a.alive) f |= FL.alive; if (a.dead) f |= FL.dead; if (a.down) f |= FL.down; if (a.cuffed) f |= FL.cuffed;
    if (a.comply === 1) f |= FL.c1; if (a.comply === 2) f |= FL.c2; if (a.stun > 0 || a.tased > 0) f |= FL.stun; if (a.ai && a.ai.cower) f |= FL.cower;
    if (a.sprint) f |= FL.sprint; if (a.ground) f |= FL.ground;
    const wi = a.inv.w[a.ws.slot] || null;
    if (wi && wi.lightOn) f |= FL.light; if (a.nvgOn) f |= FL.nvg; if (a.carry === 'defuser') f |= FL.carry; if (a.reported) f |= FL.reported;
    if (a.flash > 0.4) f |= FL.blind; if (a.gas > 0) f |= FL.gas; if (a.spot > 0) f |= FL.spot;
    const rel = a.ws.st === 'reload' && a.ws.rd ? Math.round((1 - a.ws.t / a.ws.rd) * 100) : -1;
    A.push([a.id, r2(a.x), r2(a.y), r2(a.z), r3(a.yaw), r3(a.pitch + (a.ws.rp || 0) * Math.PI / 180), r2(a.st), r2(a.lean), r2(a.mvx || 0), r2(a.mvz || 0), r2(a.phase || 0), r2(a.ads || 0), r2(a.low || 0), f, r2(a.stateT || 0), r2(a.fallYaw || 0), rel, r2(a.fireK || 0), r2(a.throwT || 0), a.ws.slot, Math.round(100 * a.hp / (a.maxHp || 100)), r2(a.spd || 0), SIDE.indexOf(a.pvpSide || ''), a.spotTeam ?? -1, a._lookV || 0]);
  }
  const D = S.doors.map(d => { let fl = 0; if (d.locked) fl |= 1; if (d.lockBroken) fl |= 2; if (d.broken) fl |= 4; if (d.wedge) fl |= 8; if (d.bar > 0) fl |= 16; if (d.c2) fl |= 32; if (d.trapSeen) fl |= 64; if (d.trap && d.trap.armed) fl |= 128; return [d.ang.map(r2), fl, d.bar > 0 ? Math.round(d.bar) : 0]; });
  const I = S.items.filter(it => !it.gone).map(it => [it.id, it.kind, r2(it.x), r2(it.y), r2(it.z), r2(it.yaw || 0), it.kind === 'weapon' ? attKey(it.w || { id: it.wid, att: {} }) : it.kind === 'evidence' ? it.ek : 0]);
  const N = S.nades.map(n => [r2(n.x), r2(n.y), r2(n.z), n.type]);
  const C = S.clouds.map(c => [r2(c.x), r2(c.y), r2(c.z), r2(c.r), c.type]);
  const m = S.m || {};
  let M;
  if (m.kind === 'pve') M = { ph: m.phase, soft: m.softDone ? 1 : 0, bt: m.bombT != null ? Math.round(m.bombT) : null, bd: (m.bombs || []).filter(b => b.done).map(b => b.id), bf: (m.bombs || []).filter(b => b.found).map(b => b.id), res: m.result || null, why: m.why || null, score: m.phase === 'end' ? m.score : undefined };
  else if (m.kind === 'train') M = { ph: 'play' };
  else M = { ph: m.phase, el: Math.round((S.t - m.phaseT) * S.dt * 10) / 10, rd: m.round, w: m.wins, sc: m.score, att: m.att, def: m.def, df: m.defuser ? [m.defuser.planted ? 1 : 0, m.defuser.disabled ? 1 : 0, Math.round((m.defuser.t || 0) * 10) / 10, r2(m.defuser.x || 0), r2(m.defuser.z || 0), m.defuser.site ?? -1] : null, over: m.over ? 1 : 0, win: m.winner ?? null, sw: m.swapped ? 1 : 0, rl: m.reinfLeft ?? 0 };
  const P = {};
  for (const [pid, id] of Object.entries(mePids || {})) {
    const a = S.byId[id]; if (!a) continue;
    P[pid] = meBlock(a);
  }
  const out = { T: Math.round(S.t * S.dt * 1000) / 1000, A, D, I, N, C, M, P, E: events };
  // 壊れた壁（ときどき全部）
  if (withBlocks) out.B = Object.keys(S.bdiff).map(k => { const b = +k * 4; return [+k, w.blocks[b], w.blocks[b + 1], w.blocks[b + 2], w.blocks[b + 3]]; });
  out.R = Object.keys(S.reinf || {}).map(Number);
  return out;
}
// 自分の詳しい状態（HUD・一人称の銃に使う）
function meBlock(a) {
  return {
    hp: Math.round(a.hp * 10) / 10, mh: a.maxHp, ar: [a.armor.pf, a.armor.pb, a.armor.helm], bl: a.bleed > 0 ? 1 : 0, inj: [a.inj.arm, a.inj.leg],
    ws: [a.ws.slot, a.ws.st, r2(a.ws.t || 0), r2(a.ws.rd || 0), a.ws.next ?? -1, a.ws.gear || null],
    w: a.inv.w.map(w => w ? [w.id, w.mags ? w.mags.slice() : null, w.mag, w.ch, w.res, w.mode, w.lightOn ? 1 : 0, w.am] : null),
    g: a.inv.gear.map(g => [g.id, g.n]), act: a.act ? [a.act.k, r2(a.act.t), r2(a.act.dur)] : null,
    st: a.stance, db: a.dbno ? Math.round(a.dbno * 10) / 10 : 0, sp: a.spawnProt > 0 ? 1 : 0, s: [a.stats.k, a.stats.d, a.stats.a, a.stats.sh, a.stats.hi], dr: a.dronesLeft ?? null,
  };
}

// ================= ゲスト: 写しから見せるための状態を作る =================
export class Mirror {
  constructor(w, st) {
    this.w = w; this.st = st;
    const S = this.S = { v: 0, t: 0, dt: st.dt || 1 / 60, map: st.map, mode: st.mode, pvp: !!st.pvp, rules: st.rules || {}, actors: [], byId: {}, doors: makeDoorStates(w), items: [], nades: [], clouds: [], bullets: [], blasts: [], harms: [], orders: [], shouts: [], mines: [], bdiff: {}, reinf: {}, m: {}, nextId: 1, nextItem: 1, mirror: true };
    this.applyStatic(st);
    this.buf = []; // [{T, at, g}]
  }
  applyStatic(st) {
    const S = this.S;
    const keep = new Map(S.actors.map(a => [a.id, a]));
    S.actors = [];
    for (const r of st.A) {
      const [id, kind, team, pid, name, seed, h, pvpArmor, vest, helmet, head, prof, squad, slot, w0, w1, long, maxHp] = r;
      let a = keep.get(id);
      const lo = { primary: w0 && WEAPONS[w0[0]] ? { id: w0[0], sight: w0[1], muzzle: w0[2], grip: w0[3], light: !!w0[4], ammo: w0[5] } : null, secondary: w1 && WEAPONS[w1[0]] ? { id: w1[0], sight: w1[1], muzzle: w1[2], grip: w1[3], light: !!w1[4], ammo: w1[5] } : null, long, vest, helmet, head, plate: 'ceramic' };
      if (!a) {
        a = createActor(S, { kind, team, pid, name, x: 0, z: 0, hp: maxHp || 100, lo, look: { seed } });
        a.id = id;
      } else {
        a.inv.w = [makeWeapon(lo.primary), makeWeapon(lo.secondary)]; a.inv.long = long || 'none';
      }
      a.kind = kind; a.team = team; a.pid = pid; a.name = name; a.h = h || 1.8; a.pvpArmor = pvpArmor || undefined; a.maxHp = maxHp || 100;
      a.armor.vest = vest; a.armor.helmet = helmet; a.armor.head = head;
      a.ai = kind === 'swat' && pid == null ? { type: 'swat', squad, slot, prof } : prof ? { type: kind, prof } : (pid == null ? { type: kind } : null);
      a.look = { seed };
      S.actors.push(a);
    }
    S.byId = {}; for (const a of S.actors) S.byId[a.id] = a;
    const M = st.M || {};
    if (M.kind === 'pve') S.m = { kind: 'pve', mission: M.mission, diff: M.diff, sus: M.sus || [], civ: M.civ || [], hostages: M.hostages || [], bombs: (M.bombs || []).map(([id, x, y, z, L]) => ({ id, x: x / 100, y: y / 100, z: z / 100, L, done: false, found: false })), phase: 'play', bombT: null };
    else if (M.kind === 'train') S.m = { kind: 'train' };
    else S.m = { kind: M.kind, sites: (M.sites || []).map(([id, name, x, y, z, r]) => ({ id, name, x: x / 100, y: y / 100, z: z / 100, r: r / 100 })), winsNeeded: M.winsNeeded, limit: M.limit, timeLimit: M.timeLimit, roundTime: M.roundTime, prepTime: M.prepTime, sizes: M.sizes, wins: [0, 0], score: [0, 0], round: 1, phase: 'pre', phaseT: 0, defuser: null, att: 0, def: 1 };
  }
  push(g, at) {
    if (!g || !isNum(g.T)) return;
    if (this.buf.length && g.T <= this.buf[this.buf.length - 1].T) return;
    this.buf.push({ T: g.T, at, g });
    while (this.buf.length > 30) this.buf.shift();
  }
  // renderT（ホストの時計）で人を補間し、最新の写しで扉・物・目的を合わせる。meId: 自分（予測するので位置は触らない）
  apply(renderT, meId) {
    const S = this.S, B = this.buf;
    if (!B.length) return false;
    const last = B[B.length - 1].g;
    let a0 = B[0], a1 = B[0];
    for (let i = 0; i < B.length - 1; i++) if (B[i].T <= renderT && B[i + 1].T >= renderT) { a0 = B[i]; a1 = B[i + 1]; break; }
    if (renderT > B[B.length - 1].T) { a0 = a1 = B[B.length - 1]; }
    const k = a1.T > a0.T ? Math.max(0, Math.min(1, (renderT - a0.T) / (a1.T - a0.T))) : 1;
    const m0 = new Map(a0.g.A.map(r => [r[0], r]));
    S.t = Math.round(last.T / S.dt);
    for (const r1 of a1.g.A) {
      const a = S.byId[r1[0]];
      if (!a) continue;
      const r0 = m0.get(r1[0]) || r1;
      if (r1[6] === -1) { // ドローン
        a.isDrone = true; a.x = lerp(r0[1], r1[1], k) / 100; a.y = lerp(r0[2], r1[2], k) / 100; a.z = lerp(r0[3], r1[3], k) / 100; a.yaw = lerpA(r0[4], r1[4], k) / 1000; a.pitch = r1[5] / 1000; a.alive = !!r1[7]; a.owner = r1[8]; continue;
      }
      const f = r1[13];
      a.alive = !!(f & FL.alive); a.dead = !!(f & FL.dead); a.down = !!(f & FL.down); a.cuffed = !!(f & FL.cuffed);
      a.comply = f & FL.c2 ? 2 : f & FL.c1 ? 1 : 0; a.stun = f & FL.stun ? 0.5 : 0; a.tased = 0;
      if (a.ai) a.ai.cower = !!(f & FL.cower);
      a.sprint = !!(f & FL.sprint); a.ground = !!(f & FL.ground); a.nvgOn = !!(f & FL.nvg); a.carry = f & FL.carry ? 'defuser' : null; a.reported = !!(f & FL.reported);
      a.flash = f & FL.blind ? 1 : 0; a.gas = f & FL.gas ? 1 : 0; a.spot = f & FL.spot ? 1 : 0; a.spotTeam = r1[23];
      const side = SIDE[r1[22]] || undefined;
      if (side !== a.pvpSide || r1[24] !== a._lookV) { a.pvpSide = side; a._lookV = r1[24]; }
      if (a.id !== meId) {
        a.x = lerp(r0[1], r1[1], k) / 100; a.y = lerp(r0[2], r1[2], k) / 100; a.z = lerp(r0[3], r1[3], k) / 100;
        a.yaw = lerpA(r0[4], r1[4], k) / 1000; a.pitch = lerp(r0[5], r1[5], k) / 1000;
        a.st = lerp(r0[6], r1[6], k) / 100; a.lean = lerp(r0[7], r1[7], k) / 100; a.mvx = r1[8] / 100; a.mvz = r1[9] / 100;
        a.phase = lerpPhase(r0[10], r1[10], k) / 100; a.ads = lerp(r0[11], r1[11], k) / 100; a.low = lerp(r0[12], r1[12], k) / 100;
        a.stateT = r1[14] / 100; a.fallYaw = r1[15] / 100;
        a.ws.slot = r1[19];
        a.ws.st = r1[16] >= 0 ? 'reload' : 'ready'; a.ws.rd = r1[16] >= 0 ? 1 : 0; a.ws.t = r1[16] >= 0 ? 1 - r1[16] / 100 : 0; a.ws.rp = 0;
        a.fireK = r1[17] / 100; a.throwT = r1[18] / 100; a.spd = r1[21] / 100;
        const wi = a.inv.w[a.ws.slot]; if (wi) wi.lightOn = !!(f & FL.light);
      }
      a.hp = r1[20] / 100 * (a.maxHp || 100);
    }
    // 扉・物・投げ物・目的（最新）
    const D = last.D || [];
    for (let i = 0; i < D.length && i < S.doors.length; i++) {
      const ds = S.doors[i], [ang, fl, bar] = D[i];
      const target = ang.map(v => v / 100);
      // 開閉は少しなめらかに
      ds.ang = ds.ang.map((v, j) => v + ((target[j] ?? 0) - v) * 0.35);
      ds.tgt = target; ds.locked = !!(fl & 1); ds.lockBroken = !!(fl & 2); ds.broken = !!(fl & 4); ds.wedge = fl & 8 ? 1 : 0; ds.bar = fl & 16 ? (bar || 1) : 0; ds.c2 = fl & 32 ? {} : null; ds.trapSeen = !!(fl & 64); ds.trap = fl & 128 ? { armed: true } : null;
    }
    S.items = (last.I || []).map(([id, kind, x, y, z, yaw, ex]) => kind === 'weapon' ? { id, kind, x: x / 100, y: y / 100, z: z / 100, yaw: yaw / 100, wid: ex && ex[0], w: ex && WEAPONS[ex[0]] ? makeWeapon({ id: ex[0], sight: ex[1], muzzle: ex[2], grip: ex[3], light: !!ex[4] }) : null } : { id, kind, x: x / 100, y: y / 100, z: z / 100, yaw: yaw / 100, ek: ex, ev: kind === 'evidence' });
    S.nades = (last.N || []).map(([x, y, z, type]) => ({ x: x / 100, y: y / 100, z: z / 100, type }));
    S.clouds = (last.C || []).map(([x, y, z, r, type]) => ({ x: x / 100, y: y / 100, z: z / 100, r: r / 100, type }));
    // 壊れた壁と補強（変わったマスは描き直す）
    this.changed = this.changed || [];
    if (last.B && last !== this._lastB) {
      this._lastB = last;
      for (const [k, b0, b1, b2, b3] of last.B) { const b = k * 4, w = this.w; if (w.blocks[b] !== b0 || w.blocks[b + 1] !== b1 || w.blocks[b + 2] !== b2 || w.blocks[b + 3] !== b3) { w.blocks[b] = b0; w.blocks[b + 1] = b1; w.blocks[b + 2] = b2; w.blocks[b + 3] = b3; S.bdiff[k] = 1; this.changed.push(k); } }
    }
    if (last.R) { const R = {}; for (const k of last.R) { R[k] = 1; if (!S.reinf[k]) this.changed.push(k); } S.reinf = R; }
    const M = last.M || {}, m = S.m;
    if (m.kind === 'pve') { m.phase = M.ph; m.softDone = !!M.soft; m.bombT = M.bt; for (const b of m.bombs) { b.done = (M.bd || []).includes(b.id); b.found = (M.bf || []).includes(b.id); } m.result = M.res; m.why = M.why; if (M.score) m.score = M.score; }
    else if (m.kind && m.kind !== 'train') {
      m.phase = M.ph; m.round = M.rd; m.wins = M.w || m.wins; m.score = M.sc || m.score; m.att = M.att; m.def = M.def; m.over = !!M.over; m.winner = M.win; m.swapped = !!M.sw; m.reinfLeft = M.rl;
      m.phaseT = S.t - Math.round((M.el || 0) / S.dt);
      m.defuser = M.df ? { planted: !!M.df[0], disabled: !!M.df[1], t: M.df[2], x: M.df[3] / 100, z: M.df[4] / 100, site: M.df[5] } : null;
    }
    return true;
  }
  // 自分の詳しい状態を当てる（HUD・一人称）
  applyMe(a, P) {
    if (!a || !P) return;
    a.hp = P.hp; a.maxHp = P.mh; a.armor.pf = P.ar[0]; a.armor.pb = P.ar[1]; a.armor.helm = P.ar[2]; a.bleed = P.bl ? 1 : 0; a.inj.arm = P.inj[0]; a.inj.leg = P.inj[1];
    P.w.forEach((x, i) => {
      if (!x) { a.inv.w[i] = null; return; }
      let w = a.inv.w[i];
      if (!w || w.id !== x[0]) w = a.inv.w[i] = makeWeapon({ id: x[0] });
      if (!w) return;
      w.mags = x[1]; w.mag = x[2]; w.ch = x[3]; w.res = x[4]; w.mode = x[5]; w.lightOn = !!x[6]; w.am = x[7];
    });
    a.inv.gear = P.g.map(([id, n]) => ({ id, n }));
    a.act = P.act ? { k: P.act[0], t: P.act[1] / 100, dur: P.act[2] / 100 } : null;
    a.dbno = P.db; a.spawnProt = P.sp; a.stats.k = P.s[0]; a.stats.d = P.s[1]; a.stats.a = P.s[2]; a.stats.sh = P.s[3]; a.stats.hi = P.s[4];
    if (P.dr != null) a.dronesLeft = P.dr;
    return P.ws;
  }
}
function lerp(a, b, k) { return a + (b - a) * k; }
function lerpA(a, b, k) { let d = b - a; const T = 2000 * Math.PI; d = ((d + T / 2) % T + T) % T - T / 2; return a + d * k; }
function lerpPhase(a, b, k) { let d = b - a; if (d < -300) d += 628.3; if (d > 300) d -= 628.3; return a + d * k; }
