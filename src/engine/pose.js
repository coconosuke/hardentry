// 人の骨の位置（手続きアニメ）。当たり判定（エンジン）と描画（レンダラー）で同じものを使う。
// 体の向き: ローカルで +Z が前、+Y が上、+X が左。世界へは yaw で回す（前 = (sin yaw, 0, cos yaw)）。
// 関節の位置を直接決め（足と腕は2本の骨のIK）、骨の向きは「始点→終点」と前向きのヒントから作る。
export const BONES = ['pelvis', 'spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
export const NBONE = BONES.length;
export const BI = Object.fromEntries(BONES.map((b, i) => [b, i]));

// 当たりのカプセル: [骨, 始点の比率(骨の長さに対して), 終点の比率, 半径, 部位]
export const HITCAPS = [
  ['head', 0.05, 0.75, 0.105, 'head'],
  ['neck', 0.0, 1.0, 0.06, 'neck'],
  ['chest', 0.05, 0.95, 0.15, 'chest'],
  ['spine', 0.0, 1.0, 0.14, 'belly'],
  ['pelvis', -0.6, 0.2, 0.15, 'pelvis'],
  ['uarmL', 0.05, 0.95, 0.055, 'arm'], ['farmL', 0.0, 0.95, 0.045, 'arm'],
  ['uarmR', 0.05, 0.95, 0.055, 'arm'], ['farmR', 0.0, 0.95, 0.045, 'arm'],
  ['thighL', 0.0, 1.0, 0.075, 'leg'], ['shinL', 0.0, 1.0, 0.055, 'leg'],
  ['thighR', 0.0, 1.0, 0.075, 'leg'], ['shinR', 0.0, 1.0, 0.055, 'leg'],
];

// ---- 小さなベクトルの道具（配列 [x,y,z]）----
const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
// 軸まわりの回転（ロドリゲス）
function rotAxis(v, ax, ang) {
  const c = Math.cos(ang), s = Math.sin(ang), d = dot(ax, v), cr = cross(ax, v);
  return [v[0] * c + cr[0] * s + ax[0] * d * (1 - c), v[1] * c + cr[1] * s + ax[1] * d * (1 - c), v[2] * c + cr[2] * s + ax[2] * d * (1 - c)];
}
// 2本の骨のIK: 根元 a から目標 t へ、長さ l1, l2。曲がる向きのヒント pole。戻り値: 中間の関節
function ik2(a, t, l1, l2, pole) {
  let d = sub(t, a); let L = len(d);
  const maxL = (l1 + l2) * 0.999;
  if (L > maxL) { d = mul(d, maxL / L); L = maxL; }
  if (L < 1e-4) L = 1e-4;
  const dn = mul(d, 1 / L);
  // 余弦定理
  const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  let p = sub(pole, mul(dn, dot(pole, dn)));
  if (len(p) < 1e-5) p = Math.abs(dn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  p = norm(p);
  return add(a, add(mul(dn, x), mul(p, h)));
}

// 骨の枠: 位置(3) + 列 X(3) Y(3) Z(3) = 12
function frame(out, i, start, end, hint) {
  let y = sub(end, start); const L = len(y) || 1e-4; y = mul(y, 1 / L);
  let z = sub(hint, mul(y, dot(hint, y)));
  if (len(z) < 1e-5) z = Math.abs(y[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
  z = norm(z);
  const x = cross(y, z);
  const o = i * 12;
  out[o] = start[0]; out[o + 1] = start[1]; out[o + 2] = start[2];
  out[o + 3] = x[0]; out[o + 4] = x[1]; out[o + 5] = x[2];
  out[o + 6] = y[0]; out[o + 7] = y[1]; out[o + 8] = y[2];
  out[o + 9] = z[0]; out[o + 10] = z[1]; out[o + 11] = z[2];
  return L;
}

// 体の寸法（身長1.8m のとき）。s で拡大縮小
export const DIM = { hip: 0.92, ps: 0.23, sn: 0.33, nh: 0.17, shW: 0.18, shD: -0.035, hipW: 0.09, thigh: 0.44, shin: 0.42, ankle: 0.075, foot: 0.17, uarm: 0.29, farm: 0.26, hand: 0.17, neck: 0.08 };

// 武器の持ち方: 右手（握り）と左手（前の握り）の位置。銃の枠で（前+Z、上+Y、左+X）
export const HOLD = {
  rifle: { r: [0, -0.04, 0], l: [0.0, -0.035, 0.27], stock: -0.2 },
  smg: { r: [0, -0.04, 0], l: [0.0, -0.035, 0.2], stock: -0.17 },
  shotgun: { r: [0, -0.04, 0], l: [0.0, -0.05, 0.3], stock: -0.22 },
  pistol: { r: [0, -0.03, 0], l: [-0.02, -0.04, 0.0], stock: 0 },
  less: { r: [0, -0.04, 0], l: [0.0, -0.035, 0.24], stock: -0.2 },
  none: null,
};

/**
 * 姿勢を計算する。
 * p: { x,y,z, yaw, pitch, h(身長), stance(0立ち..1しゃがみ..2伏せ、連続), lean(-1..1), moveX, moveZ（ローカルの速さ m/s）, phase（歩きの位相）,
 *      hold: 'rifle'|'pistol'|...|'none', ads(0..1), low(0..1 ローレディ), reload(0..1 or -1), fire(0..1 撃った直後の跳ね),
 *      state: 'normal'|'hands'|'kneel'|'cuffed'|'down'|'dead'|'stun'|'cower'|'shield'|'carry', stateT（その状態の経過）, fallYaw, seed, throwT }
 * out: Float32Array(NBONE*12)。戻り値: { eye:[x,y,z], gun: {p, x,y,z}, muzzle }
 */
export function computePose(p, out) {
  const s = (p.h || 1.8) / 1.8;
  const D = DIM;
  const st = clamp(p.stance || 0, 0, 2);
  const crouch = clamp(st, 0, 1), prone = clamp(st - 1, 0, 1);
  const state = p.state || 'normal';
  const T = p.stateT || 0;
  const pitch = clamp(p.pitch || 0, -1.4, 1.4);
  const lean = clamp(p.lean || 0, -1, 1);
  const hold = state === 'normal' || state === 'shield' ? (p.hold || 'none') : 'none';
  const H = HOLD[hold] || null;
  // ---- 下半身
  const spd = Math.hypot(p.moveX || 0, p.moveZ || 0);
  const ph = p.phase || 0;
  const walkAmt = clamp(spd / 1.2, 0, 1) * (1 - prone);
  const runAmt = clamp((spd - 2.6) / 1.8, 0, 1);
  const bob = -Math.abs(Math.cos(ph)) * 0.025 * walkAmt * s - runAmt * 0.04 * s;
  let pelvisY = D.hip * s * (1 - crouch) + 0.6 * s * crouch + bob;
  let torsoBend = 0.05 + crouch * 0.28 + runAmt * 0.25; // 前かがみ（ラジアン）
  if (hold !== 'none') torsoBend += 0.04;
  const kneel = state === 'kneel' || state === 'cuffed';
  const down = state === 'down' || state === 'dead';
  if (kneel) { const k = sm(T / 0.8); pelvisY = lerpN(pelvisY, 0.62 * s, k); torsoBend = lerpN(torsoBend, -0.05, k); }
  if (state === 'cower' || state === 'stun') { const k = sm(T / 0.5); pelvisY = lerpN(pelvisY, 0.55 * s, k); torsoBend = lerpN(torsoBend, 0.75, k); }
  // ローカルでの関節
  const fwd = v3(0, 0, 1), up = v3(0, 1, 0), left = v3(1, 0, 0);
  let P = v3(0, pelvisY, 0);
  // 伏せ: 体を前に倒す（腰を支点に）
  let tUp = rotAxis(up, left, torsoBend);
  // 体の傾き（リーン）: 前の軸まわり
  const leanAng = lean * 0.36;
  tUp = rotAxis(tUp, fwd, -leanAng);
  P = madd(P, left, -lean * 0.07 * s);
  // 伏せの混ぜ: 胴が水平に近づく
  if (prone > 0) {
    const proneUp = norm(v3(0, 0.05, 1));
    tUp = norm(lerp3(tUp, proneUp, sm(prone)));
    P = lerp3(P, v3(0, 0.16 * s, -0.55 * s), sm(prone));
  }
  // 胸は狙いの上下に少しついていく
  const aimP = pitch * (hold !== 'none' ? 1 : 0.4);
  const spineUp = rotAxis(tUp, left, -aimP * 0.25 * (1 - prone));
  const S = madd(P, spineUp, D.ps * s);
  const chestUp = rotAxis(spineUp, left, -aimP * 0.3 * (1 - prone));
  let N = madd(S, chestUp, D.sn * s);
  // 頭: 狙いの向きを見る
  let headFwd = norm(v3(0, Math.sin(pitch), Math.cos(pitch)));
  if (prone > 0) headFwd = norm(lerp3(headFwd, norm(v3(0, Math.sin(pitch) + 0.2, 1)), prone));
  let headUp = norm(sub(up, mul(headFwd, dot(up, headFwd))));
  headUp = rotAxis(headUp, headFwd, -leanAng * 0.6);
  if (state === 'cuffed' || state === 'kneel') headFwd = norm(v3(0, -0.15, 1));
  if (state === 'cower' || state === 'stun') { headFwd = norm(v3(0, -0.6, 0.8)); headUp = norm(v3(0, 0.8, 0.6)); }
  const neckTop = madd(N, norm(lerp3(chestUp, headUp, 0.5)), D.neck * s);
  const Hc = madd(neckTop, headUp, (D.nh - D.neck) * s);
  const eye = madd(madd(Hc, headFwd, 0.085 * s), headUp, 0.025 * s);
  // 肩・腰
  const chestLeft = norm(cross(chestUp, cross(left, chestUp)));
  const chestFwd = norm(cross(chestLeft, chestUp));
  const shL = madd(madd(N, chestLeft, D.shW * s), chestUp, D.shD * s);
  const shR = madd(madd(N, chestLeft, -D.shW * s), chestUp, D.shD * s);
  const pelLeft = norm(cross(tUp, cross(left, tUp)));
  const hipL = madd(madd(P, pelLeft, D.hipW * s), tUp, -0.03 * s);
  const hipR = madd(madd(P, pelLeft, -D.hipW * s), tUp, -0.03 * s);
  // ---- 足（IK）
  const legL = D.thigh * s, legS = D.shin * s;
  let ankL, ankR, kneeHintL = v3(0.1, 0, 1), kneeHintR = v3(-0.1, 0, 1);
  const mvx = p.moveX || 0, mvz = p.moveZ || 0;
  const mdir = spd > 0.05 ? norm(v3(mvx, 0, mvz)) : v3(0, 0, 1);
  const stride = clamp(0.32 + spd * 0.2, 0.32, 0.85) * s * walkAmt;
  const footY = D.ankle * s;
  const gait = (o) => {
    const c = Math.cos(ph + o), sn = Math.sin(ph + o);
    const lift = Math.max(0, sn) * (0.09 + runAmt * 0.12) * s * walkAmt;
    return add(mul(mdir, c * stride * 0.5), v3(0, lift, 0));
  };
  if (prone > 0.01) {
    ankL = madd(madd(P, tUp, -0.95 * s), pelLeft, 0.16 * s); ankL[1] = 0.1 * s;
    ankR = madd(madd(P, tUp, -0.95 * s), pelLeft, -0.16 * s); ankR[1] = 0.1 * s;
    const crawl = Math.sin(ph) * 0.12 * s * clamp(spd / 0.4, 0, 1);
    ankL = madd(ankL, tUp, crawl); ankR = madd(ankR, tUp, -crawl);
    kneeHintL = v3(0, -1, 0); kneeHintR = v3(0, -1, 0);
    const standL = add(v3(D.hipW * s, footY, 0.03 * s), gait(0)), standR = add(v3(-D.hipW * s, footY, -0.03 * s), gait(Math.PI));
    const k = sm(prone);
    ankL = lerp3(standL, ankL, k); ankR = lerp3(standR, ankR, k);
  } else if (kneel) {
    const k = sm(T / 0.8);
    const stL = v3(D.hipW * s, footY, 0.02), stR = v3(-D.hipW * s, footY, -0.02);
    // ひざをついて、すねが床に
    const kL = v3(D.hipW * s, footY, -0.48 * s), kR = v3(-D.hipW * s, footY, -0.48 * s);
    ankL = lerp3(stL, kL, k); ankR = lerp3(stR, kR, k);
    kneeHintL = v3(0, -0.4, 1); kneeHintR = v3(0, -0.4, 1);
  } else if (crouch > 0.01) {
    // しゃがみ: 左足を前、右ひざを下げる
    const cL = add(v3(D.hipW * s * 1.1, footY, 0.34 * s), mul(gait(0), 0.6));
    const cR = add(v3(-D.hipW * s * 1.2, footY, -0.36 * s), mul(gait(Math.PI), 0.6));
    const stL = add(v3(D.hipW * s, footY, 0.03 * s), gait(0)), stR = add(v3(-D.hipW * s, footY, -0.03 * s), gait(Math.PI));
    const k = sm(crouch);
    ankL = lerp3(stL, cL, k); ankR = lerp3(stR, cR, k);
    if (spd < 0.1) ankR[1] = lerpN(ankR[1], footY + 0.12 * s, k);
  } else {
    ankL = add(v3(D.hipW * s, footY, 0.03 * s), gait(0));
    ankR = add(v3(-D.hipW * s, footY, -0.03 * s), gait(Math.PI));
    if (spd < 0.1 && hold !== 'none') { ankL[2] += 0.1 * s; ankR[2] -= 0.08 * s; ankR[0] -= 0.03 * s; }
  }
  if (state === 'cower' || state === 'stun') { const k = sm(T / 0.5); ankL = lerp3(ankL, v3(D.hipW * s * 1.4, footY, 0.12 * s), k); ankR = lerp3(ankR, v3(-D.hipW * s * 1.4, footY, 0.0), k); }
  const kneeL = ik2(hipL, ankL, legL, legS, kneeHintL);
  const kneeR = ik2(hipR, ankR, legL, legS, kneeHintR);
  // つま先
  let toeDirL = prone > 0.5 ? norm(v3(0, -1, -0.2)) : kneel ? norm(v3(0, 0.1, -1)) : v3(0, 0, 1);
  let toeDirR = prone > 0.5 ? norm(v3(0, -1, -0.2)) : kneel ? norm(v3(0, 0.1, -1)) : v3(-0.05, 0, 1);
  const toeL = madd(ankL, toeDirL, D.foot * s), toeR = madd(ankR, toeDirR, D.foot * s);
  // ---- 腕
  const ua = D.uarm * s, fa = D.farm * s;
  let wristL, wristR, handDirL = v3(0, -1, 0), handDirR = v3(0, -1, 0), elbowHintL = v3(0.6, -1, -0.2), elbowHintR = v3(-0.6, -1, -0.2);
  let gun = null;
  // 狙いの向き（ローカル）
  const aimDir = norm(v3(0, Math.sin(pitch), Math.cos(pitch)));
  if (H) {
    // 銃の位置: 右肩の前。ADSで目の高さへ。ローレディで下げる
    const ads = clamp(p.ads || 0, 0, 1), low = clamp(p.low || 0, 0, 1);
    const isPistol = hold === 'pistol';
    let gp = madd(madd(madd(shR, chestFwd, (isPistol ? 0.36 : 0.12) * s), chestUp, -0.03 * s), chestLeft, (isPistol ? 0.16 : 0.03) * s);
    // ADS: 銃の線を目の前へ
    const adsP = madd(madd(eye, aimDir, (isPistol ? 0.42 : 0.2) * s), headUp, -0.055 * s);
    gp = lerp3(gp, madd(adsP, chestLeft, isPistol ? 0 : -0.0), ads);
    let gf = aimDir;
    // ローレディ: 銃口を下げる
    if (low > 0) { gf = norm(lerp3(gf, norm(v3(0.15, -0.75, 0.6)), low)); gp = madd(gp, chestUp, -0.12 * s * low); }
    // 走り（ダッシュ）: 銃を斜めに
    if (runAmt > 0) { gf = norm(lerp3(gf, norm(v3(0.5, -0.35, 0.7)), runAmt * 0.8)); gp = madd(gp, chestUp, -0.1 * s * runAmt); }
    // リロード: 銃を傾けて下げる
    const rl = p.reload == null ? -1 : p.reload;
    let gUp = norm(sub(up, mul(gf, dot(up, gf))));
    if (rl >= 0) { const k = Math.sin(Math.PI * clamp(rl, 0, 1)); gp = madd(madd(gp, chestUp, -0.06 * s * k), chestFwd, -0.03 * k); gUp = rotAxis(gUp, gf, 0.5 * k); }
    // 撃った直後の跳ね
    const fk = clamp(p.fire || 0, 0, 1);
    gp = madd(gp, gf, -0.025 * fk * s);
    gf = norm(madd(gf, gUp, 0.08 * fk));
    if (state === 'shield') { gp = madd(madd(shR, chestFwd, 0.42 * s), chestLeft, -0.12 * s); }
    const gl = norm(cross(gUp, gf)); // 銃の左
    gun = { p: gp, f: gf, u: gUp, l: gl };
    const toW = (o) => add(add(add(gp, mul(gl, o[0] * s)), mul(gUp, o[1] * s)), mul(gf, o[2] * s));
    wristR = toW(H.r); handDirR = norm(add(gf, mul(gUp, -0.6)));
    if (rl >= 0 && rl < 0.75 && hold !== 'pistol') {
      // 左手は弾倉へ（下に下りて戻る）
      const k = Math.sin(Math.PI * clamp(rl / 0.75, 0, 1));
      wristL = lerp3(toW([0.02, -0.12, 0.1]), madd(madd(N, chestUp, -0.42 * s), chestLeft, 0.12 * s), k);
      handDirL = v3(0, -1, 0.3);
    } else if (state === 'shield') {
      wristL = madd(madd(shL, chestFwd, 0.4 * s), chestUp, -0.12 * s); handDirL = norm(v3(-0.3, 0.9, 0.2));
    } else { wristL = toW(H.l); handDirL = norm(add(gf, mul(gl, -0.4))); }
    elbowHintL = norm(v3(0.8, -1, -0.2)); elbowHintR = norm(v3(-1.0, -0.8, -0.4));
  } else {
    // 素手の状態
    if (state === 'hands') {
      const k = sm(T / 0.45);
      const hiL = madd(madd(Hc, chestLeft, 0.24 * s), chestUp, 0.22 * s), hiR = madd(madd(Hc, chestLeft, -0.24 * s), chestUp, 0.22 * s);
      const relL = madd(madd(shL, chestUp, -0.5 * s), chestFwd, 0.05), relR = madd(madd(shR, chestUp, -0.5 * s), chestFwd, 0.05);
      wristL = lerp3(relL, hiL, k); wristR = lerp3(relR, hiR, k);
      handDirL = handDirR = v3(0, 1, 0); elbowHintL = v3(1, -0.2, -0.3); elbowHintR = v3(-1, -0.2, -0.3);
    } else if (state === 'kneel') {
      // 手を頭の後ろに
      wristL = madd(madd(Hc, chestLeft, 0.09 * s), chestFwd, -0.1 * s); wristR = madd(madd(Hc, chestLeft, -0.09 * s), chestFwd, -0.1 * s);
      wristL[1] += 0.06 * s; wristR[1] += 0.06 * s;
      handDirL = v3(-1, 0.2, 0); handDirR = v3(1, 0.2, 0); elbowHintL = v3(1, 0.3, 0.6); elbowHintR = v3(-1, 0.3, 0.6);
    } else if (state === 'cuffed') {
      wristL = madd(madd(P, chestFwd, -0.18 * s), chestLeft, 0.04 * s); wristR = madd(madd(P, chestFwd, -0.18 * s), chestLeft, -0.04 * s);
      wristL[1] += 0.12 * s; wristR[1] += 0.12 * s;
      handDirL = v3(-1, -0.4, 0); handDirR = v3(1, -0.4, 0); elbowHintL = v3(0.4, 0, -1); elbowHintR = v3(-0.4, 0, -1);
    } else if (state === 'cower' || state === 'stun') {
      wristL = madd(madd(Hc, chestFwd, 0.12 * s), chestLeft, 0.06 * s); wristR = madd(madd(Hc, chestFwd, 0.12 * s), chestLeft, -0.06 * s);
      handDirL = handDirR = v3(0, 1, 0.2); elbowHintL = v3(0.6, -1, 0.4); elbowHintR = v3(-0.6, -1, 0.4);
    } else {
      // 歩くときの腕振り
      const sw = Math.sin(ph) * 0.22 * walkAmt * s;
      wristL = madd(madd(madd(shL, chestUp, -0.53 * s), chestFwd, -sw + 0.04 * s), chestLeft, 0.04 * s);
      wristR = madd(madd(madd(shR, chestUp, -0.53 * s), chestFwd, sw + 0.04 * s), chestLeft, -0.04 * s);
      if (p.throwT > 0) { const k = Math.sin(Math.PI * clamp(p.throwT, 0, 1)); wristR = lerp3(wristR, madd(madd(Hc, chestFwd, -0.1), chestLeft, -0.25 * s), k); }
    }
  }
  const elbowL = ik2(shL, wristL, ua, fa, elbowHintL), elbowR = ik2(shR, wristR, ua, fa, elbowHintR);
  const handTipL = madd(wristL, norm(handDirL), D.hand * s), handTipR = madd(wristR, norm(handDirR), D.hand * s);
  // ---- 骨の枠（ローカル）
  const L = out;
  frame(L, 0, P, S, chestFwd);
  frame(L, 1, P, S, chestFwd);
  frame(L, 2, S, N, chestFwd);
  frame(L, 3, N, neckTop, headFwd);
  frame(L, 4, neckTop, madd(neckTop, headUp, 0.2), headFwd);
  frame(L, 5, shL, elbowL, sub(wristL, shL));
  frame(L, 6, elbowL, wristL, cross(sub(wristL, elbowL), chestLeft));
  frame(L, 7, wristL, handTipL, chestFwd);
  frame(L, 8, shR, elbowR, sub(wristR, shR));
  frame(L, 9, elbowR, wristR, cross(chestLeft, sub(wristR, elbowR)));
  frame(L, 10, wristR, handTipR, chestFwd);
  frame(L, 11, hipL, kneeL, v3(0, 0, 1));
  frame(L, 12, kneeL, ankL, sub(kneeL, mul(add(hipL, ankL), 0.5)));
  frame(L, 13, ankL, toeL, v3(0, 1, 0));
  frame(L, 14, hipR, kneeR, v3(0, 0, 1));
  frame(L, 15, kneeR, ankR, sub(kneeR, mul(add(hipR, ankR), 0.5)));
  frame(L, 16, ankR, toeR, v3(0, 1, 0));
  // 腰の骨は向きを胴に合わせ、長さは短く
  // ---- 倒れる・横たわる: 足元を支点に回す
  let extra = null;
  if (down) {
    const fy = p.fallYaw || 0; // ローカルでの倒れる向き
    const fd = v3(Math.sin(fy), 0, Math.cos(fy));
    const axis = norm(cross(v3(0, 1, 0), fd));
    const u = state === 'dead' ? sm(T / 0.7) : sm(T / 0.9);
    const ang = u * (Math.PI / 2 - 0.06);
    const piv = v3(0, 0, 0);
    // 横たわったら床に沿わせる: 回したあと、いちばん低い点を床に
    let minY = Infinity;
    const tmp = [];
    for (let b = 0; b < NBONE; b++) {
      const o = b * 12;
      const pos = rotAxis(sub(v3(L[o], L[o + 1], L[o + 2]), piv), axis, ang);
      const X = rotAxis(v3(L[o + 3], L[o + 4], L[o + 5]), axis, ang), Y = rotAxis(v3(L[o + 6], L[o + 7], L[o + 8]), axis, ang), Z = rotAxis(v3(L[o + 9], L[o + 10], L[o + 11]), axis, ang);
      tmp.push([pos, X, Y, Z]);
      minY = Math.min(minY, pos[1]);
    }
    const lift = u > 0.5 ? (0.09 * s - minY) * sm((u - 0.5) * 2) : 0;
    for (let b = 0; b < NBONE; b++) {
      const o = b * 12, [pos, X, Y, Z] = tmp[b];
      L[o] = pos[0]; L[o + 1] = pos[1] + Math.max(0, lift); L[o + 2] = pos[2];
      L[o + 3] = X[0]; L[o + 4] = X[1]; L[o + 5] = X[2]; L[o + 6] = Y[0]; L[o + 7] = Y[1]; L[o + 8] = Y[2]; L[o + 9] = Z[0]; L[o + 10] = Z[1]; L[o + 11] = Z[2];
    }
    extra = { ang, axis };
  }
  // ---- 世界へ（yaw と位置）
  const cy = Math.cos(p.yaw || 0), sy = Math.sin(p.yaw || 0);
  const tw = (v) => [v[0] * cy + v[2] * sy + p.x, v[1] + p.y, -v[0] * sy + v[2] * cy + p.z];
  const tr = (v) => [v[0] * cy + v[2] * sy, v[1], -v[0] * sy + v[2] * cy];
  for (let b = 0; b < NBONE; b++) {
    const o = b * 12;
    const P0 = tw([L[o], L[o + 1], L[o + 2]]), X = tr([L[o + 3], L[o + 4], L[o + 5]]), Y = tr([L[o + 6], L[o + 7], L[o + 8]]), Z = tr([L[o + 9], L[o + 10], L[o + 11]]);
    L[o] = P0[0]; L[o + 1] = P0[1]; L[o + 2] = P0[2];
    L[o + 3] = X[0]; L[o + 4] = X[1]; L[o + 5] = X[2]; L[o + 6] = Y[0]; L[o + 7] = Y[1]; L[o + 8] = Y[2]; L[o + 9] = Z[0]; L[o + 10] = Z[1]; L[o + 11] = Z[2];
  }
  // 骨の長さ（描画とカプセル用）
  const lens = POSE_LEN;
  lens[0] = 0.2 * s; lens[1] = D.ps * s; lens[2] = D.sn * s; lens[3] = D.neck * s; lens[4] = 0.2 * s;
  lens[5] = ua; lens[6] = fa; lens[7] = D.hand * s; lens[8] = ua; lens[9] = fa; lens[10] = D.hand * s;
  lens[11] = legL; lens[12] = legS; lens[13] = D.foot * s; lens[14] = legL; lens[15] = legS; lens[16] = D.foot * s;
  let eyeW = tw(eye);
  if (down) { const o = 4 * 12; eyeW = [L[o] + L[o + 6] * 0.1, L[o + 1] + L[o + 7] * 0.1, L[o + 2] + L[o + 8] * 0.1]; }
  let gunW = null;
  if (gun && !down) gunW = { p: tw(gun.p), f: tr(gun.f), u: tr(gun.u), l: tr(gun.l) };
  return { eye: eyeW, gun: gunW, s, extra };
}
export const POSE_LEN = new Float32Array(NBONE);
function lerpN(a, b, t) { return a + (b - a) * t; }

// 当たりのカプセルを世界の座標で（骨の枠から）。out: [{a:[..], b:[..], r, part}]
export function hitCapsules(bones, lens, s = 1, out = []) {
  out.length = 0;
  for (const [bn, t0, t1, r, part] of HITCAPS) {
    const b = BI[bn], o = b * 12, L = lens[b];
    const px = bones[o], py = bones[o + 1], pz = bones[o + 2], yx = bones[o + 6], yy = bones[o + 7], yz = bones[o + 8];
    out.push({ a: [px + yx * L * t0, py + yy * L * t0, pz + yz * L * t0], b: [px + yx * L * t1, py + yy * L * t1, pz + yz * L * t1], r: r * s, part, bone: b });
  }
  return out;
}

// 線分とカプセルの交差。光線 o + d t (|d|=1), t∈[0, maxT]。戻り値 t か -1
export function rayCapsule(ox, oy, oz, dx, dy, dz, maxT, a, b, r) {
  // 線分 ab 上の点と光線の最短距離
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const oax = ox - a[0], oay = oy - a[1], oaz = oz - a[2];
  const baba = bax * bax + bay * bay + baz * baz, bard = bax * dx + bay * dy + baz * dz, baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = dx * oax + dy * oay + dz * oaz, oaoa = oax * oax + oay * oay + oaz * oaz;
  const A = baba - bard * bard, B = baba * rdoa - baoa * bard, Cc = baba * oaoa - baoa * baoa - r * r * baba;
  const h = B * B - A * Cc;
  if (h >= 0 && A > 1e-9) {
    const t = (-B - Math.sqrt(h)) / A;
    const y = baoa + t * bard;
    if (y > 0 && y < baba && t >= 0 && t <= maxT) return t;
  }
  // 端の球
  const sph = (cx, cy, cz) => {
    const ocx = ox - cx, ocy = oy - cy, ocz = oz - cz;
    const bq = ocx * dx + ocy * dy + ocz * dz, cq = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
    const hq = bq * bq - cq; if (hq < 0) return -1;
    const t = -bq - Math.sqrt(hq); return t >= 0 && t <= maxT ? t : (cq < 0 ? 0 : -1);
  };
  const t0 = sph(a[0], a[1], a[2]), t1 = sph(b[0], b[1], b[2]);
  if (t0 >= 0 && t1 >= 0) return Math.min(t0, t1);
  return t0 >= 0 ? t0 : t1;
}
