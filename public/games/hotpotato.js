registerGame('hotpotato', (G) => {
  const { ctx, W, H } = G;
  const CX = 450, CY = 330, RING = 200, R = 26;
  let s = null, q = null, holder = null, phase = 'wait';
  let potato = { x: CX, y: CY, from: null, to: null, t: 1 }; // flight anim
  let banner = null, uiShown = null, boomT = 0;
  const alive = () => (s ? s.alive : []);
  const seat = (id) => {
    const list = alive(); const i = list.indexOf(id);
    const n = Math.max(1, list.length);
    if (i < 0) return { x: CX, y: CY };
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return { x: CX + Math.cos(a) * RING, y: CY + Math.sin(a) * RING };
  };
  const hoverSeat = (x, y) => alive().find((id) => { const p = seat(id); return Math.hypot(p.x - x, p.y - y) < R + 8; });

  function showAnswerUI() {
    if (uiShown === q.n) return; uiShown = q.n;
    const el = G.panel(`<h3>${esc(q.q)}</h3><div class="opts">${q.options.map((o, i) => `<button data-i="${i}">${esc(o)}</button>`).join('')}</div><p class="hint">Boom. You have 10 seconds.</p>`);
    for (const b of el.querySelectorAll('button')) b.onclick = () => { G.send({ type: 'answer', i: +b.dataset.i }); G.clearUI(); };
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  return {
    state(ns) {
      s = ns; phase = s.phase;
      if (s.phase === 'answer' && s.answerer === G.me && q) showAnswerUI();
      if (s.phase !== 'answer') { if (uiShown !== null) { G.clearUI(); uiShown = null; } }
      if (phase === 'potato' && potato.t >= 1 && s.holder) { const p = seat(s.holder); potato.x = p.x; potato.y = p.y; }
    },
    event(e) {
      if (e.type === 'question') { q = e; holder = e.holder; banner = null; const p = seat(e.holder); potato = { x: p.x, y: p.y, t: 1 }; }
      if (e.type === 'pass') { holder = e.to; potato = { from: e.from ? seat(e.from) : { x: CX, y: CY }, to: seat(e.to), t: 0, x: potato.x, y: potato.y }; }
      if (e.type === 'boom') { boomT = 0.8; holder = e.holder; }
      if (e.type === 'result') {
        const p = G.player(e.id);
        banner = e.ok ? { text: `${p.name}: Correct!`, color: '#5ee07a', t: 2 } : { text: `${p.name} is out. Answer: ${q ? q.options[e.answer] : ''}`, color: '#ff5d5d', t: 2.5 };
      }
      if (e.type === 'over') { const names = e.winners.map((id) => G.player(id).name).join(' & '); banner = { text: names ? `${names} wins!` : 'Nobody survived', color: '#ffd84d', t: 5 }; }
    },
    mouse(kind, x, y) {
      if (kind !== 'down' || !s || s.phase !== 'potato' || s.holder !== G.me) return;
      const to = hoverSeat(x, y);
      if (to && to !== G.me) G.send({ type: 'pass', to });
    },
    render(dt) {
      G.clear('#120d0b');
      if (!s) { G.text('Get ready…', W / 2, H / 2); return; }
      // table: wooden disc with rim, grain rings and a subtle vignette
      const tg = ctx.createRadialGradient(CX - 40, CY - 40, 10, CX, CY, RING - 40);
      tg.addColorStop(0, '#6b4a2e'); tg.addColorStop(1, '#3a2617');
      ctx.beginPath(); ctx.arc(CX, CY, RING - 45, 0, Math.PI * 2); ctx.fillStyle = tg; ctx.fill();
      ctx.lineWidth = 10; ctx.strokeStyle = '#2a1a10'; ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.05)';
      for (let r = 30; r < RING - 50; r += 22) { ctx.beginPath(); ctx.arc(CX + 6, CY + 4, r, 0, Math.PI * 2); ctx.stroke(); }
      // question
      if (q) {
        G.text(`Q${q.n}`, 40, 22, { size: 14, color: '#aaa', align: 'left' });
        wrapText(q.q, W / 2, 28, 760, 20);
        q.options.forEach((o, i) => G.text(`${'ABCD'[i]}. ${o}`, W / 2 + (i % 2 === 0 ? -200 : 200), 84 + Math.floor(i / 2) * 22, { size: 14, color: '#cfd3dd' }));
      }
      // seats
      const mine = s.holder === G.me && s.phase === 'potato';
      for (const id of alive()) {
        const p = seat(id), pl = G.player(id);
        const hov = mine && id !== G.me && hoverSeat(G.mouse.x, G.mouse.y) === id;
        if (hov) G.circle(p.x, p.y, R + 8, 'rgba(255,255,255,.18)');
        if (s.holder === id && (s.phase === 'potato' || s.phase === 'answer')) { ctx.beginPath(); ctx.arc(p.x, p.y, R + 5, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,160,40,.8)'; ctx.lineWidth = 3; ctx.stroke(); }
        ctx.beginPath(); ctx.arc(p.x, p.y + 4, R, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
        G.circle(p.x, p.y, R, pl.color, id === G.me ? '#fff' : 'rgba(0,0,0,.4)');
        // face: eyes look toward the potato
        const ang = Math.atan2(potato.y - p.y, potato.x - p.x);
        for (const ex of [-8, 8]) { G.circle(p.x + ex, p.y - 4, 5, '#fff'); G.circle(p.x + ex + Math.cos(ang) * 2, p.y - 4 + Math.sin(ang) * 2, 2.4, '#111'); }
        ctx.beginPath(); ctx.arc(p.x, p.y + 6, 7, 0.15 * Math.PI, 0.85 * Math.PI); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.stroke();
        if (s.correct && s.correct[id]) G.text('✓' + s.correct[id], p.x, p.y, { size: 13 });
        G.nameTag(p.x, p.y, id, -R - 12);
      }
      // eliminated list
      if (s.out.length) G.text('Out: ' + s.out.map((id) => G.player(id).name).join(', '), W / 2, H - 14, { size: 13, color: '#888' });
      // potato
      if (potato.t < 1) {
        potato.t = Math.min(1, potato.t + dt * 4);
        const u = potato.t, f = potato.from, to = potato.to;
        potato.x = f.x + (to.x - f.x) * u; potato.y = f.y + (to.y - f.y) * u - Math.sin(u * Math.PI) * 90;
      } else if (s.holder) { const p = seat(s.holder); potato.x = p.x; potato.y = p.y; }
      if (s.phase === 'potato' || s.phase === 'answer') {
        const heat = Math.min(1, s.held / 6);
        const sh = heat * 5;
        const px = potato.x + 38 + (Math.random() - 0.5) * sh, py = potato.y - 22 + (Math.random() - 0.5) * sh;
        const col = `rgb(${Math.round(200 + 55 * heat)},${Math.round(150 - 120 * heat)},${Math.round(60 - 50 * heat)})`;
        // glow
        const gl = ctx.createRadialGradient(px, py, 4, px, py, 46); gl.addColorStop(0, `rgba(255,${140 - heat * 100},0,${0.25 + heat * 0.35})`); gl.addColorStop(1, 'rgba(255,80,0,0)');
        ctx.beginPath(); ctx.arc(px, py, 46, 0, Math.PI * 2); ctx.fillStyle = gl; ctx.fill();
        // body
        ctx.beginPath(); ctx.ellipse(px, py, 24, 17, 0.3, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#3a2410'; ctx.stroke();
        for (const [ox, oy] of [[-8, -5], [6, 4], [10, -6], [-2, 7]]) G.circle(px + ox, py + oy, 2, 'rgba(60,35,15,.8)');
        // fuse with spark
        ctx.beginPath(); ctx.moveTo(px + 14, py - 12); ctx.quadraticCurveTo(px + 24, py - 26, px + 18, py - 32); ctx.lineWidth = 3; ctx.strokeStyle = '#d9c7a0'; ctx.stroke();
        G.circle(px + 18 + (Math.random() - 0.5) * 3, py - 33 + (Math.random() - 0.5) * 3, 4 + Math.random() * 2, '#ffd84d');
        G.circle(px + 18, py - 33, 2, '#fff');
        if (heat > 0.3) for (let i = 0; i < 4; i++) G.circle(px - 14 + i * 9, py - 24 - Math.random() * 10 * heat, 3 + heat * 3, `rgba(255,${100 - heat * 60},0,${0.3 + heat * 0.4})`);
      }
      if (boomT > 0) { boomT -= dt; ctx.fillStyle = `rgba(255,120,0,${boomT * 0.5})`; ctx.fillRect(0, 0, W, H); G.text('BOOM!', potato.x, potato.y - 60, { size: 40 + (0.8 - boomT) * 40, color: '#ffd84d' }); }
      // phase text
      const hp = G.player(s.holder || '');
      if (s.phase === 'potato') G.text(mine ? 'YOU have the potato — click someone to pass it!' : `${hp.name} has the potato`, W / 2, H - 40, { size: 18, color: mine ? '#ffd84d' : '#ddd' });
      if (s.phase === 'answer') { const a = G.player(s.answerer); G.text(s.answerer === G.me ? 'Answer now!' : `${a.name} is answering…`, W / 2, H - 40, { size: 18, color: '#ff9f43' }); G.text(`${Math.ceil(s.timer)}s`, W - 40, 22, { size: 22, color: '#ff6b6b' }); }
      if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; else G.text(banner.text, W / 2, CY, { size: 26, color: banner.color }); }
    },
    destroy() { G.clearUI(); },
  };
  function wrapText(text, x, y, maxW, lh) {
    ctx.font = '600 17px system-ui'; const words = text.split(' '); let line = '', lines = [];
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW) { lines.push(line); line = w; } else line = t; }
    lines.push(line); lines.forEach((l, i) => G.text(l, x, y + i * lh, { size: 17 }));
  }
});
