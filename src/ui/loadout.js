// 装備の画面: 左に枠（主武器・照準・…）、右にその枠の候補と説明。作戦は自分とAI隊員4人、対戦は陣営ごと。
import { onTap } from './input.js';
import { Scroller, esc } from './widgets.js';
import { WEAPONS, ATTACH, CAT_NAME, AMMO, CAL, attachOptions } from '../engine/data/weapons.js';
import { GEAR, LONG, VEST, PLATE, HELMET, HEADWEAR } from '../engine/data/equipment.js';
import { OFFICERS, PVP_LOADOUTS, PVP_ALLOWED } from '../engine/data/npc.js';

const PERSLOT = { flash: 2, stinger: 2, cs: 1, c2: 1, wedge: 2, lockgun: 1, spray: 1, bandage: 2, frame: 1, claymore: 1, chem: 4, taser: 1 };
const PVE_GEAR = ['flash', 'stinger', 'cs', 'c2', 'wedge', 'lockgun', 'spray'];
const AMMO_NAME = { ap: '徹甲弾（AP）', jhp: 'ホローポイント（JHP）', buck: '散弾（バックショット）', slug: 'スラッグ', bean: 'ビーンバッグ', pepper: 'ペッパーボール', taser: 'カートリッジ' };
const PVP_ARMOR = { light: { name: '軽装（体力100・速い）' }, medium: { name: '中装（体力110）' }, heavy: { name: '重装（体力125・遅い）' } };

export class LoadoutEditor {
  constructor(app, host, o = {}) {
    this.app = app; this.host = host; this.o = o;
    this.kind = o.kind || 'pve';
    this.tab = 0; this.slot = 'primary';
    if (this.kind === 'pvp' && !app.loadouts.pvp) app.loadouts.pvp = JSON.parse(JSON.stringify(PVP_LOADOUTS));
    this.render();
  }
  tabs() {
    if (this.kind === 'pvp') return [['swat', 'SWAT'], ['sus', '立てこもり犯']];
    return [['player', '自分'], ...OFFICERS.map((of, i) => ['ai' + i, `${of.name}<small>${of.team === 'red' ? '赤' : '青'}・${of.role}</small>`])];
  }
  cur() {
    const L = this.app.loadouts;
    if (this.kind === 'pvp') return L.pvp[this.tabs()[this.tab][0]];
    return this.tab === 0 ? L.player : L.ai[this.tab - 1];
  }
  side() { return this.kind === 'pvp' ? this.tabs()[this.tab][0] : 'swat'; }
  save() { this.app.saveLoadouts(); }
  slots() {
    const lo = this.cur(), P = lo.primary || {}, W = WEAPONS[P.id];
    const ao = W ? attachOptions(P.id) : {};
    const g = (i) => { const x = (lo.gear || [])[i]; return x ? `${GEAR[x[0]] ? GEAR[x[0]].name.replace(/（.*）/, '') : x[0]} ×${x[1]}` : 'なし'; };
    const list = [
      ['primary', '主武器', W ? W.name : 'なし'],
      ...(ao.sight && ao.sight.length > 1 ? [['sight', '照準', ATTACH.sight[P.sight || 'iron'].name]] : []),
      ...(ao.muzzle && ao.muzzle.length > 1 ? [['muzzle', '銃口', ATTACH.muzzle[P.muzzle || 'none'].name]] : []),
      ...(ao.grip && ao.grip.length > 1 ? [['grip', 'グリップ', ATTACH.grip[P.grip || 'none'].name]] : []),
      ...(W && W.ammo.length > 1 ? [['ammo', '弾', AMMO_NAME[P.ammo || W.ammo[0]]]] : []),
      ['secondary', '副武器', lo.secondary && WEAPONS[lo.secondary.id] ? WEAPONS[lo.secondary.id].name : 'なし'],
    ];
    if (this.kind === 'pve') list.push(['long', '長い装備', LONG[lo.long || 'none'].name]);
    list.push(['g0', '装備1', g(0)], ['g1', '装備2', g(1)], ['g2', '装備3', g(2)]);
    if (this.kind === 'pvp') list.push(['armor', '防具', PVP_ARMOR[lo.armor || 'medium'].name]);
    else list.push(['vest', '防弾ベスト', VEST[lo.vest || 'none'].name], ['plate', '板の材質', PLATE[lo.plate || 'ceramic'].name], ['helmet', 'ヘルメット', HELMET[lo.helmet || 'none'].name], ['head', '頭', HEADWEAR[lo.head || 'none'].name]);
    return list;
  }
  options(slot) {
    const lo = this.cur(), side = this.side();
    const P = lo.primary || {}, W = WEAPONS[P.id];
    const allowedP = this.kind === 'pvp' ? PVP_ALLOWED[side].primary : Object.keys(WEAPONS).filter(id => { const x = WEAPONS[id]; return (x.side === 'swat' || x.side === 'both') && x.cat !== 'pistol' && id !== 'taser'; });
    const allowedS = this.kind === 'pvp' ? PVP_ALLOWED[side].secondary : Object.keys(WEAPONS).filter(id => { const x = WEAPONS[id]; return (x.side === 'swat' || x.side === 'both') && (x.cat === 'pistol' || id === 'taser'); });
    switch (slot) {
      case 'primary': return allowedP.map(id => ({ v: id, label: WEAPONS[id].name, sub: CAT_NAME[WEAPONS[id].cat] + ' · ' + (CAL[WEAPONS[id].cal] ? CAL[WEAPONS[id].cal].name : ''), on: P.id === id }));
      case 'secondary': return allowedS.map(id => ({ v: id, label: WEAPONS[id].name, sub: CAT_NAME[WEAPONS[id].cat], on: lo.secondary && lo.secondary.id === id }));
      case 'sight': case 'muzzle': case 'grip': return (attachOptions(P.id)[slot] || []).map(k => ({ v: k, label: ATTACH[slot][k].name, on: (P[slot] || (slot === 'sight' ? 'iron' : 'none')) === k }));
      case 'ammo': return (W ? W.ammo : []).map(k => ({ v: k, label: AMMO_NAME[k] || k, on: (P.ammo || W.ammo[0]) === k, sub: ammoSub(W, k) }));
      case 'long': return Object.keys(LONG).map(k => ({ v: k, label: LONG[k].name, sub: LONG[k].desc || '', on: (lo.long || 'none') === k }));
      case 'g0': case 'g1': case 'g2': {
        const pool = this.kind === 'pvp' ? PVP_ALLOWED[side].gear : PVE_GEAR;
        const cur = (lo.gear || [])[+slot[1]];
        return [{ v: 'none', label: 'なし', on: !cur }].concat(pool.map(k => ({ v: k, label: GEAR[k].name, sub: GEAR[k].desc, on: cur && cur[0] === k })));
      }
      case 'armor': return Object.keys(PVP_ARMOR).map(k => ({ v: k, label: PVP_ARMOR[k].name, on: (lo.armor || 'medium') === k }));
      case 'vest': return Object.keys(VEST).map(k => ({ v: k, label: VEST[k].name, on: (lo.vest || 'none') === k }));
      case 'plate': return Object.keys(PLATE).map(k => ({ v: k, label: PLATE[k].name, on: (lo.plate || 'ceramic') === k }));
      case 'helmet': return Object.keys(HELMET).map(k => ({ v: k, label: HELMET[k].name, on: (lo.helmet || 'none') === k }));
      case 'head': return Object.keys(HEADWEAR).map(k => ({ v: k, label: HEADWEAR[k].name, on: (lo.head || 'none') === k }));
    }
    return [];
  }
  pick(slot, v) {
    const lo = this.cur();
    lo.primary = lo.primary || {};
    switch (slot) {
      case 'primary': { const keep = lo.primary; lo.primary = { id: v }; const ao = attachOptions(v); for (const k of ['sight', 'muzzle', 'grip']) if (keep[k] && ao[k] && ao[k].includes(keep[k])) lo.primary[k] = keep[k]; else if (ao[k] && ao[k].length) lo.primary[k] = k === 'sight' ? (ao.sight.includes('holo') ? 'holo' : ao.sight[0]) : 'none'; lo.primary.ammo = WEAPONS[v].ammo[0]; break; }
      case 'secondary': lo.secondary = { id: v, ammo: WEAPONS[v].ammo[0] }; break;
      case 'sight': case 'muzzle': case 'grip': case 'ammo': lo.primary[slot] = v; break;
      case 'long': lo.long = v; break;
      case 'g0': case 'g1': case 'g2': { const i = +slot[1]; lo.gear = (lo.gear || []).slice(0, 3); while (lo.gear.length < 3) lo.gear.push(null); lo.gear[i] = v === 'none' ? null : [v, PERSLOT[v] || 1]; lo.gear = lo.gear.filter(Boolean); break; }
      case 'armor': lo.armor = v; break;
      case 'vest': case 'plate': case 'helmet': case 'head': lo[slot] = v; break;
    }
    this.save();
    this.render();
  }
  render() {
    const T = this.tabs(), slots = this.slots();
    if (!slots.some(s => s[0] === this.slot)) this.slot = 'primary';
    const opts = this.options(this.slot);
    const lo = this.cur();
    const info = this.slot === 'primary' || this.slot === 'sight' || this.slot === 'muzzle' || this.slot === 'grip' || this.slot === 'ammo' ? weaponCard(lo.primary, this.kind) : this.slot === 'secondary' ? weaponCard(lo.secondary, this.kind) : '';
    this.host.innerHTML = `<div class="lo-tabs">${T.map(([k, n], i) => `<button class="tab${i === this.tab ? ' on' : ''}" data-t="${i}">${n}</button>`).join('')}</div>
      <div class="lo">
        <div class="lo-slots scroll">${slots.map(([k, n, v]) => `<button class="slot${k === this.slot ? ' on' : ''}" data-s="${k}"><small>${n}</small><b>${esc(v)}</b></button>`).join('')}</div>
        <div class="lo-opts scroll">${opts.map(o => `<button class="opt${o.on ? ' on' : ''}" data-v="${esc(o.v)}"><b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')}</div>
        <div class="lo-info scroll">${info}</div>
      </div>`;
    this.host.querySelectorAll('.scroll').forEach(s => new Scroller(this.app.stage, s));
    this.host.querySelectorAll('[data-t]').forEach(b => onTap(b, () => { this.tab = +b.dataset.t; this.app.audio.ui('tap'); this.render(); }));
    this.host.querySelectorAll('[data-s]').forEach(b => onTap(b, () => { this.slot = b.dataset.s; this.app.audio.ui('tap'); this.render(); }));
    this.host.querySelectorAll('[data-v]').forEach(b => onTap(b, () => { this.app.audio.ui('tap'); this.pick(this.slot, b.dataset.v); }));
  }
}
function ammoSub(W, k) { const A = AMMO[W.cal] && AMMO[W.cal][k]; if (!A) return ''; return `胴${Math.round(A.dmg)}${A.pellets ? '×' + A.pellets : ''} · 手足×${A.limb} · 壁の貫通${A.pen} · 防具の貫通${A.apen}`; }
// 銃の説明と数値（棒グラフ）
export function weaponCard(spec, kind) {
  const W = spec && WEAPONS[spec.id];
  if (!W) return '';
  const A = AMMO[W.cal] && AMMO[W.cal][spec.ammo || W.ammo[0]];
  const dmg = kind === 'pvp' ? (W.pvp ? W.pvp.dmg * (W.pvp.pellets || 1) : 0) : A ? A.dmg * (A.pellets || 1) : 0;
  const bar = (label, v, max, txt) => `<div class="bar"><span>${label}</span><i><em style="width:${Math.max(3, Math.min(100, v / max * 100))}%"></em></i><b>${txt}</b></div>`;
  const rec = (W.rc ? W.rc.v * (W.rc.first || 1) : 1);
  return `<h3>${esc(W.name)}</h3><p class="sub">${CAT_NAME[W.cat]} · ${CAL[W.cal] ? CAL[W.cal].name : ''} · ${W.mag}発${W.modes ? ' · ' + W.modes.map(m => m === 'auto' ? '連射' : m === 'burst' ? '3点' : '単発').join('/') : ''}</p>
    ${bar('威力', dmg, kind === 'pvp' ? 130 : 200, Math.round(dmg))}
    ${bar('発射速度', W.rpm || 0, 1200, (W.rpm || 0) + '発/分')}
    ${bar('反動', rec, 4, rec.toFixed(1))}
    ${bar('構える速さ', 0.5 - (W.ads || 0.3), 0.4, (W.ads || 0).toFixed(2) + '秒')}
    ${bar('動きやすさ', (W.move || 1) - 0.8, 0.25, Math.round((W.move || 1) * 100) + '%')}
    ${A ? bar('壁の貫通', A.pen, 1300, String(A.pen)) : ''}
    <p class="desc">${esc(W.desc || '')}</p><p class="note">初速 ${W.vel || '-'} m/s · 重さ ${W.kg || '-'} kg</p>`;
}
