// Rocket Soccer: top-down car soccer, up to 3v3, boost, demolitions, overtime.
// Testing: set api.memory.__fast = true (≈8 s) or a number of seconds before create() to shorten the match;
// in fast mode overtime is also capped at that length (ends as a draw) so headless runs always terminate.
const FX0 = 60, FX1 = 840, FY0 = 40, FY1 = 560, GY0 = 220, GY1 = 380, GD = 30, CUT = 70;
const BR = 18, CR = 16, MATCH = 180, OT_MAX = 120, MAX_BALL = 1500;
const PADS = [[200, 120], [700, 120], [200, 480], [700, 480], [450, 100], [450, 500]];
const KICK = {
  blue: [[200, 300, 0], [300, 170, 0], [300, 430, 0]],
  orange: [[700, 300, Math.PI], [600, 170, Math.PI], [600, 430, Math.PI]],
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- shared car physics (same model as memekarts) --------------------------
function stepCar(c, dt, o) {
  const cos = Math.cos(c.a), sin = Math.sin(c.a);
  let fwd = c.vx * cos + c.vy * sin;
  let lat = -c.vx * sin + c.vy * cos;
  const ctl = c.ctl || {};
  if (ctl.up && fwd < o.maxF) fwd = Math.min(o.maxF, fwd + o.accel * dt);
  if (ctl.down && fwd > -o.maxR) fwd = Math.max(-o.maxR, fwd - o.accel * dt);
  if (o.thrust && fwd < o.maxF) fwd = Math.min(o.maxF, fwd + o.thrust * dt);
  const steer = (ctl.right ? 1 : 0) - (ctl.left ? 1 : 0);
  c.a += steer * o.turn * Math.min(1, Math.abs(fwd) / 80) * dt;
  fwd *= Math.pow(0.985, 60 * dt);
  if (!ctl.up && !ctl.down && !o.thrust) fwd *= Math.pow(0.6, dt);
  lat *= Math.pow(0.02, dt);
  const c2 = Math.cos(c.a), s2 = Math.sin(c.a);
  c.vx = c2 * fwd - s2 * lat; c.vy = s2 * fwd + c2 * lat;
  c.x += c.vx * dt; c.y += c.vy * dt;
}
// Pitch walls: rectangle with cut corners and two goal pockets.
function pitchCollide(o, r, rest) {
  const inMouth = o.y > GY0 + r && o.y < GY1 - r;
  // left pocket / post
  if (o.x < FX0 + r) {
    if (o.x < FX0 || inMouth) {
      if (o.x < FX0 - GD + r) { o.x = FX0 - GD + r; if (o.vx < 0) o.vx = -o.vx * rest; }
      if (!inMouth) { if (o.y <= GY0 + r) { o.y = GY0 + r; if (o.vy < 0) o.vy = -o.vy * rest; } else { o.y = GY1 - r; if (o.vy > 0) o.vy = -o.vy * rest; } }
    } else { o.x = FX0 + r; if (o.vx < 0) o.vx = -o.vx * rest; }
  }
  // right pocket / post
  if (o.x > FX1 - r) {
    if (o.x > FX1 || inMouth) {
      if (o.x > FX1 + GD - r) { o.x = FX1 + GD - r; if (o.vx > 0) o.vx = -o.vx * rest; }
      if (!inMouth) { if (o.y <= GY0 + r) { o.y = GY0 + r; if (o.vy < 0) o.vy = -o.vy * rest; } else { o.y = GY1 - r; if (o.vy > 0) o.vy = -o.vy * rest; } }
    } else { o.x = FX1 - r; if (o.vx > 0) o.vx = -o.vx * rest; }
  }
  if (o.y < FY0 + r) { o.y = FY0 + r; if (o.vy < 0) o.vy = -o.vy * rest; }
  if (o.y > FY1 - r) { o.y = FY1 - r; if (o.vy > 0) o.vy = -o.vy * rest; }
  // cut corners: normals point into the pitch
  const S = Math.SQRT1_2;
  const corners = [
    { nx: S, ny: S, d: (FX0 + FY0 + CUT) * S },     // top-left: x+y >= FX0+FY0+CUT
    { nx: -S, ny: S, d: (-FX1 + FY0 + CUT) * S },   // top-right: -x+y >= -FX1+FY0+CUT
    { nx: S, ny: -S, d: (FX0 - FY1 + CUT) * S },    // bottom-left
    { nx: -S, ny: -S, d: (-FX1 - FY1 + CUT) * S },  // bottom-right
  ];
  for (const c of corners) {
    const dist = o.x * c.nx + o.y * c.ny - c.d;
    if (dist < r) { const p = r - dist; o.x += c.nx * p; o.y += c.ny * p; const vn = o.vx * c.nx + o.vy * c.ny; if (vn < 0) { o.vx -= c.nx * vn * (1 + rest); o.vy -= c.ny * vn * (1 + rest); } }
  }
}
function circleHit(a, b, ra, rb, rest) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d >= ra + rb || d === 0) return false;
  const nx = dx / d, ny = dy / d, ov = ra + rb - d;
  a.x -= nx * ov / 2; a.y -= ny * ov / 2; b.x += nx * ov / 2; b.y += ny * ov / 2;
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv < 0) { const imp = -rv * (1 + rest) / 2; a.vx -= nx * imp; a.vy -= ny * imp; b.vx += nx * imp; b.vy += ny * imp; }
  return true;
}

module.exports = {
  id: 'rocketsoccer',
  name: 'Rocket Soccer',
  tagline: 'Top-down car soccer, 3v3. Boost into the ball. Clutch goals.',
  min: 2, max: 8,
  controls: 'WASD / arrows to drive, Shift to boost. Blue scores right, Orange scores left.',
  create(api) {
    const cars = new Map();
    const roster = { blue: [], orange: [] };
    const field = { blue: [], orange: [] };
    const score = { blue: 0, orange: 0 };
    const pads = PADS.map(([x, y]) => ({ x, y, t: 0 }));
    const ball = { x: 450, y: 300, vx: 0, vy: 0, last: null, prev: null };
    const fast = api.memory.__fast; const LEN = fast ? (typeof fast === 'number' ? fast : 8) : MATCH; let t = LEN, otLeft = fast ? LEN : OT_MAX, ot = false, freeze = 0, over = false, endAfterFreeze = false, vi = 0, msg = 'KICKOFF';

    function addPlayer(id, immediate) {
      const team = roster.blue.length <= roster.orange.length ? 'blue' : 'orange';
      roster[team].push(id);
      const k = KICK[team][0];
      cars.set(id, { id, team, x: k[0], y: k[1], a: k[2], vx: 0, vy: 0, ctl: {}, boost: 100, boosting: false, dead: 0, goals: 0, assists: 0, saves: 0, v: vi++ % 8 });
      if (immediate && field[team].length < 3) { field[team].push(id); const c = cars.get(id); const g = team === 'blue' ? [FX0 + 30, 300, 0] : [FX1 - 30, 300, Math.PI]; c.x = g[0]; c.y = g[1]; c.a = g[2]; }
    }
    for (const p of api.players()) addPlayer(p.id, false);

    function kickoff() {
      for (const team of ['blue', 'orange']) {
        field[team] = roster[team].slice(0, 3);
        field[team].forEach((id, i) => { const c = cars.get(id); const k = KICK[team][i]; Object.assign(c, { x: k[0], y: k[1], a: k[2], vx: 0, vy: 0, dead: 0, boost: Math.max(c.boost, 40) }); });
      }
      Object.assign(ball, { x: 450, y: 300, vx: 0, vy: 0, last: null, prev: null });
      for (const p of pads) p.t = 0;
      api.emit('g:event', { type: 'kickoff' });
    }
    kickoff();

    function onField() { return [...field.blue, ...field.orange].map((id) => cars.get(id)).filter(Boolean); }

    function goal(team) {
      score[team]++;
      const last = ball.last, prev = ball.prev;
      const own = !!(last && last.team !== team);
      let scorer = null, assist = null;
      if (last && !own) { scorer = last.id; const c = cars.get(scorer); if (c) c.goals++; if (prev && prev.team === team && prev.id !== scorer) { assist = prev.id; const a = cars.get(assist); if (a) a.assists++; } }
      api.emit('g:event', { type: 'goal', team, scorer: own ? (last ? last.id : null) : scorer, own, assist });
      msg = own ? 'OWN GOAL!' : 'GOAL!';
      freeze = 3;
      // rotate benches
      for (const tm of ['blue', 'orange']) if (roster[tm].length > 3) roster[tm].push(roster[tm].shift());
      if (ot) endAfterFreeze = true;
    }

    function finish() {
      if (over) return; over = true;
      const winner = score.blue > score.orange ? 'blue' : score.orange > score.blue ? 'orange' : null;
      const pts = {};
      for (const c of cars.values()) pts[c.id] = (winner && c.team === winner ? 5 : 0) + c.goals * 2 + c.assists + c.saves;
      let mvp = null;
      for (const c of cars.values()) if (!mvp || pts[c.id] > pts[mvp.id]) mvp = c;
      const mp = mvp && api.player(mvp.id);
      api.emit('g:event', { type: 'over', winner });
      api.after(2500, () => api.end(pts, `Blue ${score.blue} – ${score.orange} Orange.${winner ? ` ${winner[0].toUpperCase() + winner.slice(1)} wins (+5 each).` : ' Draw.'}${mp ? ` MVP: ${mp.name}.` : ''} +2 goal, +1 assist, +1 save.`));
    }

    return {
      onJoin(pid) { if (!cars.has(pid)) addPlayer(pid, true); },
      onLeave(pid) {
        const c = cars.get(pid); if (!c) return;
        cars.delete(pid);
        roster[c.team] = roster[c.team].filter((id) => id !== pid);
        field[c.team] = field[c.team].filter((id) => id !== pid);
        if (!over && cars.size < 2) { finish(); return; } // nobody left to play against
        // sub a benched teammate straight in
        const bench = roster[c.team].find((id) => !field[c.team].includes(id));
        if (bench) { field[c.team].push(bench); const b = cars.get(bench); const g = c.team === 'blue' ? [FX0 + 30, 300, 0] : [FX1 - 30, 300, Math.PI]; Object.assign(b, { x: g[0], y: g[1], a: g[2], vx: 0, vy: 0 }); }
      },
      onInput(pid, msgIn) {
        const c = cars.get(pid); if (!c || over) return;
        if (msgIn.type === 'ctl') c.ctl = { up: !!msgIn.up, down: !!msgIn.down, left: !!msgIn.left, right: !!msgIn.right, boost: !!msgIn.boost };
      },
      tick(dt) {
        if (over) return;
        if (freeze > 0) {
          freeze -= dt;
          if (freeze <= 0) { freeze = 0; if (endAfterFreeze) { finish(); return; } kickoff(); msg = ot ? 'OVERTIME — next goal wins' : ''; }
          api.emit('g:state', snap()); return;
        }
        if (msg && t < MATCH - 2) msg = ot ? 'OVERTIME — next goal wins' : '';
        if (!ot) { t -= dt; if (t <= 0) { t = 0; if (score.blue === score.orange) { ot = true; msg = 'OVERTIME — next goal wins'; } else { finish(); return; } } }
        else { otLeft -= dt; if (otLeft <= 0) { finish(); return; } } // overtime is next-goal-wins, capped at OT_MAX (draw)
        const live = onField();
        for (const c of live) {
          if (c.dead > 0) { c.dead -= dt; if (c.dead <= 0) { c.dead = 0; const g = c.team === 'blue' ? [FX0 + 30, 300, 0] : [FX1 - 30, 300, Math.PI]; Object.assign(c, { x: g[0], y: g[1], a: g[2], vx: 0, vy: 0, inv: 1 }); } continue; }
          if (c.inv > 0) c.inv -= dt;
          c.boosting = !!(c.ctl.boost && c.boost > 0);
          if (c.boosting) c.boost = Math.max(0, c.boost - 35 * dt); else c.boost = Math.min(100, c.boost + 10 * dt);
          stepCar(c, dt, { maxF: c.boosting ? 420 : 300, maxR: 150, accel: c.boosting ? 700 : 420, thrust: c.boosting ? 700 : 0, turn: 3.2 });
          pitchCollide(c, CR, 0.4);
          for (const p of pads) { if (p.t > 0) { continue; } if (Math.hypot(c.x - p.x, c.y - p.y) < 22) { c.boost = Math.min(100, c.boost + 25); p.t = 4; } }
        }
        for (const p of pads) if (p.t > 0) p.t -= dt;
        const act = live.filter((c) => !c.dead);
        for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
          const a = act[i], b = act[j];
          const sa = Math.hypot(a.vx, a.vy), sb = Math.hypot(b.vx, b.vy);
          if (circleHit(a, b, CR, CR, 0.5)) {
            if (a.boosting && sa > 350 && !(b.inv > 0) && a.team !== b.team) { b.dead = 2; api.emit('g:event', { type: 'demo', by: a.id, victim: b.id, x: Math.round(b.x), y: Math.round(b.y) }); }
            else if (b.boosting && sb > 350 && !(a.inv > 0) && a.team !== b.team) { a.dead = 2; api.emit('g:event', { type: 'demo', by: b.id, victim: a.id, x: Math.round(a.x), y: Math.round(a.y) }); }
          }
        }
        // car-ball
        for (const c of act) {
          const dx = ball.x - c.x, dy = ball.y - c.y, d = Math.hypot(dx, dy);
          if (d >= CR + BR || d === 0) continue;
          const nx = dx / d, ny = dy / d;
          ball.x = c.x + nx * (CR + BR); ball.y = c.y + ny * (CR + BR);
          const beforeVx = ball.vx;
          const rv = (ball.vx - c.vx) * nx + (ball.vy - c.vy) * ny;
          if (rv < 0) { ball.vx -= nx * rv * 1.9; ball.vy -= ny * rv * 1.9; }
          const along = c.vx * nx + c.vy * ny;
          if (along > 0) { ball.vx += nx * along * 0.6 + (-ny) * along * 0.15; ball.vy += ny * along * 0.6 + nx * along * 0.15; }
          const sp = Math.hypot(c.vx, c.vy);
          if (c.boosting && sp > 350) { ball.vx *= 2.2; ball.vy *= 2.2; api.emit('g:event', { type: 'power', id: c.id, x: Math.round(ball.x), y: Math.round(ball.y) }); }
          const bs = Math.hypot(ball.vx, ball.vy); if (bs > MAX_BALL) { ball.vx *= MAX_BALL / bs; ball.vy *= MAX_BALL / bs; }
          // save: last touch near own goal line that sends the ball back out
          if (c.team === 'blue' && ball.x < FX0 + 60 && beforeVx < 0 && ball.vx > 0) { c.saves++; api.emit('g:event', { type: 'save', id: c.id }); }
          if (c.team === 'orange' && ball.x > FX1 - 60 && beforeVx > 0 && ball.vx < 0) { c.saves++; api.emit('g:event', { type: 'save', id: c.id }); }
          if (!ball.last || ball.last.id !== c.id) { ball.prev = ball.last; ball.last = { id: c.id, team: c.team }; }
        }
        ball.vx *= Math.pow(0.995, 60 * dt); ball.vy *= Math.pow(0.995, 60 * dt);
        ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        pitchCollide(ball, BR, 0.9);
        ball.x = clamp(ball.x, FX0 - GD + BR, FX1 + GD - BR); ball.y = clamp(ball.y, FY0 + BR, FY1 - BR);
        // goal when the ball's centre is clearly across the line (the 30px pocket is shallower than the 36px ball)
        if (ball.x < FX0 - 6) goal('orange');
        else if (ball.x > FX1 + 6) goal('blue');
        api.emit('g:state', snap());
      },
      destroy() {},
    };
    function snap() {
      const onf = new Set([...field.blue, ...field.orange]);
      return {
        t: Math.ceil(t), ot: ot ? 1 : 0, otl: Math.max(0, Math.ceil(otLeft)), freeze: +freeze.toFixed(1), msg,
        score: { blue: score.blue, orange: score.orange },
        ball: { x: Math.round(ball.x), y: Math.round(ball.y) },
        cars: [...cars.values()].filter((c) => onf.has(c.id)).map((c) => ({ id: c.id, team: c.team, x: Math.round(c.x), y: Math.round(c.y), a: +c.a.toFixed(2), boost: Math.round(c.boost), bst: c.boosting ? 1 : 0, dead: c.dead > 0 ? 1 : 0, v: c.v, g: c.goals, s: c.saves })),
        bench: [...cars.values()].filter((c) => !onf.has(c.id)).map((c) => ({ id: c.id, team: c.team })),
        pads: pads.map((p) => (p.t > 0 ? 0 : 1)),
      };
    }
  },
};
