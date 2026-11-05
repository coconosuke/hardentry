// AI の入口: 命令を配り、種類ごとに考えて入力を作る。考えるのは数ステップに1回ずつ（交代で）、間は前の入力を少し続ける
import { thinkSuspect, thinkCiv } from './sus.js';
import { thinkSwat, takeOrders } from './swat.js';
import { thinkBot } from './bot.js';
import { baseInput, steerToward } from './common.js';
import { buildNav } from './nav.js';
import { leadThink } from './lead.js';

export function thinkAll(S, w, dt, ev) {
  const out = {};
  buildNav(w);
  leadThink(S, w, ev);
  takeOrders(S, w);
  const police = [], civs = [];
  for (const a of S.actors) {
    if (a.isDrone) continue;
    if (a.kind === 'swat' && a.alive && !a.down) police.push(a);
    else if (a.kind === 'civ') civs.push(a);
  }
  const ctx = { police, civs, others: S.actors };
  for (const a of S.actors) {
    if (!a.ai || a.pid != null || a.isDrone) continue;
    if (!a.alive) continue;
    let inp;
    const t = a.ai.type;
    if (t === 'sus') inp = thinkSuspect(S, w, a, dt, ctx);
    else if (t === 'civ') inp = thinkCiv(S, w, a, dt, ctx);
    else if (t === 'swat') inp = thinkSwat(S, w, a, dt, ctx);
    else if (t === 'bot') { ctx.enemies = S.actors.filter(b => b.team !== a.team && b.alive && !b.isDrone && b.kind !== 'civ'); inp = thinkBot(S, w, a, dt, ctx); }
    else inp = baseInput(a);
    // 味方の手の届く所をふさいでいる: 少しのあいだ脇へよける
    const y = a.ai.yieldTo;
    if (y) { if (S.t > y.until || a.act) a.ai.yieldTo = null; else if (a.ai.engId == null) makeWay(a, inp, y); }
    out[a.id] = inp;
  }
  S.shouts.length = 0;
  return out;
}

// 線分（よけてほしい人 → 手を当てる所）から垂直に 0.75m 離れる
function makeWay(a, inp, y) {
  const vx = y.tx - y.ax, vz = y.tz - y.az, L2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((a.x - y.ax) * vx + (a.z - y.az) * vz) / L2));
  const qx = y.ax + vx * t, qz = y.az + vz * t;
  let nx = a.x - qx, nz = a.z - qz, l = Math.hypot(nx, nz);
  if (l < 0.02) { const L = Math.sqrt(L2); nx = -vz / L; nz = vx / L; l = 1; }
  if (l > 0.75) { inp.mx = inp.mz = 0; return; }
  steerToward(a, inp, a.x + nx / l * (0.8 - l), a.z + nz / l * (0.8 - l), 0.7, false);
  inp.act = null;
}
// 前のステップの出来事から、聞こえる音を作る（AI の耳）
export function collectNoise(S, ev) {
  const H = [];
  for (const e of ev) {
    switch (e.e) {
      case 'shot': H.push({ x: e.x, y: e.y, z: e.z, k: 'shot', loud: e.supp ? 0.35 : (e.loud || 1) * 1.6, id: e.id, team: S.byId[e.id] ? S.byId[e.id].team : -1 }); break;
      case 'step': if (e.loud > 0.4) H.push({ x: e.x, y: e.y, z: e.z, k: 'step', loud: e.loud * 0.35, id: e.id, team: S.byId[e.id] ? S.byId[e.id].team : -1 }); break;
      case 'door': if (e.loud) { const a = S.byId[e.id]; H.push({ x: a ? a.x : 0, y: a ? a.y : 0, z: a ? a.z : 0, k: e.k === 'kickopen' || e.k === 'ram' || e.k === 'breach' ? 'breach' : 'door', loud: e.loud, id: e.id, team: a ? a.team : -1 }); } break;
      case 'nade': H.push({ x: e.x, y: e.y, z: e.z, k: 'boom', loud: 2.0, id: e.by, team: -1 }); break;
      case 'boom': case 'c2': H.push({ x: e.x, y: e.y, z: e.z, k: 'boom', loud: 2.5, id: e.by ?? -1, team: -1 }); break;
      case 'launch': { const a = S.byId[e.id]; if (a) H.push({ x: a.x, y: a.y + 1.4, z: a.z, k: 'shot', loud: 0.9, id: e.id, team: a.team }); break; }
      case 'shieldhit': H.push({ x: e.x, y: e.y, z: e.z, k: 'shot', loud: 0.5, id: e.id, team: S.byId[e.id] ? S.byId[e.id].team : -1 }); break;
      case 'glass': break;
      case 'shout': H.push({ x: e.x, y: e.y - 1.6, z: e.z, k: 'shout', loud: 0.8, id: e.id, team: S.byId[e.id] ? S.byId[e.id].team : -1 }); break;
    }
  }
  S.heard = H;
}
