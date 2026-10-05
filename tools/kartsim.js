// Dev check: headless Meme Karts match where four bot brains use every item in turn. Fails loudly on any exception.
const m = require('../server/games/memekarts.js'), bots = require('../server/bots.js');
const players = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, color: '#fff' }));
let ended = null, last = null; const events = {}, kinds = new Set(), timers = [];
const MAP = process.argv[2] || 'stadium';
const MAPDEF = (() => { const d = require('../public/memekarts-maps.js').find((q) => q.id === MAP); return { w: d.w || 900, h: d.h || 600 }; })();
const api = { memory: { __fast: 25, memekartsMap: MAP }, room: { bots: new Map([['a', 1]]) }, players: () => players, player: (id) => players.find((p) => p.id === id),
  emit(ev, d) { if (ev === 'g:event') events[d.type] = (events[d.type] || 0) + 1; if (ev === 'g:state') { last = d; d.ents.forEach((e) => kinds.add(e.k)); } }, to() {},
  after(ms, fn) { timers.push(setTimeout(fn, ms)); }, every(ms, fn) { timers.push(setInterval(fn, ms)); }, clear() {}, end(pts, summary) { ended = { pts, summary }; } };
const game = m.create(api), brains = players.map((p) => ({ id: p.id, mem: {} })), ids = m.WEAPONS.map((w) => w.id);
let frame = 0, wi = 0;
for (let i = 0; i < 30 * 40 && !ended; i++) {
  frame++;
  if (frame % 3 === 0) for (const b of brains) for (const msg of bots.think('memekarts', b, last, { ids: players.map((p) => p.id), others: [], dt: 0.1, game })) game.onInput(b.id, msg);
  if (frame % 9 === 0) for (const p of players) { game.onInput(p.id, { type: 'give', weapon: ids[wi++ % ids.length] }); game.onInput(p.id, { type: 'fire' }); }
  game.tick(1 / 30);
  for (const k of last.karts) if (![k.x, k.y, k.a, k.hp].every(Number.isFinite) || k.x < 0 || k.x > MAPDEF.w || k.y < 0 || k.y > MAPDEF.h) { console.log('BAD KART', JSON.stringify(k)); process.exit(1); }
}
console.log('map', last.mapId); console.log('events', JSON.stringify(events)); console.log('entity kinds seen', [...kinds].join(','));
console.log('kills', last.karts.map((k) => k.id + ':' + k.kills).join(' '), '| time left', last.t);
for (const t of timers) { clearTimeout(t); clearInterval(t); } process.exit(0);
