// WAR BIT の世界: 地形（hs m ごとの高さの格子）＋箱（壁・床・屋根・塀・岩など。材質と耐久つき）＋坂の板（階段）＋円柱（木・柱）。
// G m の格子（引き出し）で引く。弾・視線（raycast）・足もと（groundAt）・天井（ceilAt）・体の押し出し（pushOut）はみなここ。
// 0.5m のマスの建物（engine/world.js）とは別物。engine/world.js の関数は w.war のときここへ回す。
import { M } from '../engine/data/materials.js';

export const G = 8;          // 引き出しの格子（m）
export const STEP = 0.36;    // 上がれる段差（engine と同じ）
const EPS = 1e-6;

// o: { sx, sz（広さ m）, hs（高さの格子 m）, heights?（Float32Array (HW*HD)）, seed }
export function makeWarWorld(o) {
  const sx = o.sx, sz = o.sz, hs = o.hs || 2;
  const HW = Math.floor(sx / hs) + 1, HD = Math.floor(sz / hs) + 1;
  const GW = Math.ceil(sx / G), GD = Math.ceil(sz / G);
  const ww = {
    war: true, sx, sz, hs, HW, HD, GW, GD,
    h: o.heights || new Float32Array(HW * HD),
    boxes: [], ramps: [], cyls: [],
    cellBox: null, cellRamp: null, cellCyl: null, cellMaxH: null,
    stamp: new Uint32Array(0), stampN: 1,
    // engine の w と同じ名前で持つ物（使わない物は空）
    NL: 1, W: Math.ceil(sx / 0.5), D: Math.ceil(sz / 0.5), rooms: [], doors: [], windows: [], props: [], stairs: [], bars: [], errors: [],
  };
  return ww;
}

// 箱: { x0,y0,z0,x1,y1,z1, mat, hp?, kind?, bld?, opaque?(既定 true), walk?(上に立てる。既定 true) }
export function addBox(ww, b) {
  const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), z0 = Math.min(b.z0, b.z1), z1 = Math.max(b.z0, b.z1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
  const box = { id: ww.boxes.length, x0, y0, z0, x1, y1, z1, mat: b.mat ?? M.CONCRETE, hp: b.hp ?? 1e9, kind: b.kind || 'wall', bld: b.bld ?? -1, opaque: b.opaque !== false, walk: b.walk !== false, alive: true, col: b.col || null };
  ww.boxes.push(box);
  return box;
}
// 坂の板（階段・斜路）: 四角 x0..x1 × z0..z1 で、dir の向きへ y0 から y1 へ上がる（'n' -z・'s' +z・'e' +x・'w' -x）。厚み th
export function addRamp(ww, r) {
  const ramp = { id: ww.ramps.length, x0: Math.min(r.x0, r.x1), x1: Math.max(r.x0, r.x1), z0: Math.min(r.z0, r.z1), z1: Math.max(r.z0, r.z1), y0: r.y0, y1: r.y1, dir: r.dir, th: r.th ?? 0.25, mat: r.mat ?? M.CONCRETE, bld: r.bld ?? -1, col: r.col || null };
  ww.ramps.push(ramp);
  return ramp;
}
// 円柱（木の幹・柱・電柱）
export function addCyl(ww, c) {
  const cyl = { id: ww.cyls.length, x: c.x, z: c.z, r: c.r, y0: c.y0, y1: c.y1, mat: c.mat ?? M.WOOD, kind: c.kind || 'tree', alive: true, opaque: c.opaque !== false };
  ww.cyls.push(cyl);
  return cyl;
}

// 置き終わったら引き出しを作る
export function finishWorld(ww) {
  const n = ww.GW * ww.GD;
  const cb = Array.from({ length: n }, () => []), cr = Array.from({ length: n }, () => []), cc = Array.from({ length: n }, () => []);
  const span = (x0, z0, x1, z1, f) => {
    const i0 = Math.max(0, Math.floor(x0 / G)), i1 = Math.min(ww.GW - 1, Math.floor(x1 / G));
    const j0 = Math.max(0, Math.floor(z0 / G)), j1 = Math.min(ww.GD - 1, Math.floor(z1 / G));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(j * ww.GW + i);
  };
  for (const b of ww.boxes) span(b.x0, b.z0, b.x1, b.z1, (k) => cb[k].push(b.id));
  for (const r of ww.ramps) span(r.x0, r.z0, r.x1, r.z1, (k) => cr[k].push(r.id));
  for (const c of ww.cyls) span(c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r, (k) => cc[k].push(c.id));
  ww.cellBox = cb; ww.cellRamp = cr; ww.cellCyl = cc;
  // 引き出しごとの地形の一番高い所（光線が上を通るなら地形は調べない）
  const mh = new Float32Array(n).fill(-1e9);
  for (let j = 0; j < ww.GD; j++) for (let i = 0; i < ww.GW; i++) {
    const a0 = Math.floor(i * G / ww.hs), a1 = Math.min(ww.HW - 1, Math.ceil((i + 1) * G / ww.hs));
    const b0 = Math.floor(j * G / ww.hs), b1 = Math.min(ww.HD - 1, Math.ceil((j + 1) * G / ww.hs));
    let m = -1e9;
    for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) m = Math.max(m, ww.h[b * ww.HW + a]);
    mh[j * ww.GW + i] = m;
  }
  ww.cellMaxH = mh;
  ww.stamp = new Uint32Array(Math.max(ww.boxes.length, ww.ramps.length, ww.cyls.length) + 16);
  return ww;
}
// 壊れた・足した物があったら、その物だけ引き出しに入れ直す（壊れた箱は alive=false で残す）
export function reindexBox(ww, b) {
  const i0 = Math.max(0, Math.floor(b.x0 / G)), i1 = Math.min(ww.GW - 1, Math.floor(b.x1 / G));
  const j0 = Math.max(0, Math.floor(b.z0 / G)), j1 = Math.min(ww.GD - 1, Math.floor(b.z1 / G));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const a = ww.cellBox[j * ww.GW + i]; if (!a.includes(b.id)) a.push(b.id); }
  if (ww.stamp.length < ww.boxes.length + 1) { const s = new Uint32Array(ww.boxes.length * 2); s.set(ww.stamp); ww.stamp = s; }
}

// ---- 地形
export function heightAt(ww, x, z) {
  const fx = Math.max(0, Math.min(ww.HW - 1.001, x / ww.hs)), fz = Math.max(0, Math.min(ww.HD - 1.001, z / ww.hs));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const H = ww.h, W = ww.HW, k = j * W + i;
  // 三角形2枚で（描く地形と同じ形）
  if (u + v <= 1) return H[k] + (H[k + 1] - H[k]) * u + (H[k + W] - H[k]) * v;
  return H[k + W + 1] + (H[k + W] - H[k + W + 1]) * (1 - u) + (H[k + 1] - H[k + W + 1]) * (1 - v);
}
export function normalAt(ww, x, z, out = [0, 1, 0]) {
  const e = ww.hs * 0.5;
  const dx = heightAt(ww, x + e, z) - heightAt(ww, x - e, z), dz = heightAt(ww, x, z + e) - heightAt(ww, x, z - e);
  const nx = -dx, ny = 2 * e, nz = -dz, l = Math.hypot(nx, ny, nz) || 1;
  out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
  return out;
}
export function inWorld(ww, x, z) { return x >= 0 && z >= 0 && x <= ww.sx && z <= ww.sz; }

function rampH(r, x, z) {
  let t;
  if (r.dir === 'n') t = (r.z1 - z) / (r.z1 - r.z0);
  else if (r.dir === 's') t = (z - r.z0) / (r.z1 - r.z0);
  else if (r.dir === 'e') t = (x - r.x0) / (r.x1 - r.x0);
  else t = (r.x1 - x) / (r.x1 - r.x0);
  t = Math.max(0, Math.min(1, t));
  return r.y0 + (r.y1 - r.y0) * t;
}
function cellOfXZ(ww, x, z) {
  const i = Math.floor(x / G), j = Math.floor(z / G);
  if (i < 0 || j < 0 || i >= ww.GW || j >= ww.GD) return -1;
  return j * ww.GW + i;
}

// 足もとの高さ: y（足の高さ）から STEP 以内で上にある、いちばん高い面（地形・箱の上面・坂）。なければ -100
export function groundAt(ww, x, z, y) {
  let best = -100;
  if (inWorld(ww, x, z)) { const h = heightAt(ww, x, z); if (h <= y + STEP + 0.02) best = h; }
  const k = cellOfXZ(ww, x, z);
  if (k < 0) return best;
  for (const id of ww.cellBox[k]) {
    const b = ww.boxes[id];
    if (!b.alive || !b.walk || x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
    if (b.y1 <= y + STEP + 0.02 && b.y1 > best) best = b.y1;
  }
  for (const id of ww.cellRamp[k]) {
    const r = ww.ramps[id];
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
    const h = rampH(r, x, z);
    if (h <= y + STEP + 0.02 && h > best) best = h;
  }
  return best;
}
// 頭の上: y より上で、いちばん低い箱の下面（屋根・上の階の床）。なければ 1e9
export function ceilAt(ww, x, z, y) {
  let best = 1e9;
  const k = cellOfXZ(ww, x, z);
  if (k < 0) return best;
  for (const id of ww.cellBox[k]) {
    const b = ww.boxes[id];
    if (!b.alive || x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
    if (b.y0 > y + 0.1 && b.y0 < best) best = b.y0;
  }
  for (const id of ww.cellRamp[k]) {
    const r = ww.ramps[id];
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
    const h = rampH(r, x, z) - r.th;
    if (h > y + 0.1 && h < best) best = h;
  }
  return best;
}

// 円（半径 r、高さ y0..y1）が箱・円柱にめり込んでいたら押し出す。戻り値 out = [dx, dz, 当たったか]
// 上面が足から STEP 以内の箱（段差・床）は押さない（上に乗る）。坂の板の横は箱の壁で囲む前提
export function pushOut(ww, x, z, y0, y1, r, out = [0, 0, 0]) {
  let px = x, pz = z, hit = 0;
  ww.stampN++;
  const st = ww.stamp, sn = ww.stampN;
  for (let pass = 0; pass < 2; pass++) {
    const i0 = Math.max(0, Math.floor((px - r) / G)), i1 = Math.min(ww.GW - 1, Math.floor((px + r) / G));
    const j0 = Math.max(0, Math.floor((pz - r) / G)), j1 = Math.min(ww.GD - 1, Math.floor((pz + r) / G));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * ww.GW + i;
      for (const id of ww.cellBox[k]) {
        const b = ww.boxes[id];
        if (!b.alive || b.y1 <= y0 + STEP || b.y0 >= y1) continue;
        if (pass === 0) { if (st[id] === sn) continue; st[id] = sn; }
        // 円と四角
        const cx = Math.max(b.x0, Math.min(px, b.x1)), cz = Math.max(b.z0, Math.min(pz, b.z1));
        let dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > EPS) { const d = Math.sqrt(d2), k2 = (r - d) / d; px += dx * k2; pz += dz * k2; }
        else {
          // 中に入っている: いちばん近い辺から外へ
          const l = px - b.x0, rr = b.x1 - px, f = pz - b.z0, bk = b.z1 - pz, m = Math.min(l, rr, f, bk);
          if (m === l) px = b.x0 - r; else if (m === rr) px = b.x1 + r; else if (m === f) pz = b.z0 - r; else pz = b.z1 + r;
        }
        hit = 1;
      }
      for (const id of ww.cellCyl[k]) {
        const c = ww.cyls[id];
        if (!c.alive || c.y1 <= y0 + STEP || c.y0 >= y1) continue;
        const dx = px - c.x, dz = pz - c.z, rr = r + c.r, d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-3, k2 = (rr - d) / d;
        px += (d2 > EPS ? dx : 1e-3) * k2; pz += dz * k2;
        hit = 1;
      }
    }
  }
  // 世界の端
  const m = 0.5;
  if (px < m) { px = m; hit = 1; } if (pz < m) { pz = m; hit = 1; }
  if (px > ww.sx - m) { px = ww.sx - m; hit = 1; } if (pz > ww.sz - m) { pz = ww.sz - m; hit = 1; }
  out[0] = px - x; out[1] = pz - z; out[2] = hit;
  return out;
}

// ---- 光線: 当たった物を近い順に { t0, t1, kind:'box'|'stair'|'prop'|'ground'|'edge', mat, id, nx, ny, nz }
// opt.stopOpaque: 視線用（最初の見えない物で止める）、opt.out: 返す配列
function rayCyl(ox, oy, oz, dx, dy, dz, c) {
  const fx = ox - c.x, fz = oz - c.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) { if (fx * fx + fz * fz > c.r * c.r) return null; const t0 = dy > 0 ? (c.y0 - oy) / dy : (c.y1 - oy) / dy; return null; }
  const b = 2 * (fx * dx + fz * dz), cc = fx * fx + fz * fz - c.r * c.r, disc = b * b - 4 * a * cc;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t0 = (-b - sq) / (2 * a), t1 = (-b + sq) / (2 * a);
  if (t1 < 0) return null;
  // 高さで切る
  const y0 = oy + dy * t0, y1 = oy + dy * t1;
  if ((y0 < c.y0 && y1 < c.y0) || (y0 > c.y1 && y1 > c.y1)) return null;
  if (Math.abs(dy) > 1e-9) {
    const ta = (c.y0 - oy) / dy, tb = (c.y1 - oy) / dy, lo = Math.min(ta, tb), hi = Math.max(ta, tb);
    t0 = Math.max(t0, lo); t1 = Math.min(t1, hi);
    if (t0 > t1) return null;
  }
  const hx = ox + dx * t0 - c.x, hz = oz + dz * t0 - c.z, l = Math.hypot(hx, hz) || 1;
  return [Math.max(0, t0), t1, hx / l, 0, hz / l];
}
function rayRamp(ox, oy, oz, dx, dy, dz, r, tmax) {
  // 坂の板を、上面の三角形2枚の代わりに薄い箱の列で近似（4本）
  let best = null;
  const N = 4, alongZ = r.dir === 'n' || r.dir === 's';
  for (let s = 0; s < N; s++) {
    const a0 = s / N, a1 = (s + 1) / N;
    let x0 = r.x0, x1 = r.x1, z0 = r.z0, z1 = r.z1;
    if (alongZ) { z0 = r.z0 + (r.z1 - r.z0) * a0; z1 = r.z0 + (r.z1 - r.z0) * a1; } else { x0 = r.x0 + (r.x1 - r.x0) * a0; x1 = r.x0 + (r.x1 - r.x0) * a1; }
    const top = rampH(r, (x0 + x1) / 2, (z0 + z1) / 2);
    const hb = rayBoxF(ox, oy, oz, dx, dy, dz, x0, top - r.th, z0, x1, top, z1);
    if (hb && hb[0] <= tmax && (!best || hb[0] < best[0])) best = hb;
  }
  return best;
}
export function rayBoxF(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity, nx = 0, ny = 0, nz = 0;
  if (Math.abs(dx) < 1e-12) { if (ox < x0 || ox > x1) return null; } else {
    let a = (x0 - ox) / dx, b = (x1 - ox) / dx; if (a > b) { const q = a; a = b; b = q; }
    if (a > tmin) { tmin = a; nx = dx > 0 ? -1 : 1; ny = 0; nz = 0; } if (b < tmax) tmax = b; if (tmin > tmax) return null;
  }
  if (Math.abs(dy) < 1e-12) { if (oy < y0 || oy > y1) return null; } else {
    let a = (y0 - oy) / dy, b = (y1 - oy) / dy; if (a > b) { const q = a; a = b; b = q; }
    if (a > tmin) { tmin = a; nx = 0; ny = dy > 0 ? -1 : 1; nz = 0; } if (b < tmax) tmax = b; if (tmin > tmax) return null;
  }
  if (Math.abs(dz) < 1e-12) { if (oz < z0 || oz > z1) return null; } else {
    let a = (z0 - oz) / dz, b = (z1 - oz) / dz; if (a > b) { const q = a; a = b; b = q; }
    if (a > tmin) { tmin = a; nx = 0; ny = 0; nz = dz > 0 ? -1 : 1; } if (b < tmax) tmax = b; if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return [Math.max(0, tmin), tmax, nx, ny, nz];
}
// 地形との交点（t0..t1 の間で、光線が地面の下に入る所）。なければ -1
function rayTerrain(ww, ox, oy, oz, dx, dy, dz, ta, tb) {
  const step = ww.hs * 0.5;
  let t = ta, prev = oy + dy * t - heightAt(ww, ox + dx * t, oz + dz * t);
  if (prev < 0) return ta;
  while (t < tb) {
    const tn = Math.min(tb, t + step);
    const x = ox + dx * tn, z = oz + dz * tn;
    const d = oy + dy * tn - heightAt(ww, x, z);
    if (d < 0) {
      // 二分で詰める
      let lo = t, hi = tn;
      for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; const dm = oy + dy * m - heightAt(ww, ox + dx * m, oz + dz * m); if (dm < 0) hi = m; else lo = m; }
      return hi;
    }
    prev = d; t = tn;
  }
  return -1;
}
const _hits = [];
export function raycast(ww, ox, oy, oz, dx, dy, dz, max, opt = {}) {
  const hits = opt.out || _hits;
  hits.length = 0;
  ww.stampN++;
  const st = ww.stamp, sn = ww.stampN;
  // 引き出しの格子を x-z で進む（DDA）
  let i = Math.floor(ox / G), j = Math.floor(oz / G);
  const stepI = dx > 0 ? 1 : -1, stepJ = dz > 0 ? 1 : -1;
  const tdI = Math.abs(dx) > 1e-12 ? Math.abs(G / dx) : Infinity, tdJ = Math.abs(dz) > 1e-12 ? Math.abs(G / dz) : Infinity;
  let tmI = Math.abs(dx) > 1e-12 ? ((dx > 0 ? (i + 1) * G - ox : ox - i * G) / Math.abs(dx)) : Infinity;
  let tmJ = Math.abs(dz) > 1e-12 ? ((dz > 0 ? (j + 1) * G - oz : oz - j * G) / Math.abs(dz)) : Infinity;
  let t = 0, stopAt = max, guard = 0;
  let stamp2 = null; // 坂・円柱は箱と別の印
  ww._sr = ww._sr || new Uint32Array(64); ww._sc = ww._sc || new Uint32Array(64);
  if (ww._sr.length < ww.ramps.length + 1) ww._sr = new Uint32Array(ww.ramps.length * 2 + 16);
  if (ww._sc.length < ww.cyls.length + 1) ww._sc = new Uint32Array(ww.cyls.length * 2 + 16);
  const sr = ww._sr, sc = ww._sc;
  while (t < stopAt && guard++ < 20000) {
    const tNext = Math.min(tmI, tmJ, max);
    if (i < 0 || j < 0 || i >= ww.GW || j >= ww.GD) { hits.push({ t0: t, t1: t, kind: 'edge', mat: M.CONCRETE, nx: 0, ny: 0, nz: 0 }); break; }
    const k = j * ww.GW + i;
    // 地形: この区間で光線の低い方が、引き出しの一番高い地面より下なら調べる
    const ya = oy + dy * t, yb = oy + dy * tNext;
    if (Math.min(ya, yb) <= ww.cellMaxH[k] + 0.01) {
      const tg = rayTerrain(ww, ox, oy, oz, dx, dy, dz, t, tNext);
      if (tg >= 0 && tg < stopAt) {
        const n = normalAt(ww, ox + dx * tg, oz + dz * tg);
        hits.push({ t0: tg, t1: tg + 50, kind: 'ground', mat: M.EARTH, nx: n[0], ny: n[1], nz: n[2] });
        if (tg < stopAt) stopAt = tg; // 地面の向こうは調べない
      }
    }
    for (const id of ww.cellBox[k]) {
      if (st[id] === sn) continue; st[id] = sn;
      const b = ww.boxes[id];
      if (!b.alive) continue;
      const r = rayBoxF(ox, oy, oz, dx, dy, dz, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
      if (r && r[0] < stopAt) {
        hits.push({ t0: r[0], t1: r[1], kind: 'box', mat: b.mat, id, nx: r[2], ny: r[3], nz: r[4] });
        if (opt.stopOpaque && b.opaque && r[0] < stopAt) stopAt = r[0];
      }
    }
    for (const id of ww.cellRamp[k]) {
      if (sr[id] === sn) continue; sr[id] = sn;
      const rr = ww.ramps[id], r = rayRamp(ox, oy, oz, dx, dy, dz, rr, stopAt);
      if (r && r[0] < stopAt) { hits.push({ t0: r[0], t1: r[1], kind: 'stair', mat: rr.mat, id, nx: r[2], ny: r[3], nz: r[4] }); if (opt.stopOpaque) stopAt = r[0]; }
    }
    for (const id of ww.cellCyl[k]) {
      if (sc[id] === sn) continue; sc[id] = sn;
      const c = ww.cyls[id];
      if (!c.alive) continue;
      const r = rayCyl(ox, oy, oz, dx, dy, dz, c);
      if (r && r[0] < stopAt) { hits.push({ t0: r[0], t1: r[1], kind: 'prop', mat: c.mat, id: -1 - id, cyl: id, nx: r[2], ny: r[3], nz: r[4] }); if (opt.stopOpaque && c.opaque) stopAt = r[0]; }
    }
    t = tNext;
    if (t >= max) break;
    if (tmI < tmJ) { tmI += tdI; i += stepI; } else { tmJ += tdJ; j += stepJ; }
  }
  hits.sort((a, b) => a.t0 - b.t0);
  // stopAt より先の物は捨てる（地面の向こう・見えない物の向こう）
  let n = hits.length;
  while (n > 0 && hits[n - 1].t0 > stopAt + 1e-6) n--;
  hits.length = n;
  return hits;
}
// 見通せるか（a から b まで、見えない物に当たらない）
export function los(ww, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
  if (d < 1e-6) return true;
  const hits = raycast(ww, ax, ay, az, dx / d, dy / d, dz / d, d, { stopOpaque: true, out: _losHits });
  for (const h of hits) { if (h.t0 >= d - 0.05) break; if (h.kind === 'ground' || h.kind === 'edge' || h.kind === 'stair') return false; if (h.kind === 'box' && ww.boxes[h.id].opaque) return false; if (h.kind === 'prop' && ww.cyls[h.cyl].opaque) return false; }
  return true;
}
const _losHits = [];
