// 通信の取り決め（ロビー・開始・試合中・結果）。通信路（link）とは send/onMsg だけでつながる。
// ホストが正（ホスト権威）: エンジンはホストだけが動かす。ゲストは入力と動作（番号つき）を送り、ホストの写しを表示する。
import { VERSION, COMPAT } from '../engine/data/version.js';
import { WEAPONS } from '../engine/data/weapons.js';
import { GEAR, LONG, VEST, PLATE, HELMET, HEADWEAR } from '../engine/data/equipment.js';

export const MAX_PVE = 4, MAX_PVP = 8;
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const clampS = (v, n = 12) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '').slice(0, n) : '');
const isNum = (v) => typeof v === 'number' && isFinite(v);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// 受け取った装備を検める（知らないidは捨てる）
function cleanWeapon(w) { if (!w || typeof w !== 'object' || !WEAPONS[w.id]) return null; const o = { id: w.id }; for (const k of ['sight', 'muzzle', 'grip', 'ammo']) if (typeof w[k] === 'string' && w[k].length < 12) o[k] = w[k]; if (typeof w.light === 'boolean') o.light = w.light; return o; }
export function cleanLoadout(lo) {
  if (!lo || typeof lo !== 'object') return null;
  const o = { primary: cleanWeapon(lo.primary), secondary: cleanWeapon(lo.secondary) };
  if (LONG[lo.long]) o.long = lo.long;
  o.gear = Array.isArray(lo.gear) ? lo.gear.filter(g => Array.isArray(g) && GEAR[g[0]] && isNum(g[1])).slice(0, 3).map(g => [g[0], clamp(Math.round(g[1]), 0, GEAR[g[0]].max)]) : [];
  for (const [k, T] of [['vest', VEST], ['plate', PLATE], ['helmet', HELMET], ['head', HEADWEAR]]) if (T[lo[k]]) o[k] = lo[k];
  if (lo.armor === 'light' || lo.armor === 'medium' || lo.armor === 'heavy') o.armor = lo.armor;
  if (lo.swat) o.swat = cleanLoadout(lo.swat);
  if (lo.sus) o.sus = cleanLoadout(lo.sus);
  return o;
}
// 動作（調べる・命令・持ち替えなど）を検める: 文字と数と小さな配列だけ
function cleanAct(ac) {
  if (!ac || typeof ac !== 'object' || typeof ac.a !== 'string' || ac.a.length > 16) return null;
  const o = {};
  for (const [k, v] of Object.entries(ac)) {
    if (k.length > 8) continue;
    if (typeof v === 'string' && v.length <= 24) o[k] = v;
    else if (isNum(v)) o[k] = v;
    else if (typeof v === 'boolean') o[k] = v;
  }
  return o;
}

class Pump {
  constructor(fn, ms) { this.id = setInterval(() => { try { fn(); } catch (e) { console.warn('pump', e); } }, ms); }
  stop() { clearInterval(this.id); }
}

// ================= ホスト =================
export class HostSession {
  constructor({ link, cid, code, profile, kind, cfg, lo, rate }) {
    this.role = 'host'; this.kind = kind; this.cfg = cfg;
    this.link = link; this.cid = cid; this.code = code;
    this.phase = 'lobby';
    this.hs = Math.random().toString(36).slice(2, 8);
    this.roster = [{ cid, pid: 0, name: clampS(profile.name) || 'ホスト', team: 0, lo: cleanLoadout(lo), on: true, at: nowMs(), host: true }];
    this.guests = new Map();
    this.n = 0; this.evSeq = 0; this.events = [];
    this.listeners = {}; this.match = null; this.seed = null; this.results = null;
    this.rate = rate || { lobby: 250, game: 50, end: 500 };
    this.lastSend = 0; this.closed = false; this.stN = 0;
    link.onMsg = (from, m) => this._onMsg(from, m);
    link.onGone = (from) => this._gone(from);
    this.pump = new Pump(() => this._pump(), 25);
  }
  max() { return this.kind === 'pvp' ? MAX_PVP : MAX_PVE; }
  on(k, fn) { this.listeners[k] = fn; }
  emit(k, ...a) { const f = this.listeners[k]; if (f) try { f(...a); } catch (e) { console.warn('session', k, e); } }
  _onMsg(from, m) {
    if (this.closed || !m || typeof m !== 'object' || m.t !== 'g' || typeof m.cid !== 'string' || m.cid !== from || m.cid === this.cid) return;
    let G = this.guests.get(from);
    if (G && typeof m.gs === 'string' && G.gs && m.gs !== G.gs) { G.n = -1; G.qDone = 0; G.input = null; this.boost = nowMs() + 4000; }
    if (G && isNum(m.n) && m.n <= G.n) return;
    if (!G) { G = { n: -1, at: 0, qDone: 0, input: null, acts: [] }; this.guests.set(from, G); }
    if (typeof m.gs === 'string') G.gs = m.gs;
    if (m.ph === 'join' && this.phase !== 'lobby') this.boost = nowMs() + 4000;
    G.n = isNum(m.n) ? m.n : G.n + 1; G.at = nowMs();
    if (m.bye) { this._remove(from, true); return; }
    let r = this.roster.find(x => x.cid === from);
    const okVer = m.v === VERSION && m.c === COMPAT;
    if (!r) {
      if (this.phase !== 'lobby' || !okVer || this.roster.length >= this.max()) { G.reject = !okVer ? 'version' : this.phase !== 'lobby' ? 'playing' : 'full'; return; }
      // 対戦: 人数の少ない方のチームへ
      const t0 = this.roster.filter(x => x.team === 0).length, t1 = this.roster.filter(x => x.team === 1).length;
      r = { cid: from, pid: null, name: '', team: this.kind === 'pvp' && t1 < t0 ? 1 : 0, lo: null, on: true, at: nowMs() };
      this.roster.push(r); this._repid();
      this.emit('roster', this.roster); this.emit('joined', r);
    }
    const name = clampS(m.name) || 'だれか';
    if (r.name !== name || !r.on) { r.name = name; r.on = true; this.emit('roster', this.roster); }
    if (m.lo) r.lo = cleanLoadout(m.lo) || r.lo;
    r.at = nowMs();
    if (this.phase === 'game') {
      if (m.i && typeof m.i === 'object') this._input(G, m.i);
      if (Array.isArray(m.q)) for (const x of m.q) {
        if (!Array.isArray(x) || !isNum(x[0]) || x[0] <= G.qDone) continue;
        const ac = cleanAct(x[1]); G.qDone = x[0];
        if (ac) G.acts.push(ac);
      }
    }
  }
  _repid() { if (this.phase === 'lobby') this.roster.forEach((r, i) => { r.pid = i; }); }
  _remove(cid, byeMsg) {
    const i = this.roster.findIndex(x => x.cid === cid);
    if (i < 0) return;
    const r = this.roster[i];
    if (this.phase !== 'game') { this.roster.splice(i, 1); this._repid(); this.emit('roster', this.roster); this.emit('left', r); }
    else { r.on = false; if (byeMsg) { r.gone = true; this.emit('left', r); } this.emit('roster', this.roster); }
  }
  _gone(cid) { const r = this.roster.find(x => x.cid === cid); if (r && r.on) { r.on = false; this.emit('roster', this.roster); } }
  _input(G, i) {
    G.input = {
      mx: isNum(i.mx) ? clamp(i.mx, -1, 1) : 0, mz: isNum(i.mz) ? clamp(i.mz, -1, 1) : 0,
      yaw: isNum(i.y) ? i.y : 0, pitch: isNum(i.p) ? clamp(i.p, -1.5, 1.5) : 0,
      fire: !!i.f, ads: !!i.a, low: !!i.l, stance: [0, 1, 2].includes(i.s) ? i.s : 0, lean: isNum(i.ln) ? clamp(Math.round(i.ln), -1, 1) : 0, sprint: !!i.sp, power: isNum(i.pw) ? clamp(i.pw, 0.1, 1) : 0.75,
      jump: !!i.j,
    };
    G.inAt = nowMs();
  }
  // ホストのエンジンに渡す、その人の今の入力（たまった動作もここで渡す）
  remoteInput(pid, a) {
    const r = this.roster.find(x => x.pid === pid);
    const G = r && this.guests.get(r.cid);
    if (!G || !G.input || nowMs() - (G.inAt || 0) > 1500) return { mx: 0, mz: 0, yaw: a ? a.yaw : 0, pitch: a ? a.pitch : 0, fire: false, ads: false, low: false, stance: a ? a.stance : 0, lean: 0, act: G && G.acts.length ? G.acts.splice(0) : null };
    const inp = { ...G.input, act: G.acts.length ? G.acts.splice(0) : null };
    return inp;
  }
  // 試合中に通信の切れた人（ホストは試合を止めて待つ）
  waiting() { return this.phase === 'game' ? this.roster.filter(r => !r.host && !r.on && !r.gone && !r.skip) : []; }
  skipWaiting() { for (const r of this.waiting()) r.skip = true; }
  addEvents(T, ev) {
    for (const e of ev) this.events.push({ q: ++this.evSeq, T, e });
    while (this.events.length && (T - this.events[0].T > 1.2 || this.events.length > 40)) this.events.shift();
  }
  setCfg(cfg) { if (this.phase !== 'lobby') return; this.cfg = { ...cfg }; this.emit('roster', this.roster); this._send(true); }
  setTeam(cid, team) { if (this.phase !== 'lobby' || this.kind !== 'pvp') return; const r = this.roster.find(x => x.cid === cid); if (r) { r.team = team ? 1 : 0; this.emit('roster', this.roster); this._send(true); } }
  setLoadout(lo) { this.roster[0].lo = cleanLoadout(lo); }
  canStart() {
    if (this.phase !== 'lobby' || this.roster.length < 2 || !this.roster.every(r => r.on)) return false;
    if (this.kind === 'pvp') { const sz = (this.cfg && this.cfg.teams) || [4, 4]; for (const t of [0, 1]) if (this.roster.filter(r => r.team === t).length > sz[t]) return false; }
    return true;
  }
  start(seed) {
    this.phase = 'game'; this.seed = seed; this.results = null; this.events = []; this.evSeq += 100;
    this.roster.forEach((r, i) => { r.pid = i; r.gone = false; r.skip = false; });
    for (const G of this.guests.values()) { G.input = null; G.acts = []; }
    this._send(true);
    return { seed, kind: this.kind, cfg: this.cfg, roster: this.roster.map(r => ({ pid: r.pid, name: r.name, team: r.team, lo: r.lo })), myPid: 0 };
  }
  attach(match) { this.match = match; this.stN = 0; }
  end(results) { this.phase = 'end'; this.results = results; this.match = null; this.roster = this.roster.filter(r => !r.gone); this._send(true); }
  backToLobby() { this.phase = 'lobby'; this.results = null; this.match = null; this._repid(); this.emit('roster', this.roster); this._send(true); }
  _state() {
    const m = { t: 'h', v: VERSION, c: COMPAT, cid: this.cid, hs: this.hs, n: ++this.n, ph: this.phase, kind: this.kind, code: this.code };
    const boost = nowMs() < (this.boost || 0);
    if (this.phase !== 'game' || this.n % 20 === 1 || boost) { m.ro = this.roster.map(r => ({ i: r.cid, p: r.pid, n: r.name, tm: r.team, on: r.on ? 1 : 0, ...(r.gone ? { x: 1 } : {}) })); m.cfg = this.cfg; }
    if (this.phase === 'game' && this.match) {
      m.seed = this.seed;
      // 静かな情報: 始まって1秒の間・20回に1回・入り直しのとき・陣営が替わったとき
      const stv = this.match.staticVer ? this.match.staticVer() : 0;
      if (this.stN < 20 || this.n % 40 === 0 || boost || stv !== this.lastStv) { m.st = this.match.netStatic(); this.lastStv = stv; }
      this.stN++;
      m.g = this.match.netSnap(this.events.map(x => [x.q, x.e]), this.n % 20 === 0);
      // 人ごとの「どの動作まで受け取ったか」
      m.ak = {};
      for (const r of this.roster) { if (r.host) continue; const G = this.guests.get(r.cid); if (G) m.ak[r.pid] = G.qDone; }
    }
    if (this.phase === 'end' && this.results) m.res = this.results;
    const rej = [];
    for (const [cid, G] of this.guests) if (G.reject && nowMs() - G.at < 4000) rej.push([cid, G.reject]);
    if (rej.length) m.rej = rej;
    return m;
  }
  _send(force) { if (this.closed) return; this.lastSend = nowMs(); try { this.link.send(this._state(), force); } catch (e) { console.warn('send', e); } }
  _pump() {
    if (this.closed) return;
    const t = nowMs();
    if (t - this.lastSend >= (this.rate[this.phase] || 250) - 3) this._send();
    let ch = false;
    for (const r of this.roster) {
      if (r.host) continue;
      const G = this.guests.get(r.cid);
      const quiet = t - (G ? G.at : r.at);
      if (r.on && quiet > 3500) { r.on = false; ch = true; }
      if (this.phase === 'lobby' && quiet > 20000) { this._remove(r.cid); return; }
      if (this.phase === 'game' && !r.gone && quiet > 90000) { this._remove(r.cid, true); return; }
    }
    if (ch) this.emit('roster', this.roster);
  }
  close() {
    if (this.closed) return;
    this.phase = 'closed';
    try { this.link.send({ t: 'h', v: VERSION, c: COMPAT, cid: this.cid, hs: this.hs, n: ++this.n, ph: 'closed', code: this.code }, true); } catch (e) { /* なし */ }
    this.closed = true; this.pump.stop();
    setTimeout(() => { try { this.link.close(); } catch (e) { /* なし */ } }, 300);
  }
}

// ================= ゲスト =================
export class GuestSession {
  constructor({ link, cid, code, profile, lo, rate }) {
    this.role = 'guest';
    this.link = link; this.cid = cid; this.code = code;
    this.gs = Math.random().toString(36).slice(2, 8);
    this.profile = profile; this.lo = lo;
    this.phase = 'join';
    this.host = null; this.hostN = -1; this.hs = null;
    this.roster = []; this.kind = null; this.cfg = null; this.seed = null; this.myPid = null;
    this.evQ = []; this.evSeen = 0; this.static = null; this.snapQ = [];
    this.input = null; this.acts = []; this.qN = 0; this.ak = 0;
    this.n = 0; this.lastSend = 0; this.lastHost = 0;
    this.rate = rate || { join: 500, lobby: 500, game: 40, end: 1000 };
    this.listeners = {}; this.closed = false; this.offs = []; this.status = 'wait';
    link.onMsg = (from, m) => this._onMsg(from, m);
    link.onGone = () => {};
    this.pump = new Pump(() => this._pump(), 20);
    this.startedAt = nowMs();
  }
  on(k, fn) { this.listeners[k] = fn; }
  emit(k, ...a) { const f = this.listeners[k]; if (f) try { f(...a); } catch (e) { console.warn('session', k, e); } }
  _onMsg(from, m) {
    if (this.closed || !m || typeof m !== 'object' || m.t !== 'h' || typeof m.cid !== 'string' || m.cid !== from) return;
    if (m.code && m.code !== this.code) return;
    if (this.host && (m.cid !== this.host || m.hs !== this.hs)) { if (m.cid !== this.host && this.phase !== 'join') return; this.hostN = -1; this.evSeen = 0; }
    if (isNum(m.n) && m.n <= this.hostN) return;
    this.hostN = isNum(m.n) ? m.n : this.hostN + 1;
    this.host = m.cid; this.hs = m.hs;
    const t = nowMs();
    const wasQuiet = this.lastHost > 0 && t - this.lastHost > 4000;
    this.lastHost = t;
    if (this.status !== 'ok' || wasQuiet) { this.status = 'ok'; this.emit('status', 'ok'); }
    if (m.v !== VERSION || m.c !== COMPAT) { this._fail('version', { host: m.v, me: VERSION }); return; }
    if (Array.isArray(m.rej)) { const r = m.rej.find(x => x[0] === this.cid); if (r && !this.roster.some(x => x.cid === this.cid)) { this._fail(r[1]); return; } }
    if (m.ph === 'closed') { this._fail('closed'); return; }
    if (typeof m.kind === 'string') this.kind = m.kind;
    if (m.cfg && typeof m.cfg === 'object') this.cfg = m.cfg;
    if (Array.isArray(m.ro)) {
      this.roster = m.ro.filter(r => r && typeof r.i === 'string').slice(0, MAX_PVP).map(r => ({ cid: r.i, pid: isNum(r.p) ? r.p : null, name: clampS(r.n) || 'だれか', team: r.tm ? 1 : 0, on: !!r.on, gone: !!r.x, host: r.i === m.cid }));
      const me = this.roster.find(r => r.cid === this.cid);
      if (me) this.myPid = me.pid;
    }
    const inRoster = this.roster.some(r => r.cid === this.cid);
    if (m.ph === 'lobby') {
      if (this.phase !== 'lobby') { this.phase = 'lobby'; this.static = null; this.snapQ = []; this.evQ = []; this.acts = []; this.emit('lobby', this); }
      else this.emit('roster', this.roster);
    } else if (m.ph === 'game') {
      if (m.st && typeof m.st === 'object') { this.static = m.st; this.emit('static', m.st); }
      if (isNum(m.ak && m.ak[this.myPid])) { this.ak = m.ak[this.myPid]; this.acts = this.acts.filter(x => x[0] > this.ak); }
      if (m.g && typeof m.g === 'object') this._snap(m.g, t);
      if (this.phase !== 'game' && inRoster && isNum(m.seed) && this.static && this.snapQ.length) {
        this.phase = 'game'; this.seed = m.seed;
        this.evSeen = Math.max(this.evSeen, this._maxSeq(m.g));
        this.evQ = [];
        this.emit('start', { seed: m.seed, kind: this.kind, cfg: this.cfg, myPid: this.myPid, static: this.static });
      } else if (this.phase === 'join' && !inRoster && this.roster.length) this._fail('playing');
      else if (this.phase === 'game') this.emit('roster', this.roster);
    } else if (m.ph === 'end') {
      if (this.phase !== 'end' && m.res) { this.phase = 'end'; this.emit('end', m.res); }
    }
  }
  _maxSeq(g) { let q = 0; if (g && Array.isArray(g.E)) for (const x of g.E) if (Array.isArray(x) && isNum(x[0])) q = Math.max(q, x[0]); return q; }
  _snap(g, t) {
    if (!isNum(g.T)) return;
    this.offs.push([t, t - g.T * 1000]);
    while (this.offs.length && t - this.offs[0][0] > 4000) this.offs.shift();
    this.snapQ.push({ g, at: t });
    if (this.snapQ.length > 40) this.snapQ.shift();
    if (Array.isArray(g.E)) for (const x of g.E) {
      if (!Array.isArray(x) || !isNum(x[0]) || !x[1] || typeof x[1] !== 'object') continue;
      if (x[0] <= this.evSeen) continue;
      this.evSeen = x[0]; this.evQ.push(x[1]);
    }
  }
  takeSnaps() { const q = this.snapQ; this.snapQ = []; return q; }
  takeEvents() { const q = this.evQ; this.evQ = []; return q; }
  // 人を描く時刻（ホストの時計で、少し過去）
  renderT() {
    const t = nowMs();
    if (!this.offs.length) return 0;
    let min = Infinity; for (const [, o] of this.offs) if (o < min) min = o;
    const d = this.offs.map(([, o]) => o - min).sort((a, b) => a - b);
    const jit = d[Math.floor(d.length * 0.9)] || 0;
    this.delay = Math.max(70, Math.min(500, 50 * 1.5 + jit + 20));
    return (t - min - this.delay) / 1000;
  }
  setInput(i) { this.input = i; }
  // 動作は番号をつけて、受け取ったと返事が来るまで送り続ける
  pushAct(ac) { this.acts.push([++this.qN, ac]); if (this.acts.length > 30) this.acts.shift(); }
  setLoadout(lo) { this.lo = lo; }
  _state() {
    const m = { t: 'g', v: VERSION, c: COMPAT, cid: this.cid, gs: this.gs, n: ++this.n, name: clampS(this.profile.name) || 'だれか', ph: this.phase };
    if (this.phase !== 'game' && this.lo) m.lo = this.lo;
    if (this.phase === 'game') { if (this.input) m.i = this.input; if (this.acts.length) m.q = this.acts.slice(-12); }
    if (this.bye) m.bye = 1;
    return m;
  }
  _pump() {
    if (this.closed) return;
    const t = nowMs();
    if (t - this.lastSend >= (this.rate[this.phase] || 500) - 3) { this.lastSend = t; try { this.link.send(this._state()); } catch (e) { console.warn('send', e); } }
    const since = t - (this.lastHost || this.startedAt);
    if (this.phase === 'join' && since > 15000) { this._fail('notfound'); return; }
    if (this.phase !== 'join' && since > 4000 && this.status === 'ok') { this.status = 'quiet'; this.emit('status', 'quiet'); }
    if (this.phase !== 'join' && since > 60000) this._fail('lost');
  }
  _fail(why, info) {
    if (this.closed) return;
    this.closed = true; this.pump.stop();
    this.emit('error', why, info);
    try { this.link.close(); } catch (e) { /* なし */ }
  }
  leave() {
    if (this.closed) return;
    this.bye = true;
    try { this.link.send(this._state(), true); } catch (e) { /* なし */ }
    this.closed = true; this.pump.stop();
    setTimeout(() => { try { this.link.close(); } catch (e) { /* なし */ } }, 300);
  }
}
