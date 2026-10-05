// Peer-to-peer transport. Used where there is no always-on game server (static hosts such as Vercel).
// The room creator's browser runs the game (in a worker, see server/host-worker.js) and every other player connects
// straight to it with WebRTC. window.createP2PSocket() returns an object that looks like a Socket.IO socket
// (on / once / off / emit with callbacks / connected), so the rest of the client does not care which transport it has.
//
// The public PeerJS service is used only to introduce browsers to each other; game traffic does not pass through it.
// Trade-offs: the room lives in the creator's tab (if they close or refresh it the room ends), and a few very strict
// networks block direct connections.
(function () {
  const PREFIX = 'fgroom1-', ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const randomCode = () => Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
  let peerLib = null;
  const loadPeer = () => peerLib || (peerLib = new Promise((res, rej) => { if (window.Peer) return res(); const s = document.createElement('script'); s.src = '/vendor/peerjs.min.js'; s.onload = () => res(); s.onerror = () => { peerLib = null; rej(new Error('Could not load the connection library')); }; document.head.appendChild(s); }));

  window.createP2PSocket = function () {
    const handlers = {}, acks = new Map(), conns = new Map();
    let mode = null, peer = null, worker = null, conn = null, ackSeq = 0, sidSeq = 0, lastHeard = 0, pingTimer = null, gen = 0;
    const fire = (ev, ...a) => { for (const fn of (handlers[ev] || []).slice()) { try { fn(...a); } catch (e) { console.error(e); } } };
    const sock = {
      connected: false, p2p: true, get hosting() { return mode === 'host'; },
      on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return sock; },
      once(ev, fn) { const w = (...a) => { sock.off(ev, w); fn(...a); }; return sock.on(ev, w); },
      off(ev, fn) { handlers[ev] = (handlers[ev] || []).filter((f) => f !== fn); return sock; },
      emit(ev, data, cb) {
        if (ev === 'create') return void startHost(data || {}, cb || (() => {}));
        if (ev === 'join' || ev === 'rejoin') return void startGuest(ev, data || {}, cb || (() => {}));
        if (mode === 'host') toWorker(ev, data, cb); else if (mode === 'guest') toHost(ev, data, cb); else if (cb) cb({ error: 'Not connected' });
        if (ev === 'leave' && mode) setTimeout(() => teardown(), 200); // let the goodbye go out first
      },
      connect() {}, disconnect() { teardown(); }, close() { teardown(); },
    };
    function deliver(str) {
      let a; try { a = JSON.parse(str); } catch (e) { return; }
      if (!Array.isArray(a)) return; const [ev, data] = a;
      if (ev === '__ack') { const cb = acks.get(data[0]); if (cb) { acks.delete(data[0]); cb(data[1]); } return; }
      if (ev === '__pong') return;
      fire(ev, data);
    }
    const withAck = (cb) => { if (!cb) return undefined; const id = ++ackSeq; acks.set(id, cb); return id; };
    const toWorker = (ev, data, cb) => worker.postMessage({ t: 'msg', sid: 'local', s: [ev, data, withAck(cb)] });
    const toHost = (ev, data, cb) => { try { conn.send(JSON.stringify([ev, data, withAck(cb)])); } catch (e) { /* connection is closing */ } };
    function teardown() {
      gen++; mode = null; sock.connected = false; clearInterval(pingTimer); pingTimer = null; acks.clear();
      if (worker) { worker.terminate(); worker = null; }
      for (const c of conns.values()) { try { c.close(); } catch (e) { /* already closed */ } } conns.clear();
      if (peer) { try { peer.destroy(); } catch (e) { /* already gone */ } peer = null; } conn = null;
    }

    // ---- hosting a room ----
    async function startHost(data, cb) {
      try { await loadPeer(); } catch (e) { return cb({ error: e.message }); }
      teardown(); const mine = ++gen;
      let code = null;
      for (let tries = 0; tries < 6 && !peer; tries++) {
        code = randomCode();
        try { peer = await new Promise((res, rej) => { const p = new window.Peer(PREFIX + code, { debug: 0 }); p.on('open', () => res(p)); p.on('error', (err) => { try { p.destroy(); } catch (e) { /* ignore */ } rej(err); }); }); }
        catch (err) { if (err && err.type !== 'unavailable-id') return cb({ error: 'Could not reach the connection service. Check your internet and try again.' }); }
        if (mine !== gen) { if (peer) peer.destroy(); return; }
      }
      if (!peer) return cb({ error: 'Could not open a room. Try again.' });
      mode = 'host'; sock.connected = true;
      worker = new Worker('/host-worker.js');
      worker.onerror = (e) => console.error('room host worker failed:', e.message);
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.t === 'emit') { for (const sid of m.sids) { if (sid === 'local') deliver(m.s); else { const c = conns.get(sid); if (c && c.open) { try { c.send(m.s); } catch (err) { /* that player is leaving */ } } } } }
        else if (m.t === 'kick') { const c = conns.get(m.sid); if (c) { conns.delete(m.sid); try { c.close(); } catch (err) { /* ignore */ } } }
      };
      peer.on('connection', (c) => {
        const sid = 'c' + (++sidSeq), gone = () => { if (conns.get(sid) === c) { conns.delete(sid); if (worker) worker.postMessage({ t: 'close', sid }); } };
        c.on('open', () => { conns.set(sid, c); worker.postMessage({ t: 'open', sid }); });
        c.on('data', (d) => { if (worker && typeof d === 'string') worker.postMessage({ t: 'msg', sid, s: d }); });
        c.on('close', gone); c.on('error', gone);
      });
      // losing the link to the introduction service does not affect players already in; reconnect so new ones can still join
      peer.on('disconnected', () => { const p = peer; setTimeout(() => { if (peer === p && mode === 'host' && !p.destroyed) { try { p.reconnect(); } catch (e) { /* will retry on the next drop */ } } }, 1500); });
      worker.postMessage({ t: 'open', sid: 'local' });
      toWorker('create', Object.assign({}, data, { code }), cb);
    }

    // ---- joining someone else's room ----
    async function startGuest(ev, data, cb) {
      try { await loadPeer(); } catch (e) { return cb({ error: e.message }); }
      const code = String(data.code || '').toUpperCase().trim(), gone = ev === 'rejoin' ? 'That room has closed' : 'No room with that code';
      if (!/^[A-Z0-9]{4}$/.test(code)) return cb({ error: gone });
      teardown(); const mine = ++gen; let settled = false;
      const fail = (msg) => { if (settled || mine !== gen) return; settled = true; teardown(); cb({ error: msg }); };
      const p = peer = new window.Peer({ debug: 0 });
      const timer = setTimeout(() => fail('Could not reach the room. The host may be offline or on a very strict network.'), 15000);
      p.on('error', (err) => { clearTimeout(timer); fail(err && err.type === 'peer-unavailable' ? gone : 'Could not connect (' + ((err && err.type) || 'unknown') + '). Try again.'); });
      p.on('open', () => {
        if (mine !== gen) return;
        const c = conn = p.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
        c.on('open', () => {
          if (mine !== gen) return; clearTimeout(timer); settled = true; mode = 'guest'; sock.connected = true; lastHeard = Date.now();
          pingTimer = setInterval(() => { if (Date.now() - lastHeard > 11000) return lost(mine); toHost('__ping'); }, 3000);
          toHost(ev, Object.assign({}, data, { code }), cb);
        });
        c.on('data', (d) => { if (mine !== gen) return; lastHeard = Date.now(); if (typeof d === 'string') deliver(d); });
        c.on('close', () => lost(mine)); c.on('error', () => lost(mine));
      });
    }
    // the host went quiet or the link dropped: tell the app, then let it try to take its seat back
    function lost(mine) {
      if (mine !== gen || mode !== 'guest') return;
      teardown(); fire('disconnect', 'transport close');
      setTimeout(() => fire('connect'), 1500);
    }
    window.addEventListener('pagehide', () => { if (peer) { try { peer.destroy(); } catch (e) { /* ignore */ } } }); // lets the others notice straight away
    setTimeout(() => fire('connect'), 0); // like a real socket: the app uses this to reclaim a saved seat after a refresh
    return sock;
  };
})();
