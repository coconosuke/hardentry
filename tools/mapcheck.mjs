// マップの点検: node tools/mapcheck.mjs [mapId ...]
//  - 世界の組み立ての誤り（部屋の名前・階段）
//  - 家具が壁・扉・窓にめり込んでいないか、扉の前をふさいでいないか、家具どうしが重なっていないか
//  - 出現位置（SWAT・容疑者・市民・人質・爆弾・PvP・TDM・目標地点）が歩ける床にあるか、家具の中でないか
//  - SWATの出現位置から、すべての出現位置と部屋へ歩いて行けるか（扉は通れるものとする）
import { compileMap, C, CS, nearestFloor } from '../src/engine/world.js';
import { MAPS } from '../src/engine/maps/index.js';
import { buildNav } from '../src/engine/ai/nav.js';

export function checkMap(id) {
  const def = MAPS[id];
  const w = compileMap(def);
  const nav = buildNav(w);
  const out = { id, errors: [...w.errors], warn: [] };
  const T = (L, i, j) => (L < 0 || L >= w.NL || i < 0 || j < 0 || i >= w.W || j >= w.D) ? C.VOID : w.cell[w.idx(L, i, j)];
  const wallish = (t) => t === C.WALL || t === C.DOOR || t === C.WINDOW || t === C.GLASSWALL || t === C.LOW || t === C.FENCE;
  // 1) 家具
  const solid = w.props.filter(p => p.solid);
  for (const p of w.props) {
    const i0 = Math.floor((p.x - p.w / 2 + 0.03) / CS), i1 = Math.floor((p.x + p.w / 2 - 0.03) / CS);
    const j0 = Math.floor((p.z - p.d / 2 + 0.03) / CS), j1 = Math.floor((p.z + p.d / 2 - 0.03) / CS);
    let bad = null;
    for (let j = j0; j <= j1 && !bad; j++) for (let i = i0; i <= i1 && !bad; i++) {
      const t = T(p.L, i, j);
      if (t === C.VOID) bad = `外にはみ出し (${i},${j})`;
      else if (t === C.STAIR) bad = `階段の上 (${i},${j})`;
      else if (wallish(t) || t === C.OPEN) {
        // 壁の板はマスの中央に thick の幅。家具の箱が板に触れていなければよい
        const th = (w.thick[w.idx(p.L, i, j)] || 0.12) / 2, cx = (i + 0.5) * CS, cz = (j + 0.5) * CS;
        const arms = w.arms[w.idx(p.L, i, j)];
        // 板の範囲（腕のある向きはマスの端まで）
        const bx0 = (arms & 2) ? i * CS : cx - th, bx1 = (arms & 1) ? (i + 1) * CS : cx + th;
        const bz0 = (arms & 8) ? j * CS : cz - th, bz1 = (arms & 4) ? (j + 1) * CS : cz + th;
        const px0 = p.x - p.w / 2, px1 = p.x + p.w / 2, pz0 = p.z - p.d / 2, pz1 = p.z + p.d / 2;
        const ov = Math.min(px1, bx1) - Math.max(px0, bx0) > 0.02 && Math.min(pz1, bz1) - Math.max(pz0, bz0) > 0.02;
        if (ov) bad = `${t === C.DOOR ? '扉' : t === C.WINDOW ? '窓' : t === C.OPEN ? '開口' : '壁'}にめり込み (${i},${j})`;
      }
    }
    if (bad) out.errors.push(`家具 ${p.type}#${p.id} (${(p.x / CS).toFixed(1)},${(p.z / CS).toFixed(1)},${p.L}): ${bad}`);
    // 扉の前（両側1マス）をふさぐ
    if (p.solid && p.h > 0.3) {
      for (const d of w.doors) {
        if (d.L !== p.L) continue;
        // 扉の開口の両側 0.9m の範囲
        const ax = d.axis === 0;
        const x0 = ax ? d.a0 : d.c - 0.9, x1 = ax ? d.a1 : d.c + 0.9, z0 = ax ? d.c - 0.9 : d.a0, z1 = ax ? d.c + 0.9 : d.a1;
        const ox = Math.min(x1, p.x + p.w / 2) - Math.max(x0, p.x - p.w / 2), oz = Math.min(z1, p.z + p.d / 2) - Math.max(z0, p.z - p.d / 2);
        if (ox > 0.15 && oz > 0.15) out.warn.push(`家具 ${p.type}#${p.id} (${(p.x / CS).toFixed(1)},${(p.z / CS).toFixed(1)},${p.L}) が扉#${d.id} の前をふさぐ`);
      }
    }
  }
  for (let a = 0; a < solid.length; a++) for (let b = a + 1; b < solid.length; b++) {
    const p = solid[a], q = solid[b];
    if (p.L !== q.L) continue;
    const ox = Math.min(p.x + p.w / 2, q.x + q.w / 2) - Math.max(p.x - p.w / 2, q.x - q.w / 2);
    const oz = Math.min(p.z + p.d / 2, q.z + q.d / 2) - Math.max(p.z - p.d / 2, q.z - q.d / 2);
    if (ox > 0.06 && oz > 0.06) out.warn.push(`家具の重なり ${p.type}#${p.id} と ${q.type}#${q.id} (${(p.x / CS).toFixed(1)},${(p.z / CS).toFixed(1)},${p.L})`);
  }
  // 2) 歩けるつながり（4方向。扉・開口・階段は通れる）
  const N = w.NL * w.W * w.D, seen = new Uint8Array(N);
  const walkK = (k) => nav.walk[k] > 0;
  const cellK = (x, z, L) => { const i = Math.floor(x), j = Math.floor(z); if (i < 0 || j < 0 || i >= w.W || j >= w.D) return -1; return w.idx(L, i, j); };
  const sp = def.spawn || {};
  const starts = (sp.swat || []).map(e => cellK(e.x, e.z, e.L || 0)).filter(k => k >= 0);
  if (!starts.length) out.errors.push('SWATの出現位置がない');
  const q = [];
  for (const k of starts) if (walkK(k) && !seen[k]) { seen[k] = 1; q.push(k); }
  const WD = w.W * w.D;
  while (q.length) {
    const k = q.pop(); const L = Math.floor(k / WD), r = k % WD, j = Math.floor(r / w.W), i = r % w.W;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= w.W || nj >= w.D) continue;
      const k2 = w.idx(L, ni, nj); if (seen[k2] || !walkK(k2)) continue; seen[k2] = 1; q.push(k2);
    }
    const ln = nav.links.get(k); if (ln) for (const k2 of ln) if (!seen[k2]) { seen[k2] = 1; q.push(k2); }
  }
  // 出現位置の点検: 実際に置かれる位置（家具をよけた最寄りの床）で調べる
  const chk = (label, x, z, L, opt = {}) => {
    const k = cellK(x, z, L);
    if (k < 0) { out.errors.push(`${label} (${x},${z},${L}) がマップの外`); return; }
    const t = w.cell[k];
    if (!(t === C.FLOOR || t === C.OUT || t === C.STAIR)) { out.errors.push(`${label} (${x},${z},${L}) が床ではない`); return; }
    const p = nearestFloor(w, L, x * CS, z * CS, 4);
    if (!p) { out.errors.push(`${label} (${x},${z},${L}) の近くに空いた床がない`); return; }
    const k2 = cellK(p[0] / CS, p[1] / CS, L), d = Math.hypot(p[0] - x * CS, p[1] - z * CS);
    if (w.roomAt[k2] !== w.roomAt[k]) out.errors.push(`${label} (${x},${z},${L}) が別の部屋へずれる（家具でふさがっている）`);
    else if (d > 1.2 && !opt.onProp) out.warn.push(`${label} (${x},${z},${L}) が家具をよけて ${d.toFixed(1)}m ずれる`);
    if (!seen[k2]) out.errors.push(`${label} (${x},${z},${L}) へSWATの出現位置から行けない`);
  };
  for (const e of sp.swat || []) chk('SWAT出現 ' + e.name, e.x, e.z, e.L || 0);
  for (const key of ['sus', 'civ', 'hostage', 'bomb', 'tdm']) for (const e of sp[key] || []) chk(key, e[0], e[1], e[2] || 0);
  for (const e of sp.evidence || []) chk('evidence', e[0], e[1], e[2] || 0, { onProp: true });
  if (sp.pvp) for (const s of ['a', 'b']) for (const e of sp.pvp[s] || []) chk('pvp.' + s, e[0], e[1], e[2] || 0);
  for (const e of sp.sites || []) chk('目標地点 ' + e.name, e.x, e.z, e.L || 0);
  // 3) 部屋: 行けない部屋（屋外でない、4マス以上）
  for (const r of w.rooms) {
    if (r.out || r.cells.length < 4) continue;
    const ok = r.cells.some(k => seen[k]);
    if (!ok) out.warn.push(`部屋 ${r.name} (${r.L},${r.x0}-${r.x1},${r.z0}-${r.z1}) へ歩いて行けない`);
    if (/^部屋\d/.test(r.name) && r.cells.length >= 12) out.warn.push(`名前のない部屋 ${r.name} (${r.L},${r.x0}-${r.x1},${r.z0}-${r.z1}, ${r.cells.length}マス)`);
  }
  // 4) 明かり: 屋内の床の上か
  for (const lt of def.lights || []) {
    const [x, z, L = 0] = lt; const k = cellK(x, z, L);
    if (k < 0 || !(w.cell[k] === C.FLOOR || w.cell[k] === C.OUT || w.cell[k] === C.STAIR)) out.warn.push(`明かり (${x},${z},${L}) が床の上でない`);
  }
  // 5) 扉のオプションのキーが実在の扉か
  for (const key of Object.keys(def.doors || {})) {
    const [i, j, L] = key.split(',').map(Number);
    if (!w.doors.some(d => d.L === L && d.cells && d.cells.includes(w.idx(L, i, j))) && !w.doors.some(d => d.L === L && d.i0 === i && d.j0 === j)) out.warn.push(`扉の設定 ${key} に扉がない`);
  }
  out.stats = { W: w.W, D: w.D, NL: w.NL, rooms: w.rooms.filter(r => !r.out).length, doors: w.doors.length, props: w.props.length, reach: Math.round(100 * [...seen].filter(Boolean).length / Math.max(1, [...nav.walk].filter(Boolean).length)) };
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('mapcheck.mjs')) {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(MAPS);
  let bad = 0;
  for (const id of ids) {
    const r = checkMap(id);
    console.log(`== ${id} ${JSON.stringify(r.stats)}`);
    for (const e of r.errors) console.log('  ✗ ' + e);
    for (const e of r.warn) console.log('  △ ' + e);
    bad += r.errors.length;
  }
  process.exit(bad ? 1 : 0);
}
