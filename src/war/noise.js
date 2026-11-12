// 種つきの乱数と、なめらかな値の雑音（地形・森の配置）
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash2(i, j, s) { let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const fade = (t) => t * t * (3 - 2 * t);
export function vnoise(x, z, s = 0) {
  const i = Math.floor(x), j = Math.floor(z), u = fade(x - i), v = fade(z - j);
  const a = hash2(i, j, s), b = hash2(i + 1, j, s), c = hash2(i, j + 1, s), d = hash2(i + 1, j + 1, s);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v; // 0..1
}
// fbm: 波長 wl（m）から、oct 段。-1..1
export function fbm(x, z, wl, oct = 4, s = 0) {
  let amp = 1, f = 1 / wl, sum = 0, norm = 0;
  for (let o = 0; o < oct; o++) { sum += (vnoise(x * f, z * f, s + o * 17) * 2 - 1) * amp; norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}
