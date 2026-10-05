// Dev check for Meme Karts height (no browser): drive up a ramp onto a deck, pick up the item box there, drive off the
// edge and land; run into the side of a deck from the floor; shells stay on their own level. Usage: node tools/kart-height.js
const m = require('../server/games/memekarts.js'), MAPS = require('../public/memekarts-maps.js');
let bad = 0; const ok = (n, c, x = '') => { if (!c) bad++; console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
function world(mapId) {
  const players = ['a', 'b'].map((id) => ({ id, name: id, color: '#fff' })), w = { ev: [], state: null };
  const api = { memory: { __fast: 600, memekartsMap: mapId }, room: { bots: new Map([['x', 1]]) }, players: () => players, player: (id) => players.find((p) => p.id === id),
    emit(e, d) { if (e === 'g:event') w.ev.push(d); if (e === 'g:state') w.state = d; }, to() {}, after() {}, every() {}, clear() {}, end() {} };
  w.game = m.create(api); w.tick = (n = 1) => { for (let i = 0; i < n; i++) w.game.tick(1 / 30); }; w.k = (id) => w.state.karts.find((k) => k.id === id);
  w.tp = (id, x, y, a) => { w.game.onInput(id, { type: 'tp', x, y, a }); w.tick(); };
  w.drive = (id, n, ctl = { up: true }) => { w.game.onInput(id, Object.assign({ type: 'ctl', up: false, down: false, left: false, right: false }, ctl)); w.tick(n); };
  w.tick(2); return w;
}
for (const map of MAPS) {
  const rp = map.ramps[0], d = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[rp.dir], cx = rp.x + rp.w / 2, cy = rp.y + rp.h / 2, a = Math.atan2(d[1], d[0]);
  let w = world(map.id); w.tp('a', cx - d[0] * 130, cy - d[1] * 130, a); w.tp('b', 60, 60, 0);
  ok(`${map.id}: starts on the floor`, w.k('a').el === 0);
  let top = 0, mid = false; for (let i = 0; i < 45; i++) { w.drive('a', 1); const el = w.k('a').el; if (el > 8 && el < 26) mid = true; top = Math.max(top, el); if (top === MAPS.DECK_Z && MAPS.surface(map, w.k('a').x, w.k('a').y) === MAPS.DECK_Z) break; }
  ok(`${map.id}: drives up the ramp onto the deck`, top === MAPS.DECK_Z && mid, `passed through the slope: ${mid}, top height ${top}`);
  // keep going straight across the deck and off the far edge
  let fell = false, low = 99; for (let i = 0; i < 90; i++) { w.drive('a', 1); const k = w.k('a'); low = Math.min(low, k.el); if (k.el === 0 && MAPS.surface(map, k.x, k.y) === 0) { fell = true; break; } }
  ok(`${map.id}: comes back down to the floor (down a ramp or off the edge)`, fell, 'lowest height ' + low);
  // from the floor, a deck side is a wall
  const dk = map.decks[0]; w = world(map.id); w.tp('b', 60, 60, 0);
  const sides = [[dk.x - 60, dk.y + dk.h / 2, 0], [dk.x + dk.w + 60, dk.y + dk.h / 2, Math.PI], [dk.x + dk.w / 2, dk.y - 60, Math.PI / 2], [dk.x + dk.w / 2, dk.y + dk.h + 60, -Math.PI / 2]].filter(([x, y]) => MAPS.surface(map, x, y) === 0 && !map.obstacles.some((o) => x > o.x - 20 && x < o.x + o.w + 20 && y > o.y - 20 && y < o.y + o.h + 20) && !map.ramps.some((r) => x > r.x - 20 && x < r.x + r.w + 20 && y > r.y - 20 && y < r.y + r.h + 20));
  if (sides.length) { const [sx, sy, sa] = sides[0]; w.tp('a', sx, sy, sa); w.drive('a', 40); const k = w.k('a'); ok(`${map.id}: the side of a deck is a wall from the floor`, k.el === 0 && MAPS.surface(map, k.x, k.y) === 0, `ended at ${k.x},${k.y}`); }
  // a shell fired on the floor does not hit a kart standing on the deck above it
  w = world(map.id); const bx = dk.x + dk.w / 2, by = dk.y + dk.h / 2; w.tp('b', bx, by, 0);
  ok(`${map.id}: a kart placed on a deck stands at deck height`, w.k('b').el === MAPS.DECK_Z);
  if (sides.length) { const [sx, sy, sa] = sides[0]; w.tp('a', sx, sy, sa); w.game.onInput('a', { type: 'give', weapon: 'green' }); w.game.onInput('a', { type: 'fire' }); w.tick(40); ok(`${map.id}: a floor-level shell cannot hit a kart up on the deck`, w.k('b').hp === 3, 'hp ' + w.k('b').hp); }
  // the item box on the deck can only be taken from the deck
  const bi = map.boxes.findIndex(([x, y]) => MAPS.surface(map, x, y) === MAPS.DECK_Z);
  if (bi >= 0) { w = world(map.id); w.tp('b', 60, 60, 0); w.tp('a', map.boxes[bi][0], map.boxes[bi][1], 0); w.tick(2); ok(`${map.id}: the item box on the deck is collected up there`, !!w.k('a').weapon); }
}
console.log(bad ? `${bad} PROBLEMS` : 'kart height ok'); process.exit(bad ? 1 : 0);
