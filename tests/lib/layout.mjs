// 見た目の自動検査（ページの中で動かす）: はみ出し・文字の切れ・重なり・安全領域
export function layoutCheck() {
  const app = window.__app, st = app.stage;
  const W = st.w, H = st.h, S = st.safe;
  const out = [];
  const VW = st.viewport().W;
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    if (!st.rotated) return { x: r.left, y: r.top, w: r.width, h: r.height };
    return { x: r.top, y: VW - r.right, w: r.height, h: r.width };
  };
  const shown = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const c = getComputedStyle(p);
      if (c.display === 'none' || c.visibility === 'hidden') return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  };
  const label = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).join('.') : '';
    const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 18);
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (t ? `「${t}」` : '');
  };
  const roots = [];
  const scr = document.querySelector('.screen.on'); if (scr) roots.push(scr);
  const hud = document.querySelector('#hud.on'); if (hud) roots.push(hud);
  const tm = document.querySelector('.tmodal'); if (tm) roots.push(tm);
  for (const root of roots) {
    const els = [...root.querySelectorAll('*')].filter(shown);
    // 1) 文字の切れ・はみ出し
    for (const el of els) {
      if (el.closest('svg')) continue;
      const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!hasText) continue;
      const cs = getComputedStyle(el);
      const ell = cs.textOverflow === 'ellipsis';
      if (cs.writingMode.startsWith('vertical')) {
        // 縦書き: 行は縦に伸びる。縦方向のはみ出しだけ見る（字の幅のはみ出しは字形の都合なので見ない）
        if (el.scrollHeight > el.clientHeight + 2) out.push({ kind: '縦書きが切れる', el: label(el), by: el.scrollHeight - el.clientHeight });
        continue;
      }
      if (el.scrollWidth > el.clientWidth + 1 && cs.display !== 'inline') out.push({ kind: ell ? '省略(…)' : '文字が横に切れる', el: label(el), by: el.scrollWidth - el.clientWidth });
      if (el.scrollHeight > el.clientHeight + 2 && cs.overflowY !== 'visible' && !el.classList.contains('scroller') && cs.display !== 'inline') out.push({ kind: '文字が縦に切れる', el: label(el), by: el.scrollHeight - el.clientHeight });
    }
    // 2) 画面の外・安全領域の外（押すもの）
    const inter = els.filter(el => el.matches('button, input, textarea, [data-hud], .track'));
    for (const el of inter) {
      if (root === tm) continue; // 文字入力は回した画面の外
      const r = rectOf(el);
      const sc = el.closest('.scroller');
      if (sc) {
        const s = rectOf(sc);
        if (!sc.classList.contains('sx') && (r.x < s.x - 1 || r.x + r.w > s.x + s.w + 1)) out.push({ kind: 'スクロール枠の横にはみ出す', el: label(el) });
        if (sc.classList.contains('sx') && (r.y < s.y - 1 || r.y + r.h > s.y + s.h + 1)) out.push({ kind: '横スクロール枠の縦にはみ出す', el: label(el) });
        continue;
      }
      if (r.x < S.l - 1 || r.y < S.t - 1 || r.x + r.w > W - S.r + 1 || r.y + r.h > H - S.b + 1) {
        out.push({ kind: '安全領域の外', el: label(el), rect: [r.x, r.y, r.w, r.h].map(v => Math.round(v)), safe: [S.l, S.t, W - S.r, H - S.b].map(v => Math.round(v)) });
      }
    }
    // 3) 押すもの同士の重なり
    const rs = inter.filter(el => !el.closest('.scroller')).map(el => ({ el, r: rectOf(el) }));
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ix = Math.min(a.r.x + a.r.w, b.r.x + b.r.w) - Math.max(a.r.x, b.r.x);
      const iy = Math.min(a.r.y + a.r.h, b.r.y + b.r.h) - Math.max(a.r.y, b.r.y);
      if (ix > 2 && iy > 2) out.push({ kind: '重なり', el: label(a.el) + ' × ' + label(b.el), by: Math.round(Math.min(ix, iy)) });
    }
    // 4) 表示（押さないもの）の重なり: HUDの表示とボタン
    if (root === hud) {
      const disp = [...root.querySelectorAll('.bars, .keys, .eye')].filter(shown).map(el => ({ el, r: rectOf(el) }));
      for (const a of disp) for (const b of rs) {
        const ix = Math.min(a.r.x + a.r.w, b.r.x + b.r.w) - Math.max(a.r.x, b.r.x);
        const iy = Math.min(a.r.y + a.r.h, b.r.y + b.r.h) - Math.max(a.r.y, b.r.y);
        if (ix > 2 && iy > 2 && !a.el.contains(b.el)) out.push({ kind: 'HUDの重なり', el: label(a.el) + ' × ' + label(b.el) });
      }
      for (const a of disp) {
        if (a.r.x < S.l - 1 || a.r.y < S.t - 1 || a.r.x + a.r.w > W - S.r + 1 || a.r.y + a.r.h > H - S.b + 1) out.push({ kind: 'HUD表示が安全領域の外', el: label(a.el), rect: [a.r.x, a.r.y, a.r.w, a.r.h].map(v => Math.round(v)) });
      }
    }
  }
  // 6) 読みやすさ: 小さすぎる文字（11px未満）
  // 7) 押しやすさ: 小さすぎるボタン（指で押すものは短い辺が36px未満なら×）
  for (const root of roots) {
    const els = [...root.querySelectorAll('*')].filter(shown);
    for (const el of els) {
      if (el.closest('svg')) continue;
      const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!hasText) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize) || 0;
      // HUDは大きさの設定（--s）で拡大縮小される
      const hs = el.closest('[data-hud]') ? (parseFloat(el.closest('[data-hud]').style.getPropertyValue('--s')) || 1) : 1;
      if (fs * hs < 11) out.push({ kind: '文字が小さい', el: label(el), px: +(fs * hs).toFixed(1) });
    }
    if (root === tm) continue;
    for (const el of els.filter(e => e.matches('button, [role=tab], .chip, .track'))) {
      if (el.closest('.hud-edit-panel') && el.matches('.track')) continue;
      const r = rectOf(el);
      const hs = el.closest('[data-hud]') ? 1 : 1;
      const m = Math.min(r.w, r.h) * hs;
      if (el.matches('.track')) { if (r.h < 28) out.push({ kind: '押しにくい（つまみの高さ）', el: label(el), px: Math.round(r.h) }); continue; }
      if (m < 36) out.push({ kind: '押しにくい（小さい）', el: label(el), px: Math.round(m) });
    }
  }
  // 8) 親に隠されて切れる文字（親が overflow:hidden で、文字がその外にはみ出している）
  for (const root of roots) {
    const els = [...root.querySelectorAll('*')].filter(shown);
    for (const el of els) {
      if (el.closest('svg') || el.closest('.scroller')) continue;
      const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!hasText) continue;
      const r = el.getBoundingClientRect();
      for (let a = el.parentElement; a && a !== root.parentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflow === 'visible' && cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        if (a.classList.contains('scroller') || cs.overflowY === 'auto' || cs.overflowY === 'scroll') break;
        const q = a.getBoundingClientRect();
        const by = Math.max(r.bottom - q.bottom, r.right - q.right, q.top - r.top, q.left - r.left);
        if (by > 1.5) { out.push({ kind: '親に隠れて切れる', el: label(el), by: Math.round(by) }); break; }
      }
    }
  }
  // 5) ページ全体の横スクロール
  if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push({ kind: 'ページが横にスクロールする', by: document.documentElement.scrollWidth - window.innerWidth });
  return { screen: app.screens.cur, hud: !!hud, W, H, rotated: st.rotated, safe: S, problems: out };
}
