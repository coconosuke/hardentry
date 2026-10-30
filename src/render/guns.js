// 銃の見た目（ローポリの実銃）。ローカル: X=左、Y=上、Z=前（銃口）。原点は引き金の上の銃身の軸。
// 部品: 本体・弾倉（リロードで動く）・前の握り（ポンプ）。照準の高さと目の位置（ADS）、手の位置、銃口の位置も返す。
import { MeshBuilder, hex, mulc, cross, nrm } from './build.js';
import { LAYER } from './textures.js';
import { WEAPONS } from '../engine/data/weapons.js';

const K = {
  blk: hex('#2d2f34'), dg: hex('#3b3e44'), mg: hex('#565a61'), steel: hex('#6c7178'), fde: hex('#a08766'), wood: hex('#6b4529'), woodL: hex('#8a5a34'),
  od: hex('#47502f'), grn: hex('#2a2f28'), orange: hex('#d46224'), yel: hex('#d8b62a'), plum: hex('#4a2a22'), smoke: hex('#4a4640'), tan: hex('#b39a72'), brass: hex('#b08a3e'),
};

// 面取りの幅: 部品の一番細い所の2割（0.6〜4mm）。小さな部品ほど細かく、縁に光が乗る
const bev = (a, b, c) => Math.max(0.0006, Math.min(0.004, Math.min(a, b, c) * 0.2));
// 向きのある箱（中心 c、軸 u v w、半分の長さ）。面取りつき
function obox(B, c, u, v, w, hu, hv, hw, layer, col) {
  const prev = B.xf;
  B.xf = [u[0], u[1], u[2], v[0], v[1], v[2], w[0], w[1], w[2], c[0], c[1], c[2]];
  B.bbox(-hu, -hv, -hw, hu, hv, hw, bev(hu * 2, hv * 2, hw * 2), layer, col);
  B.xf = prev;
}
// 傾いた握り: 上の点 (y0,z0) から下の点 (y1,z1) へ、厚さ x、前後 d
function grip(B, y0, z0, y1, z1, hx, hd, col, layer = LAYER.rubber) {
  const c = [0, (y0 + y1) / 2, (z0 + z1) / 2];
  let v = nrm([0, y0 - y1, z0 - z1]);
  const L = Math.hypot(y0 - y1, z0 - z1) / 2;
  const u = [1, 0, 0], w = cross(u, v);
  obox(B, c, u, v, w, hx, L, hd, layer, col);
}
const bx = (B, x0, y0, z0, x1, y1, z1, col, layer = LAYER.paint) => { const a = Math.min(x0, x1), b = Math.min(y0, y1), c = Math.min(z0, z1), d = Math.max(x0, x1), e = Math.max(y0, y1), g = Math.max(z0, z1); B.bbox(a, b, c, d, e, g, bev(d - a, e - b, g - c), layer, col); };
const sbx = (B, hx, y0, z0, y1, z1, col, layer) => bx(B, -hx, y0, z0, hx, y1, z1, col, layer);
const tz = (B, z0, z1, r, y, col, seg = 8, r1, x = 0) => B.tube([x, y, z0], [x, y, z1], r, r1 ?? r, seg, LAYER.metal, col, { caps: true });
// 照門（のぞき穴の輪）: 照準の線 y を中心に、まわりの枠だけ
function peep(B, y, z, col = K.blk, base) {
  const h = 0.0105, t = 0.0028, d = 0.006;
  bx(B, h, y - h, z - d, h - t, y + h, z + d, col); bx(B, -h, y - h, z - d, -h + t, y + h, z + d, col);
  bx(B, -h, y + h - t, z - d, h, y + h, z + d, col); bx(B, -h, y - h, z - d, h, y - h + t, z + d, col);
  if (base != null) bx(B, -0.006, base, z - d, 0.006, y - h, z + d, col);
}
// 照門（切り欠き）: 2本の柱のすき間から見る（拳銃など）
function notch(B, y, z, col = K.blk, base) {
  const g = 0.0032, w = 0.0085, d = 0.005;
  bx(B, g, base ?? y - 0.007, z - d, w, y + 0.0015, z + d, col); bx(B, -g, base ?? y - 0.007, z - d, -w, y + 0.0015, z + d, col);
}
// 照星（細い柱）: 先が照準の線
function post(B, y, z, col = K.blk, base) { bx(B, -0.0016, base ?? y - 0.014, z - 0.003, 0.0016, y + 0.0004, z + 0.003, col); }

// 曲がった弾倉（上 z0..z1、y0 から下へ、段ごとに前へ）
function curvedMag(B, z0, z1, y0, len, curve, hx, col, segs = 3) {
  const h = len / segs;
  for (let s = 0; s < segs; s++) {
    const a = s / segs, b = (s + 1) / segs;
    const off0 = curve * a * a, off1 = curve * b * b;
    const ya = y0 - h * s, yb = y0 - h * (s + 1);
    // 前後の幅が下へ少し広がる
    const c = [0, (ya + yb) / 2, (z0 + z1) / 2 + (off0 + off1) / 2];
    const v = nrm([0, ya - yb, off0 - off1]);
    const u = [1, 0, 0], w = cross(u, v);
    obox(B, c, u, v, w, hx, Math.hypot(ya - yb, off1 - off0) / 2 + 0.001, (z1 - z0) / 2 * (1 + a * 0.08), LAYER.paint, col);
  }
}

// ---- 型ごとの形
const MODELS = {
  ar15(B, P, o) {
    const mdl = o.mdl || {}, bl = mdl.barrel || 0.26;
    const rc = o.fde ? K.fde : K.blk;
    sbx(B, 0.0125, -0.055, -0.13, 0.0, 0.06, K.dg);                 // 下の機関部
    sbx(B, 0.016, -0.078, 0.0, 0.0, 0.085, K.dg);                   // 弾倉の差し込み口
    sbx(B, 0.014, 0.0, -0.13, 0.042, 0.12, K.dg);                   // 上の機関部
    sbx(B, 0.011, 0.042, -0.125, 0.052, 0.12, K.blk);               // レール
    sbx(B, 0.006, 0.026, -0.152, 0.04, -0.13, K.blk);               // 槓桿
    bx(B, -0.0145, 0.008, -0.03, -0.0148, 0.03, 0.06, K.blk);       // 排莢口
    const hg = mdl.rail === 'hk' ? 0.25 : 0.23, hz = 0.12;
    sbx(B, 0.023, -0.032, hz, 0.04, hz + hg, rc, LAYER.metal);      // ハンドガード
    sbx(B, 0.011, 0.04, hz, 0.052, hz + hg, K.blk);                 // 上のレール
    tz(B, hz + hg, 0.12 + bl, 0.009, 0.006, K.dg);                  // 銃身
    tz(B, 0.12 + bl, 0.12 + bl + 0.045, 0.012, 0.006, K.blk, 6);    // 消炎器
    sbx(B, 0.005, 0.052, hz + hg - 0.025, 0.056, hz + hg - 0.012, K.blk); post(B, 0.064, hz + hg - 0.018, K.blk, 0.056); // 照星
    peep(B, 0.064, -0.1, K.blk, 0.052);                              // 照門
    tz(B, -0.13, -0.3, 0.015, 0.012, K.blk);                        // バッファーチューブ
    // 銃床
    if (mdl.stock === 'hk') { sbx(B, 0.02, -0.06, -0.33, 0.035, -0.22, K.blk); sbx(B, 0.022, -0.065, -0.345, 0.04, -0.325, K.dg); }
    else { sbx(B, 0.019, -0.055, -0.33, 0.032, -0.21, K.blk); sbx(B, 0.021, -0.072, -0.345, 0.036, -0.325, K.dg); }
    grip(B, -0.05, -0.06, -0.15, -0.1, 0.014, 0.018, K.blk);
    sbx(B, 0.004, -0.078, -0.05, -0.072, 0.005, K.blk);             // 用心金
    P.sightY = 0.064; P.eyeZ = -0.24; P.muzzle = 0.12 + bl + 0.045; P.railZ = [-0.1, 0.1]; P.rail2 = [hz + 0.05, hz + hg - 0.03]; P.foreY = -0.032;
    P.gripR = [0, -0.1, -0.08]; P.gripL = [0, -0.04, hz + hg * 0.6]; P.magWell = [0, -0.08, 0.04];
    P.mag = (M) => curvedMag(M, 0.003, 0.08, -0.075, 0.17, 0.035, 0.012, o.fde ? K.fde : K.blk);
  },
  g36(B, P, o) {
    const c = K.grn;
    sbx(B, 0.022, -0.045, -0.12, 0.035, 0.18, c, LAYER.rubber);
    sbx(B, 0.016, 0.035, -0.08, 0.075, 0.12, c, LAYER.rubber);      // 持ち手と照準
    peep(B, 0.088, -0.06, c, 0.075); post(B, 0.088, 0.1, c, 0.075);
    sbx(B, 0.024, -0.04, 0.12, 0.03, 0.3, c, LAYER.rubber);         // ハンドガード
    tz(B, 0.3, 0.36, 0.009, 0.0, K.dg); tz(B, 0.36, 0.39, 0.012, 0.0, K.blk, 6);
    // 骨組みの折りたたみ銃床
    sbx(B, 0.014, 0.0, -0.32, 0.03, -0.12, c, LAYER.rubber); sbx(B, 0.014, -0.07, -0.33, 0.03, -0.3, c, LAYER.rubber); sbx(B, 0.012, -0.07, -0.3, -0.05, -0.15, c, LAYER.rubber);
    grip(B, -0.045, -0.04, -0.14, -0.08, 0.015, 0.019, c);
    P.sightY = 0.088; P.eyeZ = -0.22; P.muzzle = 0.39; P.railZ = [-0.06, 0.1]; P.rail2 = [0.16, 0.28]; P.foreY = -0.04; P.railY = 0.075;
    P.gripR = [0, -0.09, -0.06]; P.gripL = [0, -0.045, 0.22]; P.magWell = [0, -0.06, 0.06];
    P.mag = (M) => curvedMag(M, 0.025, 0.1, -0.045, 0.17, 0.04, 0.013, K.smoke);
  },
  scar(B, P, o) {
    const f = K.fde;
    sbx(B, 0.023, 0.0, -0.15, 0.05, 0.26, f, LAYER.metal);          // 上の機関部（長い）
    sbx(B, 0.011, 0.05, -0.14, 0.06, 0.25, K.blk);
    sbx(B, 0.018, -0.06, -0.12, 0.0, 0.08, f, LAYER.rubber);
    sbx(B, 0.016, -0.08, 0.0, 0.0, 0.085, f, LAYER.rubber);
    tz(B, 0.26, 0.34, 0.0095, 0.012, K.dg); tz(B, 0.34, 0.385, 0.013, 0.012, K.blk, 6);
    sbx(B, 0.02, -0.05, -0.38, 0.045, -0.16, f, LAYER.rubber); sbx(B, 0.018, 0.045, -0.33, 0.06, -0.22, f, LAYER.rubber);
    grip(B, -0.05, -0.06, -0.15, -0.1, 0.014, 0.018, K.blk);
    post(B, 0.072, 0.238, K.blk, 0.06); peep(B, 0.072, -0.12, K.blk, 0.06);
    P.sightY = 0.072; P.eyeZ = -0.25; P.muzzle = 0.385; P.railZ = [-0.1, 0.12]; P.railY = 0.06; P.rail2 = [0.14, 0.24]; P.foreY = 0.0;
    P.gripR = [0, -0.1, -0.08]; P.gripL = [0, 0.0, 0.2]; P.magWell = [0, -0.08, 0.04];
    P.mag = (M) => curvedMag(M, 0.003, 0.08, -0.08, 0.16, 0.035, 0.012, K.blk);
  },
  fal(B, P, o) {
    sbx(B, 0.02, -0.035, -0.12, 0.05, 0.15, K.dg, LAYER.metal);
    sbx(B, 0.011, 0.05, -0.1, 0.06, 0.12, K.blk);
    sbx(B, 0.026, -0.04, 0.15, 0.03, 0.32, K.blk, LAYER.rubber);
    tz(B, 0.32, 0.42, 0.011, 0.01, K.dg); tz(B, 0.42, 0.47, 0.015, 0.01, K.blk, 6);
    sbx(B, 0.02, -0.06, -0.36, 0.035, -0.12, K.blk, LAYER.rubber);
    grip(B, -0.035, -0.06, -0.14, -0.1, 0.015, 0.019, K.blk);
    post(B, 0.066, 0.308, K.blk, 0.05); peep(B, 0.066, -0.09, K.blk, 0.05);
    P.sightY = 0.066; P.eyeZ = -0.25; P.muzzle = 0.47; P.railZ = [-0.08, 0.1]; P.railY = 0.06; P.rail2 = [0.18, 0.3]; P.foreY = -0.04;
    P.gripR = [0, -0.095, -0.08]; P.gripL = [0, -0.045, 0.24]; P.magWell = [0, -0.05, 0.04];
    P.mag = (M) => sbx(M, 0.013, -0.04, 0.0, -0.2, 0.075, K.dg);
  },
  mp5(B, P, o) {
    const sd = o.mdl && o.mdl.sd;
    sbx(B, 0.018, -0.02, -0.15, 0.04, 0.12, K.blk, LAYER.metal);
    tz(B, 0.08, 0.27, 0.012, 0.036, K.blk);                         // 槓桿の筒
    sbx(B, 0.016, -0.065, -0.08, -0.02, 0.02, K.blk, LAYER.rubber); // 引き金の部分
    grip(B, -0.05, -0.065, -0.14, -0.09, 0.015, 0.018, K.blk);
    if (sd) { tz(B, 0.06, 0.38, 0.025, 0.0, K.dg, 10); post(B, 0.06, 0.3, K.blk, 0.025); }
    else {
      sbx(B, 0.025, -0.045, 0.1, 0.022, 0.25, K.blk, LAYER.rubber); // ハンドガード
      tz(B, 0.25, 0.31, 0.011, 0.0, K.dg);
      B.tube([0, 0.06, 0.265], [0, 0.06, 0.285], 0.016, 0.016, 8, LAYER.metal, K.blk, { caps: false }); // 前の照星の輪
      post(B, 0.06, 0.275, K.blk, 0.044); sbx(B, 0.005, 0.036, 0.262, 0.044, 0.288, K.blk);
    }
    peep(B, 0.06, -0.098, K.blk, 0.04);                              // ドラムの照門
    sbx(B, 0.019, -0.06, -0.36, 0.03, -0.15, K.blk, LAYER.rubber);  // 固定の銃床
    P.sightY = 0.06; P.eyeZ = -0.22; P.muzzle = sd ? 0.38 : 0.31; P.railZ = [-0.08, 0.08]; P.railY = 0.04; P.rail2 = [0.12, 0.22]; P.foreY = -0.045;
    P.gripR = [0, -0.1, -0.1]; P.gripL = [0, -0.05, sd ? 0.2 : 0.18]; P.magWell = [0, -0.03, 0.06];
    P.mag = (M) => curvedMag(M, 0.03, 0.085, -0.02, 0.17, 0.055, 0.011, K.blk);
  },
  ump(B, P, o) {
    sbx(B, 0.025, -0.05, -0.13, 0.04, 0.2, K.blk, LAYER.rubber);
    sbx(B, 0.011, 0.04, -0.12, 0.05, 0.12, K.blk);
    tz(B, 0.2, 0.27, 0.011, 0.0, K.dg);
    sbx(B, 0.012, -0.03, -0.35, 0.03, -0.13, K.blk, LAYER.rubber); sbx(B, 0.013, -0.075, -0.36, 0.03, -0.33, K.blk, LAYER.rubber);
    grip(B, -0.05, -0.08, -0.15, -0.11, 0.015, 0.019, K.blk);
    post(B, 0.062, 0.188, K.blk, 0.05); peep(B, 0.062, -0.092, K.blk, 0.05);
    P.sightY = 0.062; P.eyeZ = -0.22; P.muzzle = 0.27; P.railZ = [-0.1, 0.1]; P.railY = 0.05; P.rail2 = [0.12, 0.19]; P.foreY = -0.05;
    P.gripR = [0, -0.11, -0.11]; P.gripL = [0, -0.055, 0.15]; P.magWell = [0, -0.05, 0.04];
    P.mag = (M) => sbx(M, 0.013, -0.05, 0.005, -0.2, 0.07, K.blk);
  },
  mpx(B, P, o) {
    sbx(B, 0.013, -0.05, -0.1, 0.0, 0.05, K.dg);
    sbx(B, 0.014, 0.0, -0.1, 0.04, 0.1, K.dg);
    sbx(B, 0.011, 0.04, -0.095, 0.05, 0.22, K.blk);
    sbx(B, 0.021, -0.028, 0.1, 0.04, 0.22, K.blk, LAYER.metal);
    tz(B, 0.22, 0.27, 0.01, 0.006, K.dg); tz(B, 0.27, 0.3, 0.012, 0.006, K.blk, 6);
    tz(B, -0.1, -0.24, 0.012, 0.01, K.blk); sbx(B, 0.018, -0.05, -0.3, 0.03, -0.2, K.blk);
    post(B, 0.064, 0.2, K.blk, 0.05); peep(B, 0.064, -0.08, K.blk, 0.05);
    grip(B, -0.05, -0.04, -0.15, -0.08, 0.014, 0.018, K.blk);
    P.sightY = 0.064; P.eyeZ = -0.22; P.muzzle = 0.3; P.railZ = [-0.08, 0.1]; P.rail2 = [0.12, 0.2]; P.foreY = -0.028;
    P.gripR = [0, -0.1, -0.06]; P.gripL = [0, -0.035, 0.17]; P.magWell = [0, -0.06, 0.03];
    P.mag = (M) => curvedMag(M, 0.008, 0.055, -0.05, 0.16, 0.012, 0.01, K.blk, 2);
  },
  mp7(B, P, o) {
    sbx(B, 0.022, -0.045, -0.08, 0.045, 0.12, K.blk, LAYER.rubber);
    sbx(B, 0.011, 0.045, -0.07, 0.055, 0.1, K.blk);
    tz(B, 0.12, 0.18, 0.01, 0.0, K.dg);
    sbx(B, 0.014, -0.11, 0.06, -0.045, 0.085, K.blk, LAYER.rubber);  // 折りたたみの前の握り
    sbx(B, 0.006, -0.01, -0.26, 0.01, -0.08, K.dg); sbx(B, 0.02, -0.06, -0.27, 0.02, -0.25, K.blk, LAYER.rubber);
    grip(B, -0.045, -0.02, -0.15, -0.045, 0.016, 0.02, K.blk);
    post(B, 0.064, 0.09, K.blk, 0.055); peep(B, 0.064, -0.058, K.blk, 0.055);
    P.sightY = 0.064; P.eyeZ = -0.2; P.muzzle = 0.18; P.railZ = [-0.06, 0.08]; P.railY = 0.055; P.rail2 = [0.03, 0.1]; P.foreY = -0.045;
    P.gripR = [0, -0.095, -0.035]; P.gripL = [0, -0.09, 0.075]; P.magWell = [0, -0.12, -0.04];
    P.mag = (M) => { grip(M, -0.07, -0.025, -0.2, -0.055, 0.012, 0.014, K.blk); };
    P.noMagWellFront = true;
  },
  m4super(B, P, o) {
    sbx(B, 0.02, -0.04, -0.12, 0.045, 0.12, K.blk, LAYER.metal);
    tz(B, 0.12, 0.42, 0.013, -0.018, K.blk);                        // 筒の弾倉
    tz(B, 0.12, 0.47, 0.011, 0.02, K.dg);                           // 銃身
    sbx(B, 0.022, -0.045, 0.12, 0.01, 0.3, K.blk, LAYER.rubber);    // 先台
    sbx(B, 0.011, 0.045, -0.1, 0.055, 0.1, K.blk);
    peep(B, 0.062, -0.1, K.blk, 0.045); post(B, 0.062, 0.448, K.blk, 0.032);
    tz(B, -0.12, -0.3, 0.014, 0.0, K.blk); sbx(B, 0.02, -0.07, -0.36, 0.03, -0.28, K.blk);
    grip(B, -0.04, -0.06, -0.14, -0.1, 0.015, 0.019, K.blk);
    P.sightY = 0.062; P.eyeZ = -0.24; P.muzzle = 0.47; P.railZ = [-0.08, 0.08]; P.railY = 0.055; P.rail2 = null; P.foreY = -0.045;
    P.gripR = [0, -0.095, -0.08]; P.gripL = [0, -0.05, 0.22]; P.magWell = [0, -0.04, 0.05]; P.tube = true;
  },
  r870(B, P, o) {
    const m = o.mdl || {};
    const L = m.long ? 0.06 : 0;
    const furn = m.orange ? K.orange : (m.black ? K.blk : K.dg);
    sbx(B, 0.019, -0.035, -0.11, 0.04, 0.12, m.orange ? K.dg : K.mg, LAYER.metal);
    tz(B, 0.12, 0.37 + L, 0.012, -0.014, K.blk);
    tz(B, 0.12, 0.43 + L, 0.011, 0.018, K.dg);
    sbx(B, 0.004, 0.03, 0.4 + L, 0.045, 0.415 + L, K.blk);
    sbx(B, 0.02, -0.065, -0.36, 0.035, -0.12, furn, LAYER.rubber);
    grip(B, -0.035, -0.06, -0.13, -0.09, 0.015, 0.019, furn);
    P.sightY = 0.046; P.eyeZ = -0.25; P.muzzle = 0.43 + L; P.railZ = [-0.08, 0.06]; P.railY = 0.04; P.rail2 = null; P.foreY = -0.035;
    P.gripR = [0, -0.085, -0.08]; P.gripL = [0, -0.035, 0.22]; P.magWell = [0, -0.035, 0.05]; P.tube = true;
    P.pump = (M) => { sbx(M, 0.021, -0.037, 0.15, 0.008, 0.29, furn, LAYER.rubber); };
    P.pumpZ = 0.08;
  },
  pepper(B, P, o) {
    sbx(B, 0.022, -0.04, -0.12, 0.04, 0.16, K.blk, LAYER.rubber);
    sbx(B, 0.02, -0.03, 0.16, 0.025, 0.24, K.yel, LAYER.rubber);
    tz(B, 0.24, 0.34, 0.012, 0.0, K.blk);
    sbx(B, 0.011, 0.04, -0.1, 0.05, 0.12, K.blk);
    sbx(B, 0.016, -0.06, -0.34, 0.03, -0.12, K.blk, LAYER.rubber);
    grip(B, -0.04, -0.06, -0.14, -0.1, 0.015, 0.019, K.blk);
    P.sightY = 0.064; P.eyeZ = -0.22; P.muzzle = 0.34; P.railZ = [-0.08, 0.1]; P.railY = 0.05; P.rail2 = null; P.foreY = -0.03;
    P.gripR = [0, -0.095, -0.08]; P.gripL = [0, -0.035, 0.2]; P.magWell = [0, -0.05, 0.04];
    P.mag = (M) => sbx(M, 0.014, -0.04, 0.0, -0.15, 0.06, K.yel);
  },
  glock(B, P, o) {
    const c = K.blk;
    sbx(B, 0.0125, 0.0, -0.085, 0.031, 0.105, c, LAYER.metal);      // スライド
    sbx(B, 0.013, -0.021, -0.065, 0.0, 0.1, K.dg, LAYER.rubber);    // フレーム
    grip(B, -0.015, -0.05, -0.125, -0.075, 0.0145, 0.022, K.dg);
    sbx(B, 0.004, -0.045, -0.02, -0.04, 0.035, K.dg);
    post(B, 0.035, 0.094, c, 0.031); notch(B, 0.035, -0.075, c, 0.031);
    if (o.mdl && o.mdl.comp) for (const z of [0.07, 0.085]) sbx(B, 0.006, 0.03, z, 0.0315, z + 0.006, hex('#555'));
    P.sightY = 0.035; P.eyeZ = -0.42; P.muzzle = 0.105; P.railZ = null; P.rail2 = [0.03, 0.09]; P.foreY = -0.021; P.pistol = true;
    P.gripR = [0, -0.07, -0.065]; P.gripL = [0.02, -0.075, -0.055]; P.magWell = [0, -0.13, -0.08];
    P.mag = (M) => grip(M, -0.08, -0.06, -0.135, -0.08, 0.011, 0.018, K.blk);
    P.slide = true;
  },
  m1911(B, P, o) {
    const m = o.mdl || {};
    const sc = m.tan ? K.tan : K.steel;
    sbx(B, 0.012, 0.0, -0.09, 0.03, 0.125, sc, LAYER.metal);
    sbx(B, 0.0125, -0.02, -0.07, 0.0, 0.11, sc, LAYER.metal);
    grip(B, -0.012, -0.06, -0.125, -0.085, 0.0145, 0.02, m.tan ? K.tan : K.woodL, m.tan ? LAYER.rubber : LAYER.wood);
    sbx(B, 0.004, -0.045, -0.02, -0.04, 0.03, sc);
    post(B, 0.034, 0.118, K.blk, 0.03); notch(B, 0.034, -0.08, K.blk, 0.03);
    sbx(B, 0.004, 0.012, -0.1, 0.03, -0.088, K.blk); // 撃鉄
    P.sightY = 0.034; P.eyeZ = -0.42; P.muzzle = 0.125; P.railZ = null; P.rail2 = m.rail ? [0.03, 0.1] : null; P.foreY = -0.02; P.pistol = true;
    P.gripR = [0, -0.07, -0.075]; P.gripL = [0.02, -0.075, -0.065]; P.magWell = [0, -0.13, -0.09];
    P.mag = (M) => grip(M, -0.085, -0.075, -0.132, -0.09, 0.01, 0.016, K.blk);
    P.slide = true;
  },
  makarov(B, P, o) {
    sbx(B, 0.0115, 0.0, -0.075, 0.028, 0.09, K.dg, LAYER.metal);
    sbx(B, 0.012, -0.018, -0.06, 0.0, 0.085, K.dg, LAYER.metal);
    grip(B, -0.012, -0.05, -0.11, -0.07, 0.0135, 0.019, hex('#3a2a22'));
    sbx(B, 0.004, -0.04, -0.02, -0.036, 0.025, K.dg);
    post(B, 0.032, 0.085, K.dg, 0.028); notch(B, 0.032, -0.07, K.dg, 0.028);
    P.sightY = 0.032; P.eyeZ = -0.42; P.muzzle = 0.09; P.railZ = null; P.rail2 = null; P.foreY = -0.018; P.pistol = true;
    P.gripR = [0, -0.065, -0.06]; P.gripL = [0.02, -0.07, -0.05]; P.magWell = [0, -0.115, -0.075];
    P.mag = (M) => grip(M, -0.075, -0.06, -0.118, -0.075, 0.01, 0.015, K.blk);
    P.slide = true;
  },
  usp(B, P, o) {
    sbx(B, 0.0135, 0.0, -0.09, 0.032, 0.11, K.blk, LAYER.metal);
    sbx(B, 0.014, -0.023, -0.07, 0.0, 0.105, K.dg, LAYER.rubber);
    grip(B, -0.015, -0.06, -0.13, -0.085, 0.015, 0.022, K.dg);
    sbx(B, 0.004, -0.046, -0.02, -0.041, 0.035, K.dg);
    post(B, 0.036, 0.103, K.blk, 0.032); notch(B, 0.036, -0.08, K.blk, 0.032);
    P.sightY = 0.036; P.eyeZ = -0.42; P.muzzle = 0.11; P.railZ = null; P.rail2 = [0.03, 0.09]; P.foreY = -0.023; P.pistol = true;
    P.gripR = [0, -0.072, -0.075]; P.gripL = [0.02, -0.077, -0.065]; P.magWell = [0, -0.13, -0.09];
    P.mag = (M) => grip(M, -0.085, -0.07, -0.138, -0.09, 0.011, 0.018, K.blk);
    P.slide = true;
  },
  fiveseven(B, P, o) {
    sbx(B, 0.0115, 0.0, -0.085, 0.03, 0.12, K.blk, LAYER.metal);
    sbx(B, 0.012, -0.022, -0.065, 0.0, 0.115, K.dg, LAYER.rubber);
    grip(B, -0.015, -0.055, -0.135, -0.085, 0.014, 0.024, K.dg);
    sbx(B, 0.004, -0.046, -0.02, -0.041, 0.04, K.dg);
    post(B, 0.034, 0.113, K.blk, 0.03); notch(B, 0.034, -0.075, K.blk, 0.03);
    P.sightY = 0.034; P.eyeZ = -0.42; P.muzzle = 0.12; P.railZ = null; P.rail2 = [0.03, 0.1]; P.foreY = -0.022; P.pistol = true;
    P.gripR = [0, -0.072, -0.07]; P.gripL = [0.02, -0.077, -0.06]; P.magWell = [0, -0.14, -0.09];
    P.mag = (M) => grip(M, -0.09, -0.07, -0.142, -0.088, 0.01, 0.02, K.blk);
    P.slide = true;
  },
  python(B, P, o) {
    sbx(B, 0.012, -0.01, 0.0, 0.026, 0.155, K.steel, LAYER.metal); // 銃身と下の張り出し
    sbx(B, 0.005, 0.026, 0.0, 0.032, 0.15, K.steel);                // 上のリブ
    tz(B, -0.035, 0.012, 0.021, -0.002, K.steel, 7);                // 回転弾倉
    sbx(B, 0.011, -0.03, -0.06, 0.03, -0.035, K.steel, LAYER.metal);
    grip(B, -0.02, -0.065, -0.12, -0.09, 0.015, 0.02, K.woodL, LAYER.wood);
    sbx(B, 0.004, 0.018, -0.075, 0.034, -0.06, K.steel);
    post(B, 0.038, 0.145, K.steel, 0.032); notch(B, 0.038, -0.05, K.blk, 0.03);
    P.sightY = 0.038; P.eyeZ = -0.42; P.muzzle = 0.155; P.railZ = null; P.rail2 = null; P.foreY = -0.01; P.pistol = true;
    P.gripR = [0, -0.07, -0.08]; P.gripL = [0.02, -0.075, -0.07]; P.magWell = [0, -0.002, -0.012]; P.revolver = true;
  },
  taser(B, P, o) {
    sbx(B, 0.016, -0.01, -0.04, 0.035, 0.1, K.yel, LAYER.rubber);
    sbx(B, 0.018, -0.015, 0.1, 0.035, 0.15, K.blk, LAYER.rubber);
    grip(B, -0.01, -0.03, -0.11, -0.06, 0.015, 0.02, K.blk);
    P.sightY = 0.042; P.eyeZ = -0.42; P.muzzle = 0.15; P.railZ = null; P.rail2 = null; P.foreY = -0.01; P.pistol = true;
    P.gripR = [0, -0.06, -0.045]; P.gripL = [0.02, -0.065, -0.035]; P.magWell = [0, 0.01, 0.13];
  },
  ak(B, P, o) {
    const m = o.mdl || {};
    const wood = m.short ? K.plum : K.wood;
    sbx(B, 0.018, -0.035, -0.14, 0.03, 0.12, K.dg, LAYER.metal);
    B.tube([0, 0.03, -0.14], [0, 0.03, 0.12], 0.018, 0.018, 7, LAYER.metal, K.dg, { caps: true }); // 上の蓋
    if (m.short) {
      sbx(B, 0.023, -0.035, 0.12, 0.012, 0.2, wood, LAYER.wood);
      tz(B, 0.2, 0.24, 0.01, 0.0, K.dg); tz(B, 0.24, 0.3, 0.017, 0.0, K.blk, 8);
      sbx(B, 0.006, -0.02, -0.38, 0.015, -0.14, K.dg); sbx(B, 0.016, -0.065, -0.39, 0.015, -0.37, K.dg); // 骨組みの銃床
      notch(B, 0.062, 0.13, K.blk, 0.042); post(B, 0.062, 0.235, K.dg, 0.02);
    } else {
      sbx(B, 0.024, -0.04, 0.12, 0.012, 0.3, wood, LAYER.wood);
      sbx(B, 0.016, 0.015, 0.12, 0.045, 0.27, wood, LAYER.wood);
      tz(B, 0.3, 0.47, 0.009, 0.0, K.dg);
      sbx(B, 0.008, 0.0, 0.42, 0.048, 0.44, K.dg); post(B, 0.062, 0.43, K.dg, 0.048); // 照星の台
      B.tube([0, 0.0, 0.47], [0, 0.0, 0.5], 0.012, 0.012, 6, LAYER.metal, K.blk, { caps: true });
      // 木の銃床（細くなる）
      grip(B, 0.01, -0.15, -0.06, -0.42, 0.021, 0.03, wood, LAYER.wood);
      notch(B, 0.062, 0.05, K.dg, 0.04);
    }
    grip(B, -0.035, -0.055, -0.13, -0.09, 0.015, 0.019, wood, LAYER.wood);
    sbx(B, 0.004, -0.055, -0.04, -0.05, 0.01, K.dg);
    P.sightY = 0.062; P.eyeZ = -0.26; P.muzzle = m.short ? 0.3 : 0.5; P.railZ = m.short ? null : null; P.rail2 = null; P.foreY = -0.04;
    P.gripR = [0, -0.09, -0.075]; P.gripL = [0, -0.045, m.short ? 0.16 : 0.22]; P.magWell = [0, -0.04, 0.08];
    P.mag = (M) => curvedMag(M, 0.045, 0.125, -0.035, 0.2, 0.07, 0.013, m.short ? K.plum : hex('#5a3a2a'), 3);
    P.sideMount = true;
  },
  g3(B, P, o) {
    const c = K.grn;
    sbx(B, 0.02, -0.03, -0.15, 0.04, 0.15, c, LAYER.metal);
    tz(B, 0.15, 0.5, 0.013, 0.038, c);
    sbx(B, 0.025, -0.04, 0.15, 0.025, 0.4, c, LAYER.rubber);
    tz(B, 0.4, 0.6, 0.0095, 0.0, K.dg); tz(B, 0.6, 0.65, 0.014, 0.0, K.blk, 6);
    sbx(B, 0.02, -0.07, -0.46, 0.035, -0.15, c, LAYER.rubber);
    grip(B, -0.03, -0.06, -0.13, -0.1, 0.015, 0.019, c);
    peep(B, 0.064, -0.11, K.blk, 0.04); B.tube([0, 0.064, 0.48], [0, 0.064, 0.5], 0.015, 0.015, 8, LAYER.metal, K.blk, { caps: false }); post(B, 0.064, 0.49, K.blk, 0.045);
    P.sightY = 0.064; P.eyeZ = -0.28; P.muzzle = 0.65; P.railZ = [-0.1, 0.1]; P.railY = 0.05; P.rail2 = null; P.foreY = -0.04;
    P.gripR = [0, -0.09, -0.08]; P.gripL = [0, -0.045, 0.28]; P.magWell = [0, -0.035, 0.06];
    P.mag = (M) => sbx(M, 0.014, -0.03, 0.02, -0.2, 0.1, K.blk);
  },
  uzi(B, P, o) {
    sbx(B, 0.022, -0.03, -0.12, 0.04, 0.17, K.dg, LAYER.metal);
    tz(B, 0.17, 0.22, 0.011, 0.0, K.dg);
    grip(B, -0.03, -0.0, -0.13, -0.02, 0.017, 0.024, K.blk);
    sbx(B, 0.005, -0.012, -0.36, 0.005, -0.12, K.dg); sbx(B, 0.016, -0.06, -0.37, 0.005, -0.355, K.dg);
    post(B, 0.054, 0.148, K.dg, 0.04); notch(B, 0.054, -0.092, K.dg, 0.04);
    P.sightY = 0.054; P.eyeZ = -0.24; P.muzzle = 0.22; P.railZ = null; P.rail2 = null; P.foreY = -0.03;
    P.gripR = [0, -0.08, -0.01]; P.gripL = [0, -0.035, 0.12]; P.magWell = [0, -0.12, -0.02];
    P.mag = (M) => grip(M, -0.06, -0.008, -0.22, -0.03, 0.012, 0.016, K.dg);
  },
  tec9(B, P, o) {
    sbx(B, 0.016, -0.02, -0.06, 0.03, 0.05, K.blk, LAYER.metal);
    B.tube([0, 0.008, 0.05], [0, 0.008, 0.2], 0.019, 0.019, 8, LAYER.metal, K.blk, { caps: true });
    grip(B, -0.02, -0.05, -0.11, -0.07, 0.015, 0.02, K.blk);
    post(B, 0.034, 0.195, K.blk, 0.027); notch(B, 0.034, -0.05, K.blk, 0.03);
    P.sightY = 0.034; P.eyeZ = -0.4; P.muzzle = 0.2; P.railZ = null; P.rail2 = null; P.foreY = -0.02; P.pistol = true;
    P.gripR = [0, -0.07, -0.06]; P.gripL = [0.01, -0.08, 0.035]; P.magWell = [0, -0.05, 0.035];
    P.mag = (M) => sbx(M, 0.011, -0.02, 0.02, -0.21, 0.05, K.blk);
  },
  mac10(B, P, o) {
    sbx(B, 0.022, -0.03, -0.1, 0.05, 0.12, K.dg, LAYER.metal);
    tz(B, 0.12, 0.16, 0.012, 0.0, K.dg);
    grip(B, -0.03, -0.02, -0.12, -0.03, 0.017, 0.022, K.dg);
    sbx(B, 0.005, -0.005, -0.25, 0.006, -0.1, K.dg);
    P.sightY = 0.062; P.eyeZ = -0.3; P.muzzle = 0.16; P.railZ = null; P.rail2 = null; P.foreY = -0.03;
    P.gripR = [0, -0.07, -0.025]; P.gripL = [0, -0.035, 0.1]; P.magWell = [0, -0.12, -0.03];
    P.mag = (M) => grip(M, -0.08, -0.025, -0.24, -0.04, 0.013, 0.018, K.dg);
  },
  p90(B, P, o) {
    const c = hex('#2a2c2a');
    sbx(B, 0.03, -0.06, -0.3, 0.06, 0.2, c, LAYER.rubber);
    sbx(B, 0.028, -0.1, -0.12, -0.06, -0.02, c, LAYER.rubber);     // 親指の穴の握り
    sbx(B, 0.026, -0.1, 0.02, -0.06, 0.12, c, LAYER.rubber);
    tz(B, 0.2, 0.25, 0.012, 0.0, K.dg);
    sbx(B, 0.016, 0.06, 0.0, 0.07, 0.08, K.blk); peep(B, 0.095, 0.04, K.blk, 0.07); // 照準の輪
    P.sightY = 0.095; P.eyeZ = -0.12; P.muzzle = 0.25; P.railZ = null; P.rail2 = null; P.foreY = -0.06; P.bullpup = true;
    P.gripR = [0, -0.085, -0.07]; P.gripL = [0, -0.085, 0.07]; P.magWell = [0, 0.065, -0.05];
    P.mag = (M) => sbx(M, 0.024, 0.06, -0.22, 0.085, 0.0, K.smoke);
  },
  sawedoff(B, P, o) {
    for (const sx of [1, -1]) B.tube([sx * 0.0115, 0.0, 0.0], [sx * 0.0115, 0.0, 0.3], 0.0115, 0.0115, 8, LAYER.metal, K.dg, { caps: true });
    sbx(B, 0.022, -0.02, -0.07, 0.015, 0.005, K.dg, LAYER.metal);
    sbx(B, 0.02, -0.03, 0.02, -0.01, 0.15, K.woodL, LAYER.wood);
    grip(B, -0.015, -0.07, -0.11, -0.12, 0.016, 0.022, K.woodL, LAYER.wood);
    P.sightY = 0.018; P.eyeZ = -0.3; P.muzzle = 0.3; P.railZ = null; P.rail2 = null; P.foreY = -0.03;
    P.gripR = [0, -0.07, -0.09]; P.gripL = [0, -0.035, 0.1]; P.magWell = [0, 0.0, 0.0]; P.breakAction = true;
  },
};

// ピストル用ドットサイト（スライドの後ろの上）
function addPistolDot(B, P) {
  const top = P.sightY - 0.005, z = -0.045;
  sbx(B, 0.011, top, z - 0.022, top + 0.006, z + 0.02, K.blk);
  for (const sx of [1, -1]) bx(B, sx * 0.0125, top + 0.004, z - 0.02, sx * 0.0095, top + 0.024, z + 0.016, K.blk);
  sbx(B, 0.0125, top + 0.02, z - 0.02, top + 0.025, z + 0.016, K.blk);
  sbx(B, 0.0095, top + 0.004, z + 0.012, top + 0.007, z + 0.016, K.dg);
  P.sightY = top + 0.015; P.optic = { kind: 'reddot', z, r: 0.008, y: top + 0.015 };
}
// アタッチメント
function addSight(B, P, kind) {
  const ry = P.railY ?? 0.052, z0 = P.railZ ? P.railZ[0] : -0.05, z1 = P.railZ ? P.railZ[1] : 0.05;
  if (kind === 'reddot') {
    const z = (z0 + z1) / 2 - 0.01;
    sbx(B, 0.012, ry, z - 0.02, ry + 0.012, z + 0.03, K.blk);
    B.tube([0, ry + 0.03, z - 0.022], [0, ry + 0.03, z + 0.032], 0.018, 0.018, 10, LAYER.metal, K.blk, { caps: false });
    B.tube([0, ry + 0.03, z - 0.024], [0, ry + 0.03, z - 0.02], 0.0185, 0.0185, 10, LAYER.metal, K.dg, { caps: false });
    P.sightY = ry + 0.03; P.eyeZ = z - 0.2; P.optic = { kind, z, r: 0.016, y: ry + 0.03 };
  } else if (kind === 'holo') {
    const z = (z0 + z1) / 2;
    sbx(B, 0.019, ry, z - 0.045, ry + 0.02, z + 0.04, K.blk);
    // 窓の枠（左右の柱と屋根）。中は空いている
    for (const sx of [1, -1]) bx(B, sx * 0.02, ry + 0.02, z - 0.045, sx * 0.0145, ry + 0.062, z + 0.04, K.blk);
    sbx(B, 0.02, ry + 0.056, z - 0.045, ry + 0.062, z + 0.04, K.blk);
    sbx(B, 0.0145, ry + 0.02, z + 0.034, ry + 0.024, z + 0.04, K.dg);
    P.sightY = ry + 0.04; P.eyeZ = z - 0.2; P.optic = { kind, z, r: 0.017, y: ry + 0.04 };
  } else if (kind === 'lpvo') {
    const z = (z0 + z1) / 2;
    for (const dz of [-0.04, 0.04]) sbx(B, 0.012, ry, z + dz - 0.01, ry + 0.03, z + dz + 0.01, K.blk);
    B.tube([0, ry + 0.04, z - 0.08], [0, ry + 0.04, z + 0.08], 0.015, 0.015, 10, LAYER.metal, K.blk, { caps: false });
    B.tube([0, ry + 0.04, z + 0.08], [0, ry + 0.04, z + 0.13], 0.016, 0.022, 10, LAYER.metal, K.blk, { caps: true });
    B.tube([0, ry + 0.04, z - 0.13], [0, ry + 0.04, z - 0.08], 0.021, 0.016, 10, LAYER.metal, K.blk, { caps: true });
    P.sightY = ry + 0.04; P.eyeZ = z - 0.13 - 0.085; P.optic = { kind, z, r: 0.014, y: ry + 0.04, scope: true };
  }
}
function addMuzzle(B, P, kind, cat) {
  const z = P.muzzle;
  if (kind === 'supp') {
    const len = cat === 'pistol' ? 0.15 : cat === 'smg' ? 0.16 : 0.17, r = cat === 'pistol' ? 0.016 : cat === 'smg' ? 0.018 : 0.02;
    B.tube([0, 0, z - 0.02], [0, 0, z + len], r, r, 10, LAYER.metal, K.dg, { caps: true });
    P.muzzle = z + len;
  } else if (kind === 'comp') {
    B.tube([0, 0, z - 0.03], [0, 0, z + 0.03], 0.013, 0.013, 8, LAYER.metal, K.blk, { caps: true });
    P.muzzle = z + 0.03;
  }
}
function addGrip(B, P, kind) {
  if (!P.rail2 || kind === 'none') return;
  const z = P.rail2[0] + (P.rail2[1] - P.rail2[0]) * 0.45, y = P.foreY ?? -0.032;
  if (kind === 'vert') { sbx(B, 0.014, y - 0.095, z - 0.016, y, z + 0.016, K.blk, LAYER.rubber); P.gripL = [0, y - 0.06, z]; P.vgrip = true; }
  else if (kind === 'angled') { grip(B, y - 0.005, z - 0.03, y - 0.04, z + 0.05, 0.013, 0.012, K.blk); P.gripL = [0, y - 0.03, z + 0.01]; }
}
function addLight(B, P) {
  if (P.pistol) {
    if (!P.rail2) return;
    const z = (P.rail2[0] + P.rail2[1]) / 2, y = (P.foreY ?? -0.02) - 0.018;
    sbx(B, 0.013, y - 0.012, z - 0.03, y + 0.012, z + 0.03, K.blk, LAYER.rubber);
    P.lightPt = [0, y, z + 0.03];
    return;
  }
  const z = P.rail2 ? P.rail2[1] - 0.04 : P.muzzle - 0.12;
  const x = -0.03, y = P.rail2 ? 0.005 : -0.01;
  B.tube([x, y, z - 0.04], [x, y, z + 0.05], 0.013, 0.016, 8, LAYER.metal, K.blk, { caps: true });
  P.lightPt = [x, y, z + 0.05];
}

// 1丁の見た目を作る（キャッシュ）。wi: 持っている銃 {id, att}
const cache = new Map();
// ---- 特殊装備（手に持つ物）と防弾盾。座標は銃と同じ（X=左、Y=上、Z=前）
const LONG_MODELS = {
  // M320A1（単体・伸縮ストック付き）。40mmの太い銃身、横に開く薬室、前の握り
  m320(B, P) {
    tz(B, 0.02, 0.27, 0.024, 0, K.blk, 12);
    tz(B, 0.245, 0.27, 0.026, 0, K.dg, 12);
    B.tube([0, 0, 0.268], [0, 0, 0.2705], 0.019, 0.019, 12, LAYER.metal, hex('#0c0c0d'), { caps: true });
    bx(B, -0.032, -0.036, -0.095, 0.032, 0.03, 0.05, K.dg, LAYER.paint);
    bx(B, -0.011, 0.03, -0.085, 0.011, 0.041, 0.04, K.blk, LAYER.metal);
    for (let z = -0.075; z < 0.035; z += 0.016) bx(B, -0.012, 0.041, z, 0.012, 0.045, z + 0.008, K.blk, LAYER.metal);
    peep(B, 0.062, -0.07, K.blk, 0.045);
    bx(B, -0.007, 0.024, 0.19, 0.007, 0.04, 0.215, K.blk); post(B, 0.062, 0.205, K.blk, 0.04);
    grip(B, -0.03, -0.055, -0.13, -0.085, 0.016, 0.023, K.blk);
    bx(B, -0.005, -0.068, -0.045, 0.005, -0.062, 0.025, K.blk); bx(B, -0.005, -0.068, 0.019, 0.005, -0.034, 0.025, K.blk);
    bx(B, -0.026, -0.05, 0.06, 0.026, -0.02, 0.2, K.dg, LAYER.rubber);
    sbx(B, 0.014, -0.125, 0.115, -0.05, 0.15, K.blk, LAYER.rubber);
    tz(B, -0.3, -0.09, 0.007, -0.004, K.mg, 6); tz(B, -0.3, -0.09, 0.007, -0.042, K.mg, 6);
    bx(B, -0.022, -0.072, -0.325, 0.022, 0.022, -0.295, K.blk, LAYER.rubber);
    P.sightY = 0.062; P.eyeZ = -0.24; P.muzzle = 0.27; P.railZ = null; P.rail2 = null; P.foreY = -0.05; P.breakAction = true;
    P.gripR = [0, -0.095, -0.075]; P.gripL = [0, -0.1, 0.133]; P.magWell = [0, 0.0, 0.0];
  },
  // オプティワンド: 握りと画面、伸びる棒、先で曲がるカメラ
  wand(B, P) {
    B.tube([0, -0.03, -0.09], [0, -0.03, 0.05], 0.017, 0.016, 10, LAYER.rubber, K.dg, { caps: true });
    for (let z = -0.08; z < 0.04; z += 0.025) B.tube([0, -0.03, z], [0, -0.03, z + 0.008], 0.0178, 0.0178, 10, LAYER.rubber, K.blk);
    bx(B, -0.012, -0.015, -0.03, 0.012, 0.03, 0.0, K.blk);
    // 画面（使う人の側を向く）
    B.xf = [1, 0, 0, 0, 0.94, -0.34, 0, 0.34, 0.94, 0, 0.075, -0.03];
    B.bbox(-0.058, -0.042, -0.012, 0.058, 0.042, 0.012, 0.004, LAYER.rubber, K.blk);
    B.bbox(-0.05, -0.034, -0.0135, 0.05, 0.034, -0.0115, 0.001, LAYER.plain, hex('#2a4a5c'));
    B.xf = null;
    B.tube([0, -0.03, 0.05], [0, -0.03, 0.22], 0.0075, 0.007, 8, LAYER.metal, K.steel, { caps: true });
    B.tube([0, -0.03, 0.22], [0, -0.03, 0.38], 0.0065, 0.006, 8, LAYER.metal, K.steel, { caps: true });
    B.tube([0, -0.03, 0.38], [0, -0.03, 0.52], 0.0055, 0.005, 8, LAYER.metal, K.mg, { caps: true });
    B.tube([0, -0.03, 0.52], [0, -0.05, 0.555], 0.006, 0.006, 8, LAYER.rubber, K.blk, { caps: true });
    B.tube([0, -0.05, 0.555], [0, -0.062, 0.575], 0.009, 0.009, 10, LAYER.metal, K.dg, { caps: true });
    B.tube([0, -0.0625, 0.5755], [0, -0.0635, 0.577], 0.006, 0.006, 10, LAYER.plain, hex('#9fd6ff'), { caps: true });
    P.sightY = 0.09; P.eyeZ = -0.34; P.muzzle = 0.57; P.railZ = null; P.rail2 = null; P.pistol = true; P.foreY = -0.03;
    P.gripR = [0, -0.035, -0.05]; P.gripL = [0.03, -0.03, 0.13]; P.magWell = [0, -0.03, 0.0];
  },
  // 破城槌: 太い鋼の筒、上に2つの取っ手、前に打つ面
  ram(B, P) {
    B.tube([0, 0, -0.3], [0, 0, 0.34], 0.056, 0.056, 14, LAYER.metal, hex('#2f3136'), { caps: true });
    bx(B, -0.066, -0.066, 0.34, 0.066, 0.066, 0.372, K.steel, LAYER.metal);
    bx(B, -0.05, -0.05, -0.325, 0.05, 0.05, -0.3, K.dg, LAYER.metal);
    for (const z0 of [-0.25, 0.07]) {
      tz(B, z0, z0 + 0.14, 0.012, 0.135, K.blk, 8);
      B.tube([0, 0.05, z0 + 0.005], [0, 0.135, z0 + 0.005], 0.011, 0.011, 8, LAYER.metal, K.dg, { caps: true });
      B.tube([0, 0.05, z0 + 0.135], [0, 0.135, z0 + 0.135], 0.011, 0.011, 8, LAYER.metal, K.dg, { caps: true });
      for (let z = z0 + 0.02; z < z0 + 0.13; z += 0.02) B.tube([0, 0.135, z], [0, 0.135, z + 0.01], 0.0135, 0.0135, 8, LAYER.rubber, K.blk);
    }
    bx(B, -0.0575, -0.012, -0.1, -0.055, 0.012, 0.25, hex('#c9a227'), LAYER.paint);
    bx(B, 0.055, -0.012, -0.1, 0.0575, 0.012, 0.25, hex('#c9a227'), LAYER.paint);
    P.sightY = 0.2; P.eyeZ = -0.45; P.muzzle = 0.37; P.railZ = null; P.rail2 = null; P.heavy = true;
    P.gripR = [0, 0.135, -0.18]; P.gripL = [0, 0.135, 0.14]; P.magWell = [0, 0, 0];
  },
  // ブリーチング用の散弾銃: 短い銃身、ピストルグリップ、銃口の歯（スタンドオフ）
  breacher(B, P) {
    bx(B, -0.022, -0.032, -0.11, 0.022, 0.022, 0.08, K.blk, LAYER.metal);
    tz(B, 0.08, 0.42, 0.0105, 0.006, K.dg, 10);
    tz(B, 0.06, 0.36, 0.011, -0.019, K.blk, 10);
    bx(B, -0.025, -0.042, 0.13, 0.025, 0.002, 0.28, K.blk, LAYER.rubber);
    for (let z = 0.145; z < 0.27; z += 0.02) bx(B, -0.0255, -0.035, z, 0.0255, -0.005, z + 0.008, K.dg, LAYER.rubber);
    B.tube([0, 0.006, 0.415], [0, 0.006, 0.46], 0.018, 0.018, 12, LAYER.metal, K.mg, { caps: true });
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; const x = Math.cos(a) * 0.015, y = 0.006 + Math.sin(a) * 0.015; bx(B, x - 0.004, y - 0.004, 0.46, x + 0.004, y + 0.004, 0.476, K.steel, LAYER.metal); }
    grip(B, -0.02, -0.09, -0.125, -0.135, 0.016, 0.023, K.blk);
    bx(B, -0.004, -0.05, -0.07, 0.004, -0.046, -0.02, K.blk); bx(B, -0.004, -0.05, -0.02, 0.004, -0.03, -0.016, K.blk);
    bx(B, -0.002, 0.016, 0.395, 0.002, 0.03, 0.405, K.brass, LAYER.metal);
    P.sightY = 0.03; P.eyeZ = -0.32; P.muzzle = 0.476; P.railZ = null; P.rail2 = null; P.foreY = -0.04;
    P.gripR = [0, -0.088, -0.105]; P.gripL = [0, -0.032, 0.2]; P.magWell = [0, -0.03, 0.05]; P.tube = true;
  },
};
export function longModel(kind) {
  const fn = LONG_MODELS[kind];
  if (!fn) return null;
  const key = 'long|' + kind;
  let g = cache.get(key);
  if (g) return g;
  const B = new MeshBuilder(), P = { sightY: 0.06, eyeZ: -0.25, muzzle: 0.3 };
  fn(B, P);
  g = { key, wid: null, long: kind, body: B, mag: null, pump: null, pts: P, len: P.muzzle };
  cache.set(key, g);
  return g;
}
// 防弾盾（中心が原点、前が +Z）。上にのぞき窓（穴）、前に白い帯、後ろに握り
export function shieldModel() {
  const key = 'shield';
  let g = cache.get(key);
  if (g) return g;
  const B = new MeshBuilder();
  const hw = 0.28, hh = 0.46, t = 0.012, c = hex('#33363b'), rim = hex('#1d1e21');
  const wx = 0.12, wy0 = 0.24, wy1 = 0.335;
  B.bbox(-hw, wy1, -t, hw, hh, t, 0.006, LAYER.paint, c);
  B.bbox(-hw, -hh, -t, hw, wy0, t, 0.006, LAYER.paint, c);
  B.bbox(wx, wy0, -t, hw, wy1, t, 0.004, LAYER.paint, c);
  B.bbox(-hw, wy0, -t, -wx, wy1, t, 0.004, LAYER.paint, c);
  // のぞき窓の枠と、縁のゴム
  B.bbox(-wx - 0.008, wy0 - 0.008, t - 0.002, wx + 0.008, wy0, t + 0.004, 0.002, LAYER.rubber, rim);
  B.bbox(-wx - 0.008, wy1, t - 0.002, wx + 0.008, wy1 + 0.008, t + 0.004, 0.002, LAYER.rubber, rim);
  B.bbox(-hw - 0.006, -hh - 0.006, -t - 0.004, hw + 0.006, -hh + 0.012, t + 0.004, 0.004, LAYER.rubber, rim);
  B.bbox(-hw - 0.006, hh - 0.012, -t - 0.004, hw + 0.006, hh + 0.006, t + 0.004, 0.004, LAYER.rubber, rim);
  B.bbox(-hw - 0.006, -hh, -t - 0.004, -hw + 0.012, hh, t + 0.004, 0.004, LAYER.rubber, rim);
  B.bbox(hw - 0.012, -hh, -t - 0.004, hw + 0.006, hh, t + 0.004, 0.004, LAYER.rubber, rim);
  // 前の白い帯（POLICE の表示の場所）と、ブロック状の文字
  B.bbox(-0.2, 0.06, t, 0.2, 0.135, t + 0.002, 0.001, LAYER.paint, hex('#e6e6e2'));
  for (let k = 0; k < 6; k++) { const x0 = -0.165 + k * 0.058; B.bbox(x0, 0.075, t + 0.002, x0 + 0.04, 0.12, t + 0.003, 0.0005, LAYER.paint, hex('#1b1c20')); }
  // 後ろの握りと腕の帯
  B.bbox(-0.02, -0.06, -t - 0.045, 0.02, 0.06, -t, 0.006, LAYER.rubber, rim);
  B.bbox(-0.09, -0.2, -t - 0.02, 0.09, -0.16, -t, 0.004, LAYER.nylon, hex('#26282b'));
  g = { key, body: B, pts: { hw, hh } };
  cache.set(key, g);
  return g;
}
export function gunModel(wid, att = {}) {
  const W = WEAPONS[wid];
  if (!W) return null;
  const key = wid + '|' + (att.sight || 'iron') + '|' + (att.muzzle || 'none') + '|' + (att.grip || 'none') + '|' + (att.light ? 1 : 0);
  let g = cache.get(key);
  if (g) return g;
  const B = new MeshBuilder(), P = { sightY: 0.06, eyeZ: -0.25, muzzle: 0.3 };
  const fn = MODELS[W.model] || MODELS.ar15;
  fn(B, P, { mdl: W.mdl || {}, fde: W.mdl && W.mdl.fde });
  if (att.sight === 'rmr' && P.pistol) addPistolDot(B, P);
  else if (att.sight && att.sight !== 'iron' && att.sight !== 'rmr' && (P.railZ || P.pistol === undefined)) addSight(B, P, att.sight);
  if (att.muzzle && att.muzzle !== 'none' && !W.integral) addMuzzle(B, P, att.muzzle, W.cat);
  if (att.grip) addGrip(B, P, att.grip);
  if (att.light) addLight(B, P);
  let mag = null, pump = null;
  if (P.mag) { mag = new MeshBuilder(); P.mag(mag); }
  if (P.pump) { pump = new MeshBuilder(); P.pump(pump); }
  g = { key, wid, body: B, mag, pump, pts: P, len: P.muzzle };
  cache.set(key, g);
  return g;
}
export const GUN_COLORS = K;
