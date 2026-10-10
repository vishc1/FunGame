// Dev check for Toy Box Blasters server rules (no browser): lobbed projectiles, the foam sword, crouch, bursts, the give hook.
const g = require('../server/games/blasters.js'); const B = require('../public/games/blasters.shared.js');
let bad = 0; const ok = (n, c, x = '') => { if (!c) bad++; console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
function world(testRoom = true) {
  const players = ['a', 'b'].map((id) => ({ id, name: id, color: '#fff' })), ev = [], w = { ev, state: null };
  const api = { memory: { __fast: 600 }, room: { bots: new Map(testRoom ? [['x', 1]] : []) }, players: () => players, player: (id) => players.find((p) => p.id === id),
    emit(e, d) { if (e === 'g:event') ev.push(d); if (e === 'g:state') w.state = d; }, to(pid, e, d) { if (e === 'g:event') ev.push(Object.assign({ to: pid }, d)); }, after() {}, every() {}, clear() {}, end() {} };
  w.game = g.create(api); w.tick = (n = 1) => { for (let i = 0; i < n; i++) w.game.tick(1 / 30); }; w.me = (id) => w.state.ps.find((p) => p.id === id);
  w.put = (id, x, y, z, cr = 0) => w.game.onInput(id, { type: 'p', x, y, z, yaw: 0, pitch: 0, cr });
  w.tick(95); // let spawn protection run out
  return w;
}
// foam sword
let w = world(); w.put('a', -3, 0, 25.5); w.put('b', -1.4, 0, 25.5); w.tick();
w.game.onInput('a', { type: 'melee', hits: ['b'] }); w.tick(); ok('sword hits someone in reach for 55', w.me('b').hp === 45, 'hp=' + w.me('b').hp);
w.game.onInput('a', { type: 'melee', hits: ['b'] }); w.tick(); ok('sword has a cooldown', w.me('b').hp === 45, 'hp=' + w.me('b').hp);
w.tick(30); w.game.onInput('a', { type: 'melee', hits: ['b'] }); w.tick(); ok('second swing after the cooldown finishes them', w.me('b').dead > 0 && w.ev.some((e) => e.type === 'kill' && e.tags.includes('bonk')));
w = world(); w.put('a', -3, 0, 25.5); w.put('b', 6, 0, 25.5); w.tick(); w.game.onInput('a', { type: 'melee', hits: ['b'] }); w.tick(); ok('sword cannot reach across the room', w.me('b').hp === 100);
// give hook
w = world(false); w.put('a', -3, 0, 25.5); w.game.onInput('a', { type: 'give', w: 6 }); w.tick(); ok('give is refused outside test rooms', w.me('a').own === 1);
w = world(); w.put('a', -3, 0, 25.5); w.put('b', 9, 0, 25.5); w.game.onInput('a', { type: 'give', w: 6 }); w.game.onInput('a', { type: 'switch', w: 6 }); w.tick(12);
ok('give works in a test room', (w.me('a').own >> 6) & 1 && w.me('a').w === 6);
// lob a balloon east (toward +x) at a 30 degree angle: it should arc and burst near b
const ang = 0.5; w.game.onInput('a', { type: 'fire', w: 6, o: [-3, 1.62, 25.5], d: [Math.cos(ang), Math.sin(ang), 0] });
let peak = 0, boom = null; for (let i = 0; i < 150 && !boom; i++) { w.tick(); for (const r of w.state.rk) peak = Math.max(peak, r.y); boom = w.ev.find((e) => e.type === 'explode'); }
ok('lobbed balloon flies in an arc and bursts', !!boom && boom.w === 6 && peak > 3.5, boom ? `peak ${peak.toFixed(1)} m, burst at x=${boom.x} y=${boom.y}` : 'never burst');
ok('the splash hurts whoever is near it', boom && Math.abs(boom.x - 9) < 6 ? w.me('b').hp < 100 : true, 'b hp=' + w.me('b').hp + (boom ? ', landed ' + Math.abs(boom.x - 9).toFixed(1) + ' m away' : ''));
// burst blaster cadence: three darts 77 ms apart are all accepted
w = world(); w.put('a', -3, 0, 25.5); w.game.onInput('a', { type: 'give', w: 5 }); w.game.onInput('a', { type: 'switch', w: 5 }); w.tick(12);
for (let i = 0; i < 3; i++) { w.game.onInput('a', { type: 'fire', w: 5, hits: [] }); w.tick(3); } ok('a three-dart burst is accepted by the server', w.me('a').m === 21, 'mag=' + w.me('a').m);
// crouch is reported and shrinks the target for rockets
w = world(); w.put('a', -3, 0, 25.5, 1); w.tick(); ok('crouch state reaches other players', w.me('a').cr === 1);
ok('a shot at standing head height passes over a crouched figure', !B.rayPlayer(0, 1.5, 5, 0, 0, -1, 0, 0, 0, 50, true) && !!B.rayPlayer(0, 0.6, 5, 0, 0, -1, 0, 0, 0, 50, true));
// dropping a blaster and picking it up again
w = world(); w.put('a', -3, 0, 25.5); w.put('b', 9, 0, 25.5); w.game.onInput('a', { type: 'give', w: 2 }); w.game.onInput('a', { type: 'switch', w: 2 }); w.tick(12);
for (let i = 0; i < 6; i++) { w.game.onInput('a', { type: 'fire', w: 2, hits: [] }); w.tick(3); } const left = w.me('a').m + w.me('a').r;
w.game.onInput('a', { type: 'drop', next: 0 }); w.tick();
ok('G drops the held blaster on the floor', w.state.dr.length === 1 && w.state.dr[0].w === 2 && !((w.me('a').own >> 2) & 1) && w.me('a').w === 0, JSON.stringify(w.state.dr));
w.tick(24); ok('the dropper does not instantly pick it back up', w.state.dr.length === 1);
const dr = w.state.dr[0]; w.put('b', dr.x, dr.y, dr.z); w.tick(2); w.game.onInput('b', { type: 'switch', w: 2 }); w.tick(12);
ok('another player picks it up with the darts that were left', w.state.dr.length === 0 && ((w.me('b').own >> 2) & 1) && w.me('b').m + w.me('b').r === left, `had ${left}, got ${w.me('b').m + w.me('b').r}`);
w.game.onInput('a', { type: 'drop' }); w.tick(); ok('the sidearm cannot be dropped', w.state.dr.length === 0 && (w.me('a').own & 1) === 1);
// loadout
w = world(); w.game.onInput('a', { type: 'hello', lo: 4 }); w.game.onInput('b', { type: 'hello', lo: 2 }); w.put('a', -3, 0, 25.5); w.put('b', -1.4, 0, 25.5); w.tick();
ok('map-only blasters are refused as a loadout', w.me('a').own === 1);
for (let i = 0; i < 2; i++) { w.game.onInput('a', { type: 'melee', hits: ['b'] }); w.tick(30); } w.tick(90);
ok('a loadout blaster is in hand after respawning, with half the spare darts', ((w.me('b').own >> 2) & 1) === 1 && !w.me('b').dead, 'own=' + w.me('b').own);
// the cannon
w = world(); w.put('a', -3, 0, 25.5); w.put('b', 7, 0, 25.5); w.game.onInput('a', { type: 'give', w: 8 }); w.game.onInput('a', { type: 'switch', w: 8 }); w.tick(12);
w.game.onInput('a', { type: 'fire', w: 8, o: [-3, 1.62, 25.5], d: [1, -0.05, 0] }); let hit = false; for (let i = 0; i < 40 && !hit; i++) { w.tick(); hit = w.ev.some((e) => e.type === 'kill' && e.v === 'b'); }
ok('a direct cannonball tags a full-health player in one hit', hit, 'b hp=' + w.me('b').hp);
ok('the cannon holds one ball at a time', w.me('a').m === 0);
// back-to-back rounds: a round ends, the winner is shown, and the next round starts on the same map with scores reset
{ const players = ['a', 'b'].map((id) => ({ id, name: id, color: '#fff' })), ev = [], timers = []; let st = null, ended = false;
  const api = { memory: { __fast: 4, blastersMap: 'cove' }, room: { bots: new Map([['x', 1]]) }, players: () => players, player: (id) => players.find((p) => p.id === id),
    emit(e, d) { if (e === 'g:event') ev.push(d); if (e === 'g:state') st = d; }, to() {}, after(ms, fn) { timers.push({ at: vt + ms / 1000, fn }); }, every() {}, clear() {}, end() { ended = true; } };
  let vt = 0; const game = g.create(api); const run = (secs) => { for (let i = 0; i < secs * 30; i++) { vt += 1 / 30; game.tick(1 / 30); for (const t of timers.splice(0)) { if (t.at <= vt) t.fn(); else timers.push(t); } } };
  run(3); game.onInput('a', { type: 'p', x: 10, y: 0, z: -28, yaw: 0, pitch: 0, cr: 0 }); game.onInput('b', { type: 'p', x: 12, y: 0, z: -28, yaw: 0, pitch: 0, cr: 0 }); run(0.1); game.onInput('a', { type: 'fire', w: 0, hits: [{ id: 'b', n: 1, h: 0 }] }); run(0.3);
  run(3); const over = ev.find((e) => e.type === 'over'); ok('a round ends on time and names a winner, with the next round announced', over && over.next > 0 && over.winner === 'a', JSON.stringify(over && { next: over.next, winner: over.winner }));
  run(7); const rd = ev.find((e) => e.type === 'round'); ok('the next round starts by itself on the same map', !!rd && rd.round === 2 && !ended && st.map === 'cove', `round ${rd && rd.round}, ended ${ended}, map ${st && st.map}`);
  ok('...with everyone back to zero tags and full health', st.ps.every((p) => p.k === 0 && p.hp === 100)); }
console.log(bad ? `${bad} PROBLEMS` : 'blasters rules ok'); process.exit(bad ? 1 : 0);
