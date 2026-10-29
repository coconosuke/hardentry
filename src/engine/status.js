// 体の状態の時間の進み: 怯み・閃光・ガス・テーザー・耳鳴り・制圧・エイムパンチ・出血・行動不能・ダウン
import { killActor } from './combat.js';

export function stepStatus(S, w, dt, ev) {
  for (const a of S.actors) {
    if (a.isDrone) continue;
    if (a.stun > 0) a.stun = Math.max(0, a.stun - dt);
    if (a.flash > 0) a.flash = Math.max(0, a.flash - dt);
    if (a.gas > 0) a.gas = Math.max(0, a.gas - dt);
    if (a.tased > 0) { a.tased = Math.max(0, a.tased - dt); }
    if (a.deaf > 0) a.deaf = Math.max(0, a.deaf - dt);
    if (a.spawnProt > 0) a.spawnProt = Math.max(0, a.spawnProt - dt);
    if (a.spot > 0) a.spot = Math.max(0, a.spot - dt);
    a.supp *= Math.pow(0.25, dt);
    a.flinch *= Math.pow(0.004, dt);
    if (!a.alive) continue;
    // 出血（隊員・PvE）。止血するまで毎秒1.9HP
    if (a.bleed > 0 && !a.down) {
      a.hp -= a.bleed * dt;
      if (a.hp <= 0) { a.hp = 0; const by = a.lastHit ? S.byId[a.lastHit.by] : null; killActor(S, a, by, ev, 'bleed'); continue; }
    }
    if (a.down) {
      a.downT += dt;
      if (S.pvp && a.dbno > 0) {
        // ダウン: 20HP が約20秒で尽きる（傷を押さえると半分の速さ = 動かないとき）
        a.dbno -= dt * (a.spd < 0.05 ? 0.6 : 1.0);
        if (a.dbno <= 0) { const by = a.lastHit ? S.byId[a.lastHit.by] : null; killActor(S, a, by, ev, 'bleed'); }
      } else if (!S.pvp && a.bleedOut > 0 && !a.cuffed && !a.reported) {
        a.bleedOut -= dt;
        if (a.bleedOut <= 0) { const by = a.lastHit ? S.byId[a.lastHit.by] : null; killActor(S, a, by, ev, 'bleed'); }
      }
    }
  }
}
