// Test-mode bots: lets one person try every game alone. Each game has a small "brain" that reads the latest
// state snapshot and returns the same input messages a real client would send. Bots are deliberately mediocre.
//
// ADDING A BRAIN: BRAINS[gameId] = (b, s, c) => [msgs]
//   b = { id, mem }   mem is a scratch object reset at each game start
//   s = latest g:state snapshot this bot would have received (may be null early on)
//   c = { ids (all player ids), others (ids except this bot), dt (seconds since last think), game (server instance) }
const WORDS = require('./data/words');
const KMAPS = require('../public/memekarts-maps');
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const find = (list, id) => (list || []).find((p) => p.id === id);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const nearest = (list, me, ok = () => true) => { let best = null, bd = 1e9; for (const p of list || []) { if (p.id === me.id || !ok(p)) continue; const d = dist(p, me); if (d < bd) { bd = d; best = p; } } return best; };
const norm = (dx, dy) => { const d = Math.hypot(dx, dy) || 1; return { dx: dx / d, dy: dy / d }; };
const angDiff = (a, b) => ((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
// every(b, 'key', seconds, dt) -> true once per interval (with jitter chosen by the caller)
function every(b, key, secs, dt) { b.mem[key] = (b.mem[key] ?? secs * Math.random()) - dt; if (b.mem[key] <= 0) { b.mem[key] = secs; return true; } return false; }
function wander(b, dt, lo = 0.5, hi = 1.6) { b.mem.wt = (b.mem.wt || 0) - dt; if (b.mem.wt <= 0 || !b.mem.wd) { const a = Math.random() * Math.PI * 2; b.mem.wd = { dx: Math.cos(a), dy: Math.sin(a) }; b.mem.wt = rnd(lo, hi); } return b.mem.wd; }
const move = (d) => ({ type: 'move', dx: +d.dx.toFixed(2), dy: +d.dy.toFixed(2) });
// chase or flee with a little wobble so bots don't move in perfect lines
function seek(b, me, target, dt, flee) { if (!target) return wander(b, dt); const d = norm(target.x - me.x, target.y - me.y), w = wander(b, dt), s = flee ? -1 : 1; return norm(d.dx * s + w.dx * 0.45, d.dy * s + w.dy * 0.45); }
// car steering shared by Meme Karts and Rocket Soccer, with a "reverse when stuck" fallback
function drive(b, me, tx, ty, dt, extra = {}) {
  const m = b.mem; m.px ??= me.x; m.py ??= me.y; m.stuck = (m.stuck || 0) + dt;
  if (Math.hypot(me.x - m.px, me.y - m.py) > 14) { m.px = me.x; m.py = me.y; m.stuck = 0; }
  if (m.stuck > 1.1) { m.rev = 0.7; m.stuck = 0; m.revDir = Math.random() < 0.5; }
  if (m.rev > 0) { m.rev -= dt; return Object.assign({ type: 'ctl', up: false, down: true, left: m.revDir, right: !m.revDir }, extra); }
  const d = angDiff(me.a, Math.atan2(ty - me.y, tx - me.x));
  return Object.assign({ type: 'ctl', up: Math.abs(d) < 2.2, down: false, left: d < -0.12, right: d > 0.12 }, extra);
}
const squiggle = () => { const n = 26, k = pick([1, 2, 3]), r = rnd(0.12, 0.25), cx = rnd(0.4, 0.6), cy = rnd(0.4, 0.6); return Array.from({ length: n }, (_, i) => { const t = (i / (n - 1)) * Math.PI * 2; return [cx + Math.cos(t) * r * (1 + 0.3 * Math.sin(t * k)), cy + Math.sin(t) * r * (1 + 0.3 * Math.cos(t * k))]; }); };

// ---- grid pathfinding for Meme Karts maps (cached per map) -------------------------------------------------
const NAV = new Map(), CELL = 40;
function navGrid(map) {
  let g = NAV.get(map.id); if (g) return g;
  const W = map.w || 900, H = map.h || 600, cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL), blocked = new Uint8Array(cols * rows), pad = 20;
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    const x = cx * CELL + CELL / 2, y = cy * CELL + CELL / 2;
    if (x < 20 + pad || x > W - 20 - pad || y < 20 + pad || y > H - 20 - pad || map.obstacles.some((o) => x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad)
      || [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]].some(([ox, oy]) => KMAPS.surface(map, x + ox, y + oy) !== 0)) blocked[cy * cols + cx] = 1; // ground routes avoid decks, ramps and pits
  }
  g = { cols, rows, blocked, prev: new Int32Array(cols * rows) }; NAV.set(map.id, g); return g;
}
// Returns a point a couple of cells along the shortest path from `from` to `to` (or `to` itself when it is close / unreachable).
function route(map, from, to) {
  const g = navGrid(map), { cols, rows, blocked, prev } = g;
  const cell = (p) => { let cx = Math.max(0, Math.min(cols - 1, Math.floor(p.x / CELL))), cy = Math.max(0, Math.min(rows - 1, Math.floor(p.y / CELL))); if (blocked[cy * cols + cx]) { let best = -1, bd = 1e9; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || blocked[ny * cols + nx]) continue; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = ny * cols + nx; } } return best; } return cy * cols + cx; };
  const a = cell(from), z = cell(to); if (a < 0 || z < 0 || a === z) return to;
  prev.fill(-1); prev[z] = z; const q = [z]; // search backwards from the target so the first step out of `a` is simply prev[a]
  for (let i = 0; i < q.length && prev[a] === -1; i++) { const cur = q[i], cx = cur % cols, cy = (cur / cols) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue; const n = ny * cols + nx; if (blocked[n] || prev[n] !== -1) continue; prev[n] = cur; q.push(n); } }
  if (prev[a] === -1) return to;
  let step = prev[a]; if (prev[step] !== step) step = prev[step]; // look two cells ahead for smoother steering
  if (step === z) return to;
  return { x: (step % cols) * CELL + CELL / 2, y: ((step / cols) | 0) * CELL + CELL / 2 };
}

// ---- Toy Box Blasters: bots simulate their own body with the shared physics, exactly like a browser does -----
const BL = require('../public/games/blasters.shared.js');
const BLNAV = {}; // one grid per map
function blNav(map) { // 1 m grid of cells a standing body can occupy at ground level (bots stay on the ground floor)
  if (BLNAV[map.id]) return BLNAV[map.id];
  const n = map.size * 2, blocked = new Uint8Array(n * n);
  for (let cz = 0; cz < n; cz++) for (let cx = 0; cx < n; cx++) if (BL.overlap(cx - map.size + 0.5, 0.01, cz - map.size + 0.5, map) || BL.rampAt(cx - map.size + 0.5, cz - map.size + 0.5, map) > 0.45) blocked[cz * n + cx] = 1;
  return (BLNAV[map.id] = { n, blocked, prev: new Int32Array(n * n) });
}
function blRoute(from, to, map) {
  const { n, blocked, prev } = blNav(map), S = map.size;
  const cell = (x, z) => { let cx = Math.max(0, Math.min(n - 1, Math.floor(x + S))), cz = Math.max(0, Math.min(n - 1, Math.floor(z + S))); if (!blocked[cz * n + cx]) return cz * n + cx; let best = -1, bd = 1e9; for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= n || nz >= n || blocked[nz * n + nx]) continue; const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = nz * n + nx; } } return best; };
  const a = cell(from.x, from.z), z = cell(to.x, to.z); if (a < 0 || z < 0 || a === z) return to;
  prev.fill(-1); prev[z] = z; const q = [z];
  for (let i = 0; i < q.length && prev[a] === -1; i++) { const cur = q[i], cx = cur % n, cz = (cur / n) | 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue; const k = nz * n + nx; if (blocked[k] || prev[k] !== -1) continue; prev[k] = cur; q.push(k); } }
  if (prev[a] === -1) return to;
  let step = prev[a]; if (prev[step] !== step) step = prev[step];
  return step === z ? to : { x: (step % n) - S + 0.5, z: ((step / n) | 0) - S + 0.5 };
}
const BL_AIM = [0.32, 0.46, 0.26, 0.34, 1, 0.3, 1, 0.38, 1]; // eased: bots land about a quarter fewer darts than before // per weapon; the Splash Lobber (6) is never chosen by bots // chance a bot's shot connects at point-blank, per weapon

const BRAINS = {
  blasters(b, s, c) {
    const me = find(s.ps, b.id); if (!me) return [];
    const m = b.mem, out = [], P = BL.P;
    if (!m.hello) { m.hello = 1; out.push({ type: 'hello', lvl: 1 + Math.floor(Math.random() * 9), ch: Math.floor(Math.random() * 8), sk: pick([0, 0, 1, 4]), lo: pick([0, 0, 1, 2]) }); /* bots only wear skins that keep their own colour (Classic, Pastel, Neon) */ }
    if (me.dead) { m.body = null; return out; }
    if (!m.body || Math.hypot(m.body.x - me.x, m.body.z - me.z) > 6) { m.body = BL.newBody(me.x, me.y, me.z); m.yaw = me.yw; m.pitch = 0; m.strafe = 1; m.strafeT = 0; m.see = 0; m.fireCd = 0.6; m.goal = null; m.goalT = 0; }
    const body = m.body, ex = body.x, ey = body.y + P.EYE, ez = body.z, MAP = BL.mapById(s.map) || BL.MAP; // the room's map comes with every snapshot
    // nearest enemy this bot can actually see
    let tgt = null, td = 1e9;
    for (const o of s.ps) { if (o.id === b.id || o.dead || o.aw || (s.tm && o.tm === me.tm)) continue; const d = Math.hypot(o.x - body.x, o.y - body.y, o.z - body.z); if (d > 55 || d >= td || (o.pw === 'ghost' && d > 9) || o.pw === 'shadow') continue; if (BL.los(ex, ey, ez, o.x, o.y + 1.2, o.z, MAP)) { tgt = o; td = d; } }
    // 'noticing' takes 0.7 s of looking at the SAME enemy; a one-tick flicker behind a pillar only dents it, a new enemy starts it over
    if (tgt) { if (m.seeId !== tgt.id) { m.see = 0; m.seeId = tgt.id; } m.see += c.dt; m.last = { x: tgt.x, z: tgt.z, t: 6 }; } else { m.see = Math.max(0, m.see - 2 * c.dt); if (m.last && (m.last.t -= c.dt) <= 0) m.last = null; }
    // where to go
    const ground = (i) => s.pk[i] && MAP.pickups[i].y < 0.5;
    const nearestPickup = (ok) => { let best = null, bd = 1e9; MAP.pickups.forEach((pk, i) => { if (!ground(i) || !ok(pk)) return; const d = Math.hypot(pk.x - body.x, pk.z - body.z); if (d < bd) { bd = d; best = pk; } }); return best; };
    let goal = null;
    if (me.hp < 45) goal = nearestPickup((pk) => pk.kind === 'health' || pk.kind === 'mega');
    if (!goal && me.own === 1) goal = (s.dr || []).find((d) => d.y < 0.5 && Math.hypot(d.x - body.x, d.z - body.z) < 18) || nearestPickup((pk) => pk.kind === 'weapon');
    if (!goal && tgt) goal = { x: tgt.x, z: tgt.z };
    if (!goal && m.last) goal = m.last;
    if (!goal) { m.goalT -= c.dt; if (!m.goal || m.goalT <= 0 || Math.hypot(m.goal.x - body.x, m.goal.z - body.z) < 2) { const sp = pick(MAP.spawns.concat(MAP.pickups.filter((pk) => pk.y < 0.5))); m.goal = { x: sp.x, z: sp.z }; m.goalT = 9; } goal = m.goal; }
    const wp = blRoute(body, goal, MAP); let mx = wp.x - body.x, mz = wp.z - body.z; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const wdef = BL.WEAPONS[me.w], pref = me.w === 1 ? 5 : me.w === 3 ? 22 : 11;
    if (tgt && td < pref + 4) { // fight: circle-strafe at the weapon's preferred range
      m.strafeT -= c.dt; if (m.strafeT <= 0) { m.strafe = Math.random() < 0.5 ? 1 : -1; m.strafeT = rnd(0.5, 1.4); }
      const tx = (tgt.x - body.x) / (td || 1), tz = (tgt.z - body.z) / (td || 1), back = td < pref - 3 ? -0.7 : td > pref ? 0.5 : 0;
      mx = -tz * m.strafe + tx * back; mz = tx * m.strafe + tz * back; const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l;
    }
    // look
    if (tgt) { const want = Math.atan2(-(tgt.x - body.x), -(tgt.z - body.z)); m.yaw += angDiff(m.yaw, want) * 0.65; m.pitch = Math.atan2(tgt.y + 1.1 - ey, Math.hypot(tgt.x - body.x, tgt.z - body.z)); }
    else { m.yaw += angDiff(m.yaw, Math.atan2(-mx, -mz)) * 0.4; m.pitch *= 0.6; }
    // move with the same physics a player uses
    const sin = Math.sin(m.yaw), cos = Math.cos(m.yaw), f = mx * -sin + mz * -cos, st = mx * cos + mz * -sin;
    const jump = (tgt && Math.random() < 0.05) || (Math.hypot(body.vx, body.vz) < 0.6 && Math.random() < 0.25);
    body.grav = me.pw === 'moon' ? 0.33 : 1;
    for (let i = 0; i < 6; i++) BL.stepPlayer(body, { f, s: st, yaw: m.yaw, jump: i === 0 && jump, dash: i === 0 && tgt && Math.random() < 0.03 }, c.dt / 6, me.pw === 'speed' ? 1.45 : 1, MAP);
    // bots bonk you with the foam sword when you get in their face, and sometimes crouch while shooting
    if (tgt && td < BL.MELEE.range && Math.abs(tgt.y - body.y) < 1.2 && every(b, 'sword', BL.MELEE.cd + 1.2, c.dt)) out.push({ type: 'melee', hits: [tgt.id] });
    if (every(b, 'crouchFlip', 2.5, c.dt)) m.cr = tgt && td > 10 && Math.random() < 0.35 ? 1 : 0;
    out.push({ type: 'p', x: +body.x.toFixed(2), y: +body.y.toFixed(2), z: +body.z.toFixed(2), yaw: +m.yaw.toFixed(2), pitch: +m.pitch.toFixed(2), cr: m.cr || 0 });
    // weapon choice, reload, fire
    const has = (w) => (me.own >> w) & 1;
    const want = tgt ? (td < 9 && has(1) ? 1 : td > 7 && td < 30 && has(8) ? 8 : td > 6 && has(4) ? 4 : td > 18 && has(3) ? 3 : td < 20 && has(7) ? 7 : has(5) ? 5 : has(2) ? 2 : has(1) && td < 14 ? 1 : 0) : (me.w === 6 ? 0 : me.w);
    if (want !== me.w && (!m.swT || m.swT <= 0)) { out.push({ type: 'switch', w: want }); m.swT = 1.2; m.fireCd = Math.max(m.fireCd, 0.45); return out; }
    if (m.swT > 0) m.swT -= c.dt;
    if (me.m === 0 && !me.rl) { if (me.r !== 0) out.push({ type: 'reload' }); else if (me.w !== 0) out.push({ type: 'switch', w: 0 }); return out; }
    m.fireCd -= c.dt;
    if (tgt && m.see > 0.7 && m.fireCd <= 0 && !me.rl && me.m > 0) { // bots take 0.7 s to notice you and pause a little longer between shots
      m.fireCd = Math.max(1 / wdef.rate, wdef.auto ? 0.3 : 0.6) + rnd(0.05, 0.4);
      const d = [tgt.x - ex, (wdef.projectile ? tgt.y + 0.2 : tgt.y + 1.1) - ey, tgt.z - ez], dl = Math.hypot(d[0], d[1], d[2]) || 1, dir = d.map((v) => v / dl);
      const msg = { type: 'fire', w: me.w, o: [+ex.toFixed(2), +ey.toFixed(2), +ez.toFixed(2)], d: dir.map((v) => +v.toFixed(3)), hits: [] };
      if (wdef.projectile) { const e = 0.07; msg.d = [dir[0] + rnd(-e, e), dir[1] + rnd(-e, e), dir[2] + rnd(-e, e)]; }
      else {
        const chance = BL_AIM[me.w] * Math.max(0.22, Math.min(1, 1.15 - td / 40)); // and they miss more at range
        if (Math.random() < chance) { const n = wdef.pellets > 1 ? Math.max(1, Math.round(wdef.pellets * Math.max(0.2, 1 - td / 16) * rnd(0.5, 1))) : 1; msg.hits.push({ id: tgt.id, n, h: Math.random() < 0.08 ? 1 : 0 }); msg.e = [tgt.x, tgt.y + 1.1, tgt.z]; }
        else { const miss = BL.rayMap(ex, ey, ez, dir[0], dir[1], dir[2], 80, MAP); const tt = miss === Infinity ? 80 : miss; msg.e = [ex + dir[0] * tt + rnd(-1, 1), ey + dir[1] * tt + rnd(0, 1.5), ez + dir[2] * tt + rnd(-1, 1)]; }
      }
      out.push(msg);
    }
    return out;
  },
  sumo(b, s) {
    const me = find(s.blobs, b.id); if (!me || !me.alive || s.countdown > 0 || me.cd > 0 || Math.random() < 0.6) return [];
    const far = Math.hypot(me.x - 450, me.y - 300) > s.arena * 0.62, t = nearest(s.blobs, me, (p) => p.alive);
    return [far || !t ? { type: 'dash', x: 450 + rnd(-30, 30), y: 300 + rnd(-30, 30) } : { type: 'dash', x: t.x, y: t.y }];
  },
  memekarts(b, s, c) {
    const me = find(s.karts, b.id); if (!me || me.dead) return [];
    const map = KMAPS.find((m) => m.id === s.mapId) || KMAPS[0];
    let t = nearest(s.karts, me, (k) => !k.dead && !k.aw && !k.ghost && !(k.el > 12));
    if (!me.weapon) { let bd = t ? dist(t, me) * 1.4 : 1e9; map.boxes.forEach(([x, y], i) => { if (!s.boxes[i] || KMAPS.surface(map, x, y) > 0) return; const d = Math.hypot(x - me.x, y - me.y); if (d < bd) { bd = d; t = { x, y }; } }); }
    if (!t) t = { x: (map.w || 900) / 2, y: (map.h || 600) / 2 };
    const wp = route(map, me, t); // steer along a path around the walls instead of straight at the target
    const out = [drive(b, me, wp.x, wp.y, c.dt)];
    if (me.weapon && Math.random() < 0.1) out.push({ type: 'fire' });
    return out;
  },
  rocketsoccer(b, s, c) {
    const me = find(s.cars, b.id); if (!me || me.dead || !s.ball) return [];
    const side = me.team === 'blue' ? -1 : 1; // blue attacks right: get behind the ball on its left
    const behind = (me.x - s.ball.x) * side > 0, tx = s.ball.x + (behind ? side * 6 : side * 70), ty = s.ball.y + (behind ? 0 : (me.y < s.ball.y ? -40 : 40));
    return [drive(b, me, tx, ty, c.dt, { boost: behind && Math.hypot(me.x - s.ball.x, me.y - s.ball.y) > 120 && Math.random() < 0.7 })];
  },
  eggboss(b, s, c) {
    const me = find(s.ents, b.id), boss = find(s.ents, s.bossId); if (!me || !boss || s.countdown > 0) return [];
    if (me.id === s.bossId) { const t = nearest(s.ents, me); const out = [move(seek(b, me, t, c.dt))]; if (t && dist(t, me) < 135 && Math.random() < 0.5) out.push({ type: 'attack' }); return out; }
    const d = dist(me, boss), out = [move(seek(b, me, boss, c.dt, d < 70 || (b.mem.back || 0) > 0))];
    b.mem.back = Math.max(0, (b.mem.back || 0) - c.dt);
    if (d < 92 && Math.random() < 0.7) { out.push({ type: 'attack' }); if (Math.random() < 0.25) b.mem.back = rnd(0.4, 1.2); }
    return out;
  },
  dodgeboss(b, s, c) {
    const me = find(s.players, b.id); if (!me || !me.alive) return [];
    const w = wander(b, c.dt, 0.4, 1.1), center = norm(450 - me.x, 300 - me.y), edge = Math.max(Math.abs(me.x - 450) / 430, Math.abs(me.y - 300) / 280);
    return [move(norm(w.dx + center.dx * edge * 1.2, w.dy + center.dy * edge * 1.2))];
  },
  powertag(b, s, c) {
    const me = find(s.players, b.id); if (!me || s.countdown > 0) return [];
    const it = find(s.players, s.itId), amIt = s.itId === b.id, t = amIt ? nearest(s.players, me, (p) => !p.immune) : it;
    const out = [move(seek(b, me, t, c.dt, !amIt && t && dist(t, me) < 260))];
    if (me.cd <= 0 && Math.random() < 0.06) { const d = seek(b, me, t, 0, !amIt); out.push({ type: 'power', x: me.x + d.dx * 200, y: me.y + d.dy * 200 }); }
    return out;
  },
  shadowtag(b, s, c) {
    const me = find(s.players, b.id); if (!me || s.countdown > 0) return [];
    const amIt = s.tagger === b.id, it = find(s.players, s.tagger), t = amIt ? nearest(s.players, me, (p) => !p.immune) : it;
    const d = seek(b, me, t, c.dt, !amIt && t && dist(t, me) < 240), out = [move(d), { type: 'aim', a: +Math.atan2(d.dy, d.dx).toFixed(2) }];
    if (Math.random() < 0.01) out.push({ type: 'light' });
    return out;
  },
  prophunt(b, s, c) {
    const you = s.you; if (!you || !you.alive) return [];
    if (!you.seeker) {
      const out = []; if (!b.mem.picked) { b.mem.picked = 1; out.push({ type: 'pick', kind: pick(['dirt', 'console', 'pizza', 'duck', 'cone', 'box', 'plant', 'trash']) }); }
      const moving = s.phase === 'hide' ? s.timeLeft > 8 : Math.random() < 0.02 || (b.mem.run || 0) > 0;
      if (s.phase === 'hunt' && Math.random() < 0.02) b.mem.run = rnd(0.3, 1); b.mem.run = Math.max(0, (b.mem.run || 0) - c.dt);
      out.push(moving ? move(wander(b, c.dt)) : { type: 'move', dx: 0, dy: 0 });
      if (s.phase === 'hunt' && Math.random() < 0.01) out.push({ type: 'taunt' });
      return out;
    }
    const out = [move(wander(b, c.dt, 0.8, 2))];
    if (s.phase === 'hunt' && s.props && s.props.length && every(b, 'shot', rnd(1.2, 2.6), c.dt)) { const near = s.props.filter((p) => Math.hypot(p.x - you.x, p.y - you.y) < 260); const p = pick(near.length ? near : s.props); out.push({ type: 'aim', a: +Math.atan2(p.y - you.y, p.x - you.x).toFixed(2) }, { type: 'shoot' }); }
    return out;
  },
  brawl(b, s, c) {
    if (s.phase === 'select') { if (!b.mem.picked) { b.mem.picked = 1; return [{ type: 'pick', char: pick(['steve', 'plumber', 'dancer', 'egg', 'ogre', 'crew', 'cart', 'portal']) }]; } return []; }
    const me = find(s.fighters, b.id); if (!me || !me.alive || me.dead) return [];
    const t = nearest(s.fighters, me, (f) => f.alive && !f.dead), off = me.x < 170 || me.x > 730 || me.y > 480;
    const tx = off || !t ? 450 : t.x, dx = tx - me.x, close = t && Math.abs(t.x - me.x) < 52 && Math.abs(t.y - me.y) < 46;
    b.mem.tog = !b.mem.tog; // alternate so the server sees fresh press edges
    return [{ type: 'ctl', left: dx < -18, right: dx > 18, jump: b.mem.tog && (off || (t && t.y < me.y - 40) || Math.random() < 0.06), down: false, attack: !!close && b.mem.tog, special: b.mem.tog && Math.random() < 0.07 }];
  },
  buildbreak(b, s, c) {
    const me = find(s.lanes, b.id); if (!me) return [];
    if (s.phase === 'build') { const out = []; b.mem.x = Math.max(110, Math.min(290, (b.mem.x ?? 200) + rnd(-18, 18))); out.push({ type: 'x', x: Math.round(b.mem.x) }); if (Math.random() < 0.04) out.push({ type: 'rot', dir: 1 }); if (every(b, 'drop', rnd(1.2, 2), c.dt)) out.push({ type: 'drop' }); return out; }
    if (s.phase === 'break' && !me.fired) { b.mem.wait = (b.mem.wait ?? rnd(2, 9)) - c.dt; if (b.mem.wait <= 0) return [{ type: 'fire', target: pick(c.others), vx: rnd(16, 30), vy: rnd(-6, 6) }]; }
    return [];
  },
  liarsmap(b, s, c) {
    if (s.phase === 'race') { if (every(b, 'turn', rnd(0.25, 0.7), c.dt)) return [{ type: 'dir', d: pick(['E', 'S', 'E', 'S', 'N', 'W']) }]; return []; }
    if (s.phase === 'vote' && !b.mem.voted) { b.mem.wait = (b.mem.wait ?? rnd(1, 6)) - c.dt; if (b.mem.wait <= 0) { b.mem.voted = 1; return [{ type: 'vote', to: pick(c.others) }]; } }
    return [];
  },
  hotpotato(b, s, c) {
    if (s.phase === 'potato' && s.holder === b.id) { b.mem.hold = (b.mem.hold ?? rnd(0.5, 1.8)) - c.dt; if (b.mem.hold <= 0) { b.mem.hold = undefined; const o = s.alive.filter((id) => id !== b.id); if (o.length) return [{ type: 'pass', to: pick(o) }]; } return []; }
    b.mem.hold = undefined;
    if (s.phase === 'answer' && s.answerer === b.id) { b.mem.ans = (b.mem.ans ?? rnd(1.5, 4)) - c.dt; if (b.mem.ans <= 0) { b.mem.ans = undefined; return [{ type: 'answer', i: Math.floor(Math.random() * 4) }]; } } else b.mem.ans = undefined;
    return [];
  },
  mimic(b, s, c) {
    if (s.original) b.mem.orig = s.original;
    if (b.mem.phase !== s.phase) { b.mem.phase = s.phase; b.mem.sent = false; b.mem.wait = rnd(1.2, 3.2); }
    if (b.mem.sent) return []; b.mem.wait -= c.dt; if (b.mem.wait > 0) return [];
    if (s.phase === 'leader' && s.leader === b.id) { b.mem.sent = true; return [{ type: 'path', path: squiggle() }]; }
    if (s.phase === 'copy' && s.leader !== b.id && s.survivors.includes(b.id)) { b.mem.sent = true; const n = rnd(0.015, 0.11); const src = b.mem.orig && b.mem.orig.length > 4 ? b.mem.orig : squiggle(); return [{ type: 'path', path: src.filter((_, i) => i % 2 === 0).map(([x, y]) => [x + rnd(-n, n), y + rnd(-n, n)]) }]; }
    return [];
  },
  threelines(b, s, c) {
    if (s.phase !== 'turn') { b.mem.lines = 0; return []; }
    if (s.drawer === b.id) { if ((b.mem.lines || 0) < 3 && every(b, 'ln', 2.2, c.dt)) { b.mem.lines = (b.mem.lines || 0) + 1; return [{ type: 'line', x1: rnd(120, 640), y1: rnd(100, 540), x2: rnd(120, 640), y2: rnd(100, 540) }]; } return []; }
    if (s.guessed.includes(b.id) || !every(b, 'gs', rnd(4, 8), c.dt)) return [];
    const word = c.game._word ? c.game._word() : null; // bots peek so a solo tester sees the scoring flow
    return [{ type: 'guess', text: word && Math.random() < 0.12 * (s.lines.length || 0) ? word : pick(WORDS) }];
  },
};

module.exports = { BRAINS, think(gameId, bot, state, ctx) { const br = BRAINS[gameId]; if (!br || !state) return []; try { return br(bot, state, ctx) || []; } catch (e) { return []; } } };
