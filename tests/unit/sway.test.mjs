import { test, ok, eq } from '../lib/t.mjs';
import { createGame, step } from '../../src/engine/engine.js';
import { WEAPONS, swayOf, swayCamK, SWAY_CAM_SIGHT } from '../../src/engine/data/weapons.js';
import { makeWeapon } from '../../src/engine/actor.js';

// 構えたときの照準の揺れ（11-12 22:05: どの銃も。実際に沿って程よく）。訓練場で1人
function mk(gun) {
  const G = createGame({ map: 'training', mode: 'train', seed: 7, team: 1, house: false });
  const p = G.S.actors.find(a => a.pid === 0);
  p.inv.w[0] = makeWeapon(gun);
  p.ws.slot = 0; p.ws.st = 'ready'; p.ws.t = 0;
  const run = (o = {}, n = 1) => { for (let i = 0; i < n; i++) step(G, { [p.id]: { mx: 0, mz: 0, yaw: p.yaw, pitch: 0, stance: 0, ...o } }); };
  // 揺れの大きさ: この先 sec 秒の、照準のずれの最大（度）
  const amp = (o = {}, sec = 6) => { let m = 0; for (let i = 0; i < 60 * sec; i++) { run(o); m = Math.max(m, Math.hypot(p.ws.sx || 0, p.ws.sy || 0)); } return m; };
  return { G, p, run, amp };
}

test('sway: どの銃も構えると揺れ、腰だめでは揺れない。拳銃は小銃より、狙撃銃はもっと大きい', () => {
  const r = mk({ id: 'mk18', ammo: 'ap' });
  ok(r.amp({}, 2) === 0, '腰だめでは揺れない');
  const rifle = r.amp({ ads: true }, 8);
  const ps = mk({ id: 'g17', ammo: 'fmj' }), pistol = ps.amp({ ads: true }, 8);
  const sn = mk({ id: 'at308', ammo: 'ap' }), sniper = sn.amp({ ads: true }, 8);
  ok(rifle > 0.04 && rifle < 0.2, `小銃 ${rifle.toFixed(3)}°`);
  ok(pistol > rifle, `拳銃 ${pistol.toFixed(3)}° > 小銃`);
  ok(sniper > rifle * 1.4, `狙撃銃 ${sniper.toFixed(3)}° > 小銃`);
  ok(swayOf(WEAPONS.at308) === 0.2 && swayOf(WEAPONS.hk417) > swayOf(WEAPONS.mk18), '重い銃ほど大きい');
});

test('sway: 走ったあとは息が上がって大きく、止まっていると数秒で戻る。止まって構えていると少し落ち着く', () => {
  const r = mk({ id: 'mk18', ammo: 'ap' });
  r.run({ ads: true }, 60 * 3);
  const rested = r.amp({ ads: true }, 6);
  // 5秒走る
  r.run({ mz: 1, sprint: true }, 60 * 5);
  ok(r.p.fat > 0.9, `息が上がる ${r.p.fat.toFixed(2)}`);
  const tired = r.amp({ ads: true }, 3);
  ok(tired > rested * 1.8, `走ったあと ${tired.toFixed(3)}° > ふだん ${rested.toFixed(3)}°`);
  r.run({ ads: true }, 60 * 7);
  ok(r.p.fat < 0.05, `止まっていると6秒ほどで戻る ${r.p.fat.toFixed(2)}`);
  // 落ち着き: 構えた直後より、止まって1.5秒たつと小さい
  const c = mk({ id: 'mk18', ammo: 'ap' });
  c.run({ ads: true }, 30);
  ok(c.p.ws.calm < 0.3, '構えた直後は落ち着いていない');
  c.run({ ads: true }, 120);
  ok(c.p.ws.calm > 0.99, '止まって構えていると落ち着く');
  const m = mk({ id: 'mk18', ammo: 'ap' });
  m.run({ ads: true }, 30);
  m.run({ ads: true, mx: 1 }, 30);
  ok(m.p.ws.calm < 0.1, '動くと落ち着きは消える');
});

test('sway: 視界が受け持つ割合は、等倍の照準器 35%・スコープをのぞききると全部。弾は揺れた向きへ飛ぶ', () => {
  const dot = makeWeapon({ id: 'mk18', ammo: 'ap' }); dot.att.sight = 'reddot';
  const sc = makeWeapon({ id: 'mk18', ammo: 'ap' }); sc.att.sight = 'acog';
  eq(swayCamK(dot, 1), SWAY_CAM_SIGHT); eq(swayCamK(sc, 0.5), SWAY_CAM_SIGHT);
  ok(Math.abs(swayCamK(sc, 1) - 1) < 1e-9, 'スコープをのぞききると全部');
  ok(swayCamK(sc, 0.8) > SWAY_CAM_SIGHT && swayCamK(sc, 0.8) < 1, '目に寄せる途中は間');
  // 弾の向き: 撃った瞬間の揺れの分だけずれる（反動の前）
  const r = mk({ id: 'at308', ammo: 'ap' });
  r.run({ ads: true }, 90);
  const sx = r.p.ws.sx, sy = r.p.ws.sy;
  ok(Math.hypot(sx, sy) > 0.01, '揺れている');
  const yaw0 = r.p.yaw, pitch0 = r.p.pitch;
  r.run({ ads: true, fire: true });
  const b = r.G.S.bullets[r.G.S.bullets.length - 1];
  ok(b, '撃った');
  const v = b.v || [b.vx, b.vy, b.vz];
  const byaw = Math.atan2(v[0], v[2]), bp = Math.atan2(v[1], Math.hypot(v[0], v[2]));
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  const dyaw = wrap(byaw - yaw0) * 180 / Math.PI, dp = (bp - pitch0) * 180 / Math.PI;
  ok(Math.abs(dyaw - sx) < 0.05 && Math.abs(dp - sy) < 0.05, `弾のずれ ${dyaw.toFixed(3)},${dp.toFixed(3)} ≒ 揺れ ${sx.toFixed(3)},${sy.toFixed(3)}`);
});
