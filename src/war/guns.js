// 大規模戦の銃の効き方（BattleBit 寄り。research/WARBIT.md の 5）
// 体力 100。頭の倍率: SMG・拳銃 1.2（重い拳銃は 1.5）、狙撃 1.9、ほか 1.5（BattleBit Wiki の Stats）。手足 0.75（独自）。
// 距離の減衰: 連射の速い銃ほど早く落ちる。DMR はほとんど落ちず、狙撃は遠いほど上がる（800m で胴1発。BattleBit の偵察兵の説明）。
// ダメージは BattleBit Wiki の値がある銃はそれ（M4A1 30・G36C 31・MP5 29・MP7 25・UMP45 35・SCAR-H 42・Desert Eagle 72・ボルトの狙撃 65）、ほかは口径から。
import { WEAPONS } from '../engine/data/weapons.js';

const CAL = { '556': 30, '545': 31, '762x39': 34, '762x51': 40, '9mm': 27, '46': 25, '45': 33, '57': 24, '9x18': 24, '32': 21, '357': 48, '50ae': 70, '12g': 13, saw: 13 };
const BY_ID = { m4a1: 30, g36c: 31, mp5: 29, mp7: 25, ump45: 35, scarh: 42, deagle: 72, at308: 65 };
const cache = new Map();
export function warGun(id) {
  let g = cache.get(id);
  if (g) return g;
  const W = WEAPONS[id] || {};
  const dmg = BY_ID[id] ?? CAL[W.cal] ?? 28;
  let f0 = 45, f1 = 150, fm = 0.7, head = 1.5, gain = 0;
  if (W.cat === 'smg') { f0 = 25; f1 = 75; fm = 0.6; head = 1.2; }
  else if (W.cat === 'pistol') { f0 = 15; f1 = 50; fm = 0.55; head = W.cal === '50ae' || W.cal === '357' ? 1.5 : 1.2; }
  else if (W.cat === 'shotgun') { f0 = 10; f1 = 40; fm = 0.3; }
  else if (W.cat === 'sniper') { f0 = 1e9; f1 = 1e9; fm = 1; head = 1.9; gain = 0.54; }
  else if (W.cat === 'rifle') {
    const semiOnly = (W.modes || []).length && !(W.modes || []).includes('auto');
    if (semiOnly) { f0 = 120; f1 = 400; fm = 0.9; }                 // DMR
    else if (W.cal === '762x51') { f0 = 70; f1 = 200; fm = 0.8; }   // バトルライフル
  }
  g = { dmg, f0, f1, fm, head, gain };
  cache.set(id, g);
  return g;
}
// 距離の倍率
export function warFall(g, dist) {
  if (g.gain) return 1 + g.gain * Math.min(1, dist / 800);
  if (dist <= g.f0) return 1;
  if (dist >= g.f1) return g.fm;
  return 1 - (1 - g.fm) * (dist - g.f0) / (g.f1 - g.f0);
}
