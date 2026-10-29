// モードの一覧
import train from './train.js';
import pve from './pve.js';
import { makePvpMode } from './pvp.js';
export const MODES = { train, pve, tdm: makePvpMode('tdm'), elim: makePvpMode('elim'), bomb: makePvpMode('bomb') };
export const PVP_MODES = ['tdm', 'elim', 'bomb'];
export const MODE_INFO = {
  tdm: { name: 'チームデスマッチ', en: 'TEAM DEATHMATCH', desc: '倒されても4秒で復活する。先に上限のキル数に届くか、時間切れでキルの多いチームの勝ち。' },
  elim: { name: '殲滅戦', en: 'ELIMINATION', desc: 'リスポーンなし。相手を全員倒したチームがラウンドを取る。先に規定のラウンド数を取ったチームの勝ち。途中で陣地を交代する。' },
  bomb: { name: '爆弾', en: 'BOMB', desc: 'シージ式の攻守。立てこもり犯（防衛）は45秒の準備で壁を補強し扉をふさぐ。SWAT（攻撃）はドローンで偵察し、解除装置を爆弾の場所に仕掛けて45秒守る。倒れても仲間が起こせる（DBNO）。' },
};
