// Toy Box Blasters: everything the server, the bots and the browser must agree on: the map, movement physics,
// ray casts and the weapon table. Loaded with require() on the server and a <script> tag in the browser (window.BLASTERS).
// Units are metres. x = east, z = south, y = up. yaw 0 looks toward -z; forward = (-sin yaw, -cos yaw).
(function (root, factory) { const m = factory(); if (typeof module === 'object' && module.exports) module.exports = m; else root.BLASTERS = m; })(typeof self !== 'undefined' ? self : this, function () {
  // ------------------------------------------------------------------ maps
  // Each map is { id, name, tag, size, theme, boxes, pads, pickups, spawns, ramps, teles, train }. The arena spans -size..size on x and z.
  // build() gives a map function the box helpers and adds the perimeter walls. Boxes: { x0, x1, y0, y1, z0, z1, t (type), c (optional colour) }.
  function build(id, name, tag, size, theme, fn) {
    const boxes = [];
    const box = (cx, cz, w, d, y0, y1, t, c) => { boxes.push({ x0: cx - w / 2, x1: cx + w / 2, y0, y1, z0: cz - d / 2, z1: cz + d / 2, t, c }); };
    const rot4 = (x, z) => [[x, z], [-z, x], [-x, -z], [z, -x]];
    const rot2 = (x, z) => [[x, z], [-x, -z]];
    // stairs: n solid steps rising from the low end (cx, cz) toward the high end along z or x; each step is filled down to the floor
    function stairs(cx, cz, toward, width, height, n, run) {
      const [dx, dz] = toward; // unit direction from the low end to the high end
      for (let i = 0; i < n; i++) {
        const s0 = (i * run) / n, len = run - s0, mid = s0 + len / 2;
        if (dz) box(cx, cz + dz * mid, width, len, 0, (height * (i + 1)) / n, 'step'); else box(cx + dx * mid, cz, len, width, 0, (height * (i + 1)) / n, 'step');
      }
    }
    box(0, -size - 0.5, size * 2 + 2, 1, 0, 9, 'wall'); box(0, size + 0.5, size * 2 + 2, 1, 0, 9, 'wall'); box(-size - 0.5, 0, 1, size * 2 + 2, 0, 9, 'wall'); box(size + 0.5, 0, 1, size * 2 + 2, 0, 9, 'wall');
    return Object.assign({ id, name, tag, size, theme, boxes }, fn({ box, stairs, rot2, rot4 })); // a map may also set powerSpot: where the HUD says the power-up appears
  }

  // "Fort Cardboard": a hollow central tower (tunnel through the middle, power-up on the roof), two raised galleries joined to the
  // tower by bridges, four corner forts (two with stairs, two reachable only by jump pad), cover on the ground and a train down the middle.
  const FORT = build('fort', 'Fort Cardboard', 'Tower, galleries, corner forts and a train through the middle', 32, { floor: '#7fb77e', line: '#f4f1e4', sky: ['#5aa7ff', '#bfe3ff', '#fff3da'] }, ({ box, stairs, rot2, rot4 }) => {
    // central tower: two solid halves and a roof slab leave an east-west tunnel through the middle
    box(0, -3.25, 10, 3.5, 0, 3.2, 'tower'); box(0, 3.25, 10, 3.5, 0, 3.2, 'tower'); box(0, 0, 10, 3, 2.5, 3.2, 'tower');
    stairs(0, -12, [0, 1], 3, 3.2, 8, 7); stairs(0, 12, [0, -1], 3, 3.2, 8, 7);
    // bridges from the tower roof to the east and west galleries
    box(12, 0, 14, 2.6, 2.8, 3.2, 'bridge'); box(-12, 0, 14, 2.6, 2.8, 3.2, 'bridge');
    for (const [sx, sz] of rot2(1, 1)) {
      box(22 * sx, 0, 6, 18, 2.8, 3.2, 'plat');                                             // gallery deck
      for (const [px, pz] of [[19.6, -8.4], [24.4, -8.4], [19.6, 8.4], [24.4, 8.4]]) box(px * sx, pz, 0.8, 0.8, 0, 2.8, 'pillar');
      stairs(22 * sx, -16 * sz, [0, sz], 3, 3.2, 8, 7);                                      // stairs up to the gallery end
      box(25.2 * sx, 0, 0.4, 18, 3.2, 4.1, 'rail');                                          // outer parapet
    }
    // corner forts: solid blocks with parapets
    for (const [fx, fz] of rot4(26, -26)) {
      box(fx, fz, 9, 9, 0, 2.4, 'fort');
      const ix = -Math.sign(fx), iz = -Math.sign(fz); // which way faces the middle of the map
      box(fx + ix * 4.3, fz - iz * 2.2, 0.4, 4.6, 2.4, 3.3, 'rail'); box(fx - ix * 2.2, fz + iz * 4.3, 4.6, 0.4, 2.4, 3.3, 'rail');
    }
    stairs(-26, -16, [0, -1], 3, 2.4, 6, 5.5); stairs(26, 16, [0, 1], 3, 2.4, 6, 5.5);     // only the NW and SE forts have stairs
    // ground cover
    for (const [x, z] of rot4(11, -15)) box(x, z, 2.2, 2.2, 0, 1.5, 'crate');
    for (const [x, z] of rot4(15.5, -11)) box(x, z, 2.2, 2.2, 0, 1.5, 'crate');
    for (const [x, z] of rot4(13.2, -13.2)) box(x, z, 2.2, 2.2, 1.5, 2.6, 'crate');           // a crate stacked across the two below
    for (const [x, z] of rot4(7, -24)) box(x, z, 6, 0.7, 0, 1.2, 'lowwall');
    for (const [x, z] of rot4(-9, -27)) box(x, z, 1.6, 1.6, 0, 4.5, 'pillar');
    for (const [x, z] of rot2(12, 20)) box(x, z, 0.7, 5, 0, 1.2, 'lowwall');
    for (const [x, z] of rot2(-13, 8)) box(x, z, 3, 3, 0, 2, 'crate');

    // ramps: true slopes. { x0, x1, z0, z1 footprint, ax: 'x' | 'z' the axis it rises along, dir: +1 rises toward +axis / -1 toward -axis,
    // y0 low height, y1 high height }. You can walk up from the low end; the sides and the high end are walls.
    // A ramp whose top ends in mid-air is a launch ramp: leave the top at speed and you keep the upward momentum.
    const ramps = [
      { x0: 20.5, x1: 23.5, z0: 9, z1: 17, ax: 'z', dir: -1, y0: 0, y1: 3.2, kind: 'walk' },      // up to the south end of the east gallery
      { x0: -23.5, x1: -20.5, z0: -17, z1: -9, ax: 'z', dir: 1, y0: 0, y1: 3.2, kind: 'walk' },   // up to the north end of the west gallery
      { x0: 10.5, x1: 13.5, z0: 3.4, z1: 7.6, ax: 'z', dir: -1, y0: 0, y1: 2.1, kind: 'launch' }, // kicker: run or dash up, jump at the top, land on the east bridge
      { x0: -13.5, x1: -10.5, z0: -7.6, z1: -3.4, ax: 'z', dir: 1, y0: 0, y1: 2.1, kind: 'launch' },
    ];
    // teleporters: pairs. Step into one end, come out of the other with your speed intact.
    const teles = [
      [{ x: 20, y: 0, z: -29.6 }, { x: -20, y: 0, z: 29.6 }],        // far north-east wall <-> far south-west wall
      [{ x: 22, y: 3.2, z: -6 }, { x: -22, y: 3.2, z: 6 }],          // east gallery <-> west gallery
    ];
    // the toy train runs along the middle road (z = 0), through the tower tunnel, and flattens whoever is on the track
    const train = { z: 0, half: 0.95, h: 2.1, len: 8.2, speed: 24, every: 30, warn: 3, dmg: 80 };

    // jump pads: stepping on one replaces your velocity with v
    const pads = [];
    for (const [fx, fz] of rot4(26, -26)) { const ix = -Math.sign(fx), iz = -Math.sign(fz); pads.push({ x: fx + ix * 6.2, y: 0, z: fz + iz * 6.2, r: 1.15, v: [-ix * 4.6, 12.5, -iz * 4.6] }); }
    pads.push({ x: 0, y: 0, z: -28.5, r: 1.3, v: [0, 16, 20], big: true }, { x: 0, y: 0, z: 28.5, r: 1.3, v: [0, 16, -20], big: true });

    // pickups. respawn is in seconds.
    const pickups = [
      { kind: 'power', x: 0, y: 3.2, z: 0 },
      { kind: 'mega', x: 0, y: 0, z: 0, respawn: 35 },
      { kind: 'weapon', w: 4, x: 0, y: 0, z: -19.5, respawn: 25 },
      { kind: 'weapon', w: 3, x: 26, y: 2.4, z: -26, respawn: 20 }, { kind: 'weapon', w: 8, x: -26, y: 2.4, z: 26, respawn: 30 }, // the south-west fort holds the Toy Cannon
      { kind: 'armor', x: -26, y: 2.4, z: -26, respawn: 25 }, { kind: 'armor', x: 26, y: 2.4, z: 26, respawn: 25 },
      { kind: 'weapon', w: 1, x: 22, y: 0, z: 0, respawn: 12 }, { kind: 'weapon', w: 5, x: -22, y: 0, z: 0, respawn: 15 },
      { kind: 'weapon', w: 2, x: 9, y: 0, z: 21, respawn: 12 }, { kind: 'weapon', w: 7, x: -9, y: 0, z: -21, respawn: 15 },
      { kind: 'weapon', w: 6, x: 22, y: 3.2, z: 6, respawn: 18 }, { kind: 'weapon', w: 1, x: -22, y: 3.2, z: -6, respawn: 15 },
      ...rot4(8, -8.5).map(([x, z]) => ({ kind: 'health', x, y: 0, z, respawn: 10 })),
      ...rot4(29, -9).map(([x, z]) => ({ kind: 'health', x, y: 0, z, respawn: 10 })),
      { kind: 'armor', x: 0, y: 0, z: 19.5, respawn: 25 },
    ];
    const spawns = [...rot4(29.5, -3), ...rot4(17, -29.5), ...rot2(3.5, 17)].map(([x, z]) => ({ x, z, yaw: Math.atan2(x, z) })); // yaw faces the centre
    return { pads, pickups, spawns, ramps, teles, train, powerSpot: 'the tower roof' };
  });

  // "Block Towers": two stepped pyramids of building blocks in opposite corners (stairs straight up one face, or double-jump the
  // ledges), a raised cross of beams over the centre that you reach by launch ramp or jump pad, block mazes in the other corners,
  // teleporters between the two summits, and a faster train. Height is everything here.
  const TOWERS = build('towers', 'Block Towers', 'Two climbable pyramids, a catwalk over the middle, launch ramps everywhere', 30, { floor: '#d9b27a', line: '#fff3dc', sky: ['#ff9f6e', '#ffd9b8', '#fff6ea'] }, ({ box, stairs, rot2, rot4 }) => {
    const BLK = ['#ff5d5d', '#4da6ff', '#ffd84d', '#5ee07a', '#c77dff', '#ff9f43'];
    // the two pyramids: 14 m base (2.4 high), 10 m middle (4.8), 6 m summit (7.2). One straight staircase up the face that looks at the centre.
    for (const [sx] of rot2(-1, 0)) {
      const cx = 17 * sx, cz = 17 * sx;
      box(cx, cz, 14, 14, 0, 2.4, 'block', sx < 0 ? BLK[1] : BLK[0]); box(cx, cz, 10, 10, 2.4, 4.8, 'block', BLK[2]); box(cx, cz, 6, 6, 4.8, 7.2, 'block', sx < 0 ? BLK[0] : BLK[1]);
      stairs(4.5 * sx, cz, [sx, 0], 3, 2.4, 6, 5.5);   // ground -> base top (runs from x = +-4.5 to the base edge at +-10)
      stairs(10 * sx, cz, [sx, 0], 3, 4.8, 12, 2);      // base top -> middle
      stairs(12 * sx, cz, [sx, 0], 3, 7.2, 18, 2);      // middle -> summit
      box(cx + sx * 6.8, cz, 0.4, 14, 2.4, 3.3, 'rail'); box(cx, cz + sx * 6.8, 14, 0.4, 2.4, 3.3, 'rail'); // parapets on the two outer edges of the base
    }
    // the cross: two beams over the middle at 2.6-3.2 with a 6 m pad where they meet; the train fits underneath
    box(0, 0, 2.6, 22, 2.6, 3.2, 'beam'); box(0, 0, 22, 2.6, 2.6, 3.2, 'beam'); box(0, 0, 6, 6, 2.6, 3.2, 'beam');
    for (const [px, pz] of rot4(2.6, -2.6)) box(px, pz, 0.7, 0.7, 0, 2.6, 'pillar');
    for (const [px, pz] of rot2(0, 9.5)) box(px, pz, 0.7, 0.7, 0, 2.6, 'pillar');
    // block mazes in the north-east and south-west corners
    for (const [sx, sz] of rot2(1, -1)) {
      box(9 * sx, 23 * sz, 2.4, 2.4, 0, 2.4, 'block', BLK[3]); box(11.4 * sx, 23 * sz, 2.4, 2.4, 0, 1.2, 'block', BLK[4]);
      box(23 * sx, 9 * sz, 2.4, 2.4, 0, 2.4, 'block', BLK[5]); box(23 * sx, 11.4 * sz, 2.4, 2.4, 0, 1.2, 'block', BLK[0]);
      box(15 * sx, 15 * sz, 2.4, 2.4, 0, 1.2, 'block', BLK[1]); box(15 * sx, 15 * sz, 2.4, 2.4, 1.2, 2.4, 'block', BLK[2]);
      box(26 * sx, 18 * sz, 5, 0.7, 0, 1.2, 'lowwall'); box(18 * sx, 26 * sz, 0.7, 5, 0, 1.2, 'lowwall');
      box(27.5 * sx, 27.5 * sz, 1.6, 1.6, 0, 4.5, 'pillar');
    }
    // low cover near the north and south spawns, either side of the beam ends
    for (const [x, z] of rot4(6, -20)) box(x, z, 0.7, 4, 0, 1.2, 'lowwall');
    // launch ramps: a kicker at each end of the cross, 2 m short of the beam
    const ramps = [
      { x0: -1.5, x1: 1.5, z0: -17, z1: -13, ax: 'z', dir: 1, y0: 0, y1: 2.1, kind: 'launch' },
      { x0: -1.5, x1: 1.5, z0: 13, z1: 17, ax: 'z', dir: -1, y0: 0, y1: 2.1, kind: 'launch' },
      { x0: -17, x1: -13, z0: -1.5, z1: 1.5, ax: 'x', dir: 1, y0: 0, y1: 2.1, kind: 'launch' },
      { x0: 13, x1: 17, z0: -1.5, z1: 1.5, ax: 'x', dir: -1, y0: 0, y1: 2.1, kind: 'launch' },
    ];
    const teles = [
      [{ x: -19, y: 7.2, z: -19 }, { x: 19, y: 7.2, z: 19 }],      // summit <-> summit
      [{ x: 27, y: 0, z: -22 }, { x: -27, y: 0, z: 22 }],          // north-east corner <-> south-west corner
    ];
    const train = { z: 0, half: 0.95, h: 2.1, len: 8.2, speed: 30, every: 22, warn: 3, dmg: 80 };
    // jump pads: the two maze corners fling you onto the central pad; small pads at the pyramid feet hop you onto the base
    const pads = [{ x: 20, y: 0, z: -20, r: 1.3, v: [-14, 16, 14], big: true }, { x: -20, y: 0, z: 20, r: 1.3, v: [14, 16, -14], big: true },
      { x: -17, y: 0, z: -7.6, r: 1.1, v: [0, 11, -4.5] }, { x: 17, y: 0, z: 7.6, r: 1.1, v: [0, 11, 4.5] }];
    const pickups = [
      { kind: 'power', x: 0, y: 3.2, z: 0 },
      { kind: 'mega', x: 0, y: 0, z: 0, respawn: 35 },
      { kind: 'weapon', w: 3, x: -17, y: 7.2, z: -17, respawn: 20 }, { kind: 'weapon', w: 8, x: 17, y: 7.2, z: 17, respawn: 30 },  // the summits: Long Shot and Toy Cannon
      { kind: 'armor', x: -21, y: 4.8, z: -17, respawn: 25 }, { kind: 'armor', x: 21, y: 4.8, z: 17, respawn: 25 },
      { kind: 'weapon', w: 4, x: 0, y: 0, z: -24, respawn: 25 }, { kind: 'weapon', w: 6, x: 0, y: 0, z: 24, respawn: 18 },
      { kind: 'weapon', w: 2, x: -9, y: 3.2, z: 0, respawn: 12 }, { kind: 'weapon', w: 5, x: 9, y: 3.2, z: 0, respawn: 15 },
      { kind: 'weapon', w: 7, x: 24, y: 0, z: -4, respawn: 15 }, { kind: 'weapon', w: 1, x: -24, y: 0, z: 4, respawn: 12 },
      { kind: 'weapon', w: 1, x: 12, y: 0, z: -27, respawn: 12 }, { kind: 'weapon', w: 2, x: -12, y: 0, z: 27, respawn: 12 },
      ...rot4(8, -8).map(([x, z]) => ({ kind: 'health', x, y: 0, z, respawn: 10 })),
      ...rot4(27, -13).map(([x, z]) => ({ kind: 'health', x, y: 0, z, respawn: 10 })),
      { kind: 'armor', x: 22, y: 0, z: -27, respawn: 25 }, { kind: 'armor', x: -22, y: 0, z: 27, respawn: 25 },
    ];
    const spawns = [...rot4(28, -6), ...rot4(28, 8), ...rot2(-27, -3)].map(([x, z]) => ({ x, z, yaw: Math.atan2(x, z) }));
    return { pads, pickups, spawns, ramps, teles, train, powerSpot: 'the catwalk' };
  });
  const MAPS = [FORT, TOWERS], MAP = FORT; // MAP: the default map, and what older callers that do not pass a map get
  const mapById = (id) => MAPS.find((m) => m.id === id) || null;

  // ------------------------------------------------------------------ weapons, power-ups
  // dmg per pellet. falloff: [fullUntil, minAt, minScale]. tip is shown to the player the moment they pick it up.
  const WEAPONS = [
    // ads = how far aiming (right mouse) zooms in. Aiming also tightens spread and slows you down.
    { id: 'dart', name: 'Dart Blaster', dmg: 20, head: 1.5, rate: 4.6, mag: 14, reserve: Infinity, reload: 1.1, spread: 0.012, pellets: 1, range: 90, auto: true, ads: 1.35, tip: 'Your sidearm. Accurate, never runs out.' },
    { id: 'scatter', name: 'Scatter Blaster', dmg: 12, head: 1.25, rate: 1.15, mag: 5, reserve: 15, reload: 1.6, spread: 0.09, pellets: 8, range: 45, falloff: [7, 26, 0.3], auto: false, ads: 1.15, tip: 'Eight darts at once. Brutal up close, weak far away.' },
    { id: 'rapid', name: 'Rapid Blaster', dmg: 11, head: 1.4, rate: 12, mag: 36, reserve: 108, reload: 1.5, spread: 0.032, pellets: 1, range: 70, falloff: [18, 50, 0.6], auto: true, ads: 1.4, tip: 'Hold the trigger. Sprays darts fast.' },
    { id: 'long', name: 'Long Shot', dmg: 85, head: 2.2, rate: 0.9, mag: 4, reserve: 12, reload: 2, spread: 0.001, hipSpread: 0.045, pellets: 1, range: 140, auto: false, zoom: 3.2, ads: 3.2, tip: 'Aim to use the scope. A headshot tags anyone in one hit.' },
    { id: 'boom', name: 'Boom Tube', dmg: 100, splash: 95, radius: 5, speed: 30, rate: 0.85, mag: 3, reserve: 6, reload: 2.2, spread: 0, pellets: 1, projectile: true, auto: false, ads: 1.2, tip: 'Foam rocket with a big blast. Aim at their feet. It hurts you too.' },
    { id: 'burst', name: 'Burst Blaster', dmg: 17, head: 1.6, rate: 13, burst: 3, burstGap: 0.42, mag: 24, reserve: 72, reload: 1.5, spread: 0.014, pellets: 1, range: 85, falloff: [28, 65, 0.7], auto: false, ads: 1.6, tip: 'Three darts per click. Deadly accurate when you aim.' },
    { id: 'lob', name: 'Splash Lobber', dmg: 75, splash: 80, radius: 4.2, speed: 21, gravity: 15, rate: 1.1, mag: 2, reserve: 8, reload: 1.8, spread: 0, pellets: 1, projectile: true, auto: false, ads: 1.2, tip: 'Lobs a water balloon in an arc. Throw it over walls and onto roofs.' },
    { id: 'zap', name: 'Zap Ray', dmg: 7, head: 1.3, rate: 17, mag: 70, reserve: 140, reload: 1.7, spread: 0.004, pellets: 1, range: 24, auto: true, ads: 1.3, beam: true, tip: 'A steady beam. Short range, never misses if you keep it on them.' },
    { id: 'cannon', name: 'Toy Cannon', dmg: 150, splash: 70, radius: 3.6, speed: 40, gravity: 9, recoil: 10, rate: 0.5, mag: 1, reserve: 4, reload: 2.6, spread: 0, pellets: 1, projectile: true, auto: false, ads: 1.3, tip: 'One huge cannonball. Tags anyone it hits, and the kick throws you backwards: fire at the floor to fly.' },
  ];
  // Foam sword: everyone always has it (E or V). Short reach, big hit, and you lunge.
  const MELEE = { name: 'Foam Sword', dmg: 55, range: 2.6, cd: 0.7, lunge: 7 };
  // Loadout: one of these can be chosen in the locker as a starter blaster (with half the usual spare darts). Everything else is map-only.
  const LOADOUT = [0, 1, 2, 5];
  const POWERS = {
    mega: { name: 'Mega Darts', time: 12, color: '#ff4dd8', tip: 'Double damage for 12 seconds.' },
    speed: { name: 'Sugar Rush', time: 12, color: '#ffd84d', tip: 'Run much faster and dash twice as often for 12 seconds.' },
    ghost: { name: 'Ghost', time: 10, color: '#b8c4ff', tip: 'Nearly invisible for 10 seconds.' },
    tank: { name: 'Bubble Wrap', time: 0, color: '#5ee07a', tip: 'Instantly 150 health and full armour.' },
  };
  const PICKUP_INFO = {
    health: { name: 'Snack', tip: '+30 health.' }, mega: { name: 'Lunchbox', tip: '+100 health, up to 150.' }, armor: { name: 'Cardboard Armour', tip: '+50 armour. Armour soaks up half of every hit.' },
  };

  // ------------------------------------------------------------------ physics
  const P = { R: 0.38, H: 1.8, EYE: 1.62, G: 22, JUMP: 7.6, SPEED: 7.2, ACCEL: 75, AIR_ACCEL: 20, FRICTION: 11, STEP: 0.46, DASH: 16, DASH_T: 0.16, DASH_CD: 2.5,
    CROUCH_EYE: 1.02, CROUCH_SPEED: 0.5, ADS_SPEED: 0.62, SLIDE_MIN: 5.5, SLIDE_SPEED: 12.5, SLIDE_T: 0.7, SLIDE_CD: 1.1 };
  const newBody = (x, y, z) => ({ x, y, z, vx: 0, vy: 0, vz: 0, ground: false, jumps: 0, dashT: 0, dashCd: 0, launched: false, landed: 0, teleCd: 0.6 });
  // Every physics and ray function takes the map as its last argument (default: the first map).
  // the ramp under a point (highest surface wins), with its surface height there, or null
  function rampUnder(x, z, map = MAP) {
    let best = null, bh = -1; const ramps = map.ramps;
    for (let i = 0; i < ramps.length; i++) { const r = ramps[i]; if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
      const u = r.ax === 'x' ? (x - r.x0) / (r.x1 - r.x0) : (z - r.z0) / (r.z1 - r.z0), h = r.y0 + (r.y1 - r.y0) * (r.dir > 0 ? u : 1 - u); if (h > bh) { bh = h; best = r; } }
    return best ? { r: best, h: bh } : null;
  }
  const rampAt = (x, z, map = MAP) => { const u = rampUnder(x, z, map); return u ? u.h : -1; };
  // highest top among boxes overlapping a player-sized box at (x, y, z), or null. `top` and `under` are reused scratch values.
  function overlap(x, y, z, map = MAP) {
    let top = null, under = Infinity; const boxes = map.boxes;
    for (let i = 0; i < boxes.length; i++) { const b = boxes[i];
      if (x + P.R <= b.x0 || x - P.R >= b.x1 || z + P.R <= b.z0 || z - P.R >= b.z1 || y >= b.y1 || y + P.H <= b.y0) continue;
      if (top === null || b.y1 > top) top = b.y1; if (b.y0 < under) under = b.y0;
    }
    return top === null ? null : { top, under };
  }
  // Advances one body. inp = { f, s (-1..1 forward / strafe), yaw, jump, dash (true only on the frame the key went down) }. speedMul scales run speed.
  function stepPlayer(p, inp, dt, speedMul = 1, map = MAP) {
    const { pads, teles } = map;
    const sin = Math.sin(inp.yaw), cos = Math.cos(inp.yaw);
    let wx = -sin * inp.f + cos * inp.s, wz = -cos * inp.f - sin * inp.s; const wl = Math.hypot(wx, wz);
    if (wl > 1e-6) { wx /= wl; wz /= wl; }
    // crouch (hold) halves your speed. Tapping crouch while running starts a slide: fast, low, and you cannot steer it.
    const crouch = !!inp.crouch;
    if (p.slideCd > 0) p.slideCd -= dt;
    if (crouch && !p.wasCrouch && p.ground && !(p.slideCd > 0) && Math.hypot(p.vx, p.vz) > P.SLIDE_MIN) { const sp = Math.hypot(p.vx, p.vz), k = Math.max(P.SLIDE_SPEED * (speedMul > 1.2 ? 1.2 : 1), sp * 1.25) / sp; p.vx *= k; p.vz *= k; p.slideT = P.SLIDE_T; p.slideCd = P.SLIDE_CD; p.slid = true; }
    p.wasCrouch = crouch; if (!crouch) p.slideT = 0;
    const sliding = p.slideT > 0; if (sliding) p.slideT -= dt;
    p.crouched = crouch;
    const max = P.SPEED * speedMul * (crouch && !sliding ? P.CROUCH_SPEED : 1);
    if (p.dashCd > 0) p.dashCd -= dt;
    if (inp.dash && p.dashCd <= 0) { const dx = wl > 1e-6 ? wx : -sin, dz = wl > 1e-6 ? wz : -cos; p.dashT = P.DASH_T; p.dashCd = P.DASH_CD / (speedMul > 1.2 ? 2 : 1); p.dvx = dx * P.DASH; p.dvz = dz * P.DASH; if (p.vy < 0) p.vy = 0; p.dashed = true; }
    if (p.dashT > 0) { p.dashT -= dt; p.vx = p.dvx; p.vz = p.dvz; }
    else if (sliding && p.ground) { const f = Math.max(0, 1 - 1.0 * dt); p.vx *= f; p.vz *= f; if (Math.hypot(p.vx, p.vz) < 4) p.slideT = 0; }
    else if (p.ground) {
      if (wl > 1e-6) { p.vx += (wx * max - p.vx) * Math.min(1, (P.ACCEL * dt) / max); p.vz += (wz * max - p.vz) * Math.min(1, (P.ACCEL * dt) / max); }
      else { const f = Math.max(0, 1 - P.FRICTION * dt); p.vx *= f; p.vz *= f; }
    } else if (wl > 1e-6) { // air control: steer, but never accelerate past run speed along the wish direction
      const along = p.vx * wx + p.vz * wz, add = Math.max(0, Math.min(P.AIR_ACCEL * dt, max - along)); p.vx += wx * add; p.vz += wz * add;
    }
    if (inp.jump) { if (p.ground) { p.vy = P.JUMP; p.jumps = 1; p.ground = false; p.jumped = 1; } else if (p.jumps < 2) { p.vy = P.JUMP * 0.95; p.jumps = 2; p.jumped = 2; } }
    p.vy -= P.G * dt; if (p.vy < -40) p.vy = -40;
    // which ramp are we standing on before moving (for launch ramps)
    const before = p.ground ? rampUnder(p.x, p.z, map) : null, onRamp = before && Math.abs(p.y - before.h) < 0.08 ? before.r : null;
    // horizontal moves with step-up. A ramp surface more than one step above your feet is a wall (its sides and high end).
    for (const axis of ['x', 'z']) {
      const d = (axis === 'x' ? p.vx : p.vz) * dt; if (!d) continue;
      const nx = axis === 'x' ? p.x + d : p.x, nz = axis === 'z' ? p.z + d : p.z, rh = rampAt(nx, nz, map);
      if (rh > p.y + P.STEP) { if (axis === 'x') p.vx = 0; else p.vz = 0; continue; }
      const hit = overlap(nx, p.y, nz, map);
      if (!hit) { p.x = nx; p.z = nz; if (rh > p.y) p.y = rh; continue; }
      const rise = hit.top - p.y;
      if (rise > 0 && rise <= P.STEP && p.vy <= 0.5 && !overlap(nx, hit.top + 0.002, nz, map)) { p.x = nx; p.z = nz; p.y = hit.top + 0.002; continue; }
      if (axis === 'x') p.vx = 0; else p.vz = 0;
    }
    // launch ramp: ran off the high end into open air while moving up the slope -> keep the upward momentum
    if (onRamp && !rampUnder(p.x, p.z, map) && !overlap(p.x, p.y - 0.08, p.z, map)) {
      const up = (onRamp.ax === 'x' ? p.vx : p.vz) * onRamp.dir, slope = (onRamp.y1 - onRamp.y0) / (onRamp.ax === 'x' ? onRamp.x1 - onRamp.x0 : onRamp.z1 - onRamp.z0);
      if (up > 1) { p.vy = Math.max(p.vy, up * slope * 1.25); p.ground = false; p.jumps = Math.min(p.jumps, 1); p.kicked = true; }
    }
    // vertical move
    const wasGround = p.ground, ny = p.y + p.vy * dt, vhit = overlap(p.x, ny, p.z, map), floorY = Math.max(0, rampAt(p.x, p.z, map));
    if (ny <= floorY) { if (!wasGround && p.vy < -9) p.landed = -p.vy; p.y = floorY; p.vy = 0; p.ground = true; p.jumps = 0; }
    else if (wasGround && p.vy <= 0 && floorY > 0 && ny - floorY < 0.45 && !vhit) { p.y = floorY; p.vy = 0; p.ground = true; } // stay glued to a slope while walking down it
    else if (vhit) { if (p.vy <= 0) { if (!wasGround && p.vy < -9) p.landed = -p.vy; p.y = vhit.top + 0.001; p.ground = true; p.jumps = 0; } else p.y = Math.max(0, vhit.under - P.H - 0.001); p.vy = 0; }
    else { p.y = ny; p.ground = false; }
    // jump pads
    if (p.ground) for (const pad of pads) if (Math.abs(p.y - pad.y) < 0.4 && Math.hypot(p.x - pad.x, p.z - pad.z) < pad.r) { p.vx = pad.v[0]; p.vy = pad.v[1]; p.vz = pad.v[2]; p.ground = false; p.jumps = 1; p.dashT = 0; p.launched = true; break; }
    // teleporters
    if (p.teleCd > 0) p.teleCd -= dt;
    else out: for (const pair of teles) for (let e = 0; e < 2; e++) { const a = pair[e], b = pair[1 - e]; if (Math.abs(p.y - a.y) < 1 && Math.hypot(p.x - a.x, p.z - a.z) < 0.95) { p.x = b.x; p.y = b.y + 0.02; p.z = b.z; p.teleCd = 1.6; p.teleported = true; break out; } }
    const lim = map.size - P.R - 0.01; p.x = Math.max(-lim, Math.min(lim, p.x)); p.z = Math.max(-lim, Math.min(lim, p.z));
  }

  // ------------------------------------------------------------------ rays
  const dirFrom = (yaw, pitch) => { const c = Math.cos(pitch); return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c]; };
  // distance along the ray to the first wall, box or the floor (Infinity if none within max)
  function rayMap(ox, oy, oz, dx, dy, dz, max = 200, map = MAP) {
    let best = max; const boxes = map.boxes, ramps = map.ramps;
    if (dy < -1e-6) { const t = -oy / dy; if (t > 0 && t < best) best = t; }
    for (let i = 0; i < boxes.length; i++) { const b = boxes[i];
      let t0 = 0, t1 = best;
      if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) continue; } else { let a = (b.x0 - ox) / dx, c = (b.x1 - ox) / dx; if (a > c) { const s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) continue; }
      if (Math.abs(dy) < 1e-9) { if (oy < b.y0 || oy > b.y1) continue; } else { let a = (b.y0 - oy) / dy, c = (b.y1 - oy) / dy; if (a > c) { const s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) continue; }
      if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) continue; } else { let a = (b.z0 - oz) / dz, c = (b.z1 - oz) / dz; if (a > c) { const s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) continue; }
      if (t0 < best) best = t0;
    }
    // ramps: the part of the footprint box that lies under the sloped surface
    for (let i = 0; i < ramps.length; i++) { const r = ramps[i];
      let t0 = 0, t1 = best, ok = true;
      for (const [o, d, lo, hi] of [[ox, dx, r.x0, r.x1], [oy, dy, r.y0, r.y1], [oz, dz, r.z0, r.z1]]) { if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } } else { let a = (lo - o) / d, c = (hi - o) / d; if (a > c) { const s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) { ok = false; break; } } }
      if (!ok) continue;
      const above = (t) => { const x = ox + dx * t, z = oz + dz * t, u = r.ax === 'x' ? (x - r.x0) / (r.x1 - r.x0) : (z - r.z0) / (r.z1 - r.z0); return oy + dy * t - (r.y0 + (r.y1 - r.y0) * (r.dir > 0 ? u : 1 - u)); };
      const f0 = above(t0), f1 = above(t1); // height above the slope is linear along the ray
      if (f0 <= 0) { if (t0 < best) best = t0; } else if (f1 < 0) { const t = t0 + (f0 / (f0 - f1)) * (t1 - t0); if (t < best) best = t; }
    }
    return best >= max ? Infinity : best;
  }
  // can a point see another point?
  function los(ax, ay, az, bx, by, bz, map = MAP) { const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz); if (d < 1e-6) return true; return rayMap(ax, ay, az, dx / d, dy / d, dz / d, d, map) === Infinity; }
  // ray vs one standing player (body cylinder approximated by a box, plus a head sphere). Returns { t, head } or null.
  function rayPlayer(ox, oy, oz, dx, dy, dz, px, py, pz, max, crouched) {
    let hit = null; const headY = crouched ? 1.0 : 1.56, top = crouched ? 0.82 : 1.36; // crouching makes you a smaller target
    { const hx = ox - px, hy = oy - (py + headY), hz = oz - pz, b = hx * dx + hy * dy + hz * dz, c = hx * hx + hy * hy + hz * hz - 0.27 * 0.27, disc = b * b - c; if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0 && t < max) hit = { t, head: true }; } }
    { const b0 = [px - 0.42, py, pz - 0.42], b1 = [px + 0.42, py + top, pz + 0.42], o = [ox, oy, oz], d = [dx, dy, dz]; let t0 = 0, t1 = max, ok = true;
      for (let i = 0; i < 3 && ok; i++) { if (Math.abs(d[i]) < 1e-9) { if (o[i] < b0[i] || o[i] > b1[i]) ok = false; } else { let a = (b0[i] - o[i]) / d[i], c = (b1[i] - o[i]) / d[i]; if (a > c) { const s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) ok = false; } }
      if (ok && t0 > 0 && (!hit || t0 < hit.t)) hit = { t: t0, head: false }; }
    return hit;
  }
  const falloff = (w, dist) => { if (!w.falloff) return 1; const [a, b, m] = w.falloff; return dist <= a ? 1 : dist >= b ? m : 1 - ((dist - a) / (b - a)) * (1 - m); };

  return { MAP, MAPS, mapById, WEAPONS, MELEE, LOADOUT, POWERS, PICKUP_INFO, P, newBody, stepPlayer, overlap, rampAt, rampUnder, dirFrom, rayMap, los, rayPlayer, falloff };
});
