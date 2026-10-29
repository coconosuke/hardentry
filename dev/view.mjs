// 見た目の確認用: マップと人を描いて、カメラを動かせる（Playwright から window.__view を使う）
import { Renderer } from '../src/render/renderer.js';
import { ActorView } from '../src/render/actors.js';
import { FX } from '../src/render/fx.js';
import { ViewModel } from '../src/render/viewmodel.js';
import { createGame, step } from '../src/engine/engine.js';
import { eyeOf } from '../src/engine/combat.js';
import { MAPS } from '../src/engine/maps/index.js';
import { makeWeapon } from '../src/engine/actor.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const W = innerWidth, H = innerHeight;
const r = new Renderer(canvas, { quality: q.get('q') || 'medium', preserve: true });
r.resize(W, H, 1);
const map = q.get('map') || 'training';
const G = createGame({ map, mode: q.get('mode') || 'train', seed: 5, team: 5 });
r.setMap(G.w, MAPS[map], G.S);
const av = new ActorView(r);
const fx = new FX(r);
const vm = new ViewModel(r, av);
for (let i = 0; i < 30; i++) step(G, {});
const p0 = G.S.actors[0];
const cam = { x: p0.x, y: 1.65, z: p0.z + 3, yaw: Math.PI, pitch: 0, roll: 0, fov: 55 * Math.PI / 180 };
let fp = q.get('fp') === '1';
if (fp) av.hidden.add(p0.id);
function frame(opts = {}) {
  if (opts.fp != null) { fp = opts.fp; if (fp) av.hidden.add(p0.id); else av.hidden.delete(p0.id); }
  if (opts.weapon) { p0.inv.w[0] = makeWeapon(opts.weapon); p0.ws.slot = 0; p0.ws.st = 'ready'; }
  if (fp) {
    const e = eyeOf(G.S, p0);
    cam.x = e[0]; cam.y = e[1]; cam.z = e[2]; cam.yaw = p0.yaw; cam.pitch = p0.pitch;
  }
  av.prepare(G.S, G.w);
  if (fp) vm.update(p0, cam, 0.016);
  fx.update(0.016);
  const lights = [];
  fx.lights(lights, () => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  r.render({ cam, doors: G.S.doors, lights, post: { exposure: opts.exposure ?? 1.0, nvg: !!opts.nvg }, dt: 0.016, vm: fp ? { fov: 52 * Math.PI / 180 } : null });
  document.getElementById('info').textContent = `bake ${r.bakeMs.toFixed(0)}ms build ${r.buildMs.toFixed(0)}ms draws ${r.stats.draws} tris ${(r.stats.tris / 1000).toFixed(1)}k chunks ${r.stats.chunks}`;
}
function inp(o) { return { [p0.id]: Object.assign({ mx: 0, mz: 0, yaw: p0.yaw, pitch: p0.pitch, stance: 0 }, o) }; }
window.__view = { r, G, cam, fx, vm, p0, frame, inp, step: (n = 1, o = {}) => { for (let i = 0; i < n; i++) step(G, inp(o)); }, ready: true };
frame();
