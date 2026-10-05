// Dev check for hosted deployments with a connection time limit (Vercel cuts WebSockets at the function's max duration):
// two clients sit in one room for SECS seconds; we log every disconnect, whether the automatic rejoin gets the same seat
// back, and whether the room still has both players at the end.
// Usage: BASE_URL=https://friendgame.vercel.app node tools/longrun.js [seconds=340]
const io = require('socket.io-client');
const BASE = process.env.BASE_URL || 'http://localhost:3000', SECS = Number(process.argv[2] || 340);
const t0 = Date.now(), at = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(4) + 's';
const mk = (name) => { const c = io(BASE, { transports: ['websocket'] }); c.name = name; c.drops = 0; c.rejoins = 0; c.fails = 0; c.room = null;
  c.on('room', (r) => { c.room = r; });
  c.on('disconnect', (why) => { c.drops++; console.log(`${at()}  ${name} disconnected (${why})`); });
  c.on('connect', () => { if (!c.sess) return; c.emit('rejoin', c.sess, (r) => { if (r && r.ok) { c.rejoins++; console.log(`${at()}  ${name} reconnected and got the same seat back`); } else { c.fails++; console.log(`${at()}  ${name} reconnected but the room was GONE: ${r && r.error}`); } }); });
  return c; };
(async () => {
  const a = mk('Alice'), b = mk('Bob'); await Promise.all([a, b].map((c) => new Promise((r) => c.once('connect', r))));
  const made = await new Promise((r) => a.emit('create', { name: 'Alice' }, r)); a.sess = { code: made.code, id: made.id, key: made.key };
  const joined = await new Promise((r) => b.emit('join', { name: 'Bob', code: made.code }, r));
  if (!joined.ok) { console.log(`${at()}  Bob could not join: ${joined.error}  (the two connections landed on different server copies)`); process.exit(1); }
  b.sess = { code: joined.code, id: joined.id, key: joined.key }; console.log(`${at()}  both in room ${made.code} on ${BASE}; waiting ${SECS}s`);
  const tick = setInterval(() => { a.emit('input', { type: 'noop' }); }, 5000);
  await new Promise((r) => setTimeout(r, SECS * 1000)); clearInterval(tick);
  const ok = (c) => c.room && c.room.players.length === 2 && c.room.players.every((p) => p.connected);
  console.log(`${at()}  end: Alice dropped ${a.drops}x, Bob dropped ${b.drops}x; seats recovered ${a.rejoins + b.rejoins}, lost ${a.fails + b.fails}; room intact for Alice: ${!!ok(a)}, for Bob: ${!!ok(b)}`);
  a.close(); b.close(); process.exit(a.fails + b.fails ? 1 : 0);
})();
