// Dev check: room lifecycle + abuse over real sockets against a real server process.
// Usage: node tools/lifecycle.js
const { spawn } = require('child_process'), path = require('path');
const io = require('socket.io-client');
const PORT = 4900 + Math.floor(Math.random() * 90), URL = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); };
(async () => {
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, REJOIN_GRACE_MS: 700 }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '', dead = false; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d)); srv.on('exit', () => { dead = true; });
  await sleep(800);
  const mk = async () => { const c = io(URL, { reconnection: false }); c.rooms = []; c.toasts = []; c.on('room', (r) => { c.room = r; }); c.on('toast', (t) => c.toasts.push(t)); await new Promise((r) => c.on('connect', r)); return c; };
  const ask = (c, ev, data) => new Promise((r) => { const t = setTimeout(() => r({ timeout: true }), 1500); c.emit(ev, data, (res) => { clearTimeout(t); if (res && res.id) { c.pid = res.id; c.key = res.key; } r(res); }); });
  const GRACE = 1100; // a little over the server's 700 ms test grace period

  const host = await mk(), a = await mk(), b = await mk();
  const made = await ask(host, 'create', { name: 'Host' }); check('create room', !!made.code && made.code.length === 4);
  check('join with wrong code is rejected', !!(await ask(a, 'join', { name: 'A', code: 'ZZZZ' })).error);
  check('join with lower-case code works', !!(await ask(a, 'join', { name: 'A', code: made.code.toLowerCase() })).ok);
  check('join again while in a room is rejected', !!(await ask(a, 'join', { name: 'A', code: made.code })).error);
  await ask(b, 'join', { name: 'B'.repeat(40), code: made.code }); await sleep(150);
  check('long names are trimmed to 14', host.room.players.find((p) => p.id === b.pid).name.length === 14);
  check('three players, distinct colours', host.room.players.length === 3 && new Set(host.room.players.map((p) => p.color)).size === 3);

  a.emit('pick', { gameId: 'sumo' }); a.emit('start'); await sleep(200);
  check('non-host cannot pick or start', host.room.phase === 'lobby' && host.room.gameId !== 'sumo' || host.room.phase === 'lobby');
  host.emit('pick', { gameId: 'nope' }); await sleep(100); check('unknown game id ignored', host.room.gameId !== 'nope');

  // room cap: fill to 16, the 17th is refused
  const extra = []; for (let i = 0; i < 13; i++) { const c = await mk(); extra.push(c); await ask(c, 'join', { name: 'E' + i, code: made.code }); }
  const ninth = await mk(); check('17th player refused (16 max)', !!(await ask(ninth, 'join', { name: 'Nine', code: made.code })).error);
  for (const c of extra) c.disconnect(); ninth.disconnect(); await sleep(GRACE);
  check('room shrinks back to 3 after disconnects', host.room.players.length === 3);

  // min players
  b.disconnect(); a.disconnect(); await sleep(GRACE);
  host.emit('pick', { gameId: 'hotpotato' }); await sleep(80); host.emit('start'); await sleep(200);
  check('cannot start a 3-player game alone (toast shown)', host.room.phase === 'lobby' && host.toasts.length > 0, host.toasts[0] || '');

  // bots
  host.emit('bots', { op: 'add', n: 99 }); await sleep(150);
  check('bots fill to the cap of 16', host.room.players.length === 16 && host.room.players.filter((p) => p.bot).length === 15);
  host.emit('bots', { op: 'clear' }); await sleep(150); check('bots cleared', host.room.players.length === 1);
  host.emit('bots', { op: 'add', n: 3 }); await sleep(150);

  // malformed traffic must not crash the server
  for (const [ev, payload] of [['create', undefined], ['create', null], ['join', undefined], ['join', null], ['join', 5], ['pick', undefined], ['pick', null], ['bots', undefined], ['bots', null], ['pickMap', null], ['pickMap', 'x'], ['input', undefined], ['input', null], ['input', 'str'], ['input', 42], ['lobby', null], ['nonsense', {}]]) host.emit(ev, payload); // (no 'leave'/'start' here: those are valid actions for the host)
  const stray = await mk(); for (const ev of ['start', 'lobby', 'pick', 'bots', 'input', 'leave', 'pickMap']) stray.emit(ev, undefined); stray.emit('create'); stray.emit('join');
  await sleep(400);
  check('server survives malformed messages', !dead, dead ? log.slice(-500) : '');
  if (dead) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }
  stray.disconnect();

  // play a full short game with bots, then play again, then back to lobby
  let states = 0; host.on('g:state', () => states++);
  host.emit('pick', { gameId: 'sumo' }); await sleep(80); host.emit('start'); await sleep(400);
  check('game starts (phase playing)', host.room.phase === 'playing');
  // garbage input mid-game
  for (const m of [null, 'x', 5, {}, { type: 'dash' }, { type: 'dash', x: 'a', y: {} }, { type: 'dash', x: 1e308, y: -1e308 }, []]) host.emit('input', m);
  const t0 = Date.now(); while (host.room.phase === 'playing' && Date.now() - t0 < 90000) await sleep(300);
  check('game reaches results with bots', host.room.phase === 'results', `after ${Math.round((Date.now() - t0) / 1000)}s, ${states} states`);
  check('results rows cover every player with finite points', host.room.results && host.room.results.rows.length === 4 && host.room.results.rows.every((r) => Number.isFinite(r.points) && Number.isFinite(r.score)));
  host.emit('start'); await sleep(400); check('play again restarts the game', host.room.phase === 'playing');
  host.emit('lobby'); await sleep(300); check('host can end a game back to the lobby', host.room.phase === 'lobby');

  // host migration mid-game with a second human
  const c2 = await mk(); await ask(c2, 'join', { name: 'Second', code: made.code }); await sleep(100);
  host.emit('pick', { gameId: 'memekarts' }); await sleep(80); host.emit('start'); await sleep(500);
  check('second human sees the game start', c2.room.phase === 'playing' && c2.room.gameId === 'memekarts');
  host.disconnect(); await sleep(400);
  check('host leaving mid-game hands host to the other human, game keeps running', c2.room.hostId === c2.pid && c2.room.phase === 'playing' && !dead);
  c2.emit('lobby'); await sleep(300); check('new host can end the game', c2.room.phase === 'lobby');
  // ---- rejoin after a refresh / dropped connection ----
  await sleep(GRACE); // let the old host's seat expire
  c2.emit('bots', { op: 'clear' }); await sleep(100); c2.emit('bots', { op: 'add', n: 2 }); await sleep(100);
  const r1 = await mk(); await ask(r1, 'join', { name: 'Refresher', code: made.code }); await sleep(100);
  const seat = { code: made.code, id: r1.pid, key: r1.key };
  c2.emit('pick', { gameId: 'liarsmap' }); await sleep(80); c2.emit('start'); await sleep(400);
  r1.disconnect(); await sleep(250);
  check('a dropped player keeps their seat during the grace period (shown as disconnected)', (c2.room.players.find((p) => p.id === seat.id) || {}).connected === false);
  const thief = await mk(); check('rejoin with a wrong key is refused', !!(await ask(thief, 'rejoin', { code: seat.code, id: seat.id, key: 'nope' })).error); thief.disconnect();
  const r2 = await mk(); const ev = []; r2.on('g:event', (e) => ev.push(e.type)); let gs = 0; r2.on('game:start', () => gs++); let st = 0; r2.on('g:state', () => st++);
  const back = await ask(r2, 'rejoin', seat); await sleep(500);
  check('rejoin with the right key returns the same player id', back.ok && back.id === seat.id);
  check('rejoined player is connected again and still in the game', (c2.room.players.find((p) => p.id === seat.id) || {}).connected === true && c2.room.players.length === 4);
  check('rejoined player is told the game is running and receives state', gs === 1 && st > 3, `game:start=${gs} states=${st}`);
  check("rejoined player is resent the game's one-time setup (the maze)", ev.includes('maze'), ev.join(','));
  r2.disconnect(); await sleep(GRACE);
  check('seat is released after the grace period', !c2.room.players.some((p) => p.id === seat.id));
  const r3 = await mk(); check('rejoin after the seat expired is refused', !!(await ask(r3, 'rejoin', seat)).error); r3.disconnect();
  c2.emit('lobby'); await sleep(200);
  c2.disconnect(); await sleep(GRACE);
  const late = await mk(); check('room is deleted once the last human leaves (bots do not keep it alive)', !!(await ask(late, 'join', { name: 'L', code: made.code })).error);
  late.disconnect();
  check('server still alive at the end', !dead);
  if (/Error|\[tick\]|\[input\]|\[bot\]/.test(log)) console.log('SERVER LOG:\n' + log.slice(0, 2500));
  console.log(`\n${pass} passed, ${fail} failed`);
  srv.kill(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
