// 大規模戦（WAR BIT）。M1: 本陣から出て、歩いて撃てる。範囲の外に10秒いると死ぬ（Battlefield の境界: research/WARBIT.md の 1）
// 拠点の奪い合い・分隊・兵科・展開の画面・ボットは M2 から
import { createActor, makeInventory, makeArmor } from '../actor.js';
import { killActor } from '../combat.js';
import { groundAt } from '../world.js';
import { heightAt } from '../../war/world.js';

export const OUT_LIMIT = 10;
// 仮の装備（兵科は M2）
export const WAR_LOADOUT = {
  assault: { primary: { id: 'm4a1', sight: 'holo', grip: 'vert', ammo: 'ap' }, secondary: { id: 'm17', ammo: 'ap' }, long: 'none', gear: [['smoke', 1], ['flash', 1], ['bandage', 3]], vest: 'light', plate: 'ceramic', helmet: 'helmet', head: 'none' },
};
// 本陣のまわりの出撃位置（チーム t、k 番目）
export function hqSpot(S, w, t, k) {
  const [hx, hz] = S.m.hq[t];
  const toward = t === 0 ? 1 : -1; // 本陣から戦場の向き（x）
  const a = (k * 2.399) % (Math.PI * 2), r = 3 + (k % 7) * 1.6;
  const x = hx + Math.cos(a) * r + toward * 4, z = hz + Math.sin(a) * r;
  return { x, z, y: groundAt(w, x, z, heightAt(w, x, z) + 0.3), yaw: toward > 0 ? Math.PI / 2 : -Math.PI / 2 };
}
export function inArea(S, x, z) { const r = S.m.rect; return x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]; }
export const RESPAWN_T = 5;
// 出撃し直す（M1: 本陣へ。展開の画面は M2）
function redeploy(S, w, a) {
  const p = hqSpot(S, w, a.team, (S.m.spawnN = (S.m.spawnN || 0) + 1));
  Object.assign(a, { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: 0, vx: 0, vy: 0, vz: 0, alive: true, dead: false, down: false, dbno: 0, dbnoCount: 0, hp: 100, maxHp: 100, oob: 0,
    stun: 0, flash: 0, gas: 0, tased: 0, deaf: 0, supp: 0, bleed: 0, flinch: 0, act: null, st: 0, stance: 0, vault: null, air: false, airTop: null, lean: 0, ads: 0, low: 0, adsOn: false, lowOn: false, sprint: false, sprT: 0, fat: 0, peek: null, melee: null, gest: null, spot: 0,
    inj: { arm: 0, leg: 0, head: 0 }, spawnProt: 2, stateT: 0, dmgBy: {}, lastHit: null });
  const lo = a.warLo || WAR_LOADOUT.assault;
  a.inv = makeInventory(lo); a.armor = makeArmor(lo);
  a.ws = { slot: a.inv.w[0] ? 0 : 1, next: -1, st: 'draw', t: 0.4, cd: 0, trigWas: false, rp: 0, ry: 0, bloom: 0, shots: 0, lastShot: -99, rk: null, rd: 0, gear: -1, pumpNeed: false, barrel: 0 };
}

export default {
  init(S, w, o) {
    const size = o.size || 'small';
    const A = w.areas[size];
    S.war = true;
    S.rules.ff = false; S.rules.dbno = true;
    S.m = { kind: 'war', size, rect: A.rect.slice(), hq: A.hq.map(p => p.slice()), flags: A.flags.map(id => ({ id, name: w.flagDefs[id].name, x: w.flagDefs[id].x, z: w.flagDefs[id].z, r: w.flagDefs[id].r, owner: -1, cap: 0 })) };
    const roster = o.roster || [{ pid: 0, name: 'あなた', team: 0, lo: WAR_LOADOUT.assault }];
    let k = [0, 0];
    for (const r of roster) {
      const t = r.team ?? 0, p = hqSpot(S, w, t, k[t]++);
      const a = createActor(S, { kind: 'soldier', team: t, pid: r.pid ?? null, name: r.name, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: 100, lo: r.lo || WAR_LOADOUT.assault, h: 1.8 });
      a.role = 'soldier'; a.oob = 0; a.warLo = r.lo || WAR_LOADOUT.assault;
    }
    S.m.respawn = [];
  },
  canDown() { return true; },
  step(S, w, dt, ev) {
    // 出撃し直す
    for (let i = S.m.respawn.length - 1; i >= 0; i--) { const r = S.m.respawn[i]; if (S.t < r.at) continue; S.m.respawn.splice(i, 1); const a = S.byId[r.id]; if (a && a.dead) { redeploy(S, w, a); ev.push({ e: 'respawn', id: a.id }); } }
    // 範囲の外: 10秒で死ぬ（戻れば消える）
    for (const a of S.actors) {
      if (!a.alive) continue;
      if (inArea(S, a.x, a.z)) { if (a.oob) { a.oob = 0; if (a.pid != null) ev.push({ e: 'oob', id: a.id, t: 0 }); } continue; }
      const was = a.oob || 0;
      a.oob = was + dt;
      if (a.pid != null && Math.floor(was) !== Math.floor(a.oob)) ev.push({ e: 'oob', id: a.id, t: OUT_LIMIT - Math.floor(a.oob) });
      if (a.oob >= OUT_LIMIT) { a.oob = 0; a.lastHit = null; killActor(S, a, null, ev, 'oob', ''); }
    }
  },
  onEvents(S, w, evs) {
    for (const e of evs) if (e.e === 'kill') {
      const v = S.byId[e.id], k = S.byId[e.by];
      if (!v) continue;
      v.stats.d++;
      if (k && k.team !== v.team) k.stats.k++;
      for (const as of e.as || []) { const x = S.byId[as]; if (x && x.team !== v.team) x.stats.a++; }
      S.m.respawn.push({ id: v.id, at: S.t + Math.round(RESPAWN_T / S.dt) });
    }
  },
};
