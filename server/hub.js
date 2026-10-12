// The room hub: rooms, players, lobby, bots, results and the game loop. It talks to players through a Socket.IO-style
// `io` object and knows nothing about HTTP, so it runs in two places:
//   - server.js           a normal Node server with real Socket.IO (local play, any always-on host)
//   - server/host-worker.js  inside the room creator's browser, with a small stand-in for `io` (peer-to-peer play on
//                            static hosts such as Vercel, where a server process cannot be kept alive)
const bots = require('./bots');
const KART_MAPS = require('../public/memekarts-maps');
const BL_MAPS = require('../public/games/blasters.shared').MAPS;

// opts: games (array of game modules), randomHex(nBytes), graceMs (seat hold after a disconnect), trustClientCode
const ROOM_MAX = 16; // a party: the two main games take 16; the smaller party games still stop at 8 when you press Start
module.exports = function attachHub(io, opts) {
  const randomHex = opts.randomHex;
  // ---- game registry -------------------------------------------------------
  const GAMES = {};
  const ORDER = [];
  for (const g of opts.games) { GAMES[g.id] = g; ORDER.push(g.id); }
  const gameList = () => ORDER.map((id) => {
    const g = GAMES[id];
    return { id: g.id, name: g.name, tagline: g.tagline, min: g.min || 2, max: g.max || 8, controls: g.controls || '' };
  });

  // ---- rooms ---------------------------------------------------------------
  const COLORS = ['#ff5d5d', '#4da6ff', '#5ee07a', '#ffd84d', '#c77dff', '#ff9f43', '#2ee6d6', '#ff7ab6', '#ffffff', '#8b5a2b', '#a3e635', '#1e40af', '#f472b6', '#14b8a6', '#facc15', '#7c3aed']; // 16, one per seat
  const rooms = new Map();
  const TICK_HZ = 30;
  // A player who disconnects (page refresh, wifi blip) keeps their seat for this long and can rejoin as the same player.
  const GRACE_MS = opts.graceMs == null ? 20000 : opts.graceMs;

  function makeCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = '';
    do { c = ''; for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)]; } while (rooms.has(c));
    return c;
  }

  class Room {
    constructor(code) {
      this.code = code;
      this.hostId = null;
      this.players = new Map(); // id -> {id,name,color,score,connected}
      this.gameId = 'memekarts';
      this.game = null;
      this.phase = 'lobby'; // lobby | playing | results
      this.results = null;
      this.memory = {}; // persists across games (e.g. next boss)
      this.bots = new Map(); // test-mode bots: id -> { id, mem }
      this.lastState = null; this.botState = {}; this.botLoop = null;
      this.timers = new Set();
      this.loop = null;
      this.lastTick = 0;
    }
    summary() {
      return {
        code: this.code,
        hostId: this.hostId,
        phase: this.phase,
        gameId: this.gameId,
        mapId: this.memory.memekartsMap || 'stadium',
        blastersMap: this.memory.blastersMap || BL_MAPS[0].id,
        blastersMode: this.memory.blastersMode || 'ffa',
        blastersRounds: this.memory.blastersRounds || 'loop',
        results: this.results,
        players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected, bot: !!p.bot })),
      };
    }
    broadcast() { io.to(this.code).emit('room', this.summary()); }
    freeColor() {
      const used = new Set([...this.players.values()].map((p) => p.color));
      return COLORS.find((c) => !used.has(c)) || COLORS[Math.floor(Math.random() * COLORS.length)];
    }
    addPlayer(socket, name) {
      // Player ids are stable and independent of the socket, so a refresh can reattach to the same player. `key` is the
      // secret that proves a rejoining socket is that player (ids are public, keys never leave the owner's browser).
      let nm = String(name).trim().slice(0, 14) || 'Player'; const taken = new Set([...this.players.values()].map((q) => q.name.toLowerCase())); /* two friends with the same name get told apart: Sam, Sam 2 */
      if (taken.has(nm.toLowerCase())) { let i = 2; while (taken.has(`${nm.slice(0, 11)} ${i}`.toLowerCase())) i++; nm = `${nm.slice(0, 11)} ${i}`; }
      const p = { id: 'u' + randomHex(6), key: randomHex(9), name: nm, color: this.freeColor(), score: 0, connected: true };
      this.players.set(p.id, p);
      if (!this.hostId) this.hostId = p.id;
      this.attach(socket, p);
      if (this.game && this.game.onJoin) this.guard(() => this.game.onJoin(p.id));
      this.broadcast();
      return p;
    }
    attach(socket, p) {
      if (p.graceTimer) { clearTimeout(p.graceTimer); p.graceTimer = null; }
      p.sid = socket.id; p.connected = true;
      socket.join(this.code); socket.join(p.id); // the personal room is how api.to(pid, ...) reaches this player
      socket.data.room = this.code; socket.data.pid = p.id;
    }
    // Socket went away without an explicit leave: hold the seat for GRACE_MS, then remove the player.
    drop(socket) {
      const p = this.players.get(socket.data.pid);
      if (!p || p.sid !== socket.id) return; // already reattached on a newer socket
      p.connected = false;
      if (this.hostId === p.id) { const other = [...this.players.values()].find((q) => !q.bot && q.connected); if (other) this.hostId = other.id; }
      p.graceTimer = setTimeout(() => { p.graceTimer = null; if (this.players.get(p.id) === p && !p.connected) this.removePlayer(p.id); }, GRACE_MS);
      this.broadcast();
    }
    removePlayer(id) {
      const gone = this.players.get(id);
      if (gone && gone.graceTimer) { clearTimeout(gone.graceTimer); gone.graceTimer = null; }
      this.players.delete(id);
      if (this.game && this.game.onLeave) this.guard(() => this.game.onLeave(id));
      if (this.hostId === id) this.hostId = this.players.keys().next().value || null;
      if (this.humans() === 0) { this.stopGame(); rooms.delete(this.code); return; }
      if (this.players.get(this.hostId)?.bot) this.hostId = [...this.players.values()].find((p) => !p.bot).id;
      if (this.game && this.players.size < 1) this.stopGame();
      this.broadcast();
    }
    addBot() {
      if (this.players.size >= ROOM_MAX) return;
      let n = 1; while ([...this.players.values()].some((p) => p.name === 'Bot ' + n)) n++;
      const id = 'bot:' + this.code + ':' + n + ':' + Math.random().toString(36).slice(2, 6);
      this.players.set(id, { id, name: 'Bot ' + n, color: this.freeColor(), score: 0, connected: true, bot: true });
      this.bots.set(id, { id, mem: {} });
      if (this.game && this.game.onJoin) this.guard(() => this.game.onJoin(id));
      this.broadcast();
    }
    removeBots() {
      for (const id of [...this.bots.keys()]) { this.bots.delete(id); this.players.delete(id); if (this.game && this.game.onLeave) this.guard(() => this.game.onLeave(id)); }
      this.broadcast();
    }
    humans() { return [...this.players.values()].filter((p) => !p.bot).length; }
    // Runs game code that fires outside the tick loop (timers). An exception ends that game instead of killing the server.
    guard(fn) { try { fn(); } catch (e) { console.error('[timer]', this.gameId, e); this.finish({}, 'The game crashed: ' + e.message); } }
    api() {
      const room = this;
      return {
        room,
        memory: this.memory,
        players: () => [...room.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, bot: !!p.bot })),
        player: (id) => { const p = room.players.get(id); return p ? { id: p.id, name: p.name, color: p.color } : null; },
        emit: (ev, data) => { if (ev === 'g:state') { room.lastState = data; if ((room.stateN = (room.stateN || 0) + 1) % 3 === 0) return; } io.to(room.code).emit(ev, data); }, /* the sim ticks at 30 Hz; snapshots go out at 20 Hz (clients interpolate), a third less traffic */
        to: (pid, ev, data) => { if (room.bots.has(pid)) { if (ev === 'g:state') room.botState[pid] = data; return; } io.to(pid).emit(ev, data); },
        after(ms, fn) { const t = setTimeout(() => { room.timers.delete(t); room.guard(fn); }, ms); room.timers.add(t); return t; },
        every(ms, fn) { const t = setInterval(() => room.guard(fn), ms); room.timers.add(t); return t; },
        clear(t) { clearTimeout(t); clearInterval(t); room.timers.delete(t); },
        end: (points, summary, extra) => room.finish(points, summary, extra),
      };
    }
    startGame() {
      const def = GAMES[this.gameId];
      if (!def || this.game) return;
      this.phase = 'playing';
      this.results = null;
      this.broadcast();
      try { this.game = def.create(this.api()); }
      catch (e) { console.error('[start]', this.gameId, e); this.game = null; this.phase = 'lobby'; this.broadcast(); io.to(this.code).emit('toast', 'Could not start ' + def.name + ': ' + e.message); return; }
      this.lastTick = Date.now();
      this.loop = setInterval(() => {
        const now = Date.now();
        const dt = Math.min(0.1, (now - this.lastTick) / 1000);
        this.lastTick = now;
        try { if (this.game && this.game.tick) this.game.tick(dt); } catch (e) { console.error('[tick]', this.gameId, e); this.finish({}, 'The game crashed: ' + e.message); }
      }, 1000 / TICK_HZ);
      io.to(this.code).emit('game:start', { gameId: this.gameId });
      this.lastState = null; this.botState = {};
      for (const b of this.bots.values()) b.mem = {};
      if (this.bots.size) {
        const BOT_DT = 0.1;
        this.botLoop = setInterval(() => {
          if (!this.game) return;
          const ids = [...this.players.keys()];
          for (const b of this.bots.values()) {
            const msgs = bots.think(this.gameId, b, this.botState[b.id] || this.lastState, { ids, others: ids.filter((i) => i !== b.id), dt: BOT_DT, game: this.game });
            for (const m of msgs) { try { this.game && this.game.onInput(b.id, m); } catch (e) { console.error('[bot]', this.gameId, e.message); } }
          }
        }, BOT_DT * 1000);
      }
    }
    stopGame() {
      if (this.loop) clearInterval(this.loop);
      this.loop = null;
      if (this.botLoop) clearInterval(this.botLoop);
      this.botLoop = null;
      for (const t of this.timers) { clearTimeout(t); clearInterval(t); }
      this.timers.clear();
      if (this.game && this.game.destroy) { try { this.game.destroy(); } catch (e) { console.error(e); } }
      this.game = null;
    }
    finish(points, summary, extra) {
      if (this.phase !== 'playing') return;
      this.stopGame();
      const rows = [];
      for (const p of this.players.values()) {
        const pts = Math.round(points[p.id] || 0);
        p.score += pts;
        rows.push({ id: p.id, name: p.name, color: p.color, points: pts, score: p.score });
      }
      rows.sort((a, b) => b.points - a.points);
      this.results = { gameId: this.gameId, summary: summary || '', rows, extra: extra || null };
      this.phase = 'results';
      this.broadcast();
    }
  }

  io.on('connection', (socket) => {
    const roomOf = () => rooms.get(socket.data.room);
    // Clients are untrusted: a missing or malformed payload must never throw, or one bad message would take the server down.
    const on = (ev, fn) => socket.on(ev, (payload, cb) => {
      if (typeof payload === 'function') { cb = payload; payload = {}; }
      try { fn(payload && typeof payload === 'object' ? payload : {}, typeof cb === 'function' ? cb : () => {}); }
      catch (e) { console.error('[socket]', ev, e); }
    });

    socket.emit('games', gameList());

    on('create', ({ name, code }, cb) => {
      if (roomOf()) return cb && cb({ error: 'Already in a room' });
      // peer-to-peer hosting: the room code is also the address friends connect to, so the host's browser picks it
      const room = new Room(opts.trustClientCode && /^[A-HJ-NP-Z2-9]{4}$/.test(String(code || '')) && !rooms.has(code) ? code : makeCode());
      rooms.set(room.code, room);
      const p = room.addPlayer(socket, String(name || ''));
      cb && cb({ ok: true, code: room.code, id: p.id, key: p.key });
    });

    on('join', ({ name, code }, cb) => {
      if (roomOf()) return cb && cb({ error: 'Already in a room' });
      const room = rooms.get(String(code || '').toUpperCase().trim());
      if (!room) return cb && cb({ error: 'No room with that code' });
      if (room.players.size >= ROOM_MAX) { const bot = [...room.players.values()].find((q) => q.bot); if (bot) room.removePlayer(bot.id); } /* bots are placeholders: a friend who joins takes a bot's seat */
      if (room.players.size >= ROOM_MAX) return cb && cb({ error: `Room is full (${ROOM_MAX} max)` });
      const p = room.addPlayer(socket, String(name || ''));
      cb && cb({ ok: true, code: room.code, id: p.id, key: p.key });
    });

    // A refreshed or reconnected browser reclaims its player with the id + secret key it was given on create/join.
    on('rejoin', ({ code, id, key }, cb) => {
      if (roomOf()) return cb({ error: 'Already in a room' });
      const room = rooms.get(String(code || '').toUpperCase().trim());
      const p = room && room.players.get(String(id || ''));
      if (!p || p.bot || !key || p.key !== key) return cb({ error: 'That game is no longer running' });
      const old = p.sid && p.sid !== socket.id ? io.sockets.sockets.get(p.sid) : null; // same player open in an older tab
      if (old) { old.leave(room.code); old.leave(p.id); old.data.room = null; old.data.pid = null; old.emit('replaced'); }
      room.attach(socket, p);
      cb({ ok: true, code: room.code, id: p.id, key: p.key });
      room.broadcast();
      if (room.phase === 'playing' && room.game) {
        socket.emit('game:start', { gameId: room.gameId });
        if (room.game.onRejoin) room.guard(() => room.game.onRejoin(p.id)); // games resend one-time setup (maps, the secret word, ...)
      }
    });

    on('leave', () => {
      const room = roomOf();
      if (!room) return;
      const pid = socket.data.pid;
      socket.leave(room.code); socket.leave(pid);
      socket.data.room = null; socket.data.pid = null;
      room.removePlayer(pid);
    });

    on('pick', ({ gameId }) => {
      const room = roomOf();
      if (!room || room.hostId !== socket.data.pid || room.phase === 'playing' || !GAMES[gameId]) return;
      room.gameId = gameId;
      room.broadcast();
    });

    on('start', () => {
      const room = roomOf();
      if (!room || room.hostId !== socket.data.pid || room.phase === 'playing') return;
      const def = GAMES[room.gameId];
      if (room.players.size < (def.min || 2)) return socket.emit('toast', `${def.name} needs at least ${def.min || 2} players`);
      if (room.players.size > (def.max || 8)) return socket.emit('toast', `${def.name} fits ${def.max || 8} players; this room has ${room.players.size}. Pick Meme Karts or Toy Box Blasters, or remove some bots.`);
      room.startGame();
    });

    on('pickMap', ({ mapId } = {}) => {
      const room = roomOf();
      if (!room || room.hostId !== socket.data.pid || room.phase === 'playing') return;
      if (BL_MAPS.some(m => m.id === mapId)) room.memory.blastersMap = mapId; // map ids are distinct across the two games
      else if (KART_MAPS.some(m => m.id === mapId)) room.memory.memekartsMap = mapId;
      else return;
      room.broadcast();
    });

    // Toy Box Blasters: free-for-all or teams (host only, in the lobby)
    on('pickMode', ({ mode } = {}) => {
      const room = roomOf();
      if (!room || room.hostId !== socket.data.pid || room.phase === 'playing' || !['ffa', 'teams', 'loop', 'one'].includes(mode)) return;
      if (mode === 'loop' || mode === 'one') room.memory.blastersRounds = mode; else room.memory.blastersMode = mode;
      room.broadcast();
    });

    // test mode: the host can fill the room with bots to try games alone
    on('bots', ({ op, n }) => {
      const room = roomOf();
      if (!room || room.hostId !== socket.data.pid || room.phase === 'playing') return;
      if (op === 'add') for (let i = 0; i < Math.max(1, Math.min(ROOM_MAX - 1, n | 0 || 1)); i++) room.addBot();
      else if (op === 'clear') room.removeBots();
    });

    on('lobby', () => {
      const room = roomOf();
      if (!room || room.hostId !== socket.data.pid) return;
      if (room.phase === 'playing') room.finish({}, 'Host ended the game early');
      room.phase = 'lobby';
      room.broadcast();
    });

    on('input', (msg) => {
      const room = roomOf();
      if (!room || !room.game || !msg || typeof msg !== 'object') return;
      try { room.game.onInput(socket.data.pid, msg); } catch (e) { console.error('[input]', room.gameId, e); }
    });

    socket.on('disconnect', () => {
      const room = roomOf();
      if (room) room.drop(socket);
    });
  });

  return { rooms, games: ORDER };
};
