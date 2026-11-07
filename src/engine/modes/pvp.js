// 対戦（PvP）: リスポーンありTDM・殲滅戦（リスポーンなし）・爆弾（シージ式の攻守）
// 陣営: チーム0/1。見た目は SWAT（攻撃・チーム0のTDM）と立てこもり犯（防衛）。空きはボット。
import { createActor, makeInventory, makeArmor } from '../actor.js';
import { PVP_LOADOUTS } from '../data/npc.js';
import { MAPS } from '../maps/index.js';
import { rnd, rndShuffle, rndPick, hrand } from '../rng.js';
import { CS, LH, groundAt, nearestFloor, los, pushOut, levelOfY, inMap } from '../world.js';
import { PVP_ARMOR } from '../move.js';
import { cellPos } from './spawn.js';
import { makeDoorStates } from '../doors.js';
import { initBars } from '../barricade.js';
import { WEAPONS } from '../data/weapons.js';

const sec = (S, t0) => (S.t - t0) * S.dt;
const BOTNAMES = ['ハウンド', 'バイパー', 'ロック', 'ジェスター', 'ネイル', 'フォックス', 'ブレイズ', 'ドク'];

export function makePvpMode(kind) {
  return {
    init(S, w, o) {
      const def = MAPS[S.map];
      const R = o.rules || {};
      S.rules.dbno = kind === 'bomb';
      S.rules.ff = R.ff ?? false;
      S.rules.botLevel = R.botLevel ?? 2;
      S.rules.aimAssist = R.aimAssist ?? 1;
      const sizes = o.teams || [4, 4];
      const m = S.m = {
        kind, phase: 'pre', phaseT: S.t, round: 1, wins: [0, 0], score: [0, 0], att: 0, def: 1, swapped: false,
        winsNeeded: R.wins ?? 3, roundTime: R.roundTime ?? (kind === 'bomb' ? 180 : 150), prepTime: R.prepTime ?? (kind === 'bomb' ? 45 : 30), limit: R.limit ?? Math.max(...sizes) * 10, timeLimit: R.time ?? 480,
        respawn: [], sites: [], defuser: null, reinfLeft: 0, intel: {}, log: [], over: false, sizes, mvp: null,
      };
      // 名簿: プレイヤー＋ボット
      const roster = o.roster || [{ pid: 0, name: 'リード', team: 0 }];
      const byTeam = [[], []];
      for (const p of roster) byTeam[p.team || 0].push(p);
      let bn = 0;
      for (let t = 0; t < 2; t++) while (byTeam[t].length < sizes[t]) byTeam[t].push({ pid: null, name: BOTNAMES[(bn++) % BOTNAMES.length], team: t, bot: true });
      for (let t = 0; t < 2; t++) byTeam[t].forEach((p, i) => {
        const a = createActor(S, { kind: 'pvp', team: t, pid: p.pid, name: p.name, x: 0, z: 0, hp: 110, lo: {} });
        a.pvpLo = p.lo || null; a.pvpArmor = (p.lo && p.lo.armor) || 'medium';
        if (p.pid == null) a.ai = { type: 'bot', slot: i, st: 'idle' };
        a.slotIdx = i;
      });
      // 爆弾の場所
      m.sites = (def.spawn.sites || []).map((s, i) => { const p = cellPos(w, s.x, s.z, s.L || 0); return { id: i, name: s.name, x: p.x, y: p.y, z: p.z, L: s.L || 0, r: s.r || 3.2 }; });
      startRound(S, w, true);
    },
    step(S, w, dt, ev) {
      const m = S.m;
      if (m.over) return;
      const el = sec(S, m.phaseT);
      // 段階: 始まり（3秒）→ 準備（攻守のモード）→ 行動
      if (m.phase === 'pre' && el >= 3) {
        m.phase = kind === 'tdm' ? 'action' : 'prep'; m.phaseT = S.t; ev.push({ e: 'phase', p: m.phase });
        // 攻撃側（人）は準備のあいだドローンで偵察する（体は出現地点の外。シージと同じ）
        if (m.phase === 'prep') for (const a of S.actors) if (a.staged && a.pid != null) deployDrone(S, w, a, ev);
      } else if (m.phase === 'prep' && el >= m.prepTime) {
        m.phase = 'action'; m.phaseT = S.t; ev.push({ e: 'phase', p: 'action' });
        deployAttackers(S, w, ev);
      }
      if (m.phase === 'pre') for (const a of S.actors) if (!a.isDrone && a.spawnAt && !a.staged) { a.x = a.spawnAt[0]; a.z = a.spawnAt[1]; a.vx = a.vz = 0; }
      if (kind !== 'tdm') outdoorRules(S, w, dt, ev);
      if (kind === 'tdm') return stepTdm(S, w, dt, ev, el);
      if (m.phase === 'post') { if (el > 4.5) nextRound(S, w, ev); return; }
      if (m.phase !== 'action' && m.phase !== 'prep') return;
      // 殲滅・爆弾の判定
      // 準備中で出てきていない攻撃側も数える
      const alive = [0, 1].map(t => S.actors.filter(a => !a.isDrone && a.team === t && ((a.alive && !a.down) || a.staged)).length);
      const any = [0, 1].map(t => S.actors.filter(a => !a.isDrone && a.team === t && (a.alive || a.staged)).length);
      if (kind === 'elim') {
        if (alive[0] === 0 || alive[1] === 0) return roundWin(S, w, ev, alive[0] === 0 && alive[1] === 0 ? -1 : alive[0] === 0 ? 1 : 0, 'elim');
        if (m.phase === 'action' && el >= m.roundTime) return roundWin(S, w, ev, alive[0] > alive[1] ? 0 : alive[1] > alive[0] ? 1 : -1, 'time');
        return;
      }
      // 爆弾
      const d = m.defuser;
      if (d && d.planted && !d.disabled) {
        d.t += dt;
        if (d.t >= 45) return roundWin(S, w, ev, m.att, 'defuse');
      }
      if (d && d.disabled) return roundWin(S, w, ev, m.def, 'disable');
      if (any[m.def] === 0 || alive[m.def] === 0) { if (alive[m.def] === 0 && any[m.def] > 0) { for (const a of S.actors) if (a.team === m.def && a.alive) a.dbno = 0.01; } return roundWin(S, w, ev, m.att, 'elim'); }
      if (alive[m.att] === 0 && !(d && d.planted)) return roundWin(S, w, ev, m.def, 'elim');
      if (m.phase === 'action' && el >= m.roundTime && !(d && d.planted)) return roundWin(S, w, ev, m.def, 'time');
    },
    onEvents(S, w, evs) {
      const m = S.m;
      for (const e of evs) {
        if (e.e === 'kill') {
          const v = S.byId[e.id], k = S.byId[e.by];
          if (v && !v.isDrone) { v.stats.d++; if (k && k.team !== v.team) { k.stats.k++; if (kind === 'tdm') m.score[k.team]++; } else if (kind === 'tdm' && k && k.team === v.team && k !== v) m.score[1 - k.team]++; for (const as of (e.as || [])) { const x = S.byId[as]; if (x && x.team !== v.team) x.stats.a++; } }
          if (kind === 'tdm' && v && !v.isDrone) m.respawn.push({ id: v.id, at: S.t + Math.round(4 / S.dt) });
          // 解除装置を落とす
          if (v && v.carry === 'defuser') { v.carry = null; S.items.push({ id: S.nextItem++, kind: 'defuser', x: v.x, y: v.y + 0.02, z: v.z }); evs.push({ e: 'defdrop', id: v.id }); }
          m.log.push({ t: S.t, e: 'kill', id: e.id, by: e.by, hs: e.hs });
        }
        if (e.e === 'plant') { m.defuser.t = 0; }
      }
    },
    canDown(S, a) {
      if (!S.rules.dbno) return false;
      if (a.dbnoCount >= 1) return false;
      // 最後の1人は倒れたら死ぬ（設置後の攻撃側は除く）
      const mates = S.actors.filter(b => !b.isDrone && b.team === a.team && b !== a && b.alive && !b.down);
      if (!mates.length && !(S.m.defuser && S.m.defuser.planted && a.team === S.m.att)) return false;
      return true;
    },
    stepDrone(S, w, a, inp, dt, ev) { stepDrone(S, w, a, inp, dt, ev); },
    // モードの動作: ドローンを出す・出現地点を選ぶ
    act(S, w, a, ac, ev) {
      if (ac.a === 'drone') { deployDrone(S, w, a, ev); return true; }
      if (ac.a === 'zone') {
        const zs = attackZones(w, MAPS[S.map]);
        if (a.team === S.m.att && (S.m.phase === 'pre' || S.m.phase === 'prep') && Number.isInteger(ac.z) && ac.z >= 0 && ac.z < zs.length) { a.zone = ac.z; ev.push({ e: 'zone', id: a.id, z: ac.z }); }
        return true;
      }
      return false;
    },
  };
}

// ---- ラウンド
function startRound(S, w, first) {
  const m = S.m, def = MAPS[S.map];
  // 世界を元に戻す
  if (!first) {
    for (let q = 0; q < w.blocks.length; q++) { w.blocks[q] = w.blocks0[q]; }
    for (let q = 0; q < w.bhp.length; q++) w.bhp[q] = 0;
    S.bdiff = {};
    S.doors = makeDoorStates(w);
    S.items.length = 0; S.nades.length = 0; S.clouds.length = 0; S.blasts.length = 0; S.bullets.length = 0; S.mines = [];
    S.reinf = {};
    S.actors = S.actors.filter(a => !a.isDrone);
    initBars(S, w);
  }
  // 対戦では扉に鍵はかけない（R6 と同じ。ふさぐのはバリケード・補強で）
  for (const ds of S.doors) { ds.locked = false; ds.lockBroken = false; }
  m.phase = 'pre'; m.phaseT = S.t; m.defuser = { planted: false, disabled: false, t: 0 }; m.intel = {};
  // 爆弾: このラウンドの目標は1か所（R6 と同じく、守る側は1つの目標を全員で守る。2か所が離れたマップで守りが2つに割れないように）
  m.target = m.kind === 'bomb' && m.sites && m.sites.length ? Math.floor(hrand(S.seed + (m.round || 1) * 7, 7, 220) * m.sites.length) : null;
  m.reinfLeft = Math.min(10, 2 * S.actors.filter(a => a.team === m.def).length);
  // 陣営の見た目: 攻撃側（TDM はチーム0）が SWAT
  const sideOf = (t) => m.kind !== 'tdm' ? (t === m.att ? 'swat' : 'sus') : ((t === 0) !== !!m.swapped ? 'swat' : 'sus');
  // 殲滅戦も守る場所を1つ（ボットの準備の目安。爆弾と同じ選び方）
  if (m.kind === 'elim' && m.sites && m.sites.length) m.target = Math.floor(hrand(S.seed + (m.round || 1) * 7, 7, 220) * m.sites.length);
  const zones = m.kind !== 'tdm' ? attackZones(w, def) : null;
  const spawnA = (def.spawn.pvp && def.spawn.pvp.a) || def.spawn.swat.map(s => [s.x, s.z, s.L || 0]);
  const spawnB = (def.spawn.pvp && def.spawn.pvp.b) || (def.spawn.sus || []);
  const used = new Set();
  // TDM: 両チームとも建物の外、マップの反対の端から始める（片方だけ建物の中だと、外の側が攻め込むだけの勝負になる）。どちらの端かは試合ごとに決める
  const ends = m.kind === 'tdm' && def.spawn.tdm && def.spawn.tdm.length >= 2 ? tdmEnds(S, w, def) : null;
  const flip = hrand(S.seed, 3, 221) < 0.5 ? 1 : 0;
  const placed = [];
  for (const a of S.actors) {
    const side = sideOf(a.team);
    a.pvpSide = side; a._lookV = (a._lookV || 0) + 1;
    if (ends) {
      resetFighter(S, w, a, ends[a.team ^ flip], side);
      spreadOut(S, w, a, placed);
      continue;
    }
    // 攻撃側: 準備が終わるまで出てこない（ドローンだけ）。出現地点は準備中に選べる（ボットは目標に近い所が多め）
    if (zones && side === 'swat') {
      if (a.pid == null || a.zone == null || a.zone >= zones.length) a.zone = pickZone(S, w, a, zones);
      const z = zones[a.zone];
      resetFighter(S, w, a, z.pts[a.slotIdx % z.pts.length], side);
      a.alive = false; a.staged = true; a.dronesLeft = 2; a.drone = null;
      continue;
    }
    a.staged = false;
    const list = (side === 'swat') ? spawnA : spawnB;
    let pt = null;
    for (let tries = 0; tries < list.length; tries++) { const c = list[(a.slotIdx + tries * 3 + (m.round * 5)) % list.length]; const key = c.join(','); if (!used.has(key)) { used.add(key); pt = c; break; } }
    if (!pt) pt = list[a.slotIdx % list.length];
    resetFighter(S, w, a, pt, side);
  }
  // 解除装置: 攻撃側のひとり
  if (m.kind === 'bomb') {
    const att = S.actors.filter(a => a.team === m.att);
    const carrier = att.find(a => a.pid != null) || att[0];
    if (carrier) carrier.carry = 'defuser';
  }
}
// TDM の始まりの2点: 1階の候補のうち、互いに見通せない（まわり1mも含めて）いちばん遠い組
// （郊外の家は最初の2点が同じ通りの両端で、始まって1秒で撃ち合いになっていた）
function tdmEnds(S, w, def) {
  if (w._tdmEnds) return w._tdmEnds;
  const pts = def.spawn.tdm, P = pts.map(q => cellPos(w, q[0], q[1], q[2] || 0));
  const O = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
  let best = null, bd = -1;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    if ((pts[i][2] || 0) || (pts[j][2] || 0)) continue;
    const a = P[i], b = P[j], d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d <= bd) continue;
    let seen = false;
    for (const [ox, oz] of O) { for (const [px, pz] of O) if (los(w, a.x + ox, a.y + 1.5, a.z + oz, b.x + px, b.y + 1.5, b.z + pz, null)) { seen = true; break; } if (seen) break; }
    if (!seen) { bd = d; best = [pts[i], pts[j]]; }
  }
  w._tdmEnds = best || [pts[0], pts[1]];
  return w._tdmEnds;
}
// 同じ点から始める仲間を、重ならないように近くの床へずらす（このラウンドで置いた人だけを見る）
function spreadOut(S, w, a, placed) {
  const L = Math.max(0, Math.round((a.y - 0.4) / LH));
  const near = (x, z) => placed.some(p => Math.abs(p.y - a.y) < 1.5 && Math.hypot(p.x - x, p.z - z) < 0.9);
  if (near(a.x, a.z)) {
    out: for (let r = 1; r <= 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const x = a.x + di * CS, z = a.z + dj * CS;
      const q = nearestFloor(w, L, x, z, 0.3);
      if (!q || Math.hypot(q[0] - x, q[1] - z) > 0.05 || near(q[0], q[1])) continue;
      a.x = q[0]; a.z = q[1]; a.y = groundAt(w, q[0], q[1], L * LH + 0.4);
      break out;
    }
  }
  a.spawnAt = [a.x, a.z];
  placed.push({ x: a.x, y: a.y, z: a.z });
}
function resetFighter(S, w, a, pt, side) {
  const [x, z, L = 0] = pt;
  const p = cellPos(w, x, z, L);
  a.x = p.x + (hrand(a.id, S.t, 1) - 0.5) * 0.4; a.z = p.z + (hrand(a.id, S.t, 2) - 0.5) * 0.4; a.y = p.y;
  a.spawnAt = [a.x, a.z];
  a.vx = a.vz = a.vy = 0; a.alive = true; a.dead = false; a.down = false; a.dbno = 0; a.dbnoCount = 0; a.cuffed = false; a.comply = 0;
  a.stun = a.flash = a.gas = a.tased = a.deaf = a.supp = a.bleed = 0; a.flinch = 0; a.act = null; a.carry = null; a.st = 0; a.stance = 0; a.vault = null;
  a.inj = { arm: 0, leg: 0, head: 0 };
  const A = PVP_ARMOR[a.pvpArmor] || PVP_ARMOR.medium;
  a.hp = a.maxHp = A.hp;
  const lo = Object.assign({}, PVP_LOADOUTS[side], a.pvpLo && a.pvpLo[side] ? a.pvpLo[side] : {});
  a.inv = makeInventory({ primary: lo.primary, secondary: lo.secondary, gear: lo.gear, long: 'none' });
  a.armor = makeArmor({ vest: 'heavy', plate: 'kevlar', helmet: A.hp >= 110 ? 'helmet' : 'none' });
  a.ws = { slot: a.inv.w[0] ? 0 : 1, next: -1, st: 'draw', t: 0.4, cd: 0, trigWas: false, rp: 0, ry: 0, bloom: 0, shots: 0, lastShot: -99, rk: null, rd: 0, gear: -1, pumpNeed: false, barrel: 0 };
  // 向き: 敵の方（マップの中心へ）
  const c = [(w.W * CS) / 2, (w.D * CS) / 2];
  a.yaw = Math.atan2(c[0] - a.x, c[1] - a.z); a.pitch = 0;
  a.spawnProt = 2; a.stateT = 0; a.dmgBy = {};
  if (a.ai) { const keep = { type: a.ai.type, slot: a.ai.slot }; a.ai = { ...keep, st: 'idle' }; }
}
function roundWin(S, w, ev, team, why) {
  const m = S.m;
  if (m.phase === 'post') return;
  m.phase = 'post'; m.phaseT = S.t; m.lastWin = team; m.lastWhy = why;
  if (team >= 0) m.wins[team]++;
  ev.push({ e: 'round', win: team, why, wins: m.wins.slice(), round: m.round });
  // MVP: このラウンドのキル
  if (m.wins[0] >= m.winsNeeded || m.wins[1] >= m.winsNeeded) { m.over = true; m.winner = m.wins[0] >= m.winsNeeded ? 0 : 1; ev.push({ e: 'matchend', win: m.winner }); }
}
function nextRound(S, w, ev) {
  const m = S.m;
  m.round++;
  const W = m.winsNeeded;
  if (m.kind !== 'tdm') {
    // 攻守交代: (勝利数−1) ラウンドのあと、延長（両方 W−1）では毎ラウンド
    const ot = m.wins[0] === W - 1 && m.wins[1] === W - 1;
    if (m.round === W || (ot && m.round > W)) { const t = m.att; m.att = m.def; m.def = t; m.swapped = !m.swapped; ev.push({ e: 'swap' }); }
  } else {
    if (m.round === W) { m.swapped = !m.swapped; ev.push({ e: 'swap' }); }
  }
  startRound(S, w, false);
  ev.push({ e: 'roundstart', round: m.round, site: m.target ?? -1 });
}
// ---- TDM（リスポーンあり）
function stepTdm(S, w, dt, ev, el) {
  const m = S.m;
  if (m.phase !== 'action') return;
  // 復活
  for (let i = m.respawn.length - 1; i >= 0; i--) {
    const r = m.respawn[i];
    if (S.t < r.at) continue;
    m.respawn.splice(i, 1);
    const a = S.byId[r.id];
    if (!a) continue;
    const pt = pickSpawn(S, w, a);
    resetFighter(S, w, a, pt, a.pvpSide);
    ev.push({ e: 'respawn', id: a.id });
  }
  if (m.score[0] >= m.limit || m.score[1] >= m.limit || el >= m.timeLimit) {
    m.over = true; m.winner = m.score[0] > m.score[1] ? 0 : m.score[1] > m.score[0] ? 1 : -1;
    ev.push({ e: 'matchend', win: m.winner });
  }
}
// 敵から遠く、見られていない、味方に近い所
function pickSpawn(S, w, a) {
  // w: 世界
  const def = MAPS[S.map];
  const pts = [].concat(def.spawn.pvp ? def.spawn.pvp.a : [], def.spawn.pvp ? def.spawn.pvp.b : [], def.spawn.tdm || []);
  let best = pts[0], bs = -1e9;
  pts.forEach((p, i) => {
    const x = p[0] * CS, z = p[1] * CS, y = (p[2] || 0) * LH + 1.6;
    let minE = 1e9, mate = 1e9, seen = 0;
    for (const b of S.actors) {
      if (b.isDrone || !b.alive || b === a) continue;
      const d = Math.hypot(b.x - x, b.z - z);
      if (b.team !== a.team) { minE = Math.min(minE, d); if (d < 30 && los(w, x, y, z, b.x, b.y + 1.5, b.z, S.doors)) seen++; }
      else mate = Math.min(mate, d);
    }
    const s = Math.min(minE, 40) - seen * 30 - Math.max(0, mate - 15) * 0.3 + hrand(a.id, S.t, i) * 6;
    if (s > bs) { bs = s; best = p; }
  });
  return best;
}

// ---- 攻撃側の出現地点（シージのように、準備中に選ぶ）: マップの攻撃側の点を、近いものどうしでまとめる
export function attackZones(w, def) {
  if (w._zones) return w._zones;
  const pts = (def.spawn.pvp && def.spawn.pvp.a) || def.spawn.swat.map(s => [s.x, s.z, s.L || 0]);
  const Z = [];
  for (const p of pts) {
    let z = Z.find(q => Math.hypot(q.pts[0][0] - p[0], q.pts[0][1] - p[1]) <= 16 && (q.pts[0][2] || 0) === (p[2] || 0));
    if (!z) Z.push(z = { pts: [] });
    z.pts.push(p);
  }
  const cx = w.W / 2, cz = w.D / 2, used = {};
  Z.forEach((z, i) => {
    const mx = z.pts.reduce((s, p) => s + p[0], 0) / z.pts.length, mz = z.pts.reduce((s, p) => s + p[1], 0) / z.pts.length;
    const dir = Math.abs(mx - cx) * w.D > Math.abs(mz - cz) * w.W ? (mx > cx ? '東' : '西') : (mz > cz ? '南' : '北');
    used[dir] = (used[dir] || 0) + 1;
    z.id = i; z.x = (mx + 0.5) * CS; z.z = (mz + 0.5) * CS; z.dir = dir;
    z.name = dir + '側' + (i === 0 ? '（正面）' : '');
  });
  for (const z of Z) if (used[z.dir] > 1 && z.id !== 0) z.name = z.dir + '側' + (Z.filter(q => q.dir === z.dir && q.id <= z.id).length);
  w._zones = Z;
  return Z;
}
// ボットの出現地点: 目標に近い所を多めに（ほかは散らす）
function pickZone(S, w, a, zones) {
  const m = S.m, site = m.sites && m.target != null ? m.sites[m.target] : null;
  const r = a.pid != null ? 0 : hrand(a.id, (m.round || 1) * 13, 223); // 人は目標にいちばん近い所から（あとで選び直せる）
  if (site && r < 0.6) {
    let best = 0, bd = 1e9;
    zones.forEach((z, i) => { const d = Math.hypot(z.x - site.x, z.z - site.z); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  return Math.floor(hrand(a.id, (m.round || 1) * 17, 224) * zones.length) % zones.length;
}
// 準備が終わった: 攻撃側が選んだ出現地点に出てくる（解除装置は持ったまま）
function deployAttackers(S, w, ev) {
  const zones = attackZones(w, MAPS[S.map]);
  const placed = [];
  for (const a of S.actors) {
    if (!a.staged) continue;
    const z = zones[a.zone] || zones[0];
    const carry = a.carry, left = a.dronesLeft;
    resetFighter(S, w, a, z.pts[a.slotIdx % z.pts.length], 'swat');
    a.carry = carry; a.dronesLeft = left; a.staged = false;
    spreadOut(S, w, a, placed);
    ev.push({ e: 'respawn', id: a.id, zone: a.zone });
  }
}
// 防衛側と建物の外: 準備中は外へ出られない。行動中に外へ出ると、2.5秒で攻撃側に居場所が知られる（出ている間ずっと）
export const OUT_GRACE = 2.5;
export function isOutside(w, a) {
  const L = levelOfY(a.y + 0.2), i = Math.floor(a.x / CS), j = Math.floor(a.z / CS);
  if (!inMap(w, i, j) || L >= w.NL) return true;
  return w.indoor[w.idx(L, i, j)] === 0;
}
function outdoorRules(S, w, dt, ev) {
  const m = S.m;
  for (const a of S.actors) {
    if (a.isDrone || a.team !== m.def || !a.alive) continue;
    const out = isOutside(w, a);
    if (m.phase === 'pre' || m.phase === 'prep') {
      if (out && a._inPos) {
        a.x = a._inPos[0]; a.z = a._inPos[1]; a.y = a._inPos[2]; a.vx = a.vz = 0; a.vault = null;
        if (a._denyOutT == null || S.t - a._denyOutT > 90) { a._denyOutT = S.t; ev.push({ e: 'deny', id: a.id, why: 'prepout' }); }
      } else if (!out) a._inPos = [a.x, a.z, a.y];
      a.outT = 0;
    } else if (m.phase === 'action') {
      if (out) {
        a.outT = (a.outT || 0) + dt;
        if (a.outT >= OUT_GRACE) {
          if (!a.outSeen) { a.outSeen = true; ev.push({ e: 'outside', id: a.id, team: a.team }); }
          a.spot = Math.max(a.spot || 0, 1.0); a.spotTeam = m.att;
          if (S.t % 15 === 0) { const intel = m.intel || (m.intel = {}); intel[m.att] = { x: a.x, y: a.y, z: a.z, t: S.t, id: a.id }; }
        }
      } else { a.outT = 0; a.outSeen = false; }
    }
  }
}

// ---- ドローン（準備中の偵察）
export function deployDrone(S, w, a, ev) {
  const m = S.m;
  if (!m || m.kind === 'tdm' || a.team !== m.att || a.isDrone) return null;
  if (a.dronesLeft == null) a.dronesLeft = 2;
  if (a.dronesLeft <= 0) return null;
  // 準備中は出現地点から（体は出ていない）。行動中は自分の足元から（立っていて、倒れていないとき）
  if (m.phase === 'prep' ? !a.staged : (m.phase !== 'action' || !a.alive || a.down || a.act)) return null;
  // まだ動いている自分のドローンがあれば、新しくは出さない
  if (S.actors.some(d => d.isDrone && d.owner === a.id && d.alive)) return null;
  a.dronesLeft--;
  const d = createActor(S, { kind: 'drone', team: a.team, pid: a.pid, x: a.x + Math.sin(a.yaw) * 0.6, y: a.y, z: a.z + Math.cos(a.yaw) * 0.6, yaw: a.yaw, hp: 1 });
  d.isDrone = true; d.owner = a.id; d.h = 0.2; d.jumpT = 0;
  S.byId[d.id] = d;
  a.drone = d.id;
  ev.push({ e: 'drone', id: d.id, owner: a.id });
  return d;
}
function killDroneQuiet(S, d) { d.alive = false; d.dead = true; }
function stepDrone(S, w, d, inp, dt, ev) {
  if (!d.alive) return;
  inp = inp || {};
  d.yaw = inp.yaw ?? d.yaw; d.pitch = Math.max(-0.6, Math.min(0.6, inp.pitch ?? d.pitch));
  const sp = 2.6;
  const sy = Math.sin(d.yaw), cy = Math.cos(d.yaw);
  const vx = (sy * (inp.mz || 0) - cy * (inp.mx || 0)) * sp, vz = (cy * (inp.mz || 0) + sy * (inp.mx || 0)) * sp;
  d.x += vx * dt; d.z += vz * dt;
  const out = [0, 0, 0];
  // 小さな当たり（床すれすれ）
  import_pushOut(w, d, out, S);
  const g = groundAt(w, d.x, d.z, d.y + 0.3);
  d.jumpT = Math.max(0, (d.jumpT || 0) - dt);
  if (inp.jump && d.jumpT <= 0 && d.y - g < 0.05) { d.vy = 3.2; d.jumpT = 3; }
  d.vy = (d.vy || 0) - 9.8 * dt; d.y += d.vy * dt; if (d.y < g) { d.y = g; d.vy = 0; }
  d.spd = Math.hypot(vx, vz);
  // 見つめた敵を印に
  if (inp.fire) {
    for (const b of S.actors) {
      if (b.isDrone || b.team === d.team || !b.alive) continue;
      const dx = b.x - d.x, dz = b.z - d.z, dist = Math.hypot(dx, dz);
      if (dist > 25) continue;
      const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - d.yaw), Math.cos(Math.atan2(dx, dz) - d.yaw)));
      if (ang > 0.2) continue;
      if (!los(w, d.x, d.y + 0.12, d.z, b.x, b.y + 1.2, b.z, S.doors)) continue;
      if (!b.spot || b.spot < 4) ev.push({ e: 'spotted', id: b.id, by: d.owner });
      b.spot = 6; b.spotTeam = d.team;
    }
  }
}
function import_pushOut(w, d, out, S) {
  pushOut(w, d.x, d.z, d.y + 0.02, d.y + 0.18, 0.14, S.doors, -1, out);
  if (out[2]) { d.x += out[0]; d.z += out[1]; }
}
