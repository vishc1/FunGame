// Exports the Toy Box Blasters arena as JSON for artists: every collision box, pad, pickup and spawn, in both game
// coordinates and Blender coordinates. Usage: node tools/blasters-map.js [mapId]  ->  art/blasters/map.json (fort) or art/blasters/map-<mapId>.json
const fs = require('fs'), path = require('path');
const B = require('../public/games/blasters.shared.js');
const MAPID = process.argv[2] || 'fort', MAPDEF = B.mapById(MAPID); if (!MAPDEF) { console.error('no such map; maps: ' + B.MAPS.map((m) => m.id).join(', ')); process.exit(1); }
const r = (v) => Math.round(v * 1000) / 1000;
// game (x east, y up, z south)  ->  Blender (X = x, Y = -z, Z = y)
const out = {
  note: 'Blender units are metres. Blender X = game x, Blender Y = -game z, Blender Z = game y (up). Origin is the arena centre at floor level.',
  arena: { half_size: MAPDEF.size, wall_height: 9 },
  boxes: MAPDEF.boxes.map((b, i) => ({ i, type: b.t, blender_center: [r((b.x0 + b.x1) / 2), r(-(b.z0 + b.z1) / 2), r((b.y0 + b.y1) / 2)], blender_size: [r(b.x1 - b.x0), r(b.z1 - b.z0), r(b.y1 - b.y0)] })),
  jump_pads: MAPDEF.pads.map((p) => ({ blender_pos: [r(p.x), r(-p.z), r(p.y)], radius: p.r, big: !!p.big })),
  pickups: MAPDEF.pickups.map((p) => ({ kind: p.kind, weapon: p.w != null ? B.WEAPONS[p.w].id : undefined, blender_pos: [r(p.x), r(-p.z), r(p.y)] })),
  spawns: MAPDEF.spawns.map((p) => ({ blender_pos: [r(p.x), r(-p.z), 0] })),
  // drawn by the game itself (do not model these into the arena; keep these areas clear of decoration)
  ramps: MAPDEF.ramps.map((q) => ({ kind: q.kind, blender_min: [r(q.x0), r(-q.z1), r(q.y0)], blender_max: [r(q.x1), r(-q.z0), r(q.y1)], rises_toward: q.ax === 'x' ? (q.dir > 0 ? '+X' : '-X') : (q.dir > 0 ? '-Y' : '+Y') })),
  teleporters: MAPDEF.teles.map((pair) => pair.map((e) => [r(e.x), r(-e.z), r(e.y)])),
  train: { track_along: 'X', blender_y: r(-MAPDEF.train.z), track_half_width: MAPDEF.train.half, max_height: 2.4, length: MAPDEF.train.len },
};
const dir = path.join(__dirname, '../art/blasters'); fs.mkdirSync(dir, { recursive: true });
const OUT = 'art/blasters/map' + (MAPID === 'fort' ? '' : '-' + MAPID) + '.json'; fs.writeFileSync(path.join(dir, path.basename(OUT)), JSON.stringify(out, null, 1));
const types = {}; for (const b of out.boxes) types[b.type] = (types[b.type] || 0) + 1;
console.log(`wrote ${OUT}: ${out.boxes.length} boxes`, JSON.stringify(types));
