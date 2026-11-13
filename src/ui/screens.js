// 画面: 読み込み・タイトル（WAR BIT）・PLAY（モードと人数）・一時停止・地図（タブレット）・結果・設定。
// メニューの形と表記は BattleBit に合わせる（英語の大文字に日本語を小さく添える。research/WARBIT.md の 10）。
// 旧 HARD ENTRY の画面（作戦・対戦・訓練・ロビー・資料室）はメニューから外した（11-13 03:10・03:15 の要望）。中身は後で消す
import { onTap } from './input.js';
import { Scroller, slider, chips, confirmTap, textModal, copyText, esc } from './widgets.js';
import { MAPS, MAP_LIST, PVE_MAPS, PVP_MAPS } from '../engine/maps/index.js';
import { MISSIONS, MISSION_LIST, DIFFS } from '../engine/data/missions.js';
import { MODE_INFO, PVP_MODES } from '../engine/modes/index.js';
import { VERSION, COMPAT, TITLE } from '../engine/data/version.js';
import { baseWorld } from '../engine/engine.js';
import { buildPlan } from './hud.js';
import { CS } from '../engine/world.js';
import { LoadoutEditor } from './loadout.js';
import { Book } from './book.js';
import { QUALITY, GFX_PRESET, gfxOf } from '../render/renderer.js';
import { WAR_MAPS } from '../war/maps/index.js';
import { warPlanImage, drawWarMarks } from './warplan.js';
import { WAR_MODES, WAR_MODE_LIST, sizeLabel } from '../engine/modes/war.js';

// WAR BIT のロゴ: 独自のブロック文字（5×7 の升目）。WAR は白、BIT は琥珀色。1升下・右に影
const GLYPH = {
  W: ['X...X', 'X...X', 'X...X', 'X.X.X', 'X.X.X', 'XX.XX', 'X...X'],
  A: ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
  R: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'],
  B: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X...X', 'X...X', 'XXXX.'],
  I: ['XXX', '.X.', '.X.', '.X.', '.X.', '.X.', 'XXX'],
  T: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'],
};
export function warLogo() {
  const parts = [], shadow = [];
  let x = 0;
  for (const ch of 'WAR BIT') {
    if (ch === ' ') { x += 3; continue; }
    const g = GLYPH[ch], col = x > 20 ? '#f2b33d' : '#f4f1ea';
    g.forEach((row, y) => { for (let i = 0; i < row.length; i++) if (row[i] === 'X') { parts.push(`<rect x="${x + i}" y="${y}" width="1.02" height="1.02" fill="${col}"/>`); shadow.push(`<rect x="${x + i + 0.45}" y="${y + 0.45}" width="1.02" height="1.02"/>`); } });
    x += g[0].length + 1;
  }
  return `<svg class="wlogo" viewBox="-0.2 -0.2 ${x + 0.6} 7.8" role="img" aria-label="WAR BIT"><g fill="rgba(0,0,0,.55)">${shadow.join('')}</g>${parts.join('')}</svg>`;
}
const PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="4" fill="currentColor"/><path d="M4 21c0-4.5 3.6-7.5 8-7.5s8 3 8 7.5z" fill="currentColor"/></svg>';
export function fmtTime(t) { t = Math.max(0, Math.floor(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
const BACK = `<button class="back" data-back aria-label="戻る"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span>戻る</span></button>`;
const TIME_JA = { day: '昼', dusk: '夕方', night: '夜', dawn: '明け方' };
const GRADE_COL = { S: '#ffd34a', A: '#7fe08a', B: '#7cc4ff', C: '#d8d8d8', D: '#ffb070', F: '#ff6a5a' };

export class Screens {
  constructor(app, root) {
    this.app = app; this.root = root; this.stage = app.stage;
    this.cur = null; this.stack = []; this.el = {}; this.args = [];
    this.sel = { map: 'gasstation', mission: 'barricade', diff: 'normal', team: 4, entry: 0 };
    this.pv = { mode: 'tdm', map: 'gasstation', teams: [4, 4], side: 0, botLevel: 2, wins: 3, time: 8, aimAssist: 1, ff: false };
  }
  _mk(name, html, cls = '') {
    let el = this.el[name];
    if (!el) { el = document.createElement('div'); el.className = 'screen ' + name + ' ' + cls; this.root.appendChild(el); this.el[name] = el; }
    // 同じ画面を描き直すとき（選んだだけ）はスクロールの位置を保つ
    const keep = this.cur === name && !this._noKeep; this._noKeep = false;
    const old = keep ? [...el.querySelectorAll('.scroll')].map(q => [q.scrollTop, q.scrollLeft]) : null;
    el.innerHTML = html;
    const b = el.querySelector('[data-back]');
    if (b) onTap(b, () => { this.app.audio.ui('back'); this.back(); });
    el.querySelectorAll('.scroll').forEach(s => new Scroller(this.stage, s));
    // タブの列は横にスクロール（狭い画面で右のタブが切れないように）
    el.querySelectorAll('.tabs').forEach(t => { t._sc = new Scroller(this.stage, t, { x: true }); requestAnimationFrame(() => t._sc.reveal(t.querySelector('.tab.on'))); });
    this._restoreScroll = null;
    if (old) { const restore = () => el.querySelectorAll('.scroll').forEach((q, i) => { if (old[i]) { q.scrollTop = old[i][0]; q.scrollLeft = old[i][1]; } }); restore(); requestAnimationFrame(restore); this._restoreScroll = restore; }
    return el;
  }
  show(name) {
    for (const [k, e] of Object.entries(this.el)) e.classList.toggle('on', k === name);
    this.cur = name;
    if (this.app.onScreen) this.app.onScreen(name);
  }
  hide() { for (const e of Object.values(this.el)) e.classList.remove('on'); this.cur = null; if (this.app.onScreen) this.app.onScreen(null); }
  flash(msg) {
    if (!this.flashEl) { this.flashEl = document.createElement('div'); this.flashEl.className = 'sc-flash'; this.flashEl.setAttribute('role', 'status'); this.root.appendChild(this.flashEl); }
    this.flashEl.textContent = msg; this.flashEl.classList.add('on');
    clearTimeout(this.flashT); this.flashT = setTimeout(() => this.flashEl.classList.remove('on'), 1900);
  }
  open(name, ...args) { if (this.cur) this.stack.push([this.cur, this.args || []]); this.args = args; this['_' + name](...args); }
  back() { const [name, args] = this.stack.pop() || ['title', []]; this.args = args; this['_' + name](...args); }
  reset(name, ...args) { this.stack = []; this.args = args; this['_' + name](...args); }
  _acts(el, act) { el.querySelectorAll('[data-a]').forEach(b => onTap(b, (e) => { if (b.classList.contains('dis')) { this.app.audio.ui('deny'); return; } this.app.audio.ui('tap'); act[b.dataset.a] && act[b.dataset.a](b, e); })); }

  // ---- 読み込み・エラー
  loading(msg, p) {
    if (!this.el.loading) this._mk('loading', `<div class="ld"><div class="ld-name" aria-label="${TITLE}">${warLogo()}</div><div class="ld-bar"><i></i></div><div class="ld-msg"></div></div>`);
    const el = this.el.loading;
    el.querySelector('.ld-msg').textContent = msg || '';
    el.querySelector('.ld-bar i').style.width = Math.round((p || 0) * 100) + '%';
    if (this.cur !== 'loading') this.show('loading');
  }
  error(msg, detail) {
    this._mk('loading', `<div class="ld"><div class="ld-name" aria-label="${TITLE}">${warLogo()}</div><p class="ld-err">${esc(msg)}${detail ? `<small>${esc(detail)}</small>` : ''}</p></div>`);
    this.show('loading');
  }

  // ---- タイトル（BattleBit のメインメニューに合わせる: 左に大きな項目、右上に名前、背景は分隊）
  _title() {
    const a = this.app;
    const el = this._mk('title', `
      <div class="wt-logo">${warLogo()}<p>大人数の撃ち合い · ${sizeLabel(16)} 〜 ${sizeLabel(64)}</p></div>
      <div class="wt-me" data-a="me" role="button"><span>${PERSON}</span><b>${esc(a.profile.name)}</b></div>
      <nav class="wt-menu" aria-label="メニュー">
        <button class="wm main" data-a="play"><b>PLAY</b><span>対戦 · 足りない人数はボット</span></button>
        <button class="wm" data-a="range"><b>SHOOTING RANGE</b><span>射撃場 · 銃を試す</span></button>
        <button class="wm" data-a="settings"><b>SETTINGS</b><span>設定</span></button>
      </nav>
      <div class="t-foot"><span>ヘッドホン推奨</span><span class="ver">互換${COMPAT} · v${VERSION}</span></div>`);
    this._acts(el, {
      play: () => this.open('play'),
      range: () => a.startWar({ wmode: 'range' }),
      settings: () => this.open('settings', 'ctrl'),
      me: () => this.open('settings', 'etc'),
    });
    this.show('title');
    a.scene('title');
  }
  // ---- PLAY: モードを選び、人数を押すとすぐ始まる（BattleBit のクイックマッチ。足りない人数はボット）
  _play() {
    const a = this.app, M = WAR_MAPS.riverbend, last = a.lastWar || {};
    const card = (id) => {
      const MD = WAR_MODES[id];
      const sizes = Object.entries(MD.sizes);
      return `<div class="wp-card"><div class="wp-h"><b>${MD.en}</b><span>${esc(MD.name)}</span></div><p>${esc(MD.desc)}</p>
        <div class="wp-sizes">${sizes.map(([k, z]) => `<button class="wp-size${last.wmode === id && last.size === k ? ' last' : ''}" data-a="go" data-m="${id}" data-k="${k}"><b>${sizeLabel(z.per)}</b><small>${id === 'conquest' ? `チケット ${z.tickets}` : id === 'tdm' ? `${z.kills} キル` : `${MD.score} 点`}</small></button>`).join('')}</div></div>`;
    };
    const el = this._mk('play', `<div class="sc-wrap"><header class="sc-head">${BACK}<h2>PLAY</h2><span class="hint">MAP · ${esc(M.en)}（${esc(M.name)}）· 足りない人数はボットが入る</span></header>
      <div class="wp-modes">${WAR_MODE_LIST.map(card).join('')}</div></div>`, 'dim');
    el.querySelectorAll('[data-a="go"]').forEach(b => onTap(b, () => { a.audio.ui('go'); a.startWar({ wmode: b.dataset.m, size: b.dataset.k }); }));
    this._acts(el, {});
    this.show('play'); a.scene('menu');
  }
  _warSetup() { this._play(); }

  // ---- 作戦の準備（ひとり／ホストのロビーでも使う）
  _mission(opt = {}) {
    const a = this.app, s = opt.sel || this.sel;
    if (!PVE_MAPS.includes(s.map)) s.map = PVE_MAPS[0];
    const def = MAPS[s.map];
    const entries = (def.spawn.swat || []).map((e, i) => [i, e.name]);
    if (s.entry >= entries.length) s.entry = 0;
    const net = !!opt.net;
    const el = this._mk('mission', `<div class="sc-wrap"><header class="sc-head">${BACK}<h2>${net ? '作戦設定' : '作戦準備'}</h2><span class="hint">${esc(def.name)}</span></header>
      <div class="split">
        <div class="pane maps scroll">${PVE_MAPS.map(id => { const m = MAPS[id]; return `<button class="mapcard${id === s.map ? ' on' : ''}" data-map="${id}"><b>${esc(m.name)}</b><small>${esc(m.en)} · ${TIME_JA[m.time] || ''}${m.levels.length > 1 ? ` · ${m.levels.length}階` : ''}</small></button>`; }).join('')}</div>
        <div class="pane rows scroll">
          <div class="row"><div class="rl"><b>作戦</b></div><div class="rc" data-k="mission"></div></div>
          <p class="note mdesc">${esc(MISSIONS[s.mission].desc)}</p>
          <div class="row"><div class="rl"><b>難易度</b></div><div class="rc" data-k="diff"></div></div>
          <p class="note ddesc">${esc(DIFFS[s.diff].desc)}</p>
          ${net ? '' : `<div class="row"><div class="rl"><b>人数</b><small>自分＋AI隊員</small></div><div class="rc" data-k="team"></div></div>`}
          <div class="row"><div class="rl"><b>突入口</b></div><div class="rc" data-k="entry"></div></div>
          <p class="note">${esc(def.desc)}</p>
        </div>
      </div>
      <div class="sc-foot"><button class="btn ghost" data-a="lo">装備</button><button class="btn primary" data-a="go">${net ? '決定' : 'ブリーフィング'}</button></div></div>`, 'dim');
    el.querySelectorAll('[data-map]').forEach(b => onTap(b, () => { s.map = b.dataset.map; s.entry = 0; this.app.audio.ui('tap'); this._mission(opt); }));
    chips(el.querySelector('[data-k="mission"]'), MISSION_LIST.filter(m => !def.missions || def.missions[m]).map(m => [m, MISSIONS[m].name]), s.mission, (v) => { s.mission = v; el.querySelector('.mdesc').textContent = MISSIONS[v].desc; });
    chips(el.querySelector('[data-k="diff"]'), Object.keys(DIFFS).map(d => [d, DIFFS[d].name]), s.diff, (v) => { s.diff = v; el.querySelector('.ddesc').textContent = DIFFS[v].desc; });
    if (!net) chips(el.querySelector('[data-k="team"]'), [[1, '1名'], [2, '2名'], [3, '3名'], [4, '4名']], s.team, (v) => { s.team = v; });
    chips(el.querySelector('[data-k="entry"]'), entries, s.entry, (v) => { s.entry = v; });
    this._acts(el, {
      lo: () => this.open('loadout', { kind: 'pve', team: net ? 1 : s.team }),
      go: () => { if (net) { if (opt.onDone) opt.onDone(s); this.back(); } else this.open('brief', s); },
    });
    this.show('mission'); a.scene('menu');
  }
  _brief(s) {
    const a = this.app, def = MAPS[s.map], M = MISSIONS[s.mission];
    const el = this._mk('brief', `<div class="sc-wrap"><header class="sc-head">${BACK}<h2>ブリーフィング</h2><span class="hint">${esc(def.name)} · ${esc(M.name)} · ${esc(DIFFS[s.diff].name)}</span></header>
      <div class="split brief">
        <div class="pane planbox"><canvas class="plan"></canvas><div class="plan-lv"></div></div>
        <div class="pane rows scroll">
          <h3>状況</h3><p>${esc(M.desc)}</p>
          <h3>目的</h3><ul class="obj">${objectives(s.mission).map(o => `<li>${esc(o)}</li>`).join('')}</ul>
          <h3>交戦規定</h3><p class="note">実弾は、相手が銃を向けた・撃った・抜こうとしたとき、または武装したまま警告に従わないときのみ。投降者・拘束者・丸腰の者・市民への発砲は重大な違反。警告 → 拘束 → TOCへ報告。</p>
          <h3>突入口</h3><p>${esc(def.spawn.swat[s.entry].name)}</p>
        </div>
      </div>
      <div class="sc-foot"><button class="btn ghost" data-a="lo">装備</button><button class="btn primary" data-a="go">出動</button></div></div>`, 'dim');
    this._drawPlan(el.querySelector('.planbox'), s.map, { entry: s.entry, showEntries: true });
    this._acts(el, { lo: () => this.open('loadout', { kind: 'pve', team: s.team }), go: () => a.startPve({ ...s }) });
    this.show('brief'); a.scene('menu');
  }
  // 見取り図（階の切り替えつき）
  _drawPlan(box, mapId, o = {}) {
    const def = MAPS[mapId];
    let w;
    try { w = baseWorld(mapId); } catch (e) { box.innerHTML = '<p class="note">見取り図なし</p>'; return; }
    const plan = buildPlan(w, def, 5);
    const cv = box.querySelector('canvas'), lv = box.querySelector('.plan-lv');
    let L = o.level ?? 0;
    const draw = () => {
      const src = plan.levels[L];
      cv.width = src.width; cv.height = src.height;
      const x = cv.getContext('2d');
      x.drawImage(src, 0, 0);
      const s = plan.s / CS;
      x.font = 'bold 11px Inter, system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      for (const r of def.rooms || []) { const [nm, en, ri, rj, rL = 0] = r; if (rL !== L) continue; x.fillStyle = 'rgba(0,0,0,0.55)'; const t = nm; const tw = x.measureText(t).width + 8; x.fillRect(ri * plan.s - tw / 2, rj * plan.s - 8, tw, 16); x.fillStyle = '#f2f4f6'; x.fillText(t, ri * plan.s, rj * plan.s); }
      if (o.showEntries) (def.spawn.swat || []).forEach((e, i) => { if ((e.L || 0) !== L) return; x.fillStyle = i === o.entry ? '#ffd34a' : 'rgba(255,211,74,0.45)'; x.beginPath(); x.arc(e.x * plan.s, e.z * plan.s, i === o.entry ? 8 : 6, 0, Math.PI * 2); x.fill(); x.fillStyle = '#111'; x.fillText(String(i + 1), e.x * plan.s, e.z * plan.s + 0.5); });
      if (o.marks) for (const m of o.marks) { if ((m.L || 0) !== L) continue; x.fillStyle = m.col; x.beginPath(); if (m.sq) x.rect(m.x * s - 5, m.z * s - 5, 10, 10); else x.arc(m.x * s, m.z * s, m.r || 5, 0, Math.PI * 2); x.fill(); if (m.me) { x.strokeStyle = '#000'; x.lineWidth = 2; x.stroke(); } }
    };
    lv.innerHTML = plan.levels.length > 1 ? plan.levels.map((_, i) => `<button class="chip${i === L ? ' on' : ''}" data-l="${i}">${i + 1}階</button>`).join('') : '';
    lv.querySelectorAll('[data-l]').forEach(b => onTap(b, () => { L = +b.dataset.l; lv.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b)); draw(); }));
    draw();
  }

  // ---- 装備
  _loadout(o = {}) {
    const a = this.app;
    const el = this._mk('loadout', `<div class="sc-wrap"><header class="sc-head">${BACK}<h2>装備</h2><span class="hint">${o.kind === 'pvp' ? '対戦（陣営ごと）' : '自分とAI隊員'}</span></header><div class="lo-host"></div></div>`, 'dim');
    this.lo = new LoadoutEditor(a, el.querySelector('.lo-host'), o);
    this.show('loadout'); a.scene('menu');
  }

  // ---- 対戦の準備（ひとり／ホストのロビー）
  _pvpSetup(opt) {
    opt = opt || {};
    const a = this.app, s = opt.sel || this.pv, net = !!opt.net;
    const maps = MAP_LIST.filter(id => (PVP_MAPS.includes(id) || PVE_MAPS.includes(id)) && id !== 'training');
    if (!maps.includes(s.map)) s.map = maps[0];
    const def = MAPS[s.map];
    const el = this._mk('pvpSetup', `<div class="sc-wrap"><header class="sc-head">${BACK}<h2>${net ? 'ルーム設定' : '対戦設定'}</h2><span class="hint">${esc(MODE_INFO[s.mode].name)} · ${esc(def.name)}</span></header>
      <div class="split">
        <div class="pane maps scroll">${maps.map(id => { const m = MAPS[id]; return `<button class="mapcard${id === s.map ? ' on' : ''}" data-map="${id}"><b>${esc(m.name)}</b><small>${PVP_MAPS.includes(id) && !PVE_MAPS.includes(id) ? '対戦用' : '作戦と共用'} · ${TIME_JA[m.time] || ''}</small></button>`; }).join('')}</div>
        <div class="pane rows scroll">
          <div class="row"><div class="rl"><b>モード</b></div><div class="rc" data-k="mode"></div></div>
          <p class="note modedesc">${esc(MODE_INFO[s.mode].desc)}</p>
          ${net ? '' : `<div class="row"><div class="rl"><b>自チーム</b><small>自分を含む</small></div><div class="rc" data-k="t0"></div></div>
          <div class="row"><div class="rl"><b>敵チーム</b></div><div class="rc" data-k="t1"></div></div>
          <div class="row"><div class="rl"><b>陣営</b><small>前半</small></div><div class="rc" data-k="side"></div></div>`}
          <div class="row"><div class="rl"><b>ボットの強さ</b></div><div class="rc" data-k="bot"></div></div>
          <div class="row tdm-only"><div class="rl"><b>時間</b></div><div class="rc" data-k="time"></div></div>
          <div class="row rnd-only"><div class="rl"><b>勝利ラウンド</b><small>先に取った方の勝ち</small></div><div class="rc" data-k="wins"></div></div>
          <div class="row"><div class="rl"><b>エイムアシスト</b><small>タッチ操作のみ</small></div><div class="rc" data-k="aa"></div></div>
          <div class="row"><div class="rl"><b>味方撃ち</b></div><div class="rc" data-k="ff"></div></div>
        </div>
      </div>
      <div class="sc-foot"><button class="btn ghost" data-a="lo">装備</button><button class="btn primary" data-a="go">${net ? '決定' : '開始'}</button></div></div>`, 'dim');
    const vis = () => { el.querySelector('.tdm-only').style.display = s.mode === 'tdm' ? '' : 'none'; el.querySelector('.rnd-only').style.display = s.mode === 'tdm' ? 'none' : ''; };
    el.querySelectorAll('[data-map]').forEach(b => onTap(b, () => { s.map = b.dataset.map; this.app.audio.ui('tap'); this._pvpSetup(opt); }));
    chips(el.querySelector('[data-k="mode"]'), PVP_MODES.map(m => [m, MODE_INFO[m].name]), s.mode, (v) => { s.mode = v; el.querySelector('.modedesc').textContent = MODE_INFO[v].desc; vis(); });
    if (!net) {
      chips(el.querySelector('[data-k="t0"]'), [1, 2, 3, 4].map(n => [n, n + '名']), s.teams[0], (v) => { s.teams[0] = v; });
      chips(el.querySelector('[data-k="t1"]'), [1, 2, 3, 4].map(n => [n, n + '名']), s.teams[1], (v) => { s.teams[1] = v; });
      chips(el.querySelector('[data-k="side"]'), [[0, 'SWAT'], [1, '立てこもり犯']], s.side, (v) => { s.side = v; });
    }
    chips(el.querySelector('[data-k="bot"]'), [[1, '弱'], [2, '標準'], [3, '強']], s.botLevel, (v) => { s.botLevel = v; });
    chips(el.querySelector('[data-k="time"]'), [[5, '5分'], [8, '8分'], [10, '10分'], [15, '15分']], s.time, (v) => { s.time = v; });
    chips(el.querySelector('[data-k="wins"]'), [[2, '2'], [3, '3'], [4, '4'], [5, '5']], s.wins, (v) => { s.wins = v; });
    chips(el.querySelector('[data-k="aa"]'), [[0, 'オフ'], [1, '弱'], [2, '標準']], s.aimAssist, (v) => { s.aimAssist = v; });
    chips(el.querySelector('[data-k="ff"]'), [[false, 'オフ'], [true, 'オン']], s.ff, (v) => { s.ff = v; });
    vis();
    this._acts(el, {
      lo: () => this.open('loadout', { kind: 'pvp' }),
      go: () => { if (net) { if (opt.onDone) opt.onDone(s); this.back(); } else a.startPvp({ ...s, teams: s.teams.slice() }); },
    });
    this.show('pvpSetup'); a.scene('menu');
  }

  // ---- オンライン: ルームを作る／参加
  _multi(kind) {
    const a = this.app;
    const el = this._mk('multi', `<div class="sc-wrap"><header class="sc-head">${BACK}<h2>${kind === 'pvp' ? 'オンライン対戦' : '協力（オンライン）'}</h2></header>
      <div class="big-choice">
        <button class="bc" data-a="host"><b>ルーム作成</b><span>5文字のコードと招待リンクを発行。</span></button>
        <button class="bc" data-a="join"><b>コードで参加</b><span>5文字のコードを入力。招待リンクなら自動で参加。</span></button>
      </div>
      <p class="note center">${esc(a.netNote())}</p></div>`, 'dim');
    this._acts(el, {
      host: () => a.hostRoom(kind),
      join: async () => { const v = await textModal({ title: 'ルームコード', note: '5文字（例: KX7QM）', maxLength: 8, validate: (t) => a.normCode(t) ? '' : '5文字のコードを入力（使えない文字があります）' }); if (v) a.joinRoom(a.normCode(v)); },
    });
    this.show('multi'); a.scene('menu');
  }
  _join(code) { this.app.joinRoom(code); }
  netWait(msg, onCancel) {
    const el = this._mk('netwait', `<div class="ld"><div class="ld-name">${TITLE}</div><p class="nw-msg">${esc(msg)}</p><div class="spin"></div><button class="btn ghost" data-a="cancel">中止</button></div>`);
    this._acts(el, { cancel: () => onCancel && onCancel() });
    this.show('netwait');
  }
  netError(msg) {
    const el = this._mk('neterr', `<div class="ld"><div class="ld-name">${TITLE}</div><p class="ld-err">${esc(msg)}</p><button class="btn primary" data-a="ok">タイトルへ</button></div>`);
    this._acts(el, { ok: () => this.app.toTitle() });
    this.show('neterr');
  }
  // ロビー（ホストとゲスト共通。ホストだけ設定を変えられる）
  _lobby() {
    const a = this.app, N = a.net;
    if (!N) { this.reset('title'); return; }
    const host = N.role === 'host';
    const el = this._mk('lobby', `<div class="sc-wrap"><header class="sc-head"><button class="back" data-a="leave"><span>退出</span></button><h2>ロビー</h2><span class="hint code">ルーム <b>${esc(N.code)}</b></span><button class="btn small" data-a="share">招待</button></header>
      <div class="split lobby">
        <div class="pane roster scroll"></div>
        <div class="pane rows scroll lob-set"></div>
      </div>
      <div class="sc-foot"><span class="conn"></span>${host ? '<button class="btn ghost" data-a="set">設定</button><button class="btn primary" data-a="start">開始</button>' : '<span class="wait">ホストの開始待ち…</span>'}<button class="btn ghost" data-a="lo">装備</button></div></div>`, 'dim');
    this._acts(el, {
      leave: () => a.leaveRoom(),
      share: () => a.shareRoom(),
      set: () => { const S = N.sess; if (S.kind === 'pvp') this.open('pvpSetup', { net: true, sel: S.cfg, onDone: (v) => S.setCfg(v) }); else this.open('mission', { net: true, sel: S.cfg, onDone: (v) => S.setCfg(v) }); },
      start: () => a.hostStart(),
      lo: () => this.open('loadout', { kind: N.sess.kind === 'pvp' ? 'pvp' : 'pve', team: 1 }),
    });
    this.show('lobby'); a.scene('menu');
    this.netRoster();
  }
  netRoster() {
    if (this.cur !== 'lobby') return;
    const a = this.app, N = a.net; if (!N) return;
    const el = this.el.lobby, S = N.sess, host = N.role === 'host';
    const cfg = S.cfg || {};
    const pvp = S.kind === 'pvp';
    const ro = S.roster || [];
    const teamOf = (r) => r.team || 0;
    const rowHTML = (r) => `<div class="pl${r.on ? '' : ' off'}"><b>${esc(r.name)}</b>${r.host ? '<em>ホスト</em>' : ''}${r.cid === S.cid ? '<em class="me">自分</em>' : ''}${r.on ? '' : '<em class="bad">応答なし</em>'}${pvp && host ? `<button class="chip small" data-team="${esc(r.cid)}">${teamOf(r) ? '赤へ' : '青へ'}</button>` : ''}</div>`;
    let html;
    if (pvp) {
      const sizes = cfg.teams || [4, 4];
      html = [0, 1].map(t => { const list = ro.filter(r => teamOf(r) === t); return `<div class="team t${t}"><h4>${t === 0 ? '青チーム' : '赤チーム'} <small>${list.length}名＋ボット${Math.max(0, sizes[t] - list.length)}</small></h4>${list.map(rowHTML).join('')}</div>`; }).join('');
      if (host) html += `<div class="row"><div class="rl"><b>人数</b><small>空き枠はボット</small></div><div class="rc"><span class="mini">青</span><span data-k="s0"></span><span class="mini">赤</span><span data-k="s1"></span></div></div>`;
    } else html = `<h4>隊員 <small>${ro.length}名＋AI${Math.max(0, 4 - ro.length)}</small></h4>` + ro.map(rowHTML).join('');
    el.querySelector('.roster').innerHTML = html;
    if (pvp && host) {
      el.querySelectorAll('[data-team]').forEach(b => onTap(b, () => S.setTeam(b.dataset.team, teamOf(ro.find(r => r.cid === b.dataset.team)) ? 0 : 1)));
      const sizes = cfg.teams || [4, 4];
      chips(el.querySelector('[data-k="s0"]'), [1, 2, 3, 4].map(n => [n, String(n)]), sizes[0], (v) => { const c = { ...cfg, teams: [v, sizes[1]] }; S.setCfg(c); });
      chips(el.querySelector('[data-k="s1"]'), [1, 2, 3, 4].map(n => [n, String(n)]), sizes[1], (v) => { const c = { ...cfg, teams: [sizes[0], v] }; S.setCfg(c); });
    }
    // 設定の要約
    const set = el.querySelector('.lob-set');
    if (pvp) set.innerHTML = `<h3>${esc(MODE_INFO[cfg.mode] ? MODE_INFO[cfg.mode].name : '')}</h3><p>${esc(MAPS[cfg.map] ? MAPS[cfg.map].name : '')}</p><dl class="kv"><dt>ボット</dt><dd>${['', '弱', '標準', '強'][cfg.botLevel || 2]}</dd>${cfg.mode === 'tdm' ? `<dt>時間</dt><dd>${cfg.time}分</dd>` : `<dt>勝利ラウンド</dt><dd>${cfg.wins}</dd>`}<dt>エイムアシスト</dt><dd>${['オフ', '弱', '標準'][cfg.aimAssist ?? 1]}</dd><dt>味方撃ち</dt><dd>${cfg.ff ? 'オン' : 'オフ'}</dd></dl>`;
    else set.innerHTML = `<h3>${esc(MISSIONS[cfg.mission] ? MISSIONS[cfg.mission].name : '')}</h3><p>${esc(MAPS[cfg.map] ? MAPS[cfg.map].name : '')}</p><dl class="kv"><dt>難易度</dt><dd>${esc(DIFFS[cfg.diff] ? DIFFS[cfg.diff].name : '')}</dd><dt>突入口</dt><dd>${esc(MAPS[cfg.map] && MAPS[cfg.map].spawn.swat[cfg.entry || 0] ? MAPS[cfg.map].spawn.swat[cfg.entry || 0].name : '')}</dd></dl><p class="note">空き枠（最大4名）はAI隊員。</p>`;
    el.querySelector('.conn').textContent = a.connText(N.link.info && N.link.info());
    const st = el.querySelector('[data-a="start"]');
    if (st) st.classList.toggle('dis', !S.canStart());
  }

  // ---- 一時停止
  _pause() {
    const a = this.app, g = a.game;
    if (g && g.S.war) return this._warPause();
    const pve = g && !g.S.pvp && g.S.m && g.S.m.kind === 'pve';
    const net = !!(g && g.net);
    const el = this._mk('pause', `<div class="pz"><h2>一時停止${net ? '<small>オンライン中は停止しません</small>' : ''}</h2>
      <nav class="t-menu">
        <button class="mi main" data-a="resume"><span class="mi-l">再開</span></button>
        <button class="mi" data-a="tablet"><span class="mi-l">地図・目的</span></button>
        <button class="mi" data-a="settings"><span class="mi-l">設定</span></button>
        <button class="mi" data-a="book"><span class="mi-l">資料室</span></button>
        ${pve && (!net || a.net.role === 'host') ? `<button class="mi" data-a="abort"><span class="mi-l">${g.S.m.softDone ? '作戦終了' : '撤収'}</span></button>` : ''}
        <button class="mi danger" data-a="quit"><span class="mi-l">${net ? '退出' : 'タイトルへ'}</span></button>
      </nav></div>`, 'dim');
    this._acts(el, {
      resume: () => a.resumeGame(),
      tablet: () => this.open('tablet'),
      settings: () => this.open('settings', 'ctrl'),
      book: () => this.open('book', 'play'),
    });
    const ab = el.querySelector('[data-a="abort"]');
    if (ab) confirmTap(ab, () => a.confirmMode(), () => a.abortMission(), '<span class="mi-l">もう一度押すと終える</span>');
    confirmTap(el.querySelector('[data-a="quit"]'), () => a.confirmMode(), () => net ? a.leaveRoom() : a.quitToTitle(), '<span class="mi-l">もう一度押すと出る</span>');
    this.show('pause'); a.scene('pause');
  }
  // WAR BIT の一時停止（BattleBit のように英語の項目。射撃場は兵科・装備を変えられる）
  _warPause() {
    const a = this.app, g = a.game, m = g.S.m, range = m.mode === 'range';
    const MD = WAR_MODES[m.mode] || WAR_MODES.conquest;
    const line = range ? 'SHOOTING RANGE' : `${MD.en} · ${sizeLabel(m.per)} · ${(WAR_MAPS[g.S.map] || {}).en || ''}`;
    const el = this._mk('pause', `<div class="pz"><h2>PAUSED<small>${esc(line)}</small></h2>
      <nav class="wt-menu pz-menu">
        <button class="wm main" data-a="resume"><b>RESUME</b><span>再開</span></button>
        ${range ? '<button class="wm" data-a="loadout"><b>LOADOUT</b><span>兵科・銃を変える</span></button>' : '<button class="wm" data-a="tablet"><b>MAP</b><span>地図・状況</span></button>'}
        <button class="wm" data-a="settings"><b>SETTINGS</b><span>設定</span></button>
        <button class="wm danger" data-a="quit"><b>QUIT</b><span>${range ? '射撃場を出る' : '試合を出る'}</span></button>
      </nav></div>`, 'dim');
    this._acts(el, {
      resume: () => a.resumeGame(),
      tablet: () => this.open('tablet'),
      settings: () => this.open('settings', 'ctrl'),
      loadout: () => { a.resumeGame(); if (a.game && a.game.p.alive) a.game.acts.push({ a: 'warRedeploy' }); },
    });
    confirmTap(el.querySelector('[data-a="quit"]'), () => a.confirmMode(), () => a.quitToTitle(), '<b>QUIT</b><span>もう一度押すと出る</span>');
    this.show('pause'); a.scene('pause');
  }
  // ---- 地図（タブレット）
  _tablet() {
    const a = this.app, g = a.game;
    if (!g) { this.back(); return; }
    if (g.S.war) return this._warTablet();
    const S = g.S, p = g.p, def = MAPS[S.map];
    const ob = g._objectives();
    const el = this._mk('tablet', `<div class="sc-wrap"><header class="sc-head">${BACK}<h2>地図</h2><span class="hint">${esc(def.name)}</span></header>
      <div class="split brief"><div class="pane planbox"><canvas class="plan"></canvas><div class="plan-lv"></div></div>
      <div class="pane rows scroll"><h3>目的</h3><div class="tab-obj">${ob.html}</div>${!S.pvp && S.m.kind === 'pve' ? `<ul class="obj">${objectives(S.m.mission).map(o => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
      <p class="note">黄: 自分　青: 味方　赤: 容疑者　緑: 市民　黄土: 投降・拘束</p></div></div></div>`, 'dim');
    const marks = [];
    for (const b of S.actors) {
      if (b.isDrone || (!b.alive && !b.dead)) continue;
      const L = Math.max(0, Math.floor((b.y + 0.4) / 3));
      if (b === p) { marks.push({ x: b.x, z: b.z, L, col: '#ffd34a', r: 6, me: true }); continue; }
      const mate = S.pvp ? b.team === p.team : b.kind === 'swat';
      if (mate) marks.push({ x: b.x, z: b.z, L, col: b.alive ? '#4aa8ff' : '#666', r: 5 });
      else if (b.spot > 0 || g._visCache(b)) marks.push({ x: b.x, z: b.z, L, col: b.kind === 'civ' ? '#7be07b' : b.cuffed || b.comply ? '#d8b44a' : '#ff4a3a', r: 5 });
    }
    if (S.m && S.m.bombs) for (const b of S.m.bombs) if (b.found && !b.done) marks.push({ x: b.x, z: b.z, L: b.L || 0, col: '#ff9a20', sq: true });
    this._drawPlan(el.querySelector('.planbox'), S.map, { marks, level: Math.max(0, Math.floor((p.y + 0.4) / 3)) });
    this.show('tablet');
  }

  // 大規模戦の地図: 全体の絵・拠点・本陣・自分と味方
  _warTablet() {
    const a = this.app, g = a.game, S = g.S, p = g.p;
    const ob = g._objectives();
    const el = this._mk('tablet', `<div class="sc-wrap"><header class="sc-head">${BACK}<h2>MAP</h2><span class="hint">${esc(WAR_MAPS[S.map].en)}（${esc(WAR_MAPS[S.map].name)}）</span></header>
      <div class="split brief"><div class="pane planbox"><canvas class="plan"></canvas></div>
      <div class="pane rows scroll"><h3>状況</h3><div class="tab-obj">${ob.html}</div>
      <p class="note">黄: 自分　青: 味方　赤: 敵　四角: 本陣（取れない出撃地点）　丸: 拠点　赤い点線: 範囲（外に10秒いると死亡）</p></div></div></div>`, 'dim');
    const box = el.querySelector('.planbox'), cv = box.querySelector('canvas');
    const img = this._warImg && this._warImg.w === g.w && this._warImg.size === S.m.size ? this._warImg.img : (this._warImg = { w: g.w, size: S.m.size, img: warPlanImage(g.w, S.m) }).img;
    requestAnimationFrame(() => {
      const r = box.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), side = Math.max(120, Math.min(r.width, r.height) - 8);
      cv.width = Math.round(side * dpr); cv.height = Math.round(side * dpr); cv.style.width = side + 'px'; cv.style.height = side + 'px';
      const ctx = cv.getContext('2d');
      // 範囲（少し外まで）を切り出して描く
      const R = S.m.rect, pad = 60, x0 = Math.max(0, R[0] - pad), z0 = Math.max(0, R[1] - pad), span = Math.max(R[2] - R[0], R[3] - R[1]) + pad * 2;
      const k = cv.width / span;
      ctx.drawImage(img, x0 / 2, z0 / 2, span / 2, span / 2, 0, 0, cv.width, cv.height);
      const toXY = (x, z) => [(x - x0) * k, (z - z0) * k];
      drawWarMarks(ctx, S.m, p.team, toXY, dpr * 1.2);
      for (const b of S.actors) {
        if (!b.alive) continue;
        const [x, y] = toXY(b.x, b.z);
        ctx.fillStyle = b === p ? '#ffd34a' : b.team === p.team ? '#4aa8ff' : '#ff4a3a';
        if (b !== p && b.team !== p.team && !(b.spot > 0 || g._visCache(b))) continue;
        ctx.beginPath(); ctx.arc(x, y, (b === p ? 5 : 3.5) * dpr, 0, Math.PI * 2); ctx.fill();
        if (b === p) { ctx.strokeStyle = '#ffd34a'; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(b.yaw) * 14 * dpr, y + Math.cos(b.yaw) * 14 * dpr); ctx.stroke(); }
      }
    });
    this.show('tablet');
  }

  // ---- 結果
  _result(res) {
    const a = this.app;
    if (res.pvp) return this._resultPvp(res);
    const sc = res.score || { parts: [], total: 0, grade: 'F', viol: [], stats: {} };
    const M = MISSIONS[res.mission] || { name: '' };
    const why = { wiped: '部隊全滅', hostages: '人質全員死亡', bomb: '爆弾爆発', player: '', ai: 'AI部隊が任務終了' }[res.why] || '';
    const VN = { kill_unjust: '不当な殺傷', civkill: '市民の死亡', civhurt: '市民の負傷', civforce: '市民への実力行使', force: '不当な実力行使', ff: '味方への発砲' };
    const st = sc.stats || {};
    const acc = res.me && res.me.sh ? Math.round(100 * res.me.hi / res.me.sh) : 0;
    const el = this._mk('result', `<div class="sc-wrap"><header class="sc-head"><h2>${res.res === 'fail' ? '作戦失敗' : res.res === 'abort' && !res.soft ? '撤収' : '作戦完了'}</h2><span class="hint">${esc(MAPS[res.map].name)} · ${esc(M.name)} · ${esc(DIFFS[res.diff] ? DIFFS[res.diff].name : '')}${why ? ' · ' + why : ''}</span></header>
      <div class="split result">
        <div class="pane gradebox"><div class="grade" style="color:${GRADE_COL[sc.grade]}">${sc.grade}</div><div class="total">${sc.total}<small>/100</small></div>
          <dl class="kv"><dt>時間</dt><dd>${fmtTime(st.time || 0)}</dd><dt>逮捕</dt><dd>${st.arrested || 0}/${st.susTotal || 0}</dd><dt>容疑者の死亡</dt><dd>${st.killed || 0}</dd><dt>救出</dt><dd>${st.rescued || 0}/${st.civTotal || 0}</dd><dt>命中率</dt><dd>${acc}%</dd></dl></div>
        <div class="pane rows scroll"><table class="score"><tbody>${sc.parts.map(p => `<tr><th>${esc(p.name)}<small>${esc(p.note || '')}</small></th><td>${p.got}<small>/${p.max}</small></td></tr>`).join('')}</tbody></table>
          ${sc.viol.length ? `<h3>違反</h3><ul class="viol">${sc.viol.map(v => `<li><b>${esc(VN[v.v] || v.v)}</b>${v.byName ? `（${esc(v.byName)}）` : ''} −${v.pen}</li>`).join('')}</ul>` : '<p class="good">交戦規定違反なし</p>'}</div>
      </div>
      <div class="sc-foot">${res.net ? (a.net && a.net.role === 'host' ? '<button class="btn primary" data-a="again">ロビーへ</button>' : '<span class="wait">ホスト待ち…</span>') : '<button class="btn ghost" data-a="lo">装備</button><button class="btn primary" data-a="again">再出動</button>'}<button class="btn ghost" data-a="title">${res.net ? '退出' : 'タイトルへ'}</button></div></div>`, 'dim');
    this._acts(el, {
      again: () => res.net ? a.netAgain() : a.startPve(a.lastPve),
      lo: () => this.open('loadout', { kind: 'pve', team: a.lastPve ? a.lastPve.team : 4 }),
      title: () => res.net ? a.leaveRoom() : a.toTitle(),
    });
    this.show('result'); a.scene('pause');
  }
  // WAR BIT の結果（BattleBit の終わりの画面のように: 勝敗・理由・両チームの数字・両チームの表・もう一度）
  _warResult(res) {
    const a = this.app, my = res.myTeam, win = res.win === my, draw = res.win < 0;
    const MD = WAR_MODES[res.wmode] || WAR_MODES.conquest;
    const WHY = { tickets: win ? '敵のチケットが尽きた' : '味方のチケットが尽きた', score: res.wmode === 'tdm' ? 'キルの数が目標に届いた' : '点が目標に届いた', time: '時間切れ' };
    const unit = res.wmode === 'conquest' ? 'TICKETS' : res.wmode === 'tdm' ? 'KILLS' : 'SCORE';
    const rows = (t) => (res.rows || []).filter(r => r.team === t);
    const me = (res.rows || []).find(r => r.me) || { k: 0, d: 0, a: 0 };
    const mvp = (res.rows || [])[0];
    const table = (t, cls, name) => `<div class="wr-team ${cls}"><div class="wr-th"><b>${name}</b><span>${res.score[t]}</span></div>
      <table class="board"><thead><tr><th></th><th>K</th><th>D</th><th>A</th></tr></thead><tbody>${rows(t).slice(0, 32).map(r => `<tr class="${r.me ? 'me' : ''}"><th>${r === mvp ? '<em>MVP</em>' : ''}${esc(r.name || '?')}${r.bot ? '' : '<small>YOU</small>'}</th><td>${r.k}</td><td>${r.d}</td><td>${r.a}</td></tr>`).join('')}</tbody></table></div>`;
    const el = this._mk('result', `<div class="sc-wrap wr">
      <header class="wr-head"><h2 class="${draw ? '' : win ? 'good' : 'bad'}">${draw ? 'DRAW' : win ? 'VICTORY' : 'DEFEAT'}</h2>
        <div class="wr-sub"><b>${draw ? '引き分け' : win ? '勝利' : '敗北'} ― ${esc(WHY[res.why] || '')}</b><span>${MD.en} · ${sizeLabel(res.per || 16)} · ${esc((WAR_MAPS[res.map] || {}).en || '')} · ${fmtTime(res.time || 0)}</span></div>
        <div class="wr-me"><span>YOU</span><b>${me.k}</b><small>K</small><b>${me.d}</b><small>D</small><b>${me.a}</b><small>A</small></div></header>
      <div class="wr-score"><b class="t0">${res.score[my]}</b><span>${unit}</span><b class="t1">${res.score[1 - my]}</b></div>
      <div class="wr-teams scroll">${table(my, 'ally', 'ALLY')}${table(1 - my, 'enemy', 'ENEMY')}</div>
      <div class="sc-foot"><button class="btn primary" data-a="again">PLAY AGAIN<small>同じモードと人数</small></button><button class="btn ghost" data-a="menu">MENU</button></div></div>`, 'dim');
    this._acts(el, { again: () => a.startWar(a.lastWar), menu: () => a.toTitle() });
    this.show('result'); a.scene('pause');
  }
  _resultPvp(res) {
    const a = this.app;
    if (res.war) return this._warResult(res);
    const mine = res.win === res.myTeam;
    const MODE = res.war ? { name: 'コンクエスト（大規模戦）' } : MODE_INFO[res.mode] || { name: '' };
    const mapName = res.war ? (WAR_MAPS[res.map] || {}).name || '' : MAPS[res.map].name;
    const rows = (res.rows || []).slice(0, res.war ? 40 : 99);
    const el = this._mk('result', `<div class="sc-wrap"><header class="sc-head"><h2 class="${res.win < 0 ? '' : mine ? 'good' : 'bad'}">${res.win < 0 ? '引き分け' : mine ? '勝利' : '敗北'}</h2><span class="hint">${esc(MODE.name)} · ${esc(mapName)} · ${fmtTime(res.time || 0)}${res.war ? ' · 残りチケット' : ''}</span></header>
      <div class="pvp-score"><b class="t0">${res.score[res.myTeam]}</b><span>—</span><b class="t1">${res.score[1 - res.myTeam]}</b></div>
      <div class="pane scroll"><table class="board"><thead><tr><th>名前</th><th>キル</th><th>デス</th><th>アシスト</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${r.team === res.myTeam ? 'ally' : 'enemy'}${r.me ? ' me' : ''}"><th>${i === 0 ? '<em>MVP</em>' : ''}${esc(r.name)}${r.bot ? '<small>ボット</small>' : ''}</th><td>${r.k}</td><td>${r.d}</td><td>${r.a}</td></tr>`).join('')}</tbody></table></div>
      <div class="sc-foot">${res.net ? (a.net && a.net.role === 'host' ? '<button class="btn primary" data-a="again">ロビーへ</button>' : '<span class="wait">ホスト待ち…</span>') : '<button class="btn primary" data-a="again">再戦</button>'}<button class="btn ghost" data-a="title">${res.net ? '退出' : 'タイトルへ'}</button></div></div>`, 'dim');
    this._acts(el, { again: () => res.net ? a.netAgain() : res.war ? a.startWar(a.lastWar) : a.startPvp(a.lastPvp), title: () => res.net ? a.leaveRoom() : a.toTitle() });
    this.show('result'); a.scene('pause');
  }

  // ---- 設定
  _settings(tab = 'ctrl') {
    const a = this.app, S = a.settings;
    const TABS = [['ctrl', '操作'], ['sens', '感度'], ['hud', 'HUD'], ['gfx', '画質'], ['snd', '音'], ['etc', 'その他']];
    const el = this._mk('settings', `<div class="sc-wrap"><header class="sc-head">${BACK}<h2>SETTINGS</h2><div class="tabs">${TABS.map(([k, n]) => `<button class="tab${k === tab ? ' on' : ''}" data-tab="${k}">${n}</button>`).join('')}</div></header><div class="pane rows scroll set-body"></div></div>`, 'dim');
    el.querySelectorAll('[data-tab]').forEach(b => onTap(b, () => { this.app.audio.ui('tap'); this.args = [b.dataset.tab]; this._noKeep = true; this._settings(b.dataset.tab); }));
    const body = el.querySelector('.set-body');
    const save = () => a.applySettings();
    const R = [];
    const row = (label, sub, k) => { R.push(`<div class="row"><div class="rl"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</div><div class="rc" data-k="${k}"></div></div>`); };
    const note = (t) => R.push(`<p class="note">${t}</p>`);
    const binds = [];
    const ch = (k, list, path) => binds.push(() => chips(body.querySelector(`[data-k="${k}"]`), list, getP(S, path || k), (v) => { setP(S, path || k, v); save(); }));
    const sl = (k, min, max, step, fmt, path) => binds.push(() => slider(this.stage, body.querySelector(`[data-k="${k}"]`), { min, max, step, value: getP(S, path || k), fmt, label: k, onInput: (v) => { setP(S, path || k, v); save(); } }));
    const pct = (v) => Math.round(v * 100) + '%';
    if (tab === 'ctrl') {
      row('ADS', '照準ボタン', 'adsMode'); ch('adsMode', [['tap', '切替'], ['hold', '長押し'], ['mixed', '両方']]);
      row('リーン', '', 'leanMode'); ch('leanMode', [['toggle', '切替'], ['hold', '長押し']]);
      row('移動スティック', '', 'stickMode'); ch('stickMode', [['float', '可変'], ['fixed', '固定']]);
      row('スティックでダッシュ', '上へ押し込む', 'stickSprint'); ch('stickSprint', [[true, 'オン'], [false, 'オフ']]);
      row('ダッシュの固定', 'ダッシュの所で指を離すと走り続ける（撃つ・構える・リーン・リロードの間は止まり、終わるとまた走る。スティックかほかのボタンでやめる）', 'stickLock'); ch('stickLock', [[false, 'オフ'], [true, 'オン']]);
      row('射撃ボタン（左）', '', 'leftFire'); ch('leftFire', [[true, '表示'], [false, '非表示']]);
      row('射撃ボタンで視点移動', '押したままドラッグ', 'fireLook'); ch('fireLook', [[true, 'オン'], [false, 'オフ']]);
      row('利き手', 'ボタンの左右を反転', 'handed'); ch('handed', [['right', '右'], ['left', '左']]);
      note('キーボード: WASD 移動／Shift 走る／マウス 視点（画面をクリック）／左クリック 射撃／右クリック ADS／Q・E リーン／C しゃがみ／Z 伏せ／Space 乗り越え／R リロード（長押しで高速）／G 投げ物／1・2 武器／X 射撃モード／T ライト／Y 近接（銃床）／Tab スコア表／M 地図／Esc 一時停止');
    } else if (tab === 'sens') {
      row('視点', '', 'sens'); sl('sens', 0.2, 3, 0.05, (v) => v.toFixed(2));
      row('ADS', '等倍', 'sensAds'); sl('sensAds', 0.2, 1.5, 0.05, pct);
      row('スコープ', '倍率あり（4倍が基準。倍率に合わせて変わる）', 'sensScope'); sl('sensScope', 0.1, 1.2, 0.05, pct);
      row('射撃中', '射撃ボタンで視点移動', 'sensFire'); sl('sensFire', 0.3, 1.5, 0.05, pct);
      row('上下反転', '', 'invertY'); ch('invertY', [[false, 'オフ'], [true, 'オン']]);
      row('エイムアシスト', '照準が敵へ少し寄る', 'aimAssist'); ch('aimAssist', [['off', 'オフ'], ['weak', '弱'], ['strong', '標準']]);
      row('ジャイロ', '端末の傾きで照準', 'gyro'); ch('gyro', [['off', 'オフ'], ['ads', 'ADS時'], ['always', '常時']]);
      row('ジャイロ感度', '', 'gyroSens'); sl('gyroSens', 0.2, 3, 0.05, (v) => v.toFixed(2));
      row('ジャイロ 左右', '', 'gyroInvX'); ch('gyroInvX', [[false, '標準'], [true, '反転']]);
      row('ジャイロ 上下', '', 'gyroInvY'); ch('gyroInvY', [[false, '標準'], [true, '反転']]);
      R.push('<div class="row"><div class="rl"><b>ジャイロの許可</b><small>iPhoneは初回に許可が必要</small></div><div class="rc"><button class="btn small" data-a="gyroPerm">許可</button></div></div>');
    } else if (tab === 'hud') {
      R.push('<div class="row"><div class="rl"><b>HUDの配置</b><small>ボタン・字幕などの位置・大きさ・濃さ</small></div><div class="rc"><button class="btn small" data-a="editHud">配置を編集</button></div></div>');
      row('全体の濃さ', '', 'hudOpacity'); sl('hudOpacity', 0.2, 1, 0.05, pct);
      row('全体の大きさ', '', 'hudScale'); sl('hudScale', 0.75, 1.3, 0.05, pct);
      // 移動スティック（位置は「配置を編集」でスティックをドラッグ）
      const stk = () => { const H = S.hud || (S.hud = {}); return H.stick || (H.stick = {}); };
      row('移動スティックの大きさ', '位置は「配置を編集」でドラッグ', 'stickS'); binds.push(() => slider(this.stage, body.querySelector('[data-k="stickS"]'), { min: 0.6, max: 1.8, step: 0.05, value: (S.hud && S.hud.stick && S.hud.stick.s) || 1, fmt: pct, label: '移動スティックの大きさ', onInput: (v) => { stk().s = v; save(); } }));
      row('移動スティックの濃さ', '', 'stickO'); binds.push(() => slider(this.stage, body.querySelector('[data-k="stickO"]'), { min: 0.15, max: 1, step: 0.05, value: (S.hud && S.hud.stick && S.hud.stick.o) ?? 0.55, fmt: pct, label: '移動スティックの濃さ', onInput: (v) => { stk().o = v; save(); } }));
      row('ダッシュの判定位置', 'スティックの中心からの距離（半径の何倍か）', 'stickSpr'); binds.push(() => slider(this.stage, body.querySelector('[data-k="stickSpr"]'), { min: 1, max: 2.4, step: 0.05, value: (S.hud && S.hud.stick && S.hud.stick.spr) ?? 1.25, fmt: (v) => v.toFixed(2) + '倍', label: 'ダッシュの判定位置', onInput: (v) => { stk().spr = v; save(); } }));
      row('長押しメニューの大きさ', '命令などの円形メニュー', 'radialScale'); sl('radialScale', 0.8, 1.6, 0.05, pct);
      row('照準', '腰だめ', 'crosshair'); ch('crosshair', [['cross', '十字'], ['dot', '点'], ['none', 'なし']]);
      row('照準の色', '', 'crossColor'); binds.push(() => chips(body.querySelector('[data-k="crossColor"]'), [['#ffffff', '白'], ['#7dff7a', '緑'], ['#ffe14a', '黄'], ['#4ae8ff', '水色'], ['#ff5ad2', '桃']], S.crossColor, (v) => { S.crossColor = v; save(); }, { swatch: true }));
      row('ミニマップ', 'タップで地図', 'minimap'); ch('minimap', [[true, '表示'], [false, '非表示']]);
      row('字幕', '無線と呼びかけ', 'subtitles'); ch('subtitles', [[true, '表示'], [false, '非表示']]);
      row('字幕の位置', '自由な位置は「配置を編集」', 'subPos');
      binds.push(() => { const H = S.hud || (S.hud = {}); const cur = H.i_subs && H.i_subs.ay === 't' ? 't' : (H.i_subs && (H.i_subs.x || H.i_subs.y != null) && !H.i_subs.preset ? 'free' : 'b'); chips(body.querySelector('[data-k="subPos"]'), [['b', '下'], ['t', '上'], ...(cur === 'free' ? [['free', '自由']] : [])], cur, (v) => { if (v === 'free') return; const o = H.i_subs || (H.i_subs = {}); o.ay = v; o.x = 0; o.y = v === 't' ? 84 : 78; o.preset = true; save(); }); });
      row('字幕の大きさ', '', 'subSize'); binds.push(() => { const H = S.hud || (S.hud = {}); slider(this.stage, body.querySelector('[data-k="subSize"]'), { min: 0.7, max: 1.6, step: 0.05, value: (H.i_subs && H.i_subs.s) || 1, fmt: pct, label: '字幕の大きさ', onInput: (v) => { const o = H.i_subs || (H.i_subs = {}); o.s = v; save(); } }); });
      row('字幕の濃さ', '後ろの帯', 'subBg'); sl('subBg', 0, 0.9, 0.05, pct);
      row('ヒットマーカー', '', 'hitMarker'); ch('hitMarker', [[true, '表示'], [false, '非表示']]);
    } else if (tab === 'gfx') {
      // まとめて選ぶ（低・中・高）と、細かい設定（変えるとカスタム）
      const G = gfxOf(S);
      row('画質', 'まとめて選ぶ。下の項目を変えるとカスタム', 'quality');
      binds.push(() => chips(body.querySelector('[data-k="quality"]'), Object.keys(QUALITY).map(k => [k, QUALITY[k].name]), S.quality, (v) => { S.quality = v; if (v !== 'custom') S.gfx = { ...GFX_PRESET[v] }; else S.gfx = { ...G }; save(); this._settings('gfx'); }));
      const gc = (k, label, sub, list) => { row(label, sub, 'g_' + k); binds.push(() => chips(body.querySelector(`[data-k="g_${k}"]`), list, G[k], (v) => { S.gfx = { ...gfxOf(S), [k]: v }; if (S.quality !== 'custom') { S.quality = 'custom'; save(); this._settings('gfx'); return; } save(); })); };
      gc('detail', '描画の細かさ', '画面の細かさの上限。高いほど重い', [['low', '低'], ['medium', '中'], ['high', '高'], ['max', '最高']]);
      row('解像度', '描画の細かさに対する割合', 'scale'); sl('scale', 0.5, 1, 0.05, pct);
      row('解像度の自動調整', '重いときに下げる', 'autoRes'); ch('autoRes', [[true, 'オン'], [false, 'オフ']]);
      row('フレームレート上限', '', 'fps'); ch('fps', [[30, '30'], [60, '60']]);
      gc('shadow', '影', '日の光の影（夜のマップでは出ない）', [['off', 'なし'], ['low', '低'], ['high', '高']]);
      gc('bloom', '光のにじみ', '明るい所がにじむ（ブルーム）', [[false, 'オフ'], [true, 'オン']]);
      gc('aa', 'アンチエイリアス', '輪郭のギザギザを減らす', [['off', 'なし'], ['fxaa', 'FXAA'], ['msaa', 'MSAA 4x']]);
      gc('lights', '動く光の数', 'ライト・銃口の炎・爆発の光', [[2, '2'], [4, '4'], [6, '6'], [8, '8']]);
      gc('fx', 'エフェクトの量', '粉じん・火花・煙', [['low', '少なめ'], ['normal', '標準'], ['high', '多め']]);
      gc('shells', '薬莢', '飛び出す薬莢', [[true, '表示'], [false, '非表示']]);
      row('視野角', '横の角度（16:9の画面で）。横長の画面ではもっと広く見える', 'hfov'); sl('hfov', 70, 110, 1, (v) => v + '°');
      row('武器の視野角', '手と銃の見え方。小さいほど大きく見える', 'vmFov'); sl('vmFov', 45, 70, 1, (v) => v + '°');
      row('明るさ', '', 'bright'); sl('bright', 0.6, 1.6, 0.05, pct);
      row('色の鮮やかさ', '', 'sat'); sl('sat', 0.6, 1.5, 0.02, pct);
      row('周辺減光', '画面のふちを暗く', 'vignette'); ch('vignette', [[true, 'オン'], [false, 'オフ']]);
      row('流血表現', '', 'blood'); ch('blood', [[true, 'オン'], [false, 'オフ']]);
      row('画面の揺れ', '', 'shake'); ch('shake', [[true, '標準'], [false, '弱']]);
      row('FPS表示', '', 'showFps'); ch('showFps', [[false, 'オフ'], [true, 'オン']]);
    } else if (tab === 'snd') {
      row('全体', '', 'vm'); sl('vm', 0, 1, 0.05, pct, 'vol.master');
      row('効果音', '', 'vs'); sl('vs', 0, 1, 0.05, pct, 'vol.sfx');
      row('ボイス', '', 'vv'); sl('vv', 0, 1, 0.05, pct, 'vol.voice');
      row('BGM', '', 'vb'); sl('vb', 0, 1, 0.05, pct, 'vol.bgm');
      row('UI', 'ボタン・ヒット音', 'vu'); sl('vu', 0, 1, 0.05, pct, 'vol.ui');
      row('消音モードでも再生', 'オンでロック画面に再生中と表示', 'playSilent'); ch('playSilent', [[false, 'オフ'], [true, 'オン']]);
      note('ヘッドホン推奨（足音と銃声の方向が分かる）');
    } else {
      R.push(`<div class="row"><div class="rl"><b>コールサイン</b><small>分隊の欄と結果に表示</small></div><div class="rc"><span class="nmv">${esc(a.profile.name)}</span><button class="btn small" data-a="rename">変更</button></div></div>`);
      R.push('<div class="row"><div class="rl"><b>引き継ぎコード</b><small>設定・コールサイン・装備・記録を移す</small></div><div class="rc"><button class="btn small" data-a="exp">書き出し</button><button class="btn small" data-a="imp">読み込み</button></div></div>');
      R.push('<div class="row"><div class="rl"><b>記録の消去</b></div><div class="rc"><button class="btn small danger" data-a="clr">消去</button></div></div>');
      note(`版: 互換${COMPAT} · v${VERSION}`);
    }
    body.innerHTML = R.join('');
    for (const f of binds) f();
    if (this._restoreScroll) this._restoreScroll();
    this._acts(body, {
      gyroPerm: async () => { const ok = await a.input.requestGyro(); this.flash(ok ? 'ジャイロ有効' : '許可されませんでした'); },
      editHud: () => a.editHud(() => this._settings('hud')),
      rename: async () => { const v = await textModal({ title: 'コールサイン', value: a.profile.name, maxLength: 12, validate: (t) => t.trim() ? '' : '入力してください' }); if (v) { a.profile.name = v.trim().slice(0, 12); a.saveProfile(); this._settings('etc'); } },
      exp: async () => { const code = a.exportCode(); const ok = await copyText(code); await textModal({ title: '引き継ぎコード', note: ok ? 'コピーしました。移行先の「読み込み」に貼り付け。' : 'コードを選択してコピー。', value: code, readonly: true, multiline: true, ok: '閉じる' }); },
      imp: async () => { const v = await textModal({ title: '引き継ぎコード', multiline: true, validate: (t) => a.checkCode(t) ? '' : 'コードが正しくありません' }); if (v && a.importCode(v)) { this.flash('読み込み完了'); this._settings('etc'); } },
    });
    const clr = body.querySelector('[data-a="clr"]');
    if (clr) confirmTap(clr, () => a.confirmMode(), () => { a.clearRecords(); this.flash('記録を消去'); }, 'もう一度押して消去');
    this.show('settings');
  }

  // ---- 資料室（手順書と資料）
  _book(tab = 'play') {
    const el = this._mk('book', `<div class="sc-wrap"><header class="sc-head">${BACK}<h2>資料室</h2><div class="tabs book-tabs"></div></header><div class="pane rows scroll book-body"></div></div>`, 'dim');
    this.bk = new Book(this.app, el, tab, (t) => { this.args = [t]; });
    this.show('book');
  }
}
function getP(o, p) { return p.split('.').reduce((x, k) => x && x[k], o); }
function setP(o, p, v) { const ks = p.split('.'); let x = o; for (let i = 0; i < ks.length - 1; i++) x = x[ks[i]] = x[ks[i]] || {}; x[ks[ks.length - 1]] = v; }
export function objectives(mission) {
  const base = ['容疑者を全員、逮捕または無力化する', '市民を全員、拘束して保護する'];
  const extra = { hostage: ['人質を生きたまま救出する'], bomb: ['制限時間までに爆弾をすべて解除する'], raid: ['証拠をすべて回収する'], active: ['乱射犯を一刻も早く止める'], barricade: [] }[mission] || [];
  return base.concat(extra, ['（副目的）拘束した人・倒れた人をTOCへ報告する', '（副目的）落ちた武器と証拠を回収する']);
}
