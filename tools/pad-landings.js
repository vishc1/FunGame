// Dev check: jump pads and launch pads never put anything inside a wall, a deck side or a tower, in either game.
// Meme Karts: from every jump pad, launched in 16 directions, the kart's flight never enters a wall or deck below its arc,
// and it lands on open floor or a deck top. Toy Box Blasters: from every pad, the body never overlaps a solid box mid-flight.
const m = require('../server/games/memekarts.js'), MAPS = require('../public/memekarts-maps.js'), B = require('../public/games/blasters.shared.js');
let bad = 0, n = 0; const ok = (t, c, x = '') => { n++; if (!c) bad++; if (!c || process.argv.includes('-v')) console.log((c ? 'ok   ' : 'FAIL ') + t + (x ? '  ' + x : '')); };
for (const map of MAPS) for (const pad of (map.pads || []).filter((p) => p.kind === 'jump')) for (let d = 0; d < 16; d++) {
  let last = null; const api = { memory: { memekartsMap: map.id }, room: { bots: new Map([['x', 1]]) }, players: () => [{ id: 'a', name: 'a', color: '#fff' }, { id: 'b', name: 'b', color: '#fff' }], player: () => ({ name: 'a' }), emit(e, s) { if (e === 'g:state') last = s; }, to() {}, after() {}, every() {}, clear() {}, end() {} };
  const g = m.create(api); g.tick(1 / 30); const a = (d / 16) * Math.PI * 2;
  g.onInput('b', { type: 'tp', x: 60, y: 60, a: 0 }); g.onInput('a', { type: 'tp', x: pad.x - Math.cos(a) * 70, y: pad.y - Math.sin(a) * 70, a }); const K = g.__state().karts.get('a'); K.inv = 0;
  if (MAPS.surface(map, K.x, K.y) !== 0 || map.obstacles.some((o) => K.x > o.x - 20 && K.x < o.x + o.w + 20 && K.y > o.y - 20 && K.y < o.y + o.h + 20)) continue;
  g.onInput('a', { type: 'ctl', up: true, down: false, left: false, right: false }); let flew = false, inside = 0;
  for (let i = 0; i < 90; i++) { g.tick(1 / 30); const k = g.__state().karts.get('a'); if (k.air > 0) flew = true; const arc = k.air > 0 ? k.el + Math.sin((1 - k.air / 1.2) * Math.PI) * 75 : k.el;
    const inO = map.obstacles.some((o) => k.x > o.x + 2 && k.x < o.x + o.w - 2 && k.y > o.y + 2 && k.y < o.y + o.h - 2); if ((inO && arc < 31) || MAPS.surface(map, k.x, k.y) > arc + 12) inside++; /* 2 units of grace, as the game allows */ if (flew && k.air <= 0 && i > 50) break; }
  if (flew) ok(`${map.id} pad ${pad.x},${pad.y} heading ${d * 22.5}°: never inside a wall or deck`, inside === 0, inside + ' ticks inside');
}
for (const map of B.MAPS) for (const pad of map.pads) for (let d = 0; d < 8; d++) {
  const b = B.newBody(pad.x, pad.y, pad.z); b.teleCd = 5; let inside = 0, t = 0; B.stepPlayer(b, { f: 0, s: 0, yaw: 0 }, 1 / 60, 1, map);
  while (t < 4) { B.stepPlayer(b, { f: 1, s: 0, yaw: (d / 8) * Math.PI * 2 }, 1 / 60, 1, map); t += 1 / 60; if (B.overlap(b.x, b.y + 0.01, b.z, map)) inside++; if (b.ground && t > 0.3) break; }
  ok(`${map.id} pad ${pad.x},${pad.z} steering ${d * 45}°: body never inside a box`, inside === 0, inside + ' steps inside');
}
console.log(bad ? `${bad} PROBLEMS of ${n}` : `pad landings ok (${n} flights)`); process.exit(bad ? 1 : 0);
