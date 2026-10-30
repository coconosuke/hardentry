// 自前の小さなバンドラ。src のESモジュールを1つのスクリプトにまとめる。
// 対応する書き方（これ以外は使わない）:
//   import { a, b as c } from './x.js';      （名前付きimport。複数行可）
//   import X from './x.js';  import X, { a } from './x.js';   （default）
//   export function f() / export const x = / export class C / export let y
//   export { a, b as c };
// 循環importは不可。export let は値のコピーになる（後から書き換えない）。
import fs from 'node:fs';
import path from 'node:path';

const IMPORT_RE = /^\s*import\s*(?:([A-Za-z_$][\w$]*)\s*(?:,\s*)?)?(?:\{([\s\S]*?)\})?\s*from\s*['"]([^'"]+)['"]\s*;?/gm;
const EXPORT_DEFAULT_RE = /^export\s+default\s+/m;
const EXPORT_DECL_RE = /^export\s+(async\s+function\*?|function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST_RE = /^export\s*\{([^}]*)\}\s*;?/gm;

// 宣言の残り（最初の名前の後ろ）から、深さ0のカンマの後の名前を拾う（文の終わり ; か、深さ0の改行まで）
function extraDeclNames(s, i) {
  const out = [];
  let depth = 0, q = null;
  for (; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; i--; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (depth === 0 && (c === ';' || c === '\n')) break;
    else if (depth === 0 && c === ',') { const m = /^\s*([A-Za-z_$][\w$]*)\s*=/.exec(s.slice(i + 1, i + 80)); if (m) out.push(m[1]); }
  }
  return out;
}

function modId(file, root) {
  return '__m_' + path.relative(root, file).replace(/\.js$/, '').replace(/[^A-Za-z0-9_]/g, '_');
}

export function bundle(entry, { root, defines = {} } = {}) {
  root = root || path.dirname(entry);
  const mods = new Map(); // file -> {id, deps, code}
  const order = [];
  const visiting = new Set();

  function load(file) {
    if (mods.has(file)) return;
    if (visiting.has(file)) throw new Error('循環import: ' + file);
    visiting.add(file);
    let src = fs.readFileSync(file, 'utf8');
    const deps = [];
    const header = [];
    src = src.replace(IMPORT_RE, (m, def, names, spec) => {
      const depFile = path.resolve(path.dirname(file), spec);
      if (!fs.existsSync(depFile)) throw new Error(`import先がない: ${spec} (${file})`);
      deps.push(depFile);
      const parts = (names || '').split(',').map(s => s.trim()).filter(Boolean).map(s => {
        const mm = s.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
        if (!mm) throw new Error(`importの書き方が対応外: "${s}" (${file})`);
        return mm[2] ? `${mm[1]}: ${mm[2]}` : mm[1];
      });
      if (def) parts.unshift(`default: ${def}`);
      header.push({ dep: depFile, parts });
      return '';
    });
    if (/^\s*import\s/m.test(src)) throw new Error('対応外のimport: ' + file);
    const exported = [];
    if (EXPORT_DEFAULT_RE.test(src)) { src = src.replace(EXPORT_DEFAULT_RE, 'const __default = '); exported.push('default: __default'); }
    // export const A = 1, B = 2; のように1つの文で複数の名前を出すときも、全部の名前を拾う
    src = src.replace(EXPORT_DECL_RE, (m, kind, name, off, whole) => {
      exported.push(name);
      if (/^(const|let|var)$/.test(kind)) for (const n of extraDeclNames(whole, off + m.length)) exported.push(n);
      return `${kind} ${name}`;
    });
    src = src.replace(EXPORT_LIST_RE, (m, list) => {
      for (const s of list.split(',').map(x => x.trim()).filter(Boolean)) {
        const mm = s.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
        if (!mm) throw new Error(`exportの書き方が対応外: "${s}" (${file})`);
        exported.push(mm[2] ? `${mm[2]}: ${mm[1]}` : mm[1]);
      }
      return '';
    });
    if (/^export\s/m.test(src)) throw new Error('対応外のexport: ' + file);
    for (const d of deps) load(d);
    visiting.delete(file);
    const id = modId(file, root);
    const head = header.map(h => `const { ${h.parts.join(', ')} } = ${modId(h.dep, root)};`).join('\n');
    const code = `const ${id} = (() => {\n${head}\n${src}\nreturn { ${exported.join(', ')} };\n})();`;
    mods.set(file, { id, deps, code });
    order.push(file);
  }
  load(path.resolve(entry));
  const defs = Object.entries(defines).map(([k, v]) => `const ${k} = ${JSON.stringify(v)};`).join('\n');
  return `'use strict';\n${defs}\n` + order.map(f => `// ---- ${path.relative(root, f)}\n` + mods.get(f).code).join('\n');
}

export function listModules(entry, root) {
  const out = [];
  const seen = new Set();
  (function walk(file) {
    if (seen.has(file)) return; seen.add(file);
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) walk(path.resolve(path.dirname(file), m[3]));
    out.push(path.relative(root, file));
  })(path.resolve(entry));
  return out;
}
