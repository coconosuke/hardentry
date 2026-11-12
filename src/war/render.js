// WAR BIT の世界の形（描く物）。64m の塊ごとに:
//   遠い形（いつも持つ）: 地形 8m ごと＋すそ（つなぎ目のすき間を隠す）・簡単な木・箱（建物・塀・岩）
//   近い形（近づいたときだけ作る）: 地形 2m ごと・道の帯（アスファルトと中央線）・細かい木・箱・階段
// 見た目（research/WARBIT.md の 4）: 地形はなめらかな面に頂点の色（草のむら・乾いた所・土・岩・川床・道）、
// 物は角ばった低ポリ（木の葉は面ごとの平らな光）。建物の中の面は日が当たらない（頂点の room＝日の当たり方）。
import { MeshBuilder, hex, mixc, mulc } from '../render/build.js';
import { LAYER } from '../render/textures.js';
import { M } from '../engine/data/materials.js';
import { heightAt } from './world.js';
import { mulberry, fbm } from './noise.js';

export const CH = 64;

// 色（独自）
const C = {
  lush: hex('#4f6b33'), dry: hex('#6d7041'), dark: hex('#405a2c'), dirt: hex('#6f5c43'), rock: hex('#6e6a63'), mount: hex('#55603f'),
  sand: hex('#8e7d5e'), road: hex('#3f3e3b'), edge: hex('#69645a'), pad: hex('#6f6653'),
};
const MATCOL = { [M.BRICK]: '#a77a5e', [M.CONCRETE]: '#a3a39b', [M.DRYWALL]: '#d6d0c2', [M.WOOD]: '#8a6a44', [M.METAL]: '#7d878a', [M.FABRIC]: '#a28f68' };
const MATLAYER = { [M.BRICK]: LAYER.brick, [M.CONCRETE]: LAYER.concrete, [M.DRYWALL]: LAYER.plaster, [M.WOOD]: LAYER.wood, [M.METAL]: LAYER.metal, [M.FABRIC]: LAYER.fabric };
const PINE = [hex('#355f33'), hex('#3c6a37'), hex('#2f5630')], OAK = [hex('#557f36'), hex('#5f8a3b'), hex('#4d7532')], TRUNK = hex('#5a4330');
const ROADC = hex('#4a4845'), LINEC = hex('#d8d2b8');

const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function jitter(c, r, k = 0.06) { const f = 1 + (r() * 2 - 1) * k; return [c[0] * f, c[1] * f, c[2] * f]; }
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

// 建物ごとの屋根の高さ（床の板の一番上）。中の面の判定・人の明るさに使う
function bldTops(ww) {
  if (ww._bldTop) return ww._bldTop;
  const m = new Map();
  for (const bd of ww.blds || []) m.set(bd.id, { ...bd, top: bd.y });
  for (const b of ww.boxes) if (b.bld >= 0 && b.kind === 'floor') { const q = m.get(b.bld); if (q) q.top = Math.max(q.top, b.y1); }
  ww._bldTop = m;
  return m;
}
function insideBld(q, x, y, z) {
  const r = q.rect;
  return x > r[0] + 0.02 && x < r[2] - 0.02 && z > r[1] + 0.02 && z < r[3] - 0.02 && y < q.top - 0.02 && y > q.y - 0.6;
}
// その場所の日の当たり方（外 1・建物の中 0.25）。人や手元の銃の明るさに使う
export function sunVisAt(ww, x, y, z) {
  const m = bldTops(ww);
  for (const q of m.values()) if (insideBld(q, x, y + 1.0, z)) return 0.25;
  return 1;
}

// 地面の色（2m の格子の点ごと、一度だけ作る）と、道の帯の切れ端（塊ごと）
export function prepGround(ww) {
  if (ww._gcol) return;
  const { HW, HD, hs, h } = ww, n = HW * HD;
  const col = new Float32Array(n * 3);
  // 道までの距離
  const rd = new Float32Array(n).fill(1e9);
  for (const r of ww.roads || []) for (let k = 0; k + 1 < r.length; k++) {
    const [ax, az] = r[k], [bx, bz] = r[k + 1];
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - 8) / hs)), i1 = Math.min(HW - 1, Math.ceil((Math.max(ax, bx) + 8) / hs));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - 8) / hs)), j1 = Math.min(HD - 1, Math.ceil((Math.max(az, bz) + 8) / hs));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const d = segDist(i * hs, j * hs, ax, az, bx, bz); const q = j * HW + i; if (d < rd[q]) rd[q] = d; }
  }
  // 建物のまわり（踏み固めた地面）
  const near = new Uint8Array(n);
  for (const bd of ww.blds || []) {
    const [x0, z0, x1, z1] = bd.rect, m = bd.kind === 'tower' ? 2 : 4;
    for (let j = Math.max(0, Math.floor((z0 - m) / hs)); j <= Math.min(HD - 1, Math.ceil((z1 + m) / hs)); j++)
      for (let i = Math.max(0, Math.floor((x0 - m) / hs)); i <= Math.min(HW - 1, Math.ceil((x1 + m) / hs)); i++) near[j * HW + i] = 1;
  }
  const cx = ww.sx / 2, cz = ww.sz / 2, edge0 = ww.sx / 2 - 110;
  const r = mulberry(91);
  for (let j = 0; j < HD; j++) for (let i = 0; i < HW; i++) {
    const q = j * HW + i, x = i * hs, z = j * hs;
    const hl = h[j * HW + Math.max(0, i - 1)], hr = h[j * HW + Math.min(HW - 1, i + 1)], hu = h[Math.max(0, j - 1) * HW + i], hd = h[Math.min(HD - 1, j + 1) * HW + i];
    const dx = (hr - hl) / (2 * hs), dz = (hd - hu) / (2 * hs), ny = 1 / Math.hypot(dx, 1, dz), slope = 1 - ny;
    // 草のむら（青い所・乾いた所・暗い所）
    const p = fbm(x, z, 95, 3, 41), p2 = fbm(x, z, 33, 2, 77);
    let c = mixc(C.lush, C.dry, sstep(-0.15, 0.55, p));
    c = mixc(c, C.dark, sstep(0.25, 0.7, p2) * 0.6);
    // 坂は土、急な所は岩
    c = mixc(c, C.dirt, sstep(0.1, 0.22, slope));
    c = mixc(c, C.rock, sstep(0.26, 0.42, slope));
    // 遊べる範囲の外の山
    const e = Math.max(Math.abs(x - cx), Math.abs(z - cz));
    c = mixc(c, C.mount, sstep(edge0, edge0 + 60, e) * 0.7);
    // 川床（山の中までは続けない）
    if (ww.riverX) { const dr = Math.abs(x - ww.riverX(z)); c = mixc(c, C.sand, (1 - sstep(8, 15, dr)) * (1 - sstep(edge0 - 40, edge0 + 10, e))); }
    // 建物のまわり
    if (near[q]) c = mixc(c, C.pad, 0.65);
    // 道（帯は近くだけ描くので、遠くでも道に見えるよう地面の色も変える）
    const d = rd[q];
    if (d < 6) c = mixc(c, C.edge, 1 - sstep(4.2, 6, d));
    if (d < 4.4) c = mixc(c, C.road, 1 - sstep(3.4, 4.4, d));
    const f = 1 + (r() * 2 - 1) * 0.035;
    col[q * 3] = c[0] * f; col[q * 3 + 1] = c[1] * f; col[q * 3 + 2] = c[2] * f;
  }
  ww._gcol = col;
  // 道の帯の切れ端（2m ごと）を塊へ
  const NX = Math.ceil(ww.sx / CH), NZ = Math.ceil(ww.sz / CH);
  const pieces = Array.from({ length: NX * NZ }, () => []);
  for (const rl of ww.roads || []) for (let k = 0; k + 1 < rl.length; k++) {
    const [ax, az] = rl[k], [bx, bz] = rl[k + 1], L = Math.hypot(bx - ax, bz - az), N = Math.max(1, Math.round(L / 2));
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    for (let s = 0; s < N; s++) {
      const t0 = s / N * L, t1 = (s + 1) / N * L, mx = ax + ux * (t0 + t1) / 2, mz = az + uz * (t0 + t1) / 2;
      const ci = Math.min(NX - 1, Math.max(0, Math.floor(mx / CH))), cj = Math.min(NZ - 1, Math.max(0, Math.floor(mz / CH)));
      // 交差点の手前は中央線を描かない
      const line = (t0 > 10 && t1 < L - 10) && (Math.floor((t0 + t1) / 2 / 3) % 2 === 0);
      pieces[cj * NX + ci].push({ ax: ax + ux * t0, az: az + uz * t0, bx: ax + ux * t1, bz: az + uz * t1, ux, uz, line });
    }
  }
  ww._roadPieces = pieces;
}

// 地形の格子（なめらかな面）。step は ww.hs の倍数。skirt: すその深さ（0 なら作らない）
function terrainMesh(B, ww, x0, z0, x1, z1, step, skirt) {
  const { hs, HW, HD, h } = ww, col = ww._gcol, k = Math.max(1, Math.round(step / hs));
  const i0 = Math.round(x0 / hs), j0 = Math.round(z0 / hs), i1 = Math.min(HW - 1, Math.round(x1 / hs)), j1 = Math.min(HD - 1, Math.round(z1 / hs));
  const nx = Math.ceil((i1 - i0) / k), nz = Math.ceil((j1 - j0) / k), W1 = nx + 1;
  const base = B.n;
  B.room = 1; B.emit = 0;
  for (let b = 0; b <= nz; b++) for (let a = 0; a <= nx; a++) {
    const gi = Math.min(i1, i0 + a * k), gj = Math.min(j1, j0 + b * k), q = gj * HW + gi;
    const il = Math.max(0, gi - k), ir = Math.min(HW - 1, gi + k), ju = Math.max(0, gj - k), jd = Math.min(HD - 1, gj + k);
    const dx = (h[gj * HW + ir] - h[gj * HW + il]) / ((ir - il) * hs), dz = (h[jd * HW + gi] - h[ju * HW + gi]) / ((jd - ju) * hs);
    const l = Math.hypot(dx, 1, dz), x = gi * hs, z = gj * hs;
    B.vert([x, h[q], z], [-dx / l, 1 / l, -dz / l], x * 0.3, z * 0.3, LAYER.grass, [col[q * 3], col[q * 3 + 1], col[q * 3 + 2]], 1);
  }
  for (let b = 0; b < nz; b++) for (let a = 0; a < nx; a++) {
    const p00 = base + b * W1 + a, p10 = p00 + 1, p01 = p00 + W1, p11 = p01 + 1;
    B.i.push(p00, p01, p10, p11, p10, p01);
  }
  if (!skirt) return;
  const edges = [[], [], [], []];
  for (let a = 0; a <= nx; a++) { edges[0].push(base + a); edges[1].push(base + nz * W1 + a); }
  for (let b = 0; b <= nz; b++) { edges[2].push(base + b * W1); edges[3].push(base + b * W1 + nx); }
  for (const E of edges) {
    const low = E.map(t => { const o = t * 15, v = B.v.slice(o, o + 15); v[1] -= skirt; for (const x of v) B.v.push(x); return B.n++; });
    for (let s = 0; s + 1 < E.length; s++) {
      const a = E[s], b2 = E[s + 1], la = low[s], lb = low[s + 1];
      B.i.push(a, la, b2, b2, la, lb, a, b2, la, b2, lb, la);
    }
  }
}

// 道の帯（近い形だけ）: 幅 8m を4つに分けて地形に沿わせる。中央の白い破線
function roadMesh(B, ww, pieces) {
  B.room = 1;
  const lift = 0.07, half = 4, nX = 4;
  for (const p of pieces) {
    const px = -p.uz, pz = p.ux; // 左右
    const row = (x, z) => { const out = []; for (let s = 0; s <= nX; s++) { const o = -half + (2 * half) * s / nX, X = x + px * o, Z = z + pz * o; out.push([X, heightAt(ww, X, Z) + lift, Z]); } return out; };
    const A = row(p.ax, p.az), Bq = row(p.bx, p.bz);
    for (let s = 0; s < nX; s++) {
      const a0 = A[s], a1 = A[s + 1], b0 = Bq[s], b1 = Bq[s + 1];
      const e1 = [b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]], e2 = [a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]];
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const l = Math.hypot(...n) || 1; n = n.map(v => v / l); if (n[1] < 0) n = n.map(v => -v);
      const edge = s === 0 || s === nX - 1;
      B.poly([a0, a1, b1, b0], n, LAYER.asphalt, edge ? mulc(ROADC, 1.06) : ROADC);
    }
    if (p.line) {
      const w = 0.09, y = lift + 0.012;
      const pts = [[p.ax + px * w, p.az + pz * w], [p.ax - px * w, p.az - pz * w], [p.bx - px * w, p.bz - pz * w], [p.bx + px * w, p.bz + pz * w]].map(([x, z]) => [x, heightAt(ww, x, z) + y, z]);
      B.poly(pts, [0, 1, 0], LAYER.paint, LINEC);
    }
  }
}

// 面ごとに平らな光の円すい台（木の葉・幹）。r1=0 で円すい
function facetCyl(B, x, z, y0, y1, r0, r1, seg, layer, col, o = {}) {
  const rot = o.rot || 0;
  for (let k = 0; k < seg; k++) {
    const a0 = rot + (k / seg) * Math.PI * 2, a1 = rot + ((k + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
    const p0 = [x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0], p1 = [x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0];
    const q0 = [x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1], q1 = [x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1];
    const sl = (r0 - r1) / Math.max(1e-6, y1 - y0), nl = Math.hypot(1, sl);
    const n = [Math.cos(am) / nl, sl / nl, Math.sin(am) / nl];
    const c = o.shade ? mulc(col, 0.92 + 0.16 * ((k * 7) % seg) / seg) : col;
    if (r1 > 1e-4) B.poly([p0, p1, q1, q0], n, layer, c); else B.poly([p0, p1, q0], n, layer, c);
  }
  if (o.capB && r0 > 0) { const pts = []; for (let k = seg - 1; k >= 0; k--) { const a = rot + (k / seg) * Math.PI * 2; pts.push([x + Math.cos(a) * r0, y0, z + Math.sin(a) * r0]); } B.poly(pts, [0, -1, 0], layer, mulc(col, 0.7)); }
  if (o.capT && r1 > 0) { const pts = []; for (let k = 0; k < seg; k++) { const a = rot + (k / seg) * Math.PI * 2; pts.push([x + Math.cos(a) * r1, y1, z + Math.sin(a) * r1]); } B.poly(pts, [0, 1, 0], layer, mulc(col, 1.08)); }
}
function treeMesh(B, t, far) {
  // 色と向きは木ごとに決まる（近い形と遠い形で同じ）
  const r = mulberry(5000 + (t.cyl ?? Math.round(t.x * 31 + t.z * 17)) * 7);
  const s = t.s, x = t.x, z = t.z, y = t.y, rot = r() * 6.28;
  B.room = 1;
  if (t.kind === 'pine') {
    const c = jitter(PINE[Math.floor(r() * PINE.length)], r, 0.06);
    if (far) { facetCyl(B, x, z, y + 0.9 * s, y + 6.6 * s, 1.75 * s, 0, 5, LAYER.leaves, c, { rot }); return; }
    facetCyl(B, x, z, y - 0.3, y + 1.9 * s, 0.2 * s, 0.13 * s, 5, LAYER.wood, TRUNK, { rot });
    facetCyl(B, x, z, y + 1.2 * s, y + 3.7 * s, 1.85 * s, 0.35 * s, 7, LAYER.leaves, mulc(c, 0.92), { rot, capB: true, shade: true });
    facetCyl(B, x, z, y + 2.8 * s, y + 5.1 * s, 1.45 * s, 0.25 * s, 7, LAYER.leaves, c, { rot: rot + 0.4, capB: true, shade: true });
    facetCyl(B, x, z, y + 4.2 * s, y + 6.8 * s, 1.0 * s, 0, 6, LAYER.leaves, mulc(c, 1.08), { rot: rot + 0.9, capB: true, shade: true });
  } else {
    const c = jitter(OAK[Math.floor(r() * OAK.length)], r, 0.06);
    if (far) { facetCyl(B, x, z, y + 2.0 * s, y + 5.6 * s, 2.1 * s, 1.0 * s, 5, LAYER.leaves, c, { rot, capT: true }); return; }
    facetCyl(B, x, z, y - 0.3, y + 2.7 * s, 0.27 * s, 0.19 * s, 6, LAYER.wood, TRUNK, { rot });
    facetCyl(B, x, z, y + 2.1 * s, y + 3.7 * s, 1.1 * s, 2.3 * s, 7, LAYER.leaves, mulc(c, 0.9), { rot, capB: true, shade: true });
    facetCyl(B, x, z, y + 3.7 * s, y + 5.5 * s, 2.3 * s, 0.9 * s, 7, LAYER.leaves, c, { rot, capT: true, shade: true });
    const ox = Math.cos(rot) * 1.2 * s, oz = Math.sin(rot) * 1.2 * s;
    facetCyl(B, x + ox, z + oz, y + 4.6 * s, y + 6.1 * s, 1.3 * s, 0.5 * s, 6, LAYER.leaves, mulc(c, 1.06), { rot: rot + 0.5, capT: true, shade: true });
  }
}

// 箱（建物の壁・床・屋根・塀・コンテナ・岩）。建物の中の面は日が当たらない（room 0）・暗め（ao）
function boxMesh(B, ww, b, tops, near) {
  const r = mulberry(1000 + b.id * 13);
  const col = jitter(hex(b.col || MATCOL[b.mat] || '#a0a0a0'), r, 0.05);
  const gy = heightAt(ww, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
  const onGround = b.y0 <= gy + 0.05;
  B.room = 1;
  if (b.kind === 'rock') {
    const s = Math.min(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0);
    B.bbox(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, s * 0.28, LAYER.concrete, col, { faces: onGround ? 63 & ~8 : 63, uv: 0.5 });
    return;
  }
  if (b.kind === 'sandbag' && near) { sandbagMesh(B, b, r, col); return; }
  const layer = b.kind === 'container' ? LAYER.metal : (MATLAYER[b.mat] ?? LAYER.concrete);
  const q = b.bld >= 0 ? tops.get(b.bld) : null;
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, cz = (b.z0 + b.z1) / 2, e = 0.15;
  const pts = [[b.x1 + e, cy, cz], [b.x0 - e, cy, cz], [cx, b.y1 + e, cz], [cx, b.y0 - e, cz], [cx, cy, b.z1 + e], [cx, cy, b.z0 - e]];
  for (let f = 0; f < 6; f++) {
    const bit = 1 << f;
    if (bit === 8 && onGround) continue;
    const inside = q && insideBld(q, pts[f][0], pts[f][1], pts[f][2]);
    B.room = inside ? 0 : 1;
    const ao = inside ? (b.mat === M.DRYWALL || b.kind === 'floor' ? 0.62 : 0.52) : 1;
    B.box(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, layer, col, { faces: bit, uv: 0.5, aoTop: ao, aoBottom: inside ? ao * 0.8 : (onGround && f !== 2 ? 0.85 : 1) });
  }
  B.room = 1;
}
// 土のう: 袋を互い違いに積む（近い形だけ。遠くは1つの箱）
function sandbagMesh(B, b, r, col) {
  const alongX = b.x1 - b.x0 >= b.z1 - b.z0, L = alongX ? b.x1 - b.x0 : b.z1 - b.z0, th = alongX ? b.z1 - b.z0 : b.x1 - b.x0;
  const layers = 3, lh = (b.y1 - b.y0) / layers, bl = 0.62;
  B.room = 1;
  for (let k = 0; k < layers; k++) {
    const off = (k % 2) * bl / 2, y0 = b.y0 + k * lh, y1 = y0 + lh, ins = k * 0.04;
    for (let s = -off; s < L - 1e-3; s += bl) {
      const a = Math.max(0, s) + 0.015, e = Math.min(L, s + bl) - 0.015;
      if (e - a < 0.12) continue;
      const c = mulc(col, 0.88 + r() * 0.2), dy = (r() - 0.5) * 0.03;
      if (alongX) B.bbox(b.x0 + a, y0, b.z0 + ins, b.x0 + e, y1 + dy, b.z1 - ins, 0.07, LAYER.fabric, c, { faces: k ? 63 : 63 & ~8 });
      else B.bbox(b.x0 + ins, y0, b.z0 + a, b.x1 - ins, y1 + dy, b.z0 + e, 0.07, LAYER.fabric, c, { faces: k ? 63 : 63 & ~8 });
    }
  }
}
function rampMesh(B, rp, r, tops) {
  const col = jitter(hex(rp.col || '#8d8a84'), r, 0.04);
  const q = rp.bld >= 0 ? tops.get(rp.bld) : null;
  B.room = q ? 0 : 1;
  const ao = q ? 0.6 : 1;
  if (rp.smooth) { smoothRamp(B, rp, col); B.room = 1; return; }
  const len = rp.dir === 'n' || rp.dir === 's' ? rp.z1 - rp.z0 : rp.x1 - rp.x0, n = Math.max(2, Math.round((rp.y1 - rp.y0) / 0.25));
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n, y = rp.y0 + (rp.y1 - rp.y0) * (k + 1) / n;
    let x0 = rp.x0, x1 = rp.x1, z0 = rp.z0, z1 = rp.z1;
    if (rp.dir === 'n') { z1 = rp.z1 - len * t0; z0 = rp.z1 - len * t1; }
    else if (rp.dir === 's') { z0 = rp.z0 + len * t0; z1 = rp.z0 + len * t1; }
    else if (rp.dir === 'e') { x0 = rp.x0 + len * t0; x1 = rp.x0 + len * t1; }
    else { x1 = rp.x1 - len * t0; x0 = rp.x1 - len * t1; }
    B.box(x0, y - 0.25, z0, x1, y, z1, LAYER.concrete, col, { uv: 0.5, aoTop: ao, aoBottom: ao * 0.8 });
  }
  B.room = 1;
}

// なめらかな坂の板（橋）: 上面・下面・両側・両端
function smoothRamp(B, rp, col) {
  const H = (x, z) => { let t; if (rp.dir === 'n') t = (rp.z1 - z) / (rp.z1 - rp.z0); else if (rp.dir === 's') t = (z - rp.z0) / (rp.z1 - rp.z0); else if (rp.dir === 'e') t = (x - rp.x0) / (rp.x1 - rp.x0); else t = (rp.x1 - x) / (rp.x1 - rp.x0); return rp.y0 + (rp.y1 - rp.y0) * Math.max(0, Math.min(1, t)); };
  const c = [[rp.x0, rp.z0], [rp.x1, rp.z0], [rp.x1, rp.z1], [rp.x0, rp.z1]];
  const top = c.map(([x, z]) => [x, H(x, z), z]), bot = c.map(([x, z]) => [x, H(x, z) - rp.th, z]);
  const n = (a, b, d) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]]; let w = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...w) || 1; return w.map(q => q / l); };
  let nt = n(top[0], top[3], top[1]); if (nt[1] < 0) nt = nt.map(q => -q);
  B.poly(top, nt, LAYER.concrete, col);
  B.poly(bot, nt.map(q => -q), LAYER.concrete, mulc(col, 0.7));
  for (let k = 0; k < 4; k++) { const a = k, b = (k + 1) % 4; const mx = (c[a][0] + c[b][0]) / 2 - (rp.x0 + rp.x1) / 2, mz = (c[a][1] + c[b][1]) / 2 - (rp.z0 + rp.z1) / 2, l = Math.hypot(mx, mz) || 1; B.poly([top[a], top[b], bot[b], bot[a]], [mx / l, 0, mz / l], LAYER.concrete, mulc(col, 0.85)); }
}
// 塊の割り当て（箱・坂・木を中心のある塊へ）
function sortIn(ww) {
  if (ww._chunkItems) return ww._chunkItems;
  const NX = Math.ceil(ww.sx / CH), NZ = Math.ceil(ww.sz / CH);
  const it = Array.from({ length: NX * NZ }, () => ({ boxes: [], ramps: [], trees: [] }));
  const ck = (x, z) => Math.min(NZ - 1, Math.max(0, Math.floor(z / CH))) * NX + Math.min(NX - 1, Math.max(0, Math.floor(x / CH)));
  for (const b of ww.boxes) if (b.alive) it[ck((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)].boxes.push(b);
  for (const rp of ww.ramps) it[ck((rp.x0 + rp.x1) / 2, (rp.z0 + rp.z1) / 2)].ramps.push(rp);
  for (const t of ww.trees || []) it[ck(t.x, t.z)].trees.push(t);
  ww._chunkItems = { NX, NZ, it };
  return ww._chunkItems;
}

// 遠い形を全部の塊について作る。戻り値: [{ k, x0,z0,x1,z1,y0,y1, B }]
export function buildWarFar(ww) {
  prepGround(ww);
  const tops = bldTops(ww), { NX, NZ, it } = sortIn(ww), out = [];
  for (let cz = 0; cz < NZ; cz++) for (let cx = 0; cx < NX; cx++) {
    const k = cz * NX + cx, x0 = cx * CH, z0 = cz * CH, x1 = Math.min(ww.sx, x0 + CH), z1 = Math.min(ww.sz, z0 + CH);
    const B = new MeshBuilder();
    terrainMesh(B, ww, x0, z0, x1, z1, 8, 6);
    let y0 = 1e9, y1 = -1e9;
    for (let j = Math.floor(z0 / ww.hs); j <= Math.min(ww.HD - 1, Math.ceil(z1 / ww.hs)); j++) for (let i = Math.floor(x0 / ww.hs); i <= Math.min(ww.HW - 1, Math.ceil(x1 / ww.hs)); i++) { const hv = ww.h[j * ww.HW + i]; if (hv < y0) y0 = hv; if (hv > y1) y1 = hv; }
    for (const b of it[k].boxes) { if (b.kind === 'crate' || b.kind === 'rail') continue; boxMesh(B, ww, b, tops, false); y1 = Math.max(y1, b.y1); y0 = Math.min(y0, b.y0); }
    for (const t of it[k].trees) { treeMesh(B, t, true); y1 = Math.max(y1, t.y + 7 * t.s); }
    out.push({ k, x0, z0, x1, z1, y0: y0 - 7, y1: y1 + 1, B });
  }
  return out;
}
// 近い形（1つの塊）
export function buildWarNear(ww, k) {
  prepGround(ww);
  const tops = bldTops(ww), { NX, it } = sortIn(ww);
  const cx = k % NX, cz = Math.floor(k / NX), x0 = cx * CH, z0 = cz * CH, x1 = Math.min(ww.sx, x0 + CH), z1 = Math.min(ww.sz, z0 + CH);
  const B = new MeshBuilder();
  terrainMesh(B, ww, x0, z0, x1, z1, ww.hs, 1.5);
  roadMesh(B, ww, ww._roadPieces[k] || []);
  for (const b of it[k].boxes) boxMesh(B, ww, b, tops, true);
  const rr = mulberry(8000 + k);
  for (const rp of it[k].ramps) rampMesh(B, rp, rr, tops);
  for (const t of it[k].trees) treeMesh(B, t, false);
  return B;
}
