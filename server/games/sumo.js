// Sumo Royale: round blobs, dash-only movement, push others off a shrinking circular arena.
const W = 900, H = 600, CX = 450, CY = 300;
const R0 = 270, R1 = 100, ROUND = 60, R_BLOB = 22, DASH = 560, COOLDOWN = 0.9;

module.exports = {
  id: 'sumo',
  name: 'Sumo Royale',
  tagline: 'Dash-only blobs. Push everyone off a shrinking circle.',
  min: 2, max: 8,
  controls: 'Click (or Space) to dash toward the mouse. That is the only move.',
  create(api) {
    const blobs = new Map();
    const placement = [];
    let t = 0, arena = R0, over = false, countdown = 3;
    const ps = api.players();
    ps.forEach((p, i) => {
      const a = (i / ps.length) * Math.PI * 2;
      blobs.set(p.id, { id: p.id, x: CX + Math.cos(a) * 150, y: CY + Math.sin(a) * 150, vx: 0, vy: 0, cd: 0, alive: true, hits: 0 });
    });
    const alive = () => [...blobs.values()].filter((b) => b.alive);

    function finish() {
      if (over) return; over = true;
      const order = [...alive().sort((a, b) => Math.hypot(a.x - CX, a.y - CY) - Math.hypot(b.x - CX, b.y - CY)).map((b) => b.id), ...placement.slice().reverse()];
      const pts = {};
      order.forEach((id, i) => { pts[id] = Math.max(0, ps.length - i) + (blobs.get(id)?.hits || 0); });
      const winner = api.player(order[0]);
      api.emit('g:event', { type: 'over', winner: order[0] });
      api.after(2500, () => api.end(pts, winner ? `${winner.name} stayed on the mat. Points: placement + 1 per shove.` : 'Nobody survived.'));
    }

    return {
      onInput(pid, msg) {
        const b = blobs.get(pid);
        if (!b || !b.alive || countdown > 0 || over) return;
        if (msg.type === 'dash' && b.cd <= 0 && Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
          const dx = msg.x - b.x, dy = msg.y - b.y, d = Math.hypot(dx, dy) || 1;
          b.vx += (dx / d) * DASH; b.vy += (dy / d) * DASH; b.cd = COOLDOWN;
          api.emit('g:event', { type: 'dash', id: pid });
        }
      },
      onLeave(pid) { const b = blobs.get(pid); if (b && b.alive) { b.alive = false; placement.push(pid); } },
      tick(dt) {
        if (over) return;
        if (countdown > 0) { countdown -= dt; api.emit('g:state', snap()); return; }
        t += dt;
        arena = t < ROUND ? R0 - (R0 - R1) * (t / ROUND) : Math.max(0, R1 - (t - ROUND) * 25);
        const list = alive();
        for (const b of list) {
          b.cd -= dt;
          b.x += b.vx * dt; b.y += b.vy * dt;
          const f = Math.pow(0.12, dt); b.vx *= f; b.vy *= f;
        }
        // collisions: equal mass, slightly bouncy
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          if (d < R_BLOB * 2 && d > 0) {
            const nx = dx / d, ny = dy / d, overlap = R_BLOB * 2 - d;
            a.x -= nx * overlap / 2; a.y -= ny * overlap / 2; b.x += nx * overlap / 2; b.y += ny * overlap / 2;
            const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rv < 0) {
              const imp = -rv * 1.05; // restitution 1.1 total split
              a.vx -= nx * imp; a.vy -= ny * imp; b.vx += nx * imp; b.vy += ny * imp;
              // credit the shove to whoever was moving faster into the contact
              const pushA = (a.vx * nx + a.vy * ny), pushB = -(b.vx * nx + b.vy * ny);
              if (pushA > pushB) b.pushedBy = a.id; else a.pushedBy = b.id;
            }
          }
        }
        for (const b of list) {
          if (Math.hypot(b.x - CX, b.y - CY) > arena + R_BLOB * 0.6) {
            b.alive = false; placement.push(b.id);
            if (b.pushedBy && blobs.get(b.pushedBy)) blobs.get(b.pushedBy).hits++;
            api.emit('g:event', { type: 'out', id: b.id, by: b.pushedBy || null });
          }
        }
        if (alive().length <= 1 || (arena <= 0)) finish();
        api.emit('g:state', snap());
      },
      destroy() {},
    };
    function snap() {
      return { t, arena, countdown: Math.max(0, countdown), blobs: [...blobs.values()].map((b) => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), alive: b.alive, cd: Math.max(0, b.cd), hits: b.hits })) };
    }
  },
};
