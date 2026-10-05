// Tag with Powers: fast top-down tag with obstacles; everyone gets a random power each round.
// Add a power by appending to POWERS below: { id, name, cd, use(p, aim, g) } where `use` receives the
// player, the aim point {x,y} and the game helpers g = { players, walls, projectiles, portals, segHit, clampPt, emit }.
const W = 900, H = 600, M = 20, R = 14, ROUND = 90;
const SPEED = 225, IT_SPEED = 240, IMMUNE = 1.5;

const WALLS = [
  { x: 150, y: 120, w: 120, h: 30 }, { x: 630, y: 120, w: 120, h: 30 },
  { x: 150, y: 450, w: 120, h: 30 }, { x: 630, y: 450, w: 120, h: 30 },
  { x: 420, y: 220, w: 60, h: 160 }, { x: 60, y: 270, w: 40, h: 60 }, { x: 800, y: 270, w: 40, h: 60 },
  { x: 330, y: 60, w: 240, h: 24 }, { x: 330, y: 516, w: 240, h: 24 },
];

const POWERS = [
  { id: 'flash', name: 'Flash', cd: 6, use(p) { p.boost = 1.2; } },
  { id: 'pearl', name: 'Ender pearl', cd: 7, use(p, aim, g) { const a = Math.atan2(aim.y - p.y, aim.x - p.x); g.projectiles.push({ kind: 'pearl', owner: p.id, x: p.x, y: p.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: 0.6 }); } },
  { id: 'portal', name: 'Portal gun', cd: 10,
    use(p, aim, g) {
      const pt = g.clampPt(p, aim, 300);
      if (!p.portalA || (p.portalA && p.portalB)) { g.portals = g.portals.filter((q) => q.owner !== p.id); p.portalA = { owner: p.id, x: pt.x, y: pt.y, life: 15, tag: 'A' }; p.portalB = null; g.portals.push(p.portalA); return 0.3; }
      p.portalB = { owner: p.id, x: pt.x, y: pt.y, life: 15, tag: 'B' }; g.portals.push(p.portalB); p.portalA.other = p.portalB; p.portalB.other = p.portalA; return this.cd;
    } },
  { id: 'dash', name: 'Dash', cd: 3, use(p, aim, g) { const hit = g.segHit(p.x, p.y, aim.x, aim.y, 180, R); p.x = hit.x; p.y = hit.y; } },
  { id: 'freeze', name: 'Freeze ray', cd: 8, use(p, aim, g) { const a = Math.atan2(aim.y - p.y, aim.x - p.x); g.projectiles.push({ kind: 'freeze', owner: p.id, x: p.x, y: p.y, vx: Math.cos(a) * 600, vy: Math.sin(a) * 600, life: 1.2 }); } },
  { id: 'smoke', name: 'Smoke bomb', cd: 9, use(p) { p.invis = 2.5; } },
  { id: 'grapple', name: 'Grapple', cd: 5, use(p, aim, g) { const hit = g.segHit(p.x, p.y, aim.x, aim.y, 350, R); if (hit.wall) { p.fly = { x: hit.x, y: hit.y, t: 0, from: { x: p.x, y: p.y } }; return this.cd; } g.emit('g:event', { type: 'grapple_miss', id: p.id, x: Math.round(hit.x), y: Math.round(hit.y) }); return 1; } },
];

const circleRect = (p, r, w) => {
  const cx = Math.max(w.x, Math.min(w.x + w.w, p.x)), cy = Math.max(w.y, Math.min(w.y + w.h, p.y));
  const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
  if (d >= r) return false;
  if (d > 0) { p.x += (dx / d) * (r - d); p.y += (dy / d) * (r - d); }
  else { // center inside rect: push out along smaller penetration axis
    const l = p.x - w.x, rr = w.x + w.w - p.x, t = p.y - w.y, b = w.y + w.h - p.y, m = Math.min(l, rr, t, b);
    if (m === l) p.x = w.x - r; else if (m === rr) p.x = w.x + w.w + r; else if (m === t) p.y = w.y - r; else p.y = w.y + w.h + r;
  }
  return true;
};
const pointInWall = (x, y, pad) => WALLS.some((w) => x > w.x - pad && x < w.x + w.w + pad && y > w.y - pad && y < w.y + w.h + pad) || x < M + pad || x > W - M - pad || y < M + pad || y > H - M - pad;

module.exports = {
  id: 'powertag',
  name: 'Tag with Powers',
  tagline: 'Fast tag. Everyone gets a random power. Least time as "it" wins.',
  min: 3, max: 8,
  controls: 'WASD / arrows to move. Space or click to use your power toward the mouse.',
  powers: POWERS,
  create(api) {
    const ps = api.players();
    const players = new Map();
    const shuffled = POWERS.slice().sort(() => Math.random() - 0.5);
    ps.forEach((p, i) => {
      const a = (i / ps.length) * Math.PI * 2;
      players.set(p.id, { id: p.id, x: W / 2 + Math.cos(a) * 180, y: H / 2 + Math.sin(a) * 140, dx: 0, dy: 0, power: shuffled[i % shuffled.length], cd: 0, itTime: 0, immune: 0, boost: 0, invis: 0, frozen: 0, portalCd: 0, fly: null, portalA: null, portalB: null });
    });
    let itId = ps[Math.floor(Math.random() * ps.length)].id;
    let t = 0, countdown = 3, over = false;
    const g = { players, walls: WALLS, projectiles: [], portals: [], emit: (ev, d) => api.emit(ev, d),
      clampPt(p, aim, max) { const dx = aim.x - p.x, dy = aim.y - p.y, d = Math.hypot(dx, dy) || 1, k = Math.min(1, max / d); let x = p.x + dx * k, y = p.y + dy * k; x = Math.max(M + 20, Math.min(W - M - 20, x)); y = Math.max(M + 20, Math.min(H - M - 20, y)); return { x, y }; },
      segHit(x0, y0, ax, ay, max, pad) { const dx = ax - x0, dy = ay - y0, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d; let last = { x: x0, y: y0, wall: false }; for (let s = 4; s <= max; s += 4) { const x = x0 + ux * s, y = y0 + uy * s; if (pointInWall(x, y, pad)) { last.wall = true; return last; } last = { x, y, wall: false }; } return last; },
    };

    function finish() {
      if (over) return; over = true;
      const order = [...players.values()].sort((a, b) => a.itTime - b.itTime);
      const pts = {}; order.forEach((p, i) => { pts[p.id] = ps.length - i; });
      const w = api.player(order[0].id);
      api.emit('g:event', { type: 'over', winner: order[0].id });
      api.after(2000, () => api.end(pts, w ? `${w.name} was "it" the least (${order[0].itTime.toFixed(1)}s).` : 'Round over.'));
    }
    const snap = () => ({
      t, countdown: Math.max(0, countdown), itId, walls: WALLS,
      players: [...players.values()].map((p) => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y), power: p.power.id, powerName: p.power.name, cd: +Math.max(0, p.cd).toFixed(1), maxCd: p.power.cd, it: +p.itTime.toFixed(1), immune: p.immune > 0, boost: p.boost > 0, invis: p.invis > 0, frozen: p.frozen > 0 })),
      projectiles: g.projectiles.map((q) => ({ kind: q.kind, x: Math.round(q.x), y: Math.round(q.y) })),
      portals: g.portals.map((q) => ({ owner: q.owner, x: Math.round(q.x), y: Math.round(q.y), tag: q.tag, life: +q.life.toFixed(1) })),
    });

    return {
      onInput(pid, msg) {
        const p = players.get(pid); if (!p || over) return;
        if (msg.type === 'move') { const d = Math.hypot(msg.dx || 0, msg.dy || 0); p.dx = d > 0 ? msg.dx / d : 0; p.dy = d > 0 ? msg.dy / d : 0; return; }
        if (countdown > 0 || p.frozen > 0 || p.fly) return;
        if (msg.type === 'power' && p.cd <= 0) {
          const aim = { x: +msg.x || p.x, y: +msg.y || p.y };
          const r = p.power.use(p, aim, g);
          p.cd = typeof r === 'number' ? r : p.power.cd;
          api.emit('g:event', { type: 'power', id: pid, power: p.power.id, x: Math.round(p.x), y: Math.round(p.y) });
        }
      },
      onLeave(pid) {
        players.delete(pid); g.portals = g.portals.filter((q) => q.owner !== pid);
        if (over) return;
        if (players.size < 2) { finish(); return; }
        if (pid === itId) { const list = [...players.values()]; itId = list[Math.floor(Math.random() * list.length)].id; api.emit('g:event', { type: 'tag', id: itId, from: null }); }
      },
      tick(dt) {
        if (over) return;
        if (countdown > 0) { countdown -= dt; api.emit('g:state', snap()); return; }
        t += dt;
        const list = [...players.values()];
        for (const p of list) {
          p.cd -= dt; p.immune -= dt; p.boost -= dt; p.invis -= dt; p.frozen -= dt;
          if (p.id === itId) p.itTime += dt;
          if (p.fly) { p.fly.t += dt * 3.2; const k = Math.min(1, p.fly.t); p.x = p.fly.from.x + (p.fly.x - p.fly.from.x) * k; p.y = p.fly.from.y + (p.fly.y - p.fly.from.y) * k; if (k >= 1) p.fly = null; continue; }
          if (p.frozen > 0) continue;
          const sp = (p.id === itId ? IT_SPEED : SPEED) * (p.boost > 0 ? 2.4 : 1);
          p.x += p.dx * sp * dt; p.y += p.dy * sp * dt;
        }
        for (const p of list) {
          p.x = Math.max(M + R, Math.min(W - M - R, p.x)); p.y = Math.max(M + R, Math.min(H - M - R, p.y));
          for (const w of WALLS) circleRect(p, R, w);
        }
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          if (d < R * 2 && d > 0) {
            const nx = dx / d, ny = dy / d, ov = (R * 2 - d) / 2; a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
            const tagger = a.id === itId ? a : b.id === itId ? b : null, other = tagger === a ? b : a;
            if (tagger && other.immune <= 0) { itId = other.id; tagger.immune = IMMUNE; api.emit('g:event', { type: 'tag', id: other.id, from: tagger.id }); }
          }
        }
        // projectiles
        for (let i = g.projectiles.length - 1; i >= 0; i--) {
          const q = g.projectiles[i]; q.life -= dt;
          const nx = q.x + q.vx * dt, ny = q.y + q.vy * dt;
          const hitWall = pointInWall(nx, ny, 4);
          if (!hitWall) { q.x = nx; q.y = ny; }
          let done = hitWall || q.life <= 0;
          if (q.kind === 'freeze' && !done) {
            for (const p of list) if (p.id !== q.owner && Math.hypot(p.x - q.x, p.y - q.y) < R + 6) { p.frozen = 1.5; api.emit('g:event', { type: 'frozen', id: p.id }); done = true; break; }
          }
          if (done) {
            if (q.kind === 'pearl') { const o = players.get(q.owner); if (o) { const pt = { x: q.x, y: q.y }; let tries = 0; while (pointInWall(pt.x, pt.y, R) && tries++ < 20) { pt.x += (W / 2 - pt.x) * 0.1; pt.y += (H / 2 - pt.y) * 0.1; } o.x = pt.x; o.y = pt.y; api.emit('g:event', { type: 'teleport', id: o.id, x: Math.round(o.x), y: Math.round(o.y) }); } }
            g.projectiles.splice(i, 1);
          }
        }
        // portals
        for (let i = g.portals.length - 1; i >= 0; i--) { const q = g.portals[i]; q.life -= dt; if (q.life <= 0) { g.portals.splice(i, 1); const o = players.get(q.owner); if (o) { if (o.portalA === q) o.portalA = null; if (o.portalB === q) o.portalB = null; } } }
        for (const p of list) {
          p.portalCd -= dt; if (p.portalCd > 0) continue;
          for (const q of g.portals) if (q.other && g.portals.includes(q.other) && Math.hypot(p.x - q.x, p.y - q.y) < R + 10) { p.x = q.other.x; p.y = q.other.y; p.portalCd = 0.5; api.emit('g:event', { type: 'teleport', id: p.id, x: Math.round(p.x), y: Math.round(p.y) }); break; }
        }
        if (t >= ROUND) finish();
        api.emit('g:state', snap());
      },
      destroy() {},
    };
  },
};
