// 人・持っている銃・落ちている物を描く（renderer のフックに入れる）
import { personMeshData, lookFor, boneMatrices, SV } from './people.js';
import { sunVisAt } from '../war/render.js';
import { gunModel, longModel, shieldModel } from './guns.js';
import { makeWorldMesh, drawMesh } from './renderer.js';
import { computePose, NBONE } from '../engine/pose.js';
import { poseInput } from '../engine/combat.js';
import { curWeapon } from '../engine/actor.js';
import { CS, LH } from '../engine/world.js';
import { aabbVisible } from './math.js';
import { MeshBuilder, hex, mulc } from './build.js';
import { LAYER } from './textures.js';

function vaoSkin(gl, v, i) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
  const st = SV * 4, at = (l, n, o) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, st, o * 4); };
  at(0, 3, 0); at(1, 3, 3); at(2, 2, 6); at(3, 1, 8); at(4, 1, 9); at(5, 1, 10); at(6, 1, 11);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, i, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, n: i.length, type: i instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
}

export class ActorView {
  constructor(r) {
    this.r = r; this.gl = r.gl;
    // 人と銃の形は描き手（renderer）ごとに共有する（試合ごとに作り直して GPU に残し続けない）
    this.people = r._people || (r._people = new Map()); this.guns = r._guns || (r._guns = new Map()); this.looks = new Map();
    this.bones = new Float32Array(NBONE * 12); this.mats = new Float32Array(NBONE * 16);
    this.pi = {}; this.M = new Float32Array(16);
    this.list = []; // このこまに描く人
    this.items = [];
    this.hidden = new Set(); // 一人称で自分は描かない
    this._off = [r.hook('opaque', (rr, f) => this.drawOpaque(f)), r.hook('shadow', (rr, pl) => this.drawShadow(pl))];
  }
  dispose() { for (const f of this._off || []) f(); this._off = []; this.list.length = 0; this.items.length = 0; }
  look(a) {
    let L = this.looks.get(a.id);
    if (L && L.v === a._lookV) return L;
    const ar = a.armor || {};
    const kind = a.kind === 'bot' ? 'sus' : a.kind;
    const o = { seed: a.look && a.look.seed || a.id * 977, kind: a.kind === 'swat' || (a.kind === 'bot' && a.team === 0) ? 'swat' : kind, armor: ar.vest || 'none', helmet: ar.helmet || 'none', head: ar.head || 'none', prof: a.ai && a.ai.prof, pro: a.ai && a.ai.prof === 'pro' };
    if (a.pvpSide === 'sus') { o.kind = 'sus'; o.armor = a.pvpArmor === 'light' ? 'none' : 'vestSus'; o.pro = a.pvpArmor === 'heavy'; o.helmet = a.pvpArmor === 'heavy' ? 'helmet' : 'none'; }
    if (a.pvpSide === 'swat') { o.kind = 'swat'; o.armor = 'heavy'; o.helmet = a.pvpArmor === 'light' ? 'none' : 'helmet'; }
    const lk = lookFor(o);
    const { key, d } = personMeshData(lk);
    if (!this.people.has(key)) this.people.set(key, vaoSkin(this.gl, d.v, d.i));
    L = { v: a._lookV, key, pal: lk.pal, s: (a.h || 1.8) / 1.8 };
    this.looks.set(a.id, L);
    return L;
  }
  // 特殊装備（手に持つ物）と盾の形
  longMesh(kind) {
    const g = longModel(kind);
    if (!g) return null;
    let m = this.guns.get(g.key);
    if (!m) { m = { body: makeWorldMesh(this.gl, g.body), mag: null, pump: null, g }; this.guns.set(g.key, m); }
    return m;
  }
  shieldMesh() {
    if (!this._shield) { const g = shieldModel(); this._shield = { body: makeWorldMesh(this.gl, g.body), g }; }
    return this._shield;
  }
  gunMesh(wid, att) {
    const g = gunModel(wid, att);
    if (!g) return null;
    let m = this.guns.get(g.key);
    if (!m) { m = { body: makeWorldMesh(this.gl, g.body), mag: g.mag ? makeWorldMesh(this.gl, g.mag) : null, pump: g.pump ? makeWorldMesh(this.gl, g.pump) : null, flip: g.flip ? makeWorldMesh(this.gl, g.flip) : null, g }; this.guns.set(g.key, m); }
    return m;
  }
  // このこまの準備: S（エンジンの状態）、alpha（補間）
  prepare(S, w, opts = {}) {
    this.list.length = 0;
    for (const a of S.actors) {
      if (a.isDrone) { if (a.alive && !this.hidden.has(a.id)) this.list.push({ drone: true, a, x: a.x, y: a.y, z: a.z }); continue; }
      if (this.hidden.has(a.id)) continue;
      if (!a.alive && !a.dead) continue;
      const res = computePose(poseInput(a, this.pi), this.bones);
      const L = this.look(a);
      const mats = new Float32Array(NBONE * 16);
      boneMatrices(this.bones, res.s, mats);
      const room = roomOf(w, a.x, a.y + 0.5, a.z);
      let gun = null;
      const wi = curWeapon(a);
      if (res.gun && wi && a.ws.slot < 2 && !wi.hiddenGun) gun = { wi, f: res.gun };
      else if (res.gun && a.ws.slot === 3 && a.inv.long && a.inv.long !== 'none') gun = { long: a.inv.long, f: res.gun };
      // 結束バンド（拘束された人・締めている最中）: 両手首の位置
      let zip = null;
      if (a.cuffed || (a.cuffK || 0) > 0.8) { const b = this.bones, l = 7 * 12, q = 10 * 12; zip = [b[l], b[l + 1], b[l + 2], b[q], b[q + 1], b[q + 2]]; }
      this.list.push({ a, L, mats, room, gun, shield: res.shield || null, x: a.x, y: a.y, z: a.z, zip });
    }
    this.items = S.items.filter(it => !it.gone);
    this.nades = S.nades || [];
    this.cams = S.cams && S.cams.length && w._cams ? { K: w._cams, st: S.cams } : null;
  }
  // 飛んでいる投げ物（閃光・スティンガー・CS）
  nadeMesh(type) {
    this._nm = this._nm || {};
    if (this._nm[type]) return this._nm[type];
    const B = new MeshBuilder();
    const col = type === 'flash' ? hex('#3a4a3a') : type === 'stinger' ? hex('#3a3a40') : type === 'cs' ? hex('#6a6a48') : hex('#4a4a4a');
    B.cyl(0, 0, -0.055, 0.055, 0.028, 0.028, 10, LAYER.metal, col, { capB: true });
    B.cyl(0, 0, 0.055, 0.08, 0.012, 0.012, 6, LAYER.metal, hex('#8a8a80'));
    B.box(0.006, 0.02, -0.012, 0.012, 0.085, 0.012, LAYER.metal, hex('#9a9a90'));
    return (this._nm[type] = makeWorldMesh(this.gl, B));
  }
  drawOpaque(f) {
    const r = this.r, gl = this.gl;
    const P = r.P.skin;
    r._bindLight(P, f);
    gl.uniformMatrix4fv(P.u.uVP, false, r.vp);
    gl.uniform3f(P.u.uFlash, 0, 0, 0);
    for (const e of this.list) {
      if (e.drone) continue;
      if (!aabbVisible(r.planes, e.x - 1.2, e.y - 0.3, e.z - 1.2, e.x + 1.2, e.y + 2.1, e.z + 1.2)) continue;
      const m = this.people.get(e.L.key);
      gl.uniformMatrix4fv(P.u.uBones, false, e.mats);
      gl.uniform3fv(P.u.uPal, e.L.pal);
      gl.uniform1f(P.u.uRoom, Math.max(0, e.room));
      gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.n, m.type, 0);
      r.stats.draws++;
    }
    // 銃と物（世界のシェーダー＋行列）
    const W = r.P.world;
    r._bindLight(W, f);
    gl.uniformMatrix4fv(W.u.uVP, false, r.vp);
    for (const e of this.list) {
      if (e.drone) { this._drone(W, e.a); continue; }
      if (e.shield) {
        // 盾（左手）
        const sm = this.shieldMesh(), q = e.shield, M = this.M;
        M[0] = q.l[0]; M[1] = q.l[1]; M[2] = q.l[2]; M[3] = 0; M[4] = q.u[0]; M[5] = q.u[1]; M[6] = q.u[2]; M[7] = 0;
        M[8] = q.f[0]; M[9] = q.f[1]; M[10] = q.f[2]; M[11] = 0; M[12] = q.p[0]; M[13] = q.p[1]; M[14] = q.p[2]; M[15] = 1;
        gl.uniformMatrix4fv(W.u.uModel, false, M);
        gl.uniform1f(W.u.uRoomOverride, Math.max(0, e.room));
        drawMesh(gl, sm.body);
        r.stats.draws++;
      }
      if (!e.gun) continue;
      const gm = e.gun.long ? this.longMesh(e.gun.long) : this.gunMesh(e.gun.wi.id, e.gun.wi.att);
      if (!gm) continue;
      const g = e.gun.f, M = this.M;
      M[0] = g.l[0]; M[1] = g.l[1]; M[2] = g.l[2]; M[3] = 0;
      M[4] = g.u[0]; M[5] = g.u[1]; M[6] = g.u[2]; M[7] = 0;
      M[8] = g.f[0]; M[9] = g.f[1]; M[10] = g.f[2]; M[11] = 0;
      M[12] = g.p[0]; M[13] = g.p[1]; M[14] = g.p[2]; M[15] = 1;
      gl.uniformMatrix4fv(W.u.uModel, false, M);
      gl.uniform1f(W.u.uRoomOverride, Math.max(0, e.room));
      drawMesh(gl, gm.body); if (gm.mag && e.a.ws.st !== 'reload') drawMesh(gl, gm.mag); if (gm.pump) drawMesh(gl, gm.pump); if (gm.flip) drawMesh(gl, gm.flip);
      r.stats.draws++;
    }
    // 結束バンド: 手首から手首へ（白い帯と、手首ごとの輪）
    for (const e of this.list) {
      if (!e.zip) continue;
      const z = e.zip, mx = (z[0] + z[3]) / 2, my = (z[1] + z[4]) / 2, mz = (z[2] + z[5]) / 2;
      let ax = z[3] - z[0], ay = z[4] - z[1], az = z[5] - z[2]; const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
      let ux = -ay * 0, uy = 1, uz = 0; const d = ux * ax + uy * ay + uz * az; ux -= ax * d; uy -= ay * d; uz -= az * d; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
      const fx = ay * uz - az * uy, fy = az * ux - ax * uz, fz = ax * uy - ay * ux, M = this.M, sc = Math.min(1.6, al / 0.1);
      M[0] = ax * sc; M[1] = ay * sc; M[2] = az * sc; M[3] = 0; M[4] = ux; M[5] = uy; M[6] = uz; M[7] = 0; M[8] = fx; M[9] = fy; M[10] = fz; M[11] = 0; M[12] = mx; M[13] = my; M[14] = mz; M[15] = 1;
      gl.uniformMatrix4fv(W.u.uModel, false, M);
      gl.uniform1f(W.u.uRoomOverride, Math.max(0, e.room));
      drawMesh(gl, this.zipMesh());
    }
    // 落ちている物
    for (const it of this.items) {
      if (it.kind !== 'weapon' || !it.w) continue;
      const gm = this.gunMesh(it.wid, it.w.att || {});
      if (!gm) continue;
      const c = Math.cos(it.yaw), s = Math.sin(it.yaw), M = this.M;
      // 横に寝かせる: 銃の左（X）が上を向く
      M[0] = 0; M[1] = 1; M[2] = 0; M[3] = 0;
      M[4] = -c; M[5] = 0; M[6] = s; M[7] = 0;
      M[8] = s; M[9] = 0; M[10] = c; M[11] = 0;
      M[12] = it.x; M[13] = it.y + 0.02; M[14] = it.z; M[15] = 1;
      gl.uniformMatrix4fv(W.u.uModel, false, M);
      gl.uniform1f(W.u.uRoomOverride, Math.max(0, roomOf(r.w0, it.x, it.y + 0.3, it.z)));
      drawMesh(gl, gm.body); if (gm.mag) drawMesh(gl, gm.mag); if (gm.pump) drawMesh(gl, gm.pump); if (gm.flip) drawMesh(gl, gm.flip);
    }
    // 飛んでいる投げ物（回りながら）
    for (const n of this.nades || []) {
      const m = this.nadeMesh(n.type); if (!m) continue;
      const t = (r.time || 0) * 9 + (n.id || 0), c = Math.cos(t), s2 = Math.sin(t), M = this.M;
      M[0] = c; M[1] = s2; M[2] = 0; M[3] = 0; M[4] = -s2; M[5] = c; M[6] = 0; M[7] = 0; M[8] = 0; M[9] = 0; M[10] = 1; M[11] = 0;
      M[12] = n.x; M[13] = n.y; M[14] = n.z; M[15] = 1;
      gl.uniformMatrix4fv(W.u.uModel, false, M);
      gl.uniform1f(W.u.uRoomOverride, Math.max(0, roomOf(r.w0, n.x, n.y + 0.2, n.z)));
      drawMesh(gl, m);
    }
    // 監視カメラ（壁に据え付け。使われている間は赤い光が強い）
    if (this.cams) for (let i = 0; i < this.cams.K.length; i++) {
      const K = this.cams.K[i], st = this.cams.st[i];
      if (!K || !st || this.hideCam === i) continue;
      if (!aabbVisible(r.planes, K.x - 0.3, K.y - 0.3, K.z - 0.3, K.x + 0.3, K.y + 0.3, K.z + 0.3)) continue;
      const m = this._camMesh(st.ok ? (st.use >= 0 ? 2 : 1) : 0);
      const c = Math.cos(K.yaw0), s = Math.sin(K.yaw0), M = this.M;
      M[0] = c; M[1] = 0; M[2] = -s; M[3] = 0; M[4] = 0; M[5] = 1; M[6] = 0; M[7] = 0; M[8] = s; M[9] = 0; M[10] = c; M[11] = 0;
      M[12] = K.x; M[13] = K.y; M[14] = K.z; M[15] = 1;
      gl.uniformMatrix4fv(W.u.uModel, false, M);
      gl.uniform1f(W.u.uRoomOverride, Math.max(0, roomOf(r.w0, K.x, K.y - 1, K.z)));
      drawMesh(gl, m); r.stats.draws++;
    }
    gl.uniform1f(W.u.uRoomOverride, -1);
    gl.uniformMatrix4fv(W.u.uModel, false, r.ident);
  }
  // 監視カメラの形: 0 壊れた（台だけ）・1 待機（暗い赤）・2 使われている（明るい赤）。ローカル: Z が前（据え付けの向き）
  _camMesh(kind) {
    this._cm = this._cm || {};
    if (this._cm[kind]) return this._cm[kind];
    const B = new MeshBuilder(), body = hex('#d9dad6'), dark = hex('#1a1c1f');
    B.box(-0.035, 0.02, -0.17, 0.035, 0.1, -0.11, LAYER.metal, mulc(body, 0.8)); // 壁の台
    B.box(-0.012, 0.0, -0.14, 0.012, 0.03, -0.02, LAYER.metal, mulc(body, 0.7)); // 腕
    if (kind) {
      B.bbox(-0.055, -0.06, -0.05, 0.055, 0.035, 0.13, 0.012, LAYER.metal, body);
      B.box(-0.038, -0.045, 0.13, 0.038, 0.025, 0.145, LAYER.plain, dark);
      B.emit = 1; B.box(0.026, 0.015, 0.145, 0.04, 0.029, 0.15, LAYER.plain, kind === 2 ? [3.2, 0.25, 0.15] : [0.7, 0.06, 0.04]); B.emit = 0;
    } else {
      B.box(-0.03, -0.05, -0.04, 0.04, 0.02, 0.06, LAYER.metal, mulc(body, 0.45));
    }
    return (this._cm[kind] = makeWorldMesh(this.gl, B));
  }
  // 偵察ドローン（シージの二輪の車）: 黒い胴、左右の太い車輪、前にカメラと青い光
  _drone(W, a) {
    const r = this.r, gl = this.gl;
    if (!aabbVisible(r.planes, a.x - 0.4, a.y - 0.1, a.z - 0.4, a.x + 0.4, a.y + 0.5, a.z + 0.4)) return;
    if (!this._dm) {
      const B = new MeshBuilder(), body = hex('#2a2c2e'), tire = hex('#141516'), cam = hex('#0c0d10');
      B.bbox(-0.075, 0.03, -0.1, 0.075, 0.1, 0.1, 0.012, LAYER.metal, body);
      B.box(-0.03, 0.1, -0.04, 0.03, 0.13, 0.05, LAYER.metal, mulc(body, 1.2));
      for (const sx of [-1, 1]) B.tube([sx * 0.078, 0.075, 0], [sx * 0.135, 0.075, 0], 0.075, 0.075, 12, LAYER.plain, tire, { caps: true });
      B.box(-0.025, 0.06, 0.1, 0.025, 0.09, 0.115, LAYER.plain, cam);
      B.emit = 1; B.box(-0.008, 0.066, 0.115, 0.008, 0.084, 0.12, LAYER.plain, [0.25, 0.6, 2.4]); B.emit = 0;
      this._dm = makeWorldMesh(gl, B);
    }
    const c = Math.cos(a.yaw), s = Math.sin(a.yaw), M = this.M;
    M[0] = c; M[1] = 0; M[2] = -s; M[3] = 0; M[4] = 0; M[5] = 1; M[6] = 0; M[7] = 0; M[8] = s; M[9] = 0; M[10] = c; M[11] = 0;
    M[12] = a.x; M[13] = a.y; M[14] = a.z; M[15] = 1;
    gl.uniformMatrix4fv(W.u.uModel, false, M);
    gl.uniform1f(W.u.uRoomOverride, Math.max(0, roomOf(r.w0, a.x, a.y + 0.2, a.z)));
    drawMesh(gl, this._dm);
    r.stats.draws++;
  }
  // 結束バンドの形（X: 手首から手首へ 0.1m を ±0.05、輪は手首のまわり）
  zipMesh() {
    if (this._zip) return this._zip;
    const B = new MeshBuilder(), Wc = hex('#e9e7df');
    for (const sx of [-0.05, 0.05]) for (let q = 0; q < 8; q++) {
      const a0 = q / 8 * Math.PI * 2, a1 = (q + 1) / 8 * Math.PI * 2, r = 0.042;
      B.tube([sx, Math.cos(a0) * r, Math.sin(a0) * r], [sx, Math.cos(a1) * r, Math.sin(a1) * r], 0.006, 0.006, 4, LAYER.plain, Wc);
    }
    B.tube([-0.05, 0.04, 0], [0.05, 0.04, 0], 0.007, 0.007, 4, LAYER.plain, Wc);
    B.box(-0.012, 0.035, -0.01, 0.012, 0.06, 0.01, LAYER.plain, hex('#d6d4ca'));
    return (this._zip = makeWorldMesh(this.gl, B));
  }
  drawShadow(pl) {
    const r = this.r, gl = this.gl;
    const P = r.P.shadowSkin;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uVP, false, r.shVP);
    for (const e of this.list) {
      if (e.drone) continue;
      if (!aabbVisible(pl, e.x - 1, e.y, e.z - 1, e.x + 1, e.y + 2, e.z + 1)) continue;
      const m = this.people.get(e.L.key);
      gl.uniformMatrix4fv(P.u.uBones, false, e.mats);
      gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.n, m.type, 0);
    }
    const SP = r.P.shadow;
    gl.useProgram(SP.p);
    gl.uniformMatrix4fv(SP.u.uVP, false, r.shVP);
  }
}

export function roomOf(w, x, y, z) {
  if (w.war) return sunVisAt(w, x, y - 0.5, z); // 大規模戦: 日の当たり方（建物の中は暗い）
  const i = Math.floor(x / CS), j = Math.floor(z / CS);
  if (i < 0 || j < 0 || i >= w.W || j >= w.D) return 0;
  const L = Math.max(0, Math.min(w.NL - 1, Math.floor((y + 0.05) / LH)));
  let r = w.roomAt[w.idx(L, i, j)];
  if (r < 0) {
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= w.W || jj >= w.D) continue; const q = w.roomAt[w.idx(L, ii, jj)]; if (q >= 0) return q; }
    return 0;
  }
  return r;
}
