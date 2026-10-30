// テスト用の小さな MQTT ブローカー（WebSocketの上・QoS 0・自作）。
// 実際の公開サーバーの代わりに、ここで通信対戦の試験をする。遅延と取りこぼしも足せる。
//   node tools/mqttbroker.mjs --port 18830 [--delay 60] [--jitter 30] [--loss 0.05]
//   import { startBroker } from './mqttbroker.mjs'; const b = await startBroker({ port: 0 }); b.url; b.close();
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MqttReader, parsePublish, mqttPublish } from '../src/net/mqtt.js';

function wsAccept(key) { return crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64'); }

// WebSocketの枠を読む（クライアントからは必ずマスクつき）
class WsReader {
  constructor() { this.buf = Buffer.alloc(0); this.frag = []; }
  push(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    const out = [];
    for (;;) {
      if (this.buf.length < 2) break;
      const b0 = this.buf[0], b1 = this.buf[1];
      let len = b1 & 127, off = 2;
      if (len === 126) { if (this.buf.length < 4) break; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) break; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      const masked = !!(b1 & 128);
      const need = off + (masked ? 4 : 0) + len;
      if (this.buf.length < need) break;
      let data = this.buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) { const mk = this.buf.subarray(off, off + 4); data = Buffer.from(data); for (let i = 0; i < data.length; i++) data[i] ^= mk[i & 3]; }
      this.buf = this.buf.subarray(need);
      const op = b0 & 15, fin = !!(b0 & 128);
      if (op === 0 || op === 1 || op === 2) {
        this.frag.push(data);
        if (fin) { out.push({ op: op || 2, data: Buffer.concat(this.frag) }); this.frag = []; }
      } else out.push({ op, data });
    }
    return out;
  }
}
function wsFrame(op, data) {
  const len = data.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, data]);
}

function match(filter, topic) {
  const f = filter.split('/'), t = topic.split('/');
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '#') return true;
    if (i >= t.length) return false;
    if (f[i] !== '+' && f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}

export function startBroker({ port = 0, delay = 0, jitter = 0, loss = 0, log = false } = {}) {
  const clients = new Set();
  const stats = { published: 0, delivered: 0, dropped: 0, conns: 0 };
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('mqtt test broker'); });
  server.on('upgrade', (req, sock) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) { sock.destroy(); return; }
    const proto = (req.headers['sec-websocket-protocol'] || '').split(',').map(s => s.trim()).includes('mqtt') ? 'Sec-WebSocket-Protocol: mqtt\r\n' : '';
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${wsAccept(key)}\r\n${proto}\r\n`);
    sock.setNoDelay(true);
    const c = { sock, subs: [], id: null, ws: new WsReader(), mq: new MqttReader(), alive: true };
    clients.add(c); stats.conns++;
    const send = (bytes) => { if (!c.alive) return; try { sock.write(wsFrame(2, Buffer.from(bytes))); } catch (e) { /* なし */ } };
    c.send = send;
    const drop = () => { c.alive = false; clients.delete(c); try { sock.destroy(); } catch (e) { /* なし */ } };
    c.drop = drop;
    sock.on('data', (chunk) => {
      let frames;
      try { frames = c.ws.push(chunk); } catch (e) { drop(); return; }
      for (const fr of frames) {
        if (fr.op === 8) { drop(); return; }
        if (fr.op === 9) { try { sock.write(wsFrame(10, fr.data)); } catch (e) { /* なし */ } continue; }
        if (fr.op !== 2 && fr.op !== 1) continue;
        let pks;
        try { pks = c.mq.push(new Uint8Array(fr.data)); } catch (e) { drop(); return; }
        for (const pk of pks) {
          if (pk.type === 1) { send(Uint8Array.from([0x20, 2, 0, 0])); }
          else if (pk.type === 8) {
            const b = pk.body; const pid = (b[0] << 8) | b[1];
            let off = 2; const codes = [];
            while (off < b.length) { const l = (b[off] << 8) | b[off + 1]; c.subs.push(Buffer.from(b.subarray(off + 2, off + 2 + l)).toString('utf8')); off += 2 + l + 1; codes.push(0); }
            send(Uint8Array.from([0x90, 2 + codes.length, pid >> 8, pid & 255, ...codes]));
          } else if (pk.type === 3) {
            const { topic, payload } = parsePublish(pk);
            stats.published++;
            const bytes = mqttPublish(topic, payload);
            for (const o of clients) {
              if (!o.subs.some(f => match(f, topic))) continue;
              if (loss > 0 && Math.random() < loss) { stats.dropped++; continue; }
              const d = delay + (jitter ? Math.random() * jitter : 0);
              stats.delivered++;
              if (d > 0) setTimeout(() => o.send(bytes), d); else o.send(bytes);
            }
            if (log) console.log('pub', topic, payload.length);
          } else if (pk.type === 12) send(Uint8Array.from([0xd0, 0]));
          else if (pk.type === 14) { drop(); return; }
        }
      }
    });
    sock.on('close', () => { c.alive = false; clients.delete(c); });
    sock.on('error', () => { c.alive = false; clients.delete(c); });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const p = server.address().port;
      resolve({
        port: p, url: `ws://127.0.0.1:${p}/mqtt`, stats, clients,
        set(o) { if ('delay' in o) delay = o.delay; if ('jitter' in o) jitter = o.jitter; if ('loss' in o) loss = o.loss; },
        // 全員の接続を切る（再接続の試験）
        kick() { for (const c of [...clients]) c.drop(); },
        close() { for (const c of [...clients]) c.drop(); return new Promise(r => server.close(() => r())); },
      });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => { if (v.startsWith('--')) acc.push([v.slice(2), arr[i + 1]]); return acc; }, []));
  const b = await startBroker({ port: +(a.port || 18830), delay: +(a.delay || 0), jitter: +(a.jitter || 0), loss: +(a.loss || 0), log: !!a.log });
  console.log('MQTT test broker:', b.url);
}
