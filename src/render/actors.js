// 人・持っている銃・落ちている物を描く（renderer のフックに入れる）
import { personMeshData, lookFor, boneMatrices, SV } from './people.js';
import { gunModel } from './guns.js';
import { makeWorldMesh, drawMesh } from './renderer.js';
import { computePose, NBONE } from '../engine/pose.js';
import { poseInput } from '../engine/combat.js';
import { curWeapon } from '../engine/actor.js';
import { CS, LH } from '../engine/world.js';
import { aabbVisible } from './math.js';
import { MeshBuilder, hex } from './build.js';
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
    this.people = new Map(); this.guns = new Map(); this.looks = new Map();
    this.bones = new Float32Array(NBONE * 12); this.mats = new Float32Array(NBONE * 16);
    this.pi = {}; this.M = new Float32Array(16);
    this.list = []; // このこまに描く人
    this.items = [];
    this.hidden = new Set(); // 一人称で自分は描かない
    r.hooks.opaque.push((rr, f) => this.drawOpaque(f));
    r.hooks.shadow.push((rr, pl) => this.drawShadow(pl));
  }
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
  gunMesh(wid, att) {
    const g = gunModel(wid, att);
    if (!g) return null;
    let m = this.guns.get(g.key);
    if (!m) { m = { body: makeWorldMesh(this.gl, g.body), mag: g.mag ? makeWorldMesh(this.gl, g.mag) : null, pump: g.pump ? makeWorldMesh(this.gl, g.pump) : null, g }; this.guns.set(g.key, m); }
    return m;
  }
  // このこまの準備: S（エンジンの状態）、alpha（補間）
  prepare(S, w, opts = {}) {
    this.list.length = 0;
    for (const a of S.actors) {
      if (a.isDrone) { this.list.push({ drone: true, a }); continue; }
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
      this.list.push({ a, L, mats, room, gun, x: a.x, y: a.y, z: a.z });
    }
    this.items = S.items.filter(it => !it.gone);
    this.nades = S.nades || [];
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
      if (!e.gun) continue;
      const gm = this.gunMesh(e.gun.wi.id, e.gun.wi.att);
      if (!gm) continue;
      const g = e.gun.f, M = this.M;
      M[0] = g.l[0]; M[1] = g.l[1]; M[2] = g.l[2]; M[3] = 0;
      M[4] = g.u[0]; M[5] = g.u[1]; M[6] = g.u[2]; M[7] = 0;
      M[8] = g.f[0]; M[9] = g.f[1]; M[10] = g.f[2]; M[11] = 0;
      M[12] = g.p[0]; M[13] = g.p[1]; M[14] = g.p[2]; M[15] = 1;
      gl.uniformMatrix4fv(W.u.uModel, false, M);
      gl.uniform1f(W.u.uRoomOverride, Math.max(0, e.room));
      drawMesh(gl, gm.body); if (gm.mag && e.a.ws.st !== 'reload') drawMesh(gl, gm.mag); if (gm.pump) drawMesh(gl, gm.pump);
      r.stats.draws++;
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
      drawMesh(gl, gm.body); if (gm.mag) drawMesh(gl, gm.mag);
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
    gl.uniform1f(W.u.uRoomOverride, -1);
    gl.uniformMatrix4fv(W.u.uModel, false, r.ident);
  }
  _drone(W, a) { /* PvP のドローン（あとで） */ }
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
