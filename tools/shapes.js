// Dev helper: prints the shape of each game's first g:state snapshot (used when writing bots / renderers).
const fs = require('fs'), path = require('path');
const players = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, color: '#fff' }));
const shape = (v, d = 0) => Array.isArray(v) ? (v.length ? '[' + shape(v[0], d + 1) + ']' : '[]') : v && typeof v === 'object' ? (d > 2 ? '{…}' : '{' + Object.keys(v).map((k) => k + ':' + shape(v[k], d + 1)).join(', ') + '}') : typeof v === 'string' ? `'${v.slice(0, 12)}'` : String(v);
for (const f of fs.readdirSync(path.join(__dirname, '../server/games')).sort()) {
  const g = require('../server/games/' + f); let first = null; const timers = [];
  const api = { memory: {}, players: () => players, player: (id) => players.find((p) => p.id === id), emit(ev, d) { if (ev === 'g:state' && !first) first = d; }, to(pid, ev, d) { if (ev === 'g:state' && !first) first = d; },
    after(ms, fn) { const t = setTimeout(fn, ms); timers.push(t); return t; }, every(ms, fn) { const t = setInterval(fn, ms); timers.push(t); return t; }, clear() {}, end() {} };
  const inst = g.create(api);
  for (let i = 0; i < 5 && !first; i++) inst.tick(1 / 30);
  console.log(g.id.padEnd(13), first ? shape(first).slice(0, 420) : '(no state yet)');
  for (const t of timers) { clearTimeout(t); clearInterval(t); } inst.destroy && inst.destroy();
}
process.exit(0);
