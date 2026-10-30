// 家具・小物の見た目（ローポリ）。当たり（data/props.js の boxes）より細かく、色と形で何か分かるように。
// ローカルの座標: 中心が原点、床が y=0、幅が X、奥行きが Z（+Zが正面）。
import { xfYaw, hex, mulc, mixc } from './build.js';
import { LAYER } from './textures.js';
import { PROPS } from '../engine/data/props.js';

const H = (s) => hex(s);
const C = {
  wood: H('#9b7149'), woodL: H('#c39a6b'), woodD: H('#5e4129'), white: H('#e8e6e0'), offw: H('#d9d4c8'), black: H('#1e1f22'), dgray: H('#3a3c40'),
  gray: H('#7d8085'), lgray: H('#b4b6b8'), metal: H('#8f969c'), steel: H('#c0c4c8'), red: H('#9b2a24'), blue: H('#2f4f7a'), green: H('#3e6b3a'),
  fabric: H('#6c6a74'), leather: H('#4a2f22'), vinyl: H('#8e2b2b'), glass: H('#9fc0cf'), card: H('#b08d5e'), concrete: H('#a29e96'),
  leaf: H('#4e7a34'), leafD: H('#3b5f28'), trunk: H('#5a4632'), skinTone: H('#c08d6e'), yellow: H('#d0a632'), orange: H('#c86a2a'),
};
const CAR_COLS = ['#7a1f1f', '#20324f', '#c9c7c0', '#2c2c2e', '#5d6b52', '#8c8d8f', '#b88a2e', '#e1e0dc'].map(H);
const CLOTH_COLS = ['#6c6a74', '#5a4a3c', '#3f5266', '#6b4b4b', '#55624a', '#7a7368'].map(H);

function pick(arr, seed) { return arr[Math.abs(Math.floor(seed)) % arr.length]; }

export function buildProp(B, G, p, def) {
  const P = PROPS[p.type];
  if (!P) return;
  const fn = MODELS[p.type];
  if (!fn) { B.setXf(xfYaw(p.x, p.y, p.z, -p.rot * Math.PI / 2, p.sx, p.sy, p.sz)); for (const b of P.boxes) B.box(b[0], b[1], b[2], b[3], b[4], b[5], LAYER.wood, C.wood); B.setXf(null); return; }
  const xf = xfYaw(p.x, p.y, p.z, -p.rot * Math.PI / 2, p.sx, p.sy, p.sz);
  B.setXf(xf); G.setXf(xf);
  const seed = p.opt.color != null ? p.opt.color : (p.id * 7 + Math.round(p.x * 3 + p.z * 5));
  // 家具の箱は角を落とす（BattleBit のように縁に光が乗る）。2.5cmより細い部品はそのまま
  const box0 = B.box;
  B.box = function (x0, y0, z0, x1, y1, z1, layer, col, o = {}) {
    const m = Math.min(x1 - x0, y1 - y0, z1 - z0);
    if (m >= 0.025 && !o.sharp) return this.bbox(x0, y0, z0, x1, y1, z1, Math.min(0.016, Math.max(0.004, m * 0.1)), layer, col, o);
    return box0.call(this, x0, y0, z0, x1, y1, z1, layer, col, o);
  };
  try { fn(B, G, P, p.opt, seed); } finally { B.box = box0; }
  B.setXf(null); G.setXf(null);
}

// 4本脚
function legs(B, w, d, h, t, col, inset = 0.04) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (w / 2 - inset - t / 2), z = sz * (d / 2 - inset - t / 2);
    B.box(x - t / 2, 0, z - t / 2, x + t / 2, h, z + t / 2, LAYER.wood, col, { faces: 1 | 2 | 16 | 32, aoBottom: 0.7 });
  }
}
// 小さな箱をたくさん（棚の商品）
function goods(B, x0, x1, y, z0, z1, seed, hMax = 0.28) {
  let x = x0 + 0.02, n = 0;
  const cols = ['#c23b2e', '#e2b13c', '#3d7cc9', '#4c9a4c', '#e8e2d0', '#8a4fa0', '#e07a2e', '#2f2f33'].map(H);
  while (x < x1 - 0.06) {
    const r = ((seed * 9301 + n * 49297) % 233280) / 233280;
    const kind = Math.floor(((r * 31) % 1) * 4); // 0 箱・1 缶の列・2 びん・3 袋
    const col = cols[Math.floor(r * 97) % cols.length];
    if (kind === 1 || kind === 2) {
      // 缶・びん: 細い円柱を前から奥へ並べる（ラベルの帯）
      const rr = kind === 1 ? 0.033 : 0.038, hh = kind === 1 ? 0.12 : Math.min(hMax, 0.24 + ((r * 7) % 1) * 0.06), nn = Math.max(1, Math.min(3, Math.floor((z1 - z0 - 0.04) / (rr * 2.2))));
      if (x + rr * 2 > x1 - 0.02) break;
      for (let q = 0; q < nn; q++) {
        const cz = z1 - 0.02 - rr - q * rr * 2.2, cx = x + rr;
        if (kind === 1) { B.cyl(cx, cz, y, y + hh, rr, rr, 8, LAYER.metal, mulc(col, 0.9), { capT: true }); B.cyl(cx, cz, y + hh * 0.25, y + hh * 0.8, rr + 0.001, rr + 0.001, 8, LAYER.paint, col, { capT: false }); }
        else { B.cyl(cx, cz, y, y + hh * 0.62, rr, rr, 8, LAYER.plain, mixc(col, H('#d8e4e6'), 0.55), { capT: false }); B.cyl(cx, cz, y + hh * 0.62, y + hh * 0.85, rr, rr * 0.4, 8, LAYER.plain, mixc(col, H('#d8e4e6'), 0.55), { capT: false }); B.cyl(cx, cz, y + hh * 0.85, y + hh, rr * 0.4, rr * 0.4, 6, LAYER.paint, col, { capT: true }); B.cyl(cx, cz, y + hh * 0.18, y + hh * 0.45, rr + 0.001, rr + 0.001, 8, LAYER.paint, col, { capT: false }); }
      }
      x += rr * 2 + 0.012; n++;
      continue;
    }
    const w = 0.07 + r * 0.12, h = kind === 3 ? Math.min(hMax, 0.16 + ((r * 7) % 1) * 0.08) : 0.1 + ((r * 7) % 1) * (hMax - 0.1), dd = Math.min(z1 - z0 - 0.04, 0.12 + ((r * 13) % 1) * 0.2);
    if (x + w > x1 - 0.02) break;
    if (kind === 3) { B.bbox(x, y, z1 - 0.02 - dd * 0.6, x + w, y + h, z1 - 0.02, Math.min(0.03, w * 0.3), LAYER.nylon, col); }
    else {
      B.box(x, y, z1 - 0.02 - dd, x + w, y + h, z1 - 0.02, LAYER.paint, col, { faces: 1 | 2 | 4 | 16, sharp: true });
      // 箱の前の白いラベル
      if (w > 0.09 && h > 0.14) B.box(x + w * 0.15, y + h * 0.45, z1 - 0.019, x + w * 0.85, y + h * 0.75, z1 - 0.018, LAYER.plain, H('#ece8de'), { faces: 16 });
    }
    x += w + 0.015; n++;
  }
}

const MODELS = {
  table(B, G, P, o, s) {
    const col = o.dark ? C.woodD : C.wood;
    B.box(-0.7, 0.71, -0.4, 0.7, 0.76, 0.4, LAYER.wood, col);
    legs(B, 1.4, 0.8, 0.71, 0.06, mulc(col, 0.8));
  },
  desk(B, G, P, o, s) {
    B.box(-0.7, 0.72, -0.35, 0.7, 0.76, 0.35, LAYER.wood, C.woodL);
    B.box(0.26, 0, -0.33, 0.68, 0.72, 0.33, LAYER.wood, C.woodL, { aoBottom: 0.7 });
    for (const y of [0.18, 0.42, 0.62]) B.box(0.3, y, 0.33, 0.64, y + 0.004, 0.335, LAYER.plain, C.woodD);
    B.box(-0.68, 0, -0.33, -0.64, 0.72, 0.33, LAYER.wood, C.woodL);
    B.box(-0.64, 0.25, -0.33, 0.26, 0.7, -0.3, LAYER.wood, mulc(C.woodL, 0.9));
    if (o.pc !== false) {
      B.box(-0.2, 0.76, -0.25, 0.2, 0.78, -0.12, LAYER.plain, C.dgray);
      B.box(-0.03, 0.78, -0.2, 0.03, 0.92, -0.17, LAYER.plain, C.dgray);
      B.box(-0.26, 0.92, -0.21, 0.26, 1.2, -0.17, LAYER.plain, C.black);
      B.emit = 0.35; B.box(-0.245, 0.935, -0.169, 0.245, 1.185, -0.168, LAYER.plain, H('#3d5a7a'), { faces: 16 }); B.emit = 0;
      B.box(-0.22, 0.76, -0.02, 0.22, 0.78, 0.13, LAYER.plain, C.dgray);
    }
  },
  chair(B, G, P, o, s) {
    const col = o.office ? C.dgray : C.wood;
    B.box(-0.22, 0.42, -0.21, 0.22, 0.46, 0.22, LAYER.wood, col);
    B.box(-0.22, 0.46, -0.23, 0.22, 0.9, -0.19, LAYER.wood, col);
    legs(B, 0.44, 0.44, 0.42, 0.035, mulc(col, 0.85), 0.01);
  },
  stool(B, G, P, o, s) {
    B.cyl(0, 0, 0.7, 0.75, 0.19, 0.19, 10, LAYER.fabric, C.vinyl, { capB: true });
    B.cyl(0, 0, 0, 0.7, 0.04, 0.04, 6, LAYER.metal, C.steel, { capT: false });
    B.cyl(0, 0, 0, 0.03, 0.2, 0.2, 10, LAYER.metal, C.steel);
  },
  sofa(B, G, P, o, s) {
    const col = pick(CLOTH_COLS, s);
    B.box(-1.0, 0.08, -0.45, 1.0, 0.42, 0.45, LAYER.fabric, col, { aoBottom: 0.6 });
    B.box(-1.0, 0.42, -0.45, 1.0, 0.85, -0.22, LAYER.fabric, mulc(col, 0.92));
    B.box(-1.0, 0.42, -0.22, -0.82, 0.62, 0.45, LAYER.fabric, mulc(col, 0.95));
    B.box(0.82, 0.42, -0.22, 1.0, 0.62, 0.45, LAYER.fabric, mulc(col, 0.95));
    B.box(-0.82, 0.42, -0.2, -0.01, 0.52, 0.42, LAYER.fabric, mulc(col, 1.08));
    B.box(0.01, 0.42, -0.2, 0.82, 0.52, 0.42, LAYER.fabric, mulc(col, 1.08));
    legs(B, 2.0, 0.9, 0.08, 0.05, C.woodD, 0.03);
  },
  armchair(B, G, P, o, s) {
    const col = pick(CLOTH_COLS, s + 2);
    B.box(-0.45, 0.08, -0.45, 0.45, 0.42, 0.45, LAYER.fabric, col, { aoBottom: 0.6 });
    B.box(-0.45, 0.42, -0.45, 0.45, 0.85, -0.22, LAYER.fabric, mulc(col, 0.92));
    B.box(-0.45, 0.42, -0.22, -0.3, 0.62, 0.45, LAYER.fabric, col);
    B.box(0.3, 0.42, -0.22, 0.45, 0.62, 0.45, LAYER.fabric, col);
    B.box(-0.3, 0.42, -0.2, 0.3, 0.52, 0.42, LAYER.fabric, mulc(col, 1.08));
  },
  bed(B, G, P, o, s) { bed(B, 1.6, s); },
  bedS(B, G, P, o, s) { bed(B, 1.0, s); },
  counter(B, G, P, o, s) {
    const body = o.body ? H(o.body) : C.offw;
    B.box(-1.0, 0.1, -0.3, 1.0, 0.9, 0.3, LAYER.wood, body);
    B.box(-1.0, 0, -0.27, 1.0, 0.1, 0.27, LAYER.plain, C.dgray);
    B.box(-1.02, 0.9, -0.33, 1.02, 0.95, 0.33, LAYER.concrete, o.top ? H(o.top) : H('#5a5550'));
    for (let x = -0.98; x < 0.9; x += 0.5) B.box(x + 0.02, 0.15, 0.3, x + 0.48, 0.86, 0.305, LAYER.wood, mulc(body, 0.94));
  },
  bar(B, G, P, o, s) {
    B.box(-1.5, 0.1, -0.3, 1.5, 1.03, 0.3, LAYER.wood, C.woodD);
    B.box(-1.52, 1.03, -0.36, 1.52, 1.08, 0.36, LAYER.wood, mulc(C.wood, 1.1));
    B.box(-1.5, 0, -0.28, 1.5, 0.1, 0.28, LAYER.plain, C.black);
    B.tube([-1.45, 0.2, 0.36], [1.45, 0.2, 0.36], 0.02, 0.02, 6, LAYER.metal, H('#b08a4a'));
  },
  shelf(B, G, P, o, s) {
    const col = H('#d6d4cf');
    B.box(-0.9, 0, -0.3, 0.9, 0.12, 0.3, LAYER.metal, col);
    B.box(-0.9, 0.12, -0.03, 0.9, 1.7, 0.03, LAYER.metal, mulc(col, 0.9));
    for (const sx of [-1, 1]) B.box(sx * 0.9 - 0.02, 0, -0.3, sx * 0.9 + 0.02, 1.7, 0.3, LAYER.metal, mulc(col, 0.8));
    for (const y of [0.12, 0.52, 0.92, 1.32]) {
      for (const sz of [-1, 1]) {
        B.box(-0.88, y, sz > 0 ? 0.03 : -0.3, 0.88, y + 0.025, sz > 0 ? 0.3 : -0.03, LAYER.metal, col);
        if (sz > 0) goods(B, -0.88, 0.88, y + 0.025, 0.03, 0.3, s + y * 10, y > 1.2 ? 0.22 : 0.3);
      }
    }
  },
  bookshelf(B, G, P, o, s) {
    const col = C.woodD;
    B.box(-0.5, 0, -0.175, 0.5, 1.9, -0.155, LAYER.wood, col);
    for (const sx of [-1, 1]) B.box(sx * 0.5 - (sx > 0 ? 0.02 : 0), 0, -0.175, sx * 0.5 + (sx > 0 ? 0 : 0.02), 1.9, 0.175, LAYER.wood, col);
    for (let k = 0; k <= 5; k++) {
      const y = k * 0.37;
      B.box(-0.48, y, -0.155, 0.48, y + 0.025, 0.175, LAYER.wood, col);
      if (k < 5) {
        let x = -0.47, n = 0;
        while (x < 0.44) {
          const r = ((s * 31 + k * 17 + n * 13) % 97) / 97;
          const w = 0.025 + r * 0.035, h = 0.2 + r * 0.12;
          if (x + w > 0.47) break;
          if (r > 0.08) B.box(x, y + 0.025, -0.12, x + w, y + 0.025 + h, 0.15, LAYER.paint, pick(['#7a2a26', '#2b4a6a', '#3c5c34', '#c9b89a', '#5b3d6b', '#a8722e', '#2a2a2a'].map(H), n + k + s), { faces: 1 | 2 | 4 | 16 });
          x += w + 0.004; n++;
        }
      }
    }
  },
  wardrobe(B, G, P, o, s) {
    const col = o.white ? C.offw : C.wood;
    B.box(-0.6, 0.05, -0.3, 0.6, 2.0, 0.3, LAYER.wood, col, { aoBottom: 0.7 });
    B.box(-0.58, 0, -0.28, 0.58, 0.05, 0.28, LAYER.wood, mulc(col, 0.7));
    B.box(-0.004, 0.1, 0.3, 0.004, 1.95, 0.305, LAYER.plain, mulc(col, 0.6));
    for (const sx of [-1, 1]) B.box(sx * 0.06 - 0.01, 1.0, 0.3, sx * 0.06 + 0.01, 1.18, 0.33, LAYER.metal, C.steel);
  },
  cabinet(B, G, P, o, s) {
    const col = H('#9ea3a6');
    B.box(-0.45, 0, -0.25, 0.45, 1.3, 0.25, LAYER.metal, col, { aoBottom: 0.7 });
    for (let k = 0; k < 4; k++) { const y = 0.05 + k * 0.31; B.box(-0.43, y, 0.25, 0.43, y + 0.003, 0.252, LAYER.plain, mulc(col, 0.6)); B.box(-0.1, y + 0.2, 0.25, 0.1, y + 0.23, 0.27, LAYER.metal, C.steel); }
  },
  locker(B, G, P, o, s) {
    const col = pick(['#5f6f7d', '#6d7b6a', '#8a8f93'].map(H), s);
    B.box(-0.45, 0, -0.25, 0.45, 1.9, 0.25, LAYER.metal, col, { aoBottom: 0.7 });
    for (const x of [-0.15, 0.15]) B.box(x - 0.003, 0.05, 0.25, x + 0.003, 1.85, 0.253, LAYER.plain, mulc(col, 0.55));
    for (const x of [-0.3, 0, 0.3]) for (let k = 0; k < 4; k++) B.box(x - 0.08, 1.6 + k * 0.05, 0.25, x + 0.08, 1.615 + k * 0.05, 0.253, LAYER.plain, mulc(col, 0.5));
  },
  fridge(B, G, P, o, s) {
    B.box(-0.4, 0, -0.35, 0.4, 1.8, 0.35, LAYER.paint, C.white, { aoBottom: 0.7 });
    B.box(-0.39, 1.15, 0.35, 0.39, 1.155, 0.352, LAYER.plain, C.lgray);
    B.box(0.3, 1.25, 0.35, 0.33, 1.6, 0.39, LAYER.metal, C.steel);
    B.box(0.3, 0.6, 0.35, 0.33, 1.05, 0.39, LAYER.metal, C.steel);
  },
  cooler(B, G, P, o, s) {
    const col = H('#2e3236');
    B.box(-1.0, 0, -0.375, 1.0, 0.12, 0.375, LAYER.metal, col);
    B.box(-1.0, 1.8, -0.375, 1.0, 1.95, 0.375, LAYER.metal, col);
    B.box(-1.0, 0.12, -0.375, 1.0, 1.8, -0.33, LAYER.metal, col);
    for (const x of [-1.0, -0.34, 0.32, 0.96]) B.box(x, 0.12, -0.33, x + 0.04, 1.8, 0.375, LAYER.metal, col);
    B.emit = 0.8; B.box(-0.98, 1.78, -0.3, 0.98, 1.8, 0.3, LAYER.plain, H('#f4f2ea'), { faces: 8 }); B.emit = 0;
    for (const y of [0.12, 0.55, 0.98, 1.4]) { B.box(-0.98, y, -0.33, 0.98, y + 0.015, 0.33, LAYER.metal, C.steel); goods(B, -0.97, 0.97, y + 0.015, -0.33, 0.3, s * 3 + y * 7, 0.26); }
    // ガラス戸
    G.room = B.room; G.emit = 1;
    G.quad([-0.96, 0.14, 0.37], [0.96, 0.14, 0.37], [0.96, 1.78, 0.37], [-0.96, 1.78, 0.37], [0, 0, 1], [0, 0, 1, 0, 1, 1, 0, 1], LAYER.plain, C.glass);
    G.emit = 0;
  },
  stove(B, G, P, o, s) {
    B.box(-0.6, 0, -0.35, 0.6, 0.9, 0.35, LAYER.metal, C.steel, { aoBottom: 0.7 });
    B.box(-0.6, 0.9, -0.35, 0.6, 0.92, 0.35, LAYER.metal, C.dgray);
    for (const x of [-0.3, 0.3]) for (const z of [-0.15, 0.15]) B.cyl(x, z, 0.92, 0.94, 0.11, 0.11, 8, LAYER.metal, C.black);
    B.box(-0.5, 0.15, 0.35, 0.5, 0.7, 0.355, LAYER.plain, C.dgray);
    B.box(-0.4, 0.72, 0.35, 0.4, 0.75, 0.39, LAYER.metal, C.steel);
  },
  crate(B, G, P, o, s) { crate(B, 0, 0, 0, 1.0, 1.0, 1.0, s); },
  crates(B, G, P, o, s) { crate(B, 0, 0, 0, 1.2, 1.0, 1.2, s); crate(B, 0.05, 1.0, -0.02, 1.0, 1.0, 1.0, s + 1); },
  pallet(B, G, P, o, s) {
    B.box(-0.6, 0, -0.5, 0.6, 0.12, 0.5, LAYER.wood, C.woodL);
    B.box(-0.58, 0.12, -0.48, 0.58, 1.4, 0.48, LAYER.paint, pick(['#b08d5e', '#c9c2b4', '#8b6a44'].map(H), s));
    B.box(-0.585, 0.5, -0.485, 0.585, 0.53, 0.485, LAYER.plain, H('#d8d0bc'));
    B.box(-0.585, 1.0, -0.485, 0.585, 1.03, 0.485, LAYER.plain, H('#d8d0bc'));
  },
  barrel(B, G, P, o, s) {
    const col = pick(['#2f4f7a', '#7a2a24', '#3e6b3a', '#6d6f72'].map(H), s);
    B.cyl(0, 0, 0, 0.9, 0.29, 0.29, 12, LAYER.metal, col, { aoBottom: 0.6 });
    for (const y of [0.3, 0.6]) B.cyl(0, 0, y - 0.02, y + 0.02, 0.297, 0.297, 12, LAYER.metal, mulc(col, 0.8), { capT: false });
  },
  container(B, G, P, o, s) {
    const col = pick(['#8c2b22', '#2a5a7a', '#3f6a3a', '#c48a2c', '#5b5e62'].map(H), s);
    B.box(-3.0, 0, -1.2, 3.0, 2.6, 1.2, LAYER.metal, col, { uv: 0.5 });
    for (let x = -2.9; x < 2.9; x += 0.3) for (const sz of [-1, 1]) B.box(x, 0.15, sz * 1.2 - (sz > 0 ? 0 : 0.03), x + 0.12, 2.45, sz * 1.2 + (sz > 0 ? 0.03 : 0), LAYER.metal, mulc(col, 0.88), { faces: sz > 0 ? 16 | 1 | 2 : 32 | 1 | 2 });
    B.box(2.98, 0.1, -1.15, 3.02, 2.5, 1.15, LAYER.metal, mulc(col, 0.8));
    for (const z of [-0.6, 0.6]) B.box(3.02, 0.3, z - 0.03, 3.06, 2.3, z + 0.03, LAYER.metal, C.steel);
  },
  car(B, G, P, o, s) { car(B, G, CAR_COLS[s % CAR_COLS.length], false); },
  van(B, G, P, o, s) { car(B, G, H('#1d2531'), true); },
  dumpster(B, G, P, o, s) {
    const col = H('#2f5a3a');
    B.box(-1.0, 0.12, -0.6, 1.0, 1.2, 0.6, LAYER.metal, col);
    B.box(-1.02, 1.2, -0.62, 1.02, 1.3, 0.62, LAYER.metal, mulc(col, 0.85));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.cyl(sx * 0.8, sz * 0.45, 0, 0.12, 0.06, 0.06, 6, LAYER.rubber, C.black);
  },
  pump(B, G, P, o, s) {
    B.box(-0.45, 0, -0.3, 0.45, 0.2, 0.3, LAYER.concrete, C.concrete);
    B.box(-0.4, 0.2, -0.25, 0.4, 1.8, 0.25, LAYER.paint, C.white);
    B.box(-0.41, 1.45, -0.26, 0.41, 1.8, 0.26, LAYER.paint, C.red);
    B.box(-0.42, 1.8, -0.27, 0.42, 1.84, 0.27, LAYER.paint, mulc(C.red, 0.8));
    // 表示（金額・量）と、ボタン・カードの差し込み口
    for (const sz of [1, -1]) {
      const zf = sz * 0.25;
      B.box(-0.3, 1.02, Math.min(zf, zf + sz * 0.012), 0.3, 1.38, Math.max(zf, zf + sz * 0.012), LAYER.plain, C.dgray, { sharp: true });
      B.emit = 0.6; B.box(-0.24, 1.22, Math.min(zf + sz * 0.012, zf + sz * 0.014), 0.24, 1.33, Math.max(zf + sz * 0.012, zf + sz * 0.014), LAYER.plain, H('#3c6a3c'), { faces: sz > 0 ? 16 : 32, sharp: true });
      B.box(-0.24, 1.07, Math.min(zf + sz * 0.012, zf + sz * 0.014), 0.05, 1.17, Math.max(zf + sz * 0.012, zf + sz * 0.014), LAYER.plain, H('#7a5a2a'), { faces: sz > 0 ? 16 : 32, sharp: true }); B.emit = 0;
      for (let q = 0; q < 3; q++) B.box(0.1 + q * 0.06, 1.08, Math.min(zf + sz * 0.012, zf + sz * 0.02), 0.14 + q * 0.06, 1.12, Math.max(zf + sz * 0.012, zf + sz * 0.02), LAYER.rubber, [H('#c8b23a'), H('#3a8a3a'), H('#c03a2e')][q], { sharp: true });
    }
    // ノズルの掛け金・ホース（横から下へ垂れて戻る）・ノズル
    for (const sx of [-1, 1]) {
      const xs = sx * 0.4;
      B.box(xs - 0.05, 0.75, -0.09, xs + 0.05, 0.98, 0.09, LAYER.plain, C.black);
      B.tube([xs + sx * 0.04, 0.85, 0], [xs + sx * 0.13, 0.86, 0.02], 0.022, 0.02, 6, LAYER.rubber, C.black, { caps: true });
      B.tube([xs, 1.4, 0.12], [xs + sx * 0.06, 0.55, 0.16], 0.016, 0.016, 6, LAYER.rubber, C.black);
      B.tube([xs + sx * 0.06, 0.55, 0.16], [xs + sx * 0.04, 0.82, 0.05], 0.016, 0.016, 6, LAYER.rubber, C.black);
    }
  },
  vending(B, G, P, o, s) {
    B.box(-0.47, 0, -0.4, 0.47, 1.9, 0.4, LAYER.paint, pick(['#a3241e', '#20406a', '#d9d9d6'].map(H), s));
    B.emit = 0.7; B.box(-0.4, 0.75, 0.4, 0.2, 1.8, 0.405, LAYER.plain, H('#e8eef0'), { faces: 16 }); B.emit = 0;
    B.box(0.25, 1.0, 0.4, 0.42, 1.5, 0.41, LAYER.plain, C.dgray);
    B.box(-0.4, 0.25, 0.4, 0.2, 0.45, 0.42, LAYER.plain, C.black);
  },
  toilet(B, G, P, o, s) {
    B.cyl(0, 0.08, 0, 0.4, 0.15, 0.19, 10, LAYER.paint, C.white, { aoBottom: 0.7 });
    B.box(-0.19, 0.4, -0.3, 0.19, 0.75, -0.14, LAYER.paint, C.white);
    B.cyl(0, 0.08, 0.4, 0.43, 0.2, 0.2, 10, LAYER.paint, C.white);
  },
  sink(B, G, P, o, s) {
    B.box(-0.3, 0, -0.25, 0.3, 0.78, 0.25, LAYER.wood, C.offw, { aoBottom: 0.7 });
    B.box(-0.31, 0.78, -0.26, 0.31, 0.85, 0.26, LAYER.paint, C.white);
    B.box(-0.18, 0.84, -0.12, 0.18, 0.851, 0.15, LAYER.plain, C.lgray);
    B.box(-0.02, 0.85, -0.22, 0.02, 0.98, -0.18, LAYER.metal, C.steel);
  },
  tvstand(B, G, P, o, s) {
    B.box(-0.8, 0, -0.22, 0.8, 0.5, 0.22, LAYER.wood, C.woodD, { aoBottom: 0.7 });
    B.box(-0.1, 0.5, -0.08, 0.1, 0.55, 0.08, LAYER.plain, C.black);
    B.box(-0.03, 0.55, -0.04, 0.03, 0.62, 0.0, LAYER.plain, C.black);
    B.box(-0.6, 0.6, -0.04, 0.6, 1.15, 0.0, LAYER.plain, C.black);
    B.emit = 0.25; B.box(-0.58, 0.62, 0.0, 0.58, 1.13, 0.002, LAYER.plain, H('#2a3a4a'), { faces: 16 }); B.emit = 0;
  },
  plant(B, G, P, o, s) {
    B.cyl(0, 0, 0, 0.4, 0.16, 0.2, 8, LAYER.concrete, H('#8a5a3c'), { aoBottom: 0.7 });
    foliage(B, 0, 0.75, 0, 0.32, 0.45, C.leaf);
    foliage(B, 0.08, 1.05, 0.05, 0.22, 0.3, C.leafD);
  },
  server(B, G, P, o, s) {
    B.box(-0.35, 0, -0.5, 0.35, 2.0, 0.5, LAYER.metal, C.dgray, { aoBottom: 0.7 });
    B.box(-0.33, 0.05, 0.5, 0.33, 1.95, 0.502, LAYER.plain, H('#141518'));
    for (let k = 0; k < 14; k++) { const y = 0.12 + k * 0.13; B.box(-0.3, y, 0.502, 0.3, y + 0.09, 0.51, LAYER.metal, H('#3a3d42')); B.emit = 2.0; B.box(0.2, y + 0.03, 0.51, 0.22, y + 0.05, 0.512, LAYER.plain, (k + s) % 3 ? H('#40ff70') : H('#ffb030'), { faces: 16 }); B.emit = 0; }
  },
  piano(B, G, P, o, s) {
    B.box(-0.75, 0, -0.3, 0.75, 1.25, 0.15, LAYER.wood, C.black);
    B.box(-0.75, 0.68, 0.15, 0.75, 0.75, 0.3, LAYER.wood, C.black);
    B.box(-0.7, 0.75, 0.15, 0.7, 0.77, 0.29, LAYER.paint, C.white);
    B.box(-0.75, 0, 0.15, -0.68, 0.68, 0.3, LAYER.wood, C.black); B.box(0.68, 0, 0.15, 0.75, 0.68, 0.3, LAYER.wood, C.black);
  },
  boxes(B, G, P, o, s) {
    B.box(-0.4, 0, -0.3, 0.4, 0.45, 0.3, LAYER.paint, C.card, { aoBottom: 0.7 });
    B.box(-0.32, 0.45, -0.24, 0.28, 0.8, 0.26, LAYER.paint, mulc(C.card, 1.1));
    B.box(-0.41, 0.43, -0.005, 0.41, 0.455, 0.005, LAYER.plain, H('#d8cfa8'));
  },
  speaker(B, G, P, o, s) {
    B.box(-0.4, 0, -0.3, 0.4, 1.6, 0.3, LAYER.fabric, C.black);
    for (const [y, r] of [[0.45, 0.28], [1.1, 0.2], [1.45, 0.07]]) B.box(-r, y - r, 0.3, r, y + r, 0.31, LAYER.rubber, H('#2b2c30'), { faces: 16 | 4 | 8 | 1 | 2 });
  },
  booth(B, G, P, o, s) {
    const col = C.vinyl;
    B.box(-1.0, 0, -0.35, 1.0, 0.45, 0.35, LAYER.fabric, col, { aoBottom: 0.6 });
    B.box(-1.0, 0.45, -0.35, 1.0, 1.1, -0.17, LAYER.fabric, mulc(col, 0.9));
    B.box(-1.0, 0.0, -0.35, 1.0, 0.1, 0.33, LAYER.plain, C.dgray);
  },
  target(B, G, P, o, s) {
    B.box(-0.03, 0, -0.03, 0.03, 1.0, 0.03, LAYER.wood, C.woodL);
    B.box(-0.3, 0.95, -0.01, 0.3, 1.85, 0.01, LAYER.paint, H('#e9e5d6'));
    B.box(-0.18, 1.0, 0.01, 0.18, 1.6, 0.015, LAYER.plain, H('#26262a'), { faces: 16 });
    B.box(-0.09, 1.6, 0.01, 0.09, 1.8, 0.015, LAYER.plain, H('#26262a'), { faces: 16 });
    B.box(-0.03, 1.3, 0.015, 0.03, 1.36, 0.02, LAYER.plain, H('#c84030'), { faces: 16 });
  },
  sandbag(B, G, P, o, s) {
    const col = H('#a39371');
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) {
      const x = -0.8 + 0.27 * (r % 2) + k * 0.54;
      if (x + 0.27 > 0.8 + 0.01) continue;
      B.box(x, r * 0.3, -0.3, x + 0.52, r * 0.3 + 0.29, 0.3, LAYER.fabric, mulc(col, 0.92 + ((k + r) % 3) * 0.05));
    }
  },
  jersey(B, G, P, o, s) {
    const col = C.concrete;
    B.box(-1.0, 0, -0.3, 1.0, 0.25, 0.3, LAYER.concrete, col, { uv: 0.5 });
    B.box(-1.0, 0.25, -0.17, 1.0, 0.85, 0.17, LAYER.concrete, col, { uv: 0.5 });
    B.box(-1.0, 0.2, -0.24, 1.0, 0.3, 0.24, LAYER.concrete, mulc(col, 0.95), { faces: 16 | 32 | 4 });
  },
  tree(B, G, P, o, s) {
    B.cyl(0, 0, 0, 2.6, 0.17, 0.11, 7, LAYER.wood, C.trunk, { capT: false });
    foliage(B, 0, 3.0, 0, 1.5, 1.3, C.leaf);
    foliage(B, 0.3, 3.9, -0.2, 1.1, 1.0, mulc(C.leaf, 1.1));
    foliage(B, -0.4, 3.4, 0.4, 0.9, 0.8, C.leafD);
  },
  lamp(B, G, P, o, s) {
    B.cyl(0, 0, 0, 4.4, 0.09, 0.06, 8, LAYER.metal, C.gray, { capT: false, aoBottom: 0.7 });
    B.tube([0, 4.35, 0], [0, 4.45, 1.2], 0.04, 0.04, 6, LAYER.metal, C.gray);
    B.box(-0.14, 4.35, 1.05, 0.14, 4.48, 1.55, LAYER.metal, C.dgray);
    B.emit = 3.0; B.box(-0.12, 4.34, 1.08, 0.12, 4.35, 1.52, LAYER.plain, H('#ffd7a0'), { faces: 8 }); B.emit = 0;
  },
};

function bed(B, w, s) {
  const frame = C.woodD, sheet = C.white, blanket = pick(['#3f5a7a', '#7a3f3f', '#5a6a4a', '#8a7a60', '#4a4a5a'].map(H), s);
  B.box(-w / 2, 0.05, -1.0, w / 2, 0.3, 1.0, LAYER.wood, frame, { aoBottom: 0.7 });
  B.box(-w / 2 + 0.02, 0.3, -0.98, w / 2 - 0.02, 0.5, 0.98, LAYER.fabric, sheet);
  B.box(-w / 2 + 0.01, 0.42, -0.4, w / 2 - 0.01, 0.53, 0.99, LAYER.fabric, blanket);
  B.box(-w / 2, 0, -1.04, w / 2, 0.95, -0.98, LAYER.wood, frame);
  const np = w > 1.2 ? 2 : 1;
  for (let k = 0; k < np; k++) { const x = np === 2 ? (k ? 0.35 : -0.35) : 0; B.box(x - 0.3, 0.5, -0.92, x + 0.3, 0.62, -0.6, LAYER.fabric, sheet); }
}
function crate(B, x, y, z, w, h, d, s) {
  const col = pick(['#9b7149', '#a8825a', '#8a6440'].map(H), s);
  B.box(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, LAYER.wood, col, { aoBottom: 0.6 });
  const e = 0.025, dk = mulc(col, 0.78);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(x + sx * w / 2 - (sx > 0 ? 0.08 : -0), y, z + sz * d / 2 - (sz > 0 ? e : -0), x + sx * w / 2 + (sx > 0 ? 0 : 0.08), y + h, z + sz * d / 2 + (sz > 0 ? 0 : e) * 0 + (sz > 0 ? 0.0 : 0), LAYER.wood, dk, { faces: 1 | 2 | 16 | 32 });
  for (const sz of [-1, 1]) { B.box(x - w / 2, y + h / 2 - 0.04, z + sz * (d / 2 + e / 2) - e / 2, x + w / 2, y + h / 2 + 0.04, z + sz * (d / 2 + e / 2) + e / 2, LAYER.wood, dk, { faces: sz > 0 ? 16 | 4 | 8 : 32 | 4 | 8 }); }
}
function foliage(B, x, y, z, r, h, col) {
  // 低い多面体の葉のかたまり（上下2段の8角）
  B.loft([
    { y: y - h * 0.5, rx: r * 0.35, rz: r * 0.35, cx: x, cz: z },
    { y: y - h * 0.15, rx: r, rz: r * 0.92, cx: x, cz: z },
    { y: y + h * 0.25, rx: r * 0.85, rz: r * 0.8, cx: x + r * 0.05, cz: z },
    { y: y + h * 0.5, rx: r * 0.25, rz: r * 0.25, cx: x, cz: z },
  ], 7, LAYER.leaves, col, { capTop: true, capBot: true, rot: x * 3 });
}
function car(B, G, col, van) {
  const dark = H('#141517'), glass = H('#26323b'), chrome = H('#b4b8bc'), trim = H('#2a2b2e'), lamp = H('#fff2c8'), tail = H('#c41f1a');
  const hw = van ? 1.02 : 0.9;
  // 車輪: タイヤ・ホイール・車輪の穴（車体の横の黒い半円）
  const wheel = (z, r, wdt) => {
    for (const sx of [-1, 1]) {
      const xo = sx * hw, xi = sx * (hw - wdt);
      // タイヤの外の面は車輪の穴より少し外（穴の黒の手前に見える）
      B.tube([xi, r, z], [xo + sx * 0.012, r, z], r, r, 12, LAYER.rubber, dark, { caps: true });
      B.tube([xo + sx * 0.011, r, z], [xo + sx * 0.02, r, z], r * 0.6, r * 0.6, 10, LAYER.metal, chrome, { caps: true });
      B.tube([xo + sx * 0.02, r, z], [xo + sx * 0.028, r, z], r * 0.18, r * 0.14, 8, LAYER.metal, mulc(chrome, 0.7), { caps: true });
      const ar = r + 0.06, pts = [[z - ar, 0.29], [z + ar, 0.29]];
      for (let k = 0; k <= 6; k++) { const a = k / 6 * Math.PI; pts.push([z + Math.cos(a) * ar, r + Math.sin(a) * ar]); }
      B.poly(pts.map(q => [xo + sx * 0.003, q[1], q[0]]), [sx, 0, 0], LAYER.plain, H('#0d0e0f'));
    }
  };
  if (!van) {
    // 車体（下）と車室。窓は暗いガラス
    const body = [[-2.25, 0.3], [2.2, 0.3], [2.33, 0.45], [2.33, 0.68], [2.22, 0.82], [1.15, 0.92], [-1.35, 0.94], [-2.2, 0.9], [-2.3, 0.75], [-2.3, 0.42]];
    B.prismX(body, -hw, hw, LAYER.paint, col, { bevel: 0.05 });
    B.prismX([[-1.35, 0.92], [1.15, 0.9], [0.35, 1.38], [-0.85, 1.4]], -hw + 0.12, hw - 0.12, LAYER.paint, col, { bevel: 0.035, edgeCols: [col, glass, col, glass] });
    for (const sx of [-1, 1]) {
      const x = sx * (hw - 0.12 + 0.004);
      B.poly([[x, 0.98, -1.18], [x, 0.97, 1.0], [x, 1.33, 0.33], [x, 1.35, -0.78]], [sx, 0, 0], LAYER.plain, glass);
      // 柱（B・C）と、ドアの継ぎ目・取っ手・ミラー
      B.bbox(x - 0.006, 0.96, -0.16, x + 0.006, 1.37, -0.06, 0.004, LAYER.paint, col);
      const xs = sx * (hw + 0.002);
      for (const z of [0.98, -0.1, -1.12]) B.box(Math.min(xs, xs - sx * 0.006), 0.38, z - 0.006, Math.max(xs, xs - sx * 0.006), 0.9, z + 0.006, LAYER.plain, trim);
      for (const z of [0.55, -0.55]) B.bbox(Math.min(xs, xs + sx * 0.02), 0.8, z - 0.07, Math.max(xs, xs + sx * 0.02), 0.83, z + 0.07, 0.004, LAYER.metal, chrome);
      B.bbox(Math.min(sx * (hw - 0.14), sx * (hw + 0.1)), 0.95, 0.9, Math.max(sx * (hw - 0.14), sx * (hw + 0.1)), 1.06, 1.02, 0.015, LAYER.paint, col);
    }
    // 前: グリル・灯火・ナンバー。後ろ: 尾灯・ナンバー。下: 黒い樹脂のバンパー
    B.bbox(-hw + 0.04, 0.34, 2.24, hw - 0.04, 0.5, 2.37, 0.03, LAYER.rubber, trim);
    B.bbox(-hw + 0.04, 0.34, -2.37, hw - 0.04, 0.5, -2.24, 0.03, LAYER.rubber, trim);
    B.bbox(-0.36, 0.56, 2.32, 0.36, 0.7, 2.345, 0.008, LAYER.metal, dark);
    for (let y = 0.58; y < 0.69; y += 0.035) B.box(-0.34, y, 2.344, 0.34, y + 0.012, 2.348, LAYER.metal, chrome, { faces: 16 });
    B.emit = 0.45;
    for (const sx of [-1, 1]) {
      B.bbox(Math.min(sx * 0.48, sx * 0.8), 0.62, 2.28, Math.max(sx * 0.48, sx * 0.8), 0.74, 2.335, 0.012, LAYER.plain, lamp);
      B.bbox(Math.min(sx * 0.52, sx * 0.86), 0.7, -2.31, Math.max(sx * 0.52, sx * 0.86), 0.83, -2.27, 0.012, LAYER.plain, tail);
    }
    B.emit = 0;
    B.bbox(-0.26, 0.4, 2.37, 0.26, 0.52, 2.385, 0.004, LAYER.plain, H('#e9e8e2'));
    B.bbox(-0.26, 0.55, -2.33, 0.26, 0.67, -2.315, 0.004, LAYER.plain, H('#e9e8e2'));
    wheel(1.38, 0.33, 0.22); wheel(-1.42, 0.33, 0.22);
  } else {
    // 警察のバン（SWAT）: 箱の車体、斜めの前の窓、屋根の赤青の灯、白い帯
    B.prismX([[-2.8, 0.42], [2.65, 0.42], [2.8, 0.6], [2.8, 1.05], [2.4, 1.2], [-2.8, 1.2]], -hw, hw, LAYER.paint, col, { bevel: 0.05 });
    B.prismX([[-2.8, 1.18], [2.4, 1.18], [1.75, 2.15], [-2.8, 2.2]], -hw, hw, LAYER.paint, col, { bevel: 0.06, edgeCols: [col, glass, col, col] });
    for (const sx of [-1, 1]) {
      const x = sx * (hw + 0.003);
      B.poly([[x, 1.32, 1.0], [x, 1.32, 2.15], [x, 1.98, 1.72], [x, 1.98, 1.0]], [sx, 0, 0], LAYER.plain, glass);
      B.box(Math.min(x, x + sx * 0.004), 1.0, -2.6, Math.max(x, x + sx * 0.004), 1.15, 0.85, LAYER.plain, H('#c9ccd0'), { faces: sx > 0 ? 1 : 2 });
      for (const z of [0.9, -0.4, -1.6]) B.box(Math.min(x, x - sx * 0.006), 0.48, z - 0.006, Math.max(x, x - sx * 0.006), 2.05, z + 0.006, LAYER.plain, trim);
      B.bbox(Math.min(sx * (hw - 0.05), sx * (hw + 0.14)), 1.55, 2.0, Math.max(sx * (hw - 0.05), sx * (hw + 0.14)), 1.8, 2.1, 0.02, LAYER.paint, dark);
      // 乗り降りの段
      B.bbox(Math.min(sx * (hw - 0.3), sx * (hw + 0.06)), 0.42, -1.4, Math.max(sx * (hw - 0.3), sx * (hw + 0.06)), 0.47, 0.6, 0.01, LAYER.metal, dark);
    }
    B.bbox(-hw + 0.03, 0.45, 2.75, hw - 0.03, 0.72, 2.92, 0.03, LAYER.metal, dark);
    B.bbox(-0.55, 0.78, 2.79, 0.55, 1.0, 2.81, 0.01, LAYER.metal, dark);
    B.bbox(-hw + 0.03, 0.45, -2.92, hw - 0.03, 0.62, -2.78, 0.03, LAYER.metal, dark);
    B.box(-0.006, 0.6, -2.805, 0.006, 2.1, -2.8, LAYER.plain, trim, { faces: 32 });
    B.emit = 0.45;
    for (const sx of [-1, 1]) { B.bbox(Math.min(sx * 0.62, sx * 0.92), 0.8, 2.76, Math.max(sx * 0.62, sx * 0.92), 0.95, 2.81, 0.012, LAYER.plain, lamp); B.bbox(Math.min(sx * 0.75, sx * 0.95), 0.9, -2.82, Math.max(sx * 0.75, sx * 0.95), 1.3, -2.78, 0.012, LAYER.plain, tail); }
    B.emit = 1.5;
    B.bbox(-0.62, 2.2, 1.35, -0.04, 2.32, 1.62, 0.02, LAYER.plain, H('#ff3020'));
    B.bbox(0.04, 2.2, 1.35, 0.62, 2.32, 1.62, 0.02, LAYER.plain, H('#2050ff'));
    B.emit = 0;
    B.bbox(-0.7, 2.18, 1.3, 0.7, 2.21, 1.67, 0.01, LAYER.metal, dark);
    wheel(1.75, 0.42, 0.26); wheel(-1.75, 0.42, 0.26);
  }
}
