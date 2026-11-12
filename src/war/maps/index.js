// 大規模戦のマップの一覧（世界は重いので1回だけ作る）
import { buildRiverbend } from './riverbend.js';

export const WAR_MAPS = {
  riverbend: { name: 'リバーベンド', en: 'RIVERBEND', build: buildRiverbend, desc: '曲がって流れる川（今は水のない川床）をはさんで、東の町と西の工場が向かい合う。電波塔の丘・農場・村・石切り場・十字路。' },
};
const cache = new Map();
export function warWorld(id) {
  let w = cache.get(id);
  if (!w) { const M = WAR_MAPS[id]; if (!M) throw new Error('大規模戦のマップがない: ' + id); w = M.build(); cache.set(id, w); }
  return w;
}
