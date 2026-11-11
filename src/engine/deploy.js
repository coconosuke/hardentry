// 置く物（対戦の守る側。シージの Deployable Shield と Barbed Wire）。状態は S.deps = [{ id, k, x, y, z, yaw, L, team, by, hp }]
//  置ける盾（shield）: 幅1m・高さ1mの鋼の板。弾は止まり、のぞき窓からは見えて撃てる。乗り越えられる。爆発で壊れる。守る側は拾い直せる。
//  有刺鉄線（wire）: 幅1.6m・奥行き0.9mの鉄条網。上を通る人は遅くなり（誰でも）、ガシャガシャと音が出る。近接2回か爆発で壊れる。
// 形と当たりは world.js（DSHIELD・pushOut・raycast・occluded）。ここは置く・壊す・遅くする・送る。
import { pushOut, groundAt, standAt, levelOfY, LH, CS, STEP, DSHIELD, depAxis, inMap, rayBox } from './world.js';
import { hrand } from './rng.js';

export const DEP = {
  shield: { dist: 0.78, hp: 1 },
  wire: { hw: 0.8, hd: 0.45, h: 0.45, dist: 1.05, hp: 2, slow: 0.45, noise: 0.42 },
};
const _po = [0, 0, 0, 0];
function free(S, w, x, z, y0, y1, r) { pushOut(w, x, z, y0, y1, r, S.doors, -1, _po, 0); return !_po[2]; }

// S.doors に「置いた物」の一覧をぶら下げる（当たり・弾・視線の計算から見えるように）。linkBars から呼ぶ
export function linkDeps(S) {
  if (!S.doors) return;
  if (!S.deps) S.deps = [];
  Object.defineProperty(S.doors, 'deps', { value: S.deps, writable: true, configurable: true, enumerable: false });
}

// 置く場所（前を向いて置く）。置けなければ null と理由（DEP_WHY）
export let DEP_WHY = '';
export function depSpot(S, w, a, k) {
  DEP_WHY = 'space';
  if (!a.ground || a.air || a.vault) { DEP_WHY = 'air'; return null; }
  const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), ux = -fz, uz = fx;
  const D = k === 'wire' ? DEP.wire.dist : DEP.shield.dist;
  const x = a.x + fx * D, z = a.z + fz * D, y = a.y;
  // 床（家具・階段の上は不可）
  const g = groundAt(w, x, z, y + 0.3);
  if (Math.abs(g - y) > 0.06 || Math.abs(standAt(w, x, z, y + 0.3) - g) > 0.01 || Math.abs(groundAt(w, a.x, a.z, y + 0.3) - y) > 0.06) { DEP_WHY = 'floor'; return null; }
  const L = levelOfY(y + 0.2);
  const i = Math.floor(x / CS), j = Math.floor(z / CS);
  if (!inMap(w, i, j) || w.stairAt[w.idx(L, i, j)] >= 0) { DEP_WHY = 'floor'; return null; }
  if (k === 'shield') {
    // 板の線の上（5点）が壁・家具・扉・ほかの盾に当たらない
    for (let s = -2; s <= 2; s++) {
      const px = x + ux * DSHIELD.hw * s / 2 * 0.92, pz = z + uz * DSHIELD.hw * s / 2 * 0.92;
      if (!free(S, w, px, pz, y + 0.08, y + DSHIELD.h, 0.07)) return null;
      if (Math.abs(groundAt(w, px, pz, y + 0.3) - y) > 0.06) { DEP_WHY = 'floor'; return null; }
    }
  } else {
    // 四すみと真ん中が床で、腰より下に壁・家具がない（すみは少し内側）
    const W = DEP.wire;
    for (const [sa, sb] of [[0, 0], [-0.85, -0.8], [0.85, -0.8], [-0.85, 0.8], [0.85, 0.8]]) {
      const px = x + ux * W.hw * sa + fx * W.hd * sb, pz = z + uz * W.hw * sa + fz * W.hd * sb;
      if (!free(S, w, px, pz, y + 0.06, y + W.h, 0.06)) return null;
      if (Math.abs(groundAt(w, px, pz, y + 0.3) - y) > 0.06) { DEP_WHY = 'floor'; return null; }
    }
    // 同じ所に有刺鉄線が重ならない
    for (const d of S.deps || []) if (d.k === 'wire' && d.hp > 0 && Math.abs(d.y - y) < 0.5 && Math.hypot(d.x - x, d.z - z) < 1.0) return null;
  }
  // 人が立っている所には置かない
  for (const b of S.actors) {
    if (b === a || !b.alive || b.isDrone || Math.abs(b.y - y) > 1.2) continue;
    const dx = b.x - x, dz = b.z - z, along = dx * ux + dz * uz, across = dx * fx + dz * fz;
    const hw = k === 'wire' ? DEP.wire.hw : DSHIELD.hw, hd = k === 'wire' ? DEP.wire.hd : 0.05;
    if (Math.abs(along) < hw + 0.25 && Math.abs(across) < hd + 0.25) { DEP_WHY = 'person'; return null; }
  }
  DEP_WHY = '';
  return { x, y, z, yaw: a.yaw, L };
}

export function placeDep(S, w, a, k, sp, ev) {
  if (!S.deps) linkDeps(S);
  const d = { id: (S.nextDep = (S.nextDep || 0) + 1), k, x: sp.x, y: sp.y, z: sp.z, yaw: sp.yaw, L: sp.L, team: a.team, by: a.id, hp: DEP[k].hp };
  S.deps.push(d);
  S.depV = (S.depV || 0) + 1;
  ev.push({ e: 'depset', d: d.id, k, id: a.id, x: d.x, y: d.y, z: d.z });
  return d;
}
export function removeDep(S, d, ev, why = 'break', by = -1) {
  const i = S.deps ? S.deps.indexOf(d) : -1;
  if (i < 0) return;
  S.deps.splice(i, 1);
  S.depV = (S.depV || 0) + 1;
  ev.push({ e: 'depbreak', d: d.id, k: d.k, why, by, x: d.x, y: d.y + (d.k === 'shield' ? 0.5 : 0.2), z: d.z });
}

// 有刺鉄線の上にいるか（足元）
export function wireAt(S, x, z, y) {
  if (!S.deps || !S.deps.length) return null;
  const W = DEP.wire;
  for (const d of S.deps) {
    if (d.k !== 'wire' || !(d.hp > 0) || Math.abs(d.y - y) > 0.5) continue;
    const dx = x - d.x, dz = z - d.z;
    if (Math.abs(dx) > 1.3 || Math.abs(dz) > 1.3) continue;
    const [ux, uz] = depAxis(d), fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
    if (Math.abs(dx * ux + dz * uz) <= W.hw + 0.12 && Math.abs(dx * fx + dz * fz) <= W.hd + 0.12) return d;
  }
  return null;
}
// 有刺鉄線の中を動くと音が出る（AI にも聞こえる）。動いた距離で鳴らす
export function stepWire(S, a, dist, ev) {
  const d = a.isDrone ? null : wireAt(S, a.x, a.z, a.y);
  if (!d) { a.wireD = 0; return; }
  a.wireD = (a.wireD || 0) + dist;
  if (a.wireD >= DEP.wire.noise) { a.wireD = 0; ev.push({ e: 'wire', id: a.id, d: d.id, x: a.x, y: a.y + 0.2, z: a.z }); }
}

// 爆発のまわり（半径 R）の置いた物を壊す
export function blastDeps(S, w, x, y, z, R, ev, by = -1) {
  if (!S.deps || !S.deps.length) return;
  for (const d of S.deps.slice()) {
    const dist = Math.hypot(d.x - x, d.y + 0.4 - y, d.z - z);
    if (dist <= R + (d.k === 'wire' ? 0.5 : 0.3)) removeDep(S, d, ev, 'blast', by);
  }
}
// 近接で殴る: 目の前（届く所）の有刺鉄線を傷める。当たれば true
export function meleeDeps(S, w, a, eye, dx, dy, dz, R, ev) {
  if (!S.deps || !S.deps.length) return false;
  let best = null, bt = R + 0.35;
  for (const d of S.deps) {
    if (d.k !== 'wire' || !(d.hp > 0)) continue;
    // 局所の座標で、張った鉄線の箱（高さ0.45m）と照準の線
    const [ux, uz] = depAxis(d), fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
    const ox = eye[0] - d.x, oz = eye[2] - d.z;
    const lx = ox * ux + oz * uz, lz = ox * fx + oz * fz, ldx = dx * ux + dz * uz, ldz = dx * fx + dz * fz;
    const r = rayBox(lx, eye[1], lz, ldx, dy, ldz, -DEP.wire.hw, d.y, -DEP.wire.hd, DEP.wire.hw, d.y + DEP.wire.h + 0.1, DEP.wire.hd);
    if (r && r[1] > 0 && r[0] < bt) { bt = r[0]; best = d; }
  }
  if (!best) return false;
  best.hp--;
  S.depV = (S.depV || 0) + 1;
  if (best.hp <= 0) removeDep(S, best, ev, 'melee', a.id);
  else ev.push({ e: 'dephit', d: best.id, k: best.k, by: a.id, x: best.x, y: best.y + 0.25, z: best.z });
  return true;
}

// 見ている置ける盾（拾い直す）: 守る側の味方の盾で、2m以内
export function depAimed(S, a, hits) {
  for (const h of hits) {
    if (h.kind !== 'dep') { if (h.kind === 'block' || h.kind === 'door' || h.kind === 'bar' || h.kind === 'prop') return null; continue; }
    const d = S.deps && S.deps.find(q => q.id === h.id);
    if (!d || h.t0 > 2.0) return null;
    return d;
  }
  return null;
}

// 通信: 置いた物の一覧 [id, 種類, x, y, z, 向き, チーム, 残り]
const KIND = ['shield', 'wire'];
export function packDeps(S) {
  return (S.deps || []).map(d => [d.id, KIND.indexOf(d.k), Math.round(d.x * 100), Math.round(d.y * 100), Math.round(d.z * 100), Math.round(d.yaw * 1000), d.team, d.hp]);
}
export function applyDepsNet(S, DP) {
  const next = DP.map(r => ({ id: r[0], k: KIND[r[1]] || 'shield', x: r[2] / 100, y: r[3] / 100, z: r[4] / 100, yaw: r[5] / 1000, L: levelOfY(r[3] / 100 + 0.2), team: r[6], hp: r[7] }));
  if (!S.deps) S.deps = [];
  S.deps.length = 0;
  for (const d of next) S.deps.push(d);
  linkDeps(S);
}
// 置いた物の見た目の揺れ（同じ id なら同じ）
export function depSeed(d) { return hrand(d.id, 0, 777); }

