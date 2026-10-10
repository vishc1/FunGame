// Dev check: plays EVERY game to completion on a virtual clock (so 3-minute matches take a second), using the
// test-mode bot brains as players. Scenarios: minimum players, 4, 8, and 4 with people leaving / joining mid-game.
// Verifies: no exceptions, api.end is called, points are sane, snapshots contain no NaN, snapshot size stays small.
// Usage: node tools/fullrun.js [gameId]
const fs = require('fs'), path = require('path');
const bots = require('../server/bots');
const only = process.argv[2];
const files = fs.readdirSync(path.join(__dirname, '../server/games')).filter((f) => f.endsWith('.js')).sort();
const realNow = Date.now;
function badNumber(v, p = '') { if (typeof v === 'number') return Number.isFinite(v) ? null : p; if (v && typeof v === 'object') for (const k in v) { const r = badNumber(v[k], p + '.' + k); if (r) return r; } return null; }

function run(def, n, opts = {}) {
  let vt = 0, ended = null, seq = 0; const timers = new Map(); const base = realNow();
  Date.now = () => base + vt;
  const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i, color: '#fff' }));
  const brains = new Map(players.map((p) => [p.id, { id: p.id, mem: {} }]));
  let last = null; const per = {}; let maxBytes = 0, states = 0, err = null, nan = null;
  const api = {
    memory: def.id==='memekarts'&&process.env.MAP ? {memekartsMap:process.env.MAP} : {}, room: { bots: new Map() },
    players: () => players.slice(), player: (id) => players.find((p) => p.id === id) || null,
    emit(ev, d) { if (ev === 'g:state') { last = d; states++; if (states % 20 === 0) { maxBytes = Math.max(maxBytes, JSON.stringify(d).length); nan = nan || badNumber(d); } } },
    to(pid, ev, d) { if (ev === 'g:state') { per[pid] = d; states++; if (states % 40 === 0) { maxBytes = Math.max(maxBytes, JSON.stringify(d).length); nan = nan || badNumber(d); } } },
    after(ms, fn) { const id = ++seq; timers.set(id, { at: vt + ms, fn }); return id; },
    every(ms, fn) { const id = ++seq; timers.set(id, { at: vt + ms, fn, every: ms }); return id; },
    clear(id) { timers.delete(id); },
    end(points, summary) { if (!ended) ended = { points, summary }; },
  };
  let game;
  try {
    game = def.create(api);
    const DT = 1 / 30, LIMIT = 30 * 60 * 25; let left = opts.leave ? opts.leave.slice() : [], joined = false;
    for (let i = 0; i < LIMIT && !ended; i++) {
      vt += 1000 / 30;
      for (const [id, t] of [...timers]) if (t.at <= vt) { if (t.every) t.at += t.every; else timers.delete(id); t.fn(); }
      if (left.length && vt / 1000 >= left[0]) { left.shift(); const p = players.splice(players.length - 1, 1)[0]; if (p) { brains.delete(p.id); game.onLeave && game.onLeave(p.id); } }
      if (opts.join && !joined && vt / 1000 >= opts.join) { joined = true; const p = { id: 'late', name: 'Late', color: '#fff' }; players.push(p); brains.set(p.id, { id: p.id, mem: {} }); game.onJoin && game.onJoin(p.id); }
      if (i % 3 === 0) { const ids = players.map((p) => p.id); for (const b of brains.values()) for (const m of bots.think(def.id, b, per[b.id] || last, { ids, others: ids.filter((x) => x !== b.id), dt: 0.1, game })) game.onInput(b.id, m); }
      if (opts.garbage && i % 50 === 0) for (const junk of [{}, { type: 'x' }, { type: null }, { type: 'move', dx: 'a', dy: {} }, { type: 'dash' }, { type: 'pass', to: 'nobody' }, { type: 'fire', target: 'nobody' }, { type: 'answer', i: 99 }, { type: 'line' }, { type: 'path', path: 'no' }, { type: 'vote' }, { type: 'pick', char: 5, kind: 5 }, { type: 'ctl' }, { type: 'aim', a: NaN }, { type: 'guess' }, { type: 'power', x: NaN }, { type: 'give', weapon: 'zzz' }, { type: 'p' }, { type: 'p', x: NaN, y: 1, z: 1, yaw: 0, pitch: 0 }, { type: 'p', x: 1e9, y: -1e9, z: 0, yaw: 0, pitch: 0 }, { type: 'fire' }, { type: 'fire', w: 0, o: 'x', d: [NaN, 0, 0], hits: [{ id: 'p1', n: 999, h: 999 }, null, 5] }, { type: 'switch', w: 99 }, { type: 'melee' }, { type: 'melee', hits: ['p1', 'p1', 'nobody', 5, null] }, { type: 'p', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, cr: 'yes' }, { type: 'hello', lvl: 1e9, ch: -5 }]) { game.onInput(players[0].id, junk); game.onInput('ghost-player', junk); }
      game.tick(DT);
    }
  } catch (e) { err = e; }
  try { game && game.destroy && game.destroy(); } catch (e) { err = err || e; }
  Date.now = realNow;
  const res = { secs: Math.round(vt / 1000), maxBytes };
  if (err) return Object.assign(res, { fail: 'EXCEPTION ' + (err.stack || err).toString().split('\n').slice(0, 3).join(' | ') });
  if (!ended) return Object.assign(res, { fail: 'never called api.end' });
  if (nan) return Object.assign(res, { fail: 'non-finite number in state at ' + nan });
  for (const [id, v] of Object.entries(ended.points)) if (!Number.isFinite(v) || v < 0) return Object.assign(res, { fail: `bad points ${id}=${v}` });
  if (!ended.summary || typeof ended.summary !== 'string') return Object.assign(res, { fail: 'no summary' });
  return Object.assign(res, { summary: ended.summary });
}

let fails = 0;
for (const f of files) {
  const def = require('../server/games/' + f); if (only && def.id !== only) continue;
  const min = def.min || 2;
  const scenarios = [[`${min}p`, min, {}], ['4p', 4, {}], ['8p', 8, {}], ['4p +junk input', 4, { garbage: true }], ['5p, 2 leave', 5, { leave: [8, 20] }], ['3p, 1 joins', Math.max(3, min), { join: 12 }], [`${min}p, 1 leaves`, min, { leave: [6] }], ['4p, 3 leave', 4, { leave: [8, 9, 10] }]];
  for (const [label, n, opts] of scenarios) {
    const r = run(def, n, opts);
    if (r.fail) fails++;
    console.log(`${r.fail ? 'FAIL' : 'ok  '} ${def.id.padEnd(13)} ${label.padEnd(16)} ${String(r.secs).padStart(4)}s  ${String(r.maxBytes).padStart(5)}B  ${r.fail || r.summary.slice(0, 70)}`);
  }
}
console.log(fails ? `\n${fails} FAILURES` : '\nALL SCENARIOS PASSED');
process.exit(fails ? 1 : 0);
