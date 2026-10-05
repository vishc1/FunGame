// Shadow Tag: dark map, flashlight cones, one tagger. You can only see players a light is on.
const W = 900, H = 600;
const R = 14, SPEED = 205, TAG_SPEED = 220, ROUND = 90, CONE = (55 * Math.PI) / 180, LEN = 280, IMMUNE = 1.5;

function makeWalls() {
  // Fixed, hand-placed layout (x,y,w,h). Keeps spawns clear.
  return [
    { x: 0, y: 0, w: W, h: 12 }, { x: 0, y: H - 12, w: W, h: 12 }, { x: 0, y: 0, w: 12, h: H }, { x: W - 12, y: 0, w: 12, h: H },
    { x: 150, y: 90, w: 20, h: 150 }, { x: 300, y: 60, w: 160, h: 20 }, { x: 420, y: 160, w: 20, h: 140 },
    { x: 560, y: 110, w: 180, h: 20 }, { x: 730, y: 110, w: 20, h: 160 }, { x: 120, y: 340, w: 200, h: 20 },
    { x: 260, y: 440, w: 20, h: 120 }, { x: 400, y: 380, w: 140, h: 20 }, { x: 620, y: 330, w: 20, h: 170 },
    { x: 680, y: 450, w: 160, h: 20 },
  ];
}

function collide(p, walls, r) {
  for (const w of walls) {
    const cx = Math.max(w.x, Math.min(p.x, w.x + w.w)), cy = Math.max(w.y, Math.min(p.y, w.y + w.h));
    let dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
    if (d < r) {
      if (d === 0) { // center inside wall: push out along smallest axis
        const l = p.x - w.x, rr = w.x + w.w - p.x, t = p.y - w.y, b = w.y + w.h - p.y, m = Math.min(l, rr, t, b);
        if (m === l) p.x = w.x - r; else if (m === rr) p.x = w.x + w.w + r; else if (m === t) p.y = w.y - r; else p.y = w.y + w.h + r;
      } else { p.x = cx + (dx / d) * r; p.y = cy + (dy / d) * r; }
    }
  }
  p.x = Math.max(R, Math.min(W - R, p.x)); p.y = Math.max(R, Math.min(H - R, p.y));
}

function segHitsRect(x1, y1, x2, y2, w) {
  // Liang-Barsky
  let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
  const P = [-dx, dx, -dy, dy], Q = [x1 - w.x, w.x + w.w - x1, y1 - w.y, w.y + w.h - y1];
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) { if (Q[i] < 0) return false; }
    else { const t = Q[i] / P[i]; if (P[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } }
  }
  return true;
}

function litBy(light, target, walls) {
  if (!light.lightOn || light.id === target.id) return false;
  const dx = target.x - light.x, dy = target.y - light.y, d = Math.hypot(dx, dy);
  if (d > LEN + R) return false;
  let da = Math.atan2(dy, dx) - light.aim; da = Math.atan2(Math.sin(da), Math.cos(da));
  if (Math.abs(da) > CONE / 2 + (d > 0 ? Math.asin(Math.min(1, R / Math.max(d, R))) : 0)) return false;
  for (const w of walls) if (segHitsRect(light.x, light.y, target.x, target.y, w)) return false;
  return true;
}

module.exports = {
  id: 'shadowtag',
  name: 'Shadow Tag',
  tagline: 'Pitch-black tag. You only see people when a flashlight is on them.',
  min: 3, max: 8,
  controls: 'WASD / arrows to move, mouse to aim your flashlight, click or F to toggle it. Tagger: touch someone to pass it on.',
  create(api) {
    const walls = makeWalls();
    const players = new Map();
    const spawns = [[60, 60], [W - 60, 60], [60, H - 60], [W - 60, H - 60], [W / 2, 40], [W / 2, H - 40], [60, H / 2], [W - 60, H / 2]];
    api.players().forEach((p, i) => {
      const [x, y] = spawns[i % spawns.length];
      players.set(p.id, { id: p.id, x, y, dx: 0, dy: 0, aim: 0, lightOn: true, itTime: 0, immune: 0, lit: false });
    });
    let tagger = [...players.keys()][Math.floor(Math.random() * players.size)];
    let t = 0, countdown = 3, over = false, litAcc = 0;
    api.emit('g:event', { type: 'init', walls });

    function pickTagger() { const ids = [...players.keys()]; tagger = ids.length ? ids[Math.floor(Math.random() * ids.length)] : null; }

    function finish() {
      if (over) return; over = true;
      const ranked = [...players.values()].sort((a, b) => a.itTime - b.itTime);
      const pts = {}; const n = ranked.length;
      ranked.forEach((p, i) => { pts[p.id] = n - i; });
      const w = ranked[0] && api.player(ranked[0].id);
      api.emit('g:event', { type: 'over', winner: ranked[0] ? ranked[0].id : null });
      api.after(2500, () => api.end(pts, w ? `${w.name} was "it" the least (${ranked[0].itTime.toFixed(1)}s). Points by least time as it.` : 'Nobody left.'));
    }

    function snap() {
      return {
        t, countdown: Math.max(0, countdown), tagger,
        players: [...players.values()].map((p) => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y), aim: Math.round(p.aim * 100) / 100, lightOn: p.lightOn, itTime: Math.round(p.itTime * 10) / 10, lit: p.lit, immune: p.immune > 0 })),
      };
    }

    return {
      onJoin(pid) { api.to(pid, 'g:event', { type: 'init', walls }); },
      onRejoin(pid) { api.to(pid, 'g:event', { type: 'init', walls }); },
      onInput(pid, msg) {
        const p = players.get(pid); if (!p || over) return;
        if (msg.type === 'move') { const d = Math.hypot(msg.dx || 0, msg.dy || 0); p.dx = d > 0 ? msg.dx / d : 0; p.dy = d > 0 ? msg.dy / d : 0; }
        else if (msg.type === 'aim' && typeof msg.a === 'number' && isFinite(msg.a)) p.aim = msg.a;
        else if (msg.type === 'light') p.lightOn = !p.lightOn;
      },
      onLeave(pid) { players.delete(pid); if (pid === tagger) pickTagger(); if (players.size < 2) finish(); },
      tick(dt) {
        if (over) return;
        if (countdown > 0) { countdown -= dt; api.emit('g:state', snap()); return; }
        t += dt;
        for (const p of players.values()) {
          const sp = p.id === tagger ? TAG_SPEED : SPEED;
          p.x += p.dx * sp * dt; p.y += p.dy * sp * dt;
          collide(p, walls, R);
          p.immune = Math.max(0, p.immune - dt);
          if (p.id === tagger) p.itTime += dt;
        }
        const it = players.get(tagger);
        if (it) for (const p of players.values()) {
          if (p.id === tagger || p.immune > 0) continue;
          if (Math.hypot(p.x - it.x, p.y - it.y) < R * 2) {
            it.immune = IMMUNE; tagger = p.id;
            api.emit('g:event', { type: 'tag', from: it.id, to: p.id });
            break;
          }
        }
        litAcc += dt;
        if (litAcc >= 0.1) {
          litAcc = 0;
          const list = [...players.values()];
          for (const p of list) p.lit = list.some((l) => litBy(l, p, walls));
        }
        if (t >= ROUND) finish();
        api.emit('g:state', snap());
      },
      destroy() {},
    };
  },
};
