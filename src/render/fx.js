// 効果: 着弾の粉じん・火花・木くず・ガラス・血、曳光弾、銃口の炎、薬莢、煙とガス、爆発、弾痕と血の跡
import { groundAt } from '../engine/world.js';
import { M } from '../engine/data/materials.js';

const FV = 11; // pos3 col4 uv4
const MAXP = 900, MAXD = 360;
const SH = { soft: 0, square: 1, ring: 2, hole: 3, streak: 4 };

export class FX {
  constructor(r) {
    this.r = r; this.gl = r.gl;
    const gl = this.gl;
    // 粒子
    this.p = []; this.free = [];
    // 弾痕・血の跡（輪のバッファ）
    this.dec = new Float32Array(MAXD * 4 * FV); this.decN = 0; this.decHead = 0; this.decDirty = true;
    this.verts = new Float32Array(MAXP * 4 * FV);
    this.idx = new Uint16Array(Math.max(MAXP, MAXD) * 6);
    for (let q = 0; q < Math.max(MAXP, MAXD); q++) { const b = q * 4, o = q * 6; this.idx[o] = b; this.idx[o + 1] = b + 1; this.idx[o + 2] = b + 2; this.idx[o + 3] = b; this.idx[o + 4] = b + 2; this.idx[o + 5] = b + 3; }
    const mk = (n) => {
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, n * 4 * FV * 4, gl.DYNAMIC_DRAW);
      const st = FV * 4; gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, st, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, st, 28);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return { vao, vb };
    };
    this.pb = mk(MAXP); this.db = mk(MAXD);
    this.tracers = [];
    this.flashes = []; // 一瞬の光（銃口・爆発）: 動く光の一覧へ
    this.blood = true;
    this.amount = 1; this.shells = true; // エフェクトの量（設定）・薬莢
    this.seed = 1;
    r.hooks.transparent.push((rr, f) => this.draw(f));
  }
  rnd() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  rs(a) { return (this.rnd() * 2 - 1) * a; }
  clear() { this.p.length = 0; this.decN = 0; this.decHead = 0; this.decDirty = true; this.tracers.length = 0; this.flashes.length = 0; }

  // 粒子1つ: {x,y,z, vx,vy,vz, life, t, s0, s1, c:[r,g,b,a], add, sh, g(重力), lit, drag, bounce}
  add(o) {
    // 量を減らす設定: 光る物（銃口の炎・火花）以外を間引く
    if (this.amount < 1 && !o.add && this.rnd() > this.amount) return o;
    if (this.p.length >= MAXP) this.p.shift(); o.t = 0; this.p.push(o); return o;
  }

  // ---- 発生
  impact(x, y, z, nx, ny, nz, mat) {
    const w = this.r.w0;
    const k = mat === M.METAL || mat === M.METALFURN || mat === M.CAR || mat === M.DOORMETAL || mat === M.REINF ? 'metal'
      : mat === M.WOOD || mat === M.DOORWOOD || mat === M.FURN || mat === M.BARRICADE ? 'wood'
        : mat === M.GLASS || mat === M.GLASSBROKEN ? 'glass' : mat === M.FABRIC ? 'fabric' : 'dust';
    const col = k === 'wood' ? [0.42, 0.3, 0.2] : k === 'fabric' ? [0.5, 0.48, 0.46] : mat === M.BRICK ? [0.5, 0.32, 0.25] : [0.62, 0.6, 0.57];
    if (k === 'metal') {
      for (let i = 0; i < 6; i++) this.add({ x, y, z, vx: nx * 2 + this.rs(2.5), vy: ny * 2 + this.rs(2.5) + 1, vz: nz * 2 + this.rs(2.5), life: 0.15 + this.rnd() * 0.2, s0: 0.012, s1: 0.004, c: [4, 2.2, 0.8, 1], add: true, sh: SH.streak, g: 6, stretch: 0.04 });
      this.add({ x: x + nx * 0.02, y: y + ny * 0.02, z: z + nz * 0.02, vx: nx * 0.3, vy: 0.2, vz: nz * 0.3, life: 0.5, s0: 0.05, s1: 0.18, c: [0.5, 0.5, 0.5, 0.35], sh: SH.soft, g: 0, lit: true, drag: 2 });
    } else if (k === 'glass') {
      for (let i = 0; i < 8; i++) this.add({ x, y, z, vx: this.rs(1.5) - nx, vy: this.rnd() * 1.5, vz: this.rs(1.5) - nz, life: 0.8, s0: 0.02, s1: 0.015, c: [0.7, 0.85, 0.9, 0.8], sh: SH.square, g: 9.8, lit: true, bounce: true });
    } else {
      // 粉じんのけむり＋かけら
      const n = Math.round((k === 'wood' ? 5 : 4) * Math.max(1, this.amount));
      for (let i = 0; i < n; i++) this.add({ x, y, z, vx: nx * (1.5 + this.rnd() * 2) + this.rs(1.2), vy: ny * 2 + this.rnd() * 1.6, vz: nz * (1.5 + this.rnd() * 2) + this.rs(1.2), life: 0.5 + this.rnd() * 0.4, s0: 0.012 + this.rnd() * 0.012, s1: 0.01, c: [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, 1], sh: SH.square, g: 9.8, lit: true, bounce: true });
      for (let i = 0; i < 2; i++) this.add({ x: x + nx * 0.03, y: y + ny * 0.03, z: z + nz * 0.03, vx: nx * (0.4 + this.rnd() * 0.4) + this.rs(0.2), vy: 0.15 + this.rnd() * 0.2, vz: nz * (0.4 + this.rnd() * 0.4) + this.rs(0.2), life: 0.9 + this.rnd() * 0.5, s0: 0.06, s1: 0.32, c: [col[0], col[1], col[2], 0.42], sh: SH.soft, g: -0.05, lit: true, drag: 1.6 });
    }
    // 弾痕
    if (k !== 'glass' && k !== 'fabric') this.decal(x, y, z, nx, ny, nz, 0.022 + this.rnd() * 0.012, k === 'metal' ? [0.18, 0.18, 0.2, 0.95] : [0.1, 0.09, 0.08, 0.95], SH.hole, this.rnd() * 6.28);
  }
  bloodHit(x, y, z, dx, dy, dz, n = 1) {
    if (!this.blood) return;
    const m = Math.min(4, n);
    for (let i = 0; i < 4 + m * 2; i++) this.add({ x, y, z, vx: dx * (1 + this.rnd() * 2) + this.rs(0.8), vy: dy + this.rnd() * 1.2, vz: dz * (1 + this.rnd() * 2) + this.rs(0.8), life: 0.4 + this.rnd() * 0.3, s0: 0.02 + this.rnd() * 0.02, s1: 0.012, c: [0.35, 0.02, 0.02, 1], sh: SH.soft, g: 9.8, lit: true });
    this.add({ x, y, z, vx: dx * 0.6, vy: 0.1, vz: dz * 0.6, life: 0.35, s0: 0.08, s1: 0.25, c: [0.4, 0.03, 0.03, 0.45], sh: SH.soft, g: 0, lit: true, drag: 3 });
  }
  // 血の跡（後ろの壁や床）
  bloodSplat(x, y, z, nx, ny, nz, size) { if (this.blood) this.decal(x, y, z, nx, ny, nz, size, [0.22, 0.01, 0.01, 0.9], SH.soft, this.rnd() * 6.28); }
  muzzle(x, y, z, dx, dy, dz, scale = 1, supp = false) {
    if (supp) { this.add({ x: x + dx * 0.02, y: y + dy * 0.02, z: z + dz * 0.02, vx: dx * 0.4, vy: 0.1, vz: dz * 0.4, life: 0.25, s0: 0.03, s1: 0.1, c: [0.6, 0.6, 0.6, 0.25], sh: SH.soft, g: 0, lit: true, drag: 3 }); return; }
    this.add({ x: x + dx * 0.04, y: y + dy * 0.04, z: z + dz * 0.04, vx: 0, vy: 0, vz: 0, life: 0.045, s0: 0.09 * scale, s1: 0.12 * scale, c: [8, 5, 2, 1], add: true, sh: SH.soft });
    this.add({ x: x + dx * 0.1, y: y + dy * 0.1, z: z + dz * 0.1, vx: 0, vy: 0, vz: 0, life: 0.035, s0: 0.05 * scale, s1: 0.06 * scale, c: [10, 7, 3, 1], add: true, sh: SH.streak, dir: [dx, dy, dz], stretch: 0.16 * scale });
    this.add({ x: x + dx * 0.05, y: y + dy * 0.05, z: z + dz * 0.05, vx: dx * 0.6, vy: 0.15, vz: dz * 0.6, life: 0.5, s0: 0.04, s1: 0.2, c: [0.55, 0.55, 0.55, 0.28], sh: SH.soft, g: -0.1, lit: true, drag: 2.5 });
    this.flashes.push({ x: x + dx * 0.2, y: y + dy * 0.2, z: z + dz * 0.2, r: 5.5, col: [6.0, 3.6, 1.6], t: 0.05 });
  }
  shell(x, y, z, vx, vy, vz, big) {
    if (!this.shells) return;
    this.add({ x, y, z, vx, vy, vz, life: 1.6, s0: big ? 0.016 : 0.011, s1: big ? 0.016 : 0.011, c: [0.75, 0.55, 0.22, 1], sh: SH.square, g: 9.8, lit: true, bounce: true, shell: true });
  }
  tracer(x0, y0, z0, x1, y1, z1, col) { this.tracers.push({ x0, y0, z0, x1, y1, z1, col: col || [9, 5, 2], t: 0 }); }
  smoke(x, y, z, r, col = [0.75, 0.75, 0.75], a = 0.4, life = 3) {
    this.add({ x: x + this.rs(r * 0.4), y: y + this.rs(r * 0.2), z: z + this.rs(r * 0.4), vx: this.rs(0.15), vy: 0.08 + this.rnd() * 0.1, vz: this.rs(0.15), life: life * (0.7 + this.rnd() * 0.6), s0: r * 0.5, s1: r * 1.1, c: [col[0], col[1], col[2], a], sh: SH.soft, g: 0, lit: true, drag: 0.6 });
  }
  explosion(x, y, z, r, kind) {
    const big = kind === 'c2' || kind === 'frame' || kind === 'frag';
    this.add({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.12, s0: r * 0.35, s1: r * 0.6, c: [20, 14, 8, 1], add: true, sh: SH.soft });
    if (big) for (let i = 0; i < 8; i++) this.add({ x, y, z, vx: this.rs(3), vy: this.rnd() * 3, vz: this.rs(3), life: 0.35, s0: 0.3, s1: 0.6, c: [6, 2.5, 0.8, 0.8], add: true, sh: SH.soft, drag: 4 });
    for (let i = 0; i < (big ? 12 : 5); i++) this.add({ x, y, z, vx: this.rs(4), vy: this.rnd() * 4, vz: this.rs(4), life: 0.8, s0: 0.03, s1: 0.02, c: [0.25, 0.22, 0.2, 1], sh: SH.square, g: 9.8, lit: true, bounce: true });
    for (let i = 0; i < (big ? 10 : 6); i++) this.smoke(x, y + 0.3, z, big ? 1.4 : 0.8, big ? [0.35, 0.33, 0.32] : [0.85, 0.85, 0.85], big ? 0.55 : 0.45, big ? 4 : 2.5);
    this.flashes.push({ x, y: y + 0.3, z, r: big ? 12 : 9, col: kind === 'flash' ? [60, 60, 60] : [40, 22, 8], t: kind === 'flash' ? 0.09 : 0.14 });
    if (big) this.decal(x, Math.floor((y + 0.2) / 3) * 3 + 0.01, z, 0, 1, 0, r * 0.25, [0.05, 0.05, 0.05, 0.85], SH.soft, this.rnd() * 6);
  }
  glassBreak(x, y, z, along) {
    for (let i = 0; i < 18; i++) this.add({ x: x + this.rs(0.25), y: y + this.rnd() * 1.3, z: z + this.rs(0.25), vx: this.rs(1.4), vy: this.rnd() * 0.8, vz: this.rs(1.4), life: 1.2, s0: 0.03, s1: 0.02, c: [0.75, 0.88, 0.95, 0.85], sh: SH.square, g: 9.8, lit: true, bounce: true });
  }
  debris(x, y, z, col) {
    for (let i = 0; i < 14; i++) this.add({ x: x + this.rs(0.25), y: y + this.rs(0.3), z: z + this.rs(0.25), vx: this.rs(2), vy: this.rnd() * 2, vz: this.rs(2), life: 1.4, s0: 0.035 + this.rnd() * 0.04, s1: 0.03, c: [col[0], col[1], col[2], 1], sh: SH.square, g: 9.8, lit: true, bounce: true });
    for (let i = 0; i < 4; i++) this.smoke(x, y, z, 0.5, [col[0] * 1.2, col[1] * 1.2, col[2] * 1.2], 0.45, 1.8);
  }
  decal(x, y, z, nx, ny, nz, size, col, sh, rot) {
    // 面にそった四角（法線の少し手前）
    const up = Math.abs(ny) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let ux = up[1] * nz - up[2] * ny, uy = up[2] * nx - up[0] * nz, uz = up[0] * ny - up[1] * nx;
    const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    let vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    const c = Math.cos(rot), s = Math.sin(rot);
    const ax = (ux * c + vx * s) * size, ay = (uy * c + vy * s) * size, az = (uz * c + vz * s) * size;
    const bx = (vx * c - ux * s) * size, by = (vy * c - uy * s) * size, bz = (vz * c - uz * s) * size;
    const px = x + nx * 0.004, py = y + ny * 0.004, pz = z + nz * 0.004;
    const o = this.decHead * 4 * FV;
    const put = (k, X, Y, Z, u, v) => { const q = o + k * FV; this.dec[q] = X; this.dec[q + 1] = Y; this.dec[q + 2] = Z; this.dec[q + 3] = col[0]; this.dec[q + 4] = col[1]; this.dec[q + 5] = col[2]; this.dec[q + 6] = col[3]; this.dec[q + 7] = u; this.dec[q + 8] = v; this.dec[q + 9] = sh; this.dec[q + 10] = 1; };
    put(0, px - ax - bx, py - ay - by, pz - az - bz, -1, -1);
    put(1, px + ax - bx, py + ay - by, pz + az - bz, 1, -1);
    put(2, px + ax + bx, py + ay + by, pz + az + bz, 1, 1);
    put(3, px - ax + bx, py - ay + by, pz - az + bz, -1, 1);
    this.decHead = (this.decHead + 1) % MAXD; this.decN = Math.min(MAXD, this.decN + 1); this.decDirty = true;
  }

  // ---- 進める
  update(dt) {
    const w = this.r.w0;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const q = this.p[i];
      q.t += dt;
      if (q.t >= q.life) { this.p.splice(i, 1); continue; }
      if (q.drag) { const k = Math.exp(-q.drag * dt); q.vx *= k; q.vy *= k; q.vz *= k; }
      q.vy -= (q.g || 0) * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.bounce && w) {
        const g = groundAt(w, q.x, q.z, q.y + 0.3);
        if (q.y < g + 0.005) { q.y = g + 0.005; if (q.vy < -0.5) { q.vy = -q.vy * 0.3; q.vx *= 0.5; q.vz *= 0.5; } else { q.vy = 0; q.vx *= 0.7; q.vz *= 0.7; } if (q.shell && !q.clink) { q.clink = true; if (this.onClink) this.onClink(q.x, q.y, q.z); } }
      }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) { this.tracers[i].t += dt; if (this.tracers[i].t > 0.03) this.tracers.splice(i, 1); }
    for (let i = this.flashes.length - 1; i >= 0; i--) { this.flashes[i].t -= dt; if (this.flashes[i].t <= 0) this.flashes.splice(i, 1); }
  }
  // 一瞬の光を動く光の一覧へ
  lights(out, roomsFor) {
    for (const f of this.flashes) out.push({ x: f.x, y: f.y, z: f.z, r: f.r, col: f.col, rooms: roomsFor(f.x, f.y, f.z, f.r) });
  }

  draw(f) {
    const r = this.r, gl = this.gl;
    const P = r.P.fx;
    r._bindLight(P, f);
    gl.uniformMatrix4fv(P.u.uVP, false, r.vp);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    // 弾痕・血の跡
    if (this.decN) {
      if (this.decDirty) { gl.bindBuffer(gl.ARRAY_BUFFER, this.db.vb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.dec, 0, this.decN * 4 * FV); this.decDirty = false; }
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -2);
      gl.bindVertexArray(this.db.vao); gl.drawElements(gl.TRIANGLES, this.decN * 6, gl.UNSIGNED_SHORT, 0);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    // 粒子（カメラ向きの四角）
    const cam = r.camPos, V = r.view;
    const rx = V[0], ry = V[4], rz = V[8], ux = V[1], uy = V[5], uz = V[9];
    const v = this.verts;
    let nA = 0;
    const put = (q, n) => {
      const a = 1 - q.t / q.life, s = q.s0 + (q.s1 - q.s0) * (q.t / q.life);
      const al = q.c[3] * (q.add ? a : Math.min(1, a * 1.5));
      let ax = rx * s, ay = ry * s, az = rz * s, bx = ux * s, by = uy * s, bz = uz * s;
      if (q.sh === SH.streak) {
        // 進む向きに伸ばす
        let dx = q.dir ? q.dir[0] : q.vx, dy = q.dir ? q.dir[1] : q.vy, dz = q.dir ? q.dir[2] : q.vz;
        const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
        const tx = q.x - cam[0], ty = q.y - cam[1], tz = q.z - cam[2];
        let px = dy * tz - dz * ty, py = dz * tx - dx * tz, pz = dx * ty - dy * tx; const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
        const st = q.stretch || 0.05;
        ax = dx * st; ay = dy * st; az = dz * st; bx = px * s; by = py * s; bz = pz * s;
      }
      const o = n * 4 * FV;
      const w = (k, X, Y, Z, u, vv) => { const p = o + k * FV; v[p] = X; v[p + 1] = Y; v[p + 2] = Z; v[p + 3] = q.c[0]; v[p + 4] = q.c[1]; v[p + 5] = q.c[2]; v[p + 6] = al; v[p + 7] = u; v[p + 8] = vv; v[p + 9] = q.sh; v[p + 10] = q.lit ? 1 : 0; };
      w(0, q.x - ax - bx, q.y - ay - by, q.z - az - bz, -1, -1);
      w(1, q.x + ax - bx, q.y + ay - by, q.z + az - bz, 1, -1);
      w(2, q.x + ax + bx, q.y + ay + by, q.z + az + bz, 1, 1);
      w(3, q.x - ax + bx, q.y - ay + by, q.z - az + bz, -1, 1);
    };
    // 不透明に近いもの（アルファ）を先に、光るもの（加算）を後に
    for (const q of this.p) if (!q.add) put(q, nA++);
    let nB = nA;
    for (const q of this.p) if (q.add) put(q, nB++);
    // 曳光弾
    for (const t of this.tracers) {
      if (nB >= MAXP) break;
      const q = { x: (t.x0 + t.x1) / 2, y: (t.y0 + t.y1) / 2, z: (t.z0 + t.z1) / 2, dir: [t.x1 - t.x0, t.y1 - t.y0, t.z1 - t.z0], t: 0, life: 1, s0: 0.012, s1: 0.012, c: [t.col[0], t.col[1], t.col[2], 1], sh: SH.streak, add: true, stretch: Math.hypot(t.x1 - t.x0, t.y1 - t.y0, t.z1 - t.z0) / 2 };
      put(q, nB++);
    }
    if (nB) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pb.vb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, v, 0, nB * 4 * FV);
      gl.bindVertexArray(this.pb.vao);
      if (nA) { gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.drawElements(gl.TRIANGLES, nA * 6, gl.UNSIGNED_SHORT, 0); }
      if (nB > nA) { gl.blendFunc(gl.ONE, gl.ONE); gl.drawElements(gl.TRIANGLES, (nB - nA) * 6, gl.UNSIGNED_SHORT, nA * 12); }
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }
}
