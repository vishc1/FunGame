// Meme Karts car physics, shared by the server (the authority) and the browser (which predicts your own kart a round trip
// ahead so steering feels instant). Pure functions on {x, y, a, vx, vy, ctl}. Keep it free of DOM and Node specifics.
(function (root, factory) { const m = factory(); if (typeof module === 'object' && module.exports) module.exports = m; else root.MEMEKARTS_PHYSICS = m; })(typeof self !== 'undefined' ? self : this, function () {
  const M = 20; // wall margin (the same M as server/games/memekarts.js)
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // ---- shared car physics ----------------------------------------------------
  function stepCar(c, dt, o) {
    const cos = Math.cos(c.a), sin = Math.sin(c.a);
    let fwd = c.vx * cos + c.vy * sin;
    let lat = -c.vx * sin + c.vy * cos;
    const ctl = c.ctl || {};
    if (!c.spin) {
      if (ctl.up && fwd < o.maxF) fwd = Math.min(o.maxF, fwd + o.accel * dt);
      if (ctl.down && fwd > -o.maxR) fwd = Math.max(-o.maxR, fwd - o.accel * dt);
      if (o.thrust && fwd < o.maxF) fwd = Math.min(o.maxF, fwd + o.thrust * dt);
      const steer = (ctl.right ? 1 : 0) - (ctl.left ? 1 : 0);
      c.a += steer * o.turn * Math.min(1, Math.abs(fwd) / 80) * dt;
    }
    fwd *= Math.pow(0.985, 60 * dt);
    if (!ctl.up && !ctl.down && !o.thrust) fwd *= Math.pow(0.6, dt);
    lat *= Math.pow(0.02, dt);
    const c2 = Math.cos(c.a), s2 = Math.sin(c.a);
    c.vx = c2 * fwd - s2 * lat; c.vy = s2 * fwd + c2 * lat;
    c.x += c.vx * dt; c.y += c.vy * dt;
  }
  function collideBounds(o, r, rest, W, H) {
    let hit = false;
    if (o.x < M + r) { o.x = M + r; if (o.vx < 0) o.vx = -o.vx * rest; hit = true; }
    if (o.x > W - M - r) { o.x = W - M - r; if (o.vx > 0) o.vx = -o.vx * rest; hit = true; }
    if (o.y < M + r) { o.y = M + r; if (o.vy < 0) o.vy = -o.vy * rest; hit = true; }
    if (o.y > H - M - r) { o.y = H - M - r; if (o.vy > 0) o.vy = -o.vy * rest; hit = true; }
    return hit;
  }
  function collideRect(o, r, rc, rest) {
    const cx = clamp(o.x, rc.x, rc.x + rc.w), cy = clamp(o.y, rc.y, rc.y + rc.h);
    const dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
    if (d >= r) return false;
    let nx, ny;
    if (d === 0) {
      const l = o.x - rc.x, rr = rc.x + rc.w - o.x, t = o.y - rc.y, b = rc.y + rc.h - o.y, m = Math.min(l, rr, t, b);
      if (m === l) { nx = -1; ny = 0; o.x = rc.x - r; } else if (m === rr) { nx = 1; ny = 0; o.x = rc.x + rc.w + r; }
      else if (m === t) { nx = 0; ny = -1; o.y = rc.y - r; } else { nx = 0; ny = 1; o.y = rc.y + rc.h + r; }
    } else { nx = dx / d; ny = dy / d; o.x = cx + nx * r; o.y = cy + ny * r; }
    const vn = o.vx * nx + o.vy * ny;
    if (vn < 0) { o.vx -= nx * vn * (1 + rest); o.vy -= ny * vn * (1 + rest); }
    return true;
  }
  function wallHit(o, r, rest, obstacles, W = 900, H = 600) { let h = collideBounds(o, r, rest, W, H); for (const rc of obstacles) if (collideRect(o, r, rc, rest)) h = true; return h; }
  return { M, stepCar, collideBounds, collideRect, wallHit };
});
