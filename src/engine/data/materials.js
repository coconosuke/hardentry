// 材質。pen = 1mあたりの貫通の抵抗（RoNの値を厚さで割ったもの: 木の扉50/0.05m、石膏150/0.12m、木250/0.15m）
// hp = ブロック1つ（0.5m×0.7m）の耐久。0は壊れない。see = 視線が通るか。
export const M = {
  NONE: 0, BRICK: 1, CONCRETE: 2, DRYWALL: 3, WOOD: 4, GLASS: 5, METAL: 6, DOORWOOD: 7, DOORMETAL: 8,
  BARRICADE: 9, REINF: 10, FURN: 11, FABRIC: 12, METALFURN: 13, CAR: 14, CERAMIC: 15, FENCE: 16, BODY: 17, GLASSBROKEN: 18,
};
export const MATS = [
  null,
  { key: 'brick', name: 'レンガ', pen: 4000, hp: 0, see: false, snd: 'brick', thick: 0.30 },
  { key: 'concrete', name: 'コンクリート', pen: 1e9, hp: 0, see: false, snd: 'concrete', thick: 0.30 },
  { key: 'drywall', name: '石膏ボード', pen: 1250, hp: 120, see: false, snd: 'drywall', thick: 0.12 },
  { key: 'wood', name: '木の壁', pen: 1667, hp: 160, see: false, snd: 'wood', thick: 0.15 },
  { key: 'glass', name: 'ガラス', pen: 200, hp: 1, see: true, snd: 'glass', thick: 0.05 },
  { key: 'metal', name: '金属', pen: 1e9, hp: 0, see: false, snd: 'metal', thick: 0.05 },
  { key: 'doorwood', name: '木の扉', pen: 1100, hp: 0, see: false, snd: 'door', thick: 0.045 },
  { key: 'doormetal', name: '金属の扉', pen: 9000, hp: 0, see: false, snd: 'metal', thick: 0.05 },
  { key: 'barricade', name: 'バリケード', pen: 900, hp: 60, see: false, snd: 'wood', thick: 0.06 },
  { key: 'reinf', name: '補強壁', pen: 1e9, hp: 0, see: false, snd: 'metal', thick: 0.14 },
  { key: 'furn', name: '家具（木）', pen: 1400, hp: 0, see: false, snd: 'wood', thick: 0 },
  { key: 'fabric', name: '布張り', pen: 320, hp: 0, see: false, snd: 'soft', thick: 0 },
  { key: 'metalfurn', name: '家具（金属）', pen: 3000, hp: 0, see: false, snd: 'metal', thick: 0 },
  { key: 'car', name: '車', pen: 1500, hp: 0, see: false, snd: 'metal', thick: 0 },
  { key: 'ceramic', name: 'カウンター', pen: 1800, hp: 0, see: false, snd: 'concrete', thick: 0 },
  { key: 'fence', name: '金網', pen: 50, hp: 0, see: true, snd: 'metal', thick: 0.04 },
  { key: 'body', name: '人', pen: 0, hp: 0, see: false, snd: 'flesh', thick: 0 },
  { key: 'glassbroken', name: '割れたガラス', pen: 0, hp: 0, see: true, snd: 'glass', thick: 0 },
];
// 床の材質（足音と見た目）
export const F = { NONE: 0, CONCRETE: 1, TILE: 2, WOOD: 3, CARPET: 4, ASPHALT: 5, GRASS: 6, DIRT: 7, METAL: 8 };
export const FLOORS = [
  null,
  { key: 'concrete', name: 'コンクリート', step: 'hard', loud: 1.0 },
  { key: 'tile', name: 'タイル', step: 'tile', loud: 1.1 },
  { key: 'wood', name: '木の床', step: 'wood', loud: 1.05 },
  { key: 'carpet', name: 'カーペット', step: 'soft', loud: 0.55 },
  { key: 'asphalt', name: 'アスファルト', step: 'hard', loud: 0.9 },
  { key: 'grass', name: '草', step: 'grass', loud: 0.6 },
  { key: 'dirt', name: '土', step: 'dirt', loud: 0.7 },
  { key: 'metal', name: '金属', step: 'metal', loud: 1.3 },
];
// 人の体を通るときの貫通の消費（1回あたり）
export const BODY_PEN = 220;
