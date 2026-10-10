// FriendGame client framework. Games register with registerGame(id, factory).
// factory(G) returns { state(s), event(e), render(dt), key(key, down), mouse(kind, x, y, e), destroy() } (all optional)
(function () {
  const $ = (s) => document.querySelector(s);
  // WebSocket only: hosts like Vercel do not support Socket.IO's long-polling fallback
  // Two transports with the same interface. Normal: a Socket.IO server (WebSocket only, some hosts lack long-polling).
  // Peer-to-peer (public/p2p.js): for static hosts with no game server; the build sets window.FG_P2P there. ?p2p=1 / ?p2p=0 overrides it.
  const P2P = (() => { const q = new URLSearchParams(location.search).get('p2p'); return q === '1' ? true : q === '0' ? false : !!window.FG_P2P; })();
  const socket = P2P ? window.createP2PSocket() : io({ transports: ['websocket'] });
  const GAMES = {};
  let gameDefs = [];
  let room = null;
  let active = null;      // active game module instance
  let activeId = null;
  const FULL_WINDOW = new Set(['memekarts', 'blasters']);
  let lastFrame = 0;
  let myId = null;       // our stable player id (NOT the socket id; it survives a refresh)

  const canvas = $('#canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const G = {
    socket, canvas, ctx, W, H,
    get me() { return myId; },
    get room() { return room; },
    get players() { return room ? room.players : []; },
    player(id) { return (room && room.players.find((p) => p.id === id)) || { id, name: '?', color: '#888' }; },
    keys: new Set(),
    mouse: { x: W / 2, y: H / 2, down: false },
    ui: $('#ui'),
    send(msg) { socket.emit('input', msg); },
    setHint(t) { $('#gameHint').textContent = t || ''; },
    // drawing helpers
    text(t, x, y, opt = {}) {
      ctx.save();
      ctx.font = `${opt.weight || 600} ${opt.size || 16}px system-ui, sans-serif`;
      ctx.textAlign = opt.align || 'center';
      ctx.textBaseline = opt.base || 'middle';
      if (opt.stroke !== false) { ctx.lineWidth = opt.lw || 4; ctx.strokeStyle = opt.stroke || 'rgba(0,0,0,.7)'; ctx.lineJoin = 'round'; ctx.strokeText(t, x, y); }
      ctx.fillStyle = opt.color || '#fff';
      ctx.fillText(t, x, y);
      ctx.restore();
    },
    circle(x, y, r, color, stroke) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      if (stroke) { ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke(); }
    },
    nameTag(x, y, id, dy = -22) { const p = G.player(id); G.text(p.name, x, y + dy, { size: 12, color: p.color }); },
    timer(secs, x = W / 2, y = 24) { G.text(Math.max(0, Math.ceil(secs)) + 's', x, y, { size: 22, color: secs < 10 ? '#ff6b6b' : '#fff' }); },
    clear(color = '#0b0d13') { ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); },
    panel(html) { G.ui.innerHTML = `<div class="panel">${html}</div>`; return G.ui.firstElementChild; },
    clearUI() { G.ui.innerHTML = ''; },
    toast,
  };
  window.G = G;
  window.registerGame = (id, factory) => { GAMES[id] = factory; };

  // ---- screens -----------------------------------------------------------
  const screens = ['home', 'lobby', 'game', 'results'];
  function show(id) { for (const s of screens) $('#' + s).classList.toggle('hidden', s !== id); }
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2500); }

  // ---- home ---------------------------------------------------------------
  // ---- session: lets a refresh or a dropped connection reclaim the same player -----------------------------
  // The server gives each player a stable id and a secret key. They live in sessionStorage (per tab), so a refresh
  // rejoins as the same player while a second tab is still a separate player.
  const SESSION = 'fg_session';
  const saveSession = (r) => { try { sessionStorage.setItem(SESSION, JSON.stringify({ code: r.code, id: r.id, key: r.key })); } catch (e) { /* storage blocked */ } };
  const loadSession = () => { try { return JSON.parse(sessionStorage.getItem(SESSION) || 'null'); } catch (e) { return null; } };
  const clearSession = () => { myId = null; try { sessionStorage.removeItem(SESSION); } catch (e) { /* ignore */ } };
  // create / join a room, remembering who we are
  function enter(ev, data, then) { socket.emit(ev, data, (r) => { if (!r || r.error) return toast((r && r.error) || 'No response from the server'); myId = r.id; saveSession(r); then && then(r); }); }
  function goHome(msg) { clearSession(); room = null; stopGame(); show('home'); renderTestBox(); if (msg) toast(msg); }

  const nameEl = $('#name');
  nameEl.value = localStorage.getItem('fg_name') || '';
  const myName = () => { const n = nameEl.value.trim() || 'Player' + Math.floor(Math.random() * 90 + 10); localStorage.setItem('fg_name', n); return n; };
  // The home page has two primary games; window.selectedGame is the one whose tab is open (see home.js).
  const pickHomeGame = () => { const g = window.selectedGame === 'blasters' ? 'blasters' : 'memekarts'; socket.emit('pick', { gameId: g }); if (g === 'memekarts') socket.emit('pickMap', { mapId: window.selectedKartMap || 'stadium' }); else socket.emit('pickMap', { mapId: window.selectedBlMap || 'fort' }); return g; };
  $('#createBtn').onclick = () => enter('create', { name: myName() }, pickHomeGame);
  $('#joinBtn').onclick = () => enter('join', { name: myName(), code: $('#code').value });
  $('#code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#joinBtn').click(); });
  nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#createBtn').click(); });
  const qs = new URLSearchParams(location.search);
  if (qs.get('room')) $('#code').value = qs.get('room').toUpperCase();

  // ---- test mode (bots) ---------------------------------------------------
  $('#testBtn').onclick = () => enter('create', { name: myName() }, () => { pickHomeGame(); socket.emit('bots', { op: 'add', n: 3 }); toast('Test mode: 3 bots joined. Pick any game and press Start.'); });
  $('#botAdd').onclick = () => socket.emit('bots', { op: 'add', n: 1 });
  $('#botClear').onclick = () => socket.emit('bots', { op: 'clear' });
  function renderTestBox() {
    const inLobby = room && room.phase === 'lobby', host = room && room.hostId === myId;
    $('#testBtn').classList.toggle('hidden', !!room);
    $('#botCtl').classList.toggle('hidden', !(inLobby && host));
    $('#botClear').classList.toggle('hidden', !(room && room.players.some((p) => p.bot)));
  }

  // ---- lobby ---------------------------------------------------------------
  $('#leaveBtn').onclick = () => { socket.emit('leave'); goHome(); };
  $('#quitBtn').onclick = () => { if (confirm('Leave this room? The game carries on without you.')) { socket.emit('leave'); goHome(); } };
  $('#copyBtn').onclick = () => { navigator.clipboard?.writeText(`${location.origin}/?room=${room.code}`); toast('Invite link copied'); };
  $('#startBtn').onclick = () => socket.emit('start');
  $('#soloBtn').onclick = () => enter('create', { name: myName() }, () => {
    const g = pickHomeGame();
    socket.emit('bots', { op: 'add', n: g === 'blasters' ? 5 : 7 });
    socket.emit('start');
  });
  $('#returnKarts').onclick = () => socket.emit('pick', { gameId: 'memekarts' });
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $('#game').requestFullscreen();
    } catch (_) { toast('Fullscreen is unavailable here. The game still fills your window.'); }
  }
  $('#fullscreenBtn').onclick = fullscreen;
  document.addEventListener('fullscreenchange', () => { $('#fullscreenBtn').textContent = document.fullscreenElement ? '⛶ Exit fullscreen' : '⛶ Fullscreen'; });
  $('#againBtn').onclick = () => socket.emit('start');
  $('#lobbyBtn').onclick = () => socket.emit('lobby');
  $('#endBtn').onclick = () => { if (room && room.hostId === myId && confirm('End this game for everyone?')) socket.emit('lobby'); };

  // a Toy Box Blasters map card: a top-down plan of the arena (taller things drawn darker), ramps orange, pads cyan
  window.blMapCard = blMapCard; // the home page draws the same cards
  function blMapCard(m, selected = false, disabled = false) {
    const S = m.size, sc = 450 / S, X = (x) => 450 + x * sc, Z = (z) => 300 + z * sc, TH = m.theme || { floor: '#7fb77e' };
    const shade = (b) => { const h = Math.min(1, b.y1 / 7.2); return b.c || `rgba(40,30,20,${0.25 + h * 0.6})`; };
    const boxes = m.boxes.filter((b) => b.t !== 'wall' && b.t !== 'step').map((b) => `<rect x="${X(b.x0)}" y="${Z(b.z0)}" width="${(b.x1 - b.x0) * sc}" height="${(b.z1 - b.z0) * sc}" rx="3" fill="${shade(b)}"/>`).join('');
    const ramps = m.ramps.map((r) => `<rect x="${X(r.x0)}" y="${Z(r.z0)}" width="${(r.x1 - r.x0) * sc}" height="${(r.z1 - r.z0) * sc}" rx="3" fill="#ff8a1f"/>`).join('');
    const pads = m.pads.map((p) => `<circle cx="${X(p.x)}" cy="${Z(p.z)}" r="${p.r * sc * 1.4}" fill="#35e6ff"/>`).join('');
    const train = m.train ? `<line x1="20" y1="${Z(m.train.z)}" x2="880" y2="${Z(m.train.z)}" stroke="#3a3f4a" stroke-width="6" stroke-dasharray="14 10"/>` : '';
    return `<button class="map-card ${m.id} ${selected ? 'selected' : ''}" data-map="${m.id}" ${disabled ? 'disabled' : ''} aria-pressed="${selected}"><div class="map-art"><svg viewBox="0 0 900 600" aria-hidden="true"><rect x="20" y="20" width="860" height="560" rx="30" fill="${TH.floor}" stroke="#c9a06a" stroke-width="12"/>${train}${boxes}${ramps}${pads}</svg><span>${selected ? '✓ SELECTED' : 'BATTLE ARENA'}</span></div><div class="map-copy"><b>${esc(m.name)}</b><small>${esc(m.tag)}</small></div></button>`;
  }
  function renderLobby() {
    $('#roomCode').textContent = room.code;
    const isHost = room.hostId === myId;
    const kartGame = room.gameId === 'memekarts', blGame = room.gameId === 'blasters';
    $('#mapPicker').classList.toggle('hidden', !kartGame && !blGame);
    $('.lobby-heading').classList.toggle('hidden', !kartGame && !blGame);
    $('#returnKarts').classList.add('hidden'); // replaced by the two-game switch above the lobby heading
    for (const b of document.querySelectorAll('#gameSwitch [data-game]')) { b.classList.toggle('sel', b.dataset.game === room.gameId); b.disabled = !isHost; b.onclick = () => socket.emit('pick', { gameId: b.dataset.game }); }
    $('#arcade').classList.toggle('other', !kartGame && room.gameId !== 'blasters');
    $('#modePick').classList.toggle('hidden', !blGame);
    for (const b of document.querySelectorAll('#modePick [data-mode]')) { b.classList.toggle('sel', b.dataset.mode === (room.blastersMode || 'ffa') || b.dataset.mode === (room.blastersRounds || 'loop')); b.disabled = !isHost; b.onclick = () => socket.emit('pickMode', { mode: b.dataset.mode }); }
    $('#mapPicker').innerHTML = blGame ? window.BLASTERS.MAPS.map(m => blMapCard(m, m.id === room.blastersMap, !isHost)).join('') : window.MEMEKARTS_MAPS.map(m => window.kartMapCard(m, m.id === room.mapId, !isHost)).join('');
    for (const el of $('#mapPicker').querySelectorAll('[data-map]')) el.onclick = () => socket.emit('pickMap', { mapId: el.dataset.map });
    $('#playerList').innerHTML = room.players.map((p) => `<li><span class="dot" style="background:${p.color}"></span>${esc(p.name)}${p.bot ? '<span class="botTag">BOT</span>' : ''}${p.id === room.hostId ? ' <span class="hint">(host)</span>' : ''}<span style="margin-left:auto" class="hint">${p.score}</span></li>`).join('');
    $('#hostHint').textContent = (isHost ? 'You are the host: pick a game and press Start.' : 'Waiting for the host to start a game.') + (socket.hosting ? ' The room runs in this tab, so keep it open: closing or refreshing it ends the room for everyone.' : '');
    $('#gameGrid').innerHTML = gameDefs.map((g) => `<div class="gcard ${g.id === room.gameId ? 'sel' : ''}" data-id="${g.id}"><b>${esc(g.name)}</b><small>${esc(g.tagline)}</small><br><small>${g.min}–${g.max} players</small></div>`).join('');
    for (const el of document.querySelectorAll('.gcard')) el.onclick = () => isHost && socket.emit('pick', { gameId: el.dataset.id });
    const def = gameDefs.find((g) => g.id === room.gameId);
    $('#gameInfo').innerHTML = def ? `<b style="color:var(--text)">${esc(def.name)}</b> — ${esc(def.tagline)}<br><span class="hint">Controls: ${esc(def.controls)}</span>` : '';
    $('#startBtn').disabled = !isHost;
    $('#startBtn').textContent = isHost ? `Start ${def ? def.name : ''}` : 'Host starts the game';
  }

  function renderResults() {
    const r = room.results;
    const def = gameDefs.find((g) => g.id === r.gameId);
    $('#resTitle').textContent = (def ? def.name : 'Game') + ' — results';
    $('#resSummary').textContent = r.summary;
    $('#resTable').innerHTML = '<tr><th>#</th><th>Player</th><th class="num">This game</th><th class="num">Total</th></tr>' +
      r.rows.map((p, i) => `<tr><td>${i + 1}</td><td><span class="dot" style="background:${p.color}"></span> ${esc(p.name)}</td><td class="num">+${p.points}</td><td class="num">${p.score}</td></tr>`).join('');
    const isHost = room.hostId === myId;
    $('#againBtn').classList.toggle('hidden', !isHost);
    $('#lobbyBtn').classList.toggle('hidden', !isHost);
    $('#resHint').textContent = isHost ? '' : 'Waiting for the host.';
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ---- game lifecycle ------------------------------------------------------
  function startGame(id) {
    stopGame();
    $('#game').classList.toggle('kart-fullscreen', FULL_WINDOW.has(id)); // these games fill the whole window
    document.body.classList.toggle('racing', FULL_WINDOW.has(id));
    const factory = GAMES[id];
    const def = gameDefs.find((g) => g.id === id);
    $('#gameTitle').textContent = def ? def.name : id;
    G.setHint(def ? def.controls : '');
    G.clearUI();
    G.keys.clear();
    activeId = id;
    active = factory ? factory(G) : { render() { G.clear(); G.text('No client module for ' + id, W / 2, H / 2); } };
    $('#endBtn').classList.toggle('hidden', room.hostId !== myId);
    show('game');
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }
  function stopGame() {
    if (active && active.destroy) { try { active.destroy(); } catch (e) { console.error(e); } }
    active = null; activeId = null;
    // Local exits do not receive another room event after the socket leaves it.
    window.dispatchEvent(new Event('game-stopped'));
    $('#game').classList.remove('kart-fullscreen');
    document.body.classList.remove('racing');
    canvas.width = W; canvas.height = H;
    if (document.fullscreenElement === $('#game')) document.exitFullscreen().catch(() => {});
    G.clearUI();
  }
  function frame(now) {
    if (!active) return;
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    try { active.render && active.render(dt); } catch (e) { console.error(e); }
    requestAnimationFrame(frame);
  }

  // ---- input ---------------------------------------------------------------
  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  };
  window.addEventListener('keydown', (e) => {
    if (!active || e.target.tagName === 'INPUT') return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'f' && FULL_WINDOW.has(activeId) && !e.repeat) { fullscreen(); return; }
    if (k === ' ' || k.startsWith('Arrow')) e.preventDefault();
    if (G.keys.has(k)) return;
    G.keys.add(k);
    active.key && active.key(k, true, e);
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    G.keys.delete(k);
    if (active && active.key) active.key(k, false, e);
  });
  window.addEventListener('blur', () => { G.keys.clear(); });
  canvas.addEventListener('mousedown', (e) => { const p = toCanvas(e); G.mouse.x = p.x; G.mouse.y = p.y; G.mouse.down = true; active && active.mouse && active.mouse('down', p.x, p.y, e); e.preventDefault(); });
  window.addEventListener('mouseup', (e) => { const p = toCanvas(e); G.mouse.down = false; active && active.mouse && active.mouse('up', p.x, p.y, e); });
  window.addEventListener('mousemove', (e) => { const p = toCanvas(e); G.mouse.x = p.x; G.mouse.y = p.y; active && active.mouse && active.mouse('move', p.x, p.y, e); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('touchstart', (e) => { const t = e.touches[0]; const p = toCanvas(t); G.mouse.x = p.x; G.mouse.y = p.y; G.mouse.down = true; active && active.mouse && active.mouse('down', p.x, p.y, e); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', (e) => { const t = e.touches[0]; const p = toCanvas(t); G.mouse.x = p.x; G.mouse.y = p.y; active && active.mouse && active.mouse('move', p.x, p.y, e); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchend', (e) => { G.mouse.down = false; active && active.mouse && active.mouse('up', G.mouse.x, G.mouse.y, e); });

  // ---- socket --------------------------------------------------------------
  socket.on('games', (list) => { gameDefs = list; if (room) renderLobby(); });
  socket.on('toast', toast);
  socket.on('room', (r) => {
    const prev = room; room = r; renderTestBox();
    if (r.phase === 'lobby') { if (active) stopGame(); renderLobby(); show('lobby'); }
    else if (r.phase === 'results') { if (active) stopGame(); renderResults(); show('results'); }
    else if (r.phase === 'playing') { if (!active) startGame(r.gameId); $('#endBtn').classList.toggle('hidden', r.hostId !== myId); }
    void prev;
  });
  socket.on('game:start', ({ gameId }) => { if (!active || activeId !== gameId) startGame(gameId); });
  socket.on('g:state', (s) => { active && active.state && active.state(s); });
  socket.on('g:event', (e) => { active && active.event && active.event(e); });
  // Connection lost: keep the screen as it is; socket.io reconnects by itself and 'connect' below reclaims our seat.
  socket.on('disconnect', () => { if (room) toast('Connection lost. Reconnecting…'); });
  socket.on('connect', () => {
    const sess = loadSession(); if (!sess) return;
    socket.emit('rejoin', sess, (r) => {
      if (r && r.ok) { myId = r.id; saveSession(r); }
      else if (room) goHome((r && r.error) || 'That room has closed');
      else clearSession();
    });
  });
  socket.on('replaced', () => goHome('This player was opened in another tab'));
})();
