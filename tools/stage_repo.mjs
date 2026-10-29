// GitHub Pages 用のリポジトリの中身をそろえる: node tools/stage_repo.mjs <出力先>
// アプリ版（dist/app）一式＋ソース一式＋設計メモ＋README。個人情報は入れない。
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'repo'));
fs.mkdirSync(out, { recursive: true });
const app = path.join(ROOT, 'dist/app');
for (const f of fs.readdirSync(app)) fs.copyFileSync(path.join(app, f), path.join(out, f));
fs.copyFileSync(path.join(ROOT, 'dist/source-bundle.txt'), path.join(out, 'source-bundle.txt'));
fs.copyFileSync(path.join(ROOT, 'DESIGN.md'), path.join(out, 'DESIGN.md'));
const ver = /export const VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'src/engine/data.js'), 'utf8'))[1];
const url = process.env.PAGES_URL || 'https://coconosuke.github.io/miteru/';
fs.writeFileSync(path.join(out, 'README.md'), `# ミテル — あなたを見ている

一人称・360°の3Dホラー。廃病棟で鍵を集め、非常口から外へ逃げてください。攻撃する手段はありません。見つかったら逃げるか、隠れてやり過ごすだけです。

- 遊ぶ: ${url}
- 版: v${ver}
- 横持ち推奨・ヘッドホン推奨

## iPhoneのホーム画面に入れる
1. Safari で上のURLを開く
2. 共有ボタン →「ホーム画面に追加」（iOS 26 では、アドレスバーの「…」の中に共有ボタンがあります）
3. ホーム画面のアイコンから開くと、全画面で遊べます

ホーム画面のアプリと、Claude の中で遊ぶ版は、保存（設定・名前・記録）が別々です。移すときは「設定 → データ → 引き継ぎコード」を使ってください。

## ファイル
- \`index.html\` … ゲーム本体（音・画像を含めて1ファイル）
- \`sw.js\` \`manifest.webmanifest\` \`icon-*.png\` … ホーム画面のアプリ用
- \`source-bundle.txt\` … ソース一式。\`node tools/unbundle.mjs source-bundle.txt <出力先>\` で元のファイルに戻せます
- \`DESIGN.md\` … 設計メモ（仕様・数値・調整の記録）

個人で遊ぶために作ったものです。
`);
console.log(JSON.stringify({ out, files: fs.readdirSync(out) }));
