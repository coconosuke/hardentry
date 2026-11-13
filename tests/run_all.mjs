// テスト一式: node tests/run_all.mjs [--quick] [--no-sizes] → test-results/summary.md
//  1 ビルド  2 単体  3 マップ（WAR BIT: 本陣・拠点・出撃の場所が範囲の中・本陣から拠点まで歩ける）  4 音
//  5 自動の試合（コンクエスト・ドミネーション・TDM をボットだけで最後まで・同じシードで同じ結果・人数ごとの速さ）
//  6 ブラウザ（起動・タップ・音の開始・回した画面・射撃場の操作・PLAY→出撃の画面→出撃→倒れて出撃し直す→結果・2回押し・WebGL）
//  7 全サイズの見た目（iPhone各種・iPad・PC、安全領域つき）  9 アプリ版  10 古い保存から上がる
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, openPage, waitTitle, ROOT } from './lib/browser.mjs';
import { layoutCheck } from './lib/layout.mjs';

const QUICK = process.argv.includes('--quick');
const NOSIZE = process.argv.includes('--no-sizes');
const NONET = process.argv.includes('--no-net');
const OUT = path.join(ROOT, 'test-results');
const SHOTS = path.join(OUT, 'shots');
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const note = [];
const rec = (group, name, ok, detail = '') => { results.push({ group, name, ok: !!ok, detail }); console.log(`${ok ? 'OK' : 'NG'} [${group}] ${name}${detail ? ' — ' + detail : ''}`); };
const t0 = Date.now();
const pngSize = (f) => { const b = fs.readFileSync(f); return b.toString('ascii', 1, 4) === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };

// ---------------- 1 ビルド
try {
  const o = execFileSync('node', [path.join(ROOT, 'tools/build.mjs')], { encoding: 'utf8' });
  const info = JSON.parse(o.trim().split('\n').pop());
  rec('ビルド', 'ビルドできる', true, `Claude版 ${info.claude}・アプリ版 ${info.app}・ソース一式 ${info.files}ファイル`);
  const html = fs.readFileSync(path.join(ROOT, 'dist/claude/index.html'), 'utf8');
  rec('ビルド', 'Claude版にdoctype/html/head/bodyを書かない', !/<!doctype|<html|<head|<body/i.test(html.slice(0, 3000)));
  const ext = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map(m => m[1]);
  rec('ビルド', 'Claude版の外部読み込みは Google Fonts だけ', ext.every(u => /^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/.test(u)), ext.filter(u => !/fonts\.g/.test(u)).slice(0, 3).join(' '));
  rec('ビルド', 'alert/confirm/prompt を使わない', !/[^.\w](alert|confirm|prompt)\(/.test(html.replace(/confirmTap|textModal|confirmMode/g, '')));
  rec('ビルド', '16MB以下', html.length < 16 * 1024 * 1024, (html.length / 1048576).toFixed(2) + 'MB');
  // アプリ版
  const A = (f) => path.join(ROOT, 'dist/app', f);
  const app = fs.readFileSync(A('index.html'), 'utf8');
  rec('アプリ版', 'apple-touch-icon はページ内のdata URL・manifestへのリンク', /rel="apple-touch-icon" href="data:image\/png;base64,/.test(app) && /rel="manifest" href="manifest.webmanifest"/.test(app));
  const files = ['.nojekyll', 'manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'source-bundle.txt'];
  rec('アプリ版', '.nojekyll・manifest・sw.js・アイコン・ソース一式がある', files.every(f => fs.existsSync(A(f))), files.filter(f => !fs.existsSync(A(f))).join(' '));
  const man = JSON.parse(fs.readFileSync(A('manifest.webmanifest'), 'utf8'));
  const iconsOk = man.icons.every(ic => { const s = pngSize(A(ic.src)); return s && ic.sizes === `${s[0]}x${s[1]}`; }) && man.icons.some(ic => ic.purpose === 'maskable');
  rec('アプリ版', 'マニフェスト: 横向き・全画面・アイコンの大きさが合う・maskableあり', man.display === 'standalone' && man.orientation === 'landscape' && man.start_url === './' && iconsOk);
  const sw = fs.readFileSync(A('sw.js'), 'utf8');
  rec('アプリ版', 'SWはno-cacheで確かめ、ビルドごとのキャッシュ名、アイコンは横取りしない', /cache: 'no-cache'/.test(sw) && /hardentry-[0-9a-f]{10}/.test(sw) && /png\|webmanifest/.test(sw));
  rec('アプリ版', '起動時に別のページへ飛ばさない（location の書き換えなし）', !/location\.(href|replace|assign)\s*[=(]/.test(app.replace(/location\.protocol/g, '')));
  // ソース一式から復元できる
  const tmp = path.join(OUT, 'restore-check');
  fs.rmSync(tmp, { recursive: true, force: true });
  execFileSync('node', [path.join(ROOT, 'tools/unbundle.mjs'), path.join(ROOT, 'dist/source-bundle.txt'), tmp]);
  const keys = ['src/app/main.js', 'src/engine/world.js', 'src/engine/maps/motel.js', 'src/assets/icon-512.png', 'src/assets/voices/p.m4a', 'DESIGN.md', 'tools/build.mjs'];
  const same = keys.every(f => fs.existsSync(path.join(tmp, f)) && Buffer.compare(fs.readFileSync(path.join(ROOT, f)), fs.readFileSync(path.join(tmp, f))) === 0);
  rec('ビルド', 'ソース一式から元どおり復元できる', same, keys.filter(f => !fs.existsSync(path.join(tmp, f))).join(' '));
  fs.rmSync(tmp, { recursive: true, force: true });
} catch (e) { rec('ビルド', 'ビルドできる', false, e.message.slice(0, 300)); }

// ---------------- 2 単体
try {
  const tmp = path.join(OUT, 'unit.json');
  try { execFileSync('node', [path.join(ROOT, 'tests/unit/run.mjs')], { encoding: 'utf8', env: { ...process.env, UNIT_JSON: tmp } }); } catch (e) { /* 失敗は中身で見る */ }
  const u = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  const bad = u.filter(r => !r.ok);
  rec('単体', `エンジンの単体テスト ${u.length}件`, u.length > 0 && !bad.length, bad.map(r => r.name).join(', '));
  fs.rmSync(tmp, { force: true });
} catch (e) { rec('単体', '単体テスト', false, e.message.slice(0, 200)); }

// ---------------- 3 マップ（WAR BIT）
try {
  const { warWorld, WAR_MAPS } = await import('../src/war/maps/index.js');
  const { buildWarNav, findWarPath } = await import('../src/war/nav.js');
  for (const id of Object.keys(WAR_MAPS)) {
    const tm = Date.now(), w = warWorld(id), errs = [];
    for (const [ak, A] of Object.entries(w.areas)) {
      const R = A.rect, inR = (x, z) => x >= R[0] && x <= R[2] && z >= R[1] && z <= R[3];
      for (const [x, z] of A.hq) if (!inR(x, z)) errs.push(`${ak}: 本陣が範囲の外`);
      for (const fid of A.flags || []) { const f = w.flagDefs[fid]; if (!f || !inR(f.x, f.z)) errs.push(`${ak}: 拠点${fid}が範囲の外`); }
      for (const L of A.spawns || []) for (const [x, z] of L) if (!inR(x, z)) errs.push(`${ak}: 出撃の場所が範囲の外`);
      // 本陣から拠点まで歩いて行ける（ボットの道）
      if (!WAR_MAPS[id].training && (A.flags || []).length) {
        const nav = buildWarNav(w, R);
        for (const [hx, hz] of A.hq) for (const fid of A.flags) {
          const f = w.flagDefs[fid], pth = findWarPath(nav, hx, hz, f.x, f.z, 80000), end = pth && pth[pth.length - 1];
          if (!end || Math.hypot(end[0] - f.x, end[1] - f.z) > f.r) errs.push(`${ak}: 本陣→${fid} の道がない`);
        }
      }
    }
    rec('マップ', `${WAR_MAPS[id].name}: 本陣・拠点・出撃の場所が範囲の中・本陣から拠点まで歩いて行ける`, !errs.length, errs.slice(0, 3).join(' / ') || `範囲${Object.keys(w.areas).length}・箱${w.boxes.length}・木${(w.trees || []).length}・${Date.now() - tm}ms`);
  }
} catch (e) { rec('マップ', 'マップの点検', false, e.message.slice(0, 200)); }

// ---------------- 4 音（数値の検査）
try {
  const { SFX, renderSfx } = await import('../src/audio/synth.js');
  const sr = 48000; let n = 0; const bad = [];
  for (const [k, [, cnt]] of Object.entries(SFX)) for (let i = 0; i < cnt; i++) {
    const x = renderSfx(k, i, sr); n++;
    let peak = 0, nan = 0, sum = 0;
    for (const v of x) { if (!Number.isFinite(v)) nan++; else { peak = Math.max(peak, Math.abs(v)); sum += v; } }
    const dc = Math.abs(sum / x.length), len = x.length / sr;
    const tail = x.length > 64 ? Math.max(...Array.from(x.slice(-32), Math.abs)) : 0;
    if (nan || peak < 0.02 || peak > 1.0 || dc > 0.05 || len < 0.01 || len > 30 || tail > 0.2) bad.push(`${k}#${i} 最大${peak.toFixed(2)} NaN${nan} 直流${dc.toFixed(3)} 長さ${len.toFixed(2)}s 終わり${tail.toFixed(2)}`);
  }
  rec('音', `効果音の数値検査 ${Object.keys(SFX).length}種・${n}本（無音・割れ・NaN・直流・長さ・終わりの切れ）`, !bad.length, bad.slice(0, 4).join(' / '));
  const vi = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/assets/voices/index.json'), 'utf8'));
  const spk = Object.entries(vi.spk || {});
  const lines = spk.reduce((a, [, s]) => a + s.n, 0);
  const missing = spk.filter(([k]) => !fs.existsSync(path.join(ROOT, `src/assets/voices/${k}.m4a`))).map(([k]) => k);
  rec('音', `声のファイル ${spk.length}人・${lines}本がそろう`, !missing.length && lines >= 300, missing.join(' '));
  const mus = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/assets/music/music.json'), 'utf8'));
  rec('音', 'BGM（メニュー・作戦・対戦）がそろう', ['menu', 'op', 'pvp'].every(k => mus[k] && fs.existsSync(path.join(ROOT, `src/assets/music/${k}.m4a`))));
} catch (e) { rec('音', '音の検査', false, e.message.slice(0, 200)); }

// ---------------- 5 自動の試合（WAR BIT: ボットだけ。ゲームと同じ毎秒60こま）
try {
  const { createGame, step } = await import('../src/engine/engine.js');
  const runWar = (wmode, size, seed, maxMin) => {
    const G = createGame({ map: 'riverbend', mode: 'war', wmode, size, seed, roster: [] }), S = G.S;
    let kills = 0, flags = 0, i = 0;
    const t = Date.now(), N = 3600 * maxMin;
    for (; i < N && !S.m.over; i++) for (const e of step(G, {})) { if (e.e === 'kill') kills++; if (e.e === 'flag') flags++; }
    return { over: S.m.over, win: S.m.winner, why: S.m.why || '', kills, flags, min: i / 3600, ms: (Date.now() - t) / Math.max(1, i), score: (wmode === 'conquest' ? S.m.tickets : S.m.score).map(Math.ceil), G };
  };
  const fmt = (r) => `${r.over ? (r.win < 0 ? '引き分け' : 'チーム' + r.win + 'の勝ち') + '（' + r.why + '）' : '終わらず'}・${r.min.toFixed(1)}分・${r.score.join('/')}・キル${r.kills}・拠点${r.flags}・${r.ms.toFixed(2)}ms`;
  for (const [m, size, cap, name] of [['conquest', 'small', 25, 'コンクエスト 16 vs 16'], ['domination', 'small', 16, 'ドミネーション 16 vs 16'], ['tdm', 'small', 11, 'チームデスマッチ 8 vs 8'], ['tdm', 'medium', 11, 'チームデスマッチ 16 vs 16']]) {
    const r = runWar(m, size, 7, QUICK ? 3 : cap);
    rec('自動の試合', `${name}: ボットだけで例外なく${QUICK ? '動く' : '決着する'}（撃ち合い・${m === 'tdm' ? 'キル' : '拠点の取り合い'}）`, (QUICK || r.over) && r.kills > 0 && (m === 'tdm' || r.flags > 0), fmt(r));
  }
  // 人数が多いときの速さ（撃ち合いが始まった後の1分）
  for (const [size, name, lim] of [['medium', '32 vs 32', 6], ['large', '64 vs 64', 12]]) {
    const G = createGame({ map: 'riverbend', mode: 'war', wmode: 'conquest', size, seed: 3, roster: [] });
    for (let i = 0; i < 3600 * (QUICK ? 0.5 : 2); i++) step(G, {});
    const t = Date.now(); let k = 0;
    for (let i = 0; i < 3600; i++) for (const e of step(G, {})) if (e.e === 'kill') k++;
    const ms = (Date.now() - t) / 3600;
    rec('自動の試合', `コンクエスト ${name}: 1ステップ ${lim}ms 未満（作業環境の Node・撃ち合いの最中）`, ms < lim, `${ms.toFixed(2)}ms・1分のキル${k}`);
  }
  // 同じシードなら同じ結果（固定ステップ・シード付き乱数）
  const pos = (g) => g.S.actors.map(a => [a.id, +a.x.toFixed(4), +a.z.toFixed(4), a.alive]).join('|') + '|' + g.S.m.score.join(',');
  const a1 = runWar('domination', 'small', 11, 0.5), a2 = runWar('domination', 'small', 11, 0.5);
  rec('自動の試合', '同じシードなら同じ結果になる', pos(a1.G) === pos(a2.G));
} catch (e) { rec('自動の試合', '自動の試合', false, e.message.slice(0, 300)); }

// ---------------- 6〜10 ブラウザ
const SIZES = [
  { id: 'iphone14-横', w: 844, h: 390, insets: { l: 47, r: 47, b: 21 }, orient: 90 },
  { id: 'iphone14-縦', w: 390, h: 844, insets: { t: 47, b: 34 }, orient: 0 },
  { id: 'iphoneSE-横', w: 667, h: 375, insets: {}, orient: -90 },
  { id: 'iphoneSE-縦', w: 375, h: 667, insets: { t: 20 }, orient: 0 },
  { id: 'proMax-横', w: 932, h: 430, insets: { l: 59, r: 59, b: 21 }, orient: -90 },
  { id: 'proMax-縦', w: 430, h: 932, insets: { t: 59, b: 34 }, orient: 0 },
  { id: 'mini-横', w: 812, h: 375, insets: { l: 50, r: 50, b: 21 }, orient: 90 },
  { id: '小さい-横', w: 568, h: 320, insets: {}, orient: 90 },
  { id: 'iPad-横', w: 1180, h: 820, insets: { b: 20 }, orient: 90 },
  { id: 'PC', w: 1280, h: 720, insets: {}, orient: null },
];
if (QUICK) SIZES.splice(4);
if (NOSIZE) SIZES.splice(1);

const env = await launch();
const INIT = `
  try { localStorage.setItem('hardentry.v1.settings', JSON.stringify({ quality: 'low', fps: 30 })); } catch (e) {}
  Object.defineProperty(window, 'orientation', { configurable: true, get: () => (globalThis.__testOrient == null ? undefined : globalThis.__testOrient) });
  globalThis.__testInsets = { l: 47, r: 47, b: 21 }; globalThis.__testOrient = 90;
`;
const layoutProblems = [];
const BENIGN = /404|声がない|BGM|favicon|Failed to load resource/;
try {
  const { ctx, page, logs } = await openPage(env, 'dist/claude/preview.html', { w: 844, h: 390, touch: true, mobile: true, init: INIT });
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  // タップ: 押す・離すを 60ms あけて送る（受け取りを待たない）。描画が遅い環境では、押したのを受け取るまで次を送らないと
  // 1こま（ソフトウェア描画で約1秒）押していたことになり、短く押したのが長押しになる
  const tapAt = async (p, id = 90) => { const a = touch('touchStart', [{ x: p.x, y: p.y, id }]); await new Promise(r => setTimeout(r, 60)); const b = touch('touchEnd', []); await Promise.all([a, b]); await page.waitForTimeout(250); };
  const holdAt = async (p, ms, id = 91) => { await touch('touchStart', [{ x: p.x, y: p.y, id }]); await page.waitForTimeout(ms); await touch('touchEnd', []); await page.waitForTimeout(250); };
  const center = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  const waitGame = async () => {
    await page.waitForFunction(() => window.__app.mode === 'game' && window.__app.game, null, { timeout: 180000 });
    await page.waitForFunction(() => !(window.__app.game.intro > 0) && !(window.__app.game.S.m && window.__app.game.S.m.phase === 'pre'), null, { timeout: 60000 });
    await page.waitForTimeout(300);
  };
  const tb = Date.now();
  await waitTitle(page, 240000);
  rec('起動', 'タイトルまで動く（エラーなし）', !logs.filter(l => !BENIGN.test(l)).length, `${((Date.now() - tb) / 1000).toFixed(0)}秒（ソフトウェア描画）${logs.length ? ' / ' + logs[0] : ''}`);
  await shot('タイトル');
  // 音は指を離したときに始まる・ボタンは離したときに反応する
  const before = await page.evaluate(() => !!window.__app.audio.ctx);
  const set = await center('.screen.title.on [data-a="settings"]');
  await touch('touchStart', [{ x: set.x, y: set.y, id: 1 }]);
  await page.waitForTimeout(200);
  const during = await page.evaluate(() => ({ ctx: !!window.__app.audio.ctx, scr: window.__app.screens.cur }));
  await touch('touchEnd', []);
  await page.waitForTimeout(600);
  const afterA = await page.evaluate(() => ({ ctx: !!window.__app.audio.ctx, st: window.__app.audio.ctx && window.__app.audio.ctx.state, scr: window.__app.screens.cur }));
  rec('音', '音は指を離したときに始まる（押した瞬間ではない）', !before && !during.ctx && afterA.ctx, `押す前:${before} 押している間:${during.ctx} 離した後:${afterA.ctx}(${afterA.st})`);
  rec('タップ', 'ボタンは指を離したときに反応する（タイトル→設定）', during.scr === 'title' && afterA.scr === 'settings');
  // 音を作り、声とBGMを読み込める
  await page.waitForFunction(() => { const a = window.__app.audio; return a.genDone === true && Object.keys(a.voiceBuf).length >= 12 && a.music.menu; }, null, { timeout: 120000 }).catch(() => {});
  const ac = await page.evaluate(() => { const a = window.__app.audio; return { sfx: Object.keys(a.buf).length, spk: Object.keys(a.voiceBuf).length, music: Object.keys(a.music) }; });
  rec('音', '効果音を作り、声とBGMを読み込める', ac.sfx >= 90 && ac.spk >= 12 && ac.music.includes('menu'), `効果音${ac.sfx}種・声${ac.spk}人分・BGM ${ac.music.join('/')}`);

  // ---- 回した画面（縦持ち）: スライダー・スクロール・横スクロールのタブ
  await page.evaluate(() => { globalThis.__testInsets = { t: 47, b: 34 }; globalThis.__testOrient = 0; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__app.stage.layout());
  await page.evaluate(() => window.__app.screens.reset('settings', 'gfx'));
  await page.waitForTimeout(300);
  {
    const sl = await page.evaluate(() => { const t = document.querySelector('.screen.settings [data-k="bright"] .track'); t.scrollIntoView({ block: 'center' }); const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y0: r.top + 6, y1: r.bottom - 6, v: window.__app.settings.bright }; });
    // スクロールが落ち着いてから、指を置く所が本当にスライダーの溝か確かめて測る（遅い環境で位置がずれていた）
    await page.waitForTimeout(500);
    let sl2 = null;
    for (let tr = 0; tr < 8 && !sl2; tr++) {
      sl2 = await page.evaluate((tr) => {
        const t = document.querySelector('.screen.settings [data-k="bright"] .track');
        if (tr >= 3) { window.__app.stage.layout(); t.scrollIntoView({ block: 'center' }); } // 画面の大きさの変更が遅れて届いた・スクロールがずれた
        const r = t.getBoundingClientRect(); const o = { x: r.left + r.width / 2, y0: r.top + 6, y1: r.bottom - 6, v: window.__app.settings.bright };
        const h = document.elementFromPoint(o.x, o.y0); return h && t.contains(h) ? o : null;
      }, tr);
      if (!sl2) await page.waitForTimeout(500);
    }
    if (!sl2) sl2 = await page.evaluate(() => { const r = document.querySelector('.screen.settings [data-k="bright"] .track').getBoundingClientRect(); return { x: r.left + r.width / 2, y0: r.top + 6, y1: r.bottom - 6, v: window.__app.settings.bright }; });
    await touch('touchStart', [{ x: sl2.x, y: sl2.y0, id: 2 }]);
    for (let k = 1; k <= 6; k++) await touch('touchMove', [{ x: sl2.x, y: sl2.y0 + (sl2.y1 - sl2.y0) * k / 6, id: 2 }]);
    await touch('touchEnd', []);
    await page.waitForFunction((v) => window.__app.settings.bright > v + 0.3, sl.v, { timeout: 5000 }).catch(() => {});
    const bright = await page.evaluate(() => window.__app.settings.bright);
    let why = '';
    if (!(bright > sl.v + 0.3)) { why = ' ' + await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return 'hit=' + (e ? (e.className || e.tagName) + '<' + (e.parentElement && e.parentElement.className) : 'null') + ` at ${Math.round(x)},${Math.round(y)} view ${innerWidth}x${innerHeight}` + ' scr=' + window.__app.screens.cur + ' mode=' + window.__app.mode; }, [sl2.x, sl2.y0]); await shot('回した画面-スライダー'); }
    rec('回した画面', 'スライダーが指の向きどおりに動く', bright > sl.v + 0.3, `明るさ ${sl.v} → ${bright}${why}`);
    await page.evaluate((v) => { window.__app.settings.bright = v; window.__app.applySettings(); }, sl.v);
  }
  {
    await page.evaluate(() => { const p = document.querySelector('.screen.settings .set-body'); p.scrollTop = 0; });
    const sc0 = await page.evaluate(() => document.querySelector('.screen.settings .set-body').scrollTop);
    const pr = await page.evaluate(() => { const r = document.querySelector('.screen.settings .set-body').getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.85 }; });
    await touch('touchStart', [{ x: pr.x - 80, y: pr.y, id: 3 }]);
    for (let k = 1; k <= 8; k++) await touch('touchMove', [{ x: pr.x - 80 + k * 20, y: pr.y, id: 3 }]);
    await touch('touchEnd', []);
    await page.waitForTimeout(400);
    const sc1 = await page.evaluate(() => document.querySelector('.screen.settings .set-body').scrollTop);
    rec('回した画面', '設定の一覧を指でスクロールできる', sc1 > sc0 + 40, `${sc0} → ${sc1}`);
  }
  {
    await page.evaluate(() => window.__app.screens.reset('settings', 'ctrl'));
    await page.waitForTimeout(300);
    const box = await page.evaluate(() => { const r = document.querySelector('.screen.settings .tabs').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await touch('touchStart', [{ x: box.x, y: box.y + 120, id: 4 }]);
    for (let k = 1; k <= 12; k++) { await touch('touchMove', [{ x: box.x, y: box.y + 120 - k * 22, id: 4 }]); await page.waitForTimeout(16); }
    await touch('touchEnd', []);
    await page.waitForTimeout(500);
    const sl = await page.evaluate(() => { const t = document.querySelector('.screen.settings .tabs'); return { left: t.scrollLeft, over: t.scrollWidth - t.clientWidth }; });
    const pp = await page.evaluate(() => { const b = [...document.querySelectorAll('.screen.settings .tab')].find(e => e.textContent === 'その他'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await tapAt(pp, 5);
    const tab = await page.evaluate(() => window.__app.screens.args && window.__app.screens.args[0]);
    rec('回した画面', '設定のタブの列を指で横に送り（はみ出すとき）、端のタブを押せる', (sl.over <= 2 || sl.left > 30) && tab === 'etc', `はみ出し ${Math.round(sl.over)}px・送った量 ${Math.round(sl.left)}px・押したタブ ${tab}`);
  }
  // コールサイン（文字の入力は回した画面の外で、端末の向きのまま）
  {
    await page.evaluate(() => window.__app.screens.reset('settings', 'etc'));
    await page.waitForTimeout(250);
    await page.tap('.screen.settings [data-a="rename"]');
    await page.waitForSelector('.tmodal input');
    const tm = await page.evaluate(() => { const el = document.querySelector('.tmodal'); return { inStage: !!el.closest('#stage'), tf: getComputedStyle(el).transform }; });
    await page.fill('.tmodal input', 'ブラボー1');
    await shot('文字入力-縦');
    await page.tap('.tmodal .tm-ok');
    await page.waitForTimeout(250);
    const nm = await page.evaluate(() => window.__app.profile.name);
    rec('文字入力', 'コールサインの入力は回した画面の外で、端末の向きのまま', !tm.inStage && tm.tf === 'none' && nm === 'ブラボー1', `名前=${nm}`);
  }
  await page.evaluate(() => { globalThis.__testInsets = { l: 47, r: 47, b: 21 }; globalThis.__testOrient = 90; });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => { window.__app.stage.layout(); window.__app.screens.reset('title'); });

  // ---- 射撃場（タイトルの SHOOTING RANGE）: 2本指・射撃・ADS・リロード・リーン・しゃがみ・武器の持ち替え
  await tapAt(await center('.screen.title.on [data-a="range"]'), 6);
  await waitGame();
  await page.waitForFunction(() => window.__app.game.p.alive, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(500);
  await shot('射撃場');
  {
    const p0 = await page.evaluate(() => { const g = window.__app.game; return { x: g.p.x, z: g.p.z, yaw: g.yaw }; });
    await touch('touchStart', [{ x: 150, y: 290, id: 11 }]);
    await touch('touchStart', [{ x: 150, y: 290, id: 11 }, { x: 560, y: 190, id: 12 }]);
    for (let k = 1; k <= 25; k++) { await touch('touchMove', [{ x: 150, y: 290 - Math.min(50, k * 4), id: 11 }, { x: 560 + k * 4, y: 190, id: 12 }]); await page.waitForTimeout(40); }
    await touch('touchEnd', []);
    await page.waitForTimeout(300);
    const p1 = await page.evaluate(() => { const g = window.__app.game; return { x: g.p.x, z: g.p.z, yaw: g.yaw }; });
    const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z), turned = p1.yaw - p0.yaw;
    rec('タップ', '2本指で移動と見回しを同時にできる', moved > 0.3 && Math.abs(turned) > 0.2, `移動${moved.toFixed(2)}m・向き${turned.toFixed(2)}rad`);
  }
  const btn = (id) => center(`#hud [data-btn="${id}"]`);
  {
    const s0 = await page.evaluate(() => window.__app.game.p.stats.sh);
    await holdAt(await btn('fire'), 900, 21);
    await page.waitForTimeout(300);
    const s1 = await page.evaluate(() => window.__app.game.p.stats.sh);
    rec('操作', '射撃ボタンを押している間、撃てる', s1 > s0, `撃った数 ${s0} → ${s1}`);
    await tapAt(await btn('reload'), 22);
    await page.waitForFunction(() => { const s = window.__app.game.p.ws.st; return s === 'reload' || s === 'shell'; }, null, { timeout: 15000 }).catch(() => {});
    const rl = await page.evaluate(() => window.__app.game.p.ws.st);
    rec('操作', 'リロードのボタンで弾倉を替え始める', rl === 'reload' || rl === 'shell', `状態 ${rl}`);
    await page.waitForFunction(() => window.__app.game.p.ws.st === 'ready', null, { timeout: 90000 }).catch(() => {});
    await tapAt(await btn('ads'), 23);
    await page.waitForFunction(() => !!window.__app.game.adsOn, null, { timeout: 10000 }).catch(() => {});
    const on1 = await page.evaluate(() => !!window.__app.game.adsOn);
    await page.waitForFunction(() => window.__app.game.p.ads > 0.9, null, { timeout: 45000 }).catch(() => {});
    const ads1 = await page.evaluate(() => window.__app.game.p.ads);
    await tapAt(await btn('ads'), 24);
    await page.waitForFunction(() => !window.__app.game.adsOn, null, { timeout: 10000 }).catch(() => {});
    const on2 = await page.evaluate(() => !!window.__app.game.adsOn);
    await page.waitForFunction(() => window.__app.game.p.ads < 0.1, null, { timeout: 45000 }).catch(() => {});
    const ads2 = await page.evaluate(() => window.__app.game.p.ads);
    rec('操作', 'ADSのボタンは押すたびに構える／戻す（既定）', on1 && !on2 && ads1 > 0.5 && ads2 < 0.3, `押す→${on1 ? '構える' : '-'}（${ads1.toFixed(2)}）・もう一度→${on2 ? '-' : '戻す'}（${ads2.toFixed(2)}）`);
    await tapAt(await btn('leanR'), 25);
    await page.waitForFunction(() => window.__app.game.p.lean > 0.5, null, { timeout: 15000 }).catch(() => {});
    const lr = await page.evaluate(() => window.__app.game.p.lean);
    await tapAt(await btn('leanR'), 26);
    await tapAt(await btn('leanL'), 27);
    await page.waitForFunction(() => window.__app.game.p.lean < -0.5, null, { timeout: 15000 }).catch(() => {});
    const ll = await page.evaluate(() => window.__app.game.p.lean);
    await tapAt(await btn('leanL'), 28);
    rec('操作', 'リーンのボタン: 右は右へ、左は左へ傾く', lr > 0.5 && ll < -0.5, `右 ${lr.toFixed(2)}・左 ${ll.toFixed(2)}`);
    await tapAt(await btn('crouch'), 29);
    await page.waitForFunction(() => window.__app.game.p.stance === 1, null, { timeout: 15000 }).catch(() => {});
    const st1 = await page.evaluate(() => window.__app.game.p.stance);
    await holdAt(await btn('crouch'), 700, 30);
    await page.waitForFunction(() => window.__app.game.p.stance === 2, null, { timeout: 15000 }).catch(() => {});
    const st2 = await page.evaluate(() => window.__app.game.p.stance);
    await tapAt(await btn('crouch'), 31); await tapAt(await btn('crouch'), 32);
    rec('操作', 'しゃがむ（押す）・伏せ（長押し）', st1 === 1 && st2 === 2, `押す→${st1}・長押し→${st2}`);
    await tapAt(await btn('wpn2'), 33);
    await page.waitForFunction(() => window.__app.game.p.ws.slot === 1, null, { timeout: 8000 }).catch(() => {});
    const slot = await page.evaluate(() => window.__app.game.p.ws.slot);
    await tapAt(await btn('wpn1'), 34);
    rec('操作', '副武器のボタンで持ち替える', slot === 1, `持っている武器 ${slot}`);
  }
  // ダッシュ中もほかの操作が先（11-12）: 走っていてもリロード・ADS・リーン・射撃ができ、その間は走らない。終わると（押したまま・固定なら）また走る。
  // リロードはスティックを押し込み直すとやめて走る。CDP の touchEnd は書いた指だけ離す（スティックは押したまま）
  {
    await page.waitForFunction(() => window.__app.game.p.ws.st === 'ready' && window.__app.game.p.ws.slot === 0, null, { timeout: 15000 }).catch(() => {});
    const sst = () => page.evaluate(() => { const g = window.__app.game, p = g.p, wi = p.inv.w[p.ws.slot]; return { spr: !!p.sprint, ws: p.ws.st, mag: wi ? wi.mag : -1, ads: +p.ads.toFixed(2), lean: +p.lean.toFixed(2), sh: p.stats.sh, lock: !!window.__app.input.sprintLock, wait: document.querySelector('#hud .hud-stick').classList.contains('spr-wait') }; });
    const wf = (fn, t = 60000) => page.waitForFunction(fn, null, { timeout: t }).then(() => true).catch(() => false);
    const at = (dy, id = 41) => ({ x: 150, y: 290 - dy, id });
    const push = async (id) => { await touch('touchStart', [at(0, id)]); for (let k = 1; k <= 20; k++) { await touch('touchMove', [at(k * 5, id)]); await page.waitForTimeout(30); } };
    const tapWith = async (b, id, sid = 41) => { await touch('touchStart', [at(100, sid), { x: b.x, y: b.y, id }]); await page.waitForTimeout(80); await touch('touchEnd', [{ x: b.x, y: b.y, id }]); await page.waitForTimeout(150); };
    // 描画が遅い環境では、押し込み直す前にリロードが終わってしまうので長くしておく（やめるのを確かめる）
    const longReload = () => page.evaluate(() => { const ws = window.__app.game.p.ws; ws.t = 30; ws.rd = 30; });
    const R = await btn('reload'), A = await btn('ads'), LR = await btn('leanR'), F = await btn('fire');
    await page.evaluate(() => { window.__app.game.p.inv.w[0].mag = 3; });
    // スティックを押したまま
    await push(41);
    const run1 = await wf(() => window.__app.game.p.sprint);
    await tapWith(R, 42);
    const rl = await wf(() => window.__app.game.p.ws.st === 'reload'); await longReload();
    await page.waitForTimeout(300);
    const s1 = await sst();
    for (const d of [80, 50, 30, 50, 80, 100]) { await touch('touchMove', [at(d)]); await page.waitForTimeout(20); }
    const cx = await wf(() => window.__app.game.p.ws.st === 'ready' && window.__app.game.p.sprint);
    const s2 = await sst();
    rec('操作', 'ダッシュ中もリロードできる（その間は走らない・印は点線）。スティックを押し込み直すと、やめて走る', run1 && rl && !s1.spr && s1.wait && cx && s2.mag === 3, `走る${run1 ? '○' : '×'}・リロード中 ${JSON.stringify(s1)}・押し込み直し ${JSON.stringify(s2)}`);
    await tapWith(A, 43);
    const ad = await wf(() => window.__app.game.p.ads > 0.6 && !window.__app.game.p.sprint);
    await tapWith(A, 44);
    const ad2 = await wf(() => !window.__app.game.adsOn && window.__app.game.p.sprint);
    rec('操作', 'ダッシュ中も ADS が先（構える）。戻すとまた走る', ad && ad2, JSON.stringify(await sst()));
    await touch('touchEnd', []);
    await wf(() => !window.__app.game.p.sprint, 20000);
    // ダッシュの固定: 撃つ・リーン・リロードでやめず、その間だけ走らない
    await page.evaluate(() => { window.__app.input.S.stickLock = true; window.__app.game.p.inv.w[0].mag = 30; });
    await push(45); await touch('touchEnd', []);
    const lk = await wf(() => window.__app.input.sprintLock && window.__app.game.p.sprint);
    const sh0 = (await sst()).sh;
    // 撃つ: 1発出るまで押し続ける（遅い環境では 0.5 秒の間に走りやめ→構えまで進まないことがある）
    await touch('touchStart', [{ x: F.x, y: F.y, id: 46 }]);
    await page.waitForFunction((n) => window.__app.game.p.stats.sh > n, sh0, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(150); await touch('touchEnd', []); await page.waitForTimeout(250);
    const fired = await wf(() => window.__app.game.p.stats.sh > 0);
    const sf = await sst();
    const fb = await wf(() => window.__app.game.p.sprint && window.__app.input.sprintLock);
    // リーン（傾く量は壁しだい: 走り続けて壁ぎわにいると傾けない。見るのはリーンの入力が効いて走らないこと）
    await tapAt(LR, 47);
    const ln = await wf(() => window.__app.game.leanSide > 0 && !window.__app.game.p.sprint && window.__app.input.sprintLock);
    const sl = await sst();
    await tapAt(LR, 48);
    const lb = await wf(() => window.__app.game.p.sprint && window.__app.game.leanSide === 0);
    await tapAt(R, 49);
    const rl2 = await wf(() => window.__app.game.p.ws.st === 'reload' && !window.__app.game.p.sprint && window.__app.input.sprintLock); await longReload();
    await push(50);
    const cx2 = await wf(() => window.__app.game.p.ws.st === 'ready' && window.__app.game.p.sprint);
    await touch('touchEnd', []);
    const lk2 = await wf(() => window.__app.input.sprintLock);
    await tapAt(at(0, 51), 51);
    const off = await wf(() => !window.__app.input.sprintLock && !window.__app.game.p.sprint, 30000);
    await page.evaluate(() => { window.__app.input.S.stickLock = false; });
    rec('操作', 'ダッシュの固定: 撃つ・リーン・リロードの間だけ止まり、終わるとまた走る（押し込み直すとリロードをやめる・触れると固定をやめる）', lk && fired && sf.sh > sh0 && fb && ln && lb && rl2 && cx2 && lk2 && off,
      `固定${lk ? '○' : '×'}・撃つ${fired && sf.sh > sh0 ? '○' : '×'}→また走る${fb ? '○' : '×'}・リーン${ln ? '○' : '×'}（傾き ${sl.lean}）→${lb ? '○' : '×'}・リロード${rl2 ? '○' : '×'}→押し込み直し${cx2 ? '○' : '×'}・離すと固定${lk2 ? '○' : '×'}・触れてやめる${off ? '○' : '×'}`);
    await page.waitForFunction(() => window.__app.game.p.ws.st === 'ready', null, { timeout: 60000 }).catch(() => {});
  }
  // ボタンは押した瞬間に1回だけ（ライト）
  {
    await page.waitForFunction(() => window.__app.game.p.ws.st === 'ready' && window.__app.game.p.ws.slot === 0, null, { timeout: 15000 }).catch(() => {});
    const lt0 = await page.evaluate(() => !!window.__app.game.p.light);
    const hasLight = await page.evaluate(() => { const p = window.__app.game.p, wi = p.inv.w[p.ws.slot]; return !!(wi && wi.att && wi.att.light); });
    const lb = await btn('light');
    await touch('touchStart', [{ x: lb.x, y: lb.y, id: 35 }]);
    await page.waitForFunction((v) => !!window.__app.game.p.light !== v, lt0, { timeout: 15000 }).catch(() => {});
    const mid = await page.evaluate(() => !!window.__app.game.p.light);
    await touch('touchEnd', []);
    await page.waitForTimeout(800);
    const lt1 = await page.evaluate(() => !!window.__app.game.p.light);
    rec('タップ', 'ライトのボタンは押した瞬間に1回だけ切り替わる（離しても戻らない）', hasLight && mid === !lt0 && lt1 === mid, `ライト付き:${hasLight} ${lt0} → 押している間 ${mid} → 離した後 ${lt1}`);
    // ローレディは人の操作からなくした（11-12 23:05 の要望）: ボタンも B キーもない
    const lowGone = await page.evaluate(() => { const before = window.__app.game.p.low; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyB' })); return { btn: !!document.querySelector('#hud [data-btn="low"]'), before }; });
    await page.waitForTimeout(600);
    const lowAfter = await page.evaluate(() => window.__app.game.p.low);
    rec('操作', 'ローレディのボタンと B キーはない（銃を下げない）', !lowGone.btn && lowAfter < 0.05, JSON.stringify({ ...lowGone, after: lowAfter }));
  }
  // HUDの配置の編集: 「すべて初期化」は2回押す・「元に戻す」は選んだ項目だけ戻す
  {
    await page.evaluate(() => { const a = window.__app; a.settings.hud = a.settings.hud || {}; a.settings.hud.fire = { x: 300, y: 160, s: 100 }; a.settings.hud.reload = { x: 80, y: 260 }; a.applySettings(); a.pauseGame(); a.editHud(() => a.screens.reset('pause')); });
    await page.waitForTimeout(500);
    await shot('HUDの編集');
    const bar = await page.evaluate(() => { const b = document.querySelector('#hud .hud-editbar') || document.querySelector('.hud-editbar'); if (!b) return { miss: 'bar' }; const r = b.getBoundingClientRect(); const c = (s) => { const e = b.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }; const o = { all: c('[data-a="resetAll"]'), done: c('[data-a="done"]'), r: [r.left, r.top, r.width, r.height] }; if (!o.all || !o.done) o.miss = b.outerHTML.slice(0, 160); return o; });
    let once = false, twice = false;
    if (bar.miss) console.log('HUD edit bar:', bar.miss);
    if (!bar.miss) {
      await tapAt(bar.all, 36);
      once = await page.evaluate(() => !!(window.__app.settings.hud || {}).fire);
      await tapAt(bar.all, 37);
      twice = await page.evaluate(() => !(window.__app.settings.hud || {}).fire && !(window.__app.settings.hud || {}).reload);
      await tapAt(bar.done, 38);
    }
    rec('操作', 'HUDの配置の編集: 「すべて初期化」は2回押す（1回目では消えない）', !bar.miss && once && twice, bar.miss ? `編集の帯がない: ${bar.miss}` : `1回目で残る:${once}・2回目で初期化:${twice}`);
    await page.evaluate(() => window.__app.resumeGame());
  }

  // ---- 射撃場だけの物: 当てると部位・ダメージ・距離が出る・倒した人形は起き上がる・距離の札・兵科を変える
  try {
    const t100 = await page.evaluate(() => { const g = window.__app.game, p = g.p, t = g.S.actors.find(a => a.dummy && a.dummy.d === 25); g.yaw = Math.atan2(t.x - p.x, t.z - p.z); g.pitch = Math.atan2(t.y + 1.2 - (p.y + 1.55), Math.hypot(t.x - p.x, t.z - p.z)); return t.id; });
    await page.waitForTimeout(400);
    const F = await btn('fire');
    let hit = null;
    for (let k = 0; k < 6 && !hit; k++) {
      await page.evaluate((id) => { const g = window.__app.game, p = g.p, t = g.S.byId[id]; g.yaw = Math.atan2(t.x - p.x, t.z - p.z); g.pitch = Math.atan2(t.y + 1.2 - (p.y + 1.55), Math.hypot(t.x - p.x, t.z - p.z)); }, t100);
      await holdAt(F, 250, 60 + k);
      await page.waitForTimeout(400);
      hit = await page.evaluate(() => window.__app.game.rangeHit || null);
    }
    const bar = await page.evaluate(() => (document.querySelector('#hud .hud-obj .wb.rg') || {}).textContent || '');
    rec('射撃場', '人形に当てると、上の帯に部位・ダメージ・距離が出る', !!hit && hit.m > 15 && hit.m < 40 && /m/.test(bar), `${JSON.stringify(hit)}・帯「${bar}」`);
    const signs = await page.evaluate(() => { const g = window.__app.game; g.yaw = 0; g.pitch = 0; return g.w.signs.length; });
    await page.waitForTimeout(500);
    await shot('射撃場-奥');
    rec('射撃場', '標的は 10m〜1000m の13体・距離の札がある', signs === 13, `札 ${signs}`);
    // 兵科・装備のボタン → 出撃の画面 → 衛生を選んで出る
    await tapAt(await btn('loadout'), 66);
    await page.waitForFunction(() => document.querySelector('#hud .hud-deploy.on .dps-go'), null, { timeout: 30000 }).catch(() => {});
    await shot('射撃場-兵科');
    await tapAt(await center('#hud .dps-c[data-sub="medic"]'), 67);
    await page.waitForFunction(() => window.__app.game.dcls === 'medic', null, { timeout: 15000 }).catch(() => {});
    await tapAt(await center('#hud .dps-go'), 68);
    await page.waitForFunction(() => window.__app.game.p.alive, null, { timeout: 30000 }).catch(() => {});
    const re = await page.evaluate(() => { const p = window.__app.game.p; return { alive: p.alive, cls: p.warCls, gun: p.inv.w[0] && p.inv.w[0].id, d: p.stats.d }; });
    rec('射撃場', '兵科・装備のボタンで出撃の画面へ戻り、選んだ兵科で射台に出る（倒されたことにはしない）', re.alive && re.cls === 'medic' && re.d === 0, JSON.stringify(re));
  } catch (e) { rec('射撃場', '射撃場だけの物', false, e.message.slice(0, 200)); }

  // ---- WAR BIT: タイトル → PLAY → コンクエスト 16 vs 16 → 出撃の画面 → 兵科を選んで出る → 撃つ → 倒れて出撃し直す → 勝ち → 結果 → もう一度
  try {
    await page.evaluate(() => window.__app.toTitle());
    await page.waitForFunction(() => window.__app.screens.cur === 'title', null, { timeout: 30000 });
    const menu = await page.evaluate(() => [...document.querySelectorAll('.screen.title .wt-menu .wm')].map(b => b.dataset.a));
    rec('メニュー', 'タイトルの項目は PLAY・SHOOTING RANGE・SETTINGS だけ（作戦・対戦・訓練・資料室はない）', JSON.stringify(menu) === JSON.stringify(['play', 'range', 'settings']), menu.join(','));
    await tapAt(await center('.screen.title.on [data-a="play"]'), 70);
    await page.waitForFunction(() => window.__app.screens.cur === 'play', null, { timeout: 15000 }).catch(() => {});
    const modes = await page.evaluate(() => [...document.querySelectorAll('.screen.play .wp-card')].map(c => c.querySelector('.wp-h b').textContent + ':' + [...c.querySelectorAll('.wp-size b')].map(b => b.textContent).join('/')));
    await shot('PLAY');
    rec('メニュー', 'PLAY: コンクエスト（16・32・64 vs）・ドミネーション（16・32）・チームデスマッチ（8・16）', modes.length === 3 && /^CONQUEST:16 vs 16\/32 vs 32\/64 vs 64$/.test(modes[0]) && /^DOMINATION:16 vs 16\/32 vs 32$/.test(modes[1]) && /^TEAM DEATHMATCH:8 vs 8\/16 vs 16$/.test(modes[2]), modes.join(' | '));
    await tapAt(await center('.screen.play.on [data-m="conquest"][data-k="small"]'), 71);
    await page.waitForFunction(() => window.__app.mode === 'game' && window.__app.game && document.querySelector('#hud .hud-deploy.on .dps-go'), null, { timeout: 240000 });
    await page.waitForTimeout(500);
    await shot('WAR-出撃の画面');
    const dp = await page.evaluate(() => { const g = window.__app.game; return { alive: g.p.alive, cls: document.querySelectorAll('#hud .dps-c').length, sq: document.querySelectorAll('#hud .dps-m').length, pts: [...document.querySelectorAll('#hud .dps-p')].map(e => e.dataset.sub), n: g.S.actors.length, bots: g.S.actors.filter(a => a.ai).length }; });
    rec('WAR BIT', '試合は出撃の画面から始まる（兵科6つ・分隊8人・地図の出撃の場所・ボット31体）', !dp.alive && dp.cls === 6 && dp.sq === 8 && dp.pts.includes('hq') && dp.n === 32 && dp.bots === 31, JSON.stringify(dp));
    await tapAt(await center('#hud .dps-c[data-sub="support"]'), 72);
    await page.waitForFunction(() => window.__app.game.dcls === 'support', null, { timeout: 15000 }).catch(() => {});
    await tapAt(await center('#hud .dps-lo'), 73);
    await page.waitForFunction(() => document.querySelector('#hud .dps-card.dps-lop .dps-o'), null, { timeout: 15000 }).catch(() => {});
    const guns = await page.evaluate(() => [...document.querySelectorAll('#hud .dps-card .dps-o[data-btn="dgun"]')].map(e => e.dataset.sub));
    await shot('WAR-装備');
    await tapAt(await center('#hud .dps-lo'), 74);
    await tapAt(await center('#hud .dps-p[data-sub="hq"]'), 75);
    await tapAt(await center('#hud .dps-go'), 76);
    await page.waitForFunction(() => window.__app.game.p.alive, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(800);
    const st = await page.evaluate(() => { const g = window.__app.game, p = g.p, hq = g.S.m.hq[p.team]; return { alive: p.alive, cls: p.warCls, hp: p.maxHp, gun: p.inv.w[0] && p.inv.w[0].id, d: Math.hypot(p.x - hq[0], p.z - hq[1]), tris: g.r.stats.tris }; });
    rec('WAR BIT', '援護を選び（銃は機関銃）、本陣を押して DEPLOY で出る（体力125）', st.alive && st.cls === 'support' && st.hp === 125 && guns.includes('rpk') && st.d < 25 && st.tris > 20000, `${JSON.stringify(st)}・銃 ${guns.join(',')}`);
    await shot('WAR-出撃');
    const p0 = await page.evaluate(() => { const p = window.__app.game.p; return { x: p.x, z: p.z, sh: p.stats.sh }; });
    await page.keyboard.down('KeyW'); await page.waitForTimeout(2500); await page.keyboard.up('KeyW');
    const fb = await center('#hud .hb[data-btn="fire"]');
    await touch('touchStart', [{ x: fb.x, y: fb.y, id: 7 }]); await page.waitForTimeout(800); await touch('touchEnd', []); await page.waitForTimeout(300);
    const p1 = await page.evaluate(() => { const p = window.__app.game.p; return { x: p.x, z: p.z, sh: p.stats.sh }; });
    rec('WAR BIT', '歩いて撃てる', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.3 && p1.sh > p0.sh, `移動 ${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1)}m・射撃 ${p1.sh - p0.sh}`);
    const bar = await page.evaluate(() => ({ fl: [...document.querySelectorAll('#hud .hud-obj .wb .fl')].map(e => e.textContent).join(''), tk: document.querySelectorAll('#hud .hud-obj .wb .tk').length, hidden: ['use', 'shout', 'cmd', 'team', 'nvg', 'loadout'].filter(b => { const e = document.querySelector('#hud .hb[data-btn="' + b + '"]'); return !e || e.classList.contains('hidden'); }).length }));
    rec('WAR BIT', '上の帯に拠点（A から順）と両チームのチケット・旧モードのボタン（調べる・警告・命令・暗視）と射撃場のボタンは出さない', bar.fl === 'BCDE' && bar.tk === 2 && bar.hidden === 6, JSON.stringify(bar));
    await shot('WAR-HUD');
    // 範囲の外で倒れる → KIA → 出撃の画面（数秒待つ）→ 本陣 → 出撃し直す（チケットが減る）
    const tk0 = await page.evaluate(() => window.__app.game.S.m.tickets[window.__app.game.p.team]);
    await page.evaluate(() => { const g = window.__app.game, p = g.p, r = g.S.m.rect; p.x = r[0] - 25; p.oob = 9.95; });
    await page.waitForFunction(() => document.querySelector('#hud .hud-deploy.on .dps-go'), null, { timeout: 90000 }).catch(() => {});
    const wait = await page.evaluate(() => (document.querySelector('#hud .dps-go b') || {}).textContent || '');
    await shot('WAR-倒れた後の出撃の画面');
    await tapAt(await center('#hud .dps-go'), 77);
    await page.waitForFunction(() => window.__app.game.p.alive, null, { timeout: 90000 }).catch(() => {});
    const rs = await page.evaluate(() => { const g = window.__app.game, p = g.p, hq = g.S.m.hq[p.team]; return { alive: p.alive, d: Math.hypot(p.x - hq[0], p.z - hq[1]), tk: g.S.m.tickets[p.team], cls: p.warCls }; });
    rec('WAR BIT', '倒れたら出撃の画面（DEPLOY に待ちの秒数。先に押すと時間が来たら出る）→ 出撃し直す（チケットが1減る・兵科はそのまま）', /DEPLOY|READY/.test(wait) && rs.alive && rs.d < 25 && rs.tk <= tk0 - 1 && rs.cls === 'support', `「${wait}」・本陣から${rs.d.toFixed(0)}m・チケット${Math.ceil(tk0)}→${Math.ceil(rs.tk)}`);
    // スコア表（上の帯を押す）
    await tapAt(await center('#hud .hud-obj'), 78);
    await page.waitForFunction(() => document.querySelector('#hud .hud-board.on'), null, { timeout: 15000 }).catch(() => {});
    const bd = await page.evaluate(() => ({ on: !!document.querySelector('#hud .hud-board.on'), rows: document.querySelectorAll('#hud .hud-board tr').length }));
    await shot('WAR-スコア表');
    await tapAt(await center('#hud .hud-board'), 79);
    rec('WAR BIT', '上の帯を押すとスコア表（両チームの上位）', bd.on && bd.rows >= 12, JSON.stringify(bd));
    // 決着 → 結果 → もう一度
    await page.evaluate(() => { window.__app.game.S.m.tickets[1] = 0; });
    await page.waitForFunction(() => window.__app.screens.cur === 'result', null, { timeout: 90000 }).catch(() => {});
    const r = await page.evaluate(() => ({ cur: window.__app.screens.cur, h: (document.querySelector('.screen.result h2') || {}).textContent, rows: document.querySelectorAll('.screen.result .board tbody tr').length, me: !!document.querySelector('.screen.result tr.me') }));
    await shot('WAR-結果');
    rec('WAR BIT', '相手のチケットが尽きると VICTORY と両チームの表（自分の行に印）', r.cur === 'result' && r.h === 'VICTORY' && r.rows >= 32 && r.me, `「${r.h}」・${r.rows}行`);
    await tapAt(await center('.screen.result.on [data-a="again"]'), 80);
    await page.waitForFunction(() => window.__app.mode === 'game' && window.__app.game && !window.__app.game.done && document.querySelector('#hud .hud-deploy.on'), null, { timeout: 240000 }).catch(() => {});
    const ag = await page.evaluate(() => { const g = window.__app.game; return { mode: g && g.S.m.mode, per: g && g.S.m.per, dcls: g && g.dcls }; });
    rec('WAR BIT', 'PLAY AGAIN で同じモード・人数がもう一度始まる（兵科は前に選んだ物）', ag.mode === 'conquest' && ag.per === 16 && ag.dcls === 'support', JSON.stringify(ag));
  } catch (e) { rec('WAR BIT', 'コンクエストの流れ', false, e.message.slice(0, 200)); }

  // ---- ドミネーションとチームデスマッチ: 上の帯（残り時間と目標）・決着
  for (const [wm, size, label] of [['domination', 'small', 'ドミネーション'], ['tdm', 'small', 'チームデスマッチ']]) {
    try {
      await page.evaluate(([m, s]) => { window.__app.toTitle(); window.__app.startWar({ wmode: m, size: s }); }, [wm, size]);
      await page.waitForFunction(() => window.__app.mode === 'game' && window.__app.game && document.querySelector('#hud .hud-deploy.on .dps-go'), null, { timeout: 240000 });
      await page.waitForTimeout(300);
      await tapAt(await center('#hud .dps-go'), 81);
      await page.waitForFunction(() => window.__app.game.p.alive, null, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(600);
      const b = await page.evaluate(() => { const g = window.__app.game, m = g.S.m; return { fl: document.querySelectorAll('#hud .hud-obj .wb .fl').length, wt: (document.querySelector('#hud .hud-obj .wb .wt') || {}).textContent || '', inArea: g.p.x >= m.rect[0] && g.p.x <= m.rect[2] && g.p.z >= m.rect[1] && g.p.z <= m.rect[3] }; });
      await shot('WAR-' + label);
      await page.evaluate(() => { const g = window.__app.game; g.S.m.score[g.p.team] = g.S.m.limit; });
      await page.waitForFunction(() => window.__app.screens.cur === 'result', null, { timeout: 60000 }).catch(() => {});
      const h = await page.evaluate(() => (document.querySelector('.screen.result h2') || {}).textContent);
      rec('WAR BIT', `${label}: 範囲の中に出る・上の帯に残り時間と目標・目標に届くと VICTORY`, b.inArea && b.fl === (wm === 'tdm' ? 0 : 3) && /\d+:\d\d/.test(b.wt) && h === 'VICTORY', `${JSON.stringify(b)}・「${h}」`);
    } catch (e) { rec('WAR BIT', label, false, e.message.slice(0, 200)); }
  }

  // ---- 全サイズの見た目
  const SCREENS = [['title', []], ['play', []], ['settings', ['ctrl']], ['settings', ['sens']], ['settings', ['hud']], ['settings', ['gfx']], ['settings', ['snd']], ['settings', ['etc']]];
  await page.evaluate(() => { window.__app.toTitle(); window.__app.startWar({ wmode: 'conquest', size: 'small' }); });
  await page.waitForFunction(() => window.__app.mode === 'game' && window.__app.game && document.querySelector('#hud .hud-deploy.on .dps-go'), null, { timeout: 240000 });
  await page.waitForTimeout(300);
  await tapAt(await center('#hud .dps-go'), 90);
  await page.waitForFunction(() => window.__app.game.p.alive, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__app.freeze = true; });
  const fakeWar = { pvp: true, war: true, mode: 'war', wmode: 'conquest', why: 'tickets', map: 'riverbend', per: 16, size: 'small', time: 1311, win: 0, myTeam: 0, score: [112, 0],
    rows: Array.from({ length: 32 }, (_, i) => ({ name: i ? (i < 16 ? 'アルファ' : 'オスカー') + ((i % 8) + 1) : 'ブラボー1', team: i < 16 ? 0 : 1, k: 20 - (i % 20), d: i % 7, a: i % 5, me: i === 0, bot: i > 0 })) };
  for (const S of SIZES) {
    await page.evaluate(([ins, o]) => { globalThis.__testInsets = ins; globalThis.__testOrient = o; }, [S.insets, S.orient]);
    await page.setViewportSize({ width: S.w, height: S.h });
    await page.evaluate(() => window.__app.stage.layout());
    await page.waitForTimeout(150);
    const check = async (label) => {
      await page.waitForTimeout(200);
      const r = await page.evaluate(layoutCheck);
      const bad = r.problems.filter(p => p.kind !== '省略(…)');
      for (const p of r.problems) layoutProblems.push({ size: S.id, screen: label, ...p });
      await shot(`${S.id}-${label}`);
      return bad;
    };
    let nBad = 0; const list = [];
    const add = (label, b) => { nBad += b.length; list.push(...b.map(x => label + ':' + x.kind + ' ' + (x.el || ''))); };
    // 試合中の HUD
    await page.evaluate(() => { const a = window.__app; a.screens.hide(); a.hud.deploy(null); a.hud.show(true); a.hud.layout && a.hud.layout(); a.game.redraw(); });
    add('HUD', await check('HUD'));
    // 出撃の画面（試合の始め）と、装備の板
    await page.evaluate(() => { const a = window.__app; a.screens.hide(); a.hud.show(true); a.game.dlo = false; a.hud.deploy(a.game._warDeployData()); });
    add('出撃の画面', await check('出撃の画面'));
    await page.evaluate(() => { const a = window.__app; a.game.dlo = true; a.hud.deploy(a.game._warDeployData()); });
    add('出撃の画面-装備', await check('出撃の画面-装備'));
    await page.evaluate(() => { const a = window.__app; a.game.dlo = false; a.hud.deploy(null); a.hud.show(false); });
    for (const [name, args] of [['pause', []], ['tablet', []]]) { await page.evaluate(([n, a]) => window.__app.screens.reset(n, ...a), [name, args]); add(name, await check(name)); }
    await page.evaluate((res) => window.__app.screens.reset('result', res), fakeWar);
    add('結果', await check('結果'));
    for (const [name, args] of SCREENS) {
      await page.evaluate(([n, a]) => window.__app.screens.reset(n, ...a), [name, args]);
      const label = name + (args[0] && typeof args[0] === 'string' ? '-' + args[0] : '');
      add(label, await check(label));
    }
    rec('見た目', `${S.id}（${S.w}×${S.h}）: はみ出し・切れ・重なり・安全領域・文字とボタンの大きさ`, nBad === 0, list.slice(0, 4).join(' / '));
  }
  await page.evaluate(() => { globalThis.__testInsets = { l: 47, r: 47, b: 21 }; globalThis.__testOrient = 90; window.__app.freeze = false; });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => window.__app.stage.layout());

  // ---- 「続きから」はない（11-12 21:59 の要望）・試合を出るのは2回押す・WebGLが落ちても戻る
  {
    await page.evaluate(() => window.__app.startWar({ wmode: 'range' }));
    await waitGame();
    await page.keyboard.down('KeyW'); await page.waitForTimeout(1200); await page.keyboard.up('KeyW');
    // 裏に回ったときと同じ一時停止（保存はしない）→ 読み込み直すとタイトルで、「続きから」は出ない
    const s1 = await page.evaluate(() => { const a = window.__app; a.pauseGame(); return { mode: a.mode, run: localStorage.getItem('hardentry.v1.run') }; });
    await page.reload();
    await waitTitle(page, 240000);
    const s2 = await page.evaluate(() => ({ cont: !!document.querySelector('.screen.title [data-a="continue"]'), game: !!window.__app.game, run: localStorage.getItem('hardentry.v1.run'), first: (document.querySelector('.screen.title .wt-menu .wm') || {}).dataset?.a }));
    rec('保存', '「続きから」はない: 一時停止しても遊びかけを保存せず、読み込み直すとタイトル（PLAY が先頭）', s1.mode === 'pause' && s1.run == null && !s2.cont && !s2.game && s2.run == null && s2.first === 'play', JSON.stringify({ s1, s2 }));
    await page.evaluate(() => window.__app.startWar({ wmode: 'range' }));
    await waitGame();
    await page.evaluate(() => window.__app.pauseGame());
    await page.waitForFunction(() => window.__app.screens.cur === 'pause', null, { timeout: 30000 }).catch(() => {});
    const q = await center('.screen.pause [data-a="quit"]');
    await tapAt(q, 52);
    // 遅い環境では、1回目の押しを受け取るまで待ってから2回目を押す（受け取る前に2回目を送ると、2回目が「1回目」になる）
    await page.waitForFunction(() => { const b = document.querySelector('.screen.pause [data-a="quit"]'); return b && b.classList.contains('armed'); }, null, { timeout: 15000 }).catch(() => {});
    const after1 = await page.evaluate(() => window.__app.screens.cur);
    await tapAt(q, 53);
    await page.waitForFunction(() => window.__app.screens.cur === 'title', null, { timeout: 15000 }).catch(() => {});
    const after2 = await page.evaluate(() => window.__app.screens.cur);
    rec('操作', 'やり直せない操作（試合を出る）は指だと2回押す', after1 === 'pause' && after2 === 'title', `${after1} → ${after2}`);
  }
  {
    await page.evaluate(() => window.__app.startWar({ wmode: 'range' }));
    await waitGame();
    const lost = await page.evaluate(async () => {
      const gl = window.__app.renderer.gl; const ext = gl.getExtension('WEBGL_lose_context');
      if (!ext) return 'なし';
      ext.loseContext();
      await new Promise(r => setTimeout(r, 400));
      const seen = window.__app.ctxLost;
      ext.restoreContext();
      await new Promise(r => setTimeout(r, 6000));
      return { seen, back: !window.__app.ctxLost, mode: window.__app.mode };
    });
    rec('画面', 'WebGLが落ちたら止めて待ち、戻ったら作り直す', lost !== 'なし' && lost.seen && lost.back, JSON.stringify(lost));
  }
  const errs = logs.filter(l => /pageerror|error:/.test(l) && !BENIGN.test(l));
  if (logs.length) note.push('ブラウザのエラー/警告: ' + logs.slice(0, 8).join(' | '));
  rec('起動', 'テスト中にブラウザのエラーが出ない', !errs.length, errs.slice(0, 3).join(' | '));
  await ctx.close();
} catch (e) {
  rec('ブラウザ', 'ブラウザのテストが最後まで動く', false, e.message.split('\n')[0]);
}


// ---------------- 9 アプリ版（ホーム画面用のページ）
try {
  const { ctx, page, logs } = await openPage(env, 'dist/app/index.html', { w: 844, h: 390, touch: true, mobile: true, init: INIT });
  await waitTitle(page, 240000);
  const v = await page.evaluate(() => ({ ver: document.querySelector('.screen.title .ver') && document.querySelector('.screen.title .ver').textContent, title: document.title }));
  rec('アプリ版', 'アプリ版のページもタイトルまで動く（題名は WAR BIT）', !logs.filter(l => /pageerror/.test(l)).length && v.title === 'WAR BIT', `${v.title} · ${v.ver}`);
  await page.screenshot({ path: path.join(SHOTS, 'アプリ版-タイトル.png') });
  await ctx.close();
} catch (e) { rec('アプリ版', 'アプリ版のページ', false, e.message.split('\n')[0]); }

// ---------------- 10 古い版の保存から上がる
try {
  const OLD = `
    try {
      localStorage.setItem('hardentry.v1.settings', JSON.stringify({ sv: 1, quality: 'low', fps: 30, fov: 52, sens: 1.4 }));
      localStorage.setItem('hardentry.v1.profile', JSON.stringify({ name: 'カナタ' }));
      localStorage.setItem('hardentry.v1.records', JSON.stringify({ 'suburb:barricade:normal': { plays: 3, best: 72, bestGrade: 'C' } }));
      localStorage.setItem('hardentry.v1.run', JSON.stringify({ dump: { v: -1 }, o: { mode: 'pve', map: 'suburb', mission: 'barricade' } }));
      localStorage.setItem('hardentry.v0.settings', JSON.stringify({ old: 1 }));
    } catch (e) {}
    globalThis.__testInsets = { l: 47, r: 47, b: 21 }; globalThis.__testOrient = 90;`;
  const { ctx, page, logs } = await openPage(env, 'dist/claude/preview.html', { w: 844, h: 390, touch: true, mobile: true, init: OLD });
  await waitTitle(page, 240000);
  const u = await page.evaluate(() => ({ hfov: window.__app.settings.hfov, sens: window.__app.settings.sens, name: window.__app.profile.name, rec: window.__app.records()['suburb:barricade:normal'], cont: !!document.querySelector('.screen.title [data-a="continue"]'), run: localStorage.getItem('hardentry.v1.run'), old: localStorage.getItem('hardentry.v0.settings') }));
  rec('保存', '古い版の保存から上がる（視野角は横の角度へ直す・名前と記録は残る・遊びかけの保存は捨てる）', u.hfov === 82 && u.sens === 1.4 && u.name === 'カナタ' && u.rec && u.rec.plays === 3 && !u.cont && u.run == null && u.old == null && !logs.filter(l => /pageerror/.test(l)).length, JSON.stringify(u));
  await ctx.close();
} catch (e) { rec('保存', '古い版の保存から上がる', false, e.message.split('\n')[0]); }
await env.close();

// ---------------- まとめ
const ok = results.filter(r => r.ok).length;
let md = `# テスト結果\n\n${new Date().toISOString()}（${((Date.now() - t0) / 1000).toFixed(0)}秒${QUICK ? '・簡易' : ''}）\n\n**${ok} / ${results.length} 合格**\n\n| | 分類 | 項目 | 詳細 |\n|---|---|---|---|\n`;
for (const r of results) md += `| ${r.ok ? '✅' : '❌'} | ${r.group} | ${r.name} | ${String(r.detail).replace(/\|/g, '／').replace(/\n/g, ' ')} |\n`;
md += `\n## 見た目の検査で見つかったもの\n`;
const lp = layoutProblems.filter(p => p.kind !== '省略(…)');
md += lp.length ? lp.slice(0, 200).map(p => `- ${p.size} / ${p.screen}: ${p.kind} ${p.el || ''} ${p.rect ? JSON.stringify(p.rect) : ''}`).join('\n') : '- なし';
md += `\n\n（「…」で省略される長い名前などは意図どおり: ${layoutProblems.length - lp.length}件）\n`;
md += `\n## できていない検査\n- 実機のiPhone（Safari / Claudeアプリ）での表示・音・操作・速さ。作業環境はソフトウェア描画のChromiumなので、速さと見た目の細部は実機と違う。\n- ジャイロ（端末の傾き）での照準。\n- オンライン（人どうしの対戦）は WAR BIT ではまだない（メニューから外した旧モードだけにあった）。\n- フォントは字幅が同じ手元のフォントで測っている（DESIGN.md 環境メモ）。\n`;
if (note.length) md += `\n## メモ\n` + note.map(n => '- ' + n).join('\n') + '\n';
fs.writeFileSync(path.join(OUT, 'summary.md'), md);
console.log(`\n${ok}/${results.length} 合格 → test-results/summary.md`);
process.exit(ok === results.length ? 0 : 1);
