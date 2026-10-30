// 作戦の種類と難しさ（資料室の手順書と資料もここから作る）
export const MISSIONS = {
  barricade: {
    name: 'バリケード', en: 'BARRICADED SUSPECTS',
    desc: '武装した容疑者が建物に立てこもっている。中には巻き込まれた市民もいる。容疑者を逮捕または無力化し、市民を全員救出する。',
    sus: [4, 6], civ: [3, 5], prof: ['thug', 'thug', 'robber', 'addict'], evidence: [2, 4], lockChance: 0.3, trapChance: 0.05,
  },
  hostage: {
    name: '人質救出', en: 'HOSTAGE RESCUE',
    desc: '人質犯が人質をとっている。警察に気づかれると、しばらくして人質を殺し始める。静かに、すばやく近づくこと。',
    sus: [3, 5], civ: [1, 2], hostages: [2, 3], prof: ['robber', 'taker', 'thug'], evidence: [1, 3], lockChance: 0.35, trapChance: 0.08,
  },
  bomb: {
    name: '爆弾脅迫', en: 'BOMB THREAT',
    desc: '建物のどこかに爆弾が仕掛けられた。制限時間までにすべて見つけて解除する。爆弾犯が見張っている。',
    sus: [3, 5], civ: [2, 4], bombs: [2, 3], time: 600, prof: ['bomber', 'thug', 'robber'], evidence: [1, 3], lockChance: 0.3, trapChance: 0.12,
  },
  raid: {
    name: '強制捜査（レイド）', en: 'RAID',
    desc: '捜索令状にもとづく強制捜査。中にいるのは訓練を受けた武装組織。市民はほとんどいない。証拠をすべて確保する。',
    sus: [6, 9], civ: [0, 2], prof: ['pro', 'pro', 'robber'], evidence: [4, 7], lockChance: 0.45, trapChance: 0.15, evKinds: ['drugs', 'cash', 'docs', 'drive', 'guns'],
  },
  active: {
    name: 'アクティブシューター', en: 'ACTIVE SHOOTER',
    desc: '乱射犯が建物の中で市民を撃っている。一刻を争う。犯人を見つけ次第、止める。時間がたつほど犠牲が増える。',
    sus: [2, 3], civ: [6, 9], prof: ['shooter'], evidence: [1, 2], lockChance: 0.1, trapChance: 0.0, civProf: ['adult', 'adult', 'staff', 'elder'],
  },
};
export const MISSION_LIST = ['barricade', 'hostage', 'bomb', 'raid', 'active'];
// 難しさ: cap = 容疑者 → プレイヤーの1発の上限（RoN 70/80 を 100HP に換算）
export const DIFFS = {
  normal: { name: 'ふつう', cap: 44, susMul: 1.0, exec: 12, trapMul: 1, desc: '容疑者の1発のダメージに上限（44）。反応はゆっくりめ。' },
  hard: { name: 'むずかしい', cap: 50, susMul: 1.15, exec: 9, trapMul: 1.5, desc: '上限50。容疑者が多く、反応が速い。人質を撃つまでが早い。' },
  hardcore: { name: 'ハードコア', cap: 999, susMul: 1.3, exec: 7, trapMul: 2, desc: '上限なし。1発で倒れることもある。HUDは最小限。' },
};
export const EVIDENCE = {
  drugs: { name: '麻薬の包み' }, phone: { name: '携帯電話' }, docs: { name: '書類' }, cash: { name: '現金の束' }, drive: { name: 'ハードディスク' }, guns: { name: '銃のケース' },
};
