// シード付き乱数（mulberry32）。状態は {s: uint32} のデータだけ。
export function rngNew(seed) {
  return { s: (hashSeed(seed) >>> 0) };
}

export function hashSeed(v) {
  const str = String(v);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // 混ぜる
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function rnd(r) {
  let t = (r.s = (r.s + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rndInt(r, n) { return Math.floor(rnd(r) * n); }
export function rndRange(r, a, b) { return a + (b - a) * rnd(r); }
export function rndPick(r, arr) { return arr[Math.floor(rnd(r) * arr.length)]; }
export function rndChance(r, p) { return rnd(r) < p; }
export function rndShuffle(r, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(r) * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
// 正規分布っぽい値（-1..1付近、三角分布）
export function rndTri(r) { return rnd(r) - rnd(r); }
// 決まった乱数（引数から毎回同じ値）: ホストとゲストで同じ反動・散らばりになる
export function hrand(a, b, c = 0) {
  let h = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul(b | 0, 0x85EBCA77) ^ Math.imul(c | 0, 0xC2B2AE3D)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
