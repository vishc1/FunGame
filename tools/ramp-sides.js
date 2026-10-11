// Dev check: the side of a Meme Karts ramp is a wall. For every ramp on every map, a kart drives straight into each side,
// at normal and boosted speed, at points from a quarter of the way up to the top; it must not end up on the ramp.
// The low end must still be drivable. Usage: node tools/ramp-sides.js [-v]
const m = require('../server/games/memekarts.js'), MAPS = require('../public/memekarts-maps.js');
let bad = 0, n = 0; const ok = (t, c, x = '') => { n++; if (!c) bad++; if (!c || process.argv.includes('-v')) console.log((c ? 'ok   ' : 'FAIL ') + t + (x ? '  ' + x : '')); };
const DV = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
for (const map of MAPS) {
  map.ramps.forEach((rp, ri) => {
    const [ux, uy] = DV[rp.dir], [z0, z1] = MAPS.rampZ(rp), len = ux ? rp.w : rp.h, wid = ux ? rp.h : rp.w, cx = rp.x + rp.w / 2, cy = rp.y + rp.h / 2;
    for (const side of [-1, 1]) for (const f of [0.35, 0.6, 0.9]) for (const boost of [false, true]) {
      let last = null; const api = { memory: { memekartsMap: map.id }, room: { bots: new Map([['x', 1]]) }, players: () => [{ id: 'a', name: 'a', color: '#fff' }, { id: 'b', name: 'b', color: '#fff' }], player: () => ({ name: 'a' }), emit(e, d) { if (e === 'g:state') last = d; }, to() {}, after() {}, every() {}, clear() {}, end() {} };
      const g = m.create(api); for (let i = 0; i < 3; i++) g.tick(1 / 30);
      const along = -len / 2 + len * f, px = -uy, py = ux; // perpendicular to uphill
      const tx = cx + ux * along + px * side * (wid / 2 + 70), ty = cy + uy * along + py * side * (wid / 2 + 70);
      if (MAPS.surface(map, tx, ty) !== z0 || map.obstacles.some((o) => tx > o.x - 20 && tx < o.x + o.w + 20 && ty > o.y - 20 && ty < o.y + o.h + 20)) continue; // no clear run-up on this side
      g.onInput('b', { type: 'tp', x: 60, y: 60, a: 0 }); g.onInput('a', { type: 'tp', x: tx, y: ty, a: Math.atan2(-py * side, -px * side) }); g.__state().karts.get('a').inv = 0;
      if (boost) { g.onInput('a', { type: 'give', weapon: 'mush' }); g.onInput('a', { type: 'fire' }); }
      g.onInput('a', { type: 'ctl', up: true, down: false, left: false, right: false });
      let worst = 0; for (let i = 0; i < 45; i++) { g.tick(1 / 30); const k = last.karts.find((q) => q.id === 'a'); const sideRise = MAPS.surface(map, k.x, k.y) - z0; if (k.el > z0 + 10 && sideRise > 10) worst = Math.max(worst, k.el - z0); }
      const riseHere = (z1 - z0) * f;
      if (riseHere > 10) ok(`${map.id} ramp ${ri} side ${side > 0 ? 'R' : 'L'} at ${Math.round(f * 100)}%${boost ? ' boosted' : ''}: the side is a wall`, worst === 0, worst ? `climbed onto the ramp ${worst.toFixed(0)} up` : '');
    }
  });
}
console.log(bad ? `${bad} PROBLEMS of ${n}` : `ramp sides ok (${n} side hits)`); process.exit(bad ? 1 : 0);
