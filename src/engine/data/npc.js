// 人の性格と装備の種類（容疑者・市民・隊員）。資料室はここから作る。
// morale: 士気の範囲（0で必ず投降）、aggr: 攻撃的（撃ち始めやすさ）、hidden: 隠し武器（投降のふりから撃つ）、
// hide: 隠れる、flee: 逃げる、ambush: 待ち伏せ、armor: 防弾ベストの確率、react: 反応時間の倍率、acc: 命中の良さ
export const SUSPECTS = {
  thug: { name: 'チンピラ', desc: '地元のギャング。拳銃や小さな短機関銃。追い詰められると撃ってくるが、数で押されると投降しやすい。', morale: [0.35, 0.75], aggr: 0.55, hidden: 0.12, hide: 0.2, flee: 0.25, ambush: 0.15, armor: 0.05, react: 1.1, acc: 0.85,
    weapons: [['g18', 1], ['m1911', 2], ['makarov', 2], ['tec9', 2], ['uzi', 1], ['sawedoff', 1], ['mac10', 1]] },
  addict: { name: '薬物中毒者', desc: '覚醒剤で興奮している。動きが読めず、ナイフ代わりに何でも振り回す。痛みに鈍い。', morale: [0.15, 0.9], aggr: 0.65, hidden: 0.2, hide: 0.25, flee: 0.15, ambush: 0.1, armor: 0, react: 1.25, acc: 0.65,
    weapons: [['makarov', 2], ['m1911', 1], ['sawedoff', 2], ['tec9', 1], ['none', 1]] },
  robber: { name: '武装強盗', desc: '人質をとって立てこもる。散弾銃や小銃を持つことが多い。警察の動きに敏感。', morale: [0.45, 0.85], aggr: 0.6, hidden: 0.1, hide: 0.15, flee: 0.1, ambush: 0.25, armor: 0.25, react: 1.0, acc: 0.95,
    weapons: [['akm', 2], ['m590', 2], ['aks74u', 2], ['g18', 1], ['m1911', 1]] },
  pro: { name: '武装組織', desc: '訓練を受けた構成員。防弾ベストと小銃で武装し、角で待ち伏せる。めったに投降しない。', morale: [0.65, 0.95], aggr: 0.8, hidden: 0.05, hide: 0.05, flee: 0.03, ambush: 0.45, armor: 0.85, react: 0.85, acc: 1.15,
    weapons: [['akm', 2], ['g3', 1], ['p90', 2], ['aks74u', 1], ['m590', 1]] },
  shooter: { name: '乱射犯', desc: '人を無差別に撃つ。市民を探して歩き回る。警察を見ると撃ち合う。', morale: [0.8, 1.0], aggr: 0.95, hidden: 0, hide: 0, flee: 0.05, ambush: 0.2, armor: 0.3, react: 0.9, acc: 1.0, active: true,
    weapons: [['akm', 2], ['g3', 1], ['m590', 1], ['aks74u', 1]] },
  taker: { name: '人質犯', desc: '人質のそばを離れない。警察に気づくと人質を殺そうとする。', morale: [0.5, 0.9], aggr: 0.7, hidden: 0.05, hide: 0, flee: 0, ambush: 0.3, armor: 0.3, react: 0.95, acc: 1.0, guard: true,
    weapons: [['akm', 1], ['m1911', 2], ['g18', 1], ['m590', 1], ['aks74u', 1]] },
  bomber: { name: '爆弾犯', desc: '爆弾を仕掛けた一味。爆弾の部屋を守る。', morale: [0.55, 0.9], aggr: 0.75, hidden: 0.08, hide: 0.05, flee: 0.05, ambush: 0.35, armor: 0.4, react: 0.95, acc: 1.0,
    weapons: [['akm', 2], ['p90', 1], ['m590', 1], ['mac10', 1], ['m1911', 1]] },
  train: { name: '訓練の役者', desc: '訓練用の役者。撃ってくるのは訓練弾（ダメージなし）。', morale: [0.2, 0.7], aggr: 0.4, hidden: 0.15, hide: 0.1, flee: 0.1, ambush: 0.1, armor: 0, react: 1.3, acc: 0.6, training: true,
    weapons: [['m1911', 1], ['g18', 1], ['m590', 1]] },
};
export const CIVILIANS = {
  adult: { name: '市民', desc: 'その場に居合わせた人。たいてい呼びかけに従うが、パニックで逃げたり隠れたりする。', comply: 0.75, stubborn: 0.12, flee: 0.35, hide: 0.35 },
  staff: { name: '従業員', desc: '店や建物の従業員。中のことに詳しく、隠れていることが多い。', comply: 0.8, stubborn: 0.08, flee: 0.25, hide: 0.5 },
  elder: { name: 'お年寄り', desc: '動きがゆっくり。耳が遠く、何度か呼びかけないと従わないことがある。', comply: 0.6, stubborn: 0.25, flee: 0.1, hide: 0.3, slow: true },
  hostage: { name: '人質', desc: '縛られていたり、銃を向けられていたりする。助けを待っている。', comply: 0.95, stubborn: 0.02, flee: 0.0, hide: 0.0, bound: true },
  angry: { name: '反抗的な市民', desc: '警察に協力しない。手を上げずに文句を言う。ペッパースプレーやテーザーが必要なことも。', comply: 0.3, stubborn: 0.6, flee: 0.2, hide: 0.1 },
};
// AI隊員の名前（架空）。赤（RED）2人・青（BLUE）2人
export const OFFICERS = [
  { name: 'ミラー', en: 'MILLER', team: 'red', role: '先頭' },
  { name: 'オカダ', en: 'OKADA', team: 'red', role: 'ブリーチャー' },
  { name: 'レイエス', en: 'REYES', team: 'blue', role: '援護' },
  { name: 'ハンセン', en: 'HANSEN', team: 'blue', role: '後衛' },
];
// 既定の装備
export const LOADOUTS = {
  player: { primary: { id: 'mk18', sight: 'holo', grip: 'vert', ammo: 'ap' }, secondary: { id: 'g17', ammo: 'jhp' }, long: 'none', gear: [['flash', 2], ['stinger', 1], ['wedge', 2]], vest: 'heavy', plate: 'ceramic', helmet: 'helmet', head: 'none' },
  red1: { primary: { id: 'mk18', sight: 'holo', grip: 'vert', ammo: 'ap' }, secondary: { id: 'g17' }, long: 'none', gear: [['flash', 2], ['stinger', 1], ['wedge', 2]], vest: 'heavy', plate: 'ceramic', helmet: 'helmet', head: 'none' },
  red2: { primary: { id: 'm4super', sight: 'reddot', ammo: 'buck' }, secondary: { id: 'g17' }, long: 'ram', gear: [['flash', 2], ['c2', 2], ['wedge', 1]], vest: 'heavy', plate: 'ceramic', helmet: 'helmet', head: 'none' },
  blue1: { primary: { id: 'hk416', sight: 'reddot', grip: 'angled', ammo: 'ap' }, secondary: { id: 'g17' }, long: 'breacher', gear: [['flash', 2], ['cs', 1], ['wedge', 2]], vest: 'heavy', plate: 'ceramic', helmet: 'helmet', head: 'gasmask' },
  blue2: { primary: { id: 'mp5', sight: 'holo', ammo: 'jhp' }, secondary: { id: 'taser' }, long: 'none', gear: [['flash', 2], ['stinger', 2], ['lockgun', 1]], vest: 'light', plate: 'ceramic', helmet: 'helmet', head: 'none' },
};
// PvP の既定の装備（陣営ごと）
export const PVP_LOADOUTS = {
  swat: { primary: { id: 'mk18', sight: 'holo', grip: 'vert', ammo: 'ap' }, secondary: { id: 'g17' }, gear: [['flash', 2], ['c2', 1], ['bandage', 1]], armor: 'medium' },
  sus: { primary: { id: 'akm', sight: 'iron', ammo: 'ap' }, secondary: { id: 'm1911' }, gear: [['claymore', 1], ['stinger', 1], ['bandage', 1]], armor: 'medium' },
};
export const PVP_ALLOWED = {
  swat: { primary: ['mk18', 'hk416', 'g36c', 'scarl', 'sa58', 'mp5', 'mp5sd', 'ump45', 'mpx', 'mp7', 'm4super', 'r870'], secondary: ['g17', 'm45a1', 'usp', 'fiveseven', 'python'], gear: ['flash', 'stinger', 'cs', 'c2', 'frame', 'bandage', 'wedge'] },
  sus: { primary: ['akm', 'aks74u', 'g3', 'uzi', 'mac10', 'p90', 'm590', 'sawedoff', 'tec9'], secondary: ['m1911', 'makarov', 'g18', 'fiveseven', 'python'], gear: ['claymore', 'stinger', 'cs', 'bandage', 'wedge', 'flash'] },
};
