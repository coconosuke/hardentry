// タイトルとメニューの背景（WAR BIT）: 射撃場の谷の草地に立つ分隊（分隊長・突撃・衛生・援護）を、ゆっくり回るカメラで写す。
// 世界は射撃場（小さく、すぐ作れる。射撃場を選んだときにもそのまま使う）
import { createGame, step } from '../engine/engine.js';
import { ActorView } from '../render/actors.js';
import { FX } from '../render/fx.js';
import { gfxOf } from '../render/renderer.js';
import { heightAt } from '../war/world.js';

const DEG = Math.PI / 180;
// 分隊の並び（場所・向き・姿勢・兵科・銃）
const POSE = [
  { dx: 0, dz: 0, yaw: 0.25, stance: 0, cls: 'leader', gun: 'hk416' },
  { dx: -1.6, dz: 1.3, yaw: 0.55, stance: 1, cls: 'assault', gun: 'm4a1' },
  { dx: 1.7, dz: 1.1, yaw: -0.1, stance: 0, cls: 'support', gun: 'rpk' },
  { dx: 0.4, dz: 2.6, yaw: 0.9, stance: 0, cls: 'medic', gun: 'mp7' },
  { dx: -3.1, dz: 3.3, yaw: 0.2, stance: 0, cls: 'recon', gun: 'at308' },
];
export class TitleScene {
  constructor(app) { this.app = app; this.t = 0; this.ready = false; }
  prepare() {
    const roster = POSE.map((q, i) => ({ pid: null, name: '', team: 0, cls: q.cls, gun: q.gun }));
    this.G = createGame({ map: 'range', mode: 'war', wmode: 'range', roster, seed: 7, dt: 1 / 30 });
    const S = this.G.S, w = this.G.w;
    // 射場の左の草地（標的の列の外）。日を正面から受ける向き（カメラは西を見る）
    this.cx = 116; this.cz = 300;
    S.actors.filter(a => !a.dummy).forEach((a, i) => {
      const q = POSE[i] || POSE[0];
      a.x = this.cx + q.dx; a.z = this.cz + q.dz; a.y = heightAt(w, a.x, a.z); a.yaw = Math.PI / 2 + q.yaw; a.stance = q.stance; a.ai = null;
    });
    for (let i = 0; i < 20; i++) step(this.G, {});
    this.ready = true;
  }
  enter() {
    if (!this.ready) this.prepare();
    const r = this.app.renderer;
    this.detach();
    const g = gfxOf(this.app.settings);
    r.setWar(this.G.w, { viewDist: g.detail === 'low' ? 450 : 650, nearDist: 120, shadowR: 30, grassDist: g.detail === 'low' ? 0 : 45 });
    r.warmWar(this.cx, this.cz);
    this.av = new ActorView(r); this.fx = new FX(r);
    this.entered = true;
  }
  // 試合が始まる・描き手が作り直されるとき: タイトルの人と粒子を描くのをやめる
  detach() { if (this.av) this.av.dispose(); if (this.fx) this.fx.dispose(); this.av = this.fx = null; this.entered = false; }
  leave() { this.detach(); }
  frame(dt, dim) {
    if (!this.entered) this.enter();
    this.t += dt;
    const S = this.G.S, w = this.G.w;
    if (Math.floor(this.t * 30) % 2 === 0) step(this.G, {});
    // カメラ: 分隊の東（日の側）から、ゆっくり左右に回りながら少し見上げる
    const a = Math.PI / 2 + 0.3 + Math.sin(this.t * 0.045) * 0.22;
    const R = 6.2 + Math.sin(this.t * 0.07) * 0.6;
    const tx = this.cx - 0.4, tz = this.cz + 1.4;
    const x = tx + Math.sin(a) * R, z = tz + Math.cos(a) * R;
    const y = heightAt(w, x, z) + 1.1 + Math.sin(this.t * 0.11) * 0.12;
    // 分隊が画面の右寄り（左はメニュー）に来るよう、見る所を横へずらす
    const yaw0 = Math.atan2(tx - x, tz - z), off = this.off ?? 2.6;
    const lx = tx + Math.cos(yaw0) * off, lz = tz - Math.sin(yaw0) * off;
    const cam = { x, y, z, yaw: Math.atan2(lx - x, lz - z), pitch: 0.04, roll: 0, fov: 52 * DEG };
    this.av.prepare(S, w);
    this.fx.update(dt);
    this.fx.lights([], () => []);
    const r = this.app.renderer;
    r.render({ cam, doors: [], lights: [], dt, post: { exposure: (r.sky ? r.sky.exposure : 1) * (this.app.settings.bright || 1), vig: dim ? 0.62 : 0.38, sat: (this.app.settings.sat ?? 1.08) * 0.9 }, shadows: this.app.settings.quality !== 'low' });
  }
}
