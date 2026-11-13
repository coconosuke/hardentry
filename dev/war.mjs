// 大規模戦の世界の見た目の確認用（Playwright から window.__war を使う）
import { Renderer, gfxOf } from '../src/render/renderer.js';
import { buildRiverbend } from '../src/war/maps/riverbend.js';
import { buildKit } from './kitworld.mjs';
import { buildRange } from '../src/war/maps/range.js';
import { heightAt } from '../src/war/world.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const W = innerWidth, H = innerHeight;
const r = new Renderer(canvas, { gfx: gfxOf({ quality: q.get('q') || 'medium' }), preserve: true });
r.resize(W, H, 1);
let t0 = performance.now();
const ww = q.get('map') === 'kit' ? buildKit() : q.get('map') === 'range' ? buildRange() : buildRiverbend(7);
const worldMs = performance.now() - t0;
r.setWar(ww, { viewDist: +(q.get('vd') || 900), nearDist: +(q.get('nd') || 150), grassDist: +(q.get('gd') ?? 55) });
const cam = { x: 700, y: 0, z: 760, yaw: Math.PI, pitch: -0.05, roll: 0, fov: 70 * Math.PI / 180 };
function frame(o = {}) {
  if (o.x != null) { cam.x = o.x; cam.z = o.z; cam.y = heightAt(ww, cam.x, cam.z) + (o.h ?? 1.7); }
  if (o.y != null) cam.y = o.y;
  if (o.yaw != null) cam.yaw = o.yaw; if (o.pitch != null) cam.pitch = o.pitch;
  if (o.warm) r.warmWar(cam.x, cam.z);
  const t = performance.now();
  r.render({ cam, lights: [], post: { exposure: r.sky.exposure ?? 1 }, dt: 0.016 });
  const ms = performance.now() - t;
  document.getElementById('info').textContent = `world ${worldMs.toFixed(0)}ms build ${r.buildMs.toFixed(0)}ms draws ${r.stats.draws} tris ${(r.stats.tris / 1000).toFixed(1)}k chunks ${r.stats.chunks} cpu ${ms.toFixed(1)}ms`;
  return { draws: r.stats.draws, tris: r.stats.tris, ms };
}
window.__war = { r, ww, cam, frame, ready: true };
frame({ warm: true });
