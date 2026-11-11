import { test, ok, eq, near } from '../lib/t.mjs';
import { createGame, step } from '../../src/engine/engine.js';
import { vaultPlan, fallDamage, FALL, VAULT } from '../../src/engine/move.js';
import { clearBar } from '../../src/engine/barricade.js';
import { M } from '../../src/engine/data/materials.js';
import { NB, CS, C } from '../../src/engine/world.js';

// 対戦（TDM）は始まりの3秒、出現位置に止められる。その後に置く
function tdm(map) {
  const G = createGame({ map, mode: 'tdm', teams: [1, 1], seed: 3 });
  for (let i = 0; i < 400 && G.S.m.phase === 'pre'; i++) step(G, {});
  const p = G.S.actors.find(a => a.pid === 0);
  for (const a of G.S.actors) if (a !== p) { a.x = 2; a.z = 30; a.y = 0; a.ai = null; a.vx = a.vz = 0; }
  p.hp = p.maxHp || 100;
  return { G, S: G.S, w: G.w, p };
}

// 置いて、向きを決めて、少し待つ（足元を落ち着かせる）
function place(G, p, xc, zc, yaw, y = 0) {
  p.x = xc * CS; p.z = zc * CS; p.y = y; p.vx = p.vz = p.vy = 0; p.yaw = yaw; p.ground = true; p.air = false; p.airTop = null;
  for (let i = 0; i < 5; i++) step(G, { [p.id]: { yaw, pitch: 0, stance: 0 } });
}
// 乗り越えのボタンを押して、着地して落ち着くまで進める（heard: AI に聞こえた音を集める）
function vault(G, p, stance = 0, n = 150, heard = null) {
  const ev = [];
  ev.push(...step(G, { [p.id]: { yaw: p.yaw, pitch: 0, stance, act: [{ a: 'vault' }] } }));
  for (let i = 0; i < n; i++) { ev.push(...step(G, { [p.id]: { yaw: p.yaw, pitch: 0, stance } })); if (heard && G.S.heard) heard.push(...G.S.heard); }
  return ev;
}

test('fall: 落下の傷は2mまで0、1階分（約3m）で約15、5mで約58、7mで約114（受け身で7割）', () => {
  eq(fallDamage(1.9), 0); eq(fallDamage(2.0), 0);
  near(fallDamage(3.05), 14 * Math.pow(1.05, 1.3), 1e-9);
  ok(fallDamage(3.05) > 12 && fallDamage(3.05) < 18, '1階分 ' + fallDamage(3.05).toFixed(1));
  ok(fallDamage(5) > 50 && fallDamage(5) < 65, '5m ' + fallDamage(5).toFixed(1));
  ok(fallDamage(7) > 100, '7m は即死に近い ' + fallDamage(7).toFixed(1));
  eq(FALL.roll, 0.7);
});

test('vault: 低い壁を越える（同じ高さの床に降りる。傷なし）', () => {
  const G = createGame({ map: 'training', mode: 'train', seed: 7, team: 1, house: false });
  const p = G.S.actors[0];
  place(G, p, 17.6, 48.6, Math.PI); // 射座の低い壁（z=47）の南、北を向く
  ok(vaultPlan(G.S, G.w, p), '越えられる見込み');
  const hp = p.hp, ev = vault(G, p);
  ok(p.z * 2 < 47, '低い壁の北へ出た ' + (p.z * 2).toFixed(2));
  near(p.y, 0, 0.01, '同じ高さ');
  eq(p.hp, hp, '傷なし');
  ok(!ev.some(e => e.e === 'hit'), '当たりの出来事なし');
});

test('vault: 天板だけのテーブルも越えられる（足元の空いた家具）', () => {
  const G = createGame({ map: 'training', mode: 'train', seed: 7, team: 1, house: true });
  const p = G.S.actors[0];
  for (const a of G.S.actors) if (a !== p) { a.x = 80; a.z = 5; a.ai = null; } // 住人役は遠ざける
  place(G, p, 38.4, 35, Math.PI / 2); // D室のテーブル（40,35・90°）の西、東を向く
  const pl = vaultPlan(G.S, G.w, p);
  ok(pl && pl.top - p.y > 0.7 && pl.top - p.y < 0.95, 'てっぺんは天板の上 ' + (pl && (pl.top - p.y).toFixed(2)));
  vault(G, p);
  ok(p.x * 2 > 40.9, 'テーブルの東へ出た ' + (p.x * 2).toFixed(2));
});

test('vault: 高すぎる物（積んだ木箱2m）と、板を打った窓は越えられない。板が崩れたら窓から出られる', () => {
  const G = createGame({ map: 'training', mode: 'train', seed: 7, team: 1, house: true });
  const { S, w } = G, p = S.actors[0];
  for (const a of S.actors) if (a !== p) { a.x = 80; a.z = 5; a.ai = null; }
  place(G, p, 4.5, 12.0, Math.PI); // 射撃場の積んだ木箱（4.5,10）の南
  eq(vaultPlan(S, w, p), null, '2mの木箱は越えられない');
  // キルハウス D室の南の窓（37〜40, z=40）: 板を打ってある
  place(G, p, 38.5, 38.7, 0);
  const s = w.bars.find(b => b.kind === 'win' && b.cells.includes(w.idx(0, 38, 40)));
  ok(s && S.bars[s.id].h, '窓に板');
  eq(vaultPlan(S, w, p), null, '板があると越えられない');
  clearBar(S, w, s.id, [], 'fall');
  const pl = vaultPlan(S, w, p);
  ok(pl && pl.drop === 0, '板が崩れると越えられる（1階なので飛び降りではない）');
  vault(G, p);
  ok(p.z * 2 > 40.6, '窓の外へ出た ' + (p.z * 2).toFixed(2));
});

test('vault: 2階の窓から飛び降りると落ちて、高さに応じて傷と怯み（かがんで着地すると軽い）。AI に聞こえる', () => {
  for (const crouch of [0, 1]) {
    const { G, S, w, p } = tdm('suburb');
    // 寝室2の北の窓（18〜21, z=14, 2階）のガラスを割っておく
    for (let x = 18; x <= 21; x++) { const k = w.idx(1, x, 14); w.blocks[k * NB + 1] = w.blocks[k * NB + 2] = M.GLASSBROKEN; }
    place(G, p, 19.5, 15.8, Math.PI, 3.0);
    const pl = vaultPlan(S, w, p);
    ok(pl && pl.drop > 2.8 && pl.drop < 3.3, '飛び降りの見込み ' + (pl && pl.drop.toFixed(2)));
    const heard = [];
    const hp = p.hp, ev = vault(G, p, crouch, 200, heard);
    near(p.y, 0, 0.02, '地面に着いた');
    ok(p.z * 2 < 14, '家の外 ' + (p.z * 2).toFixed(2));
    const f = ev.find(e => e.e === 'fall');
    ok(f && f.h > 2.8, '着地の出来事 ' + JSON.stringify(f));
    eq(hp - p.hp, f.d, `傷 ${hp - p.hp}（${crouch ? '受け身' : 'ふつう'}）`);
    near(f.d, fallDamage(f.h) * (crouch ? FALL.roll : 1), 1.2, '落ちた高さどおりの傷');
    ok(p.alive, '1階分では死なない');
    ok(heard.some(h => h.id === p.id && h.loud > 1), '着地の音が聞こえる');
  }
});

test('vault: 2階の外廊下の手すりからも飛び降りられる（宙では何もないマスを落ちていく）', () => {
  const { G, S, w, p } = tdm('motel');
  place(G, p, 50, 30.2, 0, 3.0); // 2階の外廊下（手すり z=31）の内側、南を向く
  const pl = vaultPlan(S, w, p);
  ok(pl && pl.drop > 2.5, '手すりの向こうは駐車場 ' + (pl && pl.drop.toFixed(2)));
  vault(G, p, 0, 200);
  ok(p.y < 1.5, '駐車場（地面か止めてある車の上）に着いた ' + p.y.toFixed(2));
  ok(p.z * 2 > 31.5, '手すりの外 ' + (p.z * 2).toFixed(2));
  ok(!p.air && p.ground, '着地したら宙の状態は終わる');
});

test('vault: 割れていない2階の窓も、割って飛び降りる（窓の板は1枚ぜんぶ割れる）', () => {
  const { G, S, w, p } = tdm('suburb');
  place(G, p, 19.5, 15.8, Math.PI, 3.0); // 寝室2の北の窓（18〜21, z=14, 2階）の内側、北を向く
  const cells = [18, 19, 20, 21].map(x => w.idx(1, x, 14));
  ok(cells.every(k => w.blocks[k * NB + 1] === M.GLASS), 'ガラスがある');
  const pl = vaultPlan(S, w, p, {});
  ok(pl && pl.gk >= 0 && pl.drop > 2.8, '割って飛び降りる見込み ' + JSON.stringify(pl && { gk: pl.gk, drop: pl.drop }));
  const ev = vault(G, p, 1, 220);
  const g = ev.find(e => e.e === 'glass');
  ok(g && g.ks && g.ks.length === 4, '窓の4マスが1度に割れる ' + JSON.stringify(g && g.ks));
  ok(cells.every(k => w.blocks[k * NB + 1] === M.GLASSBROKEN && w.blocks[k * NB + 2] === M.GLASSBROKEN), 'ぜんぶ割れた');
  near(p.y, 0, 0.02, '地面に着いた');
  ok(p.z * 2 < 14, '家の外');
  ok(ev.some(e => e.e === 'fall' && e.roll === 1), 'かがんで着地（受け身）');
});

test('vault: 窓の正面から少しずれて立っていても、窓の開いた所を通る', () => {
  const G = createGame({ map: 'training', mode: 'train', seed: 7, team: 1, house: true });
  const { S, w } = G, p = S.actors[0];
  for (const a of S.actors) if (a !== p) { a.x = 80; a.z = 5; a.ai = null; }
  // 監視室の北の窓（78〜80, z=8）。板を外し、窓の西の端より少し西に立つ（まっすぐ前は壁）
  const s = w.bars.find(b => b.kind === 'win' && b.cells.includes(w.idx(0, 79, 8)));
  if (s) clearBar(S, w, s.id, [], 'fall');
  place(G, p, 77.9, 9.5, Math.PI);
  const pl = vaultPlan(S, w, p, {});
  ok(pl, '越えられる');
  vault(G, p);
  ok(p.z * 2 < 7.6, '窓の外へ出た ' + (p.z * 2).toFixed(2));
  ok(p.x * 2 > 78.2 && p.x * 2 < 80.8, '窓の幅の中を通った ' + (p.x * 2).toFixed(2));
});

test('vault: 向こうに降りる所がない物（壁ぎわのカウンター）は、上に乗る。端から歩いて降りても傷なし', () => {
  const { G, S, w, p } = tdm('suburb');
  place(G, p, 47.6, 39.2, Math.PI / 2); // 台所の東の壁ぎわのカウンター（49.1, 39.2・高さ0.95）の西、東を向く
  const pl = vaultPlan(S, w, p, {});
  ok(pl && pl.onto === 1 && pl.crouch === 0, '上に乗る（立てる） ' + JSON.stringify(pl && { onto: pl.onto, crouch: pl.crouch }));
  const hp = p.hp;
  vault(G, p, 0, 60);
  near(p.y, 0.95, 0.02, 'カウンターの上');
  ok(p.ground && p.st < 0.1, '立っている');
  // 西へ歩いて降りる
  const ev = [];
  for (let i = 0; i < 90; i++) ev.push(...step(G, { [p.id]: { mx: 0, mz: 1, yaw: -Math.PI / 2, pitch: 0, stance: 0 } }));
  near(p.y, 0, 0.02, '床に降りた');
  eq(p.hp, hp, '傷なし');
  ok(!ev.some(e => e.e === 'fall'), '1mでは着地の出来事なし');
});

test('vault: 天井が低い所で高い物（1.3mの書類棚）の上に乗るとかがむ。立とうとしても立てない', () => {
  const { G, S, w, p } = tdm('suburb');
  // 洗濯室の書類棚（19.9, 20.2・高さ1.3）の上に置く
  p.x = 19.9 * CS; p.z = 20.2 * CS; p.y = 1.3; p.vx = p.vz = p.vy = 0; p.ground = true; p.air = false;
  for (let i = 0; i < 60; i++) step(G, { [p.id]: { yaw: 0, pitch: 0, stance: 0 } });
  near(p.y, 1.3, 0.02, '棚の上にいる');
  ok(p.st > 0.95, 'かがむ ' + p.st.toFixed(2));
});

test('vault: 車も越えられる（屋根1.45m）。物の上に乗っても、高いフェンス（2.1m）は越えられない', () => {
  const G = createGame({ map: 'training', mode: 'train', seed: 7, team: 1, house: false });
  const { S, w } = G, p = S.actors[0];
  place(G, p, 46, 52.6, 0); // 駐車場の車（46,55・横向き）の北、南を向く
  const pl = vaultPlan(S, w, p, {});
  ok(pl && !pl.onto && pl.top - p.y > 1.3, '車を越える ' + JSON.stringify(pl && { top: pl.top, onto: pl.onto }));
  vault(G, p);
  ok(p.z * 2 > 56.5, '車の南へ出た ' + (p.z * 2).toFixed(2));
  // アパートの西の金網（x=3）: 木箱（1m）の上に乗っている体で調べる
  const A = tdm('apartment');
  const q = A.p;
  q.x = 4.3 * CS; q.z = 30 * CS; q.y = 1.0; q.yaw = -Math.PI / 2; q.ground = true; q.air = false; q.vault = null; q.st = 0;
  ok(A.w.cell[A.w.idx(0, 3, 30)] === C.FENCE, '金網がある');
  eq(vaultPlan(A.S, A.w, q, {}), null, '金網は越えられない');
  const keep = VAULT.tall; VAULT.tall = 99;
  const pl2 = vaultPlan(A.S, A.w, q, {});
  VAULT.tall = keep;
  ok(pl2, '（高さの決まりがなければ越えられる位置）');
});
