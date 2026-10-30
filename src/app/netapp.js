// オンライン（通信）の入口。App に混ぜ込む。部屋を作る・入る・ロビー・開始・結果・抜ける・読み込み直したら戻る。
import { normCode, codeFromHash, joinLink, makeCode, makeCid } from '../net/code.js';
import { openLink } from '../net/link.js';
import { HostSession, GuestSession } from '../net/session.js';
import { Mirror } from '../net/snap.js';
import { instWorld, dump as dumpGame } from '../engine/engine.js';
import { Match } from './game.js';
import { VERSION } from '../engine/data/version.js';

const NETKEY = 'hardentry.v1.net';
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

export function netMixin(App) {
  const P = App.prototype;
  P.normCode = function (v) { return normCode(v); };
  P.inClaude = function () { return !!(globalThis.claude && typeof globalThis.claude.use === 'function'); };
  P.netNote = function () {
    return this.inClaude()
      ? 'Claude内: このページを共有され、ログインしている人と接続。中継サーバーも併用（送信はコールサイン・装備・動きのみ）。つながらない場合はホーム画面のアプリ版どうしで。'
      : '中継サーバー経由で接続し、可能なら端末間で直接通信。送信はコールサイン・装備・動きのみ。';
  };
  P.connText = function (info) {
    if (!info) return '';
    const one = (i) => i.kind === 'room' ? (i.ok ? 'Claude' : 'Claude（接続中）') : (i.servers && i.servers.length ? (i.p2p ? `直接${i.p2p}・` : '') + '中継' : '中継（接続中）');
    return '回線: ' + (info.parts ? info.parts.map(one).join(' + ') : one(info));
  };
  P._cid = function () {
    let c = null;
    try { c = sessionStorage.getItem('hardentry.v1.cid'); } catch (e) { /* なし */ }
    if (!c || !/^[a-z0-9]{10}$/.test(c)) { c = makeCid(); try { sessionStorage.setItem('hardentry.v1.cid', c); } catch (e) { /* なし */ } }
    return c;
  };
  // テストの時だけ: ?mqtt=ws://127.0.0.1:port/mqtt（この端末のサーバーだけ）・?p2p=0・?ice=none・?room=0
  P._netCfg = function () {
    const q = new URLSearchParams(location.search), cfg = {};
    const mq = q.get('mqtt');
    if (mq && /^wss?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(mq)) cfg.brokers = [{ name: 'テスト', url: mq }];
    if (q.get('p2p') === '0') cfg.p2p = false;
    if (q.get('ice') === 'none') cfg.ice = [];
    if (q.get('room') === '0') cfg.room = false;
    if (q.get('net') === '0') cfg.net = false;
    return cfg;
  };
  P._netLo = function (kind) { const L = this.loadouts; return kind === 'pvp' ? { swat: L.pvp.swat, sus: L.pvp.sus, armor: (L.pvp.swat || {}).armor || 'medium' } : L.player; };
  P.netLoadoutChanged = function () { const N = this.net; if (!N) return; const lo = this._netLo(N.sess.kind); if (N.role === 'host') N.sess.setLoadout(lo); else N.sess.setLoadout(lo); };
  P.netBoot = function () {
    const jc = codeFromHash();
    let back = null;
    try { back = JSON.parse(sessionStorage.getItem(NETKEY) || 'null'); } catch (e) { /* なし */ }
    if (back && back.role === 'guest' && back.code && Date.now() - (back.at || 0) < 10 * 60 * 1000 && (!jc || jc === back.code)) this.joinRoom(back.code);
    else if (back && back.role === 'host' && back.code && Date.now() - (back.at || 0) < 3 * 60 * 1000 && !jc) this.restoreHost(back);
    else if (jc) this.joinRoom(jc);
    window.addEventListener('hashchange', () => { const c = codeFromHash(); if (c && !this.net && (this.mode === 'title' || this.mode === 'menu' || this.mode === 'none')) this.joinRoom(c); });
  };
  P._saveNet = function () {
    const N = this.net; if (!N) return;
    const rec = { role: N.role, code: N.code, at: Date.now() };
    if (N.role === 'host') {
      const S = N.sess;
      Object.assign(rec, { cid: S.cid, hs: S.hs, n: S.n, ev: S.evSeq, kind: S.kind, cfg: S.cfg, phase: S.phase, seed: S.seed, roster: S.roster.map(r => ({ cid: r.cid, pid: r.pid, name: r.name, team: r.team, lo: r.lo, host: !!r.host, gone: !!r.gone })) });
      if (S.phase === 'game' && this.game && this.game.net && !this.game.done) { try { rec.dump = dumpGame(this.game.G); rec.cam = { yaw: this.game.yaw, pitch: this.game.pitch }; } catch (e) { /* なし */ } }
    }
    try { sessionStorage.setItem(NETKEY, JSON.stringify(rec)); } catch (e) { /* なし */ }
  };
  P._clearNet = function (keepHash) {
    try { sessionStorage.removeItem(NETKEY); } catch (e) { /* なし */ }
    if (!keepHash && /^#join[-=]/.test(location.hash)) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* なし */ } }
  };
  P._openLink = async function (o, ticket, msg) {
    for (let k = 0; k < 3; k++) {
      if (this.netTicket !== ticket) return null;
      if (k) { const el = document.querySelector('.nw-msg'); if (el) el.textContent = `${msg}（${k + 1}回目）`; }
      try {
        const link = await openLink({ ...o, ...this._netCfg() });
        if (this.netTicket !== ticket) { link.close(); return null; }
        return link;
      } catch (e) { console.warn('接続失敗', e && e.message); await new Promise(r => setTimeout(r, 800)); }
    }
    if (this.netTicket === ticket) this.screens.netError('接続できませんでした。通信環境を確認してください。');
    return null;
  };
  P.hostRoom = async function (kind) {
    this.leaveRoom(true);
    const ticket = this.netTicket = {};
    this.screens.netWait('ルーム作成中…', () => { this.netTicket = null; this.screens.reset('title'); });
    const code = makeCode(), cid = this._cid();
    const link = await this._openLink({ code, role: 'host', cid }, ticket, 'ルーム作成中…');
    if (!link) return;
    const slow = link.kind === 'room';
    const cfg = kind === 'pvp' ? { ...this.screens.pv, teams: [4, 4] } : { ...this.screens.sel };
    const sess = new HostSession({ link, cid, code, profile: this.profile, kind, cfg, lo: this._netLo(kind), rate: slow ? { lobby: 300, game: 100, end: 500 } : undefined });
    this.net = { role: 'host', sess, link, code };
    sess.on('roster', () => { this.screens.netRoster(); this._saveNet(); });
    sess.on('joined', () => this.audio.ui('ok'));
    sess.on('left', (r) => { if (this.game) this.hud.feed(`${r.name} 退出`, 'warn'); });
    link.onStatus = () => this.screens.netRoster();
    this._saveNet();
    this.screens.stack = [['title', []]];
    this.screens.reset('lobby');
    this._requestWake();
  };
  // ホストが読み込み直した: 同じコード・同じ目印で部屋を開き直し、試合の途中なら続ける
  P.restoreHost = async function (sv) {
    this.leaveRoom(true);
    const ticket = this.netTicket = {};
    this.screens.netWait(`ルーム ${sv.code} に再接続中…`, () => { this.netTicket = null; this._clearNet(); this.screens.reset('title'); });
    const link = await this._openLink({ code: sv.code, role: 'host', cid: sv.cid }, ticket, `ルーム ${sv.code} に再接続中…`);
    if (!link) { this._clearNet(); return; }
    const slow = link.kind === 'room';
    const sess = new HostSession({ link, cid: sv.cid, code: sv.code, profile: this.profile, kind: sv.kind, cfg: sv.cfg, lo: this._netLo(sv.kind), rate: slow ? { lobby: 300, game: 100, end: 500 } : undefined });
    sess.hs = sv.hs || sess.hs; sess.n = (sv.n || 0) + 2000; sess.evSeq = (sv.ev || 0) + 500;
    if (Array.isArray(sv.roster) && sv.roster.length) sess.roster = sv.roster.map(r => ({ ...r, on: !!r.host, at: performance.now() }));
    this.net = { role: 'host', sess, link, code: sv.code };
    sess.on('roster', () => { this.screens.netRoster(); this._saveNet(); });
    link.onStatus = () => this.screens.netRoster();
    this.screens.stack = [['title', []]];
    if (sv.phase === 'game' && sv.dump) {
      sess.phase = 'game'; sess.seed = sv.seed;
      this.destroyGame();
      try { this.game = new Match(this, { dump: sv.dump, cam: sv.cam, pid: 0, net: { role: 'host', sess } }); }
      catch (e) { console.warn('再接続できません', e); sess.phase = 'lobby'; sess.backToLobby(); this.screens.reset('lobby'); return; }
      this._play();
      this.hud.showBanner('ルームに再接続', 2400);
    } else { sess.backToLobby(); this.screens.reset('lobby'); this._requestWake(); }
    this._saveNet();
  };
  P.joinRoom = async function (code) {
    this.leaveRoom(true);
    const ticket = this.netTicket = {};
    this.screens.netWait(`ルーム ${code} を検索中…`, () => { this.netTicket = null; if (this.net) this.leaveRoom(true); this.screens.reset('title'); });
    const cid = this._cid();
    const link = await this._openLink({ code, role: 'guest', cid }, ticket, `ルーム ${code} を検索中…`);
    if (!link) return;
    const slow = link.kind === 'room';
    const sess = new GuestSession({ link, cid, code, profile: this.profile, lo: null, rate: slow ? { join: 500, lobby: 500, game: 100, end: 1000 } : undefined });
    this.net = { role: 'guest', sess, link, code };
    this._saveNet();
    sess.on('lobby', () => {
      sess.setLoadout(this._netLo(sess.kind));
      if (this.game) { this.destroyGame(); this.hud.show(false); this.input.enabled = false; }
      this.mode = 'none'; this.paused = false;
      this.screens.stack = [['title', []]];
      this.screens.reset('lobby');
      this._requestWake();
    });
    sess.on('roster', () => this.screens.netRoster());
    link.onStatus = () => this.screens.netRoster();
    sess.on('start', (info) => this.startNetGame(info));
    sess.on('end', (res) => this.showNetResult(res));
    sess.on('error', (why, info) => this._netFail(why, info));
  };
  P._netFail = function (why, info) {
    const msg = {
      version: `バージョンが違います（ホスト v${info && info.host || '?'} / 自分 v${VERSION}）。両方とも再読み込みしてください。`,
      full: 'ルームが満員です。', playing: '試合中のため参加できません。',
      notfound: 'ルームが見つかりません。コードを確認してください。',
      closed: 'ホストがルームを閉じました。', lost: 'ホストとの接続が切れました。',
    }[why] || '接続が切れました。';
    const n = this.net; this.net = null; this._clearNet();
    if (n) { try { n.link.close(); } catch (e) { /* なし */ } }
    this.destroyGame();
    this.hud.show(false); this.input.enabled = false; this.fade(0);
    this.mode = 'none'; this.paused = false;
    this._releaseWake();
    this.screens.netError(msg);
  };
  P.shareRoom = async function () {
    if (!this.net) return;
    const url = joinLink(this.net.code), text = `HARD ENTRY ルームコード: ${this.net.code}`;
    try { if (navigator.share) { await navigator.share({ title: 'HARD ENTRY', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (e) { /* なし */ }
    this.screens.flash(ok ? '招待リンクをコピー' : `コピー失敗。コード: ${this.net.code}`);
  };
  P.hostStart = function () {
    const N = this.net;
    if (!N || N.role !== 'host' || !N.sess.canStart()) { this.screens.flash('全員の準備待ち'); return; }
    N.sess.setLoadout(this._netLo(N.sess.kind));
    const seed = (Math.floor(Math.random() * 2 ** 31) ^ Date.now()) >>> 0;
    this.startNetGame(N.sess.start(seed));
  };
  P.startNetGame = async function (info) {
    const N = this.net;
    if (!N) return;
    this.destroyGame();
    this.screens.loading('現場へ移動中…', 0.5);
    this.mode = 'loading';
    await nextFrame();
    try {
      if (N.role === 'host') {
        const c = info.cfg || {};
        if (info.kind === 'pvp') {
          const roster = info.roster.map(r => ({ pid: r.pid, name: r.name, team: r.team, lo: r.lo }));
          const rules = { botLevel: c.botLevel, wins: c.wins, time: (c.time || 8) * 60, aimAssist: c.aimAssist, ff: c.ff };
          this.game = new Match(this, { mode: c.mode || 'tdm', map: c.map, teams: (c.teams || [4, 4]).slice(), roster, rules, seed: info.seed, pid: 0, net: { role: 'host', sess: N.sess } });
        } else {
          const roster = info.roster.map(r => ({ pid: r.pid, name: r.name, lo: r.lo || this.loadouts.player }));
          this.game = new Match(this, { mode: 'pve', map: c.map, mission: c.mission, diff: c.diff, team: 4, entry: c.entry || 0, roster, aiLoadouts: this.loadouts.ai, seed: info.seed, pid: 0, net: { role: 'host', sess: N.sess } });
        }
      } else {
        const st = info.static;
        const w = instWorld(st.map);
        const mirror = new Mirror(w, st);
        this.game = new Match(this, { mirror, pid: info.myPid, net: { role: 'guest', sess: N.sess } });
      }
    } catch (e) {
      console.error(e);
      this.leaveRoom(true);
      this.screens.netError('開始できませんでした。再試行してください。');
      return;
    }
    this._play();
    this._saveNet();
  };
  // ホスト: 試合が終わった → 結果を配って出す
  P.netGameOver = function (res) { if (this.net && this.net.role === 'host') this.net.sess.end(res); this.showNetResult(res); };
  P.showNetResult = function (res) {
    res = { ...res, net: true };
    if (res.pvp && this.net && this.net.role === 'guest' && this.game) {
      const me = this.game.p;
      res.myTeam = me ? me.team : res.myTeam;
      res.rows = (res.rows || []).map(r => ({ ...r, me: r.pid != null && r.pid === this.game.pid }));
    }
    if (this.game) this.game.done = true;
    this.mode = 'result'; this.paused = true;
    this.input.enabled = false; this.input.reset();
    this.hud.show(false); this.fade(0);
    this.audio.ambience(false);
    if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) { /* なし */ } }
    this.screens.reset('result', res);
    this._saveNet();
  };
  P.netAgain = function () {
    const N = this.net;
    if (!N || N.role !== 'host') return;
    this.destroyGame();
    N.sess.backToLobby();
    this.mode = 'none'; this.paused = false;
    this.screens.stack = [['title', []]];
    this.screens.reset('lobby');
    this._requestWake();
  };
  P.leaveRoom = function (silent) {
    const n = this.net;
    this.netTicket = null;
    if (n) { this.net = null; try { if (n.role === 'host') n.sess.close(); else n.sess.leave(); } catch (e) { /* なし */ } }
    this._clearNet(!!silent);
    if (!silent) { this._releaseWake(); this.toTitle(); }
  };
}
