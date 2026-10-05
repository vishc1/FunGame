registerGame('liarsmap', (G) => {
  const { ctx, W, H } = G;
  const CELL = 40, OX = 30, OY = 0;
  const DI = { N: 0, E: 1, S: 2, W: 3 };
  let s = null, maze = null, iAmLiar = false, reveal = null;
  const pos = new Map(); // id -> {x,y} smoothed
  let shake = 0, curDir = null;
  const fx = [];
  const rows = []; // vote rows {id, x,y,w,h}
  let myVote = null;

  const keyDir = () => {
    const k = G.keys;
    if (k.has('w') || k.has('ArrowUp')) return 'N';
    if (k.has('s') || k.has('ArrowDown')) return 'S';
    if (k.has('a') || k.has('ArrowLeft')) return 'W';
    if (k.has('d') || k.has('ArrowRight')) return 'E';
    return null;
  };
  function syncDir() { const d = keyDir(); if (d !== curDir) { curDir = d; G.send({ type: 'dir', d }); } }
  const cx = (x) => OX + x * CELL + CELL / 2, cy = (y) => OY + y * CELL + CELL / 2;

  function drawWalls(walls, color, width, dash) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'square'; ctx.setLineDash(dash || []);
    ctx.beginPath();
    for (let y = 0; y < walls.length; y++) for (let x = 0; x < walls[y].length; x++) {
      const m = walls[y][x], X = OX + x * CELL, Y = OY + y * CELL;
      if (m & 1) { ctx.moveTo(X, Y); ctx.lineTo(X + CELL, Y); }
      if (m & 2) { ctx.moveTo(X + CELL, Y); ctx.lineTo(X + CELL, Y + CELL); }
      if (m & 4) { ctx.moveTo(X, Y + CELL); ctx.lineTo(X + CELL, Y + CELL); }
      if (m & 8) { ctx.moveTo(X, Y); ctx.lineTo(X, Y + CELL); }
    }
    ctx.stroke(); ctx.setLineDash([]);
  }
  function wallSeg(x, y, d) {
    const X = OX + x * CELL, Y = OY + y * CELL;
    return { N: [X, Y, X + CELL, Y], E: [X + CELL, Y, X + CELL, Y + CELL], S: [X, Y + CELL, X + CELL, Y + CELL], W: [X, Y, X, Y + CELL] }[d];
  }

  return {
    state(ns) {
      s = ns;
      if (s.phase !== 'race') curDir = null;
    },
    event(e) {
      if (e.type === 'maze') { maze = e.walls; iAmLiar = e.liar; }
      if (e.type === 'bonk') shake = 0.2;
      if (e.type === 'finish') fx.push({ text: `${G.player(e.id).name} finished #${e.place}!`, t: 2 });
      if (e.type === 'phase' && e.phase === 'vote') { myVote = null; fx.length = 0; }
      if (e.type === 'reveal') { reveal = e; maze = e.trueWalls; }
    },
    key() { if (s && s.phase === 'race') syncDir(); },
    mouse(kind, x, y) {
      if (kind !== 'down' || !s || s.phase !== 'vote') return;
      for (const r of rows) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h && r.id !== G.me) { myVote = r.id; G.send({ type: 'vote', to: r.id }); }
    },
    render(dt) {
      G.clear('#0b0d13');
      if (!s || !maze) { G.text('Loading maze…', W / 2, H / 2); return; }
      shake = Math.max(0, shake - dt);
      // smooth positions
      for (const p of s.players) {
        const tx = cx(p.x), ty = cy(p.y);
        let q = pos.get(p.id); if (!q) { q = { x: tx, y: ty }; pos.set(p.id, q); }
        const k = 1 - Math.pow(0.0001, dt); q.x += (tx - q.x) * k; q.y += (ty - q.y) * k;
      }
      ctx.save();
      if (shake > 0) ctx.translate((Math.random() - 0.5) * 8 * shake * 5, (Math.random() - 0.5) * 8 * shake * 5);
      // start / exit
      ctx.fillStyle = 'rgba(77,166,255,.25)'; ctx.fillRect(OX, OY, CELL, CELL);
      ctx.fillStyle = 'rgba(94,224,122,.35)'; ctx.fillRect(OX + 20 * CELL, OY + 14 * CELL, CELL, CELL);
      G.text('EXIT', cx(20), cy(14), { size: 10, color: '#5ee07a' });
      drawWalls(maze, '#8b91a5', 3);
      if (reveal) {
        for (const d of reveal.diffs) {
          const [x1, y1, x2, y2] = wallSeg(d.x, d.y, d.d);
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
          ctx.strokeStyle = '#ff5d5d'; ctx.lineWidth = 5; ctx.setLineDash(d.kind === 'removed' ? [6, 6] : []); ctx.stroke(); ctx.setLineDash([]);
        }
      }
      // players
      for (const p of s.players) {
        const q = pos.get(p.id), pl = G.player(p.id);
        G.circle(q.x, q.y, 13, pl.color, p.id === G.me ? '#fff' : 'rgba(0,0,0,.4)');
        if (p.fin) G.text('#' + p.fin, q.x, q.y, { size: 11 });
        G.nameTag(q.x, q.y, p.id, -20);
      }
      ctx.restore();
      // banner
      if (s.phase === 'race') {
        const msg = iAmLiar ? "You are the liar — your map is wrong somewhere. Don't look lost." : 'One player sees a different maze. Watch who walks into walls.';
        G.text(msg, W / 2, H - 14, { size: 13, color: iAmLiar ? '#ff9f43' : '#ccc' });
        G.timer(s.left, W - 40, 20);
      } else if (s.phase === 'vote') {
        ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(0, 0, W, H);
        G.text('Who was the liar?', W / 2, 60, { size: 30 });
        G.text(`${Math.ceil(s.left)}s`, W / 2, 95, { size: 18, color: '#ffd84d' });
        rows.length = 0;
        const n = s.players.length, rh = 44, top = 130;
        s.players.forEach((p, i) => {
          const r = { id: p.id, x: W / 2 - 180, y: top + i * (rh + 6), w: 360, h: rh }; rows.push(r);
          const hover = G.mouse.x >= r.x && G.mouse.x <= r.x + r.w && G.mouse.y >= r.y && G.mouse.y <= r.y + r.h;
          ctx.fillStyle = myVote === p.id ? 'rgba(255,93,93,.35)' : hover && p.id !== G.me ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.06)';
          ctx.fillRect(r.x, r.y, r.w, r.h);
          const pl = G.player(p.id);
          G.circle(r.x + 24, r.y + rh / 2, 12, pl.color);
          G.text(pl.name + (p.id === G.me ? ' (you)' : '') + (p.fin ? `  · #${p.fin}` : ''), r.x + 48, r.y + rh / 2, { size: 16, align: 'left' });
          if (p.voted) G.text('voted', r.x + r.w - 14, r.y + rh / 2, { size: 12, align: 'right', color: '#5ee07a' });
        });
        void n;
        G.text(myVote ? 'Vote locked in. You can still change it.' : 'Click a player to accuse them.', W / 2, H - 24, { size: 14, color: '#aaa' });
      } else if (s.phase === 'reveal' && reveal) {
        ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, H);
        const liar = G.player(reveal.liar);
        G.text(`${liar.name} was the liar!`, W / 2, 50, { size: 34, color: liar.color });
        G.text('Red walls were fake. Dashed red = fake openings.', W / 2, 85, { size: 14, color: '#ff8a8a' });
        const voters = Object.entries(reveal.votes);
        voters.forEach(([by, to], i) => {
          const a = G.player(by), b = G.player(to);
          G.text(`${a.name} → ${b.name}`, W / 2, 120 + i * 22, { size: 15, color: to === reveal.liar ? '#5ee07a' : '#ddd' });
        });
      }
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t -= dt; if (f.t <= 0) fx.splice(i, 1); else G.text(f.text, W / 2, 24 + i * 24, { size: 18, color: '#ffd84d' }); }
    },
    destroy() {},
  };
});
