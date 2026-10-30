// マップを組み立てて、当たり・視線・弾の通り道を調べる（DOMなし。ホストとゲストで同じ結果になる）
// 座標: メートル。マス (i, j) の中心は x = (i+0.5)*CS, z = (j+0.5)*CS。階 L の床は y = L*LH。
// 壁はマスの中央の板。高さ方向に4つのブロック（0.7mずつ、上の端は天井 2.8m）。
import { M, MATS, F } from './data/materials.js';
import { PROPS } from './data/props.js';

export const CS = 0.5, LH = 3.0, CEIL = 2.8, BH = 0.7, NB = 4, SLAB = 0.2, STEP = 0.36;

// マスの種類
export const C = { VOID: 0, FLOOR: 1, OUT: 2, WALL: 3, DOOR: 4, WINDOW: 5, GLASSWALL: 6, OPEN: 7, LOW: 8, FENCE: 9, STAIR: 10 };
const WALLISH = new Set([C.WALL, C.DOOR, C.WINDOW, C.GLASSWALL, C.OPEN, C.LOW, C.FENCE]);
export const isWallish = (t) => WALLISH.has(t);

// 文字 → [種類, 材質(壁) or 床の材質]
const FLOOR_CH = { '.': -1, ':': F.TILE, '_': F.WOOD, '~': F.CARPET, '-': F.CONCRETE, 'm': F.METAL };
const OUT_CH = { ',': F.ASPHALT, ';': F.GRASS, '`': F.DIRT, '"': F.CONCRETE };
const WALL_CH = { '#': M.BRICK, 'C': M.CONCRETE, '=': M.DRYWALL, 'W': M.WOOD };

export function compileMap(def) {
  const levels = def.levels;
  const NL = levels.length;
  const D = Math.max(...levels.map(l => l.rows.length));
  const W = Math.max(...levels.map(l => Math.max(...l.rows.map(r => r.length))));
  const N = NL * W * D;
  const w = {
    id: def.id, def, NL, W, D, N,
    cell: new Uint8Array(N), floorMat: new Uint8Array(N), wallMat: new Uint8Array(N),
    indoor: new Uint8Array(N), slab: new Uint8Array(N), // slab[L] = 階Lの床の板があるか（L=0は地面）
    arms: new Uint8Array(N), thick: new Float32Array(N),
    boxes: new Float32Array(N * 8), nbox: new Uint8Array(N),
    blocks0: new Uint8Array(N * NB), blocks: null, bhp: null,
    stairs: [], stairAt: new Int16Array(N).fill(-1),
    doors: [], doorAt: new Int16Array(N).fill(-1), doorNear: new Map(),
    windows: [],
    props: [], propNear: new Map(),
    rooms: [], roomAt: new Int16Array(N).fill(-1),
    errors: [],
  };
  const idx = (L, i, j) => (L * D + j) * W + i;
  w.idx = idx;
  const ch = (L, i, j) => { if (L < 0 || L >= NL || i < 0 || j < 0 || i >= W || j >= D) return ' '; const r = levels[L].rows[j]; return (r && r[i]) || ' '; };
  const defFloor = def.floor || F.TILE;
  // 1) マスの種類
  for (let L = 0; L < NL; L++) for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    const c = ch(L, i, j), k = idx(L, i, j);
    if (c in FLOOR_CH) { w.cell[k] = C.FLOOR; w.floorMat[k] = FLOOR_CH[c] < 0 ? defFloor : FLOOR_CH[c]; w.indoor[k] = 1; }
    else if (c in OUT_CH) { w.cell[k] = C.OUT; w.floorMat[k] = OUT_CH[c]; }
    else if (c in WALL_CH) { w.cell[k] = C.WALL; w.wallMat[k] = WALL_CH[c]; }
    else if (c === 'D') { w.cell[k] = C.DOOR; w.wallMat[k] = M.DOORWOOD; }
    else if (c === 'M') { w.cell[k] = C.DOOR; w.wallMat[k] = M.DOORMETAL; }
    else if (c === 'O') { w.cell[k] = C.OPEN; }
    else if (c === 'G') { w.cell[k] = C.WINDOW; }
    else if (c === 'g') { w.cell[k] = C.GLASSWALL; }
    else if (c === 'L') { w.cell[k] = C.LOW; w.wallMat[k] = M.CONCRETE; }
    else if (c === 'F') { w.cell[k] = C.FENCE; w.wallMat[k] = M.FENCE; }
    else if (c === 'S') { w.cell[k] = C.STAIR; w.indoor[k] = 1; w.floorMat[k] = F.WOOD; }
    else if (c !== ' ') w.errors.push(`知らない文字 '${c}' (${L},${i},${j})`);
  }
  const T = (L, i, j) => (L < 0 || L >= NL || i < 0 || j < 0 || i >= W || j >= D) ? C.VOID : w.cell[idx(L, i, j)];
  // 壁の材質のない壁マス（扉・窓・開口）は、壁の線の隣から材質と厚さをもらう
  const nbWallMat = (L, i, j) => {
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [3, 0], [-3, 0], [0, 3], [0, -3]]) {
      const t = T(L, i + di, j + dj);
      if (t === C.WALL) return w.wallMat[idx(L, i + di, j + dj)];
    }
    return M.DRYWALL;
  };
  // 屋内に面しているか
  const nearIndoor = (L, i, j) => { for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = T(L, i + di, j + dj); if (t === C.FLOOR || t === C.STAIR) return true; } return false; };
  // 2) 床の材質（壁マス・扉マスの床は隣の床から）
  for (let L = 0; L < NL; L++) for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    const k = idx(L, i, j), t = w.cell[k];
    if (isWallish(t)) {
      let fm = 0, ind = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t2 = T(L, i + di, j + dj); if (t2 === C.FLOOR || t2 === C.OUT || t2 === C.STAIR) { const k2 = idx(L, i + di, j + dj); if (!fm || t2 === C.FLOOR) fm = w.floorMat[k2]; if (t2 === C.FLOOR || t2 === C.STAIR) ind = 1; } }
      w.floorMat[k] = fm || F.CONCRETE;
      w.indoor[k] = ind ? 2 : 0; // 2 = 屋内に面した壁（天井の板がある）
      if (!w.wallMat[k]) w.wallMat[k] = nbWallMat(L, i, j);
    }
  }
  // 3) 階段
  for (const sd of (def.stairs || [])) {
    const s = { id: w.stairs.length, i0: sd.i, j0: sd.j, w: sd.w, len: sd.len, dir: sd.dir, L: sd.L || 0 };
    // 上がる向き: 'n' = -z, 's' = +z, 'e' = +x, 'w' = -x
    const alongX = s.dir === 'e' || s.dir === 'w';
    s.iw = alongX ? s.len : s.w; s.jw = alongX ? s.w : s.len;
    s.x0 = s.i0 * CS; s.z0 = s.j0 * CS; s.x1 = (s.i0 + s.iw) * CS; s.z1 = (s.j0 + s.jw) * CS;
    for (let jj = 0; jj < s.jw; jj++) for (let ii = 0; ii < s.iw; ii++) {
      const i = s.i0 + ii, j = s.j0 + jj;
      if (T(s.L, i, j) !== C.STAIR) w.errors.push(`階段の範囲が 'S' ではない (${s.L},${i},${j})`);
      w.stairAt[idx(s.L, i, j)] = s.id;
      if (s.L + 1 < NL) { if (T(s.L + 1, i, j) !== C.STAIR) w.errors.push(`階段の上の階が 'S' ではない (${s.L + 1},${i},${j})`); w.stairAt[idx(s.L + 1, i, j)] = s.id; }
    }
    w.stairs.push(s);
  }
  // 4) 床の板: 階L（L>=1）は、その階の床・壁、または下の階が屋内なら板がある。階段の吹き抜けは除く
  for (let L = 0; L < NL; L++) for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    const k = idx(L, i, j);
    if (L === 0) { w.slab[k] = w.cell[k] !== C.VOID ? 1 : 0; continue; }
    const t = w.cell[k];
    const st = w.stairAt[k] >= 0 && w.stairs[w.stairAt[k]].L === L - 1;
    if (st) { w.slab[k] = 0; continue; }
    const below = idx(L - 1, i, j);
    const belowIndoor = w.cell[below] === C.FLOOR || w.indoor[below] === 2 || w.cell[below] === C.STAIR;
    w.slab[k] = (t !== C.VOID && t !== C.STAIR) || belowIndoor ? 1 : 0;
  }
  // 最上階より上の屋根: 最上階の屋内マス（roof()で判定）
  // 5) 壁の腕と厚さと箱
  for (let L = 0; L < NL; L++) for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    const k = idx(L, i, j), t = w.cell[k];
    if (!isWallish(t)) continue;
    let arms = 0;
    const dirs = [[1, 0, 1], [-1, 0, 2], [0, 1, 4], [0, -1, 8]];
    for (const [di, dj, bit] of dirs) { if (isWallish(T(L, i + di, j + dj))) arms |= bit; }
    // 扉は壁の線に沿う向きだけつなぐ
    if (t === C.DOOR || t === C.OPEN) {
      const xLine = (T(L, i - 1, j) !== C.VOID && isWallish(T(L, i - 1, j))) || (isWallish(T(L, i + 1, j)));
      const zLine = isWallish(T(L, i, j - 1)) || isWallish(T(L, i, j + 1));
      if (xLine && !(zLine && !xLine)) arms &= 3; else if (zLine) arms &= 12;
    }
    w.arms[k] = arms;
    let th = MATS[w.wallMat[k]].thick || 0.12;
    if (t === C.LOW) th = 0.3;
    if (t === C.FENCE) th = 0.05;
    if (t === C.DOOR || t === C.OPEN || t === C.WINDOW || t === C.GLASSWALL) th = MATS[nbWallMat(L, i, j)].thick || 0.12;
    w.thick[k] = th;
  }
  // 腕の幅は、両側の厚さの小さい方
  for (let L = 0; L < NL; L++) for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    const k = idx(L, i, j);
    if (!isWallish(w.cell[k])) continue;
    const th = w.thick[k], cx = (i + 0.5) * CS, cz = (j + 0.5) * CS, h = th / 2;
    const a = w.arms[k];
    const thN = (di, dj) => { const k2 = idx(L, i + di, j + dj); return Math.min(th, w.thick[k2] || th); };
    let n = 0;
    const put = (x0, z0, x1, z1) => { const o = k * 8 + n * 4; w.boxes[o] = x0; w.boxes[o + 1] = z0; w.boxes[o + 2] = x1; w.boxes[o + 3] = z1; n++; };
    const ax = a & 3, az = a & 12;
    if (ax || !az) {
      // X方向の板（両腕・片腕・柱だけ）
      const hx = ax ? Math.min(th, (a & 1) ? thN(1, 0) : th, (a & 2) ? thN(-1, 0) : th) / 2 : h;
      const x0 = (a & 2) ? i * CS : cx - h, x1 = (a & 1) ? (i + 1) * CS : cx + h;
      put(x0, cz - (ax ? hx : h), x1, cz + (ax ? hx : h));
    }
    if (az) {
      const hz = Math.min(th, (a & 4) ? thN(0, 1) : th, (a & 8) ? thN(0, -1) : th) / 2;
      const z0 = (a & 8) ? j * CS : cz - h, z1 = (a & 4) ? (j + 1) * CS : cz + h;
      put(cx - hz, z0, cx + hz, z1);
    }
    w.nbox[k] = n;
  }
  // 6) ブロックの材質
  for (let L = 0; L < NL; L++) for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    const k = idx(L, i, j), t = w.cell[k], b = k * NB;
    const wm = w.wallMat[k];
    if (t === C.WALL) for (let q = 0; q < NB; q++) w.blocks0[b + q] = wm;
    else if (t === C.DOOR || t === C.OPEN) { w.blocks0[b + 3] = nbWallMat(L, i, j); }
    else if (t === C.WINDOW) { const m = nbWallMat(L, i, j); w.blocks0[b] = m; w.blocks0[b + 1] = M.GLASS; w.blocks0[b + 2] = M.GLASS; w.blocks0[b + 3] = m; }
    else if (t === C.GLASSWALL) { w.blocks0[b] = M.GLASS; w.blocks0[b + 1] = M.GLASS; w.blocks0[b + 2] = M.GLASS; w.blocks0[b + 3] = nbWallMat(L, i, j); }
    else if (t === C.LOW) { w.blocks0[b] = M.CONCRETE; }
    else if (t === C.FENCE) { w.blocks0[b] = M.FENCE; w.blocks0[b + 1] = M.FENCE; w.blocks0[b + 2] = M.FENCE; }
    // 外に面した（屋内に面していない）壁は上のブロックを省く（塀など）。ただし屋内に面した壁は天井まで
    if (t === C.WALL && !nearIndoor(L, i, j) && !(def.tallOutside)) {
      // 屋外の塀: 2.1m（3ブロック）
      if (!isIndoorWallLine(w, L, i, j, T, idx)) w.blocks0[b + 3] = 0;
    }
  }
  w.blocks = w.blocks0.slice();
  w.bhp = new Uint16Array(N * NB);
  for (let q = 0; q < N * NB; q++) w.bhp[q] = MATS[w.blocks[q]] ? MATS[w.blocks[q]].hp : 0;
  // 7) 扉（2マス＝片開き、4マス＝両開き）
  const seen = new Uint8Array(N);
  const dOpts = def.doors || {};
  for (let L = 0; L < NL; L++) for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    const k = idx(L, i, j);
    if (w.cell[k] !== C.DOOR || seen[k]) continue;
    // 並びの向き
    let axis = -1, n = 0;
    if (T(L, i + 1, j) === C.DOOR) { axis = 0; while (T(L, i + n, j) === C.DOOR) { seen[idx(L, i + n, j)] = 1; n++; } }
    else if (T(L, i, j + 1) === C.DOOR) { axis = 1; while (T(L, i, j + n) === C.DOOR) { seen[idx(L, i, j + n)] = 1; n++; } }
    else { w.errors.push(`扉が1マスしかない (${L},${i},${j})`); seen[k] = 1; continue; }
    if (n !== 2 && n !== 4) w.errors.push(`扉の幅は2か4マス (${L},${i},${j}, ${n})`);
    const o = dOpts[`${i},${j},${L}`] || {};
    const d = { id: w.doors.length, L, axis, i0: i, j0: j, n, mat: w.wallMat[k], double: n >= 4, opt: o, cells: [] };
    for (let q = 0; q < n; q++) { const kk = axis === 0 ? idx(L, i + q, j) : idx(L, i, j + q); d.cells.push(kk); w.doorAt[kk] = d.id; }
    // 開口の両端（壁の中心線上）
    const a0 = axis === 0 ? i * CS : j * CS, a1 = a0 + n * CS, c = axis === 0 ? (j + 0.5) * CS : (i + 0.5) * CS;
    d.a0 = a0; d.a1 = a1; d.c = c;
    d.th = w.thick[k];
    // 扉の板: 蝶番の位置と、蝶番から先端への向き（閉じた状態）
    const hingeB = o.hinge === 'b';
    const leaf = (from, dir) => { const lf = { hx: axis === 0 ? from : c, hz: axis === 0 ? c : from, dx: axis === 0 ? dir : 0, dz: axis === 0 ? 0 : dir, len: (n >= 4 ? (n * CS) / 2 : n * CS) - 0.04 }; const nx = axis === 0 ? 0 : 1, nz = axis === 0 ? 1 : 0; lf.s = Math.sign(lf.dx * nz - lf.dz * nx) || 1; return lf; };
    if (d.double) d.leaves = [leaf(a0 + 0.02, 1), leaf(a1 - 0.02, -1)];
    else d.leaves = [hingeB ? leaf(a1 - 0.02, -1) : leaf(a0 + 0.02, 1)];
    // 扉の法線（開く向きの基準）: axis 0 → ±z、axis 1 → ±x
    d.nx = axis === 0 ? 0 : 1; d.nz = axis === 0 ? 1 : 0;
    d.cx = axis === 0 ? (a0 + a1) / 2 : c; d.cz = axis === 0 ? c : (a0 + a1) / 2;
    w.doors.push(d);
    // 板が通る範囲のマスに登録
    for (const lf of d.leaves) {
      const R = lf.len + 0.1;
      for (let jj = Math.floor((lf.hz - R) / CS); jj <= Math.floor((lf.hz + R) / CS); jj++) for (let ii = Math.floor((lf.hx - R) / CS); ii <= Math.floor((lf.hx + R) / CS); ii++) {
        if (ii < 0 || jj < 0 || ii >= W || jj >= D) continue;
        const kk = idx(L, ii, jj);
        let arr = w.doorNear.get(kk); if (!arr) w.doorNear.set(kk, arr = []);
        if (!arr.includes(d.id)) arr.push(d.id);
      }
    }
  }
  // 8) 窓（ガラスのブロックを持つマス）
  for (let L = 0; L < NL; L++) for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    const k = idx(L, i, j);
    if (w.cell[k] === C.WINDOW || w.cell[k] === C.GLASSWALL) w.windows.push(k);
  }
  // 9) 家具
  for (const p of (def.props || [])) addProp(w, p);
  // 10) 部屋（床のつながり。扉・開口・窓で区切る）
  buildRooms(w, def);
  w.layers = NL;
  return w;
}

function isIndoorWallLine(w, L, i, j, T, idx) {
  // 壁の線をたどって、どこかで屋内に面していれば建物の壁（天井まで）
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let s = 1; s <= 6; s++) {
      const t = T(L, i + di * s, j + dj * s);
      if (!isWallish(t)) break;
      for (const [ei, ej] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t2 = T(L, i + di * s + ei, j + dj * s + ej); if (t2 === C.FLOOR || t2 === C.STAIR) return true; }
    }
  }
  return false;
}

// 家具を置く: [種類, x(マス), z(マス), 階, 向き(0..3), {w,d,h, color, ...}]
export function addProp(w, p) {
  const [type, xc, zc, L = 0, rot = 0, o = {}] = p;
  const P = PROPS[type];
  if (!P) { w.errors.push('知らない家具 ' + type); return null; }
  const sx = o.w ? o.w / P.w : 1, sz = o.d ? o.d / P.d : 1, sy = o.h ? o.h / P.h : 1;
  const x = xc * CS, z = zc * CS, y = L * LH + (o.y || 0);
  const r = ((rot % 4) + 4) % 4;
  const boxes = P.boxes.map(b => {
    let [x0, y0, z0, x1, y1, z1, m] = b;
    x0 *= sx; x1 *= sx; z0 *= sz; z1 *= sz; y0 *= sy; y1 *= sy;
    // 90°ずつ回す
    let X0 = x0, X1 = x1, Z0 = z0, Z1 = z1;
    if (r === 1) { X0 = -z1; X1 = -z0; Z0 = x0; Z1 = x1; }
    else if (r === 2) { X0 = -x1; X1 = -x0; Z0 = -z1; Z1 = -z0; }
    else if (r === 3) { X0 = z0; X1 = z1; Z0 = -x1; Z1 = -x0; }
    return [x + X0, y + y0, z + Z0, x + X1, y + y1, z + Z1, m];
  });
  const fw = (P.foot ? P.foot[0] : P.w) * sx, fd = (P.foot ? P.foot[1] : P.d) * sz;
  const fx = (r % 2) ? fd : fw, fz = (r % 2) ? fw : fd;
  const prop = { id: w.props.length, type, x, y, z, L, rot: r, sx, sy, sz, w: fx, d: fz, h: P.h * sy, boxes, solid: !!P.solid, vault: !!P.vault, hide: P.hide || null, opt: o, alive: true };
  w.props.push(prop);
  const R = 0.05;
  for (let j = Math.floor((z - fz / 2 - R) / CS); j <= Math.floor((z + fz / 2 + R) / CS); j++) for (let i = Math.floor((x - fx / 2 - R) / CS); i <= Math.floor((x + fx / 2 + R) / CS); i++) {
    if (i < 0 || j < 0 || i >= w.W || j >= w.D) continue;
    const k = w.idx(L, i, j);
    let arr = w.propNear.get(k); if (!arr) w.propNear.set(k, arr = []);
    arr.push(prop.id);
  }
  return prop;
}

function buildRooms(w, def) {
  const { W, D, NL } = w;
  const named = def.rooms || [];
  for (let L = 0; L < NL; L++) for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    const k = w.idx(L, i, j);
    const t = w.cell[k];
    if (w.roomAt[k] >= 0 || !(t === C.FLOOR || t === C.OUT || t === C.STAIR)) continue;
    const id = w.rooms.length, out = t === C.OUT;
    const room = { id, L, out, cells: [], name: null, en: null, x0: 1e9, z0: 1e9, x1: -1e9, z1: -1e9 };
    const stack = [[i, j]];
    w.roomAt[k] = id;
    while (stack.length) {
      const [ci, cj] = stack.pop();
      const kk = w.idx(L, ci, cj);
      room.cells.push(kk);
      room.x0 = Math.min(room.x0, ci); room.x1 = Math.max(room.x1, ci); room.z0 = Math.min(room.z0, cj); room.z1 = Math.max(room.z1, cj);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= D) continue;
        const k2 = w.idx(L, ni, nj), t2 = w.cell[k2];
        if (w.roomAt[k2] >= 0) continue;
        if ((t2 === C.OUT) !== out) continue;
        if (!(t2 === C.FLOOR || t2 === C.OUT || t2 === C.STAIR)) continue;
        w.roomAt[k2] = id; stack.push([ni, nj]);
      }
    }
    room.cx = ((room.x0 + room.x1 + 1) / 2) * CS; room.cz = ((room.z0 + room.z1 + 1) / 2) * CS;
    w.rooms.push(room);
  }
  for (const [name, en, i, j, L = 0] of named) {
    const k = w.idx(L, i, j), r = w.roomAt[k];
    if (r < 0) { w.errors.push(`部屋の名前の位置が床ではない: ${name} (${L},${i},${j})`); continue; }
    w.rooms[r].name = name; w.rooms[r].en = en;
  }
  let n = 1;
  for (const r of w.rooms) if (!r.name) { r.name = r.out ? '屋外' : `部屋${n}`; r.en = r.out ? 'OUTSIDE' : `ROOM ${n}`; if (!r.out) n++; }
}

// ---- 調べる道具 ----
export function cellOf(w, x, z) { return [Math.floor(x / CS), Math.floor(z / CS)]; }
export function levelOfY(y) { return Math.max(0, Math.floor((y + 0.4) / LH)); }
export function inMap(w, i, j) { return i >= 0 && j >= 0 && i < w.W && j < w.D; }
export function cellType(w, L, i, j) { if (L < 0 || L >= w.NL || !inMap(w, i, j)) return C.VOID; return w.cell[w.idx(L, i, j)]; }

// 階段の坂の高さ（その階段の上にいるとき）
export function stairHeight(w, s, x, z) {
  let t;
  if (s.dir === 'n') t = (s.z1 - z) / (s.z1 - s.z0);
  else if (s.dir === 's') t = (z - s.z0) / (s.z1 - s.z0);
  else if (s.dir === 'e') t = (x - s.x0) / (s.x1 - s.x0);
  else t = (s.x1 - x) / (s.x1 - s.x0);
  t = Math.max(0, Math.min(1, t));
  return s.L * LH + t * LH;
}

// 足元の高さ: y（足の高さ）から STEP 以内で上にある、いちばん高い床
export function groundAt(w, x, z, y) {
  const i = Math.floor(x / CS), j = Math.floor(z / CS);
  if (!inMap(w, i, j)) return -100;
  let best = -100;
  for (let L = 0; L < w.NL; L++) {
    const k = w.idx(L, i, j);
    const s = w.stairAt[k];
    if (s >= 0 && w.stairs[s].L === L) {
      const h = stairHeight(w, w.stairs[s], x, z);
      if (h <= y + STEP + 0.02) { if (h > best) best = h; }
      else if (L * LH <= y + STEP && L * LH > best) best = L * LH; // 坂の下に入りこんだ（押し出されるまで床に立つ）
      continue;
    }
    if (s >= 0 && w.stairs[s].L === L - 1) continue; // 吹き抜け
    if (w.slab[k] || (L === 0 && w.cell[k] !== C.VOID)) {
      const h = L * LH;
      if (h <= y + STEP && h > best) best = h;
    }
  }
  return best;
}

// 円（半径r、高さ y0..y1）が壁・家具・扉にめり込んでいたら押し出す。戻り値: 押し出した量 [dx, dz, 当たったか]
export function pushOut(w, x, z, y0, y1, r, doorsState, ignoreProp = -1, out = [0, 0, 0]) {
  let px = x, pz = z, hit = 0, pm = 0, pass = 0;
  const i0 = Math.floor((x - r - 0.3) / CS), i1 = Math.floor((x + r + 0.3) / CS);
  const j0 = Math.floor((z - r - 0.3) / CS), j1 = Math.floor((z + r + 0.3) / CS);
  const L0 = Math.max(0, Math.floor(y0 / LH)), L1 = Math.min(w.NL - 1, Math.floor(y1 / LH));
  for (pass = 0; pass < 2; pass++) {
    for (let L = L0; L <= L1; L++) {
      const base = L * LH;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (!inMap(w, i, j)) {
          // 地図の外は壁
          const cx = Math.max(i * CS, Math.min((i + 1) * CS, px)), cz = Math.max(j * CS, Math.min((j + 1) * CS, pz));
          const dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
          if (d2 < r * r) { const d = Math.sqrt(d2) || 1e-4; px += dx / d * (r - d) || 0; pz += dz / d * (r - d) || 0; hit = 1; if (pass) pm = Math.max(pm, r - d); }
          continue;
        }
        const k = w.idx(L, i, j);
        const t = w.cell[k];
        if (t === C.VOID && L === levelOfY(y0 + 0.1)) {
          // 何もないマス（建物の外の空白）も通れない
          const cx = Math.max(i * CS, Math.min((i + 1) * CS, px)), cz = Math.max(j * CS, Math.min((j + 1) * CS, pz));
          const dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
          if (d2 < r * r) { const d = Math.sqrt(d2) || 1e-4; px += (dx / d) * (r - d); pz += (dz / d) * (r - d); hit = 1; if (pass) pm = Math.max(pm, r - d); }
        }
        if (isWallish(t)) {
          const nb = w.nbox[k], bb = k * NB;
          for (let q = 0; q < NB; q++) {
            const m = w.blocks[bb + q];
            if (!m || m === M.GLASSBROKEN) continue;
            const by0 = base + q * BH, by1 = by0 + BH;
            if (by1 <= y0 || by0 >= y1) continue;
            // 板の継ぎ目で引っかからないように: 隣のマスへ同じ面で続く板は延ばして考え、
            // 1マスの箱（T字の腕など）のうち一番深くめり込んだものだけで押す
            let best = null, bm = 0;
            for (let n = 0; n < nb; n++) {
              const o = k * 8 + n * 4;
              let x0 = w.boxes[o], z0 = w.boxes[o + 1], x1 = w.boxes[o + 2], z1 = w.boxes[o + 3];
              if (x0 <= i * CS + 1e-6 && solidAt(w, L, i - 1, j, q)) x0 -= r;
              if (x1 >= (i + 1) * CS - 1e-6 && solidAt(w, L, i + 1, j, q)) x1 += r;
              if (z0 <= j * CS + 1e-6 && solidAt(w, L, i, j - 1, q)) z0 -= r;
              if (z1 >= (j + 1) * CS - 1e-6 && solidAt(w, L, i, j + 1, q)) z1 += r;
              const r2 = circleBox(px, pz, r, x0, z0, x1, z1);
              if (r2) { const mm = Math.abs(r2[0]) + Math.abs(r2[1]); if (mm > bm) { bm = mm; best = r2; } }
            }
            if (best) { px += best[0]; pz += best[1]; hit = 1; if (pass) pm = Math.max(pm, bm); }
            break; // 1マスにつき1回押せば十分（同じ箱）
          }
        }
        // 階段: 坂の面が足（y0 = 足+段差）より高い所は壁と同じ。横から乗れず、上の端の下にも入れない
        const sa = w.stairAt[k];
        if (sa >= 0 && w.stairs[sa].L === L) {
          const cx = Math.max(i * CS, Math.min((i + 1) * CS, px)), cz = Math.max(j * CS, Math.min((j + 1) * CS, pz));
          if (stairHeight(w, w.stairs[sa], cx, cz) > y0 + 0.02) {
            const r2 = circleBox(px, pz, r, i * CS, j * CS, (i + 1) * CS, (j + 1) * CS);
            if (r2) { px += r2[0]; pz += r2[1]; hit = 1; if (pass) pm = Math.max(pm, Math.abs(r2[0]) + Math.abs(r2[1])); }
          }
        }
        const pr = w.propNear.get(k);
        if (pr) for (const pid of pr) {
          if (pid === ignoreProp) continue;
          const p = w.props[pid];
          if (!p.solid || !p.alive) continue;
          for (const b of p.boxes) {
            if (b[4] <= y0 || b[1] >= y1) continue;
            const r2 = circleBox(px, pz, r, b[0], b[2], b[3], b[5]);
            if (r2) { px += r2[0]; pz += r2[1]; hit = 1; if (pass) pm = Math.max(pm, Math.abs(r2[0]) + Math.abs(r2[1])); }
          }
        }
        const dn = doorsState && w.doorNear.get(k);
        if (dn) for (const did of dn) {
          const ds = doorsState[did];
          if (!ds || ds.broken) continue;
          const d = w.doors[did];
          if (d.L !== L) continue;
          if (base + 2.1 <= y0 || base >= y1) continue;
          for (let li = 0; li < d.leaves.length; li++) {
            const lf = d.leaves[li], ang = ds.ang[li];
            const [ex, ez] = leafEnd(lf, ang);
            const r2 = circleSeg(px, pz, r + 0.025, lf.hx, lf.hz, ex, ez);
            if (r2) { px += r2[0]; pz += r2[1]; hit = 1; if (pass) pm = Math.max(pm, Math.abs(r2[0]) + Math.abs(r2[1])); }
          }
          // バリケード
          if (ds.bar > 0) {
            const bx = barricadeBox(d);
            const r2 = circleBox(px, pz, r, bx[0], bx[1], bx[2], bx[3]);
            if (r2) { px += r2[0]; pz += r2[1]; hit = 1; if (pass) pm = Math.max(pm, Math.abs(r2[0]) + Math.abs(r2[1])); }
          }
        }
      }
    }
  }
  out[0] = px - x; out[1] = pz - z; out[2] = hit; out[3] = pm; // out[3]: 2回目の押し出しの最大（0に近ければ収まっている）
  return out;
}

// そのマスのその高さに、ぶつかる壁のブロックがあるか
function solidAt(w, L, i, j, q) {
  if (i < 0 || j < 0 || i >= w.W || j >= w.D) return false;
  const k = w.idx(L, i, j);
  if (!isWallish(w.cell[k])) return false;
  const m = w.blocks[k * NB + q];
  return !!m && m !== M.GLASSBROKEN;
}

export function leafEnd(lf, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  // 閉じた向き (dx,dz) を ang だけ回す（Y軸まわり）
  const dx = lf.dx * c - lf.dz * s, dz = lf.dx * s + lf.dz * c;
  return [lf.hx + dx * lf.len, lf.hz + dz * lf.len];
}
export function barricadeBox(d) {
  const h = 0.05;
  return d.axis === 0 ? [d.a0, d.c - d.th / 2 - h, d.a1, d.c - d.th / 2 + 0.01] : [d.c - d.th / 2 - h, d.a0, d.c - d.th / 2 + 0.01, d.a1];
}

function circleBox(px, pz, r, x0, z0, x1, z1) {
  const cx = px < x0 ? x0 : px > x1 ? x1 : px, cz = pz < z0 ? z0 : pz > z1 ? z1 : pz;
  let dx = px - cx, dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-10) { const d = Math.sqrt(d2); return [dx / d * (r - d), dz / d * (r - d)]; }
  // 中心が箱の中: いちばん近い辺へ
  const l = px - x0, rr = x1 - px, t = pz - z0, b = z1 - pz;
  const m = Math.min(l, rr, t, b);
  if (m === l) return [-(l + r), 0]; if (m === rr) return [rr + r, 0]; if (m === t) return [0, -(t + r)]; return [0, b + r];
}
function circleSeg(px, pz, r, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1e-9;
  let t = ((px - ax) * vx + (pz - az) * vz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + vx * t, cz = az + vz * t, dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  const d = Math.sqrt(d2) || 1e-4;
  return [dx / d * (r - d), dz / d * (r - d)];
}

// ---- 光線（弾・視線）----
// 当たった物を近い順に返す: {t0, t1, kind:'block'|'slab'|'prop'|'door'|'stair'|'bar', mat, k, q, id, nx, ny, nz}
// opt.stopOpaque: 視線用（最初の見えない物で止める）、opt.max: 距離
const _seenP = new Set(), _seenD = new Set();
export function raycast(w, ox, oy, oz, dx, dy, dz, max, doorsState, opt = {}) {
  const hits = opt.out || [];
  hits.length = 0;
  let i = Math.floor(ox / CS), j = Math.floor(oz / CS);
  const stepI = dx > 0 ? 1 : -1, stepJ = dz > 0 ? 1 : -1;
  const tdI = dx !== 0 ? Math.abs(CS / dx) : Infinity, tdJ = dz !== 0 ? Math.abs(CS / dz) : Infinity;
  let tmI = dx !== 0 ? ((dx > 0 ? (i + 1) * CS - ox : ox - i * CS) / Math.abs(dx)) : Infinity;
  let tmJ = dz !== 0 ? ((dz > 0 ? (j + 1) * CS - oz : oz - j * CS) / Math.abs(dz)) : Infinity;
  let t = 0;
  const seenProp = opt.seenProp || _seenP; seenProp.clear();
  const seenDoor = opt.seenDoor || _seenD; seenDoor.clear();
  let guard = 0;
  let stopAt = max;
  while (t < stopAt && guard++ < 4000) {
    const tNext = Math.min(tmI, tmJ, max);
    if (!inMap(w, i, j)) { hits.push({ t0: t, t1: t, kind: 'edge', mat: M.CONCRETE }); break; }
    // このマスの中の区間 [t, tNext]
    const ya = oy + dy * t, yb = oy + dy * tNext;
    const ylo = Math.min(ya, yb), yhi = Math.max(ya, yb);
    for (let L = 0; L < w.NL; L++) {
      const base = L * LH;
      if (yhi < base - SLAB - 0.01 || ylo > base + LH) continue;
      const k = w.idx(L, i, j), tt = w.cell[k];
      // 床の板
      if (w.slab[k] || (L === 0 && tt !== C.VOID)) {
        const r = rayBox(ox, oy, oz, dx, dy, dz, i * CS, base - (L === 0 ? 1 : SLAB), j * CS, (i + 1) * CS, base, (j + 1) * CS);
        if (r && r[0] < stopAt && r[1] > 0) { hits.push({ t0: Math.max(0, r[0]), t1: r[1], kind: 'slab', mat: L === 0 ? M.CONCRETE : M.CONCRETE, k, nx: r[2], ny: r[3], nz: r[4], L }); }
      }
      // 最上階の屋根
      if (L === w.NL - 1 && (w.cell[k] === C.FLOOR || w.indoor[k] === 2 || w.cell[k] === C.STAIR)) {
        const r = rayBox(ox, oy, oz, dx, dy, dz, i * CS, base + CEIL, j * CS, (i + 1) * CS, base + LH, (j + 1) * CS);
        if (r && r[1] > 0) hits.push({ t0: Math.max(0, r[0]), t1: r[1], kind: 'slab', mat: M.CONCRETE, k, nx: r[2], ny: r[3], nz: r[4], L: L + 1 });
      }
      if (isWallish(tt)) {
        const nb = w.nbox[k], bb = k * NB;
        for (let q = 0; q < NB; q++) {
          const m = w.blocks[bb + q];
          if (!m || m === M.GLASSBROKEN) continue;
          const by0 = base + q * BH, by1 = by0 + BH;
          if (yhi < by0 || ylo > by1) continue;
          for (let n = 0; n < nb; n++) {
            const o = k * 8 + n * 4;
            const r = rayBox(ox, oy, oz, dx, dy, dz, w.boxes[o], by0, w.boxes[o + 1], w.boxes[o + 2], by1, w.boxes[o + 3]);
            if (r && r[1] > 0 && r[0] < stopAt) hits.push({ t0: Math.max(0, r[0]), t1: r[1], kind: 'block', mat: m, k, q, nx: r[2], ny: r[3], nz: r[4], L });
          }
        }
      }
      // 階段（坂の下は詰まっている）
      const s = w.stairAt[k];
      if (s >= 0 && w.stairs[s].L === L) {
        const st = w.stairs[s];
        const r = rayStair(w, st, ox, oy, oz, dx, dy, dz, t, tNext, i, j);
        if (r) hits.push({ t0: r[0], t1: r[0] + 0.3, kind: 'stair', mat: M.WOOD, k, nx: r[1], ny: r[2], nz: r[3], L });
      }
      // 家具
      const pr = w.propNear.get(k);
      if (pr) for (const pid of pr) {
        if (seenProp.has(pid)) continue;
        seenProp.add(pid);
        const p = w.props[pid];
        if (!p.alive) continue;
        for (const b of p.boxes) {
          const r = rayBox(ox, oy, oz, dx, dy, dz, b[0], b[1], b[2], b[3], b[4], b[5]);
          if (r && r[1] > 0 && r[0] < stopAt) hits.push({ t0: Math.max(0, r[0]), t1: r[1], kind: 'prop', mat: b[6], id: pid, nx: r[2], ny: r[3], nz: r[4], L });
        }
      }
      // 扉
      const dn = doorsState && w.doorNear.get(k);
      if (dn) for (const did of dn) {
        if (seenDoor.has(did)) continue;
        seenDoor.add(did);
        const ds = doorsState[did], d = w.doors[did];
        if (!ds || d.L !== L) continue;
        if (!ds.broken) for (let li = 0; li < d.leaves.length; li++) {
          const lf = d.leaves[li], [ex, ez] = leafEnd(lf, ds.ang[li]);
          const r = raySlabSeg(ox, oy, oz, dx, dy, dz, lf.hx, lf.hz, ex, ez, 0.045, base, base + 2.06);
          if (r && r[1] > 0 && r[0] < stopAt) hits.push({ t0: Math.max(0, r[0]), t1: r[1], kind: 'door', mat: d.mat, id: did, leaf: li, nx: r[2], ny: 0, nz: r[3], L });
        }
        if (ds.bar > 0) {
          const bx = barricadeBox(d);
          const r = rayBox(ox, oy, oz, dx, dy, dz, bx[0], base, bx[1], bx[2], base + 2.1, bx[3]);
          if (r && r[1] > 0 && r[0] < stopAt) hits.push({ t0: Math.max(0, r[0]), t1: r[1], kind: 'bar', mat: M.BARRICADE, id: did, nx: r[2], ny: r[3], nz: r[4], L });
        }
      }
    }
    if (opt.stopOpaque && hits.length) {
      // このマスで見えない物に当たったら、そこで止める（それより先は調べない）
      let mn = Infinity;
      for (const h of hits) if (!MATS[h.mat] || !MATS[h.mat].see) { if (h.t0 < mn) mn = h.t0; }
      if (mn < stopAt) stopAt = mn;
    }
    if (tNext >= max) break;
    t = tNext;
    if (tmI < tmJ) { tmI += tdI; i += stepI; } else { tmJ += tdJ; j += stepJ; }
  }
  hits.sort((a, b) => a.t0 - b.t0);
  return hits;
}

// 視線が通るか（見えない物にさえぎられないか）
const _losOpt = { stopOpaque: true, out: [], seenProp: new Set(), seenDoor: new Set() };
export function los(w, ax, ay, az, bx, by, bz, doorsState) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz);
  if (L < 1e-4) return true;
  const hits = raycast(w, ax, ay, az, dx / L, dy / L, dz / L, L - 0.05, doorsState, _losOpt);
  for (const h of hits) { if (h.t0 >= L - 0.05) break; const m = MATS[h.mat]; if (!m || !m.see) return false; }
  return true;
}
// 間にある壁の数（音のこもり方）
export function wallsBetween(w, ax, ay, az, bx, by, bz, doorsState, cap = 4) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz);
  if (L < 1e-4) return 0;
  const hits = raycast(w, ax, ay, az, dx / L, dy / L, dz / L, L, doorsState, { out: [], seenProp: new Set(), seenDoor: new Set() });
  let n = 0, last = -1;
  for (const h of hits) { if (h.kind === 'prop') continue; if (h.t0 - last > 0.2) { n++; last = h.t1; } if (n >= cap) break; }
  return n;
}

// 光線と箱。戻り値 [tEnter, tExit, nx, ny, nz]（入る面の法線）
export function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity, nx = 0, ny = 0, nz = 0;
  if (Math.abs(dx) < 1e-12) { if (ox < x0 || ox > x1) return null; } else {
    let a = (x0 - ox) / dx, b = (x1 - ox) / dx, s = -1; if (a > b) { const q = a; a = b; b = q; s = 1; }
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
  return [tmin, tmax, nx, ny, nz];
}
// 光線と、縦に立った厚みのある線分（扉の板）
function raySlabSeg(ox, oy, oz, dx, dy, dz, ax, az, bx, bz, th, y0, y1) {
  // 板の座標系: u = 線分方向, v = 法線
  const ux = bx - ax, uz = bz - az, len = Math.hypot(ux, uz) || 1e-6;
  const uxn = ux / len, uzn = uz / len, vx = -uzn, vz = uxn;
  const lox = (ox - ax) * uxn + (oz - az) * uzn, loz = (ox - ax) * vx + (oz - az) * vz;
  const ldx = dx * uxn + dz * uzn, ldz = dx * vx + dz * vz;
  const r = rayBox(lox, oy, loz, ldx, dy, ldz, 0, y0, -th / 2, len, y1, th / 2);
  if (!r) return null;
  // 法線を世界へ（vの向き）
  const sgn = ldz > 0 ? -1 : 1;
  return [r[0], r[1], vx * sgn, vz * sgn];
}
// 階段の坂: マスの中の区間で、坂の面より下に入るか
function rayStair(w, st, ox, oy, oz, dx, dy, dz, ta, tb, i, j) {
  const N = 6;
  let prev = null;
  for (let s = 0; s <= N; s++) {
    const t = ta + (tb - ta) * s / N;
    const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
    const h = stairHeight(w, st, x, z);
    const below = y < h;
    if (prev !== null && below && !prev.below) {
      const n = st.dir === 'n' ? [0, 0.8, 0.6] : st.dir === 's' ? [0, 0.8, -0.6] : st.dir === 'e' ? [-0.6, 0.8, 0] : [0.6, 0.8, 0];
      return [t, n[0], n[1], n[2]];
    }
    if (s === 0 && below && y > st.L * LH + 0.01) return null; // 坂の下から（段の裏）は無視
    prev = { below };
  }
  return null;
}

// その階でいちばん近い床のマス（湧き位置の補正など）
export function nearestFloor(w, L, x, z, maxR = 6) {
  const ci = Math.floor(x / CS), cj = Math.floor(z / CS);
  // 同じ部屋（床のつながり）を先に探す: 家具をよけるときに壁の向こうへ移さない
  const k0 = L >= 0 && L < w.NL && inMap(w, ci, cj) ? w.idx(L, ci, cj) : -1;
  const room = k0 >= 0 ? w.roomAt[k0] : -1;
  for (let pass = room >= 0 ? 0 : 1; pass < 2; pass++) {
    for (let r = 0; r <= maxR / CS; r++) {
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        const t = cellType(w, L, i, j);
        if (t === C.FLOOR || t === C.OUT) {
          const k = w.idx(L, i, j);
          if (pass === 0 && w.roomAt[k] !== room) continue;
          const pr = w.propNear.get(k);
          if (pr && pr.some(pid => { const p = w.props[pid]; return p.solid && Math.abs(p.x - (i + 0.5) * CS) < p.w / 2 + 0.2 && Math.abs(p.z - (j + 0.5) * CS) < p.d / 2 + 0.2; })) continue;
          return [(i + 0.5) * CS, (j + 0.5) * CS];
        }
      }
    }
  }
  return null;
}

// 速い見通しの判定（物を作らない）: a から b までに見えない物があれば true
// props: 家具も調べるか、doorsState: 扉を調べるか（null なら開いているものとして扱う）
export function occluded(w, ax, ay, az, bx, by, bz, doorsState = null, props = true) {
  const dx0 = bx - ax, dy0 = by - ay, dz0 = bz - az;
  const L = Math.hypot(dx0, dy0, dz0);
  if (L < 1e-4) return false;
  const dx = dx0 / L, dy = dy0 / L, dz = dz0 / L;
  let i = Math.floor(ax / CS), j = Math.floor(az / CS);
  const stepI = dx > 0 ? 1 : -1, stepJ = dz > 0 ? 1 : -1;
  const tdI = dx !== 0 ? Math.abs(CS / dx) : Infinity, tdJ = dz !== 0 ? Math.abs(CS / dz) : Infinity;
  let tmI = dx !== 0 ? ((dx > 0 ? (i + 1) * CS - ax : ax - i * CS) / Math.abs(dx)) : Infinity;
  let tmJ = dz !== 0 ? ((dz > 0 ? (j + 1) * CS - az : az - j * CS) / Math.abs(dz)) : Infinity;
  let t = 0, guard = 0;
  const maxT = L - 0.02;
  while (t < maxT && guard++ < 3000) {
    if (i < 0 || j < 0 || i >= w.W || j >= w.D) return false;
    const tN = Math.min(tmI, tmJ, maxT);
    const ya = ay + dy * t, yb = ay + dy * tN, ylo = ya < yb ? ya : yb, yhi = ya < yb ? yb : ya;
    for (let Lv = 0; Lv < w.NL; Lv++) {
      const base = Lv * LH;
      if (yhi < base - SLAB - 0.01 || ylo > base + LH) continue;
      const k = (Lv * w.D + j) * w.W + i, tt = w.cell[k];
      if (Lv > 0 && w.slab[k] && ylo < base && yhi > base - SLAB) {
        if (segBox(ax, ay, az, dx, dy, dz, t, tN, i * CS, base - SLAB, j * CS, (i + 1) * CS, base, (j + 1) * CS)) return true;
      }
      if (Lv === 0 && ylo < 0 && tt !== C.VOID) return true;
      if (Lv === w.NL - 1 && yhi > base + CEIL && (tt === C.FLOOR || w.indoor[k] === 2 || tt === C.STAIR)) {
        if (segBox(ax, ay, az, dx, dy, dz, t, tN, i * CS, base + CEIL, j * CS, (i + 1) * CS, base + LH, (j + 1) * CS)) return true;
      }
      if (WALLISH.has(tt)) {
        const nb = w.nbox[k], bb = k * NB;
        for (let q = 0; q < NB; q++) {
          const m = w.blocks[bb + q];
          if (!m || MATS[m].see) continue;
          const by0 = base + q * BH, by1 = by0 + BH;
          if (yhi < by0 || ylo > by1) continue;
          for (let n = 0; n < nb; n++) {
            const o = k * 8 + n * 4;
            if (segBox(ax, ay, az, dx, dy, dz, t, tN, w.boxes[o], by0, w.boxes[o + 1], w.boxes[o + 2], by1, w.boxes[o + 3])) return true;
          }
        }
      }
      if (props) {
        const pr = w.propNear.get(k);
        if (pr) for (const pid of pr) {
          const p = w.props[pid];
          for (const b of p.boxes) { if (MATS[b[6]] && MATS[b[6]].see) continue; if (segBox(ax, ay, az, dx, dy, dz, 0, maxT, b[0], b[1], b[2], b[3], b[4], b[5])) return true; }
        }
      }
      if (doorsState) {
        const dn = w.doorNear.get(k);
        if (dn) for (const did of dn) {
          const ds = doorsState[did], d = w.doors[did];
          if (!ds || ds.broken || d.L !== Lv) continue;
          if (ds.bar > 0) return true;
          for (let li = 0; li < d.leaves.length; li++) {
            const lf = d.leaves[li], [ex, ez] = leafEnd(lf, ds.ang[li]);
            if (segSeg2(ax, az, ax + dx * maxT, az + dz * maxT, lf.hx, lf.hz, ex, ez)) {
              // 高さ
              const tt2 = segSegT(ax, az, dx, dz, lf.hx, lf.hz, ex, ez);
              const yy = ay + dy * tt2;
              if (yy > base && yy < base + 2.06 && tt2 > 0 && tt2 < maxT) return true;
            }
          }
        }
      }
    }
    if (tN >= maxT) break;
    t = tN;
    if (tmI < tmJ) { tmI += tdI; i += stepI; } else { tmJ += tdJ; j += stepJ; }
  }
  return false;
}
function segBox(ox, oy, oz, dx, dy, dz, t0, t1, x0, y0, z0, x1, y1, z1) {
  let tmin = t0, tmax = t1;
  if (Math.abs(dx) < 1e-12) { if (ox < x0 || ox > x1) return false; } else { let a = (x0 - ox) / dx, b = (x1 - ox) / dx; if (a > b) { const q = a; a = b; b = q; } if (a > tmin) tmin = a; if (b < tmax) tmax = b; if (tmin > tmax) return false; }
  if (Math.abs(dy) < 1e-12) { if (oy < y0 || oy > y1) return false; } else { let a = (y0 - oy) / dy, b = (y1 - oy) / dy; if (a > b) { const q = a; a = b; b = q; } if (a > tmin) tmin = a; if (b < tmax) tmax = b; if (tmin > tmax) return false; }
  if (Math.abs(dz) < 1e-12) { if (oz < z0 || oz > z1) return false; } else { let a = (z0 - oz) / dz, b = (z1 - oz) / dz; if (a > b) { const q = a; a = b; b = q; } if (a > tmin) tmin = a; if (b < tmax) tmax = b; if (tmin > tmax) return false; }
  return true;
}
function segSeg2(ax, az, bx, bz, cx, cz, dx, dz) {
  const d1 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d2 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  const d3 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d4 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
function segSegT(ax, az, dx, dz, cx, cz, ex, ez) {
  const rx = ex - cx, rz = ez - cz, den = dx * rz - dz * rx;
  if (Math.abs(den) < 1e-9) return -1;
  return ((cx - ax) * rz - (cz - az) * rx) / den;
}
