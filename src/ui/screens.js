// 画面: 読み込み・タイトル・作戦の準備（マップ・作戦・難易度・人数・突入口）・ブリーフィング・装備・対戦の準備・
// みんなで（部屋を作る/入る・ロビー）・一時停止・地図（タブレット）・結果・設定・図鑑とヘルプ
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
import { QUALITY } from '../render/renderer.js';

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
    el.innerHTML = html;
    const b = el.querySelector('[data-back]');
    if (b) onTap(b, () => { this.app.audio.ui('back'); this.back(); });
    el.querySelectorAll('.scroll').forEach(s => new Scroller(this.stage, s));
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
    if (!this.el.loading) this._mk('loading', `<div class="ld"><div class="ld-name">${TITLE}</div><div class="ld-bar"><i></i></div><div class="ld-msg"></div></div>`);
    const el = this.el.loading;
    el.querySelector('.ld-msg').textContent = msg || '';
    el.querySelector('.ld-bar i').style.width = Math.round((p || 0) * 100) + '%';
    if (this.cur !== 'loading') this.show('loading');
  }
  error(msg, detail) {
    this._mk('loading', `<div class="ld"><div class="ld-name">${TITLE}</div><p class="ld-err">${esc(msg)}${detail ? `<small>${esc(detail)}</small>` : ''}</p></div>`);
    this.show('loading');
  }

  // ---- タイトル
  _title() {
    const a = this.app, run = a.savedRun();
    const el = this._mk('title', `
      <div class="t-logo"><div class="t-badge">SWAT · CQB</div><h1>HARD<b>ENTRY</b></h1><p>突入、制圧、確保。撃つのは最後の手段。</p></div>
      <nav class="t-menu" aria-label="メニュー">
        ${run ? `<button class="mi main" data-a="continue"><span class="mi-l">続きから</span><span class="mi-d">${esc(run.label)}</span></button>` : ''}
        <button class="mi ${run ? '' : 'main'}" data-a="pve"><span class="mi-l">作戦</span><span class="mi-d">PvE · ひとり／みんなで</span></button>
        <button class="mi" data-a="pvp"><span class="mi-l">対戦</span><span class="mi-d">PvP · 1v1〜4v4</span></button>
        <button class="mi" data-a="train"><span class="mi-l">訓練</span><span class="mi-d">射撃場・キルハウス</span></button>
        <button class="mi" data-a="settings"><span class="mi-l">設定</span></button>
        <button class="mi" data-a="book"><span class="mi-l">図鑑・遊び方</span></button>
      </nav>
      <div class="t-foot"><span>ヘッドホン推奨</span><span class="ver">互換${COMPAT} · v${VERSION}</span></div>`);
    this._acts(el, {
      continue: () => a.continueRun(),
      pve: () => this.open('pveMenu'),
      pvp: () => this.open('pvpMenu'),
      train: () => this.open('train'),
      settings: () => this.open('settings', 'ctrl'),
      book: () => this.open('book', 'play'),
    });
    this.show('title');
    a.scene('title');
  }
  _pveMenu() {
    const a = this.app;
    const el = this._mk('pveMenu', `<div class="sc-wrap"><header class="sc-head">${BACK}<h2>作戦</h2><span class="hint">Ready Or Not のように、建物の中の目的を達成する</span></header>
      <div class="big-choice">
        <button class="bc" data-a="solo"><b>ひとりで</b><span>AIの隊員（0〜3人）を率いる。命令で扉を開けさせ、突入させる。</span></button>
        <button class="bc" data-a="multi"><b>みんなで</b><span>2〜4人で協力。空いた枠はAIの隊員が入る。部屋のコードかリンクで招く。</span></button>
      </div></div>`, 'dim');
    this._acts(el, { solo: () => this.open('mission'), multi: () => this.open('multi', 'pve') });
    this.show('pveMenu'); a.scene('menu');
  }
  _pvpMenu() {
    const a = this.app;
    const el = this._mk('pvpMenu', `<div class="sc-wrap"><header class="sc-head">${BACK}<h2>対戦</h2><span class="hint">SWAT 対 立てこもり犯。シージ式の攻守も</span></header>
      <div class="big-choice">
        <button class="bc" data-a="solo"><b>ひとりで（ボット）</b><span>自分以外はすべてボット。人数・モード・強さを決めて練習できる。</span></button>
        <button class="bc" data-a="multi"><b>みんなで</b><span>1v1〜4v4、人数の違う組み合わせも。空いた枠はボットが入る。</span></button>
      </div></div>`, 'dim');
    this._acts(el, { solo: () => this.open('pvpSetup', null), multi: () => this.open('multi', 'pvp') });
    this.show('pvpMenu'); a.scene('menu');
  }
  _train() {
    const a = this.app;
    const el = this._mk('train', `<div class="sc-wrap"><header class="sc-head">${BACK}<h2>訓練</h2></header>
      <div class="big-choice three">
        <button class="bc" data-a="range"><b>射撃場</b><span>的を撃って反動と照準を確かめる。弾はその場で補給される。</span></button>
        <button class="bc" data-a="house"><b>キルハウス</b><span>役者（訓練弾）相手に、呼びかけ・拘束・命令を練習する。</span></button>
        <button class="bc" data-a="lo"><b>装備</b><span>訓練で使う装備（作戦と同じ）を選ぶ。</span></button>
      </div></div>`, 'dim');
    this._acts(el, { range: () => a.startTrain({ start: 'range' }), house: () => a.startTrain({ start: 'house' }), lo: () => this.open('loadout', { kind: 'pve' }) });
    this.show('train'); a.scene('menu');
  }

  // ---- 作戦の準備（ひとり／ホストのロビーでも使う）
  _mission(opt = {}) {
    const a = this.app, s = opt.sel || this.sel;
    if (!PVE_MAPS.includes(s.map)) s.map = PVE_MAPS[0];
    const def = MAPS[s.map];
    const entries = (def.spawn.swat || []).map((e, i) => [i, e.name]);
    if (s.entry >= entries.length) s.entry = 0;
    const net = !!opt.net;
    const el = this._mk('mission', `<div class="sc-wrap"><header class="sc-head">${BACK}<h2>${net ? '作戦の設定' : '作戦の準備'}</h2><span class="hint">${esc(def.name)}</span></header>
      <div class="split">
        <div class="pane maps scroll">${PVE_MAPS.map(id => { const m = MAPS[id]; return `<button class="mapcard${id === s.map ? ' on' : ''}" data-map="${id}"><b>${esc(m.name)}</b><small>${esc(m.en)} · ${TIME_JA[m.time] || ''}${m.levels.length > 1 ? ` · ${m.levels.length}階` : ''}</small></button>`; }).join('')}</div>
        <div class="pane rows scroll">
          <div class="row"><div class="rl"><b>作戦</b></div><div class="rc" data-k="mission"></div></div>
          <p class="note mdesc">${esc(MISSIONS[s.mission].desc)}</p>
          <div class="row"><div class="rl"><b>難易度</b></div><div class="rc" data-k="diff"></div></div>
          <p class="note ddesc">${esc(DIFFS[s.diff].desc)}</p>
          ${net ? '' : `<div class="row"><div class="rl"><b>隊の人数</b><small>あなた＋AI</small></div><div class="rc" data-k="team"></div></div>`}
          <div class="row"><div class="rl"><b>突入口</b></div><div class="rc" data-k="entry"></div></div>
          <p class="note">${esc(def.desc)}</p>
        </div>
      </div>
      <div class="sc-foot"><button class="btn ghost" data-a="lo">装備</button><button class="btn primary" data-a="go">${net ? '決定' : 'ブリーフィングへ'}</button></div></div>`, 'dim');
    el.querySelectorAll('[data-map]').forEach(b => onTap(b, () => { s.map = b.dataset.map; s.entry = 0; this.app.audio.ui('tap'); this._mission(opt); }));
    chips(el.querySelector('[data-k="mission"]'), MISSION_LIST.filter(m => !def.missions || def.missions[m]).map(m => [m, MISSIONS[m].name]), s.mission, (v) => { s.mission = v; el.querySelector('.mdesc').textContent = MISSIONS[v].desc; });
    chips(el.querySelector('[data-k="diff"]'), Object.keys(DIFFS).map(d => [d, DIFFS[d].name]), s.diff, (v) => { s.diff = v; el.querySelector('.ddesc').textContent = DIFFS[v].desc; });
    if (!net) chips(el.querySelector('[data-k="team"]'), [[1, 'ひとり'], [2, '2人'], [3, '3人'], [4, '4人']], s.team, (v) => { s.team = v; });
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
          <h3>交戦規定</h3><p class="note">致死的な力（実弾）を使ってよいのは、相手が銃を向けた・撃った・抜こうとしたとき、または武器を持ったまま何度警告しても従わないときだけ。投降した人・拘束した人・丸腰の人・市民を撃つと大きく減点。まず「警告」で呼びかけ、従った人は拘束し、本部（TOC）へ報告する。</p>
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
    try { w = baseWorld(mapId); } catch (e) { box.innerHTML = '<p class="note">見取り図を作れませんでした</p>'; return; }
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
    const el = this._mk('loadout', `<div class="sc-wrap"><header class="sc-head">${BACK}<h2>装備</h2><span class="hint">${o.kind === 'pvp' ? '対戦の装備（陣営ごと）' : '自分とAI隊員の装備'}</span></header><div class="lo-host"></div></div>`, 'dim');
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
    const el = this._mk('pvpSetup', `<div class="sc-wrap"><header class="sc-head">${BACK}<h2>${net ? '部屋の設定' : '対戦の準備'}</h2><span class="hint">${esc(MODE_INFO[s.mode].name)} · ${esc(def.name)}</span></header>
      <div class="split">
        <div class="pane maps scroll">${maps.map(id => { const m = MAPS[id]; return `<button class="mapcard${id === s.map ? ' on' : ''}" data-map="${id}"><b>${esc(m.name)}</b><small>${PVP_MAPS.includes(id) && !PVE_MAPS.includes(id) ? '対戦用' : '作戦と共用'} · ${TIME_JA[m.time] || ''}</small></button>`; }).join('')}</div>
        <div class="pane rows scroll">
          <div class="row"><div class="rl"><b>モード</b></div><div class="rc" data-k="mode"></div></div>
          <p class="note modedesc">${esc(MODE_INFO[s.mode].desc)}</p>
          ${net ? '' : `<div class="row"><div class="rl"><b>あなたのチーム</b><small>人数（自分を含む）</small></div><div class="rc" data-k="t0"></div></div>
          <div class="row"><div class="rl"><b>相手チーム</b><small>人数</small></div><div class="rc" data-k="t1"></div></div>
          <div class="row"><div class="rl"><b>陣営</b><small>最初の陣営</small></div><div class="rc" data-k="side"></div></div>`}
          <div class="row"><div class="rl"><b>ボットの強さ</b></div><div class="rc" data-k="bot"></div></div>
          <div class="row tdm-only"><div class="rl"><b>時間</b></div><div class="rc" data-k="time"></div></div>
          <div class="row rnd-only"><div class="rl"><b>勝利ラウンド</b><small>先に取った方の勝ち</small></div><div class="rc" data-k="wins"></div></div>
          <div class="row"><div class="rl"><b>エイムアシスト</b><small>タッチの人だけ</small></div><div class="rc" data-k="aa"></div></div>
          <div class="row"><div class="rl"><b>味方撃ち</b></div><div class="rc" data-k="ff"></div></div>
        </div>
      </div>
      <div class="sc-foot"><button class="btn ghost" data-a="lo">装備</button><button class="btn primary" data-a="go">${net ? '決定' : '開始'}</button></div></div>`, 'dim');
    const vis = () => { el.querySelector('.tdm-only').style.display = s.mode === 'tdm' ? '' : 'none'; el.querySelector('.rnd-only').style.display = s.mode === 'tdm' ? 'none' : ''; };
    el.querySelectorAll('[data-map]').forEach(b => onTap(b, () => { s.map = b.dataset.map; this.app.audio.ui('tap'); this._pvpSetup(opt); }));
    chips(el.querySelector('[data-k="mode"]'), PVP_MODES.map(m => [m, MODE_INFO[m].name]), s.mode, (v) => { s.mode = v; el.querySelector('.modedesc').textContent = MODE_INFO[v].desc; vis(); });
    if (!net) {
      chips(el.querySelector('[data-k="t0"]'), [1, 2, 3, 4].map(n => [n, n + '人']), s.teams[0], (v) => { s.teams[0] = v; });
      chips(el.querySelector('[data-k="t1"]'), [1, 2, 3, 4].map(n => [n, n + '人']), s.teams[1], (v) => { s.teams[1] = v; });
      chips(el.querySelector('[data-k="side"]'), [[0, 'SWAT'], [1, '立てこもり犯']], s.side, (v) => { s.side = v; });
    }
    chips(el.querySelector('[data-k="bot"]'), [[1, '弱い'], [2, 'ふつう'], [3, '強い']], s.botLevel, (v) => { s.botLevel = v; });
    chips(el.querySelector('[data-k="time"]'), [[5, '5分'], [8, '8分'], [10, '10分'], [15, '15分']], s.time, (v) => { s.time = v; });
    chips(el.querySelector('[data-k="wins"]'), [[2, '2'], [3, '3'], [4, '4'], [5, '5']], s.wins, (v) => { s.wins = v; });
    chips(el.querySelector('[data-k="aa"]'), [[0, 'なし'], [1, '弱い'], [2, 'ふつう']], s.aimAssist, (v) => { s.aimAssist = v; });
    chips(el.querySelector('[data-k="ff"]'), [[false, 'なし'], [true, 'あり']], s.ff, (v) => { s.ff = v; });
    vis();
    this._acts(el, {
      lo: () => this.open('loadout', { kind: 'pvp' }),
      go: () => { if (net) { if (opt.onDone) opt.onDone(s); this.back(); } else a.startPvp({ ...s, teams: s.teams.slice() }); },
    });
    this.show('pvpSetup'); a.scene('menu');
  }

  // ---- みんなで: 部屋を作る／入る
  _multi(kind) {
    const a = this.app;
    const el = this._mk('multi', `<div class="sc-wrap"><header class="sc-head">${BACK}<h2>みんなで（${kind === 'pvp' ? '対戦' : '作戦'}）</h2></header>
      <div class="big-choice">
        <button class="bc" data-a="host"><b>部屋を作る</b><span>5文字のコードと招待リンクができる。設定を決めて、そろったら始める。</span></button>
        <button class="bc" data-a="join"><b>コードで入る</b><span>友達から聞いた5文字のコードを入れる（招待リンクを開いた場合はそのまま入れる）。</span></button>
      </div>
      <p class="note center">${esc(a.netNote())}</p></div>`, 'dim');
    this._acts(el, {
      host: () => a.hostRoom(kind),
      join: async () => { const v = await textModal({ title: '部屋のコード', note: '5文字（例: KX7QM）', maxLength: 8, validate: (t) => a.normCode(t) ? '' : '5文字のコードを入れてください（使えない字が入っています）' }); if (v) a.joinRoom(a.normCode(v)); },
    });
    this.show('multi'); a.scene('menu');
  }
  _join(code) { this.app.joinRoom(code); }
  netWait(msg, onCancel) {
    const el = this._mk('netwait', `<div class="ld"><div class="ld-name">${TITLE}</div><p class="nw-msg">${esc(msg)}</p><div class="spin"></div><button class="btn ghost" data-a="cancel">やめる</button></div>`);
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
    const el = this._mk('lobby', `<div class="sc-wrap"><header class="sc-head"><button class="back" data-a="leave"><span>部屋を出る</span></button><h2>ロビー</h2><span class="hint code">部屋 <b>${esc(N.code)}</b></span><button class="btn small" data-a="share">招待</button></header>
      <div class="split lobby">
        <div class="pane roster scroll"></div>
        <div class="pane rows scroll lob-set"></div>
      </div>
      <div class="sc-foot"><span class="conn"></span>${host ? '<button class="btn ghost" data-a="set">設定を変える</button><button class="btn primary" data-a="start">始める</button>' : '<span class="wait">ホストが始めるのを待っています…</span>'}<button class="btn ghost" data-a="lo">装備</button></div></div>`, 'dim');
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
    const rowHTML = (r) => `<div class="pl${r.on ? '' : ' off'}"><b>${esc(r.name)}</b>${r.host ? '<em>ホスト</em>' : ''}${r.cid === S.cid ? '<em class="me">あなた</em>' : ''}${r.on ? '' : '<em class="bad">応答なし</em>'}${pvp && host ? `<button class="chip small" data-team="${esc(r.cid)}">${teamOf(r) ? '赤へ' : '青へ'}</button>` : ''}</div>`;
    let html;
    if (pvp) {
      const sizes = cfg.teams || [4, 4];
      html = [0, 1].map(t => { const list = ro.filter(r => teamOf(r) === t); return `<div class="team t${t}"><h4>${t === 0 ? '青チーム' : '赤チーム'} <small>${list.length}人＋ボット${Math.max(0, sizes[t] - list.length)}</small></h4>${list.map(rowHTML).join('')}</div>`; }).join('');
      if (host) html += `<div class="row"><div class="rl"><b>チームの人数</b><small>空きはボット</small></div><div class="rc"><span class="mini">青</span><span data-k="s0"></span><span class="mini">赤</span><span data-k="s1"></span></div></div>`;
    } else html = `<h4>隊員 <small>${ro.length}人＋AI${Math.max(0, 4 - ro.length)}人</small></h4>` + ro.map(rowHTML).join('');
    el.querySelector('.roster').innerHTML = html;
    if (pvp && host) {
      el.querySelectorAll('[data-team]').forEach(b => onTap(b, () => S.setTeam(b.dataset.team, teamOf(ro.find(r => r.cid === b.dataset.team)) ? 0 : 1)));
      const sizes = cfg.teams || [4, 4];
      chips(el.querySelector('[data-k="s0"]'), [1, 2, 3, 4].map(n => [n, String(n)]), sizes[0], (v) => { const c = { ...cfg, teams: [v, sizes[1]] }; S.setCfg(c); });
      chips(el.querySelector('[data-k="s1"]'), [1, 2, 3, 4].map(n => [n, String(n)]), sizes[1], (v) => { const c = { ...cfg, teams: [sizes[0], v] }; S.setCfg(c); });
    }
    // 設定の要約
    const set = el.querySelector('.lob-set');
    if (pvp) set.innerHTML = `<h3>${esc(MODE_INFO[cfg.mode] ? MODE_INFO[cfg.mode].name : '')}</h3><p>${esc(MAPS[cfg.map] ? MAPS[cfg.map].name : '')}</p><dl class="kv"><dt>ボット</dt><dd>${['', '弱い', 'ふつう', '強い'][cfg.botLevel || 2]}</dd>${cfg.mode === 'tdm' ? `<dt>時間</dt><dd>${cfg.time}分</dd>` : `<dt>勝利ラウンド</dt><dd>${cfg.wins}</dd>`}<dt>エイムアシスト</dt><dd>${['なし', '弱い', 'ふつう'][cfg.aimAssist ?? 1]}</dd><dt>味方撃ち</dt><dd>${cfg.ff ? 'あり' : 'なし'}</dd></dl>`;
    else set.innerHTML = `<h3>${esc(MISSIONS[cfg.mission] ? MISSIONS[cfg.mission].name : '')}</h3><p>${esc(MAPS[cfg.map] ? MAPS[cfg.map].name : '')}</p><dl class="kv"><dt>難易度</dt><dd>${esc(DIFFS[cfg.diff] ? DIFFS[cfg.diff].name : '')}</dd><dt>突入口</dt><dd>${esc(MAPS[cfg.map] && MAPS[cfg.map].spawn.swat[cfg.entry || 0] ? MAPS[cfg.map].spawn.swat[cfg.entry || 0].name : '')}</dd></dl><p class="note">空いた枠（4人まで）はAIの隊員が入ります。</p>`;
    el.querySelector('.conn').textContent = a.connText(N.link.info && N.link.info());
    const st = el.querySelector('[data-a="start"]');
    if (st) st.classList.toggle('dis', !S.canStart());
  }

  // ---- 一時停止
  _pause() {
    const a = this.app, g = a.game;
    const pve = g && !g.S.pvp && g.S.m && g.S.m.kind === 'pve';
    const net = !!(g && g.net);
    const el = this._mk('pause', `<div class="pz"><h2>一時停止${net ? '<small>みんなで遊んでいる間は止まりません</small>' : ''}</h2>
      <nav class="t-menu">
        <button class="mi main" data-a="resume"><span class="mi-l">再開</span></button>
        <button class="mi" data-a="tablet"><span class="mi-l">地図・目的</span></button>
        <button class="mi" data-a="settings"><span class="mi-l">設定</span></button>
        <button class="mi" data-a="book"><span class="mi-l">図鑑・遊び方</span></button>
        ${pve && (!net || a.net.role === 'host') ? `<button class="mi" data-a="abort"><span class="mi-l">${g.S.m.softDone ? '本部へ戻る（完了）' : '撤収する（作戦を終える）'}</span></button>` : ''}
        <button class="mi danger" data-a="quit"><span class="mi-l">${net ? '部屋を出る' : 'タイトルへ'}</span></button>
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
  // ---- 地図（タブレット）
  _tablet() {
    const a = this.app, g = a.game;
    if (!g) { this.back(); return; }
    const S = g.S, p = g.p, def = MAPS[S.map];
    const ob = g._objectives();
    const el = this._mk('tablet', `<div class="sc-wrap"><header class="sc-head">${BACK}<h2>地図</h2><span class="hint">${esc(def.name)}</span></header>
      <div class="split brief"><div class="pane planbox"><canvas class="plan"></canvas><div class="plan-lv"></div></div>
      <div class="pane rows scroll"><h3>目的</h3><div class="tab-obj">${ob.html}</div>${!S.pvp && S.m.kind === 'pve' ? `<ul class="obj">${objectives(S.m.mission).map(o => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
      <p class="note">黄色の点があなた、青は味方、赤は見つけた容疑者、緑は市民、黄土色は投降・拘束した人。</p></div></div></div>`, 'dim');
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

  // ---- 結果
  _result(res) {
    const a = this.app;
    if (res.pvp) return this._resultPvp(res);
    const sc = res.score || { parts: [], total: 0, grade: 'F', viol: [], stats: {} };
    const M = MISSIONS[res.mission] || { name: '' };
    const why = { wiped: '隊が全滅した', hostages: '人質が全員死亡した', bomb: '爆弾が爆発した', player: '' }[res.why] || '';
    const VN = { kill_unjust: '不当な殺傷', civkill: '市民の死亡', civhurt: '市民の負傷', civforce: '市民への実力行使', force: '不当な実力行使', ff: '味方への発砲' };
    const st = sc.stats || {};
    const acc = res.me && res.me.sh ? Math.round(100 * res.me.hi / res.me.sh) : 0;
    const el = this._mk('result', `<div class="sc-wrap"><header class="sc-head"><h2>${res.res === 'fail' ? '作戦失敗' : res.res === 'abort' && !res.soft ? '撤収' : '作戦完了'}</h2><span class="hint">${esc(MAPS[res.map].name)} · ${esc(M.name)} · ${esc(DIFFS[res.diff] ? DIFFS[res.diff].name : '')}${why ? ' · ' + why : ''}</span></header>
      <div class="split result">
        <div class="pane gradebox"><div class="grade" style="color:${GRADE_COL[sc.grade]}">${sc.grade}</div><div class="total">${sc.total}<small>/100</small></div>
          <dl class="kv"><dt>時間</dt><dd>${fmtTime(st.time || 0)}</dd><dt>逮捕</dt><dd>${st.arrested || 0}/${st.susTotal || 0}</dd><dt>容疑者の死亡</dt><dd>${st.killed || 0}</dd><dt>救出</dt><dd>${st.rescued || 0}/${st.civTotal || 0}</dd><dt>命中率</dt><dd>${acc}%</dd></dl></div>
        <div class="pane rows scroll"><table class="score"><tbody>${sc.parts.map(p => `<tr><th>${esc(p.name)}<small>${esc(p.note || '')}</small></th><td>${p.got}<small>/${p.max}</small></td></tr>`).join('')}</tbody></table>
          ${sc.viol.length ? `<h3>違反</h3><ul class="viol">${sc.viol.map(v => `<li><b>${esc(VN[v.v] || v.v)}</b>${v.byName ? `（${esc(v.byName)}）` : ''} −${v.pen}</li>`).join('')}</ul>` : '<p class="good">交戦規定の違反はありません。</p>'}</div>
      </div>
      <div class="sc-foot">${res.net ? (a.net && a.net.role === 'host' ? '<button class="btn primary" data-a="again">ロビーへ</button>' : '<span class="wait">ホストを待っています…</span>') : '<button class="btn ghost" data-a="lo">装備を変えて</button><button class="btn primary" data-a="again">もう一度</button>'}<button class="btn ghost" data-a="title">${res.net ? '部屋を出る' : 'タイトルへ'}</button></div></div>`, 'dim');
    this._acts(el, {
      again: () => res.net ? a.netAgain() : a.startPve(a.lastPve),
      lo: () => this.open('loadout', { kind: 'pve', team: a.lastPve ? a.lastPve.team : 4 }),
      title: () => res.net ? a.leaveRoom() : a.toTitle(),
    });
    this.show('result'); a.scene('pause');
  }
  _resultPvp(res) {
    const a = this.app;
    const mine = res.win === res.myTeam;
    const MODE = MODE_INFO[res.mode] || { name: '' };
    const rows = res.rows || [];
    const el = this._mk('result', `<div class="sc-wrap"><header class="sc-head"><h2 class="${res.win < 0 ? '' : mine ? 'good' : 'bad'}">${res.win < 0 ? '引き分け' : mine ? '勝利' : '敗北'}</h2><span class="hint">${esc(MODE.name)} · ${esc(MAPS[res.map].name)} · ${fmtTime(res.time || 0)}</span></header>
      <div class="pvp-score"><b class="t0">${res.score[res.myTeam]}</b><span>—</span><b class="t1">${res.score[1 - res.myTeam]}</b></div>
      <div class="pane scroll"><table class="board"><thead><tr><th>名前</th><th>キル</th><th>デス</th><th>アシスト</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${r.team === res.myTeam ? 'ally' : 'enemy'}${r.me ? ' me' : ''}"><th>${i === 0 ? '<em>MVP</em>' : ''}${esc(r.name)}${r.bot ? '<small>ボット</small>' : ''}</th><td>${r.k}</td><td>${r.d}</td><td>${r.a}</td></tr>`).join('')}</tbody></table></div>
      <div class="sc-foot">${res.net ? (a.net && a.net.role === 'host' ? '<button class="btn primary" data-a="again">ロビーへ</button>' : '<span class="wait">ホストを待っています…</span>') : '<button class="btn primary" data-a="again">もう一度</button>'}<button class="btn ghost" data-a="title">${res.net ? '部屋を出る' : 'タイトルへ'}</button></div></div>`, 'dim');
    this._acts(el, { again: () => res.net ? a.netAgain() : a.startPvp(a.lastPvp), title: () => res.net ? a.leaveRoom() : a.toTitle() });
    this.show('result'); a.scene('pause');
  }

  // ---- 設定
  _settings(tab = 'ctrl') {
    const a = this.app, S = a.settings;
    const TABS = [['ctrl', '操作'], ['sens', '感度'], ['hud', 'HUD'], ['gfx', '画質'], ['snd', '音'], ['etc', 'その他']];
    const el = this._mk('settings', `<div class="sc-wrap"><header class="sc-head">${BACK}<h2>設定</h2><div class="tabs">${TABS.map(([k, n]) => `<button class="tab${k === tab ? ' on' : ''}" data-tab="${k}">${n}</button>`).join('')}</div></header><div class="pane rows scroll set-body"></div></div>`, 'dim');
    el.querySelectorAll('[data-tab]').forEach(b => onTap(b, () => { this.app.audio.ui('tap'); this.args = [b.dataset.tab]; this._settings(b.dataset.tab); }));
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
      row('構える（ADS）', '射撃ボタンの上の照準ボタン', 'adsMode'); ch('adsMode', [['tap', '押すたび切替'], ['hold', '押している間'], ['mixed', '両方']]);
      row('リーン', '左右にのぞく', 'leanMode'); ch('leanMode', [['toggle', '押すたび切替'], ['hold', '押している間']]);
      row('移動スティック', '', 'stickMode'); ch('stickMode', [['float', '左側のどこでも'], ['fixed', '決まった場所']]);
      row('スティックでダッシュ', '対戦だけ。上に倒しきる', 'stickSprint'); ch('stickSprint', [[true, 'する'], [false, 'しない']]);
      row('射撃ボタン（左）', '左手でも撃てる', 'leftFire'); ch('leftFire', [[true, '出す'], [false, '出さない']]);
      row('射撃ボタンで見回す', '押したまま指をずらすと視点が動く', 'fireLook'); ch('fireLook', [[true, 'する'], [false, 'しない']]);
      row('利き手', 'ボタンの左右を入れ替える', 'handed'); ch('handed', [['right', '右'], ['left', '左']]);
      row('やり直せない操作', '撤収・タイトルへ など', 'confirm'); ch('confirm', [['auto', '自動（タッチは2回）'], ['two', 'いつも2回'], ['one', 'いつも1回']]);
      note('パソコン: WASDで移動、マウスで見回し（画面をクリック）、左クリック射撃、右クリック構える、Q/Eリーン、Cしゃがみ、Z伏せ、Rリロード（長押しで速い）、F警告、V調べる、H命令、Tabで命令する隊、G投げ物、1/2持ち替え、Xモード、Tライト、Nナイトビジョン、Bローレディ、M地図、Esc一時停止。');
    } else if (tab === 'sens') {
      row('見回し', '', 'sens'); sl('sens', 0.2, 3, 0.05, (v) => v.toFixed(2));
      row('構えたとき', '等倍の照準', 'sensAds'); sl('sensAds', 0.2, 1.5, 0.05, pct);
      row('スコープ', '倍率のある照準', 'sensScope'); sl('sensScope', 0.1, 1.2, 0.05, pct);
      row('撃っている間', '射撃ボタンを押したまま見回すとき', 'sensFire'); sl('sensFire', 0.3, 1.5, 0.05, pct);
      row('上下の反転', '', 'invertY'); ch('invertY', [[false, 'しない'], [true, 'する']]);
      row('エイムアシスト', '作戦だけ（対戦は部屋の設定）', 'aimAssist'); ch('aimAssist', [['off', 'なし'], ['weak', '弱い'], ['strong', 'ふつう']]);
      row('ジャイロ', '端末を傾けて照準（PUBGモバイル式）', 'gyro'); ch('gyro', [['off', 'オフ'], ['ads', '構えたときだけ'], ['always', 'いつも']]);
      row('ジャイロの感度', '', 'gyroSens'); sl('gyroSens', 0.2, 3, 0.05, (v) => v.toFixed(2));
      row('ジャイロの左右', '', 'gyroInvX'); ch('gyroInvX', [[false, 'ふつう'], [true, '反転']]);
      row('ジャイロの上下', '', 'gyroInvY'); ch('gyroInvY', [[false, 'ふつう'], [true, '反転']]);
      R.push('<div class="row"><div class="rl"><b>ジャイロの許可</b><small>iPhoneは最初に許可が要る</small></div><div class="rc"><button class="btn small" data-a="gyroPerm">許可する</button></div></div>');
    } else if (tab === 'hud') {
      R.push('<div class="row"><div class="rl"><b>ボタンの配置</b><small>位置・大きさ・濃さをボタンごとに変える</small></div><div class="rc"><button class="btn small" data-a="editHud">配置を編集</button></div></div>');
      row('全体の濃さ', '', 'hudOpacity'); sl('hudOpacity', 0.2, 1, 0.05, pct);
      row('全体の大きさ', '', 'hudScale'); sl('hudScale', 0.75, 1.3, 0.05, pct);
      row('照準の形', '腰だめのとき', 'crosshair'); ch('crosshair', [['cross', '十字'], ['dot', '点'], ['none', 'なし']]);
      row('照準の色', '', 'crossColor'); binds.push(() => chips(body.querySelector('[data-k="crossColor"]'), [['#ffffff', '白'], ['#7dff7a', '緑'], ['#ffe14a', '黄'], ['#4ae8ff', '水色'], ['#ff5ad2', '桃']], S.crossColor, (v) => { S.crossColor = v; save(); }, { swatch: true }));
      row('ミニマップ', '', 'minimap'); ch('minimap', [[true, '出す'], [false, '出さない']]);
      row('字幕', '無線と呼びかけ', 'subtitles'); ch('subtitles', [[true, '出す'], [false, '出さない']]);
      row('命中の印', '', 'hitMarker'); ch('hitMarker', [[true, '出す'], [false, '出さない']]);
    } else if (tab === 'gfx') {
      row('画質', '影・光のにじみ・なめらかさ', 'quality'); ch('quality', Object.keys(QUALITY).map(k => [k, QUALITY[k].name]));
      row('上限のこま数', '', 'fps'); ch('fps', [[30, '30'], [60, '60']]);
      row('解像度', '', 'scale'); sl('scale', 0.5, 1, 0.05, pct);
      row('解像度の自動調整', '重いときに下げる', 'autoRes'); ch('autoRes', [[true, 'する'], [false, 'しない']]);
      row('視野角', '', 'fov'); sl('fov', 45, 75, 1, (v) => v + '°');
      row('明るさ', '', 'bright'); sl('bright', 0.6, 1.6, 0.05, pct);
      row('血の表現', '', 'blood'); ch('blood', [[true, 'あり'], [false, 'なし']]);
      row('画面の揺れ', '', 'shake'); ch('shake', [[true, 'あり'], [false, '弱く']]);
      row('こま数の表示', '', 'showFps'); ch('showFps', [[false, '出さない'], [true, '出す']]);
    } else if (tab === 'snd') {
      row('全体', '', 'vm'); sl('vm', 0, 1, 0.05, pct, 'vol.master');
      row('効果音', '銃声・足音など', 'vs'); sl('vs', 0, 1, 0.05, pct, 'vol.sfx');
      row('声', '呼びかけ・無線', 'vv'); sl('vv', 0, 1, 0.05, pct, 'vol.voice');
      row('BGM', '', 'vb'); sl('vb', 0, 1, 0.05, pct, 'vol.bgm');
      row('画面の音', 'ボタン・命中の音', 'vu'); sl('vu', 0, 1, 0.05, pct, 'vol.ui');
      row('消音モードでも鳴らす', 'オンにすると、ロック画面などに「再生中」が出ます', 'playSilent'); ch('playSilent', [[false, 'しない'], [true, 'する']]);
      note('足音と銃声の向きが分かるよう、ヘッドホンを使うのがおすすめです。');
    } else {
      R.push(`<div class="row"><div class="rl"><b>名前</b><small>みんなで遊ぶときと結果に出る</small></div><div class="rc"><span class="nmv">${esc(a.profile.name)}</span><button class="btn small" data-a="rename">変える</button></div></div>`);
      R.push('<div class="row"><div class="rl"><b>引き継ぎコード</b><small>設定・名前・装備・記録を別の場所へ（ホーム画面のアプリは保存場所が別）</small></div><div class="rc"><button class="btn small" data-a="exp">書き出す</button><button class="btn small" data-a="imp">読み込む</button></div></div>');
      R.push('<div class="row"><div class="rl"><b>記録を消す</b></div><div class="rc"><button class="btn small danger" data-a="clr">消す</button></div></div>');
      note(`版: 互換${COMPAT} · v${VERSION}`);
    }
    body.innerHTML = R.join('');
    for (const f of binds) f();
    this._acts(body, {
      gyroPerm: async () => { const ok = await a.input.requestGyro(); this.flash(ok ? 'ジャイロを使えます' : '許可されませんでした'); },
      editHud: () => a.editHud(() => this._settings('hud')),
      rename: async () => { const v = await textModal({ title: '名前', value: a.profile.name, maxLength: 12, validate: (t) => t.trim() ? '' : '名前を入れてください' }); if (v) { a.profile.name = v.trim().slice(0, 12); a.saveProfile(); this._settings('etc'); } },
      exp: async () => { const code = a.exportCode(); const ok = await copyText(code); await textModal({ title: '引き継ぎコード', note: ok ? 'コピーしました。移したい場所で「読み込む」に貼り付けてください。' : '下のコードを選んでコピーしてください。', value: code, readonly: true, multiline: true, ok: '閉じる' }); },
      imp: async () => { const v = await textModal({ title: '引き継ぎコードを貼り付け', multiline: true, validate: (t) => a.checkCode(t) ? '' : 'コードが正しくありません' }); if (v && a.importCode(v)) { this.flash('読み込みました'); this._settings('etc'); } },
    });
    const clr = body.querySelector('[data-a="clr"]');
    if (clr) confirmTap(clr, () => a.confirmMode(), () => { a.clearRecords(); this.flash('記録を消しました'); }, 'もう一度押すと消す');
    this.show('settings');
  }

  // ---- 図鑑・遊び方
  _book(tab = 'play') {
    const el = this._mk('book', `<div class="sc-wrap"><header class="sc-head">${BACK}<h2>図鑑・遊び方</h2><div class="tabs book-tabs"></div></header><div class="pane rows scroll book-body"></div></div>`, 'dim');
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
