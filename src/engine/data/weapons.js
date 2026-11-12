// 銃のデータ（実銃の諸元＋ゲームの扱い）。資料室はここから作る。
// rpm: 発射速度（毎分）、vel: 銃口の弾の速さ m/s、kg: 重さ、mag: 装弾数、spare: 予備の弾倉の数
// ads/draw: 構える・持ち替えの時間（秒）、move: 移動の速さの倍率
// rc: 反動（度）{ v: 縦, h: 横のばらつき, bias: 横の癖（+で右）, first: 初弾の跳ねの倍率, ctrl: 戻る速さ（度/秒）, kick: 見た目の跳ね }
// sp: 散らばり（度）{ hip, ads, move: 全速で足される分 }
// rl: リロード（秒）{ tac: 弾倉を残す, fast: 捨てる, empty: 空のときに足す, shell: 散弾1発, start: 込め始め }
// pvp: { dmg, fall: [減衰が始まる距離, 終わる距離, 最低の倍率], pellets }
// 見た目: model（形の種類）
export const CAL = {
  '556': { name: '5.56x45mm NATO' }, '545': { name: '5.45x39mm' }, '762x39': { name: '7.62x39mm' }, '762x51': { name: '7.62x51mm NATO' },
  '9mm': { name: '9x19mm' }, '9x18': { name: '9x18mm マカロフ' }, '45': { name: '.45 ACP' }, '357': { name: '.357 マグナム' }, '46': { name: '4.6x30mm' }, '57': { name: '5.7x28mm' },
  '12g': { name: '12番ゲージ' }, 'bean': { name: '12番 ビーンバッグ' }, 'pepper': { name: '.68口径 ペッパーボール' }, 'taser': { name: 'テーザーのカートリッジ' },
  '50ae': { name: '.50 AE' }, '32': { name: '.32 ACP' },
};

// 弾（PvE）。dmg は胴への1発（RoN の値×0.625）。limb: 手足の倍率、pen: 貫通力、apen: 防具の貫通（防護の段階）
export const AMMO = {
  '556': { ap: { dmg: 76.6, limb: 0.3, head: 6, pen: 700, apen: 4 }, jhp: { dmg: 82.8, limb: 0.7, head: 6, pen: 175, apen: 2 } },
  '545': { ap: { dmg: 75.0, limb: 0.3, head: 6, pen: 650, apen: 4 }, jhp: { dmg: 81.0, limb: 0.7, head: 6, pen: 170, apen: 2 } },
  '762x39': { ap: { dmg: 84.4, limb: 0.32, head: 6, pen: 650, apen: 4 }, jhp: { dmg: 90.6, limb: 0.72, head: 6, pen: 300, apen: 2 } },
  '762x51': { ap: { dmg: 100, limb: 0.35, head: 6, pen: 1250, apen: 5 }, jhp: { dmg: 112.5, limb: 0.75, head: 6, pen: 600, apen: 3 } },
  '9mm': { ap: { dmg: 43.75, limb: 0.3, head: 6, pen: 250, apen: 2 }, jhp: { dmg: 50, limb: 0.7, head: 6, pen: 100, apen: 0 } },
  '9x18': { ap: { dmg: 40, limb: 0.3, head: 6, pen: 200, apen: 1 }, jhp: { dmg: 46, limb: 0.7, head: 6, pen: 90, apen: 0 } },
  '45': { ap: { dmg: 56.25, limb: 0.3, head: 6, pen: 300, apen: 2 }, jhp: { dmg: 62.5, limb: 0.7, head: 6, pen: 110, apen: 0 } },
  '357': { ap: { dmg: 100, limb: 0.35, head: 6, pen: 400, apen: 3 }, jhp: { dmg: 109.4, limb: 0.75, head: 6, pen: 150, apen: 1 } },
  '46': { ap: { dmg: 43.75, limb: 0.3, head: 6, pen: 350, apen: 4 }, jhp: { dmg: 48, limb: 0.7, head: 6, pen: 140, apen: 1 } },
  '57': { ap: { dmg: 43.75, limb: 0.3, head: 6, pen: 250, apen: 3 }, jhp: { dmg: 48, limb: 0.7, head: 6, pen: 120, apen: 1 } },
  '12g': { buck: { dmg: 25, limb: 0.6, head: 3, pen: 150, apen: 1, pellets: 8, spread: 3.2 }, slug: { dmg: 156, limb: 0.6, head: 4, pen: 750, apen: 3 } },
  'saw': { buck: { dmg: 18.75, limb: 0.6, head: 3, pen: 68, apen: 0, pellets: 8, spread: 5.5 } },
  '50ae': { ap: { dmg: 112, limb: 0.4, head: 6, pen: 520, apen: 3 }, jhp: { dmg: 125, limb: 0.8, head: 6, pen: 200, apen: 1 } },
  '32': { ap: { dmg: 33, limb: 0.3, head: 6, pen: 160, apen: 1 }, jhp: { dmg: 38, limb: 0.7, head: 6, pen: 70, apen: 0 } },
  'bean': { bean: { dmg: 6, limb: 1, head: 4, pen: 0, apen: 0, less: { stun: 1.6, morale: 0.42 } } },
  'pepper': { pepper: { dmg: 1, limb: 1, head: 1, pen: 0, apen: 0, less: { stun: 0.35, morale: 0.12, gas: 1 } } },
  'taser': { taser: { dmg: 0, limb: 1, head: 1, pen: 0, apen: 0, less: { tase: 4.5, morale: 1 } } },
};

const W = (o) => o;
export const WEAPONS = {
  // ---------- SWAT: 小銃 ----------
  mk18: W({ name: 'Mk18 Mod 0', cat: 'rifle', side: 'swat', cal: '556', ammo: ['ap', 'jhp'], mag: 30, spare: 6, chamber: true, modes: ['auto', 'semi'], rpm: 850, vel: 790, kg: 2.9, len: 0.76,
    ads: 0.28, draw: 0.55, move: 0.95, rc: { v: 0.78, h: 0.42, bias: 0.08, first: 1.5, ctrl: 9, kick: 1 }, sp: { hip: 2.4, ads: 0.1, move: 1.8 }, rl: { tac: 2.5, fast: 1.9, empty: 0.45 },
    pvp: { dmg: 39, fall: [22, 38, 0.7] }, model: 'ar15', mdl: { barrel: 0.26, rail: 'long', stock: 'crane' }, snd: 'r556',
    desc: 'M4A1を短銃身（10.3インチ）にしたカービン。米軍特殊部隊や多くのSWATが使う。軽くて扱いやすく、5.56mmで防弾ベストにも強い。' }),
  hk416: W({ name: 'HK416A5', cat: 'rifle', side: 'swat', cal: '556', ammo: ['ap', 'jhp'], mag: 30, spare: 6, chamber: true, modes: ['auto', 'semi'], rpm: 850, vel: 800, kg: 3.3, len: 0.8,
    ads: 0.3, draw: 0.6, move: 0.94, rc: { v: 0.72, h: 0.38, bias: -0.05, first: 1.4, ctrl: 10, kick: 1 }, sp: { hip: 2.4, ads: 0.09, move: 1.8 }, rl: { tac: 2.6, fast: 2.0, empty: 0.45 },
    pvp: { dmg: 41, fall: [22, 38, 0.7] }, model: 'ar15', mdl: { barrel: 0.28, rail: 'hk', stock: 'hk' }, snd: 'r556',
    desc: 'ヘッケラー&コッホのショートストロークピストン式。AR-15と同じ操作で、汚れに強く反動が素直。' }),
  g36c: W({ name: 'G36C', cat: 'rifle', side: 'swat', cal: '556', ammo: ['ap', 'jhp'], mag: 30, spare: 6, chamber: true, modes: ['auto', 'semi'], rpm: 750, vel: 725, kg: 2.8, len: 0.72,
    ads: 0.27, draw: 0.5, move: 0.96, rc: { v: 0.7, h: 0.48, bias: 0.12, first: 1.6, ctrl: 9, kick: 1 }, sp: { hip: 2.3, ads: 0.12, move: 1.7 }, rl: { tac: 2.7, fast: 2.1, empty: 0.5 },
    pvp: { dmg: 37, fall: [20, 35, 0.68] }, model: 'g36', mdl: {}, snd: 'r556',
    desc: 'G36の最も短いモデル（9インチ）。樹脂の機関部で軽い。発射速度がおだやかで制御しやすい。' }),
  scarl: W({ name: 'Mk16 SCAR-L CQC', cat: 'rifle', side: 'swat', cal: '556', ammo: ['ap', 'jhp'], mag: 30, spare: 6, chamber: true, modes: ['auto', 'semi'], rpm: 625, vel: 790, kg: 3.3, len: 0.8,
    ads: 0.31, draw: 0.6, move: 0.94, rc: { v: 0.82, h: 0.36, bias: 0.03, first: 1.35, ctrl: 10, kick: 1 }, sp: { hip: 2.4, ads: 0.09, move: 1.8 }, rl: { tac: 2.6, fast: 2.0, empty: 0.4 },
    pvp: { dmg: 44, fall: [24, 40, 0.72] }, model: 'scar', mdl: {}, snd: 'r556',
    desc: 'FN製。米特殊作戦軍のために作られた小銃の短銃身型。発射速度は遅めで1発が重い。' }),
  sa58: W({ name: 'SA58 OSW', cat: 'rifle', side: 'swat', cal: '762x51', ammo: ['ap', 'jhp'], mag: 20, spare: 6, chamber: true, modes: ['auto', 'semi'], rpm: 650, vel: 740, kg: 3.9, len: 0.83,
    ads: 0.36, draw: 0.7, move: 0.91, rc: { v: 1.35, h: 0.6, bias: 0.15, first: 1.3, ctrl: 8, kick: 1.35 }, sp: { hip: 2.8, ads: 0.1, move: 2.0 }, rl: { tac: 2.8, fast: 2.2, empty: 0.5 },
    pvp: { dmg: 52, fall: [28, 45, 0.75] }, model: 'fal', mdl: {}, snd: 'r762',
    desc: 'FN FALの流れをくむ7.62mm NATOの短い小銃（11インチ）。壁も防具も抜く威力。反動は大きい。' }),
  m4a1: W({ name: 'M4A1', cat: 'rifle', side: 'swat', cal: '556', ammo: ['ap', 'jhp'], mag: 30, spare: 6, chamber: true, modes: ['auto', 'semi'], rpm: 800, vel: 880, kg: 3.1, len: 0.84, drum: 60,
    ads: 0.31, draw: 0.58, move: 0.945, rc: { v: 0.74, h: 0.4, bias: 0.06, first: 1.45, ctrl: 9.5, kick: 1 }, sp: { hip: 2.5, ads: 0.08, move: 1.85 }, rl: { tac: 2.5, fast: 1.9, empty: 0.45 },
    pvp: { dmg: 41, fall: [25, 42, 0.72] }, model: 'ar15', mdl: { barrel: 0.37, rail: 'long', stock: 'crane' }, snd: 'r556',
    desc: '米軍の標準のカービン（14.5インチ）。Mk18より銃身が長く、弾が速いぶん遠くまで威力が落ちにくい。少し長く、構えるのは遅め。' }),
  mcx: W({ name: 'MCX VIRTUS SBR', cat: 'rifle', side: 'swat', cal: '556', ammo: ['ap', 'jhp'], mag: 30, spare: 6, chamber: true, modes: ['auto', 'semi'], rpm: 850, vel: 760, kg: 2.9, len: 0.72, fold: true,
    ads: 0.27, draw: 0.5, move: 0.955, rc: { v: 0.76, h: 0.44, bias: 0.05, first: 1.5, ctrl: 9.5, kick: 1 }, sp: { hip: 2.3, ads: 0.1, move: 1.75 }, rl: { tac: 2.4, fast: 1.85, empty: 0.4 },
    pvp: { dmg: 38, fall: [20, 36, 0.68] }, model: 'ar15', mdl: { barrel: 0.24, rail: 'mcx', stock: 'mcx' }, snd: 'r556',
    desc: 'シグ・ザウエルのピストン式。銃床を折りたためて、室内で取り回しやすい。軽くて構えが速い。' }),
  aug: W({ name: 'AUG A3', cat: 'rifle', side: 'swat', cal: '556', ammo: ['ap', 'jhp'], mag: 30, spare: 6, chamber: true, modes: ['auto', 'semi'], rpm: 680, vel: 940, kg: 3.6, len: 0.79,
    ads: 0.31, draw: 0.6, move: 0.945, rc: { v: 0.66, h: 0.34, bias: 0.02, first: 1.4, ctrl: 10, kick: 0.95 }, sp: { hip: 2.4, ads: 0.08, move: 1.8 }, rl: { tac: 2.8, fast: 2.2, empty: 0.5 },
    pvp: { dmg: 40, fall: [26, 44, 0.72] }, model: 'aug', mdl: {}, snd: 'r556',
    desc: 'オーストリアのブルパップ（弾倉が握りより後ろ）。全長が短いのに銃身は長い。反動は素直だが、弾倉を替えるのに手間がかかる。' }),
  tavor: W({ name: 'Tavor X95', cat: 'rifle', side: 'swat', cal: '556', ammo: ['ap', 'jhp'], mag: 30, spare: 6, chamber: true, modes: ['auto', 'semi'], rpm: 850, vel: 820, kg: 3.2, len: 0.69,
    ads: 0.29, draw: 0.55, move: 0.95, rc: { v: 0.72, h: 0.42, bias: -0.04, first: 1.45, ctrl: 9.5, kick: 1 }, sp: { hip: 2.3, ads: 0.09, move: 1.75 }, rl: { tac: 2.7, fast: 2.1, empty: 0.5 },
    pvp: { dmg: 39, fall: [22, 40, 0.7] }, model: 'tavor', mdl: {}, snd: 'r556',
    desc: 'イスラエルのブルパップ。短く扱いやすく、発射速度が速い。室内の戦いに向く。' }),
  scarh: W({ name: 'Mk17 SCAR-H CQC', cat: 'rifle', side: 'swat', cal: '762x51', ammo: ['ap', 'jhp'], mag: 20, spare: 6, chamber: true, modes: ['auto', 'semi'], rpm: 600, vel: 760, kg: 3.6, len: 0.84,
    ads: 0.34, draw: 0.66, move: 0.92, rc: { v: 1.25, h: 0.55, bias: 0.1, first: 1.3, ctrl: 8.5, kick: 1.3 }, sp: { hip: 2.7, ads: 0.08, move: 2.0 }, rl: { tac: 2.7, fast: 2.1, empty: 0.45 },
    pvp: { dmg: 54, fall: [28, 46, 0.76] }, model: 'scar', mdl: { heavy: true }, snd: 'r762',
    desc: 'SCARの7.62mm NATO型。1発が重く、壁の向こうの相手にも届く。反動は大きく、弾倉は20発。' }),
  hk417: W({ name: 'HK417 16"', cat: 'rifle', side: 'swat', cal: '762x51', ammo: ['ap', 'jhp'], mag: 20, spare: 5, chamber: true, modes: ['semi', 'auto'], rpm: 600, vel: 780, kg: 4.4, len: 0.97,
    ads: 0.38, draw: 0.75, move: 0.9, rc: { v: 1.4, h: 0.5, bias: 0.08, first: 1.2, ctrl: 8, kick: 1.4 }, sp: { hip: 3.0, ads: 0.05, move: 2.2 }, rl: { tac: 2.9, fast: 2.3, empty: 0.5 },
    pvp: { dmg: 62, fall: [35, 55, 0.82] }, model: 'ar15', mdl: { barrel: 0.42, rail: 'hk', stock: 'hk', mag762: true }, snd: 'r762',
    desc: 'HK416を7.62mm NATOにした選抜射手の小銃。遠くまでとてもよく当たる。重く長いので、室内では振り回しにくい。' }),
  // ---------- SWAT: 狙撃銃（11-12 追加。ボルトアクション: 1発ごとに手でボルトを引いて次の弾を込める） ----------
  // bolt: ボルトを操作する時間（秒）。この間は撃てない（ポンプと同じ扱い。見た目と音はボルト）。sway: 構えたときの照準の揺れ（度。立ち）
  // tdmBoth: 攻守のモード（爆弾・殲滅戦）では SWAT 側だけの銃。両チームが同じ条件で戦う TDM では、両方のチームが使える（11-12 17:50 の要望）
  at308: W({ name: 'AT308', cat: 'sniper', side: 'swat', tdmBoth: true, cal: '762x51', ammo: ['ap', 'jhp'], mag: 10, spare: 4, chamber: true, bolt: true, pump: 0.95, modes: ['semi'], rpm: 60, vel: 850, kg: 6.4, len: 1.13,
    ads: 0.5, draw: 0.85, move: 0.88, sway: 0.2, rc: { v: 3.0, h: 0.45, bias: 0.05, first: 1, ctrl: 7, kick: 2.2 }, sp: { hip: 6.0, ads: 0.012, move: 3.0 }, rl: { tac: 3.1, fast: 2.5, empty: 0.6 },
    pvp: { dmg: 115, fall: [70, 110, 0.9] }, model: 'bolt', mdl: {}, snd: 'r308',
    desc: '英国アキュラシー・インターナショナル社の警察向けのボルトアクション狙撃銃（7.62mm NATO・10発の箱弾倉）。1発ごとに手でボルトを引く（約1秒）。狙撃用スコープは4倍と8倍を切り替えられる（射撃モードのボタン）。構えると照準がわずかに揺れる（しゃがむ・伏せると小さい）。腰だめはまず当たらない。' }),
  // ---------- SWAT: 短機関銃 ----------
  mp5: W({ name: 'MP5A4', cat: 'smg', side: 'swat', cal: '9mm', ammo: ['ap', 'jhp'], mag: 30, spare: 6, chamber: true, modes: ['auto', 'semi'], rpm: 800, vel: 400, kg: 2.5, len: 0.68,
    ads: 0.23, draw: 0.45, move: 0.98, rc: { v: 0.42, h: 0.3, bias: 0.04, first: 1.3, ctrl: 12, kick: 0.75 }, sp: { hip: 2.0, ads: 0.14, move: 1.5 }, rl: { tac: 2.6, fast: 2.2, empty: 0.55 },
    pvp: { dmg: 27, fall: [14, 26, 0.6] }, model: 'mp5', mdl: { sd: false }, snd: 'p9',
    desc: 'ヘッケラー&コッホのローラー遅延式。対テロ部隊の象徴的な短機関銃。閉鎖ボルトで命中精度が高い。' }),
  mp5sd: W({ name: 'MP5SD6', cat: 'smg', side: 'swat', cal: '9mm', ammo: ['ap', 'jhp'], mag: 30, spare: 6, chamber: true, modes: ['auto', 'semi'], rpm: 700, vel: 285, kg: 3.0, len: 0.78,
    ads: 0.25, draw: 0.5, move: 0.97, rc: { v: 0.36, h: 0.26, bias: 0.02, first: 1.2, ctrl: 12, kick: 0.65 }, sp: { hip: 2.1, ads: 0.15, move: 1.5 }, rl: { tac: 2.6, fast: 2.2, empty: 0.55 },
    pvp: { dmg: 25, fall: [12, 24, 0.6] }, model: 'mp5', mdl: { sd: true }, snd: 'sup9', integral: 'supp',
    desc: '消音器が一体になったMP5。銃声が小さく、気づかれずに近づく作戦に向く。弾が遅く、威力はやや落ちる。' }),
  ump45: W({ name: 'UMP45', cat: 'smg', side: 'swat', cal: '45', ammo: ['ap', 'jhp'], mag: 25, spare: 6, chamber: false, modes: ['auto', 'semi'], rpm: 600, vel: 285, kg: 2.3, len: 0.69,
    ads: 0.24, draw: 0.45, move: 0.98, rc: { v: 0.55, h: 0.34, bias: -0.06, first: 1.35, ctrl: 11, kick: 0.85 }, sp: { hip: 2.2, ads: 0.16, move: 1.5 }, rl: { tac: 2.5, fast: 2.0, empty: 0.5 },
    pvp: { dmg: 38, fall: [14, 26, 0.6] }, model: 'ump', mdl: {}, snd: 'p45',
    desc: 'MP5の後継として作られた樹脂製の短機関銃。.45ACPの重い弾で、発射速度は遅い。' }),
  mpx: W({ name: 'MPX', cat: 'smg', side: 'swat', cal: '9mm', ammo: ['ap', 'jhp'], mag: 30, spare: 6, chamber: true, modes: ['auto', 'semi'], rpm: 850, vel: 400, kg: 2.7, len: 0.67,
    ads: 0.24, draw: 0.45, move: 0.97, rc: { v: 0.44, h: 0.32, bias: 0.05, first: 1.3, ctrl: 12, kick: 0.75 }, sp: { hip: 2.0, ads: 0.13, move: 1.5 }, rl: { tac: 2.3, fast: 1.8, empty: 0.4 },
    pvp: { dmg: 29, fall: [14, 26, 0.6] }, model: 'mpx', mdl: {}, snd: 'p9',
    desc: 'シグ・ザウエルのガスピストン式。AR-15に近い操作で、9mmとしては反動が軽く速い。' }),
  mp7: W({ name: 'MP7A1', cat: 'smg', side: 'swat', cal: '46', ammo: ['ap', 'jhp'], mag: 30, spare: 6, chamber: true, modes: ['auto', 'semi'], rpm: 950, vel: 720, kg: 1.9, len: 0.64,
    ads: 0.21, draw: 0.4, move: 0.99, rc: { v: 0.4, h: 0.36, bias: 0.06, first: 1.35, ctrl: 13, kick: 0.7 }, sp: { hip: 2.1, ads: 0.15, move: 1.4 }, rl: { tac: 2.2, fast: 1.7, empty: 0.4 },
    pvp: { dmg: 31, fall: [16, 28, 0.62] }, model: 'mp7', mdl: {}, snd: 'p46',
    desc: '4.6mmの小さく速い弾で、短機関銃なのに防弾ベストを抜く。とても軽く、発射速度が速い。' }),
  vector: W({ name: 'Vector SMG', cat: 'smg', side: 'swat', cal: '45', ammo: ['ap', 'jhp'], mag: 25, spare: 6, chamber: true, modes: ['auto', 'semi'], rpm: 1100, vel: 290, kg: 2.7, len: 0.62, fold: true,
    ads: 0.24, draw: 0.45, move: 0.975, rc: { v: 0.34, h: 0.3, bias: 0.02, first: 1.2, ctrl: 13, kick: 0.6 }, sp: { hip: 2.1, ads: 0.15, move: 1.5 }, rl: { tac: 2.4, fast: 1.9, empty: 0.5 },
    pvp: { dmg: 30, fall: [12, 24, 0.58] }, model: 'vector', mdl: {}, snd: 'p45',
    desc: 'KRISSの短機関銃。ボルトを下へ逃がす独特の仕組みで、.45ACPなのに縦の反動がとても小さい。毎分1100発で弾はすぐ尽きる。' }),
  mp5k: W({ name: 'MP5K-PDW', cat: 'smg', side: 'swat', cal: '9mm', ammo: ['ap', 'jhp'], mag: 30, spare: 6, chamber: true, modes: ['auto', 'semi'], rpm: 900, vel: 375, kg: 2.2, len: 0.6, fold: true,
    ads: 0.21, draw: 0.38, move: 0.99, rc: { v: 0.5, h: 0.38, bias: 0.05, first: 1.35, ctrl: 12, kick: 0.8 }, sp: { hip: 2.0, ads: 0.17, move: 1.4 }, rl: { tac: 2.5, fast: 2.1, empty: 0.55 },
    pvp: { dmg: 26, fall: [12, 22, 0.58] }, model: 'mp5', mdl: { k: true }, snd: 'p9',
    desc: 'MP5を極端に短くした型に折りたたみの銃床をつけたもの。とても軽く速いが、反動は暴れる。' }),
  mp9: W({ name: 'MP9', cat: 'smg', side: 'swat', cal: '9mm', ammo: ['ap', 'jhp'], mag: 30, spare: 6, chamber: true, modes: ['auto', 'semi'], rpm: 950, vel: 390, kg: 1.4, len: 0.52, fold: true,
    ads: 0.2, draw: 0.36, move: 0.99, rc: { v: 0.52, h: 0.42, bias: 0.06, first: 1.35, ctrl: 12, kick: 0.75 }, sp: { hip: 2.0, ads: 0.17, move: 1.4 }, rl: { tac: 2.2, fast: 1.7, empty: 0.4 },
    pvp: { dmg: 26, fall: [12, 22, 0.58] }, model: 'mp9', mdl: {}, snd: 'p9',
    desc: 'スイスのB&T製。拳銃ほどの大きさの短機関銃。前の握りと折りたたみの銃床で、狭い所で振り回しやすい。' }),
  evo3: W({ name: 'Scorpion EVO 3', cat: 'smg', side: 'swat', cal: '9mm', ammo: ['ap', 'jhp'], mag: 30, spare: 6, chamber: true, modes: ['auto', 'semi'], rpm: 1150, vel: 370, kg: 2.8, len: 0.67, fold: true,
    ads: 0.23, draw: 0.42, move: 0.98, rc: { v: 0.46, h: 0.4, bias: 0.08, first: 1.3, ctrl: 12, kick: 0.75 }, sp: { hip: 2.1, ads: 0.15, move: 1.5 }, rl: { tac: 2.4, fast: 1.9, empty: 0.45 },
    pvp: { dmg: 25, fall: [14, 26, 0.6] }, model: 'evo', mdl: {}, snd: 'p9',
    desc: 'チェコのCZ製。樹脂の機関部で軽く、とても速く撃てる。近い距離の制圧に強い。' }),
  // ---------- SWAT: 散弾銃・非致死 ----------
  m4super: W({ name: 'Benelli M4', cat: 'shotgun', side: 'swat', cal: '12g', ammo: ['buck', 'slug'], mag: 7, spare: 24, chamber: true, tube: true, modes: ['semi'], rpm: 300, vel: 400, kg: 3.8, len: 0.89,
    ads: 0.32, draw: 0.6, move: 0.93, rc: { v: 3.2, h: 0.9, bias: 0.1, first: 1, ctrl: 9, kick: 2.2 }, sp: { hip: 3.0, ads: 0.6, move: 1.0 }, rl: { tac: 0, fast: 0, empty: 0.4, shell: 0.45, start: 0.35 },
    pvp: { dmg: 17, pellets: 8, fall: [6, 14, 0.3] }, model: 'm4super', mdl: {}, snd: 'sg',
    desc: 'ガス圧作動の半自動散弾銃。米海兵隊の M1014。速く撃てるが、1発ずつ込める。' }),
  r870: W({ name: 'Remington 870 CQB', cat: 'shotgun', side: 'swat', cal: '12g', ammo: ['buck', 'slug'], mag: 6, spare: 24, chamber: true, tube: true, pump: 0.5, modes: ['semi'], rpm: 75, vel: 400, kg: 3.4, len: 0.8,
    ads: 0.3, draw: 0.55, move: 0.94, rc: { v: 3.6, h: 1.0, bias: 0.1, first: 1, ctrl: 8, kick: 2.4 }, sp: { hip: 3.0, ads: 0.6, move: 1.0 }, rl: { tac: 0, fast: 0, empty: 0.5, shell: 0.5, start: 0.35 },
    pvp: { dmg: 19, pellets: 8, fall: [6, 14, 0.3] }, model: 'r870', mdl: {}, snd: 'sg',
    desc: 'ポンプ式の散弾銃。1発ごとに前の握りを引いて送る。もっとも普及した警察の散弾銃。' }),
  ksg: W({ name: 'KSG', cat: 'shotgun', side: 'swat', cal: '12g', ammo: ['buck', 'slug'], mag: 14, spare: 24, chamber: true, tube: true, pump: 0.5, modes: ['semi'], rpm: 75, vel: 400, kg: 3.1, len: 0.66,
    ads: 0.3, draw: 0.55, move: 0.95, rc: { v: 3.6, h: 1.0, bias: 0.1, first: 1, ctrl: 8, kick: 2.4 }, sp: { hip: 3.0, ads: 0.6, move: 1.0 }, rl: { tac: 0, fast: 0, empty: 0.5, shell: 0.52, start: 0.35 },
    pvp: { dmg: 18, pellets: 8, fall: [6, 14, 0.3] }, model: 'ksg', mdl: {}, snd: 'sg',
    desc: 'ケルテックのブルパップのポンプ式。筒の弾倉が2本あり、14発入る。短く、廊下や部屋で振り回しやすい。' }),
  saiga: W({ name: 'Saiga-12K', cat: 'shotgun', side: 'both', cal: '12g', ammo: ['buck', 'slug'], mag: 8, spare: 5, chamber: true, modes: ['semi'], rpm: 300, vel: 400, kg: 3.6, len: 0.9, drum: 20,
    ads: 0.33, draw: 0.6, move: 0.93, rc: { v: 3.0, h: 0.9, bias: 0.12, first: 1, ctrl: 9, kick: 2.1 }, sp: { hip: 3.0, ads: 0.6, move: 1.0 }, rl: { tac: 2.8, fast: 2.2, empty: 0.6 },
    pvp: { dmg: 16, pellets: 8, fall: [6, 14, 0.3] }, model: 'ak', mdl: { saiga: true }, snd: 'sg',
    desc: 'AKの仕組みの半自動の散弾銃。箱の弾倉で替えるのが速く、続けて撃てる。' }),
  spas12: W({ name: 'SPAS-12', cat: 'shotgun', side: 'both', cal: '12g', ammo: ['buck', 'slug'], mag: 8, spare: 24, chamber: true, tube: true, pump: 0.5, modes: ['semi'], rpm: 75, vel: 400, kg: 4.4, len: 1.04,
    ads: 0.34, draw: 0.62, move: 0.92, rc: { v: 3.3, h: 0.9, bias: 0.1, first: 1, ctrl: 8.5, kick: 2.3 }, sp: { hip: 3.0, ads: 0.55, move: 1.0 }, rl: { tac: 0, fast: 0, empty: 0.5, shell: 0.5, start: 0.35 },
    pvp: { dmg: 19, pellets: 8, fall: [6, 15, 0.32] }, model: 'r870', mdl: { spas: true, black: true }, snd: 'sg',
    desc: 'イタリアのフランキ製。重くがっしりしたポンプ式で、銃身に穴の開いた放熱の覆い。8発。' }),
  bean: W({ name: '870 ビーンバッグ', cat: 'less', side: 'swat', cal: 'bean', ammo: ['bean'], mag: 6, spare: 18, chamber: true, tube: true, pump: 0.5, modes: ['semi'], rpm: 75, vel: 90, kg: 3.4, len: 0.8, less: true,
    ads: 0.3, draw: 0.55, move: 0.94, rc: { v: 2.4, h: 0.6, bias: 0, first: 1, ctrl: 8, kick: 1.8 }, sp: { hip: 2.6, ads: 0.4, move: 1.0 }, rl: { tac: 0, fast: 0, empty: 0.5, shell: 0.5, start: 0.35 },
    pvp: null, model: 'r870', mdl: { orange: true }, snd: 'bean',
    desc: '布の袋に詰めた鉛の粒を撃つ非致死の散弾銃（オレンジ色の部品）。相手を倒して投降させやすくする。至近距離の頭は命にかかわる。' }),
  pepperball: W({ name: 'PepperBall VKS', cat: 'less', side: 'swat', cal: 'pepper', ammo: ['pepper'], mag: 15, spare: 4, chamber: false, modes: ['semi', 'auto'], rpm: 600, vel: 110, kg: 2.2, len: 0.7, less: true,
    ads: 0.24, draw: 0.45, move: 0.97, rc: { v: 0.25, h: 0.25, bias: 0, first: 1, ctrl: 14, kick: 0.4 }, sp: { hip: 2.4, ads: 0.5, move: 1.4 }, rl: { tac: 2.2, fast: 1.8, empty: 0 },
    pvp: null, model: 'pepper', mdl: {}, snd: 'air',
    desc: '唐辛子の粉を詰めた玉を撃つ。当たった所に刺激の粉が散り、相手の抵抗を弱める。' }),
  // ---------- SWAT: 拳銃 ----------
  g17: W({ name: 'Glock 17', cat: 'pistol', side: 'swat', cal: '9mm', ammo: ['ap', 'jhp'], mag: 17, spare: 4, chamber: true, modes: ['semi'], rpm: 600, vel: 375, kg: 0.9, len: 0.2,
    ads: 0.17, draw: 0.3, move: 1.0, rc: { v: 2.0, h: 0.6, bias: 0.05, first: 1, ctrl: 22, kick: 1.4 }, sp: { hip: 2.2, ads: 0.25, move: 1.2 }, rl: { tac: 1.6, fast: 1.25, empty: 0.3 },
    pvp: { dmg: 44, fall: [12, 22, 0.6] }, model: 'glock', mdl: {}, snd: 'h9',
    desc: '樹脂のフレームの自動拳銃。世界中の警察で使われている。17発と装弾数が多い。' }),
  m45a1: W({ name: 'M45A1', cat: 'pistol', side: 'swat', cal: '45', ammo: ['ap', 'jhp'], mag: 7, spare: 5, chamber: true, modes: ['semi'], rpm: 480, vel: 250, kg: 1.1, len: 0.22,
    ads: 0.18, draw: 0.32, move: 1.0, rc: { v: 2.6, h: 0.65, bias: 0.05, first: 1, ctrl: 20, kick: 1.7 }, sp: { hip: 2.3, ads: 0.24, move: 1.2 }, rl: { tac: 1.7, fast: 1.3, empty: 0.3 },
    pvp: { dmg: 58, fall: [12, 22, 0.6] }, model: 'm1911', mdl: { rail: true, tan: true }, snd: 'h45',
    desc: 'コルトM1911を現代化した海兵隊の拳銃。.45ACPで1発が重いが、7発と少ない。' }),
  usp: W({ name: 'USP45', cat: 'pistol', side: 'swat', cal: '45', ammo: ['ap', 'jhp'], mag: 12, spare: 4, chamber: true, modes: ['semi'], rpm: 480, vel: 260, kg: 0.8, len: 0.2,
    ads: 0.18, draw: 0.31, move: 1.0, rc: { v: 2.4, h: 0.6, bias: 0.03, first: 1, ctrl: 21, kick: 1.6 }, sp: { hip: 2.2, ads: 0.25, move: 1.2 }, rl: { tac: 1.6, fast: 1.25, empty: 0.3 },
    pvp: { dmg: 52, fall: [12, 22, 0.6] }, model: 'usp', mdl: {}, snd: 'h45',
    desc: 'ヘッケラー&コッホの拳銃。.45ACPで12発。じょうぶで、警察や特殊部隊で長く使われている。' }),
  fiveseven: W({ name: 'Five-seveN', cat: 'pistol', side: 'both', cal: '57', ammo: ['ap', 'jhp'], mag: 20, spare: 4, chamber: true, modes: ['semi'], rpm: 600, vel: 650, kg: 0.6, len: 0.21,
    ads: 0.16, draw: 0.28, move: 1.0, rc: { v: 1.6, h: 0.5, bias: 0.04, first: 1, ctrl: 24, kick: 1.1 }, sp: { hip: 2.1, ads: 0.22, move: 1.1 }, rl: { tac: 1.6, fast: 1.25, empty: 0.3 },
    pvp: { dmg: 42, fall: [14, 25, 0.62] }, model: 'fiveseven', mdl: {}, snd: 'h57',
    desc: 'FN製。P90と同じ5.7mmの小さく速い弾で、反動が軽い。20発入る。' }),
  python: W({ name: 'Colt Python', cat: 'pistol', side: 'both', cal: '357', ammo: ['ap', 'jhp'], mag: 6, spare: 4, chamber: false, revolver: true, modes: ['semi'], rpm: 250, vel: 440, kg: 1.2, len: 0.29,
    ads: 0.2, draw: 0.34, move: 1.0, rc: { v: 4.2, h: 0.9, bias: 0.1, first: 1, ctrl: 16, kick: 2.6 }, sp: { hip: 2.4, ads: 0.2, move: 1.3 }, rl: { tac: 3.0, fast: 3.0, empty: 0 },
    pvp: { dmg: 64, fall: [14, 26, 0.65] }, model: 'python', mdl: {}, snd: 'h357',
    desc: '.357マグナムの回転式拳銃（6発）。威力は大きいが、反動が強く再装填が遅い（スピードローダー）。' }),
  m17: W({ name: 'M17 (P320)', cat: 'pistol', side: 'swat', cal: '9mm', ammo: ['ap', 'jhp'], mag: 17, spare: 4, chamber: true, modes: ['semi'], rpm: 600, vel: 370, kg: 0.83, len: 0.2,
    ads: 0.17, draw: 0.3, move: 1.0, rc: { v: 1.9, h: 0.6, bias: 0.04, first: 1, ctrl: 22, kick: 1.35 }, sp: { hip: 2.2, ads: 0.24, move: 1.2 }, rl: { tac: 1.6, fast: 1.25, empty: 0.3 },
    pvp: { dmg: 44, fall: [12, 22, 0.6] }, model: 'glock', mdl: { coyote: true }, snd: 'h9',
    desc: 'シグ・ザウエルのP320を米軍の制式にした拳銃。コヨーテ色。素直で当てやすい。' }),
  g19: W({ name: 'Glock 19', cat: 'pistol', side: 'both', cal: '9mm', ammo: ['ap', 'jhp'], mag: 15, spare: 4, chamber: true, modes: ['semi'], rpm: 600, vel: 360, kg: 0.85, len: 0.19,
    ads: 0.16, draw: 0.28, move: 1.0, rc: { v: 2.1, h: 0.62, bias: 0.05, first: 1, ctrl: 22, kick: 1.45 }, sp: { hip: 2.2, ads: 0.26, move: 1.2 }, rl: { tac: 1.55, fast: 1.2, empty: 0.3 },
    pvp: { dmg: 43, fall: [12, 22, 0.6] }, model: 'glock', mdl: { short: true }, snd: 'h9',
    desc: 'グロック17をひと回り小さくした型。隠して持ちやすく、抜くのが速い。' }),
  m92: W({ name: 'Beretta 92FS', cat: 'pistol', side: 'both', cal: '9mm', ammo: ['ap', 'jhp'], mag: 15, spare: 4, chamber: true, modes: ['semi'], rpm: 600, vel: 380, kg: 0.95, len: 0.22,
    ads: 0.17, draw: 0.31, move: 1.0, rc: { v: 1.8, h: 0.55, bias: 0.03, first: 1, ctrl: 23, kick: 1.3 }, sp: { hip: 2.2, ads: 0.23, move: 1.2 }, rl: { tac: 1.65, fast: 1.3, empty: 0.3 },
    pvp: { dmg: 43, fall: [12, 22, 0.6] }, model: 'm92', mdl: {}, snd: 'h9',
    desc: 'イタリアのベレッタ。上が開いたスライドが特徴。重みがあり反動がおだやか。長く米軍の拳銃だった。' }),
  deagle: W({ name: 'Desert Eagle', cat: 'pistol', side: 'both', cal: '50ae', ammo: ['ap', 'jhp'], mag: 7, spare: 4, chamber: true, modes: ['semi'], rpm: 240, vel: 470, kg: 2.0, len: 0.27,
    ads: 0.22, draw: 0.4, move: 0.99, rc: { v: 5.0, h: 1.1, bias: 0.12, first: 1, ctrl: 14, kick: 3.0 }, sp: { hip: 2.6, ads: 0.22, move: 1.4 }, rl: { tac: 2.0, fast: 1.6, empty: 0.35 },
    pvp: { dmg: 78, fall: [14, 26, 0.65] }, model: 'deagle', mdl: {}, snd: 'h357',
    desc: '.50 AEの大きな自動拳銃。威力は小銃なみだが、反動がとても強く、7発しか入らない。' }),
  taser: W({ name: 'テーザー X26P', cat: 'less', side: 'swat', cal: 'taser', ammo: ['taser'], mag: 1, spare: 4, chamber: false, modes: ['semi'], rpm: 60, vel: 55, kg: 0.2, len: 0.2, less: true, range: 7.6,
    ads: 0.16, draw: 0.3, move: 1.0, rc: { v: 0.6, h: 0.1, bias: 0, first: 1, ctrl: 20, kick: 0.6 }, sp: { hip: 2.6, ads: 0.6, move: 1.0 }, rl: { tac: 2.0, fast: 2.0, empty: 0 },
    pvp: null, model: 'taser', mdl: {}, snd: 'taser',
    desc: '電極を撃ち出して筋肉を一時的に動けなくする。届くのは約7.6m。当たった相手はたいてい投降する。' }),
  // ---------- 容疑者・犯人 ----------
  akm: W({ name: 'AKM', cat: 'rifle', side: 'sus', cal: '762x39', ammo: ['ap', 'jhp'], mag: 30, spare: 5, chamber: true, modes: ['auto', 'semi'], rpm: 600, vel: 715, kg: 3.3, len: 0.88,
    ads: 0.33, draw: 0.6, move: 0.93, rc: { v: 1.1, h: 0.62, bias: 0.18, first: 1.5, ctrl: 8, kick: 1.2 }, sp: { hip: 2.8, ads: 0.14, move: 2.0 }, rl: { tac: 2.7, fast: 2.1, empty: 0.6 },
    pvp: { dmg: 46, fall: [22, 38, 0.7] }, model: 'ak', mdl: { wood: true }, snd: 'r762',
    desc: 'AK-47を改良したソ連の小銃。どこでも手に入り、犯罪組織も使う。7.62x39mmで威力が大きい。' }),
  aks74u: W({ name: 'AKS-74U', cat: 'rifle', side: 'sus', cal: '545', ammo: ['ap', 'jhp'], mag: 30, spare: 5, chamber: true, modes: ['auto', 'semi'], rpm: 700, vel: 735, kg: 2.7, len: 0.73,
    ads: 0.29, draw: 0.5, move: 0.95, rc: { v: 0.82, h: 0.58, bias: 0.12, first: 1.5, ctrl: 9, kick: 1 }, sp: { hip: 2.6, ads: 0.16, move: 1.8 }, rl: { tac: 2.6, fast: 2.0, empty: 0.6 },
    pvp: { dmg: 38, fall: [18, 32, 0.66] }, model: 'ak', mdl: { short: true, fold: true }, snd: 'r545',
    desc: 'AK-74を極端に短くしたカービン。銃口の炎が大きく、反動は荒い。' }),
  g3: W({ name: 'G3A3', cat: 'rifle', side: 'sus', cal: '762x51', ammo: ['ap', 'jhp'], mag: 20, spare: 4, chamber: true, modes: ['auto', 'semi'], rpm: 550, vel: 800, kg: 4.4, len: 1.02,
    ads: 0.38, draw: 0.72, move: 0.9, rc: { v: 1.45, h: 0.62, bias: 0.1, first: 1.3, ctrl: 7, kick: 1.4 }, sp: { hip: 3.0, ads: 0.08, move: 2.2 }, rl: { tac: 2.9, fast: 2.3, empty: 0.6 },
    pvp: { dmg: 51, fall: [30, 50, 0.78] }, model: 'g3', mdl: {}, snd: 'r762',
    desc: 'ドイツのローラー遅延式の戦闘小銃。長く重いが、7.62mm NATOで遠くまでよく当たる。' }),
  sks: W({ name: 'SKS', cat: 'rifle', side: 'sus', cal: '762x39', ammo: ['ap', 'jhp'], mag: 10, spare: 5, chamber: true, modes: ['semi'], rpm: 400, vel: 735, kg: 3.9, len: 1.02,
    ads: 0.36, draw: 0.7, move: 0.92, rc: { v: 1.5, h: 0.45, bias: 0.06, first: 1.2, ctrl: 8, kick: 1.3 }, sp: { hip: 3.0, ads: 0.07, move: 2.2 }, rl: { tac: 2.8, fast: 2.6, empty: 0.4 },
    pvp: { dmg: 55, fall: [30, 50, 0.78] }, model: 'sks', mdl: {}, snd: 'r762',
    desc: 'ソ連の半自動の小銃。木の銃床で長く、10発を挿弾子で込める。安く出回っている。' }),
  mini14: W({ name: 'Mini-14', cat: 'rifle', side: 'sus', cal: '556', ammo: ['ap', 'jhp'], mag: 20, spare: 5, chamber: true, modes: ['semi'], rpm: 500, vel: 910, kg: 3.0, len: 0.95,
    ads: 0.33, draw: 0.62, move: 0.93, rc: { v: 1.0, h: 0.4, bias: 0.05, first: 1.2, ctrl: 9, kick: 1.1 }, sp: { hip: 2.8, ads: 0.07, move: 2.0 }, rl: { tac: 2.6, fast: 2.0, empty: 0.45 },
    pvp: { dmg: 43, fall: [26, 44, 0.72] }, model: 'mini14', mdl: {}, snd: 'r556',
    desc: 'ルガーの半自動の小銃。木の銃床の狩猟用に見えるが、5.56mmで20発。' }),
  vz58: W({ name: 'vz. 58', cat: 'rifle', side: 'sus', cal: '762x39', ammo: ['ap', 'jhp'], mag: 30, spare: 5, chamber: true, modes: ['auto', 'semi'], rpm: 800, vel: 705, kg: 2.9, len: 0.85,
    ads: 0.31, draw: 0.56, move: 0.94, rc: { v: 1.05, h: 0.6, bias: 0.15, first: 1.5, ctrl: 8.5, kick: 1.2 }, sp: { hip: 2.7, ads: 0.14, move: 1.9 }, rl: { tac: 2.6, fast: 2.0, empty: 0.6 },
    pvp: { dmg: 45, fall: [22, 38, 0.7] }, model: 'ak', mdl: { vz: true }, snd: 'r762',
    desc: 'チェコスロバキアの小銃。AKに似ているが中身は別物で、軽く発射速度が速い。' }),
  rpk: W({ name: 'RPK', cat: 'rifle', side: 'sus', cal: '762x39', ammo: ['ap', 'jhp'], mag: 75, spare: 2, chamber: true, modes: ['auto'], rpm: 600, vel: 745, kg: 4.8, len: 1.04,
    ads: 0.42, draw: 0.85, move: 0.88, rc: { v: 0.95, h: 0.5, bias: 0.12, first: 1.3, ctrl: 7.5, kick: 1.15 }, sp: { hip: 3.2, ads: 0.12, move: 2.4 }, rl: { tac: 4.2, fast: 3.6, empty: 0.6 },
    pvp: { dmg: 45, fall: [26, 42, 0.72] }, model: 'ak', mdl: { rpk: true }, snd: 'r762',
    desc: 'AKの銃身を長く重くした分隊支援火器。75発のドラム弾倉で撃ち続ける。重く、振り向くのが遅い。' }),
  bizon: W({ name: 'PP-19 Bizon', cat: 'smg', side: 'sus', cal: '9x18', ammo: ['ap', 'jhp'], mag: 64, spare: 3, chamber: true, modes: ['auto', 'semi'], rpm: 680, vel: 330, kg: 2.7, len: 0.66, fold: true,
    ads: 0.26, draw: 0.48, move: 0.97, rc: { v: 0.45, h: 0.4, bias: 0.05, first: 1.3, ctrl: 11, kick: 0.8 }, sp: { hip: 2.3, ads: 0.17, move: 1.6 }, rl: { tac: 3.0, fast: 2.5, empty: 0.5 },
    pvp: { dmg: 24, fall: [12, 24, 0.58] }, model: 'ak', mdl: { bizon: true }, snd: 'p9',
    desc: 'AKの機関部に、らせん状に64発入る筒の弾倉を下につけた短機関銃。' }),
  skorpion: W({ name: 'vz. 61 Skorpion', cat: 'smg', side: 'sus', cal: '32', ammo: ['ap', 'jhp'], mag: 20, spare: 4, chamber: false, modes: ['auto', 'semi'], rpm: 850, vel: 320, kg: 1.3, len: 0.52, fold: true,
    ads: 0.2, draw: 0.35, move: 1.0, rc: { v: 0.5, h: 0.45, bias: 0.08, first: 1.3, ctrl: 12, kick: 0.7 }, sp: { hip: 2.3, ads: 0.25, move: 1.4 }, rl: { tac: 2.0, fast: 1.6, empty: 0.4 },
    pvp: { dmg: 22, fall: [10, 20, 0.55] }, model: 'skorpion', mdl: {}, snd: 'p9',
    desc: 'チェコスロバキアの小さな短機関銃。.32ACPの小さな弾で反動は軽いが、威力は低い。' }),
  uzi: W({ name: 'Uzi', cat: 'smg', side: 'sus', cal: '9mm', ammo: ['ap', 'jhp'], mag: 32, spare: 4, chamber: false, modes: ['auto', 'semi'], rpm: 600, vel: 400, kg: 3.5, len: 0.65,
    ads: 0.25, draw: 0.45, move: 0.96, rc: { v: 0.45, h: 0.38, bias: 0.05, first: 1.3, ctrl: 11, kick: 0.8 }, sp: { hip: 2.4, ads: 0.2, move: 1.6 }, rl: { tac: 2.4, fast: 1.9, empty: 0.4 },
    pvp: { dmg: 30, fall: [12, 24, 0.58] }, model: 'uzi', mdl: {}, snd: 'p9',
    desc: 'イスラエルの短機関銃。握りに弾倉が入る形。重いぶん反動はおだやか。' }),
  tec9: W({ name: 'TEC-9', cat: 'smg', side: 'sus', cal: '9mm', ammo: ['ap', 'jhp'], mag: 32, spare: 3, chamber: false, modes: ['semi'], rpm: 480, vel: 360, kg: 1.4, len: 0.32,
    ads: 0.2, draw: 0.35, move: 1.0, rc: { v: 1.2, h: 0.6, bias: 0.08, first: 1, ctrl: 18, kick: 1 }, sp: { hip: 2.6, ads: 0.35, move: 1.4 }, rl: { tac: 2.0, fast: 1.6, empty: 0.4 },
    pvp: { dmg: 33, fall: [10, 20, 0.55] }, model: 'tec9', mdl: {}, snd: 'h9',
    desc: '安価な半自動の大型拳銃。犯罪に使われることで悪名が高い。' }),
  mac10: W({ name: 'MAC-10', cat: 'smg', side: 'sus', cal: '45', ammo: ['ap', 'jhp'], mag: 30, spare: 4, chamber: false, modes: ['auto', 'semi'], rpm: 1090, vel: 280, kg: 2.8, len: 0.55,
    ads: 0.22, draw: 0.4, move: 0.98, rc: { v: 0.62, h: 0.62, bias: 0.12, first: 1.3, ctrl: 10, kick: 0.9 }, sp: { hip: 2.8, ads: 0.3, move: 1.6 }, rl: { tac: 2.2, fast: 1.7, empty: 0.4 },
    pvp: { dmg: 29, fall: [10, 20, 0.55] }, model: 'mac10', mdl: {}, snd: 'p45',
    desc: '箱のような小さな短機関銃。毎分1000発をこえる速さで、すぐに弾が切れる。' }),
  p90: W({ name: 'P90', cat: 'smg', side: 'sus', cal: '57', ammo: ['ap', 'jhp'], mag: 50, spare: 3, chamber: true, modes: ['auto', 'semi'], rpm: 900, vel: 715, kg: 2.6, len: 0.5,
    ads: 0.23, draw: 0.42, move: 0.98, rc: { v: 0.36, h: 0.3, bias: 0.04, first: 1.25, ctrl: 13, kick: 0.65 }, sp: { hip: 2.0, ads: 0.15, move: 1.4 }, rl: { tac: 2.9, fast: 2.4, empty: 0.4 },
    pvp: { dmg: 23, fall: [16, 28, 0.62] }, model: 'p90', mdl: {}, snd: 'p57',
    desc: 'FN製のブルパップ。上に寝かせた50発の弾倉。5.7mmで防弾ベストを抜く。' }),
  sawedoff: W({ name: 'ソードオフ・ショットガン', cat: 'shotgun', side: 'sus', cal: 'saw', ammo: ['buck'], mag: 2, spare: 12, chamber: false, breakAction: true, modes: ['semi'], rpm: 240, vel: 330, kg: 2.4, len: 0.5,
    ads: 0.24, draw: 0.4, move: 0.98, rc: { v: 4.4, h: 1.2, bias: 0.1, first: 1, ctrl: 9, kick: 2.8 }, sp: { hip: 3.4, ads: 1.2, move: 1.0 }, rl: { tac: 2.4, fast: 2.4, empty: 0 },
    pvp: { dmg: 15, pellets: 8, fall: [4, 10, 0.25] }, model: 'sawedoff', mdl: {}, snd: 'sg',
    desc: '銃身と銃床を切り詰めた2連の散弾銃。至近距離ではとても危険。' }),
  m590: W({ name: 'Mossberg 590', cat: 'shotgun', side: 'sus', cal: '12g', ammo: ['buck', 'slug'], mag: 8, spare: 16, chamber: true, tube: true, pump: 0.55, modes: ['semi'], rpm: 75, vel: 400, kg: 3.3, len: 0.95,
    ads: 0.32, draw: 0.6, move: 0.93, rc: { v: 3.6, h: 1.0, bias: 0.1, first: 1, ctrl: 8, kick: 2.4 }, sp: { hip: 3.0, ads: 0.6, move: 1.0 }, rl: { tac: 0, fast: 0, empty: 0.5, shell: 0.52, start: 0.35 },
    pvp: { dmg: 18, pellets: 8, fall: [6, 14, 0.3] }, model: 'r870', mdl: { long: true, black: true }, snd: 'sg',
    desc: 'ポンプ式の散弾銃。軍用の頑丈な型で8発入る。' }),
  g18: W({ name: 'Glock 18C', cat: 'pistol', side: 'sus', cal: '9mm', ammo: ['ap', 'jhp'], mag: 19, spare: 3, chamber: true, modes: ['auto', 'semi'], rpm: 1200, vel: 375, kg: 0.9, len: 0.2,
    ads: 0.17, draw: 0.3, move: 1.0, rc: { v: 0.95, h: 0.75, bias: 0.1, first: 1.2, ctrl: 14, kick: 1.1 }, sp: { hip: 2.6, ads: 0.4, move: 1.3 }, rl: { tac: 1.6, fast: 1.25, empty: 0.3 },
    pvp: { dmg: 28, fall: [10, 20, 0.55] }, model: 'glock', mdl: { comp: true }, snd: 'h9',
    desc: '連射ができるグロック。毎分1200発で、片手ではほとんど抑えられない。' }),
  m1911: W({ name: 'M1911', cat: 'pistol', side: 'sus', cal: '45', ammo: ['ap', 'jhp'], mag: 7, spare: 3, chamber: true, modes: ['semi'], rpm: 480, vel: 250, kg: 1.1, len: 0.22,
    ads: 0.18, draw: 0.32, move: 1.0, rc: { v: 2.6, h: 0.65, bias: 0.05, first: 1, ctrl: 20, kick: 1.7 }, sp: { hip: 2.4, ads: 0.26, move: 1.2 }, rl: { tac: 1.7, fast: 1.3, empty: 0.3 },
    pvp: { dmg: 55, fall: [12, 22, 0.6] }, model: 'm1911', mdl: {}, snd: 'h45',
    desc: '100年以上前に作られた.45口径の自動拳銃。今も広く出回っている。' }),
  makarov: W({ name: 'マカロフ PM', cat: 'pistol', side: 'sus', cal: '9x18', ammo: ['ap', 'jhp'], mag: 8, spare: 3, chamber: true, modes: ['semi'], rpm: 480, vel: 315, kg: 0.73, len: 0.16,
    ads: 0.16, draw: 0.28, move: 1.0, rc: { v: 1.9, h: 0.6, bias: 0.05, first: 1, ctrl: 22, kick: 1.3 }, sp: { hip: 2.4, ads: 0.3, move: 1.2 }, rl: { tac: 1.6, fast: 1.25, empty: 0.3 },
    pvp: { dmg: 40, fall: [10, 20, 0.55] }, model: 'makarov', mdl: {}, snd: 'h9',
    desc: 'ソ連の小さな拳銃。安く手に入り、隠し持ちやすい。' }),
};

// アタッチメント（RoN のように枠ごとに選ぶ）。数値は掛け算（rcv 縦の反動、rch 横、rcfirst 初弾、ads 構える秒に足す、hip 腰だめの散らばり、
// reload リロードの時間、move 歩く速さ、noise 銃声、flash 銃口の炎、zoom 倍率、spread 散弾の広がり）
export const ATTACH = {
  sight: {
    iron: { name: 'アイアンサイト', zoom: 1.0, ads: 0 },
    reddot: { name: 'ドットサイト（Micro T-2）', zoom: 1.1, ads: 0.01 },
    srs: { name: '広窓ドットサイト（SRS）', zoom: 1.1, ads: 0.014, desc: '窓が広く、まわりが見やすい。少し重い。' },
    holo: { name: 'ホロサイト（EXPS3）', zoom: 1.1, ads: 0.015 },
    // 倍率の照準器（11-12。実在の物を元にした形と照準の模様）。zooms: 構えている間に射撃モードのボタンで切り替える倍率（はじめが既定）。
    // flip: 等倍にするとブースターを横へ倒す（照準はホロサイト）。wide1: 等倍でもスコープをのぞく（視野が広い）
    acog2: { name: '2倍スコープ（ACOG TA47 2x20）', zoom: 2.0, ads: 0.03, scope: true, desc: 'トリジコンの小型のACOG（全長13.5cm）。2倍の固定倍率で、照準は赤い十字（光ファイバーと夜光）。近くも見やすい。' },
    mag3: { name: 'ホロサイト＋3倍ブースター（EXPS3・G33）', zoom: 3.0, zooms: [3, 1], ads: 0.04, scope: true, flip: true, desc: 'EOTech のホロサイトの後ろに3倍のブースター（G33）。構えている間に射撃モードのボタンで、ブースターを横へ倒す（等倍のホロサイト）・戻す（3倍）。' },
    acog: { name: '4倍スコープ（ACOG TA31 4x32）', zoom: 4.0, ads: 0.05, scope: true, desc: 'トリジコンの4倍の固定スコープ。照準は赤い山形（シェブロン）と、下に5.56mmの距離の目盛り。遠くの頭を狙える。近くは見づらい。' },
    lpvo: { name: '等倍〜4倍スコープ（SpecterDR 1-4x）', zoom: 4.0, zooms: [4, 1], ads: 0.06, scope: true, wide1: true, desc: 'ELCAN の等倍と4倍を上のレバーで切り替えるスコープ。構えている間に射撃モードのボタンで切り替える。照準は十字と赤い点。' },
    scope6: { name: '6倍スコープ（ACOG TA648 6x48）', zoom: 6.0, ads: 0.08, scope: true, desc: '7.62mm NATO の小銃のための大きなACOG（全長23cm・1.1kg）。照準は赤い馬蹄形と点、下に .308 の距離の目盛り。' },
    lpvo8: { name: '等倍〜8倍スコープ（NX8 1-8x24）', zoom: 8.0, zooms: [8, 1], ads: 0.07, scope: true, wide1: true, desc: 'ナイトフォースの選抜射手向けのスコープ（全長22cm）。構えている間に射撃モードのボタンで等倍と8倍を切り替える。照準は赤い円と点、細い十字に2ミルごとの目盛り。' },
    sniper: { name: '狙撃用スコープ（PM II 3-12x50）', zoom: 8.0, zooms: [4, 8], ads: 0.08, scope: true, desc: 'シュミット＆ベンダーの狙撃用スコープ（34mmの胴・50mmの対物レンズ）。射撃モードのボタンで4倍と8倍を切り替える。照準はミルドットの十字。' },
    rmr: { name: 'ピストル用ドットサイト（RMR）', zoom: 1.05, ads: 0.01 },
    sro: { name: 'ピストル用広窓ドット（SRO）', zoom: 1.05, ads: 0.012, desc: '丸い大きな窓で、ドットを見失いにくい。' },
  },
  muzzle: {
    none: { name: 'なし' },
    supp: { name: '消音器', noise: 0.28, vel: 0.96, rcv: 0.95, flash: 0.1, ads: 0.01, desc: '銃声がとても小さくなり、どこから撃ったか分かりにくい。少し重い。' },
    comp: { name: 'コンペンセイター', rcv: 0.86, rch: 0.88, noise: 1.08, flash: 1.2, desc: '銃口が跳ね上がるのを抑える。' },
    brake: { name: 'マズルブレーキ', rcv: 0.92, rch: 0.72, noise: 1.15, flash: 1.35, desc: '横のぶれを大きく抑える。音と炎が大きくなる。' },
    flash: { name: 'フラッシュハイダー', rcv: 0.98, flash: 0.35, desc: '銃口の炎を小さくし、暗い所で目がくらみにくい。' },
    choke: { name: 'チョーク', spread: 0.68, desc: '散弾の広がりを狭め、少し遠くまで届く。' },
  },
  grip: {
    none: { name: 'なし' },
    vert: { name: '縦のグリップ', rcv: 0.88, ads: 0.01, desc: '縦の反動を抑える。' },
    angled: { name: '斜めのグリップ', rcfirst: 0.85, ads: -0.02, desc: '構えが速く、初弾の跳ねが小さい。' },
    stubby: { name: '短い縦のグリップ', rcv: 0.93, rch: 0.9, desc: '縦と横の反動を少しずつ抑える。' },
    handstop: { name: 'ハンドストップ', ads: -0.03, rcfirst: 0.92, desc: '手を前で止めて押し込む。構えがいちばん速い。' },
  },
  side: {
    none: { name: 'なし' },
    light: { name: 'ライト', light: true, desc: 'ライトのボタンで点ける。暗い所で見やすいが、相手からも見つかりやすい。' },
    laser: { name: 'レーザー（赤）', laser: 'red', hip: 0.72, desc: '点けると腰だめがよく当たる。赤い線と点は相手にも見える。' },
    combo: { name: 'ライト＋レーザー', light: true, laser: 'red', hip: 0.78, ads: 0.01, desc: 'ライトとレーザーを一緒に点ける。少し重い。' },
    ir: { name: '赤外線レーザー', laser: 'ir', hip: 0.75, desc: '暗視装置でしか見えないレーザー。暗い所でこっそり腰だめを当てる。' },
  },
  mag: {
    std: { name: '標準の弾倉' },
    ext: { name: '長い弾倉', cap: 1.33, reload: 1.12, ads: 0.015, desc: '装弾数が約3分の1ふえる。重く、替えるのが少し遅い。' },
    drum: { name: 'ドラム弾倉', reload: 1.4, ads: 0.05, move: 0.97, desc: 'たくさん入るが重く、替えるのも遅い。' },
    fast: { name: '2本つなぎの弾倉', reload: 0.82, ads: 0.01, desc: '2本を横につないで、替えるのが速い。' },
  },
  stock: {
    std: { name: '標準の銃床' },
    short: { name: '縮めた銃床', ads: -0.03, rcv: 1.1, rch: 1.08, move: 1.01, desc: '短く構えが速い。反動は大きくなる。' },
    heavy: { name: '重い銃床', ads: 0.03, rcv: 0.9, rch: 0.92, desc: '肩に重く当てて反動を抑える。構えは遅い。' },
    fold: { name: '銃床をたたむ', ads: -0.06, rcv: 1.4, rch: 1.3, hip: 0.85, move: 1.02, desc: '銃床なし。とても取り回しやすいが、狙って撃つのは難しい。' },
  },
  finish: {
    blk: { name: '標準' }, fde: { name: 'タン（FDE）' }, od: { name: 'オリーブドラブ' }, gry: { name: 'グレー' },
  },
};
export const SLOT_NAME = { sight: '照準器', muzzle: 'マズル', grip: 'グリップ', side: 'ライト・レーザー', mag: '弾倉', stock: '銃床', finish: '色' };
// 銃の種類ごとに付けられるもの（はじめの物が既定）
// 見た目と合わせる: 前の握りが元から付いている銃（AUG・MP9・MP5K・MP7）はグリップなし、レールのない拳銃はライトなし など
// 小銃の照準器（実銃の取り付け方に合わせる）:
//  上がレールの小銃（AR-15 の仲間・SCAR・SA58・AUG A3・Tavor X95・vz.58 の短いレール）はドット・ホロ・2倍・4倍・等倍〜4倍。
//  ブースター（ホロ＋3倍）は上のレールが長い物だけ（vz.58 は短いので付かない）。
//  等倍〜8倍は銃身が長めの物（M4A1・HK416・AUG・Tavor・SCAR-H・HK417）。6倍の ACOG（TA648）は 7.62mm NATO 用（SCAR-H・HK417・G3）。
//  G3 は爪の台（クローマウント）にドット・2倍・4倍・6倍。G36C は持ち手の上の短いレールにドット・ホロ・2倍。AK・SKS・Mini-14・RPK は照準器なし
function rifleSights(wid, W) {
  const m = W.model, md = W.mdl || {};
  if (m === 'g36') return ['reddot', 'holo', 'acog2', 'iron'];
  if (m === 'g3') return ['iron', 'reddot', 'acog2', 'acog', 'scope6'];
  const rail = !(m === 'ak' && !md.vz) && m !== 'sks' && m !== 'mini14';
  if (!rail) return ['iron'];
  const out = ['iron', 'reddot', 'srs', 'holo', 'acog2'];
  if (!md.vz) out.push('mag3');
  out.push('acog', 'lpvo');
  if (['m4a1', 'hk416', 'aug', 'tavor', 'scarh', 'hk417'].includes(wid)) out.push('lpvo8');
  if (W.cal === '762x51' && ['scarh', 'hk417'].includes(wid)) out.push('scope6');
  return out;
}
export function attachOptions(wid) {
  const W = WEAPONS[wid];
  if (!W) return {};
  const c = W.cat, m = W.model, md = W.mdl || {};
  const fin = ['blk', 'fde', 'od', 'gry'];
  if (c === 'rifle') {
    const rail = !(m === 'ak' && !md.vz) && m !== 'sks' && m !== 'mini14' && m !== 'g3';
    const box = W.mag >= 20 && !md.rpk;
    const fg = (rail && m !== 'aug' && !md.vz) || m === 'g3';
    return {
      sight: rifleSights(wid, W),
      muzzle: ['none', 'supp', 'comp', 'brake', 'flash'],
      grip: fg ? ['none', 'vert', 'angled', 'stubby', 'handstop'] : ['none'],
      side: ['none', 'light', 'laser', 'combo', 'ir'],
      mag: box ? (W.drum ? ['std', 'ext', 'fast', 'drum'] : ['std', 'ext', 'fast']) : ['std'],
      stock: m === 'aug' || m === 'tavor' ? ['std'] : m === 'g3' ? ['std', 'heavy'] : W.fold || md.fold || md.short || md.stock === 'mcx' || m === 'g36' ? ['std', 'short', 'heavy', 'fold'] : ['std', 'short', 'heavy'],
      finish: ['ak', 'sks', 'mini14', 'g36', 'aug', 'g3'].includes(m) ? ['blk'] : fin,
    };
  }
  if (c === 'sniper') {
    return {
      sight: ['sniper', 'lpvo8', 'scope6', 'acog', 'lpvo'],
      muzzle: ['none', 'brake', 'supp'],
      grip: ['none'],
      side: ['none', 'light', 'laser', 'combo', 'ir'],
      mag: ['std'],
      stock: ['std'],
      finish: fin,
    };
  }
  if (c === 'smg') {
    const rail = ['mp7', 'ump', 'mpx', 'vector', 'mp9', 'evo', 'mp5'].includes(m) && !md.sd;
    const fg = rail && m !== 'mp9' && m !== 'mp7' && !md.k;
    const gripMag = ['mac10', 'mp9', 'mp7', 'uzi'].includes(m);
    return {
      // 9mm の銃でも 2倍の ACOG（TA47 には 9mm 用の目盛りの型がある）。上のレールが長い MPX・UMP・Vector はブースターも
      sight: rail || m === 'mp5' ? ['iron', 'reddot', 'srs', 'holo', 'acog2'].concat(['mpx', 'ump', 'vector'].includes(m) ? ['mag3'] : []) : ['iron'],
      muzzle: W.integral ? ['none'] : ['none', 'supp', 'comp', 'flash'],
      grip: fg ? ['none', 'vert', 'angled', 'stubby', 'handstop'] : ['none'],
      side: m === 'tec9' ? ['none'] : ['none', 'light', 'laser', 'combo', 'ir'],
      mag: W.mag <= 32 && m !== 'p90' && m !== 'uzi' ? (gripMag ? ['std', 'ext'] : ['std', 'ext', 'fast']) : ['std'],
      stock: W.fold || md.fold || md.k || ['vector', 'mp9', 'evo'].includes(m) ? ['std', 'short', 'fold'] : m === 'uzi' || m === 'mac10' || m === 'tec9' || m === 'p90' ? ['std'] : ['std', 'short', 'heavy'],
      finish: m === 'pepper' || m === 'p90' ? ['blk'] : fin,
    };
  }
  if (c === 'shotgun') {
    const saw = m === 'sawedoff';
    return {
      sight: saw ? ['iron'] : ['iron', 'reddot', 'holo'],
      muzzle: saw ? ['none'] : ['none', 'choke'],
      grip: m === 'ksg' ? ['none', 'vert', 'angled'] : ['none'],
      side: saw ? ['none'] : ['none', 'light', 'laser', 'combo'],
      mag: md.saiga ? ['std', 'drum'] : W.tube && !saw && m !== 'ksg' ? ['std', 'ext'] : ['std'],
      stock: m === 'm4super' || md.saiga || md.spas ? ['std', 'short'] : ['std'],
      finish: saw ? ['blk'] : fin,
    };
  }
  if (c === 'pistol') {
    const slide = !W.revolver && m !== 'makarov';
    const rail = slide && m !== 'deagle' && (m !== 'm1911' || !!md.rail);
    return {
      sight: slide ? ['iron', 'rmr', 'sro'] : ['iron'],
      muzzle: W.revolver || m === 'deagle' ? ['none'] : ['none', 'supp', 'comp'],
      grip: ['none'],
      side: rail ? ['none', 'light', 'laser', 'combo'] : ['none'],
      mag: slide && m !== 'deagle' ? ['std', 'ext'] : ['std'],
      stock: ['std'],
      finish: m === 'python' || m === 'm1911' || m === 'deagle' || md.coyote ? ['blk'] : fin,
    };
  }
  return { sight: ['iron'], muzzle: ['none'], grip: ['none'], side: ['none'], mag: ['std'], stock: ['std'], finish: ['blk'] };
}
// 装弾数（弾倉のアタッチメント込み）
export function capOf(wid, mag) {
  const W = WEAPONS[wid]; if (!W) return 0;
  if (mag === 'drum' && W.drum) return W.drum;
  if (mag === 'ext') return W.tube ? W.mag + 2 : W.cat === 'pistol' ? W.mag + (W.mag >= 12 ? 5 : 3) : Math.round(W.mag * 1.33);
  return W.mag;
}
export const CAT_NAME = { rifle: '小銃', sniper: '狙撃銃', smg: '短機関銃', shotgun: '散弾銃', pistol: '拳銃', less: '非致死' };
// スコープの倍率（倍率を切り替えられるスコープは、銃ごとに選んだ倍率 wi.zi）
export function zoomsOf(att) { const x = att && ATTACH.sight[att.sight]; return x && x.zooms ? x.zooms : null; }
export function zoomOf(wi) { if (!wi) return 1; const zs = zoomsOf(wi.att); if (zs) return zs[(wi.zi || 0) % zs.length]; const x = ATTACH.sight[wi.att && wi.att.sight]; return x && x.zoom ? x.zoom : 1; }
// 今の照準器の状態（HUD・一人称の見え方）: kind 照準の模様、scope 倍率の像（銃を描かずに HUD のスコープの像）、wide 等倍のスコープ（広い視野）
export function opticOf(wi) {
  const sid = wi && wi.att ? wi.att.sight : 'iron', x = ATTACH.sight[sid];
  if (!x) return { kind: 'iron', zoom: 1, scope: false, wide: false };
  const zoom = zoomOf(wi);
  if (x.flip && zoom <= 1) return { kind: 'holo', zoom: 1, scope: false, wide: false };
  return { kind: sid, zoom, scope: !!x.scope, wide: !!(x.wide1 && zoom <= 1) };
}
