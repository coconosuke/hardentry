import { test, ok, near } from '../lib/t.mjs';
import { compileMap, pushOut, stairHeight, STEP, RAIL } from '../../src/engine/world.js';
import { MAPS } from '../../src/engine/maps/index.js';

test('world: 階段の手すりに体が当たる（開いている側。段の上からも床からも抜けられない）', () => {
  const w = compileMap(MAPS.suburb);
  // 居間の西の壁ぞいの階段（北へ上がる）。東の側が開いていて手すりがある
  const R = w.rails.find(r => r.s.i0 === 15 && r.s.j0 === 30);
  ok(R, '手すりがある');
  const s = R.s, x = R.ax, z = (s.z0 + s.z1) / 2, h = stairHeight(w, s, x - 0.3, z), r = 0.28;
  // 段の上（真ん中の高さ）から手すりへ寄ると、階段の内側へ押し戻される
  const o = pushOut(w, x - 0.1, z, h + STEP, h + 1.7, r, null);
  ok(o[2] && o[0] < -0.1, `段の上から押し戻す ${o[0].toFixed(2)}`);
  // 床の側から手すりへ寄ると、外へ押し戻される
  const o2 = pushOut(w, x + 0.1, z, STEP, 1.7, r, null);
  ok(o2[2] && o2[0] > 0.1, `床の側から押し戻す ${o2[0].toFixed(2)}`);
  // 手すりの上（段の面 + 手すりの高さ）より上は当たらない
  const o3 = pushOut(w, x - 0.1, z, h + RAIL.h + 0.05, h + RAIL.h + 1.7, r, null);
  near(o3[0], 0, 0.001, '手すりより上は当たらない');
});
