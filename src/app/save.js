// 保存（localStorageは必ずtry/catch、キーに版を持たせる）
// キーの版（DATA_V）は設定・名前・記録の形の版。遊びかけの作戦（run）は中身にエンジンの互換番号（COMPAT）を持ち、
// 違えば読み込まずに捨てる（互換番号を上げても設定や記録は消えない）。
import { COMPAT } from '../engine/data/version.js';

export const DATA_V = 1;
const PREFIX = 'hardentry.v' + DATA_V + '.';

export function load(key, def = null) {
  try {
    const s = localStorage.getItem(PREFIX + key);
    if (s == null) return def;
    return JSON.parse(s);
  } catch (e) { return def; }
}
export function save(key, val) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(val)); return true; } catch (e) { return false; }
}
export function remove(key) { try { localStorage.removeItem(PREFIX + key); } catch (e) { /* なし */ } }
// 古い版のセーブを捨てる
export function purgeOld() {
  try {
    const del = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('hardentry.') && !k.startsWith(PREFIX)) del.push(k);
    }
    del.forEach(k => localStorage.removeItem(k));
  } catch (e) { /* なし */ }
}
// 引き継ぎコード（設定・名前・装備・記録）。ホーム画面のアプリは Safari とも Claude とも保存場所が別なので、これで移す
export function exportCode() {
  const o = { v: DATA_V, app: 'HE', settings: load('settings'), profile: load('profile'), records: load('records'), loadouts: load('loadouts') };
  return 'HE1-' + btoa(unescape(encodeURIComponent(JSON.stringify(o))));
}
export function parseCode(code) {
  try {
    let s = String(code).trim();
    if (s.startsWith('HE1-')) s = s.slice(4);
    const o = JSON.parse(decodeURIComponent(escape(atob(s))));
    return o && o.v === DATA_V && o.app === 'HE' ? o : null;
  } catch (e) { return null; }
}
export function importCode(code) {
  try {
    const o = parseCode(code);
    if (!o) return false;
    for (const k of ['settings', 'profile', 'records', 'loadouts']) if (o[k]) save(k, o[k]);
    return true;
  } catch (e) { return false; }
}
// 遊びかけの作戦: 互換番号が今と同じときだけ使う
export function loadRun() {
  const r = load('run');
  if (!r || !r.dump) return null;
  try { if (r.dump.v !== COMPAT) throw 0; } catch (e) { remove('run'); return null; }
  return r;
}
