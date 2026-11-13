// 描画の司令塔: 太陽の影 → 本描画(HDR: 空・世界・扉・人・銃・粒子・ガラス) → 一人称 → 光のにじみ → 仕上げ（トーンマップ・暗視・閃光） → FXAA
import { createGL, tex2D, fbo, depthTex } from './gl.js';
import { m4, m4mul, m4persp, m4lookAt, m4invert, frustumPlanes, aabbVisible } from './math.js';
import { buildOutskirts } from './outskirts.js';
import { makeTextures, TEX, NLAYER, LAYER } from './textures.js';
import { COMMON, LIGHT, WORLD_VS, WORLD_FS, SKIN_VS, SKIN_FS, SHADOW_VS, SHADOW_SKIN_VS, SHADOW_FS, FS_VS, SKY_FS, FX_VS, FX_FS, DOWN_FS, UP_FS, COMP_FS, FXAA_FS, COPY_FS, MAX_DL } from './shaders.js';
import { prepareLevel, buildChunk, doorLeafMesh, barPanelMesh, CHUNK } from './level.js';
import { WV, MeshBuilder, hex } from './build.js';
import { bakeLight } from '../engine/light.js';
import { CS, LH, CEIL, NB, DSHIELD } from '../engine/world.js';
import { buildWarFar, buildWarNear, buildWarGrass } from '../war/render.js';

// 大規模戦の空（もやを薄く、遠くまで見える。日は少し低めで影が長い）
export const WAR_SKY = { sky: [0.54, 0.67, 0.9], ground: [0.3, 0.29, 0.24], sun: [2.75, 2.5, 2.12], sunDir: (() => { const v = [0.5, 0.64, 0.36], l = Math.hypot(...v); return v.map(x => x / l); })(), fog: [0.7, 0.77, 0.86], fogD: 0.0011, amb: 0.03, exposure: 0.8, zenith: [0.23, 0.43, 0.86], horizon: [0.73, 0.8, 0.9], night: 0 };

// 画質: まとめて選ぶ（低・中・高）か、細かく選ぶ（カスタム）
export const QUALITY = { low: { name: '低' }, medium: { name: '中' }, high: { name: '高' }, custom: { name: 'カスタム' } };
export const GFX_PRESET = {
  low: { detail: 'low', shadow: 'off', bloom: false, aa: 'fxaa', lights: 4, fx: 'low', shells: false },
  medium: { detail: 'medium', shadow: 'low', bloom: true, aa: 'fxaa', lights: 6, fx: 'normal', shells: true },
  high: { detail: 'high', shadow: 'high', bloom: true, aa: 'msaa', lights: 8, fx: 'high', shells: true },
};
// 設定 → 描画の中身。budget: 描く画素の上限（それより細かい画面は縮めて描く）
export function gfxOf(settings) { return settings.quality === 'custom' ? { ...GFX_PRESET.medium, ...(settings.gfx || {}) } : GFX_PRESET[settings.quality] || GFX_PRESET.medium; }
export function qualityOf(g) {
  g = g || GFX_PRESET.medium;
  const q = {
    budget: { low: 0.36e6, medium: 0.8e6, high: 1.4e6, max: 2.2e6 }[g.detail] || 0.8e6,
    shadow: { off: 0, low: 1024, high: 2048 }[g.shadow] ?? 1024,
    bloom: g.bloom === false ? 0 : 5,
    msaa: g.aa === 'msaa' ? 4 : 0,
    fxaa: g.aa === 'fxaa',
    maxDL: Math.max(1, Math.min(8, g.lights || 6)),
  };
  q.key = [q.budget, q.shadow, q.bloom, q.msaa, q.fxaa ? 1 : 0, q.maxDL].join(':');
  return q;
}

// 半精度（RGBA16F の3Dテクスチャ用）
const _f32 = new Float32Array(1), _u32 = new Uint32Array(_f32.buffer);
export function toHalf(v) {
  _f32[0] = v; const x = _u32[0];
  const s = (x >>> 16) & 0x8000; let e = ((x >>> 23) & 0xff) - 127 + 15; let m = x & 0x7fffff;
  if (e <= 0) { if (e < -10) return s; m = (m | 0x800000) >> (1 - e); return s | ((m + 0x1000) >> 13); }
  if (e >= 31) return s | 0x7c00;
  const h = s | (e << 10) | ((m + 0x1000) >> 13);
  return h;
}

function vaoWorld(gl, v, i) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
  const st = WV * 4, at = (l, n, o) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, st, o * 4); };
  at(0, 3, 0); at(1, 3, 3); at(2, 2, 6); at(3, 1, 8); at(4, 3, 9); at(5, 1, 12); at(6, 1, 13); at(7, 1, 14);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, i, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, vb, ib, n: i.length, type: i instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
}
export function makeWorldMesh(gl, B) { const { v, i } = B.arrays(); if (!i.length) return null; return vaoWorld(gl, v, i); }
function delMesh(gl, m) { if (!m) return; gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vb); gl.deleteBuffer(m.ib); }
export function drawMesh(gl, m) { if (!m) return; gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.n, m.type, 0); }

const PREC = 'precision highp float;\nprecision highp int;\nprecision highp sampler2DArray;\nprecision highp sampler3D;\nprecision highp sampler2DShadow;\n';
function compile(gl, type, src, name) {
  const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(sh); const m = /ERROR: \d+:(\d+)/.exec(log || '');
    const lines = src.split('\n'); const near = m ? lines.slice(Math.max(0, +m[1] - 3), +m[1] + 2).map((l, k) => (Math.max(0, +m[1] - 3) + k + 1) + ': ' + l).join('\n') : '';
    throw new Error(`シェーダーのエラー(${name}): ${log}\n${near}`);
  }
  return sh;
}
function prog(gl, vs, fs, name, defs = '') {
  const head = '#version 300 es\n' + defs + PREC;
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, head + vs, name + '.vs'));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, head + fs, name + '.fs'));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`リンクのエラー(${name}): ${gl.getProgramInfoLog(p)}`);
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let k = 0; k < n; k++) { const info = gl.getActiveUniform(p, k); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
  // テクスチャの番号は固定
  gl.useProgram(p);
  const units = { uTex: 0, uLG: 1, uWM: 2, uAO: 3, uDLR: 4, uShadow: 5, uSrc: 6, uBloom: 7 };
  for (const [k, v] of Object.entries(units)) if (u[k]) gl.uniform1i(u[k], v);
  return { p, u, name };
}

export class Renderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    const gl = createGL(canvas, { preserve: !!opts.preserve });
    if (!gl) throw new Error('WebGL2が使えません');
    this.gl = gl;
    this.q = qualityOf(opts.gfx);
    this.qName = this.q.key;
    this.vp = m4(); this.view = m4(); this.proj = m4(); this.invVP = m4(); this.shVP = m4(); this.vmVP = m4(); this.ident = m4(); this.tmpM = m4();
    this.planes = new Float32Array(24);
    this.stats = { draws: 0, tris: 0, chunks: 0 };
    this.w = 0; this.h = 0;
    this.time = 0;
    this.hooks = { opaque: [], shadow: [], transparent: [], viewmodel: [] };
    this._init();
  }
  // 描き足す処理を登録し、外す関数を返す。場面（タイトル・試合）が変わったら外す
  // （外さないと、前の場面の人・粒子・手元の銃が描かれ続ける。タイトルの隊員が試合の中に、当たり判定のない動かない人として残っていた）
  hook(kind, fn) { this.hooks[kind].push(fn); return () => { const L = this.hooks[kind], i = L.indexOf(fn); if (i >= 0) L.splice(i, 1); }; }
  _init() {
    const gl = this.gl;
    const L = COMMON + LIGHT;
    this.P = {
      world: prog(gl, WORLD_VS, L + WORLD_FS, 'world'),
      glass: prog(gl, WORLD_VS, L + WORLD_FS, 'glass', '#define GLASS 1\n'),
      skin: prog(gl, SKIN_VS, L + SKIN_FS, 'skin'),
      shadow: prog(gl, SHADOW_VS, SHADOW_FS, 'shadow'),
      shadowSkin: prog(gl, SHADOW_SKIN_VS, SHADOW_FS, 'shadowSkin'),
      sky: prog(gl, FS_VS, L + SKY_FS, 'sky'),
      fx: prog(gl, FX_VS, L + FX_FS, 'fx'),
      down: prog(gl, FS_VS.replace('1.0, 1.0)', '0.0, 1.0)'), DOWN_FS, 'down'),
      up: prog(gl, FS_VS.replace('1.0, 1.0)', '0.0, 1.0)'), UP_FS, 'up'),
      comp: prog(gl, FS_VS.replace('1.0, 1.0)', '0.0, 1.0)'), COMMON + COMP_FS, 'comp'),
      fxaa: prog(gl, FS_VS.replace('1.0, 1.0)', '0.0, 1.0)'), FXAA_FS, 'fxaa'),
      copy: prog(gl, FS_VS.replace('1.0, 1.0)', '0.0, 1.0)'), COPY_FS, 'copy'),
    };
    // 質感のテクスチャ配列
    const data = makeTextures();
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, TEX, TEX, NLAYER, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    if (gl.ext.aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, gl.ext.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    this.texArr = t;
    // 小さな既定のテクスチャ
    this.blank = tex2D(gl, 1, 1, { data: new Uint8Array([255, 255, 255, 255]) });
    this.dlr = null; this.dlrData = null;
    this.vaoEmpty = gl.createVertexArray();
  }
  setQuality(g) {
    const q = qualityOf(g);
    if (q.key === this.qName) return;
    this.qName = q.key; this.q = q; this.w = 0;
  }

  // ---- 画面の大きさと描画先
  _targets(W, H) {
    const gl = this.gl, q = this.q;
    if (this.w === W && this.h === H && this.tq === this.qName) return;
    this._freeTargets();
    this.w = W; this.h = H; this.tq = this.qName;
    const hf = gl.hdr ? gl.RGBA16F : gl.RGBA8, ht = gl.hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    this.hdr = tex2D(gl, W, H, { internal: hf, format: gl.RGBA, type: ht });
    this.depth = depthTex(gl, W, H, false);
    this.hdrF = fbo(gl, this.hdr, this.depth);
    this.msaa = 0;
    if (q.msaa && gl.hdr && gl.maxSamples >= 2) {
      const s = Math.min(q.msaa, gl.maxSamples);
      this.msC = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, this.msC); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, s, hf, W, H);
      this.msD = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, this.msD); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, s, gl.DEPTH_COMPONENT24, W, H);
      this.msF = fbo(gl, this.msC, this.msD);
      if (this.msF.ok) this.msaa = s;
    }
    this.bloomT = [];
    let bw = W, bh = H;
    for (let i = 0; i < q.bloom; i++) {
      bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
      const t = tex2D(gl, bw, bh, { internal: hf, format: gl.RGBA, type: ht });
      this.bloomT.push({ t, f: fbo(gl, t, null), w: bw, h: bh });
    }
    if (q.fxaa) { this.ldr = tex2D(gl, W, H, {}); this.ldrF = fbo(gl, this.ldr, null); }
    if (q.shadow) { this.shT = depthTex(gl, q.shadow, q.shadow, true); this.shF = fbo(gl, null, this.shT); }
  }
  _freeTargets() {
    const gl = this.gl, dt = t => t && gl.deleteTexture(t), df = f => f && gl.deleteFramebuffer(f);
    dt(this.hdr); dt(this.depth); df(this.hdrF);
    if (this.msC) { gl.deleteRenderbuffer(this.msC); gl.deleteRenderbuffer(this.msD); df(this.msF); this.msC = this.msD = this.msF = null; }
    for (const b of this.bloomT || []) { dt(b.t); df(b.f); }
    this.bloomT = [];
    dt(this.ldr); df(this.ldrF); this.ldr = this.ldrF = null;
    dt(this.shT); df(this.shF); this.shT = this.shF = null;
  }
  resize(cssW, cssH, dpr) {
    const px = cssW * cssH * dpr * dpr;
    const s = Math.min(dpr, Math.sqrt(this.q.budget / Math.max(1, cssW * cssH)));
    const W = Math.max(64, Math.round(cssW * s)), H = Math.max(64, Math.round(cssH * s));
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    this.cssW = cssW; this.cssH = cssH; this.pxScale = s;
    return px;
  }

  // ---- マップ
  setMap(w, def, S) {
    const gl = this.gl;
    this.clearMap();
    const t0 = performance.now();
    this.w0 = w; this.def = def;
    const ctx = prepareLevel(w, def);
    this.ctx = ctx;
    const lat = bakeLight(w, def, { sunSeparate: true });
    this.lat = lat; this.sky = lat.sky;
    this.bakeMs = performance.now() - t0;
    this._uploadLight(lat);
    // 壁の印と暗がり（1バイトの行は幅が4の倍数とは限らないので、並びの区切りを1にしてから送る）
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.wmT = tex2D(gl, w.W, w.D * w.NL, { internal: gl.R8, format: gl.RED, data: ctx.wallMask, filter: gl.NEAREST });
    this.aoT = tex2D(gl, ctx.ao.W, ctx.ao.D * w.NL, { internal: gl.R8, format: gl.RED, data: ctx.ao.data, filter: gl.LINEAR });
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    // 部屋ごとの動く光の届き方
    this.nRooms = Math.max(1, w.rooms.length);
    this.dlrData = new Uint8Array(this.nRooms * MAX_DL);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.dlr = tex2D(gl, this.nRooms, MAX_DL, { internal: gl.R8, format: gl.RED, data: this.dlrData, filter: gl.NEAREST });
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    // 塊
    this.NCi = Math.ceil(w.W / CHUNK); this.NCj = Math.ceil(w.D / CHUNK);
    this.chunks = [];
    for (let L = 0; L < w.NL; L++) for (let cj = 0; cj < this.NCj; cj++) for (let ci = 0; ci < this.NCi; ci++) {
      const ch = { L, ci, cj, x0: ci * CHUNK * CS, z0: cj * CHUNK * CS, x1: Math.min(w.W, (ci + 1) * CHUNK) * CS, z1: Math.min(w.D, (cj + 1) * CHUNK) * CS, y0: L * LH - 0.3, y1: L * LH + LH + 5.2, mesh: null, glass: null };
      this._buildChunk(ch, S);
      this.chunks.push(ch);
    }
    // 扉
    this.doorMeshes = w.doors.map(d => ({ leaves: d.leaves.map((lf, li) => makeWorldMesh(gl, doorLeafMesh(ctx, d, li))) }));
    this.barMeshes = [];
    // マップの外まわり（道・隣の建物・遠くの景色）
    try { const o = buildOutskirts(w, def, { lite: !!(this.q && this.q.budget <= 0.4e6) }); this.outer = { mesh: makeWorldMesh(gl, o.B), glass: makeWorldMesh(gl, o.G), tris: o.B.i.length / 3 }; } catch (e) { console.warn('outskirts', e); this.outer = null; }
    this.roofY = w.NL * LH;
    this.buildMs = performance.now() - t0;
  }
  _buildChunk(ch, S) {
    const gl = this.gl;
    delMesh(gl, ch.mesh); delMesh(gl, ch.glass);
    const { B, G } = buildChunk(this.ctx, S, ch.L, ch.ci, ch.cj);
    ch.mesh = makeWorldMesh(gl, B); ch.glass = makeWorldMesh(gl, G);
    ch.tris = ch.mesh ? ch.mesh.n / 3 : 0;
  }
  // 壊れた壁などのあと: そのマスと隣の塊を作り直す
  rebuildCells(cells, S) {
    if (!this.chunks) return;
    const w = this.w0, todo = new Set();
    for (const k of cells) {
      const L = Math.floor(k / (w.W * w.D)), r = k - L * w.W * w.D, j = Math.floor(r / w.W), i = r - j * w.W;
      for (const [di, dj] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= w.W || jj >= w.D) continue;
        todo.add((L * this.NCj + Math.floor(jj / CHUNK)) * this.NCi + Math.floor(ii / CHUNK));
      }
    }
    for (const c of todo) this._buildChunk(this.chunks[c], S);
  }
  _uploadLight(lat) {
    const gl = this.gl;
    const { W1, D1, NLy, data, sunVis, skyVis } = lat;
    const Z = 6 * NLy;
    const buf = new Uint16Array(W1 * D1 * Z * 4);
    for (let dir = 0; dir < 6; dir++) for (let ly = 0; ly < NLy; ly++) for (let j = 0; j < D1; j++) for (let i = 0; i < W1; i++) {
      const p = (ly * D1 + j) * W1 + i;
      const o = p * 18 + dir * 3;
      const q = (((dir * NLy + ly) * D1 + j) * W1 + i) * 4;
      buf[q] = toHalf(data[o]); buf[q + 1] = toHalf(data[o + 1]); buf[q + 2] = toHalf(data[o + 2]);
      buf[q + 3] = toHalf(dir === 2 ? sunVis[p] : dir === 3 ? skyVis[p] : 0);
    }
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, t);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, W1, D1, Z, 0, gl.RGBA, gl.HALF_FLOAT, buf);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.CLAMP_TO_EDGE);
    this.lgT = t; this.lgDim = [W1, D1, NLy, this.w0.NL];
  }
  clearMap() {
    const gl = this.gl;
    for (const ch of this.chunks || []) { if ('far' in ch) { delMesh(gl, ch.far); delMesh(gl, ch.near); delMesh(gl, ch.grass); } else { delMesh(gl, ch.mesh); delMesh(gl, ch.glass); } }
    this.war = null;
    for (const d of this.doorMeshes || []) { for (const m of d.leaves) delMesh(gl, m); }
    for (const b of this.barMeshes || []) if (b) delMesh(gl, b.mesh);
    this.barMeshes = null;
    if (this.outer) { delMesh(gl, this.outer.mesh); delMesh(gl, this.outer.glass); this.outer = null; }
    for (const t of [this.lgT, this.wmT, this.aoT, this.dlr]) if (t) gl.deleteTexture(t);
    this.chunks = null; this.doorMeshes = null; this.lgT = this.wmT = this.aoT = this.dlr = null;
  }

  // ---- 大規模戦の世界（src/war）: 光の格子は使わない（空の光＋日の光＋近くの影）。塊は遠い形をいつも持ち、近い形は近づいたときに作る
  setWar(ww, o = {}) {
    const gl = this.gl;
    this.clearMap();
    const t0 = performance.now();
    this.war = ww; this.w0 = ww; this.def = null; this.ctx = null;
    this.sky = o.sky || WAR_SKY;
    this.viewDist = o.viewDist || 900;
    this.nearDist = o.nearDist || 170;
    this.shR = o.shadowR || 44;
    // 草を描く距離（0 で描かない）と濃さ
    this.grassD = o.grassDist ?? 0; this.grassDens = o.grassDens ?? 1;
    // 使わない光の格子などは 1 画素の物を置く（シェーダーの決まりのため）
    const t3 = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, t3);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, 1, 1, 6, 0, gl.RGBA, gl.HALF_FLOAT, new Uint16Array(24));
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.lgT = t3; this.lgDim = [1, 1, 1, 1];
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.wmT = tex2D(gl, 1, 1, { internal: gl.R8, format: gl.RED, data: new Uint8Array([0]), filter: gl.NEAREST });
    this.aoT = tex2D(gl, 1, 1, { internal: gl.R8, format: gl.RED, data: new Uint8Array([255]), filter: gl.NEAREST });
    this.nRooms = 1;
    this.dlrData = new Uint8Array(MAX_DL);
    this.dlr = tex2D(gl, 1, MAX_DL, { internal: gl.R8, format: gl.RED, data: this.dlrData, filter: gl.NEAREST });
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    this.chunks = buildWarFar(ww).map(c => { const m = makeWorldMesh(gl, c.B); return { k: c.k, x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, y0: c.y0, y1: c.y1, far: m, farTris: m ? m.n / 3 : 0, near: null, nearTris: 0, grass: null, grassTris: 0, mesh: m, glass: null, tris: m ? m.n / 3 : 0, d: 1e9 }; });
    this.doorMeshes = []; this.barMeshes = []; this.outer = null;
    this.roofY = 1e9;
    this.buildMs = performance.now() - t0;
  }
  // 近い形を作る・捨てる。budget: 1こまで作る数（-1 で全部）
  _warSelect(c, budget = 2) {
    const gl = this.gl, N = this.nearDist;
    const want = [];
    for (const ch of this.chunks) {
      ch.d = Math.hypot((ch.x0 + ch.x1) / 2 - c.x, (ch.z0 + ch.z1) / 2 - c.z);
      if (ch.d < N && !ch.near) want.push(ch);
      else if (ch.near && ch.d > N + 110) { delMesh(gl, ch.near); ch.near = null; ch.nearTris = 0; }
    }
    want.sort((a, b) => a.d - b.d);
    const nb = budget < 0 ? want.length : Math.min(want.length, budget);
    for (let k = 0; k < nb; k++) { const ch = want[k]; ch.near = makeWorldMesh(gl, buildWarNear(this.war, ch.k)); ch.nearTris = ch.near ? ch.near.n / 3 : 0; }
    // 草（近い塊だけ。塊の中心から grassD＋45m 以内）
    const G = this.grassD;
    if (G > 0) {
      let gb = budget < 0 ? 1e9 : 1;
      const gw = [];
      for (const ch of this.chunks) {
        if (ch.d < G + 45 && !ch.grass) gw.push(ch);
        else if (ch.grass && ch.d > G + 110) { delMesh(gl, ch.grass); ch.grass = null; ch.grassTris = 0; }
      }
      gw.sort((a, b) => a.d - b.d);
      for (const ch of gw) { if (gb-- <= 0) break; ch.grass = makeWorldMesh(gl, buildWarGrass(this.war, ch.k, this.grassDens)); ch.grassTris = ch.grass ? ch.grass.n / 3 : 0; }
    }
    for (const ch of this.chunks) {
      const useNear = ch.near && ch.d < N + 40;
      ch.mesh = useNear ? ch.near : ch.far; ch.tris = useNear ? ch.nearTris : ch.farTris;
    }
  }
  // 見る位置のまわりの近い形を先に全部作る（出撃のとき）
  warmWar(x, z) { if (this.war) this._warSelect({ x, z }, -1); }

  // ---- 共通のuniform
  _bindLight(P, opts) {
    const gl = this.gl, u = P.u, sky = this.sky;
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texArr);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, this.lgT);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.wmT);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.aoT);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.dlr);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, this.shT || this.blankDepth());
    if (u.uLGd) gl.uniform4f(u.uLGd, ...this.lgDim);
    if (u.uMapD) gl.uniform4f(u.uMapD, this.w0.W, this.w0.D, CS, LH);
    if (u.uSunDir) gl.uniform3fv(u.uSunDir, sky.sunDir);
    if (u.uSunCol) gl.uniform3fv(u.uSunCol, sky.sun);
    if (u.uShadowOn) gl.uniform1f(u.uShadowOn, this.shadowOn ? 1 : 0);
    if (u.uShadowVP) gl.uniformMatrix4fv(u.uShadowVP, false, this.shVP);
    if (u.uShadowTexel) gl.uniform1f(u.uShadowTexel, this.q.shadow ? 1 / this.q.shadow : 0);
    if (u.uSkyCol) gl.uniform3fv(u.uSkyCol, sky.sky);
    if (u.uAmbMin) gl.uniform1f(u.uAmbMin, opts.ambMin || 0);
    if (u.uWar) gl.uniform1f(u.uWar, this.war ? 1 : 0);
    if (u.uOuter) gl.uniform1f(u.uOuter, this.war ? 1 : 0);
    if (u.uFogFar) gl.uniform1f(u.uFogFar, this.war ? this.viewDist : 0);
    if (u.uGrassD) gl.uniform1f(u.uGrassD, this.war ? this.grassD || 1 : 1);
    if (u.uCam) gl.uniform3fv(u.uCam, this.camPos);
    if (u.uFogCol) gl.uniform3fv(u.uFogCol, sky.fog);
    if (u.uFogD) gl.uniform1f(u.uFogD, sky.fogD * (opts.fogMul ?? 1));
    if (u.uFogIn) gl.uniform1f(u.uFogIn, 0.25);
    if (u.uTime) gl.uniform1f(u.uTime, this.time);
    if (u.uRoofY) gl.uniform1f(u.uRoofY, this.roofY);
    if (u.uEmitK) gl.uniform1f(u.uEmitK, opts.emitK ?? 1);
    if (u.uTint) gl.uniform3f(u.uTint, 1, 1, 1);
    if (u.uRoomOverride) gl.uniform1f(u.uRoomOverride, -1);
    if (u.uVM) gl.uniform1f(u.uVM, 0);
    if (u.uModel) gl.uniformMatrix4fv(u.uModel, false, this.ident);
    if (u.uDLn) {
      gl.uniform1i(u.uDLn, this.dlN);
      if (this.dlN) { gl.uniform4fv(u.uDLp, this.dlP); gl.uniform4fv(u.uDLc, this.dlC); gl.uniform4fv(u.uDLd, this.dlD); }
    }
  }
  blankDepth() {
    if (!this._bd) { this._bd = depthTex(this.gl, 1, 1, true); }
    return this._bd;
  }

  // 動く光: [{x,y,z,r, col:[r,g,b], spot:{dx,dy,dz,cos}, rooms:[...]}]
  _setLights(list) {
    const n = Math.min(this.q.maxDL, MAX_DL, list.length);
    this.dlN = n;
    this.dlP = new Float32Array(MAX_DL * 4); this.dlC = new Float32Array(MAX_DL * 4); this.dlD = new Float32Array(MAX_DL * 4);
    this.dlrData.fill(0);
    for (let i = 0; i < n; i++) {
      const L = list[i];
      this.dlP.set([L.x, L.y, L.z, L.r], i * 4);
      this.dlC.set([L.col[0], L.col[1], L.col[2], L.spot ? 1 : 0], i * 4);
      if (L.spot) this.dlD.set([L.spot.dx, L.spot.dy, L.spot.dz, L.spot.cos], i * 4);
      if (this.war) this.dlrData[i * this.nRooms] = 255;
      else if (L.rooms) for (const r of L.rooms) if (r >= 0 && r < this.nRooms) this.dlrData[i * this.nRooms + r] = 255;
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.dlr);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.nRooms, MAX_DL, gl.RED, gl.UNSIGNED_BYTE, this.dlrData);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  // ---- 1こまの描画
  // f: { cam:{x,y,z,yaw,pitch,roll,fov}, doors: S.doors, lights:[...], post:{...}, ambMin, fogMul }
  render(f) {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    this.time += f.dt || 0.016;
    const W = this.canvas.width, H = this.canvas.height;
    this._targets(W, H);
    this.stats.draws = 0; this.stats.tris = 0; this.stats.chunks = 0;
    const c = f.cam;
    const cp = Math.cos(c.pitch), fx = Math.sin(c.yaw) * cp, fy = Math.sin(c.pitch), fz = Math.cos(c.yaw) * cp;
    // 横の傾き（リーン）: 上の向きを前の軸まわりに回す
    let ux = 0, uy = 1, uz = 0;
    if (c.roll) {
      const rx = -Math.cos(c.yaw), rz = Math.sin(c.yaw); // 右
      const cr = Math.cos(c.roll), sr = Math.sin(c.roll);
      ux = rx * sr; uy = cr; uz = rz * sr;
    }
    this.camPos = [c.x, c.y, c.z];
    m4lookAt(this.view, c.x, c.y, c.z, c.x + fx, c.y + fy, c.z + fz, ux, uy, uz);
    m4persp(this.proj, c.fov, W / H, this.war ? 0.08 : 0.04, this.war ? this.viewDist + 60 : 400);
    m4mul(this.vp, this.proj, this.view);
    m4invert(this.invVP, this.vp);
    frustumPlanes(this.vp, this.planes);
    this._setLights(f.lights || []);
    if (this.war) this._warSelect(c);
    // 影
    this.shadowOn = false;
    if (this.q.shadow && this.sky.night < 0.5 && f.shadows !== false) this._shadowPass(c);
    // 本描画
    const target = this.msaa ? this.msF : this.hdrF;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);
    // 世界
    const P = this.P.world;
    this._bindLight(P, f);
    gl.uniformMatrix4fv(P.u.uVP, false, this.vp);
    const vis = [];
    for (const ch of this.chunks) {
      if (!ch.mesh) continue;
      if (this.war && ch.d > this.viewDist + 46) continue;
      if (!aabbVisible(this.planes, ch.x0, ch.y0, ch.z0, ch.x1, ch.y1, ch.z1)) continue;
      const d = Math.hypot((ch.x0 + ch.x1) / 2 - c.x, (ch.y0 + ch.y1) / 2 - c.y, (ch.z0 + ch.z1) / 2 - c.z);
      vis.push([d, ch]);
    }
    vis.sort((a, b) => a[0] - b[0]);
    for (const [, ch] of vis) { drawMesh(gl, ch.mesh); this.stats.draws++; this.stats.tris += ch.tris; this.stats.chunks++; }
    // 草（裏も描く）
    if (this.grassD > 0) {
      gl.disable(gl.CULL_FACE);
      for (const [, ch] of vis) if (ch.grass && ch.d < this.grassD + 45) { drawMesh(gl, ch.grass); this.stats.draws++; this.stats.tris += ch.grassTris; }
      gl.enable(gl.CULL_FACE);
    }
    if (this.outer && this.outer.mesh) { if (P.u.uOuter) gl.uniform1f(P.u.uOuter, 1); drawMesh(gl, this.outer.mesh); if (P.u.uOuter) gl.uniform1f(P.u.uOuter, 0); this.stats.draws++; this.stats.tris += this.outer.tris; }
    // 扉
    if (f.doors) { this._drawDoors(P, f.doors); this._drawBars(P, f.doors.bars); this._drawDeps(P, f.doors.deps); }
    for (const h of this.hooks.opaque) h(this, f);
    // 空（奥の深さ1で、まだ何も描いていない所だけ）
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    const SP = this.P.sky;
    this._bindLight(SP, f);
    gl.uniformMatrix4fv(SP.u.uInvVP, false, this.invVP);
    gl.uniform3fv(SP.u.uZenith, this.sky.zenith || [0.25, 0.45, 0.85]);
    gl.uniform3fv(SP.u.uHorizon, this.sky.horizon || this.sky.fog);
    gl.uniform3fv(SP.u.uGround, this.sky.ground);
    gl.uniform3fv(SP.u.uSunD, this.sky.sunDir);
    gl.uniform3fv(SP.u.uSunC, this.sky.sun);
    gl.uniform1f(SP.u.uNight, this.sky.night || 0);
    gl.bindVertexArray(this.vaoEmpty);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    // 透明: ガラス（奥から）
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    const GP = this.P.glass;
    this._bindLight(GP, f);
    gl.uniformMatrix4fv(GP.u.uVP, false, this.vp);
    gl.disable(gl.CULL_FACE);
    if (this.outer && this.outer.glass) { if (GP.u.uOuter) gl.uniform1f(GP.u.uOuter, 1); drawMesh(gl, this.outer.glass); if (GP.u.uOuter) gl.uniform1f(GP.u.uOuter, 0); }
    for (let k = vis.length - 1; k >= 0; k--) { const ch = vis[k][1]; if (ch.glass) { drawMesh(gl, ch.glass); this.stats.draws++; } }
    for (const h of this.hooks.transparent) h(this, f);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    // 一人称（深さを消して手前に）
    if (this.hooks.viewmodel.length && f.vm) {
      gl.clear(gl.DEPTH_BUFFER_BIT);
      m4persp(this.tmpM, f.vm.fov, W / H, 0.01, 6);
      m4mul(this.vmVP, this.tmpM, this.view);
      for (const h of this.hooks.viewmodel) h(this, f);
    }
    // MSAA を解く
    if (this.msaa) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msF);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.hdrF);
      gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }
    this._post(f.post || {}, W, H);
  }

  _drawDoors(P, doors) {
    const gl = this.gl, w = this.w0;
    const M = this.tmpM;
    for (let i = 0; i < w.doors.length; i++) {
      const d = w.doors[i], ds = doors[i], dm = this.doorMeshes[i];
      if (!ds || !dm) continue;
      const base = d.L * LH;
      const cx = d.cx, cz = d.cz;
      if (!aabbVisible(this.planes, cx - 1.6, base, cz - 1.6, cx + 1.6, base + 2.2, cz + 1.6)) continue;
      const room = w.roomAt[w.idx(d.L, Math.floor((d.cx + d.nx * 0.5) / CS), Math.floor((d.cz + d.nz * 0.5) / CS))];
      gl.uniform1f(P.u.uRoomOverride, Math.max(0, room));
      if (!ds.broken) for (let li = 0; li < d.leaves.length; li++) {
        const lf = d.leaves[li], ang = ds.ang[li];
        const c = Math.cos(ang), s = Math.sin(ang);
        const dx = lf.dx * c - lf.dz * s, dz = lf.dx * s + lf.dz * c;
        // 列 X=(dx,0,dz), Y=(0,1,0), Z=(-dz,0,dx)
        M[0] = dx; M[1] = 0; M[2] = dz; M[3] = 0; M[4] = 0; M[5] = 1; M[6] = 0; M[7] = 0; M[8] = -dz; M[9] = 0; M[10] = dx; M[11] = 0;
        M[12] = lf.hx; M[13] = base; M[14] = lf.hz; M[15] = 1;
        gl.uniformMatrix4fv(P.u.uModel, false, M);
        drawMesh(gl, dm.leaves[li]); this.stats.draws++;
      }
      // 扉の罠（中の側）: 枠の横の箱と、扉の下を横切る細い線
      if (ds.trap && ds.trap.side && !ds.broken) {
        const tm = this._trapMesh(d);
        const sd = ds.trap.side;
        if (d.axis === 0) { if (sd > 0) M.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, d.a0, base, d.c, 1]); else M.set([-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, d.a1, base, d.c, 1]); }
        else { if (sd > 0) M.set([0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, d.c, base, d.a1, 1]); else M.set([0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, d.c, base, d.a0, 1]); }
        gl.uniformMatrix4fv(P.u.uModel, false, M);
        drawMesh(gl, tm); this.stats.draws++;
      }
    }
    gl.uniform1f(P.u.uRoomOverride, -1);
    gl.uniformMatrix4fv(P.u.uModel, false, this.ident);
  }
  // バリケード（扉・窓）: かけらが変わったら、その枠だけ作り直す
  _drawBars(P, bars) {
    const gl = this.gl, w = this.w0;
    if (!bars || !w.bars || !this.barMeshes) return;
    for (let i = 0; i < w.bars.length; i++) {
      const st = bars[i];
      if (!st || !st.h) continue;
      const s = w.bars[i];
      if (!aabbVisible(this.planes, s.box[0] - 0.1, s.y0, s.box[1] - 0.1, s.box[2] + 0.1, s.y1, s.box[3] + 0.1)) continue;
      let bm = this.barMeshes[i];
      if (!bm || bm.h !== st.h) { if (bm) delMesh(gl, bm.mesh); bm = this.barMeshes[i] = { h: st.h, mesh: makeWorldMesh(gl, barPanelMesh(s, st.h)) }; }
      if (!bm.mesh) continue;
      gl.uniform1f(P.u.uRoomOverride, Math.max(0, s.room));
      drawMesh(gl, bm.mesh); this.stats.draws++;
    }
    gl.uniform1f(P.u.uRoomOverride, -1);
  }

  // 置いた物（置ける盾・有刺鉄線）: 形は1度だけ作り、向きと位置の行列で描く。ローカル: X = 幅（置いた人の右）、Y = 上、Z = 置いた人の側（後ろ）
  _drawDeps(P, deps) {
    const gl = this.gl, w = this.w0;
    if (!deps || !deps.length) return;
    if (!this._depMesh) this._depMesh = { shield: makeWorldMesh(gl, shieldMesh()), wire: makeWorldMesh(gl, wireMesh()) };
    const M = this._mDep || (this._mDep = new Float32Array(16));
    for (const d of deps) {
      if (!(d.hp > 0) || !this._depMesh[d.k]) continue;
      const r = d.k === 'wire' ? 0.95 : 0.6;
      if (!aabbVisible(this.planes, d.x - r, d.y, d.z - r, d.x + r, d.y + 1.1, d.z + r)) continue;
      const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
      // X = 右 (-fz, fx)、Z = 後ろ (-fx, -fz)（扉の板と同じ向きの決まり）
      M[0] = -fz; M[1] = 0; M[2] = fx; M[3] = 0; M[4] = 0; M[5] = 1; M[6] = 0; M[7] = 0; M[8] = -fx; M[9] = 0; M[10] = -fz; M[11] = 0;
      M[12] = d.x; M[13] = d.y; M[14] = d.z; M[15] = 1;
      gl.uniformMatrix4fv(P.u.uModel, false, M);
      const i = Math.floor(d.x / CS), j = Math.floor(d.z / CS), L = Math.max(0, Math.min(w.NL - 1, d.L | 0));
      const room = i >= 0 && j >= 0 && i < w.W && j < w.D ? w.roomAt[w.idx(L, i, j)] : -1;
      gl.uniform1f(P.u.uRoomOverride, Math.max(0, room));
      drawMesh(gl, this._depMesh[d.k]); this.stats.draws++;
    }
    gl.uniform1f(P.u.uRoomOverride, -1);
    gl.uniformMatrix4fv(P.u.uModel, false, this.ident);
  }

  // 罠の形（扉の幅と壁の厚さごと）。ローカル: X=扉にそって 0..幅、Z=罠の側。
  // 扉のすぐ内側の床に、くるぶしの高さの針金を横に張り、枠の横の床に爆薬の箱（ミラーで扉の下から見える）
  _trapMesh(d) {
    const W = d.a1 - d.a0, z0 = (d.th || 0.12) / 2, key = W.toFixed(2) + '|' + z0.toFixed(3);
    this._traps = this._traps || new Map();
    let m = this._traps.get(key);
    if (m) return m;
    const B = new MeshBuilder();
    const od = hex('#4b5133'), dk = hex('#202224'), zw = z0 + 0.26;
    // 爆薬の箱と起爆装置（赤い灯り）
    B.bbox(W + 0.06, 0.0, zw - 0.08, W + 0.26, 0.13, zw + 0.08, 0.008, LAYER.paint, od);
    B.bbox(W + 0.09, 0.13, zw - 0.04, W + 0.17, 0.165, zw + 0.03, 0.005, LAYER.rubber, dk);
    B.bbox(W + 0.19, 0.13, zw - 0.015, W + 0.21, 0.145, zw + 0.005, 0.002, LAYER.plain, hex('#e0402e'));
    // 張った針金と、反対側の留め具
    B.tube([-0.05, 0.085, zw], [W + 0.07, 0.085, zw], 0.0022, 0.0022, 5, LAYER.metal, hex('#c3c6ca'), { caps: true });
    B.bbox(-0.09, 0.0, zw - 0.03, -0.04, 0.1, zw + 0.03, 0.004, LAYER.rubber, dk);
    m = makeWorldMesh(this.gl, B);
    this._traps.set(key, m);
    return m;
  }

  _shadowPass(c) {
    const gl = this.gl, q = this.q, sky = this.sky;
    const R = this.war ? this.shR : 32, Dd = this.war ? 110 : 70;
    const sd = sky.sunDir;
    // 影の画面の中心は、カメラの少し前。テクセルの格子に合わせて揺れを防ぐ
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    let cx = c.x + fx * 10, cy = c.y, cz = c.z + fz * 10;
    const view = this.tmpM;
    m4lookAt(view, cx + sd[0] * Dd, cy + sd[1] * Dd, cz + sd[2] * Dd, cx, cy, cz, 0, 1, 0);
    // テクセルに合わせる
    const texel = (2 * R) / q.shadow;
    const px = view[0] * cx + view[4] * cy + view[8] * cz + view[12], py = view[1] * cx + view[5] * cy + view[9] * cz + view[13];
    const sx = Math.round(px / texel) * texel - px, sy = Math.round(py / texel) * texel - py;
    view[12] += sx; view[13] += sy;
    const proj = new Float32Array(16);
    // 正射影
    const l = -R, r = R, b = -R, t = R, n = 1, ff = Dd * 2;
    proj[0] = 2 / (r - l); proj[5] = 2 / (t - b); proj[10] = -2 / (ff - n); proj[12] = -(r + l) / (r - l); proj[13] = -(t + b) / (t - b); proj[14] = -(ff + n) / (ff - n); proj[15] = 1;
    m4mul(this.shVP, proj, view);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shF);
    gl.viewport(0, 0, q.shadow, q.shadow);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3.0);
    const P = this.P.shadow;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uVP, false, this.shVP);
    gl.uniformMatrix4fv(P.u.uModel, false, this.ident);
    const pl = frustumPlanes(this.shVP, new Float32Array(24));
    for (const ch of this.chunks) {
      if (!ch.mesh || !aabbVisible(pl, ch.x0, ch.y0, ch.z0, ch.x1, ch.y1, ch.z1)) continue;
      drawMesh(gl, ch.mesh);
    }
    for (const h of this.hooks.shadow) h(this, pl);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.enable(gl.CULL_FACE);
    this.shadowOn = true;
  }

  _post(p, W, H) {
    const gl = this.gl, P = this.P;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vaoEmpty);
    // にじみ
    let bloomK = 0;
    if (this.bloomT.length) {
      gl.useProgram(P.down.p);
      let src = this.hdr, sw = W, sh = H;
      for (let i = 0; i < this.bloomT.length; i++) {
        const b = this.bloomT[i];
        gl.bindFramebuffer(gl.FRAMEBUFFER, b.f); gl.viewport(0, 0, b.w, b.h);
        gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, src);
        gl.uniform2f(P.down.u.uTexel, 0.5 / sw, 0.5 / sh);
        gl.uniform1f(P.down.u.uThresh, i === 0 ? (p.nvg ? 0.15 : 1.1) : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        src = b.t; sw = b.w; sh = b.h;
      }
      gl.useProgram(P.up.p);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = this.bloomT.length - 1; i > 0; i--) {
        const s = this.bloomT[i], d = this.bloomT[i - 1];
        gl.bindFramebuffer(gl.FRAMEBUFFER, d.f); gl.viewport(0, 0, d.w, d.h);
        gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, s.t);
        gl.uniform2f(P.up.u.uTexel, 1 / s.w, 1 / s.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);
      bloomK = 0.09;
    }
    // 仕上げ
    const toLdr = this.q.fxaa && this.ldrF;
    gl.bindFramebuffer(gl.FRAMEBUFFER, toLdr ? this.ldrF : null);
    gl.viewport(0, 0, W, H);
    const C = P.comp;
    gl.useProgram(C.p);
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, this.hdr);
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, this.bloomT.length ? this.bloomT[0].t : this.blank);
    gl.uniform1f(C.u.uBloomK, bloomK);
    gl.uniform1f(C.u.uExposure, p.exposure ?? 1);
    gl.uniform1f(C.u.uVig, p.vig ?? 0.35);
    gl.uniform1f(C.u.uNVG, p.nvg ? 1 : 0);
    gl.uniform1f(C.u.uFlashW, p.flash || 0);
    gl.uniform1f(C.u.uDamage, p.damage || 0);
    gl.uniform1f(C.u.uSupp, p.supp || 0);
    gl.uniform1f(C.u.uGas, p.gas || 0);
    gl.uniform1f(C.u.uTime2, this.time);
    gl.uniform1f(C.u.uSat, p.sat ?? 1.08);
    if (C.u.uPeek) gl.uniform1f(C.u.uPeek, p.peek || 0);
    if (C.u.uSmoke) gl.uniform1f(C.u.uSmoke, p.smoke || 0);
    gl.uniform1f(C.u.uBlur, p.blur || 0);
    gl.uniform2f(C.u.uTexel2, 1 / W, 1 / H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (toLdr) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(P.fxaa.p);
      gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, this.ldr);
      gl.uniform2f(P.fxaa.u.uTexel, 1 / W, 1 / H);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.enable(gl.DEPTH_TEST);
  }
}

// 置ける盾の形: 鋼の板（のぞき窓つき）と、後ろの脚。-Z が敵の側
function shieldMesh() {
  const B = new MeshBuilder();
  const S = DSHIELD, t = 0.028, st = hex('#4b544d'), ed = hex('#2c312d'), bl = hex('#1d1f1e');
  B.bbox(-S.hw, 0.03, -t, S.hw, S.s0, t, 0.012, LAYER.metal, st);
  B.bbox(-S.hw, S.s1, -t, S.hw, S.h, t, 0.012, LAYER.metal, st);
  B.bbox(-S.hw, S.s0 - 0.01, -t, -S.shw, S.s1 + 0.01, t, 0.008, LAYER.metal, st);
  B.bbox(S.shw, S.s0 - 0.01, -t, S.hw, S.s1 + 0.01, t, 0.008, LAYER.metal, st);
  // のぞき窓の縁と、表の補強の帯
  B.box(-S.shw - 0.015, S.s0 - 0.015, -t - 0.006, S.shw + 0.015, S.s0, -t, LAYER.metal, ed);
  B.box(-S.shw - 0.015, S.s1, -t - 0.006, S.shw + 0.015, S.s1 + 0.015, -t, LAYER.metal, ed);
  for (const yb of [0.32, 0.86]) B.box(-S.hw + 0.02, yb, -t - 0.008, S.hw - 0.02, yb + 0.04, -t, LAYER.metal, ed);
  // 縁
  for (const sx of [-S.hw, S.hw - 0.025]) B.box(sx, 0.03, -t - 0.006, sx + 0.025, S.h, -t, LAYER.metal, ed);
  // 後ろの脚（斜めの支え）と取っ手
  for (const sx of [-0.36, 0.36]) {
    B.tube([sx, 0.85, t], [sx, 0.0, 0.46], 0.017, 0.017, 6, LAYER.metal, bl, { caps: true });
    B.bbox(sx - 0.04, 0, 0.41, sx + 0.04, 0.025, 0.51, 0.006, LAYER.rubber, bl);
  }
  B.tube([-0.12, S.h - 0.06, t + 0.005], [0.12, S.h - 0.06, t + 0.005], 0.012, 0.012, 6, LAYER.rubber, bl, { caps: true });
  return B;
}
// 有刺鉄線の形: 輪にした鉄線（蛇腹）を横に並べ、両端に杭
function wireMesh() {
  const B = new MeshBuilder();
  const col = hex('#9a9c98'), dk = hex('#5e5a52'), N = 9, R = 0.21, hw = 0.78;
  for (let n = 0; n < N; n++) {
    const x = -hw + (2 * hw) * n / (N - 1), tilt = (n % 2 ? 0.22 : -0.22);
    const seg = 10;
    let prev = null;
    for (let s = 0; s <= seg; s++) {
      const a = s / seg * Math.PI * 2;
      const p = [x + Math.sin(a) * R * tilt, 0.23 + Math.cos(a) * R, Math.sin(a) * 0.4];
      if (prev) B.tube(prev, p, 0.005, 0.005, 3, LAYER.metal, col);
      prev = p;
    }
  }
  // 輪をつなぐ線と、地面の杭
  for (const [y, z] of [[0.06, 0.32], [0.06, -0.32], [0.43, 0.0]]) B.tube([-hw, y, z], [hw, y, z], 0.004, 0.004, 3, LAYER.metal, col);
  for (const sx of [-hw - 0.04, hw + 0.04]) B.bbox(sx - 0.02, 0, -0.02, sx + 0.02, 0.48, 0.02, 0.004, LAYER.wood, dk);
  return B;
}
