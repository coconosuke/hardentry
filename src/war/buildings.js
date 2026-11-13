// WAR BIT の建物: 箱を組み立てて作る（独自の形。低ポリ・四角い。research/WARBIT.md の 4・13）。
// 建物は「ローカル座標（幅 bw × 奥 bd、玄関は手前 z=0 の側）」で作り、置く向き rot（0〜3 = 90°ずつ）で世界へ写す。
// 壁の厚さ T、階の高さ FH、床の板 SL。開口: 扉（幅1.2・高さ2.2）、窓（幅1.2・腰1.0〜2.2）。窓はガラスなし（撃てる・見える）。
// 質の上げ方（BattleBit の建物に合わせる）: 外の窓と扉の枠（下枠・上枠）・土台の帯・切妻の屋根（坂の板2枚＋三角の壁）・煙突・
// 色の違い・中の家具（遮蔽物）。枠・家具・小物は近くだけ描く（detail）。多くの建物は1〜2階（BattleBit の Mesa の方針）
import { addBox, addRamp, addDeco, addCyl } from './world.js';
import { M } from '../engine/data/materials.js';

export const T = 0.3, FH = 3.0, SL = 0.25;
const DOOR = { w: 1.2, y0: 0, y1: 2.2 }, WIN = { w: 1.2, y0: 1.0, y1: 2.2 }, BIGWIN = { w: 2.6, y0: 0.6, y1: 2.5 };
// 色（独自）
export const PLASTER = ['#d3c7ad', '#dcd3bf', '#c9b79a', '#bdbbb0', '#d9c9a2', '#c5ccbf', '#cfc0b4', '#d6bfa6'];
export const BRICKS = ['#a6654c', '#9a5a45', '#b07560', '#8c5a48', '#a87058'];
export const ROOFS = ['#7a3f2f', '#5f5953', '#6b4a3a', '#4f5c64', '#86523b', '#5a4038'];
const TRIM = '#e6e1d4', TRIM_DARK = '#7d776d';
const pick = (L, r) => L[Math.floor(r() * L.length) % L.length];

// ローカル → 世界（向き rot。bw×bd の箱を回して置く）
function xf(B, lx, lz) {
  const { x, z, rot, bw, bd } = B;
  if (rot === 0) return [x + lx, z + lz];
  if (rot === 1) return [x + (bd - lz), z + lx];
  if (rot === 2) return [x + (bw - lx), z + (bd - lz)];
  return [x + lz, z + (bw - lx)];
}
// ローカルの向き（nx, nz）→ 世界の向き
function nrm(B, nx, nz) {
  if (B.rot === 0) return [nx, 0, nz];
  if (B.rot === 1) return [-nz, 0, nx];
  if (B.rot === 2) return [-nx, 0, -nz];
  return [nz, 0, -nx];
}
function box(B, lx0, ly0, lz0, lx1, ly1, lz1, o = {}) {
  const [ax, az] = xf(B, lx0, lz0), [bx, bz] = xf(B, lx1, lz1);
  return addBox(B.ww, { x0: ax, z0: az, x1: bx, z1: bz, y0: B.y + ly0, y1: B.y + ly1, mat: o.mat ?? B.mat, kind: o.kind || 'wall', bld: B.id, col: o.col || B.col, opaque: o.opaque, walk: o.walk, layer: o.layer ?? B.layer, detail: o.detail, hide: o.hide, bev: o.bev, far: o.far });
}
const DIRMAP = [{ n: 'n', s: 's', e: 'e', w: 'w' }, { n: 'e', s: 'w', e: 's', w: 'n' }, { n: 's', s: 'n', e: 'w', w: 'e' }, { n: 'w', s: 'e', e: 'n', w: 's' }];
function ramp(B, lx0, lz0, lx1, lz1, ly0, ly1, dir, o = {}) {
  const [ax, az] = xf(B, lx0, lz0), [bx, bz] = xf(B, lx1, lz1);
  return addRamp(B.ww, { x0: ax, z0: az, x1: bx, z1: bz, y0: B.y + ly0, y1: B.y + ly1, dir: DIRMAP[B.rot][dir], mat: o.mat ?? B.mat, bld: B.id, col: o.col || B.floorCol, smooth: o.smooth, th: o.th, kind: o.kind, layer: o.layer });
}
// 壁の線（ローカルで x か z にそって）。ops: [{ at（線の始まりからの中心）, w, y0, y1 }]（扉・窓）。
// o.out（外壁の外の向き -1/+1）を渡すと、開口に枠（窓の下枠・上枠、扉の上枠）を付ける
export function wallX(B, x0, x1, z, y0, y1, ops = [], o = {}) {
  wallLine(B, x0, x1, (a, b, ya, yb) => box(B, a, ya, z, b, yb, z + T, o), y0, y1, ops);
  if (o.out) for (const p of ops) {
    const a = x0 + p.at - p.w / 2, b = x0 + p.at + p.w / 2, zf = o.out < 0 ? z : z + T, d = o.out;
    trim(B, (u0, u1, v0, v1, w0, w1) => box(B, u0, v0, Math.min(zf + d * w0, zf + d * w1), u1, v1, Math.max(zf + d * w0, zf + d * w1), { kind: 'trim', detail: true, walk: false, col: B.trimCol, mat: B.mat }), a, b, y0, p);
  }
}
export function wallZ(B, z0, z1, x, y0, y1, ops = [], o = {}) {
  wallLine(B, z0, z1, (a, b, ya, yb) => box(B, x, ya, a, x + T, yb, b, o), y0, y1, ops);
  if (o.out) for (const p of ops) {
    const a = z0 + p.at - p.w / 2, b = z0 + p.at + p.w / 2, xf0 = o.out < 0 ? x : x + T, d = o.out;
    trim(B, (u0, u1, v0, v1, w0, w1) => box(B, Math.min(xf0 + d * w0, xf0 + d * w1), v0, u0, Math.max(xf0 + d * w0, xf0 + d * w1), v1, u1, { kind: 'trim', detail: true, walk: false, col: B.trimCol, mat: B.mat }), a, b, y0, p);
  }
}
// 枠: put(線にそった始め・終わり, 下・上, 壁の面からの出の始め・終わり)
function trim(B, put, a, b, y0, p) {
  if (p.y0 > 0.05) put(a - 0.1, b + 0.1, y0 + p.y0 - 0.1, y0 + p.y0 + 0.02, -0.02, 0.12); // 窓の下枠
  put(a - 0.08, b + 0.08, y0 + p.y1, y0 + p.y1 + 0.14, -0.02, 0.07);                 // 上枠
}
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
  // 外の壁の面と同じ所の縁は少し内へ（床の縁が壁の外に帯のように見えるのを防ぐ）
  const e = 0.03, ix = (v) => Math.abs(v) < 1e-6 ? e : Math.abs(v - B.bw) < 1e-6 ? B.bw - e : v, iz = (v) => Math.abs(v) < 1e-6 ? e : Math.abs(v - B.bd) < 1e-6 ? B.bd - e : v;
  x0 = ix(x0); x1 = ix(x1); z0 = iz(z0); z1 = iz(z1);
  const put = (a, b, c, d) => { if (b - a > 0.05 && d - c > 0.05) box(B, a, y - SL, c, b, y, d, { kind: 'floor', mat: o.mat ?? M.CONCRETE, col: o.col || B.floorCol, layer: o.layer }); };
  if (!hole) { put(x0, x1, z0, z1); return; }
  const [hx0, hz0, hx1, hz1] = hole;
  put(x0, x1, z0, hz0); put(x0, x1, hz1, z1); put(x0, hx0, hz0, hz1); put(hx1, x1, hz0, hz1);
}
function begin(ww, o, bw, bd, mat, col) {
  const r = o.rnd || Math.random;
  const B = { ww, id: (ww._bld = (ww._bld || 0) + 1), x: o.x, z: o.z, y: o.y ?? 0, rot: o.rot || 0, bw, bd, mat, col, floorCol: o.floorCol || '#8d8a84', trimCol: o.trimCol || (mat === M.BRICK ? TRIM : TRIM), roofCol: o.roofCol || pick(ROOFS, r), layer: o.layer, r };
  // 世界の範囲（建物の下を平らにする・置き場所の重なりを見るのに使う）
  const c0 = xf(B, 0, 0), c1 = xf(B, bw, bd);
  B.rect = [Math.min(c0[0], c1[0]), Math.min(c0[1], c1[1]), Math.max(c0[0], c1[0]), Math.max(c0[1], c1[1])];
  (ww.blds || (ww.blds = [])).push({ id: B.id, kind: o.kind, rect: B.rect, y: B.y, floors: o.floors || 1, name: o.name || '' });
  return B;
}
// 土台の帯（外のまわり。高さ 0.32 で踏み越えられる）
function plinth(B, h = 0.32) {
  const e = 0.07, c = o => ({ kind: 'trim', col: B.plinthCol || '#8b867c', mat: M.CONCRETE, layer: 1, ...o });
  box(B, -e, 0, -e, B.bw + e, h, 0, c());
  box(B, -e, 0, B.bd, B.bw + e, h, B.bd + e, c());
  box(B, -e, 0, 0, 0, h, B.bd, c());
  box(B, B.bw, 0, 0, B.bw + e, h, B.bd, c());
}
// 切妻の屋根: 下の高さ y・棟までの高さ rh・軒の出 ov。棟は ridge: 'x'（x にそう＝坂は手前と奥へ）か 'z'
// 坂の板2枚（上に乗れる）＋三角の壁（描くだけ）＋三角の当たり（隠れた段の箱）。o.x0..x1・z0..z1 で建物の一部だけにかけられる
function gable(B, y, rh, ov = 0.45, ridge = 'x', o = {}) {
  const gx0 = o.x0 ?? 0, gx1 = o.x1 ?? B.bw, gz0 = o.z0 ?? 0, gz1 = o.z1 ?? B.bd, th = 0.22, col = o.col || B.roofCol, wcol = o.wallCol || B.col, layer = 22;
  if (ridge === 'x') {
    const m = (gz0 + gz1) / 2, hd = (gz1 - gz0) / 2;
    ramp(B, gx0 - ov, gz0 - ov, gx1 + ov, m, y - ov * rh / hd, y + rh, 's', { smooth: true, th, kind: 'roof', col, layer, mat: M.WOOD });
    ramp(B, gx0 - ov, m, gx1 + ov, gz1 + ov, y - ov * rh / hd, y + rh, 'n', { smooth: true, th, kind: 'roof', col, layer, mat: M.WOOD });
    for (const [lx, nx] of [[gx0, -1], [gx1, 1]]) {
      const P = (lz, ly) => { const [wx, wz] = xf(B, lx, lz); return [wx, B.y + ly, wz]; };
      addDeco(B.ww, { pts: [P(gz0, y), P(gz1, y), P(m, y + rh - 0.05)], n: nrm(B, nx, 0), col: wcol, layer: B.layer ?? 3, bld: B.id });
      for (let k = 0; k < 3; k++) { const t = (k + 0.5) / 3, a = gz0 + t * hd, b = gz1 - t * hd; box(B, lx === gx0 ? gx0 : gx1 - T, y + rh * k / 3, a, lx === gx0 ? gx0 + T : gx1, y + rh * (k + 1) / 3, b, { hide: true, kind: 'wall', mat: B.mat }); }
    }
  } else {
    const m = (gx0 + gx1) / 2, hw = (gx1 - gx0) / 2;
    ramp(B, gx0 - ov, gz0 - ov, m, gz1 + ov, y - ov * rh / hw, y + rh, 'e', { smooth: true, th, kind: 'roof', col, layer, mat: M.WOOD });
    ramp(B, m, gz0 - ov, gx1 + ov, gz1 + ov, y - ov * rh / hw, y + rh, 'w', { smooth: true, th, kind: 'roof', col, layer, mat: M.WOOD });
    for (const [lz, nz] of [[gz0, -1], [gz1, 1]]) {
      const P = (lx, ly) => { const [wx, wz] = xf(B, lx, lz); return [wx, B.y + ly, wz]; };
      addDeco(B.ww, { pts: [P(gx0, y), P(gx1, y), P(m, y + rh - 0.05)], n: nrm(B, 0, nz), col: wcol, layer: B.layer ?? 3, bld: B.id });
      for (let k = 0; k < 3; k++) { const t = (k + 0.5) / 3, a = gx0 + t * hw, b = gx1 - t * hw; box(B, a, y + rh * k / 3, lz === gz0 ? gz0 : gz1 - T, b, y + rh * (k + 1) / 3, lz === gz0 ? gz0 + T : gz1, { hide: true, kind: 'wall', mat: B.mat }); }
    }
  }
}
// 平らな屋根と低い縁（パラペット）
function flatRoof(B, y, h = 0.5, o = {}) {
  const { bw, bd } = B;
  slab(B, -0.1, -0.1, bw + 0.1, bd + 0.1, y + SL, null, { col: o.col || '#8e9296' });
  const c = { kind: 'roof', col: o.edgeCol || B.col, mat: B.mat };
  box(B, -0.1, y + SL, -0.1, bw + 0.1, y + SL + h, 0.15, c); box(B, -0.1, y + SL, bd - 0.15, bw + 0.1, y + SL + h, bd + 0.1, c);
  box(B, -0.1, y + SL, 0.15, 0.15, y + SL + h, bd - 0.15, c); box(B, bw - 0.15, y + SL, 0.15, bw + 0.1, y + SL + h, bd - 0.15, c);
  // 縁の上の笠木（明るい線）
  box(B, -0.14, y + SL + h, -0.14, bw + 0.14, y + SL + h + 0.08, bd + 0.14, { kind: 'trim', col: TRIM_DARK, mat: M.CONCRETE, detail: true, walk: false, hide: false });
}
// 家具（遮蔽物になる箱。近くだけ描く）。kind: sofa・table・bed・shelf・counter・wardrobe・desk・crate
const FURN = {
  sofa: [2.0, 0.85, 0.9, '#6d5a4a', M.FABRIC, 12], table: [1.4, 0.75, 0.8, '#8a6a44', M.FURN, 11], bed: [2.0, 0.55, 1.5, '#b8b2a6', M.FABRIC, 12],
  shelf: [2.0, 1.8, 0.45, '#7a5e3e', M.FURN, 11], counter: [2.4, 0.92, 0.65, '#bdb7aa', M.CERAMIC, 1], wardrobe: [1.2, 2.0, 0.6, '#6e553a', M.FURN, 11],
  desk: [1.5, 0.75, 0.75, '#77706a', M.METALFURN, 10], pew: [3.0, 0.9, 0.55, '#6e553a', M.FURN, 11], crate: [1.1, 1.1, 1.1, '#8a6a44', M.WOOD, 11], fridge: [0.8, 1.8, 0.7, '#d9dad6', M.METALFURN, 19],
};
function furn(B, kind, lx, ly, lz, along = 'x') {
  const [w, h, d, col, mat, layer] = FURN[kind];
  const [a, b] = along === 'x' ? [w, d] : [d, w];
  box(B, lx, ly, lz, lx + a, ly + h, lz + b, { kind: 'furn', detail: true, col, mat, layer, bev: 0.05 });
}

// ---- 2階建ての家（8×10m）: 1階は居間と台所、2階は寝室2つ。玄関は手前、裏口は奥。階段は奥の左。切妻の屋根・煙突・ひさし
export function house(ww, o) {
  const bw = 8, bd = 10, F = o.floors || 2, H = F * FH, r = o.rnd || Math.random;
  const brick = o.mat === M.BRICK || (o.mat == null && r() < 0.3);
  const B = begin(ww, { ...o, kind: 'house', floors: F }, bw, bd, brick ? M.BRICK : (o.mat ?? M.BRICK), o.col || (brick ? pick(BRICKS, r) : pick(PLASTER, r)));
  if (!brick && o.mat !== M.WOOD) B.layer = 3; else if (o.mat === M.WOOD) B.layer = 22;
  for (let f = 0; f < F; f++) {
    const y0 = f * FH, y1 = y0 + FH, opsF = f === 0 ? [{ at: 3, ...DOOR }, { at: 6.2, ...WIN }] : [{ at: 2, ...WIN }, { at: 6, ...WIN }];
    wallX(B, 0, bw, 0, y0, y1, opsF, { out: -1 });                                        // 手前
    wallX(B, 0, bw, bd - T, y0, y1, f === 0 ? [{ at: 6, ...DOOR }, { at: 2.4, ...WIN }] : [{ at: 4, ...WIN }], { out: 1 }); // 奥
    wallZ(B, T, bd - T, 0, y0, y1, [{ at: 4.5, ...WIN }], { out: -1 });                   // 左
    wallZ(B, T, bd - T, bw - T, y0, y1, [{ at: 3, ...WIN }, { at: 7, ...WIN }], { out: 1 }); // 右
    // 中の仕切り（扉つき）
    wallX(B, T, bw - T, 5, y0, y1, [{ at: 2.5, ...DOOR }, { at: 5.6, ...DOOR }], { mat: M.DRYWALL, col: '#d8d2c4', layer: 3 });
    if (f > 0) slab(B, 0, 0, bw, bd, y0, [T, 6.5, T + 1.1, bd - T]);
  }
  // 階段（奥の左。z=bd-T から 6.5 へ上がる）
  for (let f = 0; f + 1 < F; f++) ramp(B, T, 6.5, T + 1.1, bd - T, f * FH, (f + 1) * FH, 'n');
  // 天井（屋根裏の床）と切妻の屋根・煙突
  slab(B, 0, 0, bw, bd, H + SL, null, { col: '#8a857c' });
  gable(B, H + SL, 2.2, 0.45, 'x');
  box(B, 5.4, H + SL + 0.8, 6.2, 6.1, H + SL + 2.9, 6.9, { kind: 'roof', col: brick ? '#7f4b3a' : '#9b8f80', mat: M.BRICK, layer: 2 });
  plinth(B);
  // 玄関のひさし
  box(B, 2.1, 2.45, -1.1, 3.9, 2.6, 0, { kind: 'trim', col: B.roofCol, mat: M.WOOD, walk: false });
  // 家具
  furn(B, 'sofa', 0.6, 0, 0.6); furn(B, 'table', 4.6, 0, 2.0); furn(B, 'counter', 4.8, 0, 9.0); furn(B, 'fridge', 7.0, 0, 8.4);
  if (F > 1) { furn(B, 'bed', 4.6, FH, 0.6); furn(B, 'wardrobe', 0.6, FH, 4.0); furn(B, 'bed', 4.6, FH, 7.6); }
  return B;
}
// 平屋（10×8m）: 居間・台所・寝室。切妻の屋根（棟は長い辺）・玄関のポーチ（柱2本）
export function bungalow(ww, o) {
  const bw = 10, bd = 8, H = FH, r = o.rnd || Math.random;
  const wood = o.mat === M.WOOD || (o.mat == null && r() < 0.35);
  const B = begin(ww, { ...o, kind: 'bungalow', floors: 1 }, bw, bd, wood ? M.WOOD : M.BRICK, o.col || pick(wood ? ['#b9b2a2', '#9eaab0', '#c4b58f', '#a7b49a', '#d1cbbd'] : PLASTER, r));
  B.layer = wood ? 22 : 3;
  wallX(B, 0, bw, 0, 0, H, [{ at: 2.4, ...WIN }, { at: 5, ...DOOR }, { at: 7.6, ...WIN }], { out: -1 });
  wallX(B, 0, bw, bd - T, 0, H, [{ at: 2.5, ...WIN }, { at: 6.5, ...DOOR }, { at: 8.6, ...WIN }], { out: 1 });
  wallZ(B, T, bd - T, 0, 0, H, [{ at: 4, ...WIN }], { out: -1 });
  wallZ(B, T, bd - T, bw - T, 0, H, [{ at: 4, ...WIN }], { out: 1 });
  wallZ(B, T, bd - T, 6, 0, H, [{ at: 2.2, ...DOOR }, { at: 5.6, ...DOOR }], { mat: M.DRYWALL, col: '#d8d2c4', layer: 3 });
  slab(B, 0, 0, bw, bd, H + SL, null, { col: '#8a857c' });
  gable(B, H + SL, 1.9, 0.5, 'x');
  plinth(B);
  // ポーチ（床・柱・屋根）
  box(B, 3.2, 0, -2.0, 6.8, 0.25, 0, { kind: 'floor', col: '#8f8778', mat: M.WOOD, layer: 4 });
  for (const px of [3.3, 6.5]) box(B, px, 0.25, -1.95, px + 0.2, 2.6, -1.75, { kind: 'pillar', col: TRIM, mat: M.WOOD });
  box(B, 3.0, 2.6, -2.15, 7.0, 2.75, 0, { kind: 'trim', col: B.roofCol, mat: M.WOOD, walk: false });
  furn(B, 'sofa', 0.6, 0, 0.6); furn(B, 'table', 2.5, 0, 3.4); furn(B, 'counter', 0.5, 0, 7.0); furn(B, 'bed', 7.6, 0, 0.6, 'z'); furn(B, 'wardrobe', 8.3, 0, 6.6);
  return B;
}

// ---- アパート（12×18m、F階）: 中央の階段室、各階に2部屋。屋上へも上がれる（手すりの低い壁）・手前にベランダ・入口のひさし
export function apartment(ww, o) {
  const bw = 12, bd = 18, F = o.floors || 3, H = F * FH, r = o.rnd || Math.random;
  const B = begin(ww, { ...o, kind: 'apartment', floors: F }, bw, bd, o.mat ?? M.CONCRETE, o.col || pick(['#a8aeb4', '#b9b2a4', '#c2b49a', '#9fa9a1', '#b7a99c', '#c9c2b3'], r));
  B.layer = 3;
  for (let f = 0; f < F; f++) {
    const y0 = f * FH, y1 = y0 + FH;
    wallX(B, 0, bw, 0, y0, y1, f === 0 ? [{ at: 2.5, ...WIN }, { at: 6, w: 1.6, y0: 0, y1: 2.4 }, { at: 9.5, ...WIN }] : [{ at: 2.5, ...WIN }, { at: 6, ...WIN }, { at: 9.5, w: 1.0, y0: 0, y1: 2.2 }], { out: -1 });
    wallX(B, 0, bw, bd - T, y0, y1, [{ at: 2.5, ...WIN }, { at: 6, ...(f === 0 ? DOOR : WIN) }, { at: 9.5, ...WIN }], { out: 1 });
    wallZ(B, T, bd - T, 0, y0, y1, [{ at: 3.5, ...WIN }, { at: 8.7, ...WIN }, { at: 14, ...WIN }], { out: -1 });
    wallZ(B, T, bd - T, bw - T, y0, y1, [{ at: 3.5, ...WIN }, { at: 8.7, ...WIN }, { at: 14, ...WIN }], { out: 1 });
    // 階段室（中央 x=4.5〜7.5、z=6.5〜11.5）の壁と、部屋への扉
    wallZ(B, 6.5, 11.5, 4.5, y0, y1, [{ at: 2.5, ...DOOR }], { mat: M.CONCRETE });
    wallZ(B, 6.5, 11.5, 7.5 - T, y0, y1, [{ at: 2.5, ...DOOR }], { mat: M.CONCRETE });
    // 部屋の仕切り（手前と奥）
    wallX(B, T, 4.5, 6.5, y0, y1, [{ at: 2, ...DOOR }], { mat: M.DRYWALL, col: '#d6d2c8' }); wallX(B, 7.5, bw - T, 6.5, y0, y1, [{ at: 2.2, ...DOOR }], { mat: M.DRYWALL, col: '#d6d2c8' });
    wallX(B, T, 4.5, 11.5 - T, y0, y1, [{ at: 2, ...DOOR }], { mat: M.DRYWALL, col: '#d6d2c8' }); wallX(B, 7.5, bw - T, 11.5 - T, y0, y1, [{ at: 2.2, ...DOOR }], { mat: M.DRYWALL, col: '#d6d2c8' });
    if (f > 0) {
      slab(B, 0, 0, bw, bd, y0, [4.5 + T, 6.5, 6.0, 11.5]);
      // ベランダ（右の窓の扉の前。床と手すり）
      box(B, 8.4, y0 - SL, -1.3, 10.6, y0, 0, { kind: 'floor', col: '#9a9a94' });
      box(B, 8.4, y0, -1.3, 10.6, y0 + 1.0, -1.18, { kind: 'rail', col: TRIM_DARK, mat: M.METAL, opaque: false, layer: 10 });
      box(B, 8.4, y0, -1.18, 8.52, y0 + 1.0, 0, { kind: 'rail', col: TRIM_DARK, mat: M.METAL, opaque: false, layer: 10 });
      box(B, 10.48, y0, -1.18, 10.6, y0 + 1.0, 0, { kind: 'rail', col: TRIM_DARK, mat: M.METAL, opaque: false, layer: 10 });
    }
    // 部屋の家具
    furn(B, 'table', 1.5, y0, 2.4); furn(B, 'sofa', 8.4, y0, 3.8); furn(B, 'shelf', 0.6, y0, 14.5, 'z'); furn(B, 'bed', 8.6, y0, 13.8);
  }
  // 階段（階段室の左半分。各階で z=11.5 → 6.5 へ）。屋上へも
  for (let f = 0; f < F; f++) ramp(B, 4.5 + T, 6.5, 6.0, 11.5, f * FH, (f + 1) * FH, 'n');
  flatRoof(B, H - SL, 1.0);
  plinth(B, 0.3);
  // 入口のひさし・屋上の機械
  box(B, 4.6, 2.6, -1.4, 7.4, 2.78, 0, { kind: 'trim', col: TRIM_DARK, mat: M.CONCRETE, walk: false });
  box(B, 8.6, H + 0.25, 13, 10.4, H + 1.35, 15.4, { kind: 'roof', col: '#9aa0a2', mat: M.METAL, layer: 10, detail: true, bev: 0.06 });
  return B;
}

// ---- 店（12×9m、1〜2階）: 手前に大きな窓2つと扉・ひさし・看板の帯。中は棚とカウンター（遮蔽物）。平らな屋根
export function shop(ww, o) {
  const bw = 12, bd = 9, F = o.floors || 1, H = F * FH, r = o.rnd || Math.random;
  const B = begin(ww, { ...o, kind: 'shop', floors: F }, bw, bd, o.mat ?? M.BRICK, o.col || pick([...PLASTER, ...BRICKS], r));
  if (!BRICKS.includes(B.col)) B.layer = 3;
  for (let f = 0; f < F; f++) {
    const y0 = f * FH, y1 = y0 + FH;
    wallX(B, 0, bw, 0, y0, y1, f === 0 ? [{ at: 2.6, ...BIGWIN }, { at: 6, ...DOOR, w: 1.6 }, { at: 9.4, ...BIGWIN }] : [{ at: 2.5, ...WIN }, { at: 6, ...WIN }, { at: 9.5, ...WIN }], { out: -1 });
    wallX(B, 0, bw, bd - T, y0, y1, f === 0 ? [{ at: 9.8, ...DOOR }] : [{ at: 3, ...WIN }, { at: 9, ...WIN }], { out: 1 });
    wallZ(B, T, bd - T, 0, y0, y1, f === 0 ? [] : [{ at: 4.5, ...WIN }], { out: -1 });
    wallZ(B, T, bd - T, bw - T, y0, y1, [{ at: 4.5, ...WIN }], { out: 1 });
    if (f > 0) slab(B, 0, 0, bw, bd, y0, [bw - 1.6, 1.2, bw - T, 6.4]);
  }
  if (F > 1) ramp(B, bw - 1.6, 1.2, bw - T, 6.4, 0, FH, 's');
  flatRoof(B, H - SL, 0.6);
  plinth(B, 0.25);
  // ひさし（布）と看板の帯
  const aw = pick(['#8a2f2a', '#2f5a7a', '#3d6b3a', '#a0702a', '#5a5a5a'], r);
  box(B, 0.4, 2.75, -1.5, bw - 0.4, 2.9, 0, { kind: 'trim', col: aw, mat: M.FABRIC, layer: 12, walk: false });
  box(B, 1.0, 3.0, -0.12, bw - 1.0, 3.7, 0, { kind: 'trim', col: pick(['#e9e2cf', '#2b2f33', '#c9a84a', '#b8463c'], r), mat: M.METAL, layer: 19 });
  // 中: 棚の列とカウンター
  furn(B, 'counter', 0.8, 0, 6.2); furn(B, 'shelf', 3.6, 0, 3.2); furn(B, 'shelf', 3.6, 0, 5.4); furn(B, 'shelf', 7.0, 0, 3.2); furn(B, 'shelf', 7.0, 0, 5.4, 'x');
  return B;
}

// ---- 事務所（14×12m、F階）: 窓の列・中央の階段・平らな屋根と屋上の機械
export function office(ww, o) {
  const bw = 14, bd = 12, F = o.floors || 3, H = F * FH, r = o.rnd || Math.random;
  const B = begin(ww, { ...o, kind: 'office', floors: F }, bw, bd, o.mat ?? M.CONCRETE, o.col || pick(['#b5b8b6', '#c8c1b0', '#a9b0b3', '#bdb2a0'], r));
  B.layer = 1;
  const row = (n, L, extra = []) => { const ops = []; for (let k = 0; k < n; k++) ops.push({ at: L * (k + 0.5) / n, ...WIN, w: 1.6 }); return ops.concat(extra); };
  for (let f = 0; f < F; f++) {
    const y0 = f * FH, y1 = y0 + FH;
    wallX(B, 0, bw, 0, y0, y1, f === 0 ? [{ at: 2, ...WIN, w: 1.6 }, { at: 4.8, ...WIN, w: 1.6 }, { at: 7, w: 2.0, y0: 0, y1: 2.4 }, { at: 9.2, ...WIN, w: 1.6 }, { at: 12, ...WIN, w: 1.6 }] : row(5, bw), { out: -1 });
    wallX(B, 0, bw, bd - T, y0, y1, f === 0 ? row(4, bw, []).slice(0, 3).concat([{ at: 12.2, ...DOOR }]) : row(5, bw), { out: 1 });
    wallZ(B, T, bd - T, 0, y0, y1, row(3, bd - 2 * T), { out: -1 });
    wallZ(B, T, bd - T, bw - T, y0, y1, row(3, bd - 2 * T), { out: 1 });
    // 階段室（x=6〜8.5, z=4〜9）
    wallZ(B, 4, 9, 6, y0, y1, [{ at: 1.2, ...DOOR }], { mat: M.CONCRETE });
    if (f > 0) slab(B, 0, 0, bw, bd, y0, [6 + T, 4, 7.5, 9]);
    furn(B, 'desk', 1.0, y0, 1.2); furn(B, 'desk', 3.2, y0, 1.2); furn(B, 'desk', 9.2, y0, 1.2); furn(B, 'desk', 11.4, y0, 1.2); furn(B, 'shelf', 9.4, y0, 10.8); furn(B, 'desk', 1.4, y0, 9.6);
  }
  for (let f = 0; f < F; f++) ramp(B, 6 + T, 4, 7.5, 9, f * FH, (f + 1) * FH, 'n');
  flatRoof(B, H - SL, 1.0);
  plinth(B, 0.3);
  box(B, 2, H + 0.25, 7, 4.2, H + 1.6, 9.6, { kind: 'roof', col: '#9aa0a2', mat: M.METAL, layer: 10, bev: 0.06 });
  box(B, 10, H + 0.25, 2, 11.2, H + 1.1, 3.4, { kind: 'roof', col: '#8d9396', mat: M.METAL, layer: 10, detail: true, bev: 0.06 });
  return B;
}

// ---- 倉庫（20×30m、高さ7m）: 大きな開口2つ・小さな扉。中にキャットウォーク（片側）・荷の積み場・屋根の換気
export function warehouse(ww, o) {
  const bw = 20, bd = 30, H = 7, r = o.rnd || Math.random;
  const B = begin(ww, { ...o, kind: 'warehouse', floors: 1 }, bw, bd, o.mat ?? M.METAL, o.col || pick(['#7f8a86', '#8a8478', '#6f7f8a', '#8f8a7c'], r));
  B.layer = o.mat === M.WOOD ? 22 : 10;
  wallX(B, 0, bw, 0, 0, H, [{ at: 10, w: 6, y0: 0, y1: 5 }], { out: -1 });
  wallX(B, 0, bw, bd - T, 0, H, [{ at: 6, w: 5, y0: 0, y1: 4.5 }, { at: 16, ...DOOR }], { out: 1 });
  wallZ(B, T, bd - T, 0, 0, H, [{ at: 8, ...DOOR }, { at: 15, w: 2, y0: 4.6, y1: 5.8 }, { at: 22, w: 2, y0: 4.6, y1: 5.8 }], { out: -1 });
  wallZ(B, T, bd - T, bw - T, 0, H, [{ at: 15, w: 2, y0: 4.6, y1: 5.8 }, { at: 22, ...DOOR }], { out: 1 });
  // 右の壁ぞいのキャットウォーク（高さ3.5m・幅2m）と斜めの階段
  box(B, bw - 2.3, 3.25, 4, bw - T, 3.5, bd - 4, { kind: 'floor', mat: M.METAL, col: '#5d6466' });
  box(B, bw - 2.4, 3.5, 4, bw - 2.3, 4.5, bd - 4, { kind: 'rail', mat: M.METAL, col: '#5d6466', opaque: false });
  ramp(B, bw - 2.3, bd - 4, bw - T, bd - 0.5, 0, 3.5, 'n');
  // 屋根（低い切妻）と換気の箱
  slab(B, 0, 0, bw, bd, H + SL, null, { col: '#5f6668', mat: M.METAL });
  gable(B, H + SL, 1.6, 0.4, 'z', { col: o.roofCol || '#5f6668', wallCol: B.col });
  // 荷の積み場（手前の開口の横・高さ1.1m）
  box(B, 13.2, 0, -3.0, 19.8, 1.1, 0, { kind: 'floor', col: '#8e8d87', mat: M.CONCRETE });
  // 中の木箱・パレット
  for (const [cx, cz, h] of [[5, 10, 1.2], [7, 18, 2.4], [12, 13, 1.2], [4, 24, 1.2], [9, 24, 2.4], [13.5, 20, 1.2]]) box(B, cx - 0.6, 0, cz - 0.6, cx + 0.6, h, cz + 0.6, { kind: 'crate', mat: M.WOOD, col: '#8a6a44', layer: 11, bev: 0.04 });
  return B;
}
// ---- 納屋（10×16m、木）: 高い1階（5m）と切妻の屋根（棟は長い辺）。両端に大きな戸口。半分に干し草の床（階段）
export function barn(ww, o) {
  const bw = 10, bd = 16, H = 5, r = o.rnd || Math.random;
  const B = begin(ww, { ...o, kind: 'barn', floors: 1 }, bw, bd, M.WOOD, o.col || pick(['#8a3b2c', '#7b4a32', '#8f8676', '#6e3a2c'], r));
  B.layer = 22; B.trimCol = '#e3ddcf';
  wallX(B, 0, bw, 0, 0, H, [{ at: 5, w: 4, y0: 0, y1: 4 }], { out: -1 });
  wallX(B, 0, bw, bd - T, 0, H, [{ at: 5, w: 4, y0: 0, y1: 4 }], { out: 1 });
  wallZ(B, T, bd - T, 0, 0, H, [{ at: 4, ...DOOR }, { at: 11, w: 1.0, y0: 2.4, y1: 3.4 }], { out: -1 });
  wallZ(B, T, bd - T, bw - T, 0, H, [{ at: 11, ...DOOR }, { at: 5, w: 1.0, y0: 2.4, y1: 3.4 }], { out: 1 });
  // 干し草の床（奥の半分・高さ 2.8）と階段
  box(B, T, 2.55, 9, bw - T, 2.8, bd - T, { kind: 'floor', col: '#7a6448', mat: M.WOOD, layer: 4 });
  ramp(B, bw - 1.4, 3.6, bw - T, 9, 0, 2.8, 's', { col: '#7a6448' });
  slab(B, 0, 0, bw, bd, H + SL, null, { col: '#6b5a44', mat: M.WOOD });
  gable(B, H + SL, 3.0, 0.5, 'z', { col: o.roofCol || '#5a5a58' });
  // 干し草（中と干し草の床）
  for (const [x, z, y] of [[1.2, 12, 2.8], [2.6, 12.2, 2.8], [1.3, 13.5, 2.8], [7.2, 3, 0], [8.0, 4.4, 0]]) box(B, x, y, z, x + 1.2, y + 0.9, z + 0.8, { kind: 'crate', col: '#c9b56a', mat: M.FABRIC, layer: 12, bev: 0.08, detail: true });
  return B;
}
// ---- 小屋・車庫（5×6m）: 片流れの屋根、手前に戸口
export function shed(ww, o) {
  const bw = 5, bd = 6, H = 2.7, r = o.rnd || Math.random;
  const metal = o.mat === M.METAL || (o.mat == null && r() < 0.4);
  const B = begin(ww, { ...o, kind: 'shed', floors: 1 }, bw, bd, metal ? M.METAL : M.WOOD, o.col || pick(metal ? ['#7d878a', '#6f7a72', '#8a8478'] : ['#8a6a44', '#7a5e3e', '#9a8466', '#6e553a'], r));
  B.layer = metal ? 10 : 22;
  wallX(B, 0, bw, 0, 0, H, [{ at: 2.5, w: 2.4, y0: 0, y1: 2.3 }], { out: -1 });
  wallX(B, 0, bw, bd - T, 0, H, [], { out: 1 });
  wallZ(B, T, bd - T, 0, 0, H, [{ at: 3, w: 0.9, y0: 1.2, y1: 1.9 }], { out: -1 });
  wallZ(B, T, bd - T, bw - T, 0, H, [], { out: 1 });
  ramp(B, -0.3, -0.4, bw + 0.3, bd + 0.4, H + 0.6, H, 's', { smooth: true, th: 0.15, kind: 'roof', col: B.roofCol, layer: 22, mat: M.METAL });
  furn(B, 'shelf', 0.5, 0, 5.1); furn(B, 'crate', 3.4, 0, 4.2);
  return B;
}

// ---- 見張り塔（4×4m、高さ9m）: 2段の踊り場、上は胸の高さの壁
export function tower(ww, o) {
  const bw = 4, bd = 4, H = 9;
  const B = begin(ww, { ...o, kind: 'tower', floors: 3 }, bw, bd, o.mat ?? M.CONCRETE, o.col || '#9a9890');
  // 柱4本
  for (const [px, pz] of [[0, 0], [bw - 0.4, 0], [0, bd - 0.4], [bw - 0.4, bd - 0.4]]) box(B, px, 0, pz, px + 0.4, H + 3.2 - SL, pz + 0.4, { kind: 'pillar' });
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
// ---- 掩体壕（8×6m、コンクリート）: 厚い壁に銃眼、奥に入口、屋根の上に土のう
export function bunker(ww, o) {
  const bw = 8, bd = 6, H = 2.5;
  const B = begin(ww, { ...o, kind: 'bunker', floors: 1 }, bw, bd, M.CONCRETE, o.col || '#8f8e86');
  B.layer = 1;
  const W = 0.6, slit = { w: 1.4, y0: 1.25, y1: 1.6 };
  const wx = (z, ops) => wallLine(B, 0, bw, (a, b, ya, yb) => box(B, a, ya, z, b, yb, z + W), 0, H, ops);
  const wz = (x, ops) => wallLine(B, W, bd - W, (a, b, ya, yb) => box(B, x, ya, a, x + W, yb, b), 0, H, ops);
  wx(0, [{ at: 2, ...slit }, { at: 6, ...slit }]); wx(bd - W, [{ at: 6.4, w: 1.2, y0: 0, y1: 2.1 }]);
  wz(0, [{ at: 2.4, ...slit }]); wz(bw - W, [{ at: 2.4, ...slit }]);
  slab(B, -0.3, -0.3, bw + 0.3, bd + 0.3, H + 0.4, null, { col: '#86857e' });
  // 屋根の縁の土のう
  for (const [a, b, c, d] of [[-0.2, -0.2, bw + 0.2, 0.5], [-0.2, 0.5, 0.5, bd - 0.5], [bw - 0.5, 0.5, bw + 0.2, bd - 0.5]]) box(B, a, H + 0.4, b, c, H + 0.95, d, { kind: 'sandbag', mat: M.FABRIC, col: '#a28f68', layer: 12 });
  return B;
}
// ---- 壊れた家（8×10m）: 壁が欠け、屋根がない。中と外にがれき（遮蔽物の多い所）
export function ruin(ww, o) {
  const bw = 8, bd = 10, r = o.rnd || Math.random;
  const B = begin(ww, { ...o, kind: 'ruin', floors: 1 }, bw, bd, M.BRICK, o.col || pick(BRICKS, r));
  const hh = () => 0.8 + r() * 2.4;
  // 壁を短い区切りで、高さをばらばらに（欠けた所は低い）
  for (let s = 0; s < bw; s += 2) { const h = hh(); if (h > 1.0) box(B, s, 0, 0, Math.min(bw, s + 2), h, T); const h2 = hh(); if (h2 > 1.0) box(B, s, 0, bd - T, Math.min(bw, s + 2), h2, bd); }
  for (let s = T; s < bd - T; s += 2) { const h = hh(); if (h > 1.0) box(B, 0, 0, s, T, h, Math.min(bd - T, s + 2)); const h2 = hh(); if (h2 > 1.0) box(B, bw - T, 0, s, bw, h2, Math.min(bd - T, s + 2)); }
  // がれき
  for (let k = 0; k < 7; k++) { const x = 0.8 + r() * (bw - 2), z = 0.8 + r() * (bd - 2), s = 0.5 + r() * 0.8; box(B, x, 0, z, x + s * 1.4, s * 0.8, z + s, { kind: 'rock', col: pick(['#8e8a80', '#9a7a66', '#7e7a72'], r), mat: M.BRICK }); }
  return B;
}
// ---- ガソリンスタンド: 屋根（柱4本）・給油機の島2つ・売店（平らな屋根・大きな窓）
export function gasStation(ww, o) {
  const bw = 22, bd = 18, r = o.rnd || Math.random;
  const B = begin(ww, { ...o, kind: 'gas', floors: 1 }, bw, bd, M.CONCRETE, o.col || '#d9d6cf');
  B.layer = 3;
  // 給油の屋根（手前の 16×9）
  for (const [px, pz] of [[2.5, 1.5], [13.5, 1.5], [2.5, 7.5], [13.5, 7.5]]) box(B, px, 0, pz, px + 0.45, 4.6, pz + 0.45, { kind: 'pillar', col: '#d8d8d4', mat: M.METAL, layer: 19 });
  box(B, 0.5, 4.6, -0.2, 16.5, 5.2, 9.6, { kind: 'roof', col: '#e6e4de', mat: M.METAL, layer: 19, cols: null });
  box(B, 0.45, 4.95, -0.25, 16.55, 5.25, 9.65, { kind: 'trim', col: pick(['#b8322a', '#2a5d9a', '#2f7d4a'], r), mat: M.METAL, layer: 19, detail: false, walk: false });
  // 給油機の島
  for (const ix of [5.5, 10.5]) {
    box(B, ix - 0.9, 0, 2.6, ix + 0.9, 0.22, 7.0, { kind: 'floor', col: '#9e9c96', mat: M.CONCRETE });
    for (const pz of [3.4, 5.6]) box(B, ix - 0.35, 0.22, pz - 0.3, ix + 0.35, 1.75, pz + 0.3, { kind: 'pump', col: '#d6d4cc', mat: M.METAL, layer: 19, bev: 0.06 });
  }
  // 売店（奥・10×7。建物のローカル座標の中でずらして作る）
  const sx = 11.5, sz = 10.6, sw = 10, sd = 7;
  const sb = (lx0, ly0, lz0, lx1, ly1, lz1, o2 = {}) => box(B, sx + lx0, ly0, sz + lz0, sx + lx1, ly1, sz + lz1, o2);
  // 売店の壁（手前に大きな窓と扉）
  const front = [{ at: 2.4, ...BIGWIN, w: 3.2 }, { at: 6, ...DOOR, w: 1.4 }, { at: 8.6, ...BIGWIN, w: 1.6 }];
  wallLine(B, 0, sw, (a, b, ya, yb) => sb(a, ya, 0, b, yb, T), 0, 3.2, front);
  wallLine(B, 0, sw, (a, b, ya, yb) => sb(a, ya, sd - T, b, yb, sd), 0, 3.2, [{ at: 8.6, ...DOOR }]);
  wallLine(B, T, sd - T, (a, b, ya, yb) => sb(0, ya, a, T, yb, b), 0, 3.2, [{ at: 3.2, ...WIN }]);
  wallLine(B, T, sd - T, (a, b, ya, yb) => sb(sw - T, ya, a, sw, yb, b), 0, 3.2, []);
  sb(-0.1, 3.2, -0.1, sw + 0.1, 3.45, sd + 0.1, { kind: 'floor', col: '#8e9296' });
  sb(-0.1, 3.45, -0.1, sw + 0.1, 3.95, 0.12, { kind: 'roof', col: '#c9c6bd' });
  sb(1.0, 0, 2.6, 3.4, 0.92, 3.25, { kind: 'furn', detail: true, col: '#bdb7aa', mat: M.CERAMIC, bev: 0.04 });
  sb(4.4, 0, 4.0, 6.4, 1.8, 4.45, { kind: 'furn', detail: true, col: '#7a5e3e', mat: M.FURN, layer: 11, bev: 0.04 });
  sb(7.0, 0, 4.0, 9.0, 1.8, 4.45, { kind: 'furn', detail: true, col: '#7a5e3e', mat: M.FURN, layer: 11, bev: 0.04 });
  // 看板の柱
  box(B, 19.5, 0, 1.0, 19.8, 7.0, 1.3, { kind: 'pillar', col: '#8d9396', mat: M.METAL, layer: 10 });
  box(B, 18.6, 5.2, 0.95, 20.7, 6.8, 1.35, { kind: 'trim', col: '#e8e4d8', mat: M.METAL, layer: 19, walk: false });
  return B;
}

// ---- 礼拝堂（10×22m）: 手前に鐘の塔（4×4・鐘の部屋の床 8m・中に急な階段・四方が開いた鐘の部屋・とがった屋根）、
// 奥に高い広間（6m・縦長の窓・切妻の屋根・長いすの列）。町と村の目印で、塔は見張りの場所になる
export function chapel(ww, o) {
  const bw = 10, bd = 22, H = 6, r = o.rnd || Math.random;
  const B = begin(ww, { ...o, kind: 'chapel', floors: 1 }, bw, bd, M.BRICK, o.col || pick(['#d8d0bf', '#cfc6b4', '#bdb5a5', '#a6654c', '#9a5a45'], r));
  B.layer = B.col.startsWith('#a6') || B.col.startsWith('#9a') ? 2 : 3; B.trimCol = '#ece7da';
  const TW = { w: 1.0, y0: 1.8, y1: 4.8 }, BELL = { w: 2.0, y0: 8.9, y1: 10.7 };
  // 広間（z 4〜22）。前の壁は塔の両わき
  wallX(B, 0, 3, 4, 0, H, [], { out: -1 }); wallX(B, 7, bw, 4, 0, H, [], { out: -1 });
  wallX(B, 0, bw, bd - T, 0, H, [{ at: 5, ...TW }], { out: 1 });
  wallZ(B, 4 + T, bd - T, 0, 0, H, [{ at: 3, ...TW }, { at: 7.5, ...TW }, { at: 12.5, ...DOOR }], { out: -1 });
  wallZ(B, 4 + T, bd - T, bw - T, 0, H, [{ at: 3, ...TW }, { at: 7.5, ...TW }, { at: 12.5, ...TW }], { out: 1 });
  slab(B, 0, 4, bw, bd, H + SL, null, { col: '#8a857c' });
  gable(B, H + SL, 3.4, 0.45, 'z', { z0: 4, z1: bd });
  // 鐘の塔（x 3〜7・z 0〜4）: 壁・床（4m・8m。階段の穴）・階段・鐘の部屋の開口・平らな屋根ととがった屋根
  const TH = 11;
  wallX(B, 3, 7, 0, 0, TH, [{ at: 2, w: 1.4, y0: 0, y1: 2.6 }, { at: 2, w: 0.5, y0: 5.0, y1: 6.4 }, { at: 2, ...BELL }], { out: -1 });
  wallZ(B, T, 4, 3, 0, TH, [{ at: 1.85, ...BELL }, { at: 1.85, w: 0.4, y0: 5.0, y1: 6.2 }], { out: -1 });
  wallZ(B, T, 4, 7 - T, 0, TH, [{ at: 1.85, ...BELL }, { at: 1.85, w: 0.4, y0: 5.0, y1: 6.2 }], { out: 1 });
  wallX(B, 3, 7, 4, 0, TH, [{ at: 2.6, w: 1.2, y0: 0, y1: 2.3 }, { at: 2, ...BELL, y0: Math.max(BELL.y0, H + 3.7) }]);
  slab(B, 3 + T, T, 7 - T, 4, 4, [3 + T, T, 4.4, 4]);
  slab(B, 3 + T, T, 7 - T, 4, 8, [5.6, T, 7 - T, 4]);
  ramp(B, 3 + T, T, 4.4, 4, 0, 4, 'n');
  ramp(B, 5.6, T, 7 - T, 4, 4, 8, 's');
  slab(B, 2.85, -0.15, 7.15, 4.45, TH + SL, null, { col: '#77726a' });
  box(B, 2.8, TH + SL, -0.2, 7.2, TH + SL + 0.25, 4.5, { kind: 'trim', col: B.trimCol, mat: M.CONCRETE, walk: false });
  const [sx, sz] = xf(B, 5, 2.15);
  addCyl(ww, { x: sx, z: sz, r: 2.95, r1: 0.06, y0: B.y + TH + SL + 0.25, y1: B.y + TH + 5.4, mat: M.WOOD, kind: 'roof', col: B.roofCol, seg: 4, rot: Math.PI / 4, layer: 22, far: true });
  plinth(B);
  // 中: 長いすの列と祭壇
  for (let k = 0; k < 6; k++) { furn(B, 'pew', 0.7, 0, 7.2 + k * 1.9); furn(B, 'pew', 6.3, 0, 7.2 + k * 1.9); }
  box(B, 3.6, 0, 19.6, 6.4, 1.0, 20.6, { kind: 'furn', detail: true, col: '#d9d4c6', mat: M.CONCRETE, layer: 1, bev: 0.05 });
  return B;
}

// 塀（世界の座標で直線。高さ h、厚さ th）
export function wallRun(ww, x0, z0, x1, z1, h = 2.2, o = {}) {
  const th = o.th ?? 0.3, alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0), y = o.y ?? 0;
  const ex = { layer: o.layer, bev: o.bev, detail: o.detail, far: o.far };
  if (alongX) return addBox(ww, { x0: Math.min(x0, x1), z0: z0 - th / 2, x1: Math.max(x0, x1), z1: z0 + th / 2, y0: y, y1: y + h, mat: o.mat ?? M.CONCRETE, kind: o.kind || 'fence', col: o.col || '#a9a59b', opaque: o.opaque, ...ex });
  return addBox(ww, { x0: x0 - th / 2, z0: Math.min(z0, z1), x1: x0 + th / 2, z1: Math.max(z0, z1), y0: y, y1: y + h, mat: o.mat ?? M.CONCRETE, kind: o.kind || 'fence', col: o.col || '#a9a59b', opaque: o.opaque, ...ex });
}
// 土のうの列（高さ1m）・コンテナ（6×2.4×2.6）
export function sandbags(ww, x0, z0, x1, z1, y = 0) { const b = wallRun(ww, x0, z0, x1, z1, 1.0, { th: 0.7, mat: M.FABRIC, col: '#a28f68', y }); b.kind = 'sandbag'; return b; }
export function container(ww, x, z, rot = 0, y = 0, col = '#3f6f8f') {
  const [w, d] = rot % 2 ? [2.4, 6] : [6, 2.4];
  return addBox(ww, { x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, y0: y, y1: y + 2.6, mat: M.METAL, kind: 'container', col });
}
