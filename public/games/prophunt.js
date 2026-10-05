registerGame('prophunt', (G) => {
  const { ctx, W, H } = G;
  let s = null, walls = [], PROPS = [];
  let lastMove = { dx: 0, dy: 0 }, aimT = 0, lastAim = null, panelOpen = false;
  const fx = [], marks = [];

  const DRAW = {
    dirt(x, y, r) { ctx.fillStyle = '#7a4a22'; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.fillStyle = '#4caf50'; ctx.fillRect(x - r, y - r, r * 2, r * 0.6); ctx.fillStyle = '#5d3a1a'; ctx.fillRect(x - r * 0.4, y, r * 0.5, r * 0.5); },
    console(x, y, r) { ctx.fillStyle = '#1c1c1c'; ctx.fillRect(x - r, y - r * 0.6, r * 2, r * 1.2); ctx.fillStyle = '#e53935'; ctx.fillRect(x - r, y - r * 0.6, r * 0.4, r * 1.2); ctx.fillStyle = '#1e88e5'; ctx.fillRect(x + r * 0.6, y - r * 0.6, r * 0.4, r * 1.2); ctx.fillStyle = '#333'; ctx.fillRect(x - r * 0.5, y - r * 0.4, r, r * 0.8); },
    pizza(x, y, r) { ctx.fillStyle = '#f2b544'; ctx.beginPath(); ctx.moveTo(x, y + r); ctx.lineTo(x - r, y - r); ctx.lineTo(x + r, y - r); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(x - 4, y - 6, 3, 0, 7); ctx.arc(x + 5, y - 4, 3, 0, 7); ctx.arc(x, y + 3, 3, 0, 7); ctx.fill(); },
    duck(x, y, r) { ctx.fillStyle = '#ffd600'; ctx.beginPath(); ctx.ellipse(x, y + 3, r, r * 0.7, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(x + r * 0.5, y - r * 0.4, r * 0.5, 0, 7); ctx.fill(); ctx.fillStyle = '#ff6f00'; ctx.fillRect(x + r * 0.9, y - r * 0.45, r * 0.5, r * 0.25); ctx.fillStyle = '#000'; ctx.fillRect(x + r * 0.6, y - r * 0.6, 2, 2); },
    cone(x, y, r) { ctx.fillStyle = '#ff7f27'; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x - r * 0.8, y + r); ctx.lineTo(x + r * 0.8, y + r); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(x - r * 0.45, y, r * 0.9, r * 0.25); },
    box(x, y, r) { ctx.fillStyle = '#c69c6d'; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.strokeStyle = '#8d6e46'; ctx.lineWidth = 2; ctx.strokeRect(x - r, y - r, r * 2, r * 2); ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke(); },
    plant(x, y, r) { ctx.fillStyle = '#b5651d'; ctx.fillRect(x - r * 0.6, y, r * 1.2, r); ctx.fillStyle = '#2e7d32'; ctx.beginPath(); ctx.arc(x, y - r * 0.3, r * 0.8, 0, 7); ctx.fill(); },
    trash(x, y, r) { ctx.fillStyle = '#607d8b'; ctx.fillRect(x - r * 0.7, y - r * 0.6, r * 1.4, r * 1.6); ctx.fillStyle = '#90a4ae'; ctx.fillRect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 0.3); },
  };
  const drawProp = (kind, x, y, r) => { (DRAW[kind] || DRAW.box)(x, y, r); };
  const propR = (kind) => (PROPS.find((p) => p.kind === kind) || { r: 16 }).r;

  function sendMove() {
    let dx = 0, dy = 0;
    if (G.keys.has('a') || G.keys.has('ArrowLeft')) dx -= 1; if (G.keys.has('d') || G.keys.has('ArrowRight')) dx += 1;
    if (G.keys.has('w') || G.keys.has('ArrowUp')) dy -= 1; if (G.keys.has('s') || G.keys.has('ArrowDown')) dy += 1;
    if (dx !== lastMove.dx || dy !== lastMove.dy) { lastMove = { dx, dy }; G.send({ type: 'move', dx, dy }); }
  }
  function showPicker() {
    if (!PROPS.length) return;
    panelOpen = true;
    const el = G.panel(`<b>Pick your disguise</b><div class="opts">${PROPS.map((p, i) => `<button data-k="${p.kind}">${i + 1}. ${p.name}</button>`).join('')}</div><span class="hint">You can change it until the hunt starts. Move away from where you spawned!</span>`);
    el.style.position = 'absolute'; el.style.right = '12px'; el.style.top = '12px'; el.style.minWidth = '220px'; el.style.transform = 'scale(.85)'; el.style.transformOrigin = 'top right';
    for (const b of el.querySelectorAll('button')) b.onclick = () => G.send({ type: 'pick', kind: b.dataset.k });
  }

  return {
    state(ns) {
      s = ns;
      if (s.you && !s.you.seeker && s.phase === 'hide' && !panelOpen) showPicker();
      if (s.phase === 'hunt' && panelOpen) { panelOpen = false; G.clearUI(); }
    },
    event(e) {
      if (e.type === 'init') { walls = e.walls; PROPS = e.props; }
      if (e.type === 'hit') { marks.push({ x: e.x, y: e.y, t: 3, kind: 'splat' }); fx.push({ text: `${G.player(e.by).name} found ${G.player(e.id).name}!`, t: 2 }); }
      if (e.type === 'miss') marks.push({ x: e.x, y: e.y, t: 0.4, kind: 'miss' });
      if (e.type === 'taunt') marks.push({ x: e.x, y: e.y, t: 0.5, kind: 'taunt' });
      if (e.type === 'seekerOut') fx.push({ text: `${G.player(e.id).name} ran out of ammo health!`, t: 2 });
      if (e.type === 'hunt') fx.push({ text: 'The hunt is on!', t: 2 });
      if (e.type === 'over') { fx.push({ text: e.hidersWin ? 'Props win!' : 'Seekers win!', t: 3 }); s && (s.reveal = e.reveal); }
    },
    key(k, down) {
      if (!down) { sendMove(); return; }
      if (k === 't') G.send({ type: 'taunt' });
      const n = parseInt(k, 10); if (n >= 1 && n <= PROPS.length) G.send({ type: 'pick', kind: PROPS[n - 1].kind });
      sendMove();
    },
    mouse(kind) { if (kind === 'down') G.send({ type: 'shoot' }); },
    render(dt) {
      G.clear('#1b2330');
      if (!s) { G.text('Waiting…', W / 2, H / 2); return; }
      sendMove();
      const you = s.you;
      aimT += dt;
      if (you && aimT > 1 / 15) { aimT = 0; const a = Math.atan2(G.mouse.y - you.y, G.mouse.x - you.x); if (a !== lastAim) { lastAim = a; G.send({ type: 'aim', a }); } }
      if (you && you.seeker && s.phase === 'hide') {
        G.clear('#000'); G.text('Hiders are hiding…', W / 2, H / 2 - 30, { size: 28 }); G.text(Math.ceil(s.timeLeft) + 's', W / 2, H / 2 + 30, { size: 50, color: '#ff5d5d' });
        G.text('Every miss costs you 1 of 25 ammo health. Shoot what looks wrong.', W / 2, H / 2 + 90, { size: 14, color: '#aaa' }); return;
      }
      // floor pattern
      ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = 1; for (let x = 0; x < W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } for (let y = 0; y < H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.fillStyle = '#3b4a5e'; for (const w of walls) ctx.fillRect(w.x, w.y, w.w, w.h);
      // props
      for (const p of s.props) {
        if (p.dead) { ctx.globalAlpha = 0.25; drawProp(p.kind, p.x, p.y, propR(p.kind)); ctx.globalAlpha = 1; G.text('✕', p.x, p.y, { size: 22, color: '#ff5d5d' }); continue; }
        drawProp(p.kind, p.x, p.y, propR(p.kind));
        if (p.taunt) { ctx.strokeStyle = '#ffd84d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 28, 0, 7); ctx.stroke(); }
        if (p.id && (!you || !you.seeker)) G.nameTag(p.x, p.y, p.id, -26);
      }
      if (you && !you.seeker && you.alive) { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(you.x, you.y, propR(you.kind) + 6, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      // seekers
      for (const sk of s.seekers) {
        const pl = G.player(sk.id);
        if (!sk.alive) { ctx.globalAlpha = 0.3; }
        G.circle(sk.x, sk.y, 15, pl.color, sk.id === G.me ? '#fff' : '#000');
        ctx.strokeStyle = '#222'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(sk.x, sk.y); ctx.lineTo(sk.x + Math.cos(sk.aim) * 24, sk.y + Math.sin(sk.aim) * 24); ctx.stroke();
        ctx.globalAlpha = 1; G.nameTag(sk.x, sk.y, sk.id, -26);
        G.text(`♥${sk.hp}`, sk.x, sk.y + 26, { size: 11, color: '#ff8a80' });
      }
      ctx.fillStyle = '#fff176'; for (const b of s.bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, 7); ctx.fill(); }
      for (let i = marks.length - 1; i >= 0; i--) {
        const m = marks[i]; m.t -= dt; if (m.t <= 0) { marks.splice(i, 1); continue; }
        if (m.kind === 'splat') { ctx.fillStyle = 'rgba(220,40,40,.6)'; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(m.x + Math.cos(k * 1.1) * 10, m.y + Math.sin(k * 1.3) * 10, 6, 0, 7); ctx.fill(); } }
        else if (m.kind === 'miss') { ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(m.x, m.y, (0.4 - m.t) * 40, 0, 7); ctx.stroke(); }
        else { ctx.strokeStyle = '#ffd84d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(m.x, m.y, 20 + (0.5 - m.t) * 40, 0, 7); ctx.stroke(); }
      }
      if (s.reveal) for (const r of s.reveal) G.nameTag(r.x, r.y, r.id, -26);
      // HUD
      G.timer(s.timeLeft);
      G.text(s.phase === 'hide' ? 'HIDE' : `${s.hidersLeft}/${s.hidersTotal} props left`, W / 2, 48, { size: 14, color: '#aaa' });
      if (you && you.seeker) { G.text(`Ammo health: ${you.hp}/25`, 90, 24, { size: 16, color: you.hp < 8 ? '#ff5d5d' : '#fff' }); if (!you.alive) G.text('You are out. Spectating…', W / 2, H - 22, { size: 14, color: '#aaa' }); }
      else if (you) { G.text(you.alive ? `You are a ${(PROPS.find((p) => p.kind === you.kind) || {}).name || 'prop'}  •  T to taunt${you.tauntCd > 0 ? ` (${Math.ceil(you.tauntCd)})` : ''}` : 'You were found. Spectating…', W / 2, H - 22, { size: 14, color: you.alive ? '#fff' : '#aaa' }); }
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t -= dt; if (f.t <= 0) fx.splice(i, 1); else G.text(f.text, W / 2, 76 + i * 26, { size: 22, color: '#ffd84d' }); }
    },
    destroy() { G.clearUI(); },
  };
});
