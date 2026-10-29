// シェーダー。照らし方は全部同じ関数（光の格子＋太陽の影＋動く光＋もや）で、壁・人・銃・扉が同じ明るさになる。
export const MAX_DL = 8;

export const COMMON = `
const float PI = 3.14159265;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1,0)), u.x), mix(hash12(i + vec2(0,1)), hash12(i + vec2(1,1)), u.x), u.y); }
`;

// 照らし方
export const LIGHT = `
uniform highp sampler3D uLG;      // 光の格子: x=角i, y=角j, z=方向*NLy + 階*3 + 高さ段
uniform highp sampler2D uWM;      // 壁の印（光を壁の向こうへ混ぜない）
uniform highp sampler2D uAO;      // 床の近くの暗がり
uniform highp sampler2D uDLR;     // 動く光ごとに、届く部屋（光が壁を抜けない）
uniform vec4 uLGd;                // W1, D1, NLy, NL
uniform vec4 uMapD;               // W, D, CS, LH
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uShadowOn; uniform mat4 uShadowVP; uniform highp sampler2DShadow uShadow; uniform float uShadowTexel;
uniform vec3 uSkyCol; uniform float uAmbMin;
uniform vec4 uDLp[${MAX_DL}]; uniform vec4 uDLc[${MAX_DL}]; uniform vec4 uDLd[${MAX_DL}]; uniform int uDLn;
uniform vec3 uCam; uniform vec3 uFogCol; uniform float uFogD; uniform float uFogIn; uniform float uTime;
uniform float uRoofY;

// 光の格子の座標（壁のマスでは、その面の側の角に寄せる）
vec3 lgCoord(vec3 p, vec3 n, out float L){
  float CSz = uMapD.z, LHz = uMapD.w;
  L = clamp(floor((p.y + 0.05 + n.y * 0.08) / LHz), 0.0, uLGd.w - 1.0);
  float yl = p.y - L * LHz;
  float fh = yl <= 0.12 ? 0.0 : (yl >= 2.66 ? 2.0 : (yl < 1.4 ? (yl - 0.12) / 1.28 : 1.0 + (yl - 1.4) / 1.26));
  vec2 c = (p.xz + n.xz * 0.02) / CSz;
  vec2 ci = floor(c), f = c - ci;
  ivec2 ii = ivec2(clamp(ci, vec2(0.0), uMapD.xy - 1.0));
  int m = int(texelFetch(uWM, ivec2(ii.x, ii.y + int(L) * int(uMapD.y)), 0).r * 255.0 + 0.5);
  if ((m & 1) != 0) c.y = ci.y + (f.y < 0.5 ? 0.0 : 1.0);
  if ((m & 2) != 0) c.x = ci.x + (f.x < 0.5 ? 0.0 : 1.0);
  return vec3(c, L * 3.0 + fh);
}
vec4 lgFetch(vec3 c, float dir){
  float NLy = uLGd.z;
  return texture(uLG, vec3((c.x + 0.5) / uLGd.x, (c.y + 0.5) / uLGd.y, (dir * NLy + c.z + 0.5) / (6.0 * NLy)));
}
// 6方向の光（ambient cube）。a.x = 太陽が見える度合い、a.y = 空が見える度合い（屋外らしさ）
vec3 gridLight(vec3 p, vec3 n, out vec2 a){
  float L; vec3 c = lgCoord(p, n, L);
  vec3 n2 = n * n;
  vec4 px = n.x >= 0.0 ? lgFetch(c, 0.0) : lgFetch(c, 1.0);
  vec4 py = n.y >= 0.0 ? lgFetch(c, 2.0) : lgFetch(c, 3.0);
  vec4 pz = n.z >= 0.0 ? lgFetch(c, 4.0) : lgFetch(c, 5.0);
  vec4 up = lgFetch(c, 2.0), dn = lgFetch(c, 3.0);
  a = vec2(up.a, dn.a);
  return px.rgb * n2.x + py.rgb * n2.y + pz.rgb * n2.z;
}
float aoAt(vec3 p, vec3 n){
  float CSz = uMapD.z, LHz = uMapD.w;
  float L = clamp(floor((p.y + 0.05 + n.y * 0.08) / LHz), 0.0, uLGd.w - 1.0);
  float yl = p.y - L * LHz;
  vec2 q = (p.xz + n.xz * 0.06) / CSz * 4.0;
  float W4 = uMapD.x * 4.0, D4 = uMapD.y * 4.0;
  float v = texture(uAO, vec2(q.x / W4, (q.y + L * D4) / (D4 * uLGd.w))).r;
  float side = 1.0 - abs(n.y);
  // 壁の足元と天井ぎわ
  float k = mix(1.0, v, n.y > 0.5 ? 1.0 : (n.y < -0.5 ? 0.5 : 0.8));
  k *= mix(1.0, mix(0.72, 1.0, smoothstep(0.0, 0.45, yl)) * mix(0.86, 1.0, smoothstep(2.8, 2.45, yl)), side);
  return k;
}
float sunShadow(vec3 p, vec3 n){
  vec4 c = uShadowVP * vec4(p + n * 0.04, 1.0);
  vec3 q = c.xyz * 0.5 + 0.5;
  if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0 || q.z > 1.0) return -1.0;
  float b = 0.0015, s = 0.0, t = uShadowTexel;
  s += texture(uShadow, vec3(q.xy + vec2(-0.6, -0.6) * t, q.z - b));
  s += texture(uShadow, vec3(q.xy + vec2(0.6, -0.6) * t, q.z - b));
  s += texture(uShadow, vec3(q.xy + vec2(-0.6, 0.6) * t, q.z - b));
  s += texture(uShadow, vec3(q.xy + vec2(0.6, 0.6) * t, q.z - b));
  return s * 0.25;
}
vec3 dynLights(vec3 p, vec3 n, float room){
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${MAX_DL}; i++) {
    if (i >= uDLn) break;
    float vis = texelFetch(uDLR, ivec2(int(room + 0.5), i), 0).r;
    if (vis <= 0.0) continue;
    vec4 lp = uDLp[i]; vec4 lc = uDLc[i];
    vec3 Lv = lp.xyz - p; float d2 = dot(Lv, Lv); float d = sqrt(d2); vec3 L = Lv / max(d, 1e-4);
    float win = clamp(1.0 - pow(d / lp.w, 4.0), 0.0, 1.0); win *= win;
    float nl = max(dot(n, L), 0.0) * 0.85 + 0.15 * max(dot(n, L) * 0.5 + 0.5, 0.0) * step(0.5, lc.a);
    float k = win * nl / (d2 + 0.3);
    if (lc.a > 0.5) { // 懐中電灯（円すい）
      vec4 dd = uDLd[i];
      float ca = dot(-L, dd.xyz);
      float cone = smoothstep(dd.w, mix(dd.w, 1.0, 0.55), ca);
      float hot = 1.0 + 1.6 * smoothstep(mix(dd.w, 1.0, 0.75), 1.0, ca);
      k *= cone * hot;
    }
    acc += lc.rgb * k * vis;
  }
  return acc;
}
// 光とまとめ: 下地の色 alb にかける光（HDR）
vec3 shade(vec3 p, vec3 n, vec3 alb, float room, float ao, out float outdoor){
  vec2 a;
  vec3 g = gridLight(p, n, a);
  // 屋根の上（光の格子の外）
  if (p.y > uRoofY - 0.02) { g = uSkyCol * (0.55 + 0.35 * max(n.y, 0.0)); a = vec2(1.0, 1.0); }
  outdoor = a.y;
  float occ = aoAt(p, n) * ao;
  float nds = dot(n, uSunDir);
  float sv = a.x;
  if (uShadowOn > 0.5 && nds > 0.0) { float s = sunShadow(p, n); if (s >= 0.0) sv = min(s, clamp(a.x * 3.0, 0.0, 1.0)); }
  vec3 sun = uSunCol * max(nds, 0.0) * sv;
  vec3 dl = dynLights(p, n, room);
  return alb * ((g + uAmbMin) * occ + sun * mix(0.85, 1.0, occ) + dl);
}
vec3 fog(vec3 col, vec3 p, float outdoor){
  float d = length(p - uCam);
  float dens = uFogD * mix(uFogIn, 1.0, outdoor);
  float f = 1.0 - exp(-d * dens);
  return mix(col, uFogCol, f);
}
`;

// ---- 世界（静的なメッシュと、行列で動かす物）
export const WORLD_VS = `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec2 aUV; layout(location=3) in float aLayer;
layout(location=4) in vec3 aCol; layout(location=5) in float aAO; layout(location=6) in float aRoom; layout(location=7) in float aEmit;
uniform mat4 uVP; uniform mat4 uModel; uniform float uRoomOverride;
out vec3 vPos; out vec3 vNrm; out vec2 vUV; flat out float vLayer; out vec3 vCol; out float vAO; flat out float vRoom; flat out float vEmit;
void main(){
  vec4 wp = uModel * vec4(aPos, 1.0);
  vPos = wp.xyz; vNrm = normalize(mat3(uModel) * aNrm); vUV = aUV; vLayer = aLayer; vCol = aCol; vAO = aAO;
  vRoom = uRoomOverride >= 0.0 ? uRoomOverride : aRoom; vEmit = aEmit;
  gl_Position = uVP * wp;
}`;

export const WORLD_FS = `
uniform highp sampler2DArray uTex; uniform float uEmitK; uniform vec3 uTint; uniform float uGlass;
in vec3 vPos; in vec3 vNrm; in vec2 vUV; flat in float vLayer; in vec3 vCol; in float vAO; flat in float vRoom; flat in float vEmit;
layout(location=0) out vec4 oCol;
void main(){
  vec3 n = normalize(vNrm);
  if (!gl_FrontFacing) n = -n;
  vec3 alb = texture(uTex, vec3(vUV, vLayer)).rgb * vCol * uTint;
  float yl = vPos.y - floor((vPos.y + 0.05) / uMapD.w) * uMapD.w;
  // 巾木（塗装の内壁の足元）
  if (abs(vLayer - 3.0) < 0.5 && abs(n.y) < 0.5 && yl < 0.09 && yl > -0.01) alb = vec3(0.78, 0.76, 0.72) * (0.9 + 0.1 * smoothstep(0.08, 0.09, yl));
  float outdoor;
  vec3 col = shade(vPos, n, alb, vRoom, vAO, outdoor);
#ifdef GLASS
  if (vEmit > 1.5) {
    // 金網: ひし形の針金だけ残す
    vec2 g = vec2(vUV.x + vUV.y, vUV.x - vUV.y) * 12.0;
    vec2 f = abs(fract(g) - 0.5);
    float wire = 1.0 - smoothstep(0.035, 0.07, min(f.x, f.y));
    if (wire < 0.5) discard;
    oCol = vec4(fog(col, vPos, outdoor), 1.0);
    return;
  }
  vec3 v = normalize(uCam - vPos);
  float fr = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 refl = mix(uSkyCol * 0.6, uSkyCol * 1.4, fr);
  col = mix(col * 0.35, refl, 0.25 + 0.55 * fr);
  oCol = vec4(fog(col, vPos, outdoor), 0.22 + 0.5 * fr);
#else
  if (vEmit > 0.0) col += alb * vEmit * uEmitK * 2.2;
  oCol = vec4(fog(col, vPos, outdoor), 1.0);
#endif
}`;

// ---- 人（骨17本のスキン）
export const SKIN_VS = `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec2 aUV; layout(location=3) in float aLayer;
layout(location=4) in float aPal; layout(location=5) in float aJoint; layout(location=6) in float aAO;
uniform mat4 uVP; uniform mat4 uBones[17]; uniform vec3 uPal[12];
out vec3 vPos; out vec3 vNrm; out vec2 vUV; flat out float vLayer; out vec3 vCol; out float vAO;
void main(){
  mat4 B = uBones[int(aJoint + 0.5)];
  vec4 wp = B * vec4(aPos, 1.0);
  vPos = wp.xyz; vNrm = normalize(mat3(B) * aNrm); vUV = aUV; vLayer = aLayer; vAO = aAO;
  vCol = uPal[int(aPal + 0.5)];
  gl_Position = uVP * wp;
}`;
export const SKIN_FS = `
uniform highp sampler2DArray uTex; uniform float uRoom; uniform vec3 uFlash;
in vec3 vPos; in vec3 vNrm; in vec2 vUV; flat in float vLayer; in vec3 vCol; in float vAO;
layout(location=0) out vec4 oCol;
void main(){
  vec3 n = normalize(vNrm);
  vec3 alb = texture(uTex, vec3(vUV, vLayer)).rgb * vCol;
  float outdoor;
  vec3 col = shade(vPos, n, alb, uRoom, vAO, outdoor);
  // ふちの明るさ（ローポリでも形が分かるように、弱いリムライト）
  vec3 v = normalize(uCam - vPos);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col += alb * rim * 0.12 * (0.3 + outdoor) + uFlash * alb;
  oCol = vec4(fog(col, vPos, outdoor), 1.0);
}`;

// ---- 影（太陽）
export const SHADOW_VS = `
layout(location=0) in vec3 aPos;
uniform mat4 uVP; uniform mat4 uModel;
void main(){ gl_Position = uVP * uModel * vec4(aPos, 1.0); }`;
export const SHADOW_SKIN_VS = `
layout(location=0) in vec3 aPos; layout(location=5) in float aJoint;
uniform mat4 uVP; uniform mat4 uBones[17];
void main(){ gl_Position = uVP * uBones[int(aJoint + 0.5)] * vec4(aPos, 1.0); }`;
export const SHADOW_FS = `void main(){}`;

// ---- 空
export const FS_VS = `
out vec2 vUV;
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vUV = p; gl_Position = vec4(p * 2.0 - 1.0, 1.0, 1.0); }`;
export const SKY_FS = `
uniform mat4 uInvVP; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunD; uniform vec3 uSunC; uniform float uNight;
in vec2 vUV; layout(location=0) out vec4 oCol;
void main(){
  vec4 a = uInvVP * vec4(vUV * 2.0 - 1.0, 1.0, 1.0);
  vec3 d = normalize(a.xyz / a.w - uCam);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uZenith, pow(h, 0.55)) : mix(uHorizon, uGround, smoothstep(0.0, -0.25, h));
  float sd = max(dot(d, uSunD), 0.0);
  col += uSunC * (pow(sd, 900.0) * 30.0 + pow(sd, 18.0) * 0.25 + pow(sd, 3.0) * 0.06) * (1.0 - uNight * 0.6);
  if (h > 0.0) {
    // 雲（平面に投げた値ノイズ）
    vec2 cp = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.004, 0.0);
    float c = vnoise(cp) * 0.55 + vnoise(cp * 2.3) * 0.3 + vnoise(cp * 5.1) * 0.15;
    float cl = smoothstep(0.52, 0.8, c) * smoothstep(0.0, 0.18, h);
    vec3 ccol = mix(uHorizon * 1.15, vec3(1.0), 0.6) * (1.0 - uNight * 0.92);
    col = mix(col, ccol, cl * 0.75);
    if (uNight > 0.5) { float s = hash12(floor(d.xz / (h + 0.3) * 260.0)); col += vec3(step(0.9975, s) * 0.8 * smoothstep(0.05, 0.3, h)); }
  }
  // もやと同じ色へ寄せる（地平線）
  col = mix(col, uFogCol, smoothstep(0.25, 0.0, abs(h)) * 0.6);
  oCol = vec4(col, 1.0);
}`;

// ---- 粒子・弾痕・曳光（ビルボード）
export const FX_VS = `
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol; layout(location=2) in vec4 aUV;
uniform mat4 uVP;
out vec4 vCol; out vec4 vUV; out vec3 vPos;
void main(){ vCol = aCol; vUV = aUV; vPos = aPos; gl_Position = uVP * vec4(aPos, 1.0); }`;
export const FX_FS = `
in vec4 vCol; in vec4 vUV; in vec3 vPos;
layout(location=0) out vec4 oCol;
void main(){
  // vUV.xy: -1..1、vUV.z: 形（0 丸いやわらか、1 四角、2 輪、3 弾痕、4 火花の線）、vUV.w: 光を受けるか
  vec2 q = vUV.xy;
  float a;
  int k = int(vUV.z + 0.5);
  if (k == 0) a = smoothstep(1.0, 0.25, length(q));
  else if (k == 1) a = 1.0;
  else if (k == 2) { float r = length(q); a = smoothstep(1.0, 0.85, r) * smoothstep(0.55, 0.8, r); }
  else if (k == 3) { float r = length(q); float c = smoothstep(0.45, 0.3, r); float ring = smoothstep(1.0, 0.55, r) * 0.55; a = max(c, ring); }
  else { a = smoothstep(1.0, 0.0, abs(q.y)) * smoothstep(1.0, 0.7, abs(q.x)); }
  vec3 col = vCol.rgb;
  if (vUV.w > 0.5) {
    vec2 aa; vec3 g = gridLight(vPos, vec3(0.0, 1.0, 0.0), aa) * 0.6 + gridLight(vPos, normalize(uCam - vPos), aa) * 0.4;
    col *= g + uAmbMin + dynLights(vPos, vec3(0.0, 1.0, 0.0), 0.0) * 0.0;
    if (k == 3) { float r = length(q); col *= mix(0.25, 1.0, smoothstep(0.3, 0.6, r)); }
  }
  oCol = vec4(col * vCol.a * a, vCol.a * a);
}`;

// ---- 後処理: 明るい所を取り出して縮める、広げる、仕上げ
export const DOWN_FS = `
uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uThresh;
in vec2 vUV; layout(location=0) out vec4 oCol;
void main(){
  vec3 c = vec3(0.0);
  c += texture(uSrc, vUV + uTexel * vec2(-1.0, -1.0)).rgb; c += texture(uSrc, vUV + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture(uSrc, vUV + uTexel * vec2(-1.0, 1.0)).rgb; c += texture(uSrc, vUV + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  if (uThresh > 0.0) { float l = max(c.r, max(c.g, c.b)); c *= smoothstep(uThresh, uThresh * 2.2, l); }
  oCol = vec4(min(c, vec3(60.0)), 1.0);
}`;
export const UP_FS = `
uniform sampler2D uSrc; uniform vec2 uTexel;
in vec2 vUV; layout(location=0) out vec4 oCol;
void main(){
  vec3 c = texture(uSrc, vUV + uTexel * vec2(-1.0, 0.0)).rgb + texture(uSrc, vUV + uTexel * vec2(1.0, 0.0)).rgb
         + texture(uSrc, vUV + uTexel * vec2(0.0, -1.0)).rgb + texture(uSrc, vUV + uTexel * vec2(0.0, 1.0)).rgb;
  oCol = vec4(c * 0.25, 1.0);
}`;
export const COMP_FS = `
uniform sampler2D uSrc; uniform sampler2D uBloom; uniform float uBloomK; uniform float uExposure; uniform float uVig;
uniform float uNVG; uniform float uFlashW; uniform float uDamage; uniform float uSupp; uniform float uGas; uniform float uTime2; uniform float uSat; uniform float uBlur; uniform vec2 uTexel2;
in vec2 vUV; layout(location=0) out vec4 oCol;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec3 c = texture(uSrc, vUV).rgb;
  if (uBlur > 0.0) {
    vec3 b = vec3(0.0); float t = uBlur * 3.0;
    b += texture(uSrc, vUV + uTexel2 * vec2(t, 0.0)).rgb; b += texture(uSrc, vUV - uTexel2 * vec2(t, 0.0)).rgb;
    b += texture(uSrc, vUV + uTexel2 * vec2(0.0, t)).rgb; b += texture(uSrc, vUV - uTexel2 * vec2(0.0, t)).rgb;
    c = mix(c, b * 0.25, clamp(uBlur, 0.0, 1.0));
  }
  if (uBloomK > 0.0) c += texture(uBloom, vUV).rgb * uBloomK;
  c *= uExposure;
  vec2 q = vUV - 0.5;
  float r2 = dot(q * vec2(1.6, 1.0), q * vec2(1.6, 1.0));
  if (uNVG > 0.5) {
    float l = dot(c, vec3(0.30, 0.59, 0.11));
    l = l * 6.0 + 0.015;
    float n = hash12(floor(vUV * vec2(640.0, 360.0)) + floor(uTime2 * 30.0)) - 0.5;
    l = max(0.0, l + n * 0.09);
    c = vec3(0.25, 1.0, 0.35) * l;
    c *= smoothstep(0.62, 0.42, r2);
  }
  vec3 m = aces(c);
  // 色味: 少し締めて、BattleBit のような澄んだ色
  float lum = dot(m, vec3(0.2126, 0.7152, 0.0722));
  m = mix(vec3(lum), m, uSat);
  m = pow(m, vec3(1.0 / 2.2));
  m *= 1.0 - uVig * smoothstep(0.15, 0.75, r2);
  // 制圧（弾がかすめた）: ふちが暗くなり色が抜ける
  if (uSupp > 0.0) { float e = smoothstep(0.05, 0.6, r2) * uSupp; m = mix(m, vec3(dot(m, vec3(0.33))) * 0.55, e * 0.8); }
  if (uDamage > 0.0) { float e = smoothstep(0.1, 0.7, r2) * uDamage; m = mix(m, vec3(0.45, 0.02, 0.01), e * 0.7); }
  if (uGas > 0.0) { m = mix(m, m * vec3(1.05, 0.95, 0.75) + vec3(0.06, 0.05, 0.0), uGas * 0.6); }
  m = mix(m, vec3(1.0), clamp(uFlashW, 0.0, 1.0));
  // ディザ
  m += (hash12(vUV * 1000.0 + uTime2) - 0.5) / 255.0;
  oCol = vec4(m, 1.0);
}`;
export const FXAA_FS = `
uniform sampler2D uSrc; uniform vec2 uTexel;
in vec2 vUV; layout(location=0) out vec4 oCol;
float lu(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
void main(){
  vec3 rgbNW = texture(uSrc, vUV + vec2(-1.0, -1.0) * uTexel).rgb, rgbNE = texture(uSrc, vUV + vec2(1.0, -1.0) * uTexel).rgb;
  vec3 rgbSW = texture(uSrc, vUV + vec2(-1.0, 1.0) * uTexel).rgb, rgbSE = texture(uSrc, vUV + vec2(1.0, 1.0) * uTexel).rgb;
  vec3 rgbM = texture(uSrc, vUV).rgb;
  float lNW = lu(rgbNW), lNE = lu(rgbNE), lSW = lu(rgbSW), lSE = lu(rgbSE), lM = lu(rgbM);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * uTexel;
  vec3 a = 0.5 * (texture(uSrc, vUV + dir * (1.0 / 3.0 - 0.5)).rgb + texture(uSrc, vUV + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture(uSrc, vUV + dir * -0.5).rgb + texture(uSrc, vUV + dir * 0.5).rgb);
  float lB = lu(b);
  oCol = vec4((lB < lMin || lB > lMax) ? a : b, 1.0);
}`;
export const COPY_FS = `uniform sampler2D uSrc; in vec2 vUV; layout(location=0) out vec4 oCol; void main(){ oCol = vec4(texture(uSrc, vUV).rgb, 1.0); }`;
