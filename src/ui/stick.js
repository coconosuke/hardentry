// 移動スティックのダッシュの判定（DOM なし。テストできるように分けた）
// 指の位置は土台の中心から、スティックの半径を1とした値（上が dy<0）。spr = ダッシュの印の高さ（半径の倍数）
// 始める: 指が印より上で、真上から ±40° 以内。走っている間: 印の 0.25 下まで・±52° まで続く（親指が少し斜めにずれても、曲がりながらでも走れる）
// （11-12 まで: 印より上で、横のずれが半径の0.8未満。土台がついてくる所では真上から約25°までしか走れなかった）
// エンジンは前への入力が 0.55 より大きいとき（真上から約56°以内）だけ走る
export const SPRINT_ZONE = { start: 40, keep: 52, drop: 0.25 };
export function sprintZone(dx, dy, spr, armed) {
  if (!(dy < 0)) return false;
  const ang = Math.atan2(Math.abs(dx), -dy) * 180 / Math.PI;
  return armed ? (dy < -(spr - SPRINT_ZONE.drop) && ang <= SPRINT_ZONE.keep) : (dy < -spr && ang <= SPRINT_ZONE.start);
}
