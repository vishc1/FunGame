registerGame('mimic', (G) => {
  const { ctx, W, H } = G;
  let s = null;
  let drawing = false, path = [], sent = false, watchT = 0, lastPhase = '';
  const fx = [];
  const PHASES = { intro: 'Get ready', leader: 'Leader is making a move…', watch: 'Watch!', copy: 'Copy it!', reveal: 'Results' };

  const isLeader = () => s && s.leader === G.me;
  const alive = () => s && s.survivors.includes(G.me);
  const canDraw = () => s && ((s.phase === 'leader' && isLeader()) || (s.phase === 'copy' && alive() && !isLeader())) && !sent;

  function submit() {
    if (sent || !s) return;
    sent = true; drawing = false;
    G.send({ type: 'path', path: path.map((p) => [+(p[0] / W).toFixed(4), +(p[1] / H).toFixed(4)]) });
  }
  function stroke(pts, color, width, scale = 1, cx = W / 2, cy = H / 2, frac = 1) {
    if (!pts || pts.length < 2) return;
    const n = Math.max(2, Math.floor(pts.length * frac));
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const x = cx + (pts[i][0] - 0.5) * W * scale, y = cy + (pts[i][1] - 0.5) * H * scale; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  }

  return {
    state(ns) {
      if (!s || ns.phase !== s.phase || ns.leader !== s.leader) { sent = false; path = []; drawing = false; if (ns.phase === 'watch') watchT = 0; }
      // if phase moved past my drawing window while I was drawing, nothing to do (server timed out)
      s = ns;
    },
    event(e) {
      if (e.type === 'eliminated') { const p = G.player(e.id); fx.push({ text: `${p.name} is out (${e.score}%)`, t: 3 }); }
    },
    mouse(kind, x, y) {
      if (!canDraw()) return;
      if (kind === 'down') { drawing = true; path = [[x, y]]; }
      else if (kind === 'move' && drawing) { const l = path[path.length - 1]; if (Math.hypot(x - l[0], y - l[1]) > 2) path.push([x, y]); }
      else if (kind === 'up' && drawing) { if (path.length >= 8) submit(); else { drawing = false; path = []; } }
    },
    render(dt) {
      G.clear('#0b0d13');
      if (!s) { G.text('Waiting…', W / 2, H / 2); return; }
      if (drawing && s.timeLeft < 0.3 && path.length >= 8) submit();
      // header
      let title = PHASES[s.phase] || s.phase;
      if (s.phase === 'leader') title = isLeader() ? 'You are the leader — draw a move!' : `${G.player(s.leader).name} is making a move…`;
      if (s.phase === 'copy' && (isLeader() || !alive())) title = 'They are copying…';
      if (s.faceoff && (s.phase === 'watch' || s.phase === 'copy')) title = 'FACE-OFF! ' + title;
      G.text(title, W / 2, 28, { size: 24 });
      G.timer(s.timeLeft, W - 50, 28);
      // survivors list
      s.survivors.forEach((id, i) => { const p = G.player(id); G.text(p.name + (id === s.leader ? ' ★' : ''), 14, 70 + i * 20, { size: 13, color: p.color, align: 'left' }); });
      s.eliminated.forEach((id, i) => { const p = G.player(id); G.text(p.name, 14, 70 + (s.survivors.length + i) * 20, { size: 13, color: '#555', align: 'left' }); });

      if (s.phase === 'watch' && s.original) {
        watchT += dt;
        stroke(s.original, '#ffd84d', 10, 1, W / 2, H / 2, Math.min(1, watchT / 1.8));
      }
      if (s.phase === 'copy') {
        if (canDraw()) G.text('Draw the shape in one stroke', W / 2, H - 24, { size: 14, color: '#aaa' });
        else if (sent) G.text('Submitted ✓', W / 2, H - 24, { size: 14, color: '#5ee07a' });
        const sub = s.submitted || [];
        G.text(`${sub.length} submitted`, W / 2, 56, { size: 13, color: '#888' });
      }
      if (s.phase === 'leader' && isLeader()) G.text('Hold the mouse and draw. Release to send.', W / 2, H - 24, { size: 14, color: '#aaa' });
      if (s.phase === 'reveal' && s.original) {
        stroke(s.original, 'rgba(255,216,77,.9)', 10);
        const ids = Object.keys(s.scores || {}).sort((a, b) => s.scores[b] - s.scores[a]);
        ids.forEach((id, i) => {
          const p = G.player(id);
          stroke(s.copies[id], p.color, 3);
          G.text(`${p.name}: ${s.scores[id]}%`, W - 14, 70 + i * 22, { size: 15, color: p.color, align: 'right' });
        });
      }
      // my live stroke
      if (path.length > 1 && (drawing || sent)) {
        ctx.beginPath(); path.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.strokeStyle = G.player(G.me).color; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
      }
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t -= dt; if (f.t <= 0) fx.splice(i, 1); else G.text(f.text, W / 2, H - 60 - i * 26, { size: 20, color: '#ff6b6b' }); }
      void lastPhase;
    },
  };
});
