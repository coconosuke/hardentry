// AIの指揮: 人の指揮官がいない（全員AI・プレイヤーが倒れた・自動テスト）とき、隊の先頭のAIが RoN の命令を順に出して建物を制圧する。
// 部屋のつながり（扉・開口・階段）をたどり、まだ入っていない近い部屋へ: 閉じた扉はスタック→突入（鍵なら蹴る/破城槌/C2、ときどき閃光）、
// 開いた所は移動。人を見たら隊員が自分で呼びかけ・拘束・報告し、落ちた武器や証拠は「捜索して確保」で回収する。
import { roomGraph, navCell, buildNav } from './nav.js';
import { isOpen } from '../doors.js';
import { hrand } from '../rng.js';
import { CS, LH, los } from '../world.js';

const sec = (S, t0) => (S.t - t0) * S.dt;
function roomAt(w, x, y, z) { const k = navCell(w, x, y + 0.2, z); return k >= 0 ? w.roomAt[k] : -1; }
// いる部屋。扉・開口のマスに立っているときは、まわりの一番近い床の部屋
function roomOfActor(w, a) {
  const k = navCell(w, a.x, a.y + 0.2, a.z);
  if (k < 0) return -1;
  if (w.roomAt[k] >= 0) return w.roomAt[k];
  const WD = w.W * w.D, L = Math.floor(k / WD), r = k - L * WD, j = Math.floor(r / w.W), i = r - j * w.W;
  let best = -1, bd = 1e9;
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
    const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= w.W || jj >= w.D) continue;
    const rr = w.roomAt[L * WD + jj * w.W + ii]; if (rr < 0) continue;
    const d = Math.hypot((ii + 0.5) * CS - a.x, (jj + 0.5) * CS - a.z); if (d < bd) { bd = d; best = rr; }
  }
  return best;
}

export function leadThink(S, w, ev) {
  const m = S.m;
  if (!m || m.kind !== 'pve' || m.phase !== 'play') return;
  const humans = S.actors.some(a => a.kind === 'swat' && a.pid != null && a.alive && !a.down);
  if (humans && !S.rules.aiLead) return;
  if (S.t % 12 !== 0) return;
  const team = S.actors.filter(a => a.kind === 'swat' && a.ai && a.ai.type === 'swat' && a.alive && !a.down);
  if (!team.length) return;
  const L = m.lead || (m.lead = { visited: [], seq: -1, t: S.t, searched: [], progT: S.t, nvis: 0, skip: [], sweeps: 0, done: false });
  const rg = roomGraph(w);
  const leader = team.reduce((a, b) => ((a.ai.slot ?? 9) <= (b.ai.slot ?? 9) ? a : b));
  if (!L.seen) L.seen = [];
  for (const a of team) { const r = roomOfActor(w, a); if (r >= 0 && !L.visited.includes(r)) L.visited.push(r); if (r >= 0 && !L.seen.includes(r)) L.seen.push(r); }
  if (L.visited.length !== L.nvis) { L.nvis = L.visited.length; L.progT = S.t; }
  // 終わり（人の指揮官がいない隊）: 主目的がそろって見回りも済んだら（そろってから90秒でも）任務を終える。
  // そろわないまま全部見回ったら、30秒待って打ち切る（結果は採点どおり）
  if (ev && m.softDone && (L.done || sec(S, m.softT) > 90)) { ev.push({ e: 'abort', why: 'ai' }); return; }
  if (ev && L.done && !m.softDone) { if (L.doneT == null) L.doneT = S.t; if (sec(S, L.doneT) > 30) { ev.push({ e: 'abort', why: 'ai' }); return; } }
  // 撃ち合いの最中は待つ
  if (team.some(a => a.ai.engId != null)) { L.t = S.t; return; }
  // 命令を実行中（ひとりでやる命令は、やる人だけを見る。ほかの隊員はスタックして待っている）
  const mine = team.filter(a => a.ai.order && a.ai.order.seq === L.seq);
  let busy = mine.some(a => a.ai.order.cmd !== 'hold' && (!SINGLE.has(a.ai.order.cmd) || a.ai.order.role === 0));
  // 移動: 先頭が着いて4秒たったら、残りは歩きながら次へ
  if (busy && L.cmd === 'move') { const r0 = mine.find(a => a.ai.order.role === 0); if (r0 && r0.ai.order.cmd === 'hold' && r0.ai.order.doneT != null && sec(S, r0.ai.order.doneT) > 4) busy = false; }
  if (busy && sec(S, L.t) < 40) return;
  // 投降した人・倒れた人の拘束と報告（隊員が自分でやる）を待つ
  const curRoom = roomOfActor(w, leader);
  // 近くで、もう入った部屋にいる人・物だけ（壁の向こうの物を探しに行かない）
  const near = (b, R) => Math.hypot(b.x - leader.x, b.z - leader.z) < R && Math.abs(b.y - leader.y) < 2 && L.visited.includes(roomAt(w, b.x, b.y, b.z));
  const toSecure = S.actors.some(b => (b.kind === 'sus' || b.kind === 'civ') && near(b, 14) && ((b.alive && !b.cuffed && (b.comply >= 1 || b.down || b.tased > 0)) || ((b.cuffed || !b.alive || b.down) && !b.reported)));
  const loot = S.items.some(it => !it.gone && (it.kind === 'weapon' || it.kind === 'evidence') && near(it, 12));
  // 見つけた爆弾は何よりも先に（解除するまで捜索の命令を出し直す）
  const bomb = m.bombs && m.bombs.find(b => b.found && !b.done && Math.abs(b.y - leader.y) < 2 && Math.hypot(b.x - leader.x, b.z - leader.z) < 18);
  if (bomb) {
    const defusing = team.some(a => a.act && a.act.k === 'bombdefuse');
    if (!defusing && (L.cmd !== 'search' || !busy || sec(S, L.t) > 12)) { issue(S, L, leader, { cmd: 'search' }); return; }
    return;
  }
  if (toSecure || loot) {
    const key = curRoom + ':' + L.visited.length;
    // 同じ所で何度も捜索しない（届かない物があると繰り返すため）: 新しい部屋に入るまで60秒あける
    const recent = L.lastSearchT != null && sec(S, L.lastSearchT) < 60 && L.lastSearchN === L.visited.length;
    if (!L.searched.includes(key) && !recent) { L.searched.push(key); L.lastSearchT = S.t; L.lastSearchN = L.visited.length; issue(S, L, leader, { cmd: 'search' }); return; }
    if (toSecure && sec(S, L.t) < 10) return;
  }
  // 次の部屋を探す（幅優先。屋外は通り道として使う）
  if (curRoom < 0) { if (sec(S, L.t) > 6) issue(S, L, leader, { cmd: 'fallin' }); return; }
  const target = nextStep(S, w, rg, curRoom, L, leader.x, leader.z);
  if (!target && !m.softDone) {
    // 全部見た: まだ確保していない人（隊員が最後に見た所。見ていなければ、見回りをやり直したあとは物音を頼りに）へ向かう
    if (!L.hunt) L.hunt = {};
    let best = null, bd = 1e9;
    for (const b of S.actors) {
      if (!b.alive || b.cuffed || !(b.kind === 'civ' || (b.kind === 'sus' && !b.down)) || (L.hunt[b.id] || 0) > 2) continue;
      let at = null, tl = -1e9;
      for (const a of team) { const s2 = a.ai.seen && a.ai.seen[b.id]; if (s2 && s2.t > tl) { tl = s2.t; at = [s2.x, s2.y, s2.z]; } }
      if (!at && L.sweeps >= 1) at = [b.x, b.y, b.z];
      if (!at) continue;
      const d = Math.hypot(at[0] - leader.x, at[2] - leader.z) + Math.abs(at[1] - leader.y) * 6;
      if (d < bd) { bd = d; best = { b, at }; }
    }
    if (best) {
      const { b, at } = best;
      // 近くて見通せる（同じ部屋）なら呼びかけ・拘束は隊員が自分で。壁の向こうなら回り込んで近づく
      const seeIt = Math.hypot(at[0] - leader.x, at[2] - leader.z) < 3.5 && Math.abs(at[1] - leader.y) < 1.5 && los(w, leader.x, leader.y + 1.5, leader.z, at[0], at[1] + 1.0, at[2], S.doors);
      if (!seeIt) {
        L.hunt[b.id] = (L.hunt[b.id] || 0) + 1;
        issue(S, L, leader, { cmd: 'move', x: at[0], y: Math.round(at[1] / LH) * LH, z: at[2], yaw: Math.atan2(at[0] - leader.x, at[2] - leader.z) });
        return;
      }
      if (sec(S, L.t) > 12) { L.hunt[b.id] = (L.hunt[b.id] || 0) + 0.5; issue(S, L, leader, { cmd: 'search' }); }
      return;
    }
  }
  if (!target) {
    // 全部見た: もう一度だけ見回る。それでも残りがなければ終わり
    if (L.sweeps < 2 && !m.softDone) { L.sweeps++; L.visited = [curRoom]; L.skip = []; L.badDoors = []; L.blocked = []; L.doorTry = {}; L.moveTry = {}; return; }
    L.done = true;
    return;
  }
  // 進まない（同じ所で40秒）: その部屋は飛ばす。同じ扉で2回失敗したら、その扉は使わない
  if (sec(S, L.progT) > 40) {
    L.skip.push(target.room); if (target.next !== target.room) (L.blocked || (L.blocked = [])).push(target.next); L.progT = S.t;
    return;
  }
  const p = target.portal, ds = p.door >= 0 ? S.doors[p.door] : null;
  if (p.type === 'door' && ds && !isOpen(ds) && !ds.broken) {
    // 同じ扉で何度も（ミラー・突入・やり直し）うまくいかない: その扉は通らない
    if (!L.doorTry) L.doorTry = {};
    const n = L.doorTry[p.door] = (L.doorTry[p.door] || 0) + 1;
    if (n > 3) { (L.badDoors || (L.badDoors = [])).push(p.door); return; }
    const has = (fn) => team.some(fn);
    let method = 'open';
    if (ds.locked && !ds.lockBroken) method = has(a => a.inv.long === 'ram') ? 'ram' : has(a => a.inv.gear.some(g => g.id === 'c2' && g.n > 0)) && hrand(p.door, S.seed, 3) < 0.3 ? 'c2' : 'kick';
    const flashOK = has(a => a.inv.gear.some(g => g.id === 'flash' && g.n > 0));
    const nade = flashOK && hrand(p.door, S.seed, 5) < 0.35 ? 'flash' : 'none';
    // 罠の疑い: 先にミラー（見つけたら外す）
    if (!L.mirrored) L.mirrored = [];
    // 乱射犯の作戦・近くで銃声がしたばかり: ミラーで時間を使わない（RoN でも急ぐ場面）
    const hurry = m.mission === 'active' || team.some(a => a.ai.alarmT != null && (S.t - a.ai.alarmT) * S.dt < 10);
    if (!hurry && !L.mirrored.includes(p.door) && hrand(p.door, S.seed, 7) < 0.5) { L.mirrored.push(p.door); issue(S, L, leader, { cmd: 'mirror', door: p.door }); return; }
    if (ds.trapSeen && ds.trap && ds.trap.armed) { issue(S, L, leader, { cmd: 'disarm', door: p.door }); return; }
    issue(S, L, leader, { cmd: 'breach', door: p.door, method, nade });
    return;
  }
  const R = w.rooms[target.next];
  // 同じ部屋への移動が続けて空振り（すぐ終わるのに入れない）したら、その部屋は飛ばす
  if (!L.moveTry) L.moveTry = {};
  const tries = L.moveTry[target.next] = (L.moveTry[target.next] || 0) + 1;
  // 同じ部屋への移動が続けて空振り: その部屋（とその先）へは行かない（見回りをやり直すときに戻す）
  if (tries > 2) { L.skip.push(target.room); (L.blocked || (L.blocked = [])).push(target.next); return; }
  // 部屋の中の歩ける点: 入口から2.5mほど入った、部屋の真ん中寄りの床（外接四角の中心は L字の部屋だと壁の向こうになる）
  const pt = roomPoint(w, R, p.x, p.z) || [R.cx, R.cz];
  issue(S, L, leader, { cmd: 'move', x: pt[0], y: R.L * LH, z: pt[1], yaw: Math.atan2(pt[0] - p.x, pt[1] - p.z) });
}

const SINGLE = new Set(['mirror', 'wedge', 'disarm', 'pick', 'unwedge', 'deploy', 'restrain']);

function roomPoint(w, R, px, pz) {
  const nav = buildNav(w);
  if (R.mx == null) { let sx = 0, sz = 0, n = 0; for (const k of R.cells) { const r = k % (w.W * w.D); sx += (r % w.W + 0.5) * CS; sz += (Math.floor(r / w.W) + 0.5) * CS; n++; } R.mx = sx / n; R.mz = sz / n; }
  let best = null, bs = 1e9;
  for (const k of R.cells) {
    if (nav.walk[k] !== 1) continue;
    const r = k % (w.W * w.D), x = (r % w.W + 0.5) * CS, z = (Math.floor(r / w.W) + 0.5) * CS;
    const sc = Math.abs(Math.hypot(x - px, z - pz) - 2.5) + 0.35 * Math.hypot(x - R.mx, z - R.mz);
    if (sc < bs) { bs = sc; best = [x, z]; }
  }
  return best;
}

function issue(S, L, leader, o) {
  if (S.debugLead) S.debugLead.push(((S.t * S.dt) | 0) + 's ' + o.cmd + (o.door != null ? ' d' + o.door : '') + (o.method ? ' ' + o.method : '') + (o.x != null ? ` (${o.x.toFixed(1)},${o.z.toFixed(1)})` : ''));
  const n = ++S.cmdSeq;
  S.orders.push({ ...o, team: 'gold', by: leader.id, t: S.t, n });
  L.seq = n; L.t = S.t; L.cmd = o.cmd;
}

// 今いる所から、まだ入っていない屋内の部屋のうち、歩く距離が一番近いものへの最初の一歩（通り口と次の部屋）
// 部屋を点、通り口を辺とした最短経路（距離は入った点から通り口までの直線）
function nextStep(S, w, rg, from, L, sx, sz) {
  const dist = new Map([[from, 0]]), prev = new Map([[from, null]]), at = new Map([[from, [sx, sz]]]);
  const open = [from], done = new Set();
  let found = -1;
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (dist.get(open[i]) < dist.get(open[bi])) bi = i;
    const r = open.splice(bi, 1)[0];
    if (done.has(r)) continue;
    done.add(r);
    if (r !== from && !w.rooms[r].out && !L.visited.includes(r) && !L.skip.includes(r)) { found = r; break; }
    const [px, pz] = at.get(r);
    for (const p of rg.adj[r] || []) {
      if (p.type !== 'door' && p.type !== 'open' && p.type !== 'stair') continue;
      if (p.door >= 0 && L.badDoors && L.badDoors.includes(p.door)) continue;
      const o = p.a === r ? p.b : p.a;
      if (done.has(o) || (L.blocked && L.blocked.includes(o))) continue;
      const d = dist.get(r) + Math.hypot(p.x - px, p.z - pz) + (p.type === 'stair' ? 6 : 1);
      if (!dist.has(o) || d < dist.get(o)) { dist.set(o, d); prev.set(o, { r, p }); at.set(o, [p.x, p.z]); open.push(o); }
    }
  }
  if (found < 0) return null;
  let cur = found, step = prev.get(cur);
  while (step && step.r !== from) { cur = step.r; step = prev.get(cur); }
  if (!step) return null;
  return { room: found, next: cur, portal: step.p };
}
