registerGame('shadowtag', (G) => {
  const { ctx, W, H } = G;
  const R = 14, CONE = (55 * Math.PI) / 180, LEN = 280, RAYS = 40;
  let s = null, walls = [];
  let lastMove = { dx: 0, dy: 0 }, aimT = 0, lastAim = null;
  const fx = [];
  const me = () => s && s.players.find((p) => p.id === G.me);

  function rayCast(ox, oy, a) {
    const dx = Math.cos(a), dy = Math.sin(a); let best = LEN;
    for (const w of walls) {
      // slab test
      let t0 = 0, t1 = best;
      const P = [-dx, dx, -dy, dy], Q = [ox - w.x, w.x + w.w - ox, oy - w.y, w.y + w.h - oy];
      let ok = true;
      for (let i = 0; i < 4 && ok; i++) {
        if (P[i] === 0) { if (Q[i] < 0) ok = false; }
        else { const t = Q[i] / P[i]; if (P[i] < 0) { if (t > t1) ok = false; else if (t > t0) t0 = t; } else { if (t < t0) ok = false; else if (t < t1) t1 = t; } }
      }
      if (ok && t0 < best) best = Math.max(0, t0);
    }
    return best;
  }
  function conePoly(p) {
    const pts = [[p.x, p.y]];
    for (let i = 0; i <= RAYS; i++) { const a = p.aim - CONE / 2 + (CONE * i) / RAYS; const d = rayCast(p.x, p.y, a); pts.push([p.x + Math.cos(a) * d, p.y + Math.sin(a) * d]); }
    return pts;
  }
  function segHitsRect(x1, y1, x2, y2, w) {
    let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
    const P = [-dx, dx, -dy, dy], Q = [x1 - w.x, w.x + w.w - x1, y1 - w.y, w.y + w.h - y1];
    for (let i = 0; i < 4; i++) {
      if (P[i] === 0) { if (Q[i] < 0) return false; }
      else { const t = Q[i] / P[i]; if (P[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } }
    }
    return true;
  }
  function litBy(l, p) {
    if (!l.lightOn || l.id === p.id) return false;
    const dx = p.x - l.x, dy = p.y - l.y, d = Math.hypot(dx, dy);
    if (d > LEN + R) return false;
    let da = Math.atan2(dy, dx) - l.aim; da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > CONE / 2 + Math.asin(Math.min(1, R / Math.max(d, R)))) return false;
    for (const w of walls) if (segHitsRect(l.x, l.y, p.x, p.y, w)) return false;
    return true;
  }
  function pathPoly(pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }

  function sendMove() {
    let dx = 0, dy = 0;
    if (G.keys.has('a') || G.keys.has('ArrowLeft')) dx -= 1; if (G.keys.has('d') || G.keys.has('ArrowRight')) dx += 1;
    if (G.keys.has('w') || G.keys.has('ArrowUp')) dy -= 1; if (G.keys.has('s') || G.keys.has('ArrowDown')) dy += 1;
    if (dx !== lastMove.dx || dy !== lastMove.dy) { lastMove = { dx, dy }; G.send({ type: 'move', dx, dy }); }
  }

  return {
    state(ns) { s = ns; },
    event(e) {
      if (e.type === 'init') walls = e.walls;
      if (e.type === 'tag') fx.push({ text: `${G.player(e.from).name} tagged ${G.player(e.to).name}!`, t: 2 });
      if (e.type === 'over') fx.push({ text: `${G.player(e.winner).name} wins!`, t: 3 });
    },
    key(k, down) { if (down && k === 'f') G.send({ type: 'light' }); sendMove(); },
    mouse(kind) { if (kind === 'down') G.send({ type: 'light' }); },
    render(dt) {
      G.clear('#04050a');
      if (!s) { G.text('Waiting…', W / 2, H / 2); return; }
      sendMove();
      const m = me();
      aimT += dt;
      if (m && aimT > 1 / 15) { aimT = 0; const a = Math.atan2(G.mouse.y - m.y, G.mouse.x - m.x); if (a !== lastAim) { lastAim = a; G.send({ type: 'aim', a }); } }
      // dim walls
      ctx.fillStyle = 'rgba(255,255,255,.10)'; for (const w of walls) ctx.fillRect(w.x, w.y, w.w, w.h);
      // cones
      const polys = [];
      for (const p of s.players) {
        if (!p.lightOn) continue;
        const poly = conePoly(p); polys.push(poly);
        const red = p.id === s.tagger;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, LEN);
        g.addColorStop(0, red ? 'rgba(255,80,80,.40)' : 'rgba(255,245,200,.35)'); g.addColorStop(1, red ? 'rgba(255,80,80,0)' : 'rgba(255,245,200,0)');
        pathPoly(poly); ctx.fillStyle = g; ctx.fill();
        ctx.save(); pathPoly(poly); ctx.clip(); ctx.fillStyle = red ? '#5a3030' : '#4a4a3a'; for (const w of walls) ctx.fillRect(w.x, w.y, w.w, w.h); ctx.restore();
      }
      // players (only if lit)
      let visible = 0;
      for (const p of s.players) {
        const lit = s.players.some((l) => litBy(l, p));
        if (!lit) continue; visible++;
        const pl = G.player(p.id);
        G.circle(p.x, p.y, R, pl.color, p.id === s.tagger ? '#ff3b3b' : 'rgba(255,255,255,.5)');
        if (p.id === s.tagger) { ctx.lineWidth = 3; ctx.strokeStyle = '#ff3b3b'; ctx.beginPath(); ctx.arc(p.x, p.y, R + 4, 0, Math.PI * 2); ctx.stroke(); }
        G.nameTag(p.x, p.y, p.id, -24);
      }
      // my faint marker + aim
      if (m) {
        ctx.globalAlpha = 0.2; G.circle(m.x, m.y, R, '#fff'); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x + Math.cos(m.aim) * 40, m.y + Math.sin(m.aim) * 40); ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1; ctx.stroke();
      }
      // HUD
      G.timer(90 - s.t);
      G.text(`${visible} visible`, 70, 24, { size: 14, color: '#aaa' });
      if (m) G.text(`Light: ${m.lightOn ? 'ON' : 'OFF'} (F)`, 70, 44, { size: 13, color: m.lightOn ? '#ffe28a' : '#777' });
      if (m && m.id === s.tagger) G.text("YOU'RE IT — hunt by their light", W / 2, H - 22, { size: 20, color: '#ff5d5d' });
      else if (m && m.immune) G.text('Safe for a moment…', W / 2, H - 22, { size: 14, color: '#aaa' });
      const ranked = s.players.slice().sort((a, b) => a.itTime - b.itTime);
      ranked.forEach((p, i) => G.text(`${G.player(p.id).name} ${p.itTime.toFixed(1)}s${p.id === s.tagger ? ' ◀' : ''}`, W - 16, 20 + i * 18, { size: 13, align: 'right', color: p.id === s.tagger ? '#ff5d5d' : G.player(p.id).color }));
      if (s.countdown > 0) G.text(Math.ceil(s.countdown), W / 2, H / 2, { size: 90 });
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t -= dt; if (f.t <= 0) fx.splice(i, 1); else G.text(f.text, W / 2, 70 + i * 26, { size: 22, color: '#ffd84d' }); }
    },
  };
});
