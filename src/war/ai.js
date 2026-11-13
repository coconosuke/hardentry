// 大規模戦のボット（M2）: 分隊（8人まで）ごとに目標の拠点へ外を歩いて向かい、拠点の中に散って守る。
// 見えた敵は、反応の遅れのあとで撃つ（距離で照準器をのぞく・遠いと短い連射・弾の落ちと移動の見越し）。撃たれた・近くで撃たれた方を向く。
// 詰まったら乗り越え・横へずれる・道を作り直す。考える重い処理（見る・道）は数ステップに1回、交代で。
import { baseInput, pushAct, steerToward, turnToward, trigger, SKILL, angDiff, yawTo } from '../engine/ai/common.js';
import { eyeAI } from '../engine/combat.js';
import { curW, curWeapon, ammoCount } from '../engine/actor.js';
import { los as wLos } from './world.js';
import { buildWarNav, findWarPath } from './nav.js';
import { hrand } from '../engine/rng.js';

export const SQUAD = 8;           // 分隊の人数（BattleBit: research/WARBIT.md の 3）
const SCAN_EVERY = 6;             // 見回す間隔（ステップ）
const G = 9.81;
// 武器の種類ごとの交戦距離（BattleBit の大型アップデートの目安: SMG 0-35・AR 35-70・DMR/狙撃 100-300+）
const RANGE = { smg: [0, 45, 110], pistol: [0, 30, 70], shotgun: [0, 18, 40], rifle: [0, 80, 220], sniper: [40, 300, 500] };

function rangeOf(a) { const W = curW(a); return RANGE[W ? W.cat : 'rifle'] || RANGE.rifle; }
const flagById = (S, id) => S.m.flags.find(f => f.id === id);
// 目標（拠点、TDM は場所）。TDM は分隊を4人ずつの組に分けて別々に動く
const goalKey = (S, a) => S.m.mode === 'tdm' ? a.team + ':' + a.squad + ':' + ((a.sqIdx || 0) >> 2) : a.team + ':' + a.squad;
export function goalOf(S, a) {
  const g = S.m.sqGoal && S.m.sqGoal[goalKey(S, a)];
  return typeof g === 'string' ? flagById(S, g) : g || null;
}

// ---- 指揮: チームごとに分隊へ目標の拠点を割り当てる（2秒ごと）
export function command(S, w) {
  const m = S.m;
  if (m.mode === 'tdm') return commandTdm(S);
  for (let t = 0; t < 2; t++) {
    const hq = m.hq[t];
    const squads = new Map();
    for (const a of S.actors) if (a.team === t && a.squad != null) { if (!squads.has(a.squad)) squads.set(a.squad, []); squads.get(a.squad).push(a); }
    // 取りに行く拠点（自分の物でない）と、守る拠点（自分の物で敵が来ている）
    const near = (f, team) => S.actors.some(b => b.team === team && b.alive && !b.down && Math.hypot(b.x - f.x, b.z - f.z) < f.r * 2.2);
    const attack = m.flags.filter(f => f.owner !== t).map(f => ({ f, d: Math.hypot(f.x - hq[0], f.z - hq[1]) })).sort((p, q) => p.d - q.d).map(p => p.f);
    const defend = m.flags.filter(f => f.owner === t && near(f, 1 - t));
    const want = defend.concat(attack.slice(0, Math.max(1, Math.ceil(squads.size * 0.6))));
    if (!want.length) want.push(...m.flags);
    let k = 0;
    const ids = [...squads.keys()].sort((p, q) => p - q);
    m.sqGoal = m.sqGoal || {};
    for (const sq of ids) {
      const key = t + ':' + sq, cur = m.sqGoal[key];
      const curF = cur && flagById(S, cur);
      // 今の目標がまだ要る（取れていない・守る必要がある）なら続ける
      if (curF && want.includes(curF) && !(curF.owner === t && !defend.includes(curF))) continue;
      m.sqGoal[key] = want[k++ % want.length].id;
    }
  }
}

// TDM: 組ごとに、いちばん近い敵のあたり（少しずらす）へ。着いたか 10 秒で選び直す
function commandTdm(S) {
  const m = S.m, R = m.rect;
  const groups = new Map();
  for (const a of S.actors) if (a.team >= 0 && a.team < 2 && a.squad != null && a.alive && !a.down) { const k = goalKey(S, a); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); }
  for (const [key, mem] of groups) {
    const cur = m.sqGoal[key];
    if (cur && S.t < cur.until && !mem.some(a => Math.hypot(a.x - cur.x, a.z - cur.z) < cur.r)) continue;
    const t = mem[0].team;
    let cx = 0, cz = 0; for (const a of mem) { cx += a.x; cz += a.z; } cx /= mem.length; cz /= mem.length;
    let best = null, bd = 1e9;
    for (const e of S.actors) if (e.team === 1 - t && e.alive && !e.down) { const d = Math.hypot(e.x - cx, e.z - cz); if (d < bd) { bd = d; best = e; } }
    const n = key.length * 7 + S.t;
    let x = best ? best.x + (hrand(S.seed, n, 91) - 0.5) * 40 : R[0] + (R[2] - R[0]) * hrand(S.seed, n, 92);
    let z = best ? best.z + (hrand(S.seed, n, 93) - 0.5) * 40 : R[1] + (R[3] - R[1]) * hrand(S.seed, n, 94);
    x = Math.max(R[0] + 8, Math.min(R[2] - 8, x)); z = Math.max(R[1] + 8, Math.min(R[3] - 8, z));
    m.sqGoal[key] = { id: 'pt' + S.t + key, x, z, r: 12, until: S.t + 600 };
  }
}

// 出撃する場所（ボット。コンクエストだけ）: 分隊の目標に一番近い、自分の持っている拠点（敵が近くにいない）。なければ本陣
export function botSpawnPoint(S, a) {
  const m = S.m;
  if (m.mode !== 'conquest') return null;
  const goal = m.sqGoal && flagById(S, m.sqGoal[a.team + ':' + a.squad]);
  let best = null, bd = 1e9;
  for (const f of m.flags) {
    if (f.owner !== a.team || f.contested) continue;
    const d = goal ? Math.hypot(f.x - goal.x, f.z - goal.z) : 0;
    if (d < bd) { bd = d; best = f; }
  }
  const [hx, hz] = m.hq[a.team];
  if (best && goal && bd < Math.hypot(hx - goal.x, hz - goal.z)) return { flag: best.id };
  return null;
}

// ---- 1ステップ: 全部のボットの入力
export function warThink(S, w, dt) {
  const out = {};
  const m = S.m;
  if (!m.cmdT || S.t - m.cmdT >= 120) { m.cmdT = S.t; command(S, w); }
  const nav = buildWarNav(w, m.rect);
  // 見る相手の一覧（チームごと・生きていて倒れていない）
  const live = [[], []];
  for (const b of S.actors) if (b.alive && !b.down && !b.isDrone && b.team >= 0 && b.team < 2) live[b.team].push(b);
  const ctx = { nav, live, paths: 3 };
  for (const a of S.actors) {
    if (a.pid != null || !a.ai || a.ai.type !== 'war') continue;
    if (!a.alive) continue;
    out[a.id] = think(S, w, a, dt, ctx);
  }
  return out;
}

function think(S, w, a, dt, ctx) {
  const ai = a.ai, sk = SKILL[ai.skill || 'bot2'];
  const inp = baseInput(a);
  inp.stance = 0;
  if (a.down) { inp.mx = 0; inp.mz = 0; return inp; }
  // 見回す（交代で）
  if ((S.t + a.id) % SCAN_EVERY === 0) scan(S, w, a, ctx, sk);
  const tgt = ai.tgt != null ? S.byId[ai.tgt] : null;
  const [rMin, rEff, rMax] = rangeOf(a);
  // 撃たれた: 撃った方を向く（見えていなくても）
  if (a.lastHit && a.lastHit.by >= 0 && S.t - a.lastHit.t < 30 && !tgt) { const b = S.byId[a.lastHit.by]; if (b && b.team !== a.team) { ai.look = [b.x, b.y + 1.3, b.z]; ai.lookT = S.t; } }
  // 弾倉
  const wi = curWeapon(a);
  if (wi) { const [inMag] = ammoCount(wi); const cap = wi.cap || (curW(a) || {}).mag || 30; if (!tgt && inMag < cap * 0.4 && a.ws.st === 'ready') pushAct(inp, { a: 'reload' }); }
  let moveTo = null, sprint = false;
  if (tgt && (!tgt.alive || tgt.down || S.t - (ai.seenT ?? -1e9) >= 90)) { ai.tgt = null; }
  if (ai.tgt != null) {
    // ---- 撃ち合い（見えている間は止まって撃つ。見失ったら 1.5 秒は最後に見た所を向く）
    const d = Math.hypot(tgt.x - a.x, tgt.z - a.z);
    const visible = S.t - ai.seenT < SCAN_EVERY * 2;
    const ready = S.t >= (ai.reactAt || 0);
    if (visible || S.t - ai.seenT < 90) {
      const err = aimAtTgt(S, a, inp, visible ? tgt : null, sk, dt, visible);
      inp.ads = d > 12 && ready && visible;
      if (visible && ready) trigger(S, a, inp, d > rEff ? { ...sk, burst: [2, 3] } : sk, err < (d > 60 ? 0.02 : 0.06));
    }
    // 遠い敵（交戦距離の外）: いつも止まって撃つのではなく、ときどき（3秒ごとに4割）止まって撃ち、ほかは目標へ進み続ける
    const hold = d <= rEff * 1.2 || hrand(a.id, Math.floor(S.t / 180), 5) < 0.4;
    if (visible && d <= rMax && hold) {
      if (d < 25) { if (!ai.strafeT || S.t > ai.strafeT) { ai.strafeT = S.t + 36 + Math.floor(hrand(a.id, S.t, 7) * 40); ai.strafe = hrand(a.id, S.t, 8) < 0.5 ? -1 : 1; } inp.mx = ai.strafe * 0.8; inp.mz = d < 8 ? -0.3 : 0; }
      else inp.stance = d > 45 && hrand(a.id, Math.floor(S.t / 300), 9) < 0.7 ? 1 : 0;
      ai.stuckT = 0;
      return inp;
    }
  } else if (ai.look && S.t - ai.lookT < 90) {
    // 振り向き（撃たれた方）
    const e = eyeAI(S, a); inp.yaw = turnToward(a.yaw, yawTo(ai.look[0] - e[0], ai.look[2] - e[2]), sk.turn * Math.PI / 180 * dt); inp.pitch = a.pitch * 0.9;
  }
  // ---- 目標の拠点へ
  const goalF = goalOf(S, a);
  if (goalF) {
    // 拠点の中の自分の場所（ボットごとに違う向き・距離）。中に入ったら、ときどき場所を変える
    const inside = Math.hypot(a.x - goalF.x, a.z - goalF.z) < goalF.r;
    if (!ai.spot || ai.spotF !== goalF.id || (inside && S.t > ai.spotT)) {
      const ang = hrand(a.id, Math.floor(S.t / 600), 11) * Math.PI * 2, rr = goalF.r * (0.25 + 0.5 * hrand(a.id, Math.floor(S.t / 600), 12));
      ai.spot = [goalF.x + Math.cos(ang) * rr, goalF.z + Math.sin(ang) * rr]; ai.spotF = goalF.id; ai.spotT = S.t + 420 + Math.floor(hrand(a.id, S.t, 13) * 360); ai.path = null;
    }
    moveTo = ai.spot;
    const dg = Math.hypot(moveTo[0] - a.x, moveTo[1] - a.z);
    sprint = ai.tgt == null && dg > 25;
    if (dg < 1.5) { moveTo = null; if (!ai.tgt) { inp.stance = inside && hrand(a.id, Math.floor(S.t / 480), 14) < 0.5 ? 1 : 0; lookOut(S, a, inp, goalF, sk, dt); } }
  }
  if (moveTo) followPath(S, w, a, inp, moveTo, ctx, sprint, 1, sk, dt);
  return inp;
}

// 拠点で外を見張る（敵の本陣の向き＋少し左右に）
function lookOut(S, a, inp, f, sk, dt) {
  const ai = a.ai, ehq = S.m.hq[1 - a.team];
  if (!ai.watchT || S.t > ai.watchT) { ai.watchT = S.t + 150 + Math.floor(hrand(a.id, S.t, 15) * 200); ai.watchOff = (hrand(a.id, S.t, 16) - 0.5) * 1.6; }
  const want = yawTo(ehq[0] - a.x, ehq[1] - a.z) + ai.watchOff;
  inp.yaw = turnToward(a.yaw, want, sk.turn * 0.4 * Math.PI / 180 * dt); inp.pitch = a.pitch * 0.9;
}

// 道に沿って歩く。道は目的地が変わった・古くなった・詰まったら作り直す
function followPath(S, w, a, inp, to, ctx, sprint, spd, sk, dt) {
  const ai = a.ai;
  const need = !ai.path || !ai.pathTo || Math.hypot(ai.pathTo[0] - to[0], ai.pathTo[1] - to[1]) > 6 || S.t - ai.pathT > 900 || ai.repath;
  if (need && ctx.paths > 0) {
    ctx.paths--;
    ai.path = findWarPath(ctx.nav, a.x, a.z, to[0], to[1]) || [to]; ai.pi = 0; ai.pathTo = to.slice(); ai.pathT = S.t; ai.repath = false;
  }
  const P = ai.path || [to];
  // いまの点に近づいたら次へ
  while (ai.pi < P.length - 1 && Math.hypot(P[ai.pi][0] - a.x, P[ai.pi][1] - a.z) < 2.2) ai.pi++;
  const p = P[Math.min(ai.pi || 0, P.length - 1)];
  const face = !ai.tgt;
  if (face) { const want = yawTo(p[0] - a.x, p[1] - a.z); inp.yaw = turnToward(a.yaw, want, sk.turn * Math.PI / 180 * dt); inp.pitch = a.pitch * 0.85; }
  steerToward(a, inp, p[0], p[1], spd);
  inp.sprint = sprint && Math.abs(angDiff(inp.yaw, a.yaw)) < 0.3;
  // 詰まり: 進みたいのに遅い
  const want = Math.hypot(inp.mx, inp.mz) > 0.3;
  if (want && a.spd < 0.4) ai.stuckT = (ai.stuckT || 0) + dt; else ai.stuckT = Math.max(0, (ai.stuckT || 0) - dt * 2);
  if (ai.stuckT > 0.8 && ai.stuckT - dt <= 0.8) pushAct(inp, { a: 'vault' });
  if (ai.stuckT > 1.6) { inp.mx = (a.id % 2 ? 1 : -1); inp.mz = -0.2; }
  if (ai.stuckT > 3) { ai.stuckT = 0; ai.repath = true; ai.pi = Math.min((ai.pi || 0) + 1, P.length - 1); }
}

// 見回す: 近い敵から順に、視野・音・見通しで探す。見つけたら反応の遅れを置いて狙う
function scan(S, w, a, ctx, sk) {
  const ai = a.ai, foes = ctx.live[1 - a.team];
  const e = eyeAI(S, a);
  const maxD = rangeOf(a)[2] * 1.1;
  // 近い順に4人まで
  const cand = [];
  for (const b of foes) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d > maxD) continue;
    cand.push([d, b]);
  }
  cand.sort((p, q) => p[0] - q[0]);
  let found = null, n = 0;
  for (const [d, b] of cand) {
    if (n >= 4) break;
    const ang = Math.abs(angDiff(yawTo(b.x - a.x, b.z - a.z), a.yaw));
    const heard = (b.fireK || 0) > 0.2 && d < 90;
    const fov = ai.tgt === b.id ? 2.0 : 1.05;
    if (ang > fov && d > 20 && !heard) continue;
    n++;
    const by = b.y + (b.st > 1.5 ? 0.35 : b.st > 0.5 ? 0.95 : 1.35);
    if (!wLos(w, e[0], e[1], e[2], b.x, by, b.z)) continue;
    // 遠い・伏せ・しゃがみは見つけにくい（見ている時間をためる）
    const mem = ai.seen || (ai.seen = {});
    const r = mem[b.id] || (mem[b.id] = { det: 0, t: -1e9 });
    const k = (d < 30 ? 1 : d < 100 ? 0.6 : 0.35) * (b.st > 1.5 ? 0.45 : b.st > 0.5 ? 0.75 : 1) * ((b.spd || 0) > 1 ? 1.3 : 1) * ((b.fireK || 0) > 0.2 ? 2 : 1) * (ang < 0.5 ? 1 : 0.6);
    r.det = Math.min(1.5, r.det + k * SCAN_EVERY * S.dt * 2.4);
    r.t = S.t;
    if (r.det >= 1) { found = b; break; }
  }
  if (found) {
    if (ai.tgt !== found.id) { ai.tgt = found.id; ai.reactAt = S.t + Math.round((sk.react[0] + (sk.react[1] - sk.react[0]) * hrand(a.id, S.t, 21)) / S.dt); }
    ai.seenT = S.t; ai.tgtPos = [found.x, found.y, found.z];
  }
}

// 狙う（弾の落ちと、相手の動きの見越しを足す）。戻り値: 狙いのずれ（ラジアン）
function aimAtTgt(S, a, inp, b0, sk, dt, visible) {
  const ai = a.ai, e = eyeAI(S, a);
  const b = b0 || { id: ai.tgt, x: ai.tgtPos[0], y: ai.tgtPos[1], z: ai.tgtPos[2], st: 0, vx: 0, vz: 0 };
  const head = Math.hypot(b.x - a.x, b.z - a.z) < 20 && hrand(a.id, Math.floor(S.t / 120), 22) < 0.35;
  const ty = b.y + (b.st > 1.5 ? 0.3 : b.st > 0.5 ? (head ? 1.15 : 0.85) : (head ? 1.62 : 1.25));
  const W = curW(a), v = (W && W.vel) || 800;
  const dx0 = b.x - e[0], dz0 = b.z - e[2], d = Math.hypot(dx0, dz0), tof = d / v;
  const tx = b.x + (b.vx || 0) * tof, tz = b.z + (b.vz || 0) * tof;
  const dx = tx - e[0], dy = ty - e[1], dz = tz - e[2], h = Math.hypot(dx, dz);
  let wantYaw = yawTo(dx, dz), wantPitch = Math.atan2(dy + 0.5 * G * tof * tof, h);
  // ぶれ: 目標が変わったら大きく、狙い続けると小さく。遠いと少し大きい（体が小さく見える）
  if (ai.aimId !== b.id) { ai.aimId = b.id; ai.aimErr = sk.err * (0.7 + 0.6 * hrand(a.id, S.t, 31)) * Math.PI / 180; ai.aimT = 0; ai.aimDir = hrand(a.id, S.t, 32) * Math.PI * 2; }
  ai.aimT += dt;
  const settle = Math.exp(-ai.aimT * 1.4);
  // 遠いほど、照準器をのぞいて丁寧に狙う（角度のぶれが小さい）: 20m まで 1 → 150m で 0.35
  const rk = h < 20 ? 1 : Math.max(0.35, 1 - (h - 20) / 200);
  let err = ai.aimErr * (0.22 + 0.78 * settle) * rk * (1 + (a.supp || 0)) * (visible ? 1 : 2);
  const wob = ai.aimDir + ai.aimT * 0.9;
  wantYaw += Math.cos(wob) * err; wantPitch += Math.sin(wob) * err * 0.6;
  if (W) { wantPitch -= (a.ws.rp * Math.PI / 180) * sk.comp; wantYaw -= (a.ws.ry * Math.PI / 180) * sk.comp; }
  const step = sk.turn * Math.PI / 180 * dt;
  inp.yaw = turnToward(a.yaw, wantYaw, step);
  inp.pitch = a.pitch + Math.max(-step, Math.min(step, wantPitch - a.pitch));
  return Math.abs(angDiff(inp.yaw, wantYaw)) + Math.abs(inp.pitch - wantPitch);
}
