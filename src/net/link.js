// 通信路: ホストとゲストの間で「最新の状態」を運ぶ。届かないことがあっても、次の状態で上書きされる。
//  - NetLink : 公開のMQTTサーバーで中継し、つながればWebRTCで直接やりとりする（アプリ版。Claude版でも使えれば使う）
//  - RoomLink: Claudeの「部屋」（Claude版。招待されてログインしている人どうし）
//  - MultiLink: 両方を同時に使う（どちらで来た人とも遊べる）
import { Mqtt } from './mqtt.js';

export const BROKERS = [
  { name: 'EMQX', url: 'wss://broker.emqx.io:8084/mqtt' },
  { name: 'HiveMQ', url: 'wss://broker.hivemq.com:8884/mqtt' },
  { name: 'Mosquitto', url: 'wss://test.mosquitto.org:8081/mqtt' },
];
export const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];
const PREFIX = 'hardentry/v1/';
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const rid = () => Math.random().toString(36).slice(2, 8);

function iceDone(pc, ms) {
  return new Promise((res) => {
    if (pc.iceGatheringState === 'complete') { res(); return; }
    const t = setTimeout(res, ms);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}
function anyOk(ps) {
  return new Promise((res, rej) => {
    let left = ps.length, err = null;
    if (!left) { rej(new Error('なし')); return; }
    for (const p of ps) p.then(res, (e) => { err = e; if (--left === 0) rej(err); });
  });
}

export class NetLink {
  constructor({ code, role, cid, brokers = BROKERS, ice = ICE, p2p = true }) {
    this.kind = 'net'; this.code = code; this.role = role; this.cid = cid;
    this.brokers = brokers; this.ice = ice;
    this.p2pOn = !!p2p && typeof RTCPeerConnection !== 'undefined';
    this.T = PREFIX + code + '/';
    this.conns = [];
    this.peers = new Map(); // 相手 cid → { cid, b, at, pc, dc, open, tries, nextTry, xid }
    this.onMsg = () => {}; this.onGone = () => {}; this.onStatus = () => {};
    this.hostCid = null; this.main = null; this.closed = false;
    this.lastRelay = 0; this.relayEvery = 95;
    this.retry = {};
  }
  async open() {
    await anyOk(this.brokers.map((b, i) => this._connect(i)));
    this.timer = setInterval(() => this._tick(), 1000);
    return this;
  }
  _connect(i) {
    const b = this.brokers[i];
    const c = { i, b, ok: false, lastPub: 0, lastHb: 0 };
    c.mq = new Mqtt(b.url, { id: 'he-' + this.cid + '-' + rid(), onMsg: (t, m) => this._mqMsg(i, t, m), onClose: () => this._mqClose(i, c) });
    this.conns[i] = c;
    return c.mq.open(10000).then(() => {
      if (this.closed) { c.mq.close(); return c; }
      c.ok = true; this.retry[i] = 0;
      if (this.role === 'host') c.mq.sub(this.T + 'g/+', this.T + 's/' + this.cid);
      else c.mq.sub(this.T + 'h', this.T + 's/' + this.cid);
      this.onStatus(this.info());
      return c;
    }, (e) => { c.failed = true; throw e; });
  }
  _mqClose(i, c) {
    c.ok = false;
    if (this.closed || this.conns[i] !== c) return;
    if (this.role === 'guest' && this.main === i) {
      this.main = null;
      // 使っていたサーバーが落ちた: 閉じていたほかのサーバーにもつなぎ直して、ホストの声を探す
      this.brokers.forEach((b, j) => { if (j !== i && !this.conns[j]) this._connect(j).catch(() => {}); });
    }
    this.onStatus(this.info());
    // つなぎ直す（少しずつ間をあける）
    const n = (this.retry[i] = (this.retry[i] || 0) + 1);
    setTimeout(() => { if (!this.closed && this.conns[i] === c) this._connect(i).catch(() => {}); }, Math.min(15000, 800 * 2 ** Math.min(4, n)));
  }
  _peer(cid) { let P = this.peers.get(cid); if (!P) { P = { cid, b: null, at: 0, tries: 0, nextTry: 0 }; this.peers.set(cid, P); } return P; }
  _mqMsg(i, topic, text) {
    if (this.closed || text.length > 60000) return;
    let m; try { m = JSON.parse(text); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const rest = topic.slice(this.T.length);
    if (rest.startsWith('s/')) { this._signal(i, m); return; }
    if (this.role === 'host' && rest.startsWith('g/')) {
      const from = rest.slice(2);
      if (!/^[a-z0-9]{6,16}$/.test(from)) return;
      const P = this._peer(from); P.b = i; P.at = now();
      this.onMsg(from, m);
    } else if (this.role === 'guest' && rest === 'h') {
      if (typeof m.cid !== 'string') return;
      if (this.hostCid !== m.cid) { this.hostCid = m.cid; }
      if (this.main == null) {
        this.main = i;
        // 使わないほうのサーバーは少ししてから閉じる
        setTimeout(() => { for (const c of this.conns) if (c && c.i !== this.main && c.mq && !this.closed) { this.conns[c.i] = null; c.mq.close(); } }, 4000);
      }
      const P = this._peer(m.cid); P.b = i; P.at = now();
      this.onMsg(m.cid, m);
      this._maybeP2P();
    }
  }
  _relayConn() {
    if (this.main != null && this.conns[this.main] && this.conns[this.main].ok) return [this.conns[this.main]];
    return this.conns.filter(c => c && c.ok);
  }
  // 送る（ホスト: ゲスト全員へ。ゲスト: ホストへ）。force: 間引かない
  send(obj, force) {
    if (this.closed) return;
    const text = JSON.stringify(obj);
    const t = now();
    if (this.role === 'host') {
      const need = new Set();
      for (const P of this.peers.values()) {
        const live = this._live(P, t);
        if (P.dc && P.dc.readyState === 'open') { try { if (P.dc.bufferedAmount < 65536) P.dc.send(text); } catch (e) { /* なし */ } }
        if (!live && P.b != null && t - P.at < 30000) need.add(P.b);
      }
      const lobby = obj.ph !== 'game';
      for (const c of this.conns) {
        if (!c || !c.ok) continue;
        // 中継は 10回/秒まで。直接つながった人しかいないサーバーへは 1回/秒（戻ってくる人のため）
        const want = lobby || need.has(c.i) ? (force || t - c.lastPub >= this.relayEvery) : (force || t - c.lastHb >= 1000);
        if (!want || c.mq.backlog() > 262144) continue;
        c.mq.pub(this.T + 'h', text); c.lastPub = t; c.lastHb = t;
      }
    } else {
      const P = this.hostCid && this.peers.get(this.hostCid);
      const direct = P && this._live(P, t);
      if (direct) { try { P.dc.send(text); } catch (e) { /* なし */ } }
      // 直接つながっていても、1回/秒は中継でも送る（直接が切れたときにすぐ戻れる）
      if (!direct || force || t - this.lastRelay >= 1000) {
        if (force || t - this.lastRelay >= this.relayEvery) {
          for (const c of this._relayConn()) if (c.mq.backlog() < 262144) c.mq.pub(this.T + 'g/' + this.cid, text);
          this.lastRelay = t;
        }
      }
    }
  }
  // 直接の道が生きている（開いていて、相手からも最近届いている）
  _live(P, t = now()) { return !!(P && P.dc && P.dc.readyState === 'open' && t - (P.dcAt || 0) < 3000); }
  // ---- WebRTC（直接）
  _maybeP2P() {
    if (!this.p2pOn || this.role !== 'guest' || !this.hostCid) return;
    const P = this._peer(this.hostCid);
    if (P.pc || P.tries >= 3 || now() < P.nextTry) return;
    this._offer(P).catch((e) => { console.warn('p2p', e); this._dropP2P(P); });
  }
  async _offer(P) {
    P.tries++; P.xid = rid();
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    P.pc = pc;
    this._wirePc(P, pc);
    this._wireDc(P, pc.createDataChannel('m', { ordered: false, maxRetransmits: 0 }));
    await pc.setLocalDescription(await pc.createOffer());
    await iceDone(pc, 3000);
    if (P.pc !== pc || this.closed) return;
    this._sig(P.cid, { k: 'offer', x: P.xid, sdp: pc.localDescription.sdp });
    clearTimeout(P.to);
    P.to = setTimeout(() => { if (P.pc === pc && !P.open) this._dropP2P(P); }, 15000);
  }
  async _answer(i, m) {
    const P = this._peer(m.f); P.b = i;
    if (P.pc) this._closePc(P);
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    P.pc = pc; P.xid = m.x;
    this._wirePc(P, pc);
    pc.ondatachannel = (e) => this._wireDc(P, e.channel);
    await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await iceDone(pc, 3000);
    if (P.pc !== pc || this.closed) return;
    this._sig(m.f, { k: 'answer', x: m.x, sdp: pc.localDescription.sdp }, i);
  }
  _signal(i, m) {
    if (typeof m.f !== 'string' || typeof m.sdp !== 'string' || m.sdp.length > 30000 || m.f === this.cid) return;
    if (this.role === 'host' && m.k === 'offer') { if (this.p2pOn) this._answer(i, m).catch((e) => console.warn('p2p', e)); }
    else if (this.role === 'guest' && m.k === 'answer') {
      const P = this.peers.get(m.f);
      if (P && P.pc && P.xid === m.x && P.pc.signalingState === 'have-local-offer') P.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }).catch(() => this._dropP2P(P));
    }
  }
  _sig(to, obj, via) {
    obj.f = this.cid;
    const text = JSON.stringify(obj);
    const c = (via != null && this.conns[via] && this.conns[via].ok) ? this.conns[via] : this._relayConn()[0];
    if (c) c.mq.pub(this.T + 's/' + to, text);
  }
  _wirePc(P, pc) {
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'failed' || st === 'closed') this._dropP2P(P);
      else if (st === 'disconnected') { clearTimeout(P.dto); P.dto = setTimeout(() => { if (pc.connectionState === 'disconnected') this._dropP2P(P); }, 5000); }
    };
  }
  _wireDc(P, dc) {
    P.dc = dc;
    dc.onopen = () => { P.open = true; P.dcAt = now(); clearTimeout(P.to); this.onStatus(this.info()); };
    dc.onclose = () => { if (P.dc === dc) this._dropP2P(P); };
    dc.onmessage = (e) => {
      if (typeof e.data !== 'string' || e.data.length > 60000) return;
      let m; try { m = JSON.parse(e.data); } catch (err) { return; }
      if (!m || typeof m !== 'object') return;
      P.at = now(); P.dcAt = P.at;
      this.onMsg(P.cid, m);
    };
  }
  _closePc(P) {
    try { P.dc && P.dc.close(); } catch (e) { /* なし */ }
    try { P.pc && P.pc.close(); } catch (e) { /* なし */ }
    P.dc = null; P.pc = null; P.open = false;
  }
  _dropP2P(P) {
    const was = P.open;
    this._closePc(P);
    P.nextTry = now() + 15000;
    if (was) this.onStatus(this.info());
  }
  _tick() {
    if (this.closed) return;
    // 直接のやりとりを、間をあけて試し直す
    if (this.role === 'guest') this._maybeP2P();
    // 長く何も来ない相手を忘れる
    const t = now();
    for (const [cid, P] of this.peers) if (t - P.at > 60000 && !P.open) { this._closePc(P); this.peers.delete(cid); this.onGone(cid); }
  }
  knows(cid) { const P = this.peers.get(cid); return !!(P && now() - P.at < 10000); }
  info() {
    const conns = this.conns.filter(c => c && c.ok).map(c => c.b.name);
    let p2p = 0, relay = 0;
    for (const P of this.peers.values()) { if (this._live(P)) p2p++; else if (P.b != null) relay++; }
    return { kind: 'net', servers: conns, p2p, relay };
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    for (const P of this.peers.values()) { clearTimeout(P.to); clearTimeout(P.dto); this._closePc(P); }
    for (const c of this.conns) if (c && c.mq) c.mq.close();
  }
}

// Claudeの「部屋」: 各自の presence に最新の状態を置く（4KBまで）
export class RoomLink {
  constructor({ code, role, cid, claude }) {
    this.kind = 'room'; this.code = code; this.role = role; this.cid = cid;
    this.cl = claude || globalThis.claude;
    this.onMsg = () => {}; this.onGone = () => {}; this.onStatus = () => {};
    this.closed = false; this.peerCid = new Map(); this.conn = false;
    this.enc = new TextEncoder();
  }
  async open() {
    const cl = this.cl;
    if (!cl || typeof cl.use !== 'function') throw new Error('noroom');
    const room = await cl.use('room');
    if (!room) throw new Error('noroom');
    this.rm = await room.join('he-' + this.code.toLowerCase());
    this.unsub = this.rm.onPeers((ch) => {
      for (const p of [...ch.joined, ...ch.updated]) {
        if (p.sameTab || p.kind !== 'viewer') continue;
        const m = p.presence && p.presence.m;
        if (!m || typeof m !== 'object' || typeof m.cid !== 'string') continue;
        this.peerCid.set(p.peer, m.cid);
        this.onMsg(m.cid, m);
      }
      for (const p of ch.left) { const cid = this.peerCid.get(p.peer); if (cid) { this.peerCid.delete(p.peer); this.onGone(cid); } }
    }, (e) => { this.conn = false; this.onStatus(this.info()); console.warn('room', e && e.code); });
    this.unconn = this.rm.onConnection((c) => { this.conn = !!c; this.onStatus(this.info()); });
    return this;
  }
  send(obj) {
    if (this.closed || !this.rm) return;
    let o = obj;
    let text = JSON.stringify(o);
    // 4KBを超えそうなら、出来事と名簿を減らす（次の状態で届く）
    if (this.enc.encode(text).length > 3900 && o.g) {
      o = { ...o, g: { ...o.g, E: (o.g.E || []).slice(-4) } };
      text = JSON.stringify(o);
      if (this.enc.encode(text).length > 3900) { o = { ...o }; delete o.ro; text = JSON.stringify(o); }
    }
    if (this.enc.encode(text).length > 4000) return;
    this.rm.presence({ m: o }).catch((e) => { if (e && e.code !== 'upstream_error') console.warn('presence', e && e.code); });
  }
  info() { return { kind: 'room', ok: this.conn }; }
  knows(cid) { for (const v of this.peerCid.values()) if (v === cid) return true; return false; }
  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.unsub && this.unsub(); this.unconn && this.unconn(); } catch (e) { /* なし */ }
    try { this.rm && this.rm.presence({ m: null }).catch(() => {}); } catch (e) { /* なし */ }
    try { this.rm && this.rm.leave().catch(() => {}); } catch (e) { /* なし */ }
  }
}

// いくつかの通信路をまとめて1つに見せる（同じものが2回届いても、番号で古いものは捨てられる）
export class MultiLink {
  constructor(links) {
    this.links = links; this.kind = links.map(l => l.kind).join('+');
    this.onMsg = () => {}; this.onGone = () => {}; this.onStatus = () => {};
    for (const l of links) {
      l.onMsg = (f, m) => this.onMsg(f, m);
      l.onGone = (f) => { if (!this.links.some(x => x !== l && x.knows && x.knows(f))) this.onGone(f); };
      l.onStatus = () => this.onStatus(this.info());
    }
  }
  send(obj, force) { for (const l of this.links) l.send(obj, force); }
  info() { return { kind: this.kind, parts: this.links.map(l => l.info()) }; }
  close() { for (const l of this.links) l.close(); }
}

// 通信路を開く。room: Claudeの部屋を使ってみる。net: 公開サーバー。どちらか開けば使う
export async function openLink({ code, role, cid, room = true, net = true, brokers, ice, p2p = true, claude }) {
  const tries = [];
  const cl = claude || globalThis.claude;
  if (room && cl && typeof cl.use === 'function') tries.push(new RoomLink({ code, role, cid, claude: cl }));
  if (net) tries.push(new NetLink({ code, role, cid, brokers, ice, p2p }));
  const res = await Promise.all(tries.map(l => l.open().then(() => l, (e) => { console.warn('link', l.kind, e && e.message); return null; })));
  const ok = res.filter(Boolean);
  if (!ok.length) throw new Error('つながりません');
  return ok.length === 1 ? ok[0] : new MultiLink(ok);
}
