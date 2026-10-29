// 装備: 防具・ヘルメット・頭の装備・投げ物・戦術装備（RoN のwikiの値を基準）
export const VEST = {
  none: { name: 'なし', cover: [] },
  light: { name: '軽い防弾ベスト（前後の板）', cover: ['chest', 'back'] },
  heavy: { name: '重い防弾ベスト（全面）', cover: ['chest', 'back', 'belly', 'side'] },
};
// 板の材質: prot = 防護の段階（弾の apen がこれ以下なら止まる）、red = 止めたときの軽減、hits = 壊れるまで、after = 壊れた後の軽減
export const PLATE = {
  kevlar: { name: 'ケブラー（防護3）', prot: 3, red: 0.5, hits: 0, after: 0.5, accel: 0, speed: 1.0 },
  ceramic: { name: 'セラミック（防護6・4発で割れる）', prot: 6, red: 1.0, hits: 4, after: 0.4, accel: 0.05, speed: 1.0 },
  steel: { name: 'スチール（防護6・割れない・重い）', prot: 6, red: 0.865, hits: 0, after: 0.865, accel: 0.18, speed: 0.97, spall: true },
};
export const HELMET = {
  none: { name: 'なし', dur: 0, rico: 0 },
  helmet: { name: '防弾ヘルメット', dur: 2, rico: 0.25 },
};
export const HEADWEAR = {
  none: { name: 'なし' },
  nvg: { name: '暗視装置', nvg: true },
  gasmask: { name: 'ガスマスク（CBRN）', gas: true },
  goggles: { name: '防閃光ゴーグル', antiflash: 0.6 },
  facemask: { name: '防弾マスク', face: 2, rico: 0.33 },
};
// 投げ物と小さな装備（3枠。数を持つ）
export const GEAR = {
  flash: { name: '閃光弾', kind: 'nade', max: 4, fuse: 1.5, desc: '強い光と音で、まわりの人を数秒動けなくする。自分たちにも効く（防閃光ゴーグルで弱まる）。' },
  stinger: { name: 'スティンガー弾', kind: 'nade', max: 4, fuse: 1.5, desc: 'ゴムの小球をまき散らす。防具では防げず、まわりの人を怯ませて投降させやすくする。' },
  cs: { name: 'CSガス', kind: 'nade', max: 3, fuse: 1.6, desc: '催涙ガスの雲が約20秒残る。中の人は目と喉をやられ、戦う力が落ちる。ガスマスクで防げる。' },
  c2: { name: 'C2 爆破薬', kind: 'charge', max: 3, place: 2.5, desc: '鍵のかかった扉に付けて離れて起爆する。扉の向こうの人を怯ませる。扉の前の近い人は死ぬことがある。対戦では石膏の壁にも穴を開けられる。' },
  wedge: { name: 'ドアウェッジ', kind: 'wedge', max: 6, place: 1.5, desc: '扉の下にはさみ、開かなくする。背後を守るのに使う。破城槌・散弾・C2で開けると壊れる。' },
  lockgun: { name: 'ロックピックガン', kind: 'tool', max: 1, use: 2.0, desc: '普通のピッキング（6秒）より速く、約2秒で鍵を開ける。' },
  spray: { name: 'ペッパースプレー', kind: 'spray', max: 1, uses: 6, desc: '至近距離（約3m）の相手の顔に吹きつけ、抵抗をやめさせる。' },
  taser: { name: 'テーザー（予備）', kind: 'taserGear', max: 1, desc: '副武器とは別に持つテーザー。' },
  chem: { name: 'ケミライト', kind: 'chem', max: 8, desc: '光る棒。確認した部屋に置いて印にする。' },
  bandage: { name: '包帯', kind: 'heal', max: 3, use: 3.5, desc: '止血して体力を40回復する（対戦）。作戦では止血のみ（50%まで回復）。' },
  frame: { name: '壁用の爆破薬（フレームチャージ）', kind: 'wallcharge', max: 1, place: 4.0, desc: '対戦の攻撃側だけ。補強した壁にも大きな穴を開ける。' },
  claymore: { name: '扉の罠（手榴弾とワイヤー）', kind: 'trap', max: 2, place: 3.0, desc: '対戦の守る側だけ。扉に仕掛け、開けた人を吹き飛ばす。ミラーで見つけられ、マルチツールで外せる。' },
};
// 長い戦術装備（背中に1つ）
export const LONG = {
  none: { name: 'なし' },
  shield: { name: '防弾盾', desc: '前からの弾を止める。拳銃しか使えず、腰だめで撃つ。遅くなる。', move: 0.82 },
  ram: { name: '破城槌', desc: '鍵のかかった扉も1回で開ける。すぐ後ろの人を怯ませる。使う人は向こう側にさらされる。', move: 0.95 },
  breacher: { name: 'ブリーチングショットガン', desc: '扉の錠を撃って開ける。離れて使えば扉の罠も無効にできる。', move: 0.97 },
  wand: { name: 'オプティワンド', desc: '曲がるカメラ。扉の下や角の先をのぞいて、人と罠を見つける。', move: 1.0 },
  m320: { name: 'M320（閃光・スティンガー・ガス弾）', desc: '投げ物を遠くへ撃ち込む。当たった所で作動する。', move: 0.96, rounds: { flash: 3, stinger: 3, cs: 2 } },
};
// いつも持っている物
export const ALWAYS = ['cuffs', 'multitool', 'mirror', 'chem', 'lockpick'];
export const ALWAYS_NAME = { cuffs: '結束バンド（手錠）', multitool: 'マルチツール', mirror: 'ミラーガン', chem: 'ケミライト', lockpick: 'ピッキングの道具' };
