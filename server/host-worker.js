// Peer-to-peer hosting: this file runs in a Web Worker inside the ROOM CREATOR'S browser and is the game server for
// that room. It is the same hub the Node server uses (server/hub.js), given a small stand-in for Socket.IO.
// The page (public/p2p.js) relays messages between this worker and the other players' direct connections.
// A worker is used because its timers keep running at full speed when the host switches to another tab.
// Built into public/host-worker.js by server/build-manifest.js.
const attachHub = require('./hub');
const games = require('./registry');

const socks = new Map();   // sid -> FakeSocket   ('local' is the host's own page)
const groups = new Map();  // room name -> Set of sids (Socket.IO "rooms")
let onConnection = null;
const post = (sids, ev, data) => { if (sids.length) self.postMessage({ t: 'emit', sids, s: JSON.stringify([ev, data]) }); };

class FakeSocket {
  constructor(id) { this.id = id; this.data = {}; this.handlers = {}; this.groups = new Set(); this.seen = Date.now(); }
  on(ev, fn) { this.handlers[ev] = fn; }
  join(name) { this.groups.add(name); if (!groups.has(name)) groups.set(name, new Set()); groups.get(name).add(this.id); }
  leave(name) { this.groups.delete(name); const g = groups.get(name); if (g) g.delete(this.id); }
  emit(ev, data) { post([this.id], ev, data); }
}
const io = {
  on(ev, fn) { if (ev === 'connection') onConnection = fn; },
  to(name) { return { emit(ev, data) { const g = groups.get(name); if (g && g.size) post([...g], ev, data); } }; },
  sockets: { sockets: socks },
};
const randomHex = (n) => { const b = new Uint8Array(n); self.crypto.getRandomValues(b); return [...b].map((v) => v.toString(16).padStart(2, '0')).join(''); };
attachHub(io, { games, randomHex, graceMs: 20000, trustClientCode: true });

function drop(sid) {
  const s = socks.get(sid); if (!s) return;
  socks.delete(sid); for (const name of s.groups) { const g = groups.get(name); if (g) g.delete(sid); }
  if (s.handlers.disconnect) { try { s.handlers.disconnect('transport close'); } catch (e) { console.error(e); } }
}
self.onmessage = (e) => {
  const m = e.data;
  if (m.t === 'open') { const s = new FakeSocket(m.sid); socks.set(m.sid, s); onConnection(s); }
  else if (m.t === 'close') drop(m.sid);
  else if (m.t === 'msg') {
    const s = socks.get(m.sid); if (!s) return;
    let a = m.s; if (typeof a === 'string') { try { a = JSON.parse(a); } catch (err) { return; } }
    if (!Array.isArray(a) || typeof a[0] !== 'string') return;
    s.seen = Date.now();
    const [ev, data, ack] = a;
    if (ev === '__ping') { post([m.sid], '__pong', 0); return; }
    const fn = s.handlers[ev]; if (!fn || ev === 'disconnect') return;
    try { fn(data, ack != null ? (res) => post([m.sid], '__ack', [ack, res]) : undefined); } catch (err) { console.error('[host]', ev, err); }
  }
};
// a guest that has been silent for 12 seconds is gone (their tab closed or their network dropped)
setInterval(() => { const now = Date.now(); for (const [sid, s] of socks) if (sid !== 'local' && now - s.seen > 12000) { self.postMessage({ t: 'kick', sid }); drop(sid); } }, 3000);
