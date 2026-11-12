// リバーベンド（独自のマップ）: 南北に曲がって流れる川（今は水のない川床）と、その東の町・西の工場・農場・電波塔の丘・東の村・石切り場。
// 世界 1400m 四方（まわり 100m は山。遊べるのは内側）。人数で範囲が3つ（小 500m・中 800m・大 1200m）。
import { makeWarWorld, finishWorld, heightAt, addCyl, addBox, addRamp } from '../world.js';
import { house, apartment, warehouse, tower, wallRun, sandbags, container } from '../buildings.js';
import { fbm, mulberry } from '../noise.js';
import { M } from '../../engine/data/materials.js';

export const SIZE = 1400;
const CX = 700, CZ = 700;
// 川の中心線（x = f(z)）
const riverX = (z) => CX - 20 + 70 * Math.sin((z - 200) / 170) + 25 * Math.sin(z / 61);

// 範囲（小・中・大）と本陣・拠点。拠点の名前は場所の名前
export const AREAS = {
  small: { name: '小（16対16）', per: 16, rect: [470, 450, 970, 950], hq: [[520, 700], [920, 700]], flags: ['C', 'D', 'B', 'E'] },
  medium: { name: '中（32対32）', per: 32, rect: [320, 300, 1120, 1100], hq: [[370, 700], [1070, 700]], flags: ['A', 'B', 'C', 'D', 'E'] },
  large: { name: '大（64対64）', per: 64, rect: [100, 100, 1300, 1300], hq: [[160, 700], [1240, 700]], flags: ['G', 'A', 'B', 'C', 'D', 'E', 'F', 'H'] },
};
export const FLAGS = {
  A: { name: '農場', x: 470, z: 860, r: 22 },
  B: { name: '工場', x: 560, z: 600, r: 26 },
  C: { name: '橋', x: 700, z: 700, r: 18 },
  D: { name: '町の広場', x: 790, z: 720, r: 20 },
  E: { name: '電波塔の丘', x: 860, z: 500, r: 22 },
  F: { name: '東の村', x: 1010, z: 900, r: 22 },
  G: { name: '石切り場', x: 330, z: 470, r: 26 },
  H: { name: '十字路', x: 650, z: 1000, r: 20 },
};
// 平らにする場所（中心・半径・高さは自然の高さの平均）
const PADS = [
  { x: 560, z: 600, r: 75 }, { x: 790, z: 720, r: 95 }, { x: 470, z: 860, r: 55 }, { x: 1010, z: 900, r: 60 }, { x: 650, z: 1000, r: 35 },
  { x: 160, z: 700, r: 45 }, { x: 1240, z: 700, r: 45 }, { x: 370, z: 700, r: 35 }, { x: 1070, z: 700, r: 35 }, { x: 520, z: 700, r: 30 }, { x: 920, z: 700, r: 30 },
];
// 道（折れ線。幅8m）
const ROADS = [
  [[100, 700], [370, 700], [520, 700], [640, 700], [760, 700], [920, 700], [1070, 700], [1300, 700]],
  [[560, 600], [560, 700]], [[790, 720], [790, 600], [860, 520]], [[650, 700], [650, 1000], [650, 1300]], [[790, 720], [1010, 900]], [[470, 860], [560, 700]], [[330, 470], [520, 700]],
];

function naturalH(x, z) {
  let h = 14 * fbm(x, z, 420, 4, 3) + 5 * fbm(x, z, 120, 3, 9);
  // 電波塔の丘
  h += 26 * Math.exp(-((x - 860) ** 2 + (z - 500) ** 2) / (2 * 70 * 70));
  // 南の丘陵
  h += 14 * Math.exp(-((x - 900) ** 2 + (z - 1150) ** 2) / (2 * 160 * 160));
  // 石切り場（くぼみ）
  h -= 9 * Math.exp(-((x - 330) ** 2 + (z - 470) ** 2) / (2 * 45 * 45));
  // まわりの山（遊べる範囲の外）: 尾根と谷のある丘陵（壁のように見えないよう、高さと立ち上がりを場所ごとに変える）
  const e = Math.max(0, Math.max(Math.abs(x - CX), Math.abs(z - CZ)) - 590);
  if (e > 0) { const k = 0.55 + 0.45 * fbm(x, z, 140, 3, 55); h += e * e * 0.0042 * k + e * 0.12 * (0.5 + 0.5 * fbm(x, z, 60, 2, 61)); }
  return h;
}
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
export function roadDist(x, z) {
  let d = 1e9;
  for (const r of ROADS) for (let k = 0; k + 1 < r.length; k++) d = Math.min(d, segDist(x, z, r[k][0], r[k][1], r[k + 1][0], r[k + 1][1]));
  return d;
}
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const RIVERBEND_AREAS = AREAS;
export function buildRiverbend(seed = 7) {
  const ww = makeWarWorld({ sx: SIZE, sz: SIZE, hs: 2 });
  ww.mapId = 'riverbend'; ww.areas = AREAS; ww.flagDefs = FLAGS; ww.roads = ROADS; ww.riverX = riverX; ww.roadDist = roadDist;
  // 平らにする高さ（自然の高さの平均）
  for (const p of PADS) { let s = 0, n = 0; for (let a = 0; a < 16; a++) { const r = p.r * 0.6; s += naturalH(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r); n++; } p.h = s / n; }
  const W = ww.HW;
  for (let j = 0; j < ww.HD; j++) for (let i = 0; i < W; i++) {
    const x = i * ww.hs, z = j * ww.hs;
    let h = naturalH(x, z);
    // 町など: 平らに（縁はなだらかに）
    for (const p of PADS) { const d = Math.hypot(x - p.x, z - p.z); const k = 1 - sstep(p.r * 0.75, p.r * 1.35, d); if (k > 0) h = h + (p.h - h) * k; }
    // 道: 少し平らに
    const rd = roadDist(x, z);
    if (rd < 12) { const k = 1 - sstep(4, 12, rd); h = h * (1 - 0.35 * k) + (h - 0.15) * 0.35 * k; }
    // 川床（幅24m・深さ3.5m。橋のあたりは土手）
    const dr = Math.abs(x - riverX(z));
    if (dr < 22) h -= 3.5 * (1 - sstep(8, 22, dr)) * (1 - sstep(560, 620, Math.max(Math.abs(x - CX), Math.abs(z - CZ))));
    ww.h[j * W + i] = h;
  }
  const rnd = mulberry(seed);
  const gy = (x, z) => heightAt(ww, x, z);
  // ---- 町（川の東。広場のまわり）
  const town = [
    ['apartment', 740, 650, 0, 3], ['apartment', 760, 770, 2, 4], ['apartment', 830, 650, 1, 3],
    ['house', 815, 760, 0, 2], ['house', 830, 780, 2, 2], ['house', 850, 740, 1, 2], ['house', 735, 735, 3, 2], ['house', 860, 690, 0, 1], ['house', 715, 790, 1, 2],
  ];
  for (const [k, x, z, rot, F] of town) placeBld(ww, k, x, z, rot, F);
  // 広場の噴水の代わりに低い壁と土のう
  sandbags(ww, 780, 712, 796, 712, gy(788, 712)); sandbags(ww, 780, 730, 796, 730, gy(788, 730));
  // ---- 工場（川の西）
  placeBld(ww, 'warehouse', 520, 560, 0); placeBld(ww, 'warehouse', 575, 610, 1); placeBld(ww, 'tower', 600, 560, 0);
  for (const [x, z, r] of [[540, 640, 0], [548, 646, 1], [600, 640, 0], [512, 620, 1]]) container(ww, x, z, r, gy(x, z), ['#3f6f8f', '#8f3f3f', '#4f7f3f', '#8f7f3f'][Math.floor(rnd() * 4)]);
  wallRun(ww, 495, 540, 625, 540, 2.4, { y: gy(560, 540) }); wallRun(ww, 495, 540, 495, 665, 2.4, { y: gy(495, 600) });
  // ---- 農場
  placeBld(ww, 'house', 455, 845, 0, 2); placeBld(ww, 'warehouse', 480, 880, 1, 1, { col: '#8a5a3c', mat: M.WOOD });
  for (let k = 0; k < 6; k++) { const x = 420 + k * 6, z = 830; wallRun(ww, x, z, x + 4.5, z, 1.1, { th: 0.15, mat: M.WOOD, col: '#7a5a3a', y: gy(x, z) }); }
  // ---- 電波塔の丘（塔2本と土のう）
  placeBld(ww, 'tower', 850, 490, 0); placeBld(ww, 'tower', 872, 512, 1);
  for (const [a, b] of [[[840, 470], [860, 470]], [[880, 500], [880, 520]], [[835, 520], [855, 520]]]) sandbags(ww, a[0], a[1], b[0], b[1], gy((a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
  // ---- 東の村
  for (const [x, z, rot] of [[990, 880, 0], [1020, 885, 1], [1000, 915, 2], [1035, 915, 3], [975, 905, 1]]) placeBld(ww, 'house', x, z, rot, 1 + Math.floor(rnd() * 2));
  // ---- 十字路（ガソリンスタンドの代わりの小屋と塀）
  placeBld(ww, 'house', 660, 990, 1, 1); wallRun(ww, 630, 1012, 645, 1012, 1.4, { y: gy(638, 1012) });
  // ---- 石切り場（大きな岩と小屋）
  placeBld(ww, 'house', 300, 455, 0, 1);
  for (let k = 0; k < 18; k++) { const a = rnd() * Math.PI * 2, r = 15 + rnd() * 35, x = 330 + Math.cos(a) * r, z = 470 + Math.sin(a) * r; rock(ww, x, z, 1.5 + rnd() * 3, rnd); }
  // ---- 本陣（6つ）: 土のうの囲いとコンテナ
  for (const s of Object.values(AREAS)) for (const [x, z] of s.hq) { container(ww, x - 12, z - 8, 0, gy(x - 12, z - 8), '#56604a'); container(ww, x + 12, z + 8, 0, gy(x + 12, z + 8), '#56604a'); sandbags(ww, x - 8, z + 14, x + 8, z + 14, gy(x, z + 14)); }
  // ---- 橋（川の上の坂の板。両岸の高さが違うので、ゆるい坂でつなぐ。欄干は 4m ごとに坂に合わせる）
  { const z0 = 694, z1 = 706, xa = riverX(700) - 26, xb = riverX(700) + 26; const ya = gy(xa, 700) + 0.05, yb = gy(xb, 700) + 0.05;
    addRamp(ww, { x0: xa, z0, x1: xb, z1, y0: Math.min(ya, yb), y1: Math.max(ya, yb), dir: ya <= yb ? 'e' : 'w', th: 0.6, mat: M.CONCRETE, col: '#9b9a94', smooth: true, kind: 'bridge' });
    const N = Math.ceil((xb - xa) / 4);
    for (let s = 0; s < N; s++) {
      const a = xa + (xb - xa) * s / N, b = xa + (xb - xa) * (s + 1) / N, y = ya + (yb - ya) * ((s + 0.5) / N);
      addBox(ww, { x0: a, z0: z0 - 0.3, x1: b, z1: z0, y0: y - 0.2, y1: y + 1.0, mat: M.CONCRETE, kind: 'rail', col: '#9b9a94' });
      addBox(ww, { x0: a, z0: z1, x1: b, z1: z1 + 0.3, y0: y - 0.2, y1: y + 1.0, mat: M.CONCRETE, kind: 'rail', col: '#9b9a94' });
    }
    // 橋脚（川床から板の下まで）
    for (const t of [0.33, 0.66]) { const x = xa + (xb - xa) * t, y = ya + (yb - ya) * t; addBox(ww, { x0: x - 0.6, z0: z0 + 1, x1: x + 0.6, z1: z1 - 1, y0: gy(x, 700) - 0.5, y1: y - 0.6, mat: M.CONCRETE, kind: 'pier', col: '#8c8b85' }); } }
  // ---- 森と岩（道・建物・川・本陣から離れた所）
  const near = (x, z) => {
    if (roadDist(x, z) < 9) return true;
    if (Math.abs(x - riverX(z)) < 14) return true;
    for (const b of ww.blds || []) { const r = b.rect; if (x > r[0] - 6 && x < r[2] + 6 && z > r[1] - 6 && z < r[3] + 6) return true; }
    for (const s of Object.values(AREAS)) for (const [hx, hz] of s.hq) if (Math.hypot(x - hx, z - hz) < 30) return true;
    for (const f of Object.values(FLAGS)) if (Math.hypot(x - f.x, z - f.z) < f.r + 6) return true;
    return false;
  };
  ww.trees = [];
  for (let k = 0; k < 9000; k++) {
    const x = 60 + rnd() * (SIZE - 120), z = 60 + rnd() * (SIZE - 120);
    const dens = fbm(x, z, 260, 3, 21);
    if (dens < 0.12 && rnd() > 0.04) continue;
    if (near(x, z)) continue;
    const y = gy(x, z), s = 0.8 + rnd() * 0.6, kind = rnd() < 0.7 ? 'pine' : 'oak';
    const c = addCyl(ww, { x, z, r: 0.22 * s, y0: y - 0.2, y1: y + 6 * s, mat: M.WOOD, kind });
    ww.trees.push({ x, y, z, s, kind, cyl: c.id });
  }
  for (let k = 0; k < 220; k++) { const x = 80 + rnd() * (SIZE - 160), z = 80 + rnd() * (SIZE - 160); if (near(x, z)) continue; rock(ww, x, z, 0.8 + rnd() * 2.2, rnd); }
  return finishWorld(ww);
}

function rock(ww, x, z, s, rnd) {
  const y = heightAt(ww, x, z) - 0.3 * s;
  const col = ['#8a8780', '#7c7a74', '#95918a'][Math.floor(rnd() * 3)];
  addBox(ww, { x0: x - s, z0: z - s * 0.8, x1: x + s, z1: z + s * 0.8, y0: y, y1: y + s * 1.1, mat: M.CONCRETE, kind: 'rock', col });
  if (s > 1.4) addBox(ww, { x0: x - s * 0.5, z0: z - s * 0.4, x1: x + s * 0.7, z1: z + s * 0.6, y0: y + s * 1.1, y1: y + s * 1.6, mat: M.CONCRETE, kind: 'rock', col });
}
// 建物を置く（下の地形の一番低い所に合わせ、建物の下を平らにならす）
function placeBld(ww, kind, cx, cz, rot, floors = 1, o = {}) {
  const dims = { house: [8, 10], apartment: [12, 18], warehouse: [20, 30], tower: [4, 4] }[kind];
  const [bw, bd] = rot % 2 ? [dims[1], dims[0]] : dims;
  const x = cx - bw / 2, z = cz - bd / 2;
  // 足もとの高さ: 四隅と中心の平均。建物の下と1m外まで、その高さにならす
  let s = 0; const pts = [[x, z], [x + bw, z], [x, z + bd], [x + bw, z + bd], [cx, cz]];
  for (const [px, pz] of pts) s += heightAt(ww, px, pz);
  const y = s / pts.length;
  const i0 = Math.max(0, Math.floor((x - 2) / ww.hs)), i1 = Math.min(ww.HW - 1, Math.ceil((x + bw + 2) / ww.hs));
  const j0 = Math.max(0, Math.floor((z - 2) / ww.hs)), j1 = Math.min(ww.HD - 1, Math.ceil((z + bd + 2) / ww.hs));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) ww.h[j * ww.HW + i] = y - 0.02;
  const f = { house, apartment, warehouse, tower }[kind];
  return f(ww, { x, z, y, rot, floors, ...o });
}
