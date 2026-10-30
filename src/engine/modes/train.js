// 訓練場: 射撃場とキルハウス。役者は訓練弾（ダメージなし）で撃ってくる。弾は射撃場で補給できる。
import { spawnSwat, spawnSuspect, spawnCivilian } from './spawn.js';
import { OFFICERS, LOADOUTS } from '../data/npc.js';
import { MAPS } from '../maps/index.js';
import { WEAPONS } from '../data/weapons.js';

export default {
  init(S, w, o) {
    const def = MAPS[S.map];
    const sp = def.spawn;
    const roster = o.roster || [{ pid: 0, name: 'リード', lo: LOADOUTS.player }];
    const at = o.start === 'range' ? sp.train.range : o.start === 'house' ? sp.train.house : sp.swat[0];
    let k = 0;
    for (const r of roster) {
      spawnSwat(S, w, { pid: r.pid, name: r.name, x: at.x + (k % 2) * 1.2, z: at.z + Math.floor(k / 2) * 1.2, yaw: at.yaw, lo: r.lo || LOADOUTS.player, cell: true, team: 0 });
      k++;
    }
    const ai = Math.max(0, (o.team ?? 5) - roster.length);
    const keys = ['red1', 'red2', 'blue1', 'blue2'];
    for (let i = 0; i < ai && i < 4; i++) {
      const of = OFFICERS[i];
      spawnSwat(S, w, { name: of.name, x: at.x + ((k + i) % 2) * 1.2, z: at.z + Math.floor((k + i) / 2) * 1.2 + 1, yaw: at.yaw, lo: LOADOUTS[keys[i]], cell: true, squad: of.team, slot: i, team: 0 });
    }
    S.m = { kind: 'train', resets: 0 };
    if (o.house !== false) placeActors(S, w, def);
  },
  step(S, w, dt, ev) {
    // 射撃場の中では弾が減らない（補給）
    if (S.t % 30 === 0) for (const a of S.actors) {
      if (a.kind !== 'swat' || !a.alive) continue;
      if (a.z / 0.5 < 58 && a.x / 0.5 < 19) {
        for (const wi of a.inv.w) { if (!wi) continue; const W = WEAPONS[wi.id]; if (wi.mags) { for (let i = 0; i < wi.mags.length; i++) wi.mags[i] = W.mag; while (wi.mags.length < W.spare) wi.mags.push(W.mag); } else wi.res = W.spare; }
        for (const g of a.inv.gear) g.n = Math.max(g.n, 2);
      }
    }
  },
  onEvents(S, w, evs) {
    for (const e of evs) if (e.e === 'reset') { /* 役者を置き直す（画面から） */ }
  },
};
export function placeActors(S, w, def) {
  const sus = def.spawn.sus || [], civ = def.spawn.civ || [];
  for (let i = 0; i < Math.min(3, sus.length); i++) { const [x, z] = sus[(i * 3 + S.m.resets) % sus.length]; spawnSuspect(S, w, x, z, 0, 'train'); }
  for (let i = 0; i < Math.min(2, civ.length); i++) { const [x, z] = civ[(i + S.m.resets) % civ.length]; spawnCivilian(S, w, x, z, 0, i ? 'adult' : 'staff'); }
}
