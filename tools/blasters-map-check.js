// Dev check for the Toy Box Blasters maps and movement physics (no browser). For every map: ramps, teleporters, pads and
// pickups are clear of walls and rest on surfaces, spawns are off the train track, every jump pad lands where it should,
// and every launch ramp lands you on something. Then route checks specific to each map. Usage: node tools/blasters-map-check.js [-v]
const B = require('../public/games/blasters.shared.js');
let bad = 0; const ok = (n, c, x = '') => { if (!c) bad++; if (!c || process.argv.includes('-v')) console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
let M = B.MAP;
const body = (x, y, z) => { const b = B.newBody(x, y, z); b.teleCd = 0; b.ground = true; return b; };
const step = (b, inp) => B.stepPlayer(b, { f: 0, s: 0, yaw: 0, ...inp }, 1 / 60, 1, M);
const run = (b, inp, secs) => { for (let i = 0; i < secs * 60; i++) step(b, inp); return b; };
const overlap = (x, y, z) => B.overlap(x, y, z, M), rampAt = (x, z) => B.rampAt(x, z, M);
// a launch ramp: run up it and jump at the lip. Returns the first thing landed on above the floor (or null).
function kicker(r) {
  const along = r.ax, lo = r.dir > 0 ? r[along + '0'] : r[along + '1'], hi = r.dir > 0 ? r[along + '1'] : r[along + '0'], mid = r.ax === 'x' ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
  const yaw = r.ax === 'z' ? (r.dir > 0 ? Math.PI : 0) : (r.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
  let start = lo - r.dir * 6; for (const d of [6, 5, 4, 3]) { start = lo - r.dir * d; if (!overlap(r.ax === 'z' ? mid : start, 0.01, r.ax === 'z' ? start : mid)) break; } // a run-up that does not begin inside cover
  const b = r.ax === 'z' ? body(mid, 0, start) : body(start, 0, mid); let jumped = false;
  for (let i = 0; i < 240; i++) { const pos = r.ax === 'z' ? b.z : b.x, near = (hi - pos) * r.dir < 0.3 && (hi - pos) * r.dir > -1; step(b, { f: 1, yaw, jump: near && !jumped && b.ground }); if (b.jumped) jumped = true; if (jumped && i > 20 && b.ground && b.y > 0.5) return { y: b.y, x: b.x, z: b.z }; }
  return null;
}
for (M of B.MAPS) {
  const tag = `[${M.id}] `;
  for (const r of M.ramps) { const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2; ok(tag + `ramp at ${cx},${cz} is clear of boxes`, !overlap(cx, 0.5, cz) && !overlap(r.x0 + 0.4, 0.05, r.z0 + 0.4) && !overlap(r.x1 - 0.4, 0.05, r.z1 - 0.4)); }
  for (const pr of M.teles) for (const e of pr) ok(tag + `teleporter at ${e.x},${e.y},${e.z} is clear`, !overlap(e.x, e.y + 0.02, e.z) && rampAt(e.x, e.z) < 0);
  for (const [k, list] of [['pickup', M.pickups], ['spawn', M.spawns.map((s) => ({ x: s.x, y: 0, z: s.z }))], ['pad', M.pads]]) for (const p of list) ok(tag + `${k} at ${p.x},${p.z} is not inside something`, !overlap(p.x, (p.y || 0) + 0.01, p.z) && (rampAt(p.x, p.z) < 0 || (p.y || 0) > 1));
  for (const p of M.pickups) { const b = run(B.newBody(p.x, p.y + 0.5, p.z), {}, 1); ok(tag + `${p.kind} pickup at ${p.x},${p.z} rests on a surface`, Math.abs(b.y - p.y) < 0.05, `expected y=${p.y}, rests at ${b.y.toFixed(2)}`); }
  for (const s of M.spawns) ok(tag + `spawn at ${s.x},${s.z} is off the train track`, !M.train || Math.abs(s.z - M.train.z) > M.train.half + 1);
  for (const s of M.spawns) { const b = run(body(s.x, 0, s.z), {}, 0.5); ok(tag + `spawn at ${s.x},${s.z} is on the floor`, b.y < 0.05 && Math.hypot(b.x - s.x, b.z - s.z) < 0.5); }
  for (const pad of M.pads) { const b = body(pad.x, 0, pad.z); let t = 0; step(b, {}); while (t < 3) { step(b, {}); t += 1 / 60; if (b.ground) break; } ok(tag + `jump pad at ${pad.x},${pad.z} lands on something raised`, b.y > 1.5, 'y=' + b.y.toFixed(2)); }
  for (const r of M.ramps) if (r.kind === 'launch') { const l = kicker(r); ok(tag + `launch ramp at ${(r.x0 + r.x1) / 2},${(r.z0 + r.z1) / 2} + jump lands on something`, l !== null, l ? `y=${l.y.toFixed(2)} at ${l.x.toFixed(1)},${l.z.toFixed(1)}` : 'fell back to the floor'); }
  // the bots' ground grid must have a route between any two spawns (no walled-off areas)
  const n = M.size * 2, blocked = new Uint8Array(n * n); for (let cz = 0; cz < n; cz++) for (let cx = 0; cx < n; cx++) if (overlap(cx - M.size + 0.5, 0.01, cz - M.size + 0.5) || rampAt(cx - M.size + 0.5, cz - M.size + 0.5) > 0.45) blocked[cz * n + cx] = 1;
  const cell = (x, z) => Math.floor(z + M.size) * n + Math.floor(x + M.size), seen = new Uint8Array(n * n), q = [cell(M.spawns[0].x, M.spawns[0].z)]; seen[q[0]] = 1;
  while (q.length) { const c = q.pop(), cx = c % n, cz = (c - cx) / n; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = cx + dx, z = cz + dz; if (x < 0 || z < 0 || x >= n || z >= n) continue; const k = z * n + x; if (!blocked[k] && !seen[k]) { seen[k] = 1; q.push(k); } } }
  ok(tag + 'every spawn can be reached on foot from every other', M.spawns.every((s) => seen[cell(s.x, s.z)]));
}
// ---- Fort Cardboard routes
M = B.mapById('fort');
let b = run(body(0, 0, -14), { f: 1, yaw: Math.PI }, 1.6); ok('[fort] stairs: walk up to the tower roof', Math.abs(b.y - 3.2) < 0.06, 'y=' + b.y.toFixed(2));
b = run(body(22, 0, 19), { f: 1 }, 2.2); ok('[fort] walk ramp: up onto the gallery', Math.abs(b.y - 3.2) < 0.06 && b.z < 9, 'y=' + b.y.toFixed(2));
let air = 0; b = body(22, 3.2, 8.5); for (let i = 0; i < 150; i++) { step(b, { f: 1, yaw: Math.PI }); if (!b.ground) air++; } ok('[fort] walk ramp: down without bouncing', air < 6 && b.y < 0.3, 'airborne frames=' + air);
b = run(body(26, 0, 13), { f: 1, yaw: Math.PI / 2 }, 1.5); ok('[fort] ramp side is a wall', b.x > 23.4, 'x=' + b.x.toFixed(2));
b = body(12, 0, 10); let apex = 0; for (let i = 0; i < 120; i++) { step(b, { f: 1 }); apex = Math.max(apex, b.y); } ok('[fort] launch ramp gives air without jumping', apex > 2.3, 'apex=' + apex.toFixed(2));
b = run(body(20, 0, -25.5), { f: 1 }, 1.1); ok('[fort] ground teleporter crosses the map', b.x < -15 && b.z > 20, `x=${b.x.toFixed(1)} z=${b.z.toFixed(1)}`);
b = run(body(22, 3.2, -2), { f: 1 }, 1); ok('[fort] gallery teleporter links the galleries', b.x < -15 && b.y > 3, `x=${b.x.toFixed(1)} y=${b.y.toFixed(1)}`);
b = run(body(-8, 0, 0), { f: 1, yaw: -Math.PI / 2 }, 2.5); ok('[fort] tunnel is passable', b.x > 8, 'x=' + b.x.toFixed(1));
const t1 = B.rayMap(22, 1, 20, 0, 0, -1, 30, M); ok('[fort] ray hits a ramp face', t1 > 2.5 && t1 < 8.5, 't=' + t1.toFixed(2));
ok('[fort] ray passes over the low end of a ramp', B.rayMap(18, 1.5, 16.5, 1, 0, 0, 10, M) === Infinity);
ok('[fort] tower blocks line of sight', !B.los(0, 1, -10, 0, 1, 10, M));
// ---- Block Towers routes
M = B.mapById('towers');
let top = 0; b = body(-3, 0, -17); for (let i = 0; i < 150; i++) { step(b, { f: 1, yaw: Math.PI / 2 }); top = Math.max(top, b.y); } ok('[towers] stairs run straight up to the north-west summit', Math.abs(top - 7.2) < 0.06, 'highest y=' + top.toFixed(2));
top = 0; b = body(3, 0, 17); for (let i = 0; i < 150; i++) { step(b, { f: 1, yaw: -Math.PI / 2 }); top = Math.max(top, b.y); } ok('[towers] stairs run straight up to the south-east summit', Math.abs(top - 7.2) < 0.06, 'highest y=' + top.toFixed(2));
b = body(-17, 0, -8); for (let i = 0; i < 180; i++) step(b, { f: 1, jump: i === 10 || i === 40 }); ok('[towers] a double jump gets onto a pyramid base', Math.abs(b.y - 2.4) < 0.05, 'y=' + b.y.toFixed(2));
b = run(body(-8, 0, 0), { f: 1, yaw: -Math.PI / 2 }, 2.5); ok('[towers] the floor under the cross is open', b.x > 8 && b.y < 0.05, 'x=' + b.x.toFixed(1));
b = run(body(-19, 7.2, -16), { f: 1, yaw: 0 }, 0.8); ok('[towers] summit teleporter leads to the other summit', b.x > 15 && b.y > 7, `x=${b.x.toFixed(1)} y=${b.y.toFixed(1)}`);
b = run(body(0, 3.2, -10), { f: 1, yaw: Math.PI }, 2.5); ok('[towers] the cross is walkable end to end', Math.abs(b.y - 3.2) < 0.05 && b.z > 7, `y=${b.y.toFixed(2)} z=${b.z.toFixed(1)}`);
ok('[towers] a pyramid blocks line of sight', !B.los(-26, 1, -5, -8, 1, -26, M));
for (M of B.MAPS) ok(`[${M.id}] under the train height, nothing on the track is solid`, !M.train || (() => { for (let x = -M.size + 1; x < M.size; x += 0.5) if (overlap(x, 0.5, M.train.z)) return false; return true; })());
console.log(bad ? `${bad} PROBLEMS` : `blasters maps and physics ok (${B.MAPS.length} maps)`); process.exit(bad ? 1 : 0);
