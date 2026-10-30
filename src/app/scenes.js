// タイトルとメニューの背景: 夜のガソリンスタンドの前に並ぶ隊員を、ゆっくり回るカメラで写す
import { createGame, step } from '../engine/engine.js';
import { MAPS } from '../engine/maps/index.js';
import { ActorView } from '../render/actors.js';
import { FX } from '../render/fx.js';

const DEG = Math.PI / 180;
export class TitleScene {
  constructor(app) { this.app = app; this.t = 0; this.ready = false; }
  prepare() {
    const map = 'gasstation';
    this.G = createGame({ map, mode: 'train', house: false, team: 4, seed: 7, dt: 1 / 30 });
    this.def = MAPS[map];
    // 少し進めて姿勢を落ち着かせる
    for (let i = 0; i < 20; i++) step(this.G, {});
    this.ready = true;
  }
  enter() {
    if (!this.ready) this.prepare();
    const r = this.app.renderer;
    r.setMap(this.G.w, this.def, this.G.S);
    this.av = new ActorView(r); this.fx = new FX(r);
    this.entered = true;
  }
  leave() { this.entered = false; }
  frame(dt, dim) {
    if (!this.entered) this.enter();
    this.t += dt;
    const S = this.G.S;
    // 隊員はその場で（時々向きを変える）
    if (Math.floor(this.t * 30) % 2 === 0) step(this.G, {});
    const p0 = S.actors[0];
    const cx = p0.x, cz = p0.z;
    const a = 2.6 + Math.sin(this.t * 0.05) * 0.55;
    const R = 6.5 + Math.sin(this.t * 0.07) * 1.2;
    const cam = { x: cx + Math.sin(a) * R, y: 1.35 + Math.sin(this.t * 0.11) * 0.25, z: cz + Math.cos(a) * R, yaw: 0, pitch: -0.05, roll: 0, fov: 50 * DEG };
    // 建物の方を見る（隊員越し）
    const tx = cx + Math.sin(Math.PI) * 6, tz = cz + Math.cos(Math.PI) * 6;
    cam.yaw = Math.atan2(tx - cam.x, tz - cam.z);
    this.av.prepare(S, this.G.w);
    this.fx.update(dt);
    this.fx.lights([], () => []);
    const r = this.app.renderer;
    r.render({ cam, doors: S.doors, lights: [], dt, post: { exposure: (r.sky ? r.sky.exposure : 1) * 1.1 * (this.app.settings.bright || 1), vig: dim ? 0.6 : 0.4, blur: dim ? 0.0 : 0 }, shadows: this.app.settings.quality !== 'low' });
  }
}
