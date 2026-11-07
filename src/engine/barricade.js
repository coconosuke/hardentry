// バリケード（シージ式）の状態と壊れ方。枠の形は world.js の w.bars、状態は S.bars[枠] = { h, b, t }
//  h: かけらごとの残り（'0'〜'2' の文字列。空ならバリケードなし）。b: 殴って落とした段（3ビット）。t: 初めの状態から変わったか（通信で送る）
// 弾は当たったかけらを削る（2発で穴が開き、そこから見えて撃てる）。散弾は1発で穴＋となりを傷める。
// 殴る（近接）は当てた高さの段（3分の1）をまとめて落とす＝3回で壊れる。爆発はまわりのかけらを吹き飛ばす。
// 残りが4分の1より少なくなると崩れて、扉・ガラスの壁は通れ、窓は乗り越えられる。
import { NB, barPiece } from './world.js';
import { M } from './data/materials.js';
import { hrand } from './rng.js';

export const BAR_FALL = 0.25;

// 窓は最初からふさぐ（チームデスマッチ以外のすべてのモード）。外から中が見えないように
export function windowsBarred(S) { return S.mode !== 'tdm'; }
const full = (s) => '2'.repeat(s.N);

// 試合の始め（ラウンドの始め）: 状態を作り、窓のガラスを外して板を打つ
export function initBars(S, w) {
  S.bars = w.bars.map(() => ({ h: '', b: 0, t: 0 }));
  if (windowsBarred(S)) for (const s of w.bars) if (s.kind !== 'door') S.bars[s.id].h = full(s);
  barGlass(S, w);
  linkBars(S);
  S.barV = (S.barV || 0) + 1;
}
// 弾・視線の計算から見えるように、扉の状態の配列にぶら下げる（S.doors を作り直したら呼ぶ）
export function linkBars(S) { if (S.doors && S.bars) Object.defineProperty(S.doors, 'bars', { value: S.bars, writable: true, configurable: true, enumerable: false }); }
// 板を打つ窓・ガラスの壁のガラスは最初から外しておく（読み込み・ゲストでも同じにする。差分には入れない）
export function barGlass(S, w) {
  if (!windowsBarred(S)) return;
  for (const s of w.bars) {
    if (s.kind === 'door') continue;
    for (const k of s.cells) { const b = k * NB; for (let q = 0; q < NB; q++) { const m = w.blocks[b + q]; if (m === M.GLASS || m === M.GLASSBROKEN) { w.blocks[b + q] = 0; w.bhp[b + q] = 0; } } }
  }
}
export function barActive(S, si) { const st = S.bars && S.bars[si]; return !!(st && st.h); }
function sync(S, w, si) {
  const s = w.bars[si];
  if (s && s.kind === 'door') { const ds = S.doors[s.did]; if (ds) ds.bar = S.bars[si].h ? 1 : 0; }
}
const mid = (s) => (s.y0 + s.y1) / 2;

// 板を打つ（全部そろった状態）
export function placeBar(S, w, si, ev, by = -1) {
  const s = w.bars[si], st = S.bars[si];
  if (!s || !st) return false;
  st.h = full(s); st.b = 0; st.t = 1; S.barV = (S.barV || 0) + 1;
  sync(S, w, si);
  ev.push({ e: 'barset', s: si, d: s.kind === 'door' ? s.did : -1, id: by, x: s.cx, y: mid(s), z: s.cz });
  return true;
}
// 外す・崩れる。why: 'pry'（防衛側が外した）| 'fall'（壊れて崩れた）
export function clearBar(S, w, si, ev, why = 'fall', by = -1) {
  const s = w.bars[si], st = S.bars[si];
  if (!st || !st.h) return;
  st.h = ''; st.b = 0; st.t = 1; S.barV = (S.barV || 0) + 1;
  sync(S, w, si);
  ev.push({ e: 'barbreak', s: si, d: s.kind === 'door' ? s.did : -1, id: by, pry: why === 'pry' ? 1 : 0, x: s.cx, y: mid(s), z: s.cz });
}
function left(h) { let n = 0; for (let i = 0; i < h.length; i++) if (h.charCodeAt(i) > 48) n++; return n; }
function commit(S, w, si, a, ev, o) {
  const s = w.bars[si], st = S.bars[si];
  st.h = a.join(''); st.t = 1; S.barV = (S.barV || 0) + 1;
  if (left(st.h) < BAR_FALL * s.N || st.b === 7) { clearBar(S, w, si, ev, 'fall', o.by ?? -1); return true; }
  ev.push({ e: 'barhit', s: si, d: s.kind === 'door' ? s.did : -1, x: o.x ?? s.cx, y: o.y ?? mid(s), z: o.z ?? s.cz, big: o.big ? 1 : 0, cut: o.cut ? 1 : 0, by: o.by ?? -1 });
  return false;
}
// 弾が当たった（pc: かけら）。dmg: 1 = 普通の弾、2 = 散弾の粒（となりも1つ傷める）
export function hitBar(S, w, si, pc, dmg, ev, o = {}) {
  const s = w.bars[si], st = S.bars[si];
  if (!s || !st || !st.h || pc < 0 || pc >= s.N) return false;
  const a = st.h.split('').map(Number);
  const was = a[pc] > 0;
  a[pc] = Math.max(0, a[pc] - dmg);
  let cut = was && a[pc] === 0;
  if (dmg >= 2) {
    const c = pc % s.cols, r = (pc - c) / s.cols;
    const nb = [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]].filter(([x, y]) => x >= 0 && y >= 0 && x < s.cols && y < s.rows);
    const [x, y] = nb[Math.floor(hrand(si, S.t, pc) * nb.length)] || [c, r];
    const q = y * s.cols + x;
    if (a[q] > 0) { a[q]--; if (a[q] === 0) cut = true; }
  }
  return commit(S, w, si, a, ev, { ...o, cut });
}
// 殴る（近接・蹴り）: 当てた高さ y の段を落とす。もう落ちた段なら近い残りの段
export function bashBar(S, w, si, y, ev, by = -1) {
  const s = w.bars[si], st = S.bars[si];
  if (!s || !st || !st.h) return false;
  let band = Math.max(0, Math.min(2, Math.floor((y - s.y0) / (s.y1 - s.y0) * 3)));
  if (st.b & (1 << band)) {
    const rest = [0, 1, 2].filter(b => !(st.b & (1 << b))).sort((p, q) => Math.abs(p - band) - Math.abs(q - band));
    if (!rest.length) { clearBar(S, w, si, ev, 'fall', by); return true; }
    band = rest[0];
  }
  st.b |= 1 << band;
  const r0 = Math.floor(band * s.rows / 3), r1 = Math.floor((band + 1) * s.rows / 3);
  const a = st.h.split('').map(Number);
  for (let r = r0; r < r1; r++) for (let c = 0; c < s.cols; c++) a[r * s.cols + c] = 0;
  const yy = s.y0 + (r0 + r1) / 2 / s.rows * (s.y1 - s.y0);
  commit(S, w, si, a, ev, { y: yy, big: 1, cut: 1, by });
  return true;
}
// 爆発（破片・C2・壁の爆破薬・罠）: 半径 R の中のかけらを吹き飛ばす
export function blastBars(S, w, x, y, z, R, ev, by = -1) {
  if (!S.bars) return;
  for (const s of w.bars) {
    const st = S.bars[s.id];
    if (!st || !st.h) continue;
    if (Math.abs(s.cx - x) > R + 2 || Math.abs(s.cz - z) > R + 2 || Math.abs(mid(s) - y) > R + 1.5) continue;
    if (Math.abs((x - s.cx) * s.nx + (z - s.cz) * s.nz) > R) continue;
    const a = st.h.split('').map(Number);
    let n = 0;
    for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) {
      const i = r * s.cols + c;
      if (!a[i]) continue;
      const along = s.a0 + (c + 0.5) * (s.a1 - s.a0) / s.cols, py = s.y0 + (r + 0.5) * (s.y1 - s.y0) / s.rows;
      const px = s.axis === 0 ? along : s.c, pz = s.axis === 0 ? s.c : along;
      if (Math.hypot(px - x, py - y, pz - z) < R) { a[i] = 0; n++; }
    }
    if (n) commit(S, w, s.id, a, ev, { x, y, z, big: 1, cut: 1, by });
  }
}
// 光線が当たった所の高さで、扉のバリケードの枠の番号
export function barOfDoor(w, did) { const d = w.doors[did]; return d ? d.bar : -1; }

// ---- 通信: 変わった枠だけ [枠, h] で送る。ゲストは書いていない枠を初めの状態に戻す
export function packBars(S) {
  const out = [];
  if (!S.bars) return out;
  for (let i = 0; i < S.bars.length; i++) { const st = S.bars[i]; if (st && st.t) out.push([i, st.h]); }
  return out;
}
export function applyBarsNet(S, w, BR) {
  if (!S.bars) initBars(S, w);
  const seen = new Set();
  const changed = [];
  for (const [i, h] of BR) {
    const st = S.bars[i]; if (!st) continue;
    seen.add(i);
    if (st.h !== h) { st.h = h; changed.push(i); }
    st.t = 1;
  }
  for (let i = 0; i < S.bars.length; i++) {
    const st = S.bars[i];
    if (seen.has(i) || !st.t) continue;
    const s = w.bars[i], h0 = windowsBarred(S) && s.kind !== 'door' ? full(s) : '';
    if (st.h !== h0) { st.h = h0; changed.push(i); }
    st.t = 0; st.b = 0;
  }
  for (const i of changed) sync(S, w, i);
  return changed;
}
