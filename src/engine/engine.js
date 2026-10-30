// エンジン: 状態（関数を含まないデータ）と1ステップの進め方。命令（入力）→ 出来事（イベント）。
// 固定ステップ 1/60 秒（シミュレーションでは 1/30 も可）。乱数はシード付き。dump/load で丸ごと保存・復元。
import { compileMap, CS, LH } from './world.js';
import { rngNew, rnd } from './rng.js';
import { COMPAT } from './data/version.js';
import { moveActor, separateActors, tryVault } from './move.js';
import { stepWeapon } from './weapon.js';
import { stepBullets, hooks } from './combat.js';
import { makeDoorStates, stepDoors } from './doors.js';
import { stepNades, stepClouds, stepBlasts } from './nades.js';
import { stepActs, doAction } from './interact.js';
import { stepStatus } from './status.js';
import { MAPS } from './maps/index.js';
import { MODES } from './modes/index.js';
import { thinkAll, collectNoise } from './ai/brain.js';
import { bakeLight, HS } from './light.js';

const worldCache = new Map();
// マップの組み立ては重いので1回だけ。試合ごとに壊れる物（ブロック）だけ写す
export function baseWorld(mapId) {
  let w = worldCache.get(mapId);
  if (!w) {
    const def = MAPS[mapId];
    if (!def) throw new Error('マップがない: ' + mapId);
    w = compileMap(def);
    if (w.errors.length) throw new Error(`マップ ${mapId} の誤り: ` + w.errors.slice(0, 5).join(' / '));
    lightForAI(w, def);
    worldCache.set(mapId, w);
  }
  return w;
}
// 光の格子を焼き、AI 用にマスごとの明るさ（胸の高さ）を作る。描画も同じ光の格子を使う
function lightForAI(w, def) {
  const lat = bakeLight(w, def, { sunSeparate: true });
  w._lat = lat;
  const br = new Float32Array(w.N);
  const { W1, D1, data, sunVis, sky } = lat;
  const sunL = 0.2126 * sky.sun[0] + 0.7152 * sky.sun[1] + 0.0722 * sky.sun[2];
  for (let L = 0; L < w.NL; L++) for (let j = 0; j < w.D; j++) for (let i = 0; i < w.W; i++) {
    let s = 0;
    for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const p = ((L * 3 + 1) * D1 + j + dj) * W1 + i + di;
      let l = 0;
      for (let a = 0; a < 6; a++) l += 0.2126 * data[p * 18 + a * 3] + 0.7152 * data[p * 18 + a * 3 + 1] + 0.0722 * data[p * 18 + a * 3 + 2];
      s += l / 6 + sunVis[p] * sunL * 0.35;
    }
    br[w.idx(L, i, j)] = s / 4;
  }
  w._bright = br;
}
export function instWorld(mapId) {
  const b = baseWorld(mapId);
  const w = Object.create(b);
  w.blocks = b.blocks0.slice();
  w.bhp = b.bhp.slice();
  return w;
}

// 試合を作る。o: { map, mode, mission, rules, seed, roster: [{pid?, name, team, kind, lo, bot?}] }
export function createGame(o) {
  const w = instWorld(o.map);
  const S = {
    v: COMPAT, t: 0, dt: o.dt || 1 / 60, seed: o.seed ?? 1, rng: rngNew(o.seed ?? 1), map: o.map, mode: o.mode, mission: o.mission || null,
    rules: Object.assign({ cap: 44, diff: 'normal', ff: true, dbno: false, recoil: 1 }, o.rules || {}),
    pvp: o.mode !== 'pve' && o.mode !== 'train', nextId: 1, nextItem: 1,
    actors: [], byId: {}, doors: makeDoorStates(w), bdiff: {}, reinf: {}, bullets: [], nades: [], clouds: [], blasts: [], items: [], harms: [],
    orders: [], shouts: [], mines: [], ev: [], evSeq: 0, over: null, phase: 'play', m: {}, chems: [], notes: [], cmdSeq: 0, paused: false,
  };
  const api = { S, w };
  const mod = MODES[o.mode];
  if (!mod) throw new Error('モードがない: ' + o.mode);
  mod.init(S, w, o);
  reindex(S);
  return api;
}
export function reindex(S) { S.byId = {}; for (const a of S.actors) S.byId[a.id] = a; }

// 1ステップ。inputs: { [actorId]: {mx,mz,yaw,pitch,fire,ads,low,stance,lean,sprint,act:[...]} }
export function step(G, inputs = {}) {
  const { S, w } = G;
  const dt = S.dt;
  const ev = [];
  if (S.paused) return ev;
  const mod = MODES[S.mode];
  hooks.canDown = mod.canDown || null;
  // AI の判断（入力を作る）
  const aiIn = thinkAll(S, w, dt, ev);
  for (const a of S.actors) {
    if (a.isDrone) continue;
    const inp = a.pid != null ? (inputs[a.id] || idle(a)) : (aiIn[a.id] || idle(a));
    a._inp = inp;
    if (inp.act) for (const ac of inp.act) {
      if (ac.a === 'vault') tryVault(S, w, a);
      else doAction(S, w, a, ac, ev);
    }
  }
  // 状態（怯み・閃光・ガス・出血など）
  stepStatus(S, w, dt, ev);
  // 動き・銃
  for (const a of S.actors) {
    if (a.isDrone) { if (mod.stepDrone) mod.stepDrone(S, w, a, a.pid != null ? inputs[a.id] : null, dt, ev); continue; }
    const inp = a._inp;
    moveActor(S, w, a, inp, dt, ev);
    stepWeapon(S, w, a, inp, dt, ev);
  }
  separateActors(S, w);
  stepActs(S, w, dt, ev);
  stepDoors(S, w, dt, ev);
  stepBullets(S, w, dt, ev);
  stepNades(S, w, dt, ev);
  stepBlasts(S, w, dt, ev);
  stepClouds(S, w, dt, ev);
  // 弾がそばを抜けた（制圧）
  for (const a of S.actors) {
    if (a._whiz) { a.supp = Math.min(1, Math.max(a.supp, a._whiz)); ev.push({ e: 'whiz', id: a.id, k: a._whiz }); a._whiz = 0; }
  }
  if (mod.step) mod.step(S, w, dt, ev);
  if (mod.onEvents) mod.onEvents(S, w, ev);
  collectNoise(S, ev);
  S.t++;
  for (const e of ev) e.s = ++S.evSeq;
  return ev;
}

export function idle(a) { return { mx: 0, mz: 0, yaw: a.yaw, pitch: a.pitch, fire: false, ads: false, low: false, stance: a.stance, lean: 0, sprint: false, act: null }; }

// 保存と復元（壊れた壁は差分だけ）
export function dump(G) {
  const { S, w } = G;
  const blocks = [];
  for (const k of Object.keys(S.bdiff)) { const b = +k * 4; blocks.push([+k, w.blocks[b], w.blocks[b + 1], w.blocks[b + 2], w.blocks[b + 3], w.bhp[b], w.bhp[b + 1], w.bhp[b + 2], w.bhp[b + 3]]); }
  const o = JSON.parse(JSON.stringify(S, (k, v) => (k === 'byId' || k === '_caps' || k === '_eye' || k === '_capT' || k === '_inp' || k === '_whiz' || k === '_shieldF' ? undefined : v)));
  o.blocksDiff = blocks;
  return o;
}
export function load(o) {
  if (!o || o.v !== COMPAT) throw new Error('互換番号が違うセーブ');
  const w = instWorld(o.map);
  const S = JSON.parse(JSON.stringify(o));
  for (const [k, b0, b1, b2, b3, h0, h1, h2, h3] of (S.blocksDiff || [])) { const b = k * 4; w.blocks[b] = b0; w.blocks[b + 1] = b1; w.blocks[b + 2] = b2; w.blocks[b + 3] = b3; w.bhp[b] = h0; w.bhp[b + 1] = h1; w.bhp[b + 2] = h2; w.bhp[b + 3] = h3; }
  delete S.blocksDiff;
  reindex(S);
  return { S, w };
}
export { CS, LH };
