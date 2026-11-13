// 大規模戦（WAR BIT）のモード。BattleBit に合わせる（research/WARBIT.md の 1・2・3・7・11）。足りない人数はボット（src/war/ai.js）
// - CONQUEST: 拠点を奪い合い、相手のチケットを 0 にする。人数で範囲が変わる（16・32・64 対）。チケットは出撃のたびに1減り、
//   拠点を過半数持つ側が相手を（拠点の差×0.3）/秒 減らす
// - DOMINATION: 乗り物なし。狭い範囲に拠点3つ。奪うのはコンクエストの倍の速さ。持っている拠点1つにつき 3 秒ごとに1点。
//   先に 200 点か、15 分で多い方の勝ち。拠点には出撃できない（自陣の側の出撃の場所から）
// - TEAM DEATHMATCH: 乗り物なし。町の中。倒した数が先に 50（8対8）・100（16対16）か、10 分で多い方の勝ち
// 共通: 拠点は範囲に立つと奪える（味方が多いほど速く 4 人分まで、同数なら止まる。敵の拠点はまず中立に戻す）。
// 範囲の外に 10 秒いると死ぬ。倒されたら数秒で出撃し直す（人は出撃の画面で兵科と場所を選ぶ）
import { createActor, makeInventory, makeArmor } from '../actor.js';
import { killActor } from '../combat.js';
import { groundAt, pushOut } from '../world.js';
import { heightAt } from '../../war/world.js';
import { warThink, botSpawnPoint, goalOf, SQUAD } from '../../war/ai.js';
import { CLASSES, classLoadout, classGuns } from '../../war/classes.js';
import { hrand } from '../rng.js';
import { WEAPONS } from '../data/weapons.js';

export const OUT_LIMIT = 10;
export const TICKETS = { small: 300, medium: 500, large: 800 };
export const CAP_T = 10;        // 1人で中立→自軍（敵の拠点はこれを2回）。ドミネーションは半分
export const BLEED = 0.3;       // 拠点の差1つあたり、毎秒
export const DOM_RATE = 3;      // ドミネーション: 拠点1つにつき何秒ごとに1点
export const WAR_MODES = {
  conquest: { name: 'コンクエスト', en: 'CONQUEST', desc: '拠点を奪い合い、相手のチケットを 0 にする。人数で戦場の広さが変わる。',
    sizes: { small: { per: 16, area: 'small', tickets: 300 }, medium: { per: 32, area: 'medium', tickets: 500 }, large: { per: 64, area: 'large', tickets: 800 } }, capT: CAP_T, respawn: 7 },
  domination: { name: 'ドミネーション', en: 'DOMINATION', desc: '乗り物なし。狭い範囲の拠点3つ。持っている数だけ点が入り、先に 200 点。',
    sizes: { small: { per: 16 }, medium: { per: 32 } }, area: 'dom', score: 200, time: 15 * 60, capT: CAP_T / 2, respawn: 5 },
  tdm: { name: 'チームデスマッチ', en: 'TEAM DEATHMATCH', desc: '乗り物なし。町の中で、倒した数を先に決まった数まで。',
    sizes: { small: { per: 8, kills: 50 }, medium: { per: 16, kills: 100 } }, area: 'tdm', time: 10 * 60, respawn: 5 },
  // 射撃場（訓練）: 弾は減らない。標的の人形は倒れて 3 秒で起き上がる。兵科と銃はいつでも変えられる
  range: { name: '射撃場', en: 'SHOOTING RANGE', desc: '10m〜1000m の標的で銃を試す。弾は減らない。', sizes: { small: { per: 0 } }, area: 'range', respawn: 3, training: true },
};
export const WAR_MODE_LIST = ['conquest', 'domination', 'tdm'];
export const sizeLabel = (per) => `${per} vs ${per}`;
export const RESPAWN_T = 7;
export const respawnT = (m) => (WAR_MODES[m.mode] || WAR_MODES.conquest).respawn;
export const modeName = (m) => (WAR_MODES[m.mode] || WAR_MODES.conquest).en;

// ボットの兵科（分隊の1人目は分隊長。ほかは重みつき）
const BOT_CLS = [['assault', 34], ['medic', 20], ['support', 14], ['engineer', 16], ['recon', 16]];
const SKILLS = ['bot1', 'bot2', 'bot2', 'bot2', 'bot3'];
function botClass(S, t, k) {
  if (k % SQUAD === 0) return 'leader';
  const tot = BOT_CLS.reduce((s, x) => s + x[1], 0);
  let r = hrand(S.seed + t * 7, k, 63) * tot;
  for (const [c, wgt] of BOT_CLS) { r -= wgt; if (r <= 0) return c; }
  return 'assault';
}
function botGun(S, cls, t, k) {
  const L = classGuns(cls);
  return L[Math.floor(hrand(S.seed + t * 11, k, 61) * L.length) % L.length];
}
// 分隊の名前（フォネティックコード。チーム 0 は A〜H、チーム 1 は O〜V で、結果の表で見分けられるように）
const SQ_NAME = [['アルファ', 'ブラボー', 'チャーリー', 'デルタ', 'エコー', 'フォックストロット', 'ゴルフ', 'ホテル'], ['オスカー', 'パパ', 'ケベック', 'ロメオ', 'シエラ', 'タンゴ', 'ユニフォーム', 'ビクター']];
const SQ_EN = [['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL'], ['OSCAR', 'PAPA', 'QUEBEC', 'ROMEO', 'SIERRA', 'TANGO', 'UNIFORM', 'VICTOR']];
export const squadName = (sq, t = 0) => { const L = SQ_NAME[t ? 1 : 0]; return L[sq % L.length] + (sq >= L.length ? Math.floor(sq / L.length) + 1 : ''); };
export const squadEn = (sq, t = 0) => { const L = SQ_EN[t ? 1 : 0]; return L[sq % L.length] + (sq >= L.length ? ' ' + (Math.floor(sq / L.length) + 1) : ''); };

// 本陣のまわりの出撃位置（チーム t、k 番目）
export function hqSpot(S, w, t, k) {
  const [hx, hz] = S.m.hq[t];
  const toward = S.m.hq[1 - t][0] > hx ? 1 : -1; // 本陣から戦場の向き（x）
  const a = (k * 2.399) % (Math.PI * 2), r = 3 + (k % 9) * 1.5;
  const x = hx + Math.cos(a) * r + toward * 4, z = hz + Math.sin(a) * r;
  return { x, z, y: groundAt(w, x, z, heightAt(w, x, z) + 0.3), yaw: toward > 0 ? Math.PI / 2 : -Math.PI / 2 };
}
// (x, z) のまわり r の中で、物にめり込まない外の所
const _po = [0, 0, 0];
export function freeSpot(S, w, cx, cz, r, seed, k) {
  for (let t = 0; t < 12; t++) {
    const a = hrand(seed, k * 13 + t, 71) * Math.PI * 2, rr = r * (0.2 + 0.6 * hrand(seed, k * 13 + t, 72));
    const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr, g = heightAt(w, x, z);
    const y = groundAt(w, x, z, g + 0.3);
    if (y > g + 0.5) continue; // 箱の上（屋根など）
    pushOut(w, x, z, y + 0.4, y + 1.8, 0.3, null, -1, _po);
    if (_po[2]) continue;
    if ((w.blds || []).some(b => x > b.rect[0] - 0.5 && x < b.rect[2] + 0.5 && z > b.rect[1] - 0.5 && z < b.rect[3] + 0.5)) continue;
    return { x, z, y, yaw: hrand(seed, k, 73) * Math.PI * 2 };
  }
  return { x: cx, z: cz, y: groundAt(w, cx, cz, heightAt(w, cx, cz) + 0.3), yaw: 0 };
}
export const flagSpot = (S, w, f, k) => freeSpot(S, w, f.x, f.z, f.r, f.id.charCodeAt(0), k);
// ドミネーション・TDM: 出撃の場所の候補から、敵が近くにいない所（ボットは分隊の目標に近い所、人は少しばらつく）
function zoneSpot(S, w, a, k) {
  const m = S.m, cand = m.spawns[a.team];
  const g = a.ai ? goalOf(S, a) : null;
  let best = cand[0], bs = 1e9;
  for (let i = 0; i < cand.length; i++) {
    const [x, z] = cand[i];
    let s = 0;
    for (const b of S.actors) if (b.alive && !b.down && b.team !== a.team && b.team >= 0) { const d = Math.hypot(b.x - x, b.z - z); if (d < 60) s += (60 - d) * 10; }
    s += g ? Math.hypot(g.x - x, g.z - z) * 0.2 : hrand(S.seed + a.id, k, 74 + i) * 40;
    if (s < bs) { bs = s; best = cand[i]; }
  }
  return freeSpot(S, w, best[0], best[1], 7, a.id * 31 + 5, k);
}
export function inArea(S, x, z) { const r = S.m.rect; return x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]; }
// 出撃できる拠点（コンクエストだけ。自軍の物で、敵が奪いかけていない）
export function canSpawnAt(S, f, team) { return S.m.mode === 'conquest' && f.owner === team && !f.contested && !(team === 0 ? f.prog < 0.999 : f.prog > -0.999); }
// 兵科を選べるか（分隊長は分隊の1人目だけ）
export function canPick(a, cls) { return !!CLASSES[cls] && (cls !== 'leader' || a.sqIdx === 0); }

// 兵科と銃を決める（次の出撃から）
function setClass(a, cls, gun, sec) {
  if (!canPick(a, cls)) cls = 'assault';
  a.warCls = cls;
  a.warLo = classLoadout(cls, gun, sec);
}

// 出撃し直す（at: 'hq' か拠点の id。ドミネーション・TDM は出撃の場所から）
function redeploy(S, w, a, at) {
  const m = S.m, k = (m.spawnN = (m.spawnN || 0) + 1);
  let p;
  if (a.dummy) p = { x: a.dummy.x, z: a.dummy.z, y: groundAt(w, a.dummy.x, a.dummy.z, heightAt(w, a.dummy.x, a.dummy.z) + 0.3), yaw: a.dummy.yaw };
  else if (m.mode === 'conquest') {
    const f = at && at !== 'hq' ? m.flags.find(q => q.id === at) : null;
    p = f && canSpawnAt(S, f, a.team) ? flagSpot(S, w, f, k) : hqSpot(S, w, a.team, k);
  } else p = zoneSpot(S, w, a, k);
  const C = CLASSES[a.warCls] || CLASSES.assault;
  Object.assign(a, { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: 0, vx: 0, vy: 0, vz: 0, alive: true, dead: false, down: false, dbno: 0, dbnoCount: 0, hp: C.hp, maxHp: C.hp, oob: 0,
    stun: 0, flash: 0, gas: 0, tased: 0, deaf: 0, supp: 0, bleed: 0, flinch: 0, act: null, st: 0, stance: 0, vault: null, air: false, airTop: null, lean: 0, ads: 0, low: 0, adsOn: false, lowOn: false, sprint: false, sprT: 0, fat: 0, peek: null, melee: null, gest: null, spot: 0,
    inj: { arm: 0, leg: 0, head: 0 }, spawnProt: 2, stateT: 0, dmgBy: {}, lastHit: null, deployAt: null, deployed: true });
  // 向き: 敵の本陣の方
  const eh = m.hq[1 - a.team]; a.yaw = Math.atan2(eh[0] - a.x, eh[1] - a.z);
  const lo = a.warLo || classLoadout('assault');
  a.inv = makeInventory(lo); a.armor = makeArmor(lo);
  a.ws = { slot: a.inv.w[0] ? 0 : 1, next: -1, st: 'draw', t: 0.4, cd: 0, trigWas: false, rp: 0, ry: 0, bloom: 0, shots: 0, lastShot: -99, rk: null, rd: 0, gear: -1, pumpNeed: false, barrel: 0 };
  if (a.ai) { const keep = { type: a.ai.type, skill: a.ai.skill }; a.ai = keep; }
  if (m.mode === 'conquest') m.tickets[a.team] = Math.max(0, m.tickets[a.team] - 1);
}

function stepFlags(S, w, dt, ev) {
  const m = S.m;
  const rate = dt / m.capT;
  for (const f of m.flags) {
    let n0 = 0, n1 = 0;
    for (const a of S.actors) { if (!a.alive || a.down || a.isDrone) continue; if (Math.hypot(a.x - f.x, a.z - f.z) > f.r || Math.abs(a.y - f.y) > 12) continue; if (a.team === 0) n0++; else if (a.team === 1) n1++; }
    f.n = [n0, n1];
    f.contested = n0 > 0 && n1 > 0;
    const before = f.owner;
    if (n0 !== n1) {
      const s = Math.sign(n0 - n1), k = Math.min(4, Math.abs(n0 - n1));
      f.prog = Math.max(-1, Math.min(1, f.prog + s * k * rate));
    } else if (!n0 && f.owner >= 0) {
      // 誰もいない: 持ち主の側へゆっくり戻る
      const tgt = f.owner === 0 ? 1 : -1; f.prog += Math.sign(tgt - f.prog) * Math.min(Math.abs(tgt - f.prog), rate * 0.25);
    } else if (!n0 && f.owner < 0 && f.prog !== 0) {
      f.prog -= Math.sign(f.prog) * Math.min(Math.abs(f.prog), rate * 0.25);
    }
    // 持ち主: 端まで行けばその側、0 を越えたら中立
    if (f.prog >= 1) f.owner = 0; else if (f.prog <= -1) f.owner = 1;
    else if ((f.owner === 0 && f.prog <= 0) || (f.owner === 1 && f.prog >= 0)) f.owner = -1;
    if (f.owner !== before) ev.push({ e: 'flag', id: f.id, owner: f.owner, prev: before });
  }
  const c = [0, 0]; for (const f of m.flags) if (f.owner >= 0) c[f.owner]++;
  if (m.mode === 'conquest') {
    // チケットの減り（拠点を過半数持つ側が、相手を減らす）
    const half = m.flags.length / 2;
    for (let t = 0; t < 2; t++) if (c[t] > half) m.tickets[1 - t] = Math.max(0, m.tickets[1 - t] - (c[t] - c[1 - t]) * BLEED * dt);
  } else if (m.mode === 'domination') {
    // 点: 持っている拠点1つにつき DOM_RATE 秒ごとに1点
    m.domAcc = (m.domAcc || 0) + dt;
    while (m.domAcc >= DOM_RATE) { m.domAcc -= DOM_RATE; for (let t = 0; t < 2; t++) m.score[t] += c[t]; }
  }
}
// 射撃場: 人の予備の弾倉と投げ物を、兵科の数まで戻す（撃ちっぱなしで試せる）
function refill(S) {
  for (const a of S.actors) {
    if (a.pid == null || !a.alive || !a.inv) continue;
    for (const wi of a.inv.w) {
      if (!wi) continue;
      const W = WEAPONS[wi.id]; if (!W) continue;
      if (wi.mags) { const cap = wi.cap || W.mag; for (let i = 0; i < wi.mags.length; i++) wi.mags[i] = cap; while (wi.mags.length < (W.spare || 3)) wi.mags.push(cap); }
      else if (W.spare != null) wi.res = W.spare;
    }
    const want = new Map((a.warLo && a.warLo.gear || []).map(([id, n]) => [id, n]));
    for (const g of a.inv.gear) if (want.has(g.id)) g.n = Math.max(g.n, want.get(g.id));
  }
}
function finish(S, ev, win, why) {
  const m = S.m;
  m.over = true; m.winner = win; m.endT = S.t; m.why = why;
  ev.push({ e: 'matchend', win, why });
}

export default {
  init(S, w, o) {
    const mode = WAR_MODES[o.wmode] ? o.wmode : 'conquest', MD = WAR_MODES[mode];
    const size = MD.sizes[o.size] ? o.size : Object.keys(MD.sizes)[0], SZ = MD.sizes[size];
    const A = w.areas[SZ.area || MD.area];
    S.war = true;
    S.rules.ff = false; S.rules.dbno = true;
    const T = SZ.tickets || 0;
    S.m = { kind: 'war', mode, size, per: SZ.per, rect: A.rect.slice(), hq: A.hq.map(p => p.slice()), spawns: A.spawns ? A.spawns.map(l => l.map(p => p.slice())) : null,
      tickets: [T, T], tickets0: T, score: [0, 0], limit: mode === 'domination' ? MD.score : mode === 'tdm' ? SZ.kills : 0, timeLimit: MD.time || 0, capT: MD.capT || CAP_T,
      over: false, winner: -1, startT: S.t, spawnN: 0,
      flags: (A.flags || []).map(id => { const d = w.flagDefs[id]; return { id, name: d.name, x: d.x, z: d.z, r: d.r, y: heightAt(w, d.x, d.z), owner: -1, prog: 0, contested: false, n: [0, 0] }; }),
      respawn: [], sqGoal: {} };
    const roster = o.roster || [{ pid: 0, name: 'あなた', team: 0 }];
    const per = o.bots === false ? 0 : (o.per ?? SZ.per ?? 16);
    const cnt = [0, 0];
    const add = (t, r, isBot) => {
      const k = cnt[t]++, p = S.m.mode === 'conquest' ? hqSpot(S, w, t, k) : freeSpot(S, w, S.m.spawns[t][k % S.m.spawns[t].length][0], S.m.spawns[t][k % S.m.spawns[t].length][1], 8, t * 97 + 3, k);
      const sq = Math.floor(k / SQUAD), sqIdx = k % SQUAD;
      const name = r.name || `${squadName(sq, t)}${sqIdx + 1}`;
      const a = createActor(S, { kind: 'soldier', team: t, pid: r.pid ?? null, name, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: 100, lo: r.lo || classLoadout('assault'), h: 1.72 + hrand(S.seed, k * 3 + t, 81) * 0.16 });
      a.role = 'soldier'; a.oob = 0; a.squad = sq; a.sqIdx = sqIdx;
      // 向き: 敵の本陣の方
      { const eh = S.m.hq[1 - t]; a.yaw = Math.atan2(eh[0] - a.x, eh[1] - a.z); }
      if (r.lo) { a.warCls = r.cls || 'assault'; a.warLo = r.lo; }
      else if (isBot) { const c = botClass(S, t, k); setClass(a, c, botGun(S, c, t, k)); }
      else setClass(a, r.cls || 'assault', r.gun, r.sec);
      a.inv = makeInventory(a.warLo); a.armor = makeArmor(a.warLo);
      a.ws.slot = a.inv.w[0] ? 0 : 1;
      a.hp = a.maxHp = (CLASSES[a.warCls] || CLASSES.assault).hp;
      if (isBot) a.ai = { type: 'war', skill: SKILLS[Math.floor(hrand(S.seed, k * 5 + t, 82) * SKILLS.length)] };
      // 出撃の画面から始める（人だけ）: 倒れた扱いで、場所を選ぶまで待つ
      if (!isBot && o.predeploy) { a.alive = false; a.dead = true; a.deployed = false; S.m.respawn.push({ id: a.id, at: S.t }); }
      else a.deployed = true;
      return a;
    };
    for (const r of roster) add(r.team ?? 0, r, false);
    for (let t = 0; t < 2; t++) while (cnt[t] < per) add(t, {}, true);
    if (mode === 'range') {
      // 標的の人形（敵の服・ヘルメットと胴の防具。動かない）。倒れずにそのまま倒れる（ダウンなし）
      S.rules.dbno = false;
      const [lx, lz] = S.m.hq[0];
      for (const t of w.rangeTargets || []) {
        const y = groundAt(w, t.x, t.z, heightAt(w, t.x, t.z) + 0.3), yaw = Math.atan2(lx - t.x, lz - t.z);
        const a = createActor(S, { kind: 'soldier', team: 1, pid: null, name: `TARGET ${t.d}m`, x: t.x, y, z: t.z, yaw, hp: 100, lo: classLoadout('assault'), h: 1.78 });
        a.role = 'soldier'; a.oob = 0; a.squad = null; a.dummy = { x: t.x, z: t.z, yaw, d: t.d };
        a.warCls = 'assault'; a.warLo = classLoadout('assault'); a.inv = makeInventory(a.warLo); a.armor = makeArmor(a.warLo);
        a.ws.slot = a.inv.w[0] ? 0 : 1; a.hp = a.maxHp = 100; a.ai = null; a.deployed = true;
      }
    }
  },
  canDown() { return true; },
  think(S, w, dt, ev) { return S.m.mode === 'range' ? {} : warThink(S, w, dt, ev); },
  // 出撃の画面から（倒れている間）: 兵科・銃を変える、出撃する場所を選ぶ
  act(S, w, a, ac, ev) {
    if (ac.a === 'warClass') { if (!a.alive) setClass(a, ac.cls, ac.gun, ac.sec); return true; }
    if (ac.a === 'warRedeploy') {
      // 射撃場だけ: その場で出撃の画面へ（倒されたことにはしない）
      if (S.m.mode !== 'range' || !a.alive) return true;
      Object.assign(a, { alive: false, dead: true, down: false, deployed: false, deployAt: null, act: null, ads: 0, adsOn: false, sprint: false });
      S.m.respawn.push({ id: a.id, at: S.t });
      ev.push({ e: 'redeploy', id: a.id });
      return true;
    }
    if (ac.a !== 'warDeploy') return false;
    if (a.alive) return true;
    if (ac.cls) setClass(a, ac.cls, ac.gun, ac.sec);
    a.deployAt = ac.at || 'hq';
    return true;
  },
  step(S, w, dt, ev) {
    const m = S.m;
    if (m.over) return;
    stepFlags(S, w, dt, ev);
    // 出撃し直す: ボットは時間が来たら、人は場所を選んでから
    for (let i = m.respawn.length - 1; i >= 0; i--) {
      const r = m.respawn[i]; if (S.t < r.at) continue;
      const a = S.byId[r.id]; if (!a || !a.dead) { m.respawn.splice(i, 1); continue; }
      if (m.mode === 'conquest' && m.tickets[a.team] <= 0) continue;
      if (a.pid != null && !a.deployAt) continue;
      m.respawn.splice(i, 1);
      const at = a.pid != null ? a.deployAt : (botSpawnPoint(S, a) || {}).flag || 'hq';
      redeploy(S, w, a, at);
      ev.push({ e: 'respawn', id: a.id, at });
    }
    if (m.mode === 'range' && S.t % 30 === 0) refill(S);
    // 範囲の外: 10秒で死ぬ（戻れば消える）
    for (const a of S.actors) {
      if (!a.alive) continue;
      if (inArea(S, a.x, a.z)) { if (a.oob) { a.oob = 0; if (a.pid != null) ev.push({ e: 'oob', id: a.id, t: 0 }); } continue; }
      const was = a.oob || 0;
      a.oob = was + dt;
      if (a.pid != null && Math.floor(was) !== Math.floor(a.oob)) ev.push({ e: 'oob', id: a.id, t: OUT_LIMIT - Math.floor(a.oob) });
      if (a.oob >= OUT_LIMIT) { a.oob = 0; a.lastHit = null; killActor(S, a, null, ev, 'oob', ''); }
    }
    // 勝ち負け
    if (m.mode === 'conquest') {
      for (let t = 0; t < 2; t++) if (m.tickets[t] <= 0 && !m.over) finish(S, ev, 1 - t, 'tickets');
      return;
    }
    if (m.mode === 'range') return;
    const s = m.score;
    if (s[0] >= m.limit || s[1] >= m.limit) { finish(S, ev, s[0] === s[1] ? -1 : s[0] > s[1] ? 0 : 1, 'score'); return; }
    if (m.timeLimit && (S.t - m.startT) * S.dt >= m.timeLimit) finish(S, ev, s[0] === s[1] ? -1 : s[0] > s[1] ? 0 : 1, 'time');
  },
  onEvents(S, w, evs) {
    const m = S.m;
    for (const e of evs) if (e.e === 'kill') {
      const v = S.byId[e.id], k = S.byId[e.by];
      if (!v) continue;
      v.stats.d++;
      if (k && k.team !== v.team) { k.stats.k++; if (m.mode === 'tdm' && !m.over) m.score[k.team]++; }
      for (const as of e.as || []) { const x = S.byId[as]; if (x && x.team !== v.team) x.stats.a++; }
      v.deployAt = null;
      m.respawn.push({ id: v.id, at: S.t + Math.round(respawnT(m) / S.dt) });
    }
  },
};
