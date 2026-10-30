// 音の土台: 指を離した瞬間に鳴らし始める（iPhone）。BGM・効果音・声・画面の音は別々の音量。
// 立体音響（距離・左右・前後）、壁ごしはこもる、遠い銃声は音速で遅れて届く、屋内と屋外で残響が変わる。
import { SFX, renderSfx, gunKeys } from './synth.js';
import { WEAPONS } from '../engine/data/weapons.js';

const STEP = { hard: 'step_hard', tile: 'step_tile', wood: 'step_wood', soft: 'step_soft', grass: 'step_grass', dirt: 'step_dirt', metal: 'step_metal' };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export class AudioSys {
  constructor() {
    this.ctx = null; this.ok = false; this.buf = {}; this.voiceBuf = {}; this.voiceIdx = null; this.music = {};
    this.vol = { master: 0.9, bgm: 0.5, sfx: 0.9, voice: 1.0, ui: 0.7 };
    this.loops = {}; this.playSilent = false; this.suspended = false; this.genDone = false;
    this.L = { x: 0, y: 0, z: 0, yaw: 0 };
    this.occluder = null; // (x,y,z) → 0..1（1=壁の向こう）
    this.active = new Set(); this.maxActive = 32;
    this.indoor = 1; this.deafT = 0;
    this.pending = [];
    this.musicCur = null;
  }
  setSession(playSilent) {
    this.playSilent = !!playSilent;
    // 消音スイッチに従い、ロック画面に「再生中」を出さない（ambient）。消音でも鳴らすときだけ playback
    try { if (navigator.audioSession) navigator.audioSession.type = this.playSilent ? 'playback' : 'ambient'; } catch (e) { /* 無い端末 */ }
  }
  // 指を離した瞬間（pointerup / touchend / click / keydown）に呼ぶ
  unlock() {
    try {
      if (!this.ctx) {
        this.setSession(this.playSilent);
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this._graph();
      }
      if (this.ctx.state !== 'running' && !this.suspended) this.ctx.resume();
      const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start();
      this.ok = true;
      if (!this.genDone) this._generate();
      const p = this.pending; this.pending = [];
      for (const f of p) { try { f(); } catch (e) { console.warn(e); } }
    } catch (e) { console.warn('audio unlock', e); }
  }
  get running() { return !!(this.ctx && this.ctx.state === 'running'); }
  _graph() {
    const c = this.ctx;
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -10; this.comp.knee.value = 6; this.comp.ratio.value = 5; this.comp.attack.value = 0.002; this.comp.release.value = 0.2;
    // 耳が遠くなる（閃光・爆発）ためのローパス
    this.muf = c.createBiquadFilter(); this.muf.type = 'lowpass'; this.muf.frequency.value = 20000; this.muf.Q.value = 0.5;
    this.master.connect(this.muf); this.muf.connect(this.comp); this.comp.connect(c.destination);
    this.bus = {};
    for (const k of ['bgm', 'sfx', 'voice', 'ui']) { const g = c.createGain(); g.connect(k === 'ui' || k === 'bgm' ? this.comp : this.master); this.bus[k] = g; }
    // 残響: 屋内（短く濃い）と屋外（長く、こだま）
    this.vIn = c.createConvolver(); this.vIn.buffer = this._ir(0.75, 9000, 0);
    this.vOut = c.createConvolver(); this.vOut.buffer = this._ir(2.4, 3500, 1);
    this.gIn = c.createGain(); this.gOut = c.createGain();
    this.vIn.connect(this.gIn); this.vOut.connect(this.gOut); this.gIn.connect(this.master); this.gOut.connect(this.master);
    this.sendIn = c.createGain(); this.sendOut = c.createGain();
    this.sendIn.connect(this.vIn); this.sendOut.connect(this.vOut);
    this.setEnv(this.indoor);
    this.applyVolumes();
  }
  _ir(dur, bright, echoes) {
    const c = this.ctx, sr = c.sampleRate, n = Math.floor(sr * dur), b = c.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let s = 12345 + ch * 777; let y = 0;
      const a = Math.exp(-2 * Math.PI * bright / sr);
      for (let i = 0; i < n; i++) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const r = s / 0x7fffffff * 2 - 1;
        const t = i / n;
        y = r * (1 - a) + y * a;
        d[i] = y * Math.pow(1 - t, echoes ? 2.2 : 3.4) * (i < sr * 0.004 ? 0 : 1);
      }
      if (echoes) for (const [t, g] of [[0.11, 0.5], [0.23, 0.35], [0.41, 0.25], [0.66, 0.15]]) { const k = Math.floor((t + ch * 0.013) * sr); for (let j = 0; j < 400 && k + j < n; j++) d[k + j] += (Math.random() * 2 - 1) * g * Math.exp(-j / 80); }
    }
    return b;
  }
  // 屋内らしさ 0..1（聞いている人の場所で変える）
  setEnv(indoor) {
    this.indoor = indoor;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.gIn.gain.setTargetAtTime(0.55 * indoor, t, 0.3);
    this.gOut.gain.setTargetAtTime(0.42 * (1 - indoor) + 0.06, t, 0.3);
  }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    for (const k of ['bgm', 'sfx', 'voice', 'ui']) this.bus[k].gain.setTargetAtTime(this.vol[k] * (k === 'ui' || k === 'bgm' ? this.vol.master : 1), t, 0.05);
  }
  setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); }
  _generate() {
    const sr = Math.min(48000, this.ctx.sampleRate);
    const names = Object.keys(SFX);
    // よく使う音から先に（銃・足音・画面）
    names.sort((a, b) => pri(a) - pri(b));
    let k = 0;
    const step = () => {
      const t0 = performance.now();
      while (k < names.length && performance.now() - t0 < 10) {
        const nm = names[k++];
        const [, count] = SFX[nm];
        this.buf[nm] = [];
        for (let i = 0; i < count; i++) {
          const data = renderSfx(nm, i, sr);
          const b = this.ctx.createBuffer(1, data.length, sr);
          b.copyToChannel(data, 0);
          this.buf[nm].push(b);
        }
      }
      if (k < names.length) setTimeout(step, 0); else { this.genDone = true; if (this.onReady) this.onReady(); }
    };
    this.genDone = 'busy';
    step();
  }
  // ---- 声（話す人ごとに1つにまとめたm4a＋目次）
  loadVoices(index, get) {
    if (!this.ctx) { this.pending.push(() => this.loadVoices(index, get)); return; }
    this.voiceIdx = index;
    for (const spk of Object.keys(index.spk || {})) {
      (async () => {
        try { const ab = await get(spk); this.voiceBuf[spk] = await this.ctx.decodeAudioData(ab); }
        catch (e) { console.warn('voice', spk, e); }
      })();
    }
  }
  // BGM（m4a）。前後に「のりしろ」があるので、その内側をくり返す
  loadMusic(meta, get) {
    if (!this.ctx) { this.pending.push(() => this.loadMusic(meta, get)); return; }
    for (const [name, m] of Object.entries(meta)) {
      (async () => {
        try { const ab = await get(name); const b = await this.ctx.decodeAudioData(ab); this.music[name] = { buffer: b, start: m.pad, end: m.pad + m.len }; if (this.musicWant === name) this.playMusic(name, { fade: 1.5 }); }
        catch (e) { console.warn('music', name, e); }
      })();
    }
  }
  // 聞いている人（カメラ）
  listen(x, y, z, yaw, pitch) {
    this.L = { x, y, z, yaw };
    if (!this.ctx) return;
    const L = this.ctx.listener, t = this.ctx.currentTime;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    if (L.positionX) {
      L.positionX.setTargetAtTime(x, t, 0.015); L.positionY.setTargetAtTime(y, t, 0.015); L.positionZ.setTargetAtTime(z, t, 0.015);
      L.forwardX.setTargetAtTime(fx, t, 0.015); L.forwardY.setTargetAtTime(0, t, 0.015); L.forwardZ.setTargetAtTime(fz, t, 0.015);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else if (L.setPosition) { L.setPosition(x, y, z); L.setOrientation(fx, 0, fz, 0, 1, 0); }
    if (this.deafT > 0) this.deafT -= 1 / 60;
  }
  // 鳴らす。o: { pos, vol, rate, vary, bus, verb, lowpass, delay, ref, roll, loop, buffer, offset, dur, radio, hrtf }
  play(name, o = {}) {
    if (!this.ok || !this.ctx || this.ctx.state !== 'running') return null;
    const list = o.buffer ? [o.buffer] : this.buf[name];
    if (!list || !list.length) return null;
    const b = list[o.i != null ? o.i % list.length : Math.floor(Math.random() * list.length)];
    const c = this.ctx;
    if (!o.loop && this.active.size >= this.maxActive) {
      // いちばん小さい（古い）音を止める
      const old = this.active.values().next().value;
      if (old) { this.active.delete(old); try { old.g.gain.setTargetAtTime(0, c.currentTime, 0.02); old.src.stop(c.currentTime + 0.08); } catch (e) { /* 止まっている */ } }
    }
    const src = c.createBufferSource();
    const nodes = [src];
    src.buffer = b;
    src.playbackRate.value = (o.rate || 1) * (o.vary ? 1 + (Math.random() - 0.5) * o.vary : 1);
    src.loop = !!o.loop;
    if (o.loop && o.loopStart != null) { src.loopStart = o.loopStart; src.loopEnd = o.loopEnd; }
    const g = c.createGain(); g.gain.value = o.vol ?? 1; nodes.push(g);
    let node = src;
    // 壁ごし（こもる）・遠い（高い音が減る）
    let occ = 0;
    if (o.pos && this.occluder) { try { occ = this.occluder(o.pos[0], o.pos[1], o.pos[2]) || 0; } catch (e) { occ = 0; } }
    const lpF = Math.min(o.lowpass || 20000, occ > 0 ? 700 + 9000 * (1 - occ) * (1 - occ) : 20000);
    if (lpF < 18000) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpF; f.Q.value = 0.5; node.connect(f); node = f; nodes.push(f); g.gain.value *= 1 - 0.45 * occ; }
    if (o.radio) {
      // 無線: 帯域を狭くして少し歪ませる
      const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = 420;
      const l = c.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = 2900;
      const ws = c.createWaveShaper(); ws.curve = this._radioCurve || (this._radioCurve = makeCurve(2.4)); ws.oversample = 'none';
      node.connect(h); h.connect(l); l.connect(ws); node = ws; nodes.push(h, l, ws);
    }
    node.connect(g);
    let out = g;
    if (o.pos) {
      const p = c.createPanner();
      p.panningModel = o.hrtf ? 'HRTF' : 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = o.ref || 2; p.maxDistance = 400; p.rolloffFactor = o.roll ?? 1.0;
      if (p.positionX) { p.positionX.value = o.pos[0]; p.positionY.value = o.pos[1]; p.positionZ.value = o.pos[2]; } else p.setPosition(o.pos[0], o.pos[1], o.pos[2]);
      g.connect(p); out = p; nodes.push(p);
    }
    out.connect(this.bus[o.bus || 'sfx']);
    const vb = o.verb ?? (o.bus === 'ui' ? 0 : 0.5);
    if (vb > 0) {
      const sI = c.createGain(); sI.gain.value = vb; out.connect(sI); sI.connect(this.sendIn); nodes.push(sI);
      const sO = c.createGain(); sO.gain.value = vb; out.connect(sO); sO.connect(this.sendOut); nodes.push(sO);
    }
    const h = { src, g };
    src.onended = () => { this.active.delete(h); setTimeout(() => { for (const n of nodes) { try { n.disconnect(); } catch (e) { /* 外れている */ } } }, 80); };
    if (!o.loop) this.active.add(h);
    const at = c.currentTime + (o.delay || 0);
    if (o.offset != null) src.start(at, o.offset, o.dur); else src.start(at);
    return { src, gain: g, stop: (t = 0.1) => { try { g.gain.setTargetAtTime(0, c.currentTime, t); src.stop(c.currentTime + t * 4); } catch (e) { /* 止まっている */ } } };
  }
  _dist(pos) { const L = this.L; return pos ? Math.hypot(pos[0] - L.x, pos[1] - L.y, pos[2] - L.z) : 0; }
  // 効果音（位置があれば立体音響）
  sfx(name, pos, o = {}) {
    if (name === 'ui_back') return this.ui('back');
    const d = this._dist(pos);
    if (pos && d > (o.maxD || 70)) return null;
    return this.play(name, { pos, vol: o.vol ?? 1, rate: o.rate, vary: o.vary ?? 0.06, verb: o.verb ?? 0.5, hrtf: pos && d < 12, delay: pos ? d / 343 : 0, ref: o.ref || 2.2 });
  }
  ui(name) { return this.play('ui_' + name, { bus: 'ui', verb: 0, vol: 0.9 }); }
  // 銃声: 近い音と遠い音を距離で混ぜる。自分の銃は耳元
  gun(wid, pos, o = {}) {
    const W = WEAPONS[wid]; if (!W) return;
    const K = gunKeys(W.snd);
    if (o.local || !pos) {
      this.play(o.supp ? K.supp : K.near, { vol: o.supp ? 0.7 : 1.0, vary: 0.05, verb: o.supp ? 0.35 : 0.9 });
      return;
    }
    const d = this._dist(pos);
    const loud = o.supp ? 0.35 : 1;
    const delay = d / 343;
    const nearK = o.supp ? K.supp : K.near;
    const k = clamp((d - 18) / 40, 0, 1); // 0=近い、1=遠い
    if (k < 1) this.play(nearK, { pos, vol: (1 - k) * loud * 1.1, vary: 0.06, verb: 0.8, delay, ref: 4, roll: 0.9, hrtf: d < 15 });
    if (k > 0 && !o.supp) this.play(K.far, { pos, vol: k * 1.2, vary: 0.05, verb: 0.9, delay, ref: 6, roll: 0.6 });
  }
  step(f, pos, loud = 1) {
    const nm = STEP[f] || 'step_hard';
    if (!pos) { this.play(nm, { vol: 0.32 * loud, vary: 0.12, verb: 0.15 }); return; }
    const d = this._dist(pos);
    if (d > 32) return;
    this.play(nm, { pos, vol: 0.9 * loud, vary: 0.12, verb: 0.35, hrtf: d < 14, ref: 1.6, roll: 1.25 });
  }
  // 声: line の idx 番目を、話す人 spk の声で
  voice(line, idx, spk, pos, o = {}) {
    const I = this.voiceIdx; if (!I) return null;
    const S = I.spk[spk] ? spk : (I.alias && I.alias[spk]) || null;
    if (!S || !this.voiceBuf[S]) return null;
    const clip = (I.clips[S] || {})[line + '.' + idx] || (I.clips[S] || {})[line + '.0'];
    if (!clip) return null;
    if (o.radio) { this.play('radioOn', { bus: 'voice', verb: 0, vol: 0.5 }); this.play('radioOff', { bus: 'voice', verb: 0, vol: 0.5, delay: clip[1] + 0.05 }); }
    const d = this._dist(pos);
    return this.play(null, { buffer: this.voiceBuf[S], offset: clip[0], dur: clip[1], pos: o.radio ? null : pos, bus: 'voice', vol: (o.vol ?? 1) * (o.radio ? 0.85 : 1), verb: o.radio ? 0 : 0.45, radio: !!o.radio, hrtf: pos && d < 15, ref: 3, roll: 0.9, delay: pos && !o.radio ? d / 343 : 0 });
  }
  // 閃光や爆発で耳が遠くなる（sec 秒で戻る）＋耳鳴り
  deafen(sec) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    this.muf.frequency.cancelScheduledValues(t);
    this.muf.frequency.setValueAtTime(350, t);
    this.muf.frequency.setTargetAtTime(20000, t + Math.min(1.5, sec * 0.3), sec / 2.5);
    this.deafT = sec;
    if (sec > 1.2) this.play('ring', { bus: 'ui', verb: 0, vol: Math.min(0.5, sec / 10) });
  }
  // 環境音（屋外・屋内）と BGM
  ambience(on, indoor = 1) {
    if (!on) { this.loop('amb_out', false); this.loop('amb_in', false); return; }
    this.loop('amb_out', true, { vol: 0.32 * (1 - indoor) + 0.04, fadeIn: 2 });
    this.loop('amb_in', true, { vol: 0.16 * indoor, fadeIn: 2 });
    this.loopVol('amb_out', 0.32 * (1 - indoor) + 0.04, 0.5); this.loopVol('amb_in', 0.16 * indoor, 0.5);
  }
  playMusic(name, o = {}) {
    this.musicWant = name;
    if (!this.ctx) return;
    if (this.musicCur && this.musicCur.name === name) return;
    if (this.musicCur) { this.musicCur.h.stop(o.fade ?? 1.2); this.musicCur = null; }
    const m = this.music[name]; if (!m) return;
    const h = this.play(null, { buffer: m.buffer, loop: true, loopStart: m.start, loopEnd: m.end, offset: m.start, bus: 'bgm', verb: 0, vol: 0 });
    if (!h) return;
    h.gain.gain.setTargetAtTime(o.vol ?? 1, this.ctx.currentTime, (o.fade ?? 1.2) / 3);
    this.musicCur = { name, h };
  }
  musicVol(v, t = 1) { if (this.musicCur && this.ctx) this.musicCur.h.gain.gain.setTargetAtTime(v, this.ctx.currentTime, t / 3); }
  stopMusic(fade = 1.2) { this.musicWant = null; if (this.musicCur) { this.musicCur.h.stop(fade); this.musicCur = null; } }
  loop(name, on, o = {}) {
    const cur = this.loops[name];
    if (on && !cur) {
      const target = o.vol ?? 1;
      const h = this.play(o.sound || name, { ...o, vol: o.fadeIn ? 0 : target, loop: true, verb: o.verb ?? 0 });
      if (h) { this.loops[name] = h; if (o.fadeIn) h.gain.gain.setTargetAtTime(target, this.ctx.currentTime, o.fadeIn / 3); }
      return h;
    }
    if (!on && cur) { cur.stop(o.fade ?? 0.6); delete this.loops[name]; }
    return cur;
  }
  loopVol(name, v, t = 0.3) { const h = this.loops[name]; if (h && this.ctx) h.gain.gain.setTargetAtTime(v, this.ctx.currentTime, t); }
  stopAll() { for (const k of Object.keys(this.loops)) this.loop(k, false, { fade: 0.2 }); if (this.ctx) { this.muf.frequency.cancelScheduledValues(this.ctx.currentTime); this.muf.frequency.setTargetAtTime(20000, this.ctx.currentTime, 0.05); } }
  // 画面が裏に回ったら止める
  suspend() { this.suspended = true; if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { this.suspended = false; if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
}
function pri(n) { return n.startsWith('ui_') ? 0 : n.startsWith('step_') ? 1 : /^(r|p|h)\d|^sg$|^sup_|^far_/.test(n) ? 2 : 3; }
function makeCurve(k) { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); } return c; }
