registerGame('dodgeboss', (G) => {
  const { ctx, W, H } = G;
  let s = null, lastDir = { dx: 0, dy: 0 };
  const fx = [];
  const me = () => s && s.players.find((p) => p.id === G.me);

  function sendMove() {
    const k = G.keys;
    const dx = (k.has('d') || k.has('ArrowRight') ? 1 : 0) - (k.has('a') || k.has('ArrowLeft') ? 1 : 0);
    const dy = (k.has('s') || k.has('ArrowDown') ? 1 : 0) - (k.has('w') || k.has('ArrowUp') ? 1 : 0);
    if (dx !== lastDir.dx || dy !== lastDir.dy) { lastDir = { dx, dy }; G.send({ type: 'move', dx, dy }); }
  }

  // ---- boss drawings: add a new key here when adding a boss on the server ----
  const DRAW = {
    kart(x, y, t) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2) * 0.1);
      ctx.fillStyle = '#222'; for (const [wx, wy] of [[-60, -45], [60, -45], [-60, 45], [60, 45]]) { ctx.beginPath(); ctx.roundRect(wx - 18, wy - 14, 36, 28, 8); ctx.fill(); }
      ctx.fillStyle = '#d33'; ctx.beginPath(); ctx.roundRect(-70, -36, 140, 72, 16); ctx.fill();
      ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.roundRect(-20, -22, 50, 44, 8); ctx.fill();
      ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(-35, 0, 16, 0, Math.PI * 2); ctx.fill();
      G.circle(-38, -5, 5, '#fff'); G.circle(-30, -5, 5, '#fff'); G.circle(-37, -5, 2.5, '#111'); G.circle(-29, -5, 2.5, '#111');
      ctx.fillStyle = '#eee'; ctx.fillRect(-82, -20, 12, 40);
      ctx.restore();
    },
    ogre(x, y, t) {
      ctx.save(); ctx.translate(x, y + Math.sin(t * 3) * 4);
      ctx.fillStyle = '#6cab3c';
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * 78, -10, 14, 24, sx * 1.2, 0, Math.PI * 2); ctx.fill(); }
      ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4e8a2a'; ctx.beginPath(); ctx.arc(0, 50, 20, 0, Math.PI * 2); ctx.fill();
      G.circle(-24, -14, 12, '#fff'); G.circle(24, -14, 12, '#fff'); G.circle(-22, -12, 6, '#2a1a0a'); G.circle(26, -12, 6, '#2a1a0a');
      ctx.strokeStyle = '#2a4a15'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-36, -34); ctx.lineTo(-10, -26); ctx.moveTo(36, -34); ctx.lineTo(10, -26); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 20, 26, 0.1, Math.PI - 0.1); ctx.stroke();
      ctx.restore();
    },
    ufo(x, y, t) {
      ctx.save(); ctx.translate(x, y + Math.sin(t * 2.5) * 6);
      ctx.fillStyle = 'rgba(120,255,200,.25)'; ctx.beginPath(); ctx.moveTo(-30, 10); ctx.lineTo(30, 10); ctx.lineTo(90, 200); ctx.lineTo(-90, 200); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#9aa7b8'; ctx.beginPath(); ctx.ellipse(0, 10, 100, 28, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5ee0ff'; ctx.beginPath(); ctx.arc(0, -10, 42, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#3b4656'; ctx.beginPath(); ctx.ellipse(0, 14, 100, 10, 0, 0, Math.PI); ctx.fill();
      for (let i = 0; i < 6; i++) { const a = t * 3 + i; ctx.fillStyle = Math.sin(a) > 0 ? '#ff5d5d' : '#ffd84d'; ctx.beginPath(); ctx.arc(Math.cos(i) * 70, 14 + Math.sin(i) * 8, 6, 0, Math.PI * 2); ctx.fill(); }
      G.circle(-12, -16, 7, '#111'); G.circle(12, -16, 7, '#111');
      ctx.restore();
    },
  };

  function drawShape(sh, t) {
    const tele = t < sh.tele, prog = tele ? Math.max(0, 1 - (sh.tele - t) / Math.max(0.01, sh.tele - sh.born)) : 1;
    const fill = tele ? `rgba(255,70,50,${0.12 + prog * 0.25})` : 'rgba(255,60,40,.75)';
    const stroke = tele ? 'rgba(255,90,70,.9)' : '#fff';
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 2;
    if (sh.kind === 'circle') {
      const r = sh.grow && tele ? sh.r * (0.3 + 0.7 * prog) : sh.r;
      ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(sh.x, sh.y, tele ? sh.r * prog : r, 0, Math.PI * 2); ctx.fill();
      if (sh.persist && !tele) { G.text('🍌', sh.x, sh.y, { size: 28, stroke: false }); }
    } else if (sh.kind === 'rect') {
      ctx.strokeRect(sh.x, sh.y, sh.w, sh.h); ctx.fillRect(sh.x, sh.y + sh.h * (1 - prog), sh.w, sh.h * prog);
    } else if (sh.kind === 'line') {
      const a = Math.atan2(sh.y2 - sh.y1, sh.x2 - sh.x1);
      ctx.save(); ctx.translate(sh.x1, sh.y1); ctx.rotate(a); const L = Math.hypot(sh.x2 - sh.x1, sh.y2 - sh.y1);
      ctx.strokeRect(0, -sh.w / 2, L, sh.w); ctx.fillRect(0, -sh.w / 2 * prog, L, sh.w * prog);
      if (sh.ram && !tele) { ctx.fillStyle = '#d33'; ctx.beginPath(); ctx.roundRect(L * Math.min(1, (t - sh.tele) / 0.6) - 60, -30, 100, 60, 12); ctx.fill(); }
      ctx.restore();
    } else if (sh.kind === 'band') {
      ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.r1, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.r2, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.r2, 0, Math.PI * 2); ctx.arc(sh.x, sh.y, sh.r2 - (sh.r2 - sh.r1) * prog, 0, Math.PI * 2, true); ctx.fill('evenodd');
    } else if (sh.kind === 'beam') {
      const p = tele ? 0 : Math.min(1, (t - sh.tele) / sh.dur), a = sh.a0 + (sh.a1 - sh.a0) * p;
      ctx.save(); ctx.translate(sh.x, sh.y); ctx.rotate(a);
      if (tele) { ctx.setLineDash([10, 10]); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sh.len, 0); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = `rgba(255,70,50,${0.1 + prog * 0.3})`; ctx.beginPath(); ctx.arc(0, 0, 0, 0, 0); ctx.moveTo(0, 0); ctx.arc(0, 0, 1100, 0, (sh.a1 - sh.a0) * 0.999); ctx.closePath(); ctx.fill(); }
      else { ctx.fillStyle = 'rgba(255,80,60,.85)'; ctx.fillRect(0, -sh.w / 2, sh.len, sh.w); ctx.fillStyle = '#fff'; ctx.fillRect(0, -6, sh.len, 12); }
      ctx.restore();
    }
  }

  return {
    state(ns) { s = ns; },
    event(e) {
      if (e.type === 'out') fx.push({ text: `${G.player(e.id).name} got hit!`, t: 1.5 });
      if (e.type === 'phase2') fx.push({ text: 'PHASE 2 — faster!', t: 2.5 });
      if (e.type === 'over') fx.push({ text: e.winners.length === 1 ? `${G.player(e.winners[0]).name} wins!` : e.winners.length ? 'Survivors tie!' : 'Everyone got hit!', t: 3 });
    },
    key() { sendMove(); },
    render(dt) {
      sendMove();
      G.clear('#13101c');
      ctx.fillStyle = '#1e1a2b'; ctx.fillRect(20, 20, W - 40, H - 40);
      ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
      for (let x = 20; x <= W - 20; x += 50) { ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, H - 20); ctx.stroke(); }
      for (let y = 20; y <= H - 20; y += 50) { ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(W - 20, y); ctx.stroke(); }
      if (!s) { G.text('Waiting for state…', W / 2, H / 2); return; }
      for (const sh of s.shapes) drawShape(sh, s.t);
      (DRAW[s.boss.id] || DRAW.ogre)(s.boss.x, s.boss.y, s.t);
      for (const p of s.players) {
        if (!p.alive) continue;
        const pl = G.player(p.id);
        ctx.beginPath(); ctx.arc(p.x, p.y + 3, 14, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill();
        G.circle(p.x, p.y, 14, pl.color, p.id === G.me ? '#fff' : 'rgba(0,0,0,.4)');
        G.circle(p.x - 5, p.y - 3, 3, '#fff'); G.circle(p.x + 5, p.y - 3, 3, '#fff'); G.circle(p.x - 4, p.y - 3, 1.5, '#111'); G.circle(p.x + 6, p.y - 3, 1.5, '#111');
        G.nameTag(p.x, p.y, p.id, -24);
      }
      const m = me();
      if (m && !m.alive) G.text('You got hit. Spectating…', W / 2, H - 20, { size: 14, color: '#aaa' });
      G.text(s.boss.name + (s.phase === 2 ? '  ⚡ enraged' : ''), W / 2, 24, { size: 18, color: '#ff8a7a' });
      G.timer(120 - s.t, 60, 24);
      G.text(`${s.players.filter((p) => p.alive).length} alive`, W - 60, 24, { size: 16 });
      if (s.countdown > 0) G.text(Math.ceil(s.countdown), W / 2, H / 2, { size: 90 });
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t -= dt; if (f.t <= 0) fx.splice(i, 1); else G.text(f.text, W / 2, 70 + i * 26, { size: 22, color: '#ffd84d' }); }
    },
  };
});
