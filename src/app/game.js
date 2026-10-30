// 1回の試合: エンジンを進め、入力を命令にし、出来事を音・効果・HUDへ。カメラ（一人称）と描画。
import { createGame, step, dump, load } from '../engine/engine.js';
import { eyeOf, capsOf } from '../engine/combat.js';
import { curWeapon, curW, ammoCount } from '../engine/actor.js';
import { contextOf, OP_NAME, doorOps, personOps } from '../engine/interact.js';
import { spreadDeg, attMods } from '../engine/weapon.js';
import { raycast, CS, LH, levelOfY, los } from '../engine/world.js';
import { sideOf, isOpen } from '../engine/doors.js';
import { WEAPONS } from '../engine/data/weapons.js';
import { GEAR, LONG } from '../engine/data/equipment.js';
import { MAPS } from '../engine/maps/index.js';
import { MISSIONS } from '../engine/data/missions.js';
import { M } from '../engine/data/materials.js';
import { ActorView, roomOf } from '../render/actors.js';
import { FX } from '../render/fx.js';
import { ViewModel } from '../render/viewmodel.js';
import { gunModel } from '../render/guns.js';
import { roomGraph } from '../engine/ai/nav.js';
import { LINES } from '../audio/lines.js';

const DEG = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const TEAMS = ['gold', 'red', 'blue'];
const TEAMCOL = { gold: '#e8b830', red: '#e5483f', blue: '#3d8cf0' };

export class Match {
  constructor(app, o) {
    this.app = app; this.o = o;
    this.r = app.renderer; this.au = app.audio; this.hud = app.hud;
    this.G = o.mirror ? { S: o.mirror.S, w: o.mirror.w } : o.dump ? load(o.dump) : createGame({ map: o.map, mode: o.mode, mission: o.mission, diff: o.diff, entry: o.entry, team: o.team, roster: o.roster, rules: o.rules, seed: o.seed, teams: o.teams, aiLoadouts: o.aiLoadouts, start: o.start, house: o.house });
    this.S = this.G.S; this.w = this.G.w;
    this.def = MAPS[this.S.map];
    this.pid = o.pid ?? 0;
    this.p = this.S.actors.find(a => a.pid === this.pid) || this.S.actors[0];
    this.r.setMap(this.w, this.def, this.S);
    this.av = new ActorView(this.r); this.fx = new FX(this.r); this.vm = new ViewModel(this.r, this.av);
    this.fx.blood = app.settings.blood !== false;
    this.av.hidden.add(this.p.id);
    this.hud.setPlan(this.w, this.def);
    this.hud.setMode({ pve: !this.S.pvp, pvp: this.S.pvp, drone: false });
    this.yaw = o.cam ? o.cam.yaw : this.p.yaw; this.pitch = o.cam ? o.cam.pitch : 0;
    this.acc = 0; this.time = 0; this.dead = false; this.done = false;
    this.adsOn = false; this.leanSide = 0; this.stance = 0; this.lowOn = false; this.team = 'gold'; this.nvgOn = false;
    this.gearSel = (this.p.inv.gear.find(g => GEAR[g.id].kind === 'nade') || this.p.inv.gear[0] || {}).id || null;
    this.acts = [];
    this.shake = 0; this.flashW = 0; this.dmgK = 0; this.suppK = 0; this.exposure = 1; this.blurK = 0;
    this.ctx = null; this.ctxT = 0;
    this.spec = null; // 倒れたあとに見る味方
    this.lastSub = {};
    this.mmZoom = 1;
    this.droneId = null;
    this.prevBul = new Map();
    // AI の隊員の色（服）
    this.vm.setColors(this.av.look(this.p).pal.slice(3, 6), [0.02, 0.02, 0.025]);
    this.net = o.net || null;
    if (this.net && this.net.role === 'host') this.netInitHost();
    if (this.net && this.net.role === 'guest') this.netInitGuest(o);
    // 音: 壁ごしはこもる（視線が通らない）、屋内と屋外で残響、環境音とBGM
    this.au.occluder = (x, y, z) => { const c = this.cam; if (!c) return 0; const d = Math.hypot(x - c.x, z - c.z); if (d < 1.5) return 0; return los(this.w, c.x, c.y, c.z, x, y, z, this.S.doors) ? 0 : Math.min(1, 0.55 + d / 60); };
    this.fx.onClink = (x, y, z) => this.au.sfx('shell', [x, y, z], { vol: 0.35 });
    this.startT = performance.now();
    this.intro = o.dump ? 0 : 1.2;
    this.au.stopMusic(2.5);
    this.au.playMusic(this.S.pvp ? 'pvp' : this.S.mode === 'pve' ? 'op' : 'menu', { fade: 3, vol: this.S.pvp ? 0.55 : this.S.mode === 'pve' ? 0.6 : 0.35 });
    if (!o.dump && !this.S.pvp && this.S.mode === 'pve') setTimeout(() => this._say(null, 'toc_start', false, 'TOC'), 900);
  }
  destroy() { this.r.clearMap(); this.fx.clear(); this.au.occluder = null; this.au.ambience(false); this.au.stopMusic(1.5); }
  rebind(r) {
    if (r) { this.r = r; this.av = new ActorView(r); this.fx = new FX(r); this.vm = new ViewModel(r, this.av); this.fx.blood = this.app.settings.blood !== false; this.av.hidden.add(this.p.id); this.vm.setColors(this.av.look(this.p).pal.slice(3, 6), [0.02, 0.02, 0.025]); this.fx.onClink = (x, y, z) => this.au.sfx('shell', [x, y, z], { vol: 0.35 }); }
    this.r.setMap(this.w, this.def, this.S);
  }
  applySettings() { this.fx.blood = this.app.settings.blood !== false; }
  // 止まっている間の描き直し（画面の大きさが変わったときなど）
  redraw() { try { this._render(0, { lookDX: 0, lookDY: 0, edges: [] }); } catch (e) { console.warn('redraw', e); } }

  // ---- 1こま
  frame(dt, fo = {}) {
    if (this.done) return;
    if (this.net && this.net.role === 'guest') return this.guestFrame(dt, fo);
    this.time += dt;
    const app = this.app, st = app.settings;
    const inp = fo.input === false ? { mx: 0, mz: 0, lookDX: 0, lookDY: 0, gyroX: 0, gyroY: 0, fire: false, sprint: false, hold: new Set(), edges: [] } : app.input.take();
    this._look(inp, dt);
    this._edges(inp);
    // エンジンを進める（1/60秒ずつ。遅れたら最大4回）
    this.acc += Math.min(dt, 0.1);
    const step0 = this.S.dt;
    let n = 0;
    const ev = [];
    const hostNet = this.net && this.net.role === 'host';
    const waiting = hostNet && this.netWaiting();
    while (this.acc >= step0 && n < 4) {
      const cmd = this._command(inp);
      if (waiting) { this.acc -= step0; n++; continue; }
      const inputs = { [this.p.id]: cmd, ...(this.droneId != null ? { [this.droneId]: this._droneCmd(inp) } : {}) };
      if (hostNet) this.netInputs(inputs);
      const e = step(this.G, inputs);
      for (const x of e) ev.push(x);
      this.acc -= step0; n++;
      if (this.S.m && this.S.m.phase === 'end') break;
    }
    if (n === 4) this.acc = 0;
    if (hostNet) this.netAfterSteps(ev);
    this._events(ev);
    this._render(dt, inp);
    this._hud(dt);
    // 終わり
    const m = this.S.m;
    if (m && (m.phase === 'end' || m.over) && !this.done) {
      this.endT = (this.endT || 0) + dt;
      if (this.endT > (m.over ? 3.5 : 2.2)) { this.done = true; if (hostNet) app.netGameOver(this.result()); else app.endGame(this.result()); }
    }
  }

  _look(inp, dt) {
    const st = this.app.settings, p = this.p;
    const W = curW(p), wi = curWeapon(p);
    const ads = p.ads;
    const zoom = wi ? attMods(wi).zoom : 1;
    let k = (inp.mouse ? 0.0022 : 0.0052) * (st.sens || 1);
    if (ads > 0.5) k *= zoom > 2 ? (st.sensScope || 0.45) : (st.sensAds || 0.75);
    if (inp.fire && !inp.mouse) k *= st.sensFire || 1;
    // エイムアシスト（タッチ）: 敵の近くでは少しゆっくりに。対戦は部屋の設定（0なし・1弱い・2ふつう）
    let slow = 1;
    const aa = this.S.pvp ? ['off', 'weak', 'strong'][this.S.rules.aimAssist ?? 1] : st.aimAssist;
    if (!inp.mouse && aa && aa !== 'off') {
      const near = this._nearTarget(0.06);
      if (near) slow = aa === 'strong' ? 0.55 : 0.72;
    }
    let dx = inp.lookDX * k * slow, dy = inp.lookDY * k * slow * 0.9;
    // ジャイロ
    const gy = st.gyro || 'off';
    if (gy === 'always' || (gy === 'ads' && ads > 0.5)) { const g = (st.gyroSens || 1) * DEG * (ads > 0.5 ? 0.7 : 1); dx -= inp.gyroX * g * (st.gyroInvX ? -1 : 1); dy -= inp.gyroY * g * (st.gyroInvY ? -1 : 1); }
    if (this.droneId != null) { const d = this.S.byId[this.droneId]; if (d && d.alive) { this.dyaw = (this.dyaw ?? d.yaw) - dx; this.dpitch = clamp((this.dpitch ?? 0) - dy * (st.invertY ? -1 : 1), -0.6, 0.6); return; } }
    this.yaw -= dx;
    this.pitch = clamp(this.pitch - dy * (st.invertY ? -1 : 1), -1.4, 1.4);
    if (!p.alive || p.down && !this.S.pvp) return;
  }
  // 照準の近くの敵（エイムアシスト用）
  _nearTarget(cone) {
    const p = this.p; if (!p.alive) return null;
    const e = eyeOf(this.S, p);
    let best = null, bd = cone;
    for (const b of this.S.actors) {
      if (b === p || !b.alive || b.isDrone) continue;
      const enemy = this.S.pvp ? b.team !== p.team : (b.kind === 'sus' && !b.comply && !b.cuffed);
      if (!enemy) continue;
      const dx = b.x - e[0], dy = b.y + 1.2 - e[1], dz = b.z - e[2], d = Math.hypot(dx, dy, dz);
      if (d > 40) continue;
      const yw = Math.atan2(dx, dz), pt = Math.atan2(dy, Math.hypot(dx, dz));
      const da = Math.abs(Math.atan2(Math.sin(yw - this.yaw), Math.cos(yw - this.yaw))) + Math.abs(pt - this.pitch);
      if (da < bd) { bd = da; best = b; }
    }
    return best;
  }

  // ボタンの出来事 → 状態と命令
  _edges(inp) {
    const st = this.app.settings, p = this.p;
    for (const e of inp.edges) {
      const b = e.b, k = e.k;
      switch (b) {
        case 'ads': {
          const mode = st.adsMode || 'tap';
          if (e.mouse) { this.adsOn = k === 'down'; break; }
          if (mode === 'hold') { if (k === 'down') this.adsOn = true; else if (k !== 'long') this.adsOn = false; }
          else if (mode === 'tap') { if (k === 'tap') this.adsOn = !this.adsOn; }
          else { if (k === 'down') { this._adsWas = this.adsOn; this.adsOn = true; } else if (k === 'tap') this.adsOn = !this._adsWas; else if (k === 'up' || k === 'longup') this.adsOn = false; }
          break;
        }
        case 'reload': if (k === 'tap') this.acts.push({ a: 'reload' }); else if (k === 'long') this.acts.push({ a: 'reload', fast: true }); break;
        case 'crouch': if (k === 'tap') this.stance = this.stance === 1 ? 0 : 1; else if (k === 'long') this.stance = this.stance === 2 ? 1 : 2; break;
        case 'prone': if (k === 'tap' || k === 'longup') this.stance = this.stance === 2 ? 0 : 2; break;
        case 'vault': if (k === 'tap' || k === 'down' && e.key) this.acts.push({ a: 'vault' }); break;
        case 'leanL': case 'leanR': {
          const s = b === 'leanL' ? -1 : 1;
          if ((st.leanMode || 'toggle') === 'hold' || e.key) { if (k === 'down') this.leanSide = s; else if (k !== 'long' && this.leanSide === s) this.leanSide = 0; }
          else if (k === 'tap' || k === 'longup') this.leanSide = this.leanSide === s ? 0 : s;
          break;
        }
        case 'shout': if (k === 'tap' || k === 'long' || (k === 'down' && e.key)) { if (!e.key || k === 'down') this.acts.push({ a: 'shout', line: this._shoutLine() }); } break;
        case 'use':
          if (k === 'tap' || (k === 'down' && e.key)) { if (!e.key || k === 'down') this._useDefault(); }
          else if (k === 'long') this._useMenu(e);
          break;
        case 'cmd': if (this.S.pvp) break; if (k === 'tap') this._cmdDefault(); else if (k === 'long') this._cmdMenu(e); break;
        case 'team': if (k === 'tap') this.team = TEAMS[(TEAMS.indexOf(this.team) + 1) % 3]; break;
        case 'gear':
          if (k === 'tap') { if (p.ws.slot === 2) this.acts.push({ a: 'switch', slot: p.ws.prev >= 0 ? p.ws.prev : 0 }); else if (this.gearSel) this.acts.push({ a: 'gear', id: this.gearSel }); }
          else if (k === 'long') this._gearMenu(e);
          break;
        case 'wpn1': if (k === 'tap' || k === 'down' && e.key) this.acts.push({ a: 'switch', slot: 0 }); break;
        case 'wpn2': if (k === 'tap' || k === 'down' && e.key) this.acts.push({ a: 'switch', slot: 1 }); break;
        case 'fmode': if (k === 'tap') this.acts.push({ a: 'mode' }); break;
        case 'light': if (k === 'tap') this.acts.push({ a: 'light' }); break;
        case 'nvg': if (k === 'tap' && p.armor.head === 'nvg') { this.nvgOn = !this.nvgOn; p.nvgOn = this.nvgOn; this.au.sfx('nvg', null, { vol: 0.5 }); } break;
        case 'low': if (k === 'tap') this.lowOn = !this.lowOn; break;
        case 'map': if (k === 'tap') this.app.openTablet(); break;
        case 'pause': if (k === 'tap' || (k === 'down' && e.key)) this.app.pauseGame(); break;
        case 'drone': if (k === 'tap') this._droneToggle(); break;
        case 'radial': if (k === 'pick' && e.item && e.item.go) e.item.go(); break;
      }
    }
  }
  _shoutLine() {
    // 見ている相手で台詞を変える
    const c = this.ctx;
    if (c && c.k === 'person') { const b = this.S.byId[c.id]; if (b && b.kind === 'civ') return 'swat_civ'; }
    const n = (this.shoutN = (this.shoutN || 0) + 1);
    return ['swat_police', 'swat_hands', 'swat_drop', 'swat_ground'][n % 4];
  }
  _command(inp) {
    const p = this.p;
    const cmd = {
      mx: inp.mx, mz: inp.mz, yaw: this.yaw, pitch: this.pitch,
      fire: inp.fire && !this.app.input.radial, ads: this.adsOn, low: this.lowOn, stance: this.stance, lean: this.leanSide, sprint: inp.sprint && this.S.pvp,
      act: this.acts.length ? this.acts.splice(0) : null, power: 0.75,
    };
    if (this.droneId != null) { cmd.mx = 0; cmd.mz = 0; cmd.fire = false; }
    // しゃがみの状態を体に合わせる（伏せられないなど）
    return cmd;
  }

  // ---- 調べる（その時できること）
  _useDefault() {
    const c = contextOf(this.S, this.w, this.p);
    if (!c) { this.app.audio.ui('deny'); return; }
    this.acts.push({ a: 'use' });
  }
  _useMenu(e) {
    const c = contextOf(this.S, this.w, this.p);
    if (!c) return;
    const items = c.ops.map(o => ({ label: OP_NAME[o.op] || o.op, sub: o.t ? o.t.toFixed(1) + '秒' : '', go: () => this.acts.push({ a: 'op', k: c.k, id: c.id, op: o.op }) }));
    if (!items.length) return;
    this.app.input.openRadial('use', items, e.pid, e.x, e.y);
    this.app.input.radial.title = c.k === 'door' ? '扉' : c.k === 'person' ? '人' : c.k === 'item' ? '物' : '';
  }

  // ---- 命令（RoN）
  _lookTarget() {
    const S = this.S, w = this.w, p = this.p;
    const e = eyeOf(S, p);
    const cp = Math.cos(this.pitch), dx = Math.sin(this.yaw) * cp, dy = Math.sin(this.pitch), dz = Math.cos(this.yaw) * cp;
    const hits = raycast(w, e[0], e[1], e[2], dx, dy, dz, 40, S.doors, { out: [], seenProp: new Set(), seenDoor: new Set() });
    let door = -1, pt = null;
    for (const h of hits) {
      if (h.kind === 'door' || h.kind === 'bar') { if (h.t0 < 8) door = h.id; pt = [e[0] + dx * h.t0, e[1] + dy * h.t0, e[2] + dz * h.t0]; break; }
      if (h.mat === M.GLASS || h.mat === M.GLASSBROKEN) continue;
      pt = [e[0] + dx * h.t0, e[1] + dy * h.t0, e[2] + dz * h.t0];
      // 床に当たったら床の点、壁なら手前
      if (h.ny < 0.5) { pt[0] -= dx * 0.6; pt[2] -= dz * 0.6; }
      break;
    }
    // 近くの扉（見ている方向）
    if (door < 0) {
      let best = 4.5;
      for (const d of w.doors) {
        if (d.L !== levelOfY(p.y + 0.2)) continue;
        const ox = d.cx - p.x, oz = d.cz - p.z, dist = Math.hypot(ox, oz);
        if (dist > 4.5) continue;
        const f = (ox * dx + oz * dz) / Math.max(0.01, dist * Math.hypot(dx, dz));
        if (f < 0.8) continue;
        if (dist < best) { best = dist; door = d.id; }
      }
    }
    // 人
    let person = null;
    for (const b of S.actors) {
      if (b === p || b.kind === 'swat' || !b.alive) continue;
      const ox = b.x - e[0], oy = b.y + 1 - e[1], oz = b.z - e[2];
      const t = ox * dx + oy * dy + oz * dz;
      if (t < 0.3 || t > 12) continue;
      const perp = Math.sqrt(Math.max(0, ox * ox + oy * oy + oz * oz - t * t));
      if (perp < 0.7 && los(w, e[0], e[1], e[2], b.x, b.y + 1, b.z, S.doors)) { person = b; break; }
    }
    return { door, pt, person };
  }
  _cmdDefault() {
    const t = this._lookTarget();
    if (t.person && (t.person.comply || t.person.down || t.person.stun > 0)) return this._order({ cmd: 'restrain', target: t.person.id });
    if (t.door >= 0) {
      const ds = this.S.doors[t.door];
      if (ds && !isOpen(ds) && !ds.broken) return this._order({ cmd: 'stack', door: t.door, side: 'split' });
      return this._order({ cmd: 'breach', door: t.door, method: 'open', nade: 'none' });
    }
    if (t.pt) return this._order({ cmd: 'move', x: t.pt[0], y: t.pt[1], z: t.pt[2], yaw: this.yaw });
    this._order({ cmd: 'fallin' });
  }
  _cmdMenu(e) {
    const t = this._lookTarget();
    const S = this.S;
    const teamHas = (fn) => S.actors.some(a => a.kind === 'swat' && a.ai && a.alive && !a.down && (this.team === 'gold' || a.ai.squad === this.team) && fn(a));
    const hasNade = (id) => teamHas(a => a.inv.gear.some(g => g.id === id && g.n > 0));
    let items = [];
    if (t.door >= 0) {
      const ds = S.doors[t.door];
      const closed = ds && !isOpen(ds) && !ds.broken;
      const breach = (nade) => () => this._methodMenu(t.door, nade, e);
      items = [
        { label: '突入', sub: closed ? '開け方を選ぶ' : '入って確保', go: closed ? breach('none') : () => this._order({ cmd: 'breach', door: t.door, method: 'open', nade: 'none' }) },
        { label: '閃光で突入', disabled: !hasNade('flash'), go: closed ? breach('flash') : () => this._order({ cmd: 'breach', door: t.door, method: 'open', nade: 'flash' }) },
        { label: 'スティンガーで突入', disabled: !hasNade('stinger'), go: closed ? breach('stinger') : () => this._order({ cmd: 'breach', door: t.door, method: 'open', nade: 'stinger' }) },
        { label: 'ガスで突入', disabled: !hasNade('cs'), go: closed ? breach('cs') : () => this._order({ cmd: 'breach', door: t.door, method: 'open', nade: 'cs' }) },
        { label: 'ミラーで見る', disabled: !closed, go: () => this._order({ cmd: 'mirror', door: t.door }) },
        { label: 'スタック', sub: '分割', go: () => this._stackMenu(t.door, e) },
        { label: ds && ds.wedge ? 'ウェッジを外す' : 'ウェッジ', disabled: !closed || (!ds.wedge && !teamHas(a => a.inv.gear.some(g => g.id === 'wedge' && g.n > 0))), go: () => this._order({ cmd: ds && ds.wedge ? 'unwedge' : 'wedge', door: t.door }) },
        { label: ds && ds.trapSeen ? '罠を外す' : 'ピッキング', disabled: !closed || (!(ds && ds.trapSeen) && !(ds && ds.locked && !ds.lockBroken)), go: () => this._order({ cmd: ds && ds.trapSeen ? 'disarm' : 'pick', door: t.door }) },
      ];
    } else if (t.person) {
      items = [
        { label: '拘束', go: () => this._order({ cmd: 'restrain', target: t.person.id }) },
        { label: '捜索して確保', go: () => this._order({ cmd: 'search' }) },
        { label: '援護', go: () => this._order({ cmd: 'cover', x: t.person.x, y: t.person.y, z: t.person.z }) },
        { label: '集合', go: () => this._order({ cmd: 'fallin' }) },
      ];
    } else {
      const pt = t.pt;
      items = [
        { label: '移動', disabled: !pt, go: () => pt && this._order({ cmd: 'move', x: pt[0], y: pt[1], z: pt[2], yaw: this.yaw }) },
        { label: '集合', go: () => this._order({ cmd: 'fallin' }) },
        { label: '待機', go: () => this._order({ cmd: 'hold' }) },
        { label: '援護', disabled: !pt, go: () => pt && this._order({ cmd: 'cover', x: pt[0], y: pt[1], z: pt[2] }) },
        { label: '捜索して確保', go: () => this._order({ cmd: 'search' }) },
        { label: '閃光を投げる', disabled: !pt || !hasNade('flash'), go: () => this._order({ cmd: 'deploy', nade: 'flash', x: pt[0], y: pt[1], z: pt[2] }) },
        { label: 'スティンガーを投げる', disabled: !pt || !hasNade('stinger'), go: () => this._order({ cmd: 'deploy', nade: 'stinger', x: pt[0], y: pt[1], z: pt[2] }) },
        { label: 'ガスを投げる', disabled: !pt || !hasNade('cs'), go: () => this._order({ cmd: 'deploy', nade: 'cs', x: pt[0], y: pt[1], z: pt[2] }) },
      ];
    }
    this.app.input.openRadial('cmd', items, e.pid, e.x, e.y);
    this.app.input.radial.title = `<span style="color:${TEAMCOL[this.team]}">${{ gold: '全員', red: '赤', blue: '青' }[this.team]}</span>へ命令`;
  }
  _methodMenu(door, nade, e) {
    const S = this.S;
    const teamHas = (fn) => S.actors.some(a => a.kind === 'swat' && a.ai && a.alive && !a.down && (this.team === 'gold' || a.ai.squad === this.team) && fn(a));
    const items = [
      { label: '開ける', go: () => this._order({ cmd: 'breach', door, method: 'open', nade }) },
      { label: '蹴る', go: () => this._order({ cmd: 'breach', door, method: 'kick', nade }) },
      { label: '破城槌', disabled: !teamHas(a => a.inv.long === 'ram'), go: () => this._order({ cmd: 'breach', door, method: 'ram', nade }) },
      { label: '散弾で開ける', disabled: !teamHas(a => a.inv.long === 'breacher'), go: () => this._order({ cmd: 'breach', door, method: 'breach', nade }) },
      { label: 'C2で爆破', disabled: !teamHas(a => a.inv.gear.some(g => g.id === 'c2' && g.n > 0)), go: () => this._order({ cmd: 'breach', door, method: 'c2', nade }) },
    ];
    setTimeout(() => { this.app.input.openRadial('cmd2', items, null, this.app.input.lastRadialX ?? this.app.stage.w / 2, this.app.stage.h / 2); this.app.input.radial.title = '開け方'; }, 30);
  }
  _stackMenu(door, e) {
    const items = [['分割', 'split'], ['左', 'left'], ['右', 'right']].map(([l, s]) => ({ label: l, go: () => this._order({ cmd: 'stack', door, side: s }) }));
    setTimeout(() => { this.app.input.openRadial('cmd2', items, null, this.app.stage.w / 2, this.app.stage.h / 2); this.app.input.radial.title = 'スタック'; }, 30);
  }
  _order(o) {
    this.acts.push({ a: 'cmd', team: this.team, ...o });
    this.app.audio.ui('cmd');
  }
  _gearMenu(e) {
    const p = this.p;
    const items = p.inv.gear.filter(g => g.n > 0).map(g => ({ label: GEAR[g.id].name.replace(/（.*）/, ''), sub: '×' + g.n, go: () => { this.gearSel = g.id; if (GEAR[g.id].kind === 'nade' || GEAR[g.id].kind === 'spray' || GEAR[g.id].kind === 'heal') this.acts.push({ a: 'gear', id: g.id }); } }));
    if (p.inv.long && p.inv.long !== 'none' && LONG[p.inv.long]) items.push({ label: LONG[p.inv.long].name.replace(/（.*）/, ''), sub: '長い装備', disabled: true });
    if (!items.length) return;
    this.app.input.openRadial('gear', items, e.pid, e.x, e.y);
    this.app.input.radial.title = '装備';
  }
  // ---- ドローン（対戦の攻撃側）
  _droneToggle() {
    if (this.droneId != null) { this.droneId = null; this.au.sfx('ui_back'); return; }
    this.acts.push({ a: 'drone' });
  }
  _droneCmd(inp) {
    const d = this.S.byId[this.droneId];
    if (!d || !d.alive) { this.droneId = null; return {}; }
    return { mx: inp.mx, mz: inp.mz, yaw: this.dyaw ?? d.yaw, pitch: this.dpitch ?? 0, fire: inp.fire, jump: inp.hold.has('vault') };
  }

  // ---- 出来事 → 音・効果・HUD
  _events(ev) {
    const S = this.S, p = this.p, hud = this.hud, fx = this.fx, au = this.au;
    const me = p.id;
    for (const e of ev) {
      switch (e.e) {
        case 'shot': {
          const a = S.byId[e.id]; if (!a) break;
          const W = WEAPONS[e.wid];
          let mz;
          if (a === p && this.vm.on) { mz = this.vm.out.muzzle; fx.muzzle(mz[0], mz[1], mz[2], this.vm.out.fwd[0], this.vm.out.fwd[1], this.vm.out.fwd[2], W.cat === 'pistol' ? 0.7 : 1, e.supp); const ej = this.vm.out.eject, r = this.vm.out.right; if (W.cat !== 'shotgun' && !W.revolver) fx.shell(ej[0], ej[1], ej[2], -r[0] * 1.6 + this.vm.out.up[0], 1.4, -r[2] * 1.6 + this.vm.out.up[2], W.cal === '762x51' || W.cal === '762x39'); }
          else { const g = this._gunFrame(a); if (g) { const L = gunModel(e.wid, (curWeapon(a) || {}).att || {}); const ml = L ? L.len : 0.4; mz = [g.p[0] + g.f[0] * ml, g.p[1] + g.f[1] * ml, g.p[2] + g.f[2] * ml]; fx.muzzle(mz[0], mz[1], mz[2], g.f[0], g.f[1], g.f[2], 1, e.supp); } else mz = [e.x, e.y + 1.4, e.z]; }
          au.gun(e.wid, a === p ? null : mz, { supp: e.supp, local: a === p, n: e.n });
          break;
        }
        case 'imp': if (!e.exit) { fx.impact(e.x, e.y, e.z, e.nx, e.ny, e.nz, e.m); if (Math.hypot(e.x - this.cam.x, e.z - this.cam.z) < 25) au.sfx(impSound(e.m), [e.x, e.y, e.z], { vol: 0.5 }); } else fx.impact(e.x, e.y, e.z, e.nx, e.ny, e.nz, e.m); break;
        case 'blood': {
          fx.bloodHit(e.x, e.y, e.z, e.dx, e.dy, e.dz, e.n);
          // 後ろの壁や床に血の跡
          const hs = raycast(this.w, e.x, e.y, e.z, e.dx, e.dy - 0.3, e.dz, 2.2, S.doors, { out: [], seenProp: new Set(), seenDoor: new Set() });
          const h = hs.find(q => q.kind !== 'prop' || true);
          if (h) fx.bloodSplat(e.x + e.dx * h.t0, e.y + (e.dy - 0.3) * h.t0, e.z + e.dz * h.t0, h.nx || 0, h.ny || 0, h.nz || 0, 0.12 + 0.06 * e.n);
          break;
        }
        case 'hit': {
          const a = S.byId[e.id];
          if (e.by === me && e.id !== me) { hud.hit(e.hs || e.part === 'head' ? 'head' : ''); au.ui(e.blocked ? 'hitArmor' : 'hit'); }
          if (e.id === me) {
            const src = S.byId[e.by];
            if (src) hud.damageFrom(Math.atan2(src.x - p.x, src.z - p.z));
            this.dmgK = Math.min(1, this.dmgK + (e.d || 10) / 40); this.shake = Math.min(1, this.shake + (e.d || 10) / 60);
            au.sfx(e.blocked ? 'plateHit' : 'fleshHit', null, { vol: 0.9 });
          } else if (a && Math.hypot(a.x - this.cam.x, a.z - this.cam.z) < 30) au.sfx(e.blocked ? 'plateHit' : 'fleshHit', [e.x, e.y, e.z], { vol: 0.5 });
          break;
        }
        case 'whiz': if (e.id === me) { this.suppK = Math.min(1, this.suppK + e.k * 0.5); au.sfx('whiz', null, { vol: 0.4 + e.k * 0.5, rate: 0.9 + Math.random() * 0.2 }); } break;
        case 'kill': {
          const v = S.byId[e.id], k = S.byId[e.by];
          if (v && !v.isDrone) hud.feed(feedKill(k, v, e, p), k === p ? 'mine' : '');
          if (e.by === me && e.id !== me) hud.hit('kill');
          if (v === p) this._onDeath();
          if (v && v.kind === 'swat' && v !== p && !S.pvp) this._say(this._anyOfficer(v), 'swat_mandown');
          if (v && v.kind === 'sus' && k && k.kind === 'swat' && !S.pvp) this._say(k === p ? this._anyOfficer() : k, 'swat_susdown');
          break;
        }
        case 'down': {
          const v = S.byId[e.id];
          if (v === p) { hud.showBanner(S.pvp ? 'ダウン — 味方の手当てを待つ' : '行動不能', 3000, 'bad'); }
          if (v && S.pvp) hud.feed(`${nm(S.byId[e.by])} が ${nm(v)} を倒した（ダウン）`);
          break;
        }
        case 'cuffed': { const v = S.byId[e.id]; hud.feed(`${v.kind === 'sus' ? '容疑者' : '市民'}を拘束（${nm(S.byId[e.by])}）`, 'ok'); au.sfx('cuffs', [v.x, v.y + 0.8, v.z]); if (e.by !== me) this._say(S.byId[e.by], v.kind === 'sus' ? 'swat_cuffsus' : 'swat_cuffciv'); break; }
        case 'report': { const v = S.byId[e.id]; hud.feed(`TOCへ報告: ${v.kind === 'sus' ? '容疑者' : v.kind === 'civ' ? '市民' : '隊員'}（${e.st === 'dead' ? '死亡' : e.st === 'down' ? '行動不能' : '拘束'}）`, 'ok'); this._say(null, 'toc_copy', false, 'TOC'); break; }
        case 'evidence': hud.feed('証拠を回収', 'ok'); au.ui('pickup'); break;
        case 'bombdone': hud.feed('爆弾を解除', 'ok'); au.ui('ok'); this._say(null, 'toc_bomb', false, 'TOC'); break;
        case 'soft': hud.showBanner('主目的を達成<br><small>本部へ戻る（メニュー）か、残りの目的を続ける</small>', 4500, 'ok'); au.ui('ok'); this._say(null, 'toc_soft', false, 'TOC'); break;
        case 'glass': { const k = e.k, i = k % this.w.W, j = Math.floor((k % (this.w.W * this.w.D)) / this.w.W), L = Math.floor(k / (this.w.W * this.w.D)); fx.glassBreak((i + 0.5) * CS, L * LH + 0.7, (j + 0.5) * CS); au.sfx('glass', [(i + 0.5) * CS, L * LH + 1.2, (j + 0.5) * CS]); this.r.rebuildCells([k], S); break; }
        case 'block': { const k = e.k, i = k % this.w.W, j = Math.floor((k % (this.w.W * this.w.D)) / this.w.W), L = Math.floor(k / (this.w.W * this.w.D)); fx.debris((i + 0.5) * CS, L * LH + e.q * 0.7 + 0.35, (j + 0.5) * CS, e.m === M.BRICK ? [0.45, 0.25, 0.2] : e.m === M.WOOD ? [0.5, 0.38, 0.25] : [0.82, 0.8, 0.76]); this._rebuild = this._rebuild || new Set(); this._rebuild.add(k); au.sfx('wallBreak', [(i + 0.5) * CS, L * LH + 1, (j + 0.5) * CS]); break; }
        case 'reinf': this._rebuild = this._rebuild || new Set(); this._rebuild.add(e.k); au.sfx('reinforce', null); break;
        case 'door': {
          const d = this.w.doors[e.d]; const pos = [d.cx, d.L * LH + 1, d.cz];
          const snd = { open: 'doorOpen', peek: 'doorOpen', close: 'doorClose', kickopen: 'doorKick', kickfail: 'doorKickFail', ram: 'doorRam', breach: 'doorBreach', locked: 'doorLocked', wedged: 'doorLocked', barred: 'doorLocked', unlock: 'lockPick', wedge: 'wedge', unwedge: 'wedge' }[e.k];
          if (snd) au.sfx(snd, pos);
          if (e.k === 'kickopen' || e.k === 'ram' || e.k === 'breach') { for (let i = 0; i < 3; i++) fx.smoke(d.cx, d.L * LH + 0.4, d.cz, 0.4, [0.7, 0.68, 0.64], 0.35, 1.5); }
          if (e.id === me && (e.k === 'locked' || e.k === 'wedged')) hud.showBanner(e.k === 'locked' ? '鍵がかかっている' : 'ウェッジで開かない', 1500);
          if (e.k === 'locked' && e.id !== me && S.byId[e.id] && S.byId[e.id].kind === 'swat') this._say(S.byId[e.id], 'swat_locked');
          break;
        }
        case 'deny': if (e.id === me) { const why = { locked: '鍵がかかっている', wedged: 'ウェッジで開かない', barred: 'バリケードがある', nogear: 'もう持っていない', nodet: '起爆する物がない', open: '扉が開いている', broken: '壊れている' }[e.why]; if (why) hud.showBanner(why, 1400); au.ui('deny'); } break;
        case 'nade': { if (e.type === 'cs') { for (let i = 0; i < 8; i++) fx.smoke(e.x, e.y + 0.4, e.z, 1.2, [0.85, 0.85, 0.8], 0.5, 6); au.sfx('gasPop', [e.x, e.y, e.z]); } else { fx.explosion(e.x, e.y, e.z, 3, e.type === 'flash' ? 'flash' : 'stinger'); au.sfx(e.type === 'flash' ? 'flashbang' : 'stinger', [e.x, e.y, e.z]); } const d = Math.hypot(e.x - this.cam.x, e.z - this.cam.z); this.shake = Math.max(this.shake, Math.max(0, 1 - d / 10) * 0.6); break; }
        case 'boom': case 'c2': { fx.explosion(e.x, e.y, e.z, e.r || 3, e.kind || 'c2'); au.sfx('explosion', [e.x, e.y, e.z], { vol: 1.2 }); const d = Math.hypot(e.x - this.cam.x, e.z - this.cam.z); this.shake = Math.max(this.shake, Math.max(0, 1 - d / 18)); break; }
        case 'flashed': if (e.id === me) { this.flashW = Math.max(this.flashW, Math.min(1, 0.4 + e.k * 1.2)); au.deafen(2 + 4 * e.k); } break;
        case 'stung': if (e.id === me) { this.shake = 1; this.blurK = Math.max(this.blurK, 0.8); } break;
        case 'tase': au.sfx('taser', S.byId[e.id] ? [S.byId[e.id].x, S.byId[e.id].y + 1, S.byId[e.id].z] : null); break;
        case 'spray': au.sfx('spray', S.byId[e.id] ? [S.byId[e.id].x, S.byId[e.id].y + 1.5, S.byId[e.id].z] : null); break;
        case 'reload': if (e.id === me) au.sfx(e.k === 'shell' ? 'shellStart' : 'magOut', null, { vol: 0.7 }); else { const a = S.byId[e.id]; if (a && a.kind === 'swat' && !S.pvp && Math.random() < 0.5) this._say(a, 'swat_reload'); if (a) au.sfx('magOut', [a.x, a.y + 1.2, a.z], { vol: 0.5 }); } break;
        case 'reloaded': if (e.id === me) au.sfx('magIn', null, { vol: 0.75 }); break;
        case 'shell': if (e.id === me) au.sfx('shellIn', null, { vol: 0.7 }); break;
        case 'pumped': if (e.id === me) au.sfx('pump', null, { vol: 0.75 }); else { const a = S.byId[e.id]; if (a) au.sfx('pump', [a.x, a.y + 1.2, a.z], { vol: 0.5 }); } break;
        case 'dry': if (e.id === me) au.sfx('dry', null, { vol: 0.6 }); break;
        case 'draw': if (e.id === me) au.sfx('draw', null, { vol: 0.45 }); break;
        case 'fmode': if (e.id === me) { au.sfx('fmode', null, { vol: 0.5 }); hud.showBanner(e.m === 'auto' ? '連射' : '単発', 700); } break;
        case 'lightsw': if (e.id === me) au.sfx('click', null, { vol: 0.4 }); break;
        case 'step': { const a = S.byId[e.id]; if (a && a !== p) au.step(e.f, [e.x, e.y, e.z], e.loud); else if (a === p) au.step(e.f, null, e.loud * 0.6); break; }
        case 'shout': { const a = S.byId[e.id]; if (a) this._say(a, e.line > -1 || typeof e.line === 'string' ? e.line : 'swat_police', a === p); break; }
        case 'cmd': {
          const by = S.byId[e.id];
          if (by === p) { hud.feed(`<span style="color:${TEAMCOL[e.team] || '#ddd'}">■</span> ${cmdName(e.cmd)}`, 'cmd'); setTimeout(() => this._say(this._anyOfficer(null, e.team), 'swat_copy'), 350); }
          break;
        }
        case 'mirror': if (e.id === me || (S.byId[e.id] && S.byId[e.id].kind === 'swat')) { hud.showMirror(mirrorHTML(e, S)); if (e.id !== me) this._say(S.byId[e.id], e.seen.length ? (e.seen.some(s => s.kind === 'sus') ? 'swat_mirror_sus' : 'swat_mirror_civ') : 'swat_mirror_clear'); } break;
        case 'act': if (e.id === me) { const k = e.k; au.sfx(k === 'restrain' ? 'cuffsStart' : k === 'mirror' ? 'mirror' : k === 'plant' || k === 'defuse' || k === 'bombdefuse' ? 'beep' : 'act', null, { vol: 0.5 }); } break;
        case 'trap': au.sfx('explosion', null); break;
        case 'trapset': case 'barset': case 'c2set': au.sfx(e.e === 'barset' ? 'barricade' : 'act', null, { vol: 0.6 }); break;
        case 'barhit': case 'barbreak': { const d = this.w.doors[e.d]; au.sfx(e.e === 'barbreak' ? 'barBreak' : 'woodHit', d ? [d.cx, d.L * LH + 1, d.cz] : null); break; }
        case 'plant': hud.feed('解除装置を設置した', 'warn'); hud.showBanner('解除装置を設置！', 2500, 'warn'); au.ui('alarm'); break;
        case 'disable': hud.feed('解除装置を外した', 'ok'); break;
        case 'defpick': if (e.id === me) hud.showBanner('解除装置を拾った', 1500); break;
        case 'defdrop': hud.feed(`${nm(S.byId[e.id])} が解除装置を落とした`, 'warn'); break;
        case 'spotted': if (S.byId[e.by] && S.byId[e.by].team === p.team) au.ui('spot'); break;
        case 'drone': if (e.owner === me) { this.droneId = e.id; this.dyaw = p.yaw; this.dpitch = 0; au.sfx('drone', null); } break;
        case 'dronedead': if (e.id === this.droneId) { this.droneId = null; hud.showBanner('ドローンが壊された', 1500, 'bad'); } break;
        case 'phase': if (e.p === 'prep') hud.showBanner('準備フェーズ', 2000); else if (e.p === 'action') { hud.showBanner('行動開始', 1600, 'warn'); au.ui('go'); this.droneId = null; } break;
        case 'round': { const win = e.win; const mine = win === p.team; hud.showBanner(win < 0 ? '引き分け' : (mine ? 'ラウンド勝利' : 'ラウンド敗北') + `<br><small>${whyName(e.why)} ・ ${e.wins[p.team]} - ${e.wins[1 - p.team]}</small>`, 4000, win < 0 ? '' : mine ? 'ok' : 'bad'); au.ui(mine ? 'win' : 'lose'); break; }
        case 'roundstart': this.fx.clear(); this.r.rebuildCells(Object.keys(this._lastBdiff || {}).map(Number).concat(this._allBroken()), S); this._lastBdiff = {}; this.adsOn = false; this.stance = 0; this.leanSide = 0; this.r.setMap(this.w, this.def, S); hud.showBanner(`ラウンド ${e.round}`, 1800); break;
        case 'swap': hud.feed('攻守交代', 'warn'); break;
        case 'respawn': if (e.id === me) { this.dead = false; this.spec = null; this.yaw = p.yaw; this.pitch = 0; this.av.hidden.add(me); hud.hideBanner(); } break;
        case 'matchend': { const mine = e.win === p.team; hud.showBanner(e.win < 0 ? '引き分け' : mine ? '勝利' : '敗北', 0, mine ? 'ok' : 'bad'); au.ui(mine ? 'win' : 'lose'); break; }
        case 'end': hud.showBanner(e.res === 'fail' ? '作戦失敗' : e.res === 'abort' ? '撤収' : '作戦完了', 0, e.res === 'fail' ? 'bad' : 'ok'); au.ui(e.res === 'fail' ? 'lose' : 'win'); break;
        case 'revive': hud.feed(`${nm(S.byId[e.by])} が ${nm(S.byId[e.id])} を起こした`, 'ok'); break;
        case 'bandaged': if (e.id === me) au.sfx('bandage', null); break;
        case 'fall': if (e.id === me) au.sfx('land', null); break;
        case 'throw': { const a = S.byId[e.id]; au.sfx('throw', a === p ? null : [a.x, a.y + 1.5, a.z], { vol: 0.6 }); break; }
        case 'bounce': if (e.v > 2) au.sfx('nadeBounce', [e.x, e.y, e.z], { vol: Math.min(1, e.v / 8) }); break;
      }
    }
    if (this._rebuild && this._rebuild.size) { this.r.rebuildCells([...this._rebuild], S); this._rebuild.clear(); }
  }
  _allBroken() { return []; }
  _gunFrame(a) { const e = this.av.list.find(x => x.a === a); return e && e.gun ? e.gun.f : null; }
  _anyOfficer(not, team) {
    const list = this.S.actors.filter(a => a.kind === 'swat' && a.ai && a.alive && !a.down && a !== not && (!team || team === 'gold' || a.ai.squad === team));
    return list[0] || null;
  }
  // 声と字幕
  _say(a, line, mine = false, who) {
    const L = LINES[line];
    if (!L) return;
    const now = performance.now();
    const key = (a ? a.id : 'x') + line;
    if (this.lastSub[key] && now - this.lastSub[key] < 2500) return;
    this.lastSub[key] = now;
    const v = L.v ? L.v[Math.floor(Math.random() * L.v.length)] : null;
    const speaker = who || (a ? (a === this.p ? 'あなた' : a.kind === 'swat' ? a.name : a.kind === 'sus' ? '容疑者' : a.kind === 'civ' ? '市民' : a.name) : '');
    const col = a && a.kind === 'sus' ? '#ff8a7a' : a && a.kind === 'civ' ? '#9fe0a0' : who === 'TOC' ? '#ffd27a' : '#9cd0ff';
    const idx = L.v ? L.v.indexOf(v) : 0;
    this.hud.subtitle(speaker, (L.ja && L.ja[idx]) || L.ja[0], col);
    const voice = a ? (a.kind === 'swat' ? (a === this.p ? 'p' : 'o' + ((a.ai && a.ai.slot) || 0)) : a.kind === 'sus' ? 's' + (a.id % 3) : 'c' + (a.id % 3)) : 'toc';
    this.au.voice(line, idx, voice, a && a !== this.p ? [a.x, a.y + 1.6, a.z] : null, { radio: !a || who === 'TOC' || (a.kind === 'swat' && a !== this.p && Math.hypot(a.x - this.p.x, a.z - this.p.z) > 12) });
  }
  _onDeath() {
    this.dead = true;
    this.adsOn = false;
    this.hud.showBanner(this.S.pvp ? (this.S.m.kind === 'tdm' ? '倒された — 4秒で復活' : '倒された — 味方を見ています') : '倒された — 味方を見ています', 3000, 'bad');
    this.au.deafen(1.5);
  }

  // ---- カメラと描画
  _render(dt, inp) {
    const S = this.S, p = this.p, r = this.r, st = this.app.settings;
    let cam;
    const drone = this.droneId != null ? S.byId[this.droneId] : null;
    if (drone && drone.alive) {
      cam = { x: drone.x, y: drone.y + 0.14, z: drone.z, yaw: drone.yaw, pitch: drone.pitch, roll: 0, fov: 70 * DEG };
      this.av.hidden.delete(p.id);
    } else if (p.alive && !(p.down && !S.pvp)) {
      const e = eyeOf(S, p);
      const W = curW(p), wi = curWeapon(p);
      const zoom = wi ? attMods(wi).zoom : 1;
      const fov0 = (st.fov || 52) * DEG;
      const z = 1 + (zoom - 1) * p.ads;
      // 被弾のぶれ（エイムパンチ）と揺れ
      this.shake = Math.max(0, this.shake - dt * 1.8);
      const sh = this.shake * this.shake;
      const t = this.time;
      cam = {
        x: e[0], y: e[1], z: e[2],
        yaw: p.yaw + (p.ws.ry * DEG) + Math.sin(t * 37) * 0.012 * sh + p.flinch * 0.03 * Math.sin(t * 23),
        pitch: p.pitch + (p.ws.rp * DEG) + Math.sin(t * 41) * 0.012 * sh + p.flinch * 0.04,
        roll: -p.lean * 0.16 + Math.sin(t * 29) * 0.01 * sh,
        fov: 2 * Math.atan(Math.tan(fov0 / 2) / z),
      };
      if (!this.av.hidden.has(p.id)) this.av.hidden.add(p.id);
    } else {
      // 倒れた: 味方を見る（PvE は隊員、PvP は味方）
      const mates = S.actors.filter(a => a !== p && !a.isDrone && a.alive && !a.down && (S.pvp ? a.team === p.team : a.kind === 'swat'));
      if (!this.spec || !this.spec.alive || this.spec.down) this.spec = mates[0] || null;
      const t = this.spec;
      if (t) {
        const e = eyeOf(S, t);
        cam = { x: e[0] - Math.sin(t.yaw) * 1.6, y: e[1] + 0.35, z: e[2] - Math.cos(t.yaw) * 1.6, yaw: t.yaw, pitch: t.pitch - 0.1, roll: 0, fov: 60 * DEG };
      } else { const e = eyeOf(S, p); cam = { x: e[0], y: e[1] + 1.2, z: e[2], yaw: p.yaw, pitch: -0.6, roll: 0, fov: 60 * DEG }; }
      this.av.hidden.delete(p.id);
    }
    this.cam = cam;
    this.au.listen(cam.x, cam.y, cam.z, cam.yaw, cam.pitch);
    // 屋内か屋外か（残響と環境音）
    this._envT = (this._envT || 0) - dt;
    if (this._envT <= 0) {
      this._envT = 0.3;
      const ci = Math.floor(cam.x / CS), cj = Math.floor(cam.z / CS), cL = Math.max(0, Math.min(this.w.NL - 1, Math.floor(cam.y / LH)));
      const ind = ci >= 0 && cj >= 0 && ci < this.w.W && cj < this.w.D && this.w.indoor[this.w.idx(cL, ci, cj)] ? 1 : 0;
      this._ind = this._ind == null ? ind : this._ind + (ind - this._ind) * 0.5;
      this.au.setEnv(this._ind);
      this.au.ambience(true, this._ind);
    }
    // 人と効果
    this.av.prepare(S, this.w);
    const fp = !this.dead && p.alive && !(p.down && !S.pvp) && !(drone && drone.alive);
    if (fp) this.vm.update(p, cam, dt); else this.vm.on = false;
    // 曳光弾
    for (const b of S.bullets) {
      if (!b.tr) continue;
      const sp = Math.hypot(b.vx, b.vy, b.vz) || 1;
      const L = Math.min(sp * 0.018, 7);
      this.fx.tracer(b.x - b.vx / sp * L, b.y - b.vy / sp * L, b.z - b.vz / sp * L, b.x, b.y, b.z, b.less ? [1.5, 1.5, 1.2] : [9, 5, 2]);
    }
    this.fx.update(dt);
    // 動く光: 自分と隊員のライト、銃口・爆発
    const lights = [];
    const roomsFor = (x, y, z, R) => this._lightRooms(x, y, z, R);
    if (fp && this.vm.out.light) { const o = this.vm.out.light, f = this.vm.out.fwd; lights.push({ x: o[0] + f[0] * 0.05, y: o[1], z: o[2] + f[2] * 0.05, r: 22, col: [5.5, 5.2, 4.6], spot: { dx: f[0], dy: f[1], dz: f[2], cos: Math.cos(0.42) }, rooms: roomsFor(o[0], o[1], o[2], 22) }); }
    for (const e2 of this.av.list) {
      if (e2.drone || !e2.gun || !e2.gun.wi.lightOn || lights.length >= 6) continue;
      const g = e2.gun.f, gm = gunModel(e2.gun.wi.id, e2.gun.wi.att);
      const lp = gm && gm.pts.lightPt ? gm.pts.lightPt : [0, 0, 0.3];
      const x = g.p[0] + g.l[0] * lp[0] + g.u[0] * lp[1] + g.f[0] * lp[2], y = g.p[1] + g.l[1] * lp[0] + g.u[1] * lp[1] + g.f[1] * lp[2], z = g.p[2] + g.l[2] * lp[0] + g.u[2] * lp[1] + g.f[2] * lp[2];
      if (Math.hypot(x - cam.x, z - cam.z) > 35) continue;
      lights.push({ x, y, z, r: 18, col: [4.5, 4.3, 3.8], spot: { dx: g.f[0], dy: g.f[1], dz: g.f[2], cos: Math.cos(0.42) }, rooms: roomsFor(x, y, z, 18) });
    }
    this.fx.lights(lights, roomsFor);
    lights.sort((a, b) => (a.spot ? 0 : 1) - (b.spot ? 0 : 1));
    // 明るさに目が慣れる（屋内と屋外）
    const sky = r.sky;
    const tgtE = (sky ? sky.exposure : 1) * (this._localDark(cam) ? 1.25 : 1);
    this.exposure += (tgtE - this.exposure) * (1 - Math.exp(-dt * 1.5));
    this.flashW = Math.max(0, this.flashW - dt * 0.35);
    this.dmgK = Math.max(0, this.dmgK - dt * 1.2);
    this.suppK = Math.max(0, this.suppK - dt * 0.8);
    this.blurK = Math.max(0, this.blurK - dt * 0.5);
    const gas = p.gas > 0 && p.armor.head !== 'gasmask' ? Math.min(1, p.gas / 4) : 0;
    const flash = Math.max(this.flashW, p.flash > 0 ? Math.min(1, p.flash / 3) : 0);
    const nvg = this.nvgOn && fp;
    const lowHp = p.alive && p.hp < p.maxHp * 0.3 ? 0.35 : 0;
    // 部屋（一人称の光の届き方）
    const room = roomOf(this.w, cam.x, cam.y - 1, cam.z);
    r.render({
      cam, doors: S.doors, lights, dt,
      post: { exposure: this.exposure * (st.bright || 1), nvg, flash, damage: Math.max(this.dmgK * 0.8, lowHp), supp: this.suppK * 0.8, gas, blur: Math.max(this.blurK, gas * 0.5, p.stun > 0 ? 0.4 : 0, flash * 0.6), vig: 0.32 },
      vm: fp ? { fov: 54 * DEG, room } : null, shadows: st.quality !== 'low',
      ambMin: nvg ? 0.02 : 0,
    });
    if (this.intro > 0) { this.intro -= dt; this.app.fade(Math.max(0, this.intro / 1.2)); if (this.intro <= 0) this.app.fade(0); }
  }
  _localDark(cam) {
    const b = this.w._bright; if (!b) return false;
    const i = Math.floor(cam.x / CS), j = Math.floor(cam.z / CS), L = Math.max(0, Math.min(this.w.NL - 1, Math.floor(cam.y / LH)));
    if (i < 0 || j < 0 || i >= this.w.W || j >= this.w.D) return false;
    return b[this.w.idx(L, i, j)] < 0.25;
  }
  // 動く光が届く部屋（今いる部屋＋開いた扉・開口・窓でつながる部屋、2段まで）
  _lightRooms(x, y, z, R) {
    const w = this.w, S = this.S;
    const r0 = roomOf(w, x, y - 1, z);
    const out = [r0];
    const rg = roomGraph(w);
    const seen = new Set([r0]);
    let front = [r0];
    for (let depth = 0; depth < 2; depth++) {
      const nx = [];
      for (const r of front) for (const p of rg.adj[r] || []) {
        const other = p.a === r ? p.b : p.a;
        if (seen.has(other)) continue;
        if (Math.hypot(p.x - x, p.z - z) > R) continue;
        let open = p.type !== 'wall';
        if (p.type === 'door') { const ds = S.doors[p.door]; open = ds && (ds.broken || ds.ang.some(a => Math.abs(a) > 0.15)); }
        if (p.type === 'wall') { const k = p.k; open = false; for (let q = 0; q < 4; q++) if (!w.blocks[k * 4 + q] && w.blocks0[k * 4 + q]) open = true; }
        if (!open) continue;
        seen.add(other); out.push(other); nx.push(other);
      }
      front = nx;
    }
    return out;
  }

  // ---- HUD
  _hud(dt) {
    const S = this.S, p = this.p, hud = this.hud;
    this.ctxT -= dt;
    if (this.ctxT <= 0) { this.ctxT = 0.12; this.ctx = p.alive ? contextOf(S, this.w, p) : null; }
    const c = this.ctx;
    const wi = curWeapon(p);
    const v = {
      p, wi, pvp: S.pvp, yaw: this.cam ? this.cam.yaw : p.yaw, adsOn: this.adsOn, leanL: this.leanSide < 0, leanR: this.leanSide > 0, lowOn: this.lowOn, nvgOn: this.nvgOn, hasNvg: p.armor.head === 'nvg',
      gearSel: this.gearSel, gearId: p.ws.gear, team: this.team,
      spread: wi ? spreadDeg(S, p, WEAPONS[wi.id], wi) : 2,
      optic: null, canVault: true,
      ctxLabel: c ? (OP_NAME[c.def.op] || c.def.op) : '',
      cmdLabel: '命令', mmZoom: this.mmZoom,
      droneOK: S.pvp && S.m.kind === 'bomb' && S.m.phase === 'prep' && p.team === S.m.att,
    };
    if (wi) { const g = gunModel(wi.id, wi.att); if (g && g.pts.optic) v.optic = g.pts.optic; }
    if (this.droneId != null) v.hideCross = true;
    // 案内
    let prompt = '';
    if (c) prompt = `${ctxName(c, S)}: ${OP_NAME[c.def.op] || c.def.op}` + (c.ops.length > 1 ? '（長押しで他の操作）' : '');
    if (p.act) { v.prog = Math.min(1, p.act.t / p.act.dur); v.progLabel = OP_NAME[p.act.k] || ''; prompt = ''; }
    if (this.droneId != null) prompt = 'ドローン: 射撃で敵に印・乗り越えでジャンプ・ドローンのボタンで戻る';
    v.prompt = prompt;
    // 目的
    const ob = this._objectives();
    v.objKey = ob.key; v.objHTML = ob.html;
    // 隊員
    if (!S.pvp) {
      const team = S.actors.filter(a => a.kind === 'swat' && a !== p);
      v.squadKey = team.map(a => `${a.id}${Math.round(a.hp / 10)}${a.down ? 'd' : ''}${a.alive ? '' : 'x'}${a.ai && a.ai.order ? a.ai.order.cmd + (a.ai.order.stage || '') : ''}`).join('|');
      v.squadHTML = team.map(a => `<div class="sq ${a.ai ? a.ai.squad : 'p'}${a.down || !a.alive ? ' dn' : ''}"><i></i><b>${a.name}</b><em style="width:${Math.max(0, a.hp / a.maxHp * 100)}%"></em><small>${a.down || !a.alive ? '行動不能' : a.ai && a.ai.order ? cmdName(a.ai.order.cmd, a.ai.order.stage) : a.ai ? '追従' : ''}</small></div>`).join('');
    }
    // ミニマップの印
    const marks = [];
    for (const a of S.actors) {
      if (a === p || a.isDrone || (!a.alive && !a.dead)) continue;
      const mate = S.pvp ? a.team === p.team : a.kind === 'swat';
      if (mate) { marks.push({ x: a.x, z: a.z, col: a.alive ? (a.down ? '#ffaa33' : '#4aa8ff') : '#666' }); continue; }
      // 見えている・印のついた相手
      const seenRecently = a.spot > 0 && (!S.pvp || a.spotTeam === p.team);
      const vis = this._visCache(a);
      if (seenRecently || vis) marks.push({ x: a.x, z: a.z, col: a.kind === 'civ' ? '#7be07b' : a.cuffed || a.comply ? '#ffd24a' : '#ff4a3a', r: 3 });
    }
    if (S.m && S.m.bombs) for (const b of S.m.bombs) if (!b.done && b.found) marks.push({ x: b.x, z: b.z, col: '#ff9a20', r: 4, sq: true });
    if (S.m && S.m.sites && S.pvp) for (const s2 of S.m.sites) marks.push({ x: s2.x, z: s2.z, col: 'rgba(255,255,255,0.9)', r: 5, sq: true });
    v.marks = marks;
    hud.update(v);
    this._mmT = (this._mmT || 0) - dt;
    if (this._mmT <= 0) { this._mmT = 0.066; hud.drawMinimap(v); }
  }
  _visCache(a) {
    const k = 'v' + a.id;
    this._vc = this._vc || {};
    const c = this._vc[k];
    if (c && this.time - c.t < 0.25) return c.v;
    const e = this.cam;
    const v = !!e && Math.hypot(a.x - e.x, a.z - e.z) < 30 && los(this.w, e.x, e.y, e.z, a.x, a.y + 1.2, a.z, this.S.doors);
    this._vc[k] = { t: this.time, v };
    return v;
  }
  _objectives() {
    const S = this.S, m = S.m || {};
    if (S.pvp) {
      const p = this.p;
      const el = (S.t - m.phaseT) * S.dt;
      if (m.kind === 'tdm') { const left = Math.max(0, m.timeLimit - el); return { key: m.score.join() + Math.floor(left), html: `<div class="sc"><b class="t0">${m.score[p.team]}</b><span>${fmtT(left)}<small>目標 ${m.limit}</small></span><b class="t1">${m.score[1 - p.team]}</b></div>` }; }
      let left = m.phase === 'prep' ? m.prepTime - el : m.phase === 'action' ? m.roundTime - el : 0;
      let sub = m.phase === 'prep' ? '準備' : m.phase === 'pre' ? '開始まで' : m.phase === 'post' ? 'ラウンド終了' : '';
      if (m.defuser && m.defuser.planted && !m.defuser.disabled) { left = 45 - m.defuser.t; sub = '解除装置'; }
      const att = m.kind === 'bomb' ? (p.team === m.att ? '攻撃（SWAT）' : '防衛（立てこもり犯）') : '';
      return { key: m.wins.join() + Math.floor(left) + m.phase + sub, html: `<div class="sc"><b class="t0">${m.wins[p.team]}</b><span>${fmtT(Math.max(0, left))}<small>ラウンド${m.round}${sub ? '・' + sub : ''}${att ? '・' + att : ''}</small></span><b class="t1">${m.wins[1 - p.team]}</b></div>` };
    }
    if (m.kind !== 'pve') return { key: 'train', html: '<div class="ob"><b>訓練</b></div>' };
    const sus = m.sus.map(id => S.byId[id]).filter(Boolean), civ = m.civ.concat(m.hostages).map(id => S.byId[id]).filter(Boolean);
    const sDone = sus.filter(a => !a.alive || a.cuffed).length, cDone = civ.filter(a => !a.alive || a.cuffed).length;
    const lines = [`容疑者 ${sDone}/${sus.length}`, `市民 ${cDone}/${civ.length}`];
    if (m.bombs.length) lines.push(`爆弾 ${m.bombs.filter(b => b.done).length}/${m.bombs.length}・残り ${fmtT(m.bombT)}`);
    if (m.softDone) lines.push('主目的 達成');
    return { key: lines.join('|') + (m.bombs.length ? Math.floor(m.bombT) : ''), html: `<div class="ob"><b>${MISSIONS[m.mission].name}</b><span>${lines.join('　')}</span></div>` };
  }
  result() {
    const S = this.S, m = S.m, p = this.p;
    if (S.pvp) {
      const rows = S.actors.filter(a => !a.isDrone).map(a => ({ name: a.name, team: a.team, k: a.stats.k, d: a.stats.d, a: a.stats.a, me: a === p, bot: a.pid == null, pid: a.pid }));
      rows.sort((x, y) => y.k * 2 + y.a - (x.k * 2 + x.a));
      return { pvp: true, mode: m.kind, win: m.winner, myTeam: p.team, score: m.kind === 'tdm' ? m.score : m.wins, rows, map: S.map, time: (S.t - (m.startT || 0)) * S.dt };
    }
    const sc = m.score || {};
    return { pvp: false, mission: m.mission, res: m.result, why: m.why, score: sc, map: S.map, diff: m.diff, me: { k: p.stats.k, sh: p.stats.sh, hi: p.stats.hi, arrest: p.stats.arrest, rescue: p.stats.rescue } };
  }
  // 撤収（本部に戻る）
  abort() { step(this.G, { [this.p.id]: { act: [{ a: 'abortMission' }] } }); const m = this.S.m; if (m && m.kind === 'pve' && m.phase === 'play') { import_end(this.S); } }
  saveState() { if (this.done) return null; try { return { dump: dump(this.G), cam: { yaw: this.yaw, pitch: this.pitch }, o: this.o }; } catch (e) { return null; } }
}
import { endMission } from '../engine/modes/pve.js';
import { netMixin } from './netgame.js';
netMixin(Match);
function import_end(S) { endMission(S, S.m.softDone ? 'done' : 'abort', 'player', []); }

function fmtT(s) { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function nm(a) { return a ? (a.pid != null ? a.name : a.kind === 'sus' ? '容疑者' : a.kind === 'civ' ? '市民' : a.name) : '?'; }
function feedKill(k, v, e, p) {
  const kn = k ? nm(k) : '?', vn = nm(v);
  const wpn = k && curWeapon(k) ? WEAPONS[curWeapon(k).id].name : e.kind === 'bleed' ? '出血' : e.kind === 'blast' ? '爆発' : '';
  return `<b class="${k && k.team === p.team ? 'ally' : 'enemy'}">${kn}</b> <i>${wpn}${e.hs ? '・頭' : ''}</i> <b class="${v.team === p.team ? 'ally' : 'enemy'}">${vn}</b>`;
}
function ctxName(c, S) { return c.k === 'door' ? '扉' : c.k === 'person' ? (S.byId[c.id] ? (S.byId[c.id].kind === 'sus' ? '容疑者' : S.byId[c.id].kind === 'civ' ? '市民' : '隊員') : '人') : c.k === 'item' ? '物' : c.k === 'bomb' ? '爆弾' : c.k === 'site' ? '爆弾の場所' : c.k === 'wall' ? '壁' : ''; }
export function cmdName(c, stage) {
  return ({ move: '移動', hold: '待機', cover: '援護', fallin: '集合', stack: 'スタック', breach: stage === 'clear' ? '確保' : stage === 'enter' ? '突入中' : stage === 'nade' ? '投げ物' : stage === 'open' ? '開ける' : '突入', mirror: 'ミラー', wedge: 'ウェッジ', unwedge: 'ウェッジを外す', disarm: '罠の解除', pick: 'ピッキング', restrain: '拘束', deploy: '投入', search: '捜索して確保' })[c] || c;
}
function whyName(w) { return ({ elim: '全滅', time: '時間切れ', defuse: '解除装置が作動', disable: '解除装置を外した' })[w] || ''; }
function mirrorHTML(e, S) {
  if (!e.seen.length && !e.trap) return '<b>ミラー</b>扉の向こうに人は見えない' + (e.locked ? '・鍵がかかっている' : '');
  const k = (s) => s.kind === 'sus' ? (s.armed ? '武装した容疑者' : '容疑者') : s.kind === 'civ' ? '市民' : '隊員';
  return '<b>ミラー</b>' + e.seen.map(s => `${k(s)}（${s.dist}m）`).join('・') + (e.trap ? '<br><span class="bad">扉に罠！</span>' : '') + (e.locked ? '<br>鍵がかかっている' : '');
}
function impSound(m) { return m === M.METAL || m === M.METALFURN || m === M.CAR || m === M.DOORMETAL ? 'impMetal' : m === M.WOOD || m === M.DOORWOOD || m === M.FURN ? 'impWood' : m === M.GLASS ? 'impGlass' : 'impHard'; }
