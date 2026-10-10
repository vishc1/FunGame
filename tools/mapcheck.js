// Dev check for public/memekarts-maps.js: bounds, overlaps with obstacles, clear hazard lanes, and reachability
// (every spawn, item box, pad and portal must be reachable by a kart from the first spawn). Usage: node tools/mapcheck.js
const maps = require('../public/memekarts-maps.js');
const R = 16, M = 20, CELL = 10;
let bad = 0; const fail = (...a) => { bad++; console.log('  PROBLEM', ...a); };
for (const m of maps) {
  const W = m.w || 900, H = m.h || 600;
  const blocked = (x, y, pad) => x < M + pad || x > W - M - pad || y < M + pad || y > H - M - pad || m.obstacles.some((o) => x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad) || maps.isPit(m,x,y);
  for(const p of m.pits||[]) if(![p.x,p.y,p.w,p.h].every(Number.isFinite)||p.w<=0||p.h<=0||p.x<M||p.y<M||p.x+p.w>W-M||p.y+p.h>H-M) fail(m.id,'invalid pit bounds');
  const pts = [];
  m.boxes.forEach(([x, y]) => pts.push(['box', x, y, R + 8]));
  m.spawns.forEach(([x, y]) => pts.push(['spawn', x, y, R + 6]));
  (m.pads || []).forEach((p) => pts.push(['pad:' + p.kind, p.x, p.y, R + 8]));
  (m.portals || []).forEach((pr) => pr.forEach((e) => pts.push(['portal', e.x, e.y, R + 8])));
  const DV = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }, surf = (x, y) => maps.surface(m, x, y), DZ = maps.DECK_Z;
  const inRect = (x, y, r, pad = 0) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
  for (const d of m.decks || []) {
    for (const o of m.obstacles) if (d.x < o.x + o.w && d.x + d.w > o.x && d.y < o.y + o.h && d.y + d.h > o.y) fail(m.id, 'deck overlaps an obstacle', JSON.stringify(d));
    if (d.x < M + 40 || d.y < M + 40 || d.x + d.w > W - M - 40 || d.y + d.h > H - M - 40) fail(m.id, 'deck too close to the outer wall (no room to drive round it)', JSON.stringify(d));
    if (!(m.ramps || []).some((rp) => { const [dx, dy] = DV[rp.dir]; return inRect(rp.x + rp.w / 2 + dx * (rp.w / 2 + 3) * Math.abs(dx) + 0, rp.y + rp.h / 2 + dy * (rp.h / 2 + 3), d) || inRect(rp.x + rp.w / 2 + dx * (rp.w / 2 + 3), rp.y + rp.h / 2, d); })) fail(m.id, 'deck has no ramp leading onto it', JSON.stringify(d));
  }
  for (const rp of m.ramps || []) {
    const cx = rp.x + rp.w / 2, cy = rp.y + rp.h / 2, [dx, dy] = DV[rp.dir], half = dx ? rp.w / 2 : rp.h / 2;
    for (const o of m.obstacles) if (rp.x < o.x + o.w && rp.x + rp.w > o.x && rp.y < o.y + o.h && rp.y + rp.h > o.y) fail(m.id, 'ramp overlaps an obstacle', JSON.stringify(rp));
    const [z0, z1] = maps.rampZ(rp);
    { const top = surf(cx + dx * (half + 3), cy + dy * (half + 3)); if (top < z1 - 0.5 || top > z1 + 6) fail(m.id, 'the top of a ramp does not meet a deck at its height', JSON.stringify(rp)); } /* a little above z1 is fine: the next ramp of a tower starts right there */
    const ax = cx - dx * (half + 45), ay = cy - dy * (half + 45); const run = surf(ax, ay); if (blocked(ax, ay, R) || !(run === z0 || (z0 > 0 && run > 0 && run <= z0))) fail(m.id, 'no clear ground in front of the bottom of a ramp', JSON.stringify(rp)); /* a second ramp may start straight off the first one's top */
    for (const [k, x, y] of pts) if (inRect(x, y, rp, 14)) fail(m.id, k, 'sits on a ramp at', x, y);
  }
  for (const [k, x, y] of pts) if (k !== 'box' && surf(x, y) > 0) fail(m.id, k, 'must be on the floor, not on a deck, at', x, y);
  for (const [k, x, y] of pts) if (k === 'box' && surf(x, y) >= DZ && !(m.decks || []).some((d) => maps.deckZ(d) === surf(x, y) && inRect(x, y, d, -22))) fail(m.id, 'box too close to a deck edge at', x, y);
  for (const d of m.decks || []) if (d.z) { const base = (m.decks || []).find((o) => !o.z && d.x >= o.x && d.x + d.w <= o.x + o.w && d.y >= o.y && d.y + d.h <= o.y + o.h); if (!base) fail(m.id, 'a second tier must sit entirely on a first-tier deck', JSON.stringify(d)); }
  for (const mv of m.movers || []) { const [a0, c0] = mv.path; for (let i = 0; i <= 80; i++) { const x = a0[0] + (c0[0] - a0[0]) * i / 80, y = a0[1] + (c0[1] - a0[1]) * i / 80; if ([[0, 0], [mv.r, 0], [-mv.r, 0], [0, mv.r], [0, -mv.r]].some(([ox, oy]) => surf(x + ox, y + oy) > 0)) { fail(m.id, mv.kind, 'path runs through a deck or ramp at', Math.round(x), Math.round(y)); break; } } }
  for (const z of m.zones || []) for (const rp of [...(m.ramps || []), ...(m.decks || [])]) if (z.x < rp.x + rp.w && z.x + z.w > rp.x && z.y < rp.y + rp.h && z.y + z.h > rp.y) fail(m.id, 'zone overlaps a deck or ramp', JSON.stringify(z));
  for (const [k, x, y, pad] of pts) if (blocked(x, y, pad)) fail(m.id, k, 'too close to a wall or obstacle at', x, y);
  for(const [k,x,y,pad] of pts) if([[pad,0],[-pad,0],[0,pad],[0,-pad]].some(([dx,dy])=>maps.isPit(m,x+dx,y+dy))) fail(m.id,k,'too close to an unprotected pit edge',x,y);
  for (const mv of m.movers || []) { const [a, c] = mv.path; for (let i = 0; i <= 80; i++) { const x = a[0] + (c[0] - a[0]) * i / 80, y = a[1] + (c[1] - a[1]) * i / 80; if (blocked(x, y, mv.r - 2)) { fail(m.id, mv.kind, 'path blocked at', Math.round(x), Math.round(y)); break; } } }
  for (const o of m.obstacles) if (o.x < M || o.y < M || o.x + o.w > W - M || o.y + o.h > H - M) fail(m.id, 'obstacle outside the arena', JSON.stringify(o));
  for (const z of m.zones || []) for (const [x, y] of m.spawns) if (x > z.x && x < z.x + z.w && y > z.y && y < z.y + z.h) fail(m.id, 'spawn inside a zone', x, y);
  if (m.spawns.length < 8) fail(m.id, 'needs 8 spawns, has', m.spawns.length);
  // reachability flood fill for a kart-sized circle
  const cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL), seen = new Uint8Array(cols * rows), q = [];
  const start = [Math.floor(m.spawns[0][0] / CELL), Math.floor(m.spawns[0][1] / CELL)]; seen[start[1] * cols + start[0]] = 1; q.push(start);
  while (q.length) { const [cx, cy] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen[ny * cols + nx]) continue; const px = nx * CELL + CELL / 2, py = ny * CELL + CELL / 2; if (blocked(px, py, R)) continue; if (maps.surface(m, px, py) - maps.surface(m, cx * CELL + CELL / 2, cy * CELL + CELL / 2) > 6) continue; seen[ny * cols + nx] = 1; q.push([nx, ny]); } }
  for (const [k, x, y] of pts) if (!seen[Math.floor(y / CELL) * cols + Math.floor(x / CELL)]) fail(m.id, k, 'is unreachable at', x, y);
  let open = 0, reach = 0; for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) { if (!blocked(cx * CELL + 5, cy * CELL + 5, R)) { open++; if (seen[cy * cols + cx]) reach++; } }
  if (reach < open * 0.98) fail(m.id, `sealed-off area: only ${Math.round(100 * reach / open)}% of open floor is reachable`);
  console.log(`${m.id.padEnd(8)} ${W}x${H}  obstacles ${m.obstacles.length}  boxes ${m.boxes.length}  pads ${(m.pads || []).length}  decks ${(m.decks || []).length}  ramps ${(m.ramps || []).length}  portals ${(m.portals || []).length}  zones ${(m.zones || []).length}  movers ${(m.movers || []).length}  open floor ${Math.round(100 * open / (cols * rows))}%`);
}
console.log(bad ? `${bad} PROBLEMS` : 'all maps ok'); process.exit(bad ? 1 : 0);
