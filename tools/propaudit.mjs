// 置き物の配置の点検: node tools/propaudit.mjs [mapId ...] [--svg 出力先のフォルダ] [--quiet]
//  遊びやすさの決まり（DESIGN.md「置き物の決まり」）を、すべてのマップで機械的に調べる。
//   door  : 扉の前（開口の幅 × 両側 DOOR_D）に、歩きを止める置き物がある（扉の板が回る範囲を含む）
//   open  : 開口（アーチ）の前（両側 OPEN_D）に置き物がある
//   glass : ガラスの壁（割れば通れる）の前に置き物がある
//   window: 窓の前（窓の幅 × 両側 WIN_D）に置き物がある（近づけない・乗り越えて降りられない・見通せない）
//   stair : 階段の上がり口・下り口（幅 × STAIR_D）に置き物がある
//   pinch : 大事な場所（扉・開口・階段・窓の前、出現位置、目標、部屋の広い所）どうしを結ぶ道が、置き物のせいで扉の幅より狭い
//   stuck : 大事な場所が置き物に埋まっている・置き物で行けない
//  細かい格子（1マスを8つに割る＝6.25cm）で「壁・置き物からの距離」を出し、半径ごとのつながりで道の幅を測る。
import fs from 'node:fs';
import { compileMap, C, CS, LH, NB, STEP, isWallish } from '../src/engine/world.js';
import { MAPS } from '../src/engine/maps/index.js';

export const RULE = {
  DOOR_D: 1.25,    // 扉の前に空ける奥行き（m）。板の長さ（約1m）＋体の半分
  OPEN_D: 1.0,
  WIN_D: 0.9,      // 窓の前に空ける奥行き（立って構えられる幅）
  STAIR_D: 1.25,
  R_MIN: 0.28,     // 体の半径（これより狭いと通れない）
  R_OK: 0.40,      // 快適に通れる半径（幅0.8m。扉の開口は1.0m）
  OV: 0.06,        // これより浅い重なりは数えない（m）
};
const FR = 8, FS = CS / FR;
const HIGH = new Set(['neon']); // 壁の高い所に掛ける物（扉の上の看板）

// 歩きを止める箱か（足の段差より高く、頭より低い）
const blocksWalk = (b, base) => b[4] > base + STEP + 0.005 && b[1] < base + 1.7;

function raster(w, L, withProps) {
  const FW = w.W * FR + 2, FD = w.D * FR + 2; // まわり1つ分は壁（地図の外）
  const blk = new Uint8Array(FW * FD);
  const base = L * LH;
  for (let x = 0; x < FW; x++) { blk[x] = 1; blk[(FD - 1) * FW + x] = 1; }
  for (let z = 0; z < FD; z++) { blk[z * FW] = 1; blk[z * FW + FW - 1] = 1; }
  // 中心が箱の中にある格子をふさぐ（端の誤差は格子の半分＝3cmまで）
  const fill = (x0, z0, x1, z1, v) => {
    const i0 = Math.max(0, Math.ceil(x0 / FS - 0.5 - 1e-6)), i1 = Math.min(w.W * FR - 1, Math.floor(x1 / FS - 0.5 + 1e-6));
    const j0 = Math.max(0, Math.ceil(z0 / FS - 0.5 - 1e-6)), j1 = Math.min(w.D * FR - 1, Math.floor(z1 / FS - 0.5 + 1e-6));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const o = (j + 1) * FW + i + 1; if (!blk[o] || v === 1) blk[o] = v; }
  };
  for (let j = 0; j < w.D; j++) for (let i = 0; i < w.W; i++) {
    const k = w.idx(L, i, j), t = w.cell[k];
    if (t === C.VOID) { fill(i * CS, j * CS, (i + 1) * CS, (j + 1) * CS, 1); continue; }
    if (t === C.STAIR) { fill(i * CS, j * CS, (i + 1) * CS, (j + 1) * CS, 3); continue; } // 階段は横から入れない（端は別に調べる）
    if (isWallish(t)) {
      let solid = false;
      for (let q = 0; q < 3; q++) if (w.blocks0[k * NB + q]) solid = true;
      if (!solid) continue; // 扉・開口は通れる
      for (let n = 0; n < w.nbox[k]; n++) { const o = k * 8 + n * 4; fill(w.boxes[o], w.boxes[o + 1], w.boxes[o + 2], w.boxes[o + 3], 1); }
    }
  }
  if (withProps) for (const p of w.props) {
    if (p.L !== L || !p.solid) continue;
    for (const b of p.boxes) if (blocksWalk(b, base)) fill(b[0], b[2], b[3], b[5], 2);
  }
  return { blk, FW, FD };
}

// 正確な距離変換（Felzenszwalb）。戻り値: いちばん近いふさがった格子までの距離（m。格子の端まで）
function clearance(blk, FW, FD) {
  const INF = 1e20, n = Math.max(FW, FD);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const g = new Float64Array(FW * FD);
  const pass = (len) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s;
      for (;;) { const p = v[k]; s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p); if (s <= z[k] && k > 0) k--; else break; }
      if (s <= z[k]) { v[k] = q; z[k] = -INF; z[k + 1] = INF; } else { k++; v[k] = q; z[k] = s; z[k + 1] = INF; }
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; }
  };
  for (let x = 0; x < FW; x++) {
    for (let y = 0; y < FD; y++) f[y] = blk[y * FW + x] ? 0 : INF;
    pass(FD);
    for (let y = 0; y < FD; y++) g[y * FW + x] = d[y];
  }
  const out = new Float32Array(FW * FD);
  for (let y = 0; y < FD; y++) {
    for (let x = 0; x < FW; x++) f[x] = g[y * FW + x];
    pass(FW);
    for (let x = 0; x < FW; x++) out[y * FW + x] = blk[y * FW + x] ? 0 : Math.max(0, Math.sqrt(d[x]) * FS - FS / 2);
  }
  return out;
}

// 半径 r でつながった所に番号をふる（0 = 通れない）
function label(clr, FW, FD, r) {
  const lab = new Int32Array(FW * FD); let n = 0; const st = [];
  for (let s = 0; s < lab.length; s++) {
    if (lab[s] || clr[s] < r) continue;
    n++; lab[s] = n; st.push(s);
    while (st.length) {
      const k = st.pop();
      for (const k2 of [k - 1, k + 1, k - FW, k + FW]) if (!lab[k2] && clr[k2] >= r) { lab[k2] = n; st.push(k2); }
    }
  }
  return { lab, n };
}

function rectOv(ax0, az0, ax1, az1, bx0, bz0, bx1, bz1) { return [Math.min(ax1, bx1) - Math.max(ax0, bx0), Math.min(az1, bz1) - Math.max(az0, bz0)]; }
const pname = (p) => `${p.type}#${p.id}(${(p.x / CS).toFixed(1)},${(p.z / CS).toFixed(1)}${p.L ? ',' + p.L : ''})`;

// 壁の線にならんだマスのまとまり（窓・開口・ガラスの壁）
function runs(w, types) {
  const out = [], seen = new Uint8Array(w.N);
  for (let L = 0; L < w.NL; L++) for (let j = 0; j < w.D; j++) for (let i = 0; i < w.W; i++) {
    const k = w.idx(L, i, j), t = w.cell[k];
    if (!types.includes(t) || seen[k]) continue;
    const T = (ii, jj) => (ii < 0 || jj < 0 || ii >= w.W || jj >= w.D) ? C.VOID : w.cell[w.idx(L, ii, jj)];
    const axis = (T(i + 1, j) === t || isWallish(T(i - 1, j)) || isWallish(T(i + 1, j))) && T(i, j + 1) !== t ? 0 : 1;
    let n = 0;
    for (; ; n++) { const ii = axis === 0 ? i + n : i, jj = axis === 0 ? j : j + n; if (T(ii, jj) !== t) break; const kk = w.idx(L, ii, jj); if (seen[kk]) break; seen[kk] = 1; }
    const a0 = (axis === 0 ? i : j) * CS, a1 = a0 + n * CS, c = ((axis === 0 ? j : i) + 0.5) * CS;
    out.push({ t, L, axis, a0, a1, c, i, j, n });
  }
  return out;
}

export function auditMap(id, opt = {}) {
  const def = MAPS[id];
  const w = compileMap(def);
  const finds = [];
  const add = (cat, L, x, z, msg, props = [], extra = {}) => finds.push({ cat, L, x, z, msg, props: props.map(p => p.id), ...extra });
  const levels = [];
  // 両側の帯（壁の線 c から ±depth、線に沿って a0..a1）に重なる置き物
  const zoneHits = (L, axis, a0, a1, c, depth, side, solidOnly = true) => {
    const base = L * LH, hits = [];
    const lo = side > 0 ? c + 0.03 : c - depth, hi = side > 0 ? c + depth : c - 0.03;
    const zx0 = axis === 0 ? a0 : lo, zx1 = axis === 0 ? a1 : hi, zz0 = axis === 0 ? lo : a0, zz1 = axis === 0 ? hi : a1;
    for (const p of w.props) {
      if (p.L !== L) continue;
      if (solidOnly && !p.solid) continue;
      let best = null;
      const bxs = p.solid ? p.boxes.filter(b => blocksWalk(b, base)) : [[p.x - p.w / 2, base, p.z - p.d / 2, p.x + p.w / 2, base + p.h, p.z + p.d / 2]];
      for (const b of bxs) {
        const [ox, oz] = rectOv(zx0, zz0, zx1, zz1, b[0], b[2], b[3], b[5]);
        if (ox > RULE.OV && oz > RULE.OV) {
          // 壁の線からの近さ
          const near = axis === 0 ? (side > 0 ? b[2] - c : c - b[5]) : (side > 0 ? b[0] - c : c - b[3]);
          const along = axis === 0 ? ox : oz;
          if (!best || near < best.near) best = { near: Math.max(0, near), along, top: b[4] - base };
        }
      }
      if (best) hits.push({ p, ...best });
    }
    return hits;
  };
  // 1) 扉
  for (const d of w.doors) {
    for (const side of [1, -1]) {
      for (const h of zoneHits(d.L, d.axis, d.a0, d.a1, d.c, RULE.DOOR_D, side)) {
        add('door', d.L, d.cx + d.nx * side * 0.6, d.cz + d.nz * side * 0.6, `扉#${d.id}(${d.i0},${d.j0}${d.L ? ',' + d.L : ''}) の前 ${h.near.toFixed(2)}m に ${pname(h.p)}（幅 ${h.along.toFixed(2)}m かぶる）`, [h.p], { near: h.near, did: d.id });
      }
    }
  }
  // 1b) 扉の口に、当たりのない小物（椅子など）がある: 見た目が悪く、弾と視線のじゃまになる
  for (const d of w.doors) for (const side of [1, -1]) for (const h of zoneHits(d.L, d.axis, d.a0, d.a1, d.c, 0.75, side, false)) {
    if (h.p.solid || HIGH.has(h.p.type)) continue;
    add('clutter', d.L, d.cx + d.nx * side * 0.5, d.cz + d.nz * side * 0.5, `扉#${d.id}(${d.i0},${d.j0}${d.L ? ',' + d.L : ''}) の口 ${h.near.toFixed(2)}m に ${pname(h.p)}`, [h.p], { near: h.near });
  }
  // 2) 開口・ガラスの壁・窓
  const RN = runs(w, [C.OPEN, C.GLASSWALL, C.WINDOW]);
  for (const r of RN) {
    const cat = r.t === C.OPEN ? 'open' : r.t === C.GLASSWALL ? 'glass' : 'window';
    const depth = r.t === C.OPEN ? RULE.OPEN_D : r.t === C.GLASSWALL ? RULE.OPEN_D : RULE.WIN_D;
    const nm = r.t === C.OPEN ? '開口' : r.t === C.GLASSWALL ? 'ガラスの壁' : '窓';
    const wlen = r.a1 - r.a0;
    r.sill = [0, 0];
    for (const side of [1, -1]) {
      let hits = zoneHits(r.L, r.axis, r.a0, r.a1, r.c, depth, side);
      // 窓の下の低い物（壁の空調機など。高さ0.5mまで・壁にくっついている）は、乗り越えて降りる所の手前とみなし、
      // その奥から決まりの奥行きを測る
      if (cat === 'window') {
        const sill = hits.filter(h => h.top <= 0.5 && h.near <= 0.3);
        if (sill.length) {
          const ext = Math.max(...sill.map(h => sillDepth(h.p, r, side)));
          r.sill[side > 0 ? 0 : 1] = ext;
          const ids = new Set(sill.map(h => h.p.id));
          hits = zoneHits(r.L, r.axis, r.a0, r.a1, r.c, depth + ext, side).filter(h => !ids.has(h.p.id));
        }
      }
      // 開口・ガラスの壁: 1m以上（短ければ全部）空いていれば通れる（受付のカウンターが開口の一部をふさぐのはよい）
      if ((cat === 'open' || cat === 'glass') && hits.length) {
        const ivs = hits.map(h => alongSpan(h.p, r, side, depth)).filter(Boolean).sort((x, y) => x[0] - y[0]);
        let free = 0, cur = r.a0;
        for (const [s0, s1] of ivs) { if (s0 > cur) free = Math.max(free, s0 - cur); cur = Math.max(cur, s1); }
        free = Math.max(free, r.a1 - cur);
        if (free >= Math.min(wlen, 1.0) - 1e-6) hits = [];
      }
      for (const h of hits) {
        // 窓: かぶりが少しで、0.9m以上空いていれば見逃す
        if (cat === 'window' && h.along < 0.3 && wlen - h.along >= 0.9) continue;
        const cx = r.axis === 0 ? (r.a0 + r.a1) / 2 : r.c + side * 0.5, cz = r.axis === 0 ? r.c + side * 0.5 : (r.a0 + r.a1) / 2;
        add(cat, r.L, cx, cz, `${nm}(${r.i},${r.j}${r.L ? ',' + r.L : ''} ${r.axis ? '縦' : '横'}${r.n}) の前 ${h.near.toFixed(2)}m に ${pname(h.p)}（幅 ${h.along.toFixed(2)}m かぶる）`, [h.p], { near: h.near });
      }
    }
  }
  // 3) 階段の上がり口・下り口
  const stairEnds = [];
  for (const s of w.stairs) {
    const alongX = s.dir === 'e' || s.dir === 'w';
    const up = s.dir === 'e' || s.dir === 's' ? 1 : -1; // 上がる向き（+x / +z）
    // 下の端（階 s.L）と上の端（階 s.L+1）
    const lowEdge = alongX ? (up > 0 ? s.x0 : s.x1) : (up > 0 ? s.z0 : s.z1);
    const topEdge = alongX ? (up > 0 ? s.x1 : s.x0) : (up > 0 ? s.z1 : s.z0);
    const a0 = alongX ? s.z0 : s.x0, a1 = alongX ? s.z1 : s.x1;
    const ends = [{ L: s.L, c: lowEdge, side: -up, nm: '下り口' }];
    if (s.L + 1 < w.NL) ends.push({ L: s.L + 1, c: topEdge, side: up, nm: '上がり口' });
    for (const e of ends) {
      const axis = alongX ? 1 : 0; // 帯は端の線（階段の幅の向き）に沿う
      for (const h of zoneHits(e.L, axis, a0, a1, e.c - e.side * 0.03, RULE.STAIR_D, e.side)) {
        add('stair', e.L, alongX ? e.c + e.side * 0.6 : (a0 + a1) / 2, alongX ? (a0 + a1) / 2 : e.c + e.side * 0.6, `階段#${s.id} の${e.nm}の前 ${h.near.toFixed(2)}m に ${pname(h.p)}`, [h.p], { near: h.near });
      }
      stairEnds.push({ L: e.L, x: alongX ? e.c + e.side * 0.6 : (a0 + a1) / 2, z: alongX ? (a0 + a1) / 2 : e.c + e.side * 0.6, nm: `階段#${s.id}の${e.nm}` });
    }
  }
  // 4) 道の幅（細かい格子）
  const RS = [RULE.R_MIN, 0.31, 0.34, 0.37, RULE.R_OK];
  for (let L = 0; L < w.NL; L++) {
    const A = raster(w, L, true), B = raster(w, L, false);
    const FW = A.FW, FD = A.FD;
    const clr = clearance(A.blk, FW, FD), clr0 = clearance(B.blk, FW, FD);
    const labs = RS.map(r => label(clr, FW, FD, r));
    const lab0 = label(clr0, FW, FD, RULE.R_OK);      // 置き物なしで快適につながる所
    const lab0min = label(clr0, FW, FD, RULE.R_MIN);
    levels.push({ L, FW, FD, blk: A.blk, clr, clr0, ok: labs[labs.length - 1], min: labs[0] });
    const at = (x, z) => (Math.floor(z / FS) + 1) * FW + Math.floor(x / FS) + 1;
    // 近くの「半径 r で立てる」格子へ寄せる
    const snap = (c, x, z, r, maxD) => {
      const k0 = at(x, z); if (c[k0] >= r) return k0;
      const R = Math.ceil(maxD / FS); let best = -1, bd = 1e9;
      const ci = Math.floor(x / FS) + 1, cj = Math.floor(z / FS) + 1;
      for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
        const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= FW || j >= FD) continue;
        const k = j * FW + i; if (c[k] < r) continue;
        const dd = di * di + dj * dj; if (dd < bd) { bd = dd; best = k; }
      }
      return bd * FS * FS <= maxD * maxD ? best : -1;
    };
    // 大事な場所
    const pts = [];
    const P = (x, z, nm, kind) => pts.push({ x, z, nm, kind });
    for (const d of w.doors) if (d.L === L) for (const s of [1, -1]) P(d.cx + d.nx * s * 0.7, d.cz + d.nz * s * 0.7, `扉#${d.id}(${d.i0},${d.j0})の${s > 0 ? '+' : '-'}側`, 'door');
    for (const r of RN) if (r.L === L) {
      const nm = r.t === C.OPEN ? '開口' : r.t === C.GLASSWALL ? 'ガラスの壁' : '窓';
      for (const s of [1, -1]) {
        const off = 0.65 + (r.sill ? r.sill[s > 0 ? 0 : 1] : 0);
        const at2 = (a) => [r.axis === 0 ? a : r.c + s * off, r.axis === 0 ? r.c + s * off : a];
        if (r.t === C.WINDOW) {
          // 長い窓は1.5mごとに
          const n = Math.max(1, Math.round((r.a1 - r.a0) / 1.5));
          for (let q = 0; q < n; q++) { const [x, z] = at2(r.a0 + (r.a1 - r.a0) * (q + 0.5) / n); P(x, z, `${nm}(${r.i},${r.j})の${s > 0 ? '+' : '-'}側`, 'window'); }
        } else {
          // 開口・ガラスの壁: 並びのうち、置き物からいちばん離れた所
          let best = null, bc = -1;
          for (let a = r.a0 + 0.25; a < r.a1; a += 0.25) { const [x, z] = at2(a); const k = at(x, z); if (clr[k] > bc) { bc = clr[k]; best = [x, z]; } }
          if (best) P(best[0], best[1], `${nm}(${r.i},${r.j})の${s > 0 ? '+' : '-'}側`, 'open');
        }
      }
    }
    for (const e of stairEnds) if (e.L === L) P(e.x, e.z, e.nm, 'stair');
    const sp = def.spawn || {};
    for (const e of sp.swat || []) if ((e.L || 0) === L) P(e.x * CS, e.z * CS, 'SWAT出現 ' + e.name, 'spawn');
    for (const key of ['bomb', 'tdm']) for (const e of sp[key] || []) if ((e[2] || 0) === L) P(e[0] * CS, e[1] * CS, `${key}(${e[0]},${e[1]})`, 'spawn');
    // 容疑者・市民・人質は家具のそばでよい（体が入って、歩いて行ければよい）
    for (const key of ['sus', 'civ', 'hostage']) for (const e of sp[key] || []) if ((e[2] || 0) === L) P(e[0] * CS, e[1] * CS, `${key}(${e[0]},${e[1]})`, 'npc');
    // 証拠は家具の上: 1m以内に立てる所があればよい
    for (const e of sp.evidence || []) if ((e[2] || 0) === L) P(e[0] * CS, e[1] * CS, `evidence(${e[0]},${e[1]})`, 'item');
    if (sp.pvp) for (const s of ['a', 'b']) for (const e of sp.pvp[s] || []) if ((e[2] || 0) === L) P(e[0] * CS, e[1] * CS, `pvp.${s}(${e[0]},${e[1]})`, 'spawn');
    for (const e of sp.sites || []) if ((e.L || 0) === L) P(e.x * CS, e.z * CS, '目標 ' + e.name, 'site');
    // 部屋のいちばん広い所（置き物なしで）
    for (const r of w.rooms) {
      if (r.L !== L || r.out || r.cells.length < 12) continue;
      let best = -1, bc = 0;
      for (const k of r.cells) {
        const rr = k % (w.W * w.D), j = Math.floor(rr / w.W), i = rr % w.W;
        const kk = at((i + 0.5) * CS, (j + 0.5) * CS);
        if (clr[kk] > bc) { bc = clr[kk]; best = kk; }
      }
      if (best >= 0) { const j = Math.floor(best / FW) - 1, i = best % FW - 1; P((i + 0.5) * FS, (j + 0.5) * FS, `部屋「${r.name}」の広い所`, 'room'); }
    }
    // 置き物なしで快適につながる組ごとに、置き物ありでのつながりを調べる
    const okL = labs[labs.length - 1].lab, minL = labs[0].lab;
    const groups = new Map();
    for (const p of pts) {
      const loose = p.kind === 'npc' || p.kind === 'item';
      const SD = p.kind === 'item' ? 1.0 : p.kind === 'site' ? 1.2 : 0.5; // 目標の中心は机の上でもよい（まわりに立てればよい）
      const k0 = snap(clr0, p.x, p.z, RULE.R_OK, SD);
      if (k0 < 0) continue; // もともと（壁だけで）狭い所。置き物のせいではない
      p.g = lab0.lab[k0]; p.sd = SD;
      p.kMin = snap(clr, p.x, p.z, RULE.R_MIN, SD);
      if (p.kMin < 0) { add('stuck', L, p.x, p.z, `${p.nm} が置き物に埋まっている`, nearProps(w, L, p.x, p.z, 0.6), { kind: p.kind }); continue; }
      if (loose) { p.loose = true; p.c = -1; p.cm = minL[p.kMin]; }
      else { p.kOk = snap(clr, p.x, p.z, RULE.R_OK, SD); p.c = p.kOk >= 0 ? okL[p.kOk] : 0; }
      let arr = groups.get(p.g); if (!arr) groups.set(p.g, arr = []);
      arr.push(p);
    }
    for (const arr of groups.values()) {
      // いちばん多くの場所がつながっている所が本筋
      const cnt = new Map();
      for (const p of arr) if (p.c > 0) cnt.set(p.c, (cnt.get(p.c) || 0) + (p.kind === 'door' || p.kind === 'stair' ? 3 : 1));
      let main = 0, mc = -1;
      for (const [c, n] of cnt) if (n > mc) { mc = n; main = c; }
      if (!main) continue;
      const repMin = minL[mainRep(okL, main)];
      for (const p of arr) {
        if (p.c === main) continue;
        if (p.loose) { if (p.cm !== repMin) add('stuck', L, p.x, p.z, `${p.nm} へ置き物のせいで行けない`, nearProps(w, L, p.x, p.z, 1.0), { kind: p.kind }); continue; }
        // どの半径までなら本筋へつながるか
        let rb = 0, kb = -1;
        for (let q = RS.length - 2; q >= 0; q--) {
          const lb = labs[q].lab;
          const k = snap(clr, p.x, p.z, RS[q], p.sd); if (k < 0) continue;
          // 本筋の代表（本筋の格子はどれも半径 RS[q] でも同じ組にいる）
          const rep = mainRep(okL, main);
          if (lb[k] && lb[k] === lb[rep]) { rb = RS[q]; kb = k; break; }
        }
        if (!rb) { add('stuck', L, p.x, p.z, `${p.nm} へ置き物のせいで行けない`, nearProps(w, L, p.x, p.z, 1.0), { kind: p.kind }); continue; }
        // 狭い所の場所: 半径 rb の道をたどって、いちばん狭い格子
        const nar = narrowest(clr, FW, FD, kb, okL, main, rb);
        const nx = (nar.k % FW - 1 + 0.5) * FS, nz = (Math.floor(nar.k / FW) - 1 + 0.5) * FS;
        add('pinch', L, nx, nz, `${p.nm} への道が狭い（幅 ${(nar.c * 2).toFixed(2)}m。(${(nx / CS).toFixed(1)},${(nz / CS).toFixed(1)}) のあたり）`, nearProps(w, L, nx, nz, nar.c + 0.2), { kind: p.kind, width: nar.c * 2, px: p.x, pz: p.z });
      }
    }
  }
  // 同じ狭い所は1つにまとめる
  const merged = [];
  for (const f of finds) {
    if (f.cat !== 'pinch') { merged.push(f); continue; }
    const m = merged.find(g => g.cat === 'pinch' && g.L === f.L && Math.hypot(g.x - f.x, g.z - f.z) < 0.5);
    if (m) { m.also = (m.also || 0) + 1; if (f.kind === 'door' || f.kind === 'stair') m.kind = f.kind; } else merged.push(f);
  }
  return { id, w, def, finds: merged, levels };
}

// 壁の線から、物の奥の端までの距離（m）
function sillDepth(p, r, side) {
  let far = 0;
  for (const b of p.boxes) far = Math.max(far, r.axis === 0 ? (side > 0 ? b[5] - r.c : r.c - b[2]) : (side > 0 ? b[3] - r.c : r.c - b[0]));
  return Math.max(0, far);
}
// 物が帯（奥行き depth）にかかる、線に沿った範囲
function alongSpan(p, r, side, depth) {
  let lo = 1e9, hi = -1e9;
  for (const b of p.boxes) {
    const n0 = r.axis === 0 ? (side > 0 ? b[2] - r.c : r.c - b[5]) : (side > 0 ? b[0] - r.c : r.c - b[3]);
    if (n0 > depth) continue;
    const a0 = r.axis === 0 ? b[0] : b[2], a1 = r.axis === 0 ? b[3] : b[5];
    lo = Math.min(lo, a0); hi = Math.max(hi, a1);
  }
  return lo < hi ? [Math.max(r.a0, lo), Math.min(r.a1, hi)] : null;
}

let _rep = null;
function mainRep(okL, main) { if (_rep && _rep.l === okL && _rep.m === main) return _rep.k; let k = 0; while (okL[k] !== main) k++; _rep = { l: okL, m: main, k }; return k; }

function nearProps(w, L, x, z, r) {
  const base = L * LH, out = [];
  for (const p of w.props) {
    if (p.L !== L || !p.solid) continue;
    for (const b of p.boxes) {
      if (!blocksWalk(b, base)) continue;
      const dx = Math.max(b[0] - x, 0, x - b[3]), dz = Math.max(b[2] - z, 0, z - b[5]);
      if (Math.hypot(dx, dz) <= r) { out.push(p); break; }
    }
  }
  return out;
}

// 半径 r の道で本筋まで行き、とちゅうでいちばん狭い格子を返す（広い道を選ぶ）
function narrowest(clr, FW, FD, k0, okL, main, r) {
  // 広い所ほど安いダイクストラ（かんたんな桶）
  const N = FW * FD, dist = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1);
  const buckets = [[k0]]; dist[k0] = 0; let bi = 0, end = -1;
  const cost = (k) => 1 + Math.round(40 * Math.max(0, RULE.R_OK + 0.1 - clr[k]));
  while (bi < buckets.length) {
    const bk = buckets[bi]; if (!bk || !bk.length) { bi++; continue; }
    const k = bk.pop(); if (dist[k] < bi) continue;
    if (okL[k] === main) { end = k; break; }
    for (const k2 of [k - 1, k + 1, k - FW, k + FW]) {
      if (clr[k2] < r) continue;
      const nd = bi + cost(k2);
      if (nd < dist[k2]) { dist[k2] = nd; from[k2] = k; (buckets[nd] || (buckets[nd] = [])).push(k2); }
    }
  }
  let best = { k: k0, c: clr[k0] };
  for (let k = end; k >= 0; k = from[k]) if (clr[k] < best.c) best = { k, c: clr[k] };
  return best;
}

// ---- 見取り図（SVG）: 置き物の番号・扉の板が回る範囲・見つかった所 ----
export function auditSVG(res, L, s = 16, crop = null) {
  const { w, def, finds } = res;
  const x0 = crop ? crop[0] : 0, z0 = crop ? crop[1] : 0, x1 = crop ? crop[2] : w.W, z1 = crop ? crop[3] : w.D;
  const X = (x) => ((x / CS - x0) * s).toFixed(1), Z = (z) => ((z / CS - z0) * s).toFixed(1);
  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${(x1 - x0) * s}" height="${(z1 - z0) * s}" font-family="monospace" style="background:#222">`);
  const FCOL = { [C.FLOOR]: '#cfcabb', [C.OUT]: '#7c8f6a' };
  for (let j = Math.max(0, Math.floor(z0)); j < Math.min(w.D, z1); j++) for (let i = Math.max(0, Math.floor(x0)); i < Math.min(w.W, x1); i++) {
    const k = w.idx(L, i, j), t = w.cell[k];
    if (t === C.VOID) continue;
    let col = FCOL[t] || '#bdb8a8';
    if (t === C.STAIR) col = '#d9c04a';
    o.push(`<rect x="${(i - x0) * s}" y="${(j - z0) * s}" width="${s}" height="${s}" fill="${col}"/>`);
    if (isWallish(t)) {
      const wc = t === C.DOOR ? '#b5651d' : t === C.WINDOW ? '#2aa6ff' : t === C.GLASSWALL ? '#7fd0ff' : t === C.OPEN ? '#e8e08a' : t === C.LOW ? '#777' : t === C.FENCE ? '#99a' : '#333';
      if (t === C.DOOR || t === C.OPEN) o.push(`<rect x="${(i - x0) * s}" y="${(j - z0) * s}" width="${s}" height="${s}" fill="${wc}" opacity="0.45"/>`);
      else for (let n = 0; n < w.nbox[k]; n++) { const q = k * 8 + n * 4; o.push(`<rect x="${X(w.boxes[q])}" y="${Z(w.boxes[q + 1])}" width="${((w.boxes[q + 2] - w.boxes[q]) / CS * s).toFixed(1)}" height="${((w.boxes[q + 3] - w.boxes[q + 1]) / CS * s).toFixed(1)}" fill="${wc}"/>`); }
    }
  }
  // 目盛り（10マスごと）
  for (let i = Math.ceil(x0 / 5) * 5; i < x1; i += 5) { o.push(`<line x1="${(i - x0) * s}" y1="0" x2="${(i - x0) * s}" y2="${(z1 - z0) * s}" stroke="#000" stroke-opacity="${i % 10 ? 0.08 : 0.2}"/>`); if (i % 10 === 0) o.push(`<text x="${(i - x0) * s + 2}" y="10" font-size="10" fill="#fff">${i}</text>`); }
  for (let j = Math.ceil(z0 / 5) * 5; j < z1; j += 5) { o.push(`<line x1="0" y1="${(j - z0) * s}" x2="${(x1 - x0) * s}" y2="${(j - z0) * s}" stroke="#000" stroke-opacity="${j % 10 ? 0.08 : 0.2}"/>`); if (j % 10 === 0) o.push(`<text x="2" y="${(j - z0) * s + 10}" font-size="10" fill="#fff">${j}</text>`); }
  // 扉の板が回る範囲
  for (const d of w.doors) {
    if (d.L !== L) continue;
    for (const lf of d.leaves) o.push(`<circle cx="${X(lf.hx)}" cy="${Z(lf.hz)}" r="${(lf.len / CS * s).toFixed(1)}" fill="none" stroke="#b5651d" stroke-opacity="0.5" stroke-dasharray="3 3"/>`);
    o.push(`<text x="${X(d.cx)}" y="${Z(d.cz)}" font-size="9" fill="#5a2a00" text-anchor="middle">D${d.id}</text>`);
  }
  const bad = new Set(); for (const f of finds) if (f.L === L) for (const p of f.props) bad.add(p);
  for (const p of w.props) {
    if (p.L !== L) continue;
    const col = bad.has(p.id) ? '#ff5a4a' : p.solid ? (p.h > 1.3 ? '#8a6a3a' : '#c79a55') : '#e6e0c0';
    o.push(`<rect x="${X(p.x - p.w / 2)}" y="${Z(p.z - p.d / 2)}" width="${(p.w / CS * s).toFixed(1)}" height="${(p.d / CS * s).toFixed(1)}" fill="${col}" stroke="#000" stroke-width="0.6" opacity="${p.solid ? 0.92 : 0.6}"/>`);
    o.push(`<text x="${X(p.x)}" y="${(+Z(p.z) + 3).toFixed(1)}" font-size="${Math.max(7, s * 0.5)}" fill="#000" text-anchor="middle">${p.id}</text>`);
  }
  for (const f of finds) {
    if (f.L !== L) continue;
    const col = f.cat === 'pinch' ? '#ff00ff' : f.cat === 'stuck' ? '#ff0000' : f.cat === 'window' ? '#00e5ff' : '#ff3b30';
    o.push(`<circle cx="${X(f.x)}" cy="${Z(f.z)}" r="${s * 0.45}" fill="none" stroke="${col}" stroke-width="2.5"/>`);
  }
  const sp = def.spawn || {};
  for (const e of sp.swat || []) if ((e.L || 0) === L) o.push(`<circle cx="${(e.x - x0) * s}" cy="${(e.z - z0) * s}" r="5" fill="#2a7bff"/>`);
  for (const e of sp.sites || []) if ((e.L || 0) === L) o.push(`<circle cx="${(e.x - x0) * s}" cy="${(e.z - z0) * s}" r="${(e.r || 3.2) / CS * s}" fill="none" stroke="#fff" stroke-dasharray="6 4"/>`);
  for (const r of w.rooms) if (r.L === L && !r.out && r.cells.length >= 8) o.push(`<text x="${X(r.cx)}" y="${Z(r.cz)}" font-size="11" fill="#134" text-anchor="middle" opacity="0.8">${r.name}</text>`);
  o.push('</svg>');
  return o.join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('propaudit.mjs')) {
  const args = process.argv.slice(2);
  const si = args.indexOf('--svg'); const svgDir = si >= 0 ? args.splice(si, 2)[1] : null;
  const qi = args.indexOf('--quiet'); const quiet = qi >= 0 ? !!args.splice(qi, 1) : false;
  const ids = args.length ? args : Object.keys(MAPS);
  let total = 0;
  for (const id of ids) {
    const r = auditMap(id);
    const by = {}; for (const f of r.finds) by[f.cat] = (by[f.cat] || 0) + 1;
    console.log(`== ${id} 置き物 ${r.w.props.length}  見つかった ${r.finds.length} ${JSON.stringify(by)}`);
    if (!quiet) for (const f of r.finds) console.log(`  [${f.cat}] ${f.msg}${f.cat === 'pinch' || f.cat === 'stuck' ? '  近くの置き物: ' + f.props.map(i => pname(r.w.props[i])).join(' ') : ''}${f.also ? `（ほか${f.also}か所から）` : ''}`);
    total += r.finds.length;
    if (svgDir) { fs.mkdirSync(svgDir, { recursive: true }); for (let L = 0; L < r.w.NL; L++) fs.writeFileSync(`${svgDir}/${id}_${L}.svg`, auditSVG(r, L)); }
  }
  console.log(`合計 ${total}`);
  process.exit(total ? 1 : 0);
}
