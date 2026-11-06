// マップの外まわり（遊べる範囲の外の景色）。当たり判定はない（範囲の外へは出られない）。
//  近く: 端の地面の続き・範囲の境（規制線・塀・生け垣）・歩道・道路・街灯・パトカー・隣の建物
//  遠く: 2列目の建物と木、地平の丘や街並み（霧に溶ける）
// 光は光の格子を使わず、空の明るさと太陽で当てる（renderer の uOuter）。夜は窓と街灯が光る。
import { MeshBuilder, hex, mulc, mixc, xfYaw } from './build.js';
import { LAYER } from './textures.js';
import { buildProp } from './props.js';
import { CS, C, isWallish } from '../engine/world.js';
import { F } from '../engine/data/materials.js';

const H = hex;
const COL = {
  asphalt: H('#4f5053'), road: H('#46474a'), grass: H('#5f803c'), grassD: H('#4c6b30'), dirt: H('#7f6a4e'), field: H('#7a7a48'),
  walk: H('#aeaaa1'), curb: H('#c2beb5'), line: H('#d9d7cd'), yline: H('#d2ad48'), conc: H('#a29e96'), lot: H('#5a5b5e'),
  water: H('#1d3340'), quay: H('#8f8b83'), hedge: H('#2e4824'), trunk: H('#5a4632'), leaf: H('#4e7a34'), leafD: H('#3b5f28'),
  pole: H('#7d8085'), wood: H('#7a5c3e'), fence: H('#8e9397'), white: H('#e8e6e0'), orange: H('#d0702a'), dark: H('#1e1f22'),
  winDay: H('#5f7381'), winNight: H('#141a20'), winLit: H('#ffd39a'), winLit2: H('#cfe0ff'), frame: H('#3a3d40'), roof: H('#6c6a66'),
};
const BRICK = ['#8f4a38', '#7a4e3c', '#9a6a4e', '#6e4436', '#8a5a44'].map(H);
const PLASTER = ['#d6cfc0', '#c9c2b4', '#bfc6c8', '#d8c8a8', '#b8b2a6', '#cfd2c4'].map(H);
const SIDING = ['#c9cfcf', '#d8d2c0', '#b7c4cc', '#cfc3a8', '#e0ddd4', '#a9b6a6', '#c8b8a0'].map(H);
const CONC = ['#bdb9b0', '#a8a59e', '#b4b0a6', '#9e9a92'].map(H);
const METAL = ['#8f969c', '#7d868c', '#a0a4a6', '#6f7a80', '#8a8070'].map(H);
const AWN = ['#8e2b2b', '#2f4f7a', '#3e6b3a', '#c48a2c', '#5a3a6a'].map(H);
const CONT = ['#8c2b22', '#2a5a7a', '#3f6a3a', '#c48a2c', '#5b5e62', '#7a4a2a'].map(H);

// マップごとの外まわり: style（街・住宅街・道路ぞい・港）、建物の種類、地面
const THEMES = {
  gasstation: { style: 'roadside', bld: 'roadside', ground: 'field', hills: true },
  motel: { style: 'roadside', bld: 'roadside', ground: 'dirt', hills: true },
  training: { style: 'roadside', bld: 'facility', ground: 'grass', hills: true },
  suburb: { style: 'suburb', bld: 'house', ground: 'grass', hills: true },
  apartment: { style: 'city', bld: 'apt', ground: 'lot', skyline: true },
  bank: { style: 'city', bld: 'shop', ground: 'lot', skyline: true },
  office: { style: 'city', bld: 'office', ground: 'grass', skyline: true },
  club: { style: 'city', bld: 'warehouse', ground: 'lot', skyline: true },
  port: { style: 'port', bld: 'warehouse', ground: 'lot', water: 'N' },
};

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function hashStr(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// 辺: 境の上の点 O＋t×u（沿う向き）＋d×n（外向き）
function sides(Wm, Dm) {
  return [
    { id: 'N', O: [0, 0], u: [1, 0], n: [0, -1], len: Wm },
    { id: 'S', O: [0, Dm], u: [1, 0], n: [0, 1], len: Wm },
    { id: 'W', O: [0, 0], u: [0, 1], n: [-1, 0], len: Dm },
    { id: 'E', O: [Wm, 0], u: [0, 1], n: [1, 0], len: Dm },
  ];
}
const P = (s, t, d) => [s.O[0] + s.u[0] * t + s.n[0] * d, s.O[1] + s.u[1] * t + s.n[1] * d];
// (t0..t1, d0..d1) の長方形 → 世界の軸にそった箱の x0,z0,x1,z1
function rect(s, t0, t1, d0, d1) { const a = P(s, t0, d0), b = P(s, t1, d1); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; }
// 外を向く（建物の正面がマップを向く）回転: 局所 +Z が -n
const yawToMap = (s) => Math.atan2(-s.n[0], -s.n[1]);
const yawAlong = (s) => Math.atan2(s.u[0], s.u[1]);

// 地面の板（上向き）。テクスチャは 0.5m で1回
function ground(B, x0, z0, x1, z1, y, layer, col) {
  const s = 0.5;
  B.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [x0 * s, z1 * s, x1 * s, z1 * s, x1 * s, z0 * s, x0 * s, z0 * s], layer, col);
}
const GL = { asphalt: [LAYER.asphalt, COL.asphalt], grass: [LAYER.grass, COL.grass], dirt: [LAYER.dirt, COL.dirt], walk: [LAYER.sidewalk, COL.walk], field: [LAYER.grass, COL.field], lot: [LAYER.asphalt, COL.lot] };

// 境の地面の種類（1階の端のマスごと）: 'asphalt' | 'grass' | 'dirt' | 'walk' | null（建物・壁）
function edgeRuns(w, s) {
  const runs = [];
  const n = s.id === 'N' || s.id === 'S' ? w.W : w.D;
  let cur = null;
  for (let q = 0; q < n; q++) {
    const i = s.id === 'W' ? 0 : s.id === 'E' ? w.W - 1 : q, j = s.id === 'N' ? 0 : s.id === 'S' ? w.D - 1 : q;
    const k = w.idx(0, i, j), t = w.cell[k];
    let kind = null;
    if (!isWallish(t) && t !== C.VOID) {
      const r = w.roomAt[k], out = r >= 0 && w.rooms[r] && w.rooms[r].out;
      if (out) { const fm = w.floorMat[k]; kind = fm === F.ASPHALT ? 'asphalt' : fm === F.GRASS ? 'grass' : fm === F.DIRT ? 'dirt' : 'walk'; }
    } else if (t === C.FENCE) kind = 'fence';
    if (cur && cur.kind === kind) cur.t1 = (q + 1) * CS;
    else { cur = { kind, t0: q * CS, t1: (q + 1) * CS }; runs.push(cur); }
  }
  return runs;
}

// o.lite: 画質「低」。2列目の建物・地平の木・光のたまりを省く
export function buildOutskirts(w, def, o = {}) {
  const T = THEMES[def.id] || THEMES.gasstation;
  const night = def.time === 'night', dusk = def.time === 'dusk';
  const R = rng(hashStr(def.id || 'map'));
  const Wm = w.W * CS, Dm = w.D * CS;
  const B = new MeshBuilder(), G = new MeshBuilder();
  B.room = 0; G.room = 0;
  const S = sides(Wm, Dm);
  const runsBy = {}; for (const s of S) runsBy[s.id] = edgeRuns(w, s);
  const asphaltShare = (s) => runsBy[s.id].filter(r => r.kind === 'asphalt' || r.kind === 'walk').reduce((a, r) => a + r.t1 - r.t0, 0) / s.len;
  // 道路のある辺: 街と港はすべて。住宅街は舗装の多い辺、道路ぞいは舗装がいちばん多い辺（幹線道路）
  const roadOn = {};
  if (T.style === 'city' || T.style === 'port') for (const s of S) roadOn[s.id] = !(T.water && s.id === T.water);
  else if (T.style === 'suburb') for (const s of S) roadOn[s.id] = asphaltShare(s) > 0.3;
  else { let best = S[0]; for (const s of S) if (asphaltShare(s) > asphaltShare(best)) best = s; roadOn[best.id] = true; }
  const highway = T.style === 'roadside';

  // ---- 1) 遠くまでの地面（マップの外の4枚）。少し低くして、境の地面の続き（下の apron）と重ならないように
  const E = 390, gy = -0.06, [gl, gc] = GL[T.ground] || GL.grass;
  ground(B, -E, -E, Wm + E, 0, gy, gl, gc);
  ground(B, -E, Dm, Wm + E, Dm + E, gy, gl, gc);
  ground(B, -E, 0, 0, Dm, gy, gl, gc);
  ground(B, Wm, 0, Wm + E, Dm, gy, gl, gc);

  // 道の寸法（境からの距離）
  const AP = 2.4;                       // 境の地面の続き
  const SW = 2.2;                       // 歩道
  const lamps = [];
  const RW = (id) => roadOn[id] ? (highway ? 14 : 8) : 0;
  for (const s of S) {
    const rw = RW(s.id);
    const d0 = AP, d1 = AP + SW, r0 = d1, r1 = d1 + rw, o0 = r1, o1 = r1 + (rw ? SW : 0);
    const NS = s.id === 'N' || s.id === 'S';
    // 道路の長さ: 南北は角の先まで。東西は南北の道路の手前の端まで（T字に突き当たる）、なければ先まで
    const ta = NS ? -70 : (roadOn.N ? -(AP + SW) : -70), tb = NS ? s.len + 70 : (roadOn.S ? s.len + AP + SW : s.len + 70);
    s.dRow = rw ? o1 + 1.2 : AP + 3.5; // 建物の列が始まる距離
    // ---- 2) 境の地面の続き（端のマスの材質をそのまま外へ）
    for (const r of runsBy[s.id]) {
      if (!r.kind || r.kind === 'fence') continue;
      const [l, c] = GL[r.kind];
      const [x0, z0, x1, z1] = rect(s, r.t0, r.t1, 0, AP);
      ground(B, x0, z0, x1, z1, 0, l, c);
    }
    // ---- 3) 範囲の境: 舗装は規制線（警察の柵とテープ）、土と芝は塀・生け垣・金網
    for (const r of runsBy[s.id]) {
      if (!r.kind || r.kind === 'fence') continue;
      const paved = r.kind === 'asphalt' || r.kind === 'walk';
      if (paved) cordon(B, G, s, r.t0, r.t1, 0.35, night);
      else if (T.style === 'suburb') woodFence(B, s, r.t0, r.t1, 0.12);
      else if (T.style === 'city') hedge(B, s, r.t0, r.t1, 0.5, R);
      else chainLink(B, G, s, r.t0, r.t1, 0.12, 2.2);
    }
    // パトカー: いちばん長い舗装の続きに1台（境の外、道路を止めている）
    const pr = runsBy[s.id].filter(r => r.kind === 'asphalt' || r.kind === 'walk').sort((a, b) => (b.t1 - b.t0) - (a.t1 - a.t0))[0];
    if (pr && pr.t1 - pr.t0 > 6) policeCar(B, G, s, (pr.t0 + pr.t1) / 2 + (R() - 0.5) * 3, rw ? r0 + 2.4 : 1.9, night, R);
    // ---- 4) 歩道と道路（角の先まで延ばす: 交差点）
    if (rw) {
      // 内側の歩道（マップの側）。南北は角まで、東西は辺の長さだけ（角で重ならない）
      const [ax0, az0, ax1, az1] = rect(s, NS ? -d1 : 0, NS ? s.len + d1 : s.len, d0, d1);
      B.box(ax0, gy, az0, ax1, 0.12, az1, LAYER.sidewalk, COL.walk, { faces: 4 | 1 | 2 | 16 | 32, uv: 0.5 });
      // 道路
      const [rx0, rz0, rx1, rz1] = rect(s, ta, tb, r0, r1);
      ground(B, rx0, rz0, rx1, rz1, NS ? -0.01 : -0.016, LAYER.asphalt, COL.road);
      lanes(B, s, ta, tb, r0, r1, highway);
      // 外側の歩道
      const [bx0, bz0, bx1, bz1] = rect(s, ta, tb, o0, o1);
      B.box(bx0, gy, bz0, bx1, 0.12, bz1, LAYER.sidewalk, COL.walk, { faces: 4 | 1 | 2 | 16 | 32, uv: 0.5 });
      // 街灯（外側の歩道。道路の方へ腕を出す）。夜は足元に光のたまり
      for (let t = ta + 8 + R() * 6; t < tb - 4; t += highway ? 30 : 24) { lamps.push({ s, t, d: o0 + 0.45 }); }
      // 横断歩道（マップの角の先）
      if (NS) for (const tc of [-d1 - (RW('W') ? RW('W') / 2 : 3), s.len + d1 + (RW('E') ? RW('E') / 2 : 3)]) crosswalk(B, s, tc, r0, r1);
    }
    // ---- 5) 隣の建物の列（街・住宅街・道路ぞい・港）
    const t0 = NS ? -60 : 0, t1 = NS ? s.len + 60 : s.len;
    if (T.water && s.id === T.water) { harbor(B, G, s, t0 - 60, t1 + 60, R, night); continue; }
    rowOfBuildings(B, G, s, t0, t1, s.dRow, T, R, night, dusk, 1);
    // 2列目（遠く。細部を減らす）。東西は辺の長さだけ（角は南北の列が受け持つ）
    if (!o.lite) rowOfBuildings(B, G, s, NS ? t0 - 40 : -5, NS ? t1 + 40 : s.len + 5, s.dRow + 34 + R() * 8, T, R, night, dusk, 2);
  }
  for (const L of lamps) streetLamp(B, L.s, L.t, L.d, night || dusk, !o.lite);
  // ---- 6) 地平: 丘（郊外・道路ぞい）か街並み（街・港）
  horizon(B, Wm, Dm, T, R, night, !!o.lite);
  return { B, G };
}

// ---- 道路の線: 中央線（黄）と車線（白の破線）、路肩の白線
function lanes(B, s, t0, t1, r0, r1, highway) {
  const y = 0.0, rw = r1 - r0, mid = (r0 + r1) / 2;
  const strip = (ta, tb, da, db, col) => { const [x0, z0, x1, z1] = rect(s, ta, tb, da, db); ground(B, x0, z0, x1, z1, y, LAYER.plain, col); };
  strip(t0, t1, r0 + 0.25, r0 + 0.37, COL.line); strip(t0, t1, r1 - 0.37, r1 - 0.25, COL.line);
  if (highway) {
    strip(t0, t1, mid - 0.2, mid - 0.08, COL.yline); strip(t0, t1, mid + 0.08, mid + 0.2, COL.yline);
    for (const dl of [r0 + rw * 0.25, r1 - rw * 0.25]) for (let t = t0; t < t1; t += 9) strip(t, t + 3, dl - 0.06, dl + 0.06, COL.line);
  } else {
    for (let t = t0; t < t1; t += 6) strip(t, t + 3, mid - 0.06, mid + 0.06, COL.yline);
  }
}
function crosswalk(B, s, tc, r0, r1) {
  for (let d = r0 + 0.6; d < r1 - 0.6; d += 0.9) { const [x0, z0, x1, z1] = rect(s, tc - 1.6, tc + 1.6, d, d + 0.45); ground(B, x0, z0, x1, z1, 0.004, LAYER.plain, COL.line); }
}

// ---- 規制線: 警察の柵（白とオレンジの横板）と黄色いテープ
function cordon(B, G, s, t0, t1, d, night) {
  const y0 = 0;
  for (let t = t0 + 0.9; t < t1 - 0.5; t += 2.6) {
    B.setXf(xfYaw(...xz(P(s, t, d)), yawAlong(s)));
    // 局所: X が道に直角、Z が境に沿う
    for (const sz of [-0.55, 0.55]) { B.box(-0.28, y0, sz - 0.04, -0.2, 0.95, sz + 0.04, LAYER.wood, COL.white); B.box(0.2, y0, sz - 0.04, 0.28, 0.95, sz + 0.04, LAYER.wood, COL.white); }
    for (const [ya, yb] of [[0.78, 0.98], [0.5, 0.66]]) for (let k = 0; k < 4; k++) B.box(-0.03, ya, -0.7 + k * 0.35, 0.03, yb, -0.7 + (k + 1) * 0.35, LAYER.paint, k % 2 ? COL.white : COL.orange);
    if (night) { B.emit = 2.2; B.box(-0.05, 0.98, -0.05, 0.05, 1.06, 0.05, LAYER.plain, H('#ffb040')); B.emit = 0; }
    B.setXf(null);
  }
  // テープ（柵の上の高さ）
  const [x0, z0, x1, z1] = rect(s, t0, t1, d - 0.006, d + 0.006);
  B.box(x0, 1.0, z0, x1, 1.06, z1, LAYER.plain, H('#e8c62a'), { faces: 1 | 2 | 16 | 32 | 4 });
}
function xz(p) { return [p[0], 0, p[1]]; }

// ---- 塀・生け垣・金網
function woodFence(B, s, t0, t1, d) {
  const [x0, z0, x1, z1] = rect(s, t0, t1, d, d + 0.05);
  B.box(x0, 0, z0, x1, 1.8, z1, LAYER.siding, H('#9a7a56'), { uv: 0.5 });
  for (let t = t0; t <= t1; t += 2.4) { const [a, b, c, e] = rect(s, t - 0.05, t + 0.05, d - 0.05, d + 0.1); B.box(a, 0, b, c, 1.9, e, LAYER.wood, COL.wood); }
}
function hedge(B, s, t0, t1, d, R) {
  // 生け垣: 角を丸めた低い箱を少しずつ高さを変えて並べる（色は暗めの緑）
  for (let t = t0; t < t1; t += 1.6) { const [x0, z0, x1, z1] = rect(s, t, Math.min(t1, t + 1.62), d - 0.42, d + 0.42); B.bbox(x0, -0.02, z0, x1, 0.95 + R() * 0.2, z1, 0.12, LAYER.leaves, mixc(COL.hedge, COL.leafD, R() * 0.5), { faces: 1 | 2 | 4 | 16 | 32, uv: 0.7 }); }
}
function chainLink(B, G, s, t0, t1, d, h) {
  const [x0, z0, x1, z1] = rect(s, t0, t1, d, d);
  G.emit = 2;
  const along = s.u[0] !== 0;
  if (along) {
    G.quad([x0, 0, z0], [x1, 0, z0], [x1, h, z0], [x0, h, z0], [0, 0, 1], [x0, 0, x1, 0, x1, h, x0, h], LAYER.plain, COL.fence);
    G.quad([x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0], [0, 0, -1], [x1, 0, x0, 0, x0, h, x1, h], LAYER.plain, COL.fence);
  } else {
    G.quad([x0, 0, z1], [x0, 0, z0], [x0, h, z0], [x0, h, z1], [1, 0, 0], [z1, 0, z0, 0, z0, h, z1, h], LAYER.plain, COL.fence);
    G.quad([x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], [-1, 0, 0], [z0, 0, z1, 0, z1, h, z0, h], LAYER.plain, COL.fence);
  }
  G.emit = 0;
  for (let t = t0; t <= t1 + 0.01; t += 3) { const p = P(s, Math.min(t, t1), d); B.cyl(p[0], p[1], 0, h + 0.05, 0.035, 0.035, 6, LAYER.metal, COL.fence); }
  const [a, b, c, e] = rect(s, t0, t1, d - 0.02, d + 0.02);
  B.box(a, h - 0.04, b, c, h, e, LAYER.metal, COL.fence);
}

// ---- パトカー（紺と白、屋根に赤と青の灯）
function policeCar(B, G, s, t, d, night, R) {
  const p = P(s, t, d), yaw = yawAlong(s) + (R() < 0.5 ? 0 : Math.PI) + (R() - 0.5) * 0.5;
  buildProp(B, G, { type: 'car', x: p[0], y: 0, z: p[1], rot: -yaw / (Math.PI / 2), sx: 1, sy: 1, sz: 1, opt: { color: 1 }, id: 900 + Math.floor(R() * 99) }, null);
  B.setXf(xfYaw(p[0], 0, p[1], yaw));
  B.box(-0.92, 0.5, -0.9, 0.92, 0.82, 0.9, LAYER.paint, COL.white, { faces: 1 | 2 });
  B.emit = night ? 2.6 : 1.2;
  B.box(-0.5, 1.4, -0.12, 0, 1.52, 0.12, LAYER.plain, H('#ff2a2a'));
  B.emit = night ? 2.6 : 1.2;
  B.box(0, 1.4, -0.12, 0.5, 1.52, 0.12, LAYER.plain, H('#2a5cff'));
  B.emit = 0;
  B.setXf(null);
}

// ---- 街灯（夜・夕方は灯りと足元の光のたまり）
function streetLamp(B, s, t, d, lit, pool = true) {
  const p = P(s, t, d), yaw = Math.atan2(-s.n[0], -s.n[1]);
  B.setXf(xfYaw(p[0], 0.12, p[1], yaw));
  B.cyl(0, 0, 0, 6.2, 0.09, 0.06, 8, LAYER.metal, COL.pole, { capT: false });
  B.box(-0.04, 6.05, 0, 0.04, 6.13, 1.6, LAYER.metal, COL.pole);
  B.box(-0.16, 5.98, 1.35, 0.16, 6.12, 1.95, LAYER.metal, H('#3a3c40'));
  B.emit = lit ? 3.2 : 0.4; B.box(-0.14, 5.97, 1.38, 0.14, 5.98, 1.92, LAYER.plain, H('#ffd7a0'), { faces: 8 }); B.emit = 0;
  B.setXf(null);
  if (lit && pool) {
    // 光のたまり（道の上の薄い円。2段）
    const c = P(s, t, d - 1.7);
    for (const [r, e] of [[3.6, 0.10], [2.0, 0.16]]) {
      B.emit = e; const pts = []; for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; pts.push([c[0] + Math.cos(a) * r, 0.008 + (e > 0.12 ? 0.004 : 0), c[1] + Math.sin(a) * r]); }
      B.poly(pts.slice().reverse(), [0, 1, 0], LAYER.plain, H('#3a3226')); B.emit = 0;
    }
  }
}

// ---- 建物の列
function rowOfBuildings(B, G, s, t0, t1, d, T, R, night, dusk, row) {
  let t = t0 + R() * 6;
  while (t < t1) {
    const kind = T.bld;
    const wdt = kind === 'house' ? 11 + R() * 5 : kind === 'warehouse' ? 18 + R() * 16 : kind === 'roadside' ? 9 + R() * 12 : kind === 'office' ? 16 + R() * 14 : 9 + R() * 11;
    const gap = kind === 'house' ? 5 + R() * 4 : kind === 'roadside' ? 14 + R() * 30 : kind === 'warehouse' ? 4 + R() * 8 : kind === 'office' ? 10 + R() * 10 : (R() < 0.25 ? 3 + R() * 4 : 0.2);
    const depth = kind === 'house' ? 9 + R() * 3 : kind === 'warehouse' ? 16 + R() * 10 : kind === 'office' ? 14 + R() * 6 : 10 + R() * 6;
    const set = kind === 'house' ? 6 + R() * 3 : kind === 'office' ? 6 + R() * 10 : kind === 'roadside' ? 4 + R() * 12 : R() * 1.5;
    const ta = t, tb = Math.min(t1, t + wdt);
    if (tb - ta > 6) {
      const da = d + set, db = d + set + depth;
      if (kind === 'house') house(B, s, ta, tb, da, db, R, night, row);
      else block(B, G, s, ta, tb, da, db, kind, R, night, dusk, row);
      // 前庭・駐車場・木
      if (kind === 'house' && row === 1) {
        const [x0, z0, x1, z1] = rect(s, ta - gap / 2, tb + gap / 2, d, da);
        ground(B, x0, z0, x1, z1, -0.02, LAYER.grass, mixc(COL.grass, COL.grassD, R()));
        tree(B, P(s, ta + R() * (tb - ta), d + 1.6 + R() * (set - 2.5)), R, row);
        if (R() < 0.6) woodFence(B, { ...s, O: P(s, tb + gap / 2, 0), u: s.n, n: s.u }, d, db, 0);
      }
      if (kind === 'office' && row === 1 && set > 9) {
        const [x0, z0, x1, z1] = rect(s, ta, tb, d, da - 0.5);
        ground(B, x0, z0, x1, z1, -0.02, LAYER.asphalt, COL.lot);
        for (let q = ta + 1.5; q < tb - 2; q += 2.7) { const [a, b, c, e] = rect(s, q, q + 0.1, d + 0.6, d + 5.6); ground(B, a, b, c, e, -0.01, LAYER.plain, COL.line); }
      }
    }
    // 建物のあいだ: 木・電柱
    if (gap > 3 && (row === 1 || R() < 0.5)) tree(B, P(s, tb + gap * (0.3 + R() * 0.4), d + 2 + R() * 10), R, row);
    t = tb + gap;
  }
}

// 窓（面の外へ少し出した四角）。夜はいくつか灯る。row 2 は窓の数を減らす
function windows(B, x0, x1, y0, y1, z, nz, R, night, o = {}) {
  // 局所の面: x0..x1 に沿って、y0..y1 の高さに、z の面（法線 nz=±1）
  const ww = o.w ?? 1.3, wh = o.h ?? 1.5, step = o.step ?? 2.8, fh = o.fh ?? 3.2;
  for (let y = y0 + (o.sill ?? 0.95); y + wh < y1 - 0.3; y += fh) {
    for (let x = x0 + (step - ww) / 2 + 0.4; x + ww < x1 - 0.3; x += step) {
      const lit = night && R() < (o.litP ?? 0.35);
      const col = lit ? (R() < 0.75 ? COL.winLit : COL.winLit2) : night ? COL.winNight : mixc(COL.winDay, H('#9fb4c4'), R() * 0.5);
      const zz = z + nz * 0.03;
      B.emit = lit ? 0.9 + R() * 0.5 : 0;
      B.box(x, y, Math.min(z, zz), x + ww, y + wh, Math.max(z, zz), LAYER.plain, col, { faces: nz > 0 ? 16 : 32 });
      B.emit = 0;
      if (o.frames !== false) B.box(x - 0.06, y - 0.08, Math.min(z, zz), x + ww + 0.06, y, Math.max(z, zz) + 0.0, LAYER.paint, o.frame || COL.frame, { faces: (nz > 0 ? 16 : 32) | 4 });
    }
  }
}

// 四角い建物（店・アパート・事務所・倉庫・道路ぞいの店）。局所: 正面（+Z）がマップを向く
function block(B, G, s, ta, tb, da, db, kind, R, night, dusk, row) {
  const c = P(s, (ta + tb) / 2, (da + db) / 2), wdt = tb - ta, dep = db - da, yaw = yawToMap(s);
  const floors = kind === 'shop' ? 2 + Math.floor(R() * 3) : kind === 'apt' ? 3 + Math.floor(R() * 2) : kind === 'office' ? 3 + Math.floor(R() * 3) : kind === 'warehouse' ? 1 : kind === 'facility' ? 1 + Math.floor(R() * 2) : 1 + (R() < 0.3 ? 1 : 0);
  const fh = kind === 'warehouse' ? 8 + R() * 3 : 3.3;
  const h = kind === 'warehouse' ? fh : floors * fh + 0.6 + (row === 2 ? R() * 6 : 0);
  const mat = kind === 'apt' || (kind === 'shop' && R() < 0.5) ? [LAYER.brick, BRICK[Math.floor(R() * BRICK.length)]]
    : kind === 'warehouse' ? [LAYER.metal, METAL[Math.floor(R() * METAL.length)]]
      : kind === 'office' ? [LAYER.concrete, CONC[Math.floor(R() * CONC.length)]]
        : [LAYER.plaster, PLASTER[Math.floor(R() * PLASTER.length)]];
  B.setXf(xfYaw(c[0], 0, c[1], yaw));
  const x0 = -wdt / 2, x1 = wdt / 2, z0 = -dep / 2, z1 = dep / 2;
  // 本体（裏は見えないので作らない）
  B.box(x0, -0.06, z0, x1, h, z1, mat[0], mat[1], { faces: 1 | 2 | 4 | 16, uv: 0.5 });
  // 屋上: 立ち上がり・空調機
  B.box(x0, h, z1 - 0.25, x1, h + 0.6, z1, mat[0], mulc(mat[1], 0.9), { faces: 4 | 16 | 32 | 1 | 2 });
  B.box(x0, h, z0, x0 + 0.25, h + 0.6, z1, mat[0], mulc(mat[1], 0.9), { faces: 4 | 2 | 1 });
  B.box(x1 - 0.25, h, z0, x1, h + 0.6, z1, mat[0], mulc(mat[1], 0.9), { faces: 4 | 1 | 2 });
  if (row === 1 && kind !== 'warehouse') for (let k = 0; k < 1 + Math.floor(R() * 3); k++) { const ax = x0 + 1.5 + R() * (wdt - 3), az = z0 + 1.5 + R() * (dep - 3); B.box(ax - 0.6, h, az - 0.5, ax + 0.6, h + 0.9, az + 0.5, LAYER.metal, H('#9aa0a6'), { faces: 1 | 2 | 4 | 16 | 32 }); }
  if (kind === 'warehouse') {
    // シャッターと小さな窓・低い屋根
    for (let x = x0 + 2 + R() * 3; x < x1 - 5; x += 8 + R() * 6) { B.box(x, 0, z1, x + 4, 4.2, z1 + 0.04, LAYER.metal, H('#7a7e82'), { faces: 16 }); B.box(x - 0.15, 4.2, z1, x + 4.15, 4.4, z1 + 0.06, LAYER.metal, H('#55595d'), { faces: 16 | 4 | 8 }); }
    windows(B, x0, x1, fh - 2.3, fh, z1, 1, R, night, { w: 2.2, h: 0.8, step: 6, fh: 99, sill: 0, litP: 0.25, frames: false });
    B.prismX([[z0, h], [z1, h], [0, h + 1.6]], x0, x1, LAYER.metal, mulc(mat[1], 0.8));
    if (night && R() < 0.5) { B.emit = 2.5; B.box(x0 + 2, fh - 1.2, z1, x0 + 2.3, fh - 0.9, z1 + 0.3, LAYER.plain, H('#ffd7a0')); B.emit = 0; }
  } else {
    const shop = kind === 'shop' || (kind === 'roadside' && R() < 0.6);
    if (shop) {
      // 1階: 店のガラス・入口・日よけ・看板（夜は光る）
      const lit = night || dusk;
      B.emit = lit ? 0.7 : 0; B.box(x0 + 0.8, 0.3, z1, x1 - 0.8, 2.8, z1 + 0.03, LAYER.plain, lit ? H('#ffe2b0') : H('#4a5a66'), { faces: 16 }); B.emit = 0;
      B.box(x0 + 0.6, 2.8, z1, x1 - 0.6, 3.0, z1 + 0.06, LAYER.paint, COL.frame, { faces: 16 | 4 | 8 });
      const ac = AWN[Math.floor(R() * AWN.length)];
      B.prismX([[z1, 3.05], [z1 + 1.3, 2.75], [z1 + 1.3, 2.6], [z1, 3.3]], x0 + 0.5, x1 - 0.5, LAYER.fabric, ac);
      B.emit = night ? 1.8 : 0; B.box(-Math.min(3, wdt / 3), 3.4, z1, Math.min(3, wdt / 3), 4.1, z1 + 0.12, LAYER.plain, night ? H(['#ff5a4a', '#4ae0ff', '#ffd24a', '#7dff7a'][Math.floor(R() * 4)]) : H('#e8e2d0'), { faces: 16 | 1 | 2 | 4 }); B.emit = 0;
      windows(B, x0, x1, fh, h, z1, 1, R, night, { fh, litP: 0.3 });
    } else if (kind === 'office') {
      // 横に続く窓の帯
      for (let f = 0; f < floors; f++) {
        const y = f * fh + 1.0, lit = night && R() < 0.3;
        B.emit = lit ? 0.8 : 0;
        B.box(x0 + 0.4, y, z1, x1 - 0.4, y + 1.7, z1 + 0.03, LAYER.plain, lit ? COL.winLit2 : night ? COL.winNight : H('#5d7488'), { faces: 16 });
        B.box(x1, y, z0 + 0.4, x1 + 0.03, y + 1.7, z1 - 0.4, LAYER.plain, lit ? COL.winLit2 : night ? COL.winNight : H('#5d7488'), { faces: 1 });
        B.box(x0 - 0.03, y, z0 + 0.4, x0, y + 1.7, z1 - 0.4, LAYER.plain, night ? COL.winNight : H('#5d7488'), { faces: 2 });
        B.emit = 0;
      }
    } else {
      windows(B, x0, x1, 0, h, z1, 1, R, night, { fh, litP: kind === 'apt' ? 0.4 : 0.25 });
      if (row === 1) for (const sx of [-1, 1]) sideWindows(B, sx > 0 ? x1 : x0, sx, z0, z1, h, fh, R, night);
      // 入口と灯り
      B.box(-0.8, 0, z1, 0.8, 2.3, z1 + 0.04, LAYER.wood, H('#4a3a2c'), { faces: 16 });
      if (night) { B.emit = 2.2; B.box(-0.15, 2.5, z1, 0.15, 2.7, z1 + 0.15, LAYER.plain, H('#ffd7a0')); B.emit = 0; }
    }
  }
  B.setXf(null);
}
// 横の面（局所 ±X）の窓
function sideWindows(B, xf, sx, z0, z1, h, fh, R, night) {
  for (let y = 0.95; y + 1.5 < h - 0.3; y += fh) for (let z = z0 + 1.2; z + 1.3 < z1 - 0.8; z += 3.4) {
    const lit = night && R() < 0.25;
    B.emit = lit ? 1.0 : 0;
    B.box(Math.min(xf, xf + sx * 0.03), y, z, Math.max(xf, xf + sx * 0.03), y + 1.5, z + 1.3, LAYER.plain, lit ? COL.winLit : night ? COL.winNight : COL.winDay, { faces: sx > 0 ? 1 : 2 });
    B.emit = 0;
  }
}

// 住宅（2階建て・切妻の屋根・車庫）
function house(B, s, ta, tb, da, db, R, night, row) {
  const c = P(s, (ta + tb) / 2, (da + db) / 2), wdt = tb - ta, dep = db - da, yaw = yawToMap(s);
  const col = SIDING[Math.floor(R() * SIDING.length)], h = 5.6, rh = 2.2;
  B.setXf(xfYaw(c[0], 0, c[1], yaw));
  const x0 = -wdt / 2, x1 = wdt / 2, z0 = -dep / 2, z1 = dep / 2;
  B.box(x0, -0.06, z0, x1, h, z1, LAYER.siding, col, { faces: 1 | 2 | 16, uv: 0.5 });
  B.box(x0 - 0.05, -0.06, z0, x1 + 0.05, 0.5, z1 + 0.05, LAYER.concrete, H('#8e8a82'), { faces: 1 | 2 | 16 | 4 });
  // 屋根（局所 X に沿って押し出す三角）と、ひさし
  const roofC = H(['#4a4644', '#5a3a32', '#3a4048', '#6a5a4a'][Math.floor(R() * 4)]);
  B.prismX([[z0 - 0.5, h], [z1 + 0.5, h], [0, h + rh]], x0 - 0.4, x1 + 0.4, LAYER.concrete, roofC, { capCol: col });
  windows(B, x0, x1 - (wdt > 13 ? 4 : 0), 0.5, h, z1, 1, R, night, { fh: 2.75, step: 3, w: 1.2, h: 1.3, sill: 0.9, litP: 0.45, frame: H('#ebe8e1') });
  // 玄関と車庫
  B.box(-0.55, 0.5, z1, 0.55, 2.6, z1 + 0.05, LAYER.wood, H('#5a3a2a'), { faces: 16 });
  if (night) { B.emit = 2.4; B.box(0.8, 2.3, z1, 1.0, 2.55, z1 + 0.12, LAYER.plain, H('#ffd7a0')); B.emit = 0; }
  if (wdt > 13) B.box(x1 - 3.6, 0, z1, x1 - 0.6, 2.4, z1 + 0.05, LAYER.siding, H('#e0ddd4'), { faces: 16 });
  B.setXf(null);
}

const NOG = new MeshBuilder(); // ガラスを使わない小物の受け皿
function tree(B, p, R, row) {
  const sc = 0.8 + R() * 0.6;
  if (row === 1) { NOG.v.length = 0; NOG.i.length = 0; NOG.n = 0; buildProp(B, NOG, { type: 'tree', x: p[0], y: 0, z: p[1], rot: Math.floor(R() * 4), sx: sc, sy: sc, sz: sc, opt: {}, id: 1 }, null); return; }
  // 遠くの木は簡単に（幹と葉のかたまり1つ）
  B.cyl(p[0], p[1], 0, 2.2 * sc, 0.16 * sc, 0.1 * sc, 5, LAYER.wood, COL.trunk, { capT: false });
  B.loft([{ y: 1.8 * sc, rx: 0.6 * sc, rz: 0.6 * sc, cx: p[0], cz: p[1] }, { y: 3.2 * sc, rx: 1.7 * sc, rz: 1.6 * sc, cx: p[0], cz: p[1] }, { y: 5.0 * sc, rx: 0.4 * sc, rz: 0.4 * sc, cx: p[0], cz: p[1] }], 6, LAYER.leaves, mixc(COL.leaf, COL.leafD, R()), { capTop: true, capBot: true });
}

// ---- 港: コンテナの列・岸壁・海・ガントリークレーン
function harbor(B, G, s, t0, t1, R, night) {
  const dRow = 6;
  for (let t = t0; t < t1; t += 7.5) {
    for (let r = 0; r < 4; r++) {
      if (R() < 0.15) continue;
      const n = 1 + Math.floor(R() * 3), p = P(s, t + 3.2, dRow + r * 3.1 + 1.2), yaw = yawAlong(s) + Math.PI / 2;
      for (let k = 0; k < n; k++) container(B, p, yaw, k * 2.6, CONT[Math.floor(R() * CONT.length)]);
    }
  }
  // 岸壁と海
  const q0 = dRow + 4 * 3.1 + 6;
  const [x0, z0, x1, z1] = rect(s, t0 - 200, t1 + 200, q0, q0 + 3);
  B.box(x0, -1.2, z0, x1, 0.0, z1, LAYER.concrete, COL.quay, { faces: 4 | 16 | 32 | 1 | 2, uv: 0.5 });
  for (let t = t0; t < t1; t += 12) { const p = P(s, t, q0 + 2.4); B.cyl(p[0], p[1], 0, 0.5, 0.18, 0.15, 7, LAYER.metal, H('#2a2b2e')); }
  const [wx0, wz0, wx1, wz1] = rect(s, t0 - 400, t1 + 400, q0 + 3, q0 + 420);
  B.emit = night ? 0 : 0.05; ground(B, wx0, wz0, wx1, wz1, -1.0, LAYER.plain, COL.water); B.emit = 0;
  // ガントリークレーン（岸壁の上）
  for (const t of [(t0 + t1) / 2 - 30, (t0 + t1) / 2 + 25]) crane(B, P(s, t, q0 + 1), yawAlong(s), night);
}
function container(B, p, yaw, y, col) {
  B.setXf(xfYaw(p[0], y, p[1], yaw));
  B.box(-3.0, 0, -1.2, 3.0, 2.55, 1.2, LAYER.metal, col, { uv: 0.5, faces: 1 | 2 | 4 | 16 | 32 });
  for (const x of [-3.0, 3.0]) B.box(x - 0.06, 0, -1.25, x + 0.06, 2.6, 1.25, LAYER.metal, mulc(col, 0.75), { faces: 1 | 2 | 16 | 32 | 4 });
  B.setXf(null);
}
function crane(B, p, yaw, night) {
  B.setXf(xfYaw(p[0], 0, p[1], yaw));
  const col = H('#c48a2c');
  for (const x of [-7, 7]) for (const z of [-4, 4]) B.box(x - 0.4, 0, z - 0.4, x + 0.4, 34, z + 0.4, LAYER.metal, col, { faces: 1 | 2 | 16 | 32 });
  B.box(-8, 32, -4.6, 8, 34.5, 4.6, LAYER.metal, col);
  B.box(-1, 31, -40, 1, 33, 26, LAYER.metal, col);
  B.box(-2.5, 26, -4, 2.5, 31, 2, LAYER.metal, H('#d8d4c8'));
  if (night) { B.emit = 3; B.box(-0.3, 34.5, -0.3, 0.3, 35.1, 0.3, LAYER.plain, H('#ff3030')); B.emit = 0; }
  B.setXf(null);
}

// ---- 地平: 丘か、霧の向こうの街並み
function horizon(B, Wm, Dm, T, R, night, lite) {
  const cx = Wm / 2, cz = Dm / 2;
  if (T.skyline || T.style === 'port') {
    for (let a = 0; a < Math.PI * 2; a += 0.06 + R() * 0.05) {
      const r = 170 + R() * 120, x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      const w = 14 + R() * 24, h = 14 + R() * (T.style === 'port' ? 18 : 55), yaw = -a;
      const col = mulc(CONC[Math.floor(R() * CONC.length)], 0.75);
      B.setXf(xfYaw(x, 0, z, yaw));
      B.box(-w / 2, -0.1, -w / 2, w / 2, h, w / 2, LAYER.concrete, col, { faces: 1 | 2 | 4 | 16 | 32, uv: 0.25 });
      if (night) { for (let k = 0; k < 6; k++) { B.emit = 1.2; const yy = 3 + R() * (h - 5), xx = -w / 2 + 1 + R() * (w - 3); B.box(xx, yy, w / 2, xx + 1.4 + R() * 3, yy + 0.9, w / 2 + 0.05, LAYER.plain, R() < 0.7 ? COL.winLit : COL.winLit2, { faces: 16 }); } B.emit = 0; if (h > 45) { B.emit = 3; B.box(-0.4, h, -0.4, 0.4, h + 0.8, 0.4, LAYER.plain, H('#ff3030')); B.emit = 0; } }
      B.setXf(null);
    }
  }
  if (T.hills) {
    // 低い丘の連なり（多角形の帯）と、その手前の木の列
    const N = 40, pts = [];
    for (let k = 0; k <= N; k++) { const a = k / N * Math.PI * 2; pts.push([a, 300 + Math.sin(a * 3 + 1) * 25 + R() * 20, 14 + Math.sin(a * 5) * 8 + R() * 12]); }
    const col = night ? H('#1c2420') : H('#4f6a3e');
    for (let k = 0; k < N; k++) {
      const [a0, r0, h0] = pts[k], [a1, r1, h1] = pts[k + 1];
      const p0 = [cx + Math.sin(a0) * r0, cz + Math.cos(a0) * r0], p1 = [cx + Math.sin(a1) * r1, cz + Math.cos(a1) * r1];
      const q0 = [cx + Math.sin(a0) * (r0 + 60), cz + Math.cos(a0) * (r0 + 60)], q1 = [cx + Math.sin(a1) * (r1 + 60), cz + Math.cos(a1) * (r1 + 60)];
      const nx = -(p0[0] + p1[0]) / 2 + cx, nz = -(p0[1] + p1[1]) / 2 + cz, nl = Math.hypot(nx, nz) || 1;
      const hn = [nx / nl * 0.6, 0.8, nz / nl * 0.6];
      B.quad([p1[0], -0.1, p1[1]], [p0[0], -0.1, p0[1]], [q0[0], h0, q0[1]], [q1[0], h1, q1[1]], hn, [0, 0, 1, 0, 1, 1, 0, 1], LAYER.grass, col);
      B.quad([p0[0], -0.1, p0[1]], [p1[0], -0.1, p1[1]], [q1[0], h1, q1[1]], [q0[0], h0, q0[1]], hn, [0, 0, 1, 0, 1, 1, 0, 1], LAYER.grass, col);
    }
    if (!lite) for (let a = 0; a < Math.PI * 2; a += 0.05) { const r = 150 + R() * 70; tree(B, [cx + Math.sin(a) * r, cz + Math.cos(a) * r], R, 2); }
  }
}
