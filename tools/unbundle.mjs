// ソース一式の書き出しと復元
//   復元: node tools/unbundle.mjs source-bundle.txt <出力先>
import fs from 'node:fs';
import path from 'node:path';

const TEXT_EXT = new Set(['.js', '.mjs', '.css', '.html', '.md', '.json', '.py', '.txt']);
const INCLUDE_DIRS = ['src', 'tools', 'tests', 'dev'];
const INCLUDE_FILES = ['DESIGN.md', 'package.json'];
const MARK = '@@@@ FILE ';

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); } else out.push(p);
  }
}

export function makeSourceBundle(root) {
  const files = [];
  for (const d of INCLUDE_DIRS) walk(path.join(root, d), files);
  for (const f of INCLUDE_FILES) if (fs.existsSync(path.join(root, f))) files.push(path.join(root, f));
  files.sort();
  let text = `HARD ENTRY ソース一式（${new Date().toISOString()}）\n復元: node tools/unbundle.mjs source-bundle.txt <出力先>\n（tools/unbundle.mjs がない場合は、下の "${MARK}" の区切りごとにファイルへ書き出す。base64 と書かれたものはデコードする）\n\n`;
  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    const ext = path.extname(f).toLowerCase();
    const buf = fs.readFileSync(f);
    if (TEXT_EXT.has(ext)) text += `${MARK}${rel} text ${buf.length}\n${buf.toString('utf8')}\n`;
    else text += `${MARK}${rel} base64 ${buf.length}\n${buf.toString('base64')}\n`;
  }
  return { text, count: files.length };
}

export function restore(text, outDir) {
  const parts = text.split('\n' + MARK);
  let n = 0;
  for (let i = 1; i < parts.length; i++) {
    const nl = parts[i].indexOf('\n');
    const [rel, kind, len] = parts[i].slice(0, nl).split(' ');
    const body = parts[i].slice(nl + 1);
    const fp = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    // 長さ（バイト数）で切り出すので、末尾の改行も元どおり
    fs.writeFileSync(fp, kind === 'base64' ? Buffer.from(body, 'base64') : Buffer.from(body, 'utf8').subarray(0, +len));
    n++;
  }
  return n;
}

if (process.argv[1] && process.argv[1].endsWith('unbundle.mjs') && process.argv[2]) {
  const n = restore(fs.readFileSync(process.argv[2], 'utf8'), process.argv[3] || 'restored');
  console.log('復元したファイル:', n);
}
