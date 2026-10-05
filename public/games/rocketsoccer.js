// Rocket Soccer client.
registerGame('rocketsoccer', (G) => {
  const { ctx, W, H } = G;
  const FX0 = 60, FX1 = 840, FY0 = 40, FY1 = 560, GY0 = 220, GY1 = 380, GD = 30, CUT = 70, BR = 18, CR = 16;
  const PADS = [[200, 120], [700, 120], [200, 480], [700, 480], [450, 100], [450, 500]];
  const TEAM = { blue: '#4da6ff', orange: '#ff9f43' };
  const VEHICLE_NAMES = ['Plumber kart', 'Pickup truck', 'Shopping cart', 'Battle bus', 'Octane', 'Tractor', 'Ice cream van', 'Rocket sled'];
  let s = null, lastCtl = '', time = 0;
  const fx = [], feed = [];

  function rr(x, y, w, h, r, fill, stroke) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); } }
  function wheels(fx1 = 10, bx = -12, hw = 12) { ctx.fillStyle = '#1b1b1b'; for (const [x, y] of [[bx, -hw - 2], [bx, hw - 2], [fx1, -hw - 2], [fx1, hw - 2]]) ctx.fillRect(x - 4, y, 8, 4); }
  function windshield(x = 4) { rr(x, -7, 8, 14, 2, 'rgba(200,230,255,.85)'); }
  // Parody vehicle shapes, heading = +x. Same list as Meme Karts.
  function drawVehicle(idx, color, x, y, a, sc = 1) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(sc, sc);
    switch (idx % 8) {
      case 0: wheels(); rr(-18, -11, 36, 22, 7, color, '#000'); rr(-8, -6, 8, 12, 3, '#3b6cff'); ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.quadraticCurveTo(12, -6, 16, -4); ctx.moveTo(10, 0); ctx.quadraticCurveTo(12, 6, 16, 4); ctx.stroke(); break;
      case 1: wheels(12, -12, 12); rr(-18, -11, 36, 22, 4, color, '#000'); rr(-17, -9, 16, 18, 2, 'rgba(0,0,0,.35)'); windshield(2); break;
      case 2: ctx.fillStyle = '#333'; for (const [x1, y1] of [[-13, -11], [-13, 9], [11, -11], [11, 9]]) ctx.fillRect(x1 - 2, y1, 4, 3); rr(-16, -10, 32, 20, 3, color, '#cfd3dc'); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1; for (let i = -10; i <= 10; i += 5) { ctx.beginPath(); ctx.moveTo(i, -10); ctx.lineTo(i, 10); ctx.stroke(); } rr(-21, -12, 5, 24, 2, '#d33'); break;
      case 3: wheels(14, -14, 12); rr(-24, -11, 48, 22, 5, color, '#000'); ctx.fillStyle = 'rgba(200,230,255,.85)'; for (let i = -18; i <= 14; i += 8) ctx.fillRect(i, -8, 6, 5); ctx.fillRect(18, -7, 4, 14); break;
      case 4: wheels(11, -11, 11); ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(8, -10); ctx.lineTo(-18, -9); ctx.lineTo(-18, 9); ctx.lineTo(8, 10); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke(); rr(-20, -13, 3, 26, 1, '#222'); windshield(0); break;
      case 5: ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.arc(-10, -12, 7, 0, 7); ctx.arc(-10, 12, 7, 0, 7); ctx.fill(); ctx.fillRect(10, -13, 6, 4); ctx.fillRect(10, 9, 6, 4); rr(-16, -8, 32, 16, 3, color, '#000'); rr(-8, -7, 12, 14, 2, 'rgba(255,255,255,.25)'); rr(14, -3, 6, 6, 1, '#555'); break;
      case 6: wheels(12, -12, 12); rr(-18, -11, 36, 22, 4, '#f4f4f4', '#000'); rr(-18, -3, 36, 6, 0, color); windshield(8); ctx.fillStyle = '#e9b77a'; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-10, -5); ctx.lineTo(-10, 5); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ff9ad5'; ctx.beginPath(); ctx.arc(-3, 0, 4, 0, 7); ctx.fill(); break;
      default: ctx.fillStyle = '#999'; ctx.fillRect(-18, -13, 34, 3); ctx.fillRect(-18, 10, 34, 3); rr(-14, -8, 32, 16, 8, color, '#000'); windshield(4); ctx.fillStyle = '#ff9f43'; ctx.beginPath(); ctx.moveTo(-14, -5); ctx.lineTo(-26 - Math.random() * 6, 0); ctx.lineTo(-14, 5); ctx.closePath(); ctx.fill(); break;
    }
    ctx.restore();
  }

  function sendCtl() {
    const k = G.keys;
    const c = { up: k.has('w') || k.has('ArrowUp'), down: k.has('s') || k.has('ArrowDown'), left: k.has('a') || k.has('ArrowLeft'), right: k.has('d') || k.has('ArrowRight'), boost: k.has('Shift') };
    const key = `${+c.up}${+c.down}${+c.left}${+c.right}${+c.boost}`;
    if (key !== lastCtl) { lastCtl = key; G.send(Object.assign({ type: 'ctl' }, c)); }
  }
  const nm = (id) => (id ? G.player(id).name : '?');

  function drawPitch() {
    G.clear('#17351f');
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(FX0 + CUT, FY0); ctx.lineTo(FX1 - CUT, FY0); ctx.lineTo(FX1, FY0 + CUT); ctx.lineTo(FX1, FY1 - CUT); ctx.lineTo(FX1 - CUT, FY1); ctx.lineTo(FX0 + CUT, FY1); ctx.lineTo(FX0, FY1 - CUT); ctx.lineTo(FX0, FY0 + CUT); ctx.closePath();
    ctx.fillStyle = '#2f7a3f'; ctx.fill();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.04)'; for (let x = FX0; x < FX1; x += 120) ctx.fillRect(x, FY0, 60, FY1 - FY0);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(FX0 + CUT, FY0); ctx.lineTo(FX1 - CUT, FY0); ctx.lineTo(FX1, FY0 + CUT); ctx.lineTo(FX1, GY0); ctx.moveTo(FX1, GY1); ctx.lineTo(FX1, FY1 - CUT); ctx.lineTo(FX1 - CUT, FY1); ctx.lineTo(FX0 + CUT, FY1); ctx.lineTo(FX0, FY1 - CUT); ctx.lineTo(FX0, GY1); ctx.moveTo(FX0, GY0); ctx.lineTo(FX0, FY0 + CUT); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(450, FY0); ctx.lineTo(450, FY1); ctx.stroke();
    ctx.beginPath(); ctx.arc(450, 300, 70, 0, 7); ctx.stroke();
    ctx.strokeRect(FX0, GY0 - 60, 120, GY1 - GY0 + 120); ctx.strokeRect(FX1 - 120, GY0 - 60, 120, GY1 - GY0 + 120);
    // goals
    rr(FX0 - GD, GY0, GD, GY1 - GY0, 0, 'rgba(77,166,255,.35)', TEAM.blue);
    rr(FX1, GY0, GD, GY1 - GY0, 0, 'rgba(255,159,67,.35)', TEAM.orange);
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1;
    for (let y = GY0; y <= GY1; y += 10) { ctx.beginPath(); ctx.moveTo(FX0 - GD, y); ctx.lineTo(FX0, y); ctx.moveTo(FX1, y); ctx.lineTo(FX1 + GD, y); ctx.stroke(); }
  }

  return {
    state(ns) { s = ns; },
    event(e) {
      if (e.type === 'goal') { feed.unshift({ text: e.own ? `Own goal by ${nm(e.scorer)}!` : `${nm(e.scorer)} scores for ${e.team}${e.assist ? ` (assist ${nm(e.assist)})` : ''}`, t: 5 }); }
      if (e.type === 'demo') { fx.push({ x: e.x, y: e.y, r: 50, t: 0.6, c: '255,120,60' }); feed.unshift({ text: `${nm(e.by)} demolished ${nm(e.victim)}`, t: 4 }); }
      if (e.type === 'power') fx.push({ x: e.x, y: e.y, r: 40, t: 0.4, c: '255,255,255' });
      if (e.type === 'save') feed.unshift({ text: `Save by ${nm(e.id)}!`, t: 3 });
      if (e.type === 'over') feed.unshift({ text: e.winner ? `${e.winner.toUpperCase()} WINS` : 'Draw', t: 5 });
      if (feed.length > 5) feed.length = 5;
    },
    key() { sendCtl(); },
    render(dt) {
      time += dt; sendCtl();
      drawPitch();
      if (!s) { G.text('Waiting for state…', W / 2, H / 2); return; }
      s.pads.forEach((on, i) => { const [x, y] = PADS[i]; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); rr(-9, -9, 18, 18, 3, on ? '#ffd84d' : 'rgba(0,0,0,.25)', on ? '#fff' : 'rgba(255,255,255,.2)'); ctx.restore(); });
      // cars
      for (const c of s.cars) {
        if (c.dead) continue;
        const p = G.player(c.id);
        if (c.bst) { ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a); ctx.fillStyle = `rgba(255,${150 + Math.random() * 100 | 0},50,.8)`; ctx.beginPath(); ctx.moveTo(-18, -5); ctx.lineTo(-30 - Math.random() * 12, 0); ctx.lineTo(-18, 5); ctx.closePath(); ctx.fill(); ctx.restore(); }
        drawVehicle(c.v, TEAM[c.team], c.x, c.y, c.a);
        if (c.id === G.me) { ctx.beginPath(); ctx.arc(c.x, c.y, CR + 9, 0, 7); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]); }
        G.text(p.name, c.x, c.y - 26, { size: 12, color: p.color });
        G.text(VEHICLE_NAMES[c.v % 8], c.x, c.y + 26, { size: 10, color: 'rgba(255,255,255,.7)' });
      }
      // ball
      const b = s.ball;
      ctx.beginPath(); ctx.arc(b.x + 2, b.y + 4, BR, 0, 7); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill();
      G.circle(b.x, b.y, BR, '#f2f2f2', '#333');
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(b.x, b.y, BR * 0.6, time * 3, time * 3 + Math.PI); ctx.stroke(); ctx.beginPath(); ctx.arc(b.x, b.y, BR * 0.6, time * 3 + Math.PI * 1.3, time * 3 + Math.PI * 1.9); ctx.stroke();
      // fx
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t -= dt; if (f.t <= 0) { fx.splice(i, 1); continue; } const p = 1 - f.t / 0.6; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + 0.7 * p), 0, 7); ctx.strokeStyle = `rgba(${f.c},${1 - p})`; ctx.lineWidth = 4; ctx.stroke(); }
      // HUD
      rr(W / 2 - 110, 6, 220, 44, 10, 'rgba(0,0,0,.6)');
      G.text(s.score.blue, W / 2 - 60, 28, { size: 30, color: TEAM.blue });
      G.text(s.score.orange, W / 2 + 60, 28, { size: 30, color: TEAM.orange });
      if (s.ot) G.text(`OT ${Math.floor((s.otl || 0) / 60)}:${String((s.otl || 0) % 60).padStart(2, '0')}`, W / 2, 28, { size: 16, color: '#ff6b6b' }); else G.text(`${Math.floor(s.t / 60)}:${String(s.t % 60).padStart(2, '0')}`, W / 2, 28, { size: 18, color: s.t < 15 ? '#ff6b6b' : '#fff' });
      const me = s.cars.find((c) => c.id === G.me);
      if (me) {
        rr(14, H - 34, 160, 20, 6, 'rgba(0,0,0,.6)');
        rr(16, H - 32, 156 * me.boost / 100, 16, 5, me.boost > 0 ? '#ffd84d' : '#555');
        G.text(`BOOST ${me.boost}`, 94, H - 24, { size: 12 });
      } else {
        const bench = s.bench.find((x) => x.id === G.me);
        G.text(bench ? `On the bench for ${bench.team} — you sub in at the next goal` : 'Spectating', W / 2, H - 22, { size: 14, color: '#ddd' });
      }
      if (s.bench.length) G.text('Bench: ' + s.bench.map((x) => nm(x.id)).join(', '), W - 14, H - 14, { size: 11, align: 'right', color: '#bbb' });
      for (let i = feed.length - 1; i >= 0; i--) { const f = feed[i]; f.t -= dt; if (f.t <= 0) feed.splice(i, 1); }
      feed.forEach((f, i) => G.text(f.text, W / 2, 68 + i * 18, { size: 13, color: `rgba(255,255,255,${Math.min(1, f.t)})` }));
      if (s.freeze > 0 && s.msg) { G.text(s.msg, W / 2, H / 2 - 20, { size: 64, color: '#ffd84d' }); }
      else if (s.msg) G.text(s.msg, W / 2, H / 2 - 100, { size: 20, color: '#ffd84d' });
      if (s.t === 180 && !s.ot && !s.freeze && s.score.blue + s.score.orange === 0) G.text('KICKOFF', W / 2, H / 2 - 100, { size: 20, color: '#ffd84d' });
    },
  };
});
