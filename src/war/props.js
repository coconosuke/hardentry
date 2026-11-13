// WAR BIT の小物（遮蔽物）: 車・トラック・焼けた車・防護柵・ヘスコ・対戦車の障害物・木箱・パレット・ドラム缶・柵・石垣・生け垣・
// 干し草・丸太・電柱・街灯・ごみ箱・バス停・がれき・サイロ・給水塔・屋台・植え込み・噴水・テント（research/WARBIT.md の 13）。形は独自（低ポリ・角を落とした箱）。
// 箱は軸にそう（rot 0: 長い方が x、1: 長い方が z）。遮蔽物になる物は遠くでも描く（far）。車輪・枠などの細かい物は近くだけ（detail）
import { addBox, addCyl, addRamp, addDeco, heightAt } from './world.js';
import { M } from '../engine/data/materials.js';

export const CARCOL = ['#b8322a', '#2a5d9a', '#d9d6cf', '#3a3d40', '#6b7f5e', '#c9a84a', '#8c8f93', '#5a3f6a', '#1f4a3a', '#e3e0d6', '#7a2a2a'];
const GLASS = '#2b3138', TIRE = '#1d1f21';
const pick = (L, r) => L[Math.floor(r() * L.length) % L.length];
// 地面の高さ（四隅のいちばん低い所。坂でも浮かない）
function ground(ww, cx, cz, hx, hz) { return Math.min(heightAt(ww, cx - hx, cz - hz), heightAt(ww, cx + hx, cz - hz), heightAt(ww, cx - hx, cz + hz), heightAt(ww, cx + hx, cz + hz), heightAt(ww, cx, cz)); }
// ローカル（lx: 長い方・lz: 横）→ 世界の箱
// rot 2・3 は 0・1 を前後に裏返した向き（運転台や台の向きが逆になる）
function part(ww, cx, cz, rot, y, lx0, ly0, lz0, lx1, ly1, lz1, o) {
  const r = rot & 3;
  const [x0, z0, x1, z1] = r === 0 ? [cx + lx0, cz + lz0, cx + lx1, cz + lz1] : r === 1 ? [cx + lz0, cz + lx0, cx + lz1, cz + lx1]
    : r === 2 ? [cx - lx1, cz - lz1, cx - lx0, cz - lz0] : [cx - lz1, cz - lx1, cx - lz0, cz - lx0];
  return addBox(ww, { x0, z0, x1, z1, y0: y + ly0, y1: y + ly1, ...o });
}
const glassCols = (body) => [GLASS, GLASS, body, body, GLASS, GLASS];
function wheels(ww, cx, cz, rot, y, xs, wz, r = 0.33) {
  for (const lx of xs) for (const s of [-1, 1]) part(ww, cx, cz, rot, y, lx - r, 0, s * wz - 0.13, lx + r, r * 2, s * wz + 0.13, { kind: 'car', mat: M.CAR, col: TIRE, layer: 20, detail: true, walk: false, bev: 0.08 });
}

// 乗用車（4.4×1.8m）
export function car(ww, cx, cz, rot = 0, o = {}) {
  const r = o.rnd || Math.random, col = o.col || pick(CARCOL, r), y = o.y ?? ground(ww, cx, cz, 2.2, 1.0);
  part(ww, cx, cz, rot, y, -2.2, 0.32, -0.9, 2.2, 0.95, 0.9, { kind: 'car', mat: M.CAR, col, layer: 19, bev: 0.12, far: true });
  part(ww, cx, cz, rot, y, -1.15, 0.95, -0.82, 0.95, 1.43, 0.82, { kind: 'car', mat: M.CAR, col, layer: 19, bev: 0.14, far: true, cols: glassCols(col) });
  for (const s of [-1, 1]) part(ww, cx, cz, rot, y, s > 0 ? 2.18 : -2.3, 0.36, -0.86, s > 0 ? 2.3 : -2.18, 0.6, 0.86, { kind: 'car', mat: M.CAR, col: '#33363a', layer: 20, detail: true, walk: false });
  wheels(ww, cx, cz, rot, y, [-1.35, 1.35], 0.8);
}
// 小型トラック（5.2×1.9m。荷台つき）
export function pickup(ww, cx, cz, rot = 0, o = {}) {
  const r = o.rnd || Math.random, col = o.col || pick(CARCOL, r), y = o.y ?? ground(ww, cx, cz, 2.6, 1.0);
  part(ww, cx, cz, rot, y, -2.6, 0.4, -0.95, 2.6, 1.05, 0.95, { kind: 'car', mat: M.CAR, col, layer: 19, bev: 0.1, far: true });
  part(ww, cx, cz, rot, y, 0.2, 1.05, -0.88, 1.9, 1.62, 0.88, { kind: 'car', mat: M.CAR, col, layer: 19, bev: 0.12, far: true, cols: glassCols(col) });
  // 荷台の縁
  part(ww, cx, cz, rot, y, -2.6, 1.05, -0.95, 0.1, 1.45, -0.85, { kind: 'car', mat: M.CAR, col, layer: 19, walk: false, detail: true });
  part(ww, cx, cz, rot, y, -2.6, 1.05, 0.85, 0.1, 1.45, 0.95, { kind: 'car', mat: M.CAR, col, layer: 19, walk: false, detail: true });
  part(ww, cx, cz, rot, y, -2.6, 1.05, -0.85, -2.5, 1.45, 0.85, { kind: 'car', mat: M.CAR, col, layer: 19, walk: false, detail: true });
  wheels(ww, cx, cz, rot, y, [-1.6, 1.6], 0.86, 0.37);
}
// 大型トラック（9×2.5m。運転台と荷箱）
export function truck(ww, cx, cz, rot = 0, o = {}) {
  const r = o.rnd || Math.random, col = o.col || pick(['#c9c6bd', '#7f8a86', '#a33a2c', '#3d5c7a', '#6b6f45'], r), y = o.y ?? ground(ww, cx, cz, 4.5, 1.3);
  const cab = o.cab || pick(['#d9d6cf', '#2a5d9a', '#b8322a', '#3a3d40'], r);
  part(ww, cx, cz, rot, y, -4.5, 0.5, -1.15, 4.5, 1.05, 1.15, { kind: 'car', mat: M.METAL, col: '#3b3d40', layer: 10, far: true });
  part(ww, cx, cz, rot, y, 2.4, 1.05, -1.2, 4.5, 2.4, 1.2, { kind: 'car', mat: M.CAR, col: cab, layer: 19, bev: 0.12, far: true });
  part(ww, cx, cz, rot, y, 2.6, 2.4, -1.15, 4.4, 3.1, 1.15, { kind: 'car', mat: M.CAR, col: cab, layer: 19, bev: 0.12, far: true, cols: glassCols(cab) });
  part(ww, cx, cz, rot, y, -4.5, 1.05, -1.25, 2.3, 3.6, 1.25, { kind: 'car', mat: M.METAL, col, layer: 10, bev: 0.06, far: true });
  wheels(ww, cx, cz, rot, y, [-3.2, -2.0, 3.3], 1.05, 0.48);
}
// 焼けた車（車輪なし・煤けた色）
export function wreck(ww, cx, cz, rot = 0, o = {}) {
  const r = o.rnd || Math.random, y = o.y ?? ground(ww, cx, cz, 2.2, 1.0);
  const col = pick(['#3b3632', '#4a4038', '#55473c', '#3a3a38'], r);
  part(ww, cx, cz, rot, y, -2.2, 0.08, -0.9, 2.2, 0.8, 0.9, { kind: 'car', mat: M.CAR, col, layer: 9, bev: 0.12, far: true });
  part(ww, cx, cz, rot, y, -1.0, 0.8, -0.8, 0.9, 1.2, 0.8, { kind: 'car', mat: M.CAR, col: '#2a2826', layer: 9, bev: 0.12, far: true });
}
// コンクリートの防護柵（長さ len・高さ 0.82。下が広い）
export function jersey(ww, cx, cz, rot = 0, len = 3, o = {}) {
  const y = o.y ?? ground(ww, cx, cz, len / 2, 0.3), col = o.col || '#b9b6ad', h = len / 2;
  part(ww, cx, cz, rot, y, -h, 0, -0.3, h, 0.3, 0.3, { kind: 'barrier', mat: M.CONCRETE, col, layer: 1, bev: 0.04, far: true });
  part(ww, cx, cz, rot, y, -h + 0.02, 0.3, -0.16, h - 0.02, 0.82, 0.16, { kind: 'barrier', mat: M.CONCRETE, col, layer: 1, bev: 0.05, far: true });
}
// 防護柵を並べる（x0,z0 から x1,z1 へ、すき間 gap）
export function jerseyRun(ww, x0, z0, x1, z1, gap = 0.15, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / (3 + gap))), rot = Math.abs(x1 - x0) >= Math.abs(z1 - z0) ? 0 : 1;
  for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; jersey(ww, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, rot, 3, o); }
}
// ヘスコ（土の籠。1.1m 角を並べる。高さ h）
export function hesco(ww, x0, z0, x1, z1, h = 1.3, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 1.1));
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n, cx = x0 + (x1 - x0) * t, cz = z0 + (z1 - z0) * t, y = o.y ?? ground(ww, cx, cz, 0.55, 0.55);
    addBox(ww, { x0: cx - 0.54, z0: cz - 0.54, x1: cx + 0.54, z1: cz + 0.54, y0: y - 0.1, y1: y + h, mat: M.EARTH, kind: 'hesco', col: o.col || '#b4a37a', layer: 12, bev: 0.05, far: true });
  }
}
// 対戦車の障害物（鉄骨の十字）
export function tankTrap(ww, cx, cz, o = {}) {
  const y = o.y ?? ground(ww, cx, cz, 0.8, 0.8), c = { kind: 'trap', mat: M.METAL, col: '#55585b', layer: 10, walk: false };
  addBox(ww, { x0: cx - 0.85, z0: cz - 0.09, x1: cx + 0.85, z1: cz + 0.09, y0: y + 0.1, y1: y + 0.28, ...c });
  addBox(ww, { x0: cx - 0.09, z0: cz - 0.85, x1: cx + 0.09, z1: cz + 0.85, y0: y + 0.28, y1: y + 0.46, ...c });
  addBox(ww, { x0: cx - 0.09, z0: cz - 0.09, x1: cx + 0.09, z1: cz + 0.09, y0: y, y1: y + 1.0, ...c });
}
// 木箱の山（1.1m 角。n 個を2段まで）
export function crates(ww, cx, cz, n = 3, o = {}) {
  const r = o.rnd || Math.random, y = o.y ?? ground(ww, cx, cz, 1.2, 1.2);
  const spots = [[0, 0, 0], [1.15, 0, 0], [0, 0, 1.15], [0.55, 1.1, 0.3], [1.15, 0, 1.15], [0.6, 1.1, 1.0]];
  for (let k = 0; k < Math.min(n, spots.length); k++) {
    const [dx, dy, dz] = spots[k], s = 1.1;
    addBox(ww, { x0: cx + dx - s / 2, z0: cz + dz - s / 2, x1: cx + dx + s / 2, z1: cz + dz + s / 2, y0: y + dy, y1: y + dy + s, mat: M.WOOD, kind: 'cover', col: pick(['#8a6a44', '#7a5e3e', '#9a7a52', '#6f6a4a'], r), layer: 11, bev: 0.04, far: true });
  }
}
// パレットの山
export function pallets(ww, cx, cz, h = 0.9, o = {}) {
  const y = o.y ?? ground(ww, cx, cz, 0.6, 0.5);
  addBox(ww, { x0: cx - 0.6, z0: cz - 0.5, x1: cx + 0.6, z1: cz + 0.5, y0: y, y1: y + h, mat: M.WOOD, kind: 'cover', col: '#a58a62', layer: 4, bev: 0.03, far: true });
}
// ドラム缶（n 本をまとめて）
export function barrels(ww, cx, cz, n = 3, o = {}) {
  const r = o.rnd || Math.random, y = o.y ?? ground(ww, cx, cz, 0.8, 0.8);
  const spots = [[0, 0], [0.66, 0.1], [0.3, 0.62], [-0.4, 0.55], [0.95, 0.75], [-0.6, -0.1]];
  const col = o.col || pick(['#2f5a8a', '#8a2f2a', '#3d6b3a', '#6d6f72', '#b0892a'], r);
  for (let k = 0; k < Math.min(n, spots.length); k++) addCyl(ww, { x: cx + spots[k][0], z: cz + spots[k][1], r: 0.3, y0: y, y1: y + 0.9, mat: M.METAL, kind: 'barrel', col: r() < 0.2 ? pick(['#2f5a8a', '#8a2f2a', '#6d6f72'], r) : col, seg: 8, layer: 10 });
}
// 木の柵（柱 2.5m ごと＋横木2本。向こうが見える）
export function railFence(ww, x0, z0, x1, z1, o = {}) {
  const h = o.h ?? 1.1, col = o.col || '#7a5e3e', L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 2.5));
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  for (let k = 0; k <= n; k++) {
    const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = heightAt(ww, x, z);
    addBox(ww, { x0: x - 0.07, z0: z - 0.07, x1: x + 0.07, z1: z + 0.07, y0: y - 0.2, y1: y + h, mat: M.WOOD, kind: 'fence', col, layer: 11, opaque: false, walk: false, detail: true });
  }
  // 横木（区切りごと。地形の高さに合わせる）
  for (let k = 0; k < n; k++) {
    const ta = k / n, tb = (k + 1) / n, xa = x0 + (x1 - x0) * ta, za = z0 + (z1 - z0) * ta, xb = x0 + (x1 - x0) * tb, zb = z0 + (z1 - z0) * tb;
    const y = (heightAt(ww, xa, za) + heightAt(ww, xb, zb)) / 2;
    for (const yy of [h * 0.42, h * 0.86]) {
      if (alongX) addBox(ww, { x0: Math.min(xa, xb), z0: za - 0.03, x1: Math.max(xa, xb), z1: za + 0.03, y0: y + yy - 0.06, y1: y + yy + 0.06, mat: M.WOOD, kind: 'fence', col, layer: 11, opaque: false, walk: false, detail: true });
      else addBox(ww, { x0: xa - 0.03, z0: Math.min(za, zb), x1: xa + 0.03, z1: Math.max(za, zb), y0: y + yy - 0.06, y1: y + yy + 0.06, mat: M.WOOD, kind: 'fence', col, layer: 11, opaque: false, walk: false, detail: true });
    }
  }
}
// 板の塀（目隠し。1.8m）・石垣（1.0m）・生け垣（1.5m）: 区切り（最大 8m）ごとに地形の高さへ合わせる
function segRun(ww, x0, z0, x1, z1, seg, put) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / seg)), alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  for (let k = 0; k < n; k++) {
    const ta = k / n, tb = (k + 1) / n, xa = x0 + (x1 - x0) * ta, za = z0 + (z1 - z0) * ta, xb = x0 + (x1 - x0) * tb, zb = z0 + (z1 - z0) * tb;
    const y = Math.min(heightAt(ww, xa, za), heightAt(ww, xb, zb));
    put(alongX, Math.min(xa, xb), Math.min(za, zb), Math.max(xa, xb), Math.max(za, zb), y, k);
  }
}
export function boardFence(ww, x0, z0, x1, z1, o = {}) {
  const h = o.h ?? 1.8, col = o.col || '#8a6a44';
  segRun(ww, x0, z0, x1, z1, 6, (ax, a, b, c, d, y) => addBox(ww, ax
    ? { x0: a, z0: b - 0.05, x1: c, z1: b + 0.05, y0: y - 0.1, y1: y + h, mat: M.WOOD, kind: 'fence', col, layer: 22, far: true }
    : { x0: a - 0.05, z0: b, x1: a + 0.05, z1: d, y0: y - 0.1, y1: y + h, mat: M.WOOD, kind: 'fence', col, layer: 22, far: true }));
}
export function stoneWall(ww, x0, z0, x1, z1, o = {}) {
  const h = o.h ?? 1.0, th = o.th ?? 0.55, col = o.col || '#8e8a80';
  segRun(ww, x0, z0, x1, z1, 7, (ax, a, b, c, d, y, k) => {
    const hh = h * (0.9 + ((k * 7) % 5) * 0.04);
    addBox(ww, ax ? { x0: a, z0: b - th / 2, x1: c, z1: b + th / 2, y0: y - 0.15, y1: y + hh, mat: M.CONCRETE, kind: 'cover', col, layer: 1, bev: 0.08, far: true } : { x0: a - th / 2, z0: b, x1: a + th / 2, z1: d, y0: y - 0.15, y1: y + hh, mat: M.CONCRETE, kind: 'cover', col, layer: 1, bev: 0.08, far: true });
  });
}
export function hedge(ww, x0, z0, x1, z1, o = {}) {
  const h = o.h ?? 1.5, th = o.th ?? 1.0, col = o.col || '#3d5c2b';
  segRun(ww, x0, z0, x1, z1, 8, (ax, a, b, c, d, y, k) => {
    const hh = h * (0.92 + ((k * 3) % 4) * 0.05);
    addBox(ww, ax ? { x0: a, z0: b - th / 2, x1: c, z1: b + th / 2, y0: y - 0.1, y1: y + hh, mat: M.FABRIC, kind: 'hedge', col, layer: 21, bev: 0.18, far: true } : { x0: a - th / 2, z0: b, x1: a + th / 2, z1: d, y0: y - 0.1, y1: y + hh, mat: M.FABRIC, kind: 'hedge', col, layer: 21, bev: 0.18, far: true });
  });
}
// ぶどう畑の列（低い葉の列と、5m ごとの杭。15m ごとに 1.2m の切れ目＝列をまたいで通れる）
export function vineRow(ww, x0, z0, x1, z1, o = {}) {
  const h = o.h ?? 1.05, th = 0.45, col = o.col || '#55702f';
  segRun(ww, x0, z0, x1, z1, 5, (ax, a, b, c, d, y, k) => {
    if (k % 3 === 2) { if (ax) a += 1.2; else b += 1.2; }
    const hh = h * (0.92 + ((k * 5) % 3) * 0.05);
    addBox(ww, ax ? { x0: a, z0: b - th / 2, x1: c, z1: b + th / 2, y0: y + 0.3, y1: y + hh, mat: M.FABRIC, kind: 'vine', col, layer: 21, bev: 0.1, far: true } : { x0: a - th / 2, z0: b, x1: a + th / 2, z1: d, y0: y + 0.3, y1: y + hh, mat: M.FABRIC, kind: 'vine', col, layer: 21, bev: 0.1, far: true });
    addBox(ww, ax ? { x0: a - 0.05, z0: b - 0.05, x1: a + 0.05, z1: b + 0.05, y0: y - 0.2, y1: y + hh + 0.15, mat: M.WOOD, kind: 'pole', col: '#6b5236', layer: 11, walk: false, detail: true } : { x0: a - 0.05, z0: b - 0.05, x1: a + 0.05, z1: b + 0.05, y0: y - 0.2, y1: y + hh + 0.15, mat: M.WOOD, kind: 'pole', col: '#6b5236', layer: 11, walk: false, detail: true });
  });
}
// 干し草の丸いロール
export function hay(ww, cx, cz, n = 1, o = {}) {
  const r = o.rnd || Math.random;
  for (let k = 0; k < n; k++) {
    const x = cx + (k % 3) * 1.6 + (r() - 0.5) * 0.3, z = cz + Math.floor(k / 3) * 1.6 + (r() - 0.5) * 0.3, y = heightAt(ww, x, z);
    addCyl(ww, { x, z, r: 0.72, y0: y - 0.05, y1: y + 1.25, mat: M.FABRIC, kind: 'hay', col: pick(['#c4ae63', '#b9a35a', '#cbb873'], r), seg: 10, layer: 12, far: true });
  }
}
// 丸太の山（長さ 4m）
export function logs(ww, cx, cz, rot = 0, o = {}) {
  const y = o.y ?? ground(ww, cx, cz, 2, 1);
  const c = { mat: M.WOOD, kind: 'cover', col: '#6b5236', layer: 11, bev: 0.16, far: true };
  part(ww, cx, cz, rot, y, -2, 0, -1.0, 2, 0.5, 1.0, c);
  part(ww, cx, cz, rot, y, -1.9, 0.5, -0.75, 1.9, 1.0, 0.75, c);
  part(ww, cx, cz, rot, y, -1.8, 1.0, -0.4, 1.8, 1.45, 0.4, c);
}
// 電柱（木。上に腕木）
export function pole(ww, cx, cz, o = {}) {
  const y = heightAt(ww, cx, cz), h = o.h ?? 9;
  addCyl(ww, { x: cx, z: cz, r: 0.15, r1: 0.11, y0: y - 0.3, y1: y + h, mat: M.WOOD, kind: 'pole', col: '#5f4b34', seg: 6, layer: 11, far: true });
  addBox(ww, { x0: cx - 1.0, z0: cz - 0.06, x1: cx + 1.0, z1: cz + 0.06, y0: y + h - 0.7, y1: y + h - 0.55, mat: M.WOOD, kind: 'pole', col: '#5f4b34', layer: 11, walk: false, detail: true });
}
// 街灯（細い柱・腕・灯り）
export function lamp(ww, cx, cz, rot = 0, o = {}) {
  const y = heightAt(ww, cx, cz), c = { mat: M.METAL, kind: 'pole', col: '#5a5e62', layer: 10, walk: false, detail: true };
  addBox(ww, { x0: cx - 0.08, z0: cz - 0.08, x1: cx + 0.08, z1: cz + 0.08, y0: y, y1: y + 6, ...c });
  const [dx, dz] = [[1, 0], [0, 1], [-1, 0], [0, -1]][rot % 4];
  addBox(ww, { x0: Math.min(cx, cx + dx * 1.4) - 0.05, z0: Math.min(cz, cz + dz * 1.4) - 0.05, x1: Math.max(cx, cx + dx * 1.4) + 0.05, z1: Math.max(cz, cz + dz * 1.4) + 0.05, y0: y + 5.85, y1: y + 5.97, ...c });
  addBox(ww, { x0: cx + dx * 1.4 - 0.25, z0: cz + dz * 1.4 - 0.18, x1: cx + dx * 1.4 + 0.25, z1: cz + dz * 1.4 + 0.18, y0: y + 5.7, y1: y + 5.88, ...c, col: '#e8e4d0' });
}
// ごみ箱（大きい金属の箱）
export function dumpster(ww, cx, cz, rot = 0, o = {}) {
  const r = o.rnd || Math.random, y = o.y ?? ground(ww, cx, cz, 1, 0.7), col = o.col || pick(['#2f5a3a', '#2f4a6a', '#5a5e62', '#7a4a2a'], r);
  part(ww, cx, cz, rot, y, -1.0, 0, -0.65, 1.0, 1.15, 0.65, { kind: 'cover', mat: M.METAL, col, layer: 10, bev: 0.06, far: true });
  part(ww, cx, cz, rot, y, -1.04, 1.15, -0.7, 1.04, 1.25, 0.7, { kind: 'cover', mat: M.METAL, col: '#2b2e30', layer: 20, detail: true, walk: false });
}
// バス停（屋根・背の板・腰掛け）
export function busStop(ww, cx, cz, rot = 0) {
  const y = ground(ww, cx, cz, 1.6, 0.8), c = { kind: 'cover', mat: M.METAL, col: '#6f7477', layer: 10 };
  part(ww, cx, cz, rot, y, -1.6, 2.4, -0.8, 1.6, 2.55, 0.8, { ...c, far: true, walk: false });
  part(ww, cx, cz, rot, y, -1.55, 0, 0.62, 1.55, 2.4, 0.72, { ...c, col: '#39424a', far: true });
  part(ww, cx, cz, rot, y, -1.2, 0.45, 0.2, 1.2, 0.55, 0.6, { ...c, detail: true });
}
// がれき（小さい塊をいくつか）
export function rubble(ww, cx, cz, n = 5, o = {}) {
  const r = o.rnd || Math.random;
  for (let k = 0; k < n; k++) {
    const x = cx + (r() - 0.5) * 3, z = cz + (r() - 0.5) * 3, s = 0.35 + r() * 0.7, y = heightAt(ww, x, z) - 0.15;
    addBox(ww, { x0: x - s, z0: z - s * 0.8, x1: x + s, z1: z + s * 0.8, y0: y, y1: y + s * (0.6 + r() * 0.6), mat: M.CONCRETE, kind: 'rock', col: pick(['#8e8a80', '#9a7a66', '#7e7a72', '#a39d92'], r), far: true });
  }
}
// 掩体の囲い（四角の土のう。口を1つあける）
export function foxhole(ww, cx, cz, open = 's', o = {}) {
  const s = o.s ?? 2.4, y = o.y ?? heightAt(ww, cx, cz);
  const L = [['n', cx - s, cz - s, cx + s, cz - s], ['s', cx - s, cz + s, cx + s, cz + s], ['w', cx - s, cz - s + 0.4, cx - s, cz + s - 0.4], ['e', cx + s, cz - s + 0.4, cx + s, cz + s - 0.4]];
  for (const [d, a, b, c, e] of L) {
    if (d === open) { // 口の両側だけ
      if (a === c) { addSand(ww, a, b, a, (b + e) / 2 - 0.8, y); addSand(ww, a, (b + e) / 2 + 0.8, a, e, y); }
      else { addSand(ww, a, b, (a + c) / 2 - 0.8, b, y); addSand(ww, (a + c) / 2 + 0.8, b, c, b, y); }
    } else addSand(ww, a, b, c, e, y);
  }
}
function addSand(ww, x0, z0, x1, z1, y) {
  const th = 0.7, h = 1.0, alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  if (alongX) addBox(ww, { x0: Math.min(x0, x1), z0: z0 - th / 2, x1: Math.max(x0, x1), z1: z0 + th / 2, y0: y, y1: y + h, mat: M.FABRIC, kind: 'sandbag', col: '#a28f68' });
  else addBox(ww, { x0: x0 - th / 2, z0: Math.min(z0, z1), x1: x0 + th / 2, z1: Math.max(z0, z1), y0: y, y1: y + h, mat: M.FABRIC, kind: 'sandbag', col: '#a28f68' });
}

// サイロ（円柱＋円すいの屋根＋外の梯子）
export function silo(ww, cx, cz, r = 3.5, h = 14, o = {}) {
  const y = o.y ?? ground(ww, cx, cz, r * 0.7, r * 0.7), col = o.col || '#b9bcb8';
  addCyl(ww, { x: cx, z: cz, r, y0: y - 0.3, y1: y + h, mat: M.METAL, kind: 'silo', col, seg: 14, layer: 10, far: true });
  addCyl(ww, { x: cx, z: cz, r: r + 0.12, r1: 0.45, y0: y + h, y1: y + h + r * 0.55, mat: M.METAL, kind: 'silo', col: o.top || '#8d9195', seg: 14, layer: 10, far: true });
  addBox(ww, { x0: cx + r - 0.02, z0: cz - 0.25, x1: cx + r + 0.14, z1: cz + 0.25, y0: y + 0.6, y1: y + h, mat: M.METAL, kind: 'rail', col: '#55585b', layer: 10, walk: false, opaque: false, detail: true });
}
// 給水塔（脚4本と筋交い・筒の槽・円すいの屋根）
export function waterTower(ww, cx, cz, o = {}) {
  const y = o.y ?? heightAt(ww, cx, cz), H = o.h ?? 10, r = 2.6, col = o.col || '#8e9aa0', leg = { mat: M.METAL, kind: 'pole', col: '#5f6467', layer: 10, walk: false };
  for (const [dx, dz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) addBox(ww, { x0: cx + dx - 0.15, z0: cz + dz - 0.15, x1: cx + dx + 0.15, z1: cz + dz + 0.15, y0: y - 0.3, y1: y + H, ...leg, far: true });
  for (const hy of [H * 0.35, H * 0.7]) {
    addBox(ww, { x0: cx - 1.8, z0: cz - 1.86, x1: cx + 1.8, z1: cz - 1.74, y0: y + hy, y1: y + hy + 0.12, ...leg, detail: true });
    addBox(ww, { x0: cx - 1.8, z0: cz + 1.74, x1: cx + 1.8, z1: cz + 1.86, y0: y + hy, y1: y + hy + 0.12, ...leg, detail: true });
    addBox(ww, { x0: cx - 1.86, z0: cz - 1.8, x1: cx - 1.74, z1: cz + 1.8, y0: y + hy, y1: y + hy + 0.12, ...leg, detail: true });
    addBox(ww, { x0: cx + 1.74, z0: cz - 1.8, x1: cx + 1.86, z1: cz + 1.8, y0: y + hy, y1: y + hy + 0.12, ...leg, detail: true });
  }
  addCyl(ww, { x: cx, z: cz, r, y0: y + H, y1: y + H + 4, mat: M.METAL, kind: 'silo', col, seg: 12, layer: 10, far: true });
  addCyl(ww, { x: cx, z: cz, r: r + 0.1, r1: 0.3, y0: y + H + 4, y1: y + H + 5.2, mat: M.METAL, kind: 'silo', col: o.top || '#6d777c', seg: 12, layer: 10, far: true });
}
// 市場の屋台（3×2.3m。柱4本・布の屋根・台。台の前は -z（rot で回す））
export function stall(ww, cx, cz, rot = 0, o = {}) {
  const r = o.rnd || Math.random, y = o.y ?? ground(ww, cx, cz, 1.6, 1.2), col = o.col || pick(['#b8463c', '#2f6a8a', '#d0a23a', '#3d7a4a', '#d9d6cf'], r);
  const post = { mat: M.WOOD, kind: 'pole', col: '#6b5236', layer: 11, walk: false, detail: true };
  for (const [lx, lz] of [[-1.45, -1.05], [1.45, -1.05], [-1.45, 1.05], [1.45, 1.05]]) part(ww, cx, cz, rot, y, lx - 0.06, 0, lz - 0.06, lx + 0.06, 2.3, lz + 0.06, post);
  part(ww, cx, cz, rot, y, -1.55, 2.3, -1.3, 1.55, 2.42, 1.2, { kind: 'trim', mat: M.FABRIC, col, layer: 12, walk: false, far: true });
  part(ww, cx, cz, rot, y, -1.4, 0, -1.0, 1.4, 0.95, -0.4, { kind: 'cover', mat: M.WOOD, col: '#8a6a44', layer: 11, bev: 0.03, far: true });
  for (let k = 0; k < 3; k++) part(ww, cx, cz, rot, y, -1.25 + k * 0.85, 0.95, -0.92, -0.7 + k * 0.85, 1.22, -0.48, { kind: 'cover', mat: M.FABRIC, col: pick(['#c9a84a', '#a6654c', '#6b7f5e', '#d9d6cf', '#b8463c'], r), layer: 12, detail: true, walk: false });
  part(ww, cx, cz, rot, y, -1.4, 0, 0.75, -0.3, 0.8, 1.0, { kind: 'cover', mat: M.WOOD, col: '#7a5e3e', layer: 11, detail: true });
}
// 植え込み（コンクリートの枠＋低い茂み）
export function planter(ww, x0, z0, x1, z1, o = {}) {
  const y = o.y ?? Math.min(heightAt(ww, x0, z0), heightAt(ww, x1, z1), heightAt(ww, x0, z1), heightAt(ww, x1, z0)), h = o.h ?? 0.7;
  addBox(ww, { x0, z0, x1, z1, y0: y - 0.15, y1: y + h, mat: M.CONCRETE, kind: 'cover', col: o.col || '#b5b0a5', layer: 1, bev: 0.06, far: true });
  if (o.bush !== false) addBox(ww, { x0: x0 + 0.25, z0: z0 + 0.25, x1: x1 - 0.25, z1: z1 - 0.25, y0: y + h, y1: y + h + 0.5, mat: M.FABRIC, kind: 'hedge', col: '#4a6b33', layer: 21, bev: 0.15, far: true });
  else addBox(ww, { x0: x0 + 0.15, z0: z0 + 0.15, x1: x1 - 0.15, z1: z1 - 0.15, y0: y + h, y1: y + h + 0.04, mat: M.EARTH, kind: 'trim', col: '#5a4a36', layer: 9, detail: true, walk: false });
}
// 噴水（丸い石の縁・水の面・真ん中の台）。拠点の旗の柱はこの真ん中に立つ
export function basin(ww, cx, cz, r = 3.4, o = {}) {
  const y = o.y ?? heightAt(ww, cx, cz);
  addCyl(ww, { x: cx, z: cz, r, y0: y - 0.2, y1: y + 0.75, mat: M.CONCRETE, kind: 'cover', col: '#b8b2a6', seg: 16, layer: 1, far: true });
  addCyl(ww, { x: cx, z: cz, r: r - 0.35, y0: y + 0.6, y1: y + 0.78, mat: M.CONCRETE, kind: 'cover', col: '#5d7f8a', seg: 16, layer: 19, far: true, opaque: false });
  addCyl(ww, { x: cx, z: cz, r: 0.75, y0: y + 0.7, y1: y + 1.6, mat: M.CONCRETE, kind: 'cover', col: '#a9a398', seg: 10, layer: 1, far: true });
  addCyl(ww, { x: cx, z: cz, r: 1.3, r1: 1.5, y0: y + 1.6, y1: y + 1.85, mat: M.CONCRETE, kind: 'cover', col: '#b8b2a6', seg: 12, layer: 1, far: true });
}
// テント（4.2×6m の三角。棟は rot 0 で z の向き）
export function tent(ww, cx, cz, rot = 0, o = {}) {
  const y = o.y ?? ground(ww, cx, cz, 2.2, 3.1), col = o.col || '#5d6247', W = 2.1, L = 3.0, H = 2.3;
  const c = { th: 0.08, mat: M.FABRIC, col, smooth: true, kind: 'roof', layer: 18 };
  const dark = '#' + [1, 3, 5].map(i => Math.round(parseInt(col.slice(i, i + 2), 16) * 0.72).toString(16).padStart(2, '0')).join('');
  if (rot % 2 === 0) {
    addRamp(ww, { x0: cx - W, z0: cz - L, x1: cx, z1: cz + L, y0: y, y1: y + H, dir: 'e', ...c });
    addRamp(ww, { x0: cx, z0: cz - L, x1: cx + W, z1: cz + L, y0: y, y1: y + H, dir: 'w', ...c });
    addDeco(ww, { pts: [[cx - W, y, cz + L], [cx + W, y, cz + L], [cx, y + H, cz + L]], n: [0, 0, 1], col: dark, layer: 18 });
    addDeco(ww, { pts: [[cx - W, y, cz - L], [cx - 0.5, y, cz - L], [cx, y + H, cz - L]], n: [0, 0, -1], col: dark, layer: 18 });
  } else {
    addRamp(ww, { x0: cx - L, z0: cz - W, x1: cx + L, z1: cz, y0: y, y1: y + H, dir: 's', ...c });
    addRamp(ww, { x0: cx - L, z0: cz, x1: cx + L, z1: cz + W, y0: y, y1: y + H, dir: 'n', ...c });
    addDeco(ww, { pts: [[cx + L, y, cz - W], [cx + L, y, cz + W], [cx + L, y + H, cz]], n: [1, 0, 0], col: dark, layer: 18 });
    addDeco(ww, { pts: [[cx - L, y, cz - W], [cx - L, y, cz - 0.5], [cx - L, y + H, cz]], n: [-1, 0, 0], col: dark, layer: 18 });
  }
}
