// 大規模戦の地図（ミニマップと地図の画面）: 地面の色＋起伏の陰・道・建物・範囲の外（暗く）・拠点・本陣
import { prepGround } from '../war/render.js';

const toS = (v) => Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2));
const PX = 2; // 1画素 = 2m

// 地図の絵（一度だけ作る）。m: S.m（範囲・本陣・拠点）
export function warPlanImage(ww, m) {
  prepGround(ww);
  const W = Math.ceil(ww.sx / PX), H = Math.ceil(ww.sz / PX);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
  const C = ww._gcol, h = ww.h, HW = ww.HW, k = Math.max(1, Math.round(PX / ww.hs));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = Math.min(HW - 1, x * k), j = Math.min(ww.HD - 1, y * k), q = j * HW + i;
    // 起伏の陰（北西からの光）
    const hl = h[j * HW + Math.max(0, i - 1)], hr = h[j * HW + Math.min(HW - 1, i + 1)], hu = h[Math.max(0, j - 1) * HW + i], hd = h[Math.min(ww.HD - 1, j + 1) * HW + i];
    const sh = Math.max(0.55, Math.min(1.3, 1 + ((hl - hr) + (hu - hd)) * 0.18));
    const o = (y * W + x) * 4;
    d[o] = toS(C[q * 3] * 1.9 * sh); d[o + 1] = toS(C[q * 3 + 1] * 1.9 * sh); d[o + 2] = toS(C[q * 3 + 2] * 1.9 * sh); d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // 建物
  ctx.fillStyle = 'rgba(52,54,58,0.95)'; ctx.strokeStyle = 'rgba(20,20,22,0.9)'; ctx.lineWidth = 0.6;
  for (const b of ww.blds || []) { const r = b.rect; ctx.fillRect(r[0] / PX, r[1] / PX, (r[2] - r[0]) / PX, (r[3] - r[1]) / PX); ctx.strokeRect(r[0] / PX, r[1] / PX, (r[2] - r[0]) / PX, (r[3] - r[1]) / PX); }
  // 範囲の外を暗く
  if (m && m.rect) {
    const [x0, z0, x1, z1] = m.rect.map(v => v / PX);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, z0); ctx.fillRect(0, z1, W, H - z1); ctx.fillRect(0, z0, x0, z1 - z0); ctx.fillRect(x1, z0, W - x1, z1 - z0);
    ctx.strokeStyle = 'rgba(255,90,70,0.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.strokeRect(x0, z0, x1 - x0, z1 - z0); ctx.setLineDash([]);
  }
  return cv;
}
// 拠点と本陣の印（ミニマップ・地図で、毎回描く。持ち主で色が変わる）
export function drawWarMarks(ctx, m, myTeam, toXY, scale = 1) {
  if (!m) return;
  const col = (o) => o < 0 ? 'rgba(235,235,235,0.95)' : o === myTeam ? '#4aa8ff' : '#ff4a3a';
  for (let t = 0; t < (m.hq || []).length; t++) {
    if (m.mode === 'range' && t !== myTeam) continue; // 射撃場の奥の本陣（人形の向きにだけ使う）は描かない
    const [x, y] = toXY(m.hq[t][0], m.hq[t][1]);
    ctx.fillStyle = t === myTeam ? 'rgba(74,168,255,0.9)' : 'rgba(255,74,58,0.9)';
    ctx.fillRect(x - 5 * scale, y - 5 * scale, 10 * scale, 10 * scale);
    ctx.fillStyle = '#fff'; ctx.font = `bold ${7 * scale}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('HQ', x, y + 0.5);
  }
  for (const f of m.flags || []) {
    const [x, y] = toXY(f.x, f.z);
    ctx.beginPath(); ctx.arc(x, y, 8 * scale, 0, Math.PI * 2); ctx.fillStyle = 'rgba(10,14,18,0.75)'; ctx.fill();
    ctx.lineWidth = 2 * scale; ctx.strokeStyle = col(f.owner); ctx.stroke();
    ctx.fillStyle = col(f.owner); ctx.font = `bold ${10 * scale}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(f.id, x, y + 0.5);
  }
}
export const WAR_PX = PX;
