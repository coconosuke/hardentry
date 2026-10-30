// アプリ全体: 起動・画面の切り替え・試合の開始と終了・保存・画面の作り直し（WebGLが落ちたとき）
import { Stage } from '../ui/stage.js';
import { Input, tapHooks } from '../ui/input.js';
import { Hud } from '../ui/hud.js';
import { Screens } from '../ui/screens.js';
import { AudioSys } from '../audio/audio.js';
import { Renderer, QUALITY } from '../render/renderer.js';
import { loadSettings, saveSettings, loadProfile, saveProfile, loadLoadouts, saveLoadouts } from './settings.js';
import { load, save, remove, purgeOld, exportCode, importCode, parseCode, loadRun } from './save.js';
import { getAsset } from './assets.js';
import { Match } from './game.js';
import { TitleScene } from './scenes.js';
import { COMPAT, VERSION } from '../engine/data/version.js';
import { MAPS } from '../engine/maps/index.js';
import { MISSIONS } from '../engine/data/missions.js';
import { MODE_INFO } from '../engine/modes/index.js';
import { netMixin } from './netapp.js';

const $ = (s) => document.querySelector(s);
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
const QORDER = ['low', 'medium', 'high'];
// 遊んでいる間に描くのが遅れたら（端末が熱くなると遅れる）、解像度を段階的に下げる。遅れがなくなれば少しずつ戻す
const DYN = [1, 0.86, 0.74, 0.64, 0.56];

class App {
  constructor() {
    this.game = null; this.mode = 'boot'; this.paused = false;
    this.last = performance.now(); this.fpsT = 0; this.fpsN = 0;
    this.lossTimes = []; this.ctxLost = false; this.hidden = false;
    this.wake = null; this.net = null;
    this.dyn = { i: 0, ema: 0, slowT: 0, fastT: 0, cool: 0, cap: 0 };
    this.lastPve = null; this.lastPvp = null;
  }
  _dynStep(raw) {
    const D = this.dyn;
    if (this.settings.autoRes === false) { D.i = 0; D.cap = 0; return; }
    const target = 1 / this.fpsCap();
    D.ema = D.ema ? D.ema + (raw - D.ema) * 0.08 : raw;
    D.cool -= raw;
    D.slowT = D.ema > target * 1.22 ? D.slowT + raw : 0;
    D.fastT = D.ema < target * 1.06 ? D.fastT + raw : 0;
    if (D.cool > 0) return;
    if (D.slowT > 2 && D.i < DYN.length - 1) { D.i++; D.cool = 3; D.slowT = 0; D.ema = 0; this._resize(); }
    else if (D.slowT > 4 && D.i === DYN.length - 1 && !D.cap && this.settings.fps > 30) { D.cap = 30; D.cool = 4; D.slowT = 0; D.ema = 0; }
    else if (D.fastT > 8 && D.i > 0 && !D.cap) { D.i--; D.cool = 5; D.fastT = 0; this._resize(); }
  }
  renderScale() { return (this.settings.scale || 1) * DYN[this.dyn.i]; }
  fpsCap() { return this.dyn.cap ? Math.min(this.dyn.cap, this.settings.fps) : this.settings.fps; }
  _dynReset() { this.dyn = { i: 0, ema: 0, slowT: 0, fastT: 0, cool: 1, cap: 0 }; }
  _resize() {
    if (!this.renderer || !this.stage.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3) * this.renderScale();
    this.renderer.resize(this.stage.w, this.stage.h, dpr);
  }

  async boot(hot) {
    purgeOld();
    this.stageEl = $('#stage'); this.canvas = $('#gl');
    this.stage = new Stage(this.stageEl);
    this.settings = loadSettings(); this.profile = loadProfile(); this.loadouts = loadLoadouts();
    this.audio = new AudioSys();
    this.audio.setSession(this.settings.playSilent);
    tapHooks.push(() => this.audio.unlock());
    this.screens = new Screens(this, $('#screens'));
    this.hud = new Hud(this.stage, $('#hud'));
    this.hud.setSettings(this.settings);
    this.input = new Input(this.stage, this.stageEl, this.audio);
    this.input.setSettings(this.settings);
    this.input.onStick = (st, dx, dy, spr) => this.hud.stick(st, dx, dy, spr);
    this.input.onRadial = (r) => this.hud.radial(r);
    this.input.getStickHome = () => this.hud.stickHome;
    this.fpsEl = $('#fps'); this.fadeEl = $('#fade'); this.ctxEl = $('.ctxlost');
    this.stage.onLayout(() => { this._resize(); if (this.game && (this.mode === 'pause' || this.mode === 'result')) this.game.redraw(); });
    this.screens.loading('準備しています…', 0.05);
    await nextFrame();
    try {
      this.renderer = new Renderer(this.canvas, { quality: this.settings.quality });
    } catch (e) {
      this.screens.error('この端末では3Dの画面を出せません。WebGL2に対応したブラウザ（iPhoneならiOS 15以降のSafari）で開いてください。', String(e.message || e));
      return;
    }
    this._resize();
    try {
      this.screens.loading('無線を合わせています…', 0.4); await nextFrame();
      try {
        const vidx = JSON.parse(new TextDecoder().decode(await getAsset('voices/index.json')));
        this.audio.loadVoices(vidx, (spk) => getAsset('voices/' + spk + '.m4a'));
      } catch (e) { console.warn('声がない', e && e.message); }
      try {
        const mm = JSON.parse(new TextDecoder().decode(await getAsset('music/music.json')));
        this.audio.loadMusic(mm, (name) => getAsset('music/' + name + '.m4a'));
      } catch (e) { console.warn('BGMがない', e && e.message); }
      this.screens.loading('現場を組み立てています…', 0.7); await nextFrame();
      this.titleScene = new TitleScene(this);
      this.titleScene.prepare();
    } catch (e) {
      console.error(e);
      this.screens.error('読み込みに失敗しました。ページを開き直してください。', String(e.message || e));
      return;
    }
    this.applySettings(false);
    this._events();
    requestAnimationFrame(this.loop);
    const run = hot && hot.run ? hot.run : null;
    if (run) { try { this._openRun(run); return; } catch (e) { console.warn('hot', e); } }
    this.screens.reset('title');
    this.netBoot && this.netBoot();
  }

  _events() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { this.hidden = true; this.autosave(); if (this.game && this.mode === 'game' && !this.game.net) this.pauseGame(); this.audio.suspend(); this._releaseWake(); }
      else { this.hidden = false; this.audio.resume(); this.last = performance.now(); if (this.net || this.mode === 'game') this._requestWake(); }
    });
    window.addEventListener('pagehide', () => this.autosave());
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.ctxLost = true; this.ctxEl.classList.add('on');
      this.lossTimes.push(performance.now());
      if (this.game && this.mode === 'game' && !this.game.net) this.pauseGame();
    });
    this.canvas.addEventListener('webglcontextrestored', () => this._rebuildGL());
    if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
      try { window.claude.hot.snapshot(() => ({ run: this._runState() })); } catch (e) { /* なし */ }
    }
  }
  // 画面が落ちたら作り直す。続けて落ちたら画質を1段下げる
  _rebuildGL() {
    const now = performance.now();
    this.lossTimes = this.lossTimes.filter(t => now - t < 120000);
    if (this.lossTimes.length >= 2) {
      const i = QORDER.indexOf(this.settings.quality);
      if (i > 0) { this.settings.quality = QORDER[i - 1]; saveSettings(this.settings); }
      this.lossTimes = [];
    }
    try {
      this.renderer = new Renderer(this.canvas, { quality: this.settings.quality });
      this._resize();
      if (this.game) this.game.rebind(this.renderer);
      if (this.titleScene) this.titleScene.entered = false;
      this.ctxLost = false; this.ctxEl.classList.remove('on');
      if (this.game) this.game.redraw();
    } catch (e) { console.error(e); }
  }

  loop = (now) => {
    requestAnimationFrame(this.loop);
    if (this.ctxLost || this.hidden || this.freeze) { this.last = now; return; }
    const raw = (now - this.last) / 1000;
    let cap = this.fpsCap();
    if (this.mode === 'title' || this.mode === 'menu') cap = 30;
    if (raw < 1 / cap - 0.003) return;
    this.last = now;
    const dt = Math.min(0.1, raw);
    if (this.mode === 'game' && !this.paused && raw < 0.5) this._dynStep(raw);
    try {
      const netRun = this.game && this.game.net && !this.game.done && (this.mode === 'game' || this.mode === 'pause');
      if (netRun) this.game.frame(dt, { input: this.mode === 'game' });
      else if (this.mode === 'game' && this.game && !this.paused) this.game.frame(dt);
      else if (this.mode === 'title' || this.mode === 'menu') this.titleScene.frame(dt, this.mode === 'menu');
    } catch (e) { console.error(e); this._lastErr = String(e && e.stack || e); }
    if (this.settings.showFps) {
      this.fpsN++; this.fpsT += raw;
      if (this.fpsT > 0.5) { const r = this.renderer.stats; this.fpsEl.textContent = `${Math.round(this.fpsN / this.fpsT)}fps · ${r.draws} · ${(r.tris / 1000).toFixed(0)}k · ${Math.round(DYN[this.dyn.i] * 100)}%${this.dyn.cap ? ' · 上限' + this.dyn.cap : ''}`; this.fpsN = 0; this.fpsT = 0; }
    }
  };

  // ---- 背景
  scene(name) {
    if (name === 'title' || name === 'menu') {
      if (this.game && !this.game.done && this.mode !== 'result') return; // 試合中のメニュー（一時停止の下の画面など）
      if (this.mode !== 'title' && this.mode !== 'menu') { this.titleScene.entered = false; this.audio.playMusic('menu', { fade: 1.5 }); this.audio.ambience(false); }
      this.mode = name;
    } else if (name === 'pause') {
      if (this.game) { this.mode = this.game.done ? 'result' : 'pause'; this.game.redraw(); }
    }
  }
  onScreen() {}

  // ---- 設定
  applySettings(persist = true) {
    const S = this.settings;
    const key = [S.quality, S.scale, S.fps, S.autoRes].join(':');
    if (key !== this._gfxKey) { this._gfxKey = key; this._dynReset(); this.renderer.setQuality(S.quality); this._resize(); }
    this.input.setSettings(S);
    this.hud.setSettings(S);
    this.stageEl.style.setProperty('--cross', S.crossColor || '#fff');
    this.audio.setVolumes(S.vol);
    this.audio.setSession(S.playSilent);
    this.fpsEl.hidden = !S.showFps;
    if (this.game) this.game.applySettings && this.game.applySettings();
    if (persist) saveSettings(S);
    if (this.game && this.mode === 'pause') this.game.redraw();
  }
  saveProfile() { saveProfile(this.profile); }
  saveLoadouts() { saveLoadouts(this.loadouts); }
  confirmMode() { return this.settings.confirm || 'auto'; }
  editHud(onDone) {
    this.screens.hide();
    const prevMode = this.hud.mode;
    this.hud.setMode({ pve: true, pvp: false, drone: false });
    this.hud.show(true);
    this.hud.edit(this.settings, (s) => saveSettings(s), () => { this.hud.show(this.mode === 'game'); this.hud.setMode(prevMode); onDone(); });
  }
  exportCode() { saveSettings(this.settings); saveProfile(this.profile); saveLoadouts(this.loadouts); return exportCode(); }
  checkCode(code) { return !!parseCode(code); }
  importCode(code) {
    if (!importCode(code)) return false;
    this.settings = loadSettings(); this.profile = loadProfile(); this.loadouts = loadLoadouts();
    this.applySettings(false);
    return true;
  }
  records() { return load('records', {}) || {}; }
  clearRecords() { remove('records'); }

  // ---- 遊びかけ（続きから）
  savedRun() {
    const r = loadRun();
    if (!r) return null;
    const o = r.o || {};
    const label = o.mode === 'pve' ? `${MAPS[o.map] ? MAPS[o.map].name : ''} · ${MISSIONS[o.mission] ? MISSIONS[o.mission].name : ''}` : o.mode === 'train' ? '訓練' : (MODE_INFO[o.mode] ? MODE_INFO[o.mode].name : '');
    return { label };
  }
  _runState() {
    const g = this.game;
    if (!g || g.done || g.net) return null;
    const st = g.saveState();
    if (!st) return null;
    return { ...st, at: Date.now() };
  }
  autosave() { const r = this._runState(); if (r) save('run', r); }
  continueRun() {
    const r = loadRun();
    if (!r) { this.screens.reset('title'); return; }
    try { this._openRun(r); } catch (e) { console.warn('続きから', e); remove('run'); this.destroyGame(); this.toTitle(); }
  }
  _openRun(r) {
    this.destroyGame();
    this.game = new Match(this, { ...r.o, dump: r.dump, cam: r.cam });
    if (r.o && r.o.mode === 'pve') this.lastPve = r.o.sel || null;
    this.mode = 'pause'; this.paused = true;
    this.hud.show(false);
    this.game.redraw();
    this.screens.reset('pause');
  }

  // ---- 試合の開始
  _seed() { return (Math.floor(Math.random() * 2 ** 31) ^ Date.now()) >>> 0; }
  async _start(o, label) {
    this.destroyGame();
    remove('run');
    this.screens.loading(label || '現場へ向かっています…', 0.5);
    this.mode = 'loading';
    await nextFrame();
    try { this.game = new Match(this, o); }
    catch (e) { console.error(e); this.screens.error('試合を始められませんでした。', String(e && e.message || e)); return; }
    this._play();
  }
  startPve(sel) {
    if (!sel) return;
    this.lastPve = { ...sel };
    const roster = [{ pid: 0, name: this.profile.name, lo: this.loadouts.player }];
    return this._start({ mode: 'pve', map: sel.map, mission: sel.mission, diff: sel.diff, team: sel.team, entry: sel.entry, roster, aiLoadouts: this.loadouts.ai, seed: this._seed(), sel: { ...sel } }, '現場へ向かっています…');
  }
  startPvp(cfg) {
    if (!cfg) return;
    this.lastPvp = { ...cfg, teams: cfg.teams.slice() };
    const side = cfg.side || 0;
    const teams = side === 0 ? [cfg.teams[0], cfg.teams[1]] : [cfg.teams[1], cfg.teams[0]];
    const L = this.loadouts.pvp || {};
    const lo = { swat: L.swat, sus: L.sus, armor: ((side === 0 ? L.swat : L.sus) || {}).armor || 'medium' };
    const roster = [{ pid: 0, name: this.profile.name, team: side, lo }];
    const rules = { botLevel: cfg.botLevel, wins: cfg.wins, time: (cfg.time || 8) * 60, aimAssist: cfg.aimAssist, ff: cfg.ff };
    return this._start({ mode: cfg.mode, map: cfg.map, teams, roster, rules, seed: this._seed() }, '対戦の準備をしています…');
  }
  startTrain(o) {
    const roster = [{ pid: 0, name: this.profile.name, lo: this.loadouts.player }];
    return this._start({ mode: 'train', map: 'training', start: o.start, house: o.start === 'house', team: o.start === 'house' ? 3 : 1, roster, seed: this._seed() }, '訓練場へ向かっています…');
  }
  _play() {
    this.mode = 'game'; this.paused = false;
    this.screens.hide();
    this.hud.show(true);
    this.input.reset(); this.input.enabled = true;
    this.last = performance.now();
    this._requestWake();
  }
  pauseGame() {
    if (!this.game || this.game.done) return;
    if (this.game.intro > 0) { this.game.intro = 0; this.fade(0); }
    this.paused = !this.game.net; this.mode = 'pause';
    this.input.enabled = false; this.input.reset();
    if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) { /* なし */ } }
    this.hud.show(false);
    this.autosave();
    if (!this.game.net) this._releaseWake();
    this.screens.reset('pause');
  }
  resumeGame() { if (this.game) this._play(); }
  openTablet() { if (!this.game) return; this.pauseGame(); this.screens.open('tablet'); }
  abortMission() {
    if (!this.game) return;
    this.game.abort();
    this.resumeGame();
  }
  endGame(res) {
    // 記録
    const rec = this.records();
    if (!res.pvp && res.mission) {
      const k = res.map + ':' + res.mission + ':' + res.diff;
      const r = rec[k] || { plays: 0, best: null, bestGrade: null };
      r.plays++;
      if (res.score && (r.best == null || res.score.total > r.best)) { r.best = res.score.total; r.bestGrade = res.score.grade; res.newBest = true; }
      rec[k] = r;
    } else if (res.pvp) {
      const k = 'pvp:' + res.mode;
      const r = rec[k] || { plays: 0, wins: 0 };
      r.plays++; if (res.win === res.myTeam) r.wins++;
      rec[k] = r;
    }
    save('records', rec);
    remove('run');
    this.mode = 'result'; this.paused = true;
    this.input.enabled = false; this.input.reset();
    this.hud.show(false);
    this.fade(0);
    this._releaseWake();
    if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) { /* なし */ } }
    this.audio.ambience(false);
    this.screens.reset('result', res);
  }
  quitToTitle() { remove('run'); this.toTitle(); }
  toTitle() {
    if (this.net) { try { this.leaveRoom(true); } catch (e) { /* なし */ } }
    this.destroyGame();
    this.hud.show(false); this.input.enabled = false;
    this.fade(0);
    this.mode = 'none';
    this.screens.reset('title');
  }
  destroyGame() {
    if (this.game) { try { this.game.destroy(); } catch (e) { /* なし */ } this.game = null; }
    this.audio.stopAll();
    if (this.titleScene) this.titleScene.entered = false;
  }

  // ---- 演出
  fade(v, col) { this.fadeEl.style.opacity = v; if (col) this.fadeEl.style.background = col; }
  _requestWake() {
    try { if (navigator.wakeLock && !this.wake) navigator.wakeLock.request('screen').then(l => { this.wake = l; l.addEventListener('release', () => { this.wake = null; }); }).catch(() => {}); } catch (e) { /* なし */ }
  }
  _releaseWake() { try { if (this.wake) this.wake.release(); } catch (e) { /* なし */ } this.wake = null; }
}
netMixin(App);

const app = new App();
globalThis.__app = app;
const start = (data) => app.boot(data || {}).catch(e => { console.error(e); });
const hot = globalThis.claude && globalThis.claude.hot;
if (hot && hot.ready) hot.ready(start); else start(hot && hot.data ? hot.data : {});
