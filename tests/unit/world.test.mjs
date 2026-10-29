import { test, ok, eq, near } from '../lib/t.mjs';
import { compileMap, raycast, los, groundAt, pushOut, C, CS, LH } from '../../src/engine/world.js';
import { M } from '../../src/engine/data/materials.js';

const tiny = {
  id: 'tiny', floor: 2,
  levels: [{ rows: [
    '##########',
    '#........#',
    '#...=....#',
    '#...=....#',
    '#...DD...#',
    '#........#',
    '#...G....#',
    '##########',
  ] }],
};
// 注意: DD は横並び。=の線は縦。

test('world: 小さなマップを組み立てられる', () => {
  const w = compileMap(tiny);
  eq(w.errors, [], 'エラーなし');
  eq(w.W, 10); eq(w.D, 8); eq(w.doors.length, 1);
  ok(w.cell[w.idx(0, 1, 1)] === C.FLOOR, '床');
  ok(w.cell[w.idx(0, 0, 0)] === C.WALL, '壁');
  eq(w.rooms.length >= 1, true);
});

test('world: 壁の板は中央にあり厚さどおり', () => {
  const w = compileMap(tiny);
  const k = w.idx(0, 4, 2); // '=' の縦の線
  ok(w.nbox[k] >= 1, '箱がある');
  // 縦の線: x方向に薄い
  const o = k * 8;
  const bx0 = w.boxes[o], bz0 = w.boxes[o + 1], bx1 = w.boxes[o + 2], bz1 = w.boxes[o + 3];
  const wide = Math.max(bx1 - bx0, bz1 - bz0), thin = Math.min(bx1 - bx0, bz1 - bz0);
  near(thin, 0.12, 0.001, '石膏の厚さ');
});

test('world: 水平な光線が石膏の壁に当たり、貫通の材質が分かる', () => {
  const w = compileMap(tiny);
  // (1.5, 1.5, 2.6) から +x へ。x=4*0.5+0.25=2.25 付近に板
  const hits = raycast(w, 1.0, 1.5, 1.3, 1, 0, 0, 10, null);
  ok(hits.length > 0, '何かに当たる');
  eq(hits[0].mat, M.DRYWALL, '最初は石膏');
  near(hits[0].t0, 2.25 - 0.06 - 1.0, 0.01, '距離');
  near(hits[0].t1 - hits[0].t0, 0.12, 0.01, '厚さ');
});

test('world: 窓は腰から下が壁、真ん中はガラス', () => {
  const w = compileMap(tiny);
  const k = w.idx(0, 4, 6);
  eq(w.cell[k], C.WINDOW);
  const b = k * 4;
  ok(w.blocks[b] !== M.GLASS && w.blocks[b] !== 0, '下は壁');
  eq(w.blocks[b + 1], M.GLASS); eq(w.blocks[b + 2], M.GLASS);
});

test('world: 床の高さと押し出し', () => {
  const w = compileMap(tiny);
  near(groundAt(w, 1.2, 1.2, 0), 0, 1e-6, '床は0');
  // 外壁にめり込んだら押し出す
  const r = pushOut(w, 0.55, 1.2, 0.36, 1.8, 0.28, null);
  ok(r[2] === 1 && r[0] > 0, '内側へ押し出す');
});

test('world: 扉は閉じていると視線を止め、開くと通す', () => {
  const w = compileMap(tiny);
  const d = w.doors[0];
  const closed = [{ ang: [0], broken: false, bar: 0 }];
  const open = [{ ang: [Math.PI / 2 * d.leaves[0].s], broken: false, bar: 0 }];
  const a = [d.cx, 1.5, d.cz - 0.8], b = [d.cx, 1.5, d.cz + 0.8];
  eq(los(w, ...a, ...b, closed), false, '閉じた扉');
  eq(los(w, ...a, ...b, open), true, '開いた扉');
});
