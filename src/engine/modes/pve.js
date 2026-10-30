// 作戦（PvE）: バリケード・人質救出・爆弾脅迫・強制捜査（レイド）・アクティブシューター
// 採点（100点）: 主目的50（容疑者25・市民25）、副目的30（報告10・証拠10・作戦別10）、隊員の安全10、規則10。違反で減点。評価 S〜F
import { spawnSwat, spawnSuspect, spawnCivilian, cellPos } from './spawn.js';
import { OFFICERS, LOADOUTS, SUSPECTS } from '../data/npc.js';
import { MAPS } from '../maps/index.js';
import { MISSIONS, DIFFS } from '../data/missions.js';
import { rnd, rndShuffle, rndInt, rndPick } from '../rng.js';
import { CS, LH } from '../world.js';
import { killActor } from '../combat.js';

const sec = (S, t0) => (S.t - t0) * S.dt;

export default {
  init(S, w, o) {
    const def = MAPS[S.map];
    const M = MISSIONS[o.mission] || MISSIONS.barricade;
    const D = DIFFS[o.diff || 'normal'] || DIFFS.normal;
    S.rules.cap = D.cap; S.rules.diff = o.diff || 'normal';
    const r = S.rng;
    const sp = def.spawn;
    // 隊員: プレイヤー（最大4人）＋AI で合計 team 人
    // allAI: 全員AI（自動テスト・観戦）。AIの指揮（ai/lead.js）が命令を出す
    const roster = o.allAI ? [] : o.roster && o.roster.length ? o.roster : [{ pid: 0, name: 'リード', lo: LOADOUTS.player }];
    if (o.allAI) S.rules.aiLead = true;
    const entry = (sp.swat || [])[o.entry ?? 0] || sp.swat[0];
    const total = Math.max(roster.length, Math.min(4, o.team ?? 4));
    let k = 0;
    const place = (n) => { const col = n % 2, row = Math.floor(n / 2); const fx = Math.sin(entry.yaw || 0), fz = Math.cos(entry.yaw || 0); return { x: entry.x - fx * row * 2.4 + (-fz) * (col ? 1.2 : -1.2) * 0.9, z: entry.z - fz * row * 2.4 + fx * (col ? 1.2 : -1.2) * 0.9 }; };
    for (const pl of roster) { const p = place(k); spawnSwat(S, w, { pid: pl.pid, name: pl.name, x: p.x, z: p.z, L: entry.L || 0, yaw: entry.yaw || 0, lo: pl.lo || LOADOUTS.player, cell: true, team: 0 }); k++; }
    const keys = ['red1', 'red2', 'blue1', 'blue2'];
    const aiN = total - roster.length;
    for (let i = 0; i < aiN; i++) {
      const of = OFFICERS[i], p = place(k);
      const lo = (o.aiLoadouts && o.aiLoadouts[i]) || LOADOUTS[keys[i]];
      spawnSwat(S, w, { name: of.name, x: p.x, z: p.z, L: entry.L || 0, yaw: entry.yaw || 0, lo, cell: true, squad: i < 2 ? 'red' : 'blue', slot: i, team: 0 });
      k++;
    }
    // 容疑者と市民（作戦とマップから）
    const MM = (def.missions && def.missions[o.mission]) || {};
    const nSus = Math.round(lerp(M.sus[0], M.sus[1], rnd(r)) * D.susMul * (MM.susMul || 1));
    const nCiv = Math.round(lerp(M.civ[0], M.civ[1], rnd(r)) * (MM.civMul || 1));
    const susSpots = rndShuffle(r, (sp.sus || []).slice());
    const civSpots = rndShuffle(r, (sp.civ || []).slice());
    const profs = MM.prof || M.prof;
    S.m = { kind: 'pve', mission: o.mission, phase: 'play', startT: S.t, sus: [], civ: [], evidence: [], bombs: [], hostages: [], log: [], reportsDone: 0, softDone: false, execDelay: D.exec, fail: null, diff: o.diff || 'normal', entry: o.entry ?? 0, title: M.name };
    // 人質救出: 人質と見張り
    if (o.mission === 'hostage') {
      const hs = rndShuffle(r, (sp.hostage || sp.civ || []).slice());
      const nH = Math.min(hs.length, Math.round(lerp(M.hostages[0], M.hostages[1], rnd(r))));
      for (let i = 0; i < nH; i++) {
        const [x, z, L = 0] = hs[i];
        const h = spawnCivilian(S, w, x, z, L, 'hostage', { tag: 'hostage' });
        S.m.hostages.push(h.id);
        // 見張り（近く）
        const g = spawnSuspect(S, w, x + (rnd(r) - 0.5) * 4, z + (rnd(r) - 0.5) * 4, L, 'taker', { hostage: h.id });
        g.ai.wantAmbush = true;
        S.m.sus.push(g.id);
      }
    }
    // 爆弾脅迫: 爆弾と見張り
    if (o.mission === 'bomb') {
      const bs = rndShuffle(r, (sp.bomb || []).slice());
      const nB = Math.min(bs.length, Math.round(lerp(M.bombs[0], M.bombs[1], rnd(r))));
      for (let i = 0; i < nB; i++) {
        const [x, z, L = 0] = bs[i];
        const p = cellPos(w, x, z, L);
        S.m.bombs.push({ id: i + 1, x: p.x, y: p.y, z: p.z, L, done: false });
        if (i < nSus) { const g = spawnSuspect(S, w, x + (rnd(r) - 0.5) * 3, z + (rnd(r) - 0.5) * 3, L, 'bomber'); g.ai.wantAmbush = true; S.m.sus.push(g.id); }
      }
      S.m.bombT = M.time; // 秒
    }
    // ほかの容疑者
    while (S.m.sus.length < nSus && susSpots.length) {
      const [x, z, L = 0] = susSpots.pop();
      const prof = rndPick(r, profs);
      const a = spawnSuspect(S, w, x, z, L, prof);
      if (o.mission === 'active') { a.ai.active = true; a.ai.alert = true; }
      S.m.sus.push(a.id);
    }
    // 市民
    const civProfs = M.civProf || ['adult', 'adult', 'staff', 'elder', 'angry'];
    for (let i = 0; i < nCiv && civSpots.length; i++) {
      const [x, z, L = 0] = civSpots.pop();
      const c = spawnCivilian(S, w, x, z, L, rndPick(r, civProfs));
      S.m.civ.push(c.id);
    }
    // 証拠（落とした武器のほかに、置かれた物）
    const evSpots = rndShuffle(r, (sp.evidence || []).slice());
    const nEv = Math.min(evSpots.length, Math.round(lerp(M.evidence[0], M.evidence[1], rnd(r))));
    const EVK = M.evKinds || ['drugs', 'phone', 'docs', 'cash'];
    for (let i = 0; i < nEv; i++) {
      const [x, z, L = 0] = evSpots[i];
      const p = cellPos(w, x, z, L);
      S.items.push({ id: S.nextItem++, kind: 'evidence', ek: rndPick(r, EVK), x: p.x + (rnd(r) - 0.5) * 0.3, y: p.y + (MM.evY || 0.76), z: p.z + (rnd(r) - 0.5) * 0.3, yaw: rnd(r) * 6.28, ev: true, obj: true });
      S.m.evidence.push(S.nextItem - 1);
    }
    // 扉の鍵と罠（マップの指定＋難しさ）
    for (let i = 0; i < w.doors.length; i++) {
      const d = w.doors[i], ds = S.doors[i];
      if (d.opt.locked == null && !d.opt.outer && rnd(r) < (M.lockChance ?? 0.25)) ds.locked = true;
      // 罠は入口から遠い側（中の側）に仕掛けてある
      if (d.opt.trap || (!d.opt.outer && rnd(r) < (M.trapChance ?? 0) * D.trapMul)) { const toEntry = (entry.x * CS - d.cx) * d.nx + (entry.z * CS - d.cz) * d.nz; ds.trap = { armed: true, team: 1, side: toEntry > 0 ? -1 : 1 }; }
    }
    S.rules.ff = true;
  },

  step(S, w, dt, ev) {
    const m = S.m;
    if (m.phase !== 'play') return;
    // 爆弾の時間
    if (m.mission === 'bomb' && m.bombs.some(b => !b.done)) {
      m.bombT -= dt;
      if (m.bombT <= 0) {
        m.bombT = 0;
        for (const b of m.bombs) if (!b.done) S.blasts.push({ x: b.x, y: b.y + 0.4, z: b.z, r: 14, dmg: 600, kind: 'bomb', by: -1, t: 0 });
        endMission(S, 'fail', 'bomb', ev);
        return;
      }
    }
    // 乱射犯がいる間、時間とともに市民が危ない（乱射犯のAIが撃つ）
    // 全滅
    const team = S.actors.filter(a => a.kind === 'swat');
    if (team.length && team.every(a => !a.alive || a.down)) { endMission(S, 'fail', 'wiped', ev); return; }
    // 人質が全員死んだ
    if (m.mission === 'hostage' && m.hostages.length && m.hostages.every(id => { const h = S.byId[id]; return !h || !h.alive; })) { endMission(S, 'fail', 'hostages', ev); return; }
    // 主目的がそろった（ソフト完了）
    if (!m.softDone && S.t % 15 === 0) {
      const susOK = m.sus.every(id => { const a = S.byId[id]; return !a || !a.alive || a.cuffed || a.down; });
      const civOK = m.civ.concat(m.hostages).every(id => { const a = S.byId[id]; return !a || !a.alive || a.cuffed; });
      const bombOK = m.bombs.every(b => b.done);
      if (susOK && civOK && bombOK) { m.softDone = true; m.softT = S.t; ev.push({ e: 'soft', t: S.t }); }
    }
  },

  onEvents(S, w, evs) {
    const m = S.m;
    for (const e of evs) {
      if (e.e === 'report') m.reportsDone++;
      if (e.e === 'bombdone') { if (m.bombs.every(b => b.done)) evs.push({ e: 'allbombs' }); }
      if (e.e === 'kill' || e.e === 'down' || e.e === 'cuffed' || e.e === 'evidence' || e.e === 'bombdone' || e.e === 'report') m.log.push({ t: S.t, e: e.e, id: e.id, by: e.by, kind: e.kind });
      if (e.e === 'abort' && m.phase === 'play') endMission(S, m.softDone ? 'done' : 'abort', e.why || 'player', evs);
    }
  },
  // ダウン（PvEはなし）
  canDown() { return false; },
};

function lerp(a, b, t) { return a + (b - a) * t; }

export function endMission(S, res, why, ev) {
  const m = S.m;
  if (m.phase !== 'play') return;
  m.phase = 'end'; m.result = res; m.why = why; m.endT = S.t;
  m.score = scoreMission(S);
  if (ev) ev.push({ e: 'end', res, why });
}

// ---- 交戦規定の判定（記録された害から）
export function judgeHarm(S, h) {
  if (h.kind === 'swat') return { ok: false, v: 'ff' };
  const lethal = h.how === 'gun' || h.how === 'blast';
  if (h.kind === 'civ') return { ok: false, v: lethal ? (h.d >= 999 ? 'civkill' : 'civhurt') : 'civforce' };
  // 容疑者
  if (h.cuffed || h.down || h.comply) return { ok: false, v: lethal ? 'kill_unjust' : 'force' };
  if (lethal) {
    if (h.threat) return { ok: true };
    if (h.armed && h.warned >= 2) return { ok: true };
    return { ok: false, v: 'kill_unjust' };
  }
  // 非致死: 従わない（警告済み）か武器を持つ
  if (h.armed || h.warned >= 1) return { ok: true };
  return { ok: false, v: 'force' };
}

// ---- 採点
export function scoreMission(S) {
  const m = S.m;
  const out = { parts: [], total: 0, grade: 'F', viol: [], stats: {} };
  const add = (key, name, got, max, note = '') => { out.parts.push({ key, name, got: Math.round(got * 10) / 10, max, note }); out.total += got; };
  // 容疑者
  const sus = m.sus.map(id => S.byId[id]).filter(Boolean);
  let sv = 0;
  const unjustKilled = new Set();
  for (const h of S.harms) { const j = judgeHarm(S, h); if (!j.ok && (j.v === 'kill_unjust') && S.byId[h.tgt] && !S.byId[h.tgt].alive) unjustKilled.add(h.tgt); }
  for (const a of sus) {
    if (a.alive && a.cuffed && !a.down) sv += 1;
    else if (a.alive && a.cuffed && a.down) sv += 0.7;
    else if (!a.alive) sv += unjustKilled.has(a.id) ? 0 : 0.4;
  }
  add('sus', '容疑者の制圧', sus.length ? 25 * sv / sus.length : 25, 25, `${sus.filter(a => a.alive && a.cuffed).length}人逮捕・${sus.filter(a => !a.alive).length}人死亡`);
  // 市民（人質を含む）
  const civ = m.civ.concat(m.hostages).map(id => S.byId[id]).filter(Boolean);
  let cv = 0;
  for (const a of civ) if (a.alive && a.cuffed) cv += 1; else if (a.alive && a.down) cv += 0.5;
  add('civ', '市民の救出', civ.length ? 25 * cv / civ.length : 25, 25, `${civ.filter(a => a.alive && a.cuffed).length}/${civ.length}人`);
  // 報告: 拘束・死亡・行動不能の人
  const toReport = S.actors.filter(a => (a.kind === 'sus' || a.kind === 'civ' || a.kind === 'swat') && (a.cuffed || !a.alive || a.down) && !(a.kind === 'swat' && a.alive && !a.down));
  const rep = toReport.filter(a => a.reported).length;
  add('report', 'TOCへの報告', toReport.length ? 10 * rep / toReport.length : 10, 10, `${rep}/${toReport.length}`);
  // 証拠: 置かれた物と、容疑者の武器
  const evItems = S.items.filter(it => it.ev);
  const got = evItems.filter(it => it.gone).length;
  add('evidence', '証拠の回収', evItems.length ? 10 * got / evItems.length : 10, 10, `${got}/${evItems.length}`);
  // 作戦ごと
  let spc = 10, note = '';
  if (m.mission === 'bomb') { const d = m.bombs.filter(b => b.done).length; spc = m.bombs.length ? 10 * d / m.bombs.length : 10; note = `爆弾 ${d}/${m.bombs.length} 解除`; }
  else if (m.mission === 'hostage') { const hs = m.hostages.map(id => S.byId[id]).filter(Boolean); const ok = hs.filter(h => h.alive).length; spc = hs.length ? 10 * ok / hs.length : 10; note = `人質 ${ok}/${hs.length} 生存`; }
  else if (m.mission === 'active') { const t = sec(S, m.startT); spc = t < 180 ? 10 : t < 420 ? 10 - (t - 180) / 48 : 5; note = `${Math.floor(t / 60)}分${Math.floor(t % 60)}秒`; const dead = civ.filter(a => !a.alive).length; spc = Math.max(0, spc - dead * 2); }
  else if (m.mission === 'raid') { spc = evItems.length ? 10 * got / evItems.length : 10; note = '証拠の確保'; }
  else { const hurt = civ.filter(a => a.hp < a.maxHp).length; spc = Math.max(0, 10 - hurt * 3); note = hurt ? `負傷した市民 ${hurt}人` : '市民に負傷者なし'; }
  add('mission', '作戦の目標', spc, 10, note);
  // 隊員の安全
  const sw = S.actors.filter(a => a.kind === 'swat');
  const downN = sw.filter(a => !a.alive || a.down).length;
  add('safety', '隊員の安全', Math.max(0, 10 - downN * 2.5), 10, downN ? `${downN}人が倒れた` : '全員無事');
  // 規則
  let pen = 0;
  const seen = new Set();
  for (const h of S.harms) {
    const j = judgeHarm(S, h);
    if (j.ok) continue;
    let vv = j.v;
    const tg = S.byId[h.tgt];
    if (vv === 'civhurt' && tg && !tg.alive) vv = 'civkill';
    const key = h.tgt + ':' + vv;
    if (seen.has(key)) continue;
    seen.add(key);
    j.v = vv;
    const by = S.byId[h.by];
    const v = { t: h.t, v: j.v, tgt: h.tgt, by: h.by, byName: by ? by.name : '?', pen: j.v === 'kill_unjust' ? 15 : j.v === 'civkill' ? 25 : j.v === 'civhurt' ? 5 : j.v === 'ff' ? 5 : 5 };
    // 殺してしまった市民（あとで死んだ）
    out.viol.push(v); pen += v.pen;
  }
  // 死んだ市民（撃たれて）
  for (const a of civ) if (!a.alive && !out.viol.some(v => v.tgt === a.id && v.v === 'civkill')) { const byPolice = S.harms.some(h => h.tgt === a.id); if (byPolice) { out.viol.push({ v: 'civkill', tgt: a.id, pen: 25 }); pen += 25; } }
  add('roe', '交戦規定', Math.max(0, 10 - pen), 10, out.viol.length ? `違反 ${out.viol.length}件` : '違反なし');
  out.total -= Math.max(0, pen - 10);
  out.total = Math.max(0, Math.min(100, Math.round(out.total)));
  const anyDeath = sus.some(a => !a.alive) || civ.some(a => !a.alive);
  const T = out.total;
  out.grade = m.result === 'fail' || m.result === 'abort' && !m.softDone ? 'F' : T >= 95 && !out.viol.length && !anyDeath ? 'S' : T >= 85 ? 'A' : T >= 70 ? 'B' : T >= 55 ? 'C' : T >= 40 ? 'D' : 'F';
  if (m.result === 'fail') out.total = Math.min(out.total, 39);
  out.stats = {
    time: sec(S, m.startT),
    arrested: sus.filter(a => a.alive && a.cuffed).length, killed: sus.filter(a => !a.alive).length, susTotal: sus.length,
    rescued: civ.filter(a => a.alive && a.cuffed).length, civTotal: civ.length, civDead: civ.filter(a => !a.alive).length,
  };
  return out;
}
