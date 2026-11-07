// 入力: タッチ（スティック・視点・ボタン、2本指以上の同時操作）、長押し、円形メニュー、ジャイロ、キーボードとマウス
// タップは pointerup で判定し、続く click は捨てる（iPhoneは2本目の指に click が来ない）
let lastTapUp = 0;
export const tapHooks = [];
export const tapGuard = { drag: false };
function runHooks() { for (const f of tapHooks) { try { f(); } catch (e) { /* なし */ } } }
document.addEventListener('click', (e) => { if (e.isTrusted && performance.now() - lastTapUp < 600) { e.stopPropagation(); e.preventDefault(); } }, true);

export function onTap(el, fn, opt = {}) {
  let down = null;
  el.addEventListener('pointerdown', (e) => { down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }; if (opt.press) opt.press(e); });
  el.addEventListener('pointerup', (e) => {
    if (!down || down.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > (opt.slop ?? 18) || tapGuard.drag) return;
    lastTapUp = performance.now();
    e.preventDefault();
    runHooks();
    fn(e);
  });
  el.addEventListener('pointercancel', () => { down = null; });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); runHooks(); fn(e); } });
}
export function onRepeat(el, fn) {
  let timer = null, n = 0;
  const stop = () => { clearTimeout(timer); timer = null; };
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); n = 0; const tick = () => { fn(n++); timer = setTimeout(tick, n < 2 ? 380 : 90); }; stop(); tick(); });
  el.addEventListener('pointerup', stop); el.addEventListener('pointercancel', stop); el.addEventListener('pointerleave', stop);
}

const LONG = 420; // 長押し（ms）
// 出来事の時刻（performance.now と同じ基準）。古いブラウザで 0 や Date 基準なら今の時刻
const evT = (e) => { const t = e && e.timeStamp; const n = performance.now(); return t > 0 && t <= n + 50 && t > n - 60000 ? t : n; };

export class Input {
  constructor(stage, area, audio) {
    this.stage = stage; this.area = area; this.audio = audio;
    this.enabled = false;
    this.S = {}; // 設定
    this.mx = 0; this.mz = 0; this.lookDX = 0; this.lookDY = 0;
    this.ptr = new Map(); // pointerId → {kind: 'stick'|'look'|'btn', btn, x, y, t0, moved, long}
    this.stick = null;
    this.hold = new Set(); // 押している最中のボタン
    this.edges = []; // このこまの出来事: {b, k: 'tap'|'long'|'down'|'up', t}
    this.keys = new Set();
    this.mouseBtn = { l: false, r: false };
    this.touchUsed = false;
    this.toggles = { ads: false, leanL: false, leanR: false, crouch: false, prone: false, low: false };
    this.gyro = { on: false, ok: false, x: 0, y: 0, last: 0 };
    this.onStick = null; this.onRadial = null; this.onBtn = null;
    this.radial = null; // 開いている円形メニュー {btn, x, y, items, sel, pid}
    this.getStickHome = null;
    this._bind();
  }
  setSettings(s) { this.S = s; this._gyroSetup(); }
  reset() {
    this.mx = this.mz = this.lookDX = this.lookDY = 0;
    this.ptr.clear(); this.stick = null; this.hold.clear(); this.edges.length = 0; this.keys.clear();
    this.sprintArm = false; this.sprintLock = false;
    this.mouseBtn = { l: false, r: false };
    this.radial = null; if (this.onRadial) this.onRadial(null);
    if (this.onStick) this.onStick(null);
    for (const el of this.area.querySelectorAll('.down')) el.classList.remove('down');
  }
  _btnOf(e) { let t = e.target; while (t && t !== this.area) { if (t.dataset && t.dataset.btn && !t.classList.contains('hidden')) return t; t = t.parentNode; } return null; }
  _bind() {
    const a = this.area;
    const unlock = () => this.audio && this.audio.unlock();
    a.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'touch') this.touchUsed = true;
      const [sx, sy] = this.stage.toStage(e.clientX, e.clientY);
      try { a.setPointerCapture(e.pointerId); } catch (er) { /* なし */ }
      e.preventDefault();
      // 円形メニューが開いていて、タップで選ぶ方式
      if (this.radial && this.radial.tapMode) { this.ptr.set(e.pointerId, { kind: 'radialTap', x: sx, y: sy }); this._radialMove(sx, sy); return; }
      const el = this._btnOf(e);
      if (el) {
        const b = el.dataset.btn;
        // 時刻は出来事の起きた時（重いこまで処理が遅れても、短く押したのを長押しにしない）
        const p = { kind: 'btn', btn: b, el, x: sx, y: sy, x0: sx, y0: sy, t0: evT(e), tp: performance.now(), moved: 0, long: false };
        this.ptr.set(e.pointerId, p);
        if (this.sprintLock && b !== 'map' && b !== 'pause') { this.sprintLock = false; this.sprintArm = false; if (this.onStick) this.onStick(null); }
        this.hold.add(b); el.classList.add('down');
        this.edges.push({ b, k: 'down', sub: el.dataset.sub || null });
        if (this.onBtn) this.onBtn(b, 'down', p);
        return;
      }
      if (e.pointerType === 'mouse' && !this.touchUsed) {
        if (!document.pointerLockElement && a.requestPointerLock) { try { const r = a.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (er) { /* なし */ } }
        return;
      }
      const home = this.getStickHome ? this.getStickHome() : null;
      const fixed = this.S.stickMode === 'fixed' && home;
      const leftZone = this.S.handed === 'left' ? sx > this.stage.w * 0.55 : sx < this.stage.w * 0.45;
      const onStick = fixed ? Math.hypot(sx - home.x, sy - home.y) < 95 * (home.s || 1) : leftZone;
      if (onStick && !this.stick) {
        this.sprintLock = false;
        this.stick = { id: e.pointerId, ox: fixed ? home.x : sx, oy: fixed ? home.y : sy, x: sx, y: sy, fixed: !!fixed };
        this.ptr.set(e.pointerId, { kind: 'stick' });
        if (this.onStick) this.onStick(this.stick, 0, 0);
        if (fixed) this._stickMove(sx, sy);
      } else {
        this.ptr.set(e.pointerId, { kind: 'look', x: sx, y: sy });
      }
    }, { passive: false });
    a.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      const p = this.ptr.get(e.pointerId);
      if (!p) return;
      const [sx, sy] = this.stage.toStage(e.clientX, e.clientY);
      if (p.kind === 'stick') this._stickMove(sx, sy);
      else if (p.kind === 'look') { this.lookDX += sx - p.x; this.lookDY += sy - p.y; p.x = sx; p.y = sy; }
      else if (p.kind === 'radialTap') this._radialMove(sx, sy);
      else if (p.kind === 'btn') {
        p.moved = Math.max(p.moved, Math.hypot(sx - p.x0, sy - p.y0));
        if (this.radial && this.radial.pid === e.pointerId) { this._radialMove(sx, sy); }
        else if (p.btn === 'fire' || p.btn === 'fireL') { if (this.S.fireLook !== false) { this.lookDX += sx - p.x; this.lookDY += sy - p.y; } }
        p.x = sx; p.y = sy;
      }
    }, { passive: false });
    const up = (e, cancel) => {
      unlock();
      if (!this.enabled) return;
      const p = this.ptr.get(e.pointerId);
      this.ptr.delete(e.pointerId);
      if (!p) return;
      if (p.kind === 'stick') {
        // ダッシュの所で離した: 「ダッシュの固定」がオンなら走り続ける（PUBGM・CODM のように。スティックかボタンに触れるとやめる）
        const lock = !cancel && this.sprintArm && this.S.stickLock === true;
        this.stick = null; this.mx = 0; this.mz = 0; this.sprintArm = lock; this.sprintLock = lock;
        if (this.onStick) this.onStick(null, 0, 0, lock, lock); return;
      }
      if (p.kind === 'radialTap') { if (!cancel) this._radialPick(true); return; }
      if (p.kind !== 'btn') return;
      this.hold.delete(p.btn); p.el.classList.remove('down');
      lastTapUp = performance.now();
      if (this.radial && this.radial.pid === e.pointerId) {
        // 円形メニュー: 離した所を選ぶ（真ん中ならタップで選ぶ方式に切り替え）
        if (cancel) { this.closeRadial(); return; }
        if (this.radial.sel < 0 && !this.radial.tapMode && p.moved < 14) { this.radial.tapMode = true; this.radial.pid = null; if (this.onRadial) this.onRadial(this.radial); return; }
        this._radialPick(false);
        return;
      }
      const dur = evT(e) - p.t0;
      // 押している間に長押しを判定できなかった（こまが遅れ続けた）けれど長く押していた: 離した時に長押しとして扱う
      if (!cancel && !p.long && dur >= LONG && p.moved <= 22) { p.long = true; this.edges.push({ b: p.btn, k: 'long', pid: e.pointerId, x: p.x0, y: p.y0, sub: p.el.dataset.sub || null }); }
      const k = cancel ? 'cancel' : p.long ? 'longup' : (dur < LONG && p.moved < 22 ? 'tap' : 'up');
      this.edges.push({ b: p.btn, k, sub: p.el.dataset.sub || null, dur });
      if (this.onBtn) this.onBtn(p.btn, k, p);
    };
    a.addEventListener('pointerup', (e) => up(e, false));
    a.addEventListener('pointercancel', (e) => up(e, true));
    window.addEventListener('touchend', () => unlock(), { passive: true });
    window.addEventListener('click', () => unlock(), true);
    // キーボード（パソコン）
    window.addEventListener('keydown', (e) => {
      unlock();
      if (!this.enabled) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.code;
      if (this.keys.has(k)) return;
      this.keys.add(k);
      const map = { KeyR: 'reload', KeyC: 'crouch', KeyZ: 'prone', KeyQ: 'leanL', KeyE: 'leanR', KeyF: 'shout', KeyV: 'use', KeyG: 'gear', KeyX: 'fmode', KeyT: 'light', KeyN: 'nvg', KeyB: 'low', KeyM: 'map', Escape: 'pause', KeyP: 'pause', Space: 'vault', Digit1: 'wpn1', Digit2: 'wpn2', Digit3: 'gear', KeyH: 'cmd', Tab: 'team', KeyK: 'drone', KeyY: 'melee' };
      const b = map[k];
      if (b) { e.preventDefault(); this.edges.push({ b, k: 'down', key: true }); this._keyT = this._keyT || {}; this._keyT[k] = performance.now(); }
    });
    window.addEventListener('keyup', (e) => {
      const k = e.code;
      this.keys.delete(k);
      if (!this.enabled) return;
      const map = { KeyR: 'reload', KeyC: 'crouch', KeyZ: 'prone', KeyQ: 'leanL', KeyE: 'leanR', KeyF: 'shout', KeyV: 'use', KeyG: 'gear', KeyX: 'fmode', KeyT: 'light', KeyN: 'nvg', KeyB: 'low', KeyM: 'map', Escape: 'pause', KeyP: 'pause', Space: 'vault', Digit1: 'wpn1', Digit2: 'wpn2', Digit3: 'gear', KeyH: 'cmd', Tab: 'team', KeyK: 'drone', KeyY: 'melee' };
      const b = map[k];
      if (b) { const dur = performance.now() - ((this._keyT && this._keyT[k]) || 0); this.edges.push({ b, k: dur > LONG ? 'longup' : 'tap', key: true, dur }); }
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseBtn = { l: false, r: false }; });
    document.addEventListener('mousemove', (e) => { if (!this.enabled || document.pointerLockElement !== this.area) return; this.lookDX += e.movementX; this.lookDY += e.movementY; });
    a.addEventListener('mousedown', (e) => { if (!this.enabled || !document.pointerLockElement) return; if (e.button === 0) this.mouseBtn.l = true; if (e.button === 2) { this.mouseBtn.r = true; this.edges.push({ b: 'ads', k: 'down', mouse: true }); } });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseBtn.l = false; if (e.button === 2) { this.mouseBtn.r = false; if (this.enabled) this.edges.push({ b: 'ads', k: 'up', mouse: true }); } });
    a.addEventListener('contextmenu', (e) => e.preventDefault());
    a.addEventListener('wheel', (e) => { if (this.enabled && document.pointerLockElement) this.edges.push({ b: e.deltaY > 0 ? 'wpn2' : 'wpn1', k: 'tap' }); }, { passive: true });
  }
  _stickMove(sx, sy) {
    const st = this.stick;
    st.x = sx; st.y = sy;
    const home = this.getStickHome ? this.getStickHome() : null;
    const R = 58 * ((home && home.s) || 1), spr = (home && home.spr) || 1.25;
    let dx = (sx - st.ox) / R, dy = (sy - st.oy) / R;
    const l = Math.hypot(dx, dy);
    // スティックを上へ押し込む（ダッシュの印より上）とダッシュ（CODM・PUBGM）。作戦・対戦とも
    this.sprintArm = this.S.stickSprint !== false && dy < -spr && Math.abs(dx) < 0.8;
    if (l > 1) { dx /= l; dy /= l; }
    // 可変のスティック: 大きく離れたら土台がついてくる（ダッシュの印より外で）
    const follow = Math.max(1.9, spr + 0.45);
    if (!st.fixed && l > follow) { st.ox = sx - dx * R * follow; st.oy = sy - dy * R * follow; }
    const dz = 0.1, ll = Math.min(1, l);
    const k = ll < dz ? 0 : (ll - dz) / (1 - dz) / (ll || 1);
    this.mx = dx * k; this.mz = -dy * k;
    if (this.onStick) this.onStick(st, dx, dy, this.sprintArm);
  }
  // ---- 円形メニュー
  openRadial(btn, items, pid, cx, cy) {
    this.radial = { btn, items, pid, x: cx, y: cy, sel: -1, tapMode: pid == null };
    if (this.onRadial) this.onRadial(this.radial);
  }
  closeRadial() { this.radial = null; if (this.onRadial) this.onRadial(null); }
  _radialMove(sx, sy) {
    const r = this.radial; if (!r) return;
    const dx = sx - r.x, dy = sy - r.y, d = Math.hypot(dx, dy);
    const n = r.items.length;
    if (d < 34 * Math.max(0.8, r.scale || 1)) r.sel = -1;
    else { let a = Math.atan2(dx, -dy); if (a < 0) a += Math.PI * 2; r.sel = Math.floor((a + Math.PI / n) / (Math.PI * 2 / n)) % n; }
    if (this.onRadial) this.onRadial(r);
  }
  _radialPick(tap) {
    const r = this.radial; if (!r) return;
    const item = r.sel >= 0 ? r.items[r.sel] : null;
    this.closeRadial();
    if (item && !item.disabled) this.edges.push({ b: 'radial', k: 'pick', item, from: r.btn });
  }
  // ---- ジャイロ（iPhone は許可が要る: ボタンを押したときに呼ぶ）
  _gyroSetup() {
    const want = this.S.gyro && this.S.gyro !== 'off';
    if (want && !this._gyroBound) {
      this._gyroBound = true;
      window.addEventListener('devicemotion', (e) => {
        const r = e.rotationRate; if (!r) return;
        this.gyro.ok = true;
        const now = performance.now(), dt = this.gyro.last ? Math.min(0.05, (now - this.gyro.last) / 1000) : 0;
        this.gyro.last = now;
        // 横向き: 端末の向きで軸を入れ替える
        const o = typeof window.orientation === 'number' ? window.orientation : (screen.orientation && screen.orientation.angle) || 0;
        let yawRate, pitchRate;
        if (o === 90) { yawRate = r.alpha ?? 0; pitchRate = -(r.beta ?? 0); } // 実際の向きは端末で違うので、設定で反転できる
        else if (o === -90 || o === 270) { yawRate = r.alpha ?? 0; pitchRate = r.beta ?? 0; }
        else { yawRate = r.beta ?? 0; pitchRate = r.alpha ?? 0; }
        this.gyro.x += yawRate * dt; this.gyro.y += pitchRate * dt;
      });
    }
  }
  async requestGyro() {
    try { if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) { const r = await DeviceMotionEvent.requestPermission(); return r === 'granted'; } } catch (e) { return false; }
    return true;
  }
  // 1こま分を取り出す
  take() {
    let mx = this.mx, mz = this.mz;
    if (this.sprintLock) { mx = 0; mz = 1; }
    const K = this.keys;
    if (K.size) {
      const kx = (K.has('KeyD') || K.has('ArrowRight') ? 1 : 0) - (K.has('KeyA') || K.has('ArrowLeft') ? 1 : 0);
      const kz = (K.has('KeyW') || K.has('ArrowUp') ? 1 : 0) - (K.has('KeyS') || K.has('ArrowDown') ? 1 : 0);
      if (kx || kz) { mx = kx; mz = kz; const l = Math.hypot(mx, mz); mx /= l; mz /= l; }
    }
    const out = {
      mx, mz, lookDX: this.lookDX, lookDY: this.lookDY, gyroX: this.gyro.x, gyroY: this.gyro.y,
      fire: this.hold.has('fire') || this.hold.has('fireL') || this.mouseBtn.l,
      sprint: this.sprintArm || this.sprintLock || K.has('ShiftLeft') || this.hold.has('sprint'),
      hold: this.hold, edges: this.edges.slice(),
      mouse: !!document.pointerLockElement, touch: this.touchUsed,
    };
    this.lookDX = 0; this.lookDY = 0; this.gyro.x = 0; this.gyro.y = 0;
    this.edges.length = 0;
    // 長押しの判定（押している最中）。こまが大きく遅れたとき（0.25秒より長い）は次のこまで判定する
    // （遅れている間に指を離した出来事が待っているかもしれない。離していれば短押し）
    const now = performance.now();
    // 1こまだけ待つ（遅いこまが続くときは次のこまで判定する）
    const hitch = this._lastTake != null && now - this._lastTake > 250 && !this._hitchSkip;
    this._hitchSkip = hitch;
    this._lastTake = now;
    for (const [pid, p] of this.ptr) {
      if (p.kind !== 'btn' || p.long || p.moved > 22 || hitch) continue;
      // 長押しは「押したのを受け取ってから」の時間で（受け取りが遅れたぶんで長押しにしない）
      if (now - (p.tp ?? p.t0) >= LONG) { p.long = true; out.edges.push({ b: p.btn, k: 'long', pid, x: p.x0, y: p.y0, sub: p.el.dataset.sub || null }); }
    }
    return out;
  }
}
