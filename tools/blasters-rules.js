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
console.log(bad ? `${bad} PROBLEMS` : 'blasters rules ok'); process.exit(bad ? 1 : 0);
