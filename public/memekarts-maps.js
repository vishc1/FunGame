// One layout source for server collisions, bots, previews, and the 3D arena.
// Units: 10 = 1 metre, origin top-left, x right, y down. A kart is about 36 long. There is a 20-unit wall margin.
//
// Per map:
//   w, h      arena size (default 900 x 600)
//   obstacles [{x, y, w, h}]                            solid blocks
//   boxes     [[x, y], ...]                             item boxes
//   spawns    [[x, y], ...]                             at least 8
//   pads      [{x, y, kind:'boost'|'jump'}]             floor pads: a speed burst, or a launch through the air (flies over walls)
//   ramps     [{x, y, w, h, dir:'N'|'E'|'S'|'W'}]       drive up it in its direction and you fly: the faster you hit it, the further you go.
//                                                       N is toward y = 0. Karts in the air clear walls, obstacles, mud and other karts.
//   portals   [[{x,y},{x,y}], ...]                      warp pairs: drive into one, come out of the other
//   zones     [{x, y, w, h, kind:'mud'}]                slow ground: a shortcut that costs you speed
//   movers    [{kind:'boulder'|'drone', path:[[x,y],[x,y]], speed, r}]   hazards that travel back and forth and hurt on contact
// `node tools/mapcheck.js` verifies that nothing overlaps an obstacle and every spawn, box and pad is reachable.
(function (root) {
  const W = 1800, H = 1200;
  const b = (x, y, w, h) => ({ x, y, w, h });
  const boost = (...pts) => pts.map(([x, y]) => ({ x, y, kind: 'boost' }));
  const jump = (...pts) => pts.map(([x, y]) => ({ x, y, kind: 'jump' }));
  const ramp = (cx, cy, dir) => (dir === 'N' || dir === 'S' ? { x: cx - 32, y: cy - 36, w: 64, h: 72, dir } : { x: cx - 36, y: cy - 32, w: 72, h: 64, dir });
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
        b(880,150,40,110), b(880,940,40,110), b(400,560,120,80), b(1280,560,120,80),  // pillars facing each gate
        ...quad(140,140,70,70),                                                        // corner blocks
      ],
      boxes: [[900,600],[770,600],[1030,600],[900,80],[900,1120],[90,600],[1710,600],[600,400],[1200,400],[600,800],[1200,800],[270,250],[1530,250],[270,950],[1530,950]],
      pads: [...boost([500,80],[1300,80],[500,1120],[1300,1120],[80,350],[80,850],[1720,350],[1720,850]), ...jump([900,340],[900,860],[590,600],[1210,600])],
      // a ramp after each boost strip on the long straights, and two that hop the mid-field bars onto the straights
      ramps: [ramp(640,85,'E'), ramp(1160,1115,'W'), ramp(410,420,'N'), ramp(1390,780,'S')],
      spawns: [[100,100],[1700,100],[100,1100],[1700,1100],[560,180],[1240,1020],[100,720],[1700,480]] },

    // City blocks cut by streets and alleys. Three portal pairs link the far corners; drones patrol the cross streets.
    { id:'neon', name:'Neon Overdrive', tag:'City streets · warp portals', theme:'neon', accent:'#68efff', sky:'#10172f', fog:'#19264b', ground:'#18203a', floor:'#202d46', cap:'#52e8f5', sun:'#adbfff',
      w: W, h: H,
      obstacles: [
        b(240,220,300,220), b(1260,220,300,220), b(240,760,300,220), b(1260,760,300,220),   // four corner city blocks
        b(750,220,120,220), b(930,220,120,220), b(750,760,120,220), b(930,760,120,220),     // middle blocks, split by an alley
        b(560,580,60,40), b(1180,580,60,40), b(840,585,120,30),                             // boulevard pillars and median
      ],
      boxes: [[900,510],[900,690],[300,600],[1500,600],[900,330],[900,870],[645,330],[1155,330],[645,870],[1155,870],[130,330],[1670,330],[130,870],[1670,870],[390,120],[1410,1080]],
      portals: [[{x:120,y:110},{x:1680,y:1090}],[{x:1680,y:110},{x:120,y:1090}],[{x:900,y:110},{x:900,y:1090}]],
      pads: boost([420,600],[1380,600],[130,600],[1670,600],[645,120],[1155,1080]),
      movers: [{kind:'drone',path:[[645,70],[645,1130]],speed:190,r:20},{kind:'drone',path:[[1155,1130],[1155,70]],speed:190,r:20}],
      // rooftop jumps: from the boulevard, clear over a whole city block into the street behind it
      ramps: [ramp(330,510,'N'), ramp(1470,510,'N'), ramp(330,690,'S'), ramp(1470,690,'S')],
      spawns: [[130,220],[1670,220],[130,980],[1670,980],[130,480],[1670,720],[480,120],[1320,1080]] },

    // Three rows of mesas. Boulders roll along the two lanes between them, the gaps between mesas are quicksand,
    // and jump pads hop you from one lane to the other.
    { id:'canyon', name:'Canyon Rush', tag:'Boulder lanes · quicksand', theme:'canyon', accent:'#ffd18a', sky:'#f1bb98', fog:'#efc09e', ground:'#bd8155', floor:'#b38763', cap:'#e78950', sun:'#ffe1ac',
      w: W, h: H,
      obstacles: [
        b(260,180,280,140), b(700,120,120,240), b(1000,240,300,120), b(1440,120,140,240),          // north row
        b(200,500,140,200), b(500,480,300,110), b(940,520,120,180), b(1220,480,320,120), b(1620,560,80,140),  // middle row
        b(160,860,200,120), b(480,840,120,240), b(740,900,300,110), b(1180,840,120,240), b(1460,880,200,130),  // south row
      ],
      boxes: [[300,420],[900,420],[1380,420],[450,770],[1100,770],[1600,770],[150,110],[900,150],[1690,200],[100,1100],[890,1100],[1700,1100],[870,620],[1580,510]],
      zones: [{x:345,y:470,w:150,h:250,kind:'mud'},{x:1065,y:470,w:150,h:250,kind:'mud'},{x:760,y:1030,w:260,h:120,kind:'mud'}],
      movers: [{kind:'boulder',path:[[80,420],[1720,420]],speed:170,r:22},{kind:'boulder',path:[[1720,770],[80,770]],speed:140,r:22}],
      pads: jump([650,440],[1380,750],[110,420],[1690,770]),
      // leap the quicksand instead of wading through it
      ramps: [ramp(420,480,'S'), ramp(1140,715,'N'), ramp(710,1125,'E')],
      spawns: [[90,90],[1710,90],[90,1110],[1710,1110],[580,100],[1340,1120],[90,620],[1740,480]] },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = maps;
  else root.MEMEKARTS_MAPS = maps;
})(typeof window !== 'undefined' ? window : globalThis);
