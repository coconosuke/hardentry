// バランス測定: AIだけの試合をたくさん回して test-results/balance.md にまとめる
//  node tools/balance.mjs [--pvp=回数] [--pve=回数] [--seed=1] [--only=pvp|pve] [--maps=a,b] [--size=4v4] [--json=出力.json]
//  対戦: マップ×モード（TDM・殲滅戦・爆弾）× 回数。爆弾は攻撃側のラウンド勝率、殲滅戦はSWAT側のラウンド勝率、TDMはチームの勝率
//  作戦: マップ×作戦× 回数。完了率・点数・隊員の損害・時間
import fs from 'node:fs';
import path from 'node:path';
import { runPve, runPvp } from './sim.mjs';
import { MAPS, PVE_MAPS, PVP_MAPS } from '../src/engine/maps/index.js';
import { MISSIONS } from '../src/engine/data/missions.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const F = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const NP = +(F.pvp ?? 6), NE = +(F.pve ?? 4), seed0 = +(F.seed ?? 1);
const only = F.only || null, mapsF = F.maps ? String(F.maps).split(',') : null;
const t0 = Date.now();
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '-';
const avg = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const out = { pvp: [], pve: [] };
let md = `# バランス測定\n\n${new Date().toISOString()}・対戦 ${NP}回/組・作戦 ${NE}回/組・シード ${seed0}〜\n\n`;

if (only !== 'pve') {
  const rows = out.pvp;
  const modesF = F.modes ? String(F.modes).split(',') : ['tdm', 'elim', 'bomb'];
  for (const map of (mapsF || PVP_MAPS).filter(m => PVP_MAPS.includes(m))) for (const mode of modesF) for (let s = 0; s < NP; s++) {
    const r = runPvp(map, mode, seed0 + s, { size: F.size || '4v4', bot: F.bot || 2, max: 1500 });
    rows.push(r);
    process.stdout.write(`${map} ${mode} #${r.seed}: 勝ち ${r.winner} キル ${r.kills.join('-')} ${r.t}s [${r.wall}ms]\n`);
  }
  md += `## 対戦（ボット ${F.size || '4v4'}・強さ${F.bot || 2}）\n\n`;
  md += `| マップ | モード | 試合 | チーム0の勝ち | 側の勝率（ラウンド） | 1試合 | 1ラウンド | 時間切れR | キル/分 | 設置 | 決着の内訳 |\n|---|---|---|---|---|---|---|---|---|---|---|\n`;
  const tot = { bomb: { att: 0, n: 0 }, elim: { swat: 0, n: 0 }, tdm: { t0: 0, n: 0 } };
  for (const map of [...new Set(rows.map(r => r.map))]) for (const mode of ['tdm', 'elim', 'bomb']) {
    const rs = rows.filter(r => r.map === map && r.mode === mode);
    if (!rs.length) continue;
    const w0 = rs.filter(r => r.winner === 0).length;
    const R = rs.flatMap(r => r.rounds);
    let side = '-';
    if (mode === 'bomb') { const a = R.filter(x => x.win === x.att).length; side = `攻撃 ${pct(a, R.length)}（${a}/${R.length}）`; tot.bomb.att += a; tot.bomb.n += R.length; }
    if (mode === 'elim') { const a = R.filter(x => x.win === x.swat).length; side = `SWAT ${pct(a, R.length)}（${a}/${R.length}）`; tot.elim.swat += a; tot.elim.n += R.length; }
    if (mode === 'tdm') { side = `チーム0 ${pct(w0, rs.length)}`; tot.tdm.t0 += w0; tot.tdm.n += rs.length; }
    const why = {}; for (const x of R) why[x.why] = (why[x.why] || 0) + 1;
    const kpm = avg(rs.map(r => (r.kills[0] + r.kills[1]) / Math.max(1, r.t / 60)));
    md += `| ${MAPS[map].name} | ${mode} | ${rs.length} | ${w0} | ${side} | ${Math.round(avg(rs.map(r => r.t)))}s | ${R.length ? Math.round(avg(R.map(x => x.len))) + 's' : '-'} | ${R.filter(x => x.why === 'time').length}/${R.length} | ${kpm.toFixed(1)} | ${rs.reduce((a, r) => a + r.plants, 0)} | ${Object.entries(why).map(([k, v]) => k + ' ' + v).join('・') || '-'} |\n`;
  }
  md += `\n**全体**: 爆弾の攻撃側ラウンド勝率 ${pct(tot.bomb.att, tot.bomb.n)}（${tot.bomb.att}/${tot.bomb.n}）・殲滅戦のSWAT側 ${pct(tot.elim.swat, tot.elim.n)}（${tot.elim.swat}/${tot.elim.n}）・TDMのチーム0 ${pct(tot.tdm.t0, tot.tdm.n)}（${tot.tdm.t0}/${tot.tdm.n}）\n\n`;
  out.pvpTot = tot;
}

if (only !== 'pvp') {
  const rows = out.pve;
  for (const map of (mapsF || PVE_MAPS).filter(m => PVE_MAPS.includes(m))) for (const mission of Object.keys(MISSIONS)) {
    if (MAPS[map].missions && !MAPS[map].missions[mission]) continue;
    for (let s = 0; s < NE; s++) {
      const r = runPve(map, mission, seed0 + s, { diff: F.diff || 'normal', max: 900 });
      rows.push(r);
      process.stdout.write(`${map} ${mission} #${r.seed}: ${r.res}${r.why ? '(' + r.why + ')' : ''} ${r.grade} ${r.score}点 ${r.t}s [${r.wall}ms]\n`);
    }
  }
  md += `## 作戦（AIの部隊4名・${F.diff || 'normal'}）\n\n| マップ | 作戦 | 試合 | 完了 | 失敗 | 時間切れ | 平均点 | 評価 | 時間 | 隊員の損害 | 容疑者 逮捕/死亡 | 市民 保護/死亡 | 違反 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const map of [...new Set(rows.map(r => r.map))]) for (const mission of Object.keys(MISSIONS)) {
    const rs = rows.filter(r => r.map === map && r.mission === mission);
    if (!rs.length) continue;
    const g = {}; for (const r of rs) g[r.grade] = (g[r.grade] || 0) + 1;
    md += `| ${MAPS[map].name} | ${MISSIONS[mission].name} | ${rs.length} | ${rs.filter(r => r.res === 'done').length} | ${rs.filter(r => r.res === 'fail').length} | ${rs.filter(r => r.res === 'timeout').length} | ${Math.round(avg(rs.map(r => r.score)))} | ${Object.entries(g).map(([k, v]) => k + v).join(' ')} | ${Math.round(avg(rs.map(r => r.t)))}s | ${avg(rs.map(r => r.swatDead)).toFixed(1)} | ${avg(rs.map(r => r.susArrest)).toFixed(1)}/${avg(rs.map(r => r.susDead)).toFixed(1)} | ${avg(rs.map(r => r.civSafe)).toFixed(1)}/${avg(rs.map(r => r.civDead)).toFixed(1)} | ${avg(rs.map(r => r.viol)).toFixed(1)} |\n`;
  }
  const done = rows.filter(r => r.res === 'done').length;
  md += `\n**全体**: 完了 ${pct(done, rows.length)}（${done}/${rows.length}）・平均点 ${Math.round(avg(rows.map(r => r.score)))}\n\n`;
}
md += `（${((Date.now() - t0) / 1000).toFixed(0)}秒）\n`;
fs.mkdirSync(path.join(ROOT, 'test-results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'test-results', F.md || 'balance.md'), md);
if (F.json) fs.writeFileSync(F.json, JSON.stringify(out, null, 1));
console.log(md);
