// オンラインの試合の動かし方（Match に混ぜる）。
//  ホスト: エンジンを動かし、ゲストの入力と動作をエンジンへ渡し、写しを配る。ゲストが切れたら止めて待つ。
//  ゲスト: エンジンは動かさず、ホストの写しを補間して表示する。自分の移動と銃（反動・弾の見た目）だけは手元で先に動かし、ホストの位置へなめらかに寄せる。
import { packStatic, packSnap, packEvent, NET_EV } from '../net/snap.js';
import { moveActor } from '../engine/move.js';
import { stepWeapon } from '../engine/weapon.js';
import { doAction } from '../engine/interact.js';
import { setSalt } from '../engine/rng.js';

// 手元でも先に行う動作（ホストにも送る）
const LOCAL_ACTS = new Set(['switch', 'reload', 'mode', 'light', 'melee']);
// ゲストが手元で出す出来事（ホストから来た同じものは捨てる）
const LOCAL_EV = new Set(['shot', 'reload', 'reloaded', 'shell', 'pumped', 'dry', 'draw', 'fmode', 'lightsw', 'step', 'holster', 'melee']);

export function netMixin(Match) {
  const P = Match.prototype;
  // ---- ホスト
  P.netInitHost = function () {
    this.mePids = {};
    for (const a of this.S.actors) if (a.pid != null && a.pid !== this.pid) this.mePids[a.pid] = a.id;
    this.net.sess.attach(this);
  };
  P.netStatic = function () { return packStatic(this.S); };
  P.netSnap = function (events, withBlocks) { return packSnap(this.S, this.w, events, this.mePids, withBlocks); };
  P.staticVer = function () { const m = this.S.m || {}; return (m.round || 0) * 10 + (m.swapped ? 1 : 0); };
  P.netInputs = function (inputs) {
    const sess = this.net.sess;
    for (const [pid, id] of Object.entries(this.mePids)) {
      const a = this.S.byId[id]; if (!a) continue;
      const inp = sess.remoteInput(+pid, a);
      // ゲストがドローンを動かしている: 入力はドローンへ、体はその場で止める
      if (inp.dr) {
        const d = this.S.actors.find(x => x.isDrone && x.owner === a.id && x.alive);
        if (d) { inputs[d.id] = { mx: inp.mx, mz: inp.mz, yaw: inp.yaw, pitch: inp.pitch, fire: inp.fire, jump: inp.jump }; inputs[id] = { ...inp, mx: 0, mz: 0, fire: false, ads: false, sprint: false, yaw: a.yaw, pitch: a.pitch }; continue; }
      }
      inputs[id] = inp;
    }
    return inputs;
  };
  P.netAfterSteps = function (ev) {
    const out = [];
    for (const e of ev) if (NET_EV.has(e.e)) out.push(packEvent(e));
    if (out.length) this.net.sess.addEvents(Math.round(this.S.t * this.S.dt * 1000) / 1000, out);
  };
  // ゲストを待つ（試合を止める）。戻り値: 待っているか
  P.netWaiting = function () {
    const w = this.net.sess.waiting();
    if (!w.length) { if (this._waitShown) { this._waitShown = false; this.hud.hideBanner(); } this._waitT = 0; return false; }
    this._waitT = (this._waitT || 0) + 1 / 60;
    if (!this._waitShown || Math.floor(this._waitT * 2) !== this._waitTick) {
      this._waitShown = true; this._waitTick = Math.floor(this._waitT * 2);
      this.hud.showBanner(`${w.map(r => r.name).join('・')} 接続切れ<br><small>再接続待ち（${Math.ceil(Math.max(0, 30 - this._waitT))}秒後に続行）</small>`, 0, 'warn');
    }
    if (this._waitT > 30) this.net.sess.skipWaiting();
    return true;
  };

  // ---- ゲスト
  P.netInitGuest = function (o) {
    this.mirror = o.mirror;
    this.netQ = [];
    this.corr = { x: 0, z: 0 };
  };
  P.guestFrame = function (dt, fo) {
    const app = this.app, sess = this.net.sess, S = this.S, p = this.p, mir = this.mirror;
    this.time += dt;
    const inp = fo.input === false ? { mx: 0, mz: 0, lookDX: 0, lookDY: 0, gyroX: 0, gyroY: 0, fire: false, sprint: false, hold: new Set(), edges: [] } : app.input.take();
    this._look(inp, dt);
    this._edges(inp);
    // 写しを受け取る
    if (sess.static && sess.static !== this._st) {
      const first = !this._st;
      this._st = sess.static; mir.applyStatic(sess.static); this.p = S.actors.find(a => a.pid === this.pid) || this.p; this.av.hidden.clear(); this.av.hidden.add(this.p.id); this.av.looks && this.av.looks.clear();
      // 最初の写し: 出現した向き（建物の方）を向く
      if (first || this._yawSet !== this.p.id) { this._yawSet = this.p.id; this.yaw = this.p.yaw || 0; this.pitch = 0; }
    }
    let lastP = null, lastRow = null;
    for (const s of sess.takeSnaps()) { mir.push(s.g, s.at); if (s.g.P && s.g.P[this.pid]) lastP = s.g.P[this.pid]; lastRow = s.g; }
    mir.apply(sess.renderT(), this.p.id);
    if (mir.changed && mir.changed.length) { this.r.rebuildCells(mir.changed.splice(0), S); }
    const me = this.p;
    if (lastP) {
      const ws = mir.applyMe(me, lastP);
      // 持ち替えなどがホストで決まったら合わせる
      if (ws && me.ws.slot !== ws[0] && me.ws.st !== 'holster' && me.ws.st !== 'draw') { me.ws.slot = ws[0]; me.ws.st = 'draw'; me.ws.t = 0.3; }
      if (ws) me.ws.gear = ws[5];
      me.stance = lastP.st;
    }
    // 自分の位置: ホストの位置との差をなめらかに縮める（大きくずれたら飛ぶ）
    if (lastRow) {
      const row = lastRow.A.find(r => r[0] === me.id);
      if (row) {
        const hx = row[1] / 100, hy = row[2] / 100, hz = row[3] / 100;
        // ホストの位置は少し前（往復の半分くらい）なので、そのぶん自分の速さで先へ
        const lag = Math.min(0.25, (sess.delay || 100) / 2000);
        const ex = hx + (me.vx || 0) * lag - me.x, ez = hz + (me.vz || 0) * lag - me.z;
        const err = Math.hypot(ex, ez);
        if (err > 2.5 || !me.alive) { me.x = hx; me.y = hy; me.z = hz; }
        else if (err > 0.05) { const k = Math.min(1, dt * (err > 0.8 ? 6 : 2.5)); me.x += ex * k; me.z += ez * k; }
        if (Math.abs(hy - me.y) > 0.5) me.y = hy;
        const f = row[13];
        me.alive = !!(f & 1); me.dead = !!(f & 2); me.down = !!(f & 4); me.cuffed = !!(f & 8);
        me.hp = lastP ? lastP.hp : me.hp;
      }
    }
    // 手元で先に動かす（移動・銃）。弾はホストだけが飛ばす
    const ev = [];
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= S.dt && n < 4) {
      setSalt(sess.seed || 0); // ホストと同じ塩（反動・散らばりをそろえる）
      const cmd = this._command(inp);
      // 動作: ホストへ送る（手元でも先にやるものだけ実行）
      if (cmd.act) for (const ac of cmd.act) { sess.pushAct(ac); if (LOCAL_ACTS.has(ac.a)) { try { doAction(S, this.w, me, ac, ev); } catch (e) { /* なし */ } } }
      const dc = this.droneId != null ? this._droneCmd(inp) : null;
      if (dc && this.droneId != null) sess.setInput({ mx: r2(dc.mx), mz: r2(dc.mz), y: r4(dc.yaw), p: r4(dc.pitch), f: dc.fire ? 1 : 0, j: dc.jump ? 1 : 0, s: cmd.stance, dr: 1 });
      else sess.setInput({ mx: r2(cmd.mx), mz: r2(cmd.mz), y: r4(cmd.yaw), p: r4(cmd.pitch), f: cmd.fire ? 1 : 0, a: cmd.ads ? 1 : 0, l: cmd.low ? 1 : 0, s: cmd.stance, ln: cmd.lean, sp: cmd.sprint ? 1 : 0, pw: cmd.power });
      // 描くときの補間用（ステップの前の自分の位置）
      { const P = this._prev || (this._prev = new Map()); let q = P.get(me.id); if (!q) P.set(me.id, q = [0, 0, 0]); q[0] = me.x; q[1] = me.y; q[2] = me.z; }
      if (me.alive && !me.down && !me.cuffed) {
        me._inp = { ...cmd, act: null };
        try { moveActor(S, this.w, me, me._inp, S.dt, ev); stepWeapon(S, this.w, me, me.melee ? { ...me._inp, fire: false, ads: false } : me._inp, S.dt, ev); } catch (e) { console.warn('predict', e); }
      }
      S.bullets.length = 0;
      // 近接の振り（見た目だけ。当たりはホスト）
      if (me.melee) { me.melee.t += S.dt; if (me.melee.t >= 0.6) me.melee = null; }
      this.acc -= S.dt; n++;
    }
    if (n === 4) this.acc = 0;
    this._alpha = Math.max(0, Math.min(1, this.acc / S.dt));
    // 出来事: 手元の分＋ホストの分（自分の銃の音などは手元の分を使う）
    const hostEv = sess.takeEvents().filter(e => !(LOCAL_EV.has(e.e) && e.id === me.id));
    this._events(ev.filter(e => LOCAL_EV.has(e.e)).concat(hostEv));
    this._render(dt, inp);
    this._hud(dt);
  };
}
function r2(v) { return Math.round((v || 0) * 100) / 100; }
function r4(v) { return Math.round((v || 0) * 10000) / 10000; }
