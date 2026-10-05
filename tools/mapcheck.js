// Dev check for public/memekarts-maps.js: bounds, overlaps with obstacles, clear hazard lanes, and reachability
// (every spawn, item box, pad and portal must be reachable by a kart from the first spawn). Usage: node tools/mapcheck.js
const maps = require('../public/memekarts-maps.js');
const R = 16, M = 20, CELL = 10;
let bad = 0; const fail = (...a) => { bad++; console.log('  PROBLEM', ...a); };
for (const m of maps) {
  const W = m.w || 900, H = m.h || 600;
  const blocked = (x, y, pad) => x < M + pad || x > W - M - pad || y < M + pad || y > H - M - pad || m.obstacles.some((o) => x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad);
  const pts = [];
  m.boxes.forEach(([x, y]) => pts.push(['box', x, y, R + 8]));
  m.spawns.forEach(([x, y]) => pts.push(['spawn', x, y, R + 6]));
  (m.pads || []).forEach((p) => pts.push(['pad:' + p.kind, p.x, p.y, R + 8]));
  (m.portals || []).forEach((pr) => pr.forEach((e) => pts.push(['portal', e.x, e.y, R + 8])));
  const DV = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
  for (const rp of m.ramps || []) {
    for (const [cx, cy] of [[rp.x + 4, rp.y + 4], [rp.x + rp.w - 4, rp.y + 4], [rp.x + 4, rp.y + rp.h - 4], [rp.x + rp.w - 4, rp.y + rp.h - 4], [rp.x + rp.w / 2, rp.y + rp.h / 2]]) if (blocked(cx, cy, 6)) fail(m.id, 'ramp overlaps a wall or obstacle at', cx, cy);
    const cx = rp.x + rp.w / 2, cy = rp.y + rp.h / 2, [dx, dy] = DV[rp.dir];
    pts.push(['ramp', cx, cy, R], ['ramp approach', cx - dx * 70, cy - dy * 70, R]);
    for (const [k, x, y] of pts) if (!k.startsWith('ramp') && Math.abs(x - cx) < rp.w / 2 + 14 && Math.abs(y - cy) < rp.h / 2 + 14) fail(m.id, k, 'sits on a ramp at', x, y);
    // the slowest launch (300 units) and a boosted one (670) must both come down on open floor, not inside a block
    for (const d of [300, 480, 670]) { const lx = Math.max(M + R, Math.min(W - M - R, cx + dx * (d + (dx ? rp.w : rp.h) * 0.35))), ly = Math.max(M + R, Math.min(H - M - R, cy + dy * (d + (dx ? rp.w : rp.h) * 0.35))); if (blocked(lx, ly, R - 4)) fail(m.id, `ramp at ${cx},${cy} lands inside something after ${d} units, at`, Math.round(lx), Math.round(ly)); }
  }
  for (const [k, x, y, pad] of pts) if (blocked(x, y, pad)) fail(m.id, k, 'too close to a wall or obstacle at', x, y);
  for (const mv of m.movers || []) { const [a, c] = mv.path; for (let i = 0; i <= 80; i++) { const x = a[0] + (c[0] - a[0]) * i / 80, y = a[1] + (c[1] - a[1]) * i / 80; if (blocked(x, y, mv.r - 2)) { fail(m.id, mv.kind, 'path blocked at', Math.round(x), Math.round(y)); break; } } }
  for (const o of m.obstacles) if (o.x < M || o.y < M || o.x + o.w > W - M || o.y + o.h > H - M) fail(m.id, 'obstacle outside the arena', JSON.stringify(o));
  for (const z of m.zones || []) for (const [x, y] of m.spawns) if (x > z.x && x < z.x + z.w && y > z.y && y < z.y + z.h) fail(m.id, 'spawn inside a zone', x, y);
  if (m.spawns.length < 8) fail(m.id, 'needs 8 spawns, has', m.spawns.length);
  // reachability flood fill for a kart-sized circle
  const cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL), seen = new Uint8Array(cols * rows), q = [];
  const start = [Math.floor(m.spawns[0][0] / CELL), Math.floor(m.spawns[0][1] / CELL)]; seen[start[1] * cols + start[0]] = 1; q.push(start);
  while (q.length) { const [cx, cy] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen[ny * cols + nx]) continue; if (blocked(nx * CELL + CELL / 2, ny * CELL + CELL / 2, R)) continue; seen[ny * cols + nx] = 1; q.push([nx, ny]); } }
  for (const [k, x, y] of pts) if (!seen[Math.floor(y / CELL) * cols + Math.floor(x / CELL)]) fail(m.id, k, 'is unreachable at', x, y);
  let open = 0, reach = 0; for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) { if (!blocked(cx * CELL + 5, cy * CELL + 5, R)) { open++; if (seen[cy * cols + cx]) reach++; } }
  if (reach < open * 0.98) fail(m.id, `sealed-off area: only ${Math.round(100 * reach / open)}% of open floor is reachable`);
  console.log(`${m.id.padEnd(8)} ${W}x${H}  obstacles ${m.obstacles.length}  boxes ${m.boxes.length}  pads ${(m.pads || []).length}  ramps ${(m.ramps || []).length}  portals ${(m.portals || []).length}  zones ${(m.zones || []).length}  movers ${(m.movers || []).length}  open floor ${Math.round(100 * open / (cols * rows))}%`);
}
console.log(bad ? `${bad} PROBLEMS` : 'all maps ok'); process.exit(bad ? 1 : 0);
