// Peer-to-peer transport. Used where there is no always-on game server (static hosts such as Vercel).
// The room creator's browser runs the game (in a worker, see server/host-worker.js) and every other player connects
// straight to it with WebRTC. window.createP2PSocket() returns an object that looks like a Socket.IO socket
// (on / once / off / emit with callbacks / connected), so the rest of the client does not care which transport it has.
//
// The public PeerJS service is used only to introduce browsers to each other; game traffic does not pass through it.
// Trade-offs: the room lives in the creator's tab (if they close or refresh it the room ends), and a few very strict
// networks block direct connections.
(function () {
  // How browsers find a way to each other. STUN servers (free, no account) let most home networks link directly. PeerJS's
  // own relays are gone (their names no longer resolve, checked 2026-10-11), so relays for strict networks (mobile data,
  // schools, offices) come from window.FG_ICE, set at build time from the FG_ICE_SERVERS variable (see README).
  const ICE = () => ({ iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }].concat(Array.isArray(window.FG_ICE) ? window.FG_ICE : []), sdpSemantics: 'unified-plan' });
  const PREFIX = 'fgroom1-', ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const randomCode = () => Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
  let peerLib = null;
  const loadPeer = () => peerLib || (peerLib = new Promise((res, rej) => { if (window.Peer) return res(); const s = document.createElement('script'); s.src = '/vendor/peerjs.min.js'; s.onload = () => res(); s.onerror = () => { peerLib = null; rej(new Error('Could not load the connection library')); }; document.head.appendChild(s); }));

  window.createP2PSocket = function () {
    const handlers = {}, acks = new Map(), conns = new Map();
    let closed = false, mode = null, peer = null, worker = null, conn = null, ackSeq = 0, sidSeq = 0, lastHeard = 0, pingTimer = null, gen = 0, tabs = null;
    // Tabs of the same browser talk over a BroadcastChannel named after the room: no network at all, so a second tab on
    // the host's computer always gets in (WebRTC between two tabs of one machine needs a local-name lookup that some
    // machines block). Messages: {t:'hello'|'welcome'|'d'|'bye', gid, up?, s?}; `up` marks guest-to-host traffic.
    const tabChannel = (code) => { try { return new BroadcastChannel('fg-room-' + code); } catch (e) { return null; } };
    const fire = (ev, ...a) => { for (const fn of (handlers[ev] || []).slice()) { try { fn(...a); } catch (e) { console.error(e); } } };
    const sock = {
      connected: false, p2p: true, local: false, get hosting() { return mode === 'host'; },
      on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return sock; },
      once(ev, fn) { const w = (...a) => { sock.off(ev, w); fn(...a); }; return sock.on(ev, w); },
      off(ev, fn) { handlers[ev] = (handlers[ev] || []).filter((f) => f !== fn); return sock; },
      emit(ev, data, cb) {
        if (ev === 'create') return void startHost(data || {}, cb || (() => {}));
        if (ev === 'join' || ev === 'rejoin') return void startGuest(ev, data || {}, cb || (() => {}));
        if (mode === 'host') toWorker(ev, data, cb); else if (mode === 'guest') toHost(ev, data, cb); else if (cb) cb({ error: 'Not connected' });
        if (ev === 'leave' && mode === 'host') { setTimeout(() => { sayBye(); setTimeout(() => teardown(), 250); }, 120); return; } /* the room lives in this tab: tell everyone it closed, after the last room update */
        if (ev === 'leave' && mode) setTimeout(() => teardown(), 200); // let the goodbye go out first
      },
      connect() {}, disconnect() { teardown(); }, close() { teardown(); }, get _peer() { return peer; }, /* tools/p2p-keepalive.js */
    };
    function deliver(str) {
      let a; try { a = JSON.parse(str); } catch (e) { return; }
      if (!Array.isArray(a)) return; const [ev, data] = a;
      if (ev === '__ack') { const cb = acks.get(data[0]); if (cb) { acks.delete(data[0]); cb(data[1]); } return; }
      if (ev === '__pong') return;
      if (ev === 'room-closed') { closed = true; }
      fire(ev, data);
    }
    const withAck = (cb) => { if (!cb) return undefined; const id = ++ackSeq; acks.set(id, cb); return id; };
    const toWorker = (ev, data, cb) => worker.postMessage({ t: 'msg', sid: 'local', s: [ev, data, withAck(cb)] });
    const toHost = (ev, data, cb) => { try { conn.send(JSON.stringify([ev, data, withAck(cb)])); } catch (e) { /* connection is closing */ } };
    function sayBye() { const bye = JSON.stringify(['room-closed', { why: 'host-left' }]); for (const c of conns.values()) { try { if (c.open) c.send(bye); } catch (e) { /* closing */ } } }
    function teardown() {
      gen++; mode = null; sock.connected = false; clearInterval(pingTimer); pingTimer = null; acks.clear();
      if (worker) { worker.terminate(); worker = null; }
      for (const c of conns.values()) { try { c.close(); } catch (e) { /* already closed */ } } conns.clear();
      if (peer) { try { peer.destroy(); } catch (e) { /* already gone */ } peer = null; } conn = null;
      if (tabs) { try { tabs.close(); } catch (e) { /* ignore */ } tabs = null; }
    }

    // ---- hosting a room ----
    async function startHost(data, cb) {
      try { await loadPeer(); } catch (e) { return cb({ error: e.message }); }
      teardown(); const mine = ++gen;
      let code = null;
      if (data.local) { code = randomCode(); sock.local = true; } /* practice room: no introduction service, nothing leaves this browser */
      else { sock.local = false; for (let tries = 0; tries < 6 && !peer; tries++) {
        code = randomCode();
        try { peer = await new Promise((res, rej) => { const p = new window.Peer(PREFIX + code, { debug: 0, config: ICE() }); p.on('open', () => res(p)); p.on('error', (err) => { try { p.destroy(); } catch (e) { /* ignore */ } rej(err); }); }); }
        catch (err) { if (err && err.type !== 'unavailable-id') return cb({ error: 'Could not reach the connection service. Check your internet and try again.' }); }
        if (mine !== gen) { if (peer) peer.destroy(); return; }
      } }
      if (!peer && !data.local) return cb({ error: 'Could not open a room. Try again.' });
      mode = 'host'; sock.connected = true;
      worker = new Worker('/host-worker.js');
      worker.onerror = (e) => console.error('room host worker failed:', e.message);
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.t === 'emit') { for (const sid of m.sids) { if (sid === 'local') deliver(m.s); else { const c = conns.get(sid); if (c && c.open) { try { c.send(m.s); } catch (err) { /* that player is leaving */ } } } } }
        else if (m.t === 'kick') { const c = conns.get(m.sid); if (c) { conns.delete(m.sid); try { c.close(); } catch (err) { /* ignore */ } } }
      };
      if (peer) peer.on('connection', (c) => {
        const sid = 'c' + (++sidSeq), gone = () => { if (conns.get(sid) === c) { conns.delete(sid); if (worker) worker.postMessage({ t: 'close', sid }); } };
        c.on('open', () => { conns.set(sid, c); worker.postMessage({ t: 'open', sid }); });
        c.on('data', (d) => { if (worker && typeof d === 'string') worker.postMessage({ t: 'msg', sid, s: d }); });
        c.on('close', gone); c.on('error', gone);
      });
      // losing the link to the introduction service does not affect players already in; reconnect so new ones can still join
      if (peer) peer.on('disconnected', () => { const p = peer; setTimeout(() => { if (peer === p && mode === 'host' && !p.destroyed && p.disconnected) { try { p.reconnect(); } catch (e) { /* the keep-alive below retries */ } } }, 1500); });
      if (peer) peer.on('error', () => { /* e.g. a failed reconnect: the keep-alive below tries again */ });
      // Keep-alive. Chrome slows timers in a background tab to once a minute after a few minutes, so PeerJS's own heartbeat
      // stops and the service forgets the room: friends then cannot find it. A worker's timer is not slowed, so it drives a
      // heartbeat every 4 s and reconnects whenever the link has dropped, however often.
      if (peer) try { const hb = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 4000);'], { type: 'text/javascript' }))); const p = peer;
        hb.onmessage = () => { if (peer !== p || mode !== 'host' || p.destroyed) { hb.terminate(); return; } if (p.disconnected) { try { p.reconnect(); } catch (e) { /* next beat */ } } else { try { if (p.socket && p.socket.send) p.socket.send({ type: 'HEARTBEAT' }); } catch (e) { /* next beat */ } } };
      } catch (e) { /* no workers from blobs: PeerJS's own heartbeat still runs while the tab is visible */ }
      document.addEventListener('visibilitychange', () => { const p = peer; if (document.visibilityState === 'visible' && p && mode === 'host' && !p.destroyed && p.disconnected) { try { p.reconnect(); } catch (e) { /* keep-alive retries */ } } });
      tabs = tabChannel(code);
      if (tabs) { const bySid = new Map(); const ch = tabs;
        ch.onmessage = (e) => { const m = e.data; if (!m || !m.up || mode !== 'host' || tabs !== ch) return;
          if (m.t === 'hello') { const sid = 't' + (++sidSeq); const c = { open: true, send(s) { ch.postMessage({ t: 'd', gid: m.gid, s }); }, close() { c.open = false; ch.postMessage({ t: 'bye', gid: m.gid }); } };
            for (const [g, old] of bySid) if (g === m.gid) { conns.delete(old); worker.postMessage({ t: 'close', sid: old }); } /* that tab asked again */
            bySid.set(m.gid, sid); conns.set(sid, c); worker.postMessage({ t: 'open', sid }); ch.postMessage({ t: 'welcome', gid: m.gid }); }
          else { const sid = bySid.get(m.gid); if (!sid) return; if (m.t === 'd' && typeof m.s === 'string') worker.postMessage({ t: 'msg', sid, s: m.s }); else if (m.t === 'bye') { bySid.delete(m.gid); const c = conns.get(sid); if (c) { c.open = false; conns.delete(sid); } worker.postMessage({ t: 'close', sid }); } } }; }
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
      const ch = tabChannel(code);
      if (ch) { /* is the room hosted by another tab of this browser? */
        const gid = 'g' + Math.random().toString(36).slice(2, 10);
        const here = await new Promise((res) => { const t = setTimeout(() => res(false), 600); ch.onmessage = (e) => { const m = e.data; if (m && m.t === 'welcome' && m.gid === gid && !m.up) { clearTimeout(t); res(true); } }; ch.postMessage({ t: 'hello', gid, up: true }); });
        if (mine !== gen) { ch.close(); return; }
        if (here) { tabs = ch; mode = 'guest'; sock.connected = true; lastHeard = Date.now();
          conn = { open: true, send(s) { ch.postMessage({ t: 'd', gid, up: true, s }); }, close() { conn.open = false; try { ch.postMessage({ t: 'bye', gid, up: true }); } catch (e) { /* closed */ } } };
          ch.onmessage = (e) => { const m = e.data; if (mine !== gen || !m || m.up || m.gid !== gid) return; lastHeard = Date.now(); if (m.t === 'd' && typeof m.s === 'string') deliver(m.s); else if (m.t === 'bye') lost(mine); };
          pingTimer = setInterval(() => { if (Date.now() - lastHeard > 11000) return lost(mine); toHost('__ping'); }, 3000);
          const ask = setTimeout(() => { settled = false; fail('The room did not answer. Try again.'); }, 12000);
          toHost(ev, Object.assign({}, data, { code }), (r) => { clearTimeout(ask); settled = true; cb(r); }); return; }
        ch.close(); }
      const p = peer = new window.Peer({ debug: 0, config: ICE() });
      const timer = setTimeout(() => fail(window.FG_ICE && window.FG_ICE.length ? 'Could not reach the room. Your friend may have closed the game tab' : 'Could not link to your friend\'s browser. One of your networks blocks direct links (common on mobile data and school or work Wi-Fi). Try another network, such as home Wi-Fi'), 20000); /* relays can take a few seconds longer */
      p.on('error', (err) => { clearTimeout(timer); fail(err && err.type === 'peer-unavailable' ? gone : 'Could not connect (' + ((err && err.type) || 'unknown') + '). Try again.'); });
      p.on('open', () => {
        if (mine !== gen) return;
        const c = conn = p.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
        c.on('open', () => {
          if (mine !== gen) return; clearTimeout(timer); settled = true; mode = 'guest'; sock.connected = true; lastHeard = Date.now();
          pingTimer = setInterval(() => { if (Date.now() - lastHeard > 11000) return lost(mine); toHost('__ping'); }, 3000);
          const ask = setTimeout(() => { settled = false; fail('The room did not answer. Ask your friend to keep the game tab open, then try again.'); }, 12000); /* never leave Joining on screen forever */
          toHost(ev, Object.assign({}, data, { code }), (r) => { clearTimeout(ask); cb(r); });
        });
        c.on('data', (d) => { if (mine !== gen) return; lastHeard = Date.now(); if (typeof d === 'string') deliver(d); });
        c.on('close', () => lost(mine)); c.on('error', () => lost(mine));
      });
    }
    // the host went quiet or the link dropped: tell the app, then let it try to take its seat back
    function lost(mine) {
      if (mine !== gen || mode !== 'guest') return;
      if (closed) { closed = false; teardown(); return; } /* the host closed the room on purpose: nothing to reconnect to */
      teardown(); fire('disconnect', 'transport close');
      setTimeout(() => fire('connect'), 1500);
    }
    window.addEventListener('pagehide', () => { if (mode === 'host') sayBye(); if (mode === 'guest' && tabs && conn) conn.close(); if (peer) { try { peer.destroy(); } catch (e) { /* ignore */ } } }); // lets the others notice straight away
    setTimeout(() => fire('connect'), 0); // like a real socket: the app uses this to reclaim a saved seat after a refresh
    return sock;
  };
})();
