// One layout source for server collisions, bots, previews, and the 3D arena.
// Units: 10 = 1 metre, origin top-left, x right, y down. A kart is about 36 long. There is a 20-unit wall margin.
//
// Per map:
//   w, h      arena size (default 900 x 600)
//   obstacles [{x, y, w, h}]                            solid blocks
//   boxes     [[x, y], ...]                             item boxes
//   spawns    [[x, y], ...]                             at least 8
//   pads      [{x, y, kind:'boost'|'jump'}]             floor pads: a speed burst, or a launch through the air (flies over walls)
//   decks     [{x, y, w, h}]                            raised ground, DECK_Z high. Drive up a ramp to get on; drive off any edge to drop down.
//   ramps     [{x, y, w, h, dir:'N'|'E'|'S'|'W'}]       a slope from the floor up to DECK_Z, rising in `dir` (N is toward y = 0). Its high end
//                                                       must touch a deck. Karts can drive up and down it; its sides are walls except near the bottom.
//   Height is real in the simulation: `maps.surface(map, x, y)` gives the ground height at a point (server, bots and renderer all use it).
//   portals   [[{x,y},{x,y}], ...]                      warp pairs: drive into one, come out of the other
//   zones     [{x, y, w, h, kind:'mud'}]                slow ground: a shortcut that costs you speed
//   movers    [{kind:'boulder'|'drone', path:[[x,y],[x,y]], speed, r}]   hazards that travel back and forth and hurt on contact
// `node tools/mapcheck.js` verifies that nothing overlaps an obstacle and every spawn, box and pad is reachable.
(function (root) {
  const W = 1800, H = 1200;
  const b = (x, y, w, h) => ({ x, y, w, h });
  const boost = (...pts) => pts.map(([x, y]) => ({ x, y, kind: 'boost' }));
  const jump = (...pts) => pts.map(([x, y]) => ({ x, y, kind: 'jump' }));
  const DECK_Z = 32; // height of every deck and of the top of every ramp (3.2 m)
  // a ramp 10 m long and 8.4 m wide whose HIGH end sits on the given edge point (ex, ey) and which rises in `dir`
  const ramp = (ex, ey, dir) => (dir === 'N' ? { x: ex - 42, y: ey, w: 84, h: 100, dir } : dir === 'S' ? { x: ex - 42, y: ey - 100, w: 84, h: 100, dir } : dir === 'W' ? { x: ex, y: ey - 42, w: 100, h: 84, dir } : { x: ex - 100, y: ey - 42, w: 100, h: 84, dir });
  // mirror a block into all four quadrants of the arena
  const quad = (x, y, w, h) => [b(x, y, w, h), b(W - x - w, y, w, h), b(x, H - y - h, w, h), b(W - x - w, H - y - h, w, h)];

  const maps = [
    // A speedway loop with boost strips runs around a walled fort. Jump pads on all four sides launch you over the fort walls.
    { id:'stadium', name:'Sunset Stadium', tag:'Speedway loop · storm the fort', theme:'stadium', accent:'#ffbc67', sky:'#91cfe9', fog:'#e5d8c1', ground:'#668960', floor:'#485b68', cap:'#ffad54', sun:'#ffe1b0',
      w: W, h: H,
      obstacles: [
        b(680,440,160,36), b(960,440,160,36), b(680,724,160,36), b(960,724,160,36),   // fort: north and south walls with a gate
        b(680,476,36,90), b(680,634,36,90), b(1084,476,36,90), b(1084,634,36,90),     // fort: west and east walls with a gate
        ...quad(300,300,220,40),                                                       // mid-field bars
        b(880,150,40,110), b(880,940,40,110),                                         // pillars facing the north and south gates
        ...quad(140,140,70,70),                                                        // corner blocks
      ],
      // two raised decks flank the fort, each with a ramp on its north and south side and an item box on top
      decks: [b(340,520,200,160), b(1260,520,200,160)],
      ramps: [ramp(440,520,'S'), ramp(440,680,'N'), ramp(1360,520,'S'), ramp(1360,680,'N')],
      boxes: [[900,600],[770,600],[1030,600],[900,80],[900,1120],[90,600],[1710,600],[600,400],[1200,400],[600,800],[1200,800],[270,250],[1530,250],[270,950],[1530,950],[440,600],[1360,600]],
      pads: [...boost([500,80],[1300,80],[500,1120],[1300,1120],[80,350],[80,850],[1720,350],[1720,850]), ...jump([900,340],[900,860],[590,600],[1210,600])],
      spawns: [[100,100],[1700,100],[100,1100],[1700,1100],[560,180],[1240,1020],[100,720],[1700,480]] },

    // City blocks cut by streets and alleys. Three portal pairs link the far corners; drones patrol the cross streets.
    { id:'neon', name:'Neon Overdrive', tag:'City streets · warp portals', theme:'neon', accent:'#68efff', sky:'#10172f', fog:'#19264b', ground:'#18203a', floor:'#202d46', cap:'#52e8f5', sun:'#adbfff',
      w: W, h: H,
      obstacles: [
        b(750,220,120,220), b(930,220,120,220), b(750,760,120,220), b(930,760,120,220),     // middle blocks, split by an alley
        b(560,580,60,40), b(1180,580,60,40), b(840,585,120,30),                             // boulevard pillars and median
      ],
      // the four corner city blocks are rooftops you can drive on: a ramp from the boulevard and one from the outer street each
      decks: [b(240,220,300,220), b(1260,220,300,220), b(240,760,300,220), b(1260,760,300,220)],
      ramps: [ramp(390,440,'N'), ramp(240,330,'E'), ramp(1410,440,'N'), ramp(1560,330,'W'), ramp(390,760,'S'), ramp(240,870,'E'), ramp(1410,760,'S'), ramp(1560,870,'W')],
      boxes: [[900,510],[900,690],[300,600],[1500,600],[900,330],[900,870],[645,330],[1155,330],[645,870],[1155,870],[390,330],[1410,330],[390,870],[1410,870],[390,120],[1410,1080]],
      portals: [[{x:120,y:110},{x:1680,y:1090}],[{x:1680,y:110},{x:120,y:1090}],[{x:900,y:110},{x:900,y:1090}]],
      pads: boost([420,600],[1380,600],[130,600],[1670,600],[645,120],[1155,1080]),
      movers: [{kind:'drone',path:[[645,70],[645,1130]],speed:190,r:20},{kind:'drone',path:[[1155,1130],[1155,70]],speed:190,r:20}],
      spawns: [[130,220],[1670,220],[130,980],[1670,980],[130,480],[1670,720],[480,120],[1320,1080]] },

    // Three rows of mesas. Boulders roll along the two lanes between them, the gaps between mesas are quicksand,
    // and jump pads hop you from one lane to the other.
    { id:'canyon', name:'Canyon Rush', tag:'Boulder lanes · quicksand', theme:'canyon', accent:'#ffd18a', sky:'#f1bb98', fog:'#efc09e', ground:'#bd8155', floor:'#b38763', cap:'#e78950', sun:'#ffe1ac',
      w: W, h: H,
      obstacles: [
        b(260,180,280,140), b(700,120,120,240), b(1000,240,300,120), b(1440,120,140,240),          // north row
        b(200,500,140,200), b(940,520,120,180), b(1640,600,80,100),                                // middle row (two more mesas here are drivable plateaus, see decks)
        b(160,860,200,120), b(480,840,120,240), b(740,900,300,110), b(1180,840,120,240), b(1460,880,200,130),  // south row
      ],
      // two mesas in the middle row are plateaus: ramps at both ends, an item box on top, and a view of the boulder lanes
      decks: [b(560,480,200,110), b(1280,480,220,120)],
      ramps: [ramp(560,535,'E'), ramp(760,535,'W'), ramp(1280,540,'E'), ramp(1500,540,'W')],
      boxes: [[300,420],[900,420],[1380,420],[450,770],[1100,770],[1600,770],[150,110],[900,150],[1690,200],[100,1100],[890,1100],[1700,1100],[870,640],[650,535],[1380,540]],
      zones: [{x:345,y:590,w:150,h:130,kind:'mud'},{x:1065,y:595,w:150,h:125,kind:'mud'},{x:760,y:1030,w:260,h:120,kind:'mud'}],
      movers: [{kind:'boulder',path:[[80,420],[1720,420]],speed:170,r:22},{kind:'boulder',path:[[1720,770],[80,770]],speed:140,r:22}],
      pads: jump([650,440],[1380,750],[110,420],[1690,770]),
      spawns: [[90,90],[1710,90],[90,1110],[1710,1110],[580,100],[1340,1120],[90,620],[1740,480]] },
  ];
  // Ground height at a point: 0 on the floor, DECK_Z on a deck, in between on a ramp.
  maps.DECK_Z = DECK_Z;
  maps.surface = (m, x, y) => {
    let h = 0;
    for (const d of m.decks || []) if (x >= d.x && x <= d.x + d.w && y >= d.y && y <= d.y + d.h) return DECK_Z;
    for (const r of m.ramps || []) { if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue; const p = r.dir === 'E' ? (x - r.x) / r.w : r.dir === 'W' ? (r.x + r.w - x) / r.w : r.dir === 'S' ? (y - r.y) / r.h : (r.y + r.h - y) / r.h; h = Math.max(h, p * DECK_Z); }
    return h;
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = maps;
  else root.MEMEKARTS_MAPS = maps;
})(typeof window !== 'undefined' ? window : globalThis);
