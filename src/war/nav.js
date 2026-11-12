// 大規模戦のボットの道: 2m の格子（外だけ。建物の中は後で）。急な坂・箱（壁・塀・土のう・岩・コンテナ）・木・建物の敷地・範囲の外は通れない。
// 壁ぎわは少し高くつく（ボットが壁をこすらない）。A*（8方向・二分ヒープ・展開の上限つき）と、見通しで角を落とす短縮。
import { heightAt, STEP } from './world.js';

export const NS = 2;
const SQ2 = Math.SQRT2;

export function buildWarNav(ww, rect) {
  const key = rect ? rect.join(',') : 'all';
  if (ww._nav && ww._nav.key === key) return ww._nav;
  const W = Math.ceil(ww.sx / NS), D = Math.ceil(ww.sz / NS), N = W * D;
  const block = new Uint8Array(N);
  // 範囲の外（20m のゆとり）
  if (rect) for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) { const x = (i + 0.5) * NS, z = (j + 0.5) * NS; if (x < rect[0] - 20 || x > rect[2] + 20 || z < rect[1] - 20 || z > rect[3] + 20) block[j * W + i] = 1; }
  // 急な坂（マスの四隅の高さの差）
  for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i; if (block[k]) continue;
    const x0 = i * NS, z0 = j * NS;
    const a = heightAt(ww, x0, z0), b = heightAt(ww, x0 + NS, z0), c = heightAt(ww, x0, z0 + NS), d = heightAt(ww, x0 + NS, z0 + NS);
    if (Math.max(a, b, c, d) - Math.min(a, b, c, d) > NS * 1.1) block[k] = 1;
  }
  const mark = (x0, z0, x1, z1, pad = 0.35) => {
    const i0 = Math.max(0, Math.floor((x0 - pad) / NS)), i1 = Math.min(W - 1, Math.floor((x1 + pad) / NS));
    const j0 = Math.max(0, Math.floor((z0 - pad) / NS)), j1 = Math.min(D - 1, Math.floor((z1 + pad) / NS));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) block[j * W + i] = 1;
  };
  // 建物の敷地（中へは入らない。扉の前までは来る）
  for (const bd of ww.blds || []) mark(bd.rect[0], bd.rect[1], bd.rect[2], bd.rect[3], 0.2);
  // 箱: 地面から STEP より高い物（坂の上の欄干・塀・土のう・岩・コンテナ）。橋の板（坂）は歩ける
  for (const b of ww.boxes) {
    if (!b.alive) continue;
    const g = heightAt(ww, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    if (b.y0 > g + 2.2) continue; // 頭より上（橋の下・屋根）
    if (b.y1 - Math.max(g, b.y0) <= STEP) continue;
    mark(b.x0, b.z0, b.x1, b.z1);
  }
  // 木（幹）
  for (const c of ww.cyls) if (c.alive) mark(c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r, 0.25);
  // 橋（坂の板）の上は歩ける: 欄干だけが上で止める。坂の下の川床は通れるまま
  for (const r of ww.ramps) if (r.kind === 'bridge') {
    const i0 = Math.floor(r.x0 / NS), i1 = Math.floor(r.x1 / NS), j0 = Math.floor(r.z0 / NS) + 1, j1 = Math.floor(r.z1 / NS) - 1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (i >= 0 && j >= 0 && i < W && j < D) block[j * W + i] = 0;
  }
  // 壁ぎわの重み（ふさがったマスからの距離が 1〜2 マス）
  const cost = new Float32Array(N).fill(1);
  for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i; if (block[k]) continue;
    let near = 9;
    for (let dj = -2; dj <= 2 && near > 1; dj++) for (let di = -2; di <= 2; di++) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= D) continue;
      if (block[jj * W + ii]) near = Math.min(near, Math.max(Math.abs(di), Math.abs(dj)));
    }
    if (near === 1) cost[k] = 2.2; else if (near === 2) cost[k] = 1.4;
  }
  const nav = { key, W, D, block, cost, g: new Float32Array(N), from: new Int32Array(N), seen: new Uint32Array(N), closed: new Uint32Array(N), gen: 1, heap: new Int32Array(N), hf: new Float32Array(N) };
  ww._nav = nav;
  return nav;
}
export const navCellOf = (nav, x, z) => { const i = Math.floor(x / NS), j = Math.floor(z / NS); return i < 0 || j < 0 || i >= nav.W || j >= nav.D ? -1 : j * nav.W + i; };
export const navCenter = (nav, k) => [(k % nav.W + 0.5) * NS, (Math.floor(k / nav.W) + 0.5) * NS];
// いちばん近い通れるマス（r マスまで）
export function nearestOpen(nav, x, z, r = 6) {
  const ci = Math.floor(x / NS), cj = Math.floor(z / NS);
  for (let s = 0; s <= r; s++) for (let dj = -s; dj <= s; dj++) for (let di = -s; di <= s; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== s) continue;
    const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= nav.W || j >= nav.D) continue;
    const k = j * nav.W + i; if (!nav.block[k]) return k;
  }
  return -1;
}

// A*。戻り値: 点の列 [[x,z], ...]（短縮ずみ）。届かなければ一番近づける所まで。max: 展開の上限
export function findWarPath(nav, sx, sz, tx, tz, max = 24000) {
  let s = navCellOf(nav, sx, sz), t = navCellOf(nav, tx, tz);
  if (s < 0 || nav.block[s]) s = nearestOpen(nav, sx, sz, 4);
  if (t < 0 || nav.block[t]) t = nearestOpen(nav, tx, tz, 8);
  if (s < 0 || t < 0) return null;
  if (s === t) return [[tx, tz]];
  const { W, D, block, cost, g, from, seen, closed, heap, hf } = nav;
  const gen = ++nav.gen;
  const ti = t % W, tj = Math.floor(t / W);
  const hOf = (k) => { const dx = Math.abs(k % W - ti), dz = Math.abs(Math.floor(k / W) - tj); return (dx + dz + (SQ2 - 2) * Math.min(dx, dz)) * 1.05; };
  let n = 0;
  const push = (k, f) => { let i = n++; while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; heap[i] = heap[p]; hf[i] = hf[p]; i = p; } heap[i] = k; hf[i] = f; };
  const pop = () => { const top = heap[0]; const k = heap[--n], f = hf[n]; let i = 0; while (true) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && hf[c + 1] < hf[c]) c++; if (hf[c] >= f) break; heap[i] = heap[c]; hf[i] = hf[c]; i = c; } heap[i] = k; hf[i] = f; return top; };
  seen[s] = gen; g[s] = 0; from[s] = -1; push(s, hOf(s));
  let best = s, bestH = hOf(s), exp = 0;
  while (n > 0 && exp < max) {
    const k = pop();
    if (closed[k] === gen) continue;
    closed[k] = gen; exp++;
    if (k === t) { best = t; break; }
    const hk = hOf(k); if (hk < bestH) { bestH = hk; best = k; }
    const i = k % W, j = (k - i) / W;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= D) continue;
      const q = jj * W + ii; if (block[q] || closed[q] === gen) continue;
      if (di && dj && (block[j * W + ii] || block[jj * W + i])) continue; // 角を切らない
      const ng = g[k] + (di && dj ? SQ2 : 1) * cost[q];
      if (seen[q] === gen && ng >= g[q]) continue;
      seen[q] = gen; g[q] = ng; from[q] = k; push(q, ng + hOf(q));
    }
  }
  // 道をたどる
  const cells = [];
  for (let k = best; k >= 0 && cells.length < 5000; k = from[k]) cells.push(k);
  cells.reverse();
  // 短縮: 見通せる（間のマスが通れる）間は飛ばす
  const pts = [];
  let a = 0;
  while (a < cells.length - 1) {
    let b = Math.min(cells.length - 1, a + 40);
    while (b > a + 1 && !lineOpen(nav, cells[a], cells[b])) b--;
    pts.push(navCenter(nav, cells[b]));
    a = b;
  }
  if (best === t) pts.push([tx, tz]);
  return pts.length ? pts : [navCenter(nav, best)];
}
// 2つのマスの間がまっすぐ通れるか（太さ1マス）
export function lineOpen(nav, a, b) {
  const W = nav.W;
  let x0 = a % W, y0 = Math.floor(a / W); const x1 = b % W, y1 = Math.floor(b / W);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, guard = 0;
  while (guard++ < 400) {
    if (nav.block[y0 * W + x0] || nav.cost[y0 * W + x0] > 2) return false;
    if (x0 === x1 && y0 === y1) return true;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return false;
}
