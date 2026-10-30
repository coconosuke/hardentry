// サイプレス荘（夜）: 古い2階建てのアパート。中廊下の両側に部屋が並ぶ。
//  1階: ロビー・管理人室・101〜104号室（居間・寝室・浴室）・ランドリー・機械室・倉庫・階段
//  2階: 201〜206号室（ワンルーム＋浴室）・物置・階段
//  入口: 表の玄関（南）・裏の路地からランドリーの勝手口・東の駐車場から廊下の通用口と機械室の扉
import { canvas } from './draw.js';

const W = 84, D = 64;
const a = canvas(W, D, ';');
const b = canvas(W, D, ' ');
const props = [], rooms = [], lights = [], paint = {};
const pts = { sus: [], civ: [], hostage: [], bomb: [], evidence: [] };

// ---- 外（1階）
a.rect(0, 2, 83, 9, ',');                 // 裏の路地
a.rect(10, 10, 71, 11, '"');              // 建物の裏の歩道
a.rect(72, 10, 83, 52, ',');              // 東の駐車場
a.rect(71, 12, 71, 52, '"');              // 建物の東の歩道
a.rect(0, 53, 83, 55, '"');               // 表の歩道
a.rect(0, 56, 83, 63, ',');               // 通り
a.rect(40, 49, 43, 52, '"');              // 玄関までの小道
a.v(3, 10, 52, 'F');                      // 西の金網
a.h(13, 38, 52, 'L'); a.h(45, 70, 52, 'L'); // 前庭の低い塀

// ---- 建物（1階）
a.room(12, 12, 70, 48, '#', '.');
a.h(13, 69, 28, '='); a.h(13, 69, 32, '=');   // 中廊下の両側
a.rect(13, 29, 69, 31, '~');
a.v(20, 13, 27, '='); a.v(37, 13, 27, '='); a.v(54, 13, 27, '='); a.v(62, 13, 27, '=');
a.v(20, 33, 47, '='); a.v(37, 33, 47, '='); a.v(46, 33, 47, '='); a.v(63, 33, 47, '=');
// 階段（北西）: 南から北へ上がる。廊下へは広い開口
a.rect(13, 13, 19, 27, ':');
a.stairs(13, 17, 3, 8);
for (let x = 16; x <= 19; x++) a.set(x, 28, 'O');
// ロビー（南の真ん中）: 表の両開きの扉、廊下へは開口
a.rect(38, 33, 45, 47, ':');
for (let x = 39; x <= 44; x++) a.set(x, 32, 'O');
a.door(40, 48, 'h', 4);
a.win(38, 48, 'h', 2); a.win(44, 48, 'h', 2);
// 管理人室（南西）
a.rect(13, 33, 19, 47, '~');
a.door(16, 32, 'h');
a.win(12, 37, 'v', 3); a.win(12, 43, 'v', 2);
// ランドリー（北）: 裏の路地への勝手口
a.rect(55, 13, 61, 27, '-');
a.door(57, 28, 'h');
a.door(58, 12, 'h', 2, 'M');
a.win(55, 12, 'h', 2);
// 機械室（北東）: 駐車場への鉄の扉
a.rect(63, 13, 69, 27, '-');
a.door(65, 28, 'h', 2, 'M');
a.door(70, 16, 'v', 2, 'M');
// 倉庫（南東）
a.rect(64, 33, 69, 47, '-');
a.door(66, 32, 'h');
a.win(70, 40, 'v', 2);
// 廊下の両端
a.door(70, 29, 'v');
a.win(12, 29, 'v', 3);

// ---- 2階
b.room(12, 12, 70, 48, '#', '_');
b.h(13, 69, 28, '='); b.h(13, 69, 32, '=');
b.rect(13, 29, 69, 31, '~');
b.v(20, 13, 27, '='); b.v(37, 13, 27, '='); b.v(54, 13, 27, '=');
b.v(20, 33, 47, '='); b.v(37, 33, 47, '='); b.v(54, 33, 47, '=');
// 階段の上: 穴の東と南に手すり。北の踊り場から東の通路を通って廊下へ
b.rect(13, 13, 19, 27, ':');
b.stairs(13, 17, 3, 8);
b.v(16, 17, 24, 'L'); b.h(13, 15, 25, 'L');
for (let x = 16; x <= 19; x++) b.set(x, 28, 'O');
b.win(12, 20, 'v', 2);
// 物置（管理人室の上）
b.rect(13, 33, 19, 47, '-');
b.door(16, 32, 'h');
b.win(70, 29, 'v', 3);

// ---- 部屋の型。u は部屋の西（反転なら東）から、v は廊下の側からのマス。p, q は同じ向きの連続した座標
function frame(cv, x0, side, flip, n) {
  const Xi = (u) => flip ? x0 + n - 1 - u : x0 + u;
  const Zi = (v) => side === 'n' ? 27 - v : 33 + v;
  const Xc = (p) => flip ? x0 + n - p : x0 + p;
  const Zc = (q) => side === 'n' ? 28 - q : 33 + q;
  const R = (lr) => lr === 0 ? (side === 'n' ? 2 : 0) : lr === 2 ? (side === 'n' ? 0 : 2) : lr === 1 ? (flip ? 3 : 1) : (flip ? 1 : 3);
  const r1 = (v) => Math.round(v * 100) / 100;
  return {
    Xi, Zi, Xc, Zc,
    H: (u0, u1, v, ch) => cv.h(Xi(u0), Xi(u1), Zi(v), ch),
    V: (u, v0, v1, ch) => cv.v(Xi(u), Zi(v0), Zi(v1), ch),
    F: (u0, v0, u1, v1, ch) => cv.rect(Math.min(Xi(u0), Xi(u1)), Math.min(Zi(v0), Zi(v1)), Math.max(Xi(u0), Xi(u1)), Math.max(Zi(v0), Zi(v1)), ch),
    DH: (u, v, ch = 'D') => cv.door(Math.min(Xi(u), Xi(u + 1)), Zi(v), 'h', 2, ch),
    DV: (u, v) => cv.door(Xi(u), Math.min(Zi(v), Zi(v + 1)), 'v'),
    WH: (u, v, len) => cv.win(Math.min(Xi(u), Xi(u + len - 1)), Zi(v), 'h', len),
    P: (L) => (type, p, q, lr, o) => props.push([type, r1(Xc(p)), r1(Zc(q)), L, R(lr), ...(o ? [o] : [])]),
    at: (p, q, L) => L ? [r1(Xc(p)), r1(Zc(q)), L] : [r1(Xc(p)), r1(Zc(q))],
    lt: (p, q, L, kind, mul) => lights.push([r1(Xc(p)), r1(Zc(q)), L, kind, ...(mul ? [mul] : [])]),
  };
}

// 1階の部屋（幅16・奥行き15）: 居間 v0〜6、仕切り v7、寝室 u0〜8、浴室 u10〜15（仕切り u9）
const LIVING = { home: '#d6cdb8', den: '#b9b49c', old: '#d8c9b4', home2: '#c8d0c4' };
function unitA(no, x0, side, flip, kind) {
  const f = frame(a, x0, side, flip, 16), P = f.P(0);
  f.F(0, 0, 15, 6, '_'); f.F(0, 8, 8, 14, '~'); f.F(10, 8, 15, 14, ':');
  f.H(0, 15, 7, '='); f.V(9, 8, 14, '=');
  f.DH(2, -1); f.DH(4, 7); f.DH(12, 7);
  f.WH(3, 15, 3); f.WH(12, 15, 2);
  const nm = [`${no}号室 居間`, `${no}号室 寝室`, `${no}号室 浴室`];
  rooms.push([nm[0], `APT ${no} LIVING`, f.Xi(8), f.Zi(3)], [nm[1], `APT ${no} BEDROOM`, f.Xi(4), f.Zi(11)], [nm[2], `APT ${no} BATH`, f.Xi(13), f.Zi(11)]);
  paint[nm[0]] = LIVING[kind] || LIVING.home; paint[nm[1]] = kind === 'den' ? '#a8a490' : '#cfc6d6'; paint[nm[2]] = '#cfd8d4';
  // 台所（奥の壁ぞい）と浴室はどの部屋も同じ
  P('fridge', 15.3, 0.85, 3); P('counter', 15.35, 3.05, 3, { w: 1.4 }); P('stove', 15.3, 5.65, 3);
  P('bathtub', 15.1, 12.9, 0); P('toilet', 11.05, 13.5, 1); P('sink', 10.9, 8.2, 0);
  if (kind === 'den') {
    // 売人の部屋: 居間に大きな机と箱、床にマットレス
    P('bedS', 1.4, 3.6, 0); P('table', 7.5, 3.4, 0, { w: 1.8, d: 0.9 }); P('chair', 7.5, 1.8, 0); P('chair', 9.8, 3.4, 3);
    P('boxes', 10.0, 6.4, 0); P('crates', 12.4, 1.4, 0); P('boxes', 1.0, 6.5, 1);
    P('bed', 3.0, 12.6, 2); P('boxes', 7.8, 13.9, 0); P('boxes', 7.6, 9.4, 1);
    f.lt(8, 3.5, 0, 'dim', 1.2); f.lt(11, 2, 0, 'red', 0.8); f.lt(13, 11.5, 0, 'dim', 0.6);
    pts.evidence.push(f.at(7.5, 3.4), f.at(12.4, 1.4));
    pts.sus.push(f.at(9.4, 1.0), f.at(5.5, 10.4), f.at(12.4, 10.8));
    pts.bomb.push(f.at(10.6, 5.8));
  } else if (kind === 'old') {
    // 年配の住人: ひじ掛け椅子・本棚・テレビ
    P('armchair', 1.2, 3.6, 1); P('table', 3.6, 3.6, 1, { w: 0.9, d: 0.6 }); P('tvstand', 7.2, 3.8, 3); P('bookshelf', 11.6, 0.0, 0); P('plant', 9.4, 6.6, 0);
    P('table', 11.4, 3.8, 0, { w: 1.0, d: 0.8 }); P('chair', 11.4, 5.2, 2);
    P('bed', 3.0, 12.6, 2); P('wardrobe', 8.2, 12.5, 3); P('cabinet', 7.2, 8.3, 0);
    f.lt(8, 3.5, 0, 'lamp', 0.9); f.lt(4.5, 11.5, 0, 'warm', 0.8); f.lt(13, 11.5, 0, 'fluo', 0.5);
    pts.civ.push(f.at(9.0, 1.0), f.at(5.6, 10.4), f.at(12.4, 10.8));
    pts.sus.push(f.at(13.0, 6.6));
  } else {
    // ふつうの住人
    P('sofa', 1.0, 4.0, 1); P('table', 3.6, 4.0, 1, { w: 1.0, d: 0.6 }); P('tvstand', 7.2, 4.0, 3);
    P('table', 11.2, 3.4, 0, { w: 1.2, d: 0.8 }); P('chair', 11.2, 1.9, 0); P('chair', 11.2, 4.9, 2);
    P('bed', 3.0, 12.6, 2); P('wardrobe', 8.2, 12.5, 3);
    if (kind === 'home2') { P('boxes', 6.6, 8.4, 0); P('plant', 0.6, 0.6, 0); } else P('bookshelf', 6.4, 14.6, 2);
    f.lt(8, 3.5, 0, 'lamp'); f.lt(4.5, 11.5, 0, 'warm', 0.8); f.lt(13, 11.5, 0, 'fluo', 0.6);
    pts.civ.push(f.at(9.0, 1.0), f.at(5.6, 10.4));
    pts.sus.push(f.at(9.2, 6.4), f.at(12.4, 10.8));
  }
  pts.hostage.push(f.at(12.6, 11.2));
}

// 2階のワンルーム（幅 n）: 浴室 u0〜4・v9〜14（仕切り v8 と u5）、浴室の扉は u5 の v11〜12
function unitB(no, x0, side, flip, n, kind) {
  const f = frame(b, x0, side, flip, n), P = f.P(1);
  f.F(0, 0, n - 1, 14, kind === 'vacant' ? '-' : '_'); f.F(0, 9, 4, 14, ':');
  f.H(0, 5, 8, '='); f.V(5, 9, 14, '=');
  f.DH(9, -1); f.DV(5, 11);
  f.WH(8, 15, 4); f.WH(1, 15, 2);
  const nm = [`${no}号室`, `${no}号室 浴室`];
  rooms.push([nm[0], `APT ${no}`, f.Xi(10), f.Zi(4), 1], [nm[1], `APT ${no} BATH`, f.Xi(2), f.Zi(11), 1]);
  paint[nm[0]] = kind === 'vacant' ? '#d2cfc6' : kind === 'den' ? '#b3ad96' : (LIVING[kind] || LIVING.home); paint[nm[1]] = '#cfd8d4';
  P('bathtub', 0.45, 12.8, 0); P('toilet', 3.4, 14.4, 2); P('sink', 2.5, 9.2, 0);
  if (kind === 'vacant') {
    // 空き部屋（改装中）: 箱と板、マットレスだけ
    P('pallet', 4.0, 3.0, 0); P('boxes', 7.0, 1.0, 0); P('boxes', 11.5, 12.4, 1); P('crate', n - 1.2, 2.0, 0); P('bedS', 11.0, 7.0, 1); P('barrel', n - 1.0, 13.6, 0);
    f.lt(8, 6, 1, 'dim', 0.5);
    pts.sus.push(f.at(8.0, 6.0, 1), f.at(12.5, 3.0, 1));
    pts.bomb.push(f.at(8.0, 9.0, 1));
  } else if (kind === 'den') {
    P('bed', 11.0, 12.6, 2); P('table', 4.0, 3.4, 0, { w: 1.8, d: 0.9 }); P('chair', 4.0, 1.8, 0); P('chair', 6.3, 3.4, 3); P('boxes', 7.6, 1.0, 0); P('crates', n - 1.0, 3.0, 0); P('bedS', 8.4, 6.4, 1); P('boxes', n - 1.0, 12.8, 0);
    f.lt(8, 6, 1, 'dim', 1.1); f.lt(4, 3, 1, 'red', 0.7);
    pts.evidence.push(f.at(4.0, 3.4, 1), f.at(n - 1.0, 3.0, 1));
    pts.sus.push(f.at(8.0, 3.8, 1), f.at(11.0, 8.0, 1), f.at(3.0, 11.5, 1));
    pts.bomb.push(f.at(11.5, 4.5, 1));
  } else {
    P('bed', 11.0, 12.6, 2); P('wardrobe', n - 0.8, 12.0, 3);
    P('fridge', n - 0.75, 0.85, 3); P('counter', n - 0.7, 3.05, 3, { w: 1.4 }); P('stove', n - 0.75, 5.65, 3);
    P('sofa', 4.0, 1.0, 0); P('table', 4.0, 3.6, 0, { w: 1.0, d: 0.6 }); P('tvstand', 4.0, 7.7, 2);
    if (kind === 'home2') { P('desk', 7.4, 13.9, 2); P('chair', 7.4, 12.6, 2, { office: true }); } else P('armchair', 8.6, 4.0, 3);
    f.lt(8, 5, 1, 'lamp'); f.lt(2.5, 11.5, 1, 'fluo', 0.5);
    pts.civ.push(f.at(8.0, 6.5, 1), f.at(11.0, 8.0, 1));
    pts.sus.push(f.at(7.0, 7.4, 1), f.at(3.0, 11.5, 1));
  }
  pts.hostage.push(f.at(3.0, 11.6, 1));
}

unitA(101, 21, 'n', false, 'home');
unitA(102, 38, 'n', true, 'den');
unitA(103, 21, 's', false, 'old');
unitA(104, 47, 's', true, 'home2');
unitB(201, 21, 'n', false, 16, 'home');
unitB(202, 38, 'n', true, 16, 'den');
unitB(203, 55, 'n', false, 15, 'vacant');
unitB(204, 21, 's', false, 16, 'home2');
unitB(205, 38, 's', true, 16, 'home');
unitB(206, 55, 's', false, 15, 'den');

// ---- 共用の部屋の物
props.push(
  // ロビー: 郵便受け・ベンチ・植木
  ['mailbox', 38.45, 36, 0, 1], ['booth', 44.9, 40, 0, 3], ['plant', 45.2, 46.6, 0, 0], ['boxes', 38.9, 46.4, 0, 0],
  // 管理人室
  ['desk', 16.5, 37.5, 0, 0], ['chair', 16.5, 36.1, 0, 0, { office: true }], ['cabinet', 13.5, 40, 0, 1], ['cabinet', 13.5, 42, 0, 1], ['bookshelf', 19.2, 42.5, 0, 3], ['boxes', 19.0, 44.6, 0, 1], ['tvstand', 16.5, 47.3, 0, 2],
  // ランドリー: 西に洗濯機、東に乾燥機、真ん中にたたむ台
  ...[15, 16.5, 18, 19.5, 21, 22.5].flatMap((z) => [['washer', 55.4, z, 0, 1, { color: 0 }], ['washer', 60.85, z, 0, 3, { color: 1 }]]),
  ['table', 58.2, 24.2, 0, 1, { w: 1.2, d: 0.6 }], ['boxes', 56, 26.6, 0, 0],
  // 機械室: 給湯器・棚・ドラム缶
  ['heater', 63.4, 14.0, 0, 0], ['heater', 64.9, 14.0, 0, 0], ['shelf', 69.5, 24, 0, 3, { w: 1.8, d: 0.5 }], ['barrel', 68.8, 26.8, 0, 0], ['crates', 63.9, 25.2, 0, 0], ['barrel', 66.6, 13.6, 0, 0],
  // 倉庫
  ['shelf', 69.5, 38, 0, 3, { w: 1.8, d: 0.5 }], ['crates', 65.0, 45.6, 0, 0], ['boxes', 67.6, 46.8, 0, 0], ['boxes', 68.8, 43.6, 0, 1], ['pallet', 65.2, 41.2, 0, 1],
  // 廊下
  ['plant', 13.6, 30.4, 0, 0], ['plant', 13.6, 30.4, 1, 0], ['boxes', 68.6, 31.2, 1, 0],
  // 2階の物置
  ['boxes', 13.8, 34, 1, 0], ['crates', 14.0, 46.4, 1, 0], ['boxes', 18.6, 46.6, 1, 0], ['shelf', 19.0, 39, 1, 3, { w: 1.8, d: 0.5 }], ['bedS', 14.2, 40.5, 1, 0],
  // 外: 路地のごみ箱、駐車場の車、通りの車と街灯、木
  ['dumpster', 30, 5.5, 0, 0], ['dumpster', 46, 5.5, 0, 0], ['dumpster', 66, 5.5, 0, 0], ['crates', 52, 4, 0, 0], ['barrel', 20, 4.2, 0, 0], ['pallet', 24, 4, 0, 1],
  ['car', 76, 17, 0, 0, { color: 1 }], ['car', 80.5, 17.5, 0, 0, { color: 7 }], ['car', 76.5, 42, 0, 2, { color: 3 }], ['car', 81, 41.5, 0, 2, { color: 4 }],
  ['car', 24, 59.6, 0, 1, { color: 0 }], ['car', 64, 59.6, 0, 3, { color: 5 }], ['van', 52, 60.4, 0, 1],
  ['lamp', 36, 54.4, 0, 0], ['lamp', 66, 54.4, 0, 0], ['lamp', 50, 10.6, 0, 0], ['lamp', 73, 24, 0, 1],
  ['tree', 20, 50.4, 0, 0], ['tree', 60, 50.4, 0, 0], ['tree', 7, 30, 0, 0], ['tree', 7, 45, 0, 0], ['tree', 7, 16, 0, 0], ['tree', 80, 54.4, 0, 0],
);
lights.push(
  // 1階の共用部
  [24, 30, 0, 'fluo', 0.8], [36, 30, 0, 'dim'], [48, 30, 0, 'fluo', 0.8], [62, 30, 0, 'dim'],
  [17, 21, 0, 'fluo', 0.7], [42, 40, 0, 'fluo'], [16, 40, 0, 'lamp'], [58, 20, 0, 'fluo'], [66, 20, 0, 'dim'], [66.5, 40, 0, 'dim', 0.7],
  // 2階の共用部
  [24, 30, 1, 'dim'], [40, 30, 1, 'fluo', 0.8], [56, 30, 1, 'dim'], [66, 30, 1, 'fluo', 0.7], [17, 20, 1, 'dim'], [16, 40, 1, 'dim', 0.6],
  // 外
  [36, 54, 0, 'street'], [66, 54, 0, 'street'], [50, 10.6, 0, 'street', 0.8], [73, 24, 0, 'street'], [41.5, 49.6, 0, 'warm', 0.8], [58.5, 11.4, 0, 'dim'],
);
rooms.push(
  ['階段', 'STAIRWELL', 17, 20], ['1階廊下', 'HALLWAY 1F', 40, 30], ['ロビー', 'LOBBY', 42, 40], ['管理人室', "MANAGER'S OFFICE", 16, 40],
  ['ランドリー', 'LAUNDRY', 58, 20], ['機械室', 'BOILER ROOM', 66, 20], ['倉庫', 'STORAGE', 66, 40],
  ['2階階段', 'STAIRWELL 2F', 18, 20, 1], ['2階廊下', 'HALLWAY 2F', 40, 30, 1], ['物置', 'CLOSET', 16, 40, 1],
);
Object.assign(paint, { '階段': '#c9c2ae', '2階階段': '#c9c2ae', '1階廊下': '#cbbf9f', '2階廊下': '#cbbf9f', 'ロビー': '#d4cbb5', '管理人室': '#c4cbbf', 'ランドリー': '#d3d3cd', '機械室': '#9e9a92', '倉庫': '#b9b2a2', '物置': '#bdb6a6' });

export default {
  id: 'apartment', name: 'サイプレス荘', en: 'CYPRESS COURT APARTMENTS', time: 'night', floor: 2,
  desc: '古い2階建てのアパート。中廊下の両側に部屋が並び、1階に居間つきの4部屋とロビー・ランドリー・機械室、2階にワンルームが6部屋。扉の多い長い廊下は撃ち合いになりやすい。表の玄関のほか、裏の路地と東の駐車場からも入れる。',
  levels: [{ rows: a.rows() }, { rows: b.rows() }],
  stairs: [{ i: 13, j: 17, w: 3, len: 8, dir: 'n', L: 0 }],
  paint,
  floorCol: { '1階廊下': '#6a3c33', '2階廊下': '#6a3c33', 'ロビー': '#8a8478' },
  extBrick: '#7a4e3c', ceiling: 'plaster', carpet: '#5b4f44', homey: true, winFrame: '#d9d5cb',
  props, lights, rooms,
  doors: {
    '40,48,0': { outer: true }, '58,12,0': { outer: true }, '70,16,0': { outer: true, locked: true }, '70,29,0': { outer: true },
    '65,28,0': { locked: true }, '23,28,0': { locked: true }, '59,32,0': { locked: true }, '43,28,1': { locked: true }, '64,32,1': { locked: true },
  },
  spawn: {
    swat: [
      { name: '表（玄関）', en: 'FRONT', x: 41.5, z: 58.5, yaw: Math.PI },
      { name: '裏の路地', en: 'ALLEY', x: 58.5, z: 5.5, yaw: 0 },
      { name: '東の駐車場', en: 'EAST LOT', x: 77, z: 30, yaw: -Math.PI / 2 },
    ],
    sus: [...pts.sus, [40, 30], [28, 30], [58, 18], [56.8, 25], [66, 18], [67, 43], [14.5, 44], [42, 36], [30, 30, 1], [50, 30, 1], [17, 14, 1], [16, 44, 1]],
    civ: [...pts.civ, [16, 44], [42, 44], [59.5, 20.5], [62, 30, 1]],
    hostage: [...pts.hostage, [66, 20], [16.2, 41, 1], [67.5, 41]],
    bomb: [...pts.bomb, [58.5, 20], [66.5, 21], [66.5, 39], [16, 44, 1]],
    evidence: [...pts.evidence, [16.5, 37.5], [58.2, 24.2], [69.5, 38]],
    pvp: { a: [[41, 58], [39, 58], [44, 58], [58, 6], [61, 6], [77, 28], [77, 32], [26, 58]], b: [[59.5, 18], [66, 20], [44, 26.5], [31, 38, 1], [44, 40, 1], [40, 30, 1], [24, 30], [52, 30]] },
    sites: [{ name: 'A ランドリー', x: 58.5, z: 20, r: 3.2 }, { name: 'B 205号室', x: 44, z: 39, L: 1, r: 3.2 }],
    tdm: [[7, 36], [78, 48], [27, 7.5], [76, 6], [42, 58], [30, 22], [58, 20], [44, 38, 1], [31, 22, 1], [67.5, 40], [16, 40], [60, 22, 1]],
  },
  missions: { barricade: {}, hostage: {}, bomb: { time: 900 }, raid: { susMul: 0.9 }, active: { civMul: 0.9 } },
};
