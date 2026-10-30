// 光の格子: マスの角 × 高さ3段（床0.12・胸1.4・天井2.66）× 階。各点に6方向（+X −X +Y −Y +Z −Z）の明るさ（RGB）。
// 壁はマスの中央の板なので、角の点は必ず壁のどちらか一方の側にある（光が壁を抜けない）。
// 描画（壁・床・人の明るさ）とAI（暗いと見えにくい）が同じものを使う。
import { raycast, occluded, CS, LH, CEIL, C, isWallish } from './world.js';
import { MATS, M } from './data/materials.js';

export const HS = [0.12, 1.4, 2.66];
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// 時間帯ごとの空と太陽
export const SKIES = {
  day: { sky: [0.52, 0.66, 0.9], ground: [0.28, 0.26, 0.22], sun: [2.6, 2.4, 2.05], sunDir: norm([0.45, 0.78, 0.38]), fog: [0.66, 0.74, 0.84], fogD: 0.006, amb: 0.03, exposure: 1.0, zenith: [0.22, 0.42, 0.85], horizon: [0.72, 0.8, 0.9], night: 0 },
  dusk: { sky: [0.48, 0.4, 0.42], ground: [0.2, 0.15, 0.12], sun: [2.2, 1.25, 0.6], sunDir: norm([-0.7, 0.22, 0.45]), fog: [0.62, 0.48, 0.42], fogD: 0.008, amb: 0.02, exposure: 1.15, zenith: [0.2, 0.25, 0.48], horizon: [0.95, 0.6, 0.42], night: 0 },
  night: { sky: [0.035, 0.045, 0.075], ground: [0.01, 0.01, 0.012], sun: [0.08, 0.1, 0.16], sunDir: norm([0.3, 0.8, -0.4]), fog: [0.04, 0.05, 0.07], fogD: 0.012, amb: 0.004, exposure: 1.25, zenith: [0.005, 0.008, 0.02], horizon: [0.03, 0.04, 0.06], night: 1 },
};
function norm(v) { const l = Math.hypot(...v); return v.map(x => x / l); }

// 光源の種類（色・強さ・届く距離）
export const LIGHT_KIND = {
  fluo: { col: [1.0, 0.98, 0.92], I: 2.2, R: 7.5, down: 0.75 },
  lamp: { col: [1.0, 0.8, 0.55], I: 1.6, R: 6.0, down: 0.4 },
  warm: { col: [1.0, 0.7, 0.42], I: 1.3, R: 5.0, down: 0.3 },
  spot: { col: [1.0, 0.95, 0.85], I: 3.0, R: 8.0, down: 0.9 },
  street: { col: [1.0, 0.72, 0.38], I: 3.2, R: 13.0, down: 0.85, h: 4.3 },
  dim: { col: [0.85, 0.85, 1.0], I: 0.7, R: 4.5, down: 0.5 },
  red: { col: [1.0, 0.18, 0.12], I: 1.2, R: 5.0, down: 0.3 },
};

function clear(w, ax, ay, az, bx, by, bz) { return !occluded(w, ax, ay, az, bx, by, bz, null, false); }
function rayFree(w, ax, ay, az, dx, dy, dz, L) {
  // 地図の外に出るか L まで進んで何もなければ空が見える
  const ex = ax + dx * L, ey = ay + dy * L, ez = az + dz * L;
  return !occluded(w, ax, ay, az, ex, ey, ez, null, false);
}
// 空を見る方向（上半球、決まった並び）
const SKYD = [];
for (let r = 0; r < 3; r++) {
  const el = [0.28, 0.75, 1.3][r], n = [8, 6, 1][r];
  for (let k = 0; k < n; k++) { const az = (k / n) * Math.PI * 2 + r * 0.4; SKYD.push([Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)]); }
}

export function bakeLight(w, def, opt = {}) {
  const sunSep = opt.sunSeparate !== false;
  const W1 = w.W + 1, D1 = w.D + 1, NLy = w.NL * 3;
  const N = W1 * D1 * NLy;
  const data = new Float32Array(N * 18);
  const sunVisA = new Float32Array(N), skyVisA = new Float32Array(N);
  const sky = SKIES[def.time || 'day'] || SKIES.day;
  const lights = (def.lights || []).map(([x, z, L, kind, mul]) => {
    const K = LIGHT_KIND[kind] || LIGHT_KIND.lamp;
    return { x: x * CS, y: (L || 0) * LH + (K.h || CEIL - 0.06), z: z * CS, L: L || 0, col: K.col, I: K.I * (mul || 1) * (def.lampMul || 1), R: K.R, down: K.down };
  });
  const pidx = (i, j, ly) => (ly * D1 + j) * W1 + i;
  const cellT = (L, i, j) => (i < 0 || j < 0 || i >= w.W || j >= w.D) ? C.VOID : w.cell[w.idx(L, i, j)];
  const indoorCell = (L, i, j) => { const t = cellT(L, i, j); return t === C.FLOOR || t === C.STAIR || (isWallish(t) && w.indoor[w.idx(L, i, j)] === 2); };
  // 窓・外への開口からの距離（屋内で空を調べる範囲を絞る）
  const nearOpen = new Uint8Array(w.NL * w.W * w.D);
  for (let L = 0; L < w.NL; L++) {
    const q = [];
    for (let j = 0; j < w.D; j++) for (let i = 0; i < w.W; i++) {
      const k = w.idx(L, i, j), t = w.cell[k];
      if (t === C.OUT || t === C.WINDOW || t === C.GLASSWALL || (t === C.DOOR && w.indoor[k] === 2 && touchesOut(w, L, i, j)) || (t === C.OPEN && touchesOut(w, L, i, j))) { nearOpen[k] = 1; q.push([i, j, 0]); }
    }
    let h = 0;
    while (h < q.length) {
      const [i, j, d] = q[h++];
      if (d >= 16) continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= w.W || nj >= w.D) continue;
        const k2 = w.idx(L, ni, nj); if (nearOpen[k2]) continue;
        const t2 = w.cell[k2]; if (t2 !== C.FLOOR && t2 !== C.STAIR) continue;
        nearOpen[k2] = 1; q.push([ni, nj, d + 1]);
      }
    }
  }
  let rays = 0;
  const skyAcc = new Float32Array(18); let skyVis = 0;
  for (let L = 0; L < w.NL; L++) {
    for (let j = 0; j < D1; j++) for (let i = 0; i < W1; i++) {
      // 角に接する4マス
      let any = false, indoor = false, open = false, out = false, voidN = false;
      for (const [ci, cj] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) {
        const t = cellT(L, ci, cj);
        if (t !== C.VOID) any = true; else voidN = true;
        if (indoorCell(L, ci, cj)) indoor = true;
        if (t === C.OUT) out = true;
        if (ci >= 0 && cj >= 0 && ci < w.W && cj < w.D && nearOpen[w.idx(L, ci, cj)]) open = true;
      }
      if (!any) {
        // 上の階の、建物の外の空中（木の葉や屋根の上の物）: 下の階の一番上の光をそのまま使う
        if (L > 0) {
          const src = pidx(i, j, (L - 1) * 3 + 2);
          for (let hh = 0; hh < 3; hh++) { const pp = pidx(i, j, L * 3 + hh); for (let a = 0; a < 18; a++) data[pp * 18 + a] = data[src * 18 + a]; sunVisA[pp] = sunVisA[src]; skyVisA[pp] = skyVisA[src]; }
        }
        continue;
      }
      const x = i * CS, z = j * CS;
      const exterior = out || open || !indoor || voidN;
      for (let hh = 0; hh < 3; hh++) {
        const y = L * LH + HS[hh];
        const pp = pidx(i, j, L * 3 + hh);
        const o = pp * 18;
        const add = (d, r, g, b) => { for (let a = 0; a < 6; a++) { const dd = DIRS[a][0] * d[0] + DIRS[a][1] * d[1] + DIRS[a][2] * d[2]; if (dd <= 0) continue; data[o + a * 3] += r * dd; data[o + a * 3 + 1] += g * dd; data[o + a * 3 + 2] += b * dd; } };
        // ランプ
        for (const lt of lights) {
          if (Math.abs(lt.y - y) > lt.R) continue;
          const dx = lt.x - x, dy = lt.y - y, dz = lt.z - z, d = Math.hypot(dx, dy, dz);
          if (d > lt.R || d < 0.01) continue;
          rays++;
          if (!clear(w, x, y, z, lt.x, lt.y - 0.03, lt.z)) continue;
          const ld = [dx / d, dy / d, dz / d];
          const win = Math.pow(Math.max(0, 1 - (d / lt.R) * (d / lt.R)), 2);
          const fall = lt.I / (1 + d * d * 0.35) * win;
          const emit = (1 - lt.down) + lt.down * Math.max(0, ld[1]);
          const k = fall * emit;
          add(ld, lt.col[0] * k, lt.col[1] * k, lt.col[2] * k);
        }
        // 空と太陽（外か、窓の近く）
        if (exterior) {
          if (hh === 0) {
            skyAcc.fill(0); skyVis = 0;
            const yy = L * LH + HS[1];
            for (const d of SKYD) {
              rays++;
              if (rayFree(w, x, yy, z, d[0], d[1], d[2], out ? 30 : 18)) {
                skyVis++;
                const t = d[1];
                const sc0 = sky.sky[0] * (0.7 + 0.3 * t) * 2.2 / SKYD.length, sc1 = sky.sky[1] * (0.7 + 0.3 * t) * 2.2 / SKYD.length, sc2 = sky.sky[2] * (0.75 + 0.25 * t) * 2.2 / SKYD.length;
                for (let a = 0; a < 6; a++) { const dd = DIRS[a][0] * d[0] + DIRS[a][1] * d[1] + DIRS[a][2] * d[2]; if (dd <= 0) continue; skyAcc[a * 3] += sc0 * dd; skyAcc[a * 3 + 1] += sc1 * dd; skyAcc[a * 3 + 2] += sc2 * dd; }
              }
            }
          }
          rays++;
          const sv = rayFree(w, x, y, z, sky.sunDir[0], sky.sunDir[1], sky.sunDir[2], 60) ? 1 : 0;
          sunVisA[pp] = sv;
          skyVisA[pp] = skyVis / SKYD.length;
          for (let a = 0; a < 18; a++) data[o + a] += skyAcc[a];
          if (out && !indoor) add([0, -1, 0], sky.ground[0] * 0.6, sky.ground[1] * 0.6, sky.ground[2] * 0.6);
          if (sv && !sunSep) add(sky.sunDir, sky.sun[0], sky.sun[1], sky.sun[2]);
          if (indoor && skyVis > 0) { const g = skyVis / SKYD.length; for (let a = 0; a < 6; a++) { data[o + a * 3] += sky.sky[0] * 0.25 * g; data[o + a * 3 + 1] += sky.sky[1] * 0.25 * g; data[o + a * 3 + 2] += sky.sky[2] * 0.25 * g; } }
        }
        for (let a = 0; a < 18; a++) data[o + a] += sky.amb;
      }
    }
  }
  // 跳ね返りの光: 部屋の中で、隣の点へ広げる（壁をまたがない）
  const sunSum = DIRS.reduce((s, d) => s + Math.max(0, d[0] * sky.sunDir[0] + d[1] * sky.sunDir[1] + d[2] * sky.sunDir[2]), 0) / 6;
  const B = new Float32Array(N * 3);
  for (let p = 0; p < N; p++) {
    const o = p * 18;
    let r = 0, g = 0, b = 0;
    for (let a = 0; a < 6; a++) { r += data[o + a * 3]; g += data[o + a * 3 + 1]; b += data[o + a * 3 + 2]; }
    r /= 6; g /= 6; b /= 6;
    if (sunSep && sunVisA[p] > 0) { r += sky.sun[0] * sunSum; g += sky.sun[1] * sunSum; b += sky.sun[2] * sunSum; }
    B[p * 3] = r * 0.42; B[p * 3 + 1] = g * 0.4; B[p * 3 + 2] = b * 0.38;
  }
  const open = (L, i, j, di, dj) => {
    if (di) {
      const ci = Math.min(i, i + di);
      const a = cellT(L, ci, j), b = cellT(L, ci, j - 1);
      if (isWallish(a) && (w.arms[w.idx(L, ci, j)] & 8)) return false;
      if (isWallish(b) && (w.arms[w.idx(L, ci, j - 1)] & 4)) return false;
      return a !== C.VOID || b !== C.VOID;
    } else {
      const cj = Math.min(j, j + dj);
      const a = cellT(L, i, cj), b = cellT(L, i - 1, cj);
      if (isWallish(a) && (w.arms[w.idx(L, i, cj)] & 2)) return false;
      if (isWallish(b) && (w.arms[w.idx(L, i - 1, cj)] & 1)) return false;
      return a !== C.VOID || b !== C.VOID;
    }
  };
  let cur = B, nxt = new Float32Array(N * 3);
  for (let it = 0; it < 5; it++) {
    for (let L = 0; L < w.NL; L++) for (let hh = 0; hh < 3; hh++) for (let j = 0; j < D1; j++) for (let i = 0; i < W1; i++) {
      const p = pidx(i, j, L * 3 + hh);
      let r = cur[p * 3], g = cur[p * 3 + 1], b = cur[p * 3 + 2], n = 1;
      const nb = (ii, jj, ok) => { if (!ok) return; const q = pidx(ii, jj, L * 3 + hh) * 3; r += cur[q]; g += cur[q + 1]; b += cur[q + 2]; n++; };
      if (i + 1 < W1) nb(i + 1, j, open(L, i, j, 1, 0));
      if (i > 0) nb(i - 1, j, open(L, i, j, -1, 0));
      if (j + 1 < D1) nb(i, j + 1, open(L, i, j, 0, 1));
      if (j > 0) nb(i, j - 1, open(L, i, j, 0, -1));
      if (hh > 0) { const q = pidx(i, j, L * 3 + hh - 1) * 3; r += cur[q]; g += cur[q + 1]; b += cur[q + 2]; n++; }
      if (hh < 2) { const q = pidx(i, j, L * 3 + hh + 1) * 3; r += cur[q]; g += cur[q + 1]; b += cur[q + 2]; n++; }
      nxt[p * 3] = r / n; nxt[p * 3 + 1] = g / n; nxt[p * 3 + 2] = b / n;
    }
    const t = cur; cur = nxt; nxt = t;
  }
  for (let p = 0; p < N; p++) {
    const o = p * 18;
    for (let a = 0; a < 6; a++) { data[o + a * 3] += cur[p * 3]; data[o + a * 3 + 1] += cur[p * 3 + 1]; data[o + a * 3 + 2] += cur[p * 3 + 2]; }
  }
  return { W1, D1, NLy, data, sunVis: sunVisA, skyVis: skyVisA, sky, rays, lights, sunSep };
}
function touchesOut(w, L, i, j) {
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= w.W || nj >= w.D) continue; if (w.cell[w.idx(L, ni, nj)] === C.OUT) return true; }
  return false;
}

// 位置と法線での明るさ（RGB）。snap: 法線の向きに格子へ寄せる（壁・床の面用）
export function lightAt(lat, x, y, z, nx, ny, nz, out = [0, 0, 0], snap = false) {
  const { W1, D1, data } = lat;
  let L = Math.max(0, Math.min(lat.NLy / 3 - 1, Math.floor((y + 0.05) / LH)));
  let yl = y - L * LH;
  if (yl > LH - 0.05) { L = Math.min(lat.NLy / 3 - 1, L + 1); yl = y - L * LH; }
  let fx = x / CS, fz = z / CS;
  // 高さの段
  let fh = yl <= HS[0] ? 0 : yl >= HS[2] ? 2 : yl < HS[1] ? (yl - HS[0]) / (HS[1] - HS[0]) : 1 + (yl - HS[1]) / (HS[2] - HS[1]);
  if (snap) {
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    if (ax >= ay && ax >= az) fx = Math.round(fx + nx * 0.15);
    else if (az >= ay) fz = Math.round(fz + nz * 0.15);
    else fh = ny > 0 ? Math.floor(fh) : Math.ceil(fh);
  }
  fx = Math.max(0, Math.min(W1 - 1.0001, fx)); fz = Math.max(0, Math.min(D1 - 1.0001, fz)); fh = Math.max(0, Math.min(2, fh));
  const i0 = Math.floor(fx), j0 = Math.floor(fz), h0 = Math.min(1, Math.floor(fh));
  const tx = fx - i0, tz = fz - j0, th = fh - h0;
  // 法線の重み（ambient cube）
  const wx = nx * nx, wy = ny * ny, wz = nz * nz;
  const ax = nx >= 0 ? 0 : 1, ay = ny >= 0 ? 2 : 3, az = nz >= 0 ? 4 : 5;
  out[0] = out[1] = out[2] = 0;
  for (let c = 0; c < 8; c++) {
    const di = c & 1, dj = (c >> 1) & 1, dh = (c >> 2) & 1;
    const wgt = (di ? tx : 1 - tx) * (dj ? tz : 1 - tz) * (dh ? th : 1 - th);
    if (wgt < 1e-5) continue;
    const ii = Math.min(W1 - 1, i0 + di), jj = Math.min(D1 - 1, j0 + dj), hh = h0 + dh;
    const o = (((L * 3 + hh) * D1 + jj) * W1 + ii) * 18;
    for (let k = 0; k < 3; k++) out[k] += wgt * (wx * data[o + ax * 3 + k] + wy * data[o + ay * 3 + k] + wz * data[o + az * 3 + k]);
  }
  return out;
}
// 6方向の明るさ（人や動く物の照らし方）。out: 18個
export function cubeAt(lat, x, y, z, out = new Float32Array(18)) {
  const tmp = [0, 0, 0];
  for (let a = 0; a < 6; a++) {
    const d = DIRS[a];
    lightAt(lat, x, y, z, d[0], d[1], d[2], tmp);
    out[a * 3] = tmp[0]; out[a * 3 + 1] = tmp[1]; out[a * 3 + 2] = tmp[2];
  }
  return out;
}
// AI 用: その場所の明るさ（0..1くらい）
export function brightAt(lat, x, y, z) {
  const t = [0, 0, 0];
  let s = 0;
  for (const d of DIRS) { lightAt(lat, x, y, z, d[0], d[1], d[2], t); s += 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2]; }
  return s / 6;
}
