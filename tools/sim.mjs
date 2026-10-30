// AIだけの試合をまとめて回す（バランスと、マップをAIが歩けるかの確認）。
//  node tools/sim.mjs pve <map|all> <mission|all> [回数=4] [シード=1] [--diff=normal] [--dt=30] [--max=900] [--log]
//  node tools/sim.mjs pvp <map|all> <tdm|elim|bomb|all> [回数=4] [シード=1] [--size=4v4] [--bot=2] [--swap]
//  --json=出力.json で1試合ずつの結果を書き出す。--md=出力.md で表にする（同じシードで前後を比べられる）
import fs from 'node:fs';
import { createGame, step } from '../src/engine/engine.js';
import { MAPS, PVE_MAPS, PVP_MAPS } from '../src/engine/maps/index.js';
import { MISSIONS } from '../src/engine/data/missions.js';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const pos = args.filter(a => !a.startsWith('--'));
const kind = pos[0] || 'pve';
const N = +(pos[3] || 4), seed0 = +(pos[4] || 1);
const dt = 1 / +(flags.dt || 30);
const maxT = +(flags.max || (kind === 'pve' ? 900 : 1500));

export function runPve(map, mission, seed, o = {}) {
  const G = createGame({ map, mode: 'pve', mission, diff: o.diff || 'normal', team: o.team || 4, allAI: true, seed, dt: o.dt || dt });
  const S = G.S, w = G.w;
  if (o.log) S.debugLead = [];
  const steps = Math.round((o.max || maxT) / S.dt);
  let lastEv = 0, quietMax = 0, firstContact = -1;
  const t0 = Date.now();
  for (let i = 0; i < steps && S.m.phase === 'play'; i++) {
    const ev = step(G, {});
    for (const e of ev) {
      if (e.e === 'shot' || e.e === 'kill' || e.e === 'cuffed' || e.e === 'comply' || e.e === 'report' || e.e === 'breach' || e.e === 'evidence') {
        const t = S.t * S.dt; quietMax = Math.max(quietMax, t - lastEv); lastEv = t;
        if (firstContact < 0 && (e.e === 'shot' || e.e === 'comply')) firstContact = t;
      }
    }
  }
  const m = S.m, sc = m.score || null;
  const sus = m.sus.map(id => S.byId[id]).filter(Boolean), civ = m.civ.concat(m.hostages).map(id => S.byId[id]).filter(Boolean);
  const swat = S.actors.filter(a => a.kind === 'swat');
  const indoor = w.rooms.filter(r => !r.out && r.cells.length >= 4).length;
  const L = m.lead || {};
  return {
    map, mission, seed, res: m.result || 'timeout', why: m.why || '', grade: sc ? sc.grade : '-', score: sc ? Math.round(sc.total) : 0,
    t: Math.round(S.t * S.dt), wall: Date.now() - t0,
    sus: sus.length, susArrest: sus.filter(a => a.alive && a.cuffed).length, susDead: sus.filter(a => !a.alive).length,
    civ: civ.length, civSafe: civ.filter(a => a.alive && a.cuffed).length, civDead: civ.filter(a => !a.alive).length,
    swatDead: swat.filter(a => !a.alive || a.down).length, rooms: (L.visited || []).filter(r => !w.rooms[r].out).length, roomsAll: indoor,
    viol: sc ? sc.viol.length : 0, quiet: Math.round(quietMax), contact: Math.round(firstContact), log: o.log ? S.debugLead : undefined,
  };
}

export function runPvp(map, mode, seed, o = {}) {
  const sizes = (o.size || '4v4').split('v').map(Number);
  const G = createGame({ map, mode, teams: sizes, roster: [], rules: { botLevel: +(o.bot || 2), wins: o.wins ?? 3, time: 480, ff: false }, seed, dt: o.dt || dt });
  const S = G.S, m = S.m;
  const steps = Math.round((o.max || maxT) / S.dt);
  const kills = [0, 0], deaths = [0, 0];
  let lastKill = 0, gapMax = 0, gaps = [], rounds = [], roundStart = 0, plants = 0, defuses = 0;
  const t0 = Date.now();
  for (let i = 0; i < steps && !m.over; i++) {
    const ev = step(G, {});
    for (const e of ev) {
      if (e.e === 'kill' || (e.e === 'down' && mode === 'bomb')) {
        const a = S.byId[e.id], b = S.byId[e.by];
        if (a) deaths[a.team]++;
        if (b && a && b.team !== a.team) kills[b.team]++;
        const t = S.t * S.dt; gaps.push(t - lastKill); gapMax = Math.max(gapMax, t - lastKill); lastKill = t;
      }
      if (e.e === 'planted') plants++;
      if (e.e === 'round') { const t = S.t * S.dt; rounds.push({ win: e.win, why: e.why, len: Math.round(t - roundStart) }); roundStart = t; lastKill = t; }
      if (e.e === 'phase' && e.p === 'action') roundStart = S.t * S.dt;
    }
  }
  const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  return {
    map, mode, seed, size: o.size || '4v4', winner: m.over ? m.winner : 'timeout', wins: m.wins ? m.wins.slice() : null, score: m.score ? m.score.slice() : null,
    t: Math.round(S.t * S.dt), wall: Date.now() - t0, kills, deaths, rounds, plants, avgGap: Math.round(avgGap * 10) / 10, gapMax: Math.round(gapMax),
    timeRounds: rounds.filter(r => r.why === 'time').length,
  };
}

function summarize(rows, key) {
  const out = {};
  for (const r of rows) { const k = r[key]; (out[k] = out[k] || []).push(r); }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('sim.mjs')) {
  const rows = [];
  if (kind === 'pve') {
    const maps = pos[1] === 'all' || !pos[1] ? PVE_MAPS : [pos[1]];
    const missions = pos[2] === 'all' || !pos[2] ? Object.keys(MISSIONS) : [pos[2]];
    for (const map of maps) for (const mission of missions) {
      if (MAPS[map].missions && !MAPS[map].missions[mission]) continue;
      for (let s = 0; s < N; s++) {
        const r = runPve(map, mission, seed0 + s, { diff: flags.diff, log: !!flags.log });
        rows.push(r);
        console.log(`${map} ${mission} #${r.seed}: ${r.res}${r.why ? '(' + r.why + ')' : ''} ${r.grade} ${r.score}点 ${r.t}s 容疑者 ${r.susArrest}逮捕/${r.susDead}死/${r.sus} 市民 ${r.civSafe}/${r.civ}(死${r.civDead}) 隊員倒れ${r.swatDead} 部屋 ${r.rooms}/${r.roomsAll} 違反${r.viol} 静か最長${r.quiet}s [${r.wall}ms]`);
        if (r.log) console.log('   ' + r.log.join(' | '));
      }
    }
    const by = summarize(rows, 'mission');
    console.log('\n任務ごと:');
    for (const [k, rs] of Object.entries(by)) {
      const avg = (f) => (rs.reduce((a, r) => a + f(r), 0) / rs.length);
      console.log(`  ${k}: 完了 ${rs.filter(r => r.res === 'done').length}/${rs.length} 失敗 ${rs.filter(r => r.res === 'fail').length} 平均 ${avg(r => r.score).toFixed(0)}点 ${avg(r => r.t).toFixed(0)}s 隊員倒れ ${avg(r => r.swatDead).toFixed(2)} 部屋 ${(100 * avg(r => r.rooms / Math.max(1, r.roomsAll))).toFixed(0)}%`);
    }
  } else {
    const maps = pos[1] === 'all' || !pos[1] ? PVP_MAPS : [pos[1]];
    const modes = pos[2] === 'all' || !pos[2] ? ['tdm', 'elim', 'bomb'] : [pos[2]];
    for (const map of maps) for (const mode of modes) for (let s = 0; s < N; s++) {
      const r = runPvp(map, mode, seed0 + s, { size: flags.size, bot: flags.bot });
      rows.push(r);
      console.log(`${map} ${mode} #${r.seed} ${r.size}: 勝ち ${r.winner} ${r.wins ? 'R' + r.wins.join('-') : ''} ${r.score ? 'S' + r.score.join('-') : ''} ${r.t}s キル ${r.kills.join('-')} 設置${r.plants} 撃ち合いの間 平均${r.avgGap}s 最長${r.gapMax}s 時間切れR ${r.timeRounds}/${r.rounds.length} [${r.wall}ms]`);
    }
    const by = summarize(rows, 'mode');
    console.log('\nモードごと:');
    for (const [k, rs] of Object.entries(by)) {
      const w0 = rs.filter(r => r.winner === 0).length, w1 = rs.filter(r => r.winner === 1).length;
      const avg = (f) => (rs.reduce((a, r) => a + f(r), 0) / rs.length);
      console.log(`  ${k}: チーム0の勝ち ${w0} / チーム1 ${w1} / 他 ${rs.length - w0 - w1}  平均 ${avg(r => r.t).toFixed(0)}s  キルの間 ${avg(r => r.avgGap).toFixed(1)}s`);
    }
  }
  if (flags.json) fs.writeFileSync(flags.json, JSON.stringify(rows, null, 1));
}
