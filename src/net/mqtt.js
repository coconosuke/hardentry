// 小さな MQTT 3.1.1 クライアント（WebSocketの上。QoS 0 だけ）。外部のライブラリは使わない
// 使い方: const c = new Mqtt(url, { id, onMsg(topic, text), onClose(reason) }); await c.open(); c.sub('a/+'); c.pub('a/b', 'text');
const enc = new TextEncoder(), dec = new TextDecoder();

function varLen(n) {
  const out = [];
  do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; out.push(b); } while (n > 0);
  return out;
}
function str(s) { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; }
function packet(type, body) {
  const head = [type, ...varLen(body.length)];
  const out = new Uint8Array(head.length + body.length);
  out.set(head, 0); out.set(body, head.length);
  return out;
}

export function mqttConnect(id, keepAlive = 30) {
  return packet(0x10, Uint8Array.from([...str('MQTT'), 4, 0x02, keepAlive >> 8, keepAlive & 255, ...str(id)]));
}
export function mqttPublish(topic, payload) {
  const t = str(topic), p = typeof payload === 'string' ? enc.encode(payload) : payload;
  const body = new Uint8Array(t.length + p.length);
  body.set(t, 0); body.set(p, t.length);
  return packet(0x30, body);
}
export function mqttSubscribe(pid, filters) {
  const body = [pid >> 8, pid & 255];
  for (const f of filters) body.push(...str(f), 0);
  return packet(0x82, Uint8Array.from(body));
}
export const PINGREQ = Uint8Array.from([0xc0, 0]);
export const DISCONNECT = Uint8Array.from([0xe0, 0]);

// 受け取ったバイト列から、まとまった MQTT のパケットを取り出す（途中で切れていたら残す）
export class MqttReader {
  constructor() { this.buf = new Uint8Array(0); }
  push(chunk) {
    const b = new Uint8Array(this.buf.length + chunk.length);
    b.set(this.buf, 0); b.set(chunk, this.buf.length);
    this.buf = b;
    const out = [];
    for (;;) {
      if (this.buf.length < 2) break;
      let len = 0, mul = 1, i = 1, ok = false;
      for (; i < 5 && i < this.buf.length; i++) {
        const v = this.buf[i];
        len += (v & 127) * mul; mul *= 128;
        if (!(v & 128)) { ok = true; i++; break; }
      }
      if (!ok) { if (this.buf.length >= 5) throw new Error('MQTTの長さが読めない'); break; }
      if (this.buf.length < i + len) break;
      out.push({ type: this.buf[0] >> 4, flags: this.buf[0] & 15, body: this.buf.subarray(i, i + len) });
      this.buf = this.buf.slice(i + len);
    }
    return out;
  }
}
export function parsePublish(pk) {
  const b = pk.body;
  const tl = (b[0] << 8) | b[1];
  const topic = dec.decode(b.subarray(2, 2 + tl));
  let off = 2 + tl;
  if (((pk.flags >> 1) & 3) > 0) off += 2; // QoS1/2 の番号（使わないが読み飛ばす）
  return { topic, payload: b.subarray(off) };
}

export class Mqtt {
  constructor(url, { id, onMsg, onClose, keepAlive = 30 } = {}) {
    this.url = url; this.id = id || ('m' + Math.random().toString(36).slice(2, 12));
    this.onMsg = onMsg || (() => {}); this.onClose = onClose || (() => {});
    this.keepAlive = keepAlive; this.pid = 1; this.ok = false; this.closed = false;
    this.reader = new MqttReader();
    this.sent = 0; this.recv = 0;
  }
  open(timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = (why) => { if (done) return; done = true; try { this.ws && this.ws.close(); } catch (e) { /* なし */ } reject(new Error(why)); };
      const timer = setTimeout(() => fail('接続が時間切れ'), timeoutMs);
      let ws;
      try { ws = new WebSocket(this.url, ['mqtt']); } catch (e) { clearTimeout(timer); fail(String(e.message || e)); return; }
      this.ws = ws;
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => { try { ws.send(mqttConnect(this.id, this.keepAlive)); } catch (e) { fail('送れない'); } };
      ws.onerror = () => fail('つながらない');
      ws.onclose = () => {
        clearTimeout(timer);
        if (!done) { fail('切れた'); return; }
        this._down('切れた');
      };
      ws.onmessage = (e) => {
        let pks;
        try { pks = this.reader.push(new Uint8Array(e.data)); } catch (err) { this._down('壊れたデータ'); return; }
        for (const pk of pks) {
          if (pk.type === 2) { // CONNACK
            clearTimeout(timer);
            if (pk.body[1] !== 0) { fail('断られた(' + pk.body[1] + ')'); return; }
            done = true; this.ok = true;
            this.ping = setInterval(() => this._raw(PINGREQ), Math.max(5, this.keepAlive * 0.6) * 1000);
            resolve(this);
          } else if (pk.type === 3) { // PUBLISH
            this.recv++;
            const { topic, payload } = parsePublish(pk);
            try { this.onMsg(topic, dec.decode(payload)); } catch (err) { console.warn('mqtt msg', err); }
          }
          // SUBACK(9)・PINGRESP(13) は特にすることがない
        }
      };
    });
  }
  _raw(bytes) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    try { this.ws.send(bytes); return true; } catch (e) { return false; }
  }
  sub(...filters) { this.pid = (this.pid % 65000) + 1; return this._raw(mqttSubscribe(this.pid, filters)); }
  pub(topic, text) { if (!this.ok) return false; this.sent++; return this._raw(mqttPublish(topic, text)); }
  // 送れずにたまっている量（多すぎたら送るのを控える）
  backlog() { return this.ws ? this.ws.bufferedAmount : 0; }
  _down(why) {
    if (this.closed) return;
    this.closed = true; this.ok = false;
    clearInterval(this.ping);
    try { this.onClose(why); } catch (e) { /* なし */ }
  }
  close() {
    if (this.closed) return;
    this._raw(DISCONNECT);
    this.closed = true; this.ok = false;
    clearInterval(this.ping);
    try { this.ws && this.ws.close(); } catch (e) { /* なし */ }
  }
}
