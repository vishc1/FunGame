// Toy Box Blasters: first-person foam-dart arena (Shell Shockers shape, toy figures instead of eggs).
// Everyone spawns with a sidearm; better weapons, health, armour and power-ups are picked up off the map.
//
// Networking model (chosen for feel among friends, not for anti-cheat):
//   - Movement is simulated by each client and reported with { type:'p' }. The server only sanity-checks it.
//   - Hitscan hits are decided by the shooter's client (what you see is what you hit) and reported in { type:'fire' }.
//     The server enforces fire rate, ammo, range and damage.
//   - Rockets, pickups, health, scoring and respawns are fully server-side.
// The map, physics and weapon table live in public/games/blasters.shared.js so the server, bots and browser agree.
// Testing: api.memory.__fast = seconds shortens the match.
const B = require('../../public/games/blasters.shared.js');
const { WEAPONS, MELEE, LOADOUT, POWERS, P } = B;
const NONE = () => WEAPONS.map((w, i) => i === 0); // which blasters a fresh player owns: only the sidearm
const MATCH = 180, NEXT_IN = 6, KILL_GOAL = 20, RESPAWN = 2.5, POWER_EVERY = 40, POWER_WARN = 6, DROP_LIFE = 14;
const r2 = (v) => Math.round(v * 100) / 100;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

module.exports = {
  id: 'blasters',
  name: 'Toy Box Blasters',
  tagline: 'First-person foam-dart arena. Nine blasters including a cannon, a foam sword, loadouts, crouch, slide and aim.',
  min: 2, max: 16, // 16 so a party can split into two teams of eight
  controls: 'Click the game to capture the mouse. WASD move, Space jump (twice), Shift dash, C crouch (tap while running to slide), click fire, right-click aim, E sword, Q or G drop blaster, R reload, 1-9 or wheel switch, Tab scores, H guide, L locker and settings.',
  create(api) {
    const MAP = B.mapById(api.memory.blastersMap) || B.MAP; // picked in the lobby; everything below is per-map
    // Team mode (lobby switch): two teams, no friendly fire, each team spawns on its own side, first team to the goal wins.
    const LOOP = api.memory.blastersRounds !== 'one'; // back-to-back rounds on the same map (lobby option), until the host ends the game
    let round = 1;
    const TEAMS = api.memory.blastersMode === 'teams', TEAM_NAMES = ['Red', 'Blue'], tk = [0, 0];
    const TEAM_GOAL = Math.max(20, 8 * Math.ceil(api.players().length / 2));
    const players = new Map();
    const pick = MAP.pickups.map((p) => ({ def: p, t: p.kind === 'power' ? POWER_EVERY * 0.5 : 0, kind: null }));
    const drops = [], rockets = [];
    const fast = api.memory.__fast;
    let t = 0, left = fast ? (typeof fast === 'number' ? fast : 20) : MATCH, over = false, firstBlood = false, seq = 0;
    // the toy train: counts down, warns, then crosses the map along the middle road
    const TR = MAP.train, train = { wait: TR.every * 0.5, x: null, dir: 1, warned: false, hit: new Set() };

    function addPlayer(id) {
      const p = { id, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, hp: 100, armor: 0, w: 0, own: NONE(), mag: WEAPONS.map((w) => w.mag), res: WEAPONS.map((w) => w.reserve),
        dead: 0, prot: 0, kills: 0, deaths: 0, score: 0, streak: 0, best: 0, heads: 0, dmg: 0, lastKiller: null, hurtBy: new Map(), power: null, powerT: 0, nextFire: 0, nextMelee: 0, cr: 0, lo: 0, bornT: 0, reloadT: 0, lvl: 1, ch: players.size % 8, sk: 0, lastKillT: -99, multi: 0 };
      if (TEAMS) { const n = [0, 0]; for (const o of players.values()) n[o.team]++; p.team = n[0] <= n[1] ? 0 : 1; } // join the smaller team
      players.set(id, p); spawn(p); return p;
    }
    function spawn(p) {
      let best = MAP.spawns[0], bd = -1;
      const side = TEAMS ? MAP.spawns.filter((s) => (p.team === 0 ? s.z < 0 : s.z > 0)) : []; // Red spawns north, Blue south
      // a random one of the three spawns farthest from everyone else: never the same corner every match, never on top of someone
      const ranked = (side.length ? side : MAP.spawns).map((s) => { let d = 1e9; for (const o of players.values()) if (o !== p && !o.dead) d = Math.min(d, Math.hypot(o.x - s.x, o.z - s.z)); return { s, d }; }).sort((a, b) => b.d - a.d);
      const pool = ranked.filter((r, i) => (i < 3 && (r.d > 8 || i === 0)) || r.d === ranked[0].d); best = pool[Math.floor(Math.random() * pool.length)].s; bd = 0;
      { const taken = (x, z) => [...players.values()].some((o) => o !== p && !o.dead && Math.hypot(o.x - x, o.z - z) < 1.6); if (taken(best.x, best.z)) for (const r of [2.5, 4.5]) { let found = false; for (let i = 0; i < 8 && !found; i++) { const a = (i / 8) * Math.PI * 2, x = best.x + Math.cos(a) * r, z = best.z + Math.sin(a) * r; if (Math.abs(x) < MAP.size - 1 && Math.abs(z) < MAP.size - 1 && !B.overlap(x, 0.01, z, MAP) && B.rampAt(x, z, MAP) < 0 && !taken(x, z)) { best = { x, z, yaw: best.yaw }; found = true; } } if (found) break; } } /* more players than spawn points: step to a free spot nearby */ // all tie when nobody else is in yet: any spot then
      Object.assign(p, { x: best.x, y: 0, z: best.z, yaw: best.yaw, pitch: 0, hp: 100, armor: 0, w: 0, own: NONE(), mag: WEAPONS.map((w) => w.mag), res: WEAPONS.map((w) => w.reserve), dead: 0, prot: 2.5, power: null, powerT: 0, reloadT: 0, nextFire: 0, streak: 0 });
      p.hurtBy.clear(); p.bornT = t; starter(p);
      api.emit('g:event', { type: 'spawn', id: p.id, x: p.x, y: p.y, z: p.z, yaw: r2(p.yaw) });
    }
    for (const pl of api.players()) addPlayer(pl.id);
    if (TEAMS) { let i = 0; const hum = api.players().filter((q) => !q.bot), bots = api.players().filter((q) => q.bot); for (const q of hum.concat(bots)) { players.get(q.id).team = i++ % 2; } for (const p of players.values()) spawn(p); } // alternate humans first, then bots, so both halves are even

    // loadout: the starter blaster chosen in the locker, with half the usual spare darts
    function starter(p) { const w = p.lo; if (!w || p.own[w]) return; p.own[w] = true; p.mag[w] = WEAPONS[w].mag; p.res[w] = Math.round(WEAPONS[w].reserve / 2); }
    // take a blaster off the floor with exactly the darts that were left in it
    function takeDrop(p, dr) { const def = WEAPONS[dr.w]; if (dr.ammo == null) return give(p, dr.w, 0.6); if (!p.own[dr.w]) { p.own[dr.w] = true; p.mag[dr.w] = Math.min(def.mag, dr.ammo); p.res[dr.w] = dr.ammo - p.mag[dr.w]; } else p.res[dr.w] = Math.min(def.reserve * 2, p.res[dr.w] + dr.ammo); }
    function give(p, w, ammoScale = 1) {
      const def = WEAPONS[w]; const had = p.own[w]; p.own[w] = true;
      if (!had) { p.mag[w] = def.mag; p.res[w] = Math.round(def.reserve * ammoScale); } else p.res[w] = Math.min(def.reserve * 2, p.res[w] + Math.round((def.reserve + def.mag) * ammoScale));
      return had;
    }
    function hurt(v, amount, byId, weapon, head, from) {
      if (v.dead || v.away || v.prot > 0 || over) return 0;
      const by = players.get(byId);
      if (TEAMS && by && by !== v && by.team === v.team) return 0; // no friendly fire
      if (by && by !== v && by.power === 'shadow') amount = 999; // Shadow Ninja: one-tap
      if (by && by !== v && by.power === 'mega') amount *= 2;
      amount = Math.max(1, Math.round(amount));
      const soak = Math.min(v.armor, Math.round(amount * 0.5)); v.armor -= soak; v.hp -= amount - soak;
      if (by && by !== v && by.power === 'vamp' && !by.dead) by.hp = Math.min(150, by.hp + amount); // Vampire Darts
      if (by && by !== v) { by.dmg += amount; const h = v.hurtBy.get(byId) || { n: 0, t: 0 }; h.n += amount; h.t = t; v.hurtBy.set(byId, h); }
      const dead = v.hp <= 0;
      if (by && by !== v) api.to(byId, 'g:event', { type: 'dmg', v: v.id, n: amount, head: head ? 1 : 0, kill: dead ? 1 : 0, x: r2(v.x), y: r2(v.y + 1.3), z: r2(v.z) });
      api.to(v.id, 'g:event', { type: 'hurt', n: amount, x: from ? r2(from.x) : r2(v.x), z: from ? r2(from.z) : r2(v.z) });
      if (dead) kill(v, by && by !== v ? by : null, weapon, head, by === v);
      return amount;
    }
    function kill(v, by, weapon, head, self) {
      const tags = [];
      if (by) {
        by.kills++; by.streak++; by.best = Math.max(by.best, by.streak); by.score += 100; if (head) { by.heads++; by.score += 25; tags.push('headshot'); }
        if (weapon === MELEE.name) { by.score += 50; tags.push('bonk'); }
        if (!firstBlood) { firstBlood = true; by.score += 50; tags.push('first'); }
        if (by.lastKiller === v.id) { by.score += 25; by.lastKiller = null; tags.push('revenge'); }
        if (v.streak >= 3) { by.score += 50; tags.push('shutdown'); }
        by.multi = t - by.lastKillT < 4 ? by.multi + 1 : 1; by.lastKillT = t;
        if (by.multi === 2) tags.push('double'); else if (by.multi === 3) tags.push('triple'); else if (by.multi >= 4) tags.push('rampage');
        if (by.streak === 3 || by.streak === 5 || by.streak === 8 || by.streak === 12) tags.push('streak');
        v.lastKiller = by.id;
        for (const [oid, h] of v.hurtBy) { const o = players.get(oid); if (o && o !== by && h.n >= 30 && t - h.t < 6) { o.score += 50; api.to(oid, 'g:event', { type: 'assist', v: v.id }); } }
      } else if (self) { v.score = Math.max(0, v.score - 50); }
      // the victim drops their best pickup weapon so someone can grab it
      let bw = 0; for (const i of [8, 4, 3, 6, 5, 2, 7, 1]) if (v.own[i] && v.mag[i] + v.res[i] > 0) { bw = i; break; }
      if (bw) drops.push({ id: ++seq, w: bw, x: v.x, y: v.y, z: v.z, t: DROP_LIFE });
      v.deaths++; v.dead = RESPAWN; v.hp = 0; v.power = null; v.powerT = 0; v.reloadT = 0;
      api.emit('g:event', { type: 'kill', k: by ? by.id : null, v: v.id, w: weapon, head: head ? 1 : 0, streak: by ? by.streak : 0, ended: v.streak, tags, x: r2(v.x), y: r2(v.y), z: r2(v.z) });
      v.streak = 0;
      if (TEAMS && by) { tk[by.team]++; if (tk[by.team] >= TEAM_GOAL) finish(); }
      else if (by && by.kills >= KILL_GOAL) finish();
    }
    function explode(x, y, z, ownerId, direct, w = 4) {
      const def = WEAPONS[w];
      api.emit('g:event', { type: 'explode', x: r2(x), y: r2(y), z: r2(z), r: def.radius, o: ownerId, w });
      for (const v of [...players.values()]) {
        if (v.dead) continue;
        const d = Math.hypot(v.x - x, v.y + 0.9 - y, v.z - z); if (d > def.radius && v !== direct) continue;
        let amt = v === direct ? def.dmg : def.splash * Math.pow(Math.max(0, 1 - d / def.radius), 0.8);
        if (v.id === ownerId) amt *= 0.45;
        if (amt >= 1) hurt(v, amt, ownerId, def.name, false, { x, z });
      }
    }
    // the next round, same map and same players: scores reset, everyone respawns, pickups and the train start over
    function newRound() {
      round++; over = false; celebT = 0; winnerId = null; t = 0; left = fast ? (typeof fast === 'number' ? fast : 20) : MATCH; firstBlood = false; tk[0] = tk[1] = 0;
      drops.length = 0; rockets.length = 0; for (const k of pick) { k.t = k.def.kind === 'power' ? POWER_EVERY * 0.5 : 0; k.kind = null; }
      train.wait = TR.every * 0.5; train.x = null; train.warned = false;
      for (const p of players.values()) { Object.assign(p, { kills: 0, deaths: 0, score: 0, streak: 0, best: 0, heads: 0, dmg: 0, rares: 0, lastKiller: null, multi: 0, lastKillT: -99 }); spawn(p); }
      api.emit('g:event', { type: 'round', round });
    }
    const PARTY = 5; let winnerId = null, celebT = 0; // victory lap: after the end, only the winner moves and everyone else watches them
    function sendState() {
        const pw = pick[0];
      api.emit('g:state', {
        t: Math.ceil(left), win: over ? winnerId : undefined, goal: TEAMS ? TEAM_GOAL : KILL_GOAL, map: MAP.id, tm: TEAMS ? 1 : 0, tk: TEAMS ? tk : undefined,
        ps: [...players.values()].map((p) => ({ id: p.id, x: r2(p.x), y: r2(p.y), z: r2(p.z), yw: r2(p.yaw), pt: r2(p.pitch), hp: Math.ceil(p.hp), ar: Math.round(p.armor), w: p.w, m: p.mag[p.w], r: p.res[p.w] === Infinity ? -1 : p.res[p.w], own: p.own.reduce((a, v, i) => a | (v ? 1 << i : 0), 0), rl: p.reloadT > 0 ? 1 : 0, dead: p.dead > 0 ? r2(p.dead) : 0, prot: p.prot > 0 ? 1 : 0, k: p.kills, d: p.deaths, sc: p.score, st: p.streak, pw: p.power || 0, pwt: p.powerT > 0 ? Math.ceil(p.powerT) : 0, lvl: p.lvl, ch: p.ch, sk: p.sk, cr: p.cr, tm: TEAMS ? p.team : undefined, aw: p.away ? 1 : undefined })),
        pk: pick.map((k) => (k.t > 0 ? 0 : 1)), pw: { kind: pw.kind || 0, up: pw.t <= 0 ? 1 : 0, in: Math.max(0, Math.ceil(pw.t)) },
        dr: drops.map((d) => ({ id: d.id, w: d.w, x: r2(d.x), y: r2(d.y), z: r2(d.z) })), rk: rockets.map((k) => ({ id: k.id, w: k.w, x: r2(k.x), y: r2(k.y), z: r2(k.z) })),
        tr: train.x === null ? null : [r2(train.x), train.dir],
      });
    }
    function finish() {
      if (over) return; over = true;
      const list = [...players.values()].sort((a, b) => b.kills - a.kills || b.score - a.score);
      { const wt0 = TEAMS ? (tk[0] === tk[1] ? -1 : tk[0] > tk[1] ? 0 : 1) : -1; const champ = TEAMS && wt0 >= 0 ? list.find((p) => p.team === wt0) : list[0]; winnerId = champ ? champ.id : null; celebT = PARTY; }
      const pts = {}; list.forEach((p, i) => { pts[p.id] = Math.max(1, list.length - i) + Math.floor(p.kills / 4); });
      const nm = (p) => (api.player(p.id) || { name: '?' }).name;
      const top = (f) => list.slice().sort((a, b) => f(b) - f(a))[0];
      const awards = []; if (list.length) { const a = top((p) => p.heads), b = top((p) => p.best), c = top((p) => p.dmg); if (a.heads) awards.push(['Sharpshooter', a.id, a.heads + ' headshots']); if (b.best >= 2) awards.push(['On a roll', b.id, b.best + ' in a row']); if (c.dmg) awards.push(['Heavy hitter', c.id, c.dmg + ' damage']); const d = top((p) => p.rares || 0); if (d.rares) awards.push(['Lucky', d.id, d.rares + ' rare power-up' + (d.rares > 1 ? 's' : '')]); }
      if (TEAMS) { // winning team: everyone on it gets a bonus, and the match summary is about the teams
        const wt = tk[0] === tk[1] ? -1 : tk[0] > tk[1] ? 0 : 1;
        for (const p of list) if (p.team === wt) pts[p.id] += 3;
        api.emit('g:event', { type: 'over', next: LOOP ? NEXT_IN : 0, round, party: PARTY, champ: winnerId, winner: list[0] ? list[0].id : null, team: wt, tk, awards, scores: list.map((p) => ({ id: p.id, sc: p.score, k: p.kills, tm: p.team })) });
        api.after(NEXT_IN * 1000, () => LOOP && players.size >= 2 ? newRound() : api.end(pts, wt < 0 ? `It's a draw, ${tk[0]} tags each.` : `${TEAM_NAMES[wt]} team wins ${tk[wt]} to ${tk[1 - wt]}.${list[0] ? ` Top tagger: ${nm(list[0])} with ${list[0].kills}.` : ''}`));
        return;
      }
      api.emit('g:event', { type: 'over', next: LOOP ? NEXT_IN : 0, round, party: PARTY, champ: winnerId, winner: list[0] ? list[0].id : null, awards, scores: list.map((p) => ({ id: p.id, sc: p.score, k: p.kills })) });
      const w = list[0];
      api.after(NEXT_IN * 1000, () => LOOP && players.size >= 2 ? newRound() : api.end(pts, w ? `${nm(w)} wins with ${w.kills} tags.${awards.length ? ' ' + awards.map(([n, id, d]) => `${n}: ${(api.player(id) || { name: '?' }).name} (${d})`).join('. ') + '.' : ''}` : 'Nobody played.'));
    }

    return {
      onJoin(pid) { if (!players.has(pid)) addPlayer(pid); },
      onRejoin(pid) { const p = players.get(pid); if (p) api.to(pid, 'g:event', { type: 'spawn', id: pid, x: p.x, y: p.y, z: p.z, yaw: r2(p.yaw), keep: 1 }); },
      onLeave(pid) { players.delete(pid); if (!over && players.size < 2) finish(); },
      onInput(pid, m) {
        const p = players.get(pid); if (!p || (over && !(pid === winnerId && celebT > 0 && m.type === 'p'))) return; /* after the end only the winner moves */
        if (p.away && m.type !== 'away' && m.type !== 'hello') return;
        if (m.type === 'p') {
          if (p.dead || !fin(m.x) || !fin(m.y) || !fin(m.z) || !fin(m.yaw) || !fin(m.pitch)) return;
          const lim = MAP.size - P.R; p.x = Math.max(-lim, Math.min(lim, m.x)); p.z = Math.max(-lim, Math.min(lim, m.z)); p.y = Math.max(0, Math.min(40, m.y)); p.yaw = m.yaw; p.pitch = Math.max(-1.55, Math.min(1.55, m.pitch)); p.cr = m.cr ? 1 : 0;
        } else if (m.type === 'away') { // stepped away (Esc): out of the world but still in the match, with every tag and point kept
          const on = !!m.on; if (on === !!p.away) return; p.away = on; if (on) { p.power = null; p.powerT = 0; p.reloadT = 0; api.emit('g:event', { type: 'away', id: pid, on: 1 }); } else { p.dead = 0; spawn(p); api.emit('g:event', { type: 'away', id: pid, on: 0 }); }
        } else if (m.type === 'hello') { if (fin(m.lvl)) p.lvl = Math.max(1, Math.min(99, m.lvl | 0)); if (fin(m.ch)) p.ch = Math.abs(m.ch | 0) % 8; if (fin(m.sk)) p.sk = Math.abs(m.sk | 0) % 16;
          if (fin(m.lo) && LOADOUT.includes(m.lo | 0)) { p.lo = m.lo | 0; if (!p.dead && t - p.bornT < 4) starter(p); } } // a loadout chosen in the first seconds of a life applies right away
        else if (m.type === 'switch') { const w = m.w | 0; if (!p.dead && w >= 0 && w < WEAPONS.length && p.own[w] && w !== p.w) { p.w = w; p.reloadT = 0; p.nextFire = Math.max(p.nextFire, t + 0.3); } }
        else if (m.type === 'reload') { const def = WEAPONS[p.w]; if (!p.dead && p.power !== 'inf' && p.reloadT <= 0 && p.mag[p.w] < def.mag && p.res[p.w] > 0) p.reloadT = def.reload; }
        else if (m.type === 'drop') { // throw the blaster you are holding on the floor in front of you (not the sidearm)
          const w = p.w; if (p.dead || w === 0 || !p.own[w]) return;
          const f = B.dirFrom(p.yaw, 0); let dx = p.x + f[0] * 1.7, dz = p.z + f[2] * 1.7; const lim = MAP.size - 1;
          if (Math.abs(dx) > lim || Math.abs(dz) > lim || B.overlap(dx, p.y + 0.05, dz, MAP) || !B.los(p.x, p.y + 1, p.z, dx, p.y + 1, dz, MAP)) { dx = p.x; dz = p.z; }
          drops.push({ id: ++seq, w, x: dx, y: p.y, z: dz, t: DROP_LIFE + 10, ammo: p.mag[w] + p.res[w], by: pid, hold: 1.5 });
          p.own[w] = false; p.mag[w] = 0; p.res[w] = 0; p.reloadT = 0;
          const next = m.next | 0; p.w = next > 0 && next < WEAPONS.length && p.own[next] ? next : 0; p.nextFire = Math.max(p.nextFire, t + 0.3);
          api.emit('g:event', { type: 'dropped', id: pid, w });
        }
        else if (m.type === 'endnow') { if (api.room && api.room.bots && api.room.bots.size && !over) { p.kills += 3; finish(); } } // test rooms only: end the match now (tools/party.js)
        else if (m.type === 'give') { // test rooms only (a room with bots): hand yourself any blaster
          const w = m.w | 0; if (api.room && api.room.bots && api.room.bots.size && !p.dead && w > 0 && w < WEAPONS.length) { give(p, w); api.to(pid, 'g:event', { type: 'pickup', id: pid, kind: 'weapon', w, drop: 1 }); }
        }
        else if (m.type === 'melee') { // foam sword: the swinger's client says who was in reach; we check distance and cooldown
          if (p.dead || t < p.nextMelee) return;
          p.nextMelee = t + MELEE.cd - 0.08; p.prot = 0;
          api.emit('g:event', { type: 'swing', id: pid });
          for (const id of Array.isArray(m.hits) ? m.hits.slice(0, 3) : []) { const v = players.get(id); if (!v || v === p || v.dead) continue; if (Math.hypot(v.x - p.x, v.y - p.y, v.z - p.z) > MELEE.range + 1.6) continue; hurt(v, MELEE.dmg, pid, MELEE.name, false, p); if (over) return; }
        }
        else if (m.type === 'fire') {
          const def = WEAPONS[p.w];
          if (p.dead || (m.w | 0) !== p.w || p.reloadT > 0 || p.mag[p.w] <= 0 || t < p.nextFire - 0.06) return;
          if (p.power !== 'inf') p.mag[p.w]--; p.nextFire = t + 1 / def.rate; p.prot = 0; // Bottomless Mag: darts are free
          const o = Array.isArray(m.o) && m.o.length === 3 && m.o.every(fin) && Math.hypot(m.o[0] - p.x, m.o[1] - p.y, m.o[2] - p.z) < 4 ? m.o : [p.x, p.y + P.EYE, p.z];
          let d = Array.isArray(m.d) && m.d.length === 3 && m.d.every(fin) ? m.d : B.dirFrom(p.yaw, p.pitch); const dl = Math.hypot(d[0], d[1], d[2]) || 1; d = [d[0] / dl, d[1] / dl, d[2] / dl];
          if (def.projectile) { rockets.push({ id: ++seq, o: pid, w: p.w, g: def.gravity || 0, x: o[0], y: o[1], z: o[2], vx: d[0] * def.speed, vy: d[1] * def.speed + (def.gravity ? 2.5 : 0), vz: d[2] * def.speed, life: def.gravity ? 6 : 4, age: 0 }); api.emit('g:event', { type: 'shot', id: pid, w: p.w }); return; }
          const e = Array.isArray(m.e) && m.e.length === 3 && m.e.every(fin) ? m.e.map(r2) : null;
          api.emit('g:event', { type: 'shot', id: pid, w: p.w, o: o.map(r2), e });
          let pellets = def.pellets;
          for (const h of Array.isArray(m.hits) ? m.hits.slice(0, 8) : []) {
            const v = players.get(h && h.id); if (!v || v === p || v.dead || pellets <= 0) continue;
            const n = Math.max(1, Math.min(pellets, h.n | 0 || 1)), hd = Math.max(0, Math.min(n, h.h | 0)); pellets -= n;
            const dist = Math.hypot(v.x - p.x, v.y - p.y, v.z - p.z); if (dist > def.range * 1.15) continue;
            hurt(v, def.dmg * B.falloff(def, dist) * ((n - hd) + hd * def.head), pid, def.name, hd * 2 >= n && hd > 0, p);
          }
        }
      },
      tick(dt) {
        if (over) { if (celebT > 0) { celebT -= dt; sendState(); } return; }
        t += dt; left -= dt; if (left <= 0) { left = 0; finish(); return; }
        for (const p of players.values()) {
          if (p.away) continue; // stepped away: nothing happens to them until they come back
          if (p.dead > 0) { p.dead -= dt; if (p.dead <= 0) spawn(p); continue; }
          if (p.prot > 0) p.prot -= dt;
          if (p.powerT > 0) { p.powerT -= dt; if (p.powerT <= 0) { p.power = null; api.to(p.id, 'g:event', { type: 'powerend' }); } }
          if (p.hp > 100) p.hp = Math.max(100, p.hp - 3 * dt);
          if (p.reloadT > 0) { p.reloadT -= dt; if (p.reloadT <= 0) { const def = WEAPONS[p.w], need = def.mag - p.mag[p.w], got = Math.min(need, p.res[p.w]); p.mag[p.w] += got; if (p.res[p.w] !== Infinity) p.res[p.w] -= got; } }
        }
        // map pickups
        for (let i = 0; i < pick.length; i++) {
          const k = pick[i], d = k.def;
          if (d.kind === 'power') { // cycles: announce, appear, get taken, wait
            if (k.t > 0) { const before = k.t; k.t -= dt; if (before > POWER_WARN && k.t <= POWER_WARN) { k.kind = B.rollPower(); api.emit('g:event', { type: 'powersoon', kind: k.kind }); } if (k.t <= 0 && !k.kind) k.kind = B.rollPower(); continue; }
          } else if (k.t > 0) { k.t -= dt; continue; }
          for (const p of players.values()) {
            if (p.dead || p.away || Math.hypot(p.x - d.x, p.z - d.z) > 1.35 || Math.abs(p.y - d.y) > 1.5) continue;
            if (d.kind === 'health') { if (p.hp >= 100) continue; p.hp = Math.min(100, p.hp + 30); }
            else if (d.kind === 'mega') { if (p.hp >= 150) continue; p.hp = Math.min(150, p.hp + 100); }
            else if (d.kind === 'armor') { if (p.armor >= 100) continue; p.armor = Math.min(100, p.armor + 50); }
            else if (d.kind === 'weapon') give(p, d.w);
            else if (d.kind === 'power') { if (POWERS[k.kind].rare) p.rares = (p.rares || 0) + 1; if (k.kind === 'tank') { p.hp = 150; p.armor = 100; } else { p.power = k.kind; p.powerT = POWERS[k.kind].time; } api.emit('g:event', { type: 'power', id: p.id, kind: k.kind }); }
            api.emit('g:event', { type: 'pickup', id: p.id, i, kind: d.kind, w: d.w, pk: d.kind === 'power' ? k.kind : undefined });
            k.t = d.kind === 'power' ? POWER_EVERY : d.respawn; if (d.kind === 'power') k.kind = null; break;
          }
        }
        // toy train
        if (train.x === null) {
          train.wait -= dt;
          if (!train.warned && train.wait <= TR.warn) { train.warned = true; train.dir = Math.random() < 0.5 ? 1 : -1; api.emit('g:event', { type: 'trainsoon', dir: train.dir }); }
          if (train.wait <= 0) { train.x = -train.dir * (MAP.size + 1); train.hit.clear(); }
        } else {
          train.x += train.dir * TR.speed * dt; // x is the nose; the body trails behind it
          const a = Math.min(train.x, train.x - train.dir * TR.len), b = Math.max(train.x, train.x - train.dir * TR.len);
          for (const p of [...players.values()]) {
            if (p.dead || p.away || train.hit.has(p.id) || p.y > TR.h || Math.abs(p.z - TR.z) > TR.half + P.R || p.x < a - P.R || p.x > b + P.R) continue;
            train.hit.add(p.id); api.to(p.id, 'g:event', { type: 'trainhit', dir: train.dir });
            hurt(p, TR.dmg, null, 'Toy Train', false, { x: p.x - train.dir * 3, z: p.z }); if (over) return;
          }
          if ((train.x - train.dir * TR.len) * train.dir > MAP.size + 1) { train.x = null; train.wait = TR.every; train.warned = false; }
        }
        // dropped weapons
        for (let i = drops.length - 1; i >= 0; i--) {
          const dr = drops[i]; dr.t -= dt; dr.age = (dr.age || 0) + dt; let taken = dr.t <= 0;
          if (!taken && dr.age > 0.6) for (const p of players.values()) if (!p.dead && !p.away && !(dr.by === p.id && dr.age < dr.hold) && Math.hypot(p.x - dr.x, p.z - dr.z) < 1.3 && Math.abs(p.y - dr.y) < 1.5) { takeDrop(p, dr); api.emit('g:event', { type: 'pickup', id: p.id, kind: 'weapon', w: dr.w, drop: 1 }); taken = true; break; }
          if (taken) drops.splice(i, 1);
        }
        // rockets
        for (let i = rockets.length - 1; i >= 0; i--) {
          const rk = rockets[i]; rk.age += dt; rk.life -= dt; if (rk.g) rk.vy -= rk.g * dt; const sp = Math.hypot(rk.vx, rk.vy, rk.vz) || 0.001, step = sp * dt, dx = rk.vx / sp, dy = rk.vy / sp, dz = rk.vz / sp;
          let hitT = B.rayMap(rk.x, rk.y, rk.z, dx, dy, dz, step, MAP), direct = null;
          for (const v of players.values()) { if (v.dead || v.away || (v.id === rk.o && rk.age < 0.25)) continue; const h = B.rayPlayer(rk.x, rk.y, rk.z, dx, dy, dz, v.x, v.y, v.z, Math.min(step, hitT), v.cr); if (h) { hitT = h.t; direct = v; } }
          if (hitT !== Infinity || rk.life <= 0) { const tt = hitT === Infinity ? step : Math.max(0, hitT - 0.05); explode(rk.x + dx * tt, rk.y + dy * tt, rk.z + dz * tt, rk.o, direct, rk.w); rockets.splice(i, 1); if (over) return; continue; }
          rk.x += dx * step; rk.y += dy * step; rk.z += dz * step;
        }
        sendState();
      },
      destroy() {},
      __power() { return pick[0]; }, // for tools/blasters-items-check.js only: the power-up plinth's state
    };
  },
};
