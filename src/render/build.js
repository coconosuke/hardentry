// 形を組み立てる道具（静的なメッシュ）。
// 頂点: pos3 nrm3 uv2 layer1 col3 ao1 room1 emit1 = 15 floats
// 面はすべて「法線の側から見て反時計回り」。背面は描かない（裏面カリング）。
export const WV = 15;

export class MeshBuilder {
  constructor() { this.v = []; this.i = []; this.n = 0; this.room = 0; this.emit = 0; this.xf = null; }
  // 変換（行列3x4: [ax,ay,az, bx,by,bz, cx,cy,cz, tx,ty,tz] = 列 X Y Z と移動）
  setXf(m) { this.xf = m; return this; }
  _p(x, y, z) {
    const m = this.xf; if (!m) return [x, y, z];
    return [m[0] * x + m[3] * y + m[6] * z + m[9], m[1] * x + m[4] * y + m[7] * z + m[10], m[2] * x + m[5] * y + m[8] * z + m[11]];
  }
  _n(x, y, z) {
    const m = this.xf; if (!m) return [x, y, z];
    const a = m[0] * x + m[3] * y + m[6] * z, b = m[1] * x + m[4] * y + m[7] * z, c = m[2] * x + m[5] * y + m[8] * z;
    const l = Math.hypot(a, b, c) || 1; return [a / l, b / l, c / l];
  }
  vert(p, n, u, v, layer, col, ao = 1) {
    const P = this._p(p[0], p[1], p[2]), N = this._n(n[0], n[1], n[2]);
    this.v.push(P[0], P[1], P[2], N[0], N[1], N[2], u, v, layer, col[0], col[1], col[2], ao, this.room, this.emit);
    return this.n++;
  }
  // 4点の面（法線の側から見て反時計回り: p0→p1→p2→p3）
  quad(p0, p1, p2, p3, n, uv, layer, col, ao) {
    const b = this.n;
    const A = ao || [1, 1, 1, 1];
    this.vert(p0, n, uv[0], uv[1], layer, col, A[0]);
    this.vert(p1, n, uv[2], uv[3], layer, col, A[1]);
    this.vert(p2, n, uv[4], uv[5], layer, col, A[2]);
    this.vert(p3, n, uv[6], uv[7], layer, col, A[3]);
    this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  tri(p0, p1, p2, n, layer, col, ao = 1) {
    const b = this.n;
    this.vert(p0, n, p0[0], p0[2], layer, col, ao); this.vert(p1, n, p1[0], p1[2], layer, col, ao); this.vert(p2, n, p2[0], p2[2], layer, col, ao);
    this.i.push(b, b + 1, b + 2);
  }
  // 軸にそった箱 [x0..x1, y0..y1, z0..z1]。faces: ビット(+x,-x,+y,-y,+z,-z)。uvは1mあたりs
  box(x0, y0, z0, x1, y1, z1, layer, col, o = {}) {
    const f = o.faces ?? 63, s = o.uv ?? 1, ao0 = o.aoBottom ?? 1, ao1 = o.aoTop ?? 1;
    const cols = o.cols || null; // 面ごとの色
    const c = (k) => (cols && cols[k]) || col;
    const ab = [ao0, ao0, ao1, ao1];
    const ox = o.uo ? o.uo[0] : 0, oy = o.uo ? o.uo[1] : 0;
    if (f & 1) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [z1 * s + ox, y0 * s + oy, z0 * s + ox, y0 * s + oy, z0 * s + ox, y1 * s + oy, z1 * s + ox, y1 * s + oy].map((q, k) => k % 2 ? q : -q), layer, c(0), ab);
    if (f & 2) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [z0 * s + ox, y0 * s + oy, z1 * s + ox, y0 * s + oy, z1 * s + ox, y1 * s + oy, z0 * s + ox, y1 * s + oy], layer, c(1), ab);
    if (f & 4) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [x0 * s, z1 * s, x1 * s, z1 * s, x1 * s, z0 * s, x0 * s, z0 * s], layer, c(2), [ao1, ao1, ao1, ao1]);
    if (f & 8) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [x0 * s, z0 * s, x1 * s, z0 * s, x1 * s, z1 * s, x0 * s, z1 * s], layer, c(3), [ao0, ao0, ao0, ao0]);
    if (f & 16) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [x0 * s + ox, y0 * s + oy, x1 * s + ox, y0 * s + oy, x1 * s + ox, y1 * s + oy, x0 * s + ox, y1 * s + oy], layer, c(4), ab);
    if (f & 32) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [-x1 * s + ox, y0 * s + oy, -x0 * s + ox, y0 * s + oy, -x0 * s + ox, y1 * s + oy, -x1 * s + ox, y1 * s + oy], layer, c(5), ab);
  }
  // 中心と大きさの箱
  cbox(cx, cy, cz, sx, sy, sz, layer, col, o) { this.box(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, layer, col, o); }
  // 円柱（Y軸、y0..y1）。seg角形
  cyl(cx, cz, y0, y1, r0, r1, seg, layer, col, o = {}) {
    const capT = o.capT ?? true, capB = o.capB ?? false;
    const base = this.n;
    const slope = (r0 - r1) / Math.max(1e-6, y1 - y0);
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2 + (o.rot || 0), x = Math.cos(a), z = Math.sin(a);
      const nl = Math.hypot(1, slope);
      const n = [x / nl, slope / nl, z / nl];
      const u = k / seg * Math.PI * 2 * Math.max(r0, r1);
      this.vert([cx + x * r0, y0, cz + z * r0], n, u, y0, layer, col, o.aoBottom ?? 1);
      this.vert([cx + x * r1, y1, cz + z * r1], n, u, y1, layer, col, 1);
    }
    for (let k = 0; k < seg; k++) { const a = base + k * 2; this.i.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    if (capT && r1 > 0) { const c = this.n; this.vert([cx, y1, cz], [0, 1, 0], cx, cz, layer, col); for (let k = 0; k <= seg; k++) { const a = (k / seg) * Math.PI * 2 + (o.rot || 0); this.vert([cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1], [0, 1, 0], cx + Math.cos(a) * r1, cz + Math.sin(a) * r1, layer, col); } for (let k = 0; k < seg; k++) this.i.push(c, c + 2 + k, c + 1 + k); }
    if (capB && r0 > 0) { const c = this.n; this.vert([cx, y0, cz], [0, -1, 0], cx, cz, layer, col); for (let k = 0; k <= seg; k++) { const a = (k / seg) * Math.PI * 2 + (o.rot || 0); this.vert([cx + Math.cos(a) * r0, y0, cz + Math.sin(a) * r0], [0, -1, 0], cx, cz, layer, col); } for (let k = 0; k < seg; k++) this.i.push(c, c + 1 + k, c + 2 + k); }
  }
  // 2点を結ぶ柱（任意の向き）。r0→r1、seg角形
  tube(a, b, r0, r1, seg, layer, col, o = {}) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1e-6;
    const ax = [dx / L, dy / L, dz / L];
    const up = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u = cross(ax, up); u = nrm(u); const w = cross(ax, u);
    const base = this.n;
    for (let k = 0; k <= seg; k++) {
      const t = (k / seg) * Math.PI * 2 + (o.rot || 0), c = Math.cos(t), s = Math.sin(t);
      const n = [u[0] * c + w[0] * s, u[1] * c + w[1] * s, u[2] * c + w[2] * s];
      this.vert([a[0] + n[0] * r0, a[1] + n[1] * r0, a[2] + n[2] * r0], n, k / seg, 0, layer, col);
      this.vert([b[0] + n[0] * r1, b[1] + n[1] * r1, b[2] + n[2] * r1], n, k / seg, L, layer, col);
    }
    for (let k = 0; k < seg; k++) { const q = base + k * 2; this.i.push(q, q + 2, q + 3, q, q + 3, q + 1); }
    if (o.caps) {
      for (const [P, r, sg] of [[a, r0, -1], [b, r1, 1]]) {
        if (r <= 0) continue;
        const c = this.n; const nn = [ax[0] * sg, ax[1] * sg, ax[2] * sg];
        this.vert(P, nn, 0, 0, layer, col);
        for (let k = 0; k <= seg; k++) { const t = (k / seg) * Math.PI * 2 + (o.rot || 0), cc = Math.cos(t), s = Math.sin(t); this.vert([P[0] + (u[0] * cc + w[0] * s) * r, P[1] + (u[1] * cc + w[1] * s) * r, P[2] + (u[2] * cc + w[2] * s) * r], nn, 0, 0, layer, col); }
        for (let k = 0; k < seg; k++) { if (sg > 0) this.i.push(c, c + 1 + k, c + 2 + k); else this.i.push(c, c + 2 + k, c + 1 + k); }
      }
    }
  }
  // 断面をつないだ形（ロフト）: rings = [{y, rx, rz, cx?, cz?}]、seg角形、Y軸にそって
  loft(rings, seg, layer, col, o = {}) {
    const base = this.n;
    const rows = rings.length;
    for (let r = 0; r < rows; r++) {
      const R = rings[r];
      const prev = rings[Math.max(0, r - 1)], next = rings[Math.min(rows - 1, r + 1)];
      for (let k = 0; k <= seg; k++) {
        const t = (k / seg) * Math.PI * 2 + (o.rot || 0), c = Math.cos(t), s = Math.sin(t);
        const x = (R.cx || 0) + c * R.rx, z = (R.cz || 0) + s * R.rz;
        // 法線: 断面の外向き＋上下の傾き
        const drx = (next.rx - prev.rx), drz = (next.rz - prev.rz), dy = (next.y - prev.y) || 1e-6;
        let n = [c / R.rx * 1, 0, s / R.rz * 1]; n = nrm(n);
        const sl = -((drx * Math.abs(c) + drz * Math.abs(s)) / dy);
        n = nrm([n[0], sl * 0.8, n[2]]);
        this.vert([x, R.y, z], n, k / seg * 2, R.y, layer, R.col || col, R.ao ?? 1);
      }
    }
    for (let r = 0; r < rows - 1; r++) for (let k = 0; k < seg; k++) {
      const a = base + r * (seg + 1) + k, b = a + seg + 1;
      this.i.push(a, b, b + 1, a, b + 1, a + 1);
    }
    if (o.capTop) { const R = rings[rows - 1], c = this.n; this.vert([R.cx || 0, R.y, R.cz || 0], [0, 1, 0], 0, 0, layer, R.col || col); for (let k = 0; k <= seg; k++) { const t = (k / seg) * Math.PI * 2 + (o.rot || 0); this.vert([(R.cx || 0) + Math.cos(t) * R.rx, R.y, (R.cz || 0) + Math.sin(t) * R.rz], [0, 1, 0], 0, 0, layer, R.col || col); } for (let k = 0; k < seg; k++) this.i.push(c, c + 2 + k, c + 1 + k); }
    if (o.capBot) { const R = rings[0], c = this.n; this.vert([R.cx || 0, R.y, R.cz || 0], [0, -1, 0], 0, 0, layer, R.col || col); for (let k = 0; k <= seg; k++) { const t = (k / seg) * Math.PI * 2 + (o.rot || 0); this.vert([(R.cx || 0) + Math.cos(t) * R.rx, R.y, (R.cz || 0) + Math.sin(t) * R.rz], [0, -1, 0], 0, 0, layer, R.col || col); } for (let k = 0; k < seg; k++) this.i.push(c, c + 1 + k, c + 2 + k); }
  }
  get count() { return this.n; }
  arrays() { return { v: new Float32Array(this.v), i: this.n > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i) }; }
  // 別のビルダーの中身を足す
  append(b) {
    const off = this.n;
    for (let k = 0; k < b.v.length; k++) this.v.push(b.v[k]);
    for (let k = 0; k < b.i.length; k++) this.i.push(b.i[k] + off);
    this.n += b.n;
  }
}

export function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
export function nrm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
// 変換を作る: 位置(x,y,z)、Y軸の回転、拡大
export function xfYaw(x, y, z, yaw, sx = 1, sy = 1, sz = 1) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // 列 X=(c,0,-s)*sx, Y=(0,1,0)*sy, Z=(s,0,c)*sz
  return [c * sx, 0, -s * sx, 0, sy, 0, s * sz, 0, c * sz, x, y, z];
}
// 色: '#rrggbb' → [r,g,b]（0..1、線形に近い値）
export function hex(h) {
  const n = parseInt(h.slice(1), 16);
  const f = (v) => Math.pow(v / 255, 2.2);
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
}
export function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
export function mulc(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
