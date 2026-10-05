registerGame('powertag', (G) => {
  const { ctx, W, H } = G;
  let s = null, lastDir = { dx: 0, dy: 0 };
  const fx = [];
  const me = () => s && s.players.find((p) => p.id === G.me);
  const ICON = { flash: '⚡', pearl: '🟣', portal: '🌀', dash: '💨', freeze: '❄️', smoke: '💣', grapple: '🪝' };

  function sendMove() {
    const k = G.keys;
    const dx = (k.has('d') || k.has('ArrowRight') ? 1 : 0) - (k.has('a') || k.has('ArrowLeft') ? 1 : 0);
    const dy = (k.has('s') || k.has('ArrowDown') ? 1 : 0) - (k.has('w') || k.has('ArrowUp') ? 1 : 0);
    if (dx !== lastDir.dx || dy !== lastDir.dy) { lastDir = { dx, dy }; G.send({ type: 'move', dx, dy }); }
  }
  const usePower = () => { const m = me(); if (m && m.cd <= 0) G.send({ type: 'power', x: G.mouse.x, y: G.mouse.y }); };

  return {
    state(ns) { s = ns; },
    event(e) {
      if (e.type === 'tag') { const p = G.player(e.id); fx.push({ text: `${p.name} is IT!`, t: 1.5 }); }
      if (e.type === 'power') fx.push({ ring: true, x: e.x, y: e.y, t: 0.4 });
      if (e.type === 'teleport') fx.push({ ring: true, x: e.x, y: e.y, t: 0.5, color: '#c77dff' });
      if (e.type === 'frozen') { const p = G.player(e.id); fx.push({ text: `${p.name} frozen!`, t: 1.2 }); }
      if (e.type === 'over') fx.push({ text: `${G.player(e.winner).name} wins!`, t: 3 });
    },
    key(k, down) { sendMove(); if (down && k === ' ') usePower(); },
    mouse(kind) { if (kind === 'down') usePower(); },
    render(dt) {
      sendMove();
      G.clear('#0d1420');
      ctx.fillStyle = '#152033'; ctx.fillRect(20, 20, W - 40, H - 40);
      if (!s) { G.text('Waiting for state…', W / 2, H / 2); return; }
      for (const w of s.walls) { ctx.fillStyle = '#2b3a55'; ctx.fillRect(w.x, w.y + 4, w.w, w.h); ctx.fillStyle = '#3f5478'; ctx.fillRect(w.x, w.y, w.w, w.h); }
      for (const q of s.portals) {
        const p = G.player(q.owner);
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(s.t * 3);
        ctx.beginPath(); ctx.ellipse(0, 0, 18, 24, 0, 0, Math.PI * 2); ctx.strokeStyle = q.tag === 'A' ? '#4da6ff' : '#ff9f43'; ctx.lineWidth = 4; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, 0, 10, 14, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fill();
        ctx.restore();
        G.text(p.name, q.x, q.y - 32, { size: 11, color: p.color });
      }
      for (const q of s.projectiles) G.circle(q.x, q.y, 7, q.kind === 'freeze' ? '#8fe3ff' : '#5c2a8a', '#fff');
      for (const p of s.players) {
        const pl = G.player(p.id), isMe = p.id === G.me;
        if (p.invis && !isMe) { ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 2; ctx.stroke(); continue; }
        if (p.id === s.itId) { ctx.beginPath(); ctx.arc(p.x, p.y, 24 + Math.sin(s.t * 8) * 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,60,60,.35)'; ctx.fill(); }
        if (p.immune) { ctx.beginPath(); ctx.arc(p.x, p.y, 19, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); }
        ctx.globalAlpha = p.invis && isMe ? 0.4 : 1;
        ctx.beginPath(); ctx.arc(p.x, p.y + 3, 14, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill();
        G.circle(p.x, p.y, 14, p.frozen ? '#9fdcff' : pl.color, isMe ? '#fff' : p.id === s.itId ? '#ff3b3b' : 'rgba(0,0,0,.4)');
        G.circle(p.x - 5, p.y - 3, 3, '#fff'); G.circle(p.x + 5, p.y - 3, 3, '#fff'); G.circle(p.x - 4, p.y - 3, 1.5, '#111'); G.circle(p.x + 6, p.y - 3, 1.5, '#111');
        ctx.globalAlpha = 1;
        if (p.boost) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - lastDir.dx * 30, p.y - lastDir.dy * 30); ctx.strokeStyle = '#ffd84d'; ctx.lineWidth = 6; ctx.stroke(); }
        if (isMe) {
          if (p.cd > 0) { ctx.beginPath(); ctx.arc(p.x, p.y, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - p.cd / p.maxCd)); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 3; ctx.stroke(); }
          G.text(`${ICON[p.power] || '✦'} ${p.powerName}${p.cd > 0 ? ' ' + p.cd.toFixed(1) : ''}`, p.x, p.y + 30, { size: 12, color: p.cd > 0 ? '#aaa' : '#fff' });
        }
        G.nameTag(p.x, p.y, p.id, -24);
      }
      const m = me();
      if (m && m.cd <= 0 && !m.frozen) { const dx = G.mouse.x - m.x, dy = G.mouse.y - m.y, d = Math.hypot(dx, dy) || 1; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x + dx / d * 50, m.y + dy / d * 50); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); }
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i]; f.t -= dt; if (f.t <= 0) { fx.splice(i, 1); continue; }
        if (f.ring) { ctx.beginPath(); ctx.arc(f.x, f.y, 14 + (0.5 - f.t) * 80, 0, Math.PI * 2); ctx.strokeStyle = f.color || 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; ctx.globalAlpha = Math.max(0, f.t * 2); ctx.stroke(); ctx.globalAlpha = 1; }
        else G.text(f.text, W / 2, 70 + i * 26, { size: 22, color: '#ffd84d' });
      }
      G.timer(90 - s.t);
      if (m && m.id === s.itId) G.text("YOU'RE IT — go tag someone!", W / 2, H - 22, { size: 22, color: '#ff5d5d' });
      const board = s.players.slice().sort((a, b) => a.it - b.it);
      board.forEach((p, i) => { const pl = G.player(p.id); G.text(`${pl.name}  ${p.it}s`, W - 30, 40 + i * 18, { size: 13, color: pl.color, align: 'right' }); });
      if (s.countdown > 0) G.text(Math.ceil(s.countdown), W / 2, H / 2, { size: 90 });
    },
  };
});
