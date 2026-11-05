// GitHub Pages 用のリポジトリ（main の直下）の中身をそろえる: node tools/stage_repo.mjs <出力先>
// アプリ版（dist/app）一式（.nojekyll・ソース一式を含む）＋設計メモ＋README。個人情報は入れない。
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'repo'));
fs.mkdirSync(out, { recursive: true });
const app = path.join(ROOT, 'dist/app');
for (const f of fs.readdirSync(app)) fs.copyFileSync(path.join(app, f), path.join(out, f));
fs.copyFileSync(path.join(ROOT, 'DESIGN.md'), path.join(out, 'DESIGN.md'));
const vsrc = fs.readFileSync(path.join(ROOT, 'src/engine/data/version.js'), 'utf8');
const ver = /export const VERSION = '([^']+)'/.exec(vsrc)[1];
const url = process.env.PAGES_URL || 'https://coconosuke.github.io/hardentry/';
fs.writeFileSync(path.join(out, 'README.md'), `# HARD ENTRY（仮）

リアル寄りの戦術FPS。スマホ（iPhone・Android）の横持ちで遊べます。

- 作戦（PvE）: Ready or Not の決まり。ソロ／協力（オンライン2〜4人）、空き枠はAI隊員。投降・拘束・報告・証拠・採点。
- 対戦（PvP）: Rainbow Six Siege の決まり。1対1〜4対4、空き枠はボット。チームデスマッチ（復活あり／なし）と爆弾（設置・解除）。
- 見た目と動き: BattleBit Remastered のようなローポリと実際の体の比率。銃は実銃。

- 遊ぶ: ${url}
- 版: v${ver}
- 横持ち・ヘッドホン推奨

## ホーム画面に入れる
- iPhone: Safari で上のURLを開き、共有 →「ホーム画面に追加」。ホーム画面のアイコンから開くと全画面で遊べます。
- Android: Chrome で開き、メニュー →「ホーム画面に追加」（または「アプリをインストール」）。

ホーム画面のアプリと Claude の中で遊ぶ版は、保存（設定・コールサイン・装備・記録）が別々です。移すときは「設定 → その他 → 引き継ぎコード」を使ってください。

## オンライン
タイトルの「作戦」→「協力（オンライン）」、または「対戦」→「オンライン対戦」でルームを作り、表示されたコードを相手に伝えます。

## ファイル
- \`index.html\` … ゲーム本体（音・画像を含めて1ファイル）
- \`sw.js\` \`manifest.webmanifest\` \`icon-*.png\` … ホーム画面のアプリ用
- \`source-bundle.txt\` … ソース一式。\`node tools/unbundle.mjs source-bundle.txt <出力先>\` で元のファイルに戻せます
- \`DESIGN.md\` … 設計メモ（仕様・数値・調整の記録）

個人で遊ぶために作ったものです。銃・装備の名前は実在の物ですが、各社とは関係ありません。
`);
console.log(JSON.stringify({ out, ver, files: fs.readdirSync(out) }));
