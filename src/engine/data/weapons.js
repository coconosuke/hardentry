// 銃のデータ（実銃の諸元＋ゲームの扱い）。図鑑はここから作る。
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
  // ---------- SWAT: 散弾銃・非致死 ----------
  m4super: W({ name: 'Benelli M4', cat: 'shotgun', side: 'swat', cal: '12g', ammo: ['buck', 'slug'], mag: 7, spare: 24, chamber: true, tube: true, modes: ['semi'], rpm: 300, vel: 400, kg: 3.8, len: 0.89,
    ads: 0.32, draw: 0.6, move: 0.93, rc: { v: 3.2, h: 0.9, bias: 0.1, first: 1, ctrl: 9, kick: 2.2 }, sp: { hip: 3.0, ads: 0.6, move: 1.0 }, rl: { tac: 0, fast: 0, empty: 0.4, shell: 0.45, start: 0.35 },
    pvp: { dmg: 17, pellets: 8, fall: [6, 14, 0.3] }, model: 'm4super', mdl: {}, snd: 'sg',
    desc: 'ガス圧作動の半自動散弾銃。米海兵隊の M1014。速く撃てるが、1発ずつ込める。' }),
  r870: W({ name: 'Remington 870 CQB', cat: 'shotgun', side: 'swat', cal: '12g', ammo: ['buck', 'slug'], mag: 6, spare: 24, chamber: true, tube: true, pump: 0.5, modes: ['semi'], rpm: 75, vel: 400, kg: 3.4, len: 0.8,
    ads: 0.3, draw: 0.55, move: 0.94, rc: { v: 3.6, h: 1.0, bias: 0.1, first: 1, ctrl: 8, kick: 2.4 }, sp: { hip: 3.0, ads: 0.6, move: 1.0 }, rl: { tac: 0, fast: 0, empty: 0.5, shell: 0.5, start: 0.35 },
    pvp: { dmg: 19, pellets: 8, fall: [6, 14, 0.3] }, model: 'r870', mdl: {}, snd: 'sg',
    desc: 'ポンプ式の散弾銃。1発ごとに前の握りを引いて送る。もっとも普及した警察の散弾銃。' }),
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

// アタッチメント
export const ATTACH = {
  sight: {
    iron: { name: 'アイアンサイト', zoom: 1.0, ads: 0 },
    reddot: { name: 'ドットサイト（T-2）', zoom: 1.1, ads: 0.01 },
    holo: { name: 'ホロサイト（EXPS3）', zoom: 1.1, ads: 0.015 },
    lpvo: { name: '等倍〜4倍スコープ', zoom: 3.0, ads: 0.06, scope: true },
  },
  muzzle: {
    none: { name: 'なし' },
    supp: { name: '消音器', noise: 0.28, vel: 0.96, rcv: 0.95, flash: 0.1 },
    comp: { name: 'コンペンセイター', rcv: 0.86, rch: 0.88, noise: 1.08, flash: 1.2 },
  },
  grip: {
    none: { name: 'なし' },
    vert: { name: '縦のグリップ', rcv: 0.88, ads: 0.01 },
    angled: { name: '斜めのグリップ', rcfirst: 0.85, ads: -0.02 },
  },
};
// 銃の種類ごとに付けられるもの
export function attachOptions(wid) {
  const W = WEAPONS[wid];
  if (!W) return {};
  const c = W.cat;
  if (c === 'rifle') return { sight: W.model === 'g36' ? ['reddot', 'holo', 'iron'] : ['iron', 'reddot', 'holo', 'lpvo'], muzzle: ['none', 'supp', 'comp'], grip: ['none', 'vert', 'angled'] };
  if (c === 'smg') return { sight: ['iron', 'reddot', 'holo'], muzzle: W.integral ? ['none'] : ['none', 'supp', 'comp'], grip: W.model === 'mp7' || W.model === 'ump' || W.model === 'mpx' ? ['none', 'vert', 'angled'] : ['none'] };
  if (c === 'shotgun') return { sight: W.model === 'sawedoff' ? ['iron'] : ['iron', 'reddot'], muzzle: ['none'], grip: ['none'] };
  if (c === 'pistol') return { sight: ['iron'], muzzle: W.revolver ? ['none'] : ['none', 'supp'], grip: ['none'] };
  return { sight: ['iron'], muzzle: ['none'], grip: ['none'] };
}
export const CAT_NAME = { rifle: '小銃', smg: '短機関銃', shotgun: '散弾銃', pistol: '拳銃', less: '非致死' };
