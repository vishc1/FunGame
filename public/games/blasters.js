// Toy Box Blasters client: first-person view (Three.js) + 2D HUD on the framework canvas.
// Movement is simulated HERE with the shared physics and reported to the server; hits are decided here and validated
// there (see server/games/blasters.js). Map, physics and weapons come from blasters.shared.js (window.BLASTERS).
//
// BLENDER MODELS: .glb files in public/models/ named fps_* replace the placeholders built below. See fps3d.md.
registerGame('blasters', (G) => {
  const B = window.BLASTERS, { MAP, WEAPONS, MELEE, POWERS, PICKUP_INFO, P } = B;
  const { ctx, canvas } = G;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 900, H = 600, s = null, T = null, failed = null, time = 0;
  const lerpAngle = (a, b, f) => a + ((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) * f;
  const nm = (id) => (id ? G.player(id).name : '?');
  const ls = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
  const lset = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } };

  // ---- progression (kept in this browser) ----
  let xp = +ls('tbb_xp', 0) || 0; const xpFor = (l) => Math.round(120 * Math.pow(l - 1, 1.7)), levelOf = (x) => { let l = 1; while (l < 99 && xpFor(l + 1) <= x) l++; return l; };
  let charIdx = (+ls('tbb_char', 0) || 0) % 8, skinIdx = +ls('tbb_skin', 0) || 0;
  // Skins are finishes for the figure's `Paint` material. `lvl` is the level that unlocks it.
  const SKINS = [
    { name: 'Classic', lvl: 1, css: 'var(--pc)' }, { name: 'Pastel', lvl: 2, css: 'linear-gradient(135deg,#fff,var(--pc))' }, { name: 'Midnight', lvl: 3, css: 'radial-gradient(circle,var(--pc) 0,#15181f 60%)' },
    { name: 'Chrome', lvl: 4, css: 'linear-gradient(135deg,#fff,#8a97a8,#fff,#6f7c8d)' }, { name: 'Neon', lvl: 5, css: 'radial-gradient(circle,#fff 0,var(--pc) 45%,#000 100%)' }, { name: 'Ice', lvl: 6, css: 'linear-gradient(135deg,#f4fdff,#8fd8ff)' },
    { name: 'Gold', lvl: 8, css: 'linear-gradient(135deg,#fff3b0,#ffb300,#8a5a00)' }, { name: 'Lava', lvl: 10, css: 'radial-gradient(circle,#ffd84d 0,#ff4d1f 45%,#2a0d05 100%)' }, { name: 'Rainbow', lvl: 12, css: 'conic-gradient(#ff5d5d,#ffd84d,#5ee07a,#4da6ff,#c77dff,#ff5d5d)' },
  ];
  const testRoom = () => !!(G.room && G.room.players.some((p) => p.bot)); // rooms with bots unlock everything so you can try it all
  const skinOpen = (i) => testRoom() || levelOf(xp) >= SKINS[i].lvl;
  if (!(skinIdx >= 0 && skinIdx < SKINS.length)) skinIdx = 0;
  const CHAR_NAMES = ['Knight', 'Astronaut', 'Pirate', 'Robot', 'Wizard', 'Ninja', 'Chef', 'Dino Kid'];
  const unlocked = () => (testRoom() ? 8 : Math.min(8, 2 + Math.floor(levelOf(xp) / 2)));
  const hello = () => G.send({ type: 'hello', lvl: levelOf(xp), ch: charIdx, sk: skinIdx });
  hello();

  // ---- local player ----
  const body = B.newBody(0, 0, 0);
  const me = { yaw: 0, pitch: 0, alive: false, w: 0, lastW: 0, mag: WEAPONS[0].mag, nextFire: 0, magHold: 0, drawT: 0, reloadEnd: 0, kick: 0, zoom: 0, bob: 0, spreadAdd: 0, eye: P.EYE, burstLeft: 0, burstT: 0, nextMelee: 0, meleeT: 0 };
  // settings (kept in this browser): mouse sensitivity multiplier and field of view
  let sensMul = Math.max(0.2, Math.min(4, +ls('tbb_sens', 1) || 1)), baseFov = Math.max(60, Math.min(105, +ls('tbb_fov', 78) || 78));
  const adsOf = (w) => WEAPONS[w].ads || 1.25;
  // current spread of the next dart: aiming and crouching tighten it, moving, jumping and holding the trigger widen it
  function curSpread() { const def = WEAPONS[me.w], aim = me.zoom > 0.7; let sp = def.zoom && !aim ? def.hipSpread : def.spread; if (!def.zoom || !aim) sp += Math.min(1, Math.hypot(body.vx, body.vz) / 7) * 0.008 + (body.ground ? 0 : 0.012) + me.spreadAdd; return sp * (aim ? 0.45 : 1) * (body.crouched && body.ground ? 0.7 : 1); }
  let locked = false, firing = false, zooming = false, jumpQ = false, dashQ = false, showScores = false, showGuide = false, sendT = 0, over = null;
  let hurtFlash = 0, hitMark = 0, hitKill = 0, shake = 0, card = null, muted = ls('mk_mute', '0') === '1';
  const feed = [], banners = [], dmgNums = [], hurtDirs = [];
  const banner = (text, color = '#ffd84d', t = 2) => { banners.unshift({ text, color, t, d: t }); if (banners.length > 3) banners.length = 3; };
  const showCard = (name, tip, color = '#ffd84d') => { card = { name, tip, color, t: 4.5 }; };
  const mySt = () => s && s.ps.find((p) => p.id === G.me);

  // ============================ sound (synthesised) ============================
  let ac = null, master = null;
  function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = muted ? 0 : 0.25; master.connect(ac.destination); } catch (e) { return null; } } if (ac.state === 'suspended') ac.resume(); return ac; }
  function tone(f0, f1, dur, type = 'square', vol = 0.3, delay = 0) { if (!ac || muted) return; const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02); }
  function noise(dur, vol = 0.4, cutoff = 1200, delay = 0) { if (!ac || muted) return; const t = ac.currentTime + delay, n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); src.buffer = buf; f.type = 'lowpass'; f.frequency.value = cutoff; g.gain.value = vol; src.connect(f); f.connect(g); g.connect(master); src.start(t); }
  const SFX = {
    burst: (v = 1) => { tone(1000, 420, 0.05, 'square', 0.15 * v); noise(0.04, 0.2 * v, 3400); }, lob: (v = 1) => { tone(200, 90, 0.2, 'sine', 0.35 * v); noise(0.1, 0.25 * v, 900); }, zap: (v = 1) => tone(1500, 1100, 0.05, 'sawtooth', 0.07 * v),
    swing: (v = 1) => noise(0.16, 0.35 * v, 1800), bonk: () => { tone(160, 70, 0.16, 'sine', 0.5); noise(0.06, 0.4, 2600); }, splash: (v = 1) => { noise(0.45, 0.6 * v, 2200); tone(300, 80, 0.25, 'sine', 0.3 * v); }, slide: () => noise(0.4, 0.22, 1200),
    dart: (v = 1) => { tone(900, 300, 0.07, 'square', 0.16 * v); noise(0.05, 0.2 * v, 3000); }, scatter: (v = 1) => { noise(0.22, 0.6 * v, 1400); tone(180, 60, 0.18, 'sawtooth', 0.3 * v); },
    rapid: (v = 1) => { tone(700, 380, 0.045, 'square', 0.12 * v); noise(0.035, 0.18 * v, 3600); }, long: (v = 1) => { noise(0.3, 0.55 * v, 5000); tone(1400, 120, 0.3, 'sawtooth', 0.25 * v); },
    boom: (v = 1) => { noise(0.25, 0.4 * v, 700); tone(240, 90, 0.25, 'sine', 0.4 * v); }, explode: (v = 1) => { noise(0.7, 0.8 * v, 600); tone(100, 30, 0.6, 'sine', 0.6 * v); },
    hit: () => tone(1250, 1250, 0.035, 'square', 0.14), head: () => { tone(1700, 1700, 0.05, 'square', 0.16); tone(2300, 2300, 0.07, 'square', 0.14, 0.05); },
    kill: () => { tone(660, 660, 0.07, 'square', 0.2); tone(880, 880, 0.07, 'square', 0.2, 0.07); tone(1320, 1320, 0.16, 'square', 0.2, 0.14); },
    hurt: () => { noise(0.12, 0.4, 1800); tone(200, 110, 0.14, 'square', 0.18); }, dead: () => tone(400, 50, 0.7, 'sawtooth', 0.25),
    pickup: () => { tone(700, 700, 0.06, 'square', 0.16); tone(1050, 1050, 0.1, 'square', 0.16, 0.06); }, power: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.12, 'square', 0.2, i * 0.08)); },
    soon: () => { tone(880, 880, 0.12, 'sine', 0.25); tone(880, 880, 0.12, 'sine', 0.25, 0.22); }, pad: () => tone(220, 900, 0.3, 'sine', 0.3), jump: () => tone(300, 480, 0.08, 'sine', 0.12), dash: () => noise(0.16, 0.3, 2500),
    whistle: (v = 1) => { tone(660, 640, 0.5, 'triangle', 0.3 * v); tone(830, 810, 0.5, 'triangle', 0.25 * v); tone(660, 640, 0.35, 'triangle', 0.3 * v, 0.6); tone(830, 810, 0.35, 'triangle', 0.25 * v, 0.6); },
    bell: () => { for (let i = 0; i < 6; i++) tone(i % 2 ? 990 : 1320, i % 2 ? 990 : 1320, 0.12, 'square', 0.18, i * 0.22); }, tele: () => { tone(300, 1500, 0.2, 'sine', 0.3); tone(1500, 600, 0.22, 'triangle', 0.2, 0.16); }, kick: () => tone(180, 520, 0.22, 'triangle', 0.3),
    reload: () => { tone(500, 500, 0.03, 'square', 0.12); tone(760, 760, 0.04, 'square', 0.12, 0.18); }, empty: () => tone(240, 240, 0.04, 'square', 0.12), medal: () => { tone(784, 784, 0.08, 'square', 0.22); tone(1175, 1175, 0.2, 'square', 0.22, 0.09); },
  };
  const play = (name, arg) => { if (audio() && SFX[name]) SFX[name](arg); };

  // ============================ 3D ============================
  function create3D() {
    const THREE = window.THREE;
    const gl = document.createElement('canvas'); gl.style.cssText = 'position:absolute;z-index:0;';
    canvas.parentNode.insertBefore(gl, canvas);
    const prev = { bg: canvas.style.background, pos: canvas.style.position, cur: canvas.style.cursor };
    canvas.style.background = 'transparent'; canvas.style.position = 'relative'; canvas.style.cursor = 'crosshair';
    const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; // Update once for the world, never again for the weapon-only pass.
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(78, 1.5, 0.05, 400);
    camera.rotation.order = 'YXZ'; scene.add(camera);
    /* Your own blaster stays attached to the camera but lives on render layer 1. It is drawn in a second pass with a
       fresh depth buffer and a fixed field of view, so a wall you stand against cannot cut it off and zooming does not
       magnify it. VM_LAYER objects are skipped in the world pass. */
    const VM_LAYER = 1;
    renderer.autoClear = false;
    let fw = 0, fh = 0, fl = -1, ft = -1, built = false;
    let environmentTarget = null;
    try { if (window.RoomEnvironment) { const pm = new THREE.PMREMGenerator(renderer), room = new window.RoomEnvironment(); environmentTarget = pm.fromScene(room, 0.05); scene.environment = environmentTarget.texture; scene.environmentIntensity = 0.42; room.dispose(); pm.dispose(); } } catch (e) { /* reflections are optional */ }

    const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
    const M3 = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.7, metalness: 0.05, flatShading: true }, o));
    const mesh = (geo, m, x = 0, y = 0, z = 0) => { const k = new THREE.Mesh(geo, m); k.position.set(x, y, z); k.castShadow = true; k.receiveShadow = true; return k; };
    const bx = (w, h, d, m, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z);
    const cyl = (rt, rb, h, m, x, y, z, seg = 12) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z);
    const sph = (r, m, x, y, z, seg = 12) => mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)), m, x, y, z);
    const glow = (color, i = 2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(i) });
    const softDisc = tex(64,64,(c,w,h)=>{ const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'#ffffffff');g.addColorStop(.3,'#ffffffb0');g.addColorStop(1,'#ffffff00');c.fillStyle=g;c.fillRect(0,0,w,h); });
    const paperGrain = tex(128,128,(c,w,h)=>{ let seed=73;for(let y=0;y<h;y++)for(let x=0;x<w;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=215+(seed%40);c.fillStyle=`rgb(${v},${v},${v})`;c.fillRect(x,y,1,1);} });
    paperGrain.colorSpace=THREE.NoColorSpace;paperGrain.wrapS=paperGrain.wrapT=THREE.RepeatWrapping;
    function finishArenaSurface(o) {
      if(!o.isMesh)return;
      o.castShadow=o.receiveShadow=true;
      if(!/Cardboard|Paper tape|Book pages|Playmat/.test(o.material.name))return;
      o.material=o.material.clone();o.material.bumpMap=paperGrain;o.material.bumpScale=.024;o.material.roughness=.9;
      if(!o.geometry.attributes.uv){
        o.geometry=o.geometry.clone();const p=o.geometry.attributes.position,uv=new Float32Array(p.count*2);
        for(let i=0;i<p.count;i++){uv[i*2]=p.getX(i)/4;uv[i*2+1]=p.getZ(i)/4;}
        o.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
      }
    }

    // ---- optional Blender models (public/models/fps_*.glb) ----
    const MODELS = {}; let assetsReady = false;
    fetch('/models/list').then((r) => r.json()).then((files) => {
      files = files.filter((f) => /^fps_/i.test(f)); if (!files.length || !window.GLTFLoader) { assetsReady = true; return; }
      const loader = new window.GLTFLoader(); let left = files.length; const done = () => { if (--left <= 0) assetsReady = true; };
      for (const f of files) loader.load('/models/' + f, (g) => { MODELS[f.replace(/\.(glb|gltf)$/i, '').toLowerCase()] = g.scene; done(); }, undefined, done);
    }).catch(() => { assetsReady = true; });
    setTimeout(() => { assetsReady = true; }, 6000);
    // Clone of models/<name>.glb. fit:
    //   default  scaled so the longest horizontal side = size, centred, sitting on y = 0
    //   'h'      a figure: scaled so the centre of its `head_core` mesh is 1.56 m up (where the head hitbox is) and centred
    //            under the head, so a tall hat or an outstretched arm cannot shrink or shift the body. Falls back to
    //            "total height = size" when the model has no head_core.
    //   'raw'    used exactly as authored (1 unit = 1 m, origin kept): blasters, whose origin is the bottom of the grip
    function asset(name, size, fit, color) {
      const src = MODELS[name]; if (!src) return null;
      const o = src.clone(true), g = new THREE.Group(); g.add(o);
      const bb = new THREE.Box3().setFromObject(o), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
      let sc = size / Math.max(fit === 'h' ? sz.y : Math.max(sz.x, sz.z), 0.0001);
      if (fit === 'h') { const head = o.getObjectByName('head_core'); if (head) { const hc = new THREE.Box3().setFromObject(head).getCenter(new THREE.Vector3()); if (hc.y - bb.min.y > 0.01) { sc = 1.56 / (hc.y - bb.min.y); c.x = hc.x; c.z = hc.z; } } }
      if (fit === 'raw') { sc = 1; c.set(0, 0, 0); bb.min.y = 0; }
      o.scale.multiplyScalar(sc); o.position.set(o.position.x * sc - c.x * sc, o.position.y * sc - bb.min.y * sc, o.position.z * sc - c.z * sc);
      o.traverse((m) => { if (!m.isMesh) return; m.castShadow = m.receiveShadow = true; m.material = m.material.clone(); if (color && /paint|player/i.test(m.material.name || '')) m.material.color.set(color); });
      return g;
    }

    // ---- world ----
    const COLORS = { wall: '#c9a06a', tower: '#e2685a', bridge: '#9a7650', plat: '#9a7650', pillar: '#6f84b0', step: '#dcb98a', fort: '#5b8fd9', rail: '#f2d16b', crate: '#b98b54', lowwall: '#78c088' };
    const pickViews = [], padViews = [], teleViews = [], trainLamps = [], TELE_COLORS = ['#35e6ff', '#c77dff', '#ffd84d']; let trainView = null;
    function buildWorld() {
      built = true;
      scene.background = tex(16, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5aa7ff'); g.addColorStop(0.6, '#bfe3ff'); g.addColorStop(1, '#fff3da'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
      scene.fog = new THREE.Fog(0xdfeeff, 65, 240);
      { const hemi = new THREE.HemisphereLight(0xdcecff, 0x807058, .85); hemi.layers.enableAll(); scene.add(hemi); }
      const sun = new THREE.DirectionalLight(0xffe8c4, 3.0); sun.position.set(-36, 48, 28); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 5, far: 160 }); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.025; sun.layers.enableAll(); scene.add(sun);
      const rim=new THREE.DirectionalLight(0xb4d8ff,.55);rim.position.set(30,22,-40);rim.layers.enableAll();scene.add(rim);
      // play-mat floor
      const S = MAP.size, mat = tex(1024, 1024, (c, w, h) => {
        c.fillStyle = '#7fb77e'; c.fillRect(0, 0, w, h);
        for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { c.fillStyle = (i + j) % 2 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)'; c.fillRect(i * 64, j * 64, 64, 64); }
        c.strokeStyle = '#f4f1e4'; c.lineWidth = 10; c.setLineDash([40, 28]); c.strokeRect(70, 70, w - 140, h - 140); c.setLineDash([]); c.beginPath(); c.arc(w / 2, h / 2, 190, 0, 7); c.stroke();
        c.strokeStyle = 'rgba(40,40,60,.25)'; c.lineWidth = 34; c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.stroke();
        c.strokeStyle = '#ffd84d'; c.lineWidth = 4; c.setLineDash([24, 24]); c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.stroke(); c.setLineDash([]);
      });
      const arena = MODELS.fps_arena ? MODELS.fps_arena.clone(true) : null; /* fps_arena.glb: 1 unit = 1 m, origin at the arena centre, replaces floor + boxes */
      if (arena) { arena.traverse(finishArenaSurface); scene.add(arena); }
      const floor = mesh(new THREE.PlaneGeometry(S * 2, S * 2), new THREE.MeshStandardMaterial({ map: mat, roughness: 0.95 })); floor.rotation.x = -Math.PI / 2; floor.castShadow = false; if (!arena) scene.add(floor);
      const out = mesh(new THREE.PlaneGeometry(600, 600), M3('#b08a5e', { roughness: 1 }), 0, -0.05, 0); out.rotation.x = -Math.PI / 2; out.castShadow = false; scene.add(out);
      // map boxes
      const mats = {}, matOf = (t) => (mats[t] = mats[t] || M3(COLORS[t] || '#aaaaaa'));
      const tape = tex(256, 256, (c, w, h) => { c.fillStyle = '#c9a06a'; c.fillRect(0, 0, w, h); for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(90,60,30,${Math.random() * 0.12})`; c.fillRect(Math.random() * w, Math.random() * h, 30, 2); } c.fillStyle = 'rgba(230,200,150,.8)'; c.fillRect(0, 108, w, 40); });
      tape.wrapS = tape.wrapT = THREE.RepeatWrapping; tape.repeat.set(8, 1);
      const edge = new THREE.LineBasicMaterial({ color: 0x3a2d22, transparent: true, opacity: 0.45 });
      for (const b of arena ? [] : MAP.boxes) {
        const w = b.x1 - b.x0, h = b.y1 - b.y0, d = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, cz = (b.z0 + b.z1) / 2;
        const custom = b.t === 'crate' ? asset('fps_crate', 1) : null;
        if (custom) { const bb = new THREE.Box3().setFromObject(custom), sz = bb.getSize(new THREE.Vector3()); custom.scale.set(w / sz.x, h / sz.y, d / sz.z); custom.position.set(cx, b.y0, cz); scene.add(custom); continue; }
        const m = bx(w, h, d, b.t === 'wall' ? new THREE.MeshStandardMaterial({ map: tape, roughness: 0.9 }) : matOf(b.t), cx, cy, cz); scene.add(m);
        if (b.t !== 'wall' && b.t !== 'step') { const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), edge); e.position.copy(m.position); scene.add(e); }
      }
      // jump pads
      for (const pad of MAP.pads) {
        const g = new THREE.Group(), col = pad.big ? '#ff7a3d' : '#35e6ff';
        g.add(cyl(pad.r, pad.r * 1.1, 0.12, M3('#27303f'), 0, 0.06, 0, 20)); const disc = mesh(new THREE.CylinderGeometry(pad.r * 0.78, pad.r * 0.78, 0.04, 20), glow(col, 1.8), 0, 0.14, 0); disc.castShadow = false; g.add(disc);
        const ar = mesh(new THREE.ConeGeometry(0.28, 0.5, 4), glow('#ffffff', 2), 0, 0.6, 0); ar.castShadow = false; g.add(ar);
        g.position.set(pad.x, pad.y, pad.z); padViews.push({ g, ar }); scene.add(g);
      }
      // ramps: a wedge under each slope. Launch ramps are orange with a glowing lip.
      for (const r of MAP.ramps) {
        const lo = r.dir > 0 ? (r.ax === 'x' ? r.x0 : r.z0) : (r.ax === 'x' ? r.x1 : r.z1), hi = r.dir > 0 ? (r.ax === 'x' ? r.x1 : r.z1) : (r.ax === 'x' ? r.x0 : r.z0);
        const P3 = (along, side, y) => (r.ax === 'x' ? [along, y, side ? r.z1 : r.z0] : [side ? r.x1 : r.x0, y, along]);
        const A = P3(lo, 0, r.y0), Bq = P3(lo, 1, r.y0), C = P3(hi, 0, r.y1), D = P3(hi, 1, r.y1), E = P3(hi, 0, r.y0), F = P3(hi, 1, r.y0);
        const tris = [A, Bq, D, A, D, C, C, D, F, C, F, E, A, C, E, Bq, F, D, A, E, F, A, F, Bq].flat();
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3)); geo.computeVertexNormals();
        const launch = r.kind === 'launch', m = mesh(geo, M3(launch ? '#ff8a3d' : '#c9a373', { side: THREE.DoubleSide, roughness: 0.8 })); scene.add(m);
        scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x3a2d22, transparent: true, opacity: 0.55 })));
        const w = r.ax === 'x' ? r.z1 - r.z0 : r.x1 - r.x0, mid = r.ax === 'x' ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
        const lip = bx(r.ax === 'x' ? 0.14 : w, 0.08, r.ax === 'x' ? w : 0.14, glow(launch ? '#ffe27a' : '#f4ead8', launch ? 2.2 : 1), r.ax === 'x' ? hi : mid, r.y1 + 0.03, r.ax === 'x' ? mid : hi); lip.castShadow = false; scene.add(lip);
        for (let k = 1; k <= 3; k++) { const u = k / 4, along = lo + (hi - lo) * u, y = r.y0 + (r.y1 - r.y0) * u + 0.03, st = bx(r.ax === 'x' ? 0.1 : w * 0.7, 0.03, r.ax === 'x' ? w * 0.7 : 0.1, M3(launch ? '#fff3c4' : '#8d6e4a'), r.ax === 'x' ? along : mid, y, r.ax === 'x' ? mid : along); st.castShadow = false; scene.add(st); }
      }
      // teleporters
      MAP.teles.forEach((pair, i) => pair.forEach((e) => {
        const col = new THREE.Color(TELE_COLORS[i % TELE_COLORS.length]), g = new THREE.Group();
        const ring = mesh(new THREE.TorusGeometry(0.95, 0.09, 8, 32), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.2) }), 0, 0.08, 0); ring.rotation.x = Math.PI / 2; ring.castShadow = false;
        const disc = mesh(new THREE.CircleGeometry(0.9, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }), 0, 0.05, 0); disc.rotation.x = -Math.PI / 2; disc.castShadow = false;
        const beam = mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.4, 24, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }), 0, 1.2, 0); beam.castShadow = false;
        g.add(disc, ring, beam); g.position.set(e.x, e.y, e.z); teleViews.push({ g, ring, beam, col: TELE_COLORS[i % TELE_COLORS.length], e }); scene.add(g);
      }));
      // toy train: rails across the middle road, tunnel mouths in the walls, and the train itself
      { const S2 = MAP.size, TRd = MAP.train, rail = M3('#3a3f4a', { metalness: 0.6, roughness: 0.4 }), tie = M3('#7a5a3a');
        for (const zz of [-0.62, 0.62]) { const rl = bx(S2 * 2, 0.07, 0.1, rail, 0, 0.05, TRd.z + zz); rl.castShadow = false; scene.add(rl); }
        const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.04, 1.7), tie, 64), o = new THREE.Object3D(); for (let i = 0; i < 64; i++) { o.position.set(-S2 + 0.5 + i, 0.025, TRd.z); o.updateMatrix(); ties.setMatrixAt(i, o.matrix); } ties.receiveShadow = true; scene.add(ties);
        for (const sx of [-1, 1]) { scene.add(bx(0.3, 2.7, 3, M3('#14161c'), sx * (S2 - 0.12), 1.35, TRd.z), bx(0.36, 0.3, 3.5, glow('#ffd84d', 1.2), sx * (S2 - 0.14), 2.85, TRd.z)); const lamp = sph(0.2, glow('#ff3b3b', 2.5), sx * (S2 - 0.4), 3.25, TRd.z, 10); lamp.castShadow = false; scene.add(lamp); trainLamps.push(lamp); }
        const customTrain = asset('fps_train', TRd.len); /* optional model: nose along Blender +Y, fitted to the train's length */
        const tg = new THREE.Group(), red = M3('#e23b3b', { roughness: 0.4 }), blk = M3('#22262e', { roughness: 0.5 }), gold = M3('#ffd84d', { metalness: 0.5, roughness: 0.3 }), wheel = (x, zz) => { const c = cyl(0.42, 0.42, 0.16, blk, x, 0.42, zz, 14); c.rotation.x = Math.PI / 2; return c; };
        tg.add(bx(3.1, 0.5, 1.7, blk, -1.6, 0.55, 0)); const boiler = cyl(0.72, 0.72, 2.0, red, -1.2, 1.5, 0, 16); boiler.rotation.z = Math.PI / 2; tg.add(boiler, bx(1.15, 1.7, 1.75, red, -2.6, 1.6, 0), bx(1.35, 0.14, 1.95, blk, -2.6, 2.5, 0), cyl(0.2, 0.28, 0.75, blk, -0.55, 2.35, 0, 10), cyl(0.3, 0.2, 0.2, gold, -0.55, 2.8, 0, 10), sph(0.26, glow('#fff2b0', 2.6), -0.12, 1.5, 0, 10));
        const cow = mesh(new THREE.ConeGeometry(0.9, 0.9, 4), gold, 0.15, 0.5, 0); cow.rotation.z = -Math.PI / 2; cow.rotation.x = Math.PI / 4; tg.add(cow);
        for (const x of [-0.6, -1.6, -2.7]) tg.add(wheel(x, 0.82), wheel(x, -0.82));
        [['#4da6ff', -4.95], ['#5ee07a', -8.0]].forEach(([c, x]) => { tg.add(bx(2.75, 0.4, 1.7, blk, x, 0.55, 0), bx(2.6, 1.25, 1.65, M3(c, { roughness: 0.45 }), x, 1.35, 0), bx(2.7, 0.12, 1.75, M3('#f4f4f4'), x, 2.0, 0), bx(0.5, 0.14, 0.2, blk, x + 1.55, 0.6, 0)); for (const wx of [x - 0.85, x + 0.85]) tg.add(wheel(wx, 0.82), wheel(wx, -0.82)); });
        if (customTrain) { tg.clear(); customTrain.rotation.y = -Math.PI / 2; customTrain.position.x = -TRd.len / 2; tg.add(customTrain); } else tg.scale.setScalar(0.85); /* fits under the 2.5 m tunnel ceiling */
        tg.visible = false; trainView = { g: tg, x: 0 }; scene.add(tg); }
      // pickups
      MAP.pickups.forEach((pk, i) => {
        const g = new THREE.Group(), item = pickupModel(pk); g.add(item);
        const ringCol = pk.kind === 'power' ? '#ffffff' : pk.kind === 'weapon' ? '#ffb347' : pk.kind === 'armor' ? '#4da6ff' : '#5ee07a';
        const ring = mesh(new THREE.RingGeometry(0.55, 0.7, 24), new THREE.MeshBasicMaterial({ color: ringCol, transparent: true, opacity: 0.6, side: THREE.DoubleSide }), 0, 0.03, 0); ring.rotation.x = -Math.PI / 2; ring.castShadow = false;
        const base = new THREE.Group(); base.add(ring); base.position.set(pk.x, pk.y, pk.z); scene.add(base);
        g.position.set(pk.x, pk.y + 0.9, pk.z); pickViews.push({ g, item, pk, i, kind: null }); scene.add(g);
      });
      // giant toys outside the walls: you are toy-sized in a playroom
      const blockCols = ['#ff5d5d', '#4da6ff', '#ffd84d', '#5ee07a', '#c77dff', '#ff9f43'];
      for (let i = 0; i < 22; i++) { const a = (i / 22) * Math.PI * 2 + Math.random() * 0.2, r = 58 + Math.random() * 40, sz = 9 + Math.random() * 10, col = blockCols[i % 6];
        const letter = tex(128, 128, (c, w, h) => { c.fillStyle = col; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 10; c.strokeRect(10, 10, w - 20, h - 20); c.fillStyle = '#fff'; c.font = '900 84px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ABCDEFGHJKLMNPRSTUWXYZ'[i], w / 2, h / 2 + 6); });
        const blk = bx(sz, sz, sz, new THREE.MeshStandardMaterial({ map: letter, roughness: 0.6 }), Math.cos(a) * r, sz / 2 - 0.05, Math.sin(a) * r); blk.rotation.y = Math.random() * 3; scene.add(blk);
        if (i % 3 === 0) { const b2 = bx(sz * 0.8, sz * 0.8, sz * 0.8, M3(blockCols[(i + 2) % 6]), Math.cos(a) * r, sz + sz * 0.4, Math.sin(a) * r); b2.rotation.y = Math.random() * 3; scene.add(b2); } }
      for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.4, r = 50 + (i % 3) * 14, ball = sph(5 + (i % 3) * 2, M3(blockCols[(i + 3) % 6], { roughness: 0.3 }), Math.cos(a) * r, 5 + (i % 3) * 2, Math.sin(a) * r, 18); scene.add(ball); }
      for (let i = 0; i < 8; i++) { const a = i * 0.8 + 0.2, r = 46 + (i % 2) * 20, cr = cyl(1.3, 1.3, 26, M3(blockCols[i % 6]), Math.cos(a) * r, 1.3, Math.sin(a) * r, 8); cr.rotation.z = Math.PI / 2; cr.rotation.y = a * 2; scene.add(cr); const tip = mesh(new THREE.ConeGeometry(1.3, 3, 8), M3('#f2e3c4'), 0, 14.5, 0); cr.add(tip); }
      scene.add(points);
    }
    // weapon model (also used in hand and as a pickup). Points toward -z.
    function weaponModel(w, big) {
      const id = WEAPONS[w].id, custom = asset('fps_w_' + id, 1, 'raw');
      if (custom) { /* authored with the origin at the bottom of the grip and the barrel 0.27 m above it; lift it so the barrel line passes through our origin, like the placeholder */
        const g = new THREE.Group(); custom.position.y = -0.27; g.add(custom); if (big) g.scale.setScalar(1.3); g.userData.custom = true; return g; }
      const g = new THREE.Group(), O = M3('#ff8a3d', { roughness: 0.4 }), Bl = M3('#3b6cff', { roughness: 0.4 }), Y = M3('#ffd84d', { roughness: 0.4 }), D = M3('#2a2f3a'), Wt = M3('#f4f4f4');
      if (id === 'dart') g.add(bx(0.07, 0.11, 0.34, O, 0, 0, -0.05), bx(0.06, 0.16, 0.08, Bl, 0, -0.1, 0.07), cyl(0.028, 0.028, 0.16, Y, 0, 0.02, -0.28, 8), bx(0.02, 0.03, 0.03, D, 0, 0.07, 0.05));
      else if (id === 'scatter') g.add(bx(0.11, 0.1, 0.5, Bl, 0, 0, -0.1), bx(0.06, 0.16, 0.09, O, 0, -0.1, 0.1), bx(0.13, 0.07, 0.16, Y, 0, -0.07, -0.18), cyl(0.045, 0.06, 0.14, O, 0, 0, -0.42, 8), bx(0.07, 0.09, 0.2, D, 0, -0.01, 0.22));
      else if (id === 'rapid') g.add(bx(0.08, 0.12, 0.46, Y, 0, 0, -0.08), bx(0.06, 0.15, 0.08, D, 0, -0.1, 0.08), cyl(0.09, 0.09, 0.07, O, 0, -0.1, -0.1, 12), cyl(0.025, 0.025, 0.2, D, 0, 0.01, -0.4, 8), bx(0.04, 0.05, 0.12, O, 0, 0.09, -0.05));
      else if (id === 'long') g.add(bx(0.07, 0.09, 0.62, Wt, 0, 0, -0.12), cyl(0.022, 0.022, 0.5, Bl, 0, 0.01, -0.62, 8), cyl(0.035, 0.035, 0.26, D, 0, 0.09, -0.08, 10), bx(0.06, 0.15, 0.08, O, 0, -0.1, 0.1), bx(0.06, 0.1, 0.26, Bl, 0, -0.02, 0.26));
      else if (id === 'burst') g.add(bx(0.07, 0.11, 0.5, M3('#5ee07a', { roughness: 0.4 }), 0, 0, -0.1), bx(0.05, 0.05, 0.22, D, 0, 0.02, -0.42), bx(0.06, 0.16, 0.08, O, 0, -0.1, 0.08), bx(0.06, 0.14, 0.07, D, 0, -0.11, -0.14), bx(0.03, 0.04, 0.16, Y, 0, 0.08, -0.05), bx(0.06, 0.08, 0.2, D, 0, -0.01, 0.24));
      else if (id === 'lob') g.add(cyl(0.11, 0.11, 0.4, M3('#35c8ff', { roughness: 0.35 }), 0, 0.01, -0.12, 12), cyl(0.13, 0.11, 0.1, Wt, 0, 0.01, -0.36, 12), sph(0.1, M3('#ff5d8a', { roughness: 0.3 }), 0, 0.01, -0.42, 10), bx(0.06, 0.16, 0.08, D, 0, -0.13, 0.04), bx(0.07, 0.09, 0.18, O, 0, 0, 0.16));
      else if (id === 'zap') g.add(bx(0.08, 0.1, 0.36, M3('#c77dff', { roughness: 0.35 }), 0, 0, -0.06), cyl(0.05, 0.05, 0.05, Wt, 0, 0, -0.27, 10), cyl(0.065, 0.065, 0.04, Wt, 0, 0, -0.34, 10), cyl(0.05, 0.05, 0.04, Wt, 0, 0, -0.4, 10), sph(0.045, glow('#7df9ff', 2.4), 0, 0, -0.46, 8), bx(0.06, 0.16, 0.08, D, 0, -0.1, 0.07), sph(0.06, glow('#7df9ff', 1.6), 0, 0.08, 0.02, 8));
      else g.add(cyl(0.085, 0.085, 0.72, O, 0, 0, -0.1, 12), cyl(0.11, 0.085, 0.12, Y, 0, 0, -0.5, 12), bx(0.06, 0.14, 0.08, D, 0, -0.12, 0.02), bx(0.06, 0.14, 0.08, D, 0, -0.12, -0.24), cyl(0.1, 0.1, 0.05, Bl, 0, 0, 0.24, 12));
      g.traverse((m) => { if (m.isMesh && m.geometry.type === 'CylinderGeometry') m.rotation.x = Math.PI / 2; });
      if (big) g.scale.setScalar(1.7);
      return g;
    }
    function pickupModel(pk, powerKind) {
      const g = new THREE.Group();
      if (pk.kind === 'weapon') { const w = weaponModel(pk.w, true); w.rotation.z = 0.25; g.add(w); return g; }
      const custom = asset(pk.kind === 'health' ? 'fps_health' : pk.kind === 'mega' ? 'fps_mega' : pk.kind === 'armor' ? 'fps_armor' : 'fps_power', pk.kind === 'mega' || pk.kind === 'power' ? 0.9 : 0.6);
      if (custom && pk.kind !== 'power') { custom.position.y = -0.3; g.add(custom); return g; }
      if (pk.kind === 'health') g.add(bx(0.46, 0.3, 0.3, M3('#ffffff')), bx(0.3, 0.1, 0.32, glow('#ff4d4d', 1.4)), bx(0.1, 0.24, 0.32, glow('#ff4d4d', 1.4)));
      else if (pk.kind === 'mega') g.add(bx(0.8, 0.5, 0.5, M3('#ff5d5d', { roughness: 0.35 })), bx(0.82, 0.1, 0.52, M3('#ffffff')), bx(0.5, 0.14, 0.54, glow('#ffffff', 1.6)), bx(0.14, 0.4, 0.54, glow('#ffffff', 1.6)), cyl(0.06, 0.06, 0.4, M3('#333'), 0, 0.32, 0, 6));
      else if (pk.kind === 'armor') { g.add(bx(0.6, 0.62, 0.2, M3('#4da6ff', { roughness: 0.4 })), bx(0.2, 0.62, 0.24, M3('#2f6fd0')), bx(0.62, 0.12, 0.24, M3('#ffd84d'))); }
      else { const col = POWERS[powerKind || 'mega'].color; const gem = mesh(new THREE.OctahedronGeometry(0.45, 0), glow(col, 2.4)); gem.castShadow = false; const halo = mesh(new THREE.TorusGeometry(0.72, 0.05, 6, 28), glow('#ffffff', 2)); halo.castShadow = false; g.add(gem, halo); g.userData.halo = halo; }
      return g;
    }

    // ---- toy figures ----
    function buildFigure(color, ch, sk = 0) {
      const g = new THREE.Group(), parts = {};
      const custom = asset('fps_char_' + (ch % 8), 1.8, 'h', color) || asset('fps_char', 1.8, 'h', color);
      let hand = null;
      if (custom) { custom.rotation.y = Math.PI; g.add(custom); parts.custom = custom; g.updateMatrixWorld(true); const h = custom.getObjectByName('right_hand'); if (h) hand = new THREE.Box3().setFromObject(h).getCenter(new THREE.Vector3()); }
      else {
        const C = M3(color, { roughness: 0.45 }); C.name = 'Paint'; const Dk = M3('#2b303b'), Sk = M3('#f2c79b'), Wt = M3('#f4f4f4'), Gd = M3('#ffd84d', { metalness: 0.5, roughness: 0.3 }), Gy = M3('#9aa3b5', { metalness: 0.6, roughness: 0.35 });
        parts.legL = bx(0.24, 0.72, 0.28, Dk, -0.15, 0.36, 0); parts.legR = bx(0.24, 0.72, 0.28, Dk, 0.15, 0.36, 0);
        const torso = bx(0.66, 0.62, 0.38, C, 0, 1.03, 0), belt = bx(0.68, 0.08, 0.4, Dk, 0, 0.76, 0);
        parts.armL = bx(0.18, 0.56, 0.2, C, -0.44, 1.02, 0); parts.armR = bx(0.18, 0.2, 0.56, C, 0.44, 1.18, -0.2);
        const head = new THREE.Group(); head.position.set(0, 1.4, 0); head.add(sph(0.26, Sk, 0, 0.16, 0, 14), bx(0.3, 0.05, 0.04, Dk, 0, 0.2, -0.24), cyl(0.1, 0.12, 0.08, Sk, 0, -0.05, 0, 8));
        switch (ch % 8) {
          case 0: head.add(mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, 7, 0, 1.75), Gy, 0, 0.17, 0), bx(0.04, 0.26, 0.3, Gy, 0, 0.42, 0.02), bx(0.36, 0.06, 0.05, Dk, 0, 0.16, -0.27)); break;      // knight helmet + crest
          case 1: head.add(sph(0.34, new THREE.MeshStandardMaterial({ color: '#dff2ff', transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.4 }), 0, 0.17, 0, 14), cyl(0.36, 0.36, 0.08, Wt, 0, -0.08, 0, 14), bx(0.3, 0.4, 0.2, Wt, 0, -0.5, 0.3)); break; // astronaut bubble + pack
          case 2: head.add(cyl(0.36, 0.36, 0.05, Dk, 0, 0.36, 0, 14), cyl(0.24, 0.27, 0.2, Dk, 0, 0.46, 0, 12), bx(0.1, 0.06, 0.02, Wt, 0, 0.46, -0.26), bx(0.12, 0.09, 0.03, Dk, -0.1, 0.2, -0.25)); break;   // pirate hat + patch
          case 3: head.add(bx(0.46, 0.4, 0.46, Gy, 0, 0.17, 0), bx(0.3, 0.08, 0.02, glow('#35e6ff', 2), 0, 0.2, -0.24), cyl(0.02, 0.02, 0.2, Dk, 0, 0.47, 0, 6), sph(0.05, glow('#ff4d4d', 2), 0, 0.58, 0, 8)); break; // robot box head
          case 4: { const hat = mesh(new THREE.ConeGeometry(0.3, 0.62, 12), M3('#6a4dff'), 0, 0.66, 0); hat.rotation.z = 0.12; head.add(hat, cyl(0.42, 0.42, 0.04, M3('#6a4dff'), 0, 0.36, 0, 14), sph(0.05, Gd, 0.05, 0.98, 0, 8), mesh(new THREE.ConeGeometry(0.12, 0.3, 8), Wt, 0, -0.08, -0.2)); break; } // wizard
          case 5: head.add(sph(0.285, Dk, 0, 0.16, 0, 14), bx(0.34, 0.07, 0.06, Sk, 0, 0.2, -0.24), bx(0.06, 0.05, 0.3, M3('#e03a3a'), 0.2, 0.26, 0.24)); break;                               // ninja mask + tail
          case 6: head.add(cyl(0.2, 0.22, 0.22, Wt, 0, 0.48, 0, 12), sph(0.26, Wt, 0, 0.66, 0, 12), bx(0.2, 0.05, 0.03, Dk, 0, 0.08, -0.26)); break;                                           // chef hat + moustache
          default: head.add(sph(0.33, M3('#4fbf5a'), 0, 0.2, 0.03, 12)); for (let i = 0; i < 4; i++) head.add(mesh(new THREE.ConeGeometry(0.06, 0.16, 5), Wt, 0, 0.5 - i * 0.09, 0.2 + i * 0.07)); head.add(bx(0.3, 0.08, 0.1, M3('#4fbf5a'), 0, 0.12, -0.32)); // dino hood
        }
        parts.head = head; g.add(parts.legL, parts.legR, torso, belt, parts.armL, parts.armR, head);
      }
      const gun = new THREE.Group(); if (hand) gun.position.set(hand.x, hand.y + 0.17, hand.z - 0.04); else gun.position.set(0.44, 1.2, -0.52); g.add(gun); parts.gun = gun; parts.gunW = -1;
      const contact=new THREE.Mesh(new THREE.PlaneGeometry(1.3,1.15),new THREE.MeshBasicMaterial({map:softDisc,color:0x172333,transparent:true,opacity:.26,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
      contact.rotation.x=-Math.PI/2;contact.position.y=.018;contact.userData.contactShadow=true;g.add(contact);
      // name tag + health bar
      const lc = document.createElement('canvas'); lc.width = 256; lc.height = 72; const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt, transparent: true, depthWrite: false })); label.scale.set(1.5, 0.42, 1); label.position.y = 2.25; g.add(label);
      const bubble = mesh(new THREE.SphereGeometry(1.15, 16, 12), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.22, depthWrite: false }), 0, 0.95, 0); bubble.castShadow = false; bubble.visible = false; g.add(bubble);
      const paint = []; g.traverse((o) => { if (o.isMesh && /paint|player/i.test(o.material.name || '') && !paint.includes(o.material)) paint.push(o.material); });
      g.userData = { parts, lc, lt, label, bubble, contact, key: '', look: '', paint, sk, color };
      paintSkin(paint, color, sk, 0);
      return g;
    }
    // Skins restyle the `Paint` material(s) of a figure. Lava and Rainbow are animated, so this is also called every frame for those.
    const skc = new THREE.Color();
    function paintSkin(mats, color, sk, t) {
      for (const m of mats) {
        if (sk < 7) { m.transparent = false; m.opacity = 1; m.emissive.setHex(0); m.emissiveIntensity = 1; m.metalness = 0.05; m.roughness = 0.45; }
        if (sk === 1) { m.color.set(color).lerp(skc.set('#ffffff'), 0.55); m.roughness = 0.6; }
        else if (sk === 2) { m.color.set('#15181f'); m.emissive.set(color); m.emissiveIntensity = 0.35; m.metalness = 0.4; m.roughness = 0.35; }
        else if (sk === 3) { m.color.set('#f2f6fb'); m.metalness = 0.85; m.roughness = 0.12; m.emissive.set('#5d6a7a'); m.emissiveIntensity = 0.35; }
        else if (sk === 4) { m.color.set(color); m.emissive.set(color); m.emissiveIntensity = 1.5; }
        else if (sk === 5) { m.color.set('#d6f2ff'); m.transparent = true; m.opacity = 0.72; m.roughness = 0.04; m.metalness = 0.3; m.emissive.set('#7fd4ff'); m.emissiveIntensity = 0.18; }
        else if (sk === 6) { m.color.set('#ffcf40'); m.metalness = 0.8; m.roughness = 0.24; m.emissive.set('#b87400'); m.emissiveIntensity = 0.55; }
        else if (sk === 7) { m.color.set('#2a0d05'); m.roughness = 0.6; m.emissive.setHSL(0.03 + 0.04 * Math.sin(t * 2.3), 1, 0.5); m.emissiveIntensity = 1.5 + Math.sin(t * 5) * 0.7; }
        else if (sk === 8) { m.color.setHSL((t * 0.35) % 1, 0.95, 0.55); m.emissive.copy(m.color); m.emissiveIntensity = 0.45; m.roughness = 0.35; }
        else m.color.set(color);
      }
    }
    function drawTag(u, name, color, hp, lvl) {
      const key = name + color + Math.ceil(hp / 5) + lvl; if (u.key === key) return; u.key = key;
      const c = u.lc.getContext('2d'); c.clearRect(0, 0, 256, 72); c.font = '800 28px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = 7; c.strokeStyle = 'rgba(0,0,0,.8)';
      const t = `${name}  ${lvl}`; c.strokeText(t, 128, 24); c.fillStyle = color; c.fillText(t, 128, 24);
      const f = Math.max(0, Math.min(1, hp / 100)); c.fillStyle = 'rgba(0,0,0,.65)'; c.beginPath(); c.roundRect(64, 46, 128, 16, 8); c.fill(); c.fillStyle = f > 0.6 ? '#5ee07a' : f > 0.3 ? '#ffd84d' : '#ff4d4d'; if (f > 0) { c.beginPath(); c.roundRect(67, 49, Math.max(8, 122 * f), 10, 5); c.fill(); }
      u.lt.needsUpdate = true;
    }
    function setOpacity(g, op) {
      const u = g.userData; const key = String(op); if (u.look === key) return; u.look = key;
      g.traverse((o) => { if (!o.isMesh || o === u.bubble || o.userData.contactShadow) return; const m = o.material; if (!m.userData.base) m.userData.base = { o: m.opacity, t: m.transparent }; m.transparent = op < 1 || m.userData.base.t; m.opacity = m.userData.base.o * op; m.depthWrite = op >= 1; o.castShadow = op >= 1; });
    }
    const views = new Map();
    function updatePlayers(dt) {
      const seen = new Set();
      for (const p of s.ps) {
        if (p.id === G.me) continue; seen.add(p.id); const pl = G.player(p.id);
        let v = views.get(p.id);
        if (!v || v.ch !== p.ch || v.sk !== (p.sk || 0)) { const old = v; if (v) scene.remove(v.g); v = { g: buildFigure(pl.color, p.ch, p.sk || 0), x: old ? old.x : p.x, y: old ? old.y : p.y, z: old ? old.z : p.z, yaw: p.yw, pitch: p.pt, ch: p.ch, sk: p.sk || 0, walk: 0 }; views.set(p.id, v); scene.add(v.g); }
        if (Math.hypot(p.x - v.x, p.z - v.z) > 8) { v.x = p.x; v.y = p.y; v.z = p.z; }
        const f = 1 - Math.exp(-16 * dt), px = v.x, pz = v.z; v.x += (p.x - v.x) * f; v.y += (p.y - v.y) * f; v.z += (p.z - v.z) * f; v.yaw = lerpAngle(v.yaw, p.yw, f); v.pitch += (p.pt - v.pitch) * f;
        const spd = Math.hypot(v.x - px, v.z - pz) / Math.max(dt, 0.001); v.walk += spd * dt * 2.2;
        const u = v.g.userData, pr = u.parts; v.g.visible = !p.dead; v.g.position.set(v.x, v.y, v.z); v.g.rotation.y = v.yaw;
        v.crs = (v.crs || 0) + ((p.cr ? 1 : 0) - (v.crs || 0)) * Math.min(1, dt * 14); v.cr = p.cr; { const sy = 1 - 0.38 * v.crs; v.g.scale.y = sy; u.label.scale.y = 0.42 / sy; } /* crouching squashes the toy */
        const down=B.rayMap(v.x,v.y+.12,v.z,0,-1,0,40),height=Number.isFinite(down)?Math.max(0,down-.12):40;
        u.contact.visible=Number.isFinite(down)&&height<5&&p.pw!=='ghost'&&B.rampAt(v.x,v.z)<0;
        u.contact.position.y=(.018-height)/v.g.scale.y;u.contact.material.opacity=.28/(1+height);u.contact.scale.setScalar(1+Math.min(height,5)*.12);
        if (pr.head) pr.head.rotation.x = v.pitch * 0.8; if (pr.legL) { const sw = Math.sin(v.walk) * Math.min(0.7, spd / 8); pr.legL.rotation.x = sw; pr.legR.rotation.x = -sw; pr.legL.position.z = -Math.sin(sw) * 0.3; pr.legR.position.z = Math.sin(sw) * 0.3; }
        pr.gun.rotation.x = v.pitch; if (pr.gunW !== p.w) { pr.gunW = p.w; pr.gun.clear(); pr.gun.add(weaponModel(p.w)); u.look = ''; }
        if (v.sk >= 7) paintSkin(u.paint, pl.color, v.sk, time + v.x);
        setOpacity(v.g, p.pw === 'ghost' ? 0.1 : 1); u.label.visible = p.pw !== 'ghost'; u.bubble.visible = !!p.prot; drawTag(u, pl.name, pl.color, p.hp, p.lvl);
        if (p.pw === 'mega' && Math.random() < 0.5) spark(v.x + (Math.random() - 0.5) * 0.6, v.y + Math.random() * 1.8, v.z + (Math.random() - 0.5) * 0.6, 0, 1.2, 0, '#ff4dd8', 0.5, 0);
        if (p.pw === 'speed' && spd > 3 && Math.random() < 0.6) spark(v.x, v.y + 0.3, v.z, 0, 0.6, 0, '#ffd84d', 0.45, 0);
      }
      for (const [id, v] of views) if (!seen.has(id)) { scene.remove(v.g); views.delete(id); }
    }

    // ---- particles, tracers, explosions ----
    const PN = 600, ppos = new Float32Array(PN * 3).fill(-999), pcol = new Float32Array(PN * 3), pvel = new Float32Array(PN * 3), plife = new Float32Array(PN), pmax = new Float32Array(PN), pbase = new Float32Array(PN * 3), pgrav = new Float32Array(PN);
    const pgeo = new THREE.BufferGeometry(); pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3)); pgeo.setAttribute('color', new THREE.BufferAttribute(pcol, 3));
    const points = new THREE.Points(pgeo, new THREE.PointsMaterial({ map:softDisc, size: 0.19, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true })); points.frustumCulled = false;
    let pi = 0; const tc = new THREE.Color();
    function spark(x, y, z, vx, vy, vz, color, life = 0.5, grav = 9) { const i = pi; pi = (pi + 1) % PN; ppos[i * 3] = x; ppos[i * 3 + 1] = y; ppos[i * 3 + 2] = z; pvel[i * 3] = vx; pvel[i * 3 + 1] = vy; pvel[i * 3 + 2] = vz; tc.set(color); pbase[i * 3] = tc.r; pbase[i * 3 + 1] = tc.g; pbase[i * 3 + 2] = tc.b; plife[i] = pmax[i] = life; pgrav[i] = grav; }
    function burst(x, y, z, n, speed, colors, life = 0.5) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, e = (Math.random() - 0.3) * 2, sp = speed * (0.3 + Math.random()); spark(x, y, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp, colors[i % colors.length], life * (0.5 + Math.random())); } }
    function stepParticles(dt) { for (let i = 0; i < PN; i++) { if (plife[i] <= 0) continue; plife[i] -= dt; const k = i * 3; if (plife[i] <= 0) { ppos[k + 1] = -999; continue; } pvel[k + 1] -= pgrav[i] * dt; ppos[k] += pvel[k] * dt; ppos[k + 1] += pvel[k + 1] * dt; ppos[k + 2] += pvel[k + 2] * dt; const f = plife[i] / pmax[i]; pcol[k] = pbase[k] * f; pcol[k + 1] = pbase[k + 1] * f; pcol[k + 2] = pbase[k + 2] * f; } pgeo.attributes.position.needsUpdate = true; pgeo.attributes.color.needsUpdate = true; }
    const tracers = []; const tGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
    for (let i = 0; i < 48; i++) { const m = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, depthWrite: false })); m.visible = false; m.frustumCulled = false; scene.add(m); tracers.push({ m, t: 0 }); }
    let ti = 0; const va = new THREE.Vector3(), vb = new THREE.Vector3();
    function tracer(o, e, color = 0xffe9a0) { const tr = tracers[ti]; ti = (ti + 1) % tracers.length; va.set(o[0], o[1], o[2]); vb.set(e[0], e[1], e[2]); const len = va.distanceTo(vb); if (len < 0.3) return; tr.m.position.copy(va).lerp(vb, 0.5); tr.m.scale.set(1, 1, len); tr.m.lookAt(vb); tr.m.material.color.setHex(color); tr.m.material.opacity = 0.9; tr.m.visible = true; tr.t = 0.11; }
    const booms = [];
    function explode(x, y, z, r, w) {
      const wet = w === 6; /* the Splash Lobber bursts into water, not fire */
      const ball = mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(wet ? 0x4fc3ff : 0xffa030).multiplyScalar(wet ? 1.3 : 2), transparent: true, depthWrite: false })); ball.position.set(x, y, z); ball.castShadow = false; scene.add(ball); booms.push({ ball, t: 0, r });
      burst(x, y, z, 70, r * 2.6, wet ? ['#4fc3ff', '#bfeaff', '#ffffff', '#2f8fd8'] : ['#ffb030', '#ff5a1f', '#ffe27a', '#999999'], 0.9);
      const d = Math.hypot(body.x - x, body.y + 0.9 - y, body.z - z); shake = Math.max(shake, Math.max(0, 1 - d / 22));
      if (me.alive && d < r) { const k = (1 - d / r) * 15, nx = (body.x - x) / (d || 1), ny = (body.y + 0.9 - y) / (d || 1), nz = (body.z - z) / (d || 1); body.vx += nx * k; body.vz += nz * k; body.vy = Math.max(body.vy, 0) + Math.max(0.35, ny) * k; body.ground = false; body.jumps = Math.max(body.jumps, 1); }
      play(wet ? 'splash' : 'explode', Math.max(0.15, 1 - d / 45));
    }

    // ---- view model (your own blaster) ----
    const vm = new THREE.Group(); camera.add(vm); let vmW = -1, flashT = 0;
    /* the foam sword only appears while you swing it */
    const sword = new THREE.Group(); sword.visible = false; camera.add(sword); let swordBuilt = false;
    /* built on first use, after the models have loaded: building it here would always miss fps_sword.glb */
    function buildSword() {
      swordBuilt = true;
      const custom = asset('fps_sword', 1.2, 'h'); /* optional model: blade along Blender +Z, grip at the bottom */
      if (custom) { custom.scale.multiplyScalar(0.72); sword.add(custom); } /* a touch smaller so the swing does not hide the whole view */
      else sword.add(bx(0.07, 0.95, 0.07, M3('#ff9f43', { roughness: 0.9 }), 0, 0.6, 0), mesh(new THREE.ConeGeometry(0.05, 0.14, 6), M3('#ff9f43', { roughness: 0.9 }), 0, 1.14, 0), bx(0.26, 0.05, 0.09, M3('#3b6cff'), 0, 0.12, 0), cyl(0.03, 0.03, 0.2, M3('#2a2f3a'), 0, 0.02, 0, 8));
      sword.traverse((m) => { m.layers.set(VM_LAYER); if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
    }
    const flash = mesh(new THREE.SphereGeometry(0.09, 8, 6), glow('#ffe9a0', 3)); flash.castShadow = false; flash.visible = false; flash.layers.set(VM_LAYER); camera.add(flash);
    function updateViewModel(dt) {
      if (!swordBuilt && assetsReady) buildSword();
      if (vmW !== me.w) { vmW = me.w; vm.clear(); const w = weaponModel(me.w); w.traverse((m) => { m.layers.set(VM_LAYER); if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } }); vm.add(w); }
      const moving = Math.hypot(body.vx, body.vz); me.bob += dt * moving * 1.6; const b = reducedMotion ? 0 : Math.min(1, moving / 7) * (body.ground ? 1 : 0.2);
      const draw = Math.max(0, me.drawT - time) / 0.3, rel = me.reloadEnd > time ? Math.sin(Math.min(1, (me.reloadEnd - time) / 0.5) * Math.PI * 0.5) : 0, z = me.zoom;
      vm.scale.setScalar(vm.children[0] && vm.children[0].userData.custom ? 0.74 : 0.82); vm.position.set(0.25 * (1 - z) + Math.sin(me.bob) * 0.012 * b, -0.23 + 0.06 * z * (WEAPONS[me.w].zoom ? 3 : 1) - Math.abs(Math.cos(me.bob)) * 0.014 * b - draw * 0.35 - rel * 0.28, -0.58 + me.kick * 0.09 + z * 0.08);
      vm.rotation.set(me.kick * 0.22 - rel * 0.9, 0.06 * (1 - z), rel * 0.3); vm.visible = me.alive && !locker && !(WEAPONS[me.w].zoom && z > 0.6);
      const sw = me.meleeT > 0 ? 1 - me.meleeT / 0.32 : -1; sword.visible = sw >= 0 && me.alive && !locker;
      if (sword.visible) { sword.position.set(0.42 - sw * 0.75, -0.42 + Math.sin(sw * Math.PI) * 0.12, -0.62); sword.rotation.set(-0.9, 0, 0.9 - sw * 2.3); vm.position.y -= 0.22 * Math.sin(sw * Math.PI); vm.position.x += 0.1 * Math.sin(sw * Math.PI); }
      if (flashT > 0) { flashT -= dt; flash.visible = flashT > 0 && vm.visible; flash.position.set(vm.position.x, vm.position.y + 0.03, vm.position.z - 0.5); flash.scale.setScalar(0.7 + Math.random() * 0.8); }
    }

    function fit() {
      const w = canvas.offsetWidth, h = canvas.offsetHeight, l = canvas.offsetLeft, t = canvas.offsetTop;
      if (w === fw && h === fh && l === fl && t === ft) return; fw = w; fh = h; fl = l; ft = t;
      gl.style.left = l + 'px'; gl.style.top = t + 'px'; gl.style.width = w + 'px'; gl.style.height = h + 'px';
      renderer.setSize(Math.max(1, w), Math.max(1, h), false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
      const dpr = Math.min(window.devicePixelRatio || 1, 2); W = w; H = h; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const proj = new THREE.Vector3(); let preview = null;
    return {
      get ready() { return built; }, spark, burst, tracer, explode,
      // the locker shows your own figure (you never see it otherwise): build or drop the preview model
      preview(ch, sk) { if (preview) { scene.remove(preview); preview = null; } if (ch == null || !built) return; preview = buildFigure(G.player(G.me).color, ch, sk); preview.userData.label.visible = false; preview.userData.parts.gun.add(weaponModel(me.w)); scene.add(preview); },
      muzzle() { flashT = 0.05; },
      view(id) { return views.get(id); },
      // world point -> HUD pixels (null when behind the camera)
      project(x, y, z) { proj.set(x, y, z).project(camera); if (proj.z > 1) return null; return [(proj.x * 0.5 + 0.5) * W, (-proj.y * 0.5 + 0.5) * H]; },
      update(dt) {
        fit(); if (!assetsReady || !s) return; if (!built) buildWorld();
        updatePlayers(dt);
        // pickups, drops, rockets
        for (const pv of pickViews) {
          const up = !!s.pk[pv.i]; pv.g.visible = up; pv.g.rotation.y += dt * 1.6; pv.g.position.y = pv.pk.y + 0.9 + Math.sin(time * 2.4 + pv.i) * 0.12;
          if (pv.pk.kind === 'power' && up && pv.kind !== s.pw.kind && s.pw.kind) { pv.kind = s.pw.kind; pv.g.clear(); pv.item = pickupModel(pv.pk, pv.kind); pv.g.add(pv.item); }
          if (pv.pk.kind === 'power' && up) { if (pv.item.userData.halo) pv.item.userData.halo.rotation.x += dt * 3; if (Math.random() < 0.5) spark(pv.pk.x + (Math.random() - 0.5), pv.pk.y + 0.3, pv.pk.z + (Math.random() - 0.5), 0, 2.2, 0, POWERS[pv.kind || 'mega'].color, 0.9, -1); }
        }
        const seenD = new Set(); for (const d of s.dr) { seenD.add(d.id); let v = dropViews.get(d.id); if (!v) { v = weaponModel(d.w, true); dropViews.set(d.id, v); scene.add(v); } v.position.set(d.x, d.y + 0.5 + Math.sin(time * 3 + d.id) * 0.08, d.z); v.rotation.y += dt * 2.5; }
        for (const [id, v] of dropViews) if (!seenD.has(id)) { scene.remove(v); dropViews.delete(id); }
        const seenR = new Set(); for (const r of s.rk) { seenR.add(r.id); let v = rocketViews.get(r.id); if (!v) { const model = (r.w === 6 ? asset('fps_balloon', 0.5) || (() => { const g = new THREE.Group(); const bl = sph(0.24, M3('#ff5d8a', { roughness: 0.25 })); bl.scale.set(0.9, 0.9, 1.15); g.add(bl, mesh(new THREE.ConeGeometry(0.06, 0.1, 6), M3('#ff5d8a'), 0, 0, 0.3)); return g; })() : null) || asset('fps_rocket', 0.6) || (() => { const g = new THREE.Group(); const c = cyl(0.09, 0.09, 0.5, M3('#ff8a3d')); c.rotation.x = Math.PI / 2; g.add(c, mesh(new THREE.ConeGeometry(0.09, 0.2, 8), M3('#f4f4f4'), 0, 0, -0.35)); g.children[1].rotation.x = -Math.PI / 2; return g; })(); model.rotation.y = Math.PI; v = new THREE.Group(); v.add(model); v.userData.p = [r.x, r.y, r.z]; rocketViews.set(r.id, v); scene.add(v); }
          const p = v.userData.p; if (Math.hypot(r.x - p[0], r.y - p[1], r.z - p[2]) > 0.01) v.lookAt(r.x + (r.x - p[0]), r.y + (r.y - p[1]), r.z + (r.z - p[2])); v.position.set(r.x, r.y, r.z); v.userData.p = [r.x, r.y, r.z]; spark(r.x, r.y, r.z, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, r.w === 6 ? '#8fd8ff' : Math.random() < 0.5 ? '#ffb030' : '#bbbbbb', 0.5, r.w === 6 ? 6 : 0); }
        for (const [id, v] of rocketViews) if (!seenR.has(id)) { scene.remove(v); rocketViews.delete(id); }
        for (const pv of padViews) { pv.ar.position.y = 0.5 + ((time * 1.4) % 1) * 0.9; pv.ar.material.opacity = 1; }
        for (const tv of teleViews) { tv.ring.rotation.z += dt * 2.4; tv.beam.material.opacity = 0.13 + Math.sin(time * 5 + tv.e.x) * 0.05; if (Math.random() < 0.3) { const a = Math.random() * 6.283; spark(tv.e.x + Math.cos(a) * 0.85, tv.e.y + 0.1, tv.e.z + Math.sin(a) * 0.85, 0, 2.2, 0, tv.col, 0.9, -0.5); } }
        if (trainView) {
          const tr = s.tr; trainView.g.visible = !!tr;
          if (tr) { if (!trainView.on) { trainView.on = true; trainView.x = tr[0]; play('whistle', 0.9); } trainView.x += tr[1] * MAP.train.speed * dt; trainView.x += (tr[0] - trainView.x) * (1 - Math.exp(-25 * dt)); /* damage uses the server position, so stay close to it even at low frame rates */ trainView.g.position.set(trainView.x, 0, MAP.train.z); trainView.g.rotation.y = tr[1] > 0 ? 0 : Math.PI;
            if (Math.random() < 0.8) spark(trainView.x - tr[1] * 0.55, 3, MAP.train.z, -tr[1] * 2, 2.5, (Math.random() - 0.5), '#dddddd', 0.9, -1); }
          else trainView.on = false;
          const warn = trainWarn > 0 || !!tr; for (const l of trainLamps) l.visible = warn ? Math.sin(time * 14) > 0 : false;
        }
        for (const tr of tracers) if (tr.t > 0) { tr.t -= dt; tr.m.material.opacity = Math.max(0, tr.t / 0.11); if (tr.t <= 0) tr.m.visible = false; }
        for (let i = booms.length - 1; i >= 0; i--) { const b = booms[i]; b.t += dt; const p = Math.min(1, b.t / 0.45); b.ball.scale.setScalar(b.r * (0.2 + 0.75 * p)); b.ball.material.opacity = 0.9 * (1 - p); if (p >= 1) { scene.remove(b.ball); b.ball.geometry.dispose(); b.ball.material.dispose(); booms.splice(i, 1); } }
        stepParticles(dt);
        // camera
        const st = mySt(), dead = st && st.dead;
        if (locker && preview) { preview.position.set(body.x, body.y, body.z); preview.rotation.y = me.yaw + Math.sin(time * 0.8) * 0.9; /* faces the camera, swaying so you can see the sides */ if (preview.userData.sk >= 7) paintSkin(preview.userData.paint, G.player(G.me).color, preview.userData.sk, time); const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw); camera.position.set(body.x + fx * 3.1 + rx * 0.9, body.y + 1.45, body.z + fz * 3.1 + rz * 0.9); camera.lookAt(body.x + rx * 0.9, body.y + 1.0, body.z + rz * 0.9); }
        else if (dead && killCam) { const k = views.get(killCam); camera.position.lerp(va.set(body.x - Math.sin(me.yaw) * -3, body.y + 3.2, body.z - Math.cos(me.yaw) * -3), 0.08); if (k) camera.lookAt(k.x, k.y + 1.2, k.z); }
        else { const land = reducedMotion ? 0 : landDip; camera.position.set(body.x, body.y + me.eye - land, body.z); camera.rotation.set(me.pitch + (reducedMotion ? 0 : me.kick * 0.035), me.yaw, 0); }
        if (shake > 0.01 && !reducedMotion) { camera.position.x += (Math.random() - 0.5) * shake * 0.35; camera.position.y += (Math.random() - 0.5) * shake * 0.35; shake *= Math.pow(0.02, dt); }
        const zf = adsOf(me.w), fov = baseFov / (1 + (zf - 1) * me.zoom) + (st && st.pw === 'speed' ? 8 : 0) + (body.slideT > 0 ? 5 : 0); if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 14); camera.updateProjectionMatrix(); }
        updateViewModel(dt);
        renderer.clear(); camera.layers.set(0); renderer.shadowMap.needsUpdate=true; renderer.render(scene, camera);
        { const fovNow = camera.fov, bg = scene.background; renderer.clearDepth(); camera.layers.set(VM_LAYER); camera.fov = 78; camera.updateProjectionMatrix(); scene.background = null;
          renderer.render(scene, camera); scene.background = bg; camera.fov = fovNow; camera.updateProjectionMatrix(); camera.layers.set(0); }
      },
      dispose() {
        for (const sc of [scene]) sc.traverse((o) => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) for (const mm of Array.isArray(m) ? m : [m]) { if (mm.map) mm.map.dispose(); mm.dispose(); } });
        if (scene.background && scene.background.isTexture) scene.background.dispose();
        environmentTarget?.dispose();paperGrain.dispose();softDisc.dispose();
        renderer.dispose(); gl.remove(); canvas.style.background = prev.bg; canvas.style.position = prev.pos; canvas.style.cursor = prev.cur; ctx.setTransform(1, 0, 0, 1, 0, 0);
      },
    };
  }
  let giveIdx = -1;
  const dropViews = new Map(), rocketViews = new Map(); let killCam = null, landDip = 0, locker = false, trainWarn = 0, teleFlash = 0;

  // ============================ locker: pick your figure and skin ============================
  if (!document.getElementById('tbb-style')) { const st = document.createElement('style'); st.id = 'tbb-style'; st.textContent = `
    .tbb-locker{position:absolute;left:24px;top:calc(50% + 22px);transform:translateY(-50%);width:min(560px,calc(100vw - 48px));max-height:calc(100vh - 96px);overflow:auto;background:#0b0f17;border:1px solid rgba(255,216,77,.6);border-radius:16px;padding:16px 18px;color:#e8eaf0;font:14px system-ui,sans-serif;text-align:left}
    .tbb-locker h3{margin:0 0 2px;font-size:20px;color:#ffd84d}.tbb-locker h4{margin:12px 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8b91a5}
    .tbb-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.tbb-skins{grid-template-columns:repeat(5,1fr)}
    .tbb-card{background:#182030;border:2px solid #2a3348;border-radius:12px;padding:6px;cursor:pointer;text-align:center;color:#e8eaf0;font:600 12px system-ui}.tbb-card:hover{border-color:#52607e}.tbb-card.sel{border-color:#ffd84d;box-shadow:0 0 0 1px #ffd84d inset}.tbb-card.lock{opacity:.45}
    .tbb-thumb{height:clamp(54px,9.5vh,92px);border-radius:8px;background:#22344a url(games/blasters-figures.png) no-repeat;background-size:440% 230%;margin-bottom:4px}
    .tbb-sw{height:38px;border-radius:8px;margin-bottom:4px;border:1px solid rgba(255,255,255,.25)}.tbb-card small{display:block;color:#8b91a5;font-weight:500}
    .tbb-set{display:grid;grid-template-columns:1fr 1fr;gap:14px}.tbb-set label{display:grid;gap:4px;font-size:12px;color:#cfd6e4}.tbb-set b{float:right;color:#ffd84d}.tbb-set input{width:100%;padding:0;accent-color:#ffd84d}
    .tbb-foot{display:flex;align-items:center;justify-content:space-between;margin-top:12px;gap:10px;color:#8b91a5;font-size:12px}`; document.head.appendChild(st); }
  function drawLocker() {
    const col = G.player(G.me).color, lvl = levelOf(xp), nFig = unlocked();
    G.ui.innerHTML = `<div class="tbb-locker" style="--pc:${col}"><h3>Locker</h3><div style="color:#8b91a5;font-size:12px">Level ${lvl}${testRoom() ? ' &nbsp;•&nbsp; test room: everything is unlocked' : ' &nbsp;•&nbsp; play matches to earn XP and unlock more'}</div>
      <h4>Figure</h4><div class="tbb-grid">${CHAR_NAMES.map((n, i) => `<button class="tbb-card ${i === charIdx ? 'sel' : ''} ${i < nFig ? '' : 'lock'}" data-fig="${i}"><div class="tbb-thumb" style="background-position:${[1.5, 33.8, 66.2, 98.5][i % 4]}% ${i < 4 ? 11.5 : 100}%"></div>${n}<small>${i < nFig ? '&nbsp;' : 'Level ' + Math.max(2, (i - 1) * 2)}</small></button>`).join('')}</div>
      <h4>Skin</h4><div class="tbb-grid tbb-skins">${SKINS.map((k, i) => `<button class="tbb-card ${i === skinIdx ? 'sel' : ''} ${skinOpen(i) ? '' : 'lock'}" data-skin="${i}"><div class="tbb-sw" style="background:${k.css}"></div>${k.name}<small>${skinOpen(i) ? '&nbsp;' : 'Level ' + k.lvl}</small></button>`).join('')}</div>
      <h4>Settings</h4><div class="tbb-set"><label>Mouse sensitivity <b id="tbbSensV">${sensMul.toFixed(2)}</b><input id="tbbSens" type="range" min="0.2" max="3" step="0.05" value="${sensMul}"></label><label>Field of view <b id="tbbFovV">${baseFov}</b><input id="tbbFov" type="range" min="60" max="105" step="1" value="${baseFov}"></label></div>
      <div class="tbb-foot"><span>Skins change your figure's colours. Other players see them.</span><button id="tbbClose" class="primary">Done (L)</button></div></div>`;
    for (const b of G.ui.querySelectorAll('[data-fig]')) b.onclick = () => { const i = +b.dataset.fig; if (i >= unlocked()) return G.toast('Reach level ' + Math.max(2, (i - 1) * 2) + ' to unlock ' + CHAR_NAMES[i]); charIdx = i; lset('tbb_char', i); hello(); drawLocker(); if (T) T.preview(charIdx, skinIdx); };
    for (const b of G.ui.querySelectorAll('[data-skin]')) b.onclick = () => { const i = +b.dataset.skin; if (!skinOpen(i)) return G.toast('Reach level ' + SKINS[i].lvl + ' to unlock ' + SKINS[i].name); skinIdx = i; lset('tbb_skin', i); hello(); drawLocker(); if (T) T.preview(charIdx, skinIdx); };
    G.ui.querySelector('#tbbClose').onclick = () => setLocker(false);
    G.ui.querySelector('#tbbSens').oninput = (e) => { sensMul = +e.target.value; lset('tbb_sens', sensMul); G.ui.querySelector('#tbbSensV').textContent = sensMul.toFixed(2); };
    G.ui.querySelector('#tbbFov').oninput = (e) => { baseFov = +e.target.value; lset('tbb_fov', baseFov); G.ui.querySelector('#tbbFovV').textContent = baseFov; };
  }
  function setLocker(on) {
    if (on === locker || (on && over)) return; locker = on;
    if (on) { if (document.pointerLockElement === canvas) document.exitPointerLock(); softLock = false; locked = false; firing = false; zooming = false; drawLocker(); if (T && T.ready) T.preview(charIdx, skinIdx); }
    else { G.clearUI(); if (T) T.preview(null); }
  }

  // ============================ input ============================
  let softLock = false; // fallback when the browser refuses pointer lock: play with the free mouse instead of being stuck
  const onLock = () => { locked = document.pointerLockElement === canvas || softLock; if (!locked) { firing = false; zooming = false; } };
  const onWheel = (e) => { if (!me.alive) return; e.preventDefault(); cycle(e.deltaY > 0 ? 1 : -1); };
  const onTab = (e) => { if (e.key === 'Tab') { e.preventDefault(); showScores = e.type === 'keydown'; } };
  document.addEventListener('pointerlockchange', onLock); canvas.addEventListener('wheel', onWheel, { passive: false }); window.addEventListener('keydown', onTab); window.addEventListener('keyup', onTab);
  function switchTo(w, force) { const st = mySt(); if (!st || !me.alive || w === me.w || (!force && !((st.own >> w) & 1))) return; me.lastW = me.w; me.w = w; me.mag = 0; me.magHold = 0; me.drawT = time + 0.3; me.nextFire = time + 0.3; me.reloadEnd = 0; me.burstLeft = 0; zooming = false; G.send({ type: 'switch', w }); play('reload'); }
  function cycle(dir) { const st = mySt(), n = WEAPONS.length; if (!st) return; for (let i = 1; i <= n; i++) { const w = (me.w + dir * i + n * 10) % n; if ((st.own >> w) & 1) { switchTo(w); return; } } }
  function reload() { const st = mySt(); if (!st || !me.alive || me.reloadEnd > time || st.rl || me.mag >= WEAPONS[me.w].mag || st.r === 0) return; me.reloadEnd = time + WEAPONS[me.w].reload; G.send({ type: 'reload' }); play('reload'); zooming = false; }
  // pulling the trigger. Burst blasters queue the rest of the burst; the render loop fires those.
  function fire() {
    const def = WEAPONS[me.w], st = mySt(); if (!st || !me.alive || time < me.nextFire || me.reloadEnd > time || st.rl || me.burstLeft > 0 || me.meleeT > 0.12) return;
    if (me.mag <= 0) { if (st.r !== 0) reload(); else if (me.w !== 0) switchTo(0); else play('empty'); me.nextFire = time + 0.25; return; }
    shoot();
    if (def.burst) { me.burstLeft = def.burst - 1; me.burstT = time + 1 / def.rate; me.nextFire = time + (def.burst - 1) / def.rate + def.burstGap; }
  }
  // foam sword: quick swipe at whoever is right in front of you, with a small lunge
  function melee() {
    if (!me.alive || over || locker || time < me.nextMelee || !s) return;
    me.nextMelee = time + MELEE.cd; me.meleeT = 0.32; me.burstLeft = 0; zooming = false; play('swing');
    const fwd = B.dirFrom(me.yaw, 0), hits = [], ex = body.x, ey = body.y + me.eye, ez = body.z;
    for (const p of s.ps) { if (p.id === G.me || p.dead) continue; const v = (T && T.view(p.id)) || p, dx = v.x - body.x, dz = v.z - body.z, d = Math.hypot(dx, dz); if (d > MELEE.range || Math.abs(v.y - body.y) > 1.6) continue; if (d > 0.5 && (dx * fwd[0] + dz * fwd[2]) / d < 0.5) continue; if (!B.los(ex, ey, ez, v.x, v.y + 1, v.z)) continue; hits.push(p.id); if (T) T.burst(v.x, v.y + 1.1, v.z, 14, 4, ['#ffb347', '#ffffff'], 0.35); }
    if (body.ground && !(body.slideT > 0)) { body.vx += fwd[0] * MELEE.lunge; body.vz += fwd[2] * MELEE.lunge; }
    G.send({ type: 'melee', hits }); if (hits.length) { hitMark = 0.14; play('bonk'); }
  }
  function shoot() {
    const def = WEAPONS[me.w], st = mySt();
    me.mag--; me.magHold = time + 0.35; me.nextFire = time + 1 / def.rate; me.kick = Math.min(1.6, me.kick + (def.pellets > 1 || def.projectile || def.zoom ? 1 : 0.45));
    const o = [body.x, body.y + me.eye, body.z];
    const base = curSpread();
    me.spreadAdd = Math.min(0.03, me.spreadAdd + (def.auto ? 0.004 : 0));
    const fwd = B.dirFrom(me.yaw, me.pitch), hits = new Map(); let firstEnd = null;
    if (def.projectile) { G.send({ type: 'fire', w: me.w, o, d: fwd }); }
    else {
      for (let i = 0; i < def.pellets; i++) {
        let d = [fwd[0] + (Math.random() - 0.5) * 2 * base, fwd[1] + (Math.random() - 0.5) * 2 * base, fwd[2] + (Math.random() - 0.5) * 2 * base]; const l = Math.hypot(d[0], d[1], d[2]); d = [d[0] / l, d[1] / l, d[2] / l];
        let tHit = B.rayMap(o[0], o[1], o[2], d[0], d[1], d[2], def.range), who = null, head = false; if (tHit === Infinity) tHit = def.range;
        for (const p of s.ps) { if (p.id === G.me || p.dead) continue; const v = T && T.view(p.id); if (!v) continue; const h = B.rayPlayer(o[0], o[1], o[2], d[0], d[1], d[2], v.x, v.y, v.z, tHit, p.cr); if (h) { tHit = h.t; who = p.id; head = h.head; } }
        const e = [o[0] + d[0] * tHit, o[1] + d[1] * tHit, o[2] + d[2] * tHit]; if (!firstEnd) firstEnd = e;
        if (who) { const h = hits.get(who) || { id: who, n: 0, h: 0 }; h.n++; if (head) h.h++; hits.set(who, h); if (T) T.burst(e[0], e[1], e[2], 5, 3, ['#ffffff', '#ffd84d'], 0.25); }
        else if (T) T.burst(e[0], e[1], e[2], 4, 2.5, ['#e9d7b0', '#b89a6a'], 0.3);
        if (T) { const side = 0.22 * (1 - me.zoom), sx = Math.cos(me.yaw), sz = -Math.sin(me.yaw); T.tracer([o[0] + sx * side + d[0] * 0.5, o[1] - 0.2 + d[1] * 0.5, o[2] + sz * side + d[2] * 0.5], e, def.beam ? 0x7df9ff : 0xffe9a0); }
      }
      G.send({ type: 'fire', w: me.w, o: o.map((v) => +v.toFixed(2)), d: fwd.map((v) => +v.toFixed(3)), e: firstEnd.map((v) => +v.toFixed(2)), hits: [...hits.values()] });
      if (hits.size) hitMark = 0.12;
    }
    if (T) T.muzzle(); play(def.id);
    if (me.mag <= 0 && st.r !== 0) setTimeout(reload, 180);
  }

  // ============================ HUD ============================
  function rr(x, y, w, h, r, fill, stroke) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); } }
  const txt = (t, x, y, o = {}) => G.text(t, x, y, o);
  function hud(dt) {
    ctx.clearRect(0, 0, W, H);
    if (failed) { ctx.fillStyle = '#0b0d13'; ctx.fillRect(0, 0, W, H); txt('3D could not start: ' + failed, W / 2, H / 2, { size: 16, color: '#ff8a7a' }); return; }
    if (!T || !T.ready || !s) { ctx.fillStyle = '#0b0d13'; ctx.fillRect(0, 0, W, H); txt('Unpacking the toy box…', W / 2, H / 2, { size: 22 }); return; }
    const st = mySt(), def = WEAPONS[me.w], cx = W / 2, cy = H / 2;
    // damage numbers
    for (let i = dmgNums.length - 1; i >= 0; i--) { const d = dmgNums[i]; d.t -= dt; if (d.t <= 0) { dmgNums.splice(i, 1); continue; } const p = T.project(d.x, d.y + (0.9 - d.t) * 1.2, d.z); if (!p) continue; txt(String(d.n), p[0] + d.ox, p[1], { size: d.head ? 24 : 18, color: d.kill ? '#ff5d5d' : d.head ? '#ffd84d' : '#ffffff', weight: 800 }); }
    // screen effects
    if (st && !st.dead && st.hp <= 35) { const g = ctx.createRadialGradient(cx, cy, H * 0.3, cx, cy, H * 0.8); g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,0,0,${0.25 + Math.sin(time * 6) * 0.08})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    if (teleFlash > 0) { teleFlash -= dt; ctx.fillStyle = `rgba(190,235,255,${Math.max(0, teleFlash) * 1.6})`; ctx.fillRect(0, 0, W, H); }
    if (trainWarn > 0 && Math.sin(time * 14) > 0) { ctx.strokeStyle = 'rgba(255,60,60,.8)'; ctx.lineWidth = 12; ctx.strokeRect(6, 6, W - 12, H - 12); }
    if (hurtFlash > 0) { hurtFlash -= dt; const g = ctx.createRadialGradient(cx, cy, H * 0.25, cx, cy, H * 0.75); g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,30,30,${Math.max(0, hurtFlash) * 1.1})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    for (let i = hurtDirs.length - 1; i >= 0; i--) { const d = hurtDirs[i]; d.t -= dt; if (d.t <= 0) { hurtDirs.splice(i, 1); continue; } const a = Math.atan2(-(d.x - body.x), -(d.z - body.z)) - me.yaw; ctx.save(); ctx.translate(cx, cy); ctx.rotate(-a); ctx.beginPath(); ctx.arc(0, 0, 110, -Math.PI / 2 - 0.3, -Math.PI / 2 + 0.3); ctx.strokeStyle = `rgba(255,60,60,${Math.min(1, d.t * 1.5)})`; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore(); }
    if (st && st.pw) { ctx.strokeStyle = POWERS[st.pw].color; ctx.globalAlpha = 0.35 + Math.sin(time * 5) * 0.12; ctx.lineWidth = 10; ctx.strokeRect(5, 5, W - 10, H - 10); ctx.globalAlpha = 1; }
    // scope / crosshair
    if (me.alive && !over) {
      if (def.zoom && me.zoom > 0.6) { ctx.fillStyle = '#05070b'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(cx, cy, H * 0.42, 0, 7, true); ctx.fill('evenodd'); ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - H * 0.42, cy); ctx.lineTo(cx + H * 0.42, cy); ctx.moveTo(cx, cy - H * 0.42); ctx.lineTo(cx, cy + H * 0.42); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, H * 0.42, 0, 7); ctx.lineWidth = 6; ctx.stroke(); }
      else { const gap = 3 + curSpread() * 420 + me.kick * 4; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 4; for (let p = 0; p < 2; p++) { ctx.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(cx + dx * gap, cy + dy * gap); ctx.lineTo(cx + dx * (gap + 8), cy + dy * (gap + 8)); } ctx.stroke(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; } ctx.fillStyle = '#fff'; ctx.fillRect(cx - 1, cy - 1, 2, 2); }
      if (hitMark > 0) { hitMark -= dt; ctx.strokeStyle = hitKill > 0 ? '#ff4d4d' : '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { ctx.moveTo(cx + dx * 8, cy + dy * 8); ctx.lineTo(cx + dx * 15, cy + dy * 15); } ctx.stroke(); } if (hitKill > 0) hitKill -= dt;
      if (me.reloadEnd > time) { const f = 1 - (me.reloadEnd - time) / def.reload; ctx.beginPath(); ctx.arc(cx, cy, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); ctx.strokeStyle = '#ffd84d'; ctx.lineWidth = 4; ctx.stroke(); txt('RELOADING', cx, cy + 46, { size: 11, color: '#ffd84d' }); }
    }
    // top: timer, goal, leader, power-up
    const lead = s.ps.slice().sort((a, b) => b.k - a.k)[0];
    rr(cx - 150, 10, 300, 40, 12, 'rgba(8,12,20,.72)'); txt(`${Math.floor(s.t / 60)}:${String(s.t % 60).padStart(2, '0')}`, cx, 30, { size: 20, color: s.t <= 20 ? '#ff6b6b' : '#fff', stroke: false });
    if (st) txt(`You ${st.k}`, cx - 96, 30, { size: 14, color: G.player(G.me).color, stroke: false }); if (lead) txt(`${lead.id === G.me ? 'Leading' : nm(lead.id)} ${lead.k}/${s.goal}`, cx + 92, 30, { size: 12, color: '#ffd84d', stroke: false });
    if (s.pw.up) { const pc = POWERS[s.pw.kind] || POWERS.mega; txt(`★ ${pc.name} is on the tower roof`, cx, 64, { size: 13, color: pc.color }); } else if (s.pw.in <= 15) txt(`★ Power-up in ${s.pw.in}s`, cx, 64, { size: 13, color: '#ffffff' });
    // item card (what did I just pick up)
    if (card) { card.t -= dt; if (card.t <= 0) card = null; else { const cw = Math.min(W - 24, 520), a = Math.min(1, card.t * 2); ctx.globalAlpha = a; rr(cx - cw / 2, 82, cw, 48, 14, 'rgba(8,12,20,.85)', card.color); txt(card.name, cx - cw / 2 + 18, 97, { size: 15, weight: 800, align: 'left', color: card.color, stroke: false }); txt(card.tip, cx - cw / 2 + 18, 117, { size: 12.5, align: 'left', color: '#fff', stroke: false }); ctx.globalAlpha = 1; } }
    for (let i = banners.length - 1; i >= 0; i--) { banners[i].t -= dt; if (banners[i].t <= 0) banners.splice(i, 1); }
    banners.forEach((b, i) => { const age = b.d - b.t, sc = reducedMotion ? 1 : 1 + Math.max(0, 0.25 - age) * 2; ctx.save(); ctx.globalAlpha = Math.min(1, b.t * 3); ctx.translate(cx, 168 + i * 36); ctx.scale(sc, sc); txt(b.text, 0, 0, { size: 28 - i * 5, color: b.color, weight: 900 }); ctx.restore(); });
    // kill feed
    for (let i = feed.length - 1; i >= 0; i--) { feed[i].t -= dt; if (feed[i].t <= 0) feed.splice(i, 1); }
    feed.forEach((f, i) => txt(f.text, W - 16, 86 + i * 19, { size: 12.5, align: 'right', color: f.mine ? '#ffd84d' : `rgba(255,255,255,${Math.min(1, f.t)})` }));
    // bottom-left: health + armour
    if (st) {
      rr(16, H - 74, 230, 58, 14, 'rgba(8,12,20,.72)');
      txt('♥', 34, H - 55, { size: 18, color: '#ff5d5d', stroke: false }); rr(50, H - 63, 150, 14, 7, 'rgba(255,255,255,.12)'); if (st.hp > 0) rr(50, H - 63, 150 * Math.min(1, st.hp / 100), 14, 7, st.hp > 100 ? '#7dffb0' : st.hp > 35 ? '#5ee07a' : '#ff4d4d'); txt(String(st.hp), 222, H - 55, { size: 15, stroke: false });
      txt('⛨', 34, H - 33, { size: 15, color: '#4da6ff', stroke: false }); rr(50, H - 40, 150, 10, 5, 'rgba(255,255,255,.12)'); if (st.ar > 0) rr(50, H - 40, 150 * st.ar / 100, 10, 5, '#4da6ff'); txt(String(st.ar), 222, H - 34, { size: 12, color: '#9fc8ff', stroke: false });
      if (st.pw) txt(`${POWERS[st.pw].name}  ${st.pwt}s`, 131, H - 90, { size: 14, color: POWERS[st.pw].color, weight: 800 });
      const cdf = Math.max(0, Math.min(1, 1 - body.dashCd / P.DASH_CD)); rr(16, H - 12, 230, 5, 2, 'rgba(255,255,255,.12)'); rr(16, H - 12, 230 * cdf, 5, 2, cdf >= 1 ? '#35e6ff' : '#5a6b80'); 
      // bottom-right: ammo + weapon slots
      rr(W - 246, H - 74, 230, 58, 14, 'rgba(8,12,20,.72)');
      txt(String(me.mag), W - 150, H - 46, { size: 34, weight: 900, align: 'right', color: me.mag === 0 ? '#ff5d5d' : '#fff', stroke: false }); txt(st.r < 0 ? '/ ∞' : `/ ${st.r}`, W - 142, H - 42, { size: 15, align: 'left', color: '#aab', stroke: false });
      txt(def.name, W - 30, H - 58, { size: 12, align: 'right', color: '#ffd84d', stroke: false });
      for (let i = 0; i < WEAPONS.length; i++) { const own = (st.own >> i) & 1, x = W - 140 + i * 14; rr(x, H - 36, 11, 11, 3, i === me.w ? '#ffd84d' : own ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.12)'); }
      txt(`1-${WEAPONS.length} / wheel`, W - 84, H - 16, { size: 9.5, color: 'rgba(255,255,255,.5)', stroke: false });
      { const mf = Math.max(0, Math.min(1, 1 - (me.nextMelee - time) / MELEE.cd)); txt('E', W - 262, H - 45, { size: 13, weight: 800, color: mf >= 1 ? '#ffb347' : '#5a6b80' }); ctx.beginPath(); ctx.arc(W - 262, H - 45, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * mf); ctx.strokeStyle = mf >= 1 ? '#ffb347' : '#5a6b80'; ctx.lineWidth = 3; ctx.stroke(); }
      if (body.crouched && me.alive) txt(body.slideT > 0 ? 'SLIDING' : 'CROUCHED', 131, H - 108, { size: 11, color: '#9fc8ff' });
    }
    // death screen
    if (st && st.dead && !over) { ctx.fillStyle = 'rgba(10,0,0,.4)'; ctx.fillRect(0, 0, W, H); txt(deathBy || 'Tagged out!', cx, cy - 40, { size: 30, color: '#ff6b6b', weight: 900 }); txt(`Back in ${Math.max(0, st.dead).toFixed(1)}s`, cx, cy, { size: 18 }); txt(`${CHAR_NAMES[charIdx]} in ${SKINS[skinIdx].name}   •   press L for the locker`, cx, cy + 34, { size: 13, color: '#cfd6e4' }); }
    // not captured yet
    if (!locked && me.alive && !over && !showGuide && !locker) { ctx.fillStyle = 'rgba(5,8,14,.6)'; ctx.fillRect(0, 0, W, H); txt('Click to play', cx, cy - 46, { size: 36, weight: 900, color: '#ffd84d' }); ['WASD move   •   Space jump (twice)   •   Shift dash   •   C crouch, tap while running to slide', 'Click fire   •   Right-click aim   •   E foam sword   •   R reload   •   1-8 or wheel: switch', 'Tab scores   •   H guide   •   L locker, skins and settings   •   M mute   •   Esc frees the mouse', ...(testRoom() ? ['Test room: [ and ] hand you each blaster in turn'] : [])].forEach((l, i) => txt(l, cx, cy + 4 + i * 24, { size: 14, color: '#e8eaf0' })); }
    if (showScores || over) scoreboard();
    if (showGuide) guide();
    if (!locker) txt(`Level ${levelOf(xp)}  •  ${CHAR_NAMES[charIdx]}  •  ${SKINS[skinIdx].name}  (L)`, 20, 52, { size: 11.5, align: 'left', color: '#ffd84d' });
  }
  let deathBy = '';
  function scoreboard() {
    const rows = s.ps.slice().sort((a, b) => b.k - a.k || b.sc - a.sc), pw = Math.min(W - 24, 520), ph = 96 + rows.length * 28 + (over ? 110 : 0), px = (W - pw) / 2, py = Math.max(10, (H - ph) / 2);
    rr(px, py, pw, ph, 16, 'rgba(8,12,20,.93)', 'rgba(255,216,77,.6)');
    txt(over ? `${nm(over.winner)} wins!` : 'Scores', W / 2, py + 28, { size: 22, weight: 900, color: '#ffd84d', stroke: false });
    ['Player', 'Tags', 'Outs', 'Score'].forEach((h, i) => txt(h, px + [26, pw - 190, pw - 120, pw - 40][i], py + 58, { size: 11, align: i ? 'right' : 'left', color: '#8b91a5', stroke: false }));
    rows.forEach((p, i) => { const y = py + 82 + i * 28, pl = G.player(p.id); if (p.id === G.me) rr(px + 10, y - 13, pw - 20, 26, 8, 'rgba(255,216,77,.12)'); G.circle(px + 30, y, 6, pl.color); txt(`${pl.name}`, px + 46, y, { size: 14, align: 'left', stroke: false }); txt(`Lv ${p.lvl}`, px + 190, y, { size: 11, align: 'left', color: '#8b91a5', stroke: false }); txt(String(p.k), px + pw - 190, y, { size: 14, align: 'right', stroke: false }); txt(String(p.d), px + pw - 120, y, { size: 14, align: 'right', color: '#aab', stroke: false }); txt(String(p.sc), px + pw - 40, y, { size: 14, align: 'right', color: '#ffd84d', stroke: false }); });
    if (over) { const y0 = py + 92 + rows.length * 28; over.awards.forEach(([n, id, d], i) => txt(`${n}: ${nm(id)} (${d})`, W / 2, y0 + i * 20, { size: 13, color: '#cfd6e4', stroke: false }));
      const l = levelOf(xp), a = xpFor(l), b = xpFor(l + 1), f = (xp - a) / (b - a), y = y0 + 74; txt(`+${over.gain} XP   Level ${l}${over.up ? '  LEVEL UP!' : ''}`, W / 2, y - 14, { size: 13, color: over.up ? '#5ee07a' : '#ffd84d', stroke: false }); rr(px + 60, y, pw - 120, 10, 5, 'rgba(255,255,255,.12)'); rr(px + 60, y, (pw - 120) * Math.max(0.02, Math.min(1, f)), 10, 5, '#ffd84d'); }
  }
  function guide() {
    const lines = [...WEAPONS.map((w, i) => [`${i + 1}  ${w.name}`, w.tip, '#ffb347']), ['E  Foam Sword', 'Everyone has one. Big hit up close, and you lunge forward.', '#ffb347'], ['Aim (right-click)', 'Zooms in and tightens your shots, but you walk slower.', '#9fc8ff'], ['Crouch and slide (C)', 'Crouching steadies your aim and makes you smaller. Tap C while running to slide.', '#9fc8ff'], ...Object.values(PICKUP_INFO).map((p) => [p.name, p.tip, '#5ee07a']), ...Object.values(POWERS).map((p) => ['★ ' + p.name, p.tip, p.color]), ['Jump pads', 'Blue pads lift you onto the corner forts. Orange pads fling you to the tower roof.', '#35e6ff'], ['Ramps', 'Wooden ramps walk you up to the galleries. Orange ramps launch you: jump or dash off the top.', '#ff8a3d'], ['Teleporters', 'Glowing rings come in pairs. Step in one, pop out of the matching colour.', '#c77dff'], ['Toy train', 'Runs down the middle road every 30 seconds. Bells and red lights warn you. Do not be on the track.', '#ff5d5d'], ['Dropped blasters', 'Tagged players drop their best blaster. Run over it to take it.', '#ffffff']];
    const pw = Math.min(W - 24, 780), rh = Math.min(26, (H - 110) / lines.length), ph = lines.length * rh + 66, px = (W - pw) / 2, py = Math.max(8, (H - ph) / 2);
    rr(px, py, pw, ph, 16, 'rgba(8,12,20,.94)', 'rgba(255,216,77,.7)'); txt('What everything does', px + 22, py + 26, { size: 18, weight: 800, align: 'left', color: '#ffd84d', stroke: false }); txt('H closes this', px + pw - 22, py + 26, { size: 11.5, align: 'right', color: '#aab', stroke: false });
    lines.forEach(([n, tip, col], i) => { const y = py + 56 + i * rh; txt(n, px + 22, y, { size: 12.5, weight: 800, align: 'left', color: col, stroke: false }); txt(tip, px + 200, y, { size: W < 620 || rh < 22 ? 9.5 : 11.5, align: 'left', color: '#dfe5ee', stroke: false }); });
  }

  // Test hooks, only when the page is opened with ?bltest=1 (tools/blasters-hit.js, tools/blasters-shots.js).
  //   __bl()    -> how far the nearest living enemy is from the crosshair (yaw / pitch error) and its distance
  //   __blAim() -> snaps the view onto the chest of the nearest enemy that is actually visible; returns false if none is
  if (/[?&]bltest=1/.test(location.search)) {
    const nearest = (needSight) => { let best = null, bd = 1e9; for (const p of s ? s.ps : []) { if (p.id === G.me || p.dead || (needSight && p.prot)) continue; const v = (T && T.view(p.id)) || p, d = Math.hypot(v.x - body.x, v.z - body.z); if (d >= bd) continue; if (needSight && !B.los(body.x, body.y + P.EYE, body.z, v.x, v.y + 1.0, v.z)) continue; bd = d; best = v; } return best ? { v: best, d: bd } : null; };
    window.__bl = () => { if (!s) return null; const n = nearest(false); if (!n) return { err: null }; const want = Math.atan2(-(n.v.x - body.x), -(n.v.z - body.z)), wantPitch = Math.atan2(n.v.y + 1.0 - (body.y + P.EYE), Math.max(0.5, n.d)); return { err: (((want - me.yaw) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI, perr: wantPitch - me.pitch, dist: n.d, alive: me.alive }; };
    window.__blGo = (x, y, z, yaw, pitch = 0) => { Object.assign(body, B.newBody(x, y, z)); body.teleCd = 5; me.yaw = yaw; me.pitch = pitch; return true; }; // put the player somewhere for a screenshot
    window.__blAim = () => { if (!s || !me.alive) return false; const n = nearest(true); if (!n) return false; me.yaw = Math.atan2(-(n.v.x - body.x), -(n.v.z - body.z)); me.pitch = Math.atan2(n.v.y + 1.0 - (body.y + P.EYE), Math.max(0.5, n.d)); return n.d; };
  }

  // ============================ module ============================
  const TAGS = { bonk: ['BONKED!  +50', '#ffb347'], headshot: ['HEADSHOT!', '#ffd84d'], first: ['FIRST TAG!', '#5ee07a'], revenge: ['REVENGE!', '#ff9f43'], shutdown: ['SHUT DOWN!', '#4da6ff'], double: ['DOUBLE TAG!', '#ff4dd8'], triple: ['TRIPLE TAG!', '#ff4dd8'], rampage: ['RAMPAGE!', '#ff4d4d'] };
  const STREAKS = { 3: 'ON FIRE', 5: 'UNSTOPPABLE', 8: 'LEGENDARY', 12: 'TOY BOX TYRANT' };
  return {
    state(ns) {
      const first = !s; s = ns; const st = mySt(); if (!st) return;
      const alive = !st.dead; if (alive && !me.alive) { killCam = null; deathBy = ''; }
      me.alive = alive;
      if (alive) { if (st.w === me.w) { if (time > me.magHold) me.mag = st.m; } else if (time > me.drawT + 0.5) { me.w = st.w; me.mag = st.m; } if (!st.rl && me.reloadEnd > time + 0.25) me.reloadEnd = 0; }
      if (first) { body.x = st.x; body.y = st.y; body.z = st.z; me.yaw = st.yw; }
    },
    event(e) {
      const mine = e.id === G.me;
      if (e.type === 'spawn' && mine) { Object.assign(body, B.newBody(e.x, e.y, e.z)); if (!e.keep) { me.yaw = e.yaw; me.pitch = 0; me.w = 0; me.mag = WEAPONS[0].mag; me.reloadEnd = 0; me.nextFire = 0; me.burstLeft = 0; me.eye = P.EYE; } }
      else if (e.type === 'shot' && !mine) { const v = T && T.ready && T.view(e.id); if (v) { const d = Math.hypot(v.x - body.x, v.z - body.z), vol = Math.max(0.08, 1 - d / 50); play(WEAPONS[e.w].id, vol); if (e.o && e.e) T.tracer([e.o[0], e.o[1] - 0.25, e.o[2]], e.e, 0xfff0c0); } }
      else if (e.type === 'dmg') { hitMark = 0.16; if (e.kill) hitKill = 0.4; play(e.head ? 'head' : 'hit'); dmgNums.push({ x: e.x, y: e.y, z: e.z, n: e.n, head: e.head, kill: e.kill, t: 0.9, ox: (Math.random() - 0.5) * 30 }); if (dmgNums.length > 14) dmgNums.shift(); }
      else if (e.type === 'hurt') { hurtFlash = Math.min(0.7, 0.25 + e.n / 120); hurtDirs.push({ x: e.x, z: e.z, t: 1 }); if (hurtDirs.length > 4) hurtDirs.shift(); play('hurt'); if (!reducedMotion) shake = Math.max(shake, 0.25); }
      else if (e.type === 'kill') {
        const iK = e.k === G.me, iV = e.v === G.me;
        feed.unshift({ text: e.k ? `${nm(e.k)}  ▸  ${nm(e.v)}  (${e.w}${e.head ? ', headshot' : ''})` : e.w === 'Toy Train' ? `${nm(e.v)} was flattened by the toy train` : `${nm(e.v)} tagged themselves`, t: 6, mine: iK || iV }); if (feed.length > 6) feed.length = 6;
        if (T && T.ready) T.burst(e.x, e.y + 1, e.z, 40, 6, [G.player(e.v).color, '#ffffff', '#ffd84d'], 0.8);
        if (iK) { play('kill'); banner(`Tagged ${nm(e.v)}  +100`, '#5ee07a', 1.8); for (const t of e.tags) { if (TAGS[t]) { banner(TAGS[t][0], TAGS[t][1], 2.2); play('medal'); } else if (t === 'streak' && STREAKS[e.streak]) { banner(`${STREAKS[e.streak]}  (${e.streak} in a row)`, '#ff9f43', 2.6); play('medal'); } } }
        else if (e.tags.includes('streak') && STREAKS[e.streak]) feed.unshift({ text: `${nm(e.k)} is ${STREAKS[e.streak]}`, t: 5 });
        if (iV) { play('dead'); killCam = e.k; deathBy = e.k ? `Tagged by ${nm(e.k)}  (${e.w})` : e.w === 'Toy Train' ? 'Flattened by the toy train' : 'You tagged yourself'; firing = false; zooming = false; }
      }
      else if (e.type === 'assist') banner(`Assist  +50`, '#9fc8ff', 1.5);
      else if (e.type === 'swing' && !mine) { const v = T && T.ready && T.view(e.id); if (v) { play('swing', Math.max(0.1, 1 - Math.hypot(v.x - body.x, v.z - body.z) / 20)); T.burst(v.x - Math.sin(v.yaw) * 0.9, v.y + 1.2, v.z - Math.cos(v.yaw) * 0.9, 8, 3, ['#ffb347', '#ffffff'], 0.25); } }
      else if (e.type === 'trainsoon') { trainWarn = MAP.train.warn + 0.5; play('bell'); banner(`TRAIN coming from the ${e.dir > 0 ? 'west' : 'east'}. Get off the track!`, '#ff5d5d', 3); }
      else if (e.type === 'trainhit') { body.vx = e.dir * 17; body.vy = 9; body.vz += (body.z >= MAP.train.z ? 1 : -1) * 6; body.ground = false; shake = Math.max(shake, 1); }
      else if (e.type === 'explode') { if (T && T.ready) T.explode(e.x, e.y, e.z, e.r, e.w); }
      else if (e.type === 'pickup') {
        if (T && T.ready && e.i != null) { const pk = MAP.pickups[e.i]; T.burst(pk.x, pk.y + 0.9, pk.z, 16, 4, ['#ffffff', '#ffd84d'], 0.5); }
        if (mine) { play('pickup'); if (e.kind === 'weapon') { const w = WEAPONS[e.w]; showCard(`${w.name}   (press ${e.w + 1})`, w.tip, '#ffb347'); if (e.w > me.w && !firing) switchTo(e.w, true); } else if (PICKUP_INFO[e.kind]) showCard(PICKUP_INFO[e.kind].name, PICKUP_INFO[e.kind].tip, '#5ee07a'); }
      }
      else if (e.type === 'power') { const p = POWERS[e.kind]; if (mine) { play('power'); showCard('★ ' + p.name, p.tip, p.color); banner(p.name.toUpperCase() + '!', p.color, 2.2); } else feed.unshift({ text: `${nm(e.id)} grabbed ${p.name}`, t: 5 }); }
      else if (e.type === 'powersoon') { play('soon'); banner(`${POWERS[e.kind].name} appears on the tower in 6`, POWERS[e.kind].color, 3); }
      else if (e.type === 'over') { setLocker(false); const st = mySt(), gain = 40 + Math.round((st ? st.sc : 0) / 5), before = levelOf(xp); xp += gain; lset('tbb_xp', xp); over = { winner: e.winner, awards: e.awards || [], gain, up: levelOf(xp) > before }; if (document.pointerLockElement === canvas) document.exitPointerLock(); play(e.winner === G.me ? 'power' : 'medal'); }
    },
    key(k, down) {
      if (!down) return; audio();
      if (k === 'Escape') { softLock = false; onLock(); if (locker) setLocker(false); return; }
      if (k === 'l') { setLocker(!locker); return; }
      if (locker) return;
      if (k === ' ') jumpQ = true; else if (k === 'Shift') dashQ = true; else if (k === 'r') reload(); else if (k === 'q') switchTo(me.lastW); else if (k === 'h') showGuide = !showGuide;
      else if (k >= '1' && k <= String(WEAPONS.length)) switchTo(+k - 1);
      else if (k === 'e' || k === 'v') melee();
      else if ((k === '[' || k === ']') && testRoom()) { giveIdx = ((giveIdx || 0) + (k === ']' ? 1 : -1) + (WEAPONS.length - 1) * 4) % (WEAPONS.length - 1); G.send({ type: 'give', w: giveIdx + 1 }); } /* test rooms: [ and ] hand you each blaster in turn */
      else if (k === 'm') { muted = !muted; lset('mk_mute', muted ? '1' : '0'); if (master) master.gain.value = muted ? 0 : 0.25; G.toast(muted ? 'Sound off' : 'Sound on'); }
    },
    mouse(kind, x, y, e) {
      if (locker) return;
      if (kind === 'down') { audio(); if (!locked) { if (over) return; if (canvas.requestPointerLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* not available */ } } setTimeout(() => { if (document.pointerLockElement !== canvas && !over) { softLock = true; locked = true; } }, 450); return; } if (e.button === 2) zooming = true; else if (e.button === 0) { firing = true; fire(); } }
      else if (kind === 'up') { if (e && e.button === 2) zooming = false; else firing = false; }
      else if (kind === 'move' && locked && e && me.alive) { const sens = (0.0022 * sensMul) / (1 + (adsOf(me.w) - 1) * me.zoom); me.yaw -= (e.movementX || 0) * sens; me.pitch = Math.max(-1.5, Math.min(1.5, me.pitch - (e.movementY || 0) * sens)); }
    },
    render(dt) {
      time += dt;
      if (!T && !failed && window.THREE) { try { T = create3D(); } catch (e) { failed = e.message; console.error(e); } }
      const st = mySt(), K = G.keys;
      // look with the arrow keys too (trackpads, and for automated tests)
      if (me.alive) { const lr = (K.has('ArrowLeft') ? 1 : 0) - (K.has('ArrowRight') ? 1 : 0), ud = (K.has('ArrowUp') ? 1 : 0) - (K.has('ArrowDown') ? 1 : 0); me.yaw += lr * dt * 2.4; me.pitch = Math.max(-1.5, Math.min(1.5, me.pitch + ud * dt * 1.6)); }
      // move
      const can = me.alive && !over && !locker, f = can ? (K.has('w') ? 1 : 0) - (K.has('s') ? 1 : 0) : 0, sd = can ? (K.has('d') ? 1 : 0) - (K.has('a') ? 1 : 0) : 0;
      let rem = Math.min(dt, 0.1), firstStep = true; const crouching = can && K.has('c'), mul = (st && st.pw === 'speed' ? 1.45 : 1) * (zooming && me.alive ? P.ADS_SPEED : 1);
      while (rem > 1e-5) { const h = Math.min(rem, 1 / 90); body.launched = false; body.jumped = 0; body.dashed = false; body.landed = 0; body.kicked = false; body.teleported = false; body.slid = false; B.stepPlayer(body, { f, s: sd, yaw: me.yaw, jump: can && firstStep && jumpQ, dash: can && firstStep && dashQ, crouch: crouching }, h, mul); if (body.slid) play('slide'); rem -= h; firstStep = false;
        if (body.kicked) play('kick'); if (body.teleported) { play('tele'); teleFlash = 0.35; if (T && T.ready) T.burst(body.x, body.y + 1, body.z, 30, 5, ['#35e6ff', '#c77dff', '#ffffff'], 0.5); }
        if (body.launched) play('pad'); if (body.jumped) play('jump'); if (body.dashed) play('dash'); if (body.landed) landDip = Math.min(0.22, body.landed * 0.012); }
      jumpQ = false; dashQ = false; landDip *= Math.pow(0.001, dt); if (trainWarn > 0) trainWarn -= dt;
      me.eye += ((body.crouched ? P.CROUCH_EYE : P.EYE) - me.eye) * Math.min(1, dt * 16); if (me.meleeT > 0) me.meleeT -= dt;
      if (me.burstLeft > 0 && time >= me.burstT) { if (can && me.mag > 0 && WEAPONS[me.w].burst && me.reloadEnd <= time) { shoot(); me.burstT = time + 1 / WEAPONS[me.w].rate; me.burstLeft--; } else me.burstLeft = 0; }
      me.kick *= Math.pow(0.0008, dt); me.spreadAdd = Math.max(0, me.spreadAdd - dt * 0.05); me.zoom += ((zooming && me.alive ? 1 : 0) - me.zoom) * Math.min(1, dt * 14);
      if (firing && can && WEAPONS[me.w].auto) fire();
      if (can) { sendT -= dt; if (sendT <= 0) { sendT = 0.05; G.send({ type: 'p', x: +body.x.toFixed(2), y: +body.y.toFixed(2), z: +body.z.toFixed(2), yaw: +me.yaw.toFixed(3), pitch: +me.pitch.toFixed(3), cr: body.crouched ? 1 : 0 }); } }
      if (T) { try { T.update(dt); } catch (e) { failed = e.message; console.error(e); T.dispose(); T = null; } }
      hud(dt);
    },
    destroy() {
      document.removeEventListener('pointerlockchange', onLock); canvas.removeEventListener('wheel', onWheel); window.removeEventListener('keydown', onTab); window.removeEventListener('keyup', onTab);
      if (document.pointerLockElement === canvas) document.exitPointerLock(); G.clearUI();
      delete window.__bl; delete window.__blAim; delete window.__blGo;
      if (T) T.dispose(); T = null; if (ac) { try { ac.close(); } catch (e) { /* ignore */ } }
    },
  };
});
