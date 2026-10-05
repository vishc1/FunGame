// Exports the Toy Box Blasters arena as JSON for artists: every collision box, pad, pickup and spawn, in both game
// coordinates and Blender coordinates. Usage: node tools/blasters-map.js  ->  art/blasters/map.json
const fs = require('fs'), path = require('path');
const B = require('../public/games/blasters.shared.js');
const r = (v) => Math.round(v * 1000) / 1000;
// game (x east, y up, z south)  ->  Blender (X = x, Y = -z, Z = y)
const out = {
  note: 'Blender units are metres. Blender X = game x, Blender Y = -game z, Blender Z = game y (up). Origin is the arena centre at floor level.',
  arena: { half_size: B.MAP.size, wall_height: 9 },
  boxes: B.MAP.boxes.map((b, i) => ({ i, type: b.t, blender_center: [r((b.x0 + b.x1) / 2), r(-(b.z0 + b.z1) / 2), r((b.y0 + b.y1) / 2)], blender_size: [r(b.x1 - b.x0), r(b.z1 - b.z0), r(b.y1 - b.y0)] })),
  jump_pads: B.MAP.pads.map((p) => ({ blender_pos: [r(p.x), r(-p.z), r(p.y)], radius: p.r, big: !!p.big })),
  pickups: B.MAP.pickups.map((p) => ({ kind: p.kind, weapon: p.w != null ? B.WEAPONS[p.w].id : undefined, blender_pos: [r(p.x), r(-p.z), r(p.y)] })),
  spawns: B.MAP.spawns.map((p) => ({ blender_pos: [r(p.x), r(-p.z), 0] })),
  // drawn by the game itself (do not model these into the arena; keep these areas clear of decoration)
  ramps: B.MAP.ramps.map((q) => ({ kind: q.kind, blender_min: [r(q.x0), r(-q.z1), r(q.y0)], blender_max: [r(q.x1), r(-q.z0), r(q.y1)], rises_toward: q.ax === 'x' ? (q.dir > 0 ? '+X' : '-X') : (q.dir > 0 ? '-Y' : '+Y') })),
  teleporters: B.MAP.teles.map((pair) => pair.map((e) => [r(e.x), r(-e.z), r(e.y)])),
  train: { track_along: 'X', blender_y: r(-B.MAP.train.z), track_half_width: B.MAP.train.half, max_height: 2.4, length: B.MAP.train.len },
};
const dir = path.join(__dirname, '../art/blasters'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'map.json'), JSON.stringify(out, null, 1));
const types = {}; for (const b of out.boxes) types[b.type] = (types[b.type] || 0) + 1;
console.log(`wrote art/blasters/map.json: ${out.boxes.length} boxes`, JSON.stringify(types));
