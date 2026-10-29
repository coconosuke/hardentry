// 横向きのゲーム画面（ステージ）。縦持ちのときは90度回して表示し、座標を直す。
// 安全領域: 横向きのiPhoneはアイランドのない側にも同じ余白が来るので、反対側は16pxまで詰める（角の段は32px）。
export class Stage {
  constructor(el) {
    this.el = el;
    this.rotated = false;
    this.w = 0; this.h = 0;
    this.safe = { l: 0, r: 0, t: 0, b: 0 };
    this.probe = document.createElement('div');
    this.probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left)';
    document.body.appendChild(this.probe);
    this.listeners = [];
    const upd = () => this.layout();
    window.addEventListener('resize', upd);
    window.addEventListener('orientationchange', () => { upd(); setTimeout(upd, 300); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', upd);
    this.layout();
  }
  onLayout(fn) { this.listeners.push(fn); }
  deviceInsets() {
    // テストでは端末の安全領域を差し替えられる
    if (globalThis.__testInsets) { const t = globalThis.__testInsets; return { t: t.t || 0, r: t.r || 0, b: t.b || 0, l: t.l || 0 }; }
    const cs = getComputedStyle(this.probe);
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }
  viewport() {
    // ホーム画面のアプリで、ステータスバーの分だけ高さが足りないとき（WebKit bug 301108）
    let W = window.innerWidth, H = window.innerHeight;
    const standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    if (standalone && screen && screen.height && screen.width) {
      const portrait = H >= W;
      const sh = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
      const ins = this.deviceInsets();
      const missing = sh - H;
      if (missing > 0 && Math.abs(missing - ins.t) < 2) H = sh;
    }
    return { W, H };
  }
  layout() {
    const { W, H } = this.viewport();
    const portrait = H > W;
    this.rotated = portrait;
    const ins = this.deviceInsets();
    let s;
    if (portrait) {
      // 回した後: 端末の上→ステージの左、端末の下→ステージの右
      s = { l: ins.t, r: ins.b, t: ins.r, b: ins.l };
      this.w = H; this.h = W;
      this.el.style.width = H + 'px'; this.el.style.height = W + 'px';
      this.el.style.transform = `translate(${W}px, 0px) rotate(90deg)`;
      s.l = Math.max(s.l, 16); s.r = Math.max(Math.min(s.r, 24), 12);
    } else {
      s = { l: ins.l, r: ins.r, t: ins.t, b: ins.b };
      this.w = W; this.h = H;
      this.el.style.width = W + 'px'; this.el.style.height = H + 'px';
      this.el.style.transform = 'none';
      // アイランドのない側は詰める（window.orientation: 90=アイランドは左、-90=右）
      const o = typeof window.orientation === 'number' ? window.orientation : null;
      if (s.l > 0 && s.r > 0 && Math.abs(s.l - s.r) < 2) {
        if (o === 90) s.r = 16; else if (o === -90) s.l = 16;
      }
    }
    this.safe = s;
    const st = this.el.style;
    st.setProperty('--sw', this.w + 'px'); st.setProperty('--sh', this.h + 'px');
    st.setProperty('--sl', s.l + 'px'); st.setProperty('--sr', s.r + 'px'); st.setProperty('--st', s.t + 'px'); st.setProperty('--sb', s.b + 'px');
    // 角の丸みにかかる上下の段は32px以上
    st.setProperty('--sl2', Math.max(s.l, 32) + 'px'); st.setProperty('--sr2', Math.max(s.r, 32) + 'px');
    const size = this.h < 360 ? 's' : this.h < 460 ? 'm' : 'l';
    this.el.dataset.size = size;
    this.el.dataset.wide = this.w / this.h > 1.9 ? '1' : '0';
    for (const fn of this.listeners) fn(this);
  }
  // 画面の座標 → ステージの座標
  toStage(cx, cy) {
    if (!this.rotated) return [cx, cy];
    return [cy, this.viewport().W - cx];
  }
}
