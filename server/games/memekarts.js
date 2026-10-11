// Meme Karts: top-down kart arena deathmatch where every pickup is a parody reference weapon.
//
// ADDING A WEAPON: push one object onto WEAPONS below: { id, name, color, fire(g, k) }
//   g  = game helpers: g.spawn(ent), g.damage(victim, amount, killerId, weaponName), g.behind(kart, dist) -> {x,y},
//        g.karts (Map id -> kart), g.ents (live entities), g.api (room api)
//   k  = the kart that fired (x, y, a = heading, vx, vy, ...)
//   Entities are plain objects { kind, x, y, owner, life, ... }. If your weapon needs a new entity behaviour,
//   add KINDS[kind] = { update(e, g, dt) -> keep? , hit?(e, g, kart), expire?(e, g) }.
//   Then add a matching icon in public/games/memekarts.js WEAPON_ICONS[id] (and ENT_DRAW[kind] for a new kind).
//
// Testing: set api.memory.__fast = true (≈8 s) or a number of seconds before create() to shorten the match.

const MAPS = require('../../public/memekarts-maps');
const M = 20, R = 16; // wall margin and kart radius. Arena size is per map: map.w x map.h (default 900 x 600).
const MATCH = 150;
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
function circleHit(a, b, ra, rb, rest) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d >= ra + rb || d === 0) return false;
  const nx = dx / d, ny = dy / d, ov = ra + rb - d;
  a.x -= nx * ov / 2; a.y -= ny * ov / 2; b.x += nx * ov / 2; b.y += ny * ov / 2;
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv < 0) { const imp = -rv * (1 + rest) / 2; a.vx -= nx * imp; a.vy -= ny * imp; b.vx += nx * imp; b.vy += ny * imp; }
  return true;
}

// ---- weapons ----------------------------------------------------------------
function shoot(g, k, kind, speed, extra, da = 0) {
  const a = k.a + da;
  g.spawn(Object.assign({ kind, x: k.x + Math.cos(a) * 26, y: k.y + Math.sin(a) * 26, vx: Math.cos(a) * speed + k.vx * 0.3, vy: Math.sin(a) * speed + k.vy * 0.3, a, owner: k.id }, extra));
}
const WEAPONS = [
  // w = relative pickup weight (rarer items lower)
  { id: 'green', name: 'Green shell', color: '#3ddc5a', w: 10, fire(g, k) { shoot(g, k, 'shell', 520, { life: 10, bounces: 4, r: 9, dmg: 1, name: 'Green shell' }); } },
  { id: 'triple', name: 'Triple shells', color: '#3ddc5a', w: 5, fire(g, k) { for (const da of [-0.35, 0, 0.35]) shoot(g, k, 'shell', 520, { life: 8, bounces: 3, r: 9, dmg: 1, name: 'Triple shells' }, da); } },
  { id: 'red', name: 'Red shell', color: '#ff4040', w: 8, fire(g, k) { shoot(g, k, 'red', 380, { life: 8, r: 9, dmg: 1, name: 'Red shell' }); } },
  { id: 'blue', name: 'Blue shell', color: '#3b6cff', w: 3, fire(g, k) { shoot(g, k, 'blue', 400, { life: 12, r: 11, name: 'Blue shell' }); } },
  { id: 'tnt', name: 'TNT', color: '#e0442a', w: 7, fire(g, k) { const p = g.behind(k, 34); g.spawn({ kind: 'tnt', x: p.x, y: p.y, owner: k.id, life: 2, name: 'TNT' }); } },
  { id: 'bomb', name: 'Bob-omb', color: '#222', w: 6, fire(g, k) { shoot(g, k, 'bomb', 340, { life: 4, r: 10, fly: 1.0, name: 'Bob-omb' }); } }, // life outlasts the 1 s flight; landing sets the real fuse
  { id: 'pad', name: 'Launch pad', color: '#4da6ff', w: 6, fire(g, k) { g.spawn({ kind: 'pad', x: k.x, y: k.y, owner: k.id, life: 20, name: 'Launch pad' }); k.padCd = 0.8; } },
  { id: 'egg', name: 'Egg gun', color: '#fff3c4', w: 7, fire(g, k) { for (const da of [-0.25, 0, 0.25]) shoot(g, k, 'egg', 480, { life: 2, r: 7, name: 'Egg gun' }, da); } },
  { id: 'banana', name: 'Banana', color: '#ffe135', w: 9, fire(g, k) { const p = g.behind(k, 34); g.spawn({ kind: 'banana', x: p.x, y: p.y, owner: k.id, life: 30, name: 'Banana' }); } },
  { id: 'fake', name: 'Fake item box', color: '#c44dff', w: 5, fire(g, k) { const p = g.behind(k, 36); g.spawn({ kind: 'fake', x: p.x, y: p.y, owner: k.id, life: 40, name: 'Fake box' }); } },
  { id: 'fire', name: 'Fire flower', color: '#ff6a00', w: 6, fire(g, k) { g.spawn({ kind: 'burst', x: k.x, y: k.y, owner: k.id, life: 0.75, shots: 5, cd: 0 }); } },
  { id: 'gun', name: 'Minigun', color: '#c9ccd4', w: 9, fire(g, k) { g.spawn({ kind: 'gunfire', x: k.x, y: k.y, owner: k.id, life: 2.2, shots: 16, cd: 0 }); } },
  { id: 'mush', name: 'Boost mushroom', color: '#ff7a3d', w: 8, fire(g, k) { k.mush = 1.5; } },
  { id: 'star', name: 'Star', color: '#ffd84d', w: 3, fire(g, k) { k.star = 6; k.weaponLock = 0; } },
  { id: 'boo', name: 'Boo ghost', color: '#e8e8ff', w: 4, fire(g, k) {
    k.ghost = 5;
    const victims = [...g.karts.values()].filter((o) => o !== k && !o.dead && !o.away && o.weapon);
    if (victims.length) { const v = victims[Math.floor(Math.random() * victims.length)]; k.stolen = v.weapon; v.weapon = null; g.api.emit('g:event', { type: 'steal', id: k.id, from: v.id, weapon: k.stolen }); }
  } },
  { id: 'bolt', name: 'Lightning', color: '#fff27a', w: 3, fire(g, k) {
    g.api.emit('g:event', { type: 'bolt', id: k.id });
    for (const o of g.karts.values()) { if (o === k || o.dead || o.away || o.star > 0 || o.ghost > 0) continue; o.small = 6; o.spin = Math.max(o.spin, 0.6); if (o.weapon && Math.random() < 0.7) o.weapon = null; }
  } },
  { id: 'bill', name: 'Bullet Bill', color: '#333', w: 3, fire(g, k) { k.bill = 3; k.inv = Math.max(k.inv, 3); g.api.emit('g:event', { type: 'bill', id: k.id }); } },
  // the one item you aim: hold SPACE to charge the throw (the client shows the arc), release to lob it. charge 0..1 sets the distance.
  { id: 'pie', name: 'Cream pie', color: '#fff1d6', w: 7, hold: true, fire(g, k, charge = 1) { const c = clamp(charge, 0, 1), dist = 140 + 460 * c, t = 0.55 + 0.5 * c; shoot(g, k, 'pie', dist / t, { life: t + 1, fly: t, flyT: t, peak: 40 + 45 * c, r: 10, name: 'Cream pie' }); } },
  // Laser: an instant beam straight ahead. Stops at the first wall or deck side; the first kart it meets on your level loses a heart and spins.
  { id: 'laser', name: 'Laser', color: '#ff3df0', w: 8, fire(g, k) {
    const dx = Math.cos(k.a), dy = Math.sin(k.a), x0 = k.x + dx * (R + 4), y0 = k.y + dy * (R + 4); let len = 0, hitK = null;
    for (; len < 950; len += 6) { const x = x0 + dx * len, y = y0 + dy * len; if (x < M || y < M || x > g.W - M || y > g.H - M || g.map.obstacles.some((o) => x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h) || g.surf(x, y) - k.el > 10) break;
      for (const o of g.karts.values()) if (o !== k && !o.dead && !o.away && !o.air && Math.abs(o.el - k.el) < 24 && Math.hypot(o.x - x, o.y - y) < R + 4) { hitK = o; break; } if (hitK) break; }
    g.api.emit('g:event', { type: 'laser', id: k.id, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(x0 + dx * len), y1: Math.round(y0 + dy * len), el: Math.round(k.el) });
    if (hitK) { hitK.spin = Math.max(hitK.spin, 0.5); g.damage(hitK, 1, k.id, 'Laser'); }
  } },
  // Boomerang: thrown ahead, curves round and comes back to you. Hits every kart it passes on the way (once each), out and back.
  { id: 'boomer', name: 'Boomerang', color: '#ff9f1a', w: 8, fire(g, k) { shoot(g, k, 'boomer', 520, { life: 3, r: 12, name: 'Boomerang', hits: [], a0: k.a }); } },
  { id: 'ink', name: 'Blooper', color: '#2b2b6b', w: 5, fire(g, k) { for (const o of g.karts.values()) if (o !== k && !o.dead && !o.away && o.star <= 0) o.ink = 5; g.api.emit('g:event', { type: 'ink', id: k.id }); } },
];
const WEIGHT_SUM = WEAPONS.reduce((a, w) => a + (w.w || 5), 0);
// Items that hit everyone at once are held back for the first 20 seconds, so nobody is inked and shrunk the moment a match starts.
const LATE_ONLY = new Set(['bolt', 'ink', 'blue']);
function randomWeapon(early) { for (let tries = 0; tries < 20; tries++) { let r = Math.random() * WEIGHT_SUM; for (const w of WEAPONS) { r -= w.w || 5; if (r <= 0) { if (early && LATE_ONLY.has(w.id)) break; return w.id; } } } return WEAPONS[0].id; }
function explode(g, x, y, r, dmg, by, name, el) { // el: the height it went off at; karts on a different level are safe
  g.api.emit('g:event', { type: 'boom', x: Math.round(x), y: Math.round(y), r });
  for (const k of [...g.karts.values()]) if (!k.dead && !k.air && (el == null || Math.abs(k.el - el) < 30) && Math.hypot(k.x - x, k.y - y) < r + R) g.damage(k, dmg, by, name);
}

function projHit(e, g) {
  for (const k of g.karts.values()) {
    if (k.dead || k.air || k.ghost > 0) continue;
    const d = Math.hypot(k.x - e.x, k.y - e.y);
    if (k.id === e.owner && !e.cleared) { if (d > (e.r || 8) + R + 6 || e.age > 0.4) e.cleared = true; continue; } // your own shot cannot hit you until it has left your kart; after that a rebound can
    if (d < (e.r || 8) + R && Math.abs(k.el - (e.el || 0)) < 24) { KINDS[e.kind].hit(e, g, k); return false; }
  }
  return true;
}
const KINDS = {
  shell: {
    update(e, g, dt) { e.x += e.vx * dt; e.y += e.vy * dt; if (g.wallHit(e, e.r, 1)) { e.bounces--; if (e.bounces < 0) return false; } return projHit(e, g); },
    hit(e, g, k) { g.damage(k, e.dmg, e.owner, e.name); },
  },
  red: {
    update(e, g, dt) {
      let best = null, bd = 1e9;
      for (const k of g.karts.values()) { if (k.dead || k.away || k.air || k.id === e.owner) continue; const d = Math.hypot(k.x - e.x, k.y - e.y); if (d < bd) { bd = d; best = k; } }
      if (best) { const want = Math.atan2(best.y - e.y, best.x - e.x); let da = ((want - e.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; e.a += clamp(da, -4 * dt, 4 * dt); }
      e.vx = Math.cos(e.a) * 380; e.vy = Math.sin(e.a) * 380; e.x += e.vx * dt; e.y += e.vy * dt;
      if (g.wallHit(e, e.r, 1)) { e.bounces = (e.bounces || 0) + 1; e.a = Math.atan2(e.vy, e.vx); if (e.bounces > 2) return false; }
      return projHit(e, g);
    },
    hit(e, g, k) { g.damage(k, e.dmg, e.owner, e.name); },
  },
  egg: {
    update(e, g, dt) { e.x += e.vx * dt; e.y += e.vy * dt; if (g.wallHit(e, e.r, 1)) return false; return projHit(e, g); },
    hit(e, g, k) { k.egg = 4; g.api.emit('g:event', { type: 'egged', id: k.id, by: e.owner }); },
  },
  tnt: {
    update() { return true; },
    expire(e, g) {
      g.api.emit('g:event', { type: 'boom', x: Math.round(e.x), y: Math.round(e.y), r: 110 });
      for (const k of [...g.karts.values()]) if (!k.dead && !k.air && Math.abs(k.el - (e.el || 0)) < 30 && Math.hypot(k.x - e.x, k.y - e.y) < 110 + R) g.damage(k, 2, e.owner, 'TNT');
    },
  },
  pad: {
    update(e, g) {
      for (const k of g.karts.values()) {
        if (k.dead || k.air || k.padCd > 0) continue;
        if (Math.hypot(k.x - e.x, k.y - e.y) < 28 && Math.abs(k.el - (e.el || 0)) < 24) {
          k.air = 1.2; k.avx = Math.cos(k.a) * 300 / 1.2; k.avy = Math.sin(k.a) * 300 / 1.2; k.vx = k.avx * 0.5; k.vy = k.avy * 0.5; k.launcher = e.owner;
          g.api.emit('g:event', { type: 'launch', id: k.id });
        }
      }
      return true;
    },
  },
  banana: {
    update(e, g) {
      for (const k of g.karts.values()) {
        if (k.dead || k.air) continue;
        if (k.id === e.owner && e.age < 0.6) continue;
        if (Math.hypot(k.x - e.x, k.y - e.y) < 26 && Math.abs(k.el - (e.el || 0)) < 24) { k.spin = 1.2; k.vx = 0; k.vy = 0; g.api.emit('g:event', { type: 'slip', id: k.id }); return false; }
      }
      return true;
    },
  },
  blue: { // flies over walls, hunts the kill leader, big bang on arrival
    update(e, g, dt) {
      if (!e.target || !g.karts.has(e.target) || g.karts.get(e.target).dead) {
        let best = null, bk = -Infinity, bd = 1e9;
        for (const k of g.karts.values()) { if (k.dead || k.away || k.id === e.owner) continue; const d = Math.hypot(k.x - e.x, k.y - e.y); if (k.kills > bk || (k.kills === bk && d < bd)) { bk = k.kills; bd = d; best = k; } }
        e.target = best ? best.id : null;
      }
      const tk = e.target ? g.karts.get(e.target) : null;
      if (tk) { const want = Math.atan2(tk.y - e.y, tk.x - e.x); const da = ((want - e.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; e.a += clamp(da, -3.5 * dt, 3.5 * dt); }
      e.vx = Math.cos(e.a) * 400; e.vy = Math.sin(e.a) * 400; e.x = clamp(e.x + e.vx * dt, M, g.W - M); e.y = clamp(e.y + e.vy * dt, M, g.H - M);
      if (tk && Math.hypot(tk.x - e.x, tk.y - e.y) < 22 && e.age > 0.5) { explode(g, e.x, e.y, 95, 1, e.owner, 'Blue shell'); if (!tk.dead && tk.ghost <= 0) g.damage(tk, 1, e.owner, 'Blue shell'); return false; }
      return true;
    },
    expire(e, g) { explode(g, e.x, e.y, 95, 1, e.owner, 'Blue shell'); },
  },
  bomb: { // lobbed, then sits with a lit fuse, explodes on contact or timeout
    update(e, g, dt) {
      if (e.fly > 0) { e.fly -= dt; e.x += e.vx * dt; e.y += e.vy * dt; e.z = Math.sin(Math.min(1, 1 - e.fly) * Math.PI) * 60; if (g.wallHit(e, e.r, 0.3)) { e.fly = 0; } if (e.fly <= 0) { e.z = 0; e.el = g.surf(e.x, e.y); e.vx = e.vy = 0; e.life = 1.6; }
        if (e.z >= 30) return true; /* high in its arc it sails over karts; low down it can hit one */ }
      for (const k of g.karts.values()) { if (k.dead || k.air || k.ghost > 0) continue; if (k.id === e.owner && e.age < 0.8) continue; if (Math.hypot(k.x - e.x, k.y - e.y) < 24 && Math.abs(k.el - (e.el || 0)) < 24) { explode(g, e.x, e.y, 100, 2, e.owner, 'Bob-omb', e.el); return false; } }
      return true;
    },
    expire(e, g) { if (e.fly <= 0) explode(g, e.x, e.y, 100, 2, e.owner, 'Bob-omb', e.el); },
  },
  boomer: {
    update(e, g, dt) {
      const o = g.karts.get(e.owner), out = e.age < 0.9;
      if (out) { e.a += 1.6 * dt; } else if (o && !o.dead) { const want = Math.atan2(o.y - e.y, o.x - e.x); let da = ((want - e.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; e.a += clamp(da, -5 * dt, 5 * dt); }
      const sp = out ? 520 : 600; e.vx = Math.cos(e.a) * sp; e.vy = Math.sin(e.a) * sp; e.x += e.vx * dt; e.y += e.vy * dt;
      if (g.wallHit(e, e.r, 1)) e.a = Math.atan2(e.vy, e.vx);
      for (const k of g.karts.values()) { if (k.dead || k.away || k.air || k.ghost > 0 || e.hits.includes(k.id)) continue; if (k.id === e.owner) { if (!out && Math.hypot(k.x - e.x, k.y - e.y) < R + 14) return false; continue; } /* caught it */
        if (Math.hypot(k.x - e.x, k.y - e.y) < e.r + R && Math.abs(k.el - (e.el || 0)) < 24) { e.hits.push(k.id); k.spin = Math.max(k.spin, 0.4); g.damage(k, 1, e.owner, 'Boomerang'); } }
      return true;
    },
  },
  pie: { // a lobbed pie: splats on the first kart it meets low in its arc, or where it lands; cream over their screen and a wobble
    update(e, g, dt) {
      const splat = (k) => { if (k.dead || k.star > 0 || k.ghost > 0 || k.bill > 0) return; k.pie = 4; k.spin = Math.max(k.spin, 0.5); g.api.emit('g:event', { type: 'pied', id: k.id, by: e.owner }); };
      if (e.fly > 0) {
        e.fly -= dt; e.x += e.vx * dt; e.y += e.vy * dt; e.z = Math.sin(Math.min(1, 1 - e.fly / e.flyT) * Math.PI) * e.peak;
        if (g.wallHit(e, e.r, 0.3)) e.fly = 0;
        if (e.fly > 0 && e.z < 26) for (const k of g.karts.values()) { if (k.id === e.owner && e.age < 0.5) continue; if (!k.dead && !k.air && Math.hypot(k.x - e.x, k.y - e.y) < 24 && Math.abs(k.el - (e.el || 0)) < 24) { splat(k); g.api.emit('g:event', { type: 'splat', x: Math.round(e.x), y: Math.round(e.y) }); return false; } }
        if (e.fly > 0) return true;
      }
      g.api.emit('g:event', { type: 'splat', x: Math.round(e.x), y: Math.round(e.y) }); e.el = g.surf(e.x, e.y);
      for (const k of [...g.karts.values()]) if (!k.dead && !k.air && Math.abs(k.el - e.el) < 24 && Math.hypot(k.x - e.x, k.y - e.y) < 55 + R) splat(k);
      return false;
    },
  },
  fake: { // looks like an item box; touching it spins you out and eats your weapon
    update(e, g) {
      for (const k of g.karts.values()) {
        if (k.dead || k.air || k.star > 0 || k.ghost > 0) continue;
        if (k.id === e.owner && e.age < 1) continue;
        if (Math.hypot(k.x - e.x, k.y - e.y) < 26 && Math.abs(k.el - (e.el || 0)) < 24) { k.spin = 1.2; k.vx = 0; k.vy = 0; k.weapon = null; g.api.emit('g:event', { type: 'fakebox', id: k.id, x: Math.round(e.x), y: Math.round(e.y) }); return false; }
      }
      return true;
    },
  },
  burst: { // fire flower: follows the owner and spits fireballs
    update(e, g, dt) {
      const k = g.karts.get(e.owner); if (!k || k.dead) return false;
      e.x = k.x; e.y = k.y; e.cd -= dt;
      if (e.cd <= 0 && e.shots > 0) { e.shots--; e.cd = 0.14; shoot(g, k, 'fireball', 470, { life: 3, bounces: 2, r: 7, dmg: 1, name: 'Fire flower' }, (Math.random() - 0.5) * 0.15); }
      return e.shots > 0;
    },
  },
  gunfire: { // minigun: follows the owner and sprays bullets while it lasts
    update(e, g, dt) {
      const k = g.karts.get(e.owner); if (!k || k.dead) return false;
      e.x = k.x; e.y = k.y; e.cd -= dt;
      if (e.cd <= 0 && e.shots > 0 && !k.air) { e.shots--; e.cd = 0.11; shoot(g, k, 'bullet', 760, { life: 0.8, r: 5, dmg: 0.3, name: 'Minigun' }, (Math.random() - 0.5) * 0.09); }
      return e.shots > 0;
    },
  },
  bullet: {
    update(e, g, dt) { e.x += e.vx * dt; e.y += e.vy * dt; if (g.wallHit(e, e.r, 1)) return false; return projHit(e, g); },
    hit(e, g, k) { g.damage(k, e.dmg, e.owner, e.name); },
  },
  fireball: {
    update(e, g, dt) { e.x += e.vx * dt; e.y += e.vy * dt; if (g.wallHit(e, e.r, 1)) { e.bounces--; if (e.bounces < 0) return false; } return projHit(e, g); },
    hit(e, g, k) { g.damage(k, e.dmg, e.owner, e.name); },
  },
};

module.exports = {
  id: 'memekarts',
  name: 'Meme Karts',
  tagline: '3D kart battle on big maps with raised decks, ramps, portals and hazards. 18 items.',
  min: 2, max: 16,
  controls: 'WASD / arrows to drive. Drive through ? boxes. Space or click uses your item. H shows what every item does. Hold C to look behind. M mutes sound.',
  create(api) {
    const map = MAPS.find(m => m.id === api.memory.memekartsMap) || MAPS[0];
    const SPAWNS = map.spawns, BOXES = map.boxes;
    const W = map.w || 900, H = map.h || 600, CX = W / 2, CY = H / 2;
    const hitWall = (o, r, rest) => wallHit(o, r, rest, map.obstacles, W, H);
    const karts = new Map();
    const ents = []; let eid = 0;
    // ---- height: decks and ramps (see public/memekarts-maps.js). `el` is how high a kart or item is standing. ----
    const surf = (x, y) => MAPS.surface(map, x, y), STEP = 10, GRADE = 0.72; // a rise of more than STEP that is steeper than GRADE (rise per unit travelled) is a wall; a drop of more than STEP is a fall. Ramps climb at 0.52 at most.
    const boxes = BOXES.map(([x, y]) => ({ x, y, t: 0, el: surf(x, y) }));
    let elapsed = 0;
    // Keeps a kart on the ground it can reach after it moved from (px, py). Returns true when it ran into a deck or ramp side.
    function terrain(k, px, py, dt, rest) {
      if (surf(px, py) - k.el > STEP) { k.el = surf(k.x, k.y); return false; } // shoved inside a deck by a collision: pop up onto it
      const mx = k.x - px, my = k.y - py, ml = Math.hypot(mx, my) || 1, lx = (mx / ml) * R, ly = (my / ml) * R; /* the kart's front edge, so its nose stops at a ramp side instead of sinking in */
      const wall = (x, y, ox, oy) => { const d = Math.hypot(x - px, y - py), rise = surf(x, y) - k.el, rise2 = surf(x + ox, y + oy) - k.el; return (rise > STEP && rise > d * GRADE) || (rise2 > STEP && rise2 > (d + Math.hypot(ox, oy)) * GRADE); };
      let hit = false;
      if (wall(k.x, k.y, lx, ly)) {
        hit = true;
        if (!wall(k.x, py, lx, 0)) { k.y = py; k.vy = -k.vy * rest; }
        else if (!wall(px, k.y, 0, ly)) { k.x = px; k.vx = -k.vx * rest; }
        else { k.x = px; k.y = py; k.vx = -k.vx * rest; k.vy = -k.vy * rest; }
      }
      const h = surf(k.x, k.y);
      if (k.el - h > STEP) { k.el = Math.max(h, k.el - 300 * dt); if (!k.falling) { k.falling = true; } } // drove off an edge: fall
      else { if (k.falling) { k.falling = false; api.emit('g:event', { type: 'land', x: Math.round(k.x), y: Math.round(k.y), drop: 1 }); } k.el = h; }
      return hit;
    }
    // the same idea for shells and other things that slide along the ground: decks and ramp sides bounce them, edges drop them
    function entWall(o, r, rest) {
      let hit = hitWall(o, r, rest); if (o.fly > 0) return hit;
      const el = o.el || 0, s = surf(o.x, o.y), travel = Math.hypot(o.vx || 0, o.vy || 0) / 30 + r;
      if (s - el > STEP && s - el > travel * GRADE) {
        hit = true; const bx = o.x - Math.sign(o.vx || 0) * (r + 8), by = o.y - Math.sign(o.vy || 0) * (r + 8);
        if (surf(bx, o.y) - el <= STEP) { o.x = bx; o.vx = -(o.vx || 0) * rest; }
        else if (surf(o.x, by) - el <= STEP) { o.y = by; o.vy = -(o.vy || 0) * rest; }
        else { o.x = bx; o.y = by; o.vx = -(o.vx || 0) * rest; o.vy = -(o.vy || 0) * rest; }
      } else o.el = s;
      return hit;
    }
    const zones = map.zones || [], portals = map.portals || [], movers = (map.movers || []).map((m) => ({ def: m, x: m.path[0][0], y: m.path[0][1], len: Math.hypot(m.path[1][0] - m.path[0][0], m.path[1][1] - m.path[0][1]) || 1 }));
    let mapT = 0;
    const fast = api.memory.__fast; let t = fast ? (typeof fast === "number" ? fast : 8) : MATCH, over = false, vi = 0;

    // a random one of the three spawn points farthest from everyone else, so nobody starts in the same corner every match
    function spawnPoint() {
      const ranked = SPAWNS.map((s) => { let d = 1e9; for (const k of karts.values()) if (!k.dead) d = Math.min(d, Math.hypot(k.x - s[0], k.y - s[1])); return { s, d }; }).sort((a, b) => b.d - a.d);
      const pool = ranked.filter((r, i) => (i < 3 && (r.d > 120 || i === 0)) || r.d === ranked[0].d); // all tie when nobody else is in yet: any spot then
      const s0 = pool[Math.floor(Math.random() * pool.length)].s; /* with more karts than spawn points, step out to a free spot near it */
      const freeAt = (x, y) => x > M + R && y > M + R && x < W - M - R && y < H - M - R && surf(x, y) === 0 && !map.obstacles.some((o) => x > o.x - R - 6 && x < o.x + o.w + R + 6 && y > o.y - R - 6 && y < o.y + o.h + R + 6) && [...karts.values()].every((k) => k.dead || Math.hypot(k.x - x, k.y - y) > R * 2 + 14);
      for (const r of [0, 60, 110]) for (let i = 0; i < (r ? 8 : 1); i++) { const a = (i / 8) * Math.PI * 2, x = s0[0] + Math.cos(a) * r, y = s0[1] + Math.sin(a) * r; if (freeAt(x, y)) return [x, y]; }
      return s0;
    }
    function addKart(id) {
      const s = spawnPoint();
      karts.set(id, { id, x: s[0], y: s[1], a: Math.atan2(CY - s[1], CX - s[0]), vx: 0, vy: 0, hp: 3, weapon: null, egg: 0, air: 0, spin: 0, mush: 0, dead: 0, inv: 1.5, padCd: 0, ramCd: 0, kills: 0, deaths: 0, v: vi++ % 8, ctl: {}, el: 0, star: 0, ghost: 0, small: 0, bill: 0, ink: 0, pie: 0, stolen: null, boost: 0, streak: 0, hitCd: 0, tpCd: 0, hazCd: 0 });
    }
    for (const p of api.players()) addKart(p.id);

    const g = {
      api, karts, ents, wallHit: entWall, surf, W, H,
      map,
      spawn(e) { e.age = 0; e.id = ++eid; if (e.life == null) e.life = 10; if (e.el == null) { const o = karts.get(e.owner); e.el = o ? o.el : surf(e.x, e.y); } ents.push(e); },
      behind(k, d) { return { x: k.x - Math.cos(k.a) * d, y: k.y - Math.sin(k.a) * d }; },
      damage(k, amt, by, weapon) {
        if (over || k.dead || k.away || k.pitFall || k.inv > 0 || k.star > 0 || k.bill > 0 || k.ghost > 0) return;
        if (k.egg > 0) { amt = Math.max(2, amt * 2); k.egg = 0; }
        k.hp -= amt;
        if (k.hp <= 0.001) {
          k.hp = 0; k.dead = 3; k.deaths++; k.weapon = null; k.mush = 0; k.spin = 0; k.small = 0; k.ink = 0; k.pie = 0; k.egg = 0; k.boost = 0; k.streak = 0;
          const killer = by && by !== k.id ? karts.get(by) : null;
          if (killer) { killer.kills++; killer.streak++; }
          api.emit('g:event', { type: 'kill', killer: killer ? by : null, victim: k.id, weapon, x: Math.round(k.x), y: Math.round(k.y), streak: killer ? killer.streak : 0 });
        } else if (k.hitCd <= 0) { k.hitCd = 0.25; api.emit('g:event', { type: 'hit', id: k.id, by, x: Math.round(k.x), y: Math.round(k.y) }); }
      },
    };

    const PARTY = 5; let winnerId = null, celebT = 0;
    function finish() {
      if (over) return; over = true;
      const list = [...karts.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      const pts = {}; let rank = 0;
      list.forEach((k, i) => { if (i > 0 && k.kills < list[i - 1].kills) rank = i; pts[k.id] = Math.max(0, k.kills + Math.max(0, list.length - rank)); });
      const top = list[0] && api.player(list[0].id);
      winnerId = list[0] ? list[0].id : null; celebT = PARTY; // victory lap: only the winner can drive, everyone else watches them
      api.emit('g:event', { type: 'over', winner: winnerId, party: PARTY });
      api.after(PARTY * 1000 + 500, () => api.end(pts, top ? `${top.name} topped the board with ${list[0].kills} kills. Points: kills + rank bonus.` : 'Nobody drove.'));
    }

    return {
      onJoin(pid) { if (!karts.has(pid)) addKart(pid); },
      _debugGive(pid, w) { const k = karts.get(pid); if (k && !k.dead) k.weapon = w; }, // test hook: hand a kart a weapon
      onLeave(pid) { karts.delete(pid); if (!over && karts.size < 2) finish(); }, // nobody left to fight: end instead of leaving one kart alone
      onInput(pid, msg) {
        const k = karts.get(pid); if (!k || (over && !(pid === winnerId && celebT > 0 && msg.type === 'ctl'))) return; /* after the end only the winner drives */
        if (k.away && msg.type !== 'away') return;
        if (msg.type === 'ctl') k.ctl = { up: !!msg.up, down: !!msg.down, left: !!msg.left, right: !!msg.right };
        else if (msg.type === 'away') { // stepped away (Esc): parked out of the arena, kills kept, back with a fresh spawn
          const on = !!msg.on; if (on === !!k.away) return; k.away = on; k.ctl = {}; if (on) { k.x = -5000; k.y = -5000; k.air = 0; k.bill = 0; } /* parked far outside, so nothing in the arena can reach them */ if (!on) { const sp = spawnPoint(); Object.assign(k, { x: sp[0], y: sp[1], el: surf(sp[0], sp[1]), vx: 0, vy: 0, air: 0, inv: 2, dead: 0, hp: k.dead ? 3 : k.hp }); } api.emit('g:event', { type: 'away', id: pid, on: on ? 1 : 0 });
        }
        else if (msg.type === 'endnow') { if (api.room && api.room.bots && api.room.bots.size && !over) { k.kills += 3; finish(); } } // test rooms only: end the match now (tools/party.js)
        else if (msg.type === 'tp') { // test rooms only (a room with bots): place your kart somewhere, for screenshots and checks
          if (api.room && api.room.bots && api.room.bots.size && !k.dead && [msg.x, msg.y, msg.a].every(Number.isFinite)) { k.x = clamp(msg.x, M + R, W - M - R); k.y = clamp(msg.y, M + R, H - M - R); k.a = msg.a; k.el = surf(k.x, k.y); k.falling = false; k.vx = k.vy = 0; k.air = 0; k.spin = 0; k.inv = Math.max(k.inv, 4); }
        }
        else if (msg.type === 'give') { // test mode only (room has bots): hand yourself any item
          if (api.room && api.room.bots && api.room.bots.size && !k.dead && WEAPONS.some((w) => w.id === msg.weapon)) k.weapon = msg.weapon;
        }
        else if (msg.type === 'fire') {
          if (k.dead || k.pitFall || k.air || k.spin > 0 || k.egg > 0 || k.bill > 0 || !k.weapon) return;
          const w = WEAPONS.find((w) => w.id === k.weapon); if (!w) { k.weapon = null; return; }
          k.weapon = null; w.fire(g, k, Number.isFinite(msg.charge) ? msg.charge : 1);
          api.emit('g:event', { type: 'fire', id: pid, weapon: w.id });
        }
      },
      tick(dt) {
        if (over && celebT <= 0) return;
        if (over) { celebT -= dt; for (const k of karts.values()) if (k.id !== winnerId) { k.ctl = {}; k.vx = 0; k.vy = 0; } } /* everyone but the winner is frozen for the victory lap */
        else { t -= dt; elapsed += dt; if (t <= 0) { t = 0; finish(); } }
        for (const k of karts.values()) {
          for (const f of ['egg', 'spin', 'mush', 'inv', 'padCd', 'ramCd', 'star', 'small', 'ink', 'pie', 'boost', 'hitCd', 'tpCd', 'hazCd']) if (k[f] > 0) k[f] = Math.max(0, k[f] - dt);
          if (k.ghost > 0) { k.ghost = Math.max(0, k.ghost - dt); if (k.ghost <= 0 && k.stolen) { if (!k.weapon) k.weapon = k.stolen; k.stolen = null; } }
          if (k.away) continue; // stepped away: parked until they come back
          if (k.dead > 0) { k.dead -= dt; if (k.dead <= 0) { const s = spawnPoint(); Object.assign(k, { dead: 0, pitFall: false, pitOut: false, x: s[0], y: s[1], el: surf(s[0],s[1]), falling: false, vx: 0, vy: 0, hp: 3, egg: 0, air: 0, spin: 0, inv: 2, a: Math.atan2(CY - s[1], CX - s[0]) }); } continue; }
          if (k.pitFall) {
            k.el -= 240 * dt;
            if (k.el <= -100) {
              k.kills--; k.deaths++; k.dead=3; k.hp=0; k.pitOut=true;
              k.weapon=null; k.stolen=null;
              for(const f of ['mush','spin','small','ink','pie','egg','boost','streak','star','ghost','bill','air','inv']) k[f]=0;
              api.emit('g:event',{type:'pit',id:k.id,x:Math.round(k.x),y:Math.round(k.y),kills:k.kills});
            }
            continue;
          }
          if (k.air > 0) {
            const ax0 = k.x, ay0 = k.y; k.air -= dt; k.x += k.avx * dt; k.y += k.avy * dt; k.x = clamp(k.x, M + R, W - M - R); k.y = clamp(k.y, M + R, H - M - R);
            { /* a flying kart is solid too: it clears walls (33 high) and decks only while its arc is above them; otherwise it bumps off and drops beside them */
              const arc = k.el + Math.sin((1 - Math.max(0, k.air) / 1.2) * Math.PI) * 75, OBH = 33;
              const inObs = (x, y) => map.obstacles.find((o) => x > o.x - R && x < o.x + o.w + R && y > o.y - R && y < o.y + o.h + R);
              const top = (x, y) => Math.max(surf(x, y), inObs(x, y) ? OBH : 0);
              if (top(k.x, k.y) > arc + 2) {
                k.x = ax0; k.y = ay0; k.avx = 0; k.avy = 0;
                if (top(k.x, k.y) > arc + 2 && !inObs(k.x, k.y)) k.air = 0; /* came down onto the edge of a deck: land on it now rather than sinking into it */
                const o = top(k.x, k.y) > arc + 2 && inObs(k.x, k.y); // already over it and now too low: slide off the nearest side
                if (o) { const opts = [[o.x - R - 1, k.y], [o.x + o.w + R + 1, k.y], [k.x, o.y - R - 1], [k.x, o.y + o.h + R + 1]].filter(([x, y]) => x > M + R && x < W - M - R && y > M + R && y < H - M - R && top(x, y) <= arc + 2); opts.sort((p, q) => Math.hypot(p[0] - k.x, p[1] - k.y) - Math.hypot(q[0] - k.x, q[1] - k.y)); if (opts[0]) { k.x = opts[0][0]; k.y = opts[0][1]; } }
              }
            }
            if (k.air <= 0) {
              k.air = 0; k.padCd = 0.8; k.el = Math.max(0,surf(k.x, k.y)); k.falling = false; // a pit landing begins a fall, not a teleport to its bottom
              for (const o of [...karts.values()]) if (o !== k && !o.dead && !o.air && Math.abs(o.el - k.el) < 30 && Math.hypot(o.x - k.x, o.y - k.y) < 70) g.damage(o, 1, k.id, 'Launch pad');
              api.emit('g:event', { type: 'land', x: Math.round(k.x), y: Math.round(k.y) });
            }
            continue;
          }
          if (k.bill > 0) { // Bullet Bill autopilot: homes on the nearest enemy, bounces off walls, flattens whatever it hits
            k.bill -= dt; if (k.bill <= 0) { k.bill = 0; k.inv = Math.max(k.inv, 0.8); }
            let best = null, bd = 1e9; for (const o of karts.values()) { if (o === k || o.dead || o.ghost > 0) continue; const d = Math.hypot(o.x - k.x, o.y - k.y); if (d < bd) { bd = d; best = o; } }
            if (best) { const want = Math.atan2(best.y - k.y, best.x - k.x); const da = ((want - k.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; k.a += clamp(da, -2.2 * dt, 2.2 * dt); }
            const bx0 = k.x, by0 = k.y; k.vx = Math.cos(k.a) * 520; k.vy = Math.sin(k.a) * 520; k.x += k.vx * dt; k.y += k.vy * dt;
            if (hitWall(k, R, 1) | terrain(k, bx0, by0, dt, 1)) k.a = Math.atan2(k.vy, k.vx);
            for (const o of karts.values()) if (o !== k && !o.dead && !o.air && o.ramCd <= 0 && Math.abs(o.el - k.el) < 22 && Math.hypot(o.x - k.x, o.y - k.y) < R * 2 + 4) { o.ramCd = 0.8; g.damage(o, 2, k.id, 'Bullet Bill'); }
            continue;
          }
          if (k.spin > 0) k.a += 10 * dt;
          k.mud = k.el < 6 && zones.some((z) => k.x > z.x && k.x < z.x + z.w && k.y > z.y && k.y < z.y + z.h); // quicksand / mud zones
          const spd = (k.egg > 0 ? 0.5 : 1) * (k.mush > 0 ? 1.8 : k.boost > 0 ? 1.55 : 1) * (k.star > 0 ? 1.35 : 1) * (k.small > 0 ? 0.65 : 1) * (k.ink > 0 ? 0.92 : 1) * (k.mud ? (k.star > 0 || k.mush > 0 ? 0.8 : 0.5) : 1);
          const px = k.x, py = k.y;
          stepCar(k, dt, { maxF: 300 * spd, maxR: 150, accel: 420 * (k.mush > 0 || k.star > 0 || k.boost > 0 ? 1.8 : 1), turn: 3.2 });
          hitWall(k, R, 0.4); terrain(k, px, py, dt, 0.3);
        }
        for(const k of karts.values()) if(!k.dead&&!k.air&&!k.pitFall&&k.el<=0&&MAPS.isPit(map,k.x,k.y)) {
          k.pitFall=true; k.vx=k.vy=0; k.inv=0;
        }
        const live = [...karts.values()].filter((k) => !k.dead && !k.away && !k.pitFall && !k.air && !k.ghost && !k.bill);
        for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
          const a = live[i], b = live[j];
          if (Math.abs(a.el - b.el) < 22 && circleHit(a, b, R, R, 0.5)) { // karts on different levels pass over each other
            if (a.star > 0 && b.ramCd <= 0) { b.ramCd = 0.8; g.damage(b, 3, a.id, 'Star'); }
            else if (a.mush > 0 && b.ramCd <= 0) { b.ramCd = 0.6; g.damage(b, 1, a.id, 'Boost mushroom'); }
            if (b.star > 0 && a.ramCd <= 0) { a.ramCd = 0.8; g.damage(a, 3, b.id, 'Star'); }
            else if (b.mush > 0 && a.ramCd <= 0) { a.ramCd = 0.6; g.damage(a, 1, b.id, 'Boost mushroom'); }
          }
        }
        // warp portals: drive into one end, come out of the other with your speed and heading intact
        for (const pair of portals) for (const k of live) {
          if (k.tpCd > 0 || k.el > 12) continue;
          for (let e = 0; e < 2; e++) {
            const a = pair[e], b = pair[1 - e];
            if (Math.hypot(k.x - a.x, k.y - a.y) < 24) { k.x = b.x; k.y = b.y; k.tpCd = 1.2; api.emit('g:event', { type: 'warp', id: k.id, x: a.x, y: a.y, tx: b.x, ty: b.y }); break; }
          }
        }
        // moving hazards (boulders): roll back and forth along their path; contact hurts and shoves you away
        mapT += dt;
        for (const m of movers) {
          const d = (mapT * m.def.speed) % (m.len * 2), u = (d <= m.len ? d : m.len * 2 - d) / m.len;
          m.x = m.def.path[0][0] + (m.def.path[1][0] - m.def.path[0][0]) * u; m.y = m.def.path[0][1] + (m.def.path[1][1] - m.def.path[0][1]) * u;
          for (const k of live) {
            const dx = k.x - m.x, dy = k.y - m.y, dist = Math.hypot(dx, dy) || 1;
            if (dist > m.def.r + R || k.hazCd > 0 || k.el > 20) continue;
            k.hazCd = 1;
            if (k.inv > 0 || k.star > 0) continue; // fresh spawns and star karts shrug it off
            k.vx = (dx / dist) * 320; k.vy = (dy / dist) * 320; k.spin = Math.max(k.spin, 0.5);
            api.emit('g:event', { type: 'bonk', id: k.id, kind: m.def.kind, x: Math.round(m.x), y: Math.round(m.y) });
            g.damage(k, 1, null, m.def.kind === 'drone' ? 'Drone' : 'Boulder');
          }
        }
        for (const pd of (map.pads || [])) for (const k of live) { // optional per-map floor pads: { x, y, kind: 'boost' | 'jump' }
          if (k.el > 12 || Math.hypot(k.x - pd.x, k.y - pd.y) > 30) continue;
          if (pd.kind === 'boost') { if (k.boost < 0.6) api.emit('g:event', { type: 'boostpad', id: k.id }); k.boost = 1.1; }
          else if (k.padCd <= 0 && Math.hypot(k.vx, k.vy) > 60) { k.air = 1.2; k.avx = Math.cos(k.a) * 300 / 1.2; k.avy = Math.sin(k.a) * 300 / 1.2; k.vx = k.avx * 0.5; k.vy = k.avy * 0.5; k.launcher = k.id; api.emit('g:event', { type: 'launch', id: k.id }); }
        }
        for (const bx of boxes) {
          if (bx.t > 0) { bx.t -= dt; continue; }
          for (const k of live) if (!k.weapon && Math.abs(k.el - bx.el) < 14 && Math.hypot(k.x - bx.x, k.y - bx.y) < 28) { k.weapon = randomWeapon(elapsed < 20); bx.t = 8; api.emit('g:event', { type: 'pickup', id: k.id, weapon: k.weapon }); break; }
        }
        for (let i = ents.length - 1; i >= 0; i--) {
          const e = ents[i]; e.age += dt; e.life -= dt;
          const kind = KINDS[e.kind];
          let keep = true;
          if (e.life <= 0) { if (kind && kind.expire) kind.expire(e, g); keep = false; }
          else if (kind && kind.update) keep = kind.update(e, g, dt) !== false;
          if (keep && !(e.fly > 0) && e.kind !== 'blue' && MAPS.isPit(map,e.x,e.y)) keep=false;
          if (!keep) ents.splice(i, 1);
        }
        api.emit('g:state', snap());
      },
      destroy() {},
      __state() { return { karts, ents, damage: g.damage }; }, // for tools/kart-items-check.js only
    };
    function snap() {
      return {
        t: Math.ceil(t),
        mapId: map.id,
        haz: movers.length ? movers.map((m) => [Math.round(m.x), Math.round(m.y)]) : undefined, // live positions of the map's moving hazards
        karts: [...karts.values()].map((k) => ({ id: k.id, x: Math.round(k.x), y: Math.round(k.y), el: Math.round(k.el), a: +k.a.toFixed(2), hp: +Math.max(0, k.hp).toFixed(2), bst: k.boost > 0 ? 1 : 0, streak: k.streak, weapon: k.weapon, egg: +k.egg.toFixed(1), air: +k.air.toFixed(2), spin: k.spin > 0 ? 1 : 0, mush: k.mush > 0 ? 1 : 0, inv: k.inv > 0 ? 1 : 0, mud: k.mud ? 1 : 0, dead: k.dead > 0 ? 1 : 0, pit: k.pitFall ? 1 : 0, kills: k.kills, v: k.v, star: k.star > 0 ? 1 : 0, ghost: k.ghost > 0 ? 1 : 0, small: k.small > 0 ? 1 : 0, bill: k.bill > 0 ? 1 : 0, ink: +k.ink.toFixed(1), pie: +(k.pie || 0).toFixed(1), aw: k.away ? 1 : undefined })), win: over ? winnerId : undefined,
        ents: ents.filter((e) => e.kind !== 'burst' && e.kind !== 'gunfire').map((e) => ({ id: e.id, k: e.kind, x: Math.round(e.x), y: Math.round(e.y), el: Math.round(e.el || 0), z: Math.round(e.z || 0), a: +(e.a || 0).toFixed(2), o: e.owner, f: +e.life.toFixed(1) })),
        boxes: boxes.map((b) => (b.t > 0 ? 0 : 1)),
      };
    }
  },
};
module.exports.WEAPONS = WEAPONS;
module.exports.OBST = MAPS[0].obstacles;
