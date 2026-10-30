// マップの見た目を組み立てる: 床・天井・屋根・壁（ブロックと穴）・階段・扉と窓の枠・ガラス・金網・家具・照明の器具
// 塊（チャンク）ごとに作り、壁が壊れたらその塊だけ作り直す。
import { MeshBuilder, hex, mixc, mulc } from './build.js';
import { LAYER } from './textures.js';
import { CS, LH, CEIL, BH, NB, C, isWallish } from '../engine/world.js';
import { M, F } from '../engine/data/materials.js';
import { buildProp } from './props.js';

export const CHUNK = 16; // マス
const Q = 2;            // 床の細かさ（1マスを2×2に分ける）

// 色の表（線形）
const COL = {
  white: hex('#ece8e0'), paint: hex('#e2ddd2'), ceil: hex('#e9e7e2'), concrete: hex('#a9a69f'), concreteDark: hex('#8a8780'),
  brick: hex('#9c5b45'), wood: hex('#8b6a4c'), plywood: hex('#c8aa7e'), metal: hex('#9aa0a6'), trim: hex('#f2efe8'), trimWood: hex('#7a5638'),
  tile: hex('#d9d9d4'), woodfloor: hex('#9a7352'), carpet: hex('#8d8478'), asphalt: hex('#4f5053'), grass: hex('#64843f'), dirt: hex('#8b7253'), sidewalk: hex('#b5b1a8'),
  roof: hex('#77746f'), gypsum: hex('#efece4'), glassFrame: hex('#3a3d40'), fence: hex('#8e9397'), doorWood: hex('#8a6440'), doorMetal: hex('#6f777e'),
};
// 部屋の塗装の候補（名前で決めない部屋）
const PAINTS = ['#e4dfd4', '#d9d3c4', '#cfd6d2', '#d6dbe0', '#e0d6c6', '#cfc8bb', '#d8cfc2', '#c9d1c4', '#e6e1d8', '#d3c7b8'].map(hex);

export function prepareLevel(w, def) {
  const ctx = { w, def, NL: w.NL, W: w.W, D: w.D };
  // 部屋の塗装と床の色
  const paintBy = def.paint || {}, floorBy = def.floorCol || {};
  ctx.roomPaint = w.rooms.map((r, i) => paintBy[r.name] ? hex(paintBy[r.name]) : r.out ? COL.white : PAINTS[(i * 7 + (def.paintSeed || 0)) % PAINTS.length]);
  ctx.roomFloorCol = w.rooms.map((r) => floorBy[r.name] ? hex(floorBy[r.name]) : null);
  ctx.ext = {
    brick: def.extBrick ? hex(def.extBrick) : COL.brick,
    concrete: def.extConcrete ? hex(def.extConcrete) : COL.concrete,
    drywall: def.extStucco ? hex(def.extStucco) : hex('#d6cfc0'),
    wood: def.extWood ? hex(def.extWood) : hex('#a88e68'),
  };
  ctx.ceilStyle = def.ceiling || 'plaster';
  ctx.carpet = def.carpet ? hex(def.carpet) : COL.carpet;
  ctx.doorCol = def.doorCol ? hex(def.doorCol) : COL.doorWood;
  // 細部の色: 窓枠・窓台・基礎の帯・扉の額縁・内側の白い木部
  const homeyMap = !!def.homey;
  ctx.winFrame = def.winFrame ? hex(def.winFrame) : (homeyMap ? hex('#e9e6df') : COL.glassFrame);
  ctx.sill = def.sill ? hex(def.sill) : hex('#b9b3a7');
  ctx.plinth = def.plinth ? hex(def.plinth) : hex('#7d7a74');
  ctx.doorTrim = def.doorTrim ? hex(def.doorTrim) : COL.trim;
  ctx.trimIn = hex('#e8e5de');
  // 住まいの部屋（カーテンをかける）: 木の床・じゅうたんの部屋
  ctx.homey = w.rooms.map(r => { if (r.out || !homeyMap) return false; const k = r.cells[0]; const fm = w.floorMat[k]; return fm === F.WOOD || fm === F.CARPET; });
  const CURT = ['#7c8a96', '#a39274', '#8a5f55', '#6f7a63', '#b5ada0', '#4f5f74'].map(hex);
  ctx.curtain = w.rooms.map((r, i) => CURT[(i * 5 + 1) % CURT.length]);
  // 描画用の壁の箱（交わるマスは重ならないように切る）: rbox[k] = [[x0,z0,x1,z1, axis], ...]
  ctx.rbox = new Array(w.N);
  for (let L = 0; L < w.NL; L++) for (let j = 0; j < w.D; j++) for (let i = 0; i < w.W; i++) {
    const k = w.idx(L, i, j);
    if (!isWallish(w.cell[k])) continue;
    const a = w.arms[k], ax = a & 3, az = a & 12;
    const hasX = !!(ax || !az), hasZ = !!az;
    const list = [];
    const o = k * 8;
    let bi = 0;
    let X = null, Z = null;
    if (hasX) { X = [w.boxes[o], w.boxes[o + 1], w.boxes[o + 2], w.boxes[o + 3]]; bi = 1; }
    if (hasZ) Z = [w.boxes[o + bi * 4], w.boxes[o + bi * 4 + 1], w.boxes[o + bi * 4 + 2], w.boxes[o + bi * 4 + 3]];
    const cx = (i + 0.5) * CS, cz = (j + 0.5) * CS;
    if (X && Z) {
      if (!(a & 2)) X[0] = cx; if (!(a & 1)) X[2] = cx;
      const hx = (X[3] - X[1]) / 2;
      if (a & 8) list.push([Z[0], Z[1], Z[2], cz - hx, 1]);
      if (a & 4) list.push([Z[0], cz + hx, Z[2], Z[3], 1]);
      list.unshift([X[0], X[1], X[2], X[3], 0]);
    } else if (X) list.push([...X, 0]);
    else if (Z) list.push([...Z, 1]);
    ctx.rbox[k] = list;
  }
  // 光の格子のための壁の印（1: X向きの板＝zで仕切る、2: Z向きの板＝xで仕切る）
  ctx.wallMask = new Uint8Array(w.W * w.D * w.NL);
  for (let L = 0; L < w.NL; L++) for (let j = 0; j < w.D; j++) for (let i = 0; i < w.W; i++) {
    const k = w.idx(L, i, j), t = w.cell[k];
    if (!isWallish(t) || t === C.FENCE || t === C.LOW) continue;
    const a = w.arms[k], ax = a & 3, az = a & 12;
    let m = 0;
    if (ax || !az) m |= 1;
    if (az) m |= 2;
    ctx.wallMask[(L * w.D + j) * w.W + i] = m;
  }
  ctx.ao = bakeAO(ctx);
  return ctx;
}

// 床の近くの暗がり（壁・家具の足元）: 1マスを4×4に分けた格子。1 = 明るい
function bakeAO(ctx) {
  const { w } = ctx, R = 4, W = w.W * R, D = w.D * R;
  const out = new Uint8Array(W * D * w.NL);
  const occ = new Float32Array(W * D), tmp = new Float32Array(W * D);
  for (let L = 0; L < w.NL; L++) {
    occ.fill(0);
    for (let j = 0; j < w.D; j++) for (let i = 0; i < w.W; i++) {
      const k = w.idx(L, i, j), t = w.cell[k];
      if (t === C.VOID && L === 0) { for (let b = 0; b < R; b++) for (let a = 0; a < R; a++) occ[(j * R + b) * W + i * R + a] = 0; continue; }
      if (!isWallish(t)) continue;
      const bx = ctx.rbox[k] || [];
      const bl = w.blocks[k * NB];
      if (!bl && t !== C.DOOR) continue; // 一番下のブロックがない（扉の開口・穴）
      if (t === C.DOOR || t === C.OPEN) continue;
      for (const b of bx) {
        for (let pz = Math.floor(b[1] / CS * R); pz < Math.ceil(b[3] / CS * R); pz++) for (let px = Math.floor(b[0] / CS * R); px < Math.ceil(b[2] / CS * R); px++) {
          if (px < 0 || pz < 0 || px >= W || pz >= D) continue;
          occ[pz * W + px] = t === C.FENCE ? 0.15 : t === C.LOW ? 0.6 : 1;
        }
      }
    }
    for (const p of w.props) {
      if (p.L !== L || !p.solid || p.h < 0.25) continue;
      const v = p.h > 1.2 ? 1 : 0.7;
      for (let pz = Math.floor((p.z - p.d / 2) / CS * R); pz < Math.ceil((p.z + p.d / 2) / CS * R); pz++) for (let px = Math.floor((p.x - p.w / 2) / CS * R); px < Math.ceil((p.x + p.w / 2) / CS * R); px++) {
        if (px < 0 || pz < 0 || px >= W || pz >= D) continue;
        occ[pz * W + px] = Math.max(occ[pz * W + px], v);
      }
    }
    // ぼかす（2回の箱ぼかし、半径2）
    const blur = (src, dst, dx, dy, r) => {
      for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
        let s = 0, n = 0;
        for (let q = -r; q <= r; q++) { const xx = x + dx * q, yy = y + dy * q; if (xx < 0 || yy < 0 || xx >= W || yy >= D) continue; s += src[yy * W + xx]; n++; }
        dst[y * W + x] = s / n;
      }
    };
    blur(occ, tmp, 1, 0, 2); const b1 = new Float32Array(W * D); blur(tmp, b1, 0, 1, 2);
    blur(b1, tmp, 1, 0, 1); blur(tmp, b1, 0, 1, 1);
    for (let q = 0; q < W * D; q++) out[L * W * D + q] = Math.round(255 * Math.max(0.25, 1 - 0.85 * b1[q]));
  }
  return { data: out, W, D, R };
}

// ---- 1つの塊を作る
export function buildChunk(ctx, S, L, ci, cj) {
  const { w } = ctx;
  const B = new MeshBuilder(), G = new MeshBuilder();
  const i0 = ci * CHUNK, j0 = cj * CHUNK, i1 = Math.min(w.W, i0 + CHUNK), j1 = Math.min(w.D, j0 + CHUNK);
  floorsAndCeilings(ctx, B, L, i0, j0, i1, j1);
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const k = w.idx(L, i, j);
    if (isWallish(w.cell[k])) wallCell(ctx, S, B, G, L, i, j, k);
  }
  slabEdges(ctx, B, L, i0, j0, i1, j1);
  if (L === w.NL - 1) roofEdges(ctx, B, i0, j0, i1, j1);
  // 階段
  for (const s of w.stairs) if (s.L === L && s.i0 >= i0 && s.i0 < i1 && s.j0 >= j0 && s.j0 < j1) stairMesh(ctx, B, s);
  // 扉と窓の枠
  for (const d of w.doors) if (d.L === L && d.i0 >= i0 && d.i0 < i1 && d.j0 >= j0 && d.j0 < j1) doorFrame(ctx, B, d);
  // 家具
  for (const p of w.props) {
    if (p.L !== L) continue;
    const pi = Math.floor(p.x / CS), pj = Math.floor(p.z / CS);
    if (pi < i0 || pi >= i1 || pj < j0 || pj >= j1) continue;
    const k = w.idx(L, Math.max(0, Math.min(w.W - 1, pi)), Math.max(0, Math.min(w.D - 1, pj)));
    B.room = Math.max(0, w.roomAt[k]);
    buildProp(B, G, p, ctx.def);
  }
  // 照明の器具（天井）
  for (const lt of (ctx.def.lights || [])) {
    const [x, z, LL = 0, kind] = lt;
    if (LL !== L) continue;
    const pi = Math.floor(x), pj = Math.floor(z);
    if (pi < i0 || pi >= i1 || pj < j0 || pj >= j1) continue;
    fixture(ctx, B, x * CS, z * CS, L, kind);
  }
  return { B, G };
}

// 床・天井・屋根: 1マスを2×2に分けた格子で、同じ見た目の所をまとめる
function floorsAndCeilings(ctx, B, L, i0, j0, i1, j1) {
  const { w } = ctx;
  const NI = (i1 - i0) * Q, NJ = (j1 - j0) * Q;
  const keyF = new Array(NI * NJ).fill(null), keyC = new Array(NI * NJ).fill(null), keyR = new Array(NI * NJ).fill(null), keyLR = new Array(NI * NJ).fill(null);
  const cellAt = (ii, jj) => (ii < 0 || jj < 0 || ii >= w.W || jj >= w.D) ? -1 : w.idx(L, ii, jj);
  const isOpenCell = (t) => t === C.FLOOR || t === C.OUT || t === C.STAIR;
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const k = w.idx(L, i, j), t = w.cell[k];
    const slab = L === 0 ? t !== C.VOID : !!w.slab[k];
    const stairHere = w.stairAt[k] >= 0 && w.stairs[w.stairAt[k]].L === L; // 階段の下の部分（段そのもの）
    for (let b = 0; b < Q; b++) for (let a = 0; a < Q; a++) {
      const q = ((j - j0) * Q + b) * NI + (i - i0) * Q + a;
      // この区画の部屋・床の材質: 壁マスなら、その側の隣のマスから
      let src = k;
      if (isWallish(t)) {
        const di = a === 0 ? -1 : 1, dj = b === 0 ? -1 : 1;
        const m = ctx.wallMask[(L * w.D + j) * w.W + i];
        const cands = [];
        if (m & 1) cands.push(cellAt(i, j + dj));
        if (m & 2) cands.push(cellAt(i + di, j));
        cands.push(cellAt(i + di, j + dj), cellAt(i, j + dj), cellAt(i + di, j));
        src = -1;
        for (const c of cands) if (c >= 0 && isOpenCell(w.cell[c])) { src = c; break; }
        if (src < 0) src = k;
      }
      const st = w.cell[src];
      const room = w.roomAt[src];
      // 床
      if (slab && t !== C.VOID && !stairHere) {
        const fm = w.floorMat[src] || F.CONCRETE;
        keyF[q] = `${fm}|${room}|${st === C.OUT ? 1 : 0}`;
      } else if (L > 0 && t === C.VOID && w.slab[k]) keyLR[q] = 'roof|-1';
      // 天井
      const ind = w.indoor[k] >= 1 || (isWallish(t) && w.indoor[src] >= 1);
      const above = L + 1 < w.NL ? !!w.slab[w.idx(L + 1, i, j)] : true;
      const stairUp = L + 1 < w.NL && w.stairAt[w.idx(L + 1, i, j)] >= 0 && w.stairs[w.stairAt[w.idx(L + 1, i, j)]].L === L;
      if (ind && above && !stairUp && (t !== C.OUT) && (st !== C.OUT || isWallish(t))) keyC[q] = `${st === C.OUT ? 'soffit' : ctx.ceilStyle}|${room}`;
      // 最上階の屋根
      if (L === w.NL - 1 && ind && !stairUp) keyR[q] = 'roof|-1';
    }
  }
  const emit = (keys, y, ny, fn) => {
    const done = new Uint8Array(NI * NJ);
    for (let b = 0; b < NJ; b++) for (let a = 0; a < NI; a++) {
      const q = b * NI + a; const kk = keys[q];
      if (!kk || done[q]) continue;
      let wa = 1; while (a + wa < NI && !done[b * NI + a + wa] && keys[b * NI + a + wa] === kk) wa++;
      let hb = 1;
      outer: while (b + hb < NJ) { for (let x = 0; x < wa; x++) { const qq = (b + hb) * NI + a + x; if (done[qq] || keys[qq] !== kk) break outer; } hb++; }
      for (let y2 = 0; y2 < hb; y2++) for (let x = 0; x < wa; x++) done[(b + y2) * NI + a + x] = 1;
      const x0 = (i0 + a / Q) * CS, z0 = (j0 + b / Q) * CS, x1 = x0 + wa / Q * CS, z1 = z0 + hb / Q * CS;
      fn(kk, x0, z0, x1, z1, y, ny);
    }
  };
  const base = L * LH;
  emit(keyF, base, 1, (kk, x0, z0, x1, z1, y) => {
    const [fm, room, out] = kk.split('|').map(Number);
    const [layer, col0, s] = floorLook(ctx, fm, room, out);
    B.room = Math.max(0, room);
    B.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [x0 * s, z1 * s, x1 * s, z1 * s, x1 * s, z0 * s, x0 * s, z0 * s], layer, col0);
  });
  emit(keyC, base + CEIL, -1, (kk, x0, z0, x1, z1, y) => {
    const [style, rs] = kk.split('|'); const room = +rs;
    const tile = style === 'tile';
    const layer = style === 'soffit' ? LAYER.plaster : tile ? LAYER.ceiling : style === 'concrete' ? LAYER.concrete : LAYER.plaster;
    const col = style === 'concrete' ? COL.concrete : style === 'soffit' ? mulc(COL.ceil, 0.9) : COL.ceil;
    const s = tile ? 0.5 : 0.5;
    B.room = Math.max(0, room);
    B.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0], [x0 * s, z0 * s, x1 * s, z0 * s, x1 * s, z1 * s, x0 * s, z1 * s], layer, col);
  });
  const roof = (kk, x0, z0, x1, z1, y) => {
    B.room = 0;
    B.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [x0 * 0.5, z1 * 0.5, x1 * 0.5, z1 * 0.5, x1 * 0.5, z0 * 0.5, x0 * 0.5, z0 * 0.5], LAYER.concrete, COL.roof);
  };
  emit(keyR, base + LH, 1, roof);
  emit(keyLR, base, 1, roof);
}

function floorLook(ctx, fm, room, out) {
  const rc = room >= 0 ? ctx.roomFloorCol[room] : null;
  switch (fm) {
    case F.TILE: return [LAYER.tile, rc || COL.tile, 1];
    case F.WOOD: return [LAYER.woodfloor, rc || COL.woodfloor, 0.8];
    case F.CARPET: return [LAYER.carpet, rc || ctx.carpet, 1];
    case F.ASPHALT: return [LAYER.asphalt, rc || COL.asphalt, 0.25];
    case F.GRASS: return [LAYER.grass, rc || COL.grass, 0.35];
    case F.DIRT: return [LAYER.dirt, rc || COL.dirt, 0.35];
    case F.METAL: return [LAYER.metal, rc || COL.metal, 0.5];
    case F.CONCRETE: default: return out ? [LAYER.sidewalk, rc || COL.sidewalk, 0.5] : [LAYER.concrete, rc || COL.concrete, 0.35];
  }
}

// 壁の見た目: 面の向いている側（屋内なら部屋の塗装、屋外なら外壁）
function wallLook(ctx, mat, side, room) {
  // side: 'in' | 'out' | 'core'
  const { ext } = ctx;
  if (mat === M.WOOD) return side === 'core' ? [LAYER.wood, COL.wood, 1] : [LAYER.plywood, side === 'out' ? ext.wood : COL.plywood, 0.5];
  if (mat === M.METAL) return [LAYER.metal, COL.metal, 1];
  if (mat === M.FENCE) return [LAYER.metal, COL.fence, 1];
  if (mat === M.REINF) return [LAYER.metal, hex('#5d646b'), 1];
  if (side === 'core') {
    if (mat === M.BRICK) return [LAYER.brick, ext.brick, 1];
    if (mat === M.CONCRETE) return [LAYER.concrete, COL.concreteDark, 0.5];
    return [LAYER.plain, COL.gypsum, 1];
  }
  if (side === 'out') {
    if (mat === M.BRICK) return [LAYER.brick, ext.brick, 1];
    if (mat === M.CONCRETE) return [LAYER.concrete, ext.concrete, 0.4];
    return [LAYER.plaster, ext.drywall, 0.5];
  }
  // 屋内
  if (mat === M.CONCRETE && ctx.def.rawConcrete) return [LAYER.concrete, COL.concrete, 0.4];
  return [LAYER.plaster, room >= 0 ? ctx.roomPaint[room] : COL.paint, 0.5];
}

// 点が壁のブロック・床の板の中か（面を描くかの判定）
function solidAt(ctx, x, y, z) {
  const { w } = ctx;
  const i = Math.floor(x / CS), j = Math.floor(z / CS);
  if (i < 0 || j < 0 || i >= w.W || j >= w.D) return false;
  const L = Math.max(0, Math.min(w.NL - 1, Math.floor(y / LH)));
  const yl = y - L * LH;
  const k = w.idx(L, i, j);
  if (yl > CEIL) { // 床の板の中
    if (L + 1 < w.NL) return !!w.slab[w.idx(L + 1, i, j)];
    return w.indoor[k] >= 1;
  }
  if (yl < 0) return L === 0 ? w.cell[k] !== C.VOID : !!w.slab[k];
  const list = ctx.rbox[k];
  if (!list) return false;
  const q = Math.min(NB - 1, Math.floor(yl / BH));
  const m = w.blocks[k * NB + q];
  if (!m || m === M.GLASS || m === M.GLASSBROKEN || m === M.FENCE) return false;
  for (const b of list) if (x >= b[0] - 1e-5 && x <= b[2] + 1e-5 && z >= b[1] - 1e-5 && z <= b[3] + 1e-5) return true;
  return false;
}

// 面の向こうにある部屋（屋内の床なら部屋番号、屋外なら -2）
function faceSide(ctx, L, x, z, nx, nz) {
  const { w } = ctx;
  for (const d of [0.3, 0.8]) {
    const i = Math.floor((x + nx * d) / CS), j = Math.floor((z + nz * d) / CS);
    if (i < 0 || j < 0 || i >= w.W || j >= w.D) return { side: 'out', room: -1 };
    const k = w.idx(L, i, j), t = w.cell[k];
    if (t === C.FLOOR || t === C.STAIR) return { side: 'in', room: w.roomAt[k] };
    if (t === C.OUT) return { side: 'out', room: w.roomAt[k] };
    if (t === C.VOID) return { side: 'out', room: -1 };
  }
  return { side: 'in', room: -1 };
}

const BLOCK_Y = (q) => [q * BH, q === NB - 1 ? CEIL : (q + 1) * BH];

function wallCell(ctx, S, B, G, L, i, j, k) {
  const { w } = ctx;
  const t = w.cell[k];
  const list = ctx.rbox[k] || [];
  const base = L * LH;
  const reinf = S && S.reinf && S.reinf[k];
  // ガラスと金網（透明の層）
  if (t === C.WINDOW || t === C.GLASSWALL || t === C.FENCE) {
    for (const b of list) {
      let qa = -1, qb = -1;
      for (let q = 0; q < NB; q++) { const m = w.blocks[k * NB + q]; if (m === M.GLASS || (t === C.FENCE && m === M.FENCE)) { if (qa < 0) qa = q; qb = q; } }
      if (qa < 0) continue;
      const y0 = base + BLOCK_Y(qa)[0] + (t === C.FENCE ? 0 : 0.02), y1 = base + BLOCK_Y(qb)[1] - (t === C.FENCE ? 0 : 0.02);
      const along = b[4] === 0;
      const cx = (b[0] + b[2]) / 2, cz = (b[1] + b[3]) / 2;
      const room = Math.max(0, w.roomAt[w.idx(L, Math.min(w.W - 1, i + (along ? 0 : 1)), Math.min(w.D - 1, j + (along ? 1 : 0)))]);
      G.room = room; G.emit = t === C.FENCE ? 2 : 1; // 1=ガラス 2=金網
      const col = t === C.FENCE ? COL.fence : hex('#9fb4bf');
      if (along) {
        G.quad([b[0], y0, cz], [b[2], y0, cz], [b[2], y1, cz], [b[0], y1, cz], [0, 0, 1], [b[0], y0, b[2], y0, b[2], y1, b[0], y1], LAYER.plain, col);
        G.quad([b[2], y0, cz], [b[0], y0, cz], [b[0], y1, cz], [b[2], y1, cz], [0, 0, -1], [b[2], y0, b[0], y0, b[0], y1, b[2], y1], LAYER.plain, col);
      } else {
        G.quad([cx, y0, b[3]], [cx, y0, b[1]], [cx, y1, b[1]], [cx, y1, b[3]], [1, 0, 0], [b[3], y0, b[1], y0, b[1], y1, b[3], y1], LAYER.plain, col);
        G.quad([cx, y0, b[1]], [cx, y0, b[3]], [cx, y1, b[3]], [cx, y1, b[1]], [-1, 0, 0], [b[1], y0, b[3], y0, b[3], y1, b[1], y1], LAYER.plain, col);
      }
      G.emit = 0;
      // 窓枠と金網の柱
      if (t === C.FENCE) {
        B.room = room;
        if ((i + j) % 4 === 0) B.cyl(cx, cz, base, y1 + 0.05, 0.03, 0.03, 6, LAYER.metal, COL.fence);
      } else {
        B.room = room;
        const fr = ctx.winFrame, th = 0.045, r = 0.008;
        const bx0 = along ? b[0] : b[0] - 0.012, bx1 = along ? b[2] : b[2] + 0.012, bz0 = along ? b[1] - 0.012 : b[1], bz1 = along ? b[3] + 0.012 : b[3];
        B.bbox(bx0, y0 - 0.02, bz0, bx1, y0 + th, bz1, r, LAYER.paint, fr, { faces: 4 | 16 | 32 | 1 | 2 });
        B.bbox(bx0, y1 - th, bz0, bx1, y1 + 0.02, bz1, r, LAYER.paint, fr, { faces: 8 | 16 | 32 | 1 | 2 });
        // 窓の両はしの縦の枠（窓の幅のはしのマスに）と、2マスごとの桟
        const ni = along ? i + 1 : i, nj = along ? j : j + 1;
        const nt = ni < w.W && nj < w.D ? w.cell[w.idx(L, ni, nj)] : C.VOID;
        const pi = along ? i - 1 : i, pj = along ? j : j - 1;
        const pt = pi >= 0 && pj >= 0 ? w.cell[w.idx(L, pi, pj)] : C.VOID;
        const endN = nt !== t, endP = pt !== t;
        if (endN) { if (along) B.bbox(b[2] - 0.045, y0, bz0, b[2], y1, bz1, r, LAYER.paint, fr); else B.bbox(bx0, y0, b[3] - 0.045, bx1, y1, b[3], r, LAYER.paint, fr); }
        if (endP) { if (along) B.bbox(b[0], y0, bz0, b[0] + 0.045, y1, bz1, r, LAYER.paint, fr); else B.bbox(bx0, y0, b[1], bx1, y1, b[1] + 0.045, r, LAYER.paint, fr); }
        if (!endN && ((along ? i : j) % 2 === 1)) { if (along) B.bbox(b[2] - 0.018, y0, cz - 0.03, b[2] + 0.018, y1, cz + 0.03, 0.005, LAYER.paint, fr); else B.bbox(cx - 0.03, y0, b[3] - 0.018, cx + 0.03, y1, b[3] + 0.018, 0.005, LAYER.paint, fr); }
        // 窓台: 外は石の台（張り出す）、内は白い板。両はしは少し長く
        windowSills(ctx, B, L, b, along, cx, cz, y0, y1, endP, endN, i, j);
      }
    }
  }
  // 壁の面の飾り（腰の帯・コンセント・額）
  if (t === C.WALL && w.blocks[k * NB]) for (const b of list) wallFaceDetails(ctx, B, L, i, j, k, b);
  // 不透明のブロック: 同じ材質が縦に続く所をまとめて箱にする
  for (const b of list) {
    let q = 0;
    while (q < NB) {
      const m = w.blocks[k * NB + q];
      if (!m || m === M.GLASS || m === M.GLASSBROKEN || m === M.FENCE) { q++; continue; }
      let qe = q;
      while (qe + 1 < NB && w.blocks[k * NB + qe + 1] === m) qe++;
      const y0 = base + BLOCK_Y(q)[0], y1 = base + BLOCK_Y(qe)[1];
      wallBox(ctx, B, L, b, y0, y1, m, reinf);
      q = qe + 1;
    }
  }
}

// 1つの壁の箱の面（隠れる面は省く）
function wallBox(ctx, B, L, b, y0, y1, m, reinf) {
  const [x0, z0, x1, z1] = b;
  const eps = 0.002;
  const faces = [
    // [法線, 4点, 中心]
    { n: [1, 0, 0], p: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], u: (p) => -p[2] },
    { n: [-1, 0, 0], p: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], u: (p) => p[2] },
    { n: [0, 0, 1], p: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], u: (p) => p[0] },
    { n: [0, 0, -1], p: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], u: (p) => -p[0] },
    { n: [0, 1, 0], p: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], top: true },
    { n: [0, -1, 0], p: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], top: true },
  ];
  const long = b[4] === 0 ? [2, 3] : [0, 1]; // 部屋に向く長い面
  for (let fi = 0; fi < 6; fi++) {
    const f = faces[fi];
    // 見えるか: 面の中心と4隅の少し内側の点を、法線の向きに少し出して調べる
    const c = [0, 0, 0]; for (const p of f.p) { c[0] += p[0] / 4; c[1] += p[1] / 4; c[2] += p[2] / 4; }
    const pts = [c, ...f.p.map(p => [p[0] + (c[0] - p[0]) * 0.1, p[1] + (c[1] - p[1]) * 0.1, p[2] + (c[2] - p[2]) * 0.1])];
    let vis = false;
    for (const p of pts) if (!solidAt(ctx, p[0] + f.n[0] * eps, p[1] + f.n[1] * eps, p[2] + f.n[2] * eps)) { vis = true; break; }
    if (!vis) continue;
    let look, room;
    if (long.includes(fi)) {
      const sd = faceSide(ctx, L, c[0], c[2], f.n[0], f.n[2]);
      look = wallLook(ctx, m, sd.side, sd.room); room = sd.room;
    } else {
      look = wallLook(ctx, m, 'core', -1);
      const sd = f.top ? { room: -1 } : faceSide(ctx, L, c[0], c[2], f.n[0], f.n[2]);
      room = sd.room;
    }
    if (reinf && long.includes(fi)) look = [LAYER.metal, hex('#5d646b'), 1];
    const [layer, col, s] = look;
    B.room = Math.max(0, room);
    let uv;
    if (f.top) uv = f.p.flatMap(p => [p[0] * s, p[2] * s]);
    else uv = f.p.flatMap(p => [f.u(p) * s, p[1] * s]);
    B.quad(f.p[0], f.p[1], f.p[2], f.p[3], f.n, uv, layer, col);
  }
}

// 床の板のふち（穴・建物の外周）
function slabEdges(ctx, B, L, i0, j0, i1, j1) {
  const { w } = ctx;
  if (L === 0) return;
  const has = (i, j) => i >= 0 && j >= 0 && i < w.W && j < w.D && !!w.slab[w.idx(L, i, j)];
  const y0 = L * LH - (LH - CEIL), y1 = L * LH;
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    if (!has(i, j)) continue;
    const x0 = i * CS, x1 = (i + 1) * CS, z0 = j * CS, z1 = (j + 1) * CS;
    const k = w.idx(L, i, j);
    const ext = w.cell[k] === C.VOID || w.indoor[w.idx(L - 1, i, j)] === 2;
    const [layer, col, s] = ext ? [LAYER.concrete, ctx.ext.concrete, 0.5] : [LAYER.concrete, COL.concrete, 0.5];
    B.room = 0;
    if (!has(i + 1, j)) B.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [-z1 * s, y0 * s, -z0 * s, y0 * s, -z0 * s, y1 * s, -z1 * s, y1 * s], layer, col);
    if (!has(i - 1, j)) B.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [z0 * s, y0 * s, z1 * s, y0 * s, z1 * s, y1 * s, z0 * s, y1 * s], layer, col);
    if (!has(i, j + 1)) B.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [x0 * s, y0 * s, x1 * s, y0 * s, x1 * s, y1 * s, x0 * s, y1 * s], layer, col);
    if (!has(i, j - 1)) B.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [-x1 * s, y0 * s, -x0 * s, y0 * s, -x0 * s, y1 * s, -x1 * s, y1 * s], layer, col);
  }
  // 最上階の屋根のふち（と低い立ち上がり）
}
export function roofEdges(ctx, B, i0, j0, i1, j1) {
  const { w } = ctx;
  const L = w.NL - 1;
  const roofAt = (i, j) => {
    if (i < 0 || j < 0 || i >= w.W || j >= w.D) return false;
    const k = w.idx(L, i, j), t = w.cell[k];
    if (!(w.indoor[k] >= 1 || (isWallish(t) && w.indoor[k] === 2))) return false;
    return true;
  };
  const y0 = L * LH + CEIL, y1 = L * LH + LH, yp = y1 + 0.18;
  const col = ctx.ext.concrete, cap = hex('#8e8a84');
  B.room = 0;
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    if (!roofAt(i, j)) continue;
    const x0 = i * CS, x1 = (i + 1) * CS, z0 = j * CS, z1 = (j + 1) * CS, pw = 0.12;
    // 屋根のふちの立ち上がりと、上の笠木（少し広く明るい）
    const cw = 0.03, ch = 0.05;
    if (!roofAt(i + 1, j)) { B.box(x1 - pw, y0, z0, x1, yp, z1, LAYER.concrete, col, { faces: 1 | 2, uv: 0.5 }); B.bbox(x1 - pw - cw, yp, z0, x1 + cw, yp + ch, z1, 0.01, LAYER.concrete, cap, { faces: 1 | 2 | 4 | 8, uv: 0.5 }); }
    if (!roofAt(i - 1, j)) { B.box(x0, y0, z0, x0 + pw, yp, z1, LAYER.concrete, col, { faces: 1 | 2, uv: 0.5 }); B.bbox(x0 - cw, yp, z0, x0 + pw + cw, yp + ch, z1, 0.01, LAYER.concrete, cap, { faces: 1 | 2 | 4 | 8, uv: 0.5 }); }
    if (!roofAt(i, j + 1)) { B.box(x0, y0, z1 - pw, x1, yp, z1, LAYER.concrete, col, { faces: 16 | 32, uv: 0.5 }); B.bbox(x0, yp, z1 - pw - cw, x1, yp + ch, z1 + cw, 0.01, LAYER.concrete, cap, { faces: 16 | 32 | 4 | 8, uv: 0.5 }); }
    if (!roofAt(i, j - 1)) { B.box(x0, y0, z0, x1, yp, z0 + pw, LAYER.concrete, col, { faces: 16 | 32, uv: 0.5 }); B.bbox(x0, yp, z0 - cw, x1, yp + ch, z0 + pw + cw, 0.01, LAYER.concrete, cap, { faces: 16 | 32 | 4 | 8, uv: 0.5 }); }
  }
}

// 階段: 段の塊（下は詰まっている）と手すり
function stairMesh(ctx, B, s) {
  const { w } = ctx;
  const n = 16, base = s.L * LH;
  const k = w.idx(s.L, s.i0, s.j0);
  B.room = Math.max(0, w.roomAt[k]);
  const col = hex('#9c8f80'), side = hex('#b9b3a8');
  for (let q = 0; q < n; q++) {
    const t0 = q / n, t1 = (q + 1) / n, h = base + (q + 1) / n * LH;
    let x0, x1, z0, z1;
    if (s.dir === 'n') { x0 = s.x0; x1 = s.x1; z1 = s.z1 - t0 * (s.z1 - s.z0); z0 = s.z1 - t1 * (s.z1 - s.z0); }
    else if (s.dir === 's') { x0 = s.x0; x1 = s.x1; z0 = s.z0 + t0 * (s.z1 - s.z0); z1 = s.z0 + t1 * (s.z1 - s.z0); }
    else if (s.dir === 'e') { z0 = s.z0; z1 = s.z1; x0 = s.x0 + t0 * (s.x1 - s.x0); x1 = s.x0 + t1 * (s.x1 - s.x0); }
    else { z0 = s.z0; z1 = s.z1; x1 = s.x1 - t0 * (s.x1 - s.x0); x0 = s.x1 - t1 * (s.x1 - s.x0); }
    // 踏み面の前（蹴上げ）と上だけでなく横も（壁ぎわでも見えてよい）
    B.box(x0, base, z0, x1, h, z1, LAYER.concrete, col, { cols: [side, side, col, col, side, side], uv: 1 });
  }
  // 手すり（開いている側）
  const railY = 0.9;
  const along = s.dir === 'n' || s.dir === 's';
  const sides = along ? [[s.x0, -1], [s.x1, 1]] : [[s.z0, -1], [s.z1, 1]];
  for (const [c, sg] of sides) {
    // 外側のマスが床（開いている）なら手すり
    const ci = along ? Math.floor((c + sg * 0.25) / CS) : Math.floor(((s.x0 + s.x1) / 2) / CS);
    const cj = along ? Math.floor(((s.z0 + s.z1) / 2) / CS) : Math.floor((c + sg * 0.25) / CS);
    if (ci < 0 || cj < 0 || ci >= w.W || cj >= w.D) continue;
    const t = w.cell[w.idx(s.L, ci, cj)];
    if (isWallish(t)) continue;
    const off = -sg * 0.05;
    const a0 = s.dir === 'n' ? [c + off, base + LH + railY, s.z0] : s.dir === 's' ? [c + off, base + LH + railY, s.z1] : s.dir === 'e' ? [s.x1, base + LH + railY, c + off] : [s.x0, base + LH + railY, c + off];
    const a1 = s.dir === 'n' ? [c + off, base + railY, s.z1] : s.dir === 's' ? [c + off, base + railY, s.z0] : s.dir === 'e' ? [s.x0, base + railY, c + off] : [s.x1, base + railY, c + off];
    B.tube(a1, a0, 0.025, 0.025, 6, LAYER.metal, COL.metal);
    for (let q = 0; q <= 4; q++) { const t2 = q / 4; const p = [a1[0] + (a0[0] - a1[0]) * t2, a1[1] + (a0[1] - a1[1]) * t2, a1[2] + (a0[2] - a1[2]) * t2]; B.tube([p[0], p[1] - railY, p[2]], p, 0.018, 0.018, 5, LAYER.metal, COL.metal); }
  }
}

// 扉の枠（両面の額縁）
function doorFrame(ctx, B, d) {
  const base = d.L * LH, H = 2.08, wv = 0.08, pr = 0.014, r = 0.01;
  const col = d.mat === M.DOORMETAL ? hex('#8d9399') : ctx.doorTrim;
  B.room = 0;
  const th = d.th / 2 + pr;
  const ii = 0.012; // 開口の内側へ少し出す（壁の端の面と重ならないように）
  if (d.axis === 0) {
    const z0 = d.c - th, z1 = d.c + th;
    B.bbox(d.a0 - wv, base, z0, d.a0 + ii, base + H + wv, z1, r, LAYER.paint, col, { faces: 1 | 2 | 4 | 16 | 32 });
    B.bbox(d.a1 - ii, base, z0, d.a1 + wv, base + H + wv, z1, r, LAYER.paint, col, { faces: 1 | 2 | 4 | 16 | 32 });
    B.bbox(d.a0 + ii, base + H, z0, d.a1 - ii, base + H + wv, z1, r, LAYER.paint, col, { faces: 4 | 8 | 16 | 32 });
  } else {
    const x0 = d.c - th, x1 = d.c + th;
    B.bbox(x0, base, d.a0 - wv, x1, base + H + wv, d.a0 + ii, r, LAYER.paint, col, { faces: 1 | 2 | 4 | 16 | 32 });
    B.bbox(x0, base, d.a1 - ii, x1, base + H + wv, d.a1 + wv, r, LAYER.paint, col, { faces: 1 | 2 | 4 | 16 | 32 });
    B.bbox(x0, base + H, d.a0 + ii, x1, base + H + wv, d.a1 - ii, r, LAYER.paint, col, { faces: 4 | 8 | 1 | 2 });
  }
  // 照明のスイッチ（屋内の側、取っ手の側の壁）
  const w = ctx.w;
  const sa = d.a1 + wv + 0.09;
  const ci = d.axis === 0 ? Math.floor(sa / CS) : d.i0, cj = d.axis === 0 ? d.j0 : Math.floor(sa / CS);
  if (ci >= 0 && cj >= 0 && ci < w.W && cj < w.D && w.cell[w.idx(d.L, ci, cj)] === C.WALL && w.blocks[w.idx(d.L, ci, cj) * NB + 1]) {
    for (const sg of [1, -1]) {
      const fx = d.axis === 0 ? sa : d.c + sg * (d.th / 2 + 0.002), fz = d.axis === 0 ? d.c + sg * (d.th / 2 + 0.002) : sa;
      const sd = faceSide(ctx, d.L, fx, fz, d.axis === 0 ? 0 : sg, d.axis === 0 ? sg : 0);
      if (sd.side !== 'in') continue;
      B.room = Math.max(0, sd.room);
      plate(B, fx, base + 1.15, fz, d.axis === 0 ? 0 : sg, d.axis === 0 ? sg : 0, 0.075, 0.115, true);
    }
  }
}

// 壁に張る小さな板（スイッチ・コンセント）: 面の点 (x,y,z)、外向き (nx,nz)
function plate(B, x, y, z, nx, nz, wdt, hgt, sw) {
  const t = 0.01, hw = wdt / 2, hh = hgt / 2;
  const x0 = nx ? (nx > 0 ? x : x - t) : x - hw, x1 = nx ? (nx > 0 ? x + t : x) : x + hw;
  const z0 = nz ? (nz > 0 ? z : z - t) : z - hw, z1 = nz ? (nz > 0 ? z + t : z) : z + hw;
  B.bbox(x0, y - hh, z0, x1, y + hh, z1, 0.003, LAYER.plain, hex('#ecebe6'));
  const c = hex(sw ? '#d6d4cc' : '#55524c');
  if (sw) { const k = 0.02, x2 = nx ? x + nx * (t + 0.006) : x, z2 = nz ? z + nz * (t + 0.006) : z; B.box(Math.min(x, x2) - (nx ? 0 : k * 0.6), y - k, Math.min(z, z2) - (nz ? 0 : k * 0.6), Math.max(x, x2) + (nx ? 0 : k * 0.6), y + k, Math.max(z, z2) + (nz ? 0 : k * 0.6), LAYER.plain, c); }
  else for (const dy of [-0.025, 0.025]) { const k = 0.012, x2 = nx ? x + nx * (t + 0.002) : x, z2 = nz ? z + nz * (t + 0.002) : z; B.box(Math.min(x, x2) - (nx ? 0 : k), y + dy - k * 0.7, Math.min(z, z2) - (nz ? 0 : k), Math.max(x, x2) + (nx ? 0 : k), y + dy + k * 0.7, Math.max(z, z2) + (nz ? 0 : k), LAYER.plain, c); }
}

// 決まった乱数（マスと番号から）
function h3(i, j, k) { let h = (i * 374761393 + j * 668265263 + k * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// 壁の面の飾り: 屋外の1階は腰の帯（基礎）、屋内はコンセント・額・ポスター
function wallFaceDetails(ctx, B, L, i, j, k, b) {
  const { w } = ctx;
  const base = L * LH;
  const ax = b[4];
  const faces = ax === 0 ? [[0, -1, b[1]], [0, 1, b[3]]] : [[-1, 0, b[0]], [1, 0, b[2]]];
  const a0 = ax === 0 ? b[0] : b[1], a1 = ax === 0 ? b[2] : b[3];
  if (a1 - a0 < 0.2) return;
  const am = (a0 + a1) / 2;
  for (const [nx, nz, fp] of faces) {
    const fx = ax === 0 ? am : fp, fz = ax === 0 ? fp : am;
    const sd = faceSide(ctx, L, fx, fz, nx, nz);
    // その面の前のマスが床か（壁のあいだの細い所でない）
    if (sd.side === 'out') {
      if (L !== 0 || sd.room < 0 && w.cell[w.idx(L, i, j)] === C.VOID) continue;
      // 基礎の帯（30cm・2.5cm張り出す）
      const pr = 0.025, hgt = 0.3;
      B.room = 0;
      if (ax === 0) { const z0 = nz > 0 ? fp : fp - pr, z1 = nz > 0 ? fp + pr : fp; B.bbox(a0, base - 0.02, z0, a1, base + hgt, z1, 0.008, LAYER.concrete, ctx.plinth, { faces: 4 | 16 | 32 }); }
      else { const x0 = nx > 0 ? fp : fp - pr, x1 = nx > 0 ? fp + pr : fp; B.bbox(x0, base - 0.02, a0, x1, base + hgt, a1, 0.008, LAYER.concrete, ctx.plinth, { faces: 1 | 2 | 4 }); }
      continue;
    }
    if (sd.side !== 'in' || sd.room < 0) continue;
    const room = w.rooms[sd.room];
    if (!room || room.cells.length < 10) continue;
    B.room = sd.room;
    // 前に背の高い家具がないか
    const px = fx + nx * 0.35, pz = fz + nz * 0.35;
    const blocked = w.props.some(p => p.L === L && p.h > 1.1 && Math.abs(p.x - px) < p.w / 2 + 0.3 && Math.abs(p.z - pz) < p.d / 2 + 0.3);
    const hv = h3(i * 2 + (nx + nz > 0 ? 1 : 0), j, L * 7 + 3);
    // コンセント（9マスに1つくらい、腰より下）
    if (hv < 0.11 && a1 - a0 > 0.4) plate(B, fx + nx * 0.001, base + 0.3, fz + nz * 0.001, nx, nz, 0.07, 0.11, false);
    // 額・ポスター（25マスに1つくらい、目の高さ。部屋ごとの色合い）
    else if (hv > 0.955 && !blocked && a1 - a0 > 0.45 && w.blocks[k * NB + 2]) picture(ctx, B, fx, base + 1.55, fz, nx, nz, hv, sd.room);
  }
}

// 額（絵）とポスター
function picture(ctx, B, x, y, z, nx, nz, hv, room) {
  const pr = 0.025, hw = 0.26 + (hv * 37 % 1) * 0.12, hh = 0.2 + (hv * 53 % 1) * 0.1;
  const frame = [hex('#2b2622'), hex('#6b4a2c'), hex('#d9d4c8'), hex('#1d1e20')][Math.floor(hv * 997) % 4];
  const bx = (a0, a1, y0, y1, d0, d1, col, r = 0.004) => {
    if (nx) { const x0 = x + nx * d0, x1 = x + nx * d1; B.bbox(Math.min(x0, x1), y0, z + a0, Math.max(x0, x1), y1, z + a1, r, LAYER.plain, col); }
    else { const z0 = z + nz * d0, z1 = z + nz * d1; B.bbox(x + a0, y0, Math.min(z0, z1), x + a1, y1, Math.max(z0, z1), r, LAYER.plain, col); }
  };
  bx(-hw, hw, y - hh, y + hh, 0.001, pr, frame, 0.006);
  // 絵: 空・地面・ひとつの形（風景）か、色の帯（抽象）
  const pal = [['#8fb3d1', '#6f8f4e', '#d8c27a'], ['#d9c9a8', '#a9583d', '#3e4a5c'], ['#c7d3d6', '#59707a', '#e0e0d8'], ['#2f3e55', '#c99a4a', '#e8dcc2']][Math.floor(hv * 4091) % 4].map(hex);
  const m = 0.035, d = pr + 0.002;
  bx(-hw + m, hw - m, y - hh + m, y + hh - m, pr, d, pal[0], 0.001);
  bx(-hw + m, hw - m, y - hh + m, y - hh * 0.15, pr, d + 0.001, pal[1], 0.001);
  const c0 = (hv * 211 % 1 - 0.5) * hw;
  bx(c0 - hw * 0.25, c0 + hw * 0.25, y - hh * 0.15, y + hh * 0.35, pr, d + 0.002, pal[2], 0.001);
}

// 窓台
function windowSills(ctx, B, L, b, along, cx, cz, y0, y1, endP, endN, i, j) {
  const ex0 = endP ? 0.05 : 0, ex1 = endN ? 0.05 : 0;
  for (const sg of [1, -1]) {
    const nx = along ? 0 : sg, nz = along ? sg : 0;
    const fp = along ? (sg > 0 ? b[3] : b[1]) : (sg > 0 ? b[2] : b[0]);
    const sd = faceSide(ctx, L, along ? cx : fp, along ? fp : cz, nx, nz);
    const out = sd.side === 'out';
    const pr = out ? 0.07 : 0.04, hgt = out ? 0.055 : 0.03;
    const col = out ? ctx.sill : ctx.trimIn;
    B.room = out ? 0 : Math.max(0, sd.room);
    if (along) { const z0 = sg > 0 ? fp : fp - pr, z1 = sg > 0 ? fp + pr : fp; B.bbox(b[0] - ex0, y0 - hgt - 0.02, z0, b[2] + ex1, y0 - 0.02, z1, 0.008, out ? LAYER.concrete : LAYER.paint, col); }
    else { const x0 = sg > 0 ? fp : fp - pr, x1 = sg > 0 ? fp + pr : fp; B.bbox(x0, y0 - hgt - 0.02, b[1] - ex0, x1, y0 - 0.02, b[3] + ex1, 0.008, out ? LAYER.concrete : LAYER.paint, col); }
    // カーテン（住まいの部屋の内側、窓のはし）
    if (!out && sd.room >= 0 && ctx.homey[sd.room] && (endP || endN)) {
      const cc = ctx.curtain[sd.room];
      const top = y1 + 0.12, bot = Math.max(L * LH + 0.05, y0 - 0.25);
      const off = 0.07;
      for (const [isEnd, a] of [[endP, along ? b[0] : b[1]], [endN, along ? b[2] : b[3]]]) {
        if (!isEnd) continue;
        const inward = a === (along ? b[0] : b[1]) ? 1 : -1;
        const p0 = a - inward * 0.05, p1 = a + inward * 0.2;
        if (along) { const z0 = sg > 0 ? fp + off - 0.03 : fp - off - 0.03; B.bbox(Math.min(p0, p1), bot, z0, Math.max(p0, p1), top, z0 + 0.06, 0.025, LAYER.fabric, cc); }
        else { const x0 = sg > 0 ? fp + off - 0.03 : fp - off - 0.03; B.bbox(x0, bot, Math.min(p0, p1), x0 + 0.06, top, Math.max(p0, p1), 0.025, LAYER.fabric, cc); }
      }
    }
  }
}

// 天井の照明の器具
function fixture(ctx, B, x, z, L, kind) {
  const y = L * LH + CEIL;
  B.room = 0;
  if (kind === 'fluo' || kind === 'spot') {
    B.emit = 1;
    B.box(x - 0.3, y - 0.035, z - 0.6, x + 0.3, y, z + 0.6, LAYER.plain, hex('#fffaf0'), { faces: 8 });
    B.emit = 0;
    B.box(x - 0.32, y - 0.04, z - 0.62, x + 0.32, y - 0.001, z + 0.62, LAYER.metal, hex('#d8d8d4'), { faces: 1 | 2 | 16 | 32 });
  } else if (kind === 'street') {
    // 街灯は家具（lamp）が持つ
  } else {
    B.emit = 1;
    B.cyl(x, z, y - 0.09, y - 0.02, 0.13, 0.16, 8, LAYER.plain, kind === 'red' ? hex('#ff4030') : hex('#ffe6c0'), { capT: false, capB: true });
    B.emit = 0;
    B.cyl(x, z, y - 0.02, y, 0.04, 0.04, 6, LAYER.metal, COL.metal);
  }
}

// 扉の板（ローカル: x=蝶番から先端へ 0..len、y=0..2.06、z=厚さ）
export function doorLeafMesh(ctx, d, li) {
  const B = new MeshBuilder();
  const lf = d.leaves[li];
  const len = lf.len, H = 2.06, t = 0.045;
  const metal = d.mat === M.DOORMETAL;
  const col = metal ? COL.doorMetal : ctx.doorCol;
  const layer = metal ? LAYER.metal : LAYER.wood;
  B.box(0.01, 0, -t / 2, len, H, t / 2, layer, col, { uv: 1 });
  if (!metal) {
    // 板の飾り（4枚の浅い枠）
    const dk = mulc(col, 0.82);
    for (const sz of [1, -1]) {
      const z0 = sz * t / 2, z1 = z0 + sz * 0.006;
      for (const [a, b2] of [[0.25, 0.95], [1.1, 1.85]]) {
        B.box(0.12, a, Math.min(z0, z1), len - 0.12, a + 0.03, Math.max(z0, z1), layer, dk);
        B.box(0.12, b2 - 0.03, Math.min(z0, z1), len - 0.12, b2, Math.max(z0, z1), layer, dk);
        B.box(0.12, a, Math.min(z0, z1), 0.15, b2, Math.max(z0, z1), layer, dk);
        B.box(len - 0.15, a, Math.min(z0, z1), len - 0.12, b2, Math.max(z0, z1), layer, dk);
      }
    }
  } else {
    // 押し棒
    B.box(0.1, 0.98, t / 2, len - 0.08, 1.04, t / 2 + 0.05, LAYER.metal, hex('#b0b4b8'));
  }
  // 取っ手（両側）
  const hc = hex('#c8c2b0');
  for (const sz of [1, -1]) {
    B.box(len - 0.12, 0.96, sz > 0 ? t / 2 : -t / 2 - 0.05, len - 0.1, 1.0, sz > 0 ? t / 2 + 0.05 : -t / 2, LAYER.metal, hc);
    B.box(len - 0.2, 0.96, sz > 0 ? t / 2 + 0.04 : -t / 2 - 0.06, len - 0.1, 0.995, sz > 0 ? t / 2 + 0.06 : -t / 2 - 0.04, LAYER.metal, hc);
  }
  return B;
}

// バリケード（板を打ちつけた扉）: 扉の開口の幅で、扉の手前に
export function barricadeMesh(d) {
  const B = new MeshBuilder();
  const w0 = d.a1 - d.a0;
  const wood = hex('#a07a4e');
  const planks = [0.25, 0.55, 0.85, 1.15, 1.45, 1.75];
  planks.forEach((y, n) => {
    const tilt = (n % 2 ? 0.06 : -0.05);
    B.box(-0.06, y - 0.07 + tilt * 0.2, -0.025, w0 + 0.06, y + 0.07 + tilt * 0.2, 0.025, LAYER.wood, mulc(wood, 0.85 + (n % 3) * 0.08));
  });
  B.box(0.02, 0, -0.05, 0.1, 2.0, -0.02, LAYER.wood, mulc(wood, 0.7));
  B.box(w0 - 0.1, 0, -0.05, w0 - 0.02, 2.0, -0.02, LAYER.wood, mulc(wood, 0.7));
  return B;
}
