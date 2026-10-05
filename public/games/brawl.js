// Character Brawl client. ADDING A CHARACTER: add a draw function to DRAW keyed by the server-side id
// (see server/games/brawl.js CHARACTERS). draw(ctx, f, color, t) is called with the origin at the fighter's feet,
// already flipped so +x is "forward". Draw in roughly a 28×40 box above (0,0). Missing ids fall back to a box.
registerGame('brawl', (G) => {
  const { ctx, W, H } = G;
  const FW = 28, FH = 40;
  let s = null;
  const ctl = { left: false, right: false, jump: false, down: false, attack: false, special: false };
  let picked = null;
  const sparks = []; // {x,y,t,text,color,size}
  let shake = 0;
  const CHARS = [
    { id: 'steve', name: 'Blocky Steve', move: 'Dirt block' },
    { id: 'plumber', name: 'Red Plumber', move: 'Ground pound' },
    { id: 'dancer', name: 'Default Dance Guy', move: 'Ramp / glider' },
    { id: 'egg', name: 'Egg Soldier', move: 'Egg shot' },
    { id: 'ogre', name: 'The Ogre', move: 'Roar' },
    { id: 'crew', name: 'Among Crewmate', move: 'Vent (sus)' },
    { id: 'cart', name: 'Cart Kid', move: 'Cart charge' },
    { id: 'portal', name: 'Portal Tester', move: 'Portals' },
  ];
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const DRAW = {
    steve(ctx, f, c, t) { rect(-10, -40, 20, 16, '#c69b7b'); rect(-10, -40, 20, 6, '#4a2f1b'); rect(-7, -32, 4, 4, '#fff'); rect(3, -32, 4, 4, '#fff'); rect(-6, -31, 2, 2, '#4a9'); rect(4, -31, 2, 2, '#4a9'); rect(-12, -24, 24, 14, '#2f9c9c'); rect(-12, -10, 24, 10, '#3a3a8a'); rect(12, -24 + Math.sin(t * 10) * 2, 6, 16, '#c69b7b'); },
    plumber(ctx, f, c, t) { rect(-12, -14, 24, 14, '#2d55c9'); ctx.beginPath(); ctx.arc(0, -26, 12, 0, 7); ctx.fillStyle = '#f0c8a0'; ctx.fill(); rect(-14, -40, 28, 7, '#e03a3a'); rect(0, -36, 16, 4, '#e03a3a'); rect(-4, -22, 10, 3, '#4a2f1b'); rect(-10, -4, 8, 4, '#4a2f1b'); rect(2, -4, 8, 4, '#4a2f1b'); },
    dancer(ctx, f, c, t) { const b = Math.sin(t * 12) * 3; rect(-6, -40, 12, 12, '#d7b48e'); rect(-8, -28, 16, 18, '#777'); rect(-16, -26, 8, 14, '#5a3'); rect(-7, -10, 5, 10, '#444'); rect(2, -10, 5, 10, '#444'); rect(8, -26 + b, 10, 4, '#d7b48e'); rect(-18, -26 - b, 10, 4, '#d7b48e'); },
    egg(ctx, f, c, t) { ctx.beginPath(); ctx.ellipse(0, -20, 13, 19, 0, 0, 7); ctx.fillStyle = '#f3eccf'; ctx.fill(); ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1; ctx.stroke(); rect(-13, -40, 26, 10, '#4a5d3a'); rect(-15, -31, 30, 3, '#2f3b25'); rect(2, -26, 4, 4, '#111'); rect(-6, -26, 4, 4, '#111'); rect(8, -18, 12, 4, '#333'); },
    ogre(ctx, f, c, t) { ctx.beginPath(); ctx.ellipse(0, -22, 16, 18, 0, 0, 7); ctx.fillStyle = '#6fbf3a'; ctx.fill(); rect(-18, -34, 6, 6, '#6fbf3a'); rect(12, -34, 6, 6, '#6fbf3a'); rect(-8, -26, 4, 4, '#111'); rect(4, -26, 4, 4, '#111'); rect(-6, -16, 12, 3, '#3a6a1a'); rect(-12, -6, 24, 6, '#8a6a3a'); },
    crew(ctx, f, c, t) { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(-11, -38, 22, 38, 10); ctx.fill(); rect(-13, -26, 6, 14, c); ctx.fillStyle = '#9fd9ff'; ctx.beginPath(); ctx.roundRect(0, -32, 14, 9, 4); ctx.fill(); rect(-9, -6, 7, 6, c); rect(2, -6, 7, 6, c); },
    cart(ctx, f, c, t) { rect(-14, -24, 28, 16, '#c9c9c9'); ctx.strokeStyle = '#888'; ctx.lineWidth = 1; for (let i = -10; i <= 10; i += 5) { ctx.beginPath(); ctx.moveTo(i, -24); ctx.lineTo(i, -8); ctx.stroke(); } ctx.beginPath(); ctx.arc(-9, -4, 4, 0, 7); ctx.arc(9, -4, 4, 0, 7); ctx.fillStyle = '#333'; ctx.fill(); ctx.beginPath(); ctx.arc(0, -32, 8, 0, 7); ctx.fillStyle = '#f0c8a0'; ctx.fill(); rect(-8, -40, 16, 5, c); rect(-14, -30, 6, 4, '#f0c8a0'); rect(8, -30, 6, 4, '#f0c8a0'); },
    portal(ctx, f, c, t) { ctx.strokeStyle = '#eee'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -33, 6, 0, 7); ctx.moveTo(0, -27); ctx.lineTo(0, -12); ctx.moveTo(0, -12); ctx.lineTo(-7, 0); ctx.moveTo(0, -12); ctx.lineTo(7, 0); ctx.moveTo(0, -22); ctx.lineTo(-10, -16); ctx.moveTo(0, -22); ctx.lineTo(12, -20); ctx.stroke(); rect(10, -24, 10, 7, '#ff8c1a'); rect(14, -22, 6, 3, '#2f8cff'); },
  };
  const fallback = (ctx, f, c) => { rect(-FW / 2, -FH, FW, FH, c); rect(4, -32, 5, 5, '#fff'); };

  function sendCtl() { G.send({ type: 'ctl', ...ctl }); }
  function setCtl(k, v) { if (ctl[k] !== v) { ctl[k] = v; sendCtl(); } }
  const KEYMAP = { a: 'left', ArrowLeft: 'left', d: 'right', ArrowRight: 'right', w: 'jump', ArrowUp: 'jump', ' ': 'jump', s: 'down', ArrowDown: 'down', j: 'attack', k: 'special' };

  function cardRects() {
    const cols = 4, cw = 190, ch = 150, gx = (W - cols * cw - (cols - 1) * 16) / 2;
    return CHARS.map((c, i) => ({ c, x: gx + (i % cols) * (cw + 16), y: 150 + Math.floor(i / cols) * (ch + 16), w: cw, h: ch }));
  }

  function drawFighter(f, p, t) {
    ctx.save();
    ctx.translate(f.x, f.y);
    if (f.inv && Math.floor(t * 12) % 2) ctx.globalAlpha = 0.4;
    if (f.hit) ctx.rotate(Math.sin(t * 40) * 0.1);
    ctx.scale(f.face, 1);
    (DRAW[f.char] || fallback)(ctx, f, p.color, t + f.anim / 10);
    if (f.atk) { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(26, -24, 14, -1.2, 1.2); ctx.lineTo(10, -24); ctx.fill(); }
    if (f.glide) { ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(-26, -48); ctx.lineTo(0, -58); ctx.lineTo(26, -48); ctx.lineTo(0, -44); ctx.fill(); }
    if (f.sus) { G.text('sus', 0, -50, { size: 12, color: '#ff6b6b' }); }
    ctx.restore();
    // color ring + name
    ctx.strokeStyle = p.color; ctx.lineWidth = f.id === G.me ? 3 : 1.5;
    ctx.beginPath(); ctx.ellipse(f.x, f.y + 2, 18, 5, 0, 0, 7); ctx.stroke();
    G.text(p.name, f.x, f.y - FH - 10, { size: 11, color: p.color });
    if (f.id === G.me) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(f.x, f.y - FH - 22); ctx.lineTo(f.x - 6, f.y - FH - 32); ctx.lineTo(f.x + 6, f.y - FH - 32); ctx.fill(); }
  }

  let clock = 0;
  return {
    state(ns) {
      s = ns;
      for (const e of ns.events || []) {
        if (e.type === 'hit') { sparks.push({ x: e.x, y: e.y, t: 0.4, text: '✦', size: 20 + Math.min(30, e.k / 15), color: '#fff' }); if (e.k > 500) shake = 0.15; }
        else if (e.type === 'ko') { const p = G.player(e.id); sparks.push({ x: W / 2, y: 110, t: 1.4, text: `KO! ${p.name}${e.by ? ' ← ' + G.player(e.by).name : ''}`, size: 36, color: '#ff5d5d' }); shake = 0.25; }
        else if (e.type === 'pound') { sparks.push({ x: e.x, y: e.y, t: 0.4, text: '▁▂▃▂▁', size: 24, color: '#ffd84d' }); shake = 0.15; }
        else if (e.type === 'roar') { sparks.push({ x: e.x, y: e.y - 30, t: 0.6, text: 'RAAWR', size: 28, color: '#6fbf3a' }); }
        else if (e.type === 'vent' || e.type === 'warp') { sparks.push({ x: e.x, y: e.y, t: 0.4, text: '◌', size: 30, color: '#9fd9ff' }); }
        else if (e.type === 'splat') { sparks.push({ x: e.x, y: e.y, t: 0.3, text: '*', size: 22, color: '#f3eccf' }); }
        else if (e.type === 'over') { const p = G.player(e.winner); sparks.push({ x: W / 2, y: H / 2, t: 3, text: `${p.name} WINS`, size: 48, color: '#ffd84d' }); }
      }
    },
    key(k, down) {
      const m = KEYMAP[k]; if (m) setCtl(m, down);
    },
    mouse(kind, x, y, e) {
      if (!s) return;
      if (s.phase === 'select') {
        if (kind !== 'down') return;
        for (const r of cardRects()) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { picked = r.c.id; G.send({ type: 'pick', char: picked }); }
        return;
      }
      const which = e && e.button === 2 ? 'special' : 'attack';
      if (kind === 'down') setCtl(which, true);
      if (kind === 'up') { setCtl('attack', false); setCtl('special', false); }
    },
    render(dt) {
      clock += dt;
      G.clear('#101322');
      if (!s) { G.text('Waiting…', W / 2, H / 2); return; }
      if (s.phase === 'select') {
        G.text('Pick your fighter', W / 2, 60, { size: 34 });
        G.text(`${Math.ceil(s.selectT)}s — click a card. Unpicked = random.`, W / 2, 100, { size: 16, color: '#aaa' });
        for (const r of cardRects()) {
          const mine = picked === r.c.id;
          const takers = s.fighters.filter((f) => f.char === r.c.id);
          ctx.fillStyle = mine ? '#2b3a2e' : '#1a1d27'; ctx.strokeStyle = mine ? '#5ee07a' : '#2a2f3f'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 12); ctx.fill(); ctx.stroke();
          ctx.save(); ctx.translate(r.x + r.w / 2, r.y + 78); ctx.scale(1.4, 1.4); (DRAW[r.c.id] || fallback)(ctx, {}, '#4da6ff', clock); ctx.restore();
          G.text(r.c.name, r.x + r.w / 2, r.y + 102, { size: 15 });
          G.text(r.c.move, r.x + r.w / 2, r.y + 122, { size: 12, color: '#aaa' });
          takers.forEach((f, i) => { G.circle(r.x + 14 + i * 16, r.y + 14, 6, G.player(f.id).color, '#000'); });
        }
        return;
      }
      ctx.save();
      if (shake > 0) { shake -= dt; ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10); }
      // stage
      ctx.fillStyle = '#1b2140'; for (let i = 0; i < 12; i++) ctx.fillRect(i * 80, 520 + (i % 3) * 20, 60, 200);
      const plats = [{ x: 150, y: 460, w: 600, h: 24, solid: true }, { x: 200, y: 340, w: 150, h: 10 }, { x: 550, y: 340, w: 150, h: 10 }, { x: 375, y: 230, w: 150, h: 10 }, { x: 400, y: 110, w: 100, h: 10, spawn: true }];
      for (const p of plats) { ctx.fillStyle = p.solid ? '#3b4a6b' : p.spawn ? 'rgba(120,160,255,.6)' : '#5c6b8f'; ctx.fillRect(p.x, p.y, p.w, p.h); if (p.solid) { ctx.fillStyle = '#5ee07a'; ctx.fillRect(p.x, p.y, p.w, 4); } }
      for (const b of s.blocks) {
        if (b.kind === 'dirt') { rect(b.x, b.y, b.w, b.h, '#7a5230'); rect(b.x, b.y, b.w, 8, '#5aa83a'); ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.strokeRect(b.x + .5, b.y + .5, b.w - 1, b.h - 1); }
        else { ctx.fillStyle = '#b08a52'; ctx.beginPath(); if (b.dir > 0) { ctx.moveTo(b.x, b.y + b.h); ctx.lineTo(b.x + b.w, b.y); ctx.lineTo(b.x + b.w, b.y + b.h); } else { ctx.moveTo(b.x + b.w, b.y + b.h); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x, b.y + b.h); } ctx.fill(); }
      }
      for (const p of s.portals) { ctx.strokeStyle = p.color === 'orange' ? '#ff8c1a' : '#2f8cff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(p.x, p.y, 10, 24, 0, 0, 7); ctx.stroke(); }
      for (const p of s.projectiles) { ctx.beginPath(); ctx.ellipse(p.x, p.y, 7, 9, 0, 0, 7); ctx.fillStyle = '#f3eccf'; ctx.fill(); }
      for (const f of s.fighters) { if (!f.alive || f.dead) continue; drawFighter(f, G.player(f.id), clock); }
      // sparks
      for (let i = sparks.length - 1; i >= 0; i--) { const k = sparks[i]; k.t -= dt; if (k.t <= 0) { sparks.splice(i, 1); continue; } G.text(k.text, k.x, k.y - (0.4 - Math.min(0.4, k.t)) * 40, { size: k.size, color: k.color }); }
      ctx.restore();
      // HUD
      G.timer(s.matchT);
      const cells = s.fighters, cw = Math.min(140, (W - 20) / cells.length);
      cells.forEach((f, i) => {
        const p = G.player(f.id), x = 10 + i * cw, y = H - 58;
        ctx.fillStyle = f.alive ? 'rgba(20,23,33,.9)' : 'rgba(20,23,33,.4)'; ctx.fillRect(x, y, cw - 6, 50);
        ctx.fillStyle = p.color; ctx.fillRect(x, y, 4, 50);
        G.text(p.name, x + 12, y + 12, { size: 12, align: 'left', color: p.color });
        G.text(f.alive ? f.dmg + '%' : 'OUT', x + 12, y + 34, { size: 20, align: 'left', color: f.dmg > 100 ? '#ff5d5d' : '#fff' });
        for (let k = 0; k < f.stocks; k++) G.circle(x + cw - 20 - k * 12, y + 14, 4, p.color);
        if (f.cd > 0 && f.alive) { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x + cw - 60, y + 40, 50 * Math.min(1, f.cd / 3), 4); }
      });
      const me = s.fighters.find((f) => f.id === G.me);
      if (me && me.dead) G.text('Respawning…', W / 2, H / 2, { size: 24, color: '#aaa' });
      if (me && !me.alive) G.text('You are out. Spectating…', W / 2, H - 80, { size: 14, color: '#aaa' });
    },
    destroy() {},
  };
});
