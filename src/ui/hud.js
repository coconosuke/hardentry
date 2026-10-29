// HUD（CODモバイル／PUBGモバイル風）: ボタン、ミニマップ、方位、目的、出来事、隊員、体力、弾、字幕、照準、命中、被弾の向き、円形メニュー、HUDの編集
import { BTN, INFO, ICONS } from './hudlayout.js';
import { onTap } from './input.js';
import { C, CS, LH, isWallish } from '../engine/world.js';
import { M } from '../engine/data/materials.js';
import { WEAPONS } from '../engine/data/weapons.js';
import { GEAR } from '../engine/data/equipment.js';
import { ammoCount } from '../engine/actor.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const svg = (id) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[id] || ''}</svg>`;
const TEAMCOL = { gold: '#e8b830', red: '#e5483f', blue: '#3d8cf0' };
const TEAMJA = { gold: '全員', red: '赤', blue: '青' };

export class Hud {
  constructor(stage, root) {
    this.stage = stage; this.root = root;
    this.S = {}; this.on = false; this.mode = { pve: true, pvp: false };
    this.btn = {}; this.info = {};
    this.cache = {};
    this.feedItems = [];
    this.dmgArcs = [];
    this.stickHome = null;
    this._build();
    stage.onLayout(() => this.layout());
  }
  _build() {
    const r = this.root;
    r.innerHTML = '';
    // 情報
    const mm = el('div', 'hud-mm'); const mc = document.createElement('canvas'); mc.width = 240; mc.height = 240; mm.appendChild(mc); mm.appendChild(el('div', 'hud-mm-n', 'N'));
    this.info.minimap = mm; this.mmCanvas = mc; this.mmCtx = mc.getContext('2d');
    this.info.compass = el('div', 'hud-compass', '<div class="hud-compass-in"></div><div class="hud-compass-tick"></div>');
    this.info.obj = el('div', 'hud-obj');
    this.info.feed = el('div', 'hud-feed');
    this.info.squad = el('div', 'hud-squad');
    this.info.vitals = el('div', 'hud-vitals', '<div class="hp"><i></i><b></b></div><div class="plates"></div><div class="st"></div>');
    this.info.ammo = el('div', 'hud-ammo', '<div class="mode"></div><div class="cnt"><b>0</b><span>/0</span></div><div class="mags"></div>');
    for (const [id, e] of Object.entries(this.info)) { e.dataset.info = id; r.appendChild(e); }
    // 中央の物
    this.cross = el('div', 'hud-cross', '<i class="c"></i><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i>'); r.appendChild(this.cross);
    this.reticle = el('div', 'hud-reticle'); r.appendChild(this.reticle);
    this.scope = el('div', 'hud-scope', '<div class="ret"></div>'); r.appendChild(this.scope);
    this.hitm = el('div', 'hud-hit'); r.appendChild(this.hitm);
    this.dmg = el('div', 'hud-dmg'); r.appendChild(this.dmg);
    this.prog = el('div', 'hud-prog', '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" class="bg"/><circle cx="32" cy="32" r="26" class="fg"/></svg><div class="lb"></div>'); r.appendChild(this.prog);
    this.prompt = el('div', 'hud-prompt'); r.appendChild(this.prompt);
    this.subs = el('div', 'hud-subs'); r.appendChild(this.subs);
    this.banner = el('div', 'hud-banner'); r.appendChild(this.banner);
    this.mirror = el('div', 'hud-mirror'); r.appendChild(this.mirror);
    this.stickEl = el('div', 'hud-stick', '<div class="knob"></div><div class="spr">ダッシュ</div>'); r.appendChild(this.stickEl);
    this.radialEl = el('div', 'hud-radial'); r.appendChild(this.radialEl);
    // ボタン
    for (const [id, b] of Object.entries(BTN)) {
      const e = el('div', 'hb' + (b.group ? ' hb-' + b.group : ''), (b.icon && b.icon !== 'wpn' ? svg(b.icon) : '') + '<span class="lb"></span><span class="ct"></span>');
      e.dataset.btn = id;
      e.setAttribute('role', 'button'); e.setAttribute('aria-label', b.name);
      r.appendChild(e);
      this.btn[id] = e;
    }
    this.btn.team.querySelector('.lb').textContent = '全員';
    // 編集の道具
    this.editBar = el('div', 'hud-editbar', `<div class="nm">ボタンを選んでください</div>
      <label>大きさ <input type="range" min="0.6" max="1.8" step="0.05" data-k="s"></label>
      <label>濃さ <input type="range" min="0.15" max="1" step="0.05" data-k="o"></label>
      <button data-a="hide">隠す</button><button data-a="reset1">この1つを戻す</button><button data-a="resetAll">すべて初期化</button><button data-a="done" class="pri">保存して戻る</button>`);
    r.appendChild(this.editBar);
  }
  setSettings(s) { this.S = s; this.layout(); }
  setMode(m) { this.mode = m; this.layout(); }
  show(on) { this.on = on; this.root.classList.toggle('on', on); }

  k() { return Math.max(0.8, Math.min(1.35, this.stage.h / 390)) * (this.S.hudScale || 1); }
  posOf(def, ov) {
    const st = this.stage, sf = st.safe, k = this.k();
    const x = (ov && ov.x != null) ? ov.x : def.x, y = (ov && ov.y != null) ? ov.y : def.y;
    let px, py;
    const left = this.S.handed === 'left' ? (def.ax === 'l' ? 'r' : def.ax === 'r' ? 'l' : 'c') : def.ax;
    if (left === 'l') px = sf.l + x * k; else if (left === 'r') px = st.w - sf.r - x * k; else px = st.w / 2 + (this.S.handed === 'left' ? -x : x) * k;
    if (def.ay === 't') py = Math.max(sf.t, 6) + y * k; else if (def.ay === 'b') py = st.h - Math.max(sf.b, 4) - y * k; else py = st.h / 2 + y * k;
    return [px, py];
  }
  layout() {
    if (!this.stage.w) return;
    const k = this.k(), H = this.S.hud || {};
    const op = this.S.hudOpacity ?? 0.85;
    for (const [id, def] of Object.entries(BTN)) {
      const e = this.btn[id], ov = H[id] || {};
      let hide = !!ov.hide;
      if (def.pve && !this.mode.pve) hide = true;
      if (def.pvp && !this.mode.drone) hide = true;
      if (def.opt === 'leftFire' && this.S.leftFire === false && !H[id]) hide = true;
      if (this.editing) hide = def.pve && !this.mode.pve ? true : false;
      e.classList.toggle('hidden', hide && !this.editing);
      const [x, y] = this.posOf(def, ov);
      const s = (ov.s || 1) * def.s * k;
      const wdt = def.w ? def.w * (ov.s || 1) * k : s;
      e.style.left = (x - wdt / 2) + 'px'; e.style.top = (y - s / 2) + 'px'; e.style.width = wdt + 'px'; e.style.height = s + 'px';
      e.style.opacity = this.editing && ov.hide ? 0.25 : (ov.o ?? op);
      e.style.setProperty('--bs', s + 'px');
    }
    for (const [id, def] of Object.entries(INFO)) {
      const e = this.info[id], ov = H['i_' + id] || {};
      const [x, y] = this.posOf(def, ov);
      const sc = (ov.s || 1) * k;
      e.style.left = x + 'px'; e.style.top = y + 'px';
      e.style.transform = `translate(-50%,-50%) scale(${sc})`;
      e.classList.toggle('hidden', !!ov.hide || (id === 'squad' && !this.mode.pve) || (id === 'minimap' && this.S.minimap === false));
    }
    // スティックの家（固定のとき）
    const sk = this.S.handed === 'left' ? 'r' : 'l';
    const [sx, sy] = [sk === 'l' ? this.stage.safe.l + 118 * k : this.stage.w - this.stage.safe.r - 118 * k, this.stage.h - Math.max(this.stage.safe.b, 4) - 96 * k];
    this.stickHome = { x: sx, y: sy, s: k };
    if (!this.stickActive) this._stickIdle();
  }
  _stickIdle() {
    const h = this.stickHome; if (!h) return;
    const k = this.k(), R = 60 * k;
    const e = this.stickEl;
    e.style.left = (h.x - R) + 'px'; e.style.top = (h.y - R) + 'px'; e.style.width = e.style.height = (R * 2) + 'px';
    e.classList.remove('act');
    e.firstChild.style.transform = 'translate(-50%,-50%)';
  }
  stick(st, dx, dy, spr) {
    if (!st) { this.stickActive = false; this._stickIdle(); this.stickEl.classList.remove('spr-on'); return; }
    this.stickActive = true;
    const k = this.k(), R = 60 * k;
    const e = this.stickEl;
    e.classList.add('act');
    e.style.left = (st.ox - R) + 'px'; e.style.top = (st.oy - R) + 'px'; e.style.width = e.style.height = (R * 2) + 'px';
    e.firstChild.style.transform = `translate(calc(-50% + ${(dx || 0) * R}px), calc(-50% + ${(dy || 0) * R}px))`;
    e.classList.toggle('spr-on', !!spr);
  }

  // ---- 円形メニュー
  radial(r) {
    const e = this.radialEl;
    if (!r) { e.classList.remove('on'); e.innerHTML = ''; return; }
    const k = this.k(), R = 92 * k;
    e.classList.add('on');
    let cx = r.x, cy = r.y;
    cx = Math.max(R + 40, Math.min(this.stage.w - R - 40, cx)); cy = Math.max(R + 30, Math.min(this.stage.h - R - 30, cy));
    if (r.x !== cx || r.y !== cy) { r.x = cx; r.y = cy; }
    const n = r.items.length;
    let h = `<div class="rc" style="left:${cx}px;top:${cy}px;width:${R * 2}px;height:${R * 2}px"><div class="mid">${r.title || ''}<small>${r.tapMode ? '選んでタップ／外で取り消し' : '指をずらして離す'}</small></div>`;
    r.items.forEach((it, i) => {
      const a = (i / n) * Math.PI * 2;
      const x = Math.sin(a) * R * 0.86, y = -Math.cos(a) * R * 0.86;
      h += `<div class="ri${i === r.sel ? ' sel' : ''}${it.disabled ? ' dis' : ''}" style="left:${R + x}px;top:${R + y}px">${it.label}${it.sub ? `<small>${it.sub}</small>` : ''}</div>`;
    });
    h += '</div>';
    e.innerHTML = h;
  }

  // ---- 毎こま
  update(v) {
    if (!this.on) return;
    const p = v.p;
    // 照準
    const ads = p ? p.ads : 0;
    const optic = v.optic;
    this.cross.classList.toggle('hidden', !p || ads > 0.6 || this.S.crosshair === 'none' || v.hideCross);
    if (p && ads <= 0.6) {
      const g = Math.max(3, Math.min(40, (v.spread || 2) * 5));
      if (this.cache.gap !== g) { this.cache.gap = g; this.cross.style.setProperty('--gap', g + 'px'); }
      this.cross.classList.toggle('dot', this.S.crosshair === 'dot');
    }
    this.reticle.className = 'hud-reticle' + (optic && ads > 0.85 && !optic.scope ? ' on ' + optic.kind : '');
    this.scope.classList.toggle('on', !!(optic && optic.scope && ads > 0.92));
    // 体力・防具
    if (p) {
      const hp = Math.max(0, Math.round(p.hp)), max = p.maxHp || 100;
      const key = hp + '|' + max + '|' + (p.bleed > 0) + '|' + p.inj.arm + p.inj.leg + '|' + (p.armor ? p.armor.pf + ',' + p.armor.pb + ',' + p.armor.helm : '') + '|' + (p.down ? 1 : 0);
      if (this.cache.vit !== key) {
        this.cache.vit = key;
        const vt = this.info.vitals;
        vt.querySelector('.hp i').style.width = (100 * hp / max) + '%';
        vt.querySelector('.hp b').textContent = p.down ? 'ダウン' : hp;
        vt.classList.toggle('low', hp < max * 0.35);
        const pl = [];
        if (p.armor && p.armor.vest !== 'none' && !v.pvp) {
          const P = p.armor.plate;
          if (P === 'ceramic') pl.push(`<span class="pl" title="前の板">前${'▮'.repeat(p.armor.pf)}${'▯'.repeat(Math.max(0, 4 - p.armor.pf))}</span>`, `<span class="pl">後${'▮'.repeat(p.armor.pb)}${'▯'.repeat(Math.max(0, 4 - p.armor.pb))}</span>`);
          else pl.push(`<span class="pl">${P === 'steel' ? 'スチール' : 'ケブラー'}</span>`);
        }
        if (p.armor && p.armor.helmet !== 'none' && !v.pvp) pl.push(`<span class="pl">兜${p.armor.helm > 0 ? '▮'.repeat(p.armor.helm) : '×'}</span>`);
        vt.querySelector('.plates').innerHTML = pl.join('');
        const st = [];
        if (p.bleed > 0) st.push('<span class="bad">出血</span>');
        if (p.inj.arm) st.push('<span class="warn">腕の負傷</span>');
        if (p.inj.leg) st.push(`<span class="warn">脚の負傷×${p.inj.leg}</span>`);
        vt.querySelector('.st').innerHTML = st.join('');
      }
      // 弾
      const wi = v.wi, W = wi ? WEAPONS[wi.id] : null;
      let akey = '';
      if (p.ws.slot === 2 && v.gearId) { const g = p.inv.gear.find(x => x.id === v.gearId); akey = 'g|' + v.gearId + '|' + (g ? g.n : 0); }
      else if (wi && W) { const [m, r] = ammoCount(wi); akey = wi.id + '|' + m + '|' + r + '|' + wi.mode + '|' + (wi.mags ? wi.mags.join(',') : '') + '|' + p.ws.st; }
      if (this.cache.ammo !== akey) {
        this.cache.ammo = akey;
        const am = this.info.ammo;
        if (akey.startsWith('g|')) {
          const g = p.inv.gear.find(x => x.id === v.gearId);
          am.querySelector('.mode').textContent = GEAR[v.gearId] ? GEAR[v.gearId].name : '';
          am.querySelector('.cnt').innerHTML = `<b>${g ? g.n : 0}</b><span>個</span>`;
          am.querySelector('.mags').innerHTML = '';
        } else if (wi && W) {
          const [m, r] = ammoCount(wi);
          am.querySelector('.mode').textContent = (W.modes[wi.mode] === 'auto' ? '連射' : W.modes[wi.mode] === 'burst' ? '3点' : '単発') + (p.ws.st === 'reload' ? '・リロード中' : p.ws.st === 'shell' ? '・装填中' : '');
          am.querySelector('.cnt').innerHTML = `<b class="${m === 0 ? 'empty' : m <= W.mag * 0.25 ? 'lowa' : ''}">${m}</b><span>/${wi.mags ? wi.mags.length + '本' : r}</span>`;
          // 弾倉ごとの残り（RoN の弾倉の確認のように）
          am.querySelector('.mags').innerHTML = wi.mags ? wi.mags.slice().sort((a, b) => b - a).map(n => `<i style="--f:${n / W.mag}"></i>`).join('') : '';
        } else { am.querySelector('.mode').textContent = ''; am.querySelector('.cnt').innerHTML = '<b>-</b>'; am.querySelector('.mags').innerHTML = ''; }
      }
      // 武器の切り替え
      const wkey = (p.inv.w[0] ? p.inv.w[0].id : '') + '|' + (p.inv.w[1] ? p.inv.w[1].id : '') + '|' + p.ws.slot;
      if (this.cache.wpn !== wkey) {
        this.cache.wpn = wkey;
        for (const [i, id] of [[0, 'wpn1'], [1, 'wpn2']]) {
          const w2 = p.inv.w[i];
          const e = this.btn[id];
          e.querySelector('.lb').textContent = w2 ? WEAPONS[w2.id].name : 'なし';
          e.classList.toggle('cur', p.ws.slot === i || (p.ws.next === i && p.ws.st === 'holster'));
          e.classList.toggle('dis', !w2);
        }
      }
      // ボタンの状態
      this._flag('ads', v.adsOn); this._flag('crouch', p.stance >= 1); this._flag('leanL', v.leanL); this._flag('leanR', v.leanR);
      this._flag('light', !!(wi && wi.lightOn)); this._flag('low', v.lowOn); this._flag('nvg', !!v.nvgOn);
      this.btn.nvg.classList.toggle('dis', !v.hasNvg);
      this.btn.light.classList.toggle('dis', !(wi && wi.att && wi.att.light));
      this.btn.fmode.querySelector('.lb').textContent = W ? (W.modes[wi.mode] === 'auto' ? 'AUTO' : 'SEMI') : '';
      this.btn.fmode.classList.toggle('dis', !(W && W.modes.length > 1));
      const gtxt = v.gearSel ? (GEAR[v.gearSel] ? GEAR[v.gearSel].name.replace(/（.*）/, '') : '') : '';
      const gn = v.gearSel ? (p.inv.gear.find(x => x.id === v.gearSel) || { n: 0 }).n : 0;
      const gk = gtxt + gn;
      if (this.cache.gear !== gk) { this.cache.gear = gk; this.btn.gear.querySelector('.lb').textContent = gtxt; this.btn.gear.querySelector('.ct').textContent = v.gearSel ? gn : ''; }
      this.btn.vault.classList.toggle('dis', !v.canVault);
      this.btn.reload.classList.toggle('dis', false);
      // 調べる: その時できること
      const ukey = v.ctxLabel || '';
      if (this.cache.use !== ukey) { this.cache.use = ukey; this.btn.use.querySelector('.lb').textContent = ukey ? ukey.split('|')[0] : ''; this.btn.use.classList.toggle('dis', !ukey); }
      const ck = v.cmdLabel || '';
      if (this.cache.cmd !== ck) { this.cache.cmd = ck; this.btn.cmd.querySelector('.lb').textContent = ck; }
      const tk = v.team || 'gold';
      if (this.cache.team !== tk) { this.cache.team = tk; this.btn.team.style.color = TEAMCOL[tk]; this.btn.team.querySelector('.lb').textContent = TEAMJA[tk]; this.btn.cmd.style.color = TEAMCOL[tk]; }
      this.btn.drone.classList.toggle('hidden', !v.droneOK && !this.editing);
    }
    // 案内の文字
    const pr = v.prompt || '';
    if (this.cache.prompt !== pr) { this.cache.prompt = pr; this.prompt.textContent = pr; this.prompt.classList.toggle('on', !!pr); }
    // 進みの輪
    if (v.prog != null) {
      this.prog.classList.add('on');
      this.prog.querySelector('.fg').style.strokeDashoffset = String(163.4 * (1 - v.prog));
      const pl = v.progLabel || '';
      if (this.cache.progL !== pl) { this.cache.progL = pl; this.prog.querySelector('.lb').textContent = pl; }
    } else this.prog.classList.remove('on');
    // 方位
    const deg = (((Math.PI - (v.yaw || 0)) * 180 / Math.PI) % 360 + 360) % 360;
    const ck = Math.round(deg * 2);
    if (this.cache.comp !== ck) { this.cache.comp = ck; this.info.compass.firstChild.innerHTML = compassHTML(deg); }
    // 目的
    const ok = v.objKey || '';
    if (this.cache.obj !== ok) { this.cache.obj = ok; this.info.obj.innerHTML = v.objHTML || ''; }
    // 隊員
    const sq = v.squadKey || '';
    if (this.cache.squad !== sq) { this.cache.squad = sq; this.info.squad.innerHTML = v.squadHTML || ''; }
    // 被弾の向き
    const now = performance.now();
    this.dmgArcs = this.dmgArcs.filter(a => now - a.t < 1200);
    const dk = this.dmgArcs.map(a => Math.round(a.ang * 10)).join(',') + '|' + Math.floor(now / 100);
    if (this.cache.dmg !== dk) {
      this.cache.dmg = dk;
      this.dmg.innerHTML = this.dmgArcs.map(a => { const rel = a.ang - (v.yaw || 0); const op = 1 - (now - a.t) / 1200; return `<i style="transform:translate(-50%,-50%) rotate(${-rel}rad) translateY(-70px);opacity:${op}"></i>`; }).join('');
    }
  }
  _flag(id, on) { const e = this.btn[id]; if (e && (e._on !== !!on)) { e._on = !!on; e.classList.toggle('on', !!on); } }

  // ---- 出来事
  feed(html, kind = '') {
    const e = el('div', 'fi ' + kind, html);
    this.info.feed.prepend(e);
    while (this.info.feed.children.length > 6) this.info.feed.lastChild.remove();
    setTimeout(() => { e.classList.add('old'); setTimeout(() => e.remove(), 600); }, 5200);
  }
  subtitle(who, text, col) {
    if (this.S.subtitles === false) return;
    const e = el('div', 'si', `<b style="color:${col || '#9cd0ff'}">${who}</b>${text}`);
    this.subs.appendChild(e);
    while (this.subs.children.length > 3) this.subs.firstChild.remove();
    setTimeout(() => { e.classList.add('old'); setTimeout(() => e.remove(), 500); }, 3600);
  }
  hit(kind) { this.hitm.className = 'hud-hit on ' + (kind || ''); clearTimeout(this._hitT); this._hitT = setTimeout(() => { this.hitm.className = 'hud-hit'; }, kind === 'kill' ? 380 : 160); }
  damageFrom(ang) { this.dmgArcs.push({ ang, t: performance.now() }); }
  showBanner(html, ms = 2600, cls = '') { this.banner.innerHTML = html; this.banner.className = 'hud-banner on ' + cls; clearTimeout(this._banT); if (ms > 0) this._banT = setTimeout(() => { this.banner.className = 'hud-banner'; }, ms); }
  hideBanner() { this.banner.className = 'hud-banner'; }
  showMirror(html) { this.mirror.innerHTML = html; this.mirror.classList.add('on'); clearTimeout(this._mirT); this._mirT = setTimeout(() => this.mirror.classList.remove('on'), 6000); }

  // ---- ミニマップ
  setPlan(w, def) {
    this.plan = buildPlan(w, def);
    this.planW = w;
  }
  drawMinimap(v) {
    if (!this.plan || !v.p || this.S.minimap === false) return;
    const ctx = this.mmCtx, Wc = 240, s = this.plan.s;
    const p = v.p, L = Math.max(0, Math.min(this.planW.NL - 1, Math.floor((p.y + 0.4) / LH)));
    ctx.save();
    ctx.clearRect(0, 0, Wc, Wc);
    ctx.beginPath(); ctx.arc(Wc / 2, Wc / 2, Wc / 2 - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(10,14,18,0.78)'; ctx.fillRect(0, 0, Wc, Wc);
    const f = 4.6 * (v.mmZoom || 1) * CS / s; // 1m = 4.6画素（半径およそ26m）
    ctx.translate(Wc / 2, Wc / 2);
    ctx.rotate(Math.PI + (v.yaw || 0)); // 自分の向きが上
    ctx.scale(f, f);
    const px = p.x / CS * s, pz = p.z / CS * s;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(this.plan.levels[L], -px, -pz);
    ctx.globalAlpha = 1;
    // 印
    const dot = (x, z, col, r = 3.2, sq = false) => { ctx.fillStyle = col; const X = x / CS * s - px, Z = z / CS * s - pz; ctx.beginPath(); if (sq) ctx.rect(X - r, Z - r, r * 2, r * 2); else ctx.arc(X, Z, r, 0, Math.PI * 2); ctx.fill(); };
    for (const m of v.marks || []) dot(m.x, m.z, m.col, m.r || 3.2, m.sq);
    ctx.restore();
    // 自分（真ん中の矢印）
    ctx.fillStyle = '#ffd34a';
    ctx.beginPath(); ctx.moveTo(Wc / 2, Wc / 2 - 9); ctx.lineTo(Wc / 2 + 6, Wc / 2 + 6); ctx.lineTo(Wc / 2, Wc / 2 + 2); ctx.lineTo(Wc / 2 - 6, Wc / 2 + 6); ctx.closePath(); ctx.fill();
    // 北の印の位置
    const n = this.info.minimap.lastChild;
    const yw = v.yaw || 0;
    n.style.transform = `translate(-50%,-50%) translate(${-Math.sin(yw) * 54}px, ${Math.cos(yw) * 54}px)`;
  }

  // ---- HUD の編集
  edit(settings, onSave, onDone) {
    this.editing = true; this.sel = null;
    this.root.classList.add('editing');
    this.layout();
    const H = settings.hud || (settings.hud = {});
    const bar = this.editBar;
    const pick = (id) => {
      this.sel = id;
      for (const e of this.root.querySelectorAll('.sel')) e.classList.remove('sel');
      const e = id.startsWith('i_') ? this.info[id.slice(2)] : this.btn[id];
      if (e) e.classList.add('sel');
      const def = id.startsWith('i_') ? INFO[id.slice(2)] : BTN[id];
      bar.querySelector('.nm').textContent = def ? def.name : id;
      const ov = H[id] || {};
      bar.querySelector('[data-k="s"]').value = ov.s || 1;
      bar.querySelector('[data-k="o"]').value = ov.o ?? (settings.hudOpacity ?? 0.85);
      bar.querySelector('[data-a="hide"]').textContent = ov.hide ? '表示する' : '隠す';
    };
    let drag = null;
    this._editDown = (e) => {
      let t = e.target, id = null;
      while (t && t !== this.root) { if (t.dataset && t.dataset.btn) { id = t.dataset.btn; break; } if (t.dataset && t.dataset.info) { id = 'i_' + t.dataset.info; break; } if (t === bar) return; t = t.parentNode; }
      if (!id) return;
      e.preventDefault(); e.stopPropagation();
      pick(id);
      const [sx, sy] = this.stage.toStage(e.clientX, e.clientY);
      const def = id.startsWith('i_') ? INFO[id.slice(2)] : BTN[id];
      const ov = H[id] || {};
      drag = { id, sx, sy, x0: ov.x ?? def.x, y0: ov.y ?? def.y, pid: e.pointerId, def };
      try { this.root.setPointerCapture(e.pointerId); } catch (er) { /* なし */ }
    };
    this._editMove = (e) => {
      if (!drag || e.pointerId !== drag.pid) return;
      const [sx, sy] = this.stage.toStage(e.clientX, e.clientY);
      const k = this.k(), d = drag.def;
      let dx = (sx - drag.sx) / k, dy = (sy - drag.sy) / k;
      const lr = this.S.handed === 'left' ? (d.ax === 'l' ? 'r' : d.ax === 'r' ? 'l' : 'c') : d.ax;
      const ov = H[drag.id] || (H[drag.id] = {});
      ov.x = Math.round(drag.x0 + (lr === 'r' ? -dx : lr === 'c' && this.S.handed === 'left' ? -dx : dx));
      ov.y = Math.round(drag.y0 + (d.ay === 'b' ? -dy : dy));
      this.layout();
    };
    this._editUp = (e) => { if (drag && e.pointerId === drag.pid) { drag = null; onSave(settings); } };
    this.root.addEventListener('pointerdown', this._editDown, true);
    this.root.addEventListener('pointermove', this._editMove, true);
    this.root.addEventListener('pointerup', this._editUp, true);
    const inputs = bar.querySelectorAll('input');
    inputs.forEach(inp => { inp.oninput = () => { if (!this.sel) return; const ov = H[this.sel] || (H[this.sel] = {}); ov[inp.dataset.k] = +inp.value; this.layout(); onSave(settings); }; });
    const btns = {};
    bar.querySelectorAll('button').forEach(b => { btns[b.dataset.a] = b; });
    onTap(btns.hide, () => { if (!this.sel) return; const ov = H[this.sel] || (H[this.sel] = {}); ov.hide = !ov.hide; pick(this.sel); this.layout(); onSave(settings); });
    onTap(btns.reset1, () => { if (!this.sel) return; delete H[this.sel]; pick(this.sel); this.layout(); onSave(settings); });
    let armed = false;
    onTap(btns.resetAll, () => { if (!armed) { armed = true; btns.resetAll.textContent = 'もう一度押すと初期化'; setTimeout(() => { armed = false; btns.resetAll.textContent = 'すべて初期化'; }, 2500); return; } armed = false; btns.resetAll.textContent = 'すべて初期化'; for (const k of Object.keys(H)) delete H[k]; this.layout(); onSave(settings); });
    onTap(btns.done, () => {
      this.editing = false;
      this.root.classList.remove('editing');
      for (const e of this.root.querySelectorAll('.sel')) e.classList.remove('sel');
      this.root.removeEventListener('pointerdown', this._editDown, true);
      this.root.removeEventListener('pointermove', this._editMove, true);
      this.root.removeEventListener('pointerup', this._editUp, true);
      this.layout();
      onSave(settings);
      onDone();
    });
  }
}

function compassHTML(deg) {
  // 幅 260px に ±65° を表示
  const out = [];
  const lbl = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  for (let a = Math.floor((deg - 70) / 15) * 15; a <= deg + 70; a += 15) {
    const d = a - deg, x = 130 + d * 2;
    const n = ((a % 360) + 360) % 360;
    out.push(`<span style="left:${x}px" class="${lbl[n] ? (n % 90 ? 'm' : 'M') : ''}">${lbl[n] || '|'}</span>`);
  }
  return out.join('') + `<em>${Math.round(deg) % 360}°</em>`;
}

// 見取り図（ミニマップと地図の画面で使う）: 1マス = s 画素
export function buildPlan(w, def, s = 4) {
  const levels = [];
  for (let L = 0; L < w.NL; L++) {
    const c = document.createElement('canvas');
    c.width = w.W * s; c.height = w.D * s;
    const x = c.getContext('2d');
    for (let j = 0; j < w.D; j++) for (let i = 0; i < w.W; i++) {
      const k = w.idx(L, i, j), t = w.cell[k];
      let col = null;
      if (t === C.FLOOR || t === C.STAIR) col = '#57606a';
      else if (t === C.OUT) col = '#2e3a33';
      else if (t === C.DOOR) col = '#a0643a';
      else if (t === C.WINDOW || t === C.GLASSWALL) col = '#4aa3d8';
      else if (t === C.OPEN) col = '#57606a';
      else if (t === C.LOW || t === C.FENCE) col = '#6d7a72';
      else if (t === C.WALL) col = '#d8dde2';
      if (!col) continue;
      x.fillStyle = col;
      if (isWallish(t) && t !== C.OPEN) {
        x.fillStyle = (t === C.FLOOR) ? col : (w.indoor[k] ? '#57606a' : '#2e3a33');
        x.fillRect(i * s, j * s, s, s);
        x.fillStyle = col;
        for (let n = 0; n < w.nbox[k]; n++) { const o = k * 8 + n * 4; x.fillRect(w.boxes[o] / CS * s, w.boxes[o + 1] / CS * s, Math.max(1, (w.boxes[o + 2] - w.boxes[o]) / CS * s), Math.max(1, (w.boxes[o + 3] - w.boxes[o + 1]) / CS * s)); }
      } else x.fillRect(i * s, j * s, s, s);
    }
    x.fillStyle = 'rgba(200,190,160,0.55)';
    for (const p of w.props) if (p.L === L && p.solid) x.fillRect((p.x - p.w / 2) / CS * s, (p.z - p.d / 2) / CS * s, p.w / CS * s, p.d / CS * s);
    levels.push(c);
  }
  return { levels, s };
}
