// Build & Break: 60s to stack falling blocks into a tower, then everyone gets one
// wrecking-ball shot at someone else's tower. Tallest surviving tower wins.
// Physics: matter-js, one headless engine per player lane (400x600, ground slab 260 wide).
// Test hook: if api.memory.__fast is truthy, phases are shortened to a few seconds.
const Matter = require('matter-js');
const { Engine, World, Bodies, Body, Composite } = Matter;

const LANE_W = 400, LANE_H = 600, GROUND_W = 260, GROUND_TOP = 560, GROUND_H = 40;
const SHAPES = [
  { w: 120, h: 30 }, { w: 80, h: 40 }, { w: 40, h: 80 }, { w: 60, h: 60 },
  { w: 150, h: 24 }, { w: 30, h: 120 }, { w: 100, h: 30, plank: true }, { c: 25 },
];
const HELD_Y = 50, NEXT_DELAY = 0.7, BALL_LIFE = 6, BALL_R = 24, MAX_V = 45;

module.exports = {
  id: 'buildbreak',
  name: 'Build & Break',
  tagline: '60s to build a tower from falling blocks, then one wrecking-ball shot each.',
  min: 2, max: 8,
  controls: 'Build: A/D or mouse to move, Q/E to rotate, Space/click to drop. Break: click a tower thumbnail, then drag and release to fire.',
  create(api) {
    const fast = !!api.memory.__fast;
    const T_BUILD = fast ? 4 : 60, T_LOCK = fast ? 1 : 3, T_BREAK = fast ? 5 : 60, T_SETTLE = fast ? 1 : 3, T_FINAL = fast ? 1 : 4;

    const lanes = new Map(); // pid -> lane
    let phase = 'build', t = 0, over = false, lastFire = -1, phaseLeft = T_BUILD;
    let emitAcc = 0;

    function randShape() { const s = SHAPES[Math.floor(Math.random() * SHAPES.length)]; return { ...s }; }
    function makeLane(pid) {
      const engine = Engine.create();
      engine.gravity.y = 1;
      const ground = Bodies.rectangle(LANE_W / 2, GROUND_TOP + GROUND_H / 2, GROUND_W, GROUND_H, { isStatic: true, friction: 1, label: 'ground' });
      World.add(engine.world, ground);
      return { id: pid, engine, ground, held: { x: LANE_W / 2, angle: 0, shape: randShape() }, nextIn: 0, blocks: [], balls: [], fired: false, target: null, height: 0, heightBefore: null, hit: false };
    }
    for (const p of api.players()) lanes.set(p.id, makeLane(p.id));

    function laneHeight(l) {
      let top = GROUND_TOP;
      for (const b of l.blocks) {
        if (b.position.y > GROUND_TOP + 60) continue; // fell off / below ground
        if (b.bounds.min.y < top) top = b.bounds.min.y;
      }
      return Math.max(0, Math.round(GROUND_TOP - top));
    }

    function drop(l) {
      if (!l.held) return;
      const s = l.held.shape;
      let body;
      const opts = { friction: 0.8, restitution: 0.05, density: 0.002, label: 'block' };
      if (s.c) body = Bodies.circle(l.held.x, HELD_Y, s.c, opts);
      else body = Bodies.rectangle(l.held.x, HELD_Y, s.w, s.h, { ...opts, angle: l.held.angle });
      body.shape = s;
      World.add(l.engine.world, body);
      l.blocks.push(body);
      l.held = null;
      l.nextIn = NEXT_DELAY;
    }

    function fire(pid, msg) {
      const shooter = lanes.get(pid);
      const target = lanes.get(msg.target);
      if (!shooter || !target || shooter.fired || msg.target === pid) return;
      let vx = +msg.vx || 0, vy = +msg.vy || 0;
      const sp = Math.hypot(vx, vy);
      if (sp > MAX_V) { vx *= MAX_V / sp; vy *= MAX_V / sp; }
      if (sp < 1) return;
      const ball = Bodies.circle(30, 120, BALL_R, { density: 0.02, restitution: 0.3, friction: 0.3, label: 'ball' });
      Body.setVelocity(ball, { x: vx, y: vy });
      World.add(target.engine.world, ball);
      target.balls.push({ body: ball, life: BALL_LIFE, by: pid });
      if (target.heightBefore == null) target.heightBefore = laneHeight(target);
      shooter.fired = true;
      shooter.target = msg.target;
      shooter.shotHeightBefore = laneHeight(target);
      lastFire = t;
      api.emit('g:event', { type: 'fire', by: pid, target: msg.target });
    }

    function allFired() { return [...lanes.values()].every((l) => l.fired); }

    function finish() {
      if (over) return; over = true;
      const ls = [...lanes.values()];
      for (const l of ls) l.height = laneHeight(l);
      const ranked = ls.slice().sort((a, b) => b.height - a.height);
      const pts = {};
      ranked.forEach((l, i) => { pts[l.id] = ranked.length - i; });
      for (const l of ls) {
        if (l.fired && l.target && lanes.get(l.target)) {
          const tg = lanes.get(l.target);
          if ((l.shotHeightBefore || 0) - tg.height >= 100) { pts[l.id] += 2; l.hit = true; }
        }
      }
      const rows = ranked.map((l) => ({ id: l.id, height: l.height, hit: l.hit }));
      api.emit('g:event', { type: 'final', rows });
      const w = api.player(ranked[0].id);
      api.after(T_FINAL * 1000, () => api.end(pts, w ? `${w.name}'s tower stood tallest at ${ranked[0].height}px. +2 for a shot that knocked off 100px or more.` : 'No towers left.'));
    }

    function stepAll(dt) {
      for (const l of lanes.values()) {
        Engine.update(l.engine, 1000 / 60);
        Engine.update(l.engine, 1000 / 60);
        // cull fallen blocks
        for (let i = l.blocks.length - 1; i >= 0; i--) {
          if (l.blocks[i].position.y > 800) { World.remove(l.engine.world, l.blocks[i]); l.blocks.splice(i, 1); }
        }
        for (let i = l.balls.length - 1; i >= 0; i--) {
          const b = l.balls[i]; b.life -= dt;
          if (b.life <= 0 || b.body.position.y > 800) { World.remove(l.engine.world, b.body); l.balls.splice(i, 1); }
        }
        l.height = laneHeight(l);
      }
    }

    function snap() {
      return {
        phase, t: Math.round(t * 10) / 10, left: Math.max(0, Math.round(phaseLeft)),
        lanes: [...lanes.values()].map((l) => ({
          id: l.id,
          held: l.held ? { x: Math.round(l.held.x), y: HELD_Y, angle: Math.round(l.held.angle * 100) / 100, shape: l.held.shape } : null,
          bodies: l.blocks.map((b) => ({ x: Math.round(b.position.x), y: Math.round(b.position.y), a: Math.round(b.angle * 100) / 100, w: b.shape.w || 0, h: b.shape.h || 0, c: b.shape.c || 0 })),
          balls: l.balls.map((b) => ({ x: Math.round(b.body.position.x), y: Math.round(b.body.position.y) })),
          height: l.height, fired: l.fired, target: l.target,
        })),
      };
    }

    return {
      onInput(pid, msg) {
        const l = lanes.get(pid);
        if (!l || over) return;
        if (phase === 'build') {
          if (msg.type === 'x' && l.held) l.held.x = Math.max(20, Math.min(LANE_W - 20, +msg.x || 0));
          else if (msg.type === 'rot' && l.held) l.held.angle = (l.held.angle + Math.PI / 2 * (msg.dir === -1 ? -1 : 1)) % (Math.PI * 2);
          else if (msg.type === 'drop') drop(l);
        } else if (phase === 'break') {
          if (msg.type === 'fire') fire(pid, msg);
        }
      },
      onLeave(pid) {
        const l = lanes.get(pid);
        if (!l) return;
        Engine.clear(l.engine);
        lanes.delete(pid);
        for (const o of lanes.values()) if (o.target === pid && !o.fired) o.target = null;
        if (lanes.size === 0) { over = true; api.end({}, 'Everyone left.'); return; }
        if (lanes.size === 1 && !over) { finish(); return; } // one builder left: no point waiting out the clock
        api.emit('g:event', { type: 'left', id: pid });
      },
      tick(dt) {
        if (over) return;
        t += dt;
        if (phase === 'build') {
          phaseLeft -= dt;
          for (const l of lanes.values()) {
            if (!l.held) { l.nextIn -= dt; if (l.nextIn <= 0) l.held = { x: LANE_W / 2, angle: 0, shape: randShape() }; }
          }
          if (phaseLeft <= 0) { phase = 'lock'; phaseLeft = T_LOCK; for (const l of lanes.values()) l.held = null; api.emit('g:event', { type: 'phase', phase }); }
        } else if (phase === 'lock') {
          phaseLeft -= dt;
          if (phaseLeft <= 0) { phase = 'break'; phaseLeft = T_BREAK; t = 0; lastFire = -1; api.emit('g:event', { type: 'phase', phase }); }
        } else if (phase === 'break') {
          phaseLeft -= dt;
          const done = phaseLeft <= 0 || (allFired() && t - lastFire >= 5);
          if (done) { phase = 'settle'; phaseLeft = T_SETTLE; api.emit('g:event', { type: 'phase', phase }); }
        } else if (phase === 'settle') {
          phaseLeft -= dt;
          if (phaseLeft <= 0) { phase = 'final'; finish(); }
        }
        stepAll(dt);
        emitAcc += dt;
        if (emitAcc >= 1 / 20) { emitAcc = 0; api.emit('g:state', snap()); }
      },
      destroy() {
        for (const l of lanes.values()) { Engine.clear(l.engine); }
        lanes.clear();
      },
    };
  },
};
