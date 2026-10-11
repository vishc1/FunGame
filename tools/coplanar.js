// Dev check: no two solid blocks in any map share a face plane with overlapping extents (that is what z-fights and shimmers).
// Covers the three Meme Karts maps (obstacles, decks, second tiers, as the renderer draws them) and the shooter maps' boxes.
const K = require('../public/memekarts-maps.js'), B = require('../public/games/blasters.shared.js');
let bad = 0; const hit = (map, a, b, why) => { bad++; console.log(`SHARED FACE ${map}: ${why}  ${JSON.stringify(a)}  ${JSON.stringify(b)}`); };
const span = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 0.05; // overlapping extent, not just touching at an edge
function scan(name, boxes) { // boxes: {x0,x1,y0,y1,z0,z1,tag}
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j];
    for (const ax of ['x', 'z']) { const o1 = ax === 'x' ? 'z' : 'x';
      for (const side of [0, 1]) { const side2 = side, pa = a[ax + side], pb = b[ax + side2]; if (Math.abs(pa - pb) > 0.001) continue; /* same-side flush faces are the visible ones; faces that touch front to front are buried inside the pair */
        if (span(a[o1 + '0'], a[o1 + '1'], b[o1 + '0'], b[o1 + '1']) && span(a.y0, a.y1, b.y0, b.y1)) hit(name, a.tag, b.tag, `${ax} = ${pa}`); } } } }
for (const m of K) { const bx = [];
  for (const o of m.obstacles) bx.push({ x0: o.x, x1: o.x + o.w, z0: o.y, z1: o.y + o.h, y0: 0, y1: 40, tag: 'obstacle ' + [o.x, o.y, o.w, o.h] });
  for (const d of m.decks) { const inset = d.z ? 0.6 : 0; bx.push({ x0: d.x + inset, x1: d.x + d.w - inset, z0: d.y + inset, z1: d.y + d.h - inset, y0: 0, y1: K.deckZ(d), tag: (d.z ? 'tier2 ' : 'deck ') + [d.x, d.y, d.w, d.h] }); }
  scan('karts/' + m.id, bx); }
for (const m of B.MAPS) scan('blasters/' + m.id, m.boxes.filter((b) => b.t !== 'wall' && b.t !== 'step').map((b) => ({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y0: b.y0, y1: b.y1, tag: b.t + ' ' + [b.x0, b.z0, b.x1, b.z1, b.y0, b.y1] })));
console.log(bad ? `${bad} shared faces` : `no shared faces in any map (${K.length + B.MAPS.length} maps scanned)`); process.exit(bad ? 1 : 0);
