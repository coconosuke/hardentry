// リバーベンド（独自のマップ）: 南北に曲がって流れる川（今は水のない川床）と、その東の町・西の工場・農場・電波塔の丘・東の村・石切り場・十字路。
// 世界 1400m 四方（まわり 100m は山。遊べるのは内側）。人数で範囲が3つ（小 500m・中 800m・大 1200m）。
// 2（11-13 の作り直し。research/WARBIT.md の 13）: 拠点のまわりを建物と遮蔽物で埋め、拠点の間にも遮蔽物を散らす。
//   町は道の格子にそって家・店・アパート・事務所を並べ（裏庭の塀・生け垣・車道の車・小屋）、広場（D）は噴水と屋台と植え込み。
//   工場はコンテナの囲いと倉庫・サイロ・煙突・塀、丘は塔と掩体壕と壕と土のう、農場は納屋とサイロと干し草、村と十字路は家とガソリンスタンド。
//   道には焼けた車・電柱、畑には生け垣と石垣、ところどころに農家・壊れた家・掩体。
// 置き方: まず建物（下の地面をならす。まわりはなだらかに）、次に小物（2m の升目で重ならないように。道・川・拠点の真ん中を避ける）、最後に木と岩
import { makeWarWorld, finishWorld, heightAt, addCyl, addBox, addRamp, addBush } from '../world.js';
import { house, bungalow, apartment, shop, office, warehouse, barn, shed, tower, bunker, ruin, gasStation, chapel, wallRun, sandbags, container } from '../buildings.js';
import { car, pickup, truck, wreck, barrels, basin, busStop, crates, dumpster, foxhole, hay, hesco, jerseyRun, lamp, logs, pallets, planter, pole, rubble, silo, stall, stoneWall, tankTrap, tent, waterTower, boardFence, hedge, railFence, vineRow } from '../props.js';
// 小物の一覧（名前で呼ぶ所があるので、まとめた物も持つ）
const P = { car, pickup, truck, wreck, barrels, basin, busStop, crates, dumpster, foxhole, hay, hesco, jerseyRun, lamp, logs, pallets, planter, pole, rubble, silo, stall, stoneWall, tankTrap, tent, waterTower, boardFence, hedge, railFence, vineRow };
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
// 狭いモード（research/WARBIT.md の 11）: ドミネーション（工場・橋・町の広場の3拠点。小のコンクエストと同じ本陣）と、チームデスマッチ（町の中）。
// spawns: 出撃の場所の候補（敵が近い所は避けて選ぶ）
export const MODE_AREAS = {
  dom: { name: 'ドミネーション', rect: [480, 540, 940, 860], hq: [[520, 700], [920, 700]], flags: ['B', 'C', 'D'],
    spawns: [[[520, 700], [585, 745], [610, 672]], [[920, 700], [905, 785], [905, 625]]] },
  tdm: { name: '町', rect: [692, 600, 906, 852], hq: [[704, 725], [896, 725]], flags: [],
    spawns: [[[704, 662], [704, 700], [704, 742], [702, 790]], [[898, 650], [898, 700], [898, 745], [898, 800]]] },
};
export const FLAGS = {
  A: { name: '農場', x: 470, z: 860, r: 22 },
  B: { name: '工場', x: 560, z: 600, r: 26 },
  C: { name: '橋', x: 700, z: 700, r: 18 },
  D: { name: '町の広場', x: 815, z: 736, r: 20 },
  E: { name: '電波塔の丘', x: 860, z: 500, r: 22 },
  F: { name: '東の村', x: 1010, z: 900, r: 22 },
  G: { name: '石切り場', x: 330, z: 470, r: 26 },
  H: { name: '十字路', x: 650, z: 1000, r: 20 },
};
// 平らにする場所（中心・半径・高さは自然の高さの平均）
const PADS = [
  { x: 560, z: 600, r: 85 }, { x: 800, z: 728, r: 125 }, { x: 470, z: 860, r: 62 }, { x: 1010, z: 900, r: 70 }, { x: 650, z: 1000, r: 55 },
  { x: 160, z: 700, r: 45 }, { x: 1240, z: 700, r: 45 }, { x: 370, z: 700, r: 35 }, { x: 1070, z: 700, r: 35 }, { x: 520, z: 700, r: 30 }, { x: 920, z: 700, r: 30 },
];
// 道（折れ線。幅8m）。町の中は格子
const ROADS = [
  [[100, 700], [370, 700], [520, 700], [640, 700], [760, 700], [920, 700], [1070, 700], [1300, 700]], // 0 大通り（東西）
  [[560, 600], [560, 700]],                 // 1 工場へ
  [[790, 700], [790, 600], [860, 520]],     // 2 町から丘へ
  [[650, 700], [650, 1000], [650, 1300]],   // 3 南へ（十字路）
  [[884, 772], [1010, 900]],                // 4 町から村へ
  [[470, 860], [560, 700]],                 // 5 農場へ
  [[330, 470], [520, 700]],                 // 6 石切り場へ
  // 町の格子
  [[748, 612], [748, 846]], [[840, 608], [840, 846]], [[748, 652], [884, 652]], [[700, 772], [884, 772]], [[790, 772], [790, 846]],
  // 工場の中・村・十字路
  [[505, 560], [640, 560]], [[972, 885], [1052, 885]], [[1012, 860], [1012, 948]], [[520, 1000], [800, 1000]],
];

// 地形（research/WARBIT.md の 14）: 大きなうねり＋中くらいの起伏（2〜3m の丘とくぼみ＝歩兵の隠れ場所）＋小さな凹凸。
// 拠点のまわりは高低差を小さく、端に狙撃の丘（BattleBit の作り直しの考え方）。電波塔の丘・農場と工場の間の尾根・南の丘陵
const gauss = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * s * s));
function ridgeAt(x, z, ax, az, bx, bz, w) { return Math.exp(-(segDist(x, z, ax, az, bx, bz) ** 2) / (2 * w * w)); }
function naturalH(x, z) {
  let h = 14 * fbm(x, z, 420, 4, 3) + 5 * fbm(x, z, 120, 3, 9);
  h += 3.2 * fbm(x, z, 58, 3, 13) + 0.8 * fbm(x, z, 17, 2, 29);
  // 電波塔の丘（頂きは少し岩がち）
  const gE = gauss(x, z, 860, 500, 70);
  h += 26 * gE + 2.5 * gE * fbm(x, z, 22, 2, 37);
  // 端の丘（北西・北東・南西・南東）
  h += 16 * gauss(x, z, 420, 330, 70) + 20 * gauss(x, z, 1130, 470, 85) + 15 * gauss(x, z, 290, 1110, 75) + 12 * gauss(x, z, 1150, 1180, 90) + 10 * gauss(x, z, 200, 470, 70);
  // 農場と工場の間の低い尾根（道は切り通しで越える）
  h += 7 * ridgeAt(x, z, 360, 760, 640, 800, 24);
  // 南の丘陵
  h += 14 * gauss(x, z, 900, 1150, 160);
  // まわりの山（遊べる範囲の外）: 尾根と谷のある丘陵（壁のように見えないよう、高さと立ち上がりを場所ごとに変える）
  const e = Math.max(0, Math.max(Math.abs(x - CX), Math.abs(z - CZ)) - 590);
  if (e > 0) { const k = 0.55 + 0.45 * fbm(x, z, 140, 3, 55); h += e * e * 0.0042 * k + e * 0.12 * (0.5 + 0.5 * fbm(x, z, 60, 2, 61)); }
  return h;
}
// 石切り場: 段々の穴（3.5m ごとの段。縁は急）
function quarryDepth(x, z) {
  const qd = Math.hypot((x - 330) / 1.15, z - 470);
  if (qd > 66) return 0;
  const d = 14 * (1 - sstep(22, 64, qd)), st = 3.5, f = d / st;
  return Math.floor(f) * st + st * sstep(0.62, 1, f - Math.floor(f));
}
// 乾いた小川（沢）: 底の幅 3m・深さ 2m・岸 4m。道を横切る所は道が盛り土で越える
const CREEKS = [
  [[905, 560], [955, 612], [992, 668], [1030, 722], [1058, 790], [1098, 858], [1160, 925], [1250, 990]],
  [[230, 800], [300, 850], [360, 905], [430, 950], [500, 985], [548, 1012], [575, 1040], [590, 1062]],
  [[828, 462], [792, 503], [762, 540], [740, 572], [726, 600]],
];
let CDG = null;
export function creekDist(x, z) {
  if (!CDG) CDG = distGrid(CREEKS, 2, 20);
  return sampleGrid(CDG, x, z);
}
function creekDepth(x, z) {
  const d = creekDist(x, z) + 0.8 * fbm(x, z, 9, 1, 71);
  if (d > 6.5) return 0;
  return 2.1 * (1 - sstep(1.5, 6.5, d));
}
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
// 道・小川までの距離: 1回だけ升目（道 1m・小川 2m）に求めておき、近い所は升目の値を混ぜて返す（遠い所は「遠い」）
function distGrid(lines, cell, R) {
  const N = Math.ceil(SIZE / cell) + 1, g = new Float32Array(N * N).fill(R);
  for (const r of lines) for (let k = 0; k + 1 < r.length; k++) {
    const [ax, az] = r[k], [bx, bz] = r[k + 1];
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R) / cell)), i1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + R) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - R) / cell)), j1 = Math.min(N - 1, Math.ceil((Math.max(az, bz) + R) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const d = segDist(i * cell, j * cell, ax, az, bx, bz); if (d < g[j * N + i]) g[j * N + i] = d; }
  }
  return { g, N, cell, R };
}
function sampleGrid(G, x, z) {
  const fx = x / G.cell, fz = z / G.cell, i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= G.N - 1 || j >= G.N - 1) return G.R;
  const tx = fx - i, tz = fz - j, a = G.g[j * G.N + i], b = G.g[j * G.N + i + 1], c = G.g[(j + 1) * G.N + i], d = G.g[(j + 1) * G.N + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}
let RDG = null;
export function roadDist(x, z) {
  // 20m より遠い所は 20 を返す（使う所はどれも 20m より近いかだけを見る）
  if (!RDG) RDG = distGrid(ROADS, 1, 20);
  return sampleGrid(RDG, x, z);
}
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 建物の大きさ（ローカル bw × bd）と作る関数
const DIMS = { house: [8, 10], bungalow: [10, 8], apartment: [12, 18], shop: [12, 9], office: [14, 12], warehouse: [20, 30], barn: [10, 16], shed: [5, 6], tower: [4, 4], bunker: [8, 6], ruin: [8, 10], gas: [22, 18], chapel: [10, 22] };
const BUILD = { house, bungalow, apartment, shop, office, warehouse, barn, shed, tower, bunker, ruin, gas: gasStation, chapel };
const FALLBACK = ['house', 'bungalow', 'shed'];
// 正面の前の空き（ひさし・ポーチ・ベランダ・荷の積み場）
const APRON = { house: 1.3, bungalow: 2.2, apartment: 1.5, shop: 1.7, office: 0.6, warehouse: 3.2, barn: 0.6, shed: 0.6, tower: 0.4, bunker: 0.6, ruin: 0.4, gas: 0.6, chapel: 0.6 };

export const RIVERBEND_AREAS = AREAS;
export function buildRiverbend(seed = 7) {
  const ww = makeWarWorld({ sx: SIZE, sz: SIZE, hs: 2 });
  ww.mapId = 'riverbend'; ww.areas = { ...AREAS, ...MODE_AREAS }; ww.flagDefs = FLAGS; ww.roads = ROADS; ww.riverX = riverX; ww.roadDist = roadDist;
  // 平らにする高さ（自然の高さの平均）
  for (const p of PADS) { let s = 0, n = 0; for (let a = 0; a < 16; a++) { const r = p.r * 0.6; s += naturalH(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r); n++; } p.h = s / n; }
  const W = ww.HW, hs = ww.hs;
  // 1. 自然の高さ・平らにする場所・石切り場・小川
  for (let j = 0; j < ww.HD; j++) for (let i = 0; i < W; i++) {
    const x = i * hs, z = j * hs;
    let h = naturalH(x, z);
    // 町など: 平らに（縁はなだらかに）
    for (const p of PADS) { const d = Math.hypot(x - p.x, z - p.z); const k = 1 - sstep(p.r * 0.75, p.r * 1.35, d); if (k > 0) h = h + (p.h - h) * k; }
    h -= quarryDepth(x, z);
    h -= creekDepth(x, z);
    ww.h[j * W + i] = h;
  }
  // 2. 道の高さ: 道ぞいに前後 26m をならした高さへ寄せる（尾根は切り通し・くぼみは盛り土。道の脇は土手になる）
  const grades = ROADS.map(r => {
    const S = []; let acc = 0;
    for (let k = 0; k + 1 < r.length; k++) {
      const [ax, az] = r[k], [bx, bz] = r[k + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 4));
      for (let m = k ? 1 : 0; m <= n; m++) { const t = m / n; S.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, s: acc + L * t }); }
      acc += L;
    }
    for (const p of S) p.h = heightAt(ww, p.x, p.z);
    const g = S.map(p => { let a = 0, w = 0; for (const q of S) { const d = Math.abs(q.s - p.s); if (d < 26) { const ww2 = 1 - d / 26; a += q.h * ww2; w += ww2; } } return a / w; });
    return { S, g, segs: r.slice(0, -1).map((a, k) => ({ ax: a[0], az: a[1], bx: r[k + 1][0], bz: r[k + 1][1] })) };
  });
  const gradeAt = (G, x, z) => {
    let best = 1e9, bs = 0, acc = 0;
    for (const sg of G.segs) { const dx = sg.bx - sg.ax, dz = sg.bz - sg.az, L = Math.hypot(dx, dz) || 1; const t = Math.max(0, Math.min(1, ((x - sg.ax) * dx + (z - sg.az) * dz) / (L * L))); const d = Math.hypot(x - sg.ax - dx * t, z - sg.az - dz * t); if (d < best) { best = d; bs = acc + L * t; } acc += L; }
    // 道ぞいの位置 bs のならした高さ
    const S = G.S; let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid].s <= bs) lo = mid; else hi = mid; }
    const t = (bs - S[lo].s) / Math.max(1e-6, S[hi].s - S[lo].s);
    return [best, G.g[lo] + (G.g[hi] - G.g[lo]) * Math.max(0, Math.min(1, t))];
  };
  const h0 = ww.h.slice();
  for (let j = 0; j < ww.HD; j++) for (let i = 0; i < W; i++) {
    const x = i * hs, z = j * hs, q = j * W + i;
    let h = h0[q];
    // 道（近い道ほど強く。交わる所は重みで混ぜる）
    if (roadDist(x, z) < 14) {
      let wsum = 0, gsum = 0, kmax = 0;
      for (const G of grades) { const [d, g] = gradeAt(G, x, z); if (d < 14) { const k = 1 - sstep(4.6, 14, d); wsum += k; gsum += g * k; kmax = Math.max(kmax, k); } }
      if (wsum > 0) h = h + (gsum / wsum - 0.12 - h) * kmax;
    }
    // 川床（幅24m・深さ3.5m。橋のあたりは土手）
    const dr = Math.abs(x - riverX(z));
    if (dr < 22) h -= 3.5 * (1 - sstep(8, 22, dr)) * (1 - sstep(560, 620, Math.max(Math.abs(x - CX), Math.abs(z - CZ))));
    ww.h[q] = h;
  }
  ww.creekDist = creekDist;
  const rnd = mulberry(seed);
  const gy = (x, z) => heightAt(ww, x, z);
  const pick = (L) => L[Math.floor(rnd() * L.length) % L.length];
  const FL = Object.values(FLAGS), HQS = Object.values(AREAS).flatMap(s => s.hq);

  // ---- 電波塔の丘の壕（建物より先に掘る）
  const TRENCH = [[818, 470], [842, 455], [878, 459], [903, 482], [906, 528], [886, 550], [846, 550], [820, 530], [814, 498], [818, 470]];
  carveTrench(ww, TRENCH, 1.1, 1.5);

  // ---- 置き場所の管理（1m の升目。1: 小物・とっておく所、2: 建物の敷地＝地面をならした所）
  const OW = SIZE, occ = new Uint8Array(OW * OW), E = 1e-6;
  const occRect = (x0, z0, x1, z1, v = 1) => { for (let j = Math.max(0, Math.floor(z0)); j <= Math.min(OW - 1, Math.floor(z1 - E)); j++) for (let i = Math.max(0, Math.floor(x0)); i <= Math.min(OW - 1, Math.floor(x1 - E)); i++) if (occ[j * OW + i] < v) occ[j * OW + i] = v; };
  const isFree = (x0, z0, x1, z1) => { for (let j = Math.max(0, Math.floor(z0)); j <= Math.min(OW - 1, Math.floor(z1 - E)); j++) for (let i = Math.max(0, Math.floor(x0)); i <= Math.min(OW - 1, Math.floor(x1 - E)); i++) if (occ[j * OW + i]) return false; return true; };
  const rectOnRoad = (x0, z0, x1, z1, m = 4.5) => { for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2], [(x0 + x1) / 2, z0], [(x0 + x1) / 2, z1], [x0, (z0 + z1) / 2], [x1, (z0 + z1) / 2]]) if (roadDist(x, z) < m) return true; return false; };
  const nearRiver = (x0, z0, x1, z1, m = 16) => { for (const z of [z0, (z0 + z1) / 2, z1]) { const rx = riverX(z); if (x1 > rx - m && x0 < rx + m) return true; } return false; };
  const flagCore = (x0, z0, x1, z1, k = 0.55) => FL.some(f => { const cx = Math.max(x0, Math.min(f.x, x1)), cz = Math.max(z0, Math.min(f.z, z1)); return Math.hypot(cx - f.x, cz - f.z) < f.r * k; });
  // 地形の点（i, j: 2m ごと）のまわりの升目が建物の敷地か（ならした地面を後から崩さない）
  const lockedV = (i, j) => { const x = i * hs, z = j * hs; for (let b = Math.floor(z - 1); b <= Math.floor(z); b++) for (let a = Math.floor(x - 1); a <= Math.floor(x); a++) if (a >= 0 && b >= 0 && a < OW && b < OW && occ[b * OW + a] === 2) return true; return false; };

  // 建物を建てない所（広場など）
  const keep = new Uint8Array(OW * OW);
  const keepRect = (x0, z0, x1, z1) => { for (let j = Math.max(0, Math.floor(z0)); j <= Math.min(OW - 1, Math.floor(z1 - E)); j++) for (let i = Math.max(0, Math.floor(x0)); i <= Math.min(OW - 1, Math.floor(x1 - E)); i++) keep[j * OW + i] = 1; };
  const kept = (x0, z0, x1, z1) => { for (let j = Math.max(0, Math.floor(z0)); j <= Math.min(OW - 1, Math.floor(z1 - E)); j++) for (let i = Math.max(0, Math.floor(x0)); i <= Math.min(OW - 1, Math.floor(x1 - E)); i++) if (keep[j * OW + i]) return true; return false; };
  keepRect(794, 704, 836, 768);
  // 本陣・出撃の場所・拠点の真ん中はとっておく
  for (const [x, z] of HQS) occRect(x - 22, z - 22, x + 22, z + 22);
  for (const A of Object.values(MODE_AREAS)) { for (const [x, z] of A.hq) occRect(x - 4, z - 4, x + 4, z + 4); for (const L of A.spawns || []) for (const [x, z] of L) occRect(x - 4, z - 4, x + 4, z + 4); }
  for (const f of FL) occRect(f.x - f.r * 0.45, f.z - f.r * 0.45, f.x + f.r * 0.45, f.z + f.r * 0.45);

  // ---- 建物を置く（中心と向き。下の地面をならし、まわり 6m はなだらかにつなぐ）。置けなければ null
  const place = (kind, cx, cz, rot, o = {}) => {
    const [bw0, bd0] = DIMS[kind], [bw, bd] = rot % 2 ? [bd0, bw0] : [bw0, bd0];
    const x0 = cx - bw / 2, z0 = cz - bd / 2, x1 = x0 + bw, z1 = z0 + bd, mg = o.margin ?? 1, A = APRON[kind] ?? 0.6;
    // 正面の前（ひさし・ポーチ）
    const ap = rot === 0 ? [x0, z0 - A, x1, z0] : rot === 2 ? [x0, z1, x1, z1 + A] : rot === 1 ? [x1, z0, x1 + A, z1] : [x0 - A, z0, x0, z1];
    if (!o.force) {
      if (!isFree(x0 - mg, z0 - mg, x1 + mg, z1 + mg) || !isFree(ap[0], ap[1], ap[2], ap[3]) || kept(x0, z0, x1, z1)) return null;
      if (rectOnRoad(x0, z0, x1, z1, o.roadM ?? 4.6)) return null;
      if (nearRiver(x0, z0, x1, z1, o.riverM ?? 17)) return null;
      if (flagCore(x0, z0, x1, z1, o.flagK ?? 0.6)) return null;
      if (x0 < 60 || z0 < 60 || x1 > SIZE - 60 || z1 > SIZE - 60) return null;
    }
    let s = 0; const pts = [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [cx, cz]];
    for (const [px, pz] of pts) s += gy(px, pz);
    const y = s / pts.length, R = 6;
    const i0 = Math.max(0, Math.floor((x0 - 1 - R) / hs)), i1 = Math.min(ww.HW - 1, Math.ceil((x1 + 1 + R) / hs));
    const j0 = Math.max(0, Math.floor((z0 - 1 - R) / hs)), j1 = Math.min(ww.HD - 1, Math.ceil((z1 + 1 + R) / hs));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = i * hs, z = j * hs, q = j * ww.HW + i;
      const d = Math.hypot(Math.max(x0 - 1 - x, 0, x - x1 - 1), Math.max(z0 - 1 - z, 0, z - z1 - 1));
      if (d <= 0) { ww.h[q] = y - 0.02; continue; }
      if (d > R || lockedV(i, j)) continue;
      ww.h[q] += (y - 0.02 - ww.h[q]) * (1 - sstep(0, R, d));
    }
    occRect(x0 - mg, z0 - mg, x1 + mg, z1 + mg, 2);
    occRect(ap[0], ap[1], ap[2], ap[3], 1);
    const B = BUILD[kind](ww, { x: x0, z: z0, y, rot, floors: o.floors, rnd, mat: o.mat, col: o.col, roofCol: o.roofCol });
    B.cx = cx; B.cz = cz; B.y0 = y; B.kindName = kind;
    return B;
  };
  const floorsOf = (kind) => kind === 'house' ? (rnd() < 0.7 ? 2 : 1) : kind === 'apartment' ? 3 + (rnd() < 0.45 ? 1 : 0) : kind === 'shop' ? (rnd() < 0.55 ? 1 : 2) : kind === 'office' ? 2 + (rnd() < 0.6 ? 1 : 0) : undefined;
  // 小物を置く前の確かめ（道・川・建物・拠点の真ん中を避ける）。置いたら升目を埋める
  const spot = (x0, z0, x1, z1, o = {}) => {
    if (!isFree(x0, z0, x1, z1)) return false;
    if (!o.onRoad && rectOnRoad(x0, z0, x1, z1, o.roadM ?? 4.3)) return false;
    if (nearRiver(x0, z0, x1, z1, o.riverM ?? 12)) return false;
    if (!o.inFlag && flagCore(x0, z0, x1, z1, 0.35)) return false;
    occRect(x0, z0, x1, z1);
    return true;
  };
  // 車（rot 0・2: 長い方が x、1・3: z）。onRoad でなければ道の上には置かない
  const carAt = (x, z, rot, kind = 'car', o = {}) => {
    const lx = kind === 'truck' ? 4.6 : kind === 'pickup' ? 2.7 : 2.3, [hx, hz] = rot % 2 ? [1.1, lx] : [lx, 1.1];
    if (!o.onRoad && roadDist(x, z) < 4.6) return false;
    if (!spot(x - hx, z - hz, x + hx, z + hz, { onRoad: true, inFlag: o.inFlag })) return false;
    P[kind](ww, x, z, rot, { rnd, ...(o.col ? { col: o.col, cab: o.cab } : {}) });
    return true;
  };
  // 塀・生け垣・石垣・柵の直線（軸にそう）: 道・川・建物・拠点の真ん中にかかる所は切って、つながる所だけ置く
  const fenceRun = (kind, x0, z0, x1, z1, o = {}) => {
    const L = Math.hypot(x1 - x0, z1 - z0); if (L < 1) return 0;
    const n = Math.max(1, Math.round(L / 2)), th = 0.5;
    let run = null, placed = 0;
    const flush = () => {
      if (run && Math.hypot(run.bx - run.ax, run.bz - run.az) >= (o.min ?? 3)) {
        if (kind === 'wall') {
          // 長い塀は 6m ごとに地面に合わせる
          const l = Math.hypot(run.bx - run.ax, run.bz - run.az), m = Math.max(1, Math.ceil(l / 6)), H = (o.h ?? 2.4) + 0.3;
          for (let k = 0; k < m; k++) {
            const ax = run.ax + (run.bx - run.ax) * k / m, az = run.az + (run.bz - run.az) * k / m, bx = run.ax + (run.bx - run.ax) * (k + 1) / m, bz = run.az + (run.bz - run.az) * (k + 1) / m;
            const y = Math.min(gy(ax, az), gy(bx, bz)) - 0.3, ex = Math.abs(bx - ax) < 0.1 ? 0.22 : 0, ez = Math.abs(bz - az) < 0.1 ? 0.22 : 0;
            wallRun(ww, ax, az, bx, bz, H, { y, col: o.col || '#a9a59b', far: true, layer: 1, th: o.th });
            addBox(ww, { x0: Math.min(ax, bx) - ex, z0: Math.min(az, bz) - ez, x1: Math.max(ax, bx) + ex, z1: Math.max(az, bz) + ez, y0: y + H, y1: y + H + 0.12, mat: M.CONCRETE, kind: 'trim', col: '#8b867c', detail: true, walk: false });
          }
        } else P[kind](ww, run.ax, run.az, run.bx, run.bz, o);
        occRect(Math.min(run.ax, run.bx) - th, Math.min(run.az, run.bz) - th, Math.max(run.ax, run.bx) + th, Math.max(run.az, run.bz) + th, 1);
        placed++;
      }
      run = null;
    };
    for (let k = 0; k < n; k++) {
      const ax = x0 + (x1 - x0) * k / n, az = z0 + (z1 - z0) * k / n, bx = x0 + (x1 - x0) * (k + 1) / n, bz = z0 + (z1 - z0) * (k + 1) / n;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const okk = roadDist(mx, mz) > (o.roadM ?? 5.5) && Math.abs(mx - riverX(mz)) > 13
        && isFree(Math.min(ax, bx) - th, Math.min(az, bz) - th, Math.max(ax, bx) + th, Math.max(az, bz) + th)
        && !flagCore(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), o.flagK ?? 0.5);
      if (okk) { if (!run) run = { ax, az, bx, bz }; else { run.bx = bx; run.bz = bz; } } else flush();
    }
    flush();
    return placed;
  };
  // 斜めの線ぞいの土のう（2m ごとの短い列。壕の縁など）
  const sandLine = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 2.2)), alongX = Math.abs(bx - ax) >= Math.abs(bz - az);
    for (let k = 0; k < n; k++) {
      const xa = ax + (bx - ax) * k / n, za = az + (bz - az) * k / n, xb = ax + (bx - ax) * (k + 1) / n, zb = az + (bz - az) * (k + 1) / n;
      const mx = (xa + xb) / 2, mz = (za + zb) / 2, y = Math.min(gy(xa, za), gy(xb, zb)) - 0.15;
      if (alongX) sandbags(ww, xa - 0.2, mz, xb + 0.2, mz, y); else sandbags(ww, mx, za - 0.2, mx, zb + 0.2, y);
    }
  };
  const yards = [], lines = [];
  // 家の庭: 裏の塀（か生け垣・石垣・柵）と片側の塀、もう片側は車道（車）。ときどき裏に小屋
  const yard = (B, kind, rot, alongX, side) => {
    const [bw0, bd0] = DIMS[kind], [bw, bd] = rot % 2 ? [bd0, bw0] : [bw0, bd0];
    const x0 = B.cx - bw / 2, z0 = B.cz - bd / 2, x1 = x0 + bw, z1 = z0 + bd;
    const openLow = rnd() < 0.5;
    let shedOk = false;
    if (rnd() < 0.35) {
      const cx = alongX ? (openLow ? x1 - 2.5 : x0 + 2.5) : (side > 0 ? x1 + 4.6 : x0 - 4.6);
      const cz = alongX ? (side > 0 ? z1 + 4.6 : z0 - 4.6) : (openLow ? z1 - 2.5 : z0 + 2.5);
      shedOk = !!place('shed', cx, cz, rot, { roadM: 3, flagK: 0.45 });
    }
    const back = (shedOk ? 10 : 6.5) + rnd() * 3, wide = 2.6;
    const fence = pick(['boardFence', 'boardFence', 'boardFence', 'hedge', 'hedge', 'railFence', 'stoneWall']);
    const fo = { h: fence === 'hedge' ? 1.5 + rnd() * 0.4 : undefined, min: 2 };
    yards.push(() => {
      if (alongX) {
        const zb = side > 0 ? z1 + back : z0 - back, zf = side > 0 ? z1 : z0;
        fenceRun(fence, x0 - wide, zb, x1 + wide, zb, fo);
        const xs = openLow ? x1 + wide : x0 - wide;
        fenceRun(fence, xs, Math.min(zf, zb), xs, Math.max(zf, zb), fo);
        if (rnd() < 0.62) carAt(openLow ? x0 - 3.3 : x1 + 3.3, side > 0 ? z0 + 2.9 : z1 - 2.9, side > 0 ? 3 : 1, rnd() < 0.75 ? 'car' : 'pickup');
      } else {
        const xb = side > 0 ? x1 + back : x0 - back, xf = side > 0 ? x1 : x0;
        fenceRun(fence, xb, z0 - wide, xb, z1 + wide, fo);
        const zs = openLow ? z1 + wide : z0 - wide;
        fenceRun(fence, Math.min(xf, xb), zs, Math.max(xf, xb), zs, fo);
        if (rnd() < 0.62) carAt(side > 0 ? x0 + 2.9 : x1 - 2.9, openLow ? z0 - 3.3 : z1 + 3.3, side > 0 ? 2 : 0, rnd() < 0.75 ? 'car' : 'pickup');
      }
    });
  };
  // 道ぞいに建物を並べる。(x0,z0)→(x1,z1) は道の線（軸にそう）、side: +1（座標の大きい側）/ -1、pool: [[kind, 重み]]
  const lotsAlong = (x0, z0, x1, z1, side, pool, o = {}) => {
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const L = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0), dir = Math.sign(alongX ? x1 - x0 : z1 - z0) || 1;
    const setback = o.setback ?? 7.5, tot = pool.reduce((s, p) => s + p[1], 0);
    let t = o.start ?? 3, n = 0;
    while (t < L - 5) {
      let rr = rnd() * tot, pk = pool[0][0];
      for (const p of pool) { rr -= p[1]; if (rr <= 0) { pk = p[0]; break; } }
      const avail = L - 2 - t;
      const cands = [pk, ...FALLBACK.filter(k => k !== pk)].filter(k => DIMS[k][0] <= Math.min(DIMS[pk][0], avail) + 0.01);
      if (!cands.length) break;
      const w0 = DIMS[cands[0]][0];
      let B = null;
      for (const kind of cands) {
        const [, bd] = DIMS[kind], c = t + w0 / 2;
        let cx, cz, rot;
        // 正面を道へ（x にそう道: 大きい側は rot 0・小さい側は rot 2。z にそう道: 大きい側は rot 3・小さい側は rot 1）
        if (alongX) { cx = x0 + dir * c; cz = z0 + side * (setback + bd / 2); rot = side > 0 ? 0 : 2; }
        else { cz = z0 + dir * c; cx = x0 + side * (setback + bd / 2); rot = side > 0 ? 3 : 1; }
        B = place(kind, cx, cz, rot, { floors: floorsOf(kind), margin: o.margin });
        if (B) { n++; if (o.yard !== false && (kind === 'house' || kind === 'bungalow')) yard(B, kind, rot, alongX, side); break; }
      }
      t += (B ? w0 : 5) + (o.gap ?? 3.5) + rnd() * (o.gapR ?? 3.5);
    }
    return n;
  };
  // 道の交わる所（車を止めない）
  const JUNC = [];
  for (let a = 0; a < ROADS.length; a++) for (let b = a + 1; b < ROADS.length; b++) for (let m = 0; m + 1 < ROADS[a].length; m++) for (let n = 0; n + 1 < ROADS[b].length; n++) {
    const [p0, p1] = [ROADS[a][m], ROADS[a][m + 1]], [q0, q1] = [ROADS[b][n], ROADS[b][n + 1]];
    for (const [px, pz] of [p0, p1]) if (segDist(px, pz, q0[0], q0[1], q1[0], q1[1]) < 1) JUNC.push([px, pz]);
    for (const [px, pz] of [q0, q1]) if (segDist(px, pz, p0[0], p0[1], p1[0], p1[1]) < 1) JUNC.push([px, pz]);
    const rx = p1[0] - p0[0], rz = p1[1] - p0[1], sx = q1[0] - q0[0], sz = q1[1] - q0[1], den = rx * sz - rz * sx;
    if (Math.abs(den) > 1e-9) { const t = ((q0[0] - p0[0]) * sz - (q0[1] - p0[1]) * sx) / den, u = ((q0[0] - p0[0]) * rz - (q0[1] - p0[1]) * rx) / den; if (t > 0 && t < 1 && u > 0 && u < 1) JUNC.push([p0[0] + rx * t, p0[1] + rz * t]); }
  }
  const nearJunc = (x, z, m = 11) => JUNC.some(([jx, jz]) => Math.hypot(jx - x, jz - z) < m);
  // 道ぞいの車。town: 町の通り（車道の端に止める）、ほかは路肩
  const parkAlong = (x0, z0, x1, z1, prob = 0.45, town = false) => {
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0), L = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0), off = town ? 2.95 : 4.9;
    for (let t = 6; t < L - 6; t += 6.5 + rnd() * 8) {
      if (rnd() > prob) continue;
      const side = rnd() < 0.5 ? -1 : 1, kind = rnd() < 0.7 ? 'car' : rnd() < 0.7 ? 'pickup' : 'truck', flip = rnd() < 0.5 ? 0 : 2;
      const px = alongX ? Math.min(x0, x1) + t : x0 + side * off, pz = alongX ? z0 + side * off : Math.min(z0, z1) + t;
      if (nearJunc(px, pz)) continue;
      carAt(px, pz, alongX ? flip : 1 + flip, kind, { onRoad: town });
    }
  };

  // 一番近い道の方へ正面を向ける向き（rot）。道が遠ければ乱数
  const faceRoad = (x, z, maxD = 60) => {
    let best = 1e9, bx = 0, bz = 0;
    for (const r of ROADS) for (let k = 0; k + 1 < r.length; k++) {
      const [ax, az] = r[k], [ex, ez] = r[k + 1], dx = ex - ax, dz = ez - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
      if (d < best) { best = d; bx = px; bz = pz; }
    }
    if (best > maxD) return Math.floor(rnd() * 4);
    const dx = bx - x, dz = bz - z;
    return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : (dz > 0 ? 2 : 0);
  };
  const pickW = (pool) => { const tot = pool.reduce((s2, p) => s2 + p[1], 0); let rr = rnd() * tot; for (const p of pool) { rr -= p[1]; if (rr <= 0) return p[0]; } return pool[0][0]; };
  // 四角の中の空いた所に建物を足す（道の方を向く）
  const fillArea = (x0, z0, x1, z1, pool, tries, o = {}) => {
    let n = 0;
    for (let k = 0; k < tries; k++) {
      const kind = pickW(pool), x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
      if (place(kind, x, z, o.rot ?? faceRoad(x, z, o.faceD ?? 60), { floors: floorsOf(kind), margin: o.margin, flagK: o.flagK, roadM: o.roadM })) n++;
    }
    return n;
  };

  // =============================== 1. 建物 ===============================
  const C = [['shop', 4], ['apartment', 2.5], ['office', 1.2], ['house', 1.2]], R = [['house', 5], ['bungalow', 3], ['shop', 0.5]];
  // ---- 町（川の東。大通り z=700、北の通り z=652、南の通り z=772、南北の通り x=748・790・840。広場 D は x 794〜836・z 704〜768）
  {
    const CC = { setback: 8, gap: 0.8, gapR: 1.6, margin: 0.4 }, RR = { gap: 2.5, gapR: 3 };
    // 大通りの両側（店・アパート・事務所。間をつめて並べる）
    lotsAlong(704, 700, 744, 700, -1, C, CC); lotsAlong(752, 700, 786, 700, -1, C, CC); lotsAlong(794, 700, 836, 700, -1, C, CC); lotsAlong(844, 700, 902, 700, -1, C, CC);
    lotsAlong(704, 700, 744, 700, 1, C, CC); lotsAlong(752, 700, 786, 700, 1, C, CC); lotsAlong(844, 700, 902, 700, 1, C, CC);
    // 礼拝堂（広場の南、通りの向こうから広場を向く）
    place('chapel', 815, 791, 0, { flagK: 0.4 });
    // 広場の東（x=840 の東側）と南（z=772 の南側）は広場を向く
    lotsAlong(840, 706, 840, 768, 1, C, CC); lotsAlong(794, 772, 836, 772, 1, C, CC);
    // 広場の西の区画（z=772 の北側）
    lotsAlong(752, 772, 786, 772, -1, R, RR); lotsAlong(704, 772, 744, 772, -1, R, RR);
    // 北の通り z=652（両側）と、その北
    lotsAlong(752, 652, 786, 652, 1, C, CC); lotsAlong(794, 652, 836, 652, 1, C, CC); lotsAlong(844, 652, 884, 652, 1, R, RR);
    lotsAlong(752, 652, 786, 652, -1, R, RR); lotsAlong(794, 652, 836, 652, -1, R, RR); lotsAlong(844, 652, 884, 652, -1, R, RR);
    // 南の通り z=772 の南
    lotsAlong(704, 772, 744, 772, 1, R, RR); lotsAlong(752, 772, 786, 772, 1, R, RR); lotsAlong(844, 772, 884, 772, 1, R, RR); lotsAlong(844, 772, 884, 772, -1, R, RR);
    // 南北の通り
    for (const [x, z0, z1] of [[748, 612, 648], [748, 656, 696], [748, 704, 768], [748, 776, 846], [790, 604, 648], [790, 656, 696], [790, 776, 846], [840, 612, 648], [840, 656, 696], [840, 776, 846]]) {
      lotsAlong(x, z0, x, z1, -1, R, { start: 2, ...RR }); lotsAlong(x, z0, x, z1, 1, R, { start: 2, ...RR });
    }
    // 広場の売店（南東の角）と、区画の中の空いた所（車庫・小屋・家）
    place('shed', 831, 762, 0, { flagK: 0.5, force: true });
    fillArea(704, 606, 900, 848, [['shed', 4], ['house', 1.5], ['bungalow', 1]], 300, { margin: 0.8 });
  }
  // ---- 工場（川の西。B）: 倉庫3つ・事務所・小屋・見張り塔
  {
    place('warehouse', 528, 585, 0, { force: true }); place('warehouse', 600, 627, 1, { force: true });
    place('warehouse', 600, 532, 1); place('warehouse', 532, 534, 1); place('office', 520, 633, 2, { floors: 3 });
    place('office', 629, 585, 3, { floors: 2 }); place('tower', 610, 576, 0); place('warehouse', 528, 668, 1);
    place('shed', 503, 513, 0); place('shed', 641, 610, 3); place('shed', 625, 662, 2);
    place('office', 470, 655, 1, { floors: 2 }); place('warehouse', 462, 585, 0); place('shed', 478, 620, 3);
    fillArea(498, 508, 644, 688, [['shed', 3], ['office', 1]], 40, { margin: 1.5 });
  }
  // ---- 電波塔の丘（E）: 塔2本・掩体壕2つ・兵舎
  {
    place('tower', 850, 490, 0, { force: true }); place('tower', 873, 513, 1, { force: true });
    place('bunker', 836, 522, 2, { flagK: 0.4 }); place('bunker', 885, 484, 3, { flagK: 0.4 }); place('bungalow', 866, 535, 2, { flagK: 0.45 });
  }
  // ---- 農場（A）: 母屋・納屋2つ・小屋
  {
    place('house', 455, 840, 0, { force: true, floors: 2 }); place('barn', 488, 878, 1, { force: true }); place('barn', 440, 893, 0);
    place('shed', 501, 846, 3); place('shed', 432, 860, 1); place('bungalow', 420, 830, 1); place('barn', 505, 828, 0); place('shed', 478, 905, 2);
    fillArea(404, 812, 528, 924, [['shed', 3], ['barn', 1]], 25, { margin: 1.5, flagK: 0.55 });
  }
  // ---- 東の村（F）: 家と平屋・集会所（納屋の形）
  {
    const V = [['house', 4], ['bungalow', 4]];
    place('chapel', 990, 934, 0, { flagK: 0.5 });
    lotsAlong(972, 885, 1052, 885, -1, V, { gap: 3, start: 2 }); lotsAlong(972, 885, 1052, 885, 1, V, { gap: 3, start: 2 });
    lotsAlong(1012, 860, 1012, 948, -1, V, { gap: 3 }); lotsAlong(1012, 860, 1012, 948, 1, V, { gap: 3 });
    place('shop', 1040, 920, 3, { floors: 1 }); place('barn', 968, 870, 1, { col: '#8f8676' });
    fillArea(958, 850, 1062, 956, [['house', 2], ['bungalow', 2], ['shed', 3]], 50, { margin: 1 });
    fillArea(900, 785, 990, 880, [['house', 2], ['bungalow', 2], ['shed', 2]], 30, { margin: 1.2 });
  }
  // ---- 十字路（H）: ガソリンスタンド・食堂・家
  {
    place('gas', 684, 982, 2, { force: true }); place('shop', 616, 984, 2, { floors: 1 });
    lotsAlong(520, 1000, 640, 1000, 1, [['house', 3], ['bungalow', 3]], { start: 10 }); lotsAlong(520, 1000, 640, 1000, -1, [['house', 3], ['bungalow', 3]], { start: 10 });
    lotsAlong(660, 1000, 800, 1000, 1, [['house', 3], ['bungalow', 3]], { start: 4 }); lotsAlong(704, 1000, 800, 1000, -1, [['house', 3], ['bungalow', 3]], { start: 4 });
    lotsAlong(650, 1012, 650, 1110, -1, [['house', 3], ['bungalow', 2]]); lotsAlong(650, 1012, 650, 1110, 1, [['house', 2], ['bungalow', 3]]);
    lotsAlong(650, 900, 650, 988, -1, [['house', 2], ['bungalow', 2]]); lotsAlong(650, 900, 650, 988, 1, [['house', 2], ['bungalow', 2]]);
    fillArea(560, 940, 760, 1080, [['shed', 3], ['house', 1], ['bungalow', 1]], 40, { margin: 1 });
  }
  // ---- 石切り場（G）: 小屋・事務所
  { place('shed', 300, 455, 0, { force: true }); place('office', 362, 438, 2, { floors: 1 }); place('shed', 312, 502, 1); place('shed', 296, 492, 1);
    place('warehouse', 290, 428, 1); place('shed', 372, 462, 3); place('tower', 352, 522, 0); }
  // ---- 農家を散らす（家か平屋＋納屋か小屋）と壊れた家（前線になりやすい所）
  for (const [x, z] of [[600, 820], [880, 612], [930, 820], [420, 640], [560, 420], [1080, 560], [760, 905], [300, 820], [1120, 840], [820, 1080], [430, 1040], [990, 640], [250, 600], [1150, 1000], [540, 1150], [760, 1180], [1000, 380], [700, 380], [380, 330], [1180, 450], [200, 920], [930, 1240]]) {
    const r0 = Math.floor(rnd() * 4);
    if (place(rnd() < 0.5 ? 'house' : 'bungalow', x, z, r0, { floors: rnd() < 0.5 ? 2 : 1 })) {
      place(rnd() < 0.5 ? 'barn' : 'shed', x + (rnd() < 0.5 ? -17 : 17), z + (rnd() - 0.5) * 10, Math.floor(rnd() * 4));
      if (rnd() < 0.5) place('shed', x + (rnd() - 0.5) * 12, z + (rnd() < 0.5 ? -15 : 15), Math.floor(rnd() * 4));
    }
  }
  for (const [x, z] of [[640, 640], [740, 590], [700, 860], [620, 760], [900, 760], [560, 780], [820, 865], [610, 900], [960, 600], [500, 760], [930, 980], [380, 560]]) place('ruin', x, z, Math.floor(rnd() * 4), { roadM: 6 });

  // =============================== 2. 小物 ===============================
  for (const f of yards) f();
  // ---- 町の通り: 路肩の車・街灯・ごみ箱・バス停
  {
    parkAlong(704, 700, 900, 700, 0.5, true); parkAlong(748, 652, 884, 652, 0.4, true); parkAlong(704, 772, 884, 772, 0.45, true);
    parkAlong(748, 612, 748, 846, 0.35, true); parkAlong(840, 608, 840, 846, 0.35, true); parkAlong(790, 772, 790, 846, 0.35, true); parkAlong(790, 604, 790, 700, 0.3, true);
    for (let x = 712; x <= 896; x += 24) { if (spot(x - 0.3, 705.3, x + 0.3, 705.9)) P.lamp(ww, x, 705.6, 3); if (spot(x + 12 - 0.3, 694.1, x + 12 + 0.3, 694.7)) P.lamp(ww, x + 12, 694.4, 1); }
    for (let z = 620; z <= 840; z += 30) { if (spot(753.3, z - 0.3, 753.9, z + 0.3)) P.lamp(ww, 753.6, z, 2); if (spot(834.1, z + 15 - 0.3, 834.7, z + 15 + 0.3)) P.lamp(ww, 834.4, z + 15, 0); }
    for (let k = 0; k < 40; k++) {
      const x = 704 + rnd() * 196, z = 610 + rnd() * 236, rd = roadDist(x, z);
      if (rd < 5.6 || rd > 9) continue;
      if (spot(x - 1.2, z - 0.9, x + 1.2, z + 0.9)) P.dumpster(ww, x, z, rnd() < 0.5 ? 0 : 2, { rnd });
    }
    if (spot(812, 703.6, 818, 707.2, { onRoad: true, inFlag: true })) P.busStop(ww, 815, 705.6, 0);
  }
  // ---- 広場（D）: 噴水（旗の柱はこの真ん中）・屋台・植え込み・土のう・低い壁・車
  {
    const fx = FLAGS.D.x, fz = FLAGS.D.z;
    P.basin(ww, fx, fz, 3.4);
    for (const [x, z, r] of [[802, 713, 2], [808, 713, 2], [824, 713, 2], [830, 713, 2], [800, 752, 1], [830, 744, 3]]) if (spot(x - 1.7, z - 1.7, x + 1.7, z + 1.7, { inFlag: true })) P.stall(ww, x, z, r, { rnd });
    for (const [x0, z0, x1, z1] of [[796, 722, 800, 723.4], [830, 726, 834, 727.4], [796, 760, 800, 761.4], [812, 752, 818, 753.4], [812, 718, 818, 719.4]]) if (spot(x0, z0, x1, z1, { inFlag: true })) { P.planter(ww, x0, z0, x1, z1); }
    for (const [x0, z0, x1, z1] of [[805, 744, 811, 744], [819, 728, 825, 728], [804, 730, 804, 735], [826, 738, 826, 743]]) if (spot(Math.min(x0, x1) - 0.4, Math.min(z0, z1) - 0.4, Math.max(x0, x1) + 0.4, Math.max(z0, z1) + 0.4, { inFlag: true })) sandbags(ww, x0, z0, x1, z1, gy((x0 + x1) / 2, (z0 + z1) / 2) - 0.05);
    for (const [x0, z0, x1, z1] of [[796, 732, 796, 742], [834, 750, 834, 758]]) if (spot(x0 - 0.4, z0, x1 + 0.4, z1, { inFlag: true })) P.stoneWall(ww, x0, z0, x1, z1, { h: 0.95, col: '#a8a196' });
    if (spot(819.7, 755.4, 824.3, 757.6, { inFlag: true })) P.wreck(ww, 822, 756.5, 0, { rnd });
    if (spot(798, 739, 801.6, 742.6, { inFlag: true })) P.crates(ww, 799, 740, 4, { rnd });
    if (spot(827.5, 731, 830.5, 734, { inFlag: true })) P.barrels(ww, 828.5, 732, 4, { rnd });
    // 広場の木（植え込みの横）
    for (const [x, z] of [[798, 726], [832, 730], [798, 764], [815, 756]]) if (isFree(x - 0.6, z - 0.6, x + 0.6, z + 0.6)) { const y = gy(x, z), s = 0.75; const c = addCyl(ww, { x, z, r: 0.2 * s, y0: y - 0.2, y1: y + 6 * s, mat: M.WOOD, kind: 'oak' }); (ww.trees || (ww.trees = [])).push({ x, y, z, s, kind: 'oak', cyl: c.id }); occRect(x - 0.6, z - 0.6, x + 0.6, z + 0.6); }
  }
  // ---- 工場（B）: 旗のまわりのコンテナの囲い・サイロ・煙突・給水塔・トラック・木箱・塀（門をあける）
  {
    const ccols = ['#3f6f8f', '#8f3f3f', '#4f7f3f', '#8f7f3f', '#6f5f8f', '#a0592a', '#3f7f7f'];
    for (const [x, z, r, two] of [[544, 599, 1, 1], [576, 604, 1, 0], [560, 584, 0, 1], [559, 616, 0, 0], [548, 640, 0, 1], [556, 647, 0, 0], [585, 652, 0, 1], [592, 659, 0, 0], [508, 612, 1, 1], [622, 612, 1, 1], [578, 565, 0, 1], [586, 572, 0, 0], [545, 568, 0, 0], [634, 640, 1, 0]]) {
      const [hx, hz] = r ? [1.25, 3.05] : [3.05, 1.25];
      if (!spot(x - hx, z - hz, x + hx, z + hz, { inFlag: true })) continue;
      const y = Math.min(gy(x - hx, z - hz), gy(x + hx, z + hz), gy(x, z)) - 0.05; container(ww, x, z, r, y, pick(ccols));
      if (two) container(ww, x + (rnd() - 0.5) * 0.4, z + (rnd() - 0.5) * 0.4, r, y + 2.6, pick(ccols));
    }
    for (const [x, z] of [[636, 530], [636, 545]]) { if (spot(x - 4.4, z - 4.4, x + 4.4, z + 4.4)) P.silo(ww, x, z, 4.2, 15); }
    { const x = 556, z = 515, y = gy(x, z); if (spot(x - 2.2, z - 2.2, x + 2.2, z + 2.2)) { addBox(ww, { x0: x - 1.6, z0: z - 1.6, x1: x + 1.6, z1: z + 1.6, y0: y - 0.3, y1: y + 28, mat: M.BRICK, kind: 'wall', col: '#9a5a45', far: true, layer: 2 }); addBox(ww, { x0: x - 1.85, z0: z - 1.85, x1: x + 1.85, z1: z + 1.85, y0: y + 26.4, y1: y + 27.2, mat: M.BRICK, kind: 'trim', col: '#5a5450', far: true, walk: false }); addBox(ww, { x0: x - 2.2, z0: z - 2.2, x1: x + 2.2, z1: z + 2.2, y0: y - 0.3, y1: y + 1.2, mat: M.CONCRETE, kind: 'wall', col: '#8b867c', layer: 1 }); } }
    if (spot(497, 676, 503, 682)) P.waterTower(ww, 500, 679);
    for (const [x, z, r] of [[522, 549, 0], [598, 552, 2], [548, 668, 1]]) carAt(x, z, r, 'truck');
    for (const [x, z] of [[566, 629], [548, 581], [580, 586], [532, 618], [590, 610], [540, 610]]) if (spot(x - 0.7, z - 0.7, x + 2, z + 2, { inFlag: true })) P.crates(ww, x, z, 2 + Math.floor(rnd() * 4), { rnd });
    for (const [x, z] of [[572, 640], [530, 604], [604, 598], [571, 592]]) if (spot(x - 1, z - 1, x + 1.6, z + 1.6, { inFlag: true })) P.barrels(ww, x, z, 3 + Math.floor(rnd() * 3), { rnd });
    for (const [x, z] of [[560, 652], [545, 576], [583, 620]]) if (spot(x - 0.8, z - 0.7, x + 0.8, z + 0.7, { inFlag: true })) P.pallets(ww, x, z, 0.5 + rnd() * 1.0);
    // 塀（北と西と東の一部。道で切れて門になる）
    fenceRun('wall', 494, 505, 646, 505, { h: 2.4 }); fenceRun('wall', 494, 505, 494, 690, { h: 2.4 }); fenceRun('wall', 646, 505, 646, 550, { h: 2.4 });
    // 東の門の防護柵
    P.jerseyRun(ww, 628, 690, 628, 696); P.jerseyRun(ww, 620, 704, 620, 710);
  }
  // ---- 橋（C）: 両岸の検問（ずらした防護柵・土のう・焼けた車・対戦車の障害物）・川床の岩
  {
    const xa = riverX(700) - 26, xb = riverX(700) + 26;
    P.jerseyRun(ww, xa - 8, 694, xa - 8, 700); P.jerseyRun(ww, xa - 15, 700.5, xa - 15, 706.5);
    P.jerseyRun(ww, xb + 8, 700.5, xb + 8, 706.5); P.jerseyRun(ww, xb + 15, 694, xb + 15, 700);
    sandbags(ww, xa - 18, 712.5, xa - 11, 712.5, gy(xa - 14, 712.5)); sandbags(ww, xb + 11, 687.5, xb + 18, 687.5, gy(xb + 14, 687.5));
    sandbags(ww, xa - 4, 686, xa - 4, 691, gy(xa - 4, 688)); sandbags(ww, xb + 4, 709, xb + 4, 714, gy(xb + 4, 712));
    P.wreck(ww, xa - 24, 703, 0, { rnd }); P.wreck(ww, xb + 26, 697, 2, { rnd });
    for (const [x, z] of [[xa - 6, 719], [xb + 7, 681], [xa - 9, 681], [xb + 9, 719], [xa - 20, 690], [xb + 21, 710]]) P.tankTrap(ww, x, z);
    for (let k = 0; k < 34; k++) { const z = 540 + rnd() * 360, x = riverX(z) + (rnd() - 0.5) * 14; if (Math.abs(z - 700) < 12) continue; rock(ww, x, z, 0.9 + rnd() * 1.7, rnd); }
  }
  // ---- 電波塔の丘（E）: 壕の縁の土のう・ヘスコ・対戦車の障害物・掩体・アンテナ・トラック
  {
    const cxh = 860, czh = 503;
    for (let k = 0; k + 1 < TRENCH.length; k++) {
      const [ax, az] = TRENCH[k], [bx, bz] = TRENCH[k + 1];
      // 外側（丘の中心から遠い側）へ 2.9m ずらした縁に土のう（両端は少し短く）
      const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
      let nx = -uz, nz = ux; const mx = (ax + bx) / 2, mz = (az + bz) / 2; if ((mx - cxh) * nx + (mz - czh) * nz < 0) { nx = -nx; nz = -nz; }
      const o = 2.9, t0 = L * 0.18, t1 = L * 0.82;
      sandLine(ax + ux * t0 + nx * o, az + uz * t0 + nz * o, ax + ux * t1 + nx * o, az + uz * t1 + nz * o);
    }
    P.hesco(ww, 845, 474, 857, 474); P.hesco(ww, 866, 534, 878, 534); P.hesco(ww, 893, 498, 893, 508); P.hesco(ww, 826, 500, 826, 510);
    for (const [x, z] of [[806, 486], [804, 514], [910, 455], [918, 540], [858, 440], [868, 562], [830, 452], [896, 566]]) P.tankTrap(ww, x, z);
    P.foxhole(ww, 800, 500, 'e'); P.foxhole(ww, 920, 505, 'w');
    { const x = 862, z = 503, y = gy(x, z); addBox(ww, { x0: x - 0.3, z0: z - 0.3, x1: x + 0.3, z1: z + 0.3, y0: y - 0.2, y1: y + 32, mat: M.METAL, kind: 'pole', col: '#a0a3a6', layer: 10, far: true, walk: false });
      for (const hy of [10, 18, 26]) addBox(ww, { x0: x - 1.2, z0: z - 0.05, x1: x + 1.2, z1: z + 0.05, y0: y + hy, y1: y + hy + 0.1, mat: M.METAL, kind: 'pole', col: '#a0a3a6', layer: 10, detail: true, walk: false });
      addBox(ww, { x0: x - 1.4, z0: z - 1.4, x1: x + 1.4, z1: z + 1.4, y0: y - 0.3, y1: y + 0.5, mat: M.CONCRETE, kind: 'wall', col: '#8f8e86', layer: 1 }); }
    carAt(842, 540, 1, 'truck', { inFlag: true, col: '#56604a', cab: '#4a5440' });
    for (const [x, z] of [[871, 483], [849, 520]]) if (spot(x - 0.7, z - 0.7, x + 2, z + 2, { inFlag: true })) P.crates(ww, x, z, 4, { rnd });
    if (spot(876, 520, 878.6, 522.6, { inFlag: true })) P.barrels(ww, 877, 521, 4, { rnd });
    P.jerseyRun(ww, 818, 540, 830, 540);
  }
  // ---- 農場（A）: サイロ・給水塔・干し草・丸太・柵・石垣・生け垣・トラック
  {
    for (const [x, z] of [[507, 900], [516, 900]]) if (spot(x - 3.4, z - 3.4, x + 3.4, z + 3.4)) P.silo(ww, x, z, 3.2, 12, { col: '#c9c6bd' });
    if (spot(458, 905, 464, 911)) P.waterTower(ww, 461, 908, { h: 9, col: '#9c9a8e' });
    for (const [x, z] of [[476, 846], [461, 874], [449, 870], [489, 857], [470, 885], [497, 866]]) if (spot(x - 1, z - 1, x + 4.2, z + 2.6, { inFlag: true })) P.hay(ww, x, z, 2 + Math.floor(rnd() * 3), { rnd });
    if (spot(442.5, 846, 445.5, 852)) P.logs(ww, 444, 849, 1);
    carAt(470, 830, 0, 'pickup'); carAt(503, 880, 1, 'truck', { col: '#a33a2c' });
    fenceRun('railFence', 406, 818, 524, 818); fenceRun('railFence', 406, 818, 406, 922); fenceRun('railFence', 406, 922, 470, 922);
    fenceRun('stoneWall', 380, 790, 520, 790); fenceRun('hedge', 532, 870, 532, 940);
  }
  // ---- 東の村（F）: 車・石垣・生け垣・給水塔・木箱・土のう
  {
    parkAlong(972, 885, 1052, 885, 0.5); parkAlong(1012, 860, 1012, 948, 0.45);
    fenceRun('stoneWall', 955, 848, 1065, 848); fenceRun('hedge', 955, 958, 1060, 958); fenceRun('stoneWall', 955, 848, 955, 958);
    if (spot(1046, 862, 1052, 868)) P.waterTower(ww, 1049, 865);
    for (const [x, z] of [[1000, 910], [1022, 893]]) if (spot(x - 1, z - 1, x + 2, z + 2, { inFlag: true })) P.crates(ww, x, z, 3, { rnd });
    for (const [x0, z0, x1, z1] of [[996, 896, 1001, 896], [1019, 906, 1019, 911]]) if (spot(Math.min(x0, x1) - 0.4, Math.min(z0, z1) - 0.4, Math.max(x0, x1) + 0.4, Math.max(z0, z1) + 0.4, { inFlag: true })) sandbags(ww, x0, z0, x1, z1, gy(x0, z0) - 0.05);
  }
  // ---- 十字路（H）: 給油機の車・路肩の車・防護柵
  {
    P.car(ww, 685, 986.5, 1, { rnd }); occRect(683, 983, 687, 990);
    parkAlong(520, 1000, 800, 1000, 0.45); parkAlong(650, 900, 650, 1110, 0.35);
    P.jerseyRun(ww, 640, 1014, 646, 1014); P.jerseyRun(ww, 655, 986, 661, 986);
    for (const [x, z] of [[636, 990], [664, 1011]]) if (spot(x - 1, z - 1, x + 2, z + 2, { inFlag: true })) P.crates(ww, x, z, 3, { rnd });
    if (spot(626, 1010, 632, 1013)) P.wreck(ww, 629, 1011.5, 0, { rnd });
  }
  // ---- 石切り場（G）: 大きな岩・砕く機械・ダンプ・砂利の山
  {
    for (let k = 0; k < 26; k++) { const a = rnd() * Math.PI * 2, r = 12 + rnd() * 40, x = 330 + Math.cos(a) * r, z = 470 + Math.sin(a) * r; if (spot(x - 3, z - 3, x + 3, z + 3, { inFlag: true })) rock(ww, x, z, 1.5 + rnd() * 3, rnd); }
    { const x = 346, z = 497, y = gy(x, z); if (spot(x - 3.5, z - 3.5, x + 19, z + 3.5)) {
      addBox(ww, { x0: x - 3, z0: z - 3, x1: x + 3, z1: z + 3, y0: y - 0.3, y1: y + 7, mat: M.METAL, kind: 'wall', col: '#b0892a', layer: 10, far: true });
      addBox(ww, { x0: x - 3.3, z0: z - 3.3, x1: x + 3.3, z1: z + 3.3, y0: y + 7, y1: y + 7.4, mat: M.METAL, kind: 'trim', col: '#6d6f72', layer: 10, far: true, walk: false });
      addBox(ww, { x0: x + 3, z0: z - 0.8, x1: x + 18, z1: z + 0.8, y0: y + 3.6, y1: y + 4.2, mat: M.METAL, kind: 'wall', col: '#6d6f72', layer: 10, far: true, walk: false });
      for (const px of [x + 8, x + 13, x + 17.5]) addBox(ww, { x0: px - 0.15, z0: z - 0.15, x1: px + 0.15, z1: z + 0.15, y0: y - 0.2, y1: y + 3.6, mat: M.METAL, kind: 'pole', col: '#55585b', layer: 10, walk: false, detail: true }); } }
    for (const [x, z, r] of [[318, 440, 0], [356, 470, 1], [306, 520, 2]]) carAt(x, z, r, 'truck', { inFlag: true, col: '#c9a84a', cab: '#c9a84a' });
    for (const [x, z] of [[368, 502], [300, 482], [322, 452]]) P.rubble(ww, x, z, 9, { rnd });
  }
  // ---- 本陣（6つ）: テント・コンテナ・土のう・ヘスコ・トラック
  for (const [x, z] of HQS) {
    container(ww, x - 12, z - 8, 0, gy(x - 12, z - 8) - 0.05, '#56604a'); container(ww, x + 12, z + 8, 0, gy(x + 12, z + 8) - 0.05, '#56604a');
    sandbags(ww, x - 8, z + 14, x + 8, z + 14, gy(x, z + 14) - 0.05);
    P.hesco(ww, x - 18, z - 16, x - 4, z - 16); P.hesco(ww, x + 4, z + 18, x + 18, z + 18);
    P.truck(ww, x + 14, z - 12, x < 700 ? 0 : 2, { rnd, col: '#56604a', cab: '#4a5440' });
    P.tent(ww, x - 14, z + 10, 0); P.tent(ww, x + 16, z - 2, 1, { col: '#666b50' });
    P.crates(ww, x - 4, z - 12, 4, { rnd });
  }
  // ---- 前哨（拠点の間）: ヘスコと土のうの囲い・テント・木箱
  for (const [x, z] of [[515, 742], [655, 860], [925, 832], [722, 560], [405, 560], [1002, 760], [560, 965], [770, 1085], [960, 520], [420, 990]]) {
    if (!isFree(x - 9, z - 9, x + 9, z + 9) || roadDist(x, z) < 12) continue;
    occRect(x - 9, z - 9, x + 9, z + 9);
    P.hesco(ww, x - 8, z - 8, x + 2, z - 8); P.hesco(ww, x - 8, z - 6.9, x - 8, z + 4);
    sandbags(ww, x - 1, z + 7.5, x + 8, z + 7.5, gy(x + 3, z + 7.5) - 0.05); sandbags(ww, x + 7.5, z - 3, x + 7.5, z + 6.8, gy(x + 7.5, z + 2) - 0.05);
    P.tent(ww, x - 3, z + 1, rnd() < 0.5 ? 0 : 1);
    P.crates(ww, x + 3, z - 5, 3, { rnd }); if (rnd() < 0.5) P.barrels(ww, x + 4, z + 3, 3, { rnd });
  }
  // ---- 道: 焼けた車（道の上と路肩）・がれき・電柱
  for (const ri of [0, 2, 3, 4, 5, 6]) {
    const r = ROADS[ri];
    for (let k = 0; k + 1 < r.length; k++) {
      const [ax, az] = r[k], [bx, bz] = r[k + 1], L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, rot0 = Math.abs(ux) > Math.abs(uz) ? 0 : 1;
      for (let s = 15; s < L - 15; s += 32 + rnd() * 36) {
        const x = ax + ux * s, z = az + uz * s, onRoad = rnd() < 0.4, side = rnd() < 0.5 ? -1 : 1, off = onRoad ? (rnd() - 0.5) * 3 : side * (6 + rnd() * 3);
        const px = x - uz * off, pz = z + ux * off;
        if (px > 700 && px < 905 && pz > 600 && pz < 850) continue; // 町の中は別に
        const t = rnd();
        if (t < 0.55) { const [hx, hz] = rot0 ? [1.0, 2.3] : [2.3, 1.0]; if (spot(px - hx, pz - hz, px + hx, pz + hz, { onRoad: true })) P.wreck(ww, px, pz, rot0 + (rnd() < 0.5 ? 0 : 2), { rnd }); }
        else if (t < 0.75) { if (spot(px - 1.8, pz - 1.8, px + 1.8, pz + 1.8, { onRoad: true })) P.rubble(ww, px, pz, 6, { rnd }); }
        else if (!onRoad) { if (spot(px - 2, pz - 2, px + 2, pz + 2)) P.crates(ww, px - 0.5, pz - 0.5, 2 + Math.floor(rnd() * 3), { rnd }); }
      }
      if (ri === 0 || ri === 3) for (let s = 10; s < L; s += 46) { const x = ax + ux * s - uz * 7.6, z = az + uz * s + ux * 7.6; if (!(x > 700 && x < 905 && z > 600 && z < 850) && spot(x - 0.4, z - 0.4, x + 0.4, z + 0.4)) P.pole(ww, x, z); }
    }
  }
  // ---- 畑（research/WARBIT.md の 14）: 町・工場・村・十字路・石切り場・丘・森・川・本陣・拠点を避けた所を、少しずらした格子で区切る。
  //   麦（高い草で伏せると隠れる）・耕した土・牧草・ただの草地。縁の一部に生け垣・石垣・柵、ときどき木の列
  const NOFIELD = [[690, 595, 910, 855], [488, 500, 652, 696], [948, 840, 1072, 966], [556, 928, 772, 1122], [398, 806, 534, 928]];
  const forestAt = (x, z) => fbm(x, z, 260, 3, 21) > 0.06;
  ww.fields = [];
  {
    let z = 140;
    while (z < 1260) {
      const ch = 60 + rnd() * 40; let x = 140;
      while (x < 1260) {
        const cw = 70 + rnd() * 45, f = { x0: x + 3, z0: z + 3, x1: Math.min(1262, x + cw) - 3, z1: Math.min(1262, z + ch) - 3 };
        x += cw;
        const mx = (f.x0 + f.x1) / 2, mz = (f.z0 + f.z1) / 2;
        if (f.x1 - f.x0 < 30 || f.z1 - f.z0 < 25) continue;
        if (NOFIELD.some(([a, b, c, d]) => f.x1 > a && f.x0 < c && f.z1 > b && f.z0 < d)) continue;
        if (Math.hypot((mx - 330) / 1.15, mz - 470) < 95 || Math.hypot(mx - 860, mz - 500) < 105) continue;
        if (FL.some(fl => { const cx = Math.max(f.x0, Math.min(fl.x, f.x1)), cz = Math.max(f.z0, Math.min(fl.z, f.z1)); return Math.hypot(cx - fl.x, cz - fl.z) < fl.r + 12; })) continue;
        if (HQS.some(([hx, hz]) => hx > f.x0 - 30 && hx < f.x1 + 30 && hz > f.z0 - 30 && hz < f.z1 + 30)) continue;
        if (nearRiver(f.x0, f.z0, f.x1, f.z1, 18)) continue;
        if ([[f.x0, f.z0], [f.x1, f.z0], [f.x0, f.z1], [f.x1, f.z1], [mx, mz]].filter(([px, pz]) => forestAt(px, pz)).length >= 2) continue;
        const t = rnd();
        f.kind = t < 0.28 ? 'wheat' : t < 0.48 ? 'plow' : t < 0.72 ? 'pasture' : null;
        f.dir = rnd() < 0.5 ? 'x' : 'z';
        if (f.kind) ww.fields.push(f);
        // 縁（生け垣・石垣・柵）と木の列
        for (const [ax, az, bx, bz] of [[f.x0 - 1.6, f.z0 - 1.6, f.x1 + 1.6, f.z0 - 1.6], [f.x0 - 1.6, f.z1 + 1.6, f.x1 + 1.6, f.z1 + 1.6], [f.x0 - 1.6, f.z0 - 1.6, f.x0 - 1.6, f.z1 + 1.6], [f.x1 + 1.6, f.z0 - 1.6, f.x1 + 1.6, f.z1 + 1.6]]) {
          const e = rnd();
          if (e < 0.22) fenceRun('hedge', ax, az, bx, bz, { h: 1.4 + rnd() * 0.7, min: 6 });
          else if (e < 0.33) fenceRun('stoneWall', ax, az, bx, bz, { min: 6 });
          else if (e < 0.4) fenceRun('railFence', ax, az, bx, bz, { min: 6 });
          else if (e < 0.52) lines.push([ax, az, bx, bz, 'tree']);
          else if (e < 0.68) lines.push([ax, az, bx, bz, 'bush']);
        }
      }
      z += ch;
    }
  }
  // 果樹園（農場の東）とぶどう畑（村の南）
  ww.fields.push({ x0: 538, z0: 838, x1: 606, z1: 902, kind: 'orchard', dir: 'x' }, { x0: 960, z0: 972, x1: 1060, z1: 1036, kind: 'vine', dir: 'x' });
  for (let x = 543; x < 604; x += 7) for (let z = 843; z < 900; z += 7) {
    const px = x + (rnd() - 0.5) * 1.2, pz = z + (rnd() - 0.5) * 1.2;
    if (!isFree(px - 1, pz - 1, px + 1, pz + 1) || roadDist(px, pz) < 6) continue;
    const y = gy(px, pz), sc = 0.55 + rnd() * 0.15; const c = addCyl(ww, { x: px, z: pz, r: 0.18 * sc, y0: y - 0.2, y1: y + 6 * sc, mat: M.WOOD, kind: 'oak' });
    (ww.trees || (ww.trees = [])).push({ x: px, y, z: pz, s: sc, kind: 'oak', cyl: c.id }); occRect(px - 0.6, pz - 0.6, px + 0.6, pz + 0.6);
  }
  for (let z = 976; z < 1034; z += 3.2) fenceRun('vineRow', 964, z, 1056, z, { min: 6 });
  // ---- 掩体（拠点の間の開けた所）・干し草・丸太・焼けた車・がれき
  for (const [x, z, o] of [[628, 676, 'w'], [744, 600, 'e'], [690, 620, 'n'], [702, 812, 's'], [600, 724, 'w'], [905, 742, 'e'], [520, 760, 'n'], [760, 470, 'e'], [940, 560, 'w'], [600, 470, 's'], [420, 760, 'e'], [960, 760, 'w'], [560, 940, 'n'], [820, 950, 's'], [380, 600, 'e'], [1100, 760, 'w']]) if (spot(x - 3, z - 3, x + 3, z + 3)) P.foxhole(ww, x, z, o);
  for (let k = 0; k < 40; k++) {
    const x = 160 + rnd() * 1080, z = 160 + rnd() * 1080;
    if (FL.some(f => Math.hypot(f.x - x, f.z - z) < f.r + 10) || HQS.some(([hx, hz]) => Math.hypot(hx - x, hz - z) < 30)) continue;
    if (x > 690 && x < 910 && z > 595 && z < 855) continue;
    const t = rnd();
    if (t < 0.45) { if (spot(x - 1, z - 1, x + 4.2, z + 2.6)) P.hay(ww, x, z, 2 + Math.floor(rnd() * 4), { rnd }); }
    else if (t < 0.7) { if (spot(x - 2.2, z - 2.2, x + 2.2, z + 2.2)) P.logs(ww, x, z, Math.floor(rnd() * 2)); }
    else if (t < 0.85) { if (spot(x - 2.4, z - 1.1, x + 2.4, z + 1.1)) P.wreck(ww, x, z, rnd() < 0.5 ? 0 : 2, { rnd }); }
    else { if (spot(x - 1.8, z - 1.8, x + 1.8, z + 1.8)) P.rubble(ww, x, z, 6, { rnd }); }
  }

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

  // =============================== 3. 木・茂み・岩 ===============================
  // 植生（research/WARBIT.md の 14）: 森（針葉樹が多い・下草の茂み）、道ぞいの茂みと木の列（BattleBit の Valley のように道ぞいが隠れて進める道になる）、
  // 小川と川岸の茂みと木、畑の縁の木の列と茂み、草地に散らばる茂みのかたまり、家のまわりの茂み
  const near = (x, z, m = 9) => {
    if (roadDist(x, z) < m) return true;
    if (Math.abs(x - riverX(z)) < 14) return true;
    const i = Math.floor(x), j = Math.floor(z);
    for (let dj = -4; dj <= 4; dj += 2) for (let di = -4; di <= 4; di += 2) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < OW && jj < OW && occ[jj * OW + ii]) return true; }
    for (const [hx, hz] of HQS) if (Math.hypot(x - hx, z - hz) < 30) return true;
    for (const f of FL) if (Math.hypot(x - f.x, z - f.z) < f.r + 6) return true;
    return false;
  };
  const inField = (x, z) => ww.fields.some(f => x > f.x0 - 1 && x < f.x1 + 1 && z > f.z0 - 1 && z < f.z1 + 1 && f.kind !== 'orchard');
  ww.trees = ww.trees || [];
  const tree = (x, z, s, kind) => { const y = gy(x, z); const c = addCyl(ww, { x, z, r: (kind === 'pine' ? 0.22 : 0.24) * s, y0: y - 0.2, y1: y + 6 * s, mat: M.WOOD, kind }); ww.trees.push({ x, y, z, s, kind, cyl: c.id }); };
  // 茂み（1〜3つのかたまり）。重ならないよう小さく升目を埋める
  const bush = (x, z, sc = 1) => {
    const r = (0.8 + rnd() * 0.8) * sc, h = (0.9 + rnd() * 0.9) * sc;
    if (roadDist(x, z) < 5.4 || Math.abs(x - riverX(z)) < 11 || !isFree(x - r * 0.7, z - r * 0.7, x + r * 0.7, z + r * 0.7)) return false;
    if (FL.some(f => Math.hypot(x - f.x, z - f.z) < f.r * 0.45) || x < 70 || z < 70 || x > SIZE - 70 || z > SIZE - 70) return false;
    addBush(ww, { x, z, y: gy(x, z), r, h });
    occRect(x - 0.4, z - 0.4, x + 0.4, z + 0.4);
    return true;
  };
  const clump = (x, z, n, spread = 2.2, sc = 1) => { let k = 0; for (let m = 0; m < n; m++) if (bush(x + (rnd() - 0.5) * spread * 2, z + (rnd() - 0.5) * spread * 2, sc)) k++; return k; };
  const TOWNS = [[692, 598, 908, 852], [950, 842, 1070, 962], [558, 930, 770, 1120]];
  const inTown = (x, z) => TOWNS.some(([a, b, c, d]) => x > a && x < c && z > b && z < d);
  // 森（密度の濃い所。丘の上と端は針葉樹）と、まばらな木
  for (let k = 0; k < 14000; k++) {
    const x = 60 + rnd() * (SIZE - 120), z = 60 + rnd() * (SIZE - 120);
    const dens = fbm(x, z, 260, 3, 21);
    // 森の芯は濃く、縁はまばら、外はたまに1本
    if (dens < 0.1 ? rnd() > 0.03 : rnd() > 0.45 + (dens - 0.1) * 4) continue;
    if (near(x, z) || inField(x, z) || inTown(x, z)) continue;
    const hill = gy(x, z) > 18 || Math.max(Math.abs(x - CX), Math.abs(z - CZ)) > 560;
    tree(x, z, 0.8 + rnd() * 0.65, rnd() < (hill ? 0.85 : 0.6) ? 'pine' : 'oak');
    if (dens > 0.16 && rnd() < 0.35) clump(x + (rnd() - 0.5) * 6, z + (rnd() - 0.5) * 6, 1 + Math.floor(rnd() * 2), 1.5);
  }
  // 道ぞい（町の外）: 両側に茂みのかたまり、ところどころ木の列
  for (const ri of [0, 1, 2, 3, 4, 5, 6]) {
    const r = ROADS[ri];
    for (let k = 0; k + 1 < r.length; k++) {
      const [ax, az] = r[k], [bx, bz] = r[k + 1], L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
      for (let s2 = 4; s2 < L - 4; s2 += 5 + rnd() * 7) for (const sd of [-1, 1]) {
        const off = 6.4 + rnd() * 2.8, x = ax + ux * s2 - uz * sd * off, z = az + uz * s2 + ux * sd * off;
        if (inTown(x, z) || nearJunc(x, z, 14)) continue;
        const t = rnd();
        if (t < 0.5) clump(x, z, 1 + Math.floor(rnd() * 3), 1.6);
        else if (t < 0.62 && !near(x - uz * sd * 3, z + ux * sd * 3, 9.5)) tree(x - uz * sd * 3.2, z + ux * sd * 3.2, 0.75 + rnd() * 0.4, rnd() < 0.65 ? 'oak' : 'pine');
      }
    }
  }
  // 小川: 両岸に茂みと木
  for (const c of CREEKS) for (let k = 0; k + 1 < c.length; k++) {
    const [ax, az] = c[k], [bx, bz] = c[k + 1], L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    for (let s2 = 2; s2 < L; s2 += 3.5 + rnd() * 4) for (const sd of [-1, 1]) {
      const off = 3.6 + rnd() * 3.5, x = ax + ux * s2 - uz * sd * off, z = az + uz * s2 + ux * sd * off;
      if (inTown(x, z)) continue;
      const t = rnd();
      if (t < 0.55) clump(x, z, 1 + Math.floor(rnd() * 2), 1.3);
      else if (t < 0.75 && !near(x, z, 8)) tree(x, z, 0.75 + rnd() * 0.5, rnd() < 0.7 ? 'oak' : 'pine');
    }
  }
  // 川岸
  for (let z = 120; z < 1280; z += 5 + rnd() * 7) for (const sd of [-1, 1]) {
    const x = riverX(z) + sd * (13 + rnd() * 6);
    if (inTown(x, z) || Math.abs(z - 700) < 26) continue;
    if (rnd() < 0.5) clump(x, z, 1 + Math.floor(rnd() * 2), 1.5);
    else if (rnd() < 0.25 && !near(x + sd * 3, z, 8)) tree(x + sd * 3, z, 0.8 + rnd() * 0.5, 'oak');
  }
  // 畑の縁の木の列と茂みの列
  for (const [ax, az, bx, bz, kind] of lines) {
    const L = Math.hypot(bx - ax, bz - az);
    for (let s2 = 3; s2 < L - 2; s2 += kind === 'tree' ? 8 + rnd() * 6 : 3 + rnd() * 4) {
      const x = ax + (bx - ax) * s2 / L + (rnd() - 0.5), z = az + (bz - az) * s2 / L + (rnd() - 0.5);
      if (kind === 'tree') { if (!near(x, z, 7)) tree(x, z, 0.8 + rnd() * 0.5, rnd() < 0.7 ? 'oak' : 'pine'); }
      else if (rnd() < 0.8) clump(x, z, 1 + Math.floor(rnd() * 2), 1.2);
    }
  }
  // 草地に散らばる茂みのかたまり
  for (let k = 0; k < 520; k++) {
    const x = 120 + rnd() * (SIZE - 240), z = 120 + rnd() * (SIZE - 240);
    if (inTown(x, z) || inField(x, z) || FL.some(f => Math.hypot(x - f.x, z - f.z) < f.r * 0.7)) continue;
    clump(x, z, 2 + Math.floor(rnd() * 4), 2.6);
  }
  // 家・納屋・小屋のまわり（庭の隅）
  for (const bd of ww.blds || []) {
    if (!['house', 'bungalow', 'barn', 'shed', 'chapel', 'ruin'].includes(bd.kind)) continue;
    const [x0, z0, x1, z1] = bd.rect;
    for (let m = 0; m < 2; m++) { if (rnd() < 0.45) continue; const sx = rnd() < 0.5 ? x0 - 1.8 : x1 + 1.8, sz = z0 + rnd() * (z1 - z0); bush(sx, sz, 0.75); }
  }
  // 町と村の庭の木
  for (let k = 0; k < 220; k++) {
    const [cx, cz, Rr] = pick([[800, 730, 105], [1010, 905, 55], [650, 1010, 60], [470, 865, 45]]);
    const x = cx + (rnd() - 0.5) * 2 * Rr, z = cz + (rnd() - 0.5) * 2 * Rr;
    if (roadDist(x, z) < 6.5 || !isFree(x - 1.5, z - 1.5, x + 1.5, z + 1.5) || FL.some(f => Math.hypot(x - f.x, z - f.z) < f.r * 0.6)) continue;
    tree(x, z, 0.65 + rnd() * 0.4, 'oak');
    occRect(x - 1, z - 1, x + 1, z + 1);
  }
  // 岩（ばらばらに・群れで。丘と端に多い）
  for (let k = 0; k < 260; k++) { const x = 80 + rnd() * (SIZE - 160), z = 80 + rnd() * (SIZE - 160); if (near(x, z) || inField(x, z) || inTown(x, z)) continue; rock(ww, x, z, 0.8 + rnd() * 2.2, rnd); }
  for (let k = 0; k < 40; k++) {
    const x = 160 + rnd() * 1080, z = 160 + rnd() * 1080; if (near(x, z) || inField(x, z) || inTown(x, z)) continue;
    for (let m = 0; m < 4 + Math.floor(rnd() * 4); m++) { const px = x + (rnd() - 0.5) * 12, pz = z + (rnd() - 0.5) * 12; if (!near(px, pz)) rock(ww, px, pz, 1 + rnd() * 2.4, rnd); }
  }
  // 舗装（広場は石畳・工場の構内はコンクリート）と歩道（町の通り）
  ww.paved = [[794, 704, 836, 768, 'plaza'], [498, 508, 644, 688, 'yard']];
  ww.walks = [[[704, 700], [902, 700]], [[748, 612], [748, 846]], [[840, 608], [840, 846]], [[748, 652], [884, 652]], [[700, 772], [884, 772]], [[790, 772], [790, 846]], [[790, 604], [790, 700]]];
  return finishWorld(ww);
}

function rock(ww, x, z, s, rnd) {
  const y = heightAt(ww, x, z) - 0.3 * s;
  const col = ['#8a8780', '#7c7a74', '#95918a'][Math.floor(rnd() * 3)];
  addBox(ww, { x0: x - s, z0: z - s * 0.8, x1: x + s, z1: z + s * 0.8, y0: y, y1: y + s * 1.1, mat: M.CONCRETE, kind: 'rock', col });
  if (s > 1.4) addBox(ww, { x0: x - s * 0.5, z0: z - s * 0.4, x1: x + s * 0.7, z1: z + s * 0.6, y0: y + s * 1.1, y1: y + s * 1.6, mat: M.CONCRETE, kind: 'rock', col });
}
// 壕を掘る（折れ線ぞいに、底の半分の幅 w・深さ dp。底は平ら、縁は 1.6m でなだらか）。点ごとに一番近い線までの距離で一度だけ下げる
function carveTrench(ww, pts, w, dp) {
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  const i0 = Math.max(0, Math.floor((x0 - 6) / ww.hs)), i1 = Math.min(ww.HW - 1, Math.ceil((x1 + 6) / ww.hs));
  const j0 = Math.max(0, Math.floor((z0 - 6) / ww.hs)), j1 = Math.min(ww.HD - 1, Math.ceil((z1 + 6) / ww.hs));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = i * ww.hs, z = j * ww.hs;
    let d = 1e9;
    for (let k = 0; k + 1 < pts.length; k++) d = Math.min(d, segDist(x, z, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]));
    if (d > w + 1.6) continue;
    const k2 = d <= w ? 1 : 1 - (d - w) / 1.6;
    ww.h[j * ww.HW + i] -= dp * k2;
  }
}
