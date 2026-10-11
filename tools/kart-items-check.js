// Dev check: every Meme Karts item does what it says, headless. A shooter, a target and a bystander are placed on open floor
// (Sunset Stadium, the lane at y = 380 from x = 420 to the east wall is clear), the shooter is handed an item and fires it, and we
// assert the logical outcome: shells hit the kart in front, the red shell homes on a kart that is off to the side, the blue
// shell goes for the kill leader, a banana or fake box spins whoever drives into it, the Boo steals an item, Lightning
// shrinks everyone but a Star kart, the Bullet Bill flattens what it hits, and so on. Usage: node tools/kart-items-check.js [-v]
const m = require('../server/games/memekarts.js');
let bad = 0; const ok = (n, c, x = '') => { if (!c) bad++; if (!c || process.argv.includes('-v')) console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const IDS = ['a', 'b', 'c'], players = IDS.map((id) => ({ id, name: id, color: '#fff' }));
let last = null, events = [], ended = null; const timers = [];
const api = { memory: { memekartsMap: 'stadium' }, room: { bots: new Map([['x', 1]]) }, players: () => players, player: (id) => players.find((p) => p.id === id),
  emit(ev, d) { if (ev === 'g:event') events.push(d); if (ev === 'g:state') last = d; }, to() {}, after(ms, fn) { timers.push(setTimeout(fn, ms)); }, every(ms, fn) { timers.push(setInterval(fn, ms)); }, clear() {}, end(pts, s) { ended = s; } };
const game = m.create(api);
const K = (id) => last.karts.find((k) => k.id === id);
const tick = (secs) => { for (let i = 0; i < Math.round(secs * 30); i++) game.tick(1 / 30); };
const ctl = (id, c) => game.onInput(id, Object.assign({ type: 'ctl', up: false, down: false, left: false, right: false }, c));
const place = (id, x, y, a) => { ctl(id, {}); game.onInput(id, { type: 'tp', x, y, a }); game.__state().karts.get(id).inv = 0; }; // the tp hook grants 4 s of protection; a placed kart must be hittable
const fire = (id, w) => { game.onInput(id, { type: 'give', weapon: w }); game.onInput(id, { type: 'fire' }); };
const since = (n) => events.slice(n);
// a fresh scene: everyone healthy and stationary, no entities, spawn protection over. Shooter at (500,200) facing east, target 180 ahead, bystander far away.
function reset(targetDx = 180, targetDy = 0) {
  for (const id of IDS) { place(id, 1500, 1100, 0); } tick(0.2);
  const g = game.__state(); for (const k of g.karts.values()) Object.assign(k, { hp: 3, inv: 0, star: 0, ghost: 0, bill: 0, small: 0, ink: 0, pie: 0, egg: 0, spin: 0, mush: 0, weapon: null, air: 0, dead: 0, kills: 0 }); g.ents.length = 0;
  place('a', 500, 380, 0); place('b', 500 + targetDx, 380 + targetDy, 0); place('c', 1500, 1100, 0); tick(1 / 30); events = [];
}
tick(3); // spawn protection
let n;
// --- shells and bullets: a stationary kart right in front gets hit
for (const [w, name] of [['green', 'Green shell'], ['triple', 'Triple shells'], ['egg', 'Egg gun'], ['fire', 'Fire flower'], ['gun', 'Minigun']]) {
  reset(); n = events.length; fire('a', w); tick(2.5);
  const hp = K('b').hp, egg = K('b').egg;
  if (w === 'egg') ok(`${name}: the kart ahead is egged (slow, takes double damage)`, egg > 0, 'egg=' + egg);
  else ok(`${name}: the kart ahead takes damage`, hp < 3, 'hp=' + hp);
  ok(`${name}: the shooter did not hurt itself`, K('a').hp === 3 && K('a').egg === 0, 'hp=' + K('a').hp);
  ok(`${name}: the far-away bystander is untouched`, K('c').hp === 3 && K('c').egg === 0);
}
// green shell bounces off a wall and can come back: fire it at the west wall from close range, the shooter is hit by its own rebound
reset(); place('a', 120, 380, Math.PI); tick(1 / 30); fire('a', 'green'); tick(2); ok('Green shell: bounces off walls (the shooter is hit by their own rebound)', K('a').hp < 3, 'hp=' + K('a').hp);
// red shell: homes on a kart that is not straight ahead
reset(180, 140); n = events.length; fire('a', 'red'); tick(3);
ok('Red shell: homes in on a kart off to the side', K('b').hp < 3, 'hp=' + K('b').hp);
// blue shell: hunts the kill leader, not the nearest kart
reset(180, 0); { const g = game.__state(); g.karts.get('c').kills = 5; } place('c', 1400, 1000, 0); tick(1 / 30); fire('a', 'blue'); tick(6);
ok('Blue shell: flies across the map to the kill leader and hurts them', K('c').hp < 3, 'leader hp=' + K('c').hp);
ok('Blue shell: the nearby kart that is not the leader is spared', K('b').hp === 3, 'hp=' + K('b').hp);
// bob-omb: lobbed, explodes on contact, hurts for 2
reset(340, 0); fire('a', 'bomb'); tick(3); ok('Bob-omb: lands about 340 ahead, explodes and takes 2 hearts', K('b').hp <= 1, 'hp=' + K('b').hp);
reset(150, 0); fire('a', 'bomb'); tick(0.6); ok('Bob-omb: sails over a kart close in front (it is a lob)', K('b').hp === 3); tick(2.5); ok('Bob-omb: ...and the blast 190 units further on does not reach it', K('b').hp === 3, 'hp=' + K('b').hp);
reset(40, 0); fire('a', 'bomb'); tick(0.5); ok('Bob-omb: a kart right on your nose is hit as the bomb leaves your hand', K('b').hp <= 1, 'hp=' + K('b').hp);
// TNT: dropped behind, explodes after 2 s, hurts whoever is behind
reset(); place('b', 460, 380, 0); tick(1 / 30); fire('a', 'tnt'); tick(1); ok('TNT: nothing happens before the fuse runs out', K('b').hp === 3); tick(1.5); ok('TNT: dropped behind and explodes after 2 s, hurting the kart behind', K('b').hp < 3, 'hp=' + K('b').hp);
// banana: dropped behind; the kart that drives into it spins; the owner is safe for a moment
reset(); place('b', 400, 380, 0); tick(1 / 30); fire('a', 'banana'); n = events.length; ctl('b', { up: true }); tick(1.5);
ok('Banana: a kart that drives into it spins out', since(n).some((e) => e.type === 'slip' && e.id === 'b'));
ok('Banana: the owner does not slip on their own banana straight away', !since(n).some((e) => e.type === 'slip' && e.id === 'a'));
ok('Banana: the slip costs that kart a heart', K('b').hp === 2, 'hp=' + K('b').hp);
reset(); place('b', 400, 380, 0); { const g = game.__state(); g.karts.get('b').star = 5; } tick(1 / 30); fire('a', 'banana'); n = events.length; ctl('b', { up: true }); tick(1.5);
ok('Banana: a kart with a Star drives straight over it (no spin, no heart lost)', !since(n).some((e) => e.type === 'slip' && e.id === 'b') && K('b').hp === 3, 'hp=' + K('b').hp);
// fake item box: looks like a box; touching it spins you and eats your item
reset(); place('b', 400, 380, 0); tick(1 / 30); game.onInput('b', { type: 'give', weapon: 'green' }); fire('a', 'fake'); n = events.length; ctl('b', { up: true }); tick(1.5);
ok('Fake box: the kart that touches it spins out', since(n).some((e) => e.type === 'fakebox' && e.id === 'b'));
ok('Fake box: ...and loses the item it was holding', K('b').weapon === null, 'weapon=' + K('b').weapon);
// launch pad: placed under the shooter, launches the next kart that drives over it into the air
reset(); place('b', 400, 380, 0); tick(1 / 30); fire('a', 'pad'); place('a', 700, 380, 0); n = events.length; ctl('b', { up: true }); tick(1.2);
ok('Launch pad: the kart that drives over it is launched', since(n).some((e) => e.type === 'launch' && e.id === 'b'));
// mushroom: faster
reset(1000, 600); ctl('a', { up: true }); tick(1.5); const x0 = K('a').x; tick(1); const plain = K('a').x - x0;
reset(1000, 600); ctl('a', { up: true }); tick(1.5); fire('a', 'mush'); const x1 = K('a').x; tick(1); const boosted = K('a').x - x1;
ok('Boost mushroom: much faster for a moment', boosted > plain * 1.4, `plain ${plain.toFixed(0)} vs boosted ${boosted.toFixed(0)} units per second`);
// star: invincible, and it ends
reset(); fire('b', 'star'); tick(0.1); fire('a', 'green'); tick(2); ok('Star: shells do nothing to a star kart', K('b').hp === 3 && K('b').star === 1, 'hp=' + K('b').hp); tick(6); ok('Star: wears off', K('b').star === 0);
// boo: steals a held item from someone and makes you a ghost for a while
reset(); game.onInput('b', { type: 'give', weapon: 'red' }); n = events.length; fire('a', 'boo'); tick(0.1);
ok('Boo ghost: steals the item another kart is holding', K('b').weapon === null && since(n).some((e) => e.type === 'steal' && e.from === 'b'));
ok('Boo ghost: the thief turns into a ghost', K('a').ghost === 1); tick(0.5); fire('b', 'green'); place('b', 320, 380, 0); tick(1.5);
ok('Boo ghost: shells pass through a ghost', K('a').hp === 3, 'hp=' + K('a').hp); tick(5); ok('Boo ghost: the stolen item is in the thief\'s hands afterwards', !!K('a').weapon, 'weapon=' + K('a').weapon);
// lightning: everyone else shrinks and spins, except a star kart
reset(); fire('c', 'star'); tick(0.1); fire('a', 'bolt'); tick(0.1);
ok('Lightning: the other kart shrinks', K('b').small === 1 && K('b').spin === 1); ok('Lightning: the star kart is immune', K('c').small === 0); ok('Lightning: the shooter is not shrunk', K('a').small === 0); tick(7); ok('Lightning: wears off', K('b').small === 0);
// blooper: everyone else is inked
reset(); fire('a', 'ink'); tick(0.1); ok('Blooper: the others are inked', K('b').ink > 0 && K('c').ink > 0 && K('a').ink === 0); tick(6); ok('Blooper: ink wears off', K('b').ink === 0);
// bullet bill: autopilot that flattens what it hits, and you cannot be hurt meanwhile
reset(120, 0); fire('a', 'bill'); tick(0.1); ok('Bullet Bill: the shooter becomes a bullet', K('a').bill === 1); tick(2.5);
ok('Bullet Bill: the kart in the way is flattened', K('b').hp < 3, 'hp=' + K('b').hp); tick(1.5); ok('Bullet Bill: ends after a few seconds', K('a').bill === 0);
// cream pie: an aimed lob. charge sets the distance; a direct hit low in the arc or the landing splat creams the kart
reset(600, 0); game.onInput('a', { type: 'give', weapon: 'pie' }); game.onInput('a', { type: 'fire', charge: 1 }); n = events.length; tick(1.4);
ok('Cream pie: a full-power throw lands about 600 ahead and creams the kart there', K('b').pie > 0 && since(n).some((e) => e.type === 'pied' && e.id === 'b' && e.by === 'a'), 'pie=' + K('b').pie);
ok('Cream pie: the shooter is clean', K('a').pie === 0);
reset(600, 0); game.onInput('a', { type: 'give', weapon: 'pie' }); game.onInput('a', { type: 'fire', charge: 0 }); tick(1.4); ok('Cream pie: a no-charge throw falls well short of 600', K('b').pie === 0);
reset(150, 0); game.onInput('a', { type: 'give', weapon: 'pie' }); game.onInput('a', { type: 'fire', charge: 0 }); tick(1.2); ok('Cream pie: a no-charge throw splats a kart about 150 ahead', K('b').pie > 0, 'pie=' + K('b').pie);
reset(600, 0); game.onInput('a', { type: 'give', weapon: 'pie' }); game.onInput('a', { type: 'fire' }); tick(1.4); ok('Cream pie: a throw without a charge value counts as full power (bots)', K('b').pie > 0);
reset(600, 0); game.onInput('a', { type: 'give', weapon: 'pie' }); game.onInput('a', { type: 'fire', charge: 1 }); tick(1.4); ok('Cream pie: the splat passes in a little over a second', K('b').pie > 2); tick(4); ok('Cream pie: ...and clears', K('b').pie === 0);
reset(600, 0); fire('b', 'star'); tick(0.1); game.onInput('a', { type: 'give', weapon: 'pie' }); game.onInput('a', { type: 'fire', charge: 1 }); tick(1.4); ok('Cream pie: a Star kart cannot be pied', K('b').pie === 0);
// laser: instant, hits the first kart straight ahead, stops at walls
reset(400, 0); fire('a', 'laser'); tick(0.1); ok('Laser: the kart straight ahead loses a heart at once', K('b').hp === 2, 'hp=' + K('b').hp);
reset(400, 60); fire('a', 'laser'); tick(0.1); ok('Laser: a kart off to the side is missed', K('b').hp === 3);
reset(400, 0); place('a', 120, 380, Math.PI); tick(1 / 30); fire('a', 'laser'); tick(0.1); ok('Laser: the shooter is never hit by their own beam', K('a').hp === 3);
// boomerang: out and back, hitting each kart once each way at most, then caught
reset(220, 0); n = events.length; fire('a', 'boomer'); tick(3.2); ok('Boomerang: hits the kart ahead', K('b').hp < 3, 'hp=' + K('b').hp);
ok('Boomerang: hits each kart only once per throw', K('b').hp === 2, 'hp=' + K('b').hp);
ok('Boomerang: the thrower is not hurt by it coming back', K('a').hp === 3);
ok('Boomerang: it comes back and is caught (gone afterwards)', !game.__state().ents.some((e) => e.kind === 'boomer'));
// a dead kart cannot fire, and items vanish on death
reset(); { const g = game.__state(); g.damage(g.karts.get('b'), 3, 'a', 'test'); } tick(1 / 30); ok('A kart that is out drops its item and cannot fire', K('b').dead === 1 && K('b').weapon === null);
fire('b', 'green'); tick(0.5); ok('...firing while out does nothing', K('a').hp === 3);
// kill credit
reset(); n = events.length; { const g = game.__state(); g.karts.get('b').hp = 1; } fire('a', 'green'); tick(2);
ok('A finishing hit counts as a tag for the shooter', K('a').kills === 1 && since(n).some((e) => e.type === 'kill' && e.killer === 'a' && e.victim === 'b'));
console.log(bad ? `${bad} PROBLEMS` : `kart items ok (${m.WEAPONS.length} items checked)`); for (const t of timers) { clearTimeout(t); clearInterval(t); } process.exit(bad ? 1 : 0);
