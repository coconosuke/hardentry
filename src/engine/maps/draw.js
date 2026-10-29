// マップを描く道具: 文字マスの紙に、四角・線・扉・窓を描いて、行の文字列にする（決まった手順なのでデータと同じ）
export function canvas(W, D, fill = ' ') {
  const g = Array.from({ length: D }, () => Array(W).fill(fill));
  const c = {
    W, D, g,
    set(x, z, ch) { if (x >= 0 && z >= 0 && x < W && z < D) g[z][x] = ch; return c; },
    get(x, z) { return x >= 0 && z >= 0 && x < W && z < D ? g[z][x] : ' '; },
    rect(x0, z0, x1, z1, ch) { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) c.set(x, z, ch); return c; },
    frame(x0, z0, x1, z1, ch) { for (let x = x0; x <= x1; x++) { c.set(x, z0, ch); c.set(x, z1, ch); } for (let z = z0; z <= z1; z++) { c.set(x0, z, ch); c.set(x1, z, ch); } return c; },
    // 床つきの部屋（外周は壁）
    room(x0, z0, x1, z1, wall, floor) { c.rect(x0 + 1, z0 + 1, x1 - 1, z1 - 1, floor); c.frame(x0, z0, x1, z1, wall); return c; },
    h(x0, x1, z, ch) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) c.set(x, z, ch); return c; },
    v(x, z0, z1, ch) { for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) c.set(x, z, ch); return c; },
    // 扉: 横の壁（h）なら x から n マス、縦の壁（v）なら z から n マス
    door(x, z, dir, n = 2, ch = 'D') { for (let k = 0; k < n; k++) dir === 'h' ? c.set(x + k, z, ch) : c.set(x, z + k, ch); return c; },
    win(x, z, dir, n = 2, ch = 'G') { for (let k = 0; k < n; k++) dir === 'h' ? c.set(x + k, z, ch) : c.set(x, z + k, ch); return c; },
    // 階段の範囲を 'S' で
    stairs(x, z, iw, jw) { c.rect(x, z, x + iw - 1, z + jw - 1, 'S'); return c; },
    rows() { return g.map(r => r.join('')); },
  };
  return c;
}
