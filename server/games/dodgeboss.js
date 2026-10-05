// Dodge the Boss: a giant AI boss does telegraphed attacks; last player standing wins.
//
// HOW TO ADD A BOSS: push an entry onto BOSSES below:
//   { id: 'name', name: 'Display Name', attacks: [ (ctx) => [shape, ...], ... ] }
// Each attack is a function receiving ctx = { boss:{x,y}, players:[{x,y}], t, scale, rnd } and returning
// an array of shapes. A shape is { kind, ...geometry, tele, active, persist? }:
//   circle: {x,y,r}   rect: {x,y,w,h}   line: {x1,y1,x2,y2,w}  (thick segment)
//   band:   {x,y,r1,r2} (danger between radii)   beam: {x,y,a0,a1,len,w,dur} (sweeps from a0 to a1 over dur)
// `tele` is telegraph seconds (scaled by ctx.scale), `active` is seconds of danger after the telegraph,
// `persist` true keeps the shape dangerous (used for banana hazards). Then add a draw function in
// public/games/dodgeboss.js keyed by the same id.
const W = 900, H = 600, M = 20;
const P_R = 14, P_SPEED = 250, ROUND = 120, PHASE2 = 30;

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const BOSSES = [
  {
    id: 'kart', name: 'The Kart', attacks: [
      // Drift: a line sweep across the arena
      (c) => { const a = rnd(0, Math.PI), cx = rnd(250, 650), cy = rnd(150, 450); const L = 700; return [{ kind: 'line', x1: cx - Math.cos(a) * L, y1: cy - Math.sin(a) * L, x2: cx + Math.cos(a) * L, y2: cy + Math.sin(a) * L, w: 120, tele: 1.2, active: 0.4 }]; },
      // Banana drop: 5 persistent hazards
      (c) => Array.from({ length: 5 }, () => ({ kind: 'circle', x: rnd(60, W - 60), y: rnd(60, H - 60), r: 28, tele: 1, active: 8, persist: true })),
      // Boost ram: charge from an edge toward a random player
      (c) => {
        const p = pick(c.players) || { x: W / 2, y: H / 2 };
        const side = Math.floor(rnd(0, 4));
        const sx = side === 0 ? M : side === 1 ? W - M : rnd(M, W - M), sy = side === 2 ? M : side === 3 ? H - M : rnd(M, H - M);
        const a = Math.atan2(p.y - sy, p.x - sx), L = 1100;
        return [{ kind: 'line', x1: sx, y1: sy, x2: sx + Math.cos(a) * L, y2: sy + Math.sin(a) * L, w: 110, tele: 1, active: 0.6, ram: true }];
      },
    ],
  },
  {
    id: 'ogre', name: 'The Ogre', attacks: [
      (c) => [{ kind: 'circle', x: c.boss.x, y: c.boss.y, r: 170, tele: 1.3, active: 0.4 }],
      (c) => Array.from({ length: 3 }, () => ({ kind: 'circle', x: rnd(80, W - 80), y: rnd(80, H - 80), r: rnd(90, 140), tele: 1.5, active: 0.5, grow: true })),
      (c) => [{ kind: 'band', x: c.boss.x, y: c.boss.y, r1: 120, r2: 260, tele: 1.5, active: 0.5 }],
    ],
  },
  {
    id: 'ufo', name: 'The UFO', attacks: [
      (c) => { const a0 = rnd(0, Math.PI * 2); return [{ kind: 'beam', x: c.boss.x, y: c.boss.y, a0, a1: a0 + Math.PI * (Math.random() < 0.5 ? 1 : -1), len: 1100, w: 50, tele: 1, active: 2.5, dur: 2.5 }]; },
      (c) => {
        // 4 rects covering ~60% of the arena: split the arena into a 4x3 grid and pick 7 cells merged into 4 rects
        const cols = 4, rows = 3, cw = (W - 2 * M) / cols, ch = (H - 2 * M) / rows;
        const cells = []; for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) cells.push([i, j]);
        cells.sort(() => Math.random() - 0.5);
        return cells.slice(0, 7).map(([i, j]) => ({ kind: 'rect', x: M + i * cw, y: M + j * ch, w: cw, h: ch, tele: 1.5, active: 0.5 }));
      },
      (c) => { const horiz = Math.random() < 0.5, y = rnd(80, H - 80), x = rnd(80, W - 80); return Array.from({ length: 8 }, (_, i) => ({ kind: 'circle', x: horiz ? 60 + i * ((W - 120) / 7) : x + rnd(-30, 30), y: horiz ? y + rnd(-30, 30) : 50 + i * ((H - 100) / 7), r: 45, tele: 0.9 + i * 0.16, active: 0.4 })); },
    ],
  },
];

module.exports = {
  id: 'dodgeboss',
  name: 'Dodge the Boss',
  tagline: 'A giant boss telegraphs attacks. Last one standing wins.',
  min: 2, max: 8,
  controls: 'WASD / arrows to move. Stay out of the red.',
  BOSSES,
  create(api) {
    const ps = api.players();
    const bossDef = pick(BOSSES);
    const players = new Map();
    ps.forEach((p, i) => { const a = (i / ps.length) * Math.PI * 2; players.set(p.id, { id: p.id, x: W / 2 + Math.cos(a) * 200, y: H / 2 + Math.sin(a) * 160, dx: 0, dy: 0, alive: true }); });
    const boss = { x: W / 2, y: H / 2, tx: W / 2, ty: H / 2, fx: W / 2, fy: H / 2, moveT: 1 };
    let t = 0, countdown = 3, over = false, nextAttack = 1.5, lastMove = 0, phase = 1;
    const shapes = []; // active shapes with absolute times
    const placement = [];
    const alive = () => [...players.values()].filter((p) => p.alive);

    function inShape(sh, p) {
      if (t < sh.tele) return false;
      if (sh.kind === 'circle') { const r = sh.grow ? sh.r : sh.r; return Math.hypot(p.x - sh.x, p.y - sh.y) < r + P_R * 0.5; }
      if (sh.kind === 'rect') return p.x > sh.x - P_R * 0.5 && p.x < sh.x + sh.w + P_R * 0.5 && p.y > sh.y - P_R * 0.5 && p.y < sh.y + sh.h + P_R * 0.5;
      if (sh.kind === 'line') { const dx = sh.x2 - sh.x1, dy = sh.y2 - sh.y1, L2 = dx * dx + dy * dy || 1; const u = Math.max(0, Math.min(1, ((p.x - sh.x1) * dx + (p.y - sh.y1) * dy) / L2)); return Math.hypot(p.x - (sh.x1 + u * dx), p.y - (sh.y1 + u * dy)) < sh.w / 2 + P_R * 0.5; }
      if (sh.kind === 'band') { const d = Math.hypot(p.x - sh.x, p.y - sh.y); return d > sh.r1 - P_R * 0.5 && d < sh.r2 + P_R * 0.5; }
      if (sh.kind === 'beam') {
        const prog = Math.min(1, (t - sh.tele) / sh.dur), a = sh.a0 + (sh.a1 - sh.a0) * prog;
        const ex = sh.x + Math.cos(a) * sh.len, ey = sh.y + Math.sin(a) * sh.len;
        const dx = ex - sh.x, dy = ey - sh.y, L2 = dx * dx + dy * dy; const u = Math.max(0, Math.min(1, ((p.x - sh.x) * dx + (p.y - sh.y) * dy) / L2));
        return Math.hypot(p.x - (sh.x + u * dx), p.y - (sh.y + u * dy)) < sh.w / 2 + P_R * 0.5;
      }
      return false;
    }

    function launch() {
      const scale = phase === 2 ? 0.75 : 1;
      const atk = pick(bossDef.attacks);
      const out = atk({ boss, players: alive(), t, scale, rnd });
      let maxEnd = t;
      for (const sh of out) {
        sh.tele = t + sh.tele * scale; sh.active = sh.tele + sh.active; sh.born = t;
        if (!sh.persist) maxEnd = Math.max(maxEnd, sh.active);
        shapes.push(sh);
      }
      nextAttack = maxEnd + (phase === 2 ? 0.4 : 1.0);
      api.emit('g:event', { type: 'attack' });
    }

    function finish() {
      if (over) return; over = true;
      const survivors = alive().map((p) => p.id);
      const order = [...survivors, ...placement.slice().reverse()];
      const pts = {};
      // ties: survivors share the top placement
      order.forEach((id, i) => { pts[id] = Math.max(1, ps.length - (survivors.includes(id) ? 0 : i)); });
      const w = survivors.length === 1 ? api.player(survivors[0]) : null;
      api.emit('g:event', { type: 'over', winners: survivors });
      api.after(2000, () => api.end(pts, w ? `${w.name} outlasted ${bossDef.name}!` : survivors.length > 1 ? `${survivors.length} players survived ${bossDef.name} together.` : `${bossDef.name} got everyone.`));
    }

    const snap = () => ({
      t, countdown: Math.max(0, countdown), boss: { id: bossDef.id, name: bossDef.name, x: Math.round(boss.x), y: Math.round(boss.y) }, phase,
      players: [...players.values()].map((p) => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y), alive: p.alive })),
      shapes: shapes.map((sh) => { const o = {}; for (const k in sh) o[k] = typeof sh[k] === 'number' ? Math.round(sh[k] * 100) / 100 : sh[k]; return o; }),
    });

    return {
      onInput(pid, msg) {
        const p = players.get(pid); if (!p || !p.alive || over) return;
        if (msg.type === 'move') { const d = Math.hypot(msg.dx || 0, msg.dy || 0); p.dx = d > 0 ? msg.dx / d : 0; p.dy = d > 0 ? msg.dy / d : 0; }
      },
      onLeave(pid) { const p = players.get(pid); if (p && p.alive) { p.alive = false; placement.push(pid); } players.delete(pid); if (!over && players.size <= 1 && ps.length > 1) finish(); },
      tick(dt) {
        if (over) return;
        if (countdown > 0) { countdown -= dt; api.emit('g:state', snap()); return; }
        t += dt;
        if (phase === 1 && t >= PHASE2) { phase = 2; api.emit('g:event', { type: 'phase2' }); }
        // boss relocation
        if (t - lastMove >= 25) { lastMove = t; boss.fx = boss.x; boss.fy = boss.y; boss.tx = rnd(200, W - 200); boss.ty = rnd(150, H - 150); boss.moveT = 0; }
        if (boss.moveT < 1) { boss.moveT = Math.min(1, boss.moveT + dt); const e = boss.moveT * boss.moveT * (3 - 2 * boss.moveT); boss.x = boss.fx + (boss.tx - boss.fx) * e; boss.y = boss.fy + (boss.ty - boss.fy) * e; }
        if (t >= nextAttack) launch();
        // ram shapes: boss visually travels along; nothing else needed server-side
        for (const p of alive()) {
          p.x += p.dx * P_SPEED * dt; p.y += p.dy * P_SPEED * dt;
          p.x = Math.max(M + P_R, Math.min(W - M - P_R, p.x)); p.y = Math.max(M + P_R, Math.min(H - M - P_R, p.y));
        }
        const list = alive();
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          if (d < P_R * 2 && d > 0) { const nx = dx / d, ny = dy / d, ov = (P_R * 2 - d) / 2; a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov; }
        }
        // grow circles during telegraph
        for (const sh of shapes) if (sh.kind === 'circle' && sh.grow && !sh.r0) sh.r0 = sh.r;
        // hits
        const dead = [];
        for (const p of list) for (const sh of shapes) if (t >= sh.tele && t <= sh.active && inShape(sh, p)) { dead.push(p); break; }
        for (const p of dead) { p.alive = false; placement.push(p.id); api.emit('g:event', { type: 'out', id: p.id }); }
        for (let i = shapes.length - 1; i >= 0; i--) if (t > shapes[i].active + 0.3) shapes.splice(i, 1);
        if ((alive().length <= 1 && ps.length > 1) || alive().length === 0 || t >= ROUND) finish();
        api.emit('g:state', snap());
      },
      destroy() {},
    };
  },
};
