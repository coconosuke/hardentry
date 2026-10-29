// 人の見た目: 骨17本（engine/pose.js と同じ）に部品を付けたローポリの体。頭身は実際の人に近く（約7.5頭身）。
// 部品は骨のローカル座標（Y=骨の向き）で作る。色は12色の色板（palette）で、服・装備を変える。
// 頂点: pos3 nrm3 uv2 layer1 pal1 joint1 ao1 = 12 floats
import { MeshBuilder, hex, mulc, mixc } from './build.js';
import { LAYER } from './textures.js';
import { BI, NBONE } from '../engine/pose.js';

export const SV = 12;
export const PAL = { skin: 0, top: 1, sleeve: 2, bottom: 3, shoes: 4, hands: 5, hair: 6, gear: 7, helmet: 8, faceU: 9, faceL: 10, dark: 11 };

// 部品を作るときの道具: col に [色板, 骨, 0] を入れておき、最後に並べ替える
class PartB extends MeshBuilder {
  constructor() { super(); this.joint = 0; this.pal = 0; }
  c(pal) { return [pal, this.joint, 0]; }
}

function bodyParts(B, o) {
  const fem = o.sex === 'f';
  const sw = fem ? 0.9 : 1, hw = fem ? 1.08 : 1; // 肩幅・腰幅の比
  const lt = LAYER.cloth, sk = LAYER.skin;
  // ---- 腰（pelvis: 原点=腰の中心、Y=上、Z=前、X=左）
  B.joint = BI.pelvis;
  B.loft([
    { y: -0.13, rx: 0.07 * hw, rz: 0.07, col: B.c(PAL.bottom) },
    { y: -0.09, rx: 0.15 * hw, rz: 0.1, col: B.c(PAL.bottom) },
    { y: -0.02, rx: 0.17 * hw, rz: 0.11, cz: -0.005, col: B.c(PAL.bottom) },
    { y: 0.05, rx: 0.165 * hw, rz: 0.105, col: B.c(PAL.dark) },
    { y: 0.075, rx: 0.16 * hw, rz: 0.1, col: B.c(PAL.top) },
  ], 10, lt, B.c(PAL.bottom), { capBot: true });
  // ---- 腹（spine: P→S 0.23）
  B.joint = BI.spine;
  B.loft([
    { y: 0.07, rx: 0.155 * Math.max(hw, 1), rz: 0.1, col: B.c(PAL.top) },
    { y: 0.16, rx: 0.15, rz: 0.1, cz: 0.004, col: B.c(PAL.top) },
    { y: 0.235, rx: 0.155, rz: 0.105, cz: 0.006, col: B.c(PAL.top) },
  ], 10, lt, B.c(PAL.top));
  // ---- 胸（chest: S→N 0.33）
  B.joint = BI.chest;
  B.loft([
    { y: 0.0, rx: 0.155, rz: 0.105, cz: 0.006, col: B.c(PAL.top) },
    { y: 0.12, rx: 0.17 * sw, rz: 0.118, cz: fem ? 0.02 : 0.012, col: B.c(PAL.top) },
    { y: 0.22, rx: 0.19 * sw, rz: 0.12, cz: 0.008, col: B.c(PAL.top) },
    { y: 0.29, rx: 0.2 * sw, rz: 0.105, cz: -0.005, col: B.c(PAL.top) },
    { y: 0.335, rx: 0.1 * sw, rz: 0.07, cz: -0.01, col: B.c(PAL.top) },
  ], 10, lt, B.c(PAL.top), { capTop: true });
  // 肩の丸み
  for (const sx of [1, -1]) B.loft([
    { y: 0.2, rx: 0.06, rz: 0.06, cx: sx * 0.165 * sw, col: B.c(PAL.top) },
    { y: 0.27, rx: 0.068, rz: 0.066, cx: sx * 0.175 * sw, col: B.c(PAL.top) },
    { y: 0.33, rx: 0.03, rz: 0.03, cx: sx * 0.17 * sw, col: B.c(PAL.top) },
  ], 7, lt, B.c(PAL.top), { capTop: true });
  // ---- 首
  B.joint = BI.neck;
  B.cyl(0, 0.008, -0.02, 0.1, 0.056, 0.052, 8, sk, B.c(PAL.skin), { capT: false });
  // ---- 頭（neckTop が原点、Y=上、Z=顔の前、X=左）
  B.joint = BI.head;
  headMesh(B, o);
  // ---- 腕（上腕・前腕・手）
  for (const side of ['L', 'R']) {
    B.joint = BI['uarm' + side];
    B.loft([
      { y: -0.02, rx: 0.056, rz: 0.058, col: B.c(PAL.top) },
      { y: 0.12, rx: 0.05, rz: 0.053, col: B.c(PAL.top) },
      { y: 0.14, rx: 0.05, rz: 0.052, col: B.c(PAL.sleeve) },
      { y: 0.3, rx: 0.042, rz: 0.044, col: B.c(PAL.sleeve) },
    ], 7, lt, B.c(PAL.top), { capBot: true });
    B.joint = BI['farm' + side];
    B.loft([
      { y: -0.01, rx: 0.043, rz: 0.044, col: B.c(PAL.sleeve) },
      { y: 0.1, rx: 0.042, rz: 0.04, col: B.c(PAL.sleeve) },
      { y: 0.25, rx: 0.03, rz: 0.026, col: B.c(PAL.sleeve) },
      { y: 0.265, rx: 0.029, rz: 0.025, col: B.c(PAL.hands) },
    ], 7, lt, B.c(PAL.sleeve));
    B.joint = BI['hand' + side];
    // 手のひら＋指（握った形）: 厚さは X、指の並びは Z
    const sg = side === 'L' ? 1 : -1;
    B.box(-0.018, -0.005, -0.044, 0.018, 0.092, 0.044, LAYER.rubber, B.c(PAL.hands));
    B.box(sg > 0 ? -0.028 : -0.012, 0.082, -0.042, sg > 0 ? 0.012 : 0.028, 0.122, 0.042, LAYER.rubber, B.c(PAL.hands));
    B.box(sg * 0.012 - 0.012, 0.015, 0.03, sg * 0.012 + 0.012, 0.075, 0.058, LAYER.rubber, B.c(PAL.hands));
  }
  // ---- 脚（腿・すね・足）
  for (const side of ['L', 'R']) {
    B.joint = BI['thigh' + side];
    B.loft([
      { y: -0.04, rx: 0.088 * hw, rz: 0.09, col: B.c(PAL.bottom) },
      { y: 0.12, rx: 0.08 * hw, rz: 0.083, col: B.c(PAL.bottom) },
      { y: 0.3, rx: 0.066, rz: 0.068, col: B.c(PAL.bottom) },
      { y: 0.45, rx: 0.056, rz: 0.06, col: B.c(PAL.bottom) },
    ], 8, lt, B.c(PAL.bottom), { capBot: true });
    B.joint = BI['shin' + side];
    B.loft([
      { y: -0.01, rx: 0.056, rz: 0.058, col: B.c(PAL.bottom) },
      { y: 0.12, rx: 0.056, rz: 0.06, cz: -0.006, col: B.c(PAL.bottom) },
      { y: 0.36, rx: 0.044, rz: 0.044, col: B.c(PAL.bottom) },
      { y: 0.38, rx: 0.048, rz: 0.048, col: B.c(PAL.shoes) },
      { y: 0.43, rx: 0.046, rz: 0.046, col: B.c(PAL.shoes) },
    ], 7, lt, B.c(PAL.bottom));
    B.joint = BI['foot' + side];
    // 足: Y=つま先へ、Z=上。足首は床から0.075
    B.box(-0.048, -0.075, -0.075, 0.048, 0.19, 0.005, LAYER.rubber, B.c(PAL.shoes), { cols: [null, null, null, null, B.c(PAL.shoes), B.c(PAL.dark)] });
    B.box(-0.044, -0.06, 0.005, 0.044, 0.05, 0.05, LAYER.rubber, B.c(PAL.shoes));
  }
}

function headMesh(B, o) {
  const fem = o.sex === 'f';
  const k = fem ? 0.94 : 1;
  // 輪: y, 横半径, 前後半径, 前後のずれ, 色（顔の上・目の帯・下）
  const R = [
    { y: -0.035, rx: 0.035 * k, rz: 0.03, cz: 0.07, col: B.c(PAL.faceL) },   // あご先
    { y: -0.01, rx: 0.055 * k, rz: 0.06, cz: 0.045, col: B.c(PAL.faceL) },
    { y: 0.03, rx: 0.068 * k, rz: 0.088, cz: 0.02, col: B.c(PAL.faceL) },
    { y: 0.075, rx: 0.074 * k, rz: 0.1, cz: 0.012, col: B.c(PAL.faceL) },
    { y: 0.105, rx: 0.076 * k, rz: 0.103, cz: 0.008, col: B.c(PAL.skin) },   // 目の高さ
    { y: 0.135, rx: 0.077 * k, rz: 0.104, cz: 0.004, col: B.c(PAL.faceU) },
    { y: 0.175, rx: 0.07 * k, rz: 0.095, cz: -0.004, col: B.c(PAL.faceU) },
    { y: 0.205, rx: 0.05 * k, rz: 0.07, cz: -0.01, col: B.c(PAL.faceU) },
    { y: 0.222, rx: 0.02 * k, rz: 0.03, cz: -0.012, col: B.c(PAL.faceU) },
  ];
  B.loft(R, 10, LAYER.skin, B.c(PAL.skin), { capTop: true, capBot: true, rot: Math.PI / 2 });
  // 鼻
  B.tube([0, 0.105, 0.105], [0, 0.06, 0.122], 0.012, 0.018, 4, LAYER.skin, B.c(PAL.faceL), { caps: true });
  // 眉と目（暗い色）
  for (const sx of [1, -1]) {
    B.box(sx * 0.044 - 0.016, 0.108, 0.087, sx * 0.044 + 0.016, 0.118, 0.096, LAYER.plain, B.c(PAL.dark));
    B.box(sx * 0.046 - 0.02, 0.124, 0.09, sx * 0.046 + 0.02, 0.131, 0.1, LAYER.plain, B.c(PAL.hair));
  }
  // 耳
  for (const sx of [1, -1]) B.box(sx * 0.074 - 0.012, 0.06, -0.01, sx * 0.074 + 0.012, 0.115, 0.022, LAYER.skin, B.c(PAL.skin));
  // 口
  B.box(-0.02, 0.028, 0.097, 0.02, 0.034, 0.1, LAYER.plain, B.c(PAL.dark));
}

// ---- 装備と服の部品
const GEAR = {
  // SWAT の防弾ベスト（プレートキャリア）とポーチ
  vest(B, o) {
    B.joint = BI.chest;
    const g = B.c(PAL.gear);
    B.box(-0.155, 0.0, 0.1, 0.155, 0.27, 0.15, LAYER.nylon, g);                 // 前の板
    B.box(-0.155, 0.02, -0.15, 0.155, 0.28, -0.1, LAYER.nylon, g);              // 後ろの板
    for (const sx of [1, -1]) B.box(sx * 0.07 - 0.03, 0.26, -0.12, sx * 0.07 + 0.03, 0.31, 0.13, LAYER.nylon, g); // 肩ひも
    B.joint = BI.spine;
    B.loft([{ y: 0.06, rx: 0.172, rz: 0.122 }, { y: 0.23, rx: 0.172, rz: 0.125 }], 10, LAYER.nylon, g); // 腹巻き
    // 弾倉のポーチ（3つ）
    for (const x of [-0.08, 0, 0.08]) B.box(x - 0.035, 0.08, 0.12, x + 0.035, 0.2, 0.16, LAYER.nylon, B.c(PAL.gear));
    B.box(-0.17, 0.1, -0.06, -0.12, 0.2, 0.04, LAYER.nylon, g); // 無線
    B.joint = BI.chest;
    B.box(-0.12, 0.12, -0.153, 0.12, 0.2, -0.149, LAYER.plain, B.c(PAL.dark)); // 背中の帯
  },
  // 容疑者の防弾ベスト（簡素）
  vestSus(B, o) {
    B.joint = BI.chest;
    const g = B.c(PAL.gear);
    B.box(-0.15, 0.0, 0.098, 0.15, 0.25, 0.14, LAYER.nylon, g);
    B.box(-0.15, 0.02, -0.14, 0.15, 0.26, -0.098, LAYER.nylon, g);
    B.joint = BI.spine;
    B.loft([{ y: 0.08, rx: 0.168, rz: 0.118 }, { y: 0.22, rx: 0.168, rz: 0.12 }], 10, LAYER.nylon, g);
  },
  belt(B, o) {
    B.joint = BI.pelvis;
    B.loft([{ y: 0.035, rx: 0.175, rz: 0.115 }, { y: 0.07, rx: 0.172, rz: 0.112 }], 10, LAYER.nylon, B.c(PAL.dark));
    B.joint = BI.thighR;
    B.box(-0.11, 0.04, -0.03, -0.07, 0.22, 0.07, LAYER.nylon, B.c(PAL.dark)); // 拳銃のホルスター（右腿の外側）
  },
  knees(B, o) {
    for (const s of ['L', 'R']) { B.joint = BI['shin' + s]; B.box(-0.045, -0.02, 0.03, 0.045, 0.07, 0.075, LAYER.rubber, B.c(PAL.dark)); }
  },
  helmet(B, o) {
    B.joint = BI.head;
    const h = B.c(PAL.helmet);
    B.loft([
      { y: 0.105, rx: 0.088, rz: 0.115, cz: -0.005 },
      { y: 0.16, rx: 0.088, rz: 0.114, cz: -0.004 },
      { y: 0.215, rx: 0.07, rz: 0.092, cz: -0.008 },
      { y: 0.245, rx: 0.035, rz: 0.05, cz: -0.01 },
    ], 10, LAYER.paint, h, { capTop: true, rot: Math.PI / 2 });
    // 後ろの下がり
    B.box(-0.07, 0.06, -0.118, 0.07, 0.11, -0.085, LAYER.paint, h);
    // 耳の上のレール
    for (const sx of [1, -1]) B.box(sx * 0.088 - 0.006, 0.12, -0.04, sx * 0.088 + 0.006, 0.15, 0.06, LAYER.rubber, B.c(PAL.dark));
    // 暗視装置のマウント
    B.box(-0.022, 0.17, 0.105, 0.022, 0.21, 0.125, LAYER.rubber, B.c(PAL.dark));
  },
  nvg(B, o) {
    B.joint = BI.head;
    B.box(-0.045, 0.14, 0.12, 0.045, 0.19, 0.17, LAYER.rubber, B.c(PAL.dark));
    for (const sx of [1, -1]) B.tube([sx * 0.025, 0.155, 0.17], [sx * 0.025, 0.155, 0.2], 0.016, 0.017, 6, LAYER.rubber, B.c(PAL.dark), { caps: true });
  },
  gasmask(B, o) {
    B.joint = BI.head;
    B.box(-0.065, 0.02, 0.07, 0.065, 0.14, 0.115, LAYER.rubber, B.c(PAL.dark));
    B.tube([0, 0.05, 0.11], [0, 0.03, 0.15], 0.03, 0.032, 7, LAYER.rubber, B.c(PAL.dark), { caps: true });
    for (const sx of [1, -1]) B.tube([sx * 0.06, 0.04, 0.09], [sx * 0.085, 0.02, 0.12], 0.024, 0.028, 7, LAYER.rubber, B.c(PAL.dark), { caps: true });
  },
  goggles(B, o) {
    B.joint = BI.head;
    B.box(-0.075, 0.1, 0.085, 0.075, 0.135, 0.11, LAYER.rubber, B.c(PAL.dark));
  },
  facemask(B, o) {
    B.joint = BI.head;
    B.box(-0.07, -0.02, 0.07, 0.07, 0.1, 0.112, LAYER.paint, B.c(PAL.helmet));
  },
  cap(B, o) {
    B.joint = BI.head;
    B.loft([{ y: 0.13, rx: 0.081, rz: 0.108 }, { y: 0.19, rx: 0.074, rz: 0.1 }, { y: 0.225, rx: 0.03, rz: 0.04 }], 10, LAYER.cloth, B.c(PAL.helmet), { capTop: true, rot: Math.PI / 2 });
    B.box(-0.07, 0.13, 0.08, 0.07, 0.142, 0.19, LAYER.cloth, B.c(PAL.helmet));
  },
  beanie(B, o) {
    B.joint = BI.head;
    B.loft([{ y: 0.115, rx: 0.081, rz: 0.108 }, { y: 0.18, rx: 0.078, rz: 0.104 }, { y: 0.23, rx: 0.045, rz: 0.06 }, { y: 0.24, rx: 0.01, rz: 0.01 }], 10, LAYER.fabric, B.c(PAL.helmet), { capTop: true, rot: Math.PI / 2 });
  },
  hood(B, o) {
    B.joint = BI.chest;
    B.loft([{ y: 0.27, rx: 0.12, rz: 0.09, cz: -0.05 }, { y: 0.34, rx: 0.1, rz: 0.08, cz: -0.06 }], 8, LAYER.cloth, B.c(PAL.top), { capTop: true });
  },
  hairShort(B, o) {
    B.joint = BI.head;
    B.loft([{ y: 0.12, rx: 0.079, rz: 0.107, cz: -0.004 }, { y: 0.18, rx: 0.074, rz: 0.1, cz: -0.008 }, { y: 0.215, rx: 0.052, rz: 0.075, cz: -0.012 }, { y: 0.229, rx: 0.02, rz: 0.03, cz: -0.012 }], 10, LAYER.fabric, B.c(PAL.hair), { capTop: true, rot: Math.PI / 2 });
    B.box(-0.07, 0.05, -0.11, 0.07, 0.13, -0.08, LAYER.fabric, B.c(PAL.hair));
  },
  hairLong(B, o) {
    GEAR.hairShort(B, o);
    B.joint = BI.head;
    B.box(-0.075, -0.06, -0.115, 0.075, 0.13, -0.06, LAYER.fabric, B.c(PAL.hair));
    for (const sx of [1, -1]) B.box(sx * 0.075 - 0.012, 0.0, -0.08, sx * 0.075 + 0.012, 0.13, 0.03, LAYER.fabric, B.c(PAL.hair));
  },
  beard(B, o) {
    B.joint = BI.head;
    B.loft([{ y: -0.04, rx: 0.035, rz: 0.03, cz: 0.072 }, { y: 0.0, rx: 0.058, rz: 0.065, cz: 0.045 }, { y: 0.05, rx: 0.071, rz: 0.093, cz: 0.02 }], 10, LAYER.fabric, B.c(PAL.hair), { capBot: true, rot: Math.PI / 2 });
  },
  backpack(B, o) {
    B.joint = BI.chest;
    B.box(-0.13, 0.0, -0.27, 0.13, 0.3, -0.13, LAYER.nylon, B.c(PAL.gear));
  },
  jacket(B, o) {
    // 上着のすそ（腰まわり）
    B.joint = BI.pelvis;
    B.loft([{ y: 0.0, rx: 0.178, rz: 0.12 }, { y: 0.09, rx: 0.172, rz: 0.115 }], 10, LAYER.cloth, B.c(PAL.top));
  },
  skirt(B, o) {
    B.joint = BI.pelvis;
    B.loft([{ y: -0.32, rx: 0.2, rz: 0.15, col: B.c(PAL.bottom) }, { y: -0.1, rx: 0.18, rz: 0.13, col: B.c(PAL.bottom) }, { y: 0.06, rx: 0.165, rz: 0.108, col: B.c(PAL.bottom) }], 10, LAYER.cloth, B.c(PAL.bottom), { capBot: true });
  },
  apron(B, o) {
    B.joint = BI.spine;
    B.box(-0.13, -0.1, 0.105, 0.13, 0.22, 0.118, LAYER.cloth, B.c(PAL.gear));
    B.joint = BI.pelvis;
    B.box(-0.14, -0.3, 0.11, 0.14, 0.05, 0.125, LAYER.cloth, B.c(PAL.gear));
  },
};

// 1人の見た目の種類から、体＋装備のメッシュを作る（キャッシュ）
const cache = new Map();
export function personMeshData(look) {
  const key = (look.sex || 'm') + '|' + (look.gear || []).join(',');
  let d = cache.get(key);
  if (d) return { key, d };
  const B = new PartB();
  bodyParts(B, look);
  for (const g of (look.gear || [])) if (GEAR[g]) GEAR[g](B, look);
  // 並べ替え: MeshBuilder の頂点（15） → 人の頂点（12）
  const n = B.n, v = new Float32Array(n * SV);
  for (let k = 0; k < n; k++) {
    const s = k * 15, o = k * SV;
    v[o] = B.v[s]; v[o + 1] = B.v[s + 1]; v[o + 2] = B.v[s + 2];
    v[o + 3] = B.v[s + 3]; v[o + 4] = B.v[s + 4]; v[o + 5] = B.v[s + 5];
    v[o + 6] = B.v[s + 6] * 4; v[o + 7] = B.v[s + 7] * 4;
    v[o + 8] = B.v[s + 8];
    v[o + 9] = B.v[s + 9]; v[o + 10] = B.v[s + 10]; v[o + 11] = B.v[s + 12];
  }
  const idx = n > 65535 ? new Uint32Array(B.i) : new Uint16Array(B.i);
  d = { v, i: idx, n };
  cache.set(key, d);
  return { key, d };
}

// ---- 見た目の決め方（人の種類・乱数の種から）
const SKINS = ['#f1c9a8', '#e0ac85', '#c68e65', '#a86f4b', '#8a5a3b', '#6a4129', '#d9b38c', '#b88663'].map(hex);
const HAIRS = ['#1e1611', '#3a2a1e', '#5c4330', '#8a6a46', '#2a2522', '#b8a27a', '#6b6460', '#151313'].map(hex);
const TOPS = ['#2d3b4f', '#6b2b2b', '#3b4a33', '#7a7468', '#1f1f22', '#8a6a3a', '#5a5f66', '#c9c5bb', '#4a3a5c', '#2f5a5a', '#9a3d2e', '#d8d2c4'].map(hex);
const BOTTOMS = ['#2a3448', '#3d4a5e', '#1f2024', '#5e5546', '#6b6355', '#33302c', '#4a4f57'].map(hex);
const SHOES = ['#1b1b1d', '#3a2c22', '#e6e4dd', '#5a4a3a', '#2a2a30'].map(hex);
function rnd(seed, k) { let h = (Math.imul(seed | 0, 0x9E3779B1) ^ Math.imul(k + 1, 0x85EBCA77)) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; return (h >>> 0) / 4294967296; }
function pk(arr, seed, k) { return arr[Math.floor(rnd(seed, k) * arr.length)]; }

// kind: 'swat' | 'sus' | 'civ' | 'pvpRed' ...; o: { seed, armor, helmet, head, prof, team, sex, hostage }
export function lookFor(o) {
  const s = o.seed >>> 0;
  const pal = new Float32Array(12 * 3);
  const set = (slot, c) => { pal[slot * 3] = c[0]; pal[slot * 3 + 1] = c[1]; pal[slot * 3 + 2] = c[2]; };
  const skin = pk(SKINS, s, 1), hair = pk(HAIRS, s, 2);
  const sex = o.sex || (o.kind === 'swat' ? (rnd(s, 3) < 0.12 ? 'f' : 'm') : rnd(s, 3) < (o.kind === 'civ' ? 0.45 : 0.15) ? 'f' : 'm');
  const gear = [];
  set(PAL.skin, skin); set(PAL.hair, hair); set(PAL.faceU, skin); set(PAL.faceL, skin); set(PAL.dark, hex('#1a1a1c'));
  if (o.kind === 'swat') {
    // 紺の制服、黒の手袋、ベスト（陣営の色: 青）
    const uni = o.uniform ? hex(o.uniform) : hex('#232c3b');
    set(PAL.top, uni); set(PAL.sleeve, uni); set(PAL.bottom, mulc(uni, 0.92)); set(PAL.shoes, hex('#18181a')); set(PAL.hands, hex('#1c1d20'));
    set(PAL.gear, o.gearCol ? hex(o.gearCol) : hex('#2b3240')); set(PAL.helmet, o.helmetCol ? hex(o.helmetCol) : hex('#262b33'));
    if (o.armor !== 'none') gear.push('vest');
    gear.push('belt', 'knees');
    if (o.helmet !== 'none') gear.push('helmet'); else gear.push('hairShort');
    if (o.head === 'nvg') gear.push('nvg'); else if (o.head === 'gasmask') gear.push('gasmask'); else if (o.head === 'goggles') gear.push('goggles'); else if (o.head === 'facemask') gear.push('facemask');
    // 目出し帽（半分くらい）
    if (o.head !== 'gasmask' && rnd(s, 9) < 0.45) { set(PAL.faceU, hex('#1d1e21')); set(PAL.faceL, hex('#1d1e21')); }
    if (sex === 'f' && o.helmet === 'none') gear.push('hairLong');
  } else if (o.kind === 'sus') {
    const top = pk(TOPS, s, 4), bot = pk(BOTTOMS, s, 5);
    set(PAL.top, top); set(PAL.bottom, bot); set(PAL.shoes, pk(SHOES, s, 6));
    const sleeve = rnd(s, 7);
    set(PAL.sleeve, sleeve < 0.4 ? skin : top); set(PAL.hands, rnd(s, 8) < 0.35 ? hex('#1c1c1e') : skin);
    set(PAL.gear, o.pro ? hex(rnd(s, 10) < 0.5 ? '#3b4030' : '#222326') : hex('#2a2b2e'));
    const hat = rnd(s, 11);
    set(PAL.helmet, pk(TOPS, s, 12));
    if (o.helmet && o.helmet !== 'none') { gear.push('helmet'); set(PAL.helmet, hex('#30352c')); }
    else if (hat < 0.2) gear.push('cap');
    else if (hat < 0.38) gear.push('beanie');
    else if (hat < 0.55) { set(PAL.faceU, hex('#151517')); set(PAL.faceL, hex('#151517')); gear.push('beanie'); set(PAL.helmet, hex('#151517')); } // 目出し帽
    else if (sex === 'f') gear.push('hairLong'); else if (rnd(s, 13) < 0.8) gear.push('hairShort');
    if (hat >= 0.55 && hat < 0.7) { set(PAL.faceL, pk([hex('#7a1a1a'), hex('#1a2a5a'), hex('#1a1a1a')], s, 14)); } // バンダナ
    if (sex === 'm' && rnd(s, 15) < 0.3 && hat >= 0.55) gear.push('beard');
    if (rnd(s, 16) < 0.35) gear.push('hood');
    if (rnd(s, 17) < 0.4) gear.push('jacket');
    if (o.armor && o.armor !== 'none') gear.push(o.pro ? 'vest' : 'vestSus');
    if (o.pro) gear.push('belt');
  } else {
    // 市民
    const top = pk(TOPS, s, 4), bot = pk(BOTTOMS, s, 5);
    set(PAL.top, top); set(PAL.bottom, bot); set(PAL.shoes, pk(SHOES, s, 6));
    set(PAL.sleeve, rnd(s, 7) < 0.5 ? skin : top); set(PAL.hands, skin);
    set(PAL.gear, hex('#d8d3c8')); set(PAL.helmet, pk(TOPS, s, 12));
    if (o.prof === 'elder') { set(PAL.hair, hex('#c9c6c0')); }
    if (sex === 'f') { gear.push('hairLong'); if (rnd(s, 18) < 0.4) gear.push('skirt'); }
    else if (rnd(s, 13) < 0.85) gear.push('hairShort');
    if (sex === 'm' && rnd(s, 15) < 0.25) gear.push('beard');
    if (o.prof === 'staff') { gear.push('apron'); set(PAL.gear, hex('#c9483a')); }
    if (rnd(s, 17) < 0.3) gear.push('jacket');
    if (o.prof !== 'staff' && rnd(s, 19) < 0.15) gear.push('cap');
  }
  return { sex, gear, pal };
}

// 骨の枠（pose.js の出力: 1本12個 = 原点3 + X3 + Y3 + Z3）→ 行列（列優先 mat4 × 17）
export function boneMatrices(bones, s, out) {
  for (let b = 0; b < NBONE; b++) {
    const o = b * 12, m = b * 16;
    out[m] = bones[o + 3] * s; out[m + 1] = bones[o + 4] * s; out[m + 2] = bones[o + 5] * s; out[m + 3] = 0;
    out[m + 4] = bones[o + 6] * s; out[m + 5] = bones[o + 7] * s; out[m + 6] = bones[o + 8] * s; out[m + 7] = 0;
    out[m + 8] = bones[o + 9] * s; out[m + 9] = bones[o + 10] * s; out[m + 10] = bones[o + 11] * s; out[m + 11] = 0;
    out[m + 12] = bones[o]; out[m + 13] = bones[o + 1]; out[m + 14] = bones[o + 2]; out[m + 15] = 1;
  }
  return out;
}
