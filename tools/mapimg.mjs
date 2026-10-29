// マップの見取り図をPNGに: node tools/mapimg.mjs <mapId> [出力.png] [拡大]
import fs from 'node:fs';
import zlib from 'node:zlib';
import { compileMap, C, CS, LH } from '../src/engine/world.js';
import { MAPS } from '../src/engine/maps/index.js';
import { M } from '../src/engine/data/materials.js';

function png(w, h, rgb) {
  const crcT = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c; }
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]); };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export function mapImage(id, s = 6) {
  const def = MAPS[id];
  const w = compileMap(def);
  const W = w.W * s, H = (w.D * s + 8) * w.NL;
  const buf = Buffer.alloc(W * H * 3, 20);
  const put = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 3; buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) put(x, y, c); };
  const FC = { 1: [150, 150, 150], 2: [215, 215, 210], 3: [175, 135, 95], 4: [140, 110, 120], 5: [70, 70, 75], 6: [100, 150, 70], 7: [150, 125, 95], 8: [160, 165, 175] };
  for (let L = 0; L < w.NL; L++) {
    const oy = L * (w.D * s + 8);
    for (let j = 0; j < w.D; j++) for (let i = 0; i < w.W; i++) {
      const k = w.idx(L, i, j), t = w.cell[k];
      let c = null;
      if (t === C.FLOOR || t === C.OUT) c = FC[w.floorMat[k]] || [120, 120, 120];
      else if (t === C.STAIR) c = [200, 180, 60];
      else if (t === C.DOOR) c = w.wallMat[k] === M.DOORMETAL ? [90, 110, 140] : [160, 90, 40];
      else if (t === C.WINDOW || t === C.GLASSWALL) c = [80, 170, 230];
      else if (t === C.OPEN) c = [200, 200, 120];
      else if (t === C.LOW) c = [110, 110, 90];
      else if (t === C.FENCE) c = [140, 160, 160];
      else if (t === C.WALL) c = w.wallMat[k] === M.BRICK ? [120, 40, 30] : w.wallMat[k] === M.CONCRETE ? [60, 60, 60] : w.wallMat[k] === M.WOOD ? [120, 90, 50] : [35, 35, 35];
      if (!c) continue;
      if (t === C.WALL || t === C.DOOR || t === C.WINDOW || t === C.GLASSWALL || t === C.LOW || t === C.FENCE || t === C.OPEN) {
        // 床を下に
        rect(i * s, oy + j * s, (i + 1) * s, oy + (j + 1) * s, [90, 90, 90]);
        for (let n = 0; n < w.nbox[k]; n++) { const o = k * 8 + n * 4; rect(w.boxes[o] / CS * s, oy + w.boxes[o + 1] / CS * s, w.boxes[o + 2] / CS * s, oy + w.boxes[o + 3] / CS * s, c); }
        if (!w.nbox[k]) rect(i * s, oy + j * s, (i + 1) * s, oy + (j + 1) * s, c);
      } else rect(i * s, oy + j * s, (i + 1) * s, oy + (j + 1) * s, c);
    }
    for (const p of w.props) {
      if (p.L !== L) continue;
      rect((p.x - p.w / 2) / CS * s, oy + (p.z - p.d / 2) / CS * s, (p.x + p.w / 2) / CS * s, oy + (p.z + p.d / 2) / CS * s, p.solid ? [235, 200, 120] : [200, 200, 160]);
    }
    const dot = (x, z, c, r = 3) => rect(x * s - r, oy + z * s - r, x * s + r, oy + z * s + r, c);
    const sp = def.spawn || {};
    for (const e of sp.swat || []) if ((e.L || 0) === L) dot(e.x, e.z, [40, 120, 255], 5);
    for (const e of sp.sus || []) if ((e[2] || 0) === L) dot(e[0], e[1], [255, 40, 40]);
    for (const e of sp.civ || []) if ((e[2] || 0) === L) dot(e[0], e[1], [40, 230, 80]);
    for (const e of sp.hostage || []) if ((e[2] || 0) === L) dot(e[0], e[1], [255, 255, 0]);
    for (const e of sp.bomb || []) if ((e[2] || 0) === L) dot(e[0], e[1], [255, 140, 0]);
    for (const e of sp.evidence || []) if ((e[2] || 0) === L) dot(e[0], e[1], [200, 60, 255], 2);
    if (sp.pvp) { for (const e of sp.pvp.a || []) if ((e[2] || 0) === L) dot(e[0], e[1], [0, 255, 255], 2); for (const e of sp.pvp.b || []) if ((e[2] || 0) === L) dot(e[0], e[1], [255, 0, 255], 2); }
    for (const e of sp.sites || []) if ((e.L || 0) === L) { const r = (e.r || 3.2) / CS * s; rect(e.x * s - r, oy + e.z * s - 1, e.x * s + r, oy + e.z * s + 1, [255, 255, 255]); rect(e.x * s - 1, oy + e.z * s - r, e.x * s + 1, oy + e.z * s + r, [255, 255, 255]); }
    for (const lt of def.lights || []) if ((lt[2] || 0) === L) dot(lt[0], lt[1], [255, 250, 200], 1);
  }
  return { png: png(W, H, buf), w, errors: w.errors };
}

if (process.argv[1] && process.argv[1].endsWith('mapimg.mjs')) {
  const id = process.argv[2] || 'training';
  const out = process.argv[3] || `/tmp/map_${id}.png`;
  const r = mapImage(id, +(process.argv[4] || 6));
  fs.writeFileSync(out, r.png);
  console.log(JSON.stringify({ out, W: r.w.W, D: r.w.D, NL: r.w.NL, rooms: r.w.rooms.length, doors: r.w.doors.length, errors: r.errors.slice(0, 8) }));
}
