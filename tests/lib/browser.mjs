// テスト用のブラウザ。ビルドしたページを開き、フォントは手元の同じ字幅のものに差し替える。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { startServer } from '../../tools/server.mjs';
import path from 'node:path';

// Google Fonts の代わり（作業環境からは届かないため）。字幅が同じ Noto CJK を使う。
const FONT_CSS = `
@font-face{font-family:'Noto Sans JP';font-weight:400;src:local('NotoSansCJKjp-Regular');}
@font-face{font-family:'Noto Sans JP';font-weight:500;src:local('NotoSansCJKjp-Medium');}
@font-face{font-family:'Noto Sans JP';font-weight:700;src:local('NotoSansCJKjp-Bold');}
@font-face{font-family:'Shippori Mincho';font-weight:500;src:local('NotoSerifCJKjp-Medium');}
@font-face{font-family:'Shippori Mincho';font-weight:700;src:local('NotoSerifCJKjp-Bold');}
@font-face{font-family:'Shippori Mincho';font-weight:800;src:local('NotoSerifCJKjp-Black');}
`;

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

export async function launch() {
  const srv = await startServer(ROOT, 0);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  return { srv, browser, base: `http://127.0.0.1:${srv.port}/`, close: async () => { await browser.close(); await srv.close(); } };
}

// iPhone などを再現して開く
export async function openPage(env, url, o = {}) {
  const ctx = await env.browser.newContext({
    viewport: { width: o.w || 844, height: o.h || 390 },
    deviceScaleFactor: o.dpr || 1,
    hasTouch: !!o.touch, isMobile: !!o.mobile,
    userAgent: o.ua,
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: FONT_CSS }));
  await page.route('https://fonts.gstatic.com/**', r => r.abort());
  if (o.init) await page.addInitScript(o.init);
  if (o.safe) {
    // 安全領域（ノッチ・アイランド）を再現
    const cdp = await ctx.newCDPSession(page);
    try { await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: o.safe }); page.__safeOK = true; } catch (e) { page.__safeOK = false; page.__safeErr = e.message; }
  }
  await page.goto(env.base + url);
  return { ctx, page, logs };
}

// タイトルが出るまで待つ
export async function waitTitle(page, timeout = 120000) {
  await page.waitForFunction(() => window.__app && window.__app.screens && window.__app.screens.cur === 'title', null, { timeout });
}
