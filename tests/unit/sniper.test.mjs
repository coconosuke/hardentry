import { test, ok, eq, near } from '../lib/t.mjs';
import { createGame, step } from '../../src/engine/engine.js';
import { WEAPONS, zoomOf, attachOptions, opticOf, ATTACH } from '../../src/engine/data/weapons.js';
import { makeWeapon } from '../../src/engine/actor.js';
import { gunModel } from '../../src/render/guns.js';
import { renderSfx, gunKeys } from '../../src/audio/synth.js';
import { PVP_ARMOR } from '../../src/engine/move.js';

// 訓練場で、主武器を狙撃銃（AT308・狙撃用スコープ）に持ち替えた人
function mkSniper() {
  const G = createGame({ map: 'training', mode: 'train', seed: 7, team: 1, house: false });
  const p = G.S.actors[0];
  p.inv.w[0] = makeWeapon({ id: 'at308', sight: 'sniper', ammo: 'ap' });
  p.ws.slot = 0; p.ws.st = 'draw'; p.ws.t = 0.1;
  for (let i = 0; i < 30; i++) step(G, { [p.id]: { yaw: p.yaw, pitch: 0 } });
  return { G, p, wi: p.inv.w[0] };
}

test('sniper: ボルトアクションは1発ごとにボルトを操作し（約0.95秒）、その間は撃てない', () => {
  const { G, p, wi } = mkSniper();
  eq(p.ws.st, 'ready', '構えられる');
  const mag0 = wi.mag;
  let ev = step(G, { [p.id]: { yaw: p.yaw, pitch: 0, fire: true } });
  ok(ev.some(e => e.e === 'shot'), '撃てる');
  ok(ev.some(e => e.e === 'bolt' && e.id === p.id), 'ボルトの操作が始まる（音と薬莢の合図）');
  eq(p.ws.st, 'pump', 'ボルトの操作中');
  eq(wi.ch, 0, '薬室は空');
  // 押し直しても、ボルトの操作が終わるまでは撃てない
  let shots = 0;
  for (let i = 0; i < 50; i++) { const fire = i % 2 === 0; ev = step(G, { [p.id]: { yaw: p.yaw, pitch: 0, fire } }); shots += ev.filter(e => e.e === 'shot').length; }
  eq(shots, 0, '0.83秒のあいだは撃てない');
  for (let i = 0; i < 12; i++) step(G, { [p.id]: { yaw: p.yaw, pitch: 0 } });
  eq(p.ws.st, 'ready', 'ボルトを押して次の弾が入った');
  eq(wi.ch, 1, '薬室に弾'); eq(wi.mag, mag0 - 1, '弾倉から1発');
  ev = step(G, { [p.id]: { yaw: p.yaw, pitch: 0, fire: true } });
  ok(ev.some(e => e.e === 'shot'), '次の1発');
});

test('sniper: 射撃モードのボタンでスコープの倍率が4倍と8倍に切り替わる（ほかのスコープは固定）', () => {
  const { G, p, wi } = mkSniper();
  eq(zoomOf(wi), 4, '最初は4倍');
  let ev = step(G, { [p.id]: { yaw: p.yaw, pitch: 0, act: [{ a: 'mode' }] } });
  ok(ev.some(e => e.e === 'zoom' && e.z === 8), '8倍に');
  eq(zoomOf(wi), 8);
  ev = step(G, { [p.id]: { yaw: p.yaw, pitch: 0, act: [{ a: 'mode' }] } });
  eq(zoomOf(wi), 4, '4倍に戻る');
  eq(zoomOf(makeWeapon({ id: 'at308', sight: 'acog' })), 4, 'ACOG は4倍のまま');
  eq(zoomOf(makeWeapon({ id: 'at308', sight: 'lpvo' })), 4, '等倍〜4倍は4倍から');
  ok(attachOptions('at308').sight[0] === 'sniper', '既定は狙撃用スコープ');
});

test('sniper: 構えると照準が揺れる（伏せると小さく、構えていないと揺れない）。弾も揺れた向きへ飛ぶ', () => {
  const { G, p } = mkSniper();
  const swing = (stance) => {
    let m = 0;
    for (let i = 0; i < 150; i++) { step(G, { [p.id]: { yaw: p.yaw, pitch: 0, ads: true, stance } }); if (i > 60) m = Math.max(m, Math.hypot(p.ws.sx, p.ws.sy)); }
    return m;
  };
  const stand = swing(0), prone = swing(2);
  ok(stand > 0.05 && stand < 0.4, `立って構えると揺れる ${stand.toFixed(3)}°`);
  ok(prone < stand * 0.5, `伏せると小さい ${prone.toFixed(3)}° < ${stand.toFixed(3)}°`);
  for (let i = 0; i < 60; i++) step(G, { [p.id]: { yaw: p.yaw, pitch: 0, ads: false, stance: 0 } });
  eq(p.ws.sx, 0, '構えていないと揺れない');
  ok(WEAPONS.mk18.sway == null, '小銃には揺れがない');
});

test('sniper: 形（狙撃用スコープ・動くボルト・箱弾倉）と音（銃声・ボルト）が作れる', () => {
  const g = gunModel('at308', { sight: 'sniper', muzzle: 'brake' });
  ok(g && g.pts.optic && g.pts.optic.kind === 'sniper' && g.pts.optic.scope, 'スコープをのぞく（HUD の狙撃用の十字）');
  ok(g.pump && g.pts.bolt && g.pts.boltPt, 'ボルトは別の部品で、右手で操作する点がある');
  ok(g.mag, '弾倉は別の部品（リロードで動く）');
  ok(g.len > 0.6, `長い銃身 ${g.len.toFixed(2)}m`);
  for (const sight of attachOptions('at308').sight) ok(gunModel('at308', { sight }), `照準器 ${sight}`);
  const k = gunKeys(WEAPONS.at308.snd);
  eq(k.near, 'r308', '近い音は狙撃銃の音'); eq(k.far, 'far_r'); eq(k.supp, 'sup_r');
  const shot = renderSfx('r308', 0, 22050), bolt = renderSfx('bolt', 0, 22050);
  ok(shot.length > 2000 && Math.max(...shot.map(Math.abs)) > 0.5, '銃声');
  near(bolt.length / 22050, WEAPONS.at308.pump + 0.1, 0.01, 'ボルトの音の長さは操作の時間に合わせる');
});

test('sniper: 対戦の1発（胴）は軽装・中装を倒し、重装は耐える。頭は即死（ほかの銃と同じ）', () => {
  const d = WEAPONS.at308.pvp.dmg;
  ok(d >= PVP_ARMOR.medium.hp && d < PVP_ARMOR.heavy.hp, `胴 ${d}（中装 ${PVP_ARMOR.medium.hp}・重装 ${PVP_ARMOR.heavy.hp}）`);
  ok(d * 0.75 < PVP_ARMOR.light.hp, '手足は1発では倒れない');
});

test('optics: 2・3・4・6・8倍の照準器（実在の物）。等倍に切り替えられる物は、等倍で照準の見え方が変わる', () => {
  const z = (sight, zi = 0) => { const wi = makeWeapon({ id: 'hk417', sight }); wi.zi = zi; return { zoom: zoomOf(wi), o: opticOf(wi) }; };
  eq(z('acog2').zoom, 2, '2倍（ACOG TA47）');
  eq(z('mag3').zoom, 3, '3倍（EXPS3＋G33）'); ok(z('mag3').o.scope, '3倍はスコープの像');
  const m1 = z('mag3', 1); eq(m1.zoom, 1, 'ブースターを倒すと等倍'); eq(m1.o.kind, 'holo', '等倍はホロサイトの照準'); ok(!m1.o.scope, '銃とホロの窓が見える');
  eq(z('acog').zoom, 4, '4倍（ACOG TA31）');
  eq(z('lpvo').zoom, 4); const l1 = z('lpvo', 1); eq(l1.zoom, 1); ok(l1.o.scope && l1.o.wide, '等倍〜4倍の等倍は広い視野のスコープ');
  eq(z('scope6').zoom, 6, '6倍（ACOG TA648）');
  eq(z('lpvo8').zoom, 8, '8倍（NX8 1-8x24）'); eq(z('lpvo8', 1).zoom, 1);
  for (const k of ['acog2', 'mag3', 'acog', 'lpvo', 'scope6', 'lpvo8', 'sniper']) ok(/（.+）/.test(ATTACH.sight[k].name), `実在の照準器の名前 ${ATTACH.sight[k].name}`);
  const g = gunModel('hk416', { sight: 'mag3' });
  ok(g.flip && g.pts.flipPivot, 'ブースターは横へ倒れる別の部品');
  for (const k of ['acog2', 'acog', 'lpvo', 'scope6', 'lpvo8']) { const m = gunModel('hk417', { sight: k }); ok(m.pts.optic && m.pts.optic.kind === k && m.pts.optic.scope, `形 ${k}`); }
});

test('optics: 構えている間は射撃モードのボタンで倍率を、構えていないときは連射・単発を切り替える', () => {
  const G = createGame({ map: 'training', mode: 'train', seed: 7, team: 1, house: false });
  const p = G.S.actors[0];
  p.inv.w[0] = makeWeapon({ id: 'hk416', sight: 'lpvo8', ammo: 'ap' });
  p.ws.slot = 0; p.ws.st = 'draw'; p.ws.t = 0.1;
  for (let i = 0; i < 30; i++) step(G, { [p.id]: { yaw: p.yaw, pitch: 0 } });
  const wi = p.inv.w[0], m0 = wi.mode;
  let ev = step(G, { [p.id]: { yaw: p.yaw, pitch: 0, act: [{ a: 'mode' }] } });
  ok(ev.some(e => e.e === 'fmode') && wi.mode !== m0, '構えていない: 射撃モード');
  eq(zoomOf(wi), 8, '倍率はそのまま');
  for (let i = 0; i < 40; i++) step(G, { [p.id]: { yaw: p.yaw, pitch: 0, ads: true } });
  const m1 = wi.mode;
  ev = step(G, { [p.id]: { yaw: p.yaw, pitch: 0, ads: true, act: [{ a: 'mode' }] } });
  ok(ev.some(e => e.e === 'zoom' && e.z === 1), '構えている: 等倍へ');
  eq(wi.mode, m1, '射撃モードはそのまま');
  // 手元で決めた向き（オンラインのゲスト）: 構えていても zoom: false なら射撃モード
  ev = step(G, { [p.id]: { yaw: p.yaw, pitch: 0, ads: true, act: [{ a: 'mode', zoom: false }] } });
  ok(ev.some(e => e.e === 'fmode') && wi.mode !== m1, '手元の指示どおり射撃モード');
});

test('optics: 付けられる銃は実銃の取り付け方に合わせる', () => {
  const S = (id) => attachOptions(id).sight;
  ok(!S('mk18').includes('lpvo8') && !S('mk18').includes('scope6'), 'Mk18（短い銃身）に等倍〜8倍・6倍はない');
  ok(S('hk417').includes('scope6') && S('hk417').includes('lpvo8'), 'HK417（7.62mm・選抜射手）は6倍と等倍〜8倍');
  ok(S('g3').includes('scope6') && !S('g3').includes('mag3'), 'G3 は爪の台に6倍まで（ブースターはなし）');
  ok(S('m4a1').includes('lpvo8') && !S('m4a1').includes('scope6'), 'M4A1 は等倍〜8倍、6倍（7.62mm 用）はなし');
  eq(S('akm').join(), 'iron', 'AKM は照準器なし');
  ok(S('mp7').includes('acog2') && !S('mp7').includes('mag3'), 'MP7 は2倍まで（レールが短い）');
  ok(S('mpx').includes('mag3'), 'MPX は上のレールが長いのでブースターも');
  ok(!S('m4super').some(k => ATTACH.sight[k].scope), '散弾銃に倍率の照準器はない');
  ok(!S('vz58').includes('mag3'), 'vz.58 の短いレールにブースターは付かない');
  eq(S('at308')[0], 'sniper', '狙撃銃の既定は狙撃用スコープ');
});
