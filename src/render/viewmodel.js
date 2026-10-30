// 一人称の腕と銃: 腰だめ↔ADS（照準の線を目に合わせる）、揺れ（向きの慣性・歩き・呼吸）、撃った跳ね、リロード・ポンプ・持ち替え・ローレディ・ダッシュ・投げ物
import { MeshBuilder, hex, mulc } from './build.js';
import { LAYER } from './textures.js';
import { makeWorldMesh, drawMesh } from './renderer.js';
import { WEAPONS } from '../engine/data/weapons.js';
import { GEAR } from '../engine/data/equipment.js';
import { curWeapon } from '../engine/actor.js';
import { WV } from './build.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const bell = (t) => Math.sin(Math.PI * clamp(t, 0, 1));
const lerp = (a, b, t) => a + (b - a) * t;
function rot(v, ax, ang) { const c = Math.cos(ang), s = Math.sin(ang), d = ax[0] * v[0] + ax[1] * v[1] + ax[2] * v[2]; const cr = [ax[1] * v[2] - ax[2] * v[1], ax[2] * v[0] - ax[0] * v[2], ax[0] * v[1] - ax[1] * v[0]]; return [v[0] * c + cr[0] * s + ax[0] * d * (1 - c), v[1] * c + cr[1] * s + ax[1] * d * (1 - c), v[2] * c + cr[2] * s + ax[2] * d * (1 - c)]; }
function ik2(a, t, l1, l2, pole) {
  let d = [t[0] - a[0], t[1] - a[1], t[2] - a[2]]; let L = Math.hypot(d[0], d[1], d[2]);
  const maxL = (l1 + l2) * 0.999; if (L > maxL) { d = d.map(x => x * maxL / L); L = maxL; }
  const dn = d.map(x => x / Math.max(L, 1e-4));
  const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const pd = pole[0] * dn[0] + pole[1] * dn[1] + pole[2] * dn[2];
  let p = [pole[0] - dn[0] * pd, pole[1] - dn[1] * pd, pole[2] - dn[2] * pd]; const pl = Math.hypot(p[0], p[1], p[2]) || 1; p = p.map(q => q / pl);
  return [a[0] + dn[0] * x + p[0] * h, a[1] + dn[1] * x + p[1] * h, a[2] + dn[2] * x + p[2] * h];
}

export class ViewModel {
  constructor(r, av) {
    this.r = r; this.av = av; this.gl = r.gl;
    this.on = false;
    this.sway = [0, 0]; this.swayV = [0, 0]; this.lastYaw = null; this.lastPitch = null;
    this.t = 0; this.drawK = 1; this.kick = 0; this.shotN = 0;
    this.M = new Float32Array(16); this.Mm = new Float32Array(16); this.Ms = new Float32Array(16); this.shieldOn = false;
    this.armVB = null; this.armN = 0;
    this.sleeve = hex('#232c3b'); this.glove = hex('#1c1d20');
    this.nadeMeshes = {};
    this.out = { muzzle: [0, 0, 0], fwd: [0, 0, 1], light: null, eject: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0] };
    r.hooks.viewmodel.push((rr, f) => this.draw(f));
  }
  setColors(sleeve, glove) { this.sleeve = sleeve; this.glove = glove; }
  nadeMesh(id) {
    if (this.nadeMeshes[id]) return this.nadeMeshes[id];
    const B = new MeshBuilder();
    const col = id === 'flash' ? hex('#3a4a3a') : id === 'stinger' ? hex('#3a3a40') : id === 'cs' ? hex('#5a5a40') : hex('#4a4a4a');
    B.cyl(0, 0, -0.06, 0.06, 0.03, 0.03, 10, LAYER.metal, col, { capB: true });
    B.cyl(0, 0, 0.06, 0.085, 0.012, 0.012, 6, LAYER.metal, hex('#8a8a80'));
    B.box(0.006, 0.02, -0.012, 0.012, 0.09, 0.012, LAYER.metal, hex('#9a9a90'));
    const m = makeWorldMesh(this.gl, B);
    this.nadeMeshes[id] = m;
    return m;
  }

  // このこまの銃と腕の位置を決める。a: 自分（エンジンの人）、cam: カメラ（世界）
  update(a, cam, dt, o = {}) {
    this.on = !!(a && a.alive && !a.down);
    if (!this.on) return;
    this.t += dt;
    const W = curWeapon(a) ? WEAPONS[curWeapon(a).id] : null;
    const wi = curWeapon(a);
    const ws = a.ws;
    // カメラの軸（ロール込み）
    const cp = Math.cos(cam.pitch), F = [Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp];
    let R = [-Math.cos(cam.yaw), 0, Math.sin(cam.yaw)];
    let U = [R[1] * F[2] - R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1] - R[1] * F[0]];
    if (cam.roll) { const c = Math.cos(cam.roll), s = Math.sin(cam.roll); const U2 = [U[0] * c + R[0] * s, U[1] * c + R[1] * s, U[2] * c + R[2] * s]; R = [R[0] * c - U[0] * s, R[1] * c - U[1] * s, R[2] * c - U[2] * s]; U = U2; }
    // 揺れ（向きの慣性）
    if (this.lastYaw != null) {
      let dy = cam.yaw - this.lastYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const dp = cam.pitch - this.lastPitch;
      const k = 1 - 0.75 * a.ads;
      this.swayV[0] += clamp(-dy / Math.max(dt, 1e-3) * 0.012, -0.08, 0.08) * k;
      this.swayV[1] += clamp(-dp / Math.max(dt, 1e-3) * 0.012, -0.08, 0.08) * k;
    }
    this.lastYaw = cam.yaw; this.lastPitch = cam.pitch;
    for (let i = 0; i < 2; i++) { this.sway[i] += this.swayV[i]; this.swayV[i] = 0; this.sway[i] *= Math.exp(-dt * 9); this.sway[i] = clamp(this.sway[i], -0.12, 0.12); }
    // 手に持った特殊装備（slot 3）か銃
    const L3 = ws.slot === 3 && a.inv.long && a.inv.long !== 'none' ? a.inv.long : null;
    const gm = L3 ? this.av.longMesh(L3) : wi ? this.av.gunMesh(wi.id, wi.att) : null;
    const shieldUp = a.inv.long === 'shield' && ws.slot === 1 && !a.vault && ws.st !== 'holster';
    const P = gm ? gm.g.pts : { sightY: 0.05, eyeZ: -0.3, muzzle: 0.3, gripR: [0, -0.08, -0.05], gripL: [0, -0.04, 0.2] };
    const pistol = !!P.pistol;
    // 状態の重み
    const ads = sm(a.ads), low = sm(a.low), spr = a.sprint ? 1 : 0;
    this.sprK = lerp(this.sprK || 0, spr, 1 - Math.exp(-dt * 10));
    let draw = 0;
    if (ws.st === 'holster') draw = 1 - clamp(ws.t / 0.22, 0, 1);
    else if (ws.st === 'draw') draw = clamp(ws.t / Math.max(0.2, W ? W.draw : 0.3), 0, 1);
    this.drawK = lerp(this.drawK, draw, 1 - Math.exp(-dt * 25));
    // 特殊装備そのものを使う動作（破城槌・散弾・ワンド）は銃を下げない
    const ownAct = !!(a.act && L3 && ((L3 === 'ram' && a.act.k === 'ram') || (L3 === 'breacher' && a.act.k === 'breach') || (L3 === 'wand' && a.act.k === 'wand')));
    const act = a.act && !ownAct ? 1 : 0;
    this.actK = lerp(this.actK || 0, act, 1 - Math.exp(-dt * 8));
    // 位置（カメラ空間: x右 y上 z前）と回転
    // 腰だめ: 画面の右下に収まり、銃口が画面の中央の少し下へ向く（スマホの小さい画面で大きすぎないよう、少し遠く・低く）
    const hip = P.heavy ? [0.05, -0.25, 0.5] : L3 === 'wand' ? [0.09, -0.2, 0.4] : pistol ? [0.105, -0.112, 0.4] : [0.128, -0.128, 0.36];
    // 照準の窓が画面に対して大きすぎないよう、目を少し後ろに（スマホの小さい画面向け）
    const adsP = [0, -P.sightY, -P.eyeZ + (P.optic && !P.optic.scope ? (pistol ? 0.03 : 0.09) : 0.04)];
    let px = lerp(hip[0], adsP[0], ads), py = lerp(hip[1], adsP[1], ads) - bell(a.ads) * 0.012, pz = lerp(hip[2], adsP[2], ads);
    let yaw = lerp(pistol ? 0.03 : 0.05, 0, ads), pitch = 0, roll = 0;
    // 破城槌は体の前で斜めに抱える
    if (P.heavy) { yaw = 0.5; pitch = -0.1; roll = 0.22; }
    // 歩き・呼吸
    const amp = clamp(a.spd / 2.4, 0, 1.6) * (1 - 0.82 * ads) * (a.ground ? 1 : 0.3);
    const ph = a.phase || 0;
    px += Math.sin(ph) * 0.007 * amp; py += -Math.abs(Math.cos(ph)) * 0.011 * amp + Math.sin(this.t * 1.7) * 0.0018 * (1 - 0.7 * ads);
    roll += Math.sin(ph) * 0.02 * amp; pitch += Math.sin(this.t * 1.25) * 0.004 * (1 - 0.7 * ads);
    // 揺れ
    yaw += this.sway[0] * 0.6; pitch += this.sway[1] * 0.6; px -= this.sway[0] * 0.04; py -= this.sway[1] * 0.03;
    // ローレディ・ダッシュ・動作中・持ち替え
    const lowK = Math.max(low, this.actK * 0.9);
    pitch -= 0.62 * lowK; py -= 0.05 * lowK; pz -= 0.04 * lowK; px += 0.02 * lowK;
    yaw += 0.95 * this.sprK; roll += 0.45 * this.sprK; pitch -= 0.25 * this.sprK; px -= 0.02 * this.sprK; py -= 0.04 * this.sprK;
    pitch -= 1.1 * this.drawK; py -= 0.22 * this.drawK;
    // 撃った跳ね
    const fk = clamp(a.fireK || 0, 0, 1);
    if ((a.stats.sh || 0) !== this.shotN) { this.shotN = a.stats.sh || 0; this.rollSign = (this.shotN % 2 ? 1 : -1); }
    const kick = W ? W.rc.kick : 1;
    pz -= 0.022 * fk * kick * (1 - 0.45 * ads); pitch += (pistol ? 0.09 : L3 === 'm320' ? 0.16 : 0.028) * fk * kick; roll += 0.018 * fk * (this.rollSign || 1);
    // 破城槌を振る・散弾で撃つ
    if (ownAct) {
      const t = clamp(a.act.t / Math.max(0.05, a.act.dur), 0, 1);
      if (L3 === 'ram') { pz += t < 0.55 ? -0.12 * sm(t / 0.55) : -0.12 + 0.36 * sm((t - 0.55) / 0.3); py += 0.05 * bell(t); }
      else if (L3 === 'breacher') { pitch -= 0.25 * sm(t / 0.3); py -= 0.06 * sm(t / 0.3); if (t > 0.85) { pitch += 0.2 * bell((t - 0.85) / 0.15); pz -= 0.04 * bell((t - 0.85) / 0.15); } }
      else if (L3 === 'wand') { pitch -= 0.6 * sm(t); py -= 0.1 * sm(t); }
    }
    // リロード
    let magOff = 0, magHide = false, pumpOff = 0, lhand = null, rel = -1;
    const longRl = ws.slot === 3 && ws.lt > 0 && ws.rd > 0;
    if ((ws.st === 'reload' || longRl) && ws.rd > 0) {
      rel = 1 - (longRl ? ws.lt : ws.t) / ws.rd;
      const b = bell(rel);
      roll -= 0.5 * b; pitch += 0.12 * b; px -= 0.025 * b; py += 0.02 * b; pz -= 0.02 * b;
      if (P.revolver || P.breakAction) { roll -= 0.4 * b; }
      else {
        if (rel > 0.12 && rel < 0.35) magOff = -0.3 * sm((rel - 0.12) / 0.23);
        else if (rel >= 0.35 && rel < 0.58) magHide = true;
        else if (rel >= 0.58 && rel < 0.75) magOff = -0.22 * (1 - sm((rel - 0.58) / 0.17));
      }
    } else if (ws.st === 'shell') {
      const per = W && W.rl.shell ? W.rl.shell : 0.5;
      const c = (ws.t % per) / per;
      roll -= 0.55; pitch += 0.1; px -= 0.02; rel = 1 - c;
    } else if (ws.st === 'pump') {
      const pr = 1 - clamp(ws.t / (W && W.pump ? W.pump : 0.5), 0, 1);
      pumpOff = -(P.pumpZ || 0.08) * bell(pr);
    }
    // 投げ物を持っている
    const nade = ws.slot === 2 && ws.gear && GEAR[ws.gear] && GEAR[ws.gear].kind === 'nade';
    this.nade = nade ? ws.gear : null;
    // 世界へ
    let gR = R, gU = U, gF = F;
    const rotAll = (ax, ang) => { gR = rot(gR, ax, ang); gU = rot(gU, ax, ang); gF = rot(gF, ax, ang); };
    rotAll(U, yaw); rotAll(gR, pitch); rotAll(gF, -roll);
    const cx = cam.x, cy = cam.y, cz = cam.z;
    const org = [cx + R[0] * px + U[0] * py + F[0] * pz, cy + R[1] * px + U[1] * py + F[1] * pz, cz + R[2] * px + U[2] * py + F[2] * pz];
    const M = this.M;
    M[0] = -gR[0]; M[1] = -gR[1]; M[2] = -gR[2]; M[3] = 0;
    M[4] = gU[0]; M[5] = gU[1]; M[6] = gU[2]; M[7] = 0;
    M[8] = gF[0]; M[9] = gF[1]; M[10] = gF[2]; M[11] = 0;
    M[12] = org[0]; M[13] = org[1]; M[14] = org[2]; M[15] = 1;
    this.gm = nade ? null : gm; this.magOff = magOff; this.magHide = magHide; this.pumpOff = pumpOff;
    const toW = (p) => [org[0] - gR[0] * p[0] + gU[0] * p[1] + gF[0] * p[2], org[1] - gR[1] * p[0] + gU[1] * p[1] + gF[1] * p[2], org[2] - gR[2] * p[0] + gU[2] * p[1] + gF[2] * p[2]];
    const camP = (x, y, z) => [cx + R[0] * x + U[0] * y + F[0] * z, cy + R[1] * x + U[1] * y + F[1] * z, cz + R[2] * x + U[2] * y + F[2] * z];
    this.out.muzzle = toW([0, 0, P.muzzle]); this.out.fwd = gF; this.out.right = gR; this.out.up = gU;
    this.out.eject = toW([-0.02, 0.025, 0.02]);
    this.out.light = P.lightPt && wi && wi.lightOn ? toW(P.lightPt) : null;
    // 盾: 画面の左下。ADSでは下げて、拳銃の照準の邪魔にならないように
    this.shieldOn = shieldUp;
    let shieldHand = null;
    if (shieldUp) {
      const sx = lerp(-0.3, -0.35, ads) + Math.sin(ph) * 0.006 * amp - this.sway[0] * 0.03, sy = lerp(-0.4, -0.53, ads) - Math.abs(Math.cos(ph)) * 0.01 * amp - 0.3 * this.drawK - 0.2 * this.actK - this.sway[1] * 0.02, sz = lerp(0.56, 0.54, ads);
      const sc = camP(sx, sy, sz);
      // 少し右へ向けて、体の前を覆う
      const yawS = 0.12, cs = Math.cos(yawS), sn = Math.sin(yawS);
      const f2 = [F[0] * cs - R[0] * sn, F[1] * cs - R[1] * sn, F[2] * cs - R[2] * sn];
      const l2 = [-(R[0] * cs + F[0] * sn), -(R[1] * cs + F[1] * sn), -(R[2] * cs + F[2] * sn)];
      const S2 = this.Ms;
      S2[0] = l2[0]; S2[1] = l2[1]; S2[2] = l2[2]; S2[3] = 0; S2[4] = U[0]; S2[5] = U[1]; S2[6] = U[2]; S2[7] = 0;
      S2[8] = f2[0]; S2[9] = f2[1]; S2[10] = f2[2]; S2[11] = 0; S2[12] = sc[0]; S2[13] = sc[1]; S2[14] = sc[2]; S2[15] = 1;
      shieldHand = camP(sx + 0.01, sy - 0.02, sz - 0.07);
    }
    // 腕: 肩（カメラ空間）→ 手
    const shR = camP(0.17, -0.25, -0.08), shL = camP(-0.17, -0.24, -0.05);
    let hR, hL;
    if (nade) {
      const th = clamp(a.throwT || 0, 0, 1);
      hR = camP(0.12 + th * 0.05, -0.13 + th * 0.12, 0.28 + th * 0.18);
      hL = camP(-0.06, -0.16, 0.3);
      this.nadeM = this.Mm;
      const n = this.Mm; n.set([-R[0], -R[1], -R[2], 0, U[0], U[1], U[2], 0, F[0], F[1], F[2], 0, hR[0] + U[0] * 0.03, hR[1] + U[1] * 0.03, hR[2] + U[2] * 0.03, 1]);
    } else {
      hR = toW(P.gripR);
      hL = toW(P.gripL);
      if (rel >= 0 && !P.tube) {
        const well = toW(P.magWell || [0, -0.08, 0.04]);
        const pouch = camP(-0.12, -0.42, 0.18);
        const mag2 = [well[0] + gU[0] * magOff, well[1] + gU[1] * magOff, well[2] + gU[2] * magOff];
        if (rel < 0.12) hL = lerpV(hL, well, sm(rel / 0.12));
        else if (rel < 0.35) hL = mag2;
        else if (rel < 0.58) hL = lerpV(mag2, pouch, sm((rel - 0.35) / 0.1) - sm((rel - 0.48) / 0.1));
        else if (rel < 0.75) hL = mag2;
        else hL = lerpV(well, toW(P.gripL), sm((rel - 0.75) / 0.2));
        if (pistol) hR = toW(P.gripR);
      } else if (rel >= 0 && P.tube) {
        const port = toW(P.magWell || [0, -0.04, 0.05]);
        const below = [port[0] - gU[0] * 0.12, port[1] - gU[1] * 0.12, port[2] - gU[2] * 0.12];
        hL = lerpV(below, port, bell(1 - rel));
      }
      if (pumpOff) hL = [hL[0] + gF[0] * pumpOff, hL[1] + gF[1] * pumpOff, hL[2] + gF[2] * pumpOff];
      if (this.sprK > 0.5 && pistol) hL = camP(-0.15, -0.35, 0.2);
      if (shieldHand) hL = shieldHand;
    }
    this._arms(shR, hR, shL, hL, gF, gU, R, U);
  }

  _arms(shR, hR, shL, hL, gF, gU, R, U) {
    const B = new MeshBuilder();
    const down = [-U[0], -U[1], -U[2]];
    const poleR = [R[0] * 0.6 + down[0], R[1] * 0.6 + down[1], R[2] * 0.6 + down[2]];
    const poleL = [-R[0] * 0.6 + down[0], -R[1] * 0.6 + down[1], -R[2] * 0.6 + down[2]];
    const eR = ik2(shR, hR, 0.3, 0.29, poleR), eL = ik2(shL, hL, 0.3, 0.29, poleL);
    const gloveD = [this.glove[0] * 0.75, this.glove[1] * 0.75, this.glove[2] * 0.75];
    const sleeveD = [this.sleeve[0] * 0.8, this.sleeve[1] * 0.8, this.sleeve[2] * 0.8];
    // 手の向きの箱（中心 c、軸 r u f、半分の長さ）
    const hbox = (c, r, u, f, hx, hy, hz, col, rad) => { B.xf = [r[0], r[1], r[2], u[0], u[1], u[2], f[0], f[1], f[2], c[0], c[1], c[2]]; B.bbox(-hx, -hy, -hz, hx, hy, hz, rad, LAYER.rubber, col); B.xf = null; };
    let side = 1;
    for (const [sh, el, hd] of [[shR, eR, hR], [shL, eL, hL]]) {
      B.tube(sh, el, 0.052, 0.046, 9, LAYER.cloth, this.sleeve);
      // 肘のしわ（少し太い輪）
      B.tube(lerpV(sh, el, 0.9), lerpV(el, hd, 0.06), 0.05, 0.049, 9, LAYER.cloth, sleeveD);
      // 手首の少し手前までが袖、先は手袋（袖口は濃い色）
      const wr = lerpV(el, hd, 0.84);
      B.tube(el, wr, 0.046, 0.038, 9, LAYER.cloth, this.sleeve);
      B.tube(lerpV(el, hd, 0.8), wr, 0.041, 0.04, 9, LAYER.cloth, sleeveD, { caps: true });
      B.tube(wr, hd, 0.032, 0.03, 8, LAYER.rubber, this.glove);
      // 手: 手のひら（平たい箱）・握った指（下へ巻く）・親指（銃の横へ）。手袋の縫い目の濃い帯
      const f = norm3([hd[0] - el[0], hd[1] - el[1], hd[2] - el[2]]);
      let r = norm3([gU[1] * f[2] - gU[2] * f[1], gU[2] * f[0] - gU[0] * f[2], gU[0] * f[1] - gU[1] * f[0]]);
      const u = norm3([f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]]);
      const at = (a, b, c) => [hd[0] + f[0] * a + u[0] * b + r[0] * c, hd[1] + f[1] * a + u[1] * b + r[1] * c, hd[2] + f[2] * a + u[2] * b + r[2] * c];
      hbox(at(0.035, 0, 0), r, u, f, 0.04, 0.022, 0.042, this.glove, 0.012);
      hbox(at(0.07, -0.022, 0), r, u, f, 0.038, 0.026, 0.02, gloveD, 0.011);
      hbox(at(0.008, 0.004, 0), r, u, f, 0.037, 0.024, 0.008, gloveD, 0.006);
      B.tube(at(0.02, 0.01, -0.034 * side), at(0.07, 0.006, -0.03 * side), 0.012, 0.01, 6, LAYER.rubber, this.glove, { caps: true });
      side = -1;
    }
    const { v, i } = B.arrays();
    const gl = this.gl;
    if (!this.armVB) {
      this.armVAO = gl.createVertexArray(); gl.bindVertexArray(this.armVAO);
      this.armVB = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.armVB); gl.bufferData(gl.ARRAY_BUFFER, 64 * 1024, gl.DYNAMIC_DRAW);
      const st = WV * 4, at = (l, n, o) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, st, o * 4); };
      at(0, 3, 0); at(1, 3, 3); at(2, 2, 6); at(3, 1, 8); at(4, 3, 9); at(5, 1, 12); at(6, 1, 13); at(7, 1, 14);
      this.armIB = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.armIB); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, 16 * 1024, gl.DYNAMIC_DRAW);
      gl.bindVertexArray(null);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.armVB); gl.bufferSubData(gl.ARRAY_BUFFER, 0, v);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.armIB); gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, new Uint16Array(i));
    this.armN = i.length;
  }

  draw(f) {
    if (!this.on || f.hideVM) return;
    const r = this.r, gl = this.gl, P = r.P.world;
    r._bindLight(P, f);
    gl.uniformMatrix4fv(P.u.uVP, false, r.vmVP);
    if (P.u.uVM) gl.uniform1f(P.u.uVM, 1);
    if (f.vm && f.vm.room != null) gl.uniform1f(P.u.uRoomOverride, f.vm.room);
    // 銃
    if (this.gm) {
      gl.uniformMatrix4fv(P.u.uModel, false, this.M);
      drawMesh(gl, this.gm.body);
      if (this.gm.mag && !this.magHide) {
        const M2 = this.Mm, M = this.M;
        M2.set(M);
        M2[12] += M[4] * this.magOff; M2[13] += M[5] * this.magOff; M2[14] += M[6] * this.magOff;
        gl.uniformMatrix4fv(P.u.uModel, false, M2);
        drawMesh(gl, this.gm.mag);
      }
      if (this.gm.pump) {
        const M2 = this.Mm, M = this.M;
        M2.set(M);
        M2[12] += M[8] * this.pumpOff; M2[13] += M[9] * this.pumpOff; M2[14] += M[10] * this.pumpOff;
        gl.uniformMatrix4fv(P.u.uModel, false, M2);
        drawMesh(gl, this.gm.pump);
      }
    } else if (this.nade) {
      gl.uniformMatrix4fv(P.u.uModel, false, this.Mm);
      drawMesh(gl, this.nadeMesh(this.nade));
    }
    // 盾
    if (this.shieldOn) {
      const sm = this.av.shieldMesh();
      gl.uniformMatrix4fv(P.u.uModel, false, this.Ms);
      drawMesh(gl, sm.body);
    }
    // 腕
    if (this.armN) {
      gl.uniformMatrix4fv(P.u.uModel, false, r.ident);
      gl.bindVertexArray(this.armVAO);
      gl.drawElements(gl.TRIANGLES, this.armN, gl.UNSIGNED_SHORT, 0);
    }
    gl.uniform1f(P.u.uRoomOverride, -1);
    if (P.u.uVM) gl.uniform1f(P.u.uVM, 0);
    gl.uniformMatrix4fv(P.u.uModel, false, r.ident);
  }
}
function lerpV(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function norm3(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
