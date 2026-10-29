// テスト一式: node tests/run_all.mjs [--quick] → test-results/summary.md
// 1 ビルド  2 単体  3 音  4 自動対戦（簡易）  5 画面の流れ・タップ・2本指・音の開始・保存・画面の作り直し  6 全サイズの見た目
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runUnit } from './unit/run.mjs';
import { runAudioTests } from './audio.test.mjs';
import { runOne, summarize } from '../tools/simcore.mjs';
import { launch, openPage, waitTitle, ROOT } from './lib/browser.mjs';
import { layoutCheck } from './lib/layout.mjs';

const QUICK = process.argv.includes('--quick');
const NOSIZE = process.argv.includes('--no-sizes');
const OUT = path.join(ROOT, 'test-results');
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const note = [];
const rec = (group, name, ok, detail = '') => { results.push({ group, name, ok, detail }); console.log(`${ok ? 'OK' : 'NG'} [${group}] ${name}${detail ? ' — ' + detail : ''}`); };
const t0 = Date.now();

// 1 ビルド
try {
  const o = execFileSync('node', [path.join(ROOT, 'tools/build.mjs')], { encoding: 'utf8' });
  const info = JSON.parse(o.trim().split('\n').pop());
  rec('ビルド', 'ビルドできる', true, `Claude版 ${info.claude}・アプリ版 ${info.app}・ソース一式 ${info.files}ファイル`);
  const html = fs.readFileSync(path.join(ROOT, 'dist/claude/index.html'), 'utf8');
  rec('ビルド', 'Claude版にdoctype/html/head/bodyを書かない', !/<!doctype|<html|<head|<body/i.test(html.slice(0, 2000)));
  rec('ビルド', 'Claude版の外部読み込みは Google Fonts だけ', [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].every(m => /^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/.test(m[1])));
  rec('ビルド', 'alert/confirm/prompt を使わない', !/\b(alert|confirm|prompt)\(/.test(html.replace(/confirmTap|textModal/g, '')));
  rec('ビルド', '16MB以下', html.length < 16 * 1024 * 1024, (html.length / 1048576).toFixed(2) + 'MB');
  const app = fs.readFileSync(path.join(ROOT, 'dist/app/index.html'), 'utf8');
  rec('アプリ版', 'apple-touch-icon はページ内のdata URL', /rel="apple-touch-icon" href="data:image\/png;base64,/.test(app));
  rec('アプリ版', '.nojekyll・manifest・sw.js がある', ['.nojekyll', 'manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png'].every(f => fs.existsSync(path.join(ROOT, 'dist/app', f))));
  const sw = fs.readFileSync(path.join(ROOT, 'dist/app/sw.js'), 'utf8');
  rec('アプリ版', 'SWはno-cacheで確かめ、ビルドごとのキャッシュ名、アイコンは横取りしない', /cache: 'no-cache'/.test(sw) && /miteru-[0-9a-f]{10}/.test(sw) && /png\|webmanifest/.test(sw));
  // ソース一式から復元できる
  const tmp = path.join(OUT, 'restore-check');
  fs.rmSync(tmp, { recursive: true, force: true });
  execFileSync('node', [path.join(ROOT, 'tools/unbundle.mjs'), path.join(ROOT, 'dist/source-bundle.txt'), tmp]);
  const same = ['src/app/main.js', 'src/engine/creature.js', 'src/assets/creature.bin', 'DESIGN.md'].every(f => Buffer.compare(fs.readFileSync(path.join(ROOT, f)), fs.readFileSync(path.join(tmp, f))) === 0);
  rec('ビルド', 'ソース一式から元どおり復元できる', same);
  fs.rmSync(tmp, { recursive: true, force: true });
} catch (e) { rec('ビルド', 'ビルドできる', false, e.message.slice(0, 300)); }

// 2 単体
try {
  const u = await runUnit();
  const bad = u.filter(r => !r.ok);
  rec('単体', `エンジンの単体テスト ${u.length}件`, !bad.length, bad.map(r => r.name).join(', '));
} catch (e) { rec('単体', '単体テスト', false, e.message); }

// 3 音
try {
  const a = runAudioTests();
  rec('音', `効果音と声の数値検査 ${a.rows.length}件（無音・割れ・NaN・長さ・直流・切れ）`, !a.fails.length, a.fails.slice(0, 5).join(' / '));
} catch (e) { rec('音', '音の検査', false, e.message); }

// 4 自動対戦（簡易）
try {
  const N = QUICK ? 12 : 40;
  const rates = {};
  for (const diff of ['easy', 'normal', 'hard']) {
    const rows = [];
    for (let i = 1; i <= N; i++) rows.push(runOne(String(1000 + i), diff, 'average', { maxTime: 1200 }));
    const sm = summarize(rows);
    rates[diff] = sm;
  }
  const esc = (d) => rates[d].escape;
  rec('自動対戦', `各難易度${N}試合が最後まで動く`, true, ['easy', 'normal', 'hard'].map(d => `${d} 脱出${Math.round(esc(d) * 100)}%`).join('・'));
  rec('自動対戦', '難しいほど脱出しにくい', esc('easy') >= esc('normal') && esc('normal') >= esc('hard') - 0.05);
} catch (e) { rec('自動対戦', '自動対戦', false, e.message); }

// 5・6 ブラウザ
const SIZES = [
  { id: 'iphone14-横', w: 844, h: 390, insets: { l: 47, r: 47, b: 21 }, orient: 90, touch: true },
  { id: 'iphone14-縦', w: 390, h: 844, insets: { t: 47, b: 34 }, orient: 0, touch: true },
  { id: 'iphoneSE-横', w: 667, h: 375, insets: {}, orient: -90, touch: true },
  { id: 'iphoneSE-縦', w: 375, h: 667, insets: { t: 20 }, orient: 0, touch: true },
  { id: 'proMax-横', w: 932, h: 430, insets: { l: 59, r: 59, b: 21 }, orient: -90, touch: true },
  { id: 'proMax-縦', w: 430, h: 932, insets: { t: 59, b: 34 }, orient: 0, touch: true },
  { id: 'mini-横', w: 812, h: 375, insets: { l: 50, r: 50, b: 21 }, orient: 90, touch: true },
  { id: '小さい-横', w: 568, h: 320, insets: {}, orient: 90, touch: true },
  { id: 'iPad-横', w: 1180, h: 820, insets: { b: 20 }, orient: 90, touch: true },
  { id: 'PC', w: 1280, h: 720, insets: {}, orient: null, touch: false },
];
if (QUICK) SIZES.splice(4);
if (NOSIZE) SIZES.splice(1);

const env = await launch();
const INIT = `
  try { localStorage.setItem('miteru.v1.settings', JSON.stringify({ quality: 'low', fps: 30 })); } catch (e) {}
  Object.defineProperty(window, 'orientation', { configurable: true, get: () => (globalThis.__testOrient == null ? undefined : globalThis.__testOrient) });
  globalThis.__testInsets = { l: 47, r: 47, b: 21 }; globalThis.__testOrient = 90;
`;
const layoutProblems = [];
try {
  const { ctx, page, logs } = await openPage(env, 'dist/claude/preview.html', { w: 844, h: 390, touch: true, mobile: true, init: INIT });
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });
  const tb = Date.now();
  await waitTitle(page, 240000);
  rec('起動', 'タイトルまで動く（エラーなし）', !logs.length, `${((Date.now() - tb) / 1000).toFixed(0)}秒（ソフトウェア描画）${logs.length ? ' / ' + logs[0] : ''}`);
  // 音は指を離したときに始まる
  const before = await page.evaluate(() => !!window.__app.audio.ctx);
  const set = await page.evaluate(() => { const r = document.querySelector('.mi[data-a="settings"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: set.x, y: set.y, id: 1 }] });
  await page.waitForTimeout(200);
  const during = await page.evaluate(() => !!window.__app.audio.ctx);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(600);
  const afterA = await page.evaluate(() => ({ ctx: !!window.__app.audio.ctx, st: window.__app.audio.ctx && window.__app.audio.ctx.state, scr: window.__app.screens.cur }));
  rec('音', '音は指を離したときに始まる（押した瞬間ではない）', !before && !during && afterA.ctx, `押す前:${before} 押している間:${during} 離した後:${afterA.ctx}(${afterA.st})`);
  rec('タップ', '指を離したときに反応する（メニュー→設定）', afterA.scr === 'settings');
  // 音の種類（集計）
  await page.waitForFunction(() => window.__app.audio.genDone === true && Object.values(window.__app.audio.voices).reduce((a, l) => a + l.length, 0) >= 36, null, { timeout: 90000 }).catch(() => {});
  const ac = await page.evaluate(() => ({ sfx: Object.keys(window.__app.audio.buf).length, voices: Object.values(window.__app.audio.voices).reduce((a, l) => a + l.length, 0), session: navigator.audioSession ? navigator.audioSession.type : 'なし' }));
  rec('音', '効果音を作り、声を読み込める', ac.sfx >= 20 && ac.voices >= 30, `効果音${ac.sfx}種・声${ac.voices}本`);

  // 回した画面での操作（縦持ち）
  await page.evaluate(() => { globalThis.__testInsets = { t: 47, b: 34 }; globalThis.__testOrient = 0; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__app.stage.layout());
  await page.evaluate(() => window.__app.screens.reset('settings', 'gfx'));
  await page.waitForTimeout(300);
  // スライダーを回した画面で右へ動かす（画面では下へ）
  const sl = await page.evaluate(() => { const t = document.querySelectorAll('.screen.settings .track')[1]; const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y0: r.top + 4, y1: r.bottom - 4, v: window.__app.settings.bright }; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sl.x, y: sl.y0, id: 2 }] });
  for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sl.x, y: sl.y0 + (sl.y1 - sl.y0) * k / 6, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const bright = await page.evaluate(() => window.__app.settings.bright);
  rec('回した画面', 'スライダーが指の向きどおりに動く', bright > sl.v + 0.3, `明るさ ${sl.v} → ${bright}`);
  // 自前スクロール（画面では右から左へなぞる＝ステージでは下から上）
  const sc0 = await page.evaluate(() => document.querySelector('.screen.settings .pane').scrollTop);
  const pr = await page.evaluate(() => { const r = document.querySelector('.screen.settings .pane').getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.85 }; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pr.x, y: pr.y, id: 3 }] });
  for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pr.x + k * 20, y: pr.y, id: 3 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);
  const sc1 = await page.evaluate(() => document.querySelector('.screen.settings .pane').scrollTop);
  rec('回した画面', '設定の一覧を指でスクロールできる', sc1 > sc0 + 40, `${sc0} → ${sc1}`);
  await page.evaluate(() => window.__app.screens.reset('title'));

  // 名前（回した画面の外で入力）
  await page.evaluate(() => window.__app.screens.reset('char'));
  await page.waitForTimeout(200);
  await page.tap('.screen.char .rename');
  await page.waitForSelector('.tmodal input');
  const tmRot = await page.evaluate(() => { const el = document.querySelector('.tmodal'); return { inStage: !!el.closest('#stage'), tf: getComputedStyle(el).transform }; });
  await page.fill('.tmodal input', 'カナタ');
  await shot('名前入力-縦');
  await page.tap('.tmodal .tm-ok');
  await page.waitForTimeout(200);
  const nm = await page.evaluate(() => window.__app.profile.name);
  rec('文字入力', '名前の入力は回した画面の外で、端末の向きのまま', !tmRot.inStage && tmRot.tf === 'none' && nm === 'カナタ', `名前=${nm}`);
  await page.evaluate(() => { window.__app.profile.name = 'あなた'; window.__app.saveProfile(); });

  // 全サイズの見た目
  const SCREENS = [
    ['title', []], ['diff', []], ['char', []],
    ['settings', ['gfx']], ['settings', ['sound']], ['settings', ['ctrl']], ['settings', ['hud']], ['settings', ['data']],
    ['help', ['play']], ['help', ['found']], ['help', ['hide']], ['help', ['ctrl']], ['help', ['book']],
  ];
  // ゲームを1つ始めておく（HUD・一時停止・結果の検査用）
  await page.evaluate(() => window.__app.startGame('normal'));
  await page.waitForFunction(() => window.__app.mode === 'game', null, { timeout: 120000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__app.pauseGame());
  await page.evaluate(() => { window.__app.freeze = true; }); // 見た目の検査中は3Dを止めて速くする
  const fakeRes = { result: 'escaped', time: 421, diff: 'normal', how: null, keys: 2, keysNeed: 2, dist: 612, hides: 4, unnoticed: 2, qteOk: 1, qteFail: 0, spotted: 2, found: 0, chaseTime: 38, dashTime: 51, newBest: true };
  for (const S of SIZES) {
    await page.evaluate(([ins, o]) => { globalThis.__testInsets = ins; globalThis.__testOrient = o; }, [S.insets, S.orient]);
    await page.setViewportSize({ width: S.w, height: S.h });
    await page.evaluate(() => window.__app.stage.layout());
    await page.waitForTimeout(150);
    const check = async (label) => {
      await page.waitForTimeout(220);
      const r = await page.evaluate(layoutCheck);
      const bad = r.problems.filter(p => p.kind !== '省略(…)');
      for (const p of r.problems) layoutProblems.push({ size: S.id, screen: label, ...p });
      await shot(`${S.id}-${label}`);
      return bad;
    };
    let nBad = 0, list = [];
    // 一時停止中のゲームの上に出る画面
    for (const [name, args] of [['pause', []]]) { await page.evaluate(([n, a]) => window.__app.screens.reset(n, ...a), [name, args]); const b = await check(name); nBad += b.length; list.push(...b.map(x => name + ':' + x.kind)); }
    // HUD
    await page.evaluate(() => { window.__app.screens.hide(); window.__app.hud.show(true); window.__app.hud.layout(); window.__app.game.redraw(); });
    { const b = await check('HUD'); nBad += b.length; list.push(...b.map(x => 'HUD:' + x.kind + ' ' + (x.el || ''))); }
    await page.evaluate(() => window.__app.hud.show(false));
    // 結果
    await page.evaluate((res) => window.__app.screens.reset('result', res), fakeRes);
    { const b = await check('結果'); nBad += b.length; list.push(...b.map(x => '結果:' + x.kind + ' ' + (x.el || ''))); }
    // メニュー（タイトル側の画面。背景はゲームのまま）
    for (const [name, args] of SCREENS) {
      await page.evaluate(([n, a]) => window.__app.screens.reset(n, ...a), [name, args]);
      const b = await check(name + (args[0] ? '-' + args[0] : ''));
      nBad += b.length; list.push(...b.map(x => name + (args[0] ? '-' + args[0] : '') + ':' + x.kind + ' ' + (x.el || '')));
    }
    await page.evaluate(() => window.__app.screens.reset('pause'));
    rec('見た目', `${S.id}（${S.w}×${S.h}）: はみ出し・切れ・重なり・安全領域`, nBad === 0, list.slice(0, 4).join(' / '));
  }
  await page.evaluate(() => { globalThis.__testInsets = { l: 47, r: 47, b: 21 }; globalThis.__testOrient = 90; window.__app.freeze = false; });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => window.__app.stage.layout());

  // 2本指の同時操作（回していない横画面）
  await page.evaluate(() => window.__app.resumeGame());
  // 動きの検査は、いちばん長い廊下の真ん中で廊下に沿った向きから（出だしの部屋の壁にぶつからないように）
  const toCorridor = () => page.evaluate(() => {
    const g = window.__app.game, m = g.m, p = g.p, c = g.s.c;
    const q = m.rooms.filter(r => r.corridor).sort((a, b) => Math.max(b.x1 - b.x0, b.z1 - b.z0) - Math.max(a.x1 - a.x0, a.z1 - a.z0))[0];
    const vert = (q.z1 - q.z0) > (q.x1 - q.x0);
    p.x = (q.x0 + q.x1) / 2; p.z = (q.z0 + q.z1) / 2; p.vx = p.vz = 0; g.prev.px = p.x; g.prev.pz = p.z;
    g.yaw = vert ? 0 : Math.PI / 2; g.pitch = 0;
    c.x = 1.5; c.z = 1.5; c.st = 'wander'; c.goal = null; c.idleT = 1e9; c.grace = 1e9;
    p.stamina = 1; p.exhausted = false;
  });
  await toCorridor();
  await page.waitForTimeout(500);
  const p0 = await page.evaluate(() => { const g = window.__app.game; return { x: g.p.x, z: g.p.z, yaw: g.yaw }; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 290, id: 11 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 290, id: 11 }, { x: 560, y: 200, id: 12 }] });
  for (let k = 1; k <= 25; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150 + Math.min(50, k * 4), y: 290, id: 11 }, { x: 560 + k * 4, y: 200, id: 12 }] }); await page.waitForTimeout(40); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  const p1 = await page.evaluate(() => { const g = window.__app.game; return { x: g.p.x, z: g.p.z, yaw: g.yaw }; });
  const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z), turned = p1.yaw - p0.yaw;
  rec('タップ', '2本指で移動と見回しを同時にできる', moved > 0.3 && Math.abs(turned) > 0.2, `移動${moved.toFixed(2)}m・向き${turned.toFixed(2)}rad`);
  // ダッシュ（押すたび切替）: 左手でスティックを倒したまま右手でダッシュを押し、そのまま右手で見回せる。止まると切れる
  {
    await toCorridor();
    await page.waitForTimeout(300);
    const db = await page.evaluate(() => { const r = document.querySelector('[data-btn="dash"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, mode: window.__app.settings.dashMode }; });
    const S = (y) => ({ x: 150, y, id: 16 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [S(290)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [S(240)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [S(230), { x: db.x, y: db.y, id: 15 }] });
    // CDPのtouchEndは「離した指」を並べる
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: db.x, y: db.y, id: 15 }] });
    const y0 = await page.evaluate(() => window.__app.game.yaw);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [S(230), { x: 560, y: 200, id: 17 }] });
    let ran = false;
    for (let k = 1; k <= 25; k++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [S(230), { x: 560 + k * 3, y: 200, id: 17 }] });
      await page.waitForTimeout(40);
      if (await page.evaluate(() => window.__app.game.p.mode === 'dash')) ran = true;
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // 次のフレームで切れる（ソフトウェア描画は遅いので少し待つ）
    await page.waitForFunction(() => !window.__app.input.sprintToggle, null, { timeout: 5000 }).catch(() => {});
    const after = await page.evaluate(() => ({ yaw: window.__app.game.yaw, toggle: window.__app.input.sprintToggle }));
    rec('タップ', 'ダッシュ（押すたび切替）: 走りながら見回せて、止まると切れる', db.mode === 'toggle' && ran && Math.abs(after.yaw - y0) > 0.1 && !after.toggle, `既定=${db.mode}・走った:${ran}・向き${(after.yaw - y0).toFixed(2)}・止めた後の切替:${after.toggle}`);
  }

  // BGM: ふだんの曲 → 追われると怖い曲 → 見失わせると戻る
  {
    await page.waitForFunction(() => window.__app.audio.music.amb && window.__app.audio.loops.amb, null, { timeout: 60000 }).catch(() => {});
    const a0 = await page.evaluate(() => !!window.__app.audio.loops.amb && !window.__app.audio.loops.chase);
    await page.evaluate(() => { const g = window.__app.game, c = g.s.c, p = g.p; c.st = 'chase'; c.target = p.id; c.react = 0.5; c.x = p.x + 9; c.z = p.z; c.seeT[p.id] = g.s.t; c.lk = { x: p.x, z: p.z, vx: 0, vz: 0, t: g.s.t, pid: p.id }; c.grace = 999; });
    await page.waitForTimeout(1500);
    const a1 = await page.evaluate(() => { const au = window.__app.audio; return { chase: !!au.loops.chase, amb: au.loops.amb ? au.loops.amb.gain.gain.value : -1 }; });
    await page.evaluate(() => { const g = window.__app.game, c = g.s.c; c.st = 'search'; c.search = { pts: [], i: 0, until: g.s.t + 30, cx: c.x, cz: c.z }; c.x += 25; });
    await page.waitForTimeout(4500);
    const a2 = await page.evaluate(() => { const au = window.__app.audio; return { chase: !!au.loops.chase, amb: au.loops.amb ? au.loops.amb.gain.gain.value : -1 }; });
    await page.evaluate(() => { const c = window.__app.game.s.c; c.st = 'wander'; c.goal = null; c.search = null; });
    rec('音', 'BGM: 追われると怖い曲に切り替わり、見失わせると元に戻る', a0 && a1.chase && a1.amb < 0.1 && !a2.chase && a2.amb > 0.4, `追跡中 怖い曲:${a1.chase} ふだんの曲の音量:${a1.amb.toFixed(2)} / 見失った後 怖い曲:${a2.chase} ふだんの曲:${a2.amb.toFixed(2)}`);
  }

  // スティック固定: 決めた場所の周りで操作でき、離れた場所では見回しになる
  {
    await page.evaluate(() => { const a = window.__app; a.settings.stickMode = 'fixed'; a.applySettings(); });
    await toCorridor();
    await page.waitForTimeout(300);
    const home = await page.evaluate(() => { const h = window.__app.hud.stickHome; const r = document.querySelector('#hud .stick').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const q0 = await page.evaluate(() => { const g = window.__app.game; return { x: g.p.x, z: g.p.z, yaw: g.yaw }; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: home.x + 10, y: home.y - 30, id: 13 }] });
    for (let k = 1; k <= 12; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: home.x + 10, y: home.y - 30 - k * 3, id: 13 }] }); await page.waitForTimeout(40); }
    const pos = await page.evaluate(() => { const r = document.querySelector('#hud .stick').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(250);
    const q1 = await page.evaluate(() => { const g = window.__app.game; return { x: g.p.x, z: g.p.z, yaw: g.yaw }; });
    // 左上の離れた場所をなぞる → 見回しになる
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 120, id: 14 }] });
    for (let k = 1; k <= 10; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 + k * 5, y: 120, id: 14 }] }); await page.waitForTimeout(30); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(250);
    const q2 = await page.evaluate(() => { const g = window.__app.game; return { x: g.p.x, z: g.p.z, yaw: g.yaw }; });
    const movedF = Math.hypot(q1.x - q0.x, q1.z - q0.z), stayed = Math.hypot(pos.x - home.x, pos.y - home.y) < 2, looked = Math.abs(q2.yaw - q1.yaw) > 0.05 && Math.hypot(q2.x - q1.x, q2.z - q1.z) < 0.3;
    rec('タップ', 'スティック固定: 決めた場所から動かず操作でき、離れた所は見回しになる', movedF > 0.3 && stayed && looked, `移動${movedF.toFixed(2)}m・スティックのずれ${Math.round(Math.hypot(pos.x - home.x, pos.y - home.y))}px・見回し${(q2.yaw - q1.yaw).toFixed(2)}`);
    await page.evaluate(() => { const a = window.__app; a.settings.stickMode = 'float'; a.applySettings(); });
  }

  // ボタンは指を離したときに反応し、続くclickで2回にならない
  const lt0 = await page.evaluate(() => window.__app.input.light);
  const lb = await page.evaluate(() => { const r = document.querySelector('[data-btn="light"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: lb.x, y: lb.y, id: 21 }] });
  const ltMid = await page.evaluate(() => window.__app.input.light);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250);
  const lt1 = await page.evaluate(() => window.__app.input.light);
  rec('タップ', 'ライトのボタンは離したときに1回だけ切り替わる', ltMid === lt0 && lt1 === !lt0);

  // HUDの配置の編集: 「元に戻す」は指だと2回押す
  {
    await page.evaluate(() => { const a = window.__app; a.settings.hud.items = { dash: { x: 0.5, y: 0.5, s: 1.3 } }; a.applySettings(); a.pauseGame(); a.editHud(() => a.screens.reset('pause')); });
    await page.waitForTimeout(300);
    const rb = await page.evaluate(() => { const r = document.querySelector('.hud-edit-panel .reset').getBoundingClientRect(); const pr = document.querySelector('.hud-edit-panel').getBoundingClientRect(); const d = document.querySelector('[data-hud="dash"]').getBoundingClientRect(); const over = !(d.right < pr.left || d.left > pr.right || d.bottom < pr.top || d.top > pr.bottom); return { x: r.left + r.width / 2, y: r.top + r.height / 2, over }; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rb.x, y: rb.y, id: 61 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(250);
    const once = await page.evaluate(() => !!(window.__app.settings.hud.items || {}).dash);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rb.x, y: rb.y, id: 62 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(250);
    const twice = await page.evaluate(() => !(window.__app.settings.hud.items || {}).dash);
    rec('操作', 'HUDの配置の編集: 「元に戻す」は指だと2回押す・パネルがボタンに重ならない', once && twice && !rb.over, `1回目で残る:${once}・2回目で戻る:${twice}・重なり:${rb.over}`);
    const done = await page.evaluate(() => { const r = document.querySelector('.hud-edit-panel .done').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: done.x, y: done.y, id: 63 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(250);
    await page.evaluate(() => window.__app.resumeGame());
    await page.waitForTimeout(300);
  }

  // 隠れる → QTE成功
  const hide = await page.evaluate(() => {
    const g = window.__app.game, m = g.m, p = g.p;
    let best = null, bd = 1e9;
    for (const h of m.hides) { const d = Math.hypot(h.x + 0.5 - p.x, h.z + 0.5 - p.z); if (d < bd) { bd = d; best = h; } }
    const D = [[1, 0], [0, 1], [-1, 0], [0, -1]][best.dir];
    p.x = best.x + 0.5 + D[0]; p.z = best.z + 0.5 + D[1]; g.yaw = Math.atan2(-D[0], -D[1]); g.pitch = 0;
    g.s.c.x = p.x + 15; g.s.c.st = 'wander'; g.s.c.goal = null; g.s.c.grace = 999;
    return best.id;
  });
  await page.waitForTimeout(400);
  const act = await page.evaluate(() => { const r = document.querySelector('[data-btn="act"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, lbl: document.querySelector('[data-btn="act"] .lbl').textContent }; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: act.x, y: act.y, id: 31 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => window.__app.game.p.hidePhase === 'in', null, { timeout: 30000 }).catch(() => {});
  const hid = await page.evaluate(() => window.__app.game.p.hidden);
  rec('隠れる', '隠れ場所の前で「隠れる」を押すと中に入る', hid === hide, `ボタン表示「${act.lbl}」`);
  await shot('隠れている');
  const qte = async (good) => {
    await page.waitForFunction(() => { const p = window.__app.game.p; return p.hidePhase === 'in' || p.hidden < 0; }, null, { timeout: 30000 });
    await page.evaluate((id) => {
      const g = window.__app.game, p = g.p;
      // 外にいたら入り直す（QTE失敗の検査用）
      if (p.hidden < 0) { const h = g.m.hides[id]; const D = [[1, 0], [0, 1], [-1, 0], [0, -1]][h.dir]; p.x = h.x + 0.5 + D[0]; p.z = h.z + 0.5 + D[1]; g.yaw = Math.atan2(-D[0], -D[1]); window.__app.input.edges.interact = true; }
    }, hide);
    await page.waitForFunction(() => window.__app.game.p.hidePhase === 'in', null, { timeout: 30000 });
    await page.evaluate((id) => { const g = window.__app.game, h = g.m.hides[id], c = g.s.c; const D = [[1, 0], [0, 1], [-1, 0], [0, -1]][h.dir]; c.x = h.x + 0.5 + D[0]; c.z = h.z + 0.5 + D[1]; c.st = 'check'; c.hide = id; c.near = true; c.certain = false; c.actT = 1.2; c.stT = 0; c.yaw = Math.atan2(-D[0], -D[1]); }, hide);
    await page.waitForFunction(() => !!window.__app.game.p.qte, null, { timeout: 5000 });
    await page.waitForTimeout(200);
    // 撮影に時間がかかる間に時間切れにならないよう、止めて撮る
    await page.evaluate(() => { window.__app.freeze = true; });
    await shot(good ? 'QTE' : 'QTE-失敗前');
    await page.evaluate(() => { window.__app.freeze = false; window.__app.last = performance.now(); });
    for (let k = 0; k < 6; k++) {
      const h = await page.waitForFunction((good) => { const q = window.__app.game.p.qte; if (!q) return 'done'; const u = (q.t / q.period) % 2; const mk = u < 1 ? u : 2 - u; const d = Math.abs(mk - q.center); return (good ? d < q.window * 0.25 : d > q.window * 1.5) ? 'tap' : false; }, good, { timeout: 8000, polling: 16 });
      if ((await h.jsonValue()) === 'done') break;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 420, y: 200, id: 40 + k }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(500);
    return page.evaluate(() => { const g = window.__app.game; return { ok: g.p.stats.qteOk, fail: g.p.stats.qteFail, st: g.s.c.st, state: g.p.state, toast: document.querySelector('#hud .toast').textContent }; });
  };
  const q1 = await qte(true);
  rec('隠れる', 'QTE成功でやり過ごせる', q1.ok === 1 && q1.state === 'alive', `化け物=${q1.st}・表示「${q1.toast}」`);
  // 外に出る → もう一度隠れて QTE 失敗
  const q2 = await qte(false);
  rec('隠れる', 'QTE失敗で見つかる（捕食シーン→結果）', q2.fail === 1 && q2.state === 'caught');
  await page.waitForFunction(() => window.__app.screens.cur === 'result', null, { timeout: 90000 });
  const rs = await page.evaluate(() => document.querySelector('.screen.result .rs-word').textContent);
  await shot('結果-死亡');
  rec('結果', '捕まると「死亡」の結果が出る', rs === '死亡');
  // 記録が残る
  const recs = await page.evaluate(() => window.__app.records());
  rec('保存', '結果が記録に残る', recs.normal && recs.normal.plays >= 1);

  // 脱出
  await page.evaluate(() => window.__app.startGame('easy'));
  await page.waitForFunction(() => window.__app.mode === 'game', null, { timeout: 120000 });
  await page.evaluate(() => { const g = window.__app.game, s = g.s, m = g.m, p = g.p; s.keysTaken = s.keysTaken.map(() => 'p1'); s.exitOpen = true; s.doorOpen[m.exit.door] = 1; p.x = m.exit.goal.x; p.z = m.exit.goal.z; s.c.x = 2; s.c.z = 2; });
  await page.waitForFunction(() => window.__app.screens.cur === 'result', null, { timeout: 90000 });
  const rw = await page.evaluate(() => document.querySelector('.screen.result .rs-word').textContent);
  await shot('結果-脱出');
  rec('結果', '脱出すると「脱出」の結果と評価が出る', rw === '脱出');

  // 自動保存 → 続きから
  await page.evaluate(() => window.__app.startGame('hard'));
  await page.waitForFunction(() => window.__app.mode === 'game', null, { timeout: 120000 });
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
  const g1 = await page.evaluate(() => { const g = window.__app.game; window.__app.autosave(); return { t: g.s.t, x: g.p.x, z: g.p.z, seed: g.s.seed }; });
  await page.reload();
  await waitTitle(page, 240000);
  const hasCont = await page.evaluate(() => !!document.querySelector('.mi[data-a="continue"]'));
  await page.tap('.mi[data-a="continue"]');
  await page.waitForFunction(() => window.__app.screens.cur === 'pause' && window.__app.game, null, { timeout: 120000 });
  const g2 = await page.evaluate(() => { const g = window.__app.game; return { t: g.s.t, x: g.p.x, z: g.p.z, seed: g.s.seed }; });
  rec('保存', '裏に回ったときの保存から「続きから」で同じ場面に戻る', hasCont && g2.seed === g1.seed && Math.abs(g2.t - g1.t) < 0.01 && Math.abs(g2.x - g1.x) < 1e-6);
  // タイトルへ戻る（指では2回押す）
  const q = await page.evaluate(() => { const r = document.querySelector('.screen.pause .quit').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const tapAt = async (p, id) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(250); };
  await tapAt(q, 51);
  const after1 = await page.evaluate(() => window.__app.screens.cur);
  await tapAt(q, 52);
  const after2 = await page.evaluate(() => window.__app.screens.cur);
  rec('操作', 'やり直せない操作（タイトルへ戻る）は指だと2回押す', after1 === 'pause' && after2 === 'title');
  // 画面が落ちても戻る
  await page.evaluate(() => window.__app.startGame('easy'));
  await page.waitForFunction(() => window.__app.mode === 'game', null, { timeout: 120000 });
  const lost = await page.evaluate(async () => {
    const gl = window.__app.renderer.gl; const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) return 'なし';
    ext.loseContext();
    await new Promise(r => setTimeout(r, 300));
    const a = window.__app.ctxLost;
    ext.restoreContext();
    await new Promise(r => setTimeout(r, 4000));
    return { lostSeen: a, back: !window.__app.ctxLost, paused: window.__app.mode };
  });
  rec('画面', 'WebGLが落ちたら止めて待ち、戻ったら作り直す', lost !== 'なし' && lost.lostSeen && lost.back, JSON.stringify(lost));
  if (logs.length) note.push('ブラウザのエラー/警告: ' + logs.slice(0, 8).join(' | '));
  rec('起動', 'テスト中にブラウザのエラーが出ない', !logs.filter(l => /pageerror|error:/.test(l)).length, logs.filter(l => /pageerror|error:/.test(l)).slice(0, 3).join(' | '));
  await ctx.close();
} catch (e) {
  rec('ブラウザ', 'ブラウザのテストが最後まで動く', false, e.message.split('\n')[0]);
}
// 古い版の保存から上がる: 設定・名前・記録は残り、遊びかけ（互換番号が違う）は捨てる。ダッシュの既定は切替に
try {
  const OLD = `
    try {
      localStorage.setItem('miteru.v1.settings', JSON.stringify({ quality: 'low', fps: 30, dashMode: 'hold', sens: 1.4 }));
      localStorage.setItem('miteru.v1.profile', JSON.stringify({ name: 'カナタ', hair: 'bob' }));
      localStorage.setItem('miteru.v1.records', JSON.stringify({ normal: { plays: 3, escapes: 1, best: 400 } }));
      localStorage.setItem('miteru.v1.run', JSON.stringify({ dump: JSON.stringify({ v: 1, s: { seed: 'x', diff: 'normal', t: 99 } }), diff: 'normal', t: 99 }));
    } catch (e) {}
    globalThis.__testInsets = { l: 47, r: 47, b: 21 }; globalThis.__testOrient = 90;`;
  const { ctx, page, logs } = await openPage(env, 'dist/claude/preview.html', { w: 844, h: 390, touch: true, mobile: true, init: OLD });
  await waitTitle(page, 240000);
  const u = await page.evaluate(() => ({ dash: window.__app.settings.dashMode, sens: window.__app.settings.sens, name: window.__app.profile.name, rec: window.__app.records().normal, cont: !!document.querySelector('.mi[data-a="continue"]'), run: localStorage.getItem('miteru.v1.run') }));
  rec('保存', '古い版の保存から上がる（設定・名前・記録は残り、遊びかけは捨てる）', u.dash === 'toggle' && u.sens === 1.4 && u.name === 'カナタ' && u.rec && u.rec.plays === 3 && !u.cont && u.run == null && !logs.filter(l => /pageerror/.test(l)).length, JSON.stringify(u));
  await ctx.close();
} catch (e) { rec('保存', '古い版の保存から上がる', false, e.message.split('\n')[0]); }
await env.close();

// まとめ
const ok = results.filter(r => r.ok).length;
let md = `# テスト結果\n\n${new Date().toISOString()}（${((Date.now() - t0) / 1000).toFixed(0)}秒）\n\n**${ok} / ${results.length} 合格**\n\n| | 分類 | 項目 | 詳細 |\n|---|---|---|---|\n`;
for (const r of results) md += `| ${r.ok ? '✅' : '❌'} | ${r.group} | ${r.name} | ${String(r.detail).replace(/\|/g, '／')} |\n`;
md += `\n## 見た目の検査で見つかったもの\n`;
const lp = layoutProblems.filter(p => p.kind !== '省略(…)');
md += lp.length ? lp.map(p => `- ${p.size} / ${p.screen}: ${p.kind} ${p.el || ''} ${p.rect ? JSON.stringify(p.rect) : ''}`).join('\n') : '- なし';
md += `\n\n（「…」で省略される長い名前などは意図どおり: ${layoutProblems.length - lp.length}件）\n`;
md += `\n## できていない検査\n- 実機のiPhone（Safari / Claudeアプリ）での表示・音・操作。作業環境はソフトウェア描画のChromiumなので、速さと見た目の細部は実機と違う。\n- 声の音声認識（作業環境から音声認識のモデルを取ってこられないため）。代わりに数値検査だけ。\n- フォントは字幅が同じ代用フォントで測っている（DESIGN.md 環境メモ）。\n`;
if (note.length) md += `\n## メモ\n` + note.map(n => '- ' + n).join('\n') + '\n';
fs.writeFileSync(path.join(OUT, 'summary.md'), md);
console.log(`\n${ok}/${results.length} 合格 → test-results/summary.md`);
process.exit(ok === results.length ? 0 : 1);
