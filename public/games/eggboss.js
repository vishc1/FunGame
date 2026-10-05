registerGame('eggboss', (G) => {
  const { ctx, W, H } = G;
  let s = null;
  const fx = []; // {kind,x,y,t,text}
  let lastDir = { dx: 0, dy: 0 };
  let shards = null;
  const me = () => s && s.ents.find((e) => e.id === G.me);

  function sendMove() {
    const k = G.keys;
    let dx = (k.has('d') || k.has('ArrowRight') ? 1 : 0) - (k.has('a') || k.has('ArrowLeft') ? 1 : 0);
    let dy = (k.has('s') || k.has('ArrowDown') ? 1 : 0) - (k.has('w') || k.has('ArrowUp') ? 1 : 0);
    if (dx !== lastDir.dx || dy !== lastDir.dy) { lastDir = { dx, dy }; G.send({ type: 'move', dx, dy }); }
  }
  function attack() { G.send({ type: 'attack', x: G.mouse.x, y: G.mouse.y }); }

  function drawEgg(e, hpRatio) {
    const r = 60;
    ctx.save(); ctx.translate(e.x, e.y);
    ctx.beginPath(); ctx.ellipse(0, 8, r, r * 1.15, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 1.15, 0, 0, Math.PI * 2);
    ctx.fillStyle = e.rolling ? '#fff2cc' : '#f7f1e3'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = e.id === G.me ? '#fff' : '#b5a98a'; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-18, -30, 12, 20, -0.4, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
    // cracks grow as hp drops
    const cracks = Math.floor((1 - hpRatio) * 14);
    ctx.strokeStyle = '#4a3f2f'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < cracks; i++) {
      const a = i * 2.39996, len = 18 + (i % 4) * 9;
      let x = Math.cos(a) * 20, y = Math.sin(a) * 26;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += Math.cos(a + (k % 2 ? 0.6 : -0.6)) * len / 4; y += Math.sin(a + (k % 2 ? 0.6 : -0.6)) * len / 4; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // face
    G.circle(-16, -8, 7, '#fff'); G.circle(16, -8, 7, '#fff');
    G.circle(-14, -8, 3.5, '#222'); G.circle(18, -8, 3.5, '#222');
    ctx.beginPath(); ctx.arc(0, 12, 12, 0.2, Math.PI - 0.2); ctx.strokeStyle = '#222'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
    if (e.stun > 0) G.text('✦ stunned', e.x, e.y - 90, { size: 14, color: '#ffd84d' });
  }
  function drawSmall(e) {
    const p = G.player(e.id), r = 14;
    ctx.beginPath(); ctx.arc(e.x, e.y + 3, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill();
    G.circle(e.x, e.y, r, e.stun > 0 ? '#777' : p.color, e.id === G.me ? '#fff' : 'rgba(0,0,0,.4)');
    G.circle(e.x - 5, e.y - 3, 3, '#fff'); G.circle(e.x + 5, e.y - 3, 3, '#fff');
    G.circle(e.x - 4, e.y - 3, 1.5, '#111'); G.circle(e.x + 6, e.y - 3, 1.5, '#111');
    if (e.swing > 0 && s) { const b = s.ents.find((q) => q.id === s.bossId); if (b) { const a = Math.atan2(b.y - e.y, b.x - e.x); ctx.beginPath(); ctx.arc(e.x, e.y, 26, a - 0.8, a + 0.8); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 4; ctx.stroke(); } }
    if (e.stun > 0) G.text('✦', e.x, e.y - 30, { size: 16, color: '#ffd84d' });
    G.nameTag(e.x, e.y, e.id, -24);
  }

  return {
    state(ns) { s = ns; },
    event(e) {
      if (e.type === 'hit') fx.push({ kind: 'hit', x: e.x, y: e.y, t: 0.3 });
      if (e.type === 'smash') fx.push({ kind: 'smash', x: e.x, y: e.y, t: 0.5 });
      if (e.type === 'over') {
        if (e.cracked) { const b = s && s.ents.find((q) => q.id === e.bossId); const x = b ? b.x : W / 2, y = b ? b.y : H / 2; shards = { t: 0, parts: Array.from({ length: 22 }, (_, i) => ({ x, y, vx: Math.cos(i) * (120 + (i % 5) * 60), vy: Math.sin(i * 1.7) * 200 - 150, a: i })) }; fx.push({ kind: 'text', text: 'CRACKED!', t: 2.5 }); }
        else fx.push({ kind: 'text', text: 'The egg survives!', t: 2 });
      }
    },
    key(k, down) {
      sendMove();
      if (down && k === ' ') attack();
      if (k === 'Shift') G.send({ type: 'roll', down });
    },
    mouse(kind, x, y, ev) {
      if (kind === 'down') { if (ev && ev.button === 2) G.send({ type: 'roll', down: true }); else attack(); }
      if (kind === 'up' && ev && ev.button === 2) G.send({ type: 'roll', down: false });
    },
    render(dt) {
      sendMove();
      G.clear('#0f1a12');
      // floor
      ctx.fillStyle = '#1b2d1f'; ctx.fillRect(20, 20, W - 40, H - 40);
      ctx.strokeStyle = '#2f4a35'; ctx.lineWidth = 2;
      for (let x = 20; x <= W - 20; x += 60) { ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, H - 20); ctx.stroke(); }
      for (let y = 20; y <= H - 20; y += 60) { ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(W - 20, y); ctx.stroke(); }
      if (!s) { G.text('Waiting for state…', W / 2, H / 2); return; }
      const bossE = s.ents.find((e) => e.id === s.bossId);
      // smash telegraph
      if (s.smash) {
        ctx.beginPath(); ctx.arc(s.smash.x, s.smash.y, 150 * s.smash.p, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,80,60,.25)'; ctx.fill();
        ctx.beginPath(); ctx.arc(s.smash.x, s.smash.y, 150, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,80,60,.8)'; ctx.lineWidth = 3; ctx.stroke();
      }
      // fx
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i]; f.t -= dt; if (f.t <= 0) { fx.splice(i, 1); continue; }
        if (f.kind === 'hit') { ctx.beginPath(); ctx.arc(f.x, f.y, 10 + (0.3 - f.t) * 60, 0, Math.PI * 2); ctx.strokeStyle = `rgba(255,220,100,${f.t / 0.3})`; ctx.lineWidth = 3; ctx.stroke(); }
        if (f.kind === 'smash') { ctx.beginPath(); ctx.arc(f.x, f.y, 150 + (0.5 - f.t) * 80, 0, Math.PI * 2); ctx.strokeStyle = `rgba(255,120,80,${f.t / 0.5})`; ctx.lineWidth = 8; ctx.stroke(); }
        if (f.kind === 'text') G.text(f.text, W / 2, H / 2 - 40, { size: 48, color: '#ffd84d' });
      }
      // entities
      if (shards) {
        shards.t += dt;
        for (const p of shards.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a + shards.t * 4); ctx.fillStyle = '#f7f1e3'; ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(10, -4); ctx.lineTo(4, 9); ctx.lineTo(-8, 7); ctx.closePath(); ctx.fill(); ctx.restore(); }
      } else if (bossE) drawEgg(bossE, s.hp / s.maxHp);
      for (const e of s.ents) if (e.id !== s.bossId) drawSmall(e);
      if (bossE && !shards) G.nameTag(bossE.x, bossE.y, bossE.id, -95);
      // range hint for me
      const m = me();
      if (m && m.id !== s.bossId && bossE) {
        const d = Math.hypot(bossE.x - m.x, bossE.y - m.y);
        if (d <= 95 + 14 && m.cd <= 0 && m.stun <= 0) { ctx.beginPath(); ctx.arc(m.x, m.y, 20, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); }
      }
      // HUD
      const bw = 320, bx = (W - bw) / 2;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(bx, 14, bw, 20);
      ctx.fillStyle = s.hp / s.maxHp > 0.3 ? '#ff5d5d' : '#ffd84d'; ctx.fillRect(bx + 2, 16, (bw - 4) * (s.hp / s.maxHp), 16);
      G.text(`EGG  ${s.hp} / ${s.maxHp}`, W / 2, 24, { size: 13 });
      G.timer(90 - s.t, 60, 24);
      const board = s.ents.filter((e) => e.id !== s.bossId).sort((a, b) => b.dmg - a.dmg);
      board.forEach((e, i) => { const p = G.player(e.id); G.text(`${p.name}  ${e.dmg}`, W - 30, 40 + i * 18, { size: 13, color: p.color, align: 'right' }); });
      if (m) {
        if (m.id === s.bossId) {
          G.text('YOU ARE THE EGG', W / 2, H - 42, { size: 26, color: '#f7f1e3' });
          G.text(m.rolling ? 'ROLLING' : (m.rollCd > 0 ? `roll ready in ${m.rollCd.toFixed(1)}s` : 'Shift / right-click: roll') + (m.cd > 0 ? `   smash ${m.cd.toFixed(1)}s` : '   smash ready'), W / 2, H - 20, { size: 13, color: '#ccc' });
        } else G.text('Get close and hit it!', W / 2, H - 22, { size: 13, color: '#aaa' });
      }
      if (s.countdown > 0) G.text(Math.ceil(s.countdown), W / 2, H / 2, { size: 90 });
    },
  };
});
