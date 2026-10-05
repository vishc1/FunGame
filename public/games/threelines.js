registerGame('threelines', (G) => {
  const { ctx, W, H } = G;
  let s = null, myWord = null, drag = null, input = null;
  const fx = [];
  const isDrawer = () => s && s.drawer === G.me;

  function ensureInput() {
    if (input || isDrawer()) return;
    const bar = document.createElement('div'); bar.className = 'bar';
    input = document.createElement('input'); input.placeholder = 'Type your guess and press Enter'; input.maxLength = 40; input.autocomplete = 'off';
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) { G.send({ type: 'guess', text: input.value }); input.value = ''; } });
    bar.appendChild(input); G.ui.appendChild(bar); setTimeout(() => input.focus(), 50);
  }
  function removeInput() { if (input) { input.parentElement.remove(); input = null; } }

  return {
    state(ns) {
      const changed = !s || s.drawer !== ns.drawer;
      s = ns;
      if (changed) { myWord = null; drag = null; removeInput(); }
      if (isDrawer()) removeInput(); else ensureInput();
    },
    event(e) {
      if (e.type === 'word') myWord = e.word;
      if (e.type === 'close') fx.push({ text: 'Close!', t: 1.5, color: '#ffd84d' });
      if (e.type === 'correct') fx.push({ text: `${G.player(e.id).name} guessed it!`, t: 2, color: '#5ee07a' });
    },
    mouse(kind, x, y) {
      if (!isDrawer() || !s || s.phase !== 'turn' || s.lines.length >= 3) { drag = null; return; }
      if (kind === 'down') drag = { x1: x, y1: y, x2: x, y2: y };
      else if (kind === 'move' && drag) { drag.x2 = x; drag.y2 = y; }
      else if (kind === 'up' && drag) { G.send({ type: 'line', ...drag, x2: x, y2: y }); drag = null; }
    },
    destroy() { removeInput(); },
    render(dt) {
      G.clear('#0b0d13');
      if (!s) { G.text('Waiting…', W / 2, H / 2); return; }
      // canvas area
      ctx.fillStyle = '#f4f1e8'; ctx.fillRect(0, 50, 660, H - 50);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      for (const l of s.lines) { ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(l[2], l[3]); ctx.stroke(); }
      if (drag) { ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.moveTo(drag.x1, drag.y1); ctx.lineTo(drag.x2, drag.y2); ctx.stroke(); }
      // top bar
      const d = G.player(s.drawer);
      G.text(`Turn ${s.turn}/${s.turns} — ${d.name} is drawing`, 12, 25, { size: 15, color: d.color, align: 'left' });
      G.timer(s.timeLeft, 620, 25);
      const shown = s.phase === 'reveal' ? s.word : isDrawer() ? myWord || '' : s.mask;
      G.text(shown ? shown.split('').join(' ') : '', 330, 25, { size: 22, color: s.phase === 'reveal' ? '#ffd84d' : '#fff' });
      if (isDrawer() && s.phase === 'turn') G.text(`Lines left: ${3 - s.lines.length}`, 330, H - 18, { size: 14, color: '#333', stroke: false });
      if (s.phase === 'reveal') G.text(`The word was "${s.word}"`, 330, H / 2, { size: 30, color: '#ffd84d' });
      // right side: scores + feed
      G.text('Scores', 780, 70, { size: 15 });
      const ps = G.players.slice().sort((a, b) => (s.pts[b.id] || 0) - (s.pts[a.id] || 0));
      ps.forEach((p, i) => {
        const ok = s.guessed.includes(p.id) ? ' ✓' : p.id === s.drawer ? ' ✎' : '';
        G.text(p.name + ok, 675, 95 + i * 20, { size: 13, color: p.color, align: 'left' });
        G.text(String(s.pts[p.id] || 0), 890, 95 + i * 20, { size: 13, align: 'right' });
      });
      const fy = 300;
      G.text('Guesses', 780, fy, { size: 15 });
      s.feed.forEach((f, i) => {
        const p = G.player(f.id);
        const t = f.kind === 'correct' ? `${p.name} guessed it!` : f.kind === 'chat' ? `${p.name}: ${f.text}` : `${p.name}: ${f.text}`;
        G.text(t.slice(0, 30), 675, fy + 25 + i * 20, { size: 12, color: f.kind === 'correct' ? '#5ee07a' : f.kind === 'chat' ? '#888' : '#ddd', align: 'left' });
      });
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t -= dt; if (f.t <= 0) fx.splice(i, 1); else G.text(f.text, 330, 90 + i * 26, { size: 22, color: f.color }); }
    },
  };
});
