// Character Brawl: one-screen platform brawler. Every character is a dumb parody with one signature move.
//
// ADDING A CHARACTER: push an entry onto CHARACTERS below with
//   { id, name, move, accent, speed, jump, cooldown, special(f, world, pressedWhileAirborne) }
// `special` runs on the server when the player presses K / right-click and the cooldown is ready.
// `world` exposes: fighters (Map), others(f), blocks, projectiles, portals, hit(target, attacker, dmg, kb, dirX, dirY), emit(ev).
// Then add a matching draw function with the same id in public/games/brawl.js (client picks a fallback box if missing).

const W = 900, H = 600;
const GRAV = 1800, RUN = 260, AIR = 0.7, JUMPV = 620, FW = 28, FH = 40;
const KILL_Y = 700, KILL_X = 120;
const STOCKS = 3;

const PLATFORMS = [
  { x: 150, y: 460, w: 600, h: 24, solid: true },
  { x: 200, y: 340, w: 150, h: 10 },
  { x: 550, y: 340, w: 150, h: 10 },
  { x: 375, y: 230, w: 150, h: 10 },
];
const SPAWN = { x: 400, y: 110, w: 100, h: 10 }; // one-way floating spawn platform (always present)

const CHARACTERS = [
  { id: 'steve', name: 'Blocky Steve', move: 'Place a dirt block (6s, max 3)', accent: '#7a5230', speed: 1, jump: 1, cooldown: 1.5,
    special(f, w) {
      const mine = w.blocks.filter((b) => b.owner === f.id && b.kind === 'dirt');
      if (mine.length >= 3) w.blocks.splice(w.blocks.indexOf(mine[0]), 1);
      const bx = Math.round((f.x + f.face * 40) / 40) * 40 - 20, by = Math.round(f.y / 40) * 40 - 40;
      w.blocks.push({ x: bx, y: by, w: 40, h: 40, kind: 'dirt', owner: f.id, ttl: 6, solid: true });
      return true;
    } },
  { id: 'plumber', name: 'Red Plumber', move: 'Ground pound (airborne): shockwave 90px', accent: '#e03a3a', speed: 1.05, jump: 1.1, cooldown: 3,
    special(f, w) {
      if (f.ground) return false;
      f.pound = true; f.vx = 0; f.vy = 900; f.noCtl = 1.5;
      return true;
    } },
  { id: 'dancer', name: 'Default Dance Guy', move: 'Build a ramp / glide in the air', accent: '#9aa3b2', speed: 1.05, jump: 1, cooldown: 2,
    special(f, w) {
      if (!f.ground) { f.glide = 1.5; return true; }
      const mine = w.blocks.filter((b) => b.owner === f.id && b.kind === 'ramp');
      if (mine.length >= 2) w.blocks.splice(w.blocks.indexOf(mine[0]), 1);
      w.blocks.push({ x: f.face > 0 ? f.x + 20 : f.x - 80, y: f.y - 60, w: 60, h: 60, kind: 'ramp', dir: f.face, owner: f.id, ttl: 8 });
      return true;
    } },
  { id: 'egg', name: 'Egg Soldier', move: 'Lob an egg (7%)', accent: '#f3eccf', speed: 1, jump: 1, cooldown: 1,
    special(f, w) {
      w.projectiles.push({ x: f.x + f.face * 22, y: f.y - 24, vx: f.face * 520, vy: -120, kind: 'egg', owner: f.id, dmg: 7, kb: 260, g: 0.4, ttl: 3 });
      return true;
    } },
  { id: 'ogre', name: 'The Ogre', move: 'Roar: shove everyone within 140px', accent: '#6fbf3a', speed: 0.9, jump: 0.95, cooldown: 4,
    special(f, w) {
      for (const o of w.others(f)) {
        const dx = o.x - f.x, dy = (o.y - 10) - (f.y - 10), d = Math.hypot(dx, dy);
        if (d < 140) w.hit(o, f, 6, 420, dx / (d || 1), -0.5 + dy / (d || 1) * 0.3);
      }
      f.slow = 1; w.emit({ type: 'roar', x: f.x, y: f.y - 20 });
      return true;
    } },
  { id: 'crew', name: 'Among Crewmate', move: 'Vent behind the nearest player; next hit ×2', accent: '#e34c4c', speed: 1, jump: 1, cooldown: 5,
    special(f, w) {
      let best = null, bd = 1e9;
      for (const o of w.others(f)) { const d = Math.hypot(o.x - f.x, o.y - f.y); if (d < bd) { bd = d; best = o; } }
      if (!best) return false;
      w.emit({ type: 'vent', x: f.x, y: f.y - 20 });
      f.x = best.x - best.face * 36; f.y = best.y; f.vx = 0; f.vy = 0; f.face = best.face; f.sus = 1.5;
      w.emit({ type: 'vent', x: f.x, y: f.y - 20 });
      return true;
    } },
  { id: 'cart', name: 'Cart Kid', move: 'Cart charge (10%)', accent: '#c9c9c9', speed: 1, jump: 1, cooldown: 3,
    special(f, w) { f.charge = 0.5; f.chargeHit = new Set(); f.vx = f.face * 600; return true; } },
  { id: 'portal', name: 'Portal Tester', move: 'Shoot portals; walk through one to pop out the other', accent: '#ff8c1a', speed: 1, jump: 1, cooldown: 1,
    special(f, w) {
      // raycast along facing until a platform or max range
      let px = f.x, py = f.y - 20, hitP = false;
      for (let i = 0; i < 300; i += 6) {
        const tx = f.x + f.face * i;
        if (w.surfaces().some((p) => tx >= p.x && tx <= p.x + p.w && py >= p.y && py <= p.y + p.h)) { hitP = true; break; }
        px = tx;
      }
      const mine = w.portals.filter((p) => p.owner === f.id);
      const slot = mine.length === 0 ? 'A' : mine.length === 1 ? 'B' : null;
      if (!slot) { w.portals.splice(w.portals.indexOf(mine[0]), 1); mine.shift(); }
      w.portals.push({ x: px, y: py, owner: f.id, slot: slot || 'A', ttl: 10, color: (mine.length === 0 ? 'orange' : 'blue') });
      // keep slot labels consistent: first remaining is A, second is B
      w.portals.filter((p) => p.owner === f.id).forEach((p, i) => { p.slot = i === 0 ? 'A' : 'B'; p.color = i === 0 ? 'orange' : 'blue'; });
      void hitP;
      return true;
    } },
];
const charById = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

module.exports = {
  id: 'brawl',
  name: 'Character Brawl',
  tagline: 'Smash-style brawl. Dumb parody characters, one signature move each.',
  min: 2, max: 8,
  controls: 'A/D or arrows move, W/Space jump (double jump), S drop/fast-fall, J or click attack, K or right-click = signature move.',
  create(api) {
    const fast = !!api.memory.__fast; // test hook: short select + short match
    const SELECT_T = fast ? 1 : 12, MATCH_T = fast ? 10 : 180;
    const fighters = new Map();
    const blocks = [], projectiles = [], portals = [];
    let phase = 'select', t = 0, over = false, events = [];
    const placement = []; // eliminated order
    const kos = {};

    api.players().forEach((p, i) => {
      fighters.set(p.id, mk(p.id, i));
    });
    function mk(id, i) {
      return { id, x: 200 + (i % 8) * 70, y: 460, vx: 0, vy: 0, face: 1, dmg: 0, stocks: STOCKS, char: null,
        ctl: {}, prev: {}, ground: false, airJumps: 1, hit: 0, inv: 0, cd: 0, atk: 0, atkHit: null, dead: 0, alive: true,
        noCtl: 0, slow: 0, sus: 0, glide: 0, charge: 0, pound: false, portalCd: 0, anim: 0, kills: 0, dropT: 0 };
    }
    const alive = () => [...fighters.values()].filter((f) => f.alive);
    const others = (f) => alive().filter((o) => o !== f && o.dead <= 0);
    const emit = (e) => events.push(e);
    const surfaces = () => [...PLATFORMS, SPAWN, ...blocks.filter((b) => b.kind === 'dirt')];

    function hit(target, attacker, dmg, kb, dx, dy) {
      if (target.inv > 0 || target.dead > 0) return;
      let mult = 1;
      if (attacker && attacker.sus > 0) { mult = 2; attacker.sus = 0; }
      target.dmg += dmg;
      const k = (kb + target.dmg * 9) * mult;
      const d = Math.hypot(dx, dy) || 1;
      target.vx = (dx / d) * k; target.vy = (dy / d) * k - 120;
      target.hit = 0.1 + k * 0.0006;
      target.lastHitBy = attacker ? attacker.id : null; target.lastHitT = 4;
      target.pound = false; target.charge = 0; target.glide = 0;
      emit({ type: 'hit', x: Math.round(target.x), y: Math.round(target.y - 20), k: Math.round(k), id: target.id });
    }
    const world = { fighters, others, blocks, projectiles, portals, hit, emit, surfaces };

    function ko(f) {
      f.stocks--; f.dmg = 0; f.vx = 0; f.vy = 0; f.hit = 0; f.pound = false; f.charge = 0; f.glide = 0;
      const by = f.lastHitT > 0 ? f.lastHitBy : null;
      if (by && fighters.get(by)) { fighters.get(by).kills++; kos[by] = (kos[by] || 0) + 1; }
      emit({ type: 'ko', id: f.id, by });
      if (f.stocks <= 0) { f.alive = false; placement.push(f.id); f.x = -999; f.y = -999; }
      else { f.dead = 2; f.x = -999; f.y = -999; }
    }

    function finish(reason) {
      if (over) return; over = true; phase = 'over';
      const rank = alive().sort((a, b) => b.stocks - a.stocks || a.dmg - b.dmg).map((f) => f.id).concat(placement.slice().reverse());
      const n = api.players().length, pts = {};
      rank.forEach((id, i) => { pts[id] = Math.max(1, n - i) + (kos[id] || 0); });
      const w = api.player(rank[0]);
      api.emit('g:event', { type: 'over', winner: rank[0] });
      api.after(fast ? 10 : 3000, () => api.end(pts, w ? `${w.name} wins the brawl (${reason}). Points: placement + 1 per KO.` : 'Nobody won.'));
    }

    function startMatch() {
      phase = 'fight'; t = 0;
      const list = alive(); let i = 0;
      for (const f of list) { if (!f.char) f.char = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id; f.x = 200 + (i++ / Math.max(1, list.length - 1)) * 500; f.y = 460; f.inv = 1; }
      if (list.length <= 1) finish('everyone else left');
    }

    function moveFighter(f, dt) {
      const c = charById[f.char] || CHARACTERS[0];
      const ctl = f.ctl, prev = f.prev;
      const press = (k) => ctl[k] && !prev[k];
      const canCtl = f.hit <= 0 && f.noCtl <= 0 && f.charge <= 0 && !f.pound;
      // timers
      for (const k of ['hit', 'inv', 'cd', 'atk', 'noCtl', 'slow', 'sus', 'glide', 'charge', 'portalCd', 'lastHitT', 'dropT']) if (f[k] > 0) f[k] -= dt;
      f.anim += dt;
      const spd = RUN * c.speed * (f.slow > 0 ? 0.5 : 1);
      if (canCtl) {
        let want = 0;
        if (ctl.left) want -= 1; if (ctl.right) want += 1;
        if (want) f.face = want;
        const target = want * spd;
        const accel = f.ground ? 14 : 14 * AIR;
        f.vx += (target - f.vx) * Math.min(1, accel * dt);
        if (press('jump')) {
          if (f.ground) { f.vy = -JUMPV * c.jump; f.ground = false; }
          else if (f.airJumps > 0) { f.airJumps--; f.vy = -JUMPV * c.jump * 0.92; }
        }
        if (press('attack') && f.atk <= 0) { f.atk = 0.25; f.atkHit = new Set(); f.atkHitActive = true; }
        if (press('special') && f.cd <= 0) { if (c.special(f, world, !f.ground)) f.cd = c.cooldown; emit({ type: 'special', id: f.id, char: f.char }); }
        if (press('down') && f.ground && f.onOneWay) f.dropT = 0.25;
      } else if (f.ground && f.hit > 0) { f.vx *= Math.pow(0.02, dt); }
      // gravity
      let g = GRAV;
      if (ctl.down && f.vy > 0 && canCtl) g *= 1.8;
      if (!f.pound) f.vy += g * dt;
      if (f.glide > 0 && f.vy > 80) f.vy = 80;
      if (f.charge > 0) { f.vx = f.face * 600; f.vy = Math.min(f.vy, 0); }
      if (f.pound) f.vy = 900;
      // integrate + collide (2 substeps)
      for (let s = 0; s < 2; s++) {
        const h = dt / 2;
        f.x += f.vx * h;
        const oldY = f.y;
        f.y += f.vy * h;
        f.ground = false; f.onOneWay = false;
        const surf = [...PLATFORMS, SPAWN, ...blocks];
        for (const p of surf) {
          const left = f.x - FW / 2, right = f.x + FW / 2;
          if (right <= p.x || left >= p.x + p.w) continue;
          if (p.kind === 'ramp') {
            // one-way diagonal: surface y = p.y + p.h - frac*p.h where frac along dir
            const frac = Math.max(0, Math.min(1, p.dir > 0 ? (f.x - p.x) / p.w : (p.x + p.w - f.x) / p.w));
            const sy = p.y + p.h - frac * p.h;
            if (f.vy >= 0 && oldY <= sy + 6 && f.y >= sy && f.dropT <= 0) { f.y = sy; f.vy = 0; f.ground = true; f.onOneWay = true; }
            continue;
          }
          if (p.solid) {
            // solid block: resolve top first, then sides/bottom
            if (f.vy >= 0 && oldY <= p.y + 1 && f.y >= p.y) { f.y = p.y; f.vy = 0; f.ground = true; }
            else if (f.y > p.y && oldY - FH < p.y + p.h && f.y - FH < p.y + p.h) {
              // overlapping body: push sideways or down
              const bodyTop = f.y - FH, bodyBot = f.y;
              if (bodyTop < p.y + p.h && bodyBot > p.y) {
                if (f.vy < 0 && bodyTop < p.y + p.h && oldY - FH >= p.y + p.h - 2) { f.y = p.y + p.h + FH; f.vy = 0; }
                else { const cx = p.x + p.w / 2; if (f.x < cx) f.x = p.x - FW / 2; else f.x = p.x + p.w + FW / 2; if (Math.abs(f.vx) > 50) f.vx = 0; }
              }
            }
          } else {
            if (f.vy >= 0 && oldY <= p.y + 1 && f.y >= p.y && f.dropT <= 0) { f.y = p.y; f.vy = 0; f.ground = true; f.onOneWay = true; }
          }
        }
      }
      if (f.ground) { f.airJumps = 1; if (f.charge > 0 && Math.abs(f.vx) < 1) f.charge = 0; }
      if (f.pound && f.ground) {
        f.pound = false; f.noCtl = 0.3;
        emit({ type: 'pound', x: Math.round(f.x), y: Math.round(f.y) });
        for (const o of others(f)) { if (Math.abs(o.x - f.x) < 90 && Math.abs(o.y - f.y) < 40) hit(o, f, 12, 340, Math.sign(o.x - f.x) || 1, -0.8); }
      }
      // melee hitbox
      if (f.atk > 0 && f.atkHit) {
        const hx = f.x + f.face * 24, hy = f.y - 24;
        for (const o of others(f)) {
          if (f.atkHit.has(o.id)) continue;
          if (Math.abs(o.x - hx) < 20 + FW / 2 && Math.abs((o.y - FH / 2) - hy) < 15 + FH / 2) { f.atkHit.add(o.id); hit(o, f, 8, 220, f.face, -0.6); }
        }
      }
      if (f.charge > 0) {
        for (const o of others(f)) { if (!f.chargeHit.has(o.id) && Math.abs(o.x - f.x) < FW && Math.abs(o.y - f.y) < FH) { f.chargeHit.add(o.id); hit(o, f, 10, 380, f.face, -0.5); } }
      }
      // portals
      if (f.portalCd <= 0) {
        for (const p of portals) {
          if (Math.hypot(p.x - f.x, p.y - (f.y - 20)) < 26) {
            const mine = portals.filter((q) => q.owner === p.owner);
            const other = mine.find((q) => q !== p);
            if (other) { f.x = other.x; f.y = other.y + 20; f.portalCd = 0.5; emit({ type: 'warp', x: Math.round(f.x), y: Math.round(f.y - 20) }); }
            break;
          }
        }
      }
      // death
      if (f.y > KILL_Y || f.x < -KILL_X || f.x > W + KILL_X || f.y < -250) ko(f);
    }

    function tickFight(dt) {
      for (const f of alive()) {
        if (f.dead > 0) {
          f.dead -= dt;
          if (f.dead <= 0) { f.x = SPAWN.x + SPAWN.w / 2; f.y = SPAWN.y; f.vx = 0; f.vy = 0; f.inv = 2; f.airJumps = 1; f.ground = false; f.ctl = { ...f.ctl }; }
          continue;
        }
        moveFighter(f, dt);
        f.prev = { ...f.ctl };
      }
      // projectiles
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.vy += GRAV * (p.g || 1) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.ttl -= dt;
        let gone = p.ttl <= 0 || p.y > KILL_Y || p.x < -50 || p.x > W + 50;
        if (!gone && surfaces().some((s) => p.x > s.x && p.x < s.x + s.w && p.y > s.y && p.y < s.y + s.h)) gone = true;
        if (!gone) for (const o of alive()) {
          if (o.id === p.owner || o.dead > 0) continue;
          if (Math.abs(o.x - p.x) < FW / 2 + 8 && p.y > o.y - FH - 8 && p.y < o.y + 8) { hit(o, fighters.get(p.owner), p.dmg, p.kb, Math.sign(p.vx) || 1, -0.6); gone = true; break; }
        }
        if (gone) { emit({ type: 'splat', x: Math.round(p.x), y: Math.round(p.y) }); projectiles.splice(i, 1); }
      }
      for (let i = blocks.length - 1; i >= 0; i--) { blocks[i].ttl -= dt; if (blocks[i].ttl <= 0) blocks.splice(i, 1); }
      for (let i = portals.length - 1; i >= 0; i--) { portals[i].ttl -= dt; if (portals[i].ttl <= 0) portals.splice(i, 1); }
      const a = alive();
      if (a.length <= 1) finish(a.length ? 'last one standing' : 'draw');
      else if (t >= MATCH_T) finish('time up');
    }

    function snap() {
      return {
        phase, t: Math.round(t * 10) / 10, selectT: Math.max(0, SELECT_T - t), matchT: Math.max(0, MATCH_T - t),
        fighters: [...fighters.values()].map((f) => ({ id: f.id, x: Math.round(f.x), y: Math.round(f.y), vx: Math.round(f.vx), vy: Math.round(f.vy), face: f.face, dmg: Math.round(f.dmg), stocks: f.stocks, char: f.char, hit: f.hit > 0 ? 1 : 0, inv: f.inv > 0 ? 1 : 0, anim: Math.round(f.anim * 10), atk: f.atk > 0 ? 1 : 0, dead: f.dead > 0 ? 1 : 0, alive: f.alive, cd: Math.round(Math.max(0, f.cd) * 10) / 10, ground: f.ground ? 1 : 0, glide: f.glide > 0 ? 1 : 0, charge: f.charge > 0 ? 1 : 0, sus: f.sus > 0 ? 1 : 0 })),
        projectiles: projectiles.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), kind: p.kind })),
        blocks: blocks.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), w: b.w, h: b.h, kind: b.kind, dir: b.dir || 1, owner: b.owner })),
        portals: portals.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), color: p.color, owner: p.owner })),
        events,
      };
    }

    return {
      onInput(pid, msg) {
        const f = fighters.get(pid);
        if (!f || over) return;
        if (msg.type === 'pick' && phase === 'select' && charById[msg.char]) f.char = msg.char;
        if (msg.type === 'ctl' && typeof msg === 'object') {
          f.ctl = { left: !!msg.left, right: !!msg.right, jump: !!msg.jump, down: !!msg.down, attack: !!msg.attack, special: !!msg.special };
        }
      },
      onLeave(pid) {
        const f = fighters.get(pid);
        if (!f) return;
        if (f.alive) { f.alive = false; placement.push(pid); }
        fighters.delete(pid);
        if (phase === 'fight' && alive().length <= 1) finish('everyone else left');
      },
      tick(dt) {
        if (over) { api.emit('g:state', snap()); events = []; return; }
        t += dt;
        if (phase === 'select') { if (t >= SELECT_T) startMatch(); }
        else tickFight(dt);
        api.emit('g:state', snap());
        events = [];
      },
      destroy() {},
    };
  },
  CHARACTERS,
};
