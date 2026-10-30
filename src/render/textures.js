// 手続きのテクスチャ（外部の画像なし）。BattleBit のように低い解像度でやわらかい質感。128×128 のテクスチャ配列の各層
export const TEX = 128;
export const LAYER = {
  plain: 0, concrete: 1, brick: 2, plaster: 3, woodfloor: 4, tile: 5, carpet: 6, asphalt: 7, grass: 8, dirt: 9, metal: 10, wood: 11, fabric: 12, ceiling: 13, skin: 14, cloth: 15, plywood: 16, sidewalk: 17, nylon: 18, paint: 19, rubber: 20, leaves: 21, siding: 22,
};
export const NLAYER = 23;

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
// 繰り返しのある値ノイズ
function vnoise(N, cells, seed) {
  const r = rng(seed), g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = x / N * cells, fy = y / N * cells, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[(iy % cells) * cells + ix % cells], b = g[(iy % cells) * cells + (ix + 1) % cells], c = g[((iy + 1) % cells) * cells + ix % cells], d = g[((iy + 1) % cells) * cells + (ix + 1) % cells];
    out[y * N + x] = (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  }
  return out;
}
function fbm(N, seed, oct = 4, base = 4) {
  const out = new Float32Array(N * N);
  let amp = 0.5, tot = 0;
  for (let o = 0; o < oct; o++) { const n = vnoise(N, base << o, seed + o * 101); for (let i = 0; i < out.length; i++) out[i] += n[i] * amp; tot += amp; amp *= 0.5; }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
const cl = (v) => v < 0 ? 0 : v > 255 ? 255 : v;

export function makeTextures() {
  const N = TEX, out = new Uint8Array(N * N * 4 * NLAYER);
  const put = (layer, fn) => {
    const o = layer * N * N * 4;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = fn(x, y, y * N + x); const k = o + (y * N + x) * 4; out[k] = cl(c[0] * 255); out[k + 1] = cl(c[1] * 255); out[k + 2] = cl(c[2] * 255); out[k + 3] = cl((c[3] ?? 1) * 255); }
  };
  const n1 = fbm(N, 11, 4, 4), n2 = fbm(N, 23, 3, 8), n3 = fbm(N, 37, 2, 16), grain = fbm(N, 51, 2, 32);
  const r = rng(99);
  const white = new Float32Array(N * N); for (let i = 0; i < white.length; i++) white[i] = r();
  // 0 無地（ほんのかすかなむら）
  put(LAYER.plain, (x, y, i) => { const v = 0.93 + (n1[i] - 0.5) * 0.06 + (white[i] - 0.5) * 0.02; return [v, v, v]; });
  // 1 コンクリート
  put(LAYER.concrete, (x, y, i) => { const v = 0.8 + (n1[i] - 0.5) * 0.22 + (n3[i] - 0.5) * 0.08 + (white[i] - 0.5) * 0.05 - (white[i] > 0.985 ? 0.15 : 0); return [v, v * 0.99, v * 0.97]; });
  // 2 レンガ（色つき）: 1枚 0.25m × 0.0625m 相当。1テクスチャ = 1m
  put(LAYER.brick, (x, y, i) => {
    const row = Math.floor(y / 8), off = (row % 2) * 16, bx = (x + off) % 32;
    const mortar = (y % 8) < 1 || bx < 1;
    if (mortar) { const v = 0.62 + (n3[i] - 0.5) * 0.1; return [v, v * 0.97, v * 0.92]; }
    const id = (Math.floor((x + off) / 32) + row * 7) % 13;
    const t = 0.82 + (id / 13 - 0.5) * 0.18 + (n2[i] - 0.5) * 0.14 + (white[i] - 0.5) * 0.06;
    return [0.62 * t + 0.08, 0.3 * t + 0.03, 0.22 * t + 0.02];
  });
  // 3 しっくい・石膏（塗装）
  put(LAYER.plaster, (x, y, i) => { const v = 0.92 + (n2[i] - 0.5) * 0.06 + (grain[i] - 0.5) * 0.05; return [v, v, v * 0.99]; });
  // 4 木の床（板）
  put(LAYER.woodfloor, (x, y, i) => {
    const plank = Math.floor(x / 16), seg = Math.floor((y + plank * 37) / 96);
    const edge = (x % 16) < 1 || ((y + plank * 37) % 96) < 1;
    const id = (plank * 5 + seg * 3) % 7;
    const ring = Math.sin((y * 0.35 + n2[i] * 9 + plank * 3)) * 0.5 + 0.5;
    const t = 0.75 + id * 0.035 + ring * 0.08 + (grain[i] - 0.5) * 0.08 - (edge ? 0.28 : 0);
    return [0.62 * t + 0.12, 0.42 * t + 0.06, 0.26 * t + 0.03];
  });
  // 5 タイル（30cm）
  put(LAYER.tile, (x, y, i) => { const g = (x % 32) < 1 || (y % 32) < 1; const id = (Math.floor(x / 32) * 3 + Math.floor(y / 32) * 5) % 4; const v = g ? 0.6 : 0.9 + id * 0.015 + (n3[i] - 0.5) * 0.05; return [v, v, v * 0.98]; });
  // 6 カーペット
  put(LAYER.carpet, (x, y, i) => { const v = 0.8 + (white[i] - 0.5) * 0.18 + (n2[i] - 0.5) * 0.1; return [v, v, v]; });
  // 7 アスファルト
  put(LAYER.asphalt, (x, y, i) => { const v = 0.28 + (white[i] - 0.5) * 0.12 + (n1[i] - 0.5) * 0.1 + (white[i] > 0.97 ? 0.12 : 0); return [v, v, v * 1.02]; });
  // 8 草
  put(LAYER.grass, (x, y, i) => { const t = n1[i] * 0.5 + n3[i] * 0.3 + white[i] * 0.2; return [0.26 + t * 0.14, 0.38 + t * 0.2, 0.16 + t * 0.06]; });
  // 9 土
  put(LAYER.dirt, (x, y, i) => { const t = n1[i] * 0.6 + white[i] * 0.4; return [0.4 + t * 0.15, 0.33 + t * 0.12, 0.24 + t * 0.08]; });
  // 10 金属（細い筋）
  put(LAYER.metal, (x, y, i) => { const v = 0.78 + (vnoiseLine(x, y) - 0.5) * 0.08 + (n2[i] - 0.5) * 0.08; return [v, v, v * 1.02]; });
  // 11 木（家具の木目）
  put(LAYER.wood, (x, y, i) => { const ring = Math.sin(x * 0.25 + n2[i] * 12) * 0.5 + 0.5; const t = 0.8 + ring * 0.12 + (grain[i] - 0.5) * 0.1; return [0.68 * t, 0.5 * t, 0.34 * t]; });
  // 12 布
  put(LAYER.fabric, (x, y, i) => { const weave = ((x + y) % 4 < 2 ? 0.03 : -0.03); const v = 0.86 + weave + (n2[i] - 0.5) * 0.1; return [v, v, v]; });
  // 13 天井板（60cmの格子）
  put(LAYER.ceiling, (x, y, i) => { const g = (x % 64) < 2 || (y % 64) < 2; const v = g ? 0.7 : 0.94 + (white[i] - 0.5) * 0.06 - (white[i] > 0.9 ? 0.05 : 0); return [v, v, v * 0.98]; });
  // 14 肌（わずかなむら）
  put(LAYER.skin, (x, y, i) => { const v = 0.95 + (n2[i] - 0.5) * 0.06; return [v, v * 0.98, v * 0.97]; });
  // 15 制服の生地
  put(LAYER.cloth, (x, y, i) => { const v = 0.9 + ((x ^ y) & 2 ? 0.02 : -0.02) + (n3[i] - 0.5) * 0.08; return [v, v, v]; });
  // 16 ベニヤ（キルハウス）
  put(LAYER.plywood, (x, y, i) => { const g = (x % 64) < 1; const t = 0.82 + (Math.sin(y * 0.15 + n1[i] * 10) * 0.5 + 0.5) * 0.1 + (grain[i] - 0.5) * 0.08 - (g ? 0.2 : 0); return [0.78 * t, 0.62 * t, 0.42 * t]; });
  // 17 歩道（1mの目地）
  put(LAYER.sidewalk, (x, y, i) => { const g = (x % 128) < 2 || (y % 64) < 2; const v = (g ? 0.55 : 0.72) + (n1[i] - 0.5) * 0.12 + (white[i] - 0.5) * 0.05; return [v, v, v * 0.97]; });
  // 18 ナイロン（装備）
  put(LAYER.nylon, (x, y, i) => { const v = 0.88 + ((y % 6) < 3 ? 0.04 : -0.04) + (white[i] - 0.5) * 0.06; return [v, v, v]; });
  // 19 塗装（車・銃）
  put(LAYER.paint, (x, y, i) => { const v = 0.95 + (n3[i] - 0.5) * 0.04; return [v, v, v]; });
  // 20 ゴム・樹脂
  put(LAYER.rubber, (x, y, i) => { const v = 0.9 + (white[i] - 0.5) * 0.12; return [v, v, v]; });
  // 21 葉（木）
  put(LAYER.leaves, (x, y, i) => { const t = n2[i] * 0.6 + white[i] * 0.4; return [0.2 + t * 0.12, 0.32 + t * 0.2, 0.12 + t * 0.05]; });
  // 22 下見板（住宅の外壁）: 1枚16cm。下の縁が張り出して明るく、その下に影の線
  put(LAYER.siding, (x, y, i) => {
    const bh = 128 / 6.25, yy = y % bh, f = yy / bh;
    let v = 0.86 + f * 0.08 + (grain[i] - 0.5) * 0.05 + (n2[i] - 0.5) * 0.04;
    if (f > 0.9) v += 0.06; if (f < 0.08) v -= 0.3;
    return [v, v, v];
  });
  // 色は頂点の色で決めるので、テクスチャは明るさの細かさだけ（平均0.85にそろえる）
  for (let L = 0; L < NLAYER; L++) {
    const o = L * N * N * 4;
    let sum = 0;
    const lum = new Float32Array(N * N);
    for (let q = 0; q < N * N; q++) { const k = o + q * 4; lum[q] = (0.2126 * out[k] + 0.7152 * out[k + 1] + 0.0722 * out[k + 2]) / 255; sum += lum[q]; }
    const mean = sum / (N * N) || 1;
    const target = L === LAYER.plain ? 0.92 : 0.85;
    for (let q = 0; q < N * N; q++) { const v = Math.min(1, lum[q] / mean * target); const k = o + q * 4; out[k] = out[k + 1] = out[k + 2] = Math.round(v * 255); }
  }
  return out;
}
function vnoiseLine(x, y) { return (Math.sin(y * 1.7 + Math.sin(x * 0.05) * 3) * 0.5 + 0.5); }
