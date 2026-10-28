// Meme Karts car physics, shared by the server (the authority) and the browser (which predicts your own kart a round trip
// ahead so steering feels instant). Pure functions on {x, y, a, vx, vy, ctl}. Keep it free of DOM and Node specifics.
(function (root, factory) { const m = factory(); if (typeof module === 'object' && module.exports) module.exports = m; else root.MEMEKARTS_PHYSICS = m; })(typeof self !== 'undefined' ? self : this, function () {
  const M = 20; // wall margin (the same M as server/games/memekarts.js)
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // ---- shared car physics ----------------------------------------------------
  function integrateCar(c, dt, o) {
    const cos = Math.cos(c.a), sin = Math.sin(c.a);
    let fwd = c.vx * cos + c.vy * sin;
    let lat = -c.vx * sin + c.vy * cos;
    const ctl = c.ctl || {};
    if (!c.spin) {
      if (ctl.up && fwd < o.maxF) fwd = Math.min(o.maxF, fwd + o.accel * dt);
      if (ctl.down && fwd > -o.maxR) fwd = Math.max(-o.maxR, fwd - o.accel * dt);
      if (o.thrust && fwd < o.maxF) fwd = Math.min(o.maxF, fwd + o.thrust * dt);
      const steer = (ctl.right ? 1 : 0) - (ctl.left ? 1 : 0);
      c.a += steer * o.turn * clamp(fwd / 80, -1, 1) * dt;
    }
    fwd *= Math.pow(0.985, 60 * dt);
    if (!ctl.up && !ctl.down && !o.thrust) fwd *= Math.pow(0.6, dt);
    lat *= Math.pow(0.02, dt);
    const c2 = Math.cos(c.a), s2 = Math.sin(c.a);
    c.vx = c2 * fwd - s2 * lat; c.vy = s2 * fwd + c2 * lat;
    c.x += c.vx * dt; c.y += c.vy * dt;
  }
  // Small, identical steps on both peers: a slow frame must not change handling
  // or jump over a thin obstacle. Never integrate an unbounded catch-up interval.
  function substeps(dt, fn) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const duration = Math.min(dt, .25), count = Math.ceil(duration * 120 - 1e-9);
    for (let i = 0; i < count; i++) fn(duration / count);
  }
  function stepCar(c, dt, o) { substeps(dt, h => integrateCar(c, h, o)); }

  // Shared height collision, including the nose, ramp grades, sliding and falls.
  // `surface` is supplied by memekarts-maps on both the server and client.
  function collideTerrain(k, px, py, dt, rest, surface, radius = 16) {
    const STEP = 10, GRADE = .72;
    k.el = k.el || 0;
    if (surface(px, py) - k.el > STEP) { k.el = surface(k.x, k.y); return false; }
    const mx = k.x - px, my = k.y - py, ml = Math.hypot(mx, my) || 1;
    const lx = mx / ml * radius, ly = my / ml * radius;
    const wall = (x, y, ox, oy) => {
      const d = Math.hypot(x - px, y - py), rise = surface(x, y) - k.el, rise2 = surface(x + ox, y + oy) - k.el;
      return (rise > STEP && rise > d * GRADE) || (rise2 > STEP && rise2 > (d + Math.hypot(ox, oy)) * GRADE);
    };
    let hit = false;
    if (wall(k.x, k.y, lx, ly)) {
      hit = true;
      if (!wall(k.x, py, lx, 0)) { k.y = py; k.vy = -k.vy * rest; }
      else if (!wall(px, k.y, 0, ly)) { k.x = px; k.vx = -k.vx * rest; }
      else { k.x = px; k.y = py; k.vx = -k.vx * rest; k.vy = -k.vy * rest; }
    }
    const height = surface(k.x, k.y);
    if (k.el - height > STEP) { k.el = Math.max(height, k.el - 300 * dt); k.falling = true; }
    else { k.el = height; k.falling = false; }
    return hit;
  }
  function stepGrounded(k, dt, options, map, surface, radius = 16) {
    let hit = false, landed = false;
    substeps(dt, h => {
      const px = k.x, py = k.y, falling = k.falling;
      integrateCar(k, h, options);
      if (wallHit(k, radius, .4, map.obstacles, map.w, map.h)) hit = true;
      if (collideTerrain(k, px, py, h, .3, surface, radius)) hit = true;
      if (falling && !k.falling) landed = true;
    });
    return { hit, landed };
  }
  function moveGrounded(k, dt, map, surface, rest = 1, radius = 16) {
    let hit = false;
    substeps(dt, h => {
      const px = k.x, py = k.y;
      k.x += k.vx * h; k.y += k.vy * h;
      if (wallHit(k, radius, rest, map.obstacles, map.w, map.h)) hit = true;
      if (collideTerrain(k, px, py, h, rest, surface, radius)) hit = true;
    });
    return hit;
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
  return { M, stepCar, stepGrounded, moveGrounded, collideTerrain, collideBounds, collideRect, wallHit };
});
