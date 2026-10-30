// 設定の既定値と保存。sv: 設定の形の版（形を変えたら上げて、古い値を直す）
import { load, save } from './save.js';
import { LOADOUTS } from '../engine/data/npc.js';

export const DEFAULTS = {
  sv: 1,
  // 視点と照準
  sens: 1.0, sensAds: 0.75, sensScope: 0.45, sensFire: 1.0, invertY: false, fireLook: true,
  aimAssist: 'weak', // off | weak | strong（対戦は部屋の設定が優先）
  gyro: 'off', gyroSens: 1.0, gyroInvX: false, gyroInvY: false,
  // 操作
  adsMode: 'tap', // tap（押すたび切替）| hold（押している間）| mixed（短く押すと切替・長く押すと押している間）
  leanMode: 'toggle', stickMode: 'float', stickSprint: true, handed: 'right', leftFire: true, confirm: 'auto',
  // HUD
  hud: {}, hudOpacity: 0.85, hudScale: 1.0, crosshair: 'cross', crossColor: '#ffffff', minimap: true, subtitles: true, hitMarker: true,
  // 画面
  quality: 'medium', fps: 60, scale: 1.0, autoRes: true, fov: 52, blood: true, shake: true, showFps: false, bright: 1.0,
  // 音
  vol: { master: 0.9, bgm: 0.5, sfx: 0.9, voice: 1.0, ui: 0.7 }, playSilent: false,
};

export function loadSettings() {
  const s = load('settings', {}) || {};
  const out = JSON.parse(JSON.stringify(DEFAULTS));
  for (const k of Object.keys(out)) if (s[k] !== undefined) out[k] = (typeof out[k] === 'object' && out[k] && !Array.isArray(out[k])) ? { ...out[k], ...s[k] } : s[k];
  out.sv = DEFAULTS.sv;
  return out;
}
export function saveSettings(s) { save('settings', s); }

// 名前（オンラインと結果に出る）
export const DEFAULT_PROFILE = { name: 'あなた' };
export function loadProfile() { return { ...DEFAULT_PROFILE, ...(load('profile', {}) || {}) }; }
export function saveProfile(p) { save('profile', p); }

// 装備（自分とAI隊員4人、対戦の陣営ごと）
export function loadLoadouts() {
  const L = load('loadouts', null) || {};
  const def = JSON.parse(JSON.stringify({ player: LOADOUTS.player, ai: [LOADOUTS.red1, LOADOUTS.red2, LOADOUTS.blue1, LOADOUTS.blue2], pvp: null }));
  return { player: L.player || def.player, ai: Array.isArray(L.ai) && L.ai.length === 4 ? L.ai : def.ai, pvp: L.pvp || def.pvp };
}
export function saveLoadouts(L) { save('loadouts', L); }
