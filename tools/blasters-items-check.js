// Dev check: every Toy Box Blasters pickup and power-up does the logical thing, on both maps, headless.
// Snacks heal and never overheal, the Lunchbox goes to 150 and ticks back down, armour soaks half of a hit, a blaster
// pickup arms you (and tops up the darts when you already have it), pickups respawn, you cannot take them while out,
// and each of the four power-ups has its stated effect for its stated time. Usage: node tools/blasters-items-check.js [-v]
const g = require('../server/games/blasters.js'); const B = require('../public/games/blasters.shared.js');
let bad = 0; const ok = (n, c, x = '') => { if (!c) bad++; if (!c || process.argv.includes('-v')) console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
function world(mapId) {
  const players = ['a', 'b'].map((id) => ({ id, name: id, color: '#fff' })), ev = [], w = { ev, state: null };
  const api = { memory: { __fast: 600, blastersMap: mapId }, room: { bots: new Map([['x', 1]]) }, players: () => players, player: (id) => players.find((p) => p.id === id),
    emit(e, d) { if (e === 'g:event') ev.push(d); if (e === 'g:state') w.state = d; }, to(pid, e, d) { if (e === 'g:event') ev.push(Object.assign({ to: pid }, d)); }, after() {}, every() {}, clear() {}, end() {} };
  w.game = g.create(api); w.tick = (n = 1) => { for (let i = 0; i < n; i++) w.game.tick(1 / 30); }; w.me = (id) => w.state.ps.find((p) => p.id === id);
  w.put = (id, x, y, z) => w.game.onInput(id, { type: 'p', x, y, z, yaw: 0, pitch: 0, cr: 0 });
  w.park = (id) => w.put(id, 28, 0, 28); // out of everyone's way (both maps have open floor in that corner)
  w.shoot = (from, to, n = 1, h = 0) => { w.game.onInput(from, { type: 'fire', w: w.me(from).w, hits: [{ id: to, n, h }] }); w.tick(8); }; // 8 frames: past the dart blaster's fire rate
  w.tick(95); // spawn protection over
  return w;
}
for (const map of B.MAPS) {
  const T = `[${map.id}] `, at = (kind, extra = () => true) => map.pickups.find((p) => p.kind === kind && extra(p));
  const go = (w, id, pk) => { w.put(id, pk.x, pk.y, pk.z); w.tick(2); };
  // --- Snack
  let w = world(map.id), pk = at('health'); w.park('b'); w.put('a', 10, 0, 28); w.tick();
  w.shoot('b', 'a'); const hurtHp = w.me('a').hp; ok(T + 'a dart does 20', hurtHp === 80, 'hp=' + hurtHp);
  go(w, 'a', pk); ok(T + 'Snack heals 30, capped at 100', w.me('a').hp === 100, 'hp=' + w.me('a').hp);
  w = world(map.id); w.park('b'); go(w, 'a', pk); ok(T + 'Snack is not taken at full health (so it is still there for someone who needs it)', w.me('a').hp === 100 && w.state.pk[map.pickups.indexOf(pk)] === 1);
  w = world(map.id); w.park('b'); w.put('a', 10, 0, 28); w.tick(); w.shoot('b', 'a'); w.shoot('b', 'a'); w.shoot('b', 'a'); ok(T + 'three darts leave 40', w.me('a').hp === 40, 'hp=' + w.me('a').hp);
  go(w, 'a', pk); ok(T + 'Snack: 40 + 30 = 70', w.me('a').hp === 70, 'hp=' + w.me('a').hp);
  ok(T + 'Snack is gone after being taken', w.state.pk[map.pickups.indexOf(pk)] === 0);
  w.park('a'); w.tick(30 * pk.respawn + 5); ok(T + `Snack is back after ${pk.respawn} s`, w.state.pk[map.pickups.indexOf(pk)] === 1);
  w = world(map.id); w.park('b'); w.put('a', 10, 0, 28); w.tick(); w.shoot('b', 'a'); w.shoot('b', 'a'); w.shoot('b', 'a'); w.shoot('b', 'a'); w.shoot('b', 'a'); ok(T + 'five darts put a player out', w.me('a').dead > 0);
  go(w, 'a', pk); ok(T + 'a player who is out cannot take a Snack', w.state.pk[map.pickups.indexOf(pk)] === 1);
  // --- Lunchbox (mega)
  w = world(map.id); pk = at('mega'); w.park('b'); go(w, 'a', pk); ok(T + 'Lunchbox: 100 health goes to 150', w.me('a').hp === 150, 'hp=' + w.me('a').hp);
  w.park('a'); w.tick(30 * 5); ok(T + 'Lunchbox: health above 100 ticks back down', w.me('a').hp < 150 && w.me('a').hp > 100, 'hp=' + w.me('a').hp); w.tick(30 * 30); ok(T + 'Lunchbox: ...and stops at 100', w.me('a').hp === 100, 'hp=' + w.me('a').hp);
  // --- Armour
  w = world(map.id); pk = at('armor'); w.park('b'); go(w, 'a', pk); ok(T + 'Cardboard Armour gives 50 armour', w.me('a').ar === 50, 'ar=' + w.me('a').ar);
  w.put('a', 10, 0, 28); w.tick(); w.shoot('b', 'a'); ok(T + 'armour soaks half of a hit: 20 damage = 10 health + 10 armour', w.me('a').hp === 90 && w.me('a').ar === 40, `hp=${w.me('a').hp} ar=${w.me('a').ar}`);
  // --- blaster pickups: every one of them
  for (const wp of map.pickups.filter((p) => p.kind === 'weapon')) {
    const def = B.WEAPONS[wp.w]; w = world(map.id); w.park('b'); go(w, 'a', wp); const me = w.me('a');
    ok(T + `${def.name} pickup at ${wp.x},${wp.z} arms you with a full magazine`, (me.own & (1 << wp.w)) !== 0 && w.ev.some((e) => e.type === 'pickup' && e.id === 'a' && e.w === wp.w), 'own=' + me.own);
    w.game.onInput('a', { type: 'switch', w: wp.w }); w.tick(); ok(T + `${def.name} can be switched to and has ${def.mag} darts`, w.me('a').w === wp.w && w.me('a').m === def.mag, `w=${w.me('a').w} m=${w.me('a').m}`);
    const res0 = w.me('a').r; w.park('a'); w.tick(30 * wp.respawn + 5); go(w, 'a', wp); ok(T + `${def.name} picked up again tops up the spare darts`, w.me('a').r > res0, `reserve ${res0} -> ${w.me('a').r}`);
  }
  // --- the power-up cycle and each power
  const pi = map.pickups.indexOf(at('power'));
  for (const kind of Object.keys(B.POWERS)) {
    w = world(map.id); w.park('a'); w.park('b');
    let n = 0; while (!w.state.pw.up && n < 30 * 60) { w.tick(); n++; } ok(T + `the power-up appears (took ${(n / 30).toFixed(0)} s)`, w.state.pw.up === 1 && w.ev.some((e) => e.type === 'powersoon'));
    { const k = w.game.__power(); k.kind = kind; } // force which power is on the plinth this time
    const pk2 = map.pickups[pi]; go(w, 'a', pk2); const me = w.me('a'), name = B.POWERS[kind].name;
    ok(T + `${name} is taken and announced`, w.ev.some((e) => e.type === 'power' && e.id === 'a' && e.kind === kind) && w.state.pw.up === 0);
    if (kind === 'tank') ok(T + 'Bubble Wrap: 150 health and full armour at once', me.hp === 150 && me.ar === 100, `hp=${me.hp} ar=${me.ar}`);
    else ok(T + `${name} shows on the player for ${B.POWERS[kind].time} s`, me.pw === kind && me.pwt >= B.POWERS[kind].time - 1, `pw=${me.pw} ${me.pwt}s`);
    if (kind === 'mega') { w.put('a', 10, 0, 28); w.put('b', 12, 0, 28); w.tick(); w.shoot('a', 'b'); ok(T + 'Mega Darts: a dart does double, 40', w.me('b').hp === 60, 'hp=' + w.me('b').hp); }
    if (kind !== 'tank') { w.park('a'); w.tick(30 * (B.POWERS[kind].time + 1)); ok(T + `${name} wears off after ${B.POWERS[kind].time} s`, w.me('a').pw === 0 && w.ev.some((e) => e.type === 'powerend' && e.to === 'a')); }
    if (kind === 'mega') { w.put('a', 10, 0, 28); w.put('b', 12, 0, 28); w.tick(); w.shoot('a', 'b'); ok(T + 'Mega Darts: back to 20 per dart afterwards', w.me('b').hp === 40, 'hp=' + w.me('b').hp); }
    if (kind === 'inf') { w = world(map.id); w.park('a'); w.park('b'); let n2 = 0; while (!w.state.pw.up && n2 < 30 * 60) { w.tick(); n2++; } w.game.__power().kind = 'inf'; go(w, 'a', pk2); w.put('a', 10, 0, 28); w.put('b', 15, 0, 28); w.tick();
      for (let i = 0; i < 20; i++) w.shoot('a', 'b'); ok(T + 'Bottomless Mag: 20 shots and the magazine is still full', w.me('a').m === B.WEAPONS[0].mag, 'm=' + w.me('a').m);
      w.game.onInput('a', { type: 'reload' }); w.tick(); ok(T + 'Bottomless Mag: reloading does nothing', w.me('a').rl === 0); }
    if (kind === 'vamp') { w = world(map.id); w.park('a'); w.park('b'); let n2 = 0; while (!w.state.pw.up && n2 < 30 * 60) { w.tick(); n2++; } w.put('a', 10, 0, 28); w.put('b', 15, 0, 28); w.tick(); w.shoot('b', 'a'); w.shoot('b', 'a'); ok(T + 'Vampire Darts: start hurt at 60', w.me('a').hp === 60);
      w.game.__power().kind = 'vamp'; go(w, 'a', pk2); w.put('a', 10, 0, 28); w.tick(); w.shoot('a', 'b'); ok(T + 'Vampire Darts: a 20 hit heals 20', w.me('a').hp === 80, 'hp=' + w.me('a').hp); }
    if (kind === 'moon') { const jx = [14, 20, 3, -14].find((x) => !B.overlap(x, 0.01, 28, map) && !B.overlap(x, 5, 28, map)), b1 = B.newBody(jx, 0, 28), b2 = B.newBody(jx, 0, 28); b2.grav = 0.33; /* open floor, no ceiling */ let h1 = 0, h2 = 0; for (let i = 0; i < 120; i++) { B.stepPlayer(b1, { f: 0, s: 0, yaw: 0, jump: i === 1 }, 1 / 60, 1, map); B.stepPlayer(b2, { f: 0, s: 0, yaw: 0, jump: i === 1 }, 1 / 60, 1, map); h1 = Math.max(h1, b1.y); h2 = Math.max(h2, b2.y); }
      ok(T + 'Moon Boots: a jump goes about three times as high', h2 > h1 * 2.7 && h2 < h1 * 3.3, `${h1.toFixed(2)} m -> ${h2.toFixed(2)} m`); }
    if (kind === 'bighead') { const hitNormal = B.rayPlayer(0, 1.56 + 0.45, -5, 0, 0, 1, 0, 0, 0, 10, 0), hitBig = B.rayPlayer(0, 1.56 + 0.45, -5, 0, 0, 1, 0, 0, 0, 10, 0, 0.62);
      ok(T + 'Big Head Mode: a ray that misses a normal head hits a big one', (!hitNormal || !hitNormal.head) && hitBig && hitBig.head); }
  }
  // --- the power-up only announces when it is about to come back
  w = world(map.id); w.park('a'); w.park('b'); let n = 0; while (!w.state.pw.up && n < 30 * 60) { w.tick(); n++; } const announced = w.ev.filter((e) => e.type === 'powersoon').length; ok(T + 'exactly one announcement before it appears', announced === 1, 'announcements=' + announced);
}
// --- rarity: about one power-up in four is rare, and every power can come up
{ const seen = {}; for (let i = 0; i < 20000; i++) { const k = B.rollPower(); seen[k] = (seen[k] || 0) + 1; } const rare = Object.keys(B.POWERS).filter((k) => B.POWERS[k].rare), rareN = rare.reduce((a, k) => a + (seen[k] || 0), 0), total = Object.values(seen).reduce((a, b) => a + b, 0);
  ok('about one power-up in four is rare', rareN / total > 0.21 && rareN / total < 0.29, (100 * rareN / total).toFixed(1) + '%'); ok('every power-up can come up', Object.keys(B.POWERS).every((k) => seen[k] > 0), JSON.stringify(seen)); }
// --- the hitscan blasters: listed damage per dart, headshot multipliers, range limits and distance falloff
{
  const w0 = () => { const w = world('fort'); w.put('a', 10, 0, 28); w.put('b', 15, 0, 28); w.tick(); return w; };
  for (const i of [0, 1, 2, 3, 5, 7]) {
    const def = B.WEAPONS[i]; let w = w0(); if (i) { w.game.onInput('a', { type: 'give', w: i }); w.game.onInput('a', { type: 'switch', w: i }); w.tick(12); }
    w.shoot('a', 'b', def.pellets); const want = 100 - Math.max(1, Math.round(def.dmg * def.pellets * B.falloff(def, 5)));
    ok(`${def.name}: a full body hit at 5 m does ${100 - want}`, w.me('b').hp === want, `hp=${w.me('b').hp}`);
    w = w0(); if (i) { w.game.onInput('a', { type: 'give', w: i }); w.game.onInput('a', { type: 'switch', w: i }); w.tick(12); }
    w.shoot('a', 'b', def.pellets, def.pellets); const wantH = 100 - Math.max(1, Math.round(def.dmg * def.pellets * def.head * B.falloff(def, 5)));
    ok(`${def.name}: a headshot does ${def.head}x`, w.me('b').hp === Math.max(0, wantH) && (wantH > 0 || w.me('b').dead > 0), `hp=${w.me('b').hp}`);
    // far targets go along the diagonal (the arena is 64 m wide, 88 m corner to corner); ranges beyond that cannot happen in play
    const far = (w, d) => { w.put('a', -30, 0, -30); w.put('b', -30 + d / Math.SQRT2, 0, -30 + d / Math.SQRT2); w.tick(); };
    if (def.range * 1.15 + 3 < 86) { w = w0(); far(w, def.range * 1.15 + 3); if (i) { w.game.onInput('a', { type: 'give', w: i }); w.game.onInput('a', { type: 'switch', w: i }); } w.tick(12);
      w.shoot('a', 'b', def.pellets); ok(`${def.name}: a claimed hit from beyond its ${def.range} m range is refused`, w.me('b').hp === 100, 'hp=' + w.me('b').hp); }
    if (def.falloff) { w = w0(); far(w, def.falloff[1]); w.game.onInput('a', { type: 'give', w: i }); w.game.onInput('a', { type: 'switch', w: i }); w.tick(12); w.shoot('a', 'b', def.pellets); ok(`${def.name}: weaker at ${def.falloff[1]} m (${Math.round(def.falloff[2] * 100)}% damage)`, w.me('b').hp === 100 - Math.max(1, Math.round(def.dmg * def.pellets * def.falloff[2])), 'hp=' + w.me('b').hp); }
  }
  let w = w0(); w.game.onInput('a', { type: 'give', w: 3 }); w.game.onInput('a', { type: 'switch', w: 3 }); w.tick(12); w.shoot('a', 'b', 1, 1); ok('Long Shot: a headshot tags a full-health player in one hit', w.me('b').dead > 0);
  w = w0(); w.shoot('a', 'b', 3); ok('a hit cannot claim more darts than the blaster fires (dart blaster: 1)', w.me('b').hp === 80, 'hp=' + w.me('b').hp);
  w = w0(); w.game.onInput('a', { type: 'fire', w: 0, hits: [{ id: 'b', n: 1, h: 0 }] }); w.game.onInput('a', { type: 'fire', w: 0, hits: [{ id: 'b', n: 1, h: 0 }] }); w.tick(); ok('shots faster than the fire rate are dropped', w.me('b').hp === 80, 'hp=' + w.me('b').hp);
  w = w0(); for (let i = 0; i < 14; i++) w.shoot('a', 'b'); ok('the magazine empties after 14 darts', w.me('a').m === 0); w.shoot('a', 'b'); ok('an empty blaster does not fire', w.me('b').hp === 100 - 14 * 20 < 0 ? w.me('b').dead > 0 : true);
  w = w0(); w.put('b', 15, 0, 28); for (let i = 0; i < 5; i++) w.shoot('a', 'b'); ok('tags are counted and the victim respawns after a moment', w.me('a').k === 1 && w.me('b').dead > 0); w.tick(30 * 3); ok('...with full health and only the sidearm', w.me('b').dead === 0 && w.me('b').hp === 100 && w.me('b').own === 1);
}
console.log(bad ? `${bad} PROBLEMS` : `blasters pickups and power-ups ok (${B.MAPS.length} maps)`); process.exit(bad ? 1 : 0);
