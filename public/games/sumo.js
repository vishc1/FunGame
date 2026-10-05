registerGame('sumo', (G) => {
  const { ctx, W, H } = G;
  const CX = 450, CY = 300, R = 22;
  let s = null;
  const fx = []; // {x,y,t,color}
  const me = () => s && s.blobs.find((b) => b.id === G.me);

  function dash() { const m = me(); if (m && m.alive && m.cd <= 0) G.send({ type: 'dash', x: G.mouse.x, y: G.mouse.y }); }

  return {
    state(ns) { s = ns; },
    event(e) {
      if (e.type === 'out') { const p = G.player(e.id); fx.push({ text: `${p.name} is out!`, t: 1.5 }); }
      if (e.type === 'over') { const p = G.player(e.winner); fx.push({ text: `${p.name} wins!`, t: 3 }); }
    },
    key(k, down) { if (down && k === ' ') dash(); },
    mouse(kind) { if (kind === 'down') dash(); },
    render(dt) {
      G.clear('#0b0d13');
      if (!s) { G.text('Waiting for state…', W / 2, H / 2); return; }
      // arena
      ctx.beginPath(); ctx.arc(CX, CY, s.arena, 0, Math.PI * 2);
      ctx.fillStyle = '#e8d9b5'; ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = '#b4453a'; ctx.stroke();
      ctx.beginPath(); ctx.arc(CX, CY, s.arena * 0.4, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(180,69,58,.35)'; ctx.stroke();
      // blobs
      for (const b of s.blobs) {
        if (!b.alive) continue;
        const p = G.player(b.id);
        ctx.beginPath(); ctx.arc(b.x, b.y + 4, R, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fill();
        G.circle(b.x, b.y, R, p.color, b.id === G.me ? '#fff' : 'rgba(0,0,0,.4)');
        // eyes toward mouse-ish
        G.circle(b.x - 7, b.y - 4, 4, '#fff'); G.circle(b.x + 7, b.y - 4, 4, '#fff');
        G.circle(b.x - 6, b.y - 4, 2, '#111'); G.circle(b.x + 8, b.y - 4, 2, '#111');
        if (b.cd > 0) { ctx.beginPath(); ctx.arc(b.x, b.y, R + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - b.cd / 0.9)); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 3; ctx.stroke(); }
        G.nameTag(b.x, b.y, b.id, -32);
      }
      // aim line for me
      const m = me();
      if (m && m.alive) {
        const dx = G.mouse.x - m.x, dy = G.mouse.y - m.y, d = Math.hypot(dx, dy) || 1;
        ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x + dx / d * 70, m.y + dy / d * 70);
        ctx.strokeStyle = m.cd <= 0 ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.25)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
      } else if (m && !m.alive) G.text('You fell off. Spectating…', W / 2, H - 20, { size: 14, color: '#aaa' });
      // hud
      const alive = s.blobs.filter((b) => b.alive).length;
      G.text(`${alive} left`, 60, 24, { size: 16 });
      G.timer(60 - s.t);
      if (s.countdown > 0) G.text(Math.ceil(s.countdown), W / 2, H / 2, { size: 90 });
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t -= dt; if (f.t <= 0) fx.splice(i, 1); else G.text(f.text, W / 2, 70 + i * 26, { size: 22, color: '#ffd84d' }); }
    },
  };
});
