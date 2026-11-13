// 建物と小物の見本の世界（見た目の確認用。400×400m の平らな草地に並べる）
import { makeWarWorld, finishWorld } from '../src/war/world.js';
import * as K from '../src/war/buildings.js';
import * as P from '../src/war/props.js';
import { mulberry } from '../src/war/noise.js';

export function buildKit() {
  const ww = makeWarWorld({ sx: 400, sz: 400, hs: 2 });
  ww.mapId = 'kit'; ww.areas = {}; ww.flagDefs = {}; ww.roads = [[[60, 200], [340, 200]]]; ww.trees = [];
  ww.mountIn = [150, 150];
  for (let i = 0; i < ww.h.length; i++) ww.h[i] = 0;
  const rnd = mulberry(5);
  // 建物の列（道の北）
  const list = [['house', 80], ['house', 96], ['bungalow', 112], ['shop', 130], ['office', 150], ['apartment', 172], ['shed', 192], ['barn', 206], ['bunker', 224], ['ruin', 240], ['tower', 256], ['warehouse', 270]];
  for (const [k, x] of list) K[k](ww, { x, z: 170, y: 0, rot: 0, floors: k === 'office' ? 3 : k === 'apartment' ? 3 : k === 'shop' ? 2 : undefined, rnd });
  K.gasStation(ww, { x: 300, z: 168, y: 0, rot: 0, rnd });
  // 小物の列（道の南）
  let x = 80;
  P.car(ww, x, 212, 0, { rnd }); P.car(ww, x + 6, 212, 0, { rnd }); P.pickup(ww, x + 13, 212, 0, { rnd }); P.truck(ww, x + 24, 212, 0, { rnd }); P.wreck(ww, x + 36, 212, 0, { rnd });
  P.car(ww, x + 44, 214, 1, { rnd });
  P.jerseyRun(ww, x + 50, 212, x + 62, 212); P.hesco(ww, x + 66, 212, x + 76, 212); P.hesco(ww, x + 66, 214, x + 76, 214, 2.2);
  P.tankTrap(ww, x + 82, 212); P.tankTrap(ww, x + 85, 214); P.crates(ww, x + 90, 212, 5, { rnd }); P.pallets(ww, x + 95, 212); P.barrels(ww, x + 99, 212, 5, { rnd });
  P.railFence(ww, x + 104, 210, x + 120, 210); P.boardFence(ww, x + 104, 214, x + 120, 214); P.stoneWall(ww, x + 124, 212, x + 138, 212); P.hedge(ww, x + 142, 212, x + 156, 212);
  P.hay(ww, x + 160, 212, 4, { rnd }); P.logs(ww, x + 170, 212, 0); P.pole(ww, x + 176, 212); P.lamp(ww, x + 180, 212, 1); P.dumpster(ww, x + 184, 212, 0, { rnd }); P.busStop(ww, x + 190, 212, 0);
  P.rubble(ww, x + 198, 212, 6, { rnd }); P.foxhole(ww, x + 208, 213, 's');
  K.sandbags(ww, x + 214, 212, x + 220, 212, 0);
  return finishWorld(ww);
}
