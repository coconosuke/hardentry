// 画面の部品: 自前スクロール・スライダー・選択チップ・2段階確認・文字入力（回した画面の外）
import { onTap, onRepeat, tapGuard } from './input.js';

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { esc };

// ステージの中の要素で、指の位置を 0..1 にする（回転していても横方向）
export function localX(stage, el, cx, cy) {
  const [sx] = stage.toStage(cx, cy);
  const r = el.getBoundingClientRect();
  const x0 = stage.rotated ? r.top : r.left, w = stage.rotated ? r.height : r.width;
  return (sx - x0) / (w || 1);
}

// 自前スクロール（回した画面でも指の向きどおりに動く）。慣性あり。
export class Scroller {
  constructor(stage, el) {
    this.stage = stage; this.el = el;
    el.classList.add('scroller');
    let drag = null, v = 0, raf = 0, lastT = 0;
    const stopAnim = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    el.addEventListener('pointerdown', (e) => {
      stopAnim();
      const [, sy] = stage.toStage(e.clientX, e.clientY);
      drag = { id: e.pointerId, y0: sy, top0: el.scrollTop, on: false, ly: sy };
      v = 0; lastT = performance.now();
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const [, sy] = stage.toStage(e.clientX, e.clientY);
      if (!drag.on && Math.abs(sy - drag.y0) > 9) { drag.on = true; tapGuard.drag = true; try { el.setPointerCapture(e.pointerId); } catch (er) { /* なし */ } }
      if (drag.on) {
        const now = performance.now(), dt = Math.max(1, now - lastT);
        v = v * 0.6 + ((drag.ly - sy) / dt) * 0.4;
        lastT = now; drag.ly = sy;
        el.scrollTop = drag.top0 - (sy - drag.y0);
        e.preventDefault();
      }
    });
    const end = (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const was = drag.on; drag = null;
      setTimeout(() => { tapGuard.drag = false; }, 0);
      if (!was) return;
      // 慣性
      let vv = v * 16;
      const step = () => {
        vv *= 0.93;
        el.scrollTop += vv;
        if (Math.abs(vv) > 0.4) raf = requestAnimationFrame(step); else raf = 0;
      };
      if (Math.abs(vv) > 1) raf = requestAnimationFrame(step);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => { el.scrollTop += e.deltaY; e.preventDefault(); }, { passive: false });
  }
}

// スライダー: [−] つまみ [+] 値。長押しで繰り返し。
export function slider(stage, host, o) {
  const { min, max, step } = o;
  let value = o.value;
  host.classList.add('slider');
  host.innerHTML = `<button class="sb dec" aria-label="${esc(o.label || '')}を下げる">−</button><div class="track" role="slider" aria-label="${esc(o.label || '')}" tabindex="0"><div class="fill"></div><div class="knob"></div></div><button class="sb inc" aria-label="${esc(o.label || '')}を上げる">+</button><span class="val"></span>`;
  const track = host.querySelector('.track'), fill = host.querySelector('.fill'), knob = host.querySelector('.knob'), val = host.querySelector('.val');
  const fmt = o.fmt || (v => String(v));
  const set = (v, fire = true) => {
    v = Math.max(min, Math.min(max, Math.round(v / step) * step));
    v = +v.toFixed(4);
    const changed = v !== value;
    value = v;
    const t = (v - min) / (max - min);
    fill.style.width = (t * 100) + '%'; knob.style.left = (t * 100) + '%';
    val.textContent = fmt(v);
    track.setAttribute('aria-valuenow', v);
    if (fire && changed && o.onInput) o.onInput(v);
  };
  set(value, false);
  onRepeat(host.querySelector('.dec'), () => set(value - step));
  onRepeat(host.querySelector('.inc'), () => set(value + step));
  let drag = null;
  track.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    drag = e.pointerId; tapGuard.drag = true;
    try { track.setPointerCapture(e.pointerId); } catch (er) { /* なし */ }
    set(min + localX(stage, track, e.clientX, e.clientY) * (max - min));
  });
  track.addEventListener('pointermove', (e) => { if (drag !== e.pointerId) return; e.stopPropagation(); set(min + localX(stage, track, e.clientX, e.clientY) * (max - min)); });
  const up = (e) => { if (drag !== e.pointerId) return; drag = null; setTimeout(() => { tapGuard.drag = false; }, 0); };
  track.addEventListener('pointerup', up); track.addEventListener('pointercancel', up);
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { set(value - step); e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { set(value + step); e.preventDefault(); }
  });
  return { set: (v) => set(v, false), get: () => value };
}

// 選択チップ（1つだけ選ぶ）。list: [[値, ラベル, 色?]]
export function chips(host, list, value, onChange, opt = {}) {
  host.classList.add('chips');
  if (opt.swatch) host.classList.add('swatches');
  host.innerHTML = list.map(([v, label, col]) => `<button class="chip${opt.swatch ? ' sw' : ''}" data-v="${esc(v)}" aria-label="${esc(label)}" aria-pressed="false">${opt.swatch ? `<i style="background:${esc(col || v)}"></i><span>${esc(label)}</span>` : esc(label)}</button>`).join('');
  const btns = [...host.querySelectorAll('.chip')];
  const mark = (v) => btns.forEach(b => { const on = b.dataset.v === String(v); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  mark(value);
  btns.forEach(b => onTap(b, () => { const raw = list.find(x => String(x[0]) === b.dataset.v)[0]; mark(raw); onChange(raw); }));
  return { set: mark };
}

// やり直せない操作: タッチは2回、マウスは1回（設定で切り替え）
export function confirmTap(btn, getMode, fn, armedLabel) {
  let armT = 0;
  const label = btn.innerHTML;
  const disarm = () => { armT = 0; btn.classList.remove('armed'); btn.innerHTML = label; };
  onTap(btn, (e) => {
    const mode = getMode();
    const one = mode === 'one' || (mode === 'auto' && e && e.pointerType === 'mouse');
    if (one || (armT && performance.now() - armT < 3500)) { disarm(); fn(); return; }
    armT = performance.now();
    btn.classList.add('armed');
    btn.innerHTML = armedLabel || 'もう一度押すと実行';
    setTimeout(() => { if (armT && performance.now() - armT >= 3400) disarm(); }, 3500);
  });
  return disarm;
}

// 文字入力: 回した画面の外に、端末の向きのまま出す
export function textModal(o) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'tmodal';
    wrap.innerHTML = `<div class="tm-panel" role="dialog" aria-modal="true" aria-label="${esc(o.title)}">
      <div class="tm-title">${esc(o.title)}</div>
      ${o.note ? `<p class="tm-note">${esc(o.note)}</p>` : ''}
      ${o.multiline ? `<textarea id="tm-input" rows="4" spellcheck="false" autocomplete="off"></textarea>` : `<input id="tm-input" type="text" autocomplete="off" spellcheck="false" enterkeyhint="done">`}
      <div class="tm-err" aria-live="polite"></div>
      <div class="tm-row"><button class="btn ghost tm-cancel">やめる</button><button class="btn primary tm-ok">${esc(o.ok || '決定')}</button></div>
    </div>`;
    document.body.appendChild(wrap);
    const inp = wrap.querySelector('#tm-input'), err = wrap.querySelector('.tm-err');
    inp.value = o.value || '';
    if (o.maxLength) inp.maxLength = o.maxLength;
    if (o.placeholder) inp.placeholder = o.placeholder;
    if (o.readonly) { inp.readOnly = true; }
    const close = (v) => { wrap.remove(); resolve(v); };
    onTap(wrap.querySelector('.tm-cancel'), () => close(null));
    onTap(wrap.querySelector('.tm-ok'), () => {
      const v = inp.value;
      if (o.validate) { const msg = o.validate(v); if (msg) { err.textContent = msg; return; } }
      close(v);
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !o.multiline) { e.preventDefault(); wrap.querySelector('.tm-ok').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); } if (e.key === 'Escape') close(null); });
    setTimeout(() => { try { inp.focus(); if (o.readonly) inp.select(); } catch (e) { /* なし */ } }, 30);
  });
}

// クリップボードへ（失敗したら選んだ状態の入力欄を出す）
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
}
