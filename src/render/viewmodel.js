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
    this.M = new Float32Array(16); this.Mm = new Float32Array(16);
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
    const gm = wi ? this.av.gunMesh(wi.id, wi.att) : null;
    const P = gm ? gm.g.pts : { sightY: 0.05, eyeZ: -0.3, muzzle: 0.3, gripR: [0, -0.08, -0.05], gripL: [0, -0.04, 0.2] };
    const pistol = !!P.pistol;
    // 状態の重み
    const ads = sm(a.ads), low = sm(a.low), spr = a.sprint ? 1 : 0;
    this.sprK = lerp(this.sprK || 0, spr, 1 - Math.exp(-dt * 10));
    let draw = 0;
    if (ws.st === 'holster') draw = 1 - clamp(ws.t / 0.22, 0, 1);
    else if (ws.st === 'draw') draw = clamp(ws.t / Math.max(0.2, W ? W.draw : 0.3), 0, 1);
    this.drawK = lerp(this.drawK, draw, 1 - Math.exp(-dt * 25));
    const act = a.act ? 1 : 0;
    this.actK = lerp(this.actK || 0, act, 1 - Math.exp(-dt * 8));
    // 位置（カメラ空間: x右 y上 z前）と回転
    const hip = pistol ? [0.115, -0.135, 0.4] : [0.135, -0.15, 0.27];
    const adsP = [0, -P.sightY, -P.eyeZ];
    let px = lerp(hip[0], adsP[0], ads), py = lerp(hip[1], adsP[1], ads) - bell(a.ads) * 0.012, pz = lerp(hip[2], adsP[2], ads);
    let yaw = lerp(pistol ? 0.03 : 0.05, 0, ads), pitch = 0, roll = 0;
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
    pz -= 0.022 * fk * kick * (1 - 0.45 * ads); pitch += (pistol ? 0.09 : 0.028) * fk * kick; roll += 0.018 * fk * (this.rollSign || 1);
    // リロード
    let magOff = 0, magHide = false, pumpOff = 0, lhand = null, rel = -1;
    if (ws.st === 'reload' && ws.rd > 0) {
      rel = 1 - ws.t / ws.rd;
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
    }
    this._arms(shR, hR, shL, hL, gF, gU, R, U);
  }

  _arms(shR, hR, shL, hL, gF, gU, R, U) {
    const B = new MeshBuilder();
    const down = [-U[0], -U[1], -U[2]];
    const poleR = [R[0] * 0.6 + down[0], R[1] * 0.6 + down[1], R[2] * 0.6 + down[2]];
    const poleL = [-R[0] * 0.6 + down[0], -R[1] * 0.6 + down[1], -R[2] * 0.6 + down[2]];
    const eR = ik2(shR, hR, 0.3, 0.29, poleR), eL = ik2(shL, hL, 0.3, 0.29, poleL);
    for (const [sh, el, hd] of [[shR, eR, hR], [shL, eL, hL]]) {
      B.tube(sh, el, 0.05, 0.045, 8, LAYER.cloth, this.sleeve);
      // 手首の少し手前までが袖、先は手袋
      const wr = lerpV(el, hd, 0.86);
      B.tube(el, wr, 0.045, 0.036, 8, LAYER.cloth, this.sleeve, { caps: true });
      B.tube(wr, hd, 0.031, 0.03, 7, LAYER.rubber, this.glove);
      // こぶし
      const dir = norm3([hd[0] - el[0], hd[1] - el[1], hd[2] - el[2]]);
      const tip = [hd[0] + dir[0] * 0.07 - gU[0] * 0.02, hd[1] + dir[1] * 0.07 - gU[1] * 0.02, hd[2] + dir[2] * 0.07 - gU[2] * 0.02];
      B.tube(hd, tip, 0.036, 0.03, 6, LAYER.rubber, this.glove, { caps: true });
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
    // 腕
    if (this.armN) {
      gl.uniformMatrix4fv(P.u.uModel, false, r.ident);
      gl.bindVertexArray(this.armVAO);
      gl.drawElements(gl.TRIANGLES, this.armN, gl.UNSIGNED_SHORT, 0);
    }
    gl.uniform1f(P.u.uRoomOverride, -1);
    gl.uniformMatrix4fv(P.u.uModel, false, r.ident);
  }
}
function lerpV(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function norm3(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
