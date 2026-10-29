// WebGL2 の小さな道具
export function createGL(canvas, opts = {}) {
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: true, stencil: false, premultipliedAlpha: false,
    preserveDrawingBuffer: !!opts.preserve, powerPreference: 'high-performance', desynchronized: false,
  });
  if (!gl) return null;
  const ext = {
    cbf: gl.getExtension('EXT_color_buffer_float'),
    cbhf: gl.getExtension('EXT_color_buffer_half_float'),
    aniso: gl.getExtension('EXT_texture_filter_anisotropic'),
    flin: gl.getExtension('OES_texture_float_linear'),
  };
  gl.ext = ext;
  gl.hdr = !!(ext.cbf || ext.cbhf);
  gl.maxSamples = gl.getParameter(gl.MAX_SAMPLES) || 0;
  return gl;
}

const PREC = 'precision highp float;\nprecision highp int;\nprecision highp sampler2DArray;\nprecision highp sampler2DShadow;\n';

export function compile(gl, type, src, name) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(sh);
    const lines = src.split('\n').map((l, i) => (i + 1) + ': ' + l);
    const m = /ERROR: \d+:(\d+)/.exec(log || '');
    const near = m ? lines.slice(Math.max(0, +m[1] - 4), +m[1] + 2).join('\n') : '';
    throw new Error(`シェーダーのエラー(${name}): ${log}\n${near}`);
  }
  return sh;
}

export function program(gl, vs, fs, name = 'prog', defines = '') {
  const head = '#version 300 es\n' + defines + PREC;
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, head + vs, name + '.vs'));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, head + fs, name + '.fs'));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.bindAttribLocation(p, 1, 'aNrm');
  gl.bindAttribLocation(p, 2, 'aUV');
  gl.bindAttribLocation(p, 3, 'aMat');
  gl.bindAttribLocation(p, 4, 'aCol');
  gl.bindAttribLocation(p, 5, 'aJoint');
  gl.bindAttribLocation(p, 6, 'aWeight');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`リンクのエラー(${name}): ${gl.getProgramInfoLog(p)}`);
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const nm = info.name.replace(/\[0\]$/, '');
    u[nm] = gl.getUniformLocation(p, info.name);
  }
  return { p, u, name };
}

// 頂点の並び: pos3 nrm3 uv2 mat1 col4(ao,tint..) = 13 floats
export const STRIDE = 13;

export function makeVAO(gl, data, index, layout = 'std') {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  if (layout === 'std') {
    const st = STRIDE * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, st, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 32);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, st, 36);
  }
  let ib = null, count = data.length / STRIDE, type = 0;
  if (index) {
    ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
    count = index.length;
    type = index instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  }
  gl.bindVertexArray(null);
  return { vao, vb, ib, count, type };
}

export function drawVAO(gl, m, first = 0, count = -1) {
  gl.bindVertexArray(m.vao);
  if (m.ib) gl.drawElements(gl.TRIANGLES, count < 0 ? m.count : count, m.type, first * (m.type === gl.UNSIGNED_INT ? 4 : 2));
  else gl.drawArrays(gl.TRIANGLES, first, count < 0 ? m.count : count);
}

export function deleteVAO(gl, m) {
  if (!m) return;
  gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vb); if (m.ib) gl.deleteBuffer(m.ib);
}

export function tex2D(gl, w, h, { internal = gl.RGBA8, format = gl.RGBA, type = gl.UNSIGNED_BYTE, data = null, filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE, mip = false } = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  if (mip) gl.generateMipmap(gl.TEXTURE_2D);
  t.w = w; t.h = h;
  return t;
}

export function fbo(gl, color, depth) {
  const f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  if (color) {
    const list = Array.isArray(color) ? color : [color];
    list.forEach((c, i) => {
      if (c instanceof WebGLRenderbuffer) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.RENDERBUFFER, c);
      else gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, c, 0);
    });
    if (list.length > 1) gl.drawBuffers(list.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  } else {
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  }
  if (depth) {
    if (depth instanceof WebGLRenderbuffer) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    else gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
  }
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  f.ok = st === gl.FRAMEBUFFER_COMPLETE;
  return f;
}

export function depthTex(gl, w, h, compare = false) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, compare ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, compare ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (compare) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  }
  t.w = w; t.h = h;
  return t;
}

// 全画面の三角形（頂点シェーダーで作る）
export const FS_VS = `
out vec2 vUV;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
export function drawFS(gl) { gl.bindVertexArray(null); gl.drawArrays(gl.TRIANGLES, 0, 3); }
