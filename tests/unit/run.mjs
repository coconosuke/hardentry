// 単体テストをまとめて流す: node tests/unit/run.mjs [絞り込み]
import { runTests } from '../lib/t.mjs';
import fs from 'node:fs';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.mjs')).sort();
let all = [];
for (const f of files) { await import(path.join(dir, f)); const r = await runTests(process.argv[2]); all = all.concat(r.map(x => ({ ...x, file: f }))); }
const bad = all.filter(r => !r.ok);
for (const r of all) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name} (${r.ms.toFixed(1)}ms)${r.ok ? '' : '\n' + r.err}`);
console.log(`\n${all.length - bad.length}/${all.length} 合格`);
if (process.env.UNIT_JSON) fs.writeFileSync(process.env.UNIT_JSON, JSON.stringify(all, null, 1));
process.exit(bad.length ? 1 : 0);
