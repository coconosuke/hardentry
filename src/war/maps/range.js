// 射撃場（独自のマップ。WAR BIT の訓練）: 谷の平らな射場に、距離ごとの標的の人形（10m〜1000m）と距離の札。
// 手前に屋根つきの射台、横に動きの練習場（家・塔・コンテナ・高さの違う塀・土のう）。奥は土手の丘、両側は山。
// BattleBit の「Shooting range」（銃と基本の操作の練習）に当たる（research/WARBIT.md の 10・12）。
import { makeWarWorld, finishWorld, heightAt, addBox, addCyl } from '../world.js';
import { house, tower, wallRun, sandbags, container } from '../buildings.js';
import { fbm, mulberry } from '../noise.js';
import { M } from '../../engine/data/materials.js';

const SX = 420, SZ = 1400, CX = 210;
export const LINE_Z = 124;       // 射台（撃つ所）の線。標的はここから +z へ
// 標的の人形: [距離 m, 横のずれ m]（手前の標的が奥の標的を隠さないように左右へ散らす）
export const RANGE_TARGETS = [[10, -16], [25, 14], [50, -24], [75, 26], [100, 0], [150, -32], [200, 32], [300, -14], [400, 18], [500, -40], [650, 40], [800, -6], [1000, 6]];
// 範囲・本陣（0: 射台の後ろ、1: 奥。人形の向きに使う）・出撃の場所
export const RANGE_AREA = {
  name: '射撃場', rect: [30, 24, SX - 30, SZ - 60], hq: [[CX, LINE_Z - 12], [CX, SZ - 160]], flags: [],
  spawns: [[[CX, LINE_Z - 8], [CX - 12, LINE_Z - 8], [CX + 12, LINE_Z - 8]], [[CX, SZ - 160]]],
};
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 地形: 射場（|x-CX| ≤ 120・z 30〜1210）は平ら。外は丘（両側）と土手（奥）
function hAt(x, z) {
  const ex = Math.max(0, Math.abs(x - CX) - 120), ezN = Math.max(0, 26 - z), ezF = Math.max(0, z - 1210);
  const e = Math.hypot(ex, ezN * 1.4, ezF * 1.1);
  let h = e * e * 0.0019 * (0.65 + 0.7 * fbm(x, z, 140, 3, 5)) + e * 0.06;
  // 射場の縁の外側（標的の列から 60m より外）は少しうねる
  const lane = Math.abs(x - CX);
  if (lane > 62) h += (fbm(x, z, 40, 2, 9) - 0.3) * 0.9 * sstep(62, 100, lane);
  return h;
}

export function buildRange(seed = 3) {
  const ww = makeWarWorld({ sx: SX, sz: SZ, hs: 2 });
  ww.mapId = 'range'; ww.areas = { range: RANGE_AREA }; ww.flagDefs = {}; ww.roads = [];
  ww.mountIn = [140, 600]; // 山の色が始まる所（中心からの距離 x・z）
  for (let j = 0; j < ww.HD; j++) for (let i = 0; i < ww.HW; i++) ww.h[j * ww.HW + i] = hAt(i * ww.hs, j * ww.hs);
  const rnd = mulberry(seed);
  const gy = (x, z) => heightAt(ww, x, z);
  // 踏み固めた地面の色（射台の前後と練習場）
  ww.pads = [[CX - 56, LINE_Z - 26, CX + 56, LINE_Z + 6], [262, 40, 340, 232]];
  // ---- 射台: 屋根（柱4本）と、胸の高さの台（6m ごと、間は 3m あけて前へ出られる）
  for (let x = CX - 48; x < CX + 48; x += 9) addBox(ww, { x0: x, z0: LINE_Z, x1: x + 6, z1: LINE_Z + 0.6, y0: 0, y1: 0.95, mat: M.CONCRETE, kind: 'bench', col: '#a19e95' });
  for (const px of [CX - 52, CX - 17, CX + 17, CX + 52]) addBox(ww, { x0: px - 0.2, z0: LINE_Z - 5.6, x1: px + 0.2, z1: LINE_Z - 5.2, y0: 0, y1: 3.2, mat: M.METAL, kind: 'pillar', col: '#6d7477' });
  for (const px of [CX - 52, CX - 17, CX + 17, CX + 52]) addBox(ww, { x0: px - 0.2, z0: LINE_Z + 0.9, x1: px + 0.2, z1: LINE_Z + 1.3, y0: 0, y1: 3.2, mat: M.METAL, kind: 'pillar', col: '#6d7477' });
  addBox(ww, { x0: CX - 53, z0: LINE_Z - 6, x1: CX + 53, z1: LINE_Z + 1.6, y0: 3.2, y1: 3.4, mat: M.METAL, kind: 'roof', col: '#59605f' });
  // 射台の後ろの土のう（伏せ撃ちの練習）
  sandbags(ww, CX - 70, LINE_Z - 2, CX - 58, LINE_Z - 2, 0); sandbags(ww, CX + 58, LINE_Z - 2, CX + 70, LINE_Z - 2, 0);
  // ---- 距離の札（射場の左の縁。白い板）と、標的の後ろの土の山（小さい土手）
  ww.signs = [];
  for (const [d, dx] of RANGE_TARGETS) {
    const z = LINE_Z + d, sx = CX - 54;
    addBox(ww, { x0: sx - 0.08, z0: z - 0.08, x1: sx + 0.08, z1: z + 0.08, y0: gy(sx, z) - 0.2, y1: gy(sx, z) + 1.3, mat: M.WOOD, kind: 'post', col: '#6b5236' });
    addBox(ww, { x0: sx - 0.9, z0: z - 0.05, x1: sx + 0.9, z1: z + 0.05, y0: gy(sx, z) + 1.3, y1: gy(sx, z) + 2.3, mat: M.WOOD, kind: 'sign', col: '#e6e3da' });
    ww.signs.push({ x: sx, y: gy(sx, z) + 2.6, z, d });
    // 50m より先の標的の後ろに土の山（弾の当たりが見える）
    if (d >= 50) { const tx = CX + dx, tz = z + 7; addBox(ww, { x0: tx - 3, z0: tz - 1.2, x1: tx + 3, z1: tz + 1.2, y0: gy(tx, tz) - 0.3, y1: gy(tx, tz) + 1.6, mat: M.EARTH, kind: 'rock', col: '#55633a' }); }
  }
  ww.rangeTargets = RANGE_TARGETS.map(([d, dx]) => ({ d, x: CX + dx, z: LINE_Z + d }));
  // ---- 動きの練習場（射台の右）: 家・塔・コンテナ・塀（1m は乗り越え、1.4m は乗り越え、2.2m は回る）・土のう
  house(ww, { x: 286, z: 168, y: 0, rot: 0, floors: 2 });
  tower(ww, { x: 318, z: 120, y: 0, rot: 0 });
  container(ww, 280, 70, 0, 0, '#56604a'); container(ww, 300, 92, 1, 0, '#3f6f8f'); container(ww, 322, 70, 0, 0, '#8f3f3f');
  container(ww, 322, 72.6, 0, 2.6, '#4f7f3f');
  wallRun(ww, 270, 120, 284, 120, 1.0, { y: 0, th: 0.4, col: '#a9a59b' });
  wallRun(ww, 270, 140, 284, 140, 1.4, { y: 0, th: 0.4, col: '#a9a59b' });
  wallRun(ww, 270, 160, 284, 160, 2.2, { y: 0, th: 0.3, col: '#a9a59b' });
  sandbags(ww, 290, 210, 310, 210, 0); sandbags(ww, 316, 196, 316, 212, 0);
  // ---- 木（丘の上だけ。射場の中には置かない）
  ww.trees = [];
  for (let k = 0; k < 2600; k++) {
    const x = 6 + rnd() * (SX - 12), z = 6 + rnd() * (SZ - 12);
    const out = Math.abs(x - CX) > 128 || z > 1222 || z < 18;
    if (!out || fbm(x, z, 180, 3, 31) < 0.05) continue;
    if (x > 255 && x < 350 && z < 245) continue;
    const y = gy(x, z), s = 0.8 + rnd() * 0.6, kind = rnd() < 0.75 ? 'pine' : 'oak';
    const c = addCyl(ww, { x, z, r: 0.22 * s, y0: y - 0.2, y1: y + 6 * s, mat: M.WOOD, kind });
    ww.trees.push({ x, y, z, s, kind, cyl: c.id });
  }
  return finishWorld(ww);
}
