// 大規模戦のマップの一覧（世界は重いので1回だけ作る）
import { buildRiverbend } from './riverbend.js';
import { buildRange } from './range.js';

export const WAR_MAPS = {
  riverbend: { name: 'リバーベンド', en: 'RIVERBEND', build: buildRiverbend, desc: '曲がって流れる川（今は水のない川床）をはさんで、東の町と西の工場が向かい合う。電波塔の丘・農場・村・石切り場・十字路。' },
  range: { name: '射撃場', en: 'SHOOTING RANGE', build: buildRange, desc: '谷の射場に 10m〜1000m の標的。横に動きの練習場。', training: true },
};
// 対戦で選べるマップ（射撃場は除く）
export const WAR_MAP_LIST = Object.keys(WAR_MAPS).filter(k => !WAR_MAPS[k].training);
const cache = new Map();
export function warWorld(id) {
  let w = cache.get(id);
  if (!w) { const M = WAR_MAPS[id]; if (!M) throw new Error('大規模戦のマップがない: ' + id); w = M.build(); cache.set(id, w); }
  return w;
}
