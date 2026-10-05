// Dev check for the Toy Box Blasters map and movement physics (no browser): ramps, launch ramps, teleporters, jump pads,
// the tunnel, pickups resting on surfaces, and rays against ramps. Usage: node tools/blasters-map-check.js
const B = require('../public/games/blasters.shared.js'); const { MAP } = B;
let bad = 0; const ok = (n, c, x = '') => { if (!c) bad++; if (!c || process.argv.includes('-v')) console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const body = (x, y, z) => { const b = B.newBody(x, y, z); b.teleCd = 0; b.ground = true; return b; };
const run = (b, inp, secs) => { for (let i = 0; i < secs * 60; i++) B.stepPlayer(b, { f: 0, s: 0, yaw: 0, ...inp }, 1 / 60); return b; };
for (const r of MAP.ramps) { const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2; ok(`ramp at ${cx},${cz} is clear of boxes`, !B.overlap(cx, 0.5, cz) && !B.overlap(r.x0 + 0.4, 0.05, r.z0 + 0.4) && !B.overlap(r.x1 - 0.4, 0.05, r.z1 - 0.4)); }
for (const pr of MAP.teles) for (const e of pr) ok(`teleporter at ${e.x},${e.y},${e.z} is clear`, !B.overlap(e.x, e.y + 0.02, e.z) && B.rampAt(e.x, e.z) < 0);
for (const [k, list] of [['pickup', MAP.pickups], ['spawn', MAP.spawns.map((s) => ({ x: s.x, y: 0, z: s.z }))], ['pad', MAP.pads]]) for (const p of list) ok(`${k} at ${p.x},${p.z} is not inside something`, !B.overlap(p.x, (p.y || 0) + 0.01, p.z) && (B.rampAt(p.x, p.z) < 0 || (p.y || 0) > 1));
for (const p of MAP.pickups) { const b = run(B.newBody(p.x, p.y + 0.5, p.z), {}, 1); ok(`${p.kind} pickup rests on a surface`, Math.abs(b.y - p.y) < 0.05, `expected y=${p.y}, rests at ${b.y.toFixed(2)}`); }
for (const s of MAP.spawns) ok(`spawn at ${s.x},${s.z} is off the train track`, Math.abs(s.z - MAP.train.z) > MAP.train.half + 1);
let b = run(body(0, 0, -14), { f: 1, yaw: Math.PI }, 1.6); ok('stairs: walk up to the tower roof', Math.abs(b.y - 3.2) < 0.06, 'y=' + b.y.toFixed(2));
b = run(body(22, 0, 19), { f: 1 }, 2.2); ok('walk ramp: up onto the gallery', Math.abs(b.y - 3.2) < 0.06 && b.z < 9, 'y=' + b.y.toFixed(2));
let air = 0; b = body(22, 3.2, 8.5); for (let i = 0; i < 150; i++) { B.stepPlayer(b, { f: 1, s: 0, yaw: Math.PI }, 1 / 60); if (!b.ground) air++; } ok('walk ramp: down without bouncing', air < 6 && b.y < 0.3, 'airborne frames=' + air);
b = run(body(26, 0, 13), { f: 1, yaw: Math.PI / 2 }, 1.5); ok('ramp side is a wall', b.x > 23.4, 'x=' + b.x.toFixed(2));
b = body(12, 0, 10); let landed = null; for (let i = 0; i < 200; i++) { B.stepPlayer(b, { f: 1, s: 0, yaw: 0, jump: b.z < 3.9 && b.ground }, 1 / 60); if (i > 30 && b.ground && b.z < 3) { landed = b.y; break; } } ok('launch ramp + jump reaches the bridge', landed !== null && Math.abs(landed - 3.2) < 0.06, 'landed y=' + (landed === null ? 'never' : landed.toFixed(2)));
b = body(12, 0, 10); let apex = 0; for (let i = 0; i < 120; i++) { B.stepPlayer(b, { f: 1, s: 0, yaw: 0 }, 1 / 60); apex = Math.max(apex, b.y); } ok('launch ramp gives air without jumping', apex > 2.3, 'apex=' + apex.toFixed(2));
b = run(body(20, 0, -25.5), { f: 1 }, 1.1); ok('ground teleporter crosses the map', b.x < -15 && b.z > 20, `x=${b.x.toFixed(1)} z=${b.z.toFixed(1)}`);
b = run(body(22, 3.2, -2), { f: 1 }, 1); ok('gallery teleporter links the galleries', b.x < -15 && b.y > 3, `x=${b.x.toFixed(1)} y=${b.y.toFixed(1)}`);
for (const pad of MAP.pads) { b = body(pad.x, 0, pad.z); let t = 0; B.stepPlayer(b, { f: 0, s: 0, yaw: 0 }, 1 / 60); while (t < 3) { B.stepPlayer(b, { f: 0, s: 0, yaw: 0 }, 1 / 60); t += 1 / 60; if (b.ground) break; } ok(`jump pad at ${pad.x},${pad.z} lands on its target`, Math.abs(b.y - (pad.big ? 3.2 : 2.4)) < 0.05, 'y=' + b.y.toFixed(2)); }
b = run(body(-8, 0, 0), { f: 1, yaw: -Math.PI / 2 }, 2.5); ok('tunnel is passable', b.x > 8, 'x=' + b.x.toFixed(1));
const t1 = B.rayMap(22, 1, 20, 0, 0, -1, 30); ok('ray hits a ramp face', t1 > 2.5 && t1 < 8.5, 't=' + t1.toFixed(2));
ok('ray passes over the low end of a ramp', B.rayMap(18, 1.5, 16.5, 1, 0, 0, 10) === Infinity);
ok('tower blocks line of sight', !B.los(0, 1, -10, 0, 1, 10));
console.log(bad ? `${bad} PROBLEMS` : 'blasters map and physics ok'); process.exit(bad ? 1 : 0);
