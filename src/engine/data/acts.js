// 動作（調べる・使う）の体の動きと、手が届く距離。エンジン（当たり・届くか）と描画（三人称の姿勢・一人称の腕）で同じものを使う。
// 体の動き: cuff 相手の手首に両手（結束バンドを締める）／kneel ひざをついて両手で作業／grab かがんで拾う／place 両手で壁や扉に取りつける／
//          radio 左手で肩の無線／bandage 腕に包帯／kick 右足で蹴る（銃は持ったまま）／knob 左手でノブを回して押す・引く（銃は右手）
export const ACT_POSE = {
  restrain: 'cuff',
  revive: 'kneel', bombdefuse: 'kneel', defuse: 'kneel', plant: 'kneel', pick: 'kneel', lockgun: 'kneel', wedge: 'kneel', unwedge: 'kneel', disarm: 'kneel', trap: 'kneel', mirror: 'kneel',
  c2: 'place', reinforce: 'place', frame: 'place', bar: 'place', unbar: 'place',
  collect: 'grab', pickup: 'grab',
  report: 'radio', bandage: 'bandage', kick: 'kick', bash: 'kick',
  open: 'knob', close: 'knob', peek: 'knob',
};
// 両手を使う（銃は胸の前に吊る・拳銃はホルスター）
export const FREE_HANDS = new Set(['cuff', 'kneel', 'grab', 'place', 'bandage', 'peek']);
// しゃがんで行う
export const KNEEL_ACT = new Set(['restrain', 'revive', 'bombdefuse', 'defuse', 'plant', 'pick', 'lockgun', 'wedge', 'unwedge', 'disarm', 'trap', 'mirror', 'collect', 'pickup']);
// 手が届く距離（m）。人・物・爆弾は体の中心から目標（人は体の中心、倒れた人は胸）までの水平の距離、
// 扉は手を当てる所（ノブ・扉の下・錠）まで、壁は壁の面まで。腕の長さ（肩から約0.6m）＋体の厚みが目安
export const REACH_D = {
  restrain: 1.0, revive: 1.0, report: 3.2, collect: 1.0, pickup: 1.0,
  open: 1.0, close: 1.05, peek: 1.0, kick: 1.15, pick: 0.85, lockgun: 0.9, wedge: 0.95, unwedge: 0.95, c2: 0.95, mirror: 1.0, wand: 1.7, ram: 1.35, breach: 1.7,
  disarm: 0.95, bar: 1.1, unbar: 1.1, bash: 1.25, trap: 1.0, det: 99,
  bombdefuse: 1.0, defuse: 1.0, plant: 99, reinforce: 1.0, frame: 1.0,
};
// 動作の立ち位置: 目標から体の中心までの距離（m）。動作の始め（ALIGN_T 秒）に、ここへ寄って目標を向く
export const STAND_D = {
  restrain: 0.76, revive: 0.7, collect: 0.6, pickup: 0.6, bombdefuse: 0.66, defuse: 0.66,
  // 扉の下（ウェッジ・ミラー・罠）は前へかがむので、頭が手元の真上に来ないよう少し離れて座る
  pick: 0.8, lockgun: 0.8, wedge: 0.84, unwedge: 0.84, c2: 0.7, mirror: 0.8, disarm: 0.82, trap: 0.84, bar: 0.7, unbar: 0.7,
  kick: 0.8, bash: 0.78, reinforce: 0.66, frame: 0.66,
};
export const ALIGN_T = { restrain: 0.45, def: 0.3 };
// 拘束の段取り（動作の進み 0..1）: 寄る・ひざをつく → 相手の手を取る → 背中へ回す → 結束バンドを締める → 離す
export const CUFF_PH = { grab: 0.2, back: 0.5, tie: 0.62, pull: 0.82, rel: 0.9 };
