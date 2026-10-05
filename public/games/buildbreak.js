registerGame('buildbreak', (G) => {
  const { ctx, W, H } = G;
  const LANE_W = 400, LANE_H = 600, GROUND_W = 260, GROUND_TOP = 560, GROUND_H = 40;
  let s = null;
  let target = null;          // selected target lane id (break phase)
  let drag = null;            // {x0,y0} in lane coords of main view
  let lastX = 0, lastXSent = 0;
  const fx = [];
  let finalRows = null;
  const thumbs = [];          // clickable thumbnail rects {x,y,w,h,id}

  const myLane = () => s && s.lanes.find((l) => l.id === G.me);
  const lane = (id) => s && s.lanes.find((l) => l.id === id);
  // main view is always drawn at origin (0,0) scale 1 in canvas space (lane 400x600)
  const inMain = (x, y) => x >= 0 && x < LANE_W && y >= 0 && y < LANE_H;

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
  }
  function rrect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawBlock(b, color, ghost) {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a || b.angle || 0);
    ctx.globalAlpha = ghost ? 0.55 : 1;
    ctx.fillStyle = color; ctx.strokeStyle = shade(color, 0.55); ctx.lineWidth = 2;
    if (b.c) { ctx.beginPath(); ctx.arc(0, 0, b.c, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    else { rrect(-b.w / 2, -b.h / 2, b.w, b.h, Math.min(6, b.w / 4, b.h / 4)); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }
  function drawLane(l, x, y, scale, big) {
    const p = G.player(l.id);
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.fillStyle = '#141826'; ctx.fillRect(0, 0, LANE_W, LANE_H);
    // height marks
    if (big) { ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1; for (let hy = GROUND_TOP - 100; hy > 0; hy -= 100) { ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(LANE_W, hy); ctx.stroke(); } }
    // ground
    ctx.fillStyle = '#5a4634'; ctx.fillRect(LANE_W / 2 - GROUND_W / 2, GROUND_TOP, GROUND_W, GROUND_H);
    ctx.fillStyle = '#7a5f45'; ctx.fillRect(LANE_W / 2 - GROUND_W / 2, GROUND_TOP, GROUND_W, 6);
    for (const b of l.bodies) drawBlock(b, p.color);
    if (l.held) drawBlock({ x: l.held.x, y: l.held.y, a: l.held.angle, w: l.held.shape.w, h: l.held.shape.h, c: l.held.shape.c }, p.color, true);
    if (l.held && big) { ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.moveTo(l.held.x, l.held.y); ctx.lineTo(l.held.x, GROUND_TOP); ctx.stroke(); ctx.setLineDash([]); }
    for (const b of (l.balls || [])) {
      ctx.strokeStyle = '#777'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(-20, -40); ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x, b.y, 24, 0, Math.PI * 2); ctx.fillStyle = '#3a3d47'; ctx.fill(); ctx.strokeStyle = '#1b1d24'; ctx.lineWidth = 3; ctx.stroke();
    }
    // height line
    if (l.height > 0) { const hy = GROUND_TOP - l.height; ctx.strokeStyle = 'rgba(255,216,77,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(LANE_W, hy); ctx.stroke(); }
    ctx.restore();
  }

  function sendX(x) {
    const now = performance.now();
    if (now - lastXSent < 50 || Math.abs(x - lastX) < 1) return;
    lastXSent = now; lastX = x; G.send({ type: 'x', x });
  }
  function fire(x1, y1) {
    if (!drag || !target) { drag = null; return; }
    const vx = (x1 - drag.x0) * 0.09, vy = (y1 - drag.y0) * 0.09;
    drag = null;
    if (Math.hypot(vx, vy) < 1) return;
    G.send({ type: 'fire', target, vx, vy });
  }

  return {
    state(ns) {
      s = ns;
      if (s.phase !== 'build' && target && !lane(target)) target = null;
      if (s.phase === 'break' && !target) { const o = s.lanes.find((l) => l.id !== G.me); if (o) target = o.id; }
    },
    event(e) {
      if (e.type === 'phase') fx.push({ text: e.phase === 'lock' ? 'Towers locked!' : e.phase === 'break' ? 'BREAK! One shot each.' : e.phase === 'settle' ? 'Settling…' : '', t: 2 });
      if (e.type === 'fire') { const a = G.player(e.by), b = G.player(e.target); fx.push({ text: `${a.name} fires at ${b.name}!`, t: 1.8 }); }
      if (e.type === 'final') finalRows = e.rows;
    },
    key(k, down) {
      if (!down || !s) return;
      if (s.phase === 'build') {
        const ml = myLane(); if (!ml || !ml.held) return;
        if (k === 'a' || k === 'ArrowLeft') { lastXSent = 0; sendX(ml.held.x - 20); }
        else if (k === 'd' || k === 'ArrowRight') { lastXSent = 0; sendX(ml.held.x + 20); }
        else if (k === 'q') G.send({ type: 'rot', dir: -1 });
        else if (k === 'e' || k === 'w' || k === 'ArrowUp') G.send({ type: 'rot', dir: 1 });
        else if (k === ' ' || k === 'ArrowDown') G.send({ type: 'drop' });
      }
    },
    mouse(kind, x, y) {
      if (!s) return;
      if (s.phase === 'build') {
        if (kind === 'move' || kind === 'down') { if (inMain(x, y)) sendX(x); }
        if (kind === 'down' && inMain(x, y)) G.send({ type: 'drop' });
      } else if (s.phase === 'break') {
        const ml = myLane();
        if (kind === 'down') {
          const th = thumbs.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
          if (th) { if (!ml || !ml.fired) target = th.id; return; }
          if (ml && !ml.fired && target && inMain(x, y)) drag = { x0: x, y0: y };
        } else if (kind === 'up' && drag) fire(x, y);
      }
    },
    render(dt) {
      G.clear('#0b0d13');
      thumbs.length = 0;
      if (!s) { G.text('Waiting for state…', W / 2, H / 2); return; }
      const ml = myLane();
      const build = s.phase === 'build' || s.phase === 'lock';
      const mainId = build ? G.me : (target || (s.lanes[0] && s.lanes[0].id));
      const main = lane(mainId);
      // main view
      if (main) drawLane(main, 0, 0, 1, true);
      else { ctx.fillStyle = '#141826'; ctx.fillRect(0, 0, LANE_W, LANE_H); G.text('No tower', 200, 300); }
      // aim line / ghost ball
      if (s.phase === 'break' && main && main.id !== G.me) {
        ctx.beginPath(); ctx.arc(30, 120, 24, 0, Math.PI * 2); ctx.fillStyle = 'rgba(60,63,71,.5)'; ctx.fill(); ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.stroke();
        if (drag) {
          const vx = (G.mouse.x - drag.x0) * 0.09, vy = (G.mouse.y - drag.y0) * 0.09;
          // simple trajectory preview (gravity ~1 px/frame^2 at 60fps -> matter gravity scale)
          ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
          ctx.beginPath(); ctx.moveTo(30, 120);
          let px = 30, py = 120, pvx = vx, pvy = vy;
          for (let i = 0; i < 40; i++) { px += pvx; py += pvy; pvy += 1; ctx.lineTo(px, py); }
          ctx.stroke(); ctx.setLineDash([]);
          G.text(`power ${Math.round(Math.hypot(vx, vy))}`, drag.x0, drag.y0 - 16, { size: 13 });
        }
      }
      ctx.strokeStyle = '#2a2f3f'; ctx.lineWidth = 2; ctx.strokeRect(0.5, 0.5, LANE_W - 1, LANE_H - 1);
      if (main) {
        const p = G.player(main.id);
        G.text(main.id === G.me ? 'Your tower' : `${p.name}'s tower`, LANE_W / 2, 20, { size: 16, color: p.color });
        G.text(`${main.height}px`, LANE_W - 36, 20, { size: 14, color: '#ffd84d' });
      }
      // thumbnails (right side)
      const others = s.lanes.filter((l) => l.id !== (build ? G.me : null));
      const sc = 0.25, tw = LANE_W * sc, th = LANE_H * sc;
      const cols = 4, gx = 420, gy = 60, gap = 12;
      others.forEach((l, i) => {
        const x = gx + (i % cols) * (tw + gap), y = gy + Math.floor(i / cols) * (th + 34);
        drawLane(l, x, y, sc, false);
        const p = G.player(l.id);
        const sel = !build && l.id === target;
        ctx.strokeStyle = sel ? '#5ee07a' : l.id === G.me ? '#fff' : '#2a2f3f'; ctx.lineWidth = sel ? 3 : 1; ctx.strokeRect(x, y, tw, th);
        G.text(`${p.name}${l.id === G.me ? ' (you)' : ''}`, x + tw / 2, y + th + 10, { size: 12, color: p.color });
        G.text(`${l.height}px${!build && l.fired ? ' • fired' : ''}`, x + tw / 2, y + th + 24, { size: 11, color: '#aaa' });
        if (!build && l.id !== G.me) thumbs.push({ x, y, w: tw, h: th + 30, id: l.id });
      });
      // HUD right column
      const hx = 420;
      G.text(s.phase === 'build' ? 'BUILD' : s.phase === 'lock' ? 'LOCKED' : s.phase === 'break' ? 'BREAK' : s.phase === 'settle' ? 'SETTLING' : 'RESULTS', hx, 24, { size: 18, align: 'left' });
      if (s.phase === 'build' || s.phase === 'break') G.timer(s.left, W - 40, 24);
      if (s.phase === 'build') G.text('A/D or mouse: move • Q/E: rotate • Space/click: drop', W - 16, H - 16, { size: 12, align: 'right', color: '#8b91a5' });
      if (s.phase === 'break') {
        if (ml && ml.fired) G.text('You have fired. Watch the carnage.', W - 16, H - 16, { size: 13, align: 'right', color: '#8b91a5' });
        else G.text('Click a tower to target • drag & release in the big view to fire', W - 16, H - 16, { size: 12, align: 'right', color: '#8b91a5' });
        const left = s.lanes.filter((l) => !l.fired).map((l) => G.player(l.id).name);
        G.text(`Shots left: ${left.length ? left.join(', ') : 'none'}`, hx, H - 40, { size: 13, align: 'left', color: '#ddd' });
      }
      if (finalRows) {
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(420, 200, 460, 60 + finalRows.length * 24);
        G.text('Tallest surviving towers', 650, 224, { size: 18, color: '#ffd84d' });
        finalRows.forEach((r, i) => { const p = G.player(r.id); G.text(`${i + 1}. ${p.name} — ${r.height}px${r.hit ? '  (+2 demolition)' : ''}`, 650, 252 + i * 24, { size: 15, color: p.color }); });
      }
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t -= dt; if (f.t <= 0) fx.splice(i, 1); else if (f.text) G.text(f.text, LANE_W / 2, 60 + i * 26, { size: 22, color: '#ffd84d' }); }
    },
    destroy() {},
  };
});
