// 経路: 0.5mのマスの格子で A*。扉・階段・家具をふまえる。滑らかにする（見通しで角を落とす）。
import { CS, LH, C, isWallish, groundAt } from '../world.js';
import { M } from '../data/materials.js';

// 歩けるマスの印: 0 歩けない、1 床、2 扉、3 階段（その階の坂）、4 開口
export function buildNav(w) {
  if (w._nav) return w._nav;
  const N = w.NL * w.W * w.D;
  const walk = new Uint8Array(N);
  for (let L = 0; L < w.NL; L++) for (let j = 0; j < w.D; j++) for (let i = 0; i < w.W; i++) {
    const k = w.idx(L, i, j), t = w.cell[k];
    if (t === C.FLOOR || t === C.OUT) walk[k] = 1;
    else if (t === C.DOOR) walk[k] = 2;
    else if (t === C.OPEN) walk[k] = 4;
    else if (t === C.STAIR) {
      const s = w.stairAt[k];
      if (s >= 0 && w.stairs[s].L === L) walk[k] = 3; // 坂の部分（上の階の同じマスは吹き抜け）
    }
  }
  // 家具（低い物も人は越えない: AIは回り込む）
  for (const p of w.props) {
    if (!p.solid) continue;
    for (const b of p.boxes) {
      if (b[4] - b[1] < 0.05 || b[4] - p.y < 0.3) continue;
      const i0 = Math.floor((b[0] + 0.12) / CS), i1 = Math.floor((b[3] - 0.12) / CS), j0 = Math.floor((b[2] + 0.12) / CS), j1 = Math.floor((b[5] - 0.12) / CS);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (i >= 0 && j >= 0 && i < w.W && j < w.D) walk[w.idx(p.L, i, j)] = 0;
    }
  }
  // 壁ぎわ（壁のマスの隣）はそのまま歩ける（板はマスの中央）
  // 階段のつながり: 坂の上の端 → 上の階の床
  const links = new Map(); // k -> [k2...]
  const addLink = (a, b) => { let x = links.get(a); if (!x) links.set(a, x = []); if (!x.includes(b)) x.push(b); };
  for (const s of w.stairs) {
    if (s.L + 1 >= w.NL) continue;
    const di = s.dir === 'e' ? 1 : s.dir === 'w' ? -1 : 0, dj = s.dir === 's' ? 1 : s.dir === 'n' ? -1 : 0;
    // 上の端の列のマスと、その先の上の階のマス
    for (let jj = 0; jj < s.jw; jj++) for (let ii = 0; ii < s.iw; ii++) {
      const i = s.i0 + ii, j = s.j0 + jj;
      const atTop = (di > 0 && ii === s.iw - 1) || (di < 0 && ii === 0) || (dj > 0 && jj === s.jw - 1) || (dj < 0 && jj === 0);
      if (!atTop) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= w.W || nj >= w.D) continue;
      const a = w.idx(s.L, i, j), b = w.idx(s.L + 1, ni, nj);
      if (!walk[b]) continue;
      addLink(a, b); addLink(b, a);
    }
    // 坂の下の端は同じ階の床とふつうにつながる
  }
  const nav = { walk, links, W: w.W, D: w.D, NL: w.NL };
  // 経路の計算用の作業領域
  nav.g = new Float32Array(N); nav.from = new Int32Array(N); nav.stamp = new Uint32Array(N); nav.closed = new Uint32Array(N); nav.cur = 0;
  nav.heap = new Int32Array(N + 1); nav.hf = new Float32Array(N + 1);
  w._nav = nav;
  return nav;
}

// 位置 → マスの番号（その階）
export function navCell(w, x, y, z) {
  const i = Math.floor(x / CS), j = Math.floor(z / CS);
  if (i < 0 || j < 0 || i >= w.W || j >= w.D) return -1;
  let L = Math.max(0, Math.min(w.NL - 1, Math.floor((y + 0.4) / LH)));
  let k = w.idx(L, i, j);
  // 階段の上（上の階の吹き抜け）にいるときは下の階の坂
  if (w.cell[k] === C.STAIR && w.stairAt[k] >= 0 && w.stairs[w.stairAt[k]].L === L - 1) k = w.idx(L - 1, i, j);
  return k;
}
export function cellCenter(w, k) {
  const L = Math.floor(k / (w.W * w.D)), r = k - L * w.W * w.D, j = Math.floor(r / w.W), i = r - j * w.W;
  const x = (i + 0.5) * CS, z = (j + 0.5) * CS;
  const y = groundAt(w, x, z, L * LH + LH * 0.95);
  return [x, y < -50 ? L * LH : y, z, L];
}

// 扉の状態で通れるか（鍵・ウェッジ・バリケード）。canOpen: 鍵を開けられる（容疑者は内側から）
function doorPass(w, S, k, opt) {
  const did = w.doorAt[k];
  if (did < 0 || !S) return true;
  const ds = S.doors[did];
  if (!ds || ds.broken) return true;
  if (ds.bar > 0 && !opt.breakBar) return false;
  const open = ds.ang.some(a => Math.abs(a) > 0.6);
  if (open) return true;
  if (ds.wedge && !opt.wedgeOK) return false;
  if (ds.locked && !ds.lockBroken && !opt.unlock) return false;
  return true;
}

function heapPush(nav, k, f) {
  let n = ++nav.hn; const H = nav.heap, F = nav.hf;
  while (n > 1) { const p = n >> 1; if (F[p] <= f) break; H[n] = H[p]; F[n] = F[p]; n = p; }
  H[n] = k; F[n] = f;
}
function heapPop(nav) {
  const H = nav.heap, F = nav.hf;
  const top = H[1]; const lk = H[nav.hn], lf = F[nav.hn]; nav.hn--;
  let n = 1;
  while (true) { let c = n * 2; if (c > nav.hn) break; if (c + 1 <= nav.hn && F[c + 1] < F[c]) c++; if (F[c] >= lf) break; H[n] = H[c]; F[n] = F[c]; n = c; }
  H[n] = lk; F[n] = lf;
  return top;
}

// A*。戻り値: マスの番号の列（スタートを含まない）か null。opt: { maxNodes, avoid: Set(k), unlock, breakBar, wedgeOK, costFn }
export function findPath(w, S, from, to, opt = {}) {
  const nav = buildNav(w);
  if (from < 0 || to < 0) return null;
  if (!nav.walk[to]) { to = nearestWalk(w, to); if (to < 0) return null; }
  if (!nav.walk[from]) { const f2 = nearestWalk(w, from); if (f2 < 0) return null; from = f2; }
  if (from === to) return [];
  nav.cur++; if (nav.cur > 4e9) { nav.cur = 1; nav.stamp.fill(0); nav.closed.fill(0); }
  const cur = nav.cur;
  const W = w.W, D = w.D, WD = W * D;
  const tL = Math.floor(to / WD), tr = to - tL * WD, tj = Math.floor(tr / W), ti = tr - tj * W;
  const h = (k) => { const L = Math.floor(k / WD), r = k - L * WD, j = Math.floor(r / W), i = r - j * W; const dx = Math.abs(i - ti), dz = Math.abs(j - tj); return (Math.max(dx, dz) + 0.414 * Math.min(dx, dz)) + Math.abs(L - tL) * 8; };
  nav.hn = 0;
  nav.g[from] = 0; nav.stamp[from] = cur; nav.from[from] = -1;
  heapPush(nav, from, h(from));
  let n = 0;
  const maxN = opt.maxNodes || 12000;
  const avoid = opt.avoid || null;
  while (nav.hn > 0) {
    const k = heapPop(nav);
    if (nav.closed[k] === cur) continue;
    nav.closed[k] = cur;
    if (k === to) break;
    if (++n > maxN) return null;
    const L = Math.floor(k / WD), r = k - L * WD, j = Math.floor(r / W), i = r - j * W;
    const gk = nav.g[k];
    for (let d = 0; d < 8; d++) {
      const di = d < 4 ? [1, -1, 0, 0][d] : [1, 1, -1, -1][d - 4], dj = d < 4 ? [0, 0, 1, -1][d] : [1, -1, 1, -1][d - 4];
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= D) continue;
      const k2 = L * WD + nj * W + ni;
      const wk = nav.walk[k2];
      if (!wk) continue;
      if (d >= 4) {
        // 斜めは両側が歩けるときだけ（扉の中は斜めに入らない）
        if (!nav.walk[L * WD + j * W + ni] || !nav.walk[L * WD + nj * W + i]) continue;
        if (wk === 2 || nav.walk[k] === 2) continue;
      }
      if (wk === 2 && !doorPass(w, S, k2, opt)) continue;
      let c = d < 4 ? 1 : 1.414;
      if (wk === 2) c += 1.5;
      if (avoid && avoid.has(k2)) c += 6;
      if (opt.costFn) c += opt.costFn(k2);
      const g2 = gk + c;
      if (nav.stamp[k2] === cur && g2 >= nav.g[k2]) continue;
      nav.stamp[k2] = cur; nav.g[k2] = g2; nav.from[k2] = k;
      heapPush(nav, k2, g2 + h(k2));
    }
    const lk = nav.links.get(k);
    if (lk) for (const k2 of lk) {
      const g2 = gk + 2;
      if (nav.stamp[k2] === cur && g2 >= nav.g[k2]) continue;
      nav.stamp[k2] = cur; nav.g[k2] = g2; nav.from[k2] = k;
      heapPush(nav, k2, g2 + h(k2));
    }
  }
  if (nav.closed[to] !== cur) return null;
  const out = [];
  for (let k = to; k !== from && k >= 0; k = nav.from[k]) out.push(k);
  out.reverse();
  return out;
}

export function nearestWalk(w, k, maxR = 6) {
  const nav = buildNav(w);
  const WD = w.W * w.D, L = Math.floor(k / WD), r = k - L * WD, j = Math.floor(r / w.W), i = r - j * w.W;
  for (let R = 0; R <= maxR; R++) for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== R) continue;
    const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= w.W || jj >= w.D) continue;
    const k2 = L * WD + jj * w.W + ii;
    if (nav.walk[k2] === 1 || nav.walk[k2] === 3) return k2;
  }
  return -1;
}

// 直線で歩けるか（マスの列を調べる）。扉のマスは真っすぐ通るときだけ
export function walkableLine(w, k0, k1) {
  const nav = buildNav(w);
  const WD = w.W * w.D;
  const L0 = Math.floor(k0 / WD), L1 = Math.floor(k1 / WD);
  if (L0 !== L1) return false;
  const r0 = k0 - L0 * WD, r1 = k1 - L1 * WD;
  let i0 = r0 % w.W, j0 = Math.floor(r0 / w.W); const i1 = r1 % w.W, j1 = Math.floor(r1 / w.W);
  // 太さを持たせる: 中心線と、その左右0.2マス
  const dx = i1 - i0, dz = j1 - j0, len = Math.hypot(dx, dz);
  if (len < 1e-6) return true;
  const nx = -dz / len * 0.45, nz = dx / len * 0.45;
  for (const off of [0, 1, -1]) {
    const sx = i0 + 0.5 + nx * off, sz = j0 + 0.5 + nz * off;
    const steps = Math.ceil(len * 2.5);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const ci = Math.floor(sx + dx * t), cj = Math.floor(sz + dz * t);
      if (ci < 0 || cj < 0 || ci >= w.W || cj >= w.D) return false;
      const k = L0 * WD + cj * w.W + ci;
      const wk = nav.walk[k];
      if (!wk) return false;
      if ((wk === 2 || wk === 4) && off !== 0) return false;
      if (wk === 3) return false; // 階段は折れ線のまま
    }
  }
  return true;
}

// 経路を滑らかに: 見通せる所は飛ばす
export function smoothPath(w, start, path) {
  if (!path || path.length < 3) return path;
  const out = [];
  let anchor = start, idx = 0;
  while (idx < path.length) {
    let far = idx;
    for (let k = Math.min(path.length - 1, idx + 12); k > idx; k--) { if (walkableLine(w, anchor, path[k])) { far = k; break; } }
    out.push(path[far]);
    anchor = path[far];
    idx = far + 1;
  }
  return out;
}

// 部屋ごとの代表のマスと、部屋どうしのつながり（扉・開口）
export function roomGraph(w) {
  if (w._rg) return w._rg;
  const adj = w.rooms.map(() => []);
  const portals = [];
  for (let L = 0; L < w.NL; L++) for (let j = 0; j < w.D; j++) for (let i = 0; i < w.W; i++) {
    const k = w.idx(L, i, j), t = w.cell[k];
    if (!isWallish(t)) continue;
    const pairs = [];
    const rA = (ii, jj) => (ii < 0 || jj < 0 || ii >= w.W || jj >= w.D) ? -1 : w.roomAt[w.idx(L, ii, jj)];
    pairs.push([rA(i - 1, j), rA(i + 1, j), 'x'], [rA(i, j - 1), rA(i, j + 1), 'z']);
    for (const [a, b, ax] of pairs) {
      if (a < 0 || b < 0 || a === b) continue;
      const type = t === C.DOOR ? 'door' : t === C.OPEN ? 'open' : t === C.WINDOW || t === C.GLASSWALL ? 'window' : t === C.LOW || t === C.FENCE ? 'low' : 'wall';
      portals.push({ k, a, b, type, door: w.doorAt[k], x: (i + 0.5) * CS, z: (j + 0.5) * CS, L, ax });
    }
  }
  // 階段: 下の階の部屋と上の階の部屋
  for (const s of w.stairs) {
    if (s.L + 1 >= w.NL) continue;
    const k0 = w.idx(s.L, s.i0, s.j0);
    const a = w.roomAt[k0];
    let b = -1;
    const di = s.dir === 'e' ? 1 : s.dir === 'w' ? -1 : 0, dj = s.dir === 's' ? 1 : s.dir === 'n' ? -1 : 0;
    const ti = s.dir === 'e' ? s.i0 + s.iw : s.dir === 'w' ? s.i0 - 1 : s.i0, tj = s.dir === 's' ? s.j0 + s.jw : s.dir === 'n' ? s.j0 - 1 : s.j0;
    if (ti >= 0 && tj >= 0 && ti < w.W && tj < w.D) b = w.roomAt[w.idx(s.L + 1, ti, tj)];
    if (b < 0) { for (let jj = 0; jj < s.jw && b < 0; jj++) for (let ii = 0; ii < s.iw && b < 0; ii++) { const r = w.roomAt[w.idx(s.L + 1, s.i0 + ii, s.j0 + jj)]; if (r >= 0) b = r; } }
    if (a >= 0 && b >= 0 && a !== b) portals.push({ k: k0, a, b, type: 'stair', door: -1, x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2, L: s.L });
  }
  for (const p of portals) { adj[p.a].push(p); adj[p.b].push(p); }
  w._rg = { adj, portals };
  return w._rg;
}
