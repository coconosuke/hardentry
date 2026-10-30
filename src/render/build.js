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
  // 角を落とした箱（面取り）。r = 面取りの幅。ローポリでも縁に光が乗って形が締まる（BattleBit の家具や銃のように）
  // o: box と同じ（faces・uv・cols・aoBottom・aoTop）。faces で省いた面の縁と角は、両側とも省いたときだけ消す
  bbox(x0, y0, z0, x1, y1, z1, r, layer, col, o = {}) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    r = Math.min(r, dx * 0.45, dy * 0.45, dz * 0.45);
    if (!(r > 1e-4)) return this.box(x0, y0, z0, x1, y1, z1, layer, col, o);
    const f = o.faces ?? 63, s = o.uv ?? 1, cols = o.cols || null;
    const ao0 = o.aoBottom ?? 1, ao1 = o.aoTop ?? 1;
    const aoY = (y) => ao0 + (ao1 - ao0) * ((y - y0) / dy);
    const lo = [x0, y0, z0], hi = [x1, y1, z1], ilo = [x0 + r, y0 + r, z0 + r], ihi = [x1 - r, y1 - r, z1 - r];
    // 面 a の、角 sg（各軸の±）の点
    const P = (a, sg) => [0, 1, 2].map(k => k === a ? (sg[k] > 0 ? hi[k] : lo[k]) : (sg[k] > 0 ? ihi[k] : ilo[k]));
    const bitOf = (a, sgn) => (a === 0 ? (sgn > 0 ? 1 : 2) : a === 1 ? (sgn > 0 ? 4 : 8) : (sgn > 0 ? 16 : 32));
    const faceCol = (a, sgn) => (cols && cols[a * 2 + (sgn > 0 ? 0 : 1)]) || col; // box と同じ並び: 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z
    const uvOf = (p, n) => {
      const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
      if (ay >= ax && ay >= az) return [p[0] * s, p[2] * s];
      if (ax >= az) return [(n[0] > 0 ? -p[2] : p[2]) * s, p[1] * s];
      return [(n[2] > 0 ? p[0] : -p[0]) * s, p[1] * s];
    };
    const poly = (pts, n, c) => {
      // 法線の側から見て反時計回りにそろえる
      const e1 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]], e2 = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) pts = pts.slice().reverse();
      const b = this.n;
      for (const p of pts) { const uv = uvOf(p, n); this.vert(p, n, uv[0], uv[1], layer, c, aoY(p[1])); }
      if (pts.length === 4) this.i.push(b, b + 1, b + 2, b, b + 2, b + 3); else this.i.push(b, b + 1, b + 2);
    };
    // 6つの面（内側の四角）
    for (let a = 0; a < 3; a++) for (const sg of [1, -1]) {
      if (!(f & bitOf(a, sg))) continue;
      const u = (a + 1) % 3, v = (a + 2) % 3;
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => { const g = [0, 0, 0]; g[a] = sg; g[u] = su; g[v] = sv; return P(a, g); });
      const n = [0, 0, 0]; n[a] = sg;
      poly(pts, n, faceCol(a, sg));
    }
    // 12の縁（2つの面のあいだの斜めの帯）
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) for (const sa of [1, -1]) for (const sb of [1, -1]) {
      if (!(f & bitOf(a, sa)) && !(f & bitOf(b, sb))) continue;
      const c = 3 - a - b;
      const pts = [];
      for (const sc of [-1, 1]) { const g = [0, 0, 0]; g[a] = sa; g[b] = sb; g[c] = sc; pts.push(P(a, g)); }
      for (const sc of [1, -1]) { const g = [0, 0, 0]; g[a] = sa; g[b] = sb; g[c] = sc; pts.push(P(b, g)); }
      const n = [0, 0, 0]; n[a] = sa * 0.7071; n[b] = sb * 0.7071;
      poly(pts, n, mixc(faceCol(a, sa), faceCol(b, sb), 0.5));
    }
    // 8つの角（3つの面の角を結ぶ三角）
    for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
      if (!(f & bitOf(0, sx)) && !(f & bitOf(1, sy)) && !(f & bitOf(2, sz))) continue;
      const g = [sx, sy, sz];
      const n = [sx * 0.5774, sy * 0.5774, sz * 0.5774];
      poly([P(0, g), P(1, g), P(2, g)], n, faceCol(1, sy));
    }
  }
  // 凸な多角形の面。点の並びは法線 n の側から見て反時計回りになるよう自動でそろえる
  poly(pts, n, layer, col, ao = 1) {
    const m = pts.length;
    if (m < 3) return;
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < m; i++) { const a = pts[i], b = pts[(i + 1) % m]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
    if (nx * n[0] + ny * n[1] + nz * n[2] < 0) pts = pts.slice().reverse();
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    const base = this.n;
    for (const p of pts) {
      const uv = ay >= ax && ay >= az ? [p[0], p[2]] : ax >= az ? [n[0] > 0 ? -p[2] : p[2], p[1]] : [n[2] > 0 ? p[0] : -p[0], p[1]];
      this.vert(p, n, uv[0], uv[1], layer, col, ao);
    }
    for (let i = 1; i < m - 1; i++) this.i.push(base, base + i, base + i + 1);
  }
  // 横（X）へ押し出した凸な多角形。pts = [[z, y], ...]（z を右・y を上に見て反時計回り）。
  // o.edgeCols: 辺ごとの色（ガラスなど）、o.bevel: 両側の縁の面取り、o.capCol: 両側の面の色
  prismX(pts, x0, x1, layer, col, o = {}) {
    const m = pts.length, ec = o.edgeCols || [], bv = o.bevel || 0;
    let cu = 0, cv = 0; for (const q of pts) { cu += q[0]; cv += q[1]; } cu /= m; cv /= m;
    const shrink = (q) => { const du = q[0] - cu, dv = q[1] - cv, d = Math.hypot(du, dv) || 1; const k = Math.max(0, 1 - bv / d); return [cu + du * k, cv + dv * k]; };
    const xa = x0 + bv, xb = x1 - bv, capC = o.capCol || col;
    for (let i = 0; i < m; i++) {
      const a = pts[i], b = pts[(i + 1) % m];
      const du = b[0] - a[0], dv = b[1] - a[1], L = Math.hypot(du, dv) || 1;
      this.poly([[xa, a[1], a[0]], [xb, a[1], a[0]], [xb, b[1], b[0]], [xa, b[1], b[0]]], [0, -du / L, dv / L], layer, ec[i] || col);
    }
    const S = bv > 0 ? pts.map(shrink) : pts;
    for (const [xs, xe, sg] of [[xb, x1, 1], [xa, x0, -1]]) {
      this.poly(S.map(q => [xe, q[1], q[0]]), [sg, 0, 0], layer, capC);
      if (bv > 0) for (let i = 0; i < m; i++) {
        const a = pts[i], b = pts[(i + 1) % m], sa = S[i], sb = S[(i + 1) % m];
        const du = b[0] - a[0], dv = b[1] - a[1], L = Math.hypot(du, dv) || 1;
        this.poly([[xs, a[1], a[0]], [xs, b[1], b[0]], [xe, sb[1], sb[0]], [xe, sa[1], sa[0]]], nrm([sg, -du / L, dv / L]), layer, mixc(ec[i] || col, capC, 0.5));
      }
    }
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
