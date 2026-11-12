// WAR BIT の建物: 箱を組み立てて作る（独自の形。低ポリ・四角い）。
// 建物は「ローカル座標（幅 bw × 奥 bd、玄関は手前 z=0 の側）」で作り、置く向き rot（0〜3 = 90°ずつ）で世界へ写す。
// 壁の厚さ T、階の高さ FH、床の板 SL。開口: 扉（幅1.2・高さ2.2）、窓（幅1.2・腰1.0〜2.2）。窓はガラスなし（撃てる・見える）
import { addBox, addRamp } from './world.js';
import { M } from '../engine/data/materials.js';

export const T = 0.3, FH = 3.0, SL = 0.25;
const DOOR = { w: 1.2, y0: 0, y1: 2.2 }, WIN = { w: 1.2, y0: 1.0, y1: 2.2 };

// ローカル → 世界（向き rot。bw×bd の箱を回して置く）
function xf(B, lx, lz) {
  const { x, z, rot, bw, bd } = B;
  if (rot === 0) return [x + lx, z + lz];
  if (rot === 1) return [x + (bd - lz), z + lx];
  if (rot === 2) return [x + (bw - lx), z + (bd - lz)];
  return [x + lz, z + (bw - lx)];
}
function box(B, lx0, ly0, lz0, lx1, ly1, lz1, o = {}) {
  const [ax, az] = xf(B, lx0, lz0), [bx, bz] = xf(B, lx1, lz1);
  return addBox(B.ww, { x0: ax, z0: az, x1: bx, z1: bz, y0: B.y + ly0, y1: B.y + ly1, mat: o.mat ?? B.mat, kind: o.kind || 'wall', bld: B.id, col: o.col || B.col, opaque: o.opaque, walk: o.walk });
}
const DIRMAP = [{ n: 'n', s: 's', e: 'e', w: 'w' }, { n: 'e', s: 'w', e: 's', w: 'n' }, { n: 's', s: 'n', e: 'w', w: 'e' }, { n: 'w', s: 'e', e: 'n', w: 's' }];
function ramp(B, lx0, lz0, lx1, lz1, ly0, ly1, dir) {
  const [ax, az] = xf(B, lx0, lz0), [bx, bz] = xf(B, lx1, lz1);
  return addRamp(B.ww, { x0: ax, z0: az, x1: bx, z1: bz, y0: B.y + ly0, y1: B.y + ly1, dir: DIRMAP[B.rot][dir], mat: B.mat, bld: B.id, col: B.floorCol });
}
// 壁の線（ローカルで x か z にそって）。ops: [{ at（線の始まりからの中心）, w, y0, y1 }]（扉・窓）
function wallX(B, x0, x1, z, y0, y1, ops = [], o = {}) { wallLine(B, x0, x1, (a, b, ya, yb) => box(B, a, ya, z, b, yb, z + T, o), y0, y1, ops); }
function wallZ(B, z0, z1, x, y0, y1, ops = [], o = {}) { wallLine(B, z0, z1, (a, b, ya, yb) => box(B, x, ya, a, x + T, yb, b, o), y0, y1, ops); }
function wallLine(B, s0, s1, put, y0, y1, ops) {
  const os = ops.map(p => ({ a: s0 + p.at - p.w / 2, b: s0 + p.at + p.w / 2, y0: y0 + p.y0, y1: Math.min(y1, y0 + p.y1) })).filter(p => p.a > s0 + 0.05 && p.b < s1 - 0.05).sort((p, q) => p.a - q.a);
  let s = s0;
  for (const p of os) {
    if (p.a > s + 0.01) put(s, p.a, y0, y1);
    if (p.y0 > y0 + 0.01) put(p.a, p.b, y0, p.y0);
    if (p.y1 < y1 - 0.01) put(p.a, p.b, p.y1, y1);
    s = p.b;
  }
  if (s1 > s + 0.01) put(s, s1, y0, y1);
}
// 床の板（穴 hole: [x0,z0,x1,z1] のまわりに分けて置く）
function slab(B, x0, z0, x1, z1, y, hole, o = {}) {
  const put = (a, b, c, d) => { if (b - a > 0.05 && d - c > 0.05) box(B, a, y - SL, c, b, y, d, { kind: 'floor', mat: o.mat ?? M.CONCRETE, col: o.col || B.floorCol }); };
  if (!hole) { put(x0, x1, z0, z1); return; }
  const [hx0, hz0, hx1, hz1] = hole;
  put(x0, x1, z0, hz0); put(x0, x1, hz1, z1); put(x0, hx0, hz0, hz1); put(hx1, x1, hz0, hz1);
}
function begin(ww, o, bw, bd, mat, col) {
  const B = { ww, id: (ww._bld = (ww._bld || 0) + 1), x: o.x, z: o.z, y: o.y ?? 0, rot: o.rot || 0, bw, bd, mat, col, floorCol: o.floorCol || '#8d8a84' };
  // 世界の範囲（建物の下を平らにする・置き場所の重なりを見るのに使う）
  const c0 = xf(B, 0, 0), c1 = xf(B, bw, bd);
  B.rect = [Math.min(c0[0], c1[0]), Math.min(c0[1], c1[1]), Math.max(c0[0], c1[0]), Math.max(c0[1], c1[1])];
  (ww.blds || (ww.blds = [])).push({ id: B.id, kind: o.kind, rect: B.rect, y: B.y, floors: o.floors || 1, name: o.name || '' });
  return B;
}

// 2階建ての家（8×10m）: 1階は居間と台所、2階は寝室2つ。玄関は手前、裏口は奥。階段は奥の左
export function house(ww, o) {
  const bw = 8, bd = 10, F = o.floors || 2, H = F * FH;
  const B = begin(ww, { ...o, kind: 'house', floors: F }, bw, bd, o.mat ?? M.BRICK, o.col || '#b9a58a');
  for (let f = 0; f < F; f++) {
    const y0 = f * FH, y1 = y0 + FH, opsF = f === 0 ? [{ at: 3, ...DOOR }, { at: 6.2, ...WIN }] : [{ at: 2, ...WIN }, { at: 6, ...WIN }];
    wallX(B, 0, bw, 0, y0, y1, opsF);                                        // 手前
    wallX(B, 0, bw, bd - T, y0, y1, f === 0 ? [{ at: 6, ...DOOR }] : [{ at: 4, ...WIN }]); // 奥
    wallZ(B, T, bd - T, 0, y0, y1, [{ at: 4.5, ...WIN }]);                   // 左
    wallZ(B, T, bd - T, bw - T, y0, y1, [{ at: 3, ...WIN }, { at: 7, ...WIN }]); // 右
    // 中の仕切り（扉つき）
    wallX(B, T, bw - T, 5, y0, y1, [{ at: 2.5, ...DOOR }, { at: 5.6, ...DOOR }], { mat: M.DRYWALL, col: '#d8d2c4' });
    if (f > 0) slab(B, 0, 0, bw, bd, y0, [T, 6.5, T + 1.1, bd - T]);
  }
  // 階段（奥の左。z=bd-T から 6.5 へ上がる）
  for (let f = 0; f + 1 < F; f++) ramp(B, T, 6.5, T + 1.1, bd - T, f * FH, (f + 1) * FH, 'n');
  // 屋根（平ら＋低い縁）
  slab(B, -0.2, -0.2, bw + 0.2, bd + 0.2, H + SL, null, { col: o.roofCol || '#6f4a3a' });
  box(B, -0.2, H + SL, -0.2, bw + 0.2, H + SL + 0.4, 0.1, { col: o.roofCol || '#6f4a3a', kind: 'roof' });
  box(B, -0.2, H + SL, bd - 0.1, bw + 0.2, H + SL + 0.4, bd + 0.2, { col: o.roofCol || '#6f4a3a', kind: 'roof' });
  return B;
}

// アパート（12×18m、F階）: 中央の階段室、各階に2部屋。屋上へも上がれる（手すりの低い壁）
export function apartment(ww, o) {
  const bw = 12, bd = 18, F = o.floors || 3, H = F * FH;
  const B = begin(ww, { ...o, kind: 'apartment', floors: F }, bw, bd, o.mat ?? M.CONCRETE, o.col || '#a8aeb4');
  for (let f = 0; f < F; f++) {
    const y0 = f * FH, y1 = y0 + FH;
    wallX(B, 0, bw, 0, y0, y1, f === 0 ? [{ at: 2.5, ...WIN }, { at: 6, w: 1.6, y0: 0, y1: 2.4 }, { at: 9.5, ...WIN }] : [{ at: 2.5, ...WIN }, { at: 6, ...WIN }, { at: 9.5, ...WIN }]);
    wallX(B, 0, bw, bd - T, y0, y1, [{ at: 2.5, ...WIN }, { at: 6, ...(f === 0 ? DOOR : WIN) }, { at: 9.5, ...WIN }]);
    wallZ(B, T, bd - T, 0, y0, y1, [{ at: 3.5, ...WIN }, { at: 8.7, ...WIN }, { at: 14, ...WIN }]);
    wallZ(B, T, bd - T, bw - T, y0, y1, [{ at: 3.5, ...WIN }, { at: 8.7, ...WIN }, { at: 14, ...WIN }]);
    // 階段室（中央 x=4.5〜7.5、z=6.5〜11.5）の壁と、部屋への扉
    wallZ(B, 6.5, 11.5, 4.5, y0, y1, [{ at: 2.5, ...DOOR }], { mat: M.CONCRETE });
    wallZ(B, 6.5, 11.5, 7.5 - T, y0, y1, [{ at: 2.5, ...DOOR }], { mat: M.CONCRETE });
    // 部屋の仕切り（手前と奥）
    wallX(B, T, 4.5, 6.5, y0, y1, [{ at: 2, ...DOOR }], { mat: M.DRYWALL, col: '#d6d2c8' }); wallX(B, 7.5, bw - T, 6.5, y0, y1, [{ at: 2.2, ...DOOR }], { mat: M.DRYWALL, col: '#d6d2c8' });
    wallX(B, T, 4.5, 11.5 - T, y0, y1, [{ at: 2, ...DOOR }], { mat: M.DRYWALL, col: '#d6d2c8' }); wallX(B, 7.5, bw - T, 11.5 - T, y0, y1, [{ at: 2.2, ...DOOR }], { mat: M.DRYWALL, col: '#d6d2c8' });
    if (f > 0) slab(B, 0, 0, bw, bd, y0, [4.5 + T, 6.5, 6.0, 11.5]);
  }
  // 階段（階段室の左半分。各階で z=11.5 → 6.5 へ）。屋上へも
  for (let f = 0; f < F; f++) ramp(B, 4.5 + T, 6.5, 6.0, 11.5, f * FH, (f + 1) * FH, 'n');
  slab(B, 0, 0, bw, bd, H, [4.5 + T, 6.5, 6.0, 11.5], { col: '#8e9296' });
  // 屋上の低い壁
  wallX(B, 0, bw, 0, H, H + 1.0); wallX(B, 0, bw, bd - T, H, H + 1.0); wallZ(B, T, bd - T, 0, H, H + 1.0); wallZ(B, T, bd - T, bw - T, H, H + 1.0);
  return B;
}

// 倉庫（20×30m、高さ7m）: 大きな開口2つ・小さな扉。中にキャットウォーク（片側）
export function warehouse(ww, o) {
  const bw = 20, bd = 30, H = 7;
  const B = begin(ww, { ...o, kind: 'warehouse', floors: 1 }, bw, bd, o.mat ?? M.METAL, o.col || '#7f8a86');
  wallX(B, 0, bw, 0, 0, H, [{ at: 10, w: 6, y0: 0, y1: 5 }]);
  wallX(B, 0, bw, bd - T, 0, H, [{ at: 6, w: 5, y0: 0, y1: 4.5 }, { at: 16, ...DOOR }]);
  wallZ(B, T, bd - T, 0, 0, H, [{ at: 8, ...DOOR }, { at: 15, w: 2, y0: 4.6, y1: 5.8 }, { at: 22, w: 2, y0: 4.6, y1: 5.8 }]);
  wallZ(B, T, bd - T, bw - T, 0, H, [{ at: 15, w: 2, y0: 4.6, y1: 5.8 }, { at: 22, ...DOOR }]);
  // 右の壁ぞいのキャットウォーク（高さ3.5m・幅2m）と斜めの階段
  box(B, bw - 2.3, 3.25, 4, bw - T, 3.5, bd - 4, { kind: 'floor', mat: M.METAL, col: '#5d6466' });
  box(B, bw - 2.4, 3.5, 4, bw - 2.3, 4.5, bd - 4, { kind: 'rail', mat: M.METAL, col: '#5d6466', opaque: false });
  ramp(B, bw - 2.3, bd - 4, bw - T, bd - 0.5, 0, 3.5, 'n');
  // 屋根
  slab(B, 0, 0, bw, bd, H + SL, null, { col: '#5f6668', mat: M.METAL });
  // 中の木箱・パレット
  for (const [cx, cz] of [[5, 10], [7, 18], [12, 13], [4, 24]]) box(B, cx - 0.6, 0, cz - 0.6, cx + 0.6, 1.2, cz + 0.6, { kind: 'crate', mat: M.WOOD, col: '#8a6a44' });
  return B;
}

// 見張り塔（4×4m、高さ9m）: 2段の踊り場、上は胸の高さの壁
export function tower(ww, o) {
  const bw = 4, bd = 4, H = 9;
  const B = begin(ww, { ...o, kind: 'tower', floors: 3 }, bw, bd, o.mat ?? M.CONCRETE, o.col || '#9a9890');
  // 柱4本
  for (const [px, pz] of [[0, 0], [bw - 0.4, 0], [0, bd - 0.4], [bw - 0.4, bd - 0.4]]) box(B, px, 0, pz, px + 0.4, H, pz + 0.4, { kind: 'pillar' });
  // 床（4.5m・9m）と階段（外側に沿って）
  slab(B, 0, 0, bw, bd, 4.5, [0.4, 0.4, 1.5, bd - 0.4]);
  slab(B, 0, 0, bw, bd, H, [0.4, 0.4, 1.5, bd - 0.4]);
  ramp(B, 0.4, 0.4, 1.5, bd - 0.4, 0, 4.5, 'n');
  ramp(B, 0.4, 0.4, 1.5, bd - 0.4, 4.5, H, 's');
  // 上の胸壁
  wallX(B, 0, bw, 0, H, H + 1.1); wallX(B, 0, bw, bd - T, H, H + 1.1); wallZ(B, T, bd - T, 0, H, H + 1.1); wallZ(B, T, bd - T, bw - T, H, H + 1.1);
  slab(B, -0.3, -0.3, bw + 0.3, bd + 0.3, H + 3.2, null, { col: '#6c6a64' });
  return B;
}

// 塀（世界の座標で直線。高さ h、厚さ th）
export function wallRun(ww, x0, z0, x1, z1, h = 2.2, o = {}) {
  const th = o.th ?? 0.3, alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0), y = o.y ?? 0;
  if (alongX) return addBox(ww, { x0: Math.min(x0, x1), z0: z0 - th / 2, x1: Math.max(x0, x1), z1: z0 + th / 2, y0: y, y1: y + h, mat: o.mat ?? M.CONCRETE, kind: 'fence', col: o.col || '#a9a59b', opaque: o.opaque });
  return addBox(ww, { x0: x0 - th / 2, z0: Math.min(z0, z1), x1: x0 + th / 2, z1: Math.max(z0, z1), y0: y, y1: y + h, mat: o.mat ?? M.CONCRETE, kind: 'fence', col: o.col || '#a9a59b', opaque: o.opaque });
}
// 土のうの列（高さ1m）・コンテナ（6×2.4×2.6）
export function sandbags(ww, x0, z0, x1, z1, y = 0) { return wallRun(ww, x0, z0, x1, z1, 1.0, { th: 0.7, mat: M.FABRIC, col: '#a28f68', y }); }
export function container(ww, x, z, rot = 0, y = 0, col = '#3f6f8f') {
  const [w, d] = rot % 2 ? [2.4, 6] : [6, 2.4];
  return addBox(ww, { x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, y0: y, y1: y + 2.6, mat: M.METAL, kind: 'container', col });
}
