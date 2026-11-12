import { test, ok, eq, near } from '../lib/t.mjs';
import { makeWarWorld, addBox, addRamp, addCyl, finishWorld, heightAt, groundAt, ceilAt, pushOut, raycast, los } from '../../src/war/world.js';
import { M } from '../../src/engine/data/materials.js';

// 64m 四方。地形は x=40 から先で 1m 上がる坂。箱1つ（壁）、床の箱（2階）、坂の板、木
function mk() {
  const ww = makeWarWorld({ sx: 64, sz: 64, hs: 2 });
  for (let j = 0; j < ww.HD; j++) for (let i = 0; i < ww.HW; i++) ww.h[j * ww.HW + i] = i * 2 >= 40 ? Math.min(4, (i * 2 - 40) * 0.25) : 0;
  addBox(ww, { x0: 10, y0: 0, z0: 10, x1: 10.3, y1: 3, z1: 20, mat: M.BRICK });          // 壁（x=10〜10.3）
  addBox(ww, { x0: 20, y0: 2.8, z0: 20, x1: 26, y1: 3, z1: 26, mat: M.CONCRETE });        // 2階の床
  addRamp(ww, { x0: 30, z0: 20, x1: 31.5, z1: 26, y0: 0, y1: 3, dir: 'n' });             // 北へ上がる坂（z=26 で 0、z=20 で 3）
  addCyl(ww, { x: 5, z: 40, r: 0.3, y0: 0, y1: 6 });                                    // 木
  return finishWorld(ww);
}

test('war world: 地形の高さ・足もと（地形・床の箱・坂）・天井', () => {
  const ww = mk();
  near(heightAt(ww, 20, 5), 0, 1e-6, '平ら');
  near(heightAt(ww, 48, 5), 2, 1e-6, '坂の上');
  near(groundAt(ww, 48, 5, 2), 2, 1e-6, '坂の地形に立つ');
  near(groundAt(ww, 22, 22, 3), 3, 1e-6, '2階の床の上');
  near(groundAt(ww, 22, 22, 0), 0, 1e-6, '1階（床の下）');
  near(ceilAt(ww, 22, 22, 0), 2.8, 1e-6, '1階の天井は2階の床の下面');
  near(groundAt(ww, 30.7, 23, 1.5), 1.5, 1e-6, '坂の途中');
  ok(ceilAt(ww, 5, 5, 0) > 1e8, '外は空');
});

test('war world: 体の押し出し（壁・木・段差は押さない・世界の端）', () => {
  const ww = mk();
  const o = pushOut(ww, 10.5, 15, 0, 1.8, 0.28);
  ok(o[2] === 1 && Math.abs(10.5 + o[0] - (10.3 + 0.28)) < 1e-6, `壁から押し出す ${o[0].toFixed(3)}`);
  const t = pushOut(ww, 5.4, 40, 0, 1.8, 0.28);
  ok(t[2] === 1 && Math.hypot(5.4 + t[0] - 5, 40 + t[1] - 40) >= 0.58 - 1e-6, '木から押し出す');
  const f = pushOut(ww, 22, 22, 2.9, 4.7, 0.28);
  ok(f[2] === 0, '乗っている床の箱は押さない');
  const e = pushOut(ww, 0.1, 30, 0, 1.8, 0.28);
  ok(e[2] === 1 && 0.1 + e[0] >= 0.5 - 1e-6, '世界の端');
});

test('war world: 光線（壁の箱・木・地形）と見通し', () => {
  const ww = mk();
  // 壁に向かって
  let h = raycast(ww, 2, 1.5, 15, 1, 0, 0, 30);
  ok(h.length >= 1 && h[0].kind === 'block' && Math.abs(h[0].t0 - 8) < 1e-6 && Math.abs(h[0].t1 - 8.3) < 1e-6 && h[0].mat === M.BRICK, `壁 ${JSON.stringify(h[0])}`);
  // 木
  h = raycast(ww, 0, 1.5, 40, 1, 0, 0, 20);
  ok(h.length >= 1 && h[0].kind === 'prop' && Math.abs(h[0].t0 - 4.7) < 1e-3, `木 ${h[0] && h[0].t0}`);
  // 地形（下向き）
  h = raycast(ww, 50, 10, 5, 0, -1, 0, 30);
  ok(h.length >= 1 && h[0].kind === 'ground' && Math.abs(h[0].t0 - (10 - heightAt(ww, 50, 5))) < 0.05, `地面 ${h[0] && h[0].t0}`);
  // 遠くの坂（横から。地形の坂に当たる）
  h = raycast(ww, 30, 1, 5, 1, 0, 0, 30);
  ok(h.length >= 1 && h[0].kind === 'ground' && h[0].t0 > 13 && h[0].t0 < 16, `坂に当たる ${h[0] && h[0].t0}`);
  ok(!los(ww, 2, 1.5, 15, 18, 1.5, 15), '壁の向こうは見えない');
  ok(los(ww, 2, 1.5, 5, 18, 1.5, 5), '何もない所は見える');
  ok(!los(ww, 30, 1, 5, 60, 1, 5), '丘の向こうは見えない');
});
