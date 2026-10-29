// ビルド: node tools/build.mjs
//  dist/claude/index.html  … Claudeの中で動く版（アーティファクト。doctype等は公開時に付く）
//  dist/claude/preview.html … 上を公開時と同じ骨組みで包んだ確認用
//  dist/app/               … ホーム画面に入れるアプリ版（GitHub Pages 用）
//  dist/source-bundle.txt  … ソース一式（tools/unbundle.mjs で復元）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { bundle } from './bundler.mjs';
import { makeSourceBundle } from './unbundle.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const r = (...p) => path.join(ROOT, ...p);
const t0 = Date.now();

const js = bundle(r('src/app/main.js'), { root: r('src') });
const css = fs.readFileSync(r('src/ui/style.css'), 'utf8');
const dataSrc = fs.readFileSync(r('src/engine/data.js'), 'utf8');
const VERSION = /export const VERSION = '([^']+)'/.exec(dataSrc)[1];
const COMPAT = /export const COMPAT = (\d+)/.exec(dataSrc)[1];

// 素材（base64でページに埋め込む）
const assets = {};
const add = (name, file) => { assets[name] = fs.readFileSync(file).toString('base64'); };
add('creature.bin', r('src/assets/creature.bin'));
add('voices/voices.json', r('src/assets/voices/voices.json'));
for (const f of fs.readdirSync(r('src/assets/voices'))) if (f.endsWith('.m4a')) add('voices/' + f, r('src/assets/voices', f));
add('music/music.json', r('src/assets/music/music.json'));
for (const f of fs.readdirSync(r('src/assets/music'))) if (f.endsWith('.m4a')) add('music/' + f, r('src/assets/music', f));
for (const f of ['scare1.jpg', 'scare2.jpg', 'scare3.jpg', 'face.jpg']) if (fs.existsSync(r('src/assets', f))) add(f, r('src/assets', f));
const assetsJS = 'window.__ASSETS=' + JSON.stringify(assets) + ';';

const hash = crypto.createHash('sha256').update(js).update(css).update(assetsJS).digest('hex').slice(0, 10);
const FONTS = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Shippori+Mincho:wght@500;700;800&display=swap';
const STAGE = `<div id="stage">
<canvas id="gl" aria-label="ゲームの画面"></canvas>
<canvas id="blood" aria-hidden="true"></canvas>
<div id="hud"></div>
<div id="fade"></div>
<div id="scare"></div>
<div id="screens"></div>
<div class="ctxlost" role="status">画面を準備し直しています…</div>
<div id="fps" hidden></div>
</div>`;
const safeJS = (s) => s.replace(/<\/script/gi, '<\\/script');
const BUILD = `window.__BUILD=${JSON.stringify({ version: VERSION, compat: +COMPAT, hash, built: new Date().toISOString() })};`;

// ---- Claude版
const claudeHead = `<title>ミテル</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${css}
</style>`;
const claudeBody = `${STAGE}
<script>${BUILD}</script>
<script>${safeJS(assetsJS)}</script>
<script>
${safeJS(js)}
</script>`;
const claudePage = claudeHead + '\n' + claudeBody + '\n';
fs.mkdirSync(r('dist/claude'), { recursive: true });
fs.writeFileSync(r('dist/claude/index.html'), claudePage);
// 公開時の骨組み（charset・viewport・小さなリセット）で包んだ確認用
const skeleton = (inner) => `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${inner}</body></html>`;
fs.writeFileSync(r('dist/claude/preview.html'), skeleton(claudePage));

// ---- アプリ版
fs.mkdirSync(r('dist/app'), { recursive: true });
const icon180 = fs.existsSync(r('src/assets/icon-180.png')) ? fs.readFileSync(r('src/assets/icon-180.png')).toString('base64') : '';
for (const s of [192, 512]) { const f = r(`src/assets/icon-${s}.png`); if (fs.existsSync(f)) fs.copyFileSync(f, r(`dist/app/icon-${s}.png`)); }
const appPage = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="ミテル">
<meta name="theme-color" content="#060807">
${icon180 ? `<link rel="apple-touch-icon" href="data:image/png;base64,${icon180}">` : ''}
<link rel="manifest" href="manifest.webmanifest">
${claudeHead}
</head>
<body>
${claudeBody}
<script>
if ('serviceWorker' in navigator && location.protocol === 'https:') { navigator.serviceWorker.register('sw.js').catch(function () {}); }
</script>
</body>
</html>
`;
fs.writeFileSync(r('dist/app/index.html'), appPage);
fs.writeFileSync(r('dist/app/manifest.webmanifest'), JSON.stringify({
  name: 'ミテル', short_name: 'ミテル', lang: 'ja', start_url: './', scope: './', display: 'standalone', orientation: 'landscape',
  background_color: '#060807', theme_color: '#060807',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 1));
// SW: 毎回ネットワークを確かめ（no-cache）、つながらないときだけ保存分を使う。アイコンとマニフェストは横取りしない。
fs.writeFileSync(r('dist/app/sw.js'), `// ビルド ${hash}
const CACHE = 'miteru-${hash}';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (/\\.(png|webmanifest)$/.test(u.pathname)) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(res => {
    if (res && res.ok && res.type === 'basic') { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
    return res;
  }).catch(() => caches.match(e.request).then(m => m || caches.match('./'))));
});
`);
fs.writeFileSync(r('dist/app/.nojekyll'), '');

// ---- ソース一式
const sb = makeSourceBundle(ROOT);
fs.writeFileSync(r('dist/source-bundle.txt'), sb.text);

const kb = (n) => (n / 1024).toFixed(0) + 'KB';
console.log(JSON.stringify({ version: VERSION, compat: +COMPAT, hash, ms: Date.now() - t0, claude: kb(claudePage.length), js: kb(js.length), assets: kb(assetsJS.length), app: kb(appPage.length), sourceBundle: kb(sb.text.length), files: sb.count }));
