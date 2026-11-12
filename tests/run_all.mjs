// テスト一式: node tests/run_all.mjs [--quick] [--no-sizes] [--no-net] → test-results/summary.md
//  1 ビルド  2 単体  3 マップ  4 音  5 自動の試合（作戦・対戦・同じシードで同じ結果・途中保存）
//  6 ブラウザ（起動・タップ・音の開始・回した画面・2本指・射撃/ADS/リロード/リーン/しゃがみ・ミニマップ→地図・ミラーの視点・HUDの編集・撤収→結果・保存と続きから・2回押し・WebGL）
//  7 全サイズの見た目（iPhone各種・iPad・PC、安全領域つき）  8 オンライン（自前の中継で2人: 協力・対戦）  9 アプリ版  10 古い保存から上がる
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

// ---------------- 3 マップ
try {
  const { checkMap } = await import('../tools/mapcheck.mjs');
  const { MAPS, MAP_LIST, PVE_MAPS, PVP_MAPS } = await import('../src/engine/maps/index.js');
  const rows = [];
  for (const id of MAP_LIST) {
    const r = checkMap(id);
    rows.push(`${id}: 到達${r.stats.reach}%${r.errors.length ? ' ✗' + r.errors.length : ''}${r.warn.length ? ' △' + r.warn.length : ''}`);
    rec('マップ', `${MAPS[id].name}: 家具・出現位置・扉・明かりに誤りがなく、どこへでも歩いて行ける`, !r.errors.length && r.stats.reach >= 100, r.errors.slice(0, 2).concat(r.warn.slice(0, 2)).join(' / ') || `${r.stats.rooms}部屋・扉${r.stats.doors}・家具${r.stats.props}・到達${r.stats.reach}%`);
  }
  // 置き物の配置: 扉・窓・開口・階段の前と、道の幅（tools/propaudit.mjs）
  const { auditMap } = await import('../tools/propaudit.mjs');
  const pa = MAP_LIST.map(id => ({ id, f: auditMap(id).finds }));
  const paBad = pa.filter(x => x.f.length);
  rec('マップ', '置き物が扉・窓・開口・階段の前をふさがず、どの扉・窓・部屋へも幅0.9m以上の道で行ける（全マップ）', !paBad.length, paBad.map(x => `${x.id}: ${x.f.length}件 ${x.f[0].msg}`).slice(0, 3).join(' / ') || `${pa.length}マップ・0件`);
  rec('マップ', 'マップの数: 作戦用7（対戦でも使える）＋対戦用2＋訓練場', PVE_MAPS.length === 7 && PVP_MAPS.length === 9 && PVP_MAPS.filter(m => MAPS[m].pvpOnly).length === 2 && !!MAPS.training, `作戦 ${PVE_MAPS.length}・対戦 ${PVP_MAPS.length}（うち対戦用 ${PVP_MAPS.filter(m => MAPS[m].pvpOnly).length}）`);
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

// ---------------- 5 自動の試合
try {
  const { runPve, runPvp } = await import('../tools/sim.mjs');
  const { MAPS, PVE_MAPS, PVP_MAPS } = await import('../src/engine/maps/index.js');
  const { MISSIONS } = await import('../src/engine/data/missions.js');
  const pve = [], errs = [];
  const tA = Date.now();
  for (const map of PVE_MAPS) for (const mission of Object.keys(MISSIONS)) {
    if (MAPS[map].missions && !MAPS[map].missions[mission]) continue;
    try { pve.push(runPve(map, mission, 7, { max: QUICK ? 420 : 1200 })); } catch (e) { errs.push(`${map}/${mission}: ${e.message}`); }
  }
  const done = pve.filter(r => r.res === 'done').length, fail = pve.filter(r => r.res === 'fail').length;
  rec('自動の試合', `作戦: AIだけで ${pve.length}試合（マップ×作戦。ゲームと同じ毎秒60こま）が例外なく最後まで動く`, !errs.length && pve.length >= 25, `完了${done}・失敗${fail}・時間切れ${pve.length - done - fail}・${((Date.now() - tA) / 1000).toFixed(0)}秒 ${errs.slice(0, 2).join(' / ')}`);
  rec('自動の試合', '作戦: AIの部隊が半分以上の作戦を終えられる', done >= pve.length / 2, `${done}/${pve.length}`);
  const pvp = [], perr = [];
  const tB = Date.now();
  for (const map of PVP_MAPS) for (const mode of ['tdm', 'elim', 'bomb']) {
    try { pvp.push(runPvp(map, mode, 3, { max: 1500, size: QUICK ? '2v2' : '4v4' })); } catch (e) { perr.push(`${map}/${mode}: ${e.message}`); }
  }
  const decided = pvp.filter(r => r.winner === 0 || r.winner === 1 || r.winner === -1).length;
  rec('自動の試合', `対戦: ボットだけで ${pvp.length}試合（マップ×モード）が例外なく決着する`, !perr.length && decided === pvp.length, `決着${decided}/${pvp.length}・キル合計${pvp.reduce((a, r) => a + r.kills[0] + r.kills[1], 0)}・設置${pvp.reduce((a, r) => a + r.plants, 0)}・${((Date.now() - tB) / 1000).toFixed(0)}秒 ${perr.slice(0, 2).join(' / ')}`);
  rec('自動の試合', '対戦: どの試合でも撃ち合いが起きる', pvp.every(r => r.kills[0] + r.kills[1] > 0), pvp.filter(r => r.kills[0] + r.kills[1] === 0).map(r => r.map + '/' + r.mode).join(' '));
  // 同じシードなら同じ結果（固定ステップ・シード付き乱数）
  const a1 = runPve('suburb', 'hostage', 11, { max: 300 }), a2 = runPve('suburb', 'hostage', 11, { max: 300 });
  const strip = (r) => JSON.stringify({ ...r, wall: 0 });
  rec('自動の試合', '同じシードなら同じ結果になる', strip(a1) === strip(a2));
  // 途中で保存（dump）して読み込んで続けても、続けた場合と同じ
  const { createGame, step, dump, load } = await import('../src/engine/engine.js');
  const G = createGame({ map: 'apartment', mode: 'pve', mission: 'raid', diff: 'normal', team: 4, allAI: true, seed: 5 });
  for (let i = 0; i < 1800; i++) step(G, {});
  const D = dump(G);
  const G2 = load(JSON.parse(JSON.stringify(D)));
  for (let i = 0; i < 1800; i++) { step(G, {}); step(G2, {}); }
  const pos = (g) => g.S.actors.map(a => [a.id, +a.x.toFixed(4), +a.z.toFixed(4), a.alive]).join('|');
  rec('自動の試合', '途中の保存から読み込んで続けても同じ展開になる', pos(G) === pos(G2) && G.S.t === G2.S.t, `t=${G.S.t}`);
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
    await page.evaluate(() => window.__app.screens.reset('book', 'play'));
    await page.waitForTimeout(300);
    const box = await page.evaluate(() => { const r = document.querySelector('.screen.book .tabs').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await touch('touchStart', [{ x: box.x, y: box.y + 120, id: 4 }]);
    for (let k = 1; k <= 12; k++) { await touch('touchMove', [{ x: box.x, y: box.y + 120 - k * 22, id: 4 }]); await page.waitForTimeout(16); }
    await touch('touchEnd', []);
    await page.waitForTimeout(500);
    const sl = await page.evaluate(() => { const t = document.querySelector('.screen.book .tabs'); return { left: t.scrollLeft, over: t.scrollWidth - t.clientWidth }; });
    const pp = await page.evaluate(() => { const b = [...document.querySelectorAll('.screen.book .tab')].find(e => e.textContent === '人物'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await tapAt(pp, 5);
    const tab = await page.evaluate(() => window.__app.screens.bk && window.__app.screens.bk.tab);
    rec('回した画面', '資料室のタブの列を指で横に送り（はみ出すとき）、端のタブを押せる', (sl.over <= 2 || sl.left > 30) && tab === 'people', `はみ出し ${Math.round(sl.over)}px・送った量 ${Math.round(sl.left)}px・押したタブ ${tab}`);
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

  // ---- 射撃場: 2本指・射撃・ADS・リロード・リーン・しゃがみ・武器の持ち替え
  await page.evaluate(() => window.__app.startTrain({ start: 'range' }));
  await waitGame();
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
    await holdAt(F, 500, 46);
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

  // ---- 作戦: ミニマップ→地図、ミラーの視点、命令のメニュー、撤収→結果
  await page.evaluate(() => window.__app.startPve({ map: 'suburb', mission: 'barricade', diff: 'normal', team: 4, entry: 0 }));
  await waitGame();
  await shot('作戦-HUD');
  {
    await tapAt(await center('#hud .hud-mm'), 41);
    await page.waitForTimeout(500);
    const scr = await page.evaluate(() => ({ cur: window.__app.screens.cur, mode: window.__app.mode }));
    await shot('作戦-地図');
    rec('操作', 'ミニマップを押すと地図が開く', scr.cur === 'tablet', `画面 ${scr.cur}`);
    await page.evaluate(() => window.__app.resumeGame());
    await page.waitForTimeout(300);
  }
  {
    // 閉じた扉の前に立って、扉を見てミラーを使う
    const ok = await page.evaluate(() => {
      const g = window.__app.game, S = g.S, w = g.w, p = g.p;
      for (const d of w.doors) {
        if (d.L !== 0) continue;
        const ds = S.doors[d.id]; if (!ds || ds.open > 0.05 || ds.broken) continue;
        for (const sg of [1, -1]) {
          const x = d.cx + d.nx * sg * 1.0, z = d.cz + d.nz * sg * 1.0;
          const i = Math.floor(x / 0.5), j = Math.floor(z / 0.5);
          if (w.cell[w.idx(0, i, j)] !== 1 && w.cell[w.idx(0, i, j)] !== 2) continue;
          p.x = x; p.z = z; p.vx = p.vz = 0;
          g.yaw = Math.atan2(d.cx - x, d.cz - z); g.pitch = -0.2;
          for (const b of S.actors) if (b.kind === 'sus' || b.kind === 'civ') { b.x = 1; b.z = 1; }
          return d.id;
        }
      }
      return -1;
    });
    // 向きがエンジンに入ってから（動作は前のステップの向きで見ている物に対して行う）ミラーを使う
    await page.waitForFunction(() => { const g = window.__app.game, d = g.p.yaw - g.yaw; return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) < 0.05 && Math.abs(g.p.pitch - g.pitch) < 0.05; }, null, { timeout: 20000 }).catch(() => {});
    if (ok >= 0) await page.evaluate((id) => { window.__app.game.acts.push({ a: 'op', k: 'door', id, op: 'mirror' }); }, ok);
    // ミラーを出すのに 0.8秒（ゲームの時間）。ソフトウェア描画では1こま1秒以上かかるので長めに待つ
    await page.waitForFunction(() => !!window.__app.game.p.peek, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(800);
    const pk = await page.evaluate(() => { const g = window.__app.game, el = document.querySelector('#hud .hud-peek'); return { peek: !!g.p.peek, shown: !!el && getComputedStyle(el).display !== 'none', text: el ? el.textContent.trim() : '' }; });
    await shot('作戦-ミラー');
    rec('操作', 'ミラーで扉の下から覗いた映像になり、出るのは「戻る」と短い案内だけ', ok >= 0 && pk.peek && pk.shown && /戻る/.test(pk.text) && !/人影|\d+人/.test(pk.text), `表示「${pk.text}」`);
    await tapAt(await center('#hud [data-btn="peekx"]'), 42);
    await page.waitForFunction(() => !window.__app.game.p.peek, null, { timeout: 30000 }).catch(() => {});
    const after = await page.evaluate(() => !!window.__app.game.p.peek);
    rec('操作', 'ミラーの視点は「戻る」で元に戻る', pk.peek && !after);
  }
  {
    // 命令: 長押しで円形のメニュー
    const cb = await btn('cmd');
    await touch('touchStart', [{ x: cb.x, y: cb.y, id: 43 }]);
    // 長押しは押している間のこまで決まる（ソフトウェア描画では1こま1秒以上かかるので、出るまで待つ）
    await page.waitForTimeout(700);
    await page.waitForFunction(() => { const e = document.querySelector('#hud .hud-radial'); return !!e && e.classList.contains('on'); }, null, { timeout: 15000 }).catch(() => {});
    const rad = await page.evaluate(() => { const e = document.querySelector('#hud .hud-radial'); return { on: !!e && e.classList.contains('on'), n: e ? e.querySelectorAll('.ri, button, [data-i]').length : 0, txt: e ? e.textContent.slice(0, 60) : '' }; });
    await shot('作戦-命令');
    await touch('touchEnd', []);
    await page.waitForTimeout(300);
    rec('操作', '命令のボタンを長押しすると円形のメニューが出る', rad.on, `項目 ${rad.n}・「${rad.txt}」`);
  }
  {
    await page.evaluate(() => window.__app.pauseGame());
    await page.waitForTimeout(300);
    const ab = await center('.screen.pause [data-a="abort"]');
    await tapAt(ab, 44);
    const mid = await page.evaluate(() => window.__app.screens.cur);
    await tapAt(ab, 45);
    await page.waitForFunction(() => window.__app.screens.cur === 'result', null, { timeout: 60000 }).catch(() => {});
    const r = await page.evaluate(() => ({ cur: window.__app.screens.cur, h: (document.querySelector('.screen.result h2') || {}).textContent, grade: (document.querySelector('.screen.result .grade') || {}).textContent }));
    await shot('作戦-結果');
    rec('結果', '撤収は指だと2回押す・結果に評価と点数が出る', mid === 'pause' && r.cur === 'result' && /[SABCDF]/.test(r.grade || ''), `見出し「${r.h}」・評価 ${r.grade}`);
    const recs = await page.evaluate(() => window.__app.records());
    rec('保存', '作戦の結果が記録に残る', Object.keys(recs).some(k => k.startsWith('suburb:barricade:') && recs[k].plays >= 1));
  }

  // ---- 対戦: 決着→結果
  await page.evaluate(() => window.__app.startPvp({ mode: 'tdm', map: 'motel', teams: [2, 2], side: 0, botLevel: 1, wins: 3, time: 8, aimAssist: 1, ff: false }));
  await waitGame();
  await shot('対戦-HUD');
  {
    const hud = await page.evaluate(() => ({ cmd: !!document.querySelector('#hud [data-btn="cmd"]') && getComputedStyle(document.querySelector('#hud [data-btn="cmd"]')).display !== 'none' }));
    rec('対戦', '対戦のHUDには命令のボタンがない', !hud.cmd);
    await page.evaluate(() => { const m = window.__app.game.S.m; m.score[0] = m.limit; });
    await page.waitForFunction(() => window.__app.screens.cur === 'result', null, { timeout: 60000 }).catch(() => {});
    const r = await page.evaluate(() => ({ cur: window.__app.screens.cur, h: (document.querySelector('.screen.result h2') || {}).textContent, rows: document.querySelectorAll('.screen.result .board tbody tr').length }));
    await shot('対戦-結果');
    rec('結果', '対戦の決着で勝敗と成績表が出る', r.cur === 'result' && r.h === '勝利' && r.rows === 4, `「${r.h}」・${r.rows}人`);
  }

  // ---- 全サイズの見た目
  const SCREENS = [
    ['title', []], ['pveMenu', []], ['pvpMenu', []], ['train', []], ['mission', [{}]], ['brief', ['__sel']], ['loadout', [{ kind: 'pve', team: 4 }]], ['loadout', [{ kind: 'pvp' }]], ['pvpSetup', [null]],
    ['settings', ['ctrl']], ['settings', ['sens']], ['settings', ['hud']], ['settings', ['gfx']], ['settings', ['snd']], ['settings', ['etc']],
    ['book', ['play']], ['book', ['ctrl']], ['book', ['roe']], ['book', ['missions']], ['book', ['pvp']], ['book', ['maps']], ['book', ['guns']], ['book', ['gear']], ['book', ['people']],
  ];
  await page.evaluate(() => window.__app.startPve({ map: 'apartment', mission: 'hostage', diff: 'normal', team: 4, entry: 0 }));
  await waitGame();
  await page.evaluate(() => window.__app.pauseGame());
  await page.evaluate(() => { window.__app.freeze = true; });
  const fakePve = { res: 'done', map: 'apartment', mission: 'hostage', diff: 'hard', why: '', score: { total: 87, grade: 'A', parts: [{ name: '容疑者の制圧', got: 25, max: 25, note: '逮捕3・無力化1' }, { name: '市民の救出', got: 25, max: 25 }, { name: '報告', got: 8, max: 10 }, { name: '証拠', got: 6, max: 10 }, { name: '人質の救出', got: 10, max: 10 }, { name: '隊員の安全', got: 8, max: 10 }, { name: '規則', got: 5, max: 10 }], viol: [{ v: 'force', pen: 5, byName: 'オカダ' }], stats: { time: 612, arrested: 3, susTotal: 4, killed: 1, rescued: 2, civTotal: 2 } }, me: { sh: 48, hi: 21 } };
  const fakePvp = { pvp: true, mode: 'bomb', map: 'bank', time: 1311, win: 0, myTeam: 0, score: [3, 2], rows: [{ name: 'ブラボー1', team: 0, k: 9, d: 4, a: 3, me: true }, { name: 'ボット・タナカ', team: 0, k: 6, d: 5, a: 4, bot: true }, { name: 'ボット・ヨシダ', team: 1, k: 7, d: 6, a: 1, bot: true }, { name: 'ボット・キムラ', team: 1, k: 3, d: 8, a: 2, bot: true }] };
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
    for (const [name, args] of [['pause', []], ['tablet', []]]) { await page.evaluate(([n, a]) => window.__app.screens.reset(n, ...a), [name, args]); add(name, await check(name)); }
    // HUD（作戦）
    await page.evaluate(() => { const a = window.__app; a.screens.hide(); a.hud.show(true); a.hud.layout && a.hud.layout(); a.game.redraw(); });
    add('HUD', await check('HUD'));
    await page.evaluate(() => window.__app.hud.show(false));
    await page.evaluate((res) => window.__app.screens.reset('result', res), fakePve);
    add('結果', await check('結果'));
    await page.evaluate((res) => window.__app.screens.reset('result', res), fakePvp);
    add('結果-対戦', await check('結果-対戦'));
    for (const [name, args] of SCREENS) {
      await page.evaluate(([n, a]) => { const sc = window.__app.screens; if (!sc.sel) sc.sel = { map: 'gasstation', mission: 'barricade', diff: 'normal', team: 4, entry: 0 }; sc.reset(n, ...a.map(x => x === '__sel' ? sc.sel : x)); }, [name, args]);
      const label = name + (args[0] && typeof args[0] === 'string' && args[0] !== '__sel' ? '-' + args[0] : args[0] && args[0].kind ? '-' + args[0].kind : '');
      add(label, await check(label));
    }
    await page.evaluate(() => window.__app.screens.reset('pause'));
    rec('見た目', `${S.id}（${S.w}×${S.h}）: はみ出し・切れ・重なり・安全領域・文字とボタンの大きさ`, nBad === 0, list.slice(0, 4).join(' / '));
  }
  await page.evaluate(() => { globalThis.__testInsets = { l: 47, r: 47, b: 21 }; globalThis.__testOrient = 90; window.__app.freeze = false; });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => window.__app.stage.layout());

  // ---- 裏に回ったときの保存から「続きから」・タイトルへ戻るは2回押す・WebGLが落ちても戻る
  {
    await page.evaluate(() => window.__app.resumeGame());
    await page.keyboard.down('KeyW'); await page.waitForTimeout(1200); await page.keyboard.up('KeyW');
    // 止めてから保存（再読み込みの直前にも裏に回った保存が走るので、同じ場面にそろえる）
    const g1 = await page.evaluate(() => { const a = window.__app, g = a.game; a.freeze = true; a.autosave(); return { t: g.S.t, x: g.p.x, z: g.p.z, map: g.S.map }; });
    await page.reload();
    await waitTitle(page, 240000);
    const cont = await center('.screen.title.on [data-a="continue"]');
    if (cont) await tapAt(cont, 51);
    await page.waitForFunction(() => window.__app.screens.cur === 'pause' && window.__app.game, null, { timeout: 120000 }).catch(() => {});
    const g2 = await page.evaluate(() => { const g = window.__app.game; return g ? { t: g.S.t, x: g.p.x, z: g.p.z, map: g.S.map } : null; });
    rec('保存', '裏に回ったときの保存から「続きから」で同じ場面に戻る', !!cont && g2 && g2.map === g1.map && g2.t === g1.t && Math.abs(g2.x - g1.x) < 1e-6, g2 ? `t ${g1.t}→${g2.t}` : '戻れない');
    const q = await center('.screen.pause [data-a="quit"]');
    await tapAt(q, 52);
    const after1 = await page.evaluate(() => window.__app.screens.cur);
    await tapAt(q, 53);
    const after2 = await page.evaluate(() => window.__app.screens.cur);
    rec('操作', 'やり直せない操作（タイトルへ戻る）は指だと2回押す', after1 === 'pause' && after2 === 'title', `${after1} → ${after2}`);
  }
  {
    await page.evaluate(() => window.__app.startTrain({ start: 'range' }));
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

// ---------------- 8 オンライン（自前の中継で2人）
if (!NONET) {
  try {
    const { startBroker } = await import('../tools/mqttbroker.mjs');
    for (const kind of ['pve', 'pvp']) {
      const br = await startBroker({ port: 0 });
      const q = `?mqtt=${encodeURIComponent(br.url)}&p2p=0&room=0`;
      const H = await openPage(env, 'dist/claude/preview.html' + q, { w: 844, h: 390, touch: true, mobile: true, init: INIT });
      const G = await openPage(env, 'dist/claude/preview.html' + q, { w: 844, h: 390, touch: true, mobile: true, init: INIT });
      try {
        await waitTitle(H.page, 240000); await waitTitle(G.page, 240000);
        await H.page.evaluate((k) => window.__app.hostRoom(k), kind);
        await H.page.waitForFunction(() => window.__app.net && window.__app.screens.cur === 'lobby' && window.__app.net.code, null, { timeout: 60000 });
        const code = await H.page.evaluate(() => window.__app.net.code);
        await G.page.evaluate((c) => window.__app.joinRoom(c), code);
        await G.page.waitForFunction(() => window.__app.net && window.__app.screens.cur === 'lobby', null, { timeout: 60000 });
        await H.page.waitForFunction(() => window.__app.net.sess.roster.length === 2 && window.__app.net.sess.canStart(), null, { timeout: 60000 });
        rec('オンライン', `${kind === 'pve' ? '協力' : '対戦'}: ルームを作り、コードで入ってロビーにそろう`, true, `コード ${code}`);
        await H.page.screenshot({ path: path.join(SHOTS, `オンライン-${kind}-ロビー.png`) });
        if (kind === 'pvp') await H.page.evaluate(() => { const S = window.__app.net.sess; S.setCfg({ ...S.cfg, mode: 'tdm', map: 'motel', teams: [1, 1] }); const g = S.roster.find(r => !r.host); S.setTeam(g.cid, 1); });
        // 2画面を同時に描くので、画質を下げてこまを速くする（入力が1.5秒より古いとホストは捨てる）
        for (const P of [H.page, G.page]) await P.evaluate(() => { const a = window.__app; a.settings.quality = 'low'; if (a.applySettings) a.applySettings(); });
        await H.page.evaluate(() => window.__app.hostStart());
        await H.page.waitForFunction(() => window.__app.mode === 'game', null, { timeout: 120000 });
        await G.page.waitForFunction(() => window.__app.mode === 'game', null, { timeout: 120000 });
        // 始まりの演出・準備の時間（動けない）が終わるまで待つ
        await G.page.waitForFunction(() => { const g = window.__app.game; return g && g.p && !(g.intro > 0) && !(g.S.m && (g.S.m.phase === 'pre' || g.S.m.phase === 'prep')); }, null, { timeout: 120000 }).catch(() => {});
        await H.page.waitForFunction(() => { const g = window.__app.game; return g && !(g.S.m && (g.S.m.phase === 'pre' || g.S.m.phase === 'prep')); }, null, { timeout: 120000 }).catch(() => {});
        await G.page.waitForTimeout(1000);
        const before = await H.page.evaluate(() => { const g = window.__app.game; const b = g.S.actors.find(a => a.pid === 1); return b ? { x: b.x, z: b.z, sh: b.stats.sh } : null; });
        // 前が開けている向きへ（出現した所の前が塀や壁のこともある）
        await G.page.evaluate(() => { const g = window.__app.game, w = g.w, p = g.p, PL = Math.max(0, Math.floor((p.y + 0.3) / 3)); let best = 0, bd = -1; for (let k = 0; k < 16; k++) { const yw = k * Math.PI / 8; let d = 0; for (let s = 0.3; s <= 3; s += 0.25) { const x = p.x + Math.sin(yw) * s, z = p.z + Math.cos(yw) * s, i = Math.floor(x / 0.5), j = Math.floor(z / 0.5); if (i < 0 || j < 0 || i >= w.W || j >= w.D) break; const k2 = w.idx(PL, i, j), t = w.cell[k2]; if (t !== 1 && t !== 2) break; if ((w.propNear.get(k2) || []).some(pid => { const q = w.props[pid]; return q && q.solid && q.alive !== false && q.boxes.some(b => b[4] > 0.3 && x > b[0] - 0.35 && x < b[3] + 0.35 && z > b[2] - 0.35 && z < b[5] + 0.35); })) break; d = s; } if (d > bd) { bd = d; best = yw; } } g.yaw = best; });
        await G.page.keyboard.down('KeyW'); await G.page.waitForTimeout(8000); await G.page.keyboard.up('KeyW');
        // 射撃: ソフトウェア描画の2画面では1こまが1秒を超えることがあり、短く押すと送る前に離してしまう。3秒押し続ける
        await G.page.evaluate(async () => { const a = window.__app; a.input.hold.add('fire'); await new Promise(r => setTimeout(r, 3000)); a.input.hold.delete('fire'); });
        await new Promise(r => setTimeout(r, 4000));
        const after = await H.page.evaluate(() => { const g = window.__app.game; const b = g.S.actors.find(a => a.pid === 1); return b ? { x: b.x, z: b.z, sh: b.stats.sh } : null; });
        const gs = await G.page.evaluate(() => { const g = window.__app.game; return { n: g.S.actors.length, me: g.p ? g.p.id : -1, err: window.__app._lastErr || null }; });
        const moved = before && after ? Math.hypot(after.x - before.x, after.z - before.z) : 0;
        await H.page.screenshot({ path: path.join(SHOTS, `オンライン-${kind}-ホスト.png`) });
        await G.page.screenshot({ path: path.join(SHOTS, `オンライン-${kind}-ゲスト.png`) });
        rec('オンライン', `${kind === 'pve' ? '協力' : '対戦'}: ゲストの移動と射撃がホストに届く`, moved > 0.15 && after.sh > before.sh && !gs.err, `移動 ${moved.toFixed(2)}m・射撃 ${before ? before.sh : '-'}→${after ? after.sh : '-'}・ゲストの見ている人数 ${gs.n}`);
        const errsH = H.logs.filter(l => /pageerror/.test(l)), errsG = G.logs.filter(l => /pageerror/.test(l));
        rec('オンライン', `${kind === 'pve' ? '協力' : '対戦'}: 両方の画面でエラーが出ない`, !errsH.length && !errsG.length, errsH.concat(errsG).slice(0, 2).join(' | '));
      } finally { await H.ctx.close(); await G.ctx.close(); br.close(); }
    }
  } catch (e) { rec('オンライン', 'オンラインの検査が最後まで動く', false, e.message.split('\n')[0]); }
}

// ---------------- 9 アプリ版（ホーム画面用のページ）
try {
  const { ctx, page, logs } = await openPage(env, 'dist/app/index.html', { w: 844, h: 390, touch: true, mobile: true, init: INIT });
  await waitTitle(page, 240000);
  const v = await page.evaluate(() => ({ ver: document.querySelector('.screen.title .ver') && document.querySelector('.screen.title .ver').textContent, title: document.title }));
  rec('アプリ版', 'アプリ版のページもタイトルまで動く', !logs.filter(l => /pageerror/.test(l)).length, `${v.title} · ${v.ver}`);
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
  rec('保存', '古い版の保存から上がる（視野角は横の角度へ直す・名前と記録は残る・互換の違う遊びかけは捨てる）', u.hfov === 82 && u.sens === 1.4 && u.name === 'カナタ' && u.rec && u.rec.plays === 3 && !u.cont && u.run == null && u.old == null && !logs.filter(l => /pageerror/.test(l)).length, JSON.stringify(u));
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
md += `\n## できていない検査\n- 実機のiPhone（Safari / Claudeアプリ）での表示・音・操作・速さ。作業環境はソフトウェア描画のChromiumなので、速さと見た目の細部は実機と違う。\n- ジャイロ（端末の傾き）での照準。\n- 公開のMQTTサーバーとWebRTCの直接接続（作業環境からは届かない）。オンラインは手元の中継で検査。\n- フォントは字幅が同じ手元のフォントで測っている（DESIGN.md 環境メモ）。\n`;
if (note.length) md += `\n## メモ\n` + note.map(n => '- ' + n).join('\n') + '\n';
fs.writeFileSync(path.join(OUT, 'summary.md'), md);
console.log(`\n${ok}/${results.length} 合格 → test-results/summary.md`);
process.exit(ok === results.length ? 0 : 1);
