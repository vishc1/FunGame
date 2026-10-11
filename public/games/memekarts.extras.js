// Meme Karts add-ons that live OUTSIDE the renderer file on purpose, so work on the 3D renderer can't collide with them:
//   1. Sound effects, synthesised with WebAudio (no audio files). M toggles mute; the choice is remembered.
//   2. Test-mode item picker: when the room has bots, [ and ] hand you the previous / next item.
// It listens to the same socket messages the game does and never touches the renderer.
(function () {
  const G = window.G; if (!G) return;
  const ITEMS = [['green', 'Green shell'], ['triple', 'Triple shells'], ['red', 'Red shell'], ['blue', 'Blue shell'], ['tnt', 'TNT'], ['bomb', 'Bob-omb'], ['pad', 'Launch pad'], ['egg', 'Egg gun'], ['banana', 'Banana'], ['fake', 'Fake item box'], ['fire', 'Fire flower'], ['gun', 'Minigun'], ['mush', 'Boost mushroom'], ['star', 'Star'], ['boo', 'Boo ghost'], ['bolt', 'Lightning'], ['bill', 'Bullet Bill'], ['ink', 'Blooper']];
  let active = false, ac = null, master = null, eng = null, muted = false, me = null, prev = null, prevT = 0, itemIdx = -1, hinted = false;
  try { muted = localStorage.getItem('mk_mute') === '1'; } catch (e) { /* storage blocked */ }
  window.addEventListener('fg-sound', (e) => { muted = !!e.detail.muted; if (master) master.gain.value = muted ? 0 : 0.22; }); /* the lobby's Sound setting */
  const testMode = () => !!(G.room && G.room.players.some((p) => p.bot));

  // ---- audio ----
  function wake() {
    if (!active) return null;
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = muted ? 0 : 0.22; master.connect(ac.destination); } catch (e) { return null; } }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(f0, f1, dur, type = 'square', vol = 0.3, delay = 0) {
    if (!ac || muted) return; const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.4, cutoff = 1200, delay = 0) {
    if (!ac || muted) return; const t = ac.currentTime + delay, n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); src.buffer = buf; f.type = 'lowpass'; f.frequency.value = cutoff; g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master); src.start(t);
  }
  const SFX = {
    pickup: () => { tone(660, 660, 0.07, 'square', 0.18); tone(990, 990, 0.07, 'square', 0.18, 0.07); tone(1320, 1320, 0.12, 'square', 0.18, 0.14); },
    fire: () => tone(420, 160, 0.14, 'sawtooth', 0.22),
    gun: () => noise(0.05, 0.25, 3200),
    boom: (v = 1) => { noise(0.6, 0.7 * v, 700); tone(110, 35, 0.5, 'sine', 0.5 * v); },
    hurt: () => { noise(0.14, 0.45, 2200); tone(220, 110, 0.18, 'square', 0.2); },
    dead: () => tone(440, 55, 0.7, 'sawtooth', 0.25),
    kill: () => { tone(523, 523, 0.09, 'square', 0.2); tone(659, 659, 0.09, 'square', 0.2, 0.09); tone(784, 784, 0.09, 'square', 0.2, 0.18); tone(1047, 1047, 0.2, 'square', 0.2, 0.27); },
    boost: () => tone(180, 720, 0.45, 'sawtooth', 0.16),
    jump: () => tone(260, 780, 0.25, 'sine', 0.3),
    land: () => noise(0.12, 0.4, 500),
    slip: () => tone(900, 250, 0.35, 'sine', 0.3),
    bolt: () => { noise(0.9, 0.6, 5000); tone(90, 40, 0.8, 'sawtooth', 0.3); },
    ghost: () => { tone(500, 700, 0.3, 'sine', 0.2); tone(700, 400, 0.4, 'sine', 0.2, 0.3); },
    ink: () => tone(300, 90, 0.35, 'triangle', 0.3),
    warp: () => { tone(300, 1400, 0.22, 'sine', 0.3); tone(1400, 500, 0.25, 'triangle', 0.2, 0.18); },
    egg: () => { tone(700, 300, 0.12, 'triangle', 0.3); noise(0.08, 0.3, 2500, 0.05); },
  };
  const play = (name, arg) => { if (active && wake() && SFX[name]) SFX[name](arg); };
  function engine(speed, on) {
    if (!ac) return;
    if (!eng) { const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(); o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 420; g.gain.value = 0; o.connect(f); f.connect(g); g.connect(master); o.start(); eng = { o, g }; }
    eng.o.frequency.setTargetAtTime(52 + Math.min(520, speed) * 0.3, ac.currentTime, 0.08);
    eng.g.gain.setTargetAtTime(on && !muted ? 0.05 + Math.min(1, speed / 300) * 0.04 : 0, ac.currentTime, 0.1);
  }
  function setActive(on) {
    if (on === active) return; active = on; prev = null; me = null;
    if (!on) { if (eng) engine(0, false); hinted = false; return; }
    if (testMode() && !hinted) { hinted = true; setTimeout(() => active && G.toast('Test mode: [ and ] give you any item.  M mutes sound.'), 1500); }
  }

  // ---- socket hooks ----
  window.addEventListener('game-stopped', () => setActive(false));
  const s = G.socket;
  s.on('room', (r) => setActive(r.phase === 'playing' && r.gameId === 'memekarts'));
  s.on('game:start', (d) => setActive(d.gameId === 'memekarts'));
  s.on('disconnect', () => setActive(false));
  s.on('g:state', (st) => {
    if (!active || !st || !st.karts) return;
    const k = st.karts.find((q) => q.id === G.me), now = performance.now();
    if (k && prev && now > prevT) {
      const speed = Math.hypot(k.x - prev.x, k.y - prev.y) / ((now - prevT) / 1000);
      engine(speed, !k.dead);
      if ((k.mush && !prev.mush) || (k.bst && !prev.bst) || (k.star && !prev.star)) play('boost');
      if (k.air > 0 && !(prev.air > 0)) play('jump');
      if (k.ghost && !prev.ghost) play('ghost');
      if (k.egg > 0 && !(prev.egg > 0)) play('egg');
      if (k.dead && !prev.dead) play('dead');
    }
    prev = k || null; prevT = now; me = k || null;
  });
  s.on('g:event', (e) => {
    if (!active || !e) return;
    const mine = e.id === G.me;
    const near = (x, y) => (me ? Math.max(0.15, 1 - Math.hypot(me.x - x, me.y - y) / 700) : 0.5);
    if (e.type === 'pickup' && mine) play('pickup');
    else if (e.type === 'fire' && mine) play(e.weapon === 'gun' ? 'gun' : 'fire');
    else if (e.type === 'boom') play('boom', near(e.x, e.y));
    else if (e.type === 'kill') { play('boom', near(e.x, e.y)); if (e.killer === G.me) play('kill'); }
    else if (e.type === 'hit' && mine) play('hurt');
    else if (e.type === 'land') play('land');
    else if (e.type === 'warp' && mine) play('warp');
    else if (e.type === 'slip' && mine) play('slip');
    else if (e.type === 'bolt') play('bolt');
    else if (e.type === 'ink' && !mine) play('ink');
  });

  // ---- keys ----
  window.addEventListener('keydown', (ev) => {
    if (!active || ev.target.tagName === 'INPUT' || ev.repeat) return;
    wake();
    if (ev.key === 'm' || ev.key === 'M') { muted = !muted; try { localStorage.setItem('mk_mute', muted ? '1' : '0'); } catch (e) { /* ignore */ } if (master) master.gain.value = muted ? 0 : 0.22; G.toast(muted ? 'Sound off' : 'Sound on'); }
    if ((ev.key === '[' || ev.key === ']') && testMode()) { itemIdx = (itemIdx + (ev.key === ']' ? 1 : -1) + ITEMS.length * 2) % ITEMS.length; G.send({ type: 'give', weapon: ITEMS[itemIdx][0] }); G.toast('Test item: ' + ITEMS[itemIdx][1]); }
  });
  window.addEventListener('mousedown', () => wake());
})();
