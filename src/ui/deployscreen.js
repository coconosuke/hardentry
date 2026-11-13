// 大規模戦の出撃の画面（BattleBit の出撃の画面に合わせる。research/WARBIT.md の 10）
// 上の帯（マップ・モード・人数・点）、地図（範囲・拠点・本陣・分隊の仲間。出撃の場所を押して選ぶ）、左に分隊の欄、
// 下に兵科6つ、左下に LOADOUT（銃を選ぶ）、右下に DEPLOY（数秒待つ。先に押すと時間が来たら出る）。
// ボタンは HUD と同じ data-btn（押した瞬間に game.js へ届く）: dsel（場所）・dcls（兵科）・dlo（装備の板）・dgun・dsec・dgo・pause
import { drawWarMarks, WAR_PX } from './warplan.js';
import { esc } from './widgets.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
// 兵科の印（小さな絵。独自の形）
const CLS_ICON = {
  leader: '<path d="M4 18h16M6 18l-1-9 4 3 3-6 3 6 4-3-1 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  assault: '<path d="M3 13h13l2-2h3v3h-3l-1 1H9l-2 4H5l1-4H3z" fill="currentColor"/>',
  medic: '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" fill="currentColor"/>',
  engineer: '<path d="M14 3l-2 4 2 2 4-2 1 1-3 5-3-1-6 7-3-3 7-6-1-3 5-3z" fill="currentColor"/>',
  support: '<path d="M2 11h14l3-2h3v4h-3l-2 1H8l1 5H6l-1-5H2z M16 9V6h2v3" fill="currentColor"/>',
  recon: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6" stroke="currentColor" stroke-width="2"/>',
};
export const clsIcon = (id) => `<svg viewBox="0 0 24 24" aria-hidden="true">${CLS_ICON[id] || ''}</svg>`;

export class DeployScreen {
  constructor(root) {
    this.root = root; this.cache = {};
    root.innerHTML = '';
    this.top = el('div', 'dps-top'); root.appendChild(this.top);
    this.mapw = el('div', 'dps-mapw'); root.appendChild(this.mapw);
    this.cv = document.createElement('canvas'); this.cv.className = 'dps-cv'; this.mapw.appendChild(this.cv);
    this.pts = el('div', 'dps-pts'); this.mapw.appendChild(this.pts);
    this.sq = el('div', 'dps-sq'); root.appendChild(this.sq);
    this.card = el('div', 'dps-card'); root.appendChild(this.card);
    this.bot = el('div', 'dps-bot'); root.appendChild(this.bot);
  }
  // d: game.js の _warDeployData()
  update(d) {
    const C = this.cache;
    const k1 = d.title + '|' + d.mode + '|' + d.scoreKey;
    if (C.top !== k1) {
      C.top = k1;
      this.top.innerHTML = `<div class="dps-t"><b>${esc(d.title)}</b><span>${esc(d.mode)}</span></div><div class="dps-score">${d.scoreHtml}</div><div class="dps-menu" data-btn="pause" role="button" aria-label="メニュー"><i></i><i></i><i></i></div>`;
    }
    const k2 = d.squad.name + '|' + d.squad.list.map(m => m.name + m.cls + m.st).join(',') + '|' + !!d.noSquad;
    if (C.sq !== k2) {
      C.sq = k2;
      this.sq.style.display = d.noSquad ? 'none' : '';
      this.sq.innerHTML = `<div class="dps-h"><span>SQUAD</span><b>${esc(d.squad.name)}</b><em>${d.squad.list.filter(m => m.st !== 'dead').length}/${d.squad.list.length}</em></div>` +
        d.squad.list.map(m => `<div class="dps-m ${m.st}${m.me ? ' me' : ''}"><i>${clsIcon(m.cls)}</i><span>${esc(m.name)}</span><small>${m.st === 'dead' ? 'KIA' : m.st === 'down' ? 'DOWN' : m.st === 'wait' ? 'READY' : ''}</small></div>`).join('');
    }
    const k3 = d.cls + '|' + d.lo + '|' + d.gun + '|' + d.sec + '|' + d.classes.map(c => c.ok ? 1 : 0).join('');
    if (C.card !== k3) {
      C.card = k3;
      const c = d.classes.find(q => q.id === d.cls) || d.classes[0];
      if (d.lo) {
        this.card.className = 'dps-card dps-lop';
        this.card.innerHTML = `<div class="dps-h"><span>LOADOUT</span><b>${esc(c.en)}</b><div class="dps-x" data-btn="dlo" role="button" aria-label="閉じる">×</div></div>
          <div class="dps-sub">PRIMARY　主の銃</div><div class="dps-g">${d.guns.map(g => `<div class="dps-o${g.id === d.gun ? ' on' : ''}" data-btn="dgun" data-sub="${g.id}" role="button"><b>${esc(g.name)}</b><small>${esc(g.info)}</small></div>`).join('')}</div>
          <div class="dps-sub">SECONDARY　拳銃</div><div class="dps-g">${d.secs.map(g => `<div class="dps-o${g.id === d.sec ? ' on' : ''}" data-btn="dsec" data-sub="${g.id}" role="button"><b>${esc(g.name)}</b><small>${esc(g.info)}</small></div>`).join('')}</div>`;
      } else {
        this.card.className = 'dps-card';
        this.card.innerHTML = `<div class="dps-h"><span>CLASS</span><b>${esc(c.en)}</b><em>${esc(c.name)} · HP ${c.hp}</em></div>
          <p>${esc(c.desc)}</p>
          <div class="dps-kv"><span>主</span><b>${esc(d.gunName)}</b></div><div class="dps-kv"><span>副</span><b>${esc(d.secName)}</b></div>
          <div class="dps-kv"><span>投げ物</span><b>${esc(d.gear)}</b></div><div class="dps-kv soon"><span>道具</span><b>${esc(c.tools)}（準備中）</b></div>`;
      }
    }
    const k4 = d.cls + '|' + d.classes.map(c => c.ok ? 1 : 0).join('') + '|' + d.lo + '|' + Math.ceil(d.left) + '|' + d.queued + '|' + d.canGo + '|' + (d.msg || '');
    if (C.bot !== k4) {
      C.bot = k4;
      const go = d.left > 0 ? (d.queued ? `READY ${Math.ceil(d.left)}` : `DEPLOY ${Math.ceil(d.left)}`) : 'DEPLOY';
      this.bot.innerHTML = `<div class="dps-lo${d.lo ? ' on' : ''}" data-btn="dlo" role="button">LOADOUT</div>
        <div class="dps-cls">${d.classes.map(c => `<div class="dps-c${c.id === d.cls ? ' on' : ''}${c.ok ? '' : ' dis'}" data-btn="dcls" data-sub="${c.id}" role="button" aria-label="${esc(c.name)}">${clsIcon(c.id)}<span>${esc(c.short)}</span></div>`).join('')}</div>
        <div class="dps-go${d.canGo ? '' : ' dis'}${d.queued ? ' queued' : ''}" data-btn="dgo" role="button"><b>${go}</b>${d.msg ? `<small>${esc(d.msg)}</small>` : ''}</div>`;
    }
    this._map(d);
  }
  // 地図: 範囲に合わせて大きさを決め、拠点・本陣・仲間を描く。出撃の場所は押せる印（DOM）
  _map(d) {
    // 大きさは配置の大きさ（画面を回していても同じ）
    const W = Math.max(40, this.mapw.clientWidth), H = Math.max(40, this.mapw.clientHeight);
    const dpr = Math.min(2, devicePixelRatio || 1);
    // 左右の欄にかからない所に範囲を収める（狭すぎるときは全体）
    const sqW = this.sq.offsetWidth ? this.sq.offsetLeft + this.sq.offsetWidth + 6 : 0;
    const cdX = this.card.offsetWidth ? this.card.offsetLeft - 6 : W;
    const [L, Rx] = cdX - sqW > W * 0.4 ? [sqW, cdX] : [0, W];
    const R = d.rect, pad = 18;
    const rw = R[2] - R[0] + pad * 2, rh = R[3] - R[1] + pad * 2;
    const ppm = Math.min((Rx - L) / rw, H / rh);
    const ox = (L + Rx) / 2 - ((R[0] + R[2]) / 2) * ppm, oz = H / 2 - ((R[1] + R[3]) / 2) * ppm;
    const toXY = (x, z) => [ox + x * ppm, oz + z * ppm];
    const key = W + 'x' + H + '|' + L + '|' + Rx + '|' + d.mapKey;
    if (this.cache.map !== key) {
      this.cache.map = key;
      const cv = this.cv;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      const c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = '#0d1012'; c.fillRect(0, 0, W, H);
      c.imageSmoothingEnabled = true;
      c.drawImage(d.img, ox, oz, d.img.width * WAR_PX * ppm, d.img.height * WAR_PX * ppm);
      // 格子（100m）
      c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 1;
      for (let x = Math.ceil(R[0] / 100) * 100; x <= R[2]; x += 100) { const [px] = toXY(x, 0); c.beginPath(); c.moveTo(px, 0); c.lineTo(px, H); c.stroke(); }
      for (let z = Math.ceil(R[1] / 100) * 100; z <= R[3]; z += 100) { const [, pz] = toXY(0, z); c.beginPath(); c.moveTo(0, pz); c.lineTo(W, pz); c.stroke(); }
      drawWarMarks(c, d.m, d.myTeam, toXY, 1.15);
      // 分隊の仲間（緑）・味方（青）・自分の倒れた所（×）
      for (const q of d.dots) {
        const [x, y] = toXY(q.x, q.z);
        if (q.me) { c.strokeStyle = '#ffd34a'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x - 5, y - 5); c.lineTo(x + 5, y + 5); c.moveTo(x + 5, y - 5); c.lineTo(x - 5, y + 5); c.stroke(); continue; }
        c.fillStyle = q.sq ? '#6ee07a' : 'rgba(74,168,255,0.85)';
        c.beginPath(); if (q.sq) c.rect(x - 3.5, y - 3.5, 7, 7); else c.arc(x, y, 2.6, 0, Math.PI * 2); c.fill();
      }
    }
    // 出撃の場所の印（押せる）は、場所と選び方が変わったときだけ作り直す（押している間に消えないように）
    const k2 = W + 'x' + H + '|' + L + '|' + Rx + '|' + d.rect.join(',') + '|' + d.opts.map(o => o.id + (o.id === d.sel ? '*' : '')).join(',');
    if (this.cache.pts !== k2) {
      this.cache.pts = k2;
      this.pts.innerHTML = d.opts.map(o => { const [x, y] = toXY(o.x, o.z); return `<div class="dps-p${o.id === d.sel ? ' on' : ''}${o.hq ? ' hq' : ''}" data-btn="dsel" data-sub="${o.id}" role="button" style="left:${x}px;top:${y}px"><b>${esc(o.label)}</b></div>`; }).join('');
    }
  }
}
