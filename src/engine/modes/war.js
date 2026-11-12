// 大規模戦（WAR BIT）: コンクエスト（research/WARBIT.md の 1・2・3・7）
// - 範囲・本陣・拠点はマップの人数ごとの設定（小 16対16・中 32対32・大 64対64）。足りない人数はボット（src/war/ai.js）
// - 拠点: 範囲に立つと奪える。味方が多いほど速く（4人分まで）、同じ数なら止まる。敵の拠点はまず中立に戻す（1人で 10 秒＋10 秒）
// - チケット: 小 300・中 500・大 800。出撃するたびに1減る。拠点を過半数持つ側が、相手を（拠点の差×0.3）/秒 減らす。0 で負け
// - 範囲の外に 10 秒いると死ぬ。倒されたら 7 秒で出撃できる（本陣か、奪われかけていない自軍の拠点）
import { createActor, makeInventory, makeArmor } from '../actor.js';
import { killActor } from '../combat.js';
import { groundAt, pushOut } from '../world.js';
import { heightAt } from '../../war/world.js';
import { warThink, botSpawnPoint, SQUAD } from '../../war/ai.js';
import { hrand } from '../rng.js';

export const OUT_LIMIT = 10;
export const RESPAWN_T = 7;
export const TICKETS = { small: 300, medium: 500, large: 800 };
export const CAP_T = 10;        // 1人で中立→自軍（敵の拠点はこれを2回）
export const BLEED = 0.3;       // 拠点の差1つあたり、毎秒
// 仮の装備（兵科は次の段階）
export const WAR_LOADOUT = {
  assault: { primary: { id: 'm4a1', sight: 'holo', grip: 'vert', ammo: 'ap' }, secondary: { id: 'm17', ammo: 'ap' }, long: 'none', gear: [['frag', 2], ['impact', 1], ['smoke', 1], ['flash', 1], ['bandage', 3]], vest: 'light', plate: 'ceramic', helmet: 'helmet', head: 'none' },
};
// ボットの銃（陣営ごと。重みつき）
const BOT_GUNS = [
  [['m4a1', 'holo', 32], ['hk416', 'reddot', 14], ['mk18', 'holo', 8], ['mp7', 'holo', 12], ['scarh', 'acog', 10], ['g36c', 'reddot', 10], ['at308', null, 6], ['m4super', 'reddot', 4], ['mp5', 'holo', 4]],
  [['akm', 'reddot', 30], ['aks74u', 'reddot', 14], ['vz58', 'holo', 14], ['rpk', 'reddot', 10], ['g3', 'acog', 8], ['sks', 'acog', 8], ['at308', null, 6], ['saiga', 'reddot', 4], ['bizon', 'holo', 6]],
];
const SKILLS = ['bot1', 'bot2', 'bot2', 'bot2', 'bot3'];
function botLoadout(S, team, k) {
  const L = BOT_GUNS[team], tot = L.reduce((s, x) => s + x[2], 0);
  let r = hrand(S.seed + team * 7, k, 61) * tot, pick = L[0];
  for (const x of L) { r -= x[2]; if (r <= 0) { pick = x; break; } }
  const prim = { id: pick[0], ammo: 'ap' }; if (pick[1]) prim.sight = pick[1];
  return { primary: prim, secondary: { id: team ? 'm92' : 'm17', ammo: 'ap' }, long: 'none', gear: [['bandage', 2]], vest: 'light', plate: 'ceramic', helmet: 'helmet', head: 'none' };
}
const SQ_NAME = ['アルファ', 'ブラボー', 'チャーリー', 'デルタ', 'エコー', 'フォックストロット', 'ゴルフ', 'ホテル'];
export const squadName = (sq) => SQ_NAME[sq % SQ_NAME.length] + (sq >= SQ_NAME.length ? Math.floor(sq / SQ_NAME.length) + 1 : '');

// 本陣のまわりの出撃位置（チーム t、k 番目）
export function hqSpot(S, w, t, k) {
  const [hx, hz] = S.m.hq[t];
  const toward = S.m.hq[1 - t][0] > hx ? 1 : -1; // 本陣から戦場の向き（x）
  const a = (k * 2.399) % (Math.PI * 2), r = 3 + (k % 9) * 1.5;
  const x = hx + Math.cos(a) * r + toward * 4, z = hz + Math.sin(a) * r;
  return { x, z, y: groundAt(w, x, z, heightAt(w, x, z) + 0.3), yaw: toward > 0 ? Math.PI / 2 : -Math.PI / 2 };
}
// 拠点の中の出撃位置（物にめり込まない外の所）
const _po = [0, 0, 0];
export function flagSpot(S, w, f, k) {
  for (let t = 0; t < 12; t++) {
    const a = hrand(f.id.charCodeAt(0), k * 13 + t, 71) * Math.PI * 2, r = f.r * (0.2 + 0.6 * hrand(f.id.charCodeAt(0), k * 13 + t, 72));
    const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r, g = heightAt(w, x, z);
    const y = groundAt(w, x, z, g + 0.3);
    if (y > g + 0.5) continue; // 箱の上（屋根など）
    pushOut(w, x, z, y + 0.4, y + 1.8, 0.3, null, -1, _po);
    if (_po[2]) continue;
    if ((w.blds || []).some(b => x > b.rect[0] - 0.5 && x < b.rect[2] + 0.5 && z > b.rect[1] - 0.5 && z < b.rect[3] + 0.5)) continue;
    return { x, z, y, yaw: hrand(f.id.charCodeAt(0), k, 73) * Math.PI * 2 };
  }
  return { x: f.x, z: f.z, y: groundAt(w, f.x, f.z, heightAt(w, f.x, f.z) + 0.3), yaw: 0 };
}
export function inArea(S, x, z) { const r = S.m.rect; return x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]; }
// 出撃できる拠点（自軍の物で、敵が奪いかけていない）
export function canSpawnAt(S, f, team) { return f.owner === team && !f.contested && !(team === 0 ? f.prog < 0.999 : f.prog > -0.999); }

// 出撃し直す（at: 'hq' か拠点の id）
function redeploy(S, w, a, at) {
  const f = at && at !== 'hq' ? S.m.flags.find(q => q.id === at) : null;
  const p = f && canSpawnAt(S, f, a.team) ? flagSpot(S, w, f, (S.m.spawnN = (S.m.spawnN || 0) + 1)) : hqSpot(S, w, a.team, (S.m.spawnN = (S.m.spawnN || 0) + 1));
  if (!f || !canSpawnAt(S, f, a.team)) { /* 本陣 */ }
  Object.assign(a, { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: 0, vx: 0, vy: 0, vz: 0, alive: true, dead: false, down: false, dbno: 0, dbnoCount: 0, hp: 100, maxHp: 100, oob: 0,
    stun: 0, flash: 0, gas: 0, tased: 0, deaf: 0, supp: 0, bleed: 0, flinch: 0, act: null, st: 0, stance: 0, vault: null, air: false, airTop: null, lean: 0, ads: 0, low: 0, adsOn: false, lowOn: false, sprint: false, sprT: 0, fat: 0, peek: null, melee: null, gest: null, spot: 0,
    inj: { arm: 0, leg: 0, head: 0 }, spawnProt: 2, stateT: 0, dmgBy: {}, lastHit: null, deployAt: null });
  // 向き: 敵の本陣の方
  const eh = S.m.hq[1 - a.team]; a.yaw = Math.atan2(eh[0] - a.x, eh[1] - a.z);
  const lo = a.warLo || WAR_LOADOUT.assault;
  a.inv = makeInventory(lo); a.armor = makeArmor(lo);
  a.ws = { slot: a.inv.w[0] ? 0 : 1, next: -1, st: 'draw', t: 0.4, cd: 0, trigWas: false, rp: 0, ry: 0, bloom: 0, shots: 0, lastShot: -99, rk: null, rd: 0, gear: -1, pumpNeed: false, barrel: 0 };
  if (a.ai) { const keep = { type: a.ai.type, skill: a.ai.skill }; a.ai = keep; }
  S.m.tickets[a.team] = Math.max(0, S.m.tickets[a.team] - 1);
}

function stepFlags(S, w, dt, ev) {
  const m = S.m;
  for (const f of m.flags) {
    let n0 = 0, n1 = 0;
    for (const a of S.actors) { if (!a.alive || a.down || a.isDrone) continue; if (Math.hypot(a.x - f.x, a.z - f.z) > f.r || Math.abs(a.y - f.y) > 12) continue; if (a.team === 0) n0++; else if (a.team === 1) n1++; }
    f.n = [n0, n1];
    f.contested = n0 > 0 && n1 > 0;
    const before = f.owner;
    const rate = dt / CAP_T;
    if (n0 !== n1) {
      const s = Math.sign(n0 - n1), k = Math.min(4, Math.abs(n0 - n1));
      f.prog = Math.max(-1, Math.min(1, f.prog + s * k * rate));
    } else if (!n0 && f.owner >= 0) {
      // 誰もいない: 持ち主の側へゆっくり戻る
      const tgt = f.owner === 0 ? 1 : -1; f.prog += Math.sign(tgt - f.prog) * Math.min(Math.abs(tgt - f.prog), rate * 0.25);
    } else if (!n0 && f.owner < 0 && f.prog !== 0) {
      f.prog -= Math.sign(f.prog) * Math.min(Math.abs(f.prog), rate * 0.25);
    }
    // 持ち主: 端まで行けばその側、0 を越えたら中立
    if (f.prog >= 1) f.owner = 0; else if (f.prog <= -1) f.owner = 1;
    else if ((f.owner === 0 && f.prog <= 0) || (f.owner === 1 && f.prog >= 0)) f.owner = -1;
    if (f.owner !== before) ev.push({ e: 'flag', id: f.id, owner: f.owner, prev: before });
  }
  // チケットの減り（拠点を過半数持つ側が、相手を減らす）
  const c = [0, 0]; for (const f of m.flags) if (f.owner >= 0) c[f.owner]++;
  const half = m.flags.length / 2;
  for (let t = 0; t < 2; t++) if (c[t] > half) m.tickets[1 - t] = Math.max(0, m.tickets[1 - t] - (c[t] - c[1 - t]) * BLEED * dt);
}

export default {
  init(S, w, o) {
    const size = o.size || 'small';
    const A = w.areas[size];
    S.war = true;
    S.rules.ff = false; S.rules.dbno = true;
    const T = TICKETS[size] || 300;
    S.m = { kind: 'war', size, rect: A.rect.slice(), hq: A.hq.map(p => p.slice()), tickets: [T, T], tickets0: T, over: false, winner: -1, startT: 0, spawnN: 0,
      flags: A.flags.map(id => { const d = w.flagDefs[id]; return { id, name: d.name, x: d.x, z: d.z, r: d.r, y: heightAt(w, d.x, d.z), owner: -1, prog: 0, contested: false, n: [0, 0] }; }),
      respawn: [], sqGoal: {} };
    const roster = o.roster || [{ pid: 0, name: 'あなた', team: 0, lo: WAR_LOADOUT.assault }];
    const per = o.bots === false ? 0 : (o.per || A.per || 16);
    const cnt = [0, 0];
    const add = (t, r, isBot) => {
      const k = cnt[t]++, p = hqSpot(S, w, t, k);
      const lo = r.lo || botLoadout(S, t, k);
      const sq = Math.floor(k / SQUAD);
      const name = r.name || `${squadName(sq)}${k % SQUAD + 1}`;
      const a = createActor(S, { kind: 'soldier', team: t, pid: r.pid ?? null, name, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: 100, lo, h: 1.72 + hrand(S.seed, k * 3 + t, 81) * 0.16 });
      a.role = 'soldier'; a.oob = 0; a.warLo = lo; a.squad = sq;
      if (isBot) a.ai = { type: 'war', skill: SKILLS[Math.floor(hrand(S.seed, k * 5 + t, 82) * SKILLS.length)] };
      return a;
    };
    for (const r of roster) add(r.team ?? 0, r, false);
    for (let t = 0; t < 2; t++) while (cnt[t] < per) add(t, {}, true);
  },
  canDown() { return true; },
  think(S, w, dt, ev) { return warThink(S, w, dt, ev); },
  // 展開の画面から（倒れている間）: 出撃する場所を選ぶ
  act(S, w, a, ac, ev) {
    if (ac.a !== 'warDeploy') return false;
    if (a.alive) return true;
    a.deployAt = ac.at || 'hq';
    return true;
  },
  step(S, w, dt, ev) {
    const m = S.m;
    if (m.over) return;
    stepFlags(S, w, dt, ev);
    // 出撃し直す: ボットは時間が来たら、人は場所を選んでから
    for (let i = m.respawn.length - 1; i >= 0; i--) {
      const r = m.respawn[i]; if (S.t < r.at) continue;
      const a = S.byId[r.id]; if (!a || !a.dead) { m.respawn.splice(i, 1); continue; }
      if (m.tickets[a.team] <= 0) continue;
      if (a.pid != null && !a.deployAt) continue;
      m.respawn.splice(i, 1);
      const at = a.pid != null ? a.deployAt : (botSpawnPoint(S, a) || {}).flag || 'hq';
      redeploy(S, w, a, at);
      ev.push({ e: 'respawn', id: a.id, at });
    }
    // 範囲の外: 10秒で死ぬ（戻れば消える）
    for (const a of S.actors) {
      if (!a.alive) continue;
      if (inArea(S, a.x, a.z)) { if (a.oob) { a.oob = 0; if (a.pid != null) ev.push({ e: 'oob', id: a.id, t: 0 }); } continue; }
      const was = a.oob || 0;
      a.oob = was + dt;
      if (a.pid != null && Math.floor(was) !== Math.floor(a.oob)) ev.push({ e: 'oob', id: a.id, t: OUT_LIMIT - Math.floor(a.oob) });
      if (a.oob >= OUT_LIMIT) { a.oob = 0; a.lastHit = null; killActor(S, a, null, ev, 'oob', ''); }
    }
    // 勝ち負け
    for (let t = 0; t < 2; t++) if (m.tickets[t] <= 0 && !m.over) {
      // チケットが0で、生きている人もいなくなったら（BF と同じく 0 で終わり）
      m.over = true; m.winner = 1 - t; m.endT = S.t;
      ev.push({ e: 'matchend', win: m.winner });
    }
  },
  onEvents(S, w, evs) {
    for (const e of evs) if (e.e === 'kill') {
      const v = S.byId[e.id], k = S.byId[e.by];
      if (!v) continue;
      v.stats.d++;
      if (k && k.team !== v.team) k.stats.k++;
      for (const as of e.as || []) { const x = S.byId[as]; if (x && x.team !== v.team) x.stats.a++; }
      v.deployAt = null;
      S.m.respawn.push({ id: v.id, at: S.t + Math.round(RESPAWN_T / S.dt) });
    }
  },
};
