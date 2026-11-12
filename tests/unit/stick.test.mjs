import { test, ok } from '../lib/t.mjs';
import { sprintZone, SPRINT_ZONE } from '../../src/ui/stick.js';

// 指の位置を、真上からの角度（度）と中心からの距離（半径の倍数）で
const at = (deg, d) => [Math.sin(deg * Math.PI / 180) * d, -Math.cos(deg * Math.PI / 180) * d];

test('stick: ダッシュは真上から少し斜め（±40°）に倒しても始まり、走っている間は ±52° まで続く', () => {
  const spr = 1.25, d = 1.9; // d = 可変スティックの土台がついてくる距離
  ok(sprintZone(...at(0, d), spr, false), '真上');
  ok(sprintZone(...at(30, d), spr, false) && sprintZone(...at(-30, d), spr, false), '30°（前の判定では走れなかった）');
  ok(sprintZone(...at(38, d), spr, false), '38°');
  ok(!sprintZone(...at(46, d), spr, false), '46°では始まらない');
  ok(sprintZone(...at(48, d), spr, true), '走っている間は48°でも続く');
  ok(!sprintZone(...at(58, d), spr, true), '58°（エンジンが走らない向き）では止まる');
  ok(!sprintZone(...at(10, 1.1), spr, false), '印より下では始まらない');
  ok(sprintZone(...at(5, 1.1), spr, true), '走っている間は印の少し下でも続く');
  ok(!sprintZone(...at(5, 0.9), spr, true), '印から大きく下がると止まる');
  ok(!sprintZone(...at(170, 2), spr, true), '下向きは走らない');
  ok(SPRINT_ZONE.keep < 56, 'エンジンが走る範囲の内側');
});
