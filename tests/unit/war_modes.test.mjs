// WAR BIT のモード（ドミネーション・TDM・射撃場）・兵科・出撃の画面からの出撃
import { test, ok, near } from '../lib/t.mjs';
import { createGame, step } from '../../src/engine/engine.js';
import { heightAt } from '../../src/war/world.js';
import { WAR_MODES, DOM_RATE } from '../../src/engine/modes/war.js';
import { CLASSES, CLASS_LIST, classLoadout, classGuns } from '../../src/war/classes.js';

const inp = (a, o = {}) => ({ [a.id]: Object.assign({ mx: 0, mz: 0, yaw: a.yaw, pitch: 0, stance: 0, lean: 0, sprint: false, fire: false, ads: false, act: null }, o) });
const me = (cls = 'assault') => [{ pid: 0, name: 'me', team: 0, cls }];

test('war modes: 兵科の装備（体力・ヘルメット・包帯・銃は兵科の中から）', () => {
  ok(CLASS_LIST.length === 6 && CLASS_LIST[0] === 'leader', '兵科は6つ（分隊長から）');
  for (const id of CLASS_LIST) {
    const L = classLoadout(id), C = CLASSES[id];
    ok(classGuns(id).includes(L.primary.id), `${id}: 主の銃 ${L.primary.id}`);
    ok((L.helmet === 'none') === !!C.noHelmet, `${id}: ヘルメット`);
  }
  ok(CLASSES.support.hp === 125 && CLASSES.recon.hp === 90 && CLASSES.assault.hp === 100, '体力 援護125・偵察90・ほか100');
  ok(classLoadout('medic').gear.find(g => g[0] === 'bandage')[1] === 16, '衛生の包帯16');
  ok(classLoadout('assault', 'akm').primary.id === 'akm' && classLoadout('assault', 'at308').primary.id !== 'at308', '兵科にない銃は選べない');
});

test('war modes: 出撃の画面から始まる（人は場所を選んでから出る・ボットは兵科ごと・分隊長は分隊の1人目）', () => {
  const G = createGame({ map: 'riverbend', mode: 'war', wmode: 'conquest', size: 'small', seed: 4, roster: me('leader'), predeploy: true });
  const S = G.S, p = S.actors[0];
  ok(!p.alive && p.deployed === false, '始めは出ていない');
  for (let i = 0; i < 60; i++) step(G, {});
  ok(!p.alive, '選ぶまで出ない');
  const bots = S.actors.filter(a => a.ai);
  ok(bots.every(a => (a.sqIdx === 0) === (a.warCls === 'leader')), '分隊長は分隊の1人目だけ');
  ok(new Set(bots.map(a => a.warCls)).size >= 5, '兵科がばらける ' + [...new Set(bots.map(a => a.warCls))].join(','));
  const t0 = S.m.tickets[0];
  step(G, { [p.id]: { act: [{ a: 'warDeploy', at: 'hq', cls: 'support', gun: 'rpk' }] } });
  for (let i = 0; i < 5; i++) step(G, {});
  ok(p.alive && p.deployed, '出た');
  ok(p.warCls === 'support' && p.maxHp === 125 && p.inv.w[0].id === 'rpk', `兵科と銃 ${p.warCls} ${p.inv.w[0].id} HP${p.maxHp}`);
  const [hx, hz] = S.m.hq[0];
  ok(Math.hypot(p.x - hx, p.z - hz) < 25, '本陣に出る');
  ok(S.m.tickets[0] === t0 - 1, 'チケットが1減る');
});

test('war modes: ドミネーション（拠点3つ・倍の速さで奪う・持っている数だけ点・200点で勝ち）', () => {
  const G = createGame({ map: 'riverbend', mode: 'war', wmode: 'domination', size: 'small', seed: 3, roster: me(), bots: false });
  const S = G.S, p = S.actors[0], m = S.m;
  ok(m.flags.length === 3 && m.limit === WAR_MODES.domination.score && m.timeLimit === 15 * 60, `拠点${m.flags.length}・目標${m.limit}`);
  const f = m.flags[0];
  p.x = f.x; p.z = f.z; p.y = heightAt(G.w, f.x, f.z);
  let t = 0;
  while (f.owner !== 0 && t < 60 * 20) { step(G, inp(p)); t++; }
  near(t / 60, 5, 0.3, `中立から1人で約5秒（コンクエストの半分） ${(t / 60).toFixed(2)}`);
  const s0 = m.score[0];
  for (let i = 0; i < 60 * DOM_RATE * 4; i++) step(G, inp(p));
  ok(m.score[0] - s0 >= 3 && m.score[0] - s0 <= 5, `1つ持つと ${DOM_RATE} 秒ごとに1点 +${m.score[0] - s0}`);
  m.score[0] = m.limit - 1;
  let end = null;
  for (let i = 0; i < 60 * (DOM_RATE + 1) && !end; i++) for (const e of step(G, inp(p))) if (e.e === 'matchend') end = e;
  ok(end && end.win === 0 && m.over, '200点で勝ち');
});

test('war modes: チームデスマッチ（倒した数で点・目標で勝ち・時間切れは多い方）', () => {
  const G = createGame({ map: 'riverbend', mode: 'war', wmode: 'tdm', size: 'small', seed: 5, roster: me() });
  const S = G.S, m = S.m;
  ok(m.per === 8 && m.limit === 50 && m.flags.length === 0, `8対8・50キル（${m.per}・${m.limit}）`);
  ok(S.actors.every(a => a.x >= m.rect[0] && a.x <= m.rect[2] && a.z >= m.rect[1] && a.z <= m.rect[3]), '全員が町の範囲に出る');
  let kills = 0;
  for (let i = 0; i < 60 * 60; i++) for (const e of step(G, {})) if (e.e === 'kill' && S.byId[e.by] && S.byId[e.by].team !== S.byId[e.id].team) kills++;
  ok(kills > 0 && m.score[0] + m.score[1] === kills, `点は倒した数 ${m.score.join('/')}・キル${kills}`);
  m.startT = S.t - Math.round((m.timeLimit - 1) / S.dt);
  m.score = [3, 3];
  let end = null;
  for (let i = 0; i < 120 && !end; i++) for (const e of step(G, {})) if (e.e === 'matchend') end = e;
  ok(end && end.why === 'time', '時間切れで終わる');
});

test('war modes: 射撃場（人形13体・弾は減らない・倒した人形は3秒で同じ所に起き上がる・終わらない）', () => {
  const G = createGame({ map: 'range', mode: 'war', wmode: 'range', seed: 2, roster: me('recon') });
  const S = G.S, p = S.actors[0], m = S.m;
  const dum = S.actors.filter(a => a.dummy);
  ok(dum.length === 13 && !S.actors.some(a => a.ai), `人形 ${dum.length}・ボットなし`);
  ok(dum.some(a => a.dummy.d === 1000) && dum.every(a => Math.abs(a.y - heightAt(G.w, a.x, a.z)) < 0.1), '1000m まで・地面に立つ');
  near(p.yaw, 0, 0.01, '射場の方を向いて立つ');
  const t = dum.find(a => a.dummy.d === 100);
  const x0 = t.x, z0 = t.z;
  // 撃つ（狙いを合わせて単発で数発）
  const ex = p.x, ey = p.y + 1.55, ez = p.z;
  const yaw = Math.atan2(t.x - ex, t.z - ez), pitch = Math.atan2(t.y + 1.25 - ey, Math.hypot(t.x - ex, t.z - ez));
  let hit = 0, killT = -1;
  for (let i = 0; i < 60 * 6 && killT < 0; i++) for (const e of step(G, inp(p, { yaw, pitch, fire: i % 50 < 2, ads: true }))) { if (e.e === 'hit' && e.id === t.id) hit++; if (e.e === 'kill' && e.id === t.id) killT = S.t; }
  ok(hit > 0 && killT > 0, `当たって倒れる（命中${hit}）`);
  ok(!t.alive, '倒れた');
  for (let i = 0; i < 60 * 3.2; i++) step(G, inp(p));
  ok(t.alive && Math.hypot(t.x - x0, t.z - z0) < 0.1 && t.hp === t.maxHp, '3秒で同じ所に起き上がる');
  const wi = p.inv.w[0];
  ok(wi.mags.every(n => n === (wi.cap || 10)), '予備の弾倉はいつも満タン');
  for (let i = 0; i < 60 * 30; i++) step(G, {});
  ok(!m.over, '終わらない');
  // 兵科を変える: 出撃の画面へ戻り、選んで出る
  step(G, { [p.id]: { act: [{ a: 'warRedeploy' }] } });
  ok(!p.alive && p.deployed === false && p.stats.d === 0, '倒されたことにはしない');
  step(G, { [p.id]: { act: [{ a: 'warDeploy', at: 'auto', cls: 'medic', gun: 'mp5' }] } });
  for (let i = 0; i < 3; i++) step(G, {});
  ok(p.alive && p.warCls === 'medic' && p.inv.w[0].id === 'mp5', `衛生の MP5 で出る ${p.warCls} ${p.inv.w[0] && p.inv.w[0].id}`);
});
