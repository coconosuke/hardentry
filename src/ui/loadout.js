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
    const S2 = lo.secondary || {}, W2 = WEAPONS[S2.id];
    const ao = W ? attachOptions(P.id) : {}, ao2 = W2 ? attachOptions(S2.id) : {};
    const g = (i) => { const x = (lo.gear || [])[i]; return x ? `${GEAR[x[0]] ? GEAR[x[0]].name.replace(/（.*）/, '') : x[0]} ×${x[1]}` : 'なし'; };
    const has = (o, k) => o[k] && o[k].length > 1;
    // 主武器と副武器: それぞれ照準器・マズル・グリップ・弾薬・ライト（付けられる物だけ）
    const list = [['primary', '主武器', W ? W.name : 'なし', 'h']];
    if (W) {
      if (has(ao, 'sight')) list.push(['sight', '照準器', ATTACH.sight[P.sight || 'iron'].name]);
      if (has(ao, 'muzzle')) list.push(['muzzle', 'マズル', ATTACH.muzzle[P.muzzle || 'none'].name]);
      if (has(ao, 'grip')) list.push(['grip', 'グリップ', ATTACH.grip[P.grip || 'none'].name]);
      if (W.ammo.length > 1) list.push(['ammo', '弾薬', AMMO_NAME[P.ammo || W.ammo[0]]]);
      if (hasLight(P.id)) list.push(['light', 'ライト', P.light === false ? 'なし' : 'あり']);
    }
    list.push(['secondary', '副武器', W2 ? W2.name : 'なし', 'h']);
    if (W2) {
      if (has(ao2, 'sight')) list.push(['sight2', '照準器', ATTACH.sight[S2.sight || 'iron'].name]);
      if (has(ao2, 'muzzle')) list.push(['muzzle2', 'マズル', ATTACH.muzzle[S2.muzzle || 'none'].name]);
      if (W2.ammo.length > 1) list.push(['ammo2', '弾薬', AMMO_NAME[S2.ammo || W2.ammo[0]]]);
      if (hasLight(S2.id)) list.push(['light2', 'ライト', S2.light === false ? 'なし' : 'あり']);
    }
    if (this.kind === 'pve') list.push(['long', '特殊装備', LONG[lo.long || 'none'].name, 'h']);
    list.push(['g0', '携行品 1', g(0), this.kind === 'pve' ? '' : 'h'], ['g1', '携行品 2', g(1)], ['g2', '携行品 3', g(2)]);
    if (this.kind === 'pvp') list.push(['armor', '防護', PVP_ARMOR[lo.armor || 'medium'].name, 'h']);
    else list.push(['vest', '防弾ベスト', VEST[lo.vest || 'none'].name, 'h'], ['plate', '防弾プレート', PLATE[lo.plate || 'ceramic'].name], ['helmet', 'ヘルメット', HELMET[lo.helmet || 'none'].name], ['head', '頭部装備', HEADWEAR[lo.head || 'none'].name]);
    return list;
  }
  options(slot) {
    const lo = this.cur(), side = this.side();
    const P = lo.primary || {}, W = WEAPONS[P.id];
    const S2 = lo.secondary || {}, W2 = WEAPONS[S2.id];
    const allowedP = this.kind === 'pvp' ? PVP_ALLOWED[side].primary : Object.keys(WEAPONS).filter(id => { const x = WEAPONS[id]; return (x.side === 'swat' || x.side === 'both') && x.cat !== 'pistol' && id !== 'taser'; });
    const allowedS = this.kind === 'pvp' ? PVP_ALLOWED[side].secondary : Object.keys(WEAPONS).filter(id => { const x = WEAPONS[id]; return (x.side === 'swat' || x.side === 'both') && (x.cat === 'pistol' || id === 'taser'); });
    const att = (spec, k, def) => (attachOptions(spec.id)[k] || []).map(v => ({ v, label: ATTACH[k][v].name, sub: attSub(k, v), on: (spec[k] || def) === v }));
    const onoff = (spec) => [{ v: 'on', label: 'あり', sub: 'ライトのボタンで点ける。暗い所で見やすいが、相手からも見つかりやすい。', on: spec.light !== false }, { v: 'off', label: 'なし', on: spec.light === false }];
    switch (slot) {
      case 'primary': return allowedP.map(id => ({ v: id, label: WEAPONS[id].name, sub: CAT_NAME[WEAPONS[id].cat] + ' · ' + (CAL[WEAPONS[id].cal] ? CAL[WEAPONS[id].cal].name : ''), on: P.id === id }));
      case 'secondary': return allowedS.map(id => ({ v: id, label: WEAPONS[id].name, sub: CAT_NAME[WEAPONS[id].cat], on: S2.id === id }));
      case 'sight': return att(P, 'sight', 'iron');
      case 'muzzle': return att(P, 'muzzle', 'none');
      case 'grip': return att(P, 'grip', 'none');
      case 'sight2': return att(S2, 'sight', 'iron');
      case 'muzzle2': return att(S2, 'muzzle', 'none');
      case 'ammo': return (W ? W.ammo : []).map(k => ({ v: k, label: AMMO_NAME[k] || k, on: (P.ammo || W.ammo[0]) === k, sub: ammoSub(W, k) }));
      case 'ammo2': return (W2 ? W2.ammo : []).map(k => ({ v: k, label: AMMO_NAME[k] || k, on: (S2.ammo || W2.ammo[0]) === k, sub: ammoSub(W2, k) }));
      case 'light': return onoff(P);
      case 'light2': return onoff(S2);
      case 'long': return Object.keys(LONG).map(k => ({ v: k, label: LONG[k].name, sub: LONG[k].desc || '', on: (lo.long || 'none') === k }));
      case 'g0': case 'g1': case 'g2': {
        const pool = this.kind === 'pvp' ? PVP_ALLOWED[side].gear : PVE_GEAR;
        const cur = (lo.gear || [])[+slot[1]];
        return [{ v: 'none', label: 'なし', on: !cur }].concat(pool.map(k => ({ v: k, label: GEAR[k].name, sub: GEAR[k].desc, on: cur && cur[0] === k })));
      }
      case 'armor': return Object.keys(PVP_ARMOR).map(k => ({ v: k, label: PVP_ARMOR[k].name, on: (lo.armor || 'medium') === k }));
      case 'vest': return Object.keys(VEST).map(k => ({ v: k, label: VEST[k].name, sub: VEST[k].desc || '', on: (lo.vest || 'none') === k }));
      case 'plate': return Object.keys(PLATE).map(k => ({ v: k, label: PLATE[k].name, sub: PLATE[k].desc || '', on: (lo.plate || 'ceramic') === k }));
      case 'helmet': return Object.keys(HELMET).map(k => ({ v: k, label: HELMET[k].name, sub: HELMET[k].desc || '', on: (lo.helmet || 'none') === k }));
      case 'head': return Object.keys(HEADWEAR).map(k => ({ v: k, label: HEADWEAR[k].name, sub: HEADWEAR[k].desc || '', on: (lo.head || 'none') === k }));
    }
    return [];
  }
  pick(slot, v) {
    const lo = this.cur();
    lo.primary = lo.primary || {};
    const keepAtt = (keep, id) => { const ao = attachOptions(id), o = { id }; for (const k of ['sight', 'muzzle', 'grip']) if (keep[k] && ao[k] && ao[k].includes(keep[k])) o[k] = keep[k]; else if (ao[k] && ao[k].length) o[k] = ao[k][0]; if (keep.light === false) o.light = false; o.ammo = WEAPONS[id].ammo[0]; return o; };
    switch (slot) {
      case 'primary': lo.primary = keepAtt(lo.primary || {}, v); break;
      case 'secondary': lo.secondary = keepAtt(lo.secondary || {}, v); break;
      case 'sight': case 'muzzle': case 'grip': case 'ammo': lo.primary[slot] = v; break;
      case 'sight2': case 'muzzle2': case 'ammo2': lo.secondary = lo.secondary || {}; lo.secondary[slot.slice(0, -1)] = v; break;
      case 'light': lo.primary.light = v === 'on'; break;
      case 'light2': lo.secondary = lo.secondary || {}; lo.secondary.light = v === 'on'; break;
      case 'long': lo.long = v; break;
      case 'g0': case 'g1': case 'g2': { const i = +slot[1]; lo.gear = (lo.gear || []).slice(0, 3); while (lo.gear.length < 3) lo.gear.push(null); lo.gear[i] = v === 'none' ? null : [v, PERSLOT[v] || 1]; lo.gear = lo.gear.filter(Boolean); break; }
      case 'armor': lo.armor = v; break;
      case 'vest': case 'plate': case 'helmet': case 'head': lo[slot] = v; break;
    }
    this.save();
    this.render({ keep: true });
  }
  // keep: スクロールの位置を保つ（選んだだけ）。枠を変えたときは候補の列だけ上へ
  render(o = {}) {
    const T = this.tabs(), slots = this.slots();
    if (!slots.some(s => s[0] === this.slot)) this.slot = 'primary';
    const old = {};
    for (const c of ['lo-slots', 'lo-opts', 'lo-info']) { const e = this.host.querySelector('.' + c); if (e) old[c] = e.scrollTop; }
    const tabRow = this.host.querySelector('.lo-tabs'); const oldTab = tabRow ? tabRow.scrollLeft : 0;
    const opts = this.options(this.slot);
    const lo = this.cur();
    const weaponSlot = ['primary', 'sight', 'muzzle', 'grip', 'ammo', 'light'].includes(this.slot);
    const secSlot = ['secondary', 'sight2', 'muzzle2', 'ammo2', 'light2'].includes(this.slot);
    const info = weaponSlot ? weaponCard(lo.primary, this.kind) : secSlot ? weaponCard(lo.secondary, this.kind) : this.slot === 'long' ? longCard(lo.long || 'none') : '';
    this.host.innerHTML = `<div class="lo-tabs tabs">${T.map(([k, n], i) => `<button class="tab${i === this.tab ? ' on' : ''}" data-t="${i}">${n}</button>`).join('')}</div>
      <div class="lo">
        <div class="lo-slots scroll">${slots.map(([k, n, v, hd]) => `<button class="slot${k === this.slot ? ' on' : ''}${hd ? ' head' : ' sub'}" data-s="${k}"><small>${n}</small><b>${esc(v)}</b></button>`).join('')}</div>
        <div class="lo-opts scroll">${opts.map(o => `<button class="opt${o.on ? ' on' : ''}" data-v="${esc(o.v)}"><b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')}</div>
        <div class="lo-info scroll">${info}</div>
      </div>`;
    this.host.querySelectorAll('.scroll').forEach(sc => new Scroller(this.app.stage, sc));
    const tr = this.host.querySelector('.lo-tabs'); const tsc = new Scroller(this.app.stage, tr, { x: true });
    // 位置を戻す
    const sl = this.host.querySelector('.lo-slots'), op = this.host.querySelector('.lo-opts'), inf = this.host.querySelector('.lo-info');
    if (old['lo-slots'] != null && o.keepSlots !== false) sl.scrollTop = old['lo-slots'];
    if (o.keep) { if (old['lo-opts'] != null) op.scrollTop = old['lo-opts']; if (old['lo-info'] != null) inf.scrollTop = old['lo-info']; }
    tr.scrollLeft = oldTab; tsc.edges();
    if (!o.keep && !old['lo-opts']) { const on = op.querySelector('.opt.on'); if (on && on.offsetTop > op.clientHeight - 40) op.scrollTop = on.offsetTop - op.clientHeight / 2; }
    this.host.querySelectorAll('[data-t]').forEach(b => onTap(b, () => { this.tab = +b.dataset.t; this.app.audio.ui('tap'); this.render({ keepSlots: true }); }));
    this.host.querySelectorAll('[data-s]').forEach(b => onTap(b, () => { this.slot = b.dataset.s; this.app.audio.ui('tap'); this.render({}); }));
    this.host.querySelectorAll('[data-v]').forEach(b => onTap(b, () => { this.app.audio.ui('tap'); this.pick(this.slot, b.dataset.v); }));
  }
}
// ライトを付けられる銃か（拳銃はレールがあるものだけ）
function hasLight(id) { const W = WEAPONS[id]; if (!W) return false; if (W.cat !== 'pistol') return W.cat !== 'less'; return !['makarov', 'python', 'm1911'].includes(W.model) || !!(W.mdl && W.mdl.rail); }
function attSub(k, v) {
  const A = ATTACH[k] && ATTACH[k][v]; if (!A) return '';
  const t = [];
  if (A.zoom && A.zoom > 1.01) t.push(`倍率${A.zoom.toFixed(1)}`);
  if (A.ads) t.push(`構える時間${A.ads > 0 ? '+' : ''}${Math.round(A.ads * 1000)}ms`);
  if (A.rcv && A.rcv !== 1) t.push(`縦の反動${Math.round((A.rcv - 1) * 100)}%`);
  if (A.rch && A.rch !== 1) t.push(`横の反動${Math.round((A.rch - 1) * 100)}%`);
  if (A.rcfirst && A.rcfirst !== 1) t.push(`初弾の跳ね${Math.round((A.rcfirst - 1) * 100)}%`);
  if (A.noise && A.noise !== 1) t.push(A.noise < 1 ? '銃声が小さい' : '銃声が大きい');
  if (A.flash != null && A.flash < 0.5) t.push('発射炎が見えにくい');
  return t.join(' · ');
}
function ammoSub(W, k) { const A = AMMO[W.cal] && AMMO[W.cal][k]; if (!A) return ''; return `胴${Math.round(A.dmg)}${A.pellets ? '×' + A.pellets : ''} · 手足×${A.limb} · 壁の貫通${A.pen} · 防具の貫通${A.apen}`; }
// 特殊装備の説明と使い方
function longCard(k) {
  const L = LONG[k];
  if (!L || k === 'none') return '<p class="desc">特殊装備は1つだけ持てる。盾・破城槌・ブリーチング用の散弾銃・オプティワンド・M320 から選ぶ。</p>';
  const rounds = L.rounds ? Object.entries(L.rounds).map(([r, n]) => `${{ flash: '閃光弾', stinger: 'スティンガー弾', cs: 'CSガス弾' }[r] || r} ${n}発`).join('・') : '';
  return `<h3>${esc(L.name)}</h3><p class="desc">${esc(L.desc || '')}</p>${L.how ? `<p class="how"><b>使い方</b>${esc(L.how)}</p>` : ''}${rounds ? `<p class="note">弾: ${rounds}</p>` : ''}<p class="note">移動の速さ ${Math.round((L.move || 1) * 100)}%</p>`;
}
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
