// Meme Karts client: 3D (Three.js) chase-cam renderer + 2D HUD drawn on the framework canvas on top.
// The server is still a flat 900x600 top-down simulation; this file only changes how it LOOKS.
//
// World mapping: game (x, y) -> world (X = x - OX, Y = up, Z = y - OZ). Heading a -> rotation.y = -a (models face +X).
//
// BLENDER MODELS: drop .glb files into public/models/ and they replace the procedural placeholders automatically
// (see `3d.md` in the project root for names, sizes and orientation rules). Nothing here needs editing.
//
// ADDING A WEAPON: server WEAPONS entry + WEAPON_NAMES + ICONS[id] here, and ENT[kind] if it spawns a new entity kind.
registerGame('memekarts', (G) => {
  const { ctx, canvas } = G;
  let W = G.W, H = G.H;
  let map = window.MEMEKARTS_MAPS[0], OBST = map.obstacles, BOXES = map.boxes;
  const touchKeys=new Set();
  const touchControls=document.createElement('div');touchControls.className='kart-touch-controls';
  touchControls.innerHTML='<div class="touch-drive"><button data-drive="w" aria-label="Accelerate">▲</button><button data-drive="a" aria-label="Steer left">◀</button><button data-drive="s" aria-label="Reverse">▼</button><button data-drive="d" aria-label="Steer right">▶</button></div><button class="touch-fire" aria-label="Fire weapon">FIRE</button>';
  G.ui.appendChild(touchControls);
  for(const b of touchControls.querySelectorAll('[data-drive]')){
    b.onpointerdown=e=>{e.preventDefault();try { b.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events have no pointer */ }touchKeys.add(b.dataset.drive);b.classList.add('pressed');};
    const release=()=>{touchKeys.delete(b.dataset.drive);b.classList.remove('pressed');};b.onpointerup=release;b.onpointercancel=release;b.onlostpointercapture=release;
  }
  { const fb = touchControls.querySelector('.touch-fire'); fb.onpointerdown = (e) => { e.preventDefault(); try { fb.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ } trigger(true); }; const up = () => trigger(false); fb.onpointerup = up; fb.onpointercancel = up; fb.onlostpointercapture = up; } /* press fires; for the pie, hold to aim and release to throw */
  const WEAPON_NAMES = { green: 'Green shell', triple: 'Triple shells', red: 'Red shell', blue: 'Blue shell', tnt: 'TNT', bomb: 'Bob-omb', pie: 'Cream pie', pad: 'Launch pad', egg: 'Egg gun', banana: 'Banana', fake: 'Fake item box', fire: 'Fire flower', gun: 'Minigun', mush: 'Boost mushroom', star: 'Star', boo: 'Boo ghost', bolt: 'Lightning', bill: 'Bullet Bill', ink: 'Blooper' };
  /* One line each, shown at the top of the screen while you hold the item and in the H guide. Keep them short and literal. */
  const WEAPON_INFO = {
    green: 'Fires straight ahead and bounces off walls.', triple: 'Three shells in a spread. They bounce off walls.', red: 'Homing shell. Chases the nearest kart.',
    blue: 'Flies over walls and hunts whoever has the most kills.', tnt: 'Drops behind you and explodes after 2 seconds.', bomb: 'Lobbed ahead. Blows up on contact or after a moment.',
    pad: 'Placed under you. Launches any kart that drives over it.', egg: 'Three eggs. A hit turns a kart into a slow, helpless egg.', banana: 'Drops behind you. Karts that touch it spin out.',
    fake: 'Drops a fake item box. Whoever grabs it spins out.', fire: 'A quick burst of five bouncing fireballs.', gun: 'Sprays bullets ahead for two seconds.',
    mush: 'Speed boost. Ram other karts to hurt them.', star: 'Six seconds invincible and fast. Ramming wrecks karts.', boo: 'Untouchable for five seconds, and steals someone\'s item.',
    bolt: 'Shrinks and slows everyone else. May zap their items.', bill: 'Three seconds of autopilot rocket. Flattens karts in your path.', ink: 'Splats ink over everyone else\'s screen.',
    pie: `Hold ${window.matchMedia('(pointer:coarse)').matches ? 'FIRE' : 'SPACE'} to aim the throw, let go to lob it. Cream over whoever it splats.`,
  };
  const ITEM_ORDER = ['green', 'triple', 'red', 'blue', 'fire', 'gun', 'bomb', 'pie', 'tnt', 'banana', 'fake', 'egg', 'pad', 'mush', 'star', 'bill', 'boo', 'bolt', 'ink'];
  // the Cream pie is aimed: hold SPACE (or the mouse button) to charge, release to throw. chargeAt = when the hold began, or null
  let chargeAt = null; const chargeNow = () => chargeAt == null ? 0 : Math.min(1, (time - chargeAt) / 1.1);
  let showGuide = false, cardW = null, cardT = -9;
  // SPACE / click: most items fire on press. A held item (the pie) starts charging on press and is thrown on release.
  function trigger(down) {
    const k = s && s.karts.find((q) => q.id === G.me), held = k && k.weapon === 'pie';
    if (down) { if (held) { if (chargeAt == null) chargeAt = time; } else G.send({ type: 'fire' }); }
    else if (chargeAt != null) { G.send({ type: 'fire', charge: chargeNow() }); chargeAt = null; }
  }
  /* Arena size comes from the map (map.w x map.h, default 900 x 600). OX / OZ are the world offsets: world X = x - OX, Z = y - OZ. */
  let MW = 900, MH = 600, OX = 450, OZ = 300;
  const VEHICLE_NAMES = ['Plumber kart', 'Pickup truck', 'Shopping cart', 'Battle bus', 'Octane', 'Tractor', 'Ice cream van', 'Rocket sled'];

  let s = null, lastCtl = '', time = 0, T = null, failed = null;
  let flash = 0, hurt = 0;
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const damp=(value,target,speed,dt)=>value+(target-value)*(1-Math.exp(-speed*dt));
  const feed = [], banners = [];
  const nm = (id) => (id ? G.player(id).name : '?');
  const banner = (text, color = '#ffd84d', t = 2) => { banners.unshift({ text, color, t, duration:t }); if (banners.length > 3) banners.length = 3; };
  const lerpAngle = (a, b, f) => a + ((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) * f;

  // ============================ 2D HUD icons ============================
  function rr(x, y, w, h, r, fill, stroke) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); } }
  const shellIcon = (c1, c2) => (x, y, z) => { G.circle(x, y, z, c1, c2); G.circle(x, y, z * 0.55, '#f6fff4'); };
  const ICONS = {
    green: shellIcon('#3ddc5a', '#1a6'), red: shellIcon('#ff4040', '#900'), blue: shellIcon('#3b6cff', '#fff'),
    triple: (x, y, z) => { for (const d of [-0.7, 0.7, 0]) shellIcon('#3ddc5a', '#1a6')(x + d * z, y + (d ? z * 0.3 : -z * 0.4), z * 0.6); },
    tnt: (x, y, z) => { rr(x - z, y - z, z * 2, z * 2, 2, '#e0442a', '#000'); ctx.fillStyle = '#fff'; ctx.font = `700 ${z * 0.9}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('TNT', x, y); },
    pie: (x, y, z) => { G.circle(x, y + z * 0.25, z * 0.95, '#d8a861', '#8a6a3a'); G.circle(x, y - z * 0.05, z * 0.8, '#fff6e6', '#e8d4b8'); G.circle(x - z * 0.25, y - z * 0.2, z * 0.22, '#fff'); G.circle(x + z * 0.1, y - z * 0.5, z * 0.17, '#e0312f'); },
    bomb: (x, y, z) => { G.circle(x, y + 1, z, '#16181d', '#555'); G.circle(x + z * 0.6, y - z * 0.9, z * 0.3, '#ffd84d'); G.circle(x - z * 0.3, y - z * 0.2, z * 0.18, '#fff'); G.circle(x + z * 0.3, y - z * 0.2, z * 0.18, '#fff'); },
    pad: (x, y, z) => { rr(x - z, y - z * 0.6, z * 2, z * 1.2, 3, '#2f7bff', '#fff'); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x, y - z * 0.4); ctx.lineTo(x - z * 0.5, y + z * 0.3); ctx.lineTo(x + z * 0.5, y + z * 0.3); ctx.fill(); },
    egg: (x, y, z) => { ctx.beginPath(); ctx.ellipse(x, y, z * 0.75, z, 0, 0, 7); ctx.fillStyle = '#fff3c4'; ctx.fill(); ctx.strokeStyle = '#a88'; ctx.lineWidth = 1.5; ctx.stroke(); },
    banana: (x, y, z) => { ctx.strokeStyle = '#ffe135'; ctx.lineWidth = z * 0.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y - z * 0.4, z, 0.3, Math.PI - 0.3); ctx.stroke(); },
    fake: (x, y, z) => { rr(x - z, y - z, z * 2, z * 2, 3, '#c44dff', '#fff'); G.text('¿', x, y, { size: z * 1.5, stroke: false }); },
    gun: (x, y, z) => { rr(x - z, y - z * 0.35, z * 1.5, z * 0.7, 2, '#c9ccd4', '#555'); for (let i = -1; i <= 1; i++) rr(x + z * 0.4, y + i * z * 0.22 - 1.5, z * 0.7, 3, 1, '#8b93a3'); rr(x - z * 0.7, y + z * 0.2, z * 0.4, z * 0.7, 2, '#555'); },
    fire: (x, y, z) => { G.circle(x, y - z * 0.2, z * 0.8, '#ff6a00', '#fff'); G.circle(x, y - z * 0.2, z * 0.4, '#ffd84d'); ctx.fillStyle = '#3ddc5a'; ctx.fillRect(x - 1.5, y + z * 0.5, 3, z * 0.6); },
    mush: (x, y, z) => { ctx.fillStyle = '#ff3d3d'; ctx.beginPath(); ctx.arc(x, y, z, Math.PI, 0); ctx.fill(); rr(x - z * 0.4, y, z * 0.8, z * 0.8, 2, '#fff'); G.circle(x - z * 0.4, y - z * 0.5, z * 0.22, '#fff'); G.circle(x + z * 0.4, y - z * 0.5, z * 0.22, '#fff'); },
    star: (x, y, z) => { ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? z * 0.45 : z, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); ctx.fillStyle = `hsl(${(time * 200) % 360},100%,65%)`; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); },
    boo: (x, y, z) => { G.circle(x, y, z, '#f4f4ff', '#99a'); G.circle(x - z * 0.35, y - z * 0.2, z * 0.16, '#111'); G.circle(x + z * 0.35, y - z * 0.2, z * 0.16, '#111'); ctx.fillStyle = '#d33'; ctx.beginPath(); ctx.arc(x, y + z * 0.3, z * 0.35, 0, Math.PI); ctx.fill(); },
    bolt: (x, y, z) => { ctx.beginPath(); ctx.moveTo(x + z * 0.2, y - z); ctx.lineTo(x - z * 0.6, y + z * 0.1); ctx.lineTo(x - z * 0.05, y + z * 0.1); ctx.lineTo(x - z * 0.3, y + z); ctx.lineTo(x + z * 0.6, y - z * 0.2); ctx.lineTo(x + z * 0.05, y - z * 0.2); ctx.closePath(); ctx.fillStyle = '#fff27a'; ctx.fill(); ctx.strokeStyle = '#b58a00'; ctx.lineWidth = 1.5; ctx.stroke(); },
    bill: (x, y, z) => { rr(x - z, y - z * 0.6, z * 2, z * 1.2, z * 0.6, '#16181d', '#666'); G.circle(x + z * 0.4, y - z * 0.1, z * 0.28, '#fff'); G.circle(x + z * 0.48, y - z * 0.1, z * 0.12, '#111'); },
    ink: (x, y, z) => { G.circle(x, y - z * 0.2, z * 0.75, '#f4f4ff', '#223'); for (let i = -1; i <= 1; i++) { ctx.fillStyle = '#f4f4ff'; ctx.fillRect(x + i * z * 0.45 - 2, y + z * 0.3, 4, z * 0.7); } G.circle(x - z * 0.25, y - z * 0.2, z * 0.14, '#111'); G.circle(x + z * 0.25, y - z * 0.2, z * 0.14, '#111'); },
  };

  // ============================ 3D ============================
  function create3D() {
    const THREE = window.THREE;
    const gl = document.createElement('canvas');
    gl.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    canvas.parentNode.insertBefore(gl, canvas);
    const prev = { bg: canvas.style.background, pos: canvas.style.position };
    canvas.style.background = 'transparent'; canvas.style.position = 'relative';
    const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, powerPreference: 'high-performance' }); window.__fgRenderer = renderer; /* for tools/perf.js: renderer.info shows what accumulates */
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const studio = window.RoomEnvironment ? new window.RoomEnvironment() : null;
    const environment = studio ? pmrem.fromScene(studio, .06) : null;
    if (environment) { scene.environment = environment.texture; scene.environmentIntensity = .42; }
    if (studio) studio.dispose();
    pmrem.dispose();
    const camera = new THREE.PerspectiveCamera(62, 1.5, 1, 6000);
    /* Bloom: bright things (item boxes, flames, explosions, neon) glow. Rendered in HDR, so only values above 1 bloom.
       Add ?bloom=0 to the URL to turn it off, ?bloom=1 to force it on. Otherwise it switches itself off if frames get slow. */
    const bloomPref = new URLSearchParams(location.search).get('bloom');
    let composer = null, slowFrames = 0, frameCount = 0;
    function disposeComposer() {
      if (!composer) return;
      // EffectComposer disposes its own buffers, but each pass owns additional GPU resources.
      for (const pass of composer.passes) pass.dispose?.();
      composer.dispose();
      composer = null;
    }
    try {
      const PP = window.THREE_PP;
      if (PP && bloomPref !== '0') {
        composer = new PP.EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
        composer.addPass(new PP.RenderPass(scene, camera));
        composer.addPass(new PP.UnrealBloomPass(new THREE.Vector2(256, 256), 0.14, 0.3, 1.25)); /* strength, radius, threshold: kept subtle, the neon map has very bright walls */
        composer.addPass(new PP.OutputPass());
      }
    } catch (e) { console.warn('bloom unavailable', e); disposeComposer(); }
    camera.position.set(0, 420, 420); camera.lookAt(0, 0, 0);
    const look = new THREE.Vector3(0, 0, 0);
    let fw = 0, fh = 0, fl = -1, ft = -1, camA = 0, shake = 0, worldBuilt = false, sunLight = null;

    // ---- helpers ----
    const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
    const M3 = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0.12, flatShading: true }, o));
    const mesh = (geo, m, x = 0, y = 0, z = 0) => { const k = new THREE.Mesh(geo, m); k.position.set(x, y, z); k.castShadow = true; k.receiveShadow = true; return k; };
    const box = (w, h, d, m, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z);
    const cyl = (rt, rb, h, m, x, y, z, seg = 14) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z);
    const sph = (r, m, x, y, z, seg = 14) => mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg - 4)), m, x, y, z);
    const glow = (color, i = 2) => M3(color, { emissive: color, emissiveIntensity: i });

    // ---- Blender / GLB overrides ----
    const MODELS = {}; let assetsReady = false;
    fetch('/models/list').then((r) => r.json()).then((files) => {
      if (!files.length || !window.GLTFLoader) { assetsReady = true; return; }
      const loader = new window.GLTFLoader(); let left = files.length;
      const done = () => { if (--left <= 0) assetsReady = true; };
      for (const f of files) loader.load('/models/' + f, (g) => { MODELS[f.replace(/\.(glb|gltf)$/i, '').toLowerCase()] = g.scene; done(); }, undefined, done);
    }).catch(() => { assetsReady = true; });
    setTimeout(() => { assetsReady = true; }, 6000);
    // Returns a clone of models/<name>.glb auto-fitted so its longest horizontal side = size, sitting on y = 0. null if absent.
    function asset(name, size, color) {
      const src = MODELS[name]; if (!src) return null;
      const o = src.clone(true); const g = new THREE.Group(); g.add(o);
      const bb = new THREE.Box3().setFromObject(o), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
      const sc = size / Math.max(sz.x, sz.z, 0.0001);
      o.scale.multiplyScalar(sc); o.position.set(o.position.x * sc - c.x * sc, o.position.y * sc - bb.min.y * sc, o.position.z * sc - c.z * sc);
      o.traverse((m) => { if (!m.isMesh) return; m.castShadow = m.receiveShadow = true; m.material = m.material.clone(); if (color && /paint|player/i.test(m.material.name || '')) m.material.color.set(color); if (m.material.emissive && m.material.emissive.getHex() !== 0) m.material.emissiveIntensity = Math.max(m.material.emissiveIntensity || 1, 2.6); });
      g.userData.wheels = []; o.traverse((m) => { if (/^wheel/i.test(m.name)) g.userData.wheels.push(m); });
      g.userData.glb = true;
      return g;
    }

    // ---- world ----
    function buildWorld() {
      worldBuilt = true;
      /* warm-up: one of every item model is built now and its shaders compiled, so the first shell of the match does not hitch */
      try { const warm = []; for (const k of Object.keys(ENT)) { const g = ENT[k](); g.position.set(0, -600, 0); scene.add(g); warm.push([k, g]); } renderer.compile(scene, camera); for (const [k, g] of warm) { g.visible = false; (entPool[k] = entPool[k] || []).push(g); } } catch (e) { console.warn('warm-up skipped', e); }
      const night = map.theme === 'neon', desert = map.theme === 'canyon';
      scene.background = tex(16, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, map.sky); g.addColorStop(1, map.fog); c.fillStyle = g; c.fillRect(0, 0, w, h); });
      scene.fog = new THREE.Fog(map.fog, Math.max(750, MW * 0.8), 2600 + MW);
      scene.add(new THREE.HemisphereLight(night ? 0x97baff : 0xe0f0ff, new THREE.Color(map.ground), night ? .85 : .8));
      const sun = new THREE.DirectionalLight(map.sun, night ? 1.9 : 2.8);
      sun.position.set(-320, 430, 240); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.radius = 3;
      Object.assign(sun.shadow.camera, { left: -540, right: 540, top: 540, bottom: -540, near: 50, far: 1700 }); sunLight = sun; scene.add(sun.target); /* the shadow box follows the camera, see updateCamera */ sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.3;
      scene.add(sun);
      const rim = new THREE.DirectionalLight(night ? 0xff72de : 0xaad9ff, night ? 1.2 : .7); rim.position.set(200,160,-400); scene.add(rim);

      if (MODELS.arena && map.id === 'stadium') { // A legacy arena override matches only the original layout.
        const a = MODELS.arena.clone(true); a.scale.setScalar(10); a.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } }); scene.add(a);
      } else {
        // grass
        const grass = tex(256, 256, (c, w, h) => { c.fillStyle = map.ground; c.fillRect(0, 0, w, h); for (let i = 0; i < 1800; i++) { c.fillStyle = i % 2 ? '#ffffff0b' : '#0000000b'; c.fillRect(Math.random() * w, Math.random() * h, 2, 3); } });
        grass.wrapS = grass.wrapT = THREE.RepeatWrapping; grass.repeat.set(40, 40);
        const gp = mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }), 0, -0.6, 0); gp.rotation.x = -Math.PI / 2; gp.castShadow = false; scene.add(gp);
        // arena floor (asphalt with paint)
        const fw2 = (MW - 40) * 2, fh2 = (MH - 40) * 2, fk = Math.min(1, 2600 / fw2), farea = (fw2 * fh2) / (1720 * 1120); /* floor is painted at 2 px per unit, capped for big maps */
        const floor = tex(Math.round(fw2 * fk), Math.round(fh2 * fk), (c) => { c.scale(fk, fk); const w = fw2, h = fh2;
          c.fillStyle = map.floor; c.fillRect(0, 0, w, h);
          for (let i = 0; i < 9000 * farea; i++) { const v = 40 + Math.random() * 90; c.fillStyle = `rgba(${v},${v},${v + 8},.10)`; c.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 2, 2); }
          c.strokeStyle = 'rgba(255,255,255,.045)'; c.lineWidth = 2; for (let x = 0; x <= w; x += 80) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y <= h; y += 80) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
          c.strokeStyle = 'rgba(20,20,24,.35)'; c.lineWidth = 7; for (let i = 0; i < 26 * farea; i++) { c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 60 + Math.random() * 160, Math.random() * 6, Math.random() * 6 + 1.2); c.stroke(); }
          c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 8; c.beginPath(); c.arc(w / 2, h / 2, 230, 0, 7); c.stroke();
          c.setLineDash([36, 24]); c.strokeStyle = '#ffd84d'; c.lineWidth = 8; c.strokeRect(18, 18, w - 36, h - 36); c.setLineDash([]);
          const cols = ['#ff5d5d', '#4da6ff', '#5ee07a', '#ffd84d'];
          [[0, 0], [w, 0], [0, h], [w, h]].forEach(([x, y], i) => { c.fillStyle = cols[i] + '55'; c.beginPath(); c.arc(x, y, 190, 0, 7); c.fill(); });
          c.fillStyle = 'rgba(255,255,255,.5)'; for (const [bx, by] of BOXES) { c.beginPath(); c.arc((bx - 20) * 2, (by - 20) * 2, 44, 0, 7); c.globalAlpha = 0.25; c.fill(); c.globalAlpha = 1; }
          c.strokeStyle=map.accent;c.lineWidth=4;c.globalAlpha=.5;c.beginPath();c.roundRect(95,95,w-190,h-190,100);c.stroke();c.globalAlpha=1;
          c.fillStyle='#ffffffaa';c.font='italic 900 42px system-ui';c.textAlign='center';c.fillText('MEME KARTS',w/2,115);
          for(let x=0;x<12;x++)for(let y=0;y<2;y++){c.fillStyle=(x+y)%2?'#ffffffbb':'#18262eaa';c.fillRect(w/2-144+x*24,h-105+y*24,24,24);}
        });
        const roadGrain=tex(128,128,(c,w,h)=>{let seed=29;for(let y=0;y<h;y++)for(let x=0;x<w;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=190+seed%65;c.fillStyle=`rgb(${v},${v},${v})`;c.fillRect(x,y,1,1);}});
        roadGrain.colorSpace=THREE.NoColorSpace;roadGrain.wrapS=roadGrain.wrapT=THREE.RepeatWrapping;roadGrain.repeat.set((MW-40)/70,(MH-40)/70);
        const fp = mesh(new THREE.PlaneGeometry(MW - 40, MH - 40), new THREE.MeshStandardMaterial({ map: floor, bumpMap:roadGrain,bumpScale:night?.10:.22,roughness:night?.52:.88, metalness:night?.12:.02 })); fp.rotation.x = -Math.PI / 2; fp.castShadow = false; scene.add(fp);
        // border walls with hazard stripes
        const stripe = (rep) => { const t = tex(128, 64, (c, w, h) => { c.fillStyle = '#ffd21f'; c.fillRect(0, 0, w, h); c.fillStyle = '#1c1c20'; for (let i = -2; i < 6; i++) { c.beginPath(); c.moveTo(i * 32, h); c.lineTo(i * 32 + 16, h); c.lineTo(i * 32 + 48, 0); c.lineTo(i * 32 + 32, 0); c.fill(); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, 1); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }); };
        const wallMat=M3(night?'#273954':desert?'#ac6747':'#44777b'), rail=glow(map.accent,night?1.7:.35);
        const wx = OX - 14, wz = OZ - 14; /* centre lines of the border walls */
        scene.add(box(MW-16,24,12,wallMat,0,12,-wz),box(MW-16,24,12,wallMat,0,12,wz),box(12,24,MH-40,wallMat,-wx,12,0),box(12,24,MH-40,wallMat,wx,12,0));
        for(const z of [-wz,wz])scene.add(box(MW-16,2,13,rail,0,23.3,z)); /* 0.3 above the wall top: at exactly the same height the two surfaces flicker through each other */
        for(const x of [-wx,wx])scene.add(box(13,2,MH-40,rail,x,23.3,0));
        const curbGeo=new THREE.BoxGeometry(18,1.2,7), curbMat=M3('#f6eedd');
        const curbs=new THREE.InstancedMesh(curbGeo,curbMat,Math.ceil((MW+MH)*2/27)+16), curbPose=new THREE.Object3D();let ci=0;
        for(const z of [-(OZ-27),OZ-27])for(let x=-(OX-36);x<=OX-36;x+=27){curbPose.position.set(x,.6,z);curbPose.rotation.y=0;curbPose.updateMatrix();curbs.setMatrixAt(ci++,curbPose.matrix);}
        for(const x of [-(OX-26),OX-26])for(let z=-(OZ-50);z<=OZ-50;z+=27){curbPose.position.set(x,.6,z);curbPose.rotation.y=Math.PI/2;curbPose.updateMatrix();curbs.setMatrixAt(ci++,curbPose.matrix);}curbs.count=ci;scene.add(curbs);
        // obstacles: concrete blocks with a coloured cap
        const conc = M3('#9aa3b5', { roughness: 0.9 }), cap = M3('#ff8a3d', { roughness: 0.5 });
        for (const o of OBST) {
          const x = o.x + o.w / 2 - OX, z = o.y + o.h / 2 - OZ;
          const obstacleAsset = night ? 'obstacle_neon' : desert ? 'obstacle_canyon' : 'obstacle';
          const custom = asset(obstacleAsset, 100) || asset('obstacle', 100);
          if (custom) { // stretch the model to this obstacle's exact footprint (long side along the obstacle's long side)
            const turned = o.h > o.w, bb = new THREE.Box3().setFromObject(custom), sz = bb.getSize(new THREE.Vector3());
            custom.scale.set((turned ? o.h : o.w) / sz.x, 33 / sz.y, (turned ? o.w : o.h) / sz.z);
            if (turned) custom.rotation.y = Math.PI / 2;
            custom.traverse(m=>{if(m.isMesh){if(m.material.name==='Orange')m.material.color.set(map.cap);if(m.material.name==='Paint')m.material.color.set(night?'#34445f':desert?'#b37653':'#7b949d');if(night){m.material.metalness=.4;m.material.roughness=.35;}}});
            custom.position.set(x, 0, z); custom.userData.obstacle = { ...o }; scene.add(custom);
            if (!desert) scene.add(box(o.w,1.5,o.h,rail,x,33.4,z));continue;
          }
          scene.add(box(o.w, 30, o.h, conc, x, 15, z), box(o.w + 3, 5, o.h + 3, cap, x, 32, z));
          const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(o.w, 30, o.h)), new THREE.LineBasicMaterial({ color: 0x5b6375 })); e.position.set(x, 15, z); scene.add(e);
        }
        // tire stacks at the corners
        const tire = M3('#1b1c20', { roughness: 0.9 });
        for (const [cx, cz] of [[-(OX+2), -(OZ+2)], [OX+2, -(OZ+2)], [-(OX+2), OZ+2], [OX+2, OZ+2]]) for (let i = 0; i < 3; i++) /* just outside the wall corners so karts can't drive into them */ { const t = mesh(new THREE.TorusGeometry(9, 4, 8, 14), i === 1 ? M3('#e9e9e9') : tire, cx, 4 + i * 8, cz); t.rotation.x = Math.PI / 2; scene.add(t); }
        // scenery: trees, grandstands, mountains, balloons
        const trunk = M3('#7a5230'), leafs = ['#2f8f46', '#3fae55', '#27803d', '#58b85f'].map((c) => M3(c));
        for (let i = 0; i < 95; i++) {
          const a = Math.random() * Math.PI * 2, r = Math.max(OX, OZ) + 110 + Math.random() * 900, x = Math.cos(a) * r * 1.25, z = Math.sin(a) * r;
          if (Math.abs(x) < OX + 70 && Math.abs(z) < OZ + 80) continue;
          // Keep the close landmark strip readable; scenery beyond it supplies the skyline.
          if (Math.abs(x) < OX + 235 && Math.abs(z) < OZ + 180) continue;
          if(night){const height=70+(i%7)*32;scene.add(box(45,height,50,M3('#23334d'),x,height/2,z),box(46,2,51,glow(i%2?'#68efff':'#ff75c5',1.6),x,height,z));continue;}
          if(desert){const stone=M3(i%2?'#b66d47':'#d59865');scene.add(cyl(20+(i%4)*8,35+(i%4)*8,70+(i%5)*20,stone,x,25+(i%5)*10,z,6));continue;}
          const sc = 0.8 + Math.random() * 1.4, lm = leafs[i % 4];
          const t = asset('tree', 50 * sc); if (t) { t.traverse((m) => { if (m.isMesh && /mint|leaf|pine|green/i.test(m.material.name || '')) m.material.color.multiplyScalar(0.42 + (i % 4) * 0.06); }); t.position.set(x, 0, z); t.rotation.y = a; scene.add(t); continue; } /* the model's foliage is very bright: deepen it and vary it per tree */
          scene.add(cyl(5 * sc, 7 * sc, 26 * sc, trunk, x, 13 * sc, z, 7), mesh(new THREE.ConeGeometry(26 * sc, 46 * sc, 7), lm, x, 44 * sc, z), mesh(new THREE.ConeGeometry(19 * sc, 38 * sc, 7), lm, x, 68 * sc, z));
        }
        const seatCols = ['#ff5d5d', '#4da6ff', '#ffd84d', '#5ee07a'];
        for (const zs of [-1, 1]) for (let r = 0; r < 4; r++) scene.add(box(MW - 200, 14, 26, M3(seatCols[r]), 0, 7 + r * 14, zs * (OZ + 80 + r * 26)));
        for (const zs of [-1, 1]) for (let i = 0; i < Math.min(130, Math.round(90 * MW / 900)); i++) scene.add(sph(4.5, M3(`hsl(${Math.random() * 360},70%,60%)`), -(MW - 220) / 2 + Math.random() * (MW - 220), 20 + Math.floor(Math.random() * 4) * 14 + 4, zs * (OZ + 80 + Math.floor(Math.random() * 4) * 26), 6));
        const rock = M3(desert?'#bc795c':night?'#243351':'#849c91', { roughness: 1 }), snow = M3(desert?'#dfab7c':night?'#42517a':'#dde4d7');
        if(!night)for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + Math.random() * 0.2, r = 2300 + Math.random() * 500, hgt = 250 + Math.random() * 330, x = Math.cos(a) * r, z = Math.sin(a) * r; const m = mesh(new THREE.ConeGeometry(520 + Math.random() * 260, hgt, 6), rock, x, hgt / 2 - 20, z); m.castShadow = false; const cp = mesh(new THREE.ConeGeometry(170, hgt * 0.3, 6), snow, x, hgt * 0.85 - 20, z); cp.castShadow = false; scene.add(m, cp); }
      }
      buildLandmarks();
      // Trackside signs sit beyond the collision walls.
      const signTexture=tex(1024,256,(c,w,h)=>{c.fillStyle=night?'#111a32':'#17383d';c.fillRect(0,0,w,h);c.fillStyle=map.accent;c.font='italic 900 88px system-ui';c.textAlign='center';c.fillText('MEME KARTS',w/2,118);c.fillStyle='#ffffff';c.font='600 28px system-ui';c.fillText(map.name.toUpperCase()+'  /  NO FRIENDS ON THE TRACK',w/2,180);});
      for(const z of [-(OZ+40),OZ+40]){const sign=mesh(new THREE.PlaneGeometry(230,58),new THREE.MeshStandardMaterial({map:signTexture,emissive:0xffffff,emissiveMap:signTexture,emissiveIntensity:night?.8:.15,side:THREE.DoubleSide}),0,94,z);if(z>0)sign.rotation.y=Math.PI;scene.add(sign);for(const x of [-105,105])scene.add(box(4,100,4,M3('#25363b'),x,50,z));}
      // clouds + balloons drift regardless of arena model
      const cloud = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
      for (let i = 0; i < 16; i++) { const g = new THREE.Group(); for (let j = 0; j < 5; j++) { const p = sph(40 + Math.random() * 40, cloud, (j - 2) * 55, Math.random() * 20, Math.random() * 40, 7); p.castShadow = false; g.add(p); } g.position.set(-2200 + Math.random() * 4400, 520 + Math.random() * 300, -2200 + Math.random() * 4400); g.userData.drift = 6 + Math.random() * 10; clouds.push(g); scene.add(g); }
      for (let i = 0; i < 4; i++) { const g = new THREE.Group(), c = ['#ff5d5d', '#ffd84d', '#c77dff', '#2ee6d6'][i]; const b = sph(46, M3(c), 0, 0, 0, 10); b.scale.y = 1.15; g.add(b, box(18, 14, 18, M3('#8a5a2b'), 0, -74, 0)); g.position.set([-700, 760, -500, 620][i], 330 + i * 40, [-600, -520, 640, 560][i]); g.userData.phase = i * 1.7; balloons.push(g); scene.add(g); }
      // item boxes
      BOXES.forEach(([x, y], i) => {
        const g = asset('item_box', 24) || itemBox('#ffcf33', '?');
        g.userData.base = surfaceAt(x, y); g.position.set(x - OX, 16 + g.userData.base, y - OZ); boxViews.push(g); scene.add(g);
        const ring = mesh(new THREE.RingGeometry(14, 17, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }), x - OX, 0.4 + g.userData.base, y - OZ); ring.rotation.x = -Math.PI / 2; ring.castShadow = false; scene.add(ring);
        const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:particleTexture,color:night?'#67eaff':'#c7faff',opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false}));halo.position.set(0,12,0);halo.scale.set(58,58,1);g.add(halo);
      });
      scene.add(points,skids);
      buildMapFeatures();
    }
    // Blender environment pieces live entirely outside the walls. Collision layouts are unchanged.
    const environmentAnimations = [];
    function buildLandmarks() {
      for (const side of [-1, 1]) for (const end of [-1, 1]) {
        const name = 'landmark_' + map.theme, g = asset(name, 180);
        if (!g) continue;
        g.name = name; g.userData.environment = true;
        // Wrap Blender pivots in a world-aligned local frame: exported mesh axes can differ.
        const animated = []; g.traverse(o => { if (/^anim_(spinner|rotor)$/.test(o.name)) animated.push(o); });
        g.updateMatrixWorld(true);
        for (const node of animated) {
          const pivot = new THREE.Group(); pivot.name = node.name + '_pivot';
          pivot.position.copy(g.worldToLocal(node.getWorldPosition(new THREE.Vector3())));
          g.add(pivot); pivot.updateMatrixWorld(true); pivot.attach(node);
          environmentAnimations.push({ pivot, axis: node.name === 'anim_rotor' ? 'x' : 'y', speed: node.name === 'anim_rotor' ? .65 : .38 });
        }
        g.position.set(side * (OX + 125), 0, end * OZ * .64);
        g.rotation.y = side > 0 ? Math.PI : 0; scene.add(g);
      }
      if (map.theme === 'canyon') {
        for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
          const g = asset('prop_cactus', 24 + (i % 3) * 5); if (!g) continue;
          g.name = 'prop_cactus'; g.userData.environment = true;
          g.position.set((i - 4) * (MW - 160) / 9, 0, side * (OZ + 28 + (i % 2) * 22));
          g.rotation.y = i * 1.7; scene.add(g);
        }
      }
    }
    function updateEnvironment(dt) {
      if (reducedMotion) return;
      for (const { pivot, axis, speed } of environmentAnimations) pivot.rotation[axis] = (pivot.rotation[axis] + dt * speed) % (Math.PI * 2);
    }

    /* Map features from public/memekarts-maps.js: floor pads, warp portals, mud, rolling boulders. The server simulates them;
       this only draws them. */
    const padViews = [], portalViews = [], moverViews = [], PORTAL_COLORS = ['#35e6ff', '#ff4dd8', '#ffd84d'];
    function flat(geo, mat, x, y, z) { const m = mesh(geo, mat, x, y, z); m.rotation.x = -Math.PI / 2; m.castShadow = false; m.receiveShadow = false; return m; }
    /* Ramps: height of the ramp surface under a point (0 when not on one). RAMP_H is the height of the high end. */
    const RAMP_H = window.MEMEKARTS_MAPS.DECK_Z; /* height of every deck and of the top of every ramp */
    const surfaceAt = (x, y) => window.MEMEKARTS_MAPS.surface(map, x, y); /* ground height: 0 floor, RAMP_H deck, in between on a ramp */
    function buildDecks() {
      /* Raised decks: solid blocks you drive on top of. A bright rim marks the edge you can drop off. */
      const night = map.theme === 'neon', desert = map.theme === 'canyon';
      const side = M3(night ? '#1b2440' : desert ? '#b9773f' : '#5d7f86', { roughness: 0.85 }), hot = night ? '#68efff' : '#ffd21f';
      for (const d of map.decks || []) {
        const cx = d.x + d.w / 2 - OX, cz = d.y + d.h / 2 - OZ;
        const topTex = tex(256, 256, (c, cw, ch) => { c.fillStyle = night ? '#2a3760' : desert ? '#d9a066' : '#8fb0b4'; c.fillRect(0, 0, cw, ch); c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 3; for (let i = 0; i <= cw; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, ch); c.moveTo(0, i); c.lineTo(cw, i); c.stroke(); } for (let i = 0; i < 500; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; c.fillRect(Math.random() * cw, Math.random() * ch, 4, 4); } });
        topTex.wrapS = topTex.wrapT = THREE.RepeatWrapping; topTex.repeat.set(d.w / 80, d.h / 80);
        const blockM = [side, side, new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.8 }), side, side, side];
        const model = (d.z ? asset(night ? 'tower_neon' : desert ? 'tower_canyon' : 'tower', 100) : null) || asset(night ? 'deck_neon' : desert ? 'deck_canyon' : 'deck', 100) || asset('deck', 100); /* optional Blender deck (or tower summit), stretched to this footprint */
        const DZ = window.MEMEKARTS_MAPS.deckZ(d); /* a second tier is a deck stacked on a deck: its block runs from the floor to its own height */
        const inset = d.z ? 1.2 : 0; /* a second tier shares side planes with the deck it stands in; a hair narrower, its buried walls stop flickering through the deck's */
        if (model) { const bb = new THREE.Box3().setFromObject(model), sz = bb.getSize(new THREE.Vector3()); model.scale.set((d.w - inset) / sz.x, DZ / sz.y, (d.h - inset) / sz.z); model.position.set(cx, 0, cz); model.name = 'deck'; scene.add(model); }
        else { const blk = mesh(new THREE.BoxGeometry(d.w - inset, DZ, d.h - inset), blockM, cx, DZ / 2, cz); blk.name = 'deck'; scene.add(blk); }
        /* glowing rim, with gaps where a ramp meets the deck */
        const edges = [[d.x, d.y, d.x + d.w, d.y], [d.x, d.y + d.h, d.x + d.w, d.y + d.h], [d.x, d.y, d.x, d.y + d.h], [d.x + d.w, d.y, d.x + d.w, d.y + d.h]];
        for (const [x0, y0, x1, y1] of edges) {
          const horiz = y0 === y1, lo = horiz ? x0 : y0, hi = horiz ? x1 : y1; let cuts = [];
          for (const rp of map.ramps || []) { const touch = horiz ? ((rp.dir === 'S' && Math.abs(rp.y + rp.h - y0) < 2) || (rp.dir === 'N' && Math.abs(rp.y - y0) < 2)) && rp.x < hi && rp.x + rp.w > lo : ((rp.dir === 'E' && Math.abs(rp.x + rp.w - x0) < 2) || (rp.dir === 'W' && Math.abs(rp.x - x0) < 2)) && rp.y < hi && rp.y + rp.h > lo; if (touch) cuts.push(horiz ? [rp.x, rp.x + rp.w] : [rp.y, rp.y + rp.h]); }
          cuts.sort((p, q) => p[0] - q[0]); let at = lo; const segs = []; for (const [c0, c1] of cuts) { if (c0 > at) segs.push([at, c0]); at = Math.max(at, c1); } if (at < hi) segs.push([at, hi]);
          for (const [s0, s1] of segs) { const len = s1 - s0, mid = (s0 + s1) / 2; const rim = horiz ? box(len, 2.4, 3, glow(hot, night ? 1.8 : 0.9), mid - OX, DZ + 1.2, y0 - OZ) : box(3, 2.4, len, glow(hot, night ? 1.8 : 0.9), x0 - OX, DZ + 1.2, mid - OZ); rim.castShadow = false; scene.add(rim); }
        }
      }
    }
    function buildRamps() {
      for (const rp of map.ramps || []) {
        const horiz = rp.dir === 'E' || rp.dir === 'W', len = horiz ? rp.w : rp.h, wid = horiz ? rp.h : rp.w, g = new THREE.Group();
        const [Z0, Z1] = window.MEMEKARTS_MAPS.rampZ(rp), RH = Z1 - Z0; /* this ramp's rise; a tower's second ramp starts on the first deck */
        const custom = asset(map.theme === 'neon' ? 'ramp_neon' : map.theme === 'canyon' ? 'ramp_canyon' : 'ramp', 60) || asset('ramp', 60); /* optional model: rises toward +X in Blender; stretched to the footprint */
        if (custom) { const bb = new THREE.Box3().setFromObject(custom), sz = bb.getSize(new THREE.Vector3()); custom.scale.set(len / sz.x, RH / sz.y, wid / sz.z); custom.traverse((m) => { if (m.isMesh) m.material.side = THREE.DoubleSide; }); /* solid from every angle */
          custom.traverse((m) => { if (m.isMesh && /ink|dark|runway/i.test((m.material.name || '') + m.name)) m.material.color.set(map.theme === 'neon' ? '#ff3fd0' : '#ff8a1f'); }); /* the runway is painted a loud colour: a dark ramp reads as a floor marking */
          g.add(custom); }
        else {
          /* a wedge that rises along local +X, with chevrons painted up the slope and a glowing lip */
          const l = len / 2, w = wid / 2, v = [[-l, 0, -w], [-l, 0, w], [l, RH, w], [-l, 0, -w], [l, RH, w], [l, RH, -w], [l, RH, -w], [l, RH, w], [l, 0, w], [l, RH, -w], [l, 0, w], [l, 0, -w], [-l, 0, -w], [l, RH, -w], [l, 0, -w], [-l, 0, w], [l, 0, w], [l, RH, w]].flat();
          const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); geo.computeVertexNormals();
          g.add(mesh(geo, M3(map.theme === 'neon' ? '#2b3350' : map.theme === 'canyon' ? '#b9773f' : '#e8a13a', { side: THREE.DoubleSide, roughness: 0.7 })));
          const t = tex(128, 128, (c, cw, ch) => { c.clearRect(0, 0, cw, ch); c.strokeStyle = '#ffffff'; c.lineWidth = 12; c.lineCap = 'round'; c.lineJoin = 'round'; for (const x of [24, 58, 92]) { c.beginPath(); c.moveTo(x - 14, 26); c.lineTo(x + 14, 64); c.lineTo(x - 14, 102); c.stroke(); } });
          const slope = Math.hypot(len, RH), deco = mesh(new THREE.PlaneGeometry(slope * 0.86, wid * 0.8), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, color: new THREE.Color(map.accent).multiplyScalar(1.5) }), 0, RH / 2 + 0.5, 0);
          /* lay the chevrons flat, then tilt them to the slope */ deco.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(RH, len))); deco.castShadow = false; g.add(deco);
          const lip = box(2.5, 1.6, wid, glow(map.accent, map.theme === 'neon' ? 2 : 0.9), l - 1, RH + 0.6, 0); lip.castShadow = false; g.add(lip);
        }
        /* Dressing so nobody can miss it: glowing side rails up the slope, two beacon posts at the entrance, chevrons
           painted on the floor leading in, and a big arrow floating above. Local +X is uphill. */
        const dress = new THREE.Group(); /* decoration lives beside the ramp group so the ramp itself keeps its exact footprint */
        const hot = map.theme === 'neon' ? '#68efff' : '#ffd21f', tilt = Math.atan2(RH, len), slopeLen = Math.hypot(len, RH);
        for (const sd of [-1, 1]) {
          const rail = box(slopeLen, 3.2, 3.2, glow(hot, 1.4), 0, RH / 2 + 2.2, sd * (wid / 2 - 1.6)); rail.rotation.z = tilt; rail.castShadow = false; dress.add(rail);
          dress.add(box(3.2, RH, 3.2, M3('#f4f4f4'), len / 2 - 1.6, RH / 2, sd * (wid / 2 - 1.6)));
        }
        const lead = tex(256, 128, (c, cw, ch) => { c.clearRect(0, 0, cw, ch); c.strokeStyle = '#ffffff'; c.lineWidth = 16; c.lineCap = 'round'; c.lineJoin = 'round'; for (const x of [40, 110, 180]) { c.beginPath(); c.moveTo(x - 16, 22); c.lineTo(x + 22, 64); c.lineTo(x - 16, 106); c.stroke(); } });
        const runway = mesh(new THREE.PlaneGeometry(90, wid * 0.8), new THREE.MeshBasicMaterial({ map: lead, transparent: true, depthWrite: false, color: new THREE.Color(hot).multiplyScalar(1.5) }), -len / 2 - 50, 0.8, 0); runway.rotation.x = -Math.PI / 2; runway.castShadow = false; dress.add(runway);
        g.position.set(rp.x + rp.w / 2 - OX, Z0, rp.y + rp.h / 2 - OZ); g.rotation.y = rp.dir === 'E' ? 0 : rp.dir === 'W' ? Math.PI : rp.dir === 'N' ? Math.PI / 2 : -Math.PI / 2; scene.add(g); dress.position.copy(g.position); dress.rotation.y = g.rotation.y; scene.add(dress);
      }
    }
    function buildMapFeatures() {
      buildDecks(); buildRamps();
      for (const pd of map.pads || []) {
        const boostPad = pd.kind === 'boost', col = boostPad ? '#ffb347' : '#7dffb0';
        const t = tex(128, 128, (c, w, h) => {
          c.clearRect(0, 0, w, h); c.fillStyle = boostPad ? 'rgba(255,140,30,.30)' : 'rgba(60,230,140,.30)'; c.beginPath(); c.roundRect(5, 5, w - 10, h - 10, 24); c.fill();
          c.strokeStyle = col; c.lineWidth = 6; c.stroke(); c.lineWidth = 13; c.lineCap = 'round'; c.lineJoin = 'round';
          if (boostPad) for (const y of [92, 60, 28]) { c.beginPath(); c.moveTo(32, y + 14); c.lineTo(64, y - 10); c.lineTo(96, y + 14); c.stroke(); }
          else { c.beginPath(); c.arc(64, 64, 34, 0, 7); c.stroke(); c.beginPath(); c.moveTo(44, 70); c.lineTo(64, 46); c.lineTo(84, 70); c.stroke(); }
        });
        const m = flat(new THREE.PlaneGeometry(52, 52), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, color: new THREE.Color(1.7, 1.7, 1.7) }), pd.x - OX, 0.7, pd.y - OZ);
        padViews.push({ m, boostPad }); scene.add(m);
        if (!boostPad) { const rim = mesh(new THREE.TorusGeometry(24, 2.2, 8, 28), M3('#2fbf78', { emissive: '#2fbf78', emissiveIntensity: 1.2 }), pd.x - OX, 1.6, pd.y - OZ); rim.rotation.x = Math.PI / 2; rim.castShadow = false; scene.add(rim); }
      }
      (map.portals || []).forEach((pair, i) => pair.forEach((e) => {
        const col = new THREE.Color(PORTAL_COLORS[i % 3]), g = new THREE.Group();
        const ring = mesh(new THREE.TorusGeometry(21, 2.8, 10, 36), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.4) }), 0, 2.2, 0); ring.rotation.x = Math.PI / 2; ring.castShadow = false;
        const disc = flat(new THREE.CircleGeometry(20, 36), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, depthWrite: false }), 0, 1, 0);
        const beam = mesh(new THREE.CylinderGeometry(20, 20, 54, 28, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }), 0, 27, 0); beam.castShadow = false;
        g.add(disc, ring, beam); g.position.set(e.x - OX, 0, e.y - OZ); portalViews.push({ g, ring, beam, col: PORTAL_COLORS[i % 3] }); scene.add(g);
      }));
      for (const z of map.zones || []) {
        const t = tex(256, 128, (c, w, h) => {
          c.clearRect(0, 0, w, h); c.fillStyle = '#5c3a1e'; c.beginPath(); c.roundRect(3, 3, w - 6, h - 6, 26); c.fill(); c.save(); c.clip();
          for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(${90 + Math.random() * 70},${55 + Math.random() * 40},${25 + Math.random() * 25},.5)`; c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, 8 + Math.random() * 26, 5 + Math.random() * 12, Math.random() * 3, 0, 7); c.fill(); }
          c.restore(); c.strokeStyle = 'rgba(40,24,10,.8)'; c.lineWidth = 5; c.beginPath(); c.roundRect(3, 3, w - 6, h - 6, 26); c.stroke();
        });
        scene.add(flat(new THREE.PlaneGeometry(z.w, z.h), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.25, metalness: 0.15, depthWrite: false }), z.x + z.w / 2 - OX, 0.6, z.y + z.h / 2 - OZ));
      }
      for (const mv of map.movers || []) {
        const [a, b] = mv.path, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const groove = flat(new THREE.PlaneGeometry(len + mv.r * 2, mv.r * 1.5), new THREE.MeshBasicMaterial({ color: 0x2a1a0c, transparent: true, opacity: 0.28, depthWrite: false }), (a[0] + b[0]) / 2 - OX, 0.5, (a[1] + b[1]) / 2 - OZ);
        groove.rotation.z = -Math.atan2(b[1] - a[1], b[0] - a[0]); scene.add(groove);
        const drone = mv.kind === 'drone';
        const rock = drone ? new THREE.Group() : mesh(new THREE.IcosahedronGeometry(mv.r, 1), M3('#8a6a4d', { roughness: 1 }), a[0] - OX, mv.r, a[1] - OZ);
        if (drone) { /* neon patrol drone: a glowing core with a spinning spiked ring */
          const core = mesh(new THREE.IcosahedronGeometry(mv.r * 0.62, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff4dd8').multiplyScalar(2.2) })); core.castShadow = false;
          const halo = mesh(new THREE.TorusGeometry(mv.r, 2.4, 6, 20), M3('#1b2238', { metalness: 0.7, roughness: 0.3 })); halo.rotation.x = Math.PI / 2;
          rock.add(core, halo); for (let i = 0; i < 6; i++) { const a2 = (i / 6) * Math.PI * 2, sp = mesh(new THREE.ConeGeometry(2.6, 9, 5), M3('#68efff', { emissive: '#68efff', emissiveIntensity: 2 }), Math.cos(a2) * (mv.r + 3), 0, Math.sin(a2) * (mv.r + 3)); sp.rotation.z = -Math.PI / 2; sp.rotation.y = -a2; rock.add(sp); }
          rock.position.set(a[0] - OX, mv.r + 6, a[1] - OZ);
        }
        moverViews.push({ rock, x: a[0], y: a[1], r: mv.r, drone }); scene.add(rock);
      }
    }
    function updateMapFeatures(dt) {
      for (const p of padViews) p.m.material.opacity = 0.75 + Math.sin(time * (p.boostPad ? 7 : 4)) * 0.25;
      for (const p of portalViews) {
        p.ring.rotation.z += dt * 2.2; p.beam.material.opacity = 0.13 + Math.sin(time * 5) * 0.05;
        if (Math.random() < 0.35) { const a = Math.random() * Math.PI * 2; spark(p.g.position.x + Math.cos(a) * 19, 2, p.g.position.z + Math.sin(a) * 19, -Math.cos(a) * 14, 34, -Math.sin(a) * 14, p.col, 0.9, -8); }
      }
      moverViews.forEach((m, i) => {
        const t = s.haz && s.haz[i]; if (!t) return;
        const px = m.x, py = m.y, f = 1 - Math.exp(-20 * dt); m.x += (t[0] - m.x) * f; m.y += (t[1] - m.y) * f;
        if (m.drone) { m.rock.position.set(m.x - OX, m.r + 6 + Math.sin(time * 5) * 2, m.y - OZ); m.rock.rotation.y += dt * 5; if (Math.random() < 0.5) spark(m.x - OX, m.r + 4, m.y - OZ, (Math.random() - 0.5) * 20, -6, (Math.random() - 0.5) * 20, Math.random() < 0.5 ? '#ff4dd8' : '#68efff', 0.4, 0); return; }
        m.rock.position.set(m.x - OX, m.r, m.y - OZ); m.rock.rotation.z -= (m.x - px) / m.r; m.rock.rotation.x += (m.y - py) / m.r;
        if (Math.random() < 0.5) spark(m.x - OX + (Math.random() - 0.5) * m.r, 2, m.y - OZ + (Math.random() - 0.5) * m.r, (Math.random() - 0.5) * 30, 22, (Math.random() - 0.5) * 30, '#c9a37a', 0.5, 50);
      });
    }
    const clouds = [], balloons = [], boxViews = [];
    function itemBox(color, ch) {
      const t = tex(128, 128, (c, w, h) => { const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, color); g.addColorStop(1, '#fff'); c.fillStyle = g; c.fillRect(0, 0, w, h); c.strokeStyle = '#fff'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10); c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 8; c.font = '900 92px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.strokeText(ch, w / 2, h / 2 + 6); c.fillText(ch, w / 2, h / 2 + 6); });
      const g = new THREE.Group();
      const m = mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshStandardMaterial({ map: t, transparent: true, opacity: 0.9, emissive: color, emissiveIntensity: 0.35, roughness: 0.25, metalness: 0.2 }));
      g.add(m); return g;
    }

    // ---- particles ----
    const PN = 700, ppos = new Float32Array(PN * 3).fill(-9999), pcol = new Float32Array(PN * 3), pvel = new Float32Array(PN * 3), plife = new Float32Array(PN), pmax = new Float32Array(PN), pbase = new Float32Array(PN * 3), pgrav = new Float32Array(PN);
    const pgeo = new THREE.BufferGeometry(); pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3)); pgeo.setAttribute('color', new THREE.BufferAttribute(pcol, 3));
    const particleTexture=tex(32,32,(c,w,h)=>{const g=c.createRadialGradient(16,16,0,16,16,16);g.addColorStop(0,'#ffffffff');g.addColorStop(.3,'#ffffffdd');g.addColorStop(1,'#ffffff00');c.fillStyle=g;c.fillRect(0,0,w,h);});
    const points = new THREE.Points(pgeo, new THREE.PointsMaterial({ map:particleTexture,size: 9, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true })); points.frustumCulled = false;
    let pi = 0; const tmpC = new THREE.Color();
    const skidPose=new THREE.Object3D(), skidLife=new Float32Array(220);
    const skids=new THREE.InstancedMesh(new THREE.PlaneGeometry(3.4,8),new THREE.MeshBasicMaterial({color:'#172027',transparent:true,opacity:.24,depthWrite:false,side:THREE.DoubleSide}),220);skids.frustumCulled=false;
    skidPose.scale.setScalar(0);skidPose.updateMatrix();for(let i=0;i<220;i++)skids.setMatrixAt(i,skidPose.matrix);let skidIndex=0;
    function skid(x,z,a){skidPose.position.set(x,.16,z);skidPose.rotation.set(-Math.PI/2,0,Math.PI/2-a);skidPose.scale.setScalar(1);skidPose.updateMatrix();skids.setMatrixAt(skidIndex,skidPose.matrix);skidLife[skidIndex]=7;skidIndex=(skidIndex+1)%220;skids.instanceMatrix.needsUpdate=true;}
    function spark(x, y, z, vx, vy, vz, color, life = 0.6, grav = 120) { const i = pi; pi = (pi + 1) % PN; ppos[i * 3] = x; ppos[i * 3 + 1] = y; ppos[i * 3 + 2] = z; pvel[i * 3] = vx; pvel[i * 3 + 1] = vy; pvel[i * 3 + 2] = vz; tmpC.set(color); pbase[i * 3] = tmpC.r; pbase[i * 3 + 1] = tmpC.g; pbase[i * 3 + 2] = tmpC.b; plife[i] = pmax[i] = life; pgrav[i] = grav; }
    function burst(x, y, z, n, speed, colors, life = 0.7) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2, sp = speed * (0.3 + Math.random()); spark(x, y, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp, colors[i % colors.length], life * (0.5 + Math.random())); } }
    function stepParticles(dt) {
      for(let i=0;i<220;i++)if(skidLife[i]>0){skidLife[i]-=dt;if(skidLife[i]<=0){skidPose.scale.setScalar(0);skidPose.updateMatrix();skids.setMatrixAt(i,skidPose.matrix);skids.instanceMatrix.needsUpdate=true;}}
      for (let i = 0; i < PN; i++) { if (plife[i] <= 0) continue; plife[i] -= dt; const k = i * 3; if (plife[i] <= 0) { ppos[k + 1] = -9999; continue; } pvel[k + 1] -= pgrav[i] * dt; ppos[k] += pvel[k] * dt; ppos[k + 1] += pvel[k + 1] * dt; ppos[k + 2] += pvel[k + 2] * dt; if (ppos[k + 1] < 0.5) { ppos[k + 1] = 0.5; pvel[k + 1] *= -0.4; } const f = plife[i] / pmax[i]; pcol[k] = pbase[k] * f; pcol[k + 1] = pbase[k + 1] * f; pcol[k + 2] = pbase[k + 2] * f; }
      pgeo.attributes.position.needsUpdate = true; pgeo.attributes.color.needsUpdate = true;
    }
    // ---- explosions / rings ----
    const booms = [];
    function boom(gx, gy, r) {
      const x = gx - OX, z = gy - OZ;
      const ball = mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true })); ball.position.set(x, 8, z); ball.castShadow = false;
      const ring = mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide })); ring.position.set(x, 1, z); ring.rotation.x = -Math.PI / 2; ring.castShadow = false;
      scene.add(ball, ring); booms.push({ ball, ring, t: 0, dur: 0.7, r });
      burst(x, 10, z, 60, r * 2.2, ['#ffb030', '#ff5a1f', '#ffe27a', '#888'], 0.9);
      const me = views.get(G.me); if (me) { const d = Math.hypot(me.x - gx, me.y - gy); shake = Math.max(shake, 1 - d / 320); }
    }
    function ringFx(gx, gy, r, color = 0xffffff) { const ring = mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide })); ring.position.set(gx - OX, 1, gy - OZ); ring.rotation.x = -Math.PI / 2; ring.castShadow = false; scene.add(ring); booms.push({ ring, t: 0, dur: 0.5, r }); }

    // ---- karts ----
    function wheel(r, w, x, z, tireM, hubM) { const g = new THREE.Group(); const t = cyl(r, r, w, tireM, 0, 0, 0, 14); t.rotation.x = Math.PI / 2; const h = cyl(r * 0.55, r * 0.55, w + 0.8, hubM, 0, 0, 0, 8); h.rotation.x = Math.PI / 2; g.add(t, h, box(r * 1.5, 1.2, w + 1, hubM, 0, 0, 0)); g.position.set(x, r, z); return g; }
    function driver(color, x, y, z, hat) { const g = new THREE.Group(); g.add(box(6, 7, 8, M3(color), 0, 0, 0), sph(4.3, M3('#f2c79b'), 0, 7.5, 0, 10)); const helm = mesh(new THREE.SphereGeometry(4.8, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M3(hat || color), 0, 8, 0); g.add(helm, box(1, 1.6, 6, M3('#15171c'), 4, 8, 0)); g.position.set(x, y, z); return g; }
    function buildKart(v, color) {
      const custom = asset('kart_' + (v % 8), 36, color) || asset('kart', 36, color);
      const g = new THREE.Group(), body = new THREE.Group(), wheels = []; g.add(body);
      const P = M3(color), D = M3('#22252b'), Gls = M3('#9fd4ff', { roughness: 0.08, metalness: 0.7 }), Wt = M3('#f4f4f4'), Cr = M3('#c9ccd4', { metalness: 0.85, roughness: 0.25 }), tireM = M3('#17181c', { roughness: 0.95 }), hubM = M3('#d7dae2', { metalness: 0.7, roughness: 0.3 });
      const addW = (r, w, x, z) => { for (const zz of [z, -z]) { const wl = wheel(r, w, x, zz, tireM, hubM); wheels.push(wl); g.add(wl); } };
      const lamp = (x, y, z) => body.add(box(1, 2.4, 3.2, glow('#fff6c2', 1.6), x, y, z), box(1, 2.4, 3.2, glow('#fff6c2', 1.6), x, y, -z));
      if (custom) { body.add(custom); g.userData.glbWheels = custom.userData.wheels; }
      else switch (v % 8) {
        case 0: // Plumber go-kart
          body.add(box(30, 4, 16, P, 0, 6, 0), box(10, 5, 10, P, 14, 7, 0), box(4, 11, 11, D, -8, 12, 0), box(9, 6, 11, Cr, -14, 10, 0), box(3, 3, 19, Cr, 18.5, 5, 0), box(14, 4, 3, D, 0, 7, 9.5), box(14, 4, 3, D, 0, 7, -9.5));
          for (const z of [3, -3]) { const e = cyl(1.3, 1.3, 9, Cr, -19, 12, z, 8); e.rotation.z = Math.PI / 2; body.add(e); }
          { const sw = mesh(new THREE.TorusGeometry(2.6, 0.7, 6, 12), D, 6, 13, 0); sw.rotation.y = Math.PI / 2; body.add(sw); const d = driver('#3b6cff', -2, 11, 0, '#e02020'); d.add(box(1.2, 1.3, 5.5, M3('#15171c'), 4.2, 5.6, 0)); body.add(d); }
          addW(5, 5, 11, 11); addW(6.2, 6.5, -11, 12); break;
        case 1: // Pickup truck
          body.add(box(34, 8, 19, P, 0, 9, 0), box(13, 9, 17, P, 3, 17.5, 0), box(1, 6, 15, Gls, 9.7, 17.5, 0), box(9, 5, 17.6, Gls, 2.5, 18.2, 0), box(14, 1, 16, D, -9.5, 13.3, 0), box(2, 4, 20, Cr, 17.5, 7, 0), box(2, 4, 20, Cr, -17.5, 7, 0), box(14, 4, 1, P, -9.5, 15, 9), box(14, 4, 1, P, -9.5, 15, -9));
          lamp(17.2, 10.5, 6.5); addW(6, 5.5, 11, 10.5); addW(6, 5.5, -11, 10.5); break;
        case 2: { // Shopping cart
          const wire = M3('#dfe5f2', { transparent: true, opacity: 0.28, metalness: 0.7, roughness: 0.3 });
          body.add(box(26, 12, 17, wire, 2, 15, 0), box(24, 2, 15, Cr, 2, 7.5, 0), box(2, 2, 19, M3('#e02020'), -13, 24, 0), box(2, 12, 2, Cr, -12, 18, 8), box(2, 12, 2, Cr, -12, 18, -8));
          const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(26, 12, 17)), new THREE.LineBasicMaterial({ color: 0xffffff })); e.position.set(2, 15, 0); body.add(e);
          for (let i = -8; i <= 12; i += 5) body.add(box(0.7, 12, 17.2, Cr, i, 15, 0));
          body.add(driver(color, 3, 13, 0)); addW(3.5, 3, 11, 8); addW(3.5, 3, -8, 8); break; }
        case 3: { // Battle bus with a balloon
          body.add(box(38, 15, 18, P, 0, 14, 0), box(30, 5, 18.6, Gls, -1, 17.5, 0), box(1, 7, 15, Gls, 19.2, 16.5, 0), box(22, 1.5, 12, D, 0, 22.3, 0), box(2, 4, 19, Cr, 19.5, 8, 0));
          const bl = sph(9, M3(color, { emissive: color, emissiveIntensity: 0.15 }), 0, 44, 0, 12); bl.scale.y = 1.15; body.add(bl, cyl(0.4, 0.4, 16, D, 5, 30, 4, 4), cyl(0.4, 0.4, 16, D, -5, 30, -4, 4), cyl(0.4, 0.4, 16, D, 5, 30, -4, 4), cyl(0.4, 0.4, 16, D, -5, 30, 4, 4));
          lamp(19.3, 10, 6); addW(6, 5, 13, 10); addW(6, 5, -13, 10); break; }
        case 4: { // Octane-style wedge
          const sh = new THREE.Shape(); [[-18, 4], [18, 4], [19, 7], [9, 10], [3, 14.5], [-8, 14.5], [-18, 11]].forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y))); sh.closePath();
          const geo = new THREE.ExtrudeGeometry(sh, { depth: 18, bevelEnabled: true, bevelSize: 0.8, bevelThickness: 0.8, bevelSegments: 1 }); geo.translate(0, 0, -9);
          body.add(mesh(geo, P), box(10, 3.2, 14, Gls, -2, 14.4, 0), box(4, 1.5, 22, D, -17, 19, 0), box(1.5, 5, 1.5, D, -17, 16, 7), box(1.5, 5, 1.5, D, -17, 16, -7), box(6, 1.5, 20, D, 18, 4.5, 0));
          lamp(19.5, 7.5, 6.5); addW(6.5, 6.5, 12, 11); addW(7, 7, -12, 11.5); break; }
        case 5: // Tractor
          body.add(box(22, 9, 12, P, 4, 14, 0), box(9, 8, 10, P, 15.5, 13.5, 0), box(1, 6, 8, D, 20.2, 13.5, 0), box(14, 1.5, 15, D, -6, 31, 0), box(8, 4, 10, D, -7, 15, 0));
          for (const [x, z] of [[0, 7], [0, -7], [-12, 7], [-12, -7]]) body.add(box(1.2, 14, 1.2, D, x, 24, z));
          body.add(cyl(1.3, 1.3, 13, D, 13, 24, 4, 8), driver(color, -6, 20, 0, '#d9a441')); addW(5.5, 4, 15, 10); addW(10, 7, -8, 12.5); break;
        case 6: { // Ice cream van
          body.add(box(34, 18, 19, Wt, 0, 15, 0), box(34.5, 4, 19.5, P, 0, 11, 0), box(1, 8, 16, Gls, 17.2, 18.5, 0), box(12, 7, 0.8, Gls, -4, 18.5, 9.8), box(14, 1, 6, P, -4, 23, 12), box(2, 3, 20, Cr, 17.6, 7, 0));
          const cone = mesh(new THREE.ConeGeometry(5, 11, 10), M3('#e2b06e'), 0, 29.5, 0); cone.rotation.x = Math.PI; body.add(cone, sph(5.6, M3('#ff9ad5'), 0, 37, 0, 10), sph(1.6, M3('#e02020'), 0, 43, 0, 8));
          lamp(17.3, 9, 6.5); addW(5.5, 5, 11, 10); addW(5.5, 5, -11, 10); break; }
        default: { // Rocket sled
          const cap = mesh(new THREE.CapsuleGeometry(7, 20, 6, 12), P, 0, 11, 0); cap.rotation.z = Math.PI / 2;
          const noz = cyl(4, 6, 7, Cr, -17, 11, 0, 10); noz.rotation.z = Math.PI / 2;
          body.add(cap, noz, sph(5.2, Gls, 5, 16, 0, 10), box(9, 9, 1.2, D, -12, 19, 0), box(34, 1.5, 3.5, Cr, 0, 1.5, 9), box(34, 1.5, 3.5, Cr, 0, 1.5, -9));
          for (const [x, z] of [[9, 9], [-9, 9], [9, -9], [-9, -9]]) body.add(box(1.5, 6, 1.5, Cr, x, 5, z));
          break; }
      }
      // boost flame (also the rocket sled's permanent exhaust)
      const flame = mesh(new THREE.ConeGeometry(4.5, 18, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a1f).multiplyScalar(2.4), transparent: true, opacity: 0.9 }), -26, 10, 0); flame.rotation.z = Math.PI / 2; flame.castShadow = false; flame.userData.noFx = true; flame.visible = false; g.add(flame);
      // egg form
      const eggG = asset('kart_egg', 28) || (() => { const e = new THREE.Group(); const sh = sph(13, M3('#fff6d6', { roughness: 0.35 }), 0, 16, 0, 16); sh.scale.y = 1.25; const band = mesh(new THREE.TorusGeometry(11, 1.6, 6, 18), M3(color), 0, 6, 0); band.rotation.x = Math.PI / 2; e.add(sh, band, sph(1.8, M3('#111'), 11.5, 19, 4, 8), sph(1.8, M3('#111'), 11.5, 19, -4, 8)); return e; })();
      eggG.visible = false; g.add(eggG);
      // bullet form
      const billG = asset('bullet_bill', 38) || (() => { const b = new THREE.Group(); const c = mesh(new THREE.CapsuleGeometry(11, 16, 6, 14), M3('#16181d', { roughness: 0.3, metalness: 0.5 }), 0, 14, 0); c.rotation.z = Math.PI / 2; b.add(c, cyl(11.5, 11.5, 4, M3('#c9ccd4', { metalness: 0.8, roughness: 0.3 }), -13, 14, 0, 14)); b.children[1].rotation.z = Math.PI / 2; for (const z of [5, -5]) b.add(sph(3.2, M3('#fff'), 13, 17, z, 8), sph(1.5, M3('#111'), 15.6, 17, z, 6)); b.add(sph(3.5, M3('#fff'), 2, 8, 12, 8), sph(3.5, M3('#fff'), 2, 8, -12, 8)); return b; })();
      billG.visible = false; g.add(billG);
      // name label
      const lc = document.createElement('canvas'); lc.width = 256; lc.height = 80; const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt, depthTest: false, transparent: true })); label.scale.set(34, 10.6, 1); label.position.y = 40; label.renderOrder = 10; g.add(label);
      const contact=new THREE.Mesh(new THREE.PlaneGeometry(40,30),new THREE.MeshBasicMaterial({map:particleTexture,color:0x111e2b,transparent:true,opacity:.28,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
      contact.rotation.x=-Math.PI/2;contact.position.y=.14;contact.userData.noFx=true;g.add(contact);
      g.userData = Object.assign(g.userData, { body, wheels, eggG, billG, flame, label, contact, lc, lt, labelKey: '', sled: v % 8 === 7 });
      return g;
    }
    function drawLabel(u, name, color, hp, me) {
      const key = name + color + hp + me; if (u.labelKey === key) return; u.labelKey = key;
      const c = u.lc.getContext('2d'); c.clearRect(0, 0, 256, 80);
      c.font = '800 30px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = 7; c.strokeStyle = 'rgba(0,0,0,.8)'; c.strokeText(name, 128, 26); c.fillStyle = color; c.fillText(name, 128, 26);
      const f = Math.max(0, Math.min(1, hp / 3));
      c.fillStyle = 'rgba(0,0,0,.65)'; c.beginPath(); c.roundRect(72, 50, 112, 18, 9); c.fill();
      c.fillStyle = f > 0.6 ? '#5ee07a' : f > 0.3 ? '#ffd84d' : '#ff4d4d'; if (f > 0) { c.beginPath(); c.roundRect(75, 53, Math.max(8, 106 * f), 12, 6); c.fill(); }
      c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.roundRect(72, 50, 112, 18, 9); c.stroke();
      u.lt.needsUpdate = true;
    }
    function setLook(v, opacity, hue) {
      const key = opacity + '|' + (hue == null ? '' : Math.round(hue * 24)); if (v.lookKey === key) return; v.lookKey = key;
      v.g.traverse((o) => {
        if (!o.isMesh || o.userData.noFx) return; const m = o.material; if (!m || !m.color) return;
        if (!m.userData.base) m.userData.base = { e: m.emissive ? m.emissive.getHex() : 0, ei: m.emissiveIntensity || 0, o: m.opacity, t: m.transparent };
        const b = m.userData.base; m.transparent = opacity < 1 || b.t; m.opacity = b.o * opacity; m.depthWrite = opacity >= 1 || !b.t ? opacity >= 1 : false;
        if (m.emissive) { if (hue != null) { m.emissive.setHSL(hue, 1, 0.5); m.emissiveIntensity = 0.85; } else { m.emissive.setHex(b.e); m.emissiveIntensity = b.ei; } }
      });
    }
    const views = new Map();
    function updateKarts(dt) {
      const seen = new Set();
      for (const k of s.karts) {
        seen.add(k.id); const p = G.player(k.id);
        let v = views.get(k.id);
        if (!v) { v = { g: buildKart(k.v, p.color), x: k.x, y: k.y, a: k.a, sc: 1, lookKey: '', spd: 0, roll: 0, pitch:0, steer:0, airTime:0, landingAge:2 }; views.set(k.id, v); scene.add(v.g); }
        if (Math.hypot(k.x - v.x, k.y - v.y) > 130) { v.x = k.x; v.y = k.y; v.a = k.a; }
        const px = v.x, py = v.y, pa = v.a, f = 1 - Math.exp(-16 * dt);
        v.x += (k.x - v.x) * f; v.y += (k.y - v.y) * f; v.a = lerpAngle(v.a, k.a, 1 - Math.exp(-14 * dt));
        const spd = Math.hypot(v.x - px, v.y - py) / Math.max(dt, 0.001), oldSpeed=v.spd;v.spd=damp(v.spd,spd,13,dt);
        const fwd = Math.sign((v.x - px) * Math.cos(v.a) + (v.y - py) * Math.sin(v.a)) || 1;
        const av = (((v.a - pa) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        v.roll=damp(v.roll,Math.max(-.18,Math.min(.18,(av/Math.max(dt,.001))*.055)),10,dt);
        const u = v.g.userData, me = k.id === G.me;
        // Reconstruct the jump clock between 30 Hz snapshots, avoiding 0.1 s height steps.
        const previousAir=v.airTime;
        if(k.air>0&&(!v.wasAir||Math.abs(v.airTime-k.air)>.16))v.airTime=k.air;
        else v.airTime=Math.max(0,v.airTime-dt);
        if(previousAir>0&&v.airTime===0)v.landingAge=0;
        v.wasAir=k.air>0;v.landingAge+=dt;
        const air = v.airTime > 0 ? Math.sin((1 - v.airTime / 1.2) * Math.PI) * 75 : 0;
        v.el = (v.el ?? (k.el || 0)) + ((k.el || 0) - (v.el ?? 0)) * Math.min(1, dt * 16); /* height from the server, smoothed */
        v.h = air + v.el;
        const fx = Math.cos(v.a) * 18, fy = Math.sin(v.a) * 18, slope = air > 0 ? 0 : Math.atan2(surfaceAt(v.x + fx, v.y + fy) - surfaceAt(v.x - fx, v.y - fy), 36);
        v.tilt = (v.tilt || 0) + ((Math.abs(slope) < 0.6 ? slope : 0) - (v.tilt || 0)) * Math.min(1, dt * 12); /* nose up going up a ramp, down coming off it */
        v.g.position.set(v.x - OX, v.h + (k.ghost ? 6 + Math.sin(time * 4) * 2 : 0), v.y - OZ);
        v.g.rotation.z = reducedMotion ? 0 : v.tilt;
        v.g.rotation.y = -v.a;
        v.sc=damp(v.sc,k.small?.55:1,13,dt);v.g.scale.setScalar(v.sc);
        u.contact.visible=!k.ghost&&Math.abs(v.tilt)<.05;u.contact.position.y=(.14-air-Math.max(0,v.el-surfaceAt(v.x,v.y)))/v.sc;u.contact.material.opacity=.3/(1+air/28);u.contact.scale.setScalar(1+air/150);
        const pitchTarget=v.airTime>0?Math.cos((1-v.airTime/1.2)*Math.PI)*.28:Math.max(-.09,Math.min(.09,(v.spd-oldSpeed)/Math.max(.001,dt)*.00015));
        v.pitch=damp(v.pitch,pitchTarget,9,dt);
        const landing=reducedMotion?0:Math.sin(v.landingAge*21)*Math.exp(-v.landingAge*8)*1.2;
        u.body.rotation.x = k.spin || reducedMotion ? 0 : v.roll; u.body.rotation.z = reducedMotion?0:v.pitch;
        u.body.position.y = reducedMotion?0:Math.sin(time*18+v.x*.035)*Math.min(.23,v.spd/900)+landing;
        const steeringInput=me?((G.keys.has('d')||G.keys.has('ArrowRight')||touchKeys.has('d')?1:0)-(G.keys.has('a')||G.keys.has('ArrowLeft')||touchKeys.has('a')?1:0)):Math.max(-1,Math.min(1,av/Math.max(.001,dt)/2));
        v.steer=damp(v.steer,-steeringInput*.38,14,dt);
        for(const w of [...u.wheels,...(u.glbWheels||[])]){w.rotation.z-=fwd*v.spd*dt/6;if(/^wheel_f/.test(w.name)||(!w.name&&w.position.x>0))w.rotation.y=v.steer;}
        const form = k.bill ? 'bill' : k.egg > 0 ? 'egg' : 'kart';
        u.body.visible = form === 'kart'; for (const w of u.wheels) w.visible = form === 'kart'; u.eggG.visible = form === 'egg'; u.billG.visible = form === 'bill';
        if (form === 'egg') u.eggG.rotation.z = Math.sin(time * 9) * 0.12;
        u.flame.visible = !!(k.mush || k.star || k.bill || k.bst || (u.sled && form === 'kart' && v.spd > 40)); if (u.flame.visible) {const pulse=1+Math.sin(time*32+k.v)*.16;u.flame.scale.set(pulse,(k.mush||k.bill?1.6:1)*pulse,pulse);}
        v.g.visible = !k.dead && !(k.inv && !k.star && !k.bill && Math.sin(time * 26) > 0.2);
        setLook(v, k.ghost ? (me ? 0.4 : 0.1) : 1, k.star ? (time * 1.6) % 1 : null);
        u.label.visible = !me && !k.ghost; drawLabel(u, p.name, p.color, k.hp, me);
        // trails
        if (!k.dead && v.g.visible) {
          const bx = v.x - OX - Math.cos(v.a) * 18, bz = v.y - OZ - Math.sin(v.a) * 18;
          if (k.mush || k.bill) for (let i = 0; i < 2; i++) spark(bx, 9 + air, bz, -Math.cos(v.a) * 60 + (Math.random() - 0.5) * 40, 20 + Math.random() * 30, -Math.sin(v.a) * 60 + (Math.random() - 0.5) * 40, i ? '#ff7a1f' : '#ffd84d', 0.35, 0);
          if (k.star) spark(v.x - OX + (Math.random() - 0.5) * 30, 10 + Math.random() * 25, v.y - OZ + (Math.random() - 0.5) * 30, 0, 40, 0, `hsl(${Math.random() * 360},100%,65%)`, 0.5, -30);
          if (k.spin && Math.random() < 0.6) spark(bx, 3, bz, (Math.random() - 0.5) * 80, 30, (Math.random() - 0.5) * 80, '#bbbbbb', 0.4, 60);
          if (k.mud && v.spd > 25) spark(bx, 2, bz, (Math.random() - 0.5) * 50, 30 + Math.random() * 30, (Math.random() - 0.5) * 50, '#7a4e2a', 0.5, 140);
          if (!k.spin && Math.abs(v.roll) > 0.15 && v.spd > 180 && Math.random() < 0.5) spark(bx, 2, bz, (Math.random() - 0.5) * 30, 15, (Math.random() - 0.5) * 30, '#9a9a9a', 0.35, 20);
          v.trailTime=(v.trailTime||0)+dt;
          if(!air && !u.sled && v.spd>100 && v.trailTime>.08 && (k.spin || Math.abs(v.roll)>.075)){
            v.trailTime=0;for(const side of [-1,1])skid(bx+Math.sin(v.a)*side*10,bz-Math.cos(v.a)*side*10,v.a);
            if(map.theme==='canyon')spark(bx,2,bz,(Math.random()-.5)*30,12,(Math.random()-.5)*30,'#d9b38a',.45,8);
          }
        }
      }
      for (const [id, v] of views) if (!seen.has(id)) { scene.remove(v.g); views.delete(id); }
    }

    // ---- entities ----
    function shellMesh(color, blue) {
      const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin); g.userData.spin = spin;
      spin.add(mesh(new THREE.SphereGeometry(8, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M3(color, { roughness: 0.3 }), 0, 4, 0), cyl(9.2, 9.2, 2.6, M3('#fff'), 0, 3.4, 0), cyl(7.5, 6, 2.6, M3('#f3e7b5'), 0, 1.3, 0));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; spin.add(box(0.6, 0.6, 5, M3('#fff'), Math.cos(a) * 5, 8.2, Math.sin(a) * 5)); }
      if (blue) { for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const sp = mesh(new THREE.ConeGeometry(1.6, 5, 6), M3('#fff'), Math.cos(a) * 4.5, 10, Math.sin(a) * 4.5); spin.add(sp); } spin.add(mesh(new THREE.ConeGeometry(1.8, 6, 6), M3('#fff'), 0, 13, 0)); for (const z of [1, -1]) { const w = box(9, 1, 7, M3('#fff'), -2, 8, z * 11); w.rotation.x = z * 0.5; g.add(w); } g.scale.setScalar(1.25); }
      return g;
    }
    const ENT = {
      shell: () => asset('shell_green', 18) || shellMesh('#2fcf4f'),
      red: () => asset('shell_red', 18) || shellMesh('#ff3030'),
      blue: () => asset('shell_blue', 24) || shellMesh('#2f6bff', true),
      egg: () => asset('egg', 12) || (() => { const g = new THREE.Group(); const e = sph(5.5, M3('#fff3c4', { roughness: 0.3 }), 0, 9, 0, 10); e.scale.y = 1.3; g.add(e); return g; })(),
      bullet: () => { const g = new THREE.Group(); const b = mesh(new THREE.CapsuleGeometry(1.6, 7, 3, 6), new THREE.MeshBasicMaterial({ color: 0xfff2a8 }), 0, 9, 0); b.rotation.z = Math.PI / 2; b.castShadow = false; g.add(b); return g; },
      fireball: () => asset('fireball', 12) || (() => { const g = new THREE.Group(); g.add(mesh(new THREE.IcosahedronGeometry(5.5, 1), new THREE.MeshBasicMaterial({ color: 0xff7b1a }), 0, 8, 0), mesh(new THREE.IcosahedronGeometry(3.2, 0), new THREE.MeshBasicMaterial({ color: 0xffe27a }), 0, 8, 0)); return g; })(),
      tnt: () => asset('tnt', 20) || (() => { const g = new THREE.Group(); const t = tex(128, 128, (c, w, h) => { c.fillStyle = '#d9361e'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.fillRect(0, 40, w, 48); c.fillStyle = '#111'; c.font = '900 44px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('TNT', w / 2, 66); }); g.add(mesh(new THREE.BoxGeometry(18, 18, 18), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }), 0, 9, 0)); const l = sph(2.4, glow('#ffe34d', 3), 0, 20, 0, 8); g.add(cyl(0.6, 0.6, 4, M3('#333'), 0, 19, 0, 6), l); g.userData.blink = l; return g; })(),
      pad: () => asset('launch_pad', 46) || (() => { const g = new THREE.Group(); g.add(cyl(22, 24, 3, M3('#2f7bff', { emissive: '#2f7bff', emissiveIntensity: 0.7 }), 0, 1.5, 0, 24)); for (const x of [-5, 5]) { for (const z of [1, -1]) { const b = box(3, 0.6, 13, glow('#ffffff', 1.5), x, 3.3, z * 4.5); b.rotation.y = z * 0.7; g.add(b); } } return g; })(),
      banana: () => asset('banana', 16) || (() => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const p = new THREE.Group(); const t = mesh(new THREE.TorusGeometry(6, 2.2, 6, 10, Math.PI * 0.8), M3('#ffe135', { roughness: 0.4 }), 0, 0, 0); t.rotation.z = Math.PI * 0.1; p.add(t); p.rotation.y = (i / 3) * Math.PI * 2; p.position.y = 2.5; g.add(p); } g.add(cyl(1.4, 1.8, 3, M3('#7a5230'), 0, 9.5, 0, 6)); return g; })(),
      bomb: () => asset('bobomb', 20) || (() => { const g = new THREE.Group(); g.add(sph(9, M3('#16181d', { roughness: 0.25, metalness: 0.5 }), 0, 10, 0, 14), box(5, 2.5, 4, M3('#ffb300'), 2, 1.2, 4), box(5, 2.5, 4, M3('#ffb300'), 2, 1.2, -4), sph(2, M3('#fff'), 7.5, 12, 3, 8), sph(2, M3('#fff'), 7.5, 12, -3, 8), cyl(0.8, 0.8, 5, M3('#c9ccd4'), 0, 20.5, 0, 6)); const sp = sph(2, glow('#ffd84d', 3), 0, 24, 0, 6); g.add(sp); g.userData.blink = sp; return g; })(),
      pie: () => asset('pie', 18) || (() => { const g = new THREE.Group(); g.add(cyl(8, 6.5, 3.5, M3('#d8a861', { roughness: 0.6 }), 0, 1.75, 0, 16)); const cream = sph(7.5, M3('#fff6e6', { roughness: 0.35 }), 0, 4, 0, 14); cream.scale.y = 0.55; g.add(cream, sph(1.6, M3('#e0312f', { roughness: 0.3 }), 1.5, 8.2, -1, 8)); return g; })(),
      fake: () => asset('fake_box', 24) || (() => { const g = itemBox('#ffb833', '¿'); g.userData.box = true; return g; })(),
    };
    const ents = new Map(), entPool = {}; let aimLine = null, aimRing = null; /* entity models are pooled: a shell that is gone is hidden and reused for the next one, so nothing is rebuilt or leaked mid-match */
    function updateEnts(dt) {
      const seen = new Set();
      for (const e of s.ents) {
        seen.add(e.id); let v = ents.get(e.id);
        if (!v) { const k = ENT[e.k] ? e.k : 'egg', g = (entPool[k] || []).pop() || ENT[k](); g.visible = true; if (!g.parent) scene.add(g); v = { g, x: e.x, y: e.y, k }; ents.set(e.id, v); }
        const f = 1 - Math.exp(-28 * dt); v.x += (e.x - v.x) * f; v.y += (e.y - v.y) * f;
        const g = v.g, X = v.x - OX, Z = v.y - OZ;
        v.el = (v.el ?? (e.el || 0)) + ((e.el || 0) - (v.el ?? 0)) * Math.min(1, dt * 18);
        g.position.set(X, v.el + (e.z || 0) + (e.k === 'blue' ? 22 + Math.sin(time * 6) * 3 : 0) + (e.k === 'fake' ? 16 + Math.sin(time * 2 + e.id) * 3 : 0), Z);
        if (e.k === 'red' || e.k === 'blue' || e.k === 'pad' || e.k === 'bullet') g.rotation.y = -e.a;
        if (g.userData.spin) g.userData.spin.rotation.y += dt * 14; else if (e.k === 'shell' || e.k === 'egg' || e.k === 'fireball') g.rotation.y += dt * 10;
        if (e.k === 'fake') g.rotation.y += dt * 1.5;
        if (e.k === 'pad') g.scale.setScalar(1 + Math.sin(time * 6) * 0.04);
        if (g.userData.blink) g.userData.blink.visible = Math.sin(time * (26 - Math.min(2, e.f) * 9)) > 0;
        if (e.k === 'fireball') spark(X, 8, Z, (Math.random() - 0.5) * 30, 10, (Math.random() - 0.5) * 30, Math.random() < 0.5 ? '#ff7b1a' : '#ffd84d', 0.3, 0);
        if (e.k === 'blue' && Math.random() < 0.7) spark(X, 22, Z, (Math.random() - 0.5) * 20, -10, (Math.random() - 0.5) * 20, '#6ea0ff', 0.4, 0);
        if (e.k === 'red' && Math.random() < 0.4) spark(X, 5, Z, 0, 12, 0, '#ff6a6a', 0.3, 0);
      }
      for (const [id, v] of ents) if (!seen.has(id)) { v.g.visible = false; (entPool[v.k] = entPool[v.k] || []).push(v.g); ents.delete(id); }
    }

    function fit() {
      const w = canvas.offsetWidth, h = canvas.offsetHeight, l = canvas.offsetLeft, t = canvas.offsetTop;
      if (w === fw && h === fh && l === fl && t === ft) return; fw = w; fh = h; fl = l; ft = t;
      gl.style.left = l + 'px'; gl.style.top = t + 'px'; gl.style.width = w + 'px'; gl.style.height = h + 'px';
      renderer.setSize(Math.max(1, w), Math.max(1, h), false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
      if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(Math.max(1, w), Math.max(1, h)); }
      const uiScale=Math.max(.75,Math.min(1.7,Math.min(w/1280,h/800)*1.15)), dpr=Math.min(devicePixelRatio||1,2); /* the HUD grows with the screen: readable on a monitor */
      W=w/uiScale;H=h/uiScale;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr*uiScale,0,0,dpr*uiScale,0,0);
    }
    const camTarget = new THREE.Vector3(), lookTarget = new THREE.Vector3(); let wasBack = false;
    function updateCamera(dt) {
      const v = views.get(G.me), k = s && s.karts.find((q) => q.id === G.me);
      const portrait=camera.aspect<1;
      let fov = portrait?82:62;
      if (v && k && !k.dead) {
        const lookBack = G.keys.has('c'); /* hold C to look behind you */
        camA = lerpAngle(camA, v.a + (lookBack ? Math.PI : 0), 1 - Math.exp(-(lookBack || wasBack ? 18 : k.spin ? 1.2 : 6.5) * dt)); wasBack = lookBack;
        const dx = Math.cos(camA), dz = Math.sin(camA), X = v.x - OX, Z = v.y - OZ, h = v.h || 0;
        // keep the camera inside the arena walls; when it gets squeezed against one, rise up and look down instead
        const distance=portrait?110:84;
        const cx = Math.max(-(OX - 30), Math.min(OX - 30, X - dx * distance)), cz = Math.max(-(OZ - 30), Math.min(OZ - 30, Z - dz * distance));
        const squeeze = 1 - Math.min(1, Math.hypot(cx - X, cz - Z) / 84);
        camTarget.set(cx, 44 + squeeze * 70 + h * 0.7, cz); lookTarget.set(X + dx * 50 * (1 - squeeze * 0.6), 10 + h * 0.6, Z + dz * 50 * (1 - squeeze * 0.6));
        camera.position.lerp(camTarget, 1 - Math.exp(-9 * dt)); look.lerp(lookTarget, 1 - Math.exp(-12 * dt));
        { const under = surfaceAt(camera.position.x + OX, camera.position.z + OZ) + 30; if (camera.position.y < under) camera.position.y = under; } /* never below the ramp or deck beneath the camera: otherwise you look through it */
        fov = (portrait?82:62) + Math.min(10, v.spd / 40) + (k.mush || k.star || k.bill || k.bst ? 12 : 0);
      } else {
        const big = Math.max(MW / 900, MH / 600); camTarget.set(Math.sin(time * 0.25) * 520 * big, 430 * big, Math.cos(time * 0.25) * 520 * big); lookTarget.set(0, 0, 0);
        camera.position.lerp(camTarget, 1 - Math.exp(-2 * dt)); look.lerp(lookTarget, 1 - Math.exp(-3 * dt));
      }
      camera.fov=damp(camera.fov,reducedMotion?(portrait?82:62):fov,5,dt);camera.updateProjectionMatrix();
      if (shake > 0.01) { if(!reducedMotion){camera.position.x += Math.sin(time*61) * shake * 3; camera.position.y += Math.sin(time*47) * shake * 2;}shake *= Math.pow(0.02, dt); }
      camera.lookAt(look);
      /* keep the shadow box centred on what the camera is looking at (snapped so shadows do not shimmer) */
      if (sunLight) { const fx = Math.round(look.x / 16) * 16, fz = Math.round(look.z / 16) * 16; sunLight.target.position.set(fx, 0, fz); sunLight.position.set(fx - 320, 430, fz + 240); }
    }

    return {
      get ready() { return worldBuilt; },
      boom, ringFx, burst,
      // the aim arc while charging a throw: dots along the flight path and a ring where it lands
      aim(k, charge) {
        if (!aimLine) { aimLine = new THREE.InstancedMesh(new THREE.SphereGeometry(3.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.95 }), 13); aimLine.frustumCulled = false; aimLine.castShadow = false; aimRing = mesh(new THREE.RingGeometry(40, 55, 32), new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.55, side: THREE.DoubleSide })); aimRing.rotation.x = -Math.PI / 2; aimRing.castShadow = false; scene.add(aimLine, aimRing); }
        if (!k) { aimLine.visible = aimRing.visible = false; return; }
        const v = views.get(k.id) || { x: k.x, y: k.y, el: k.el || 0 }, a = v.a != null ? v.a : k.a, el = v.el != null ? v.el : (k.el || 0), dist = 140 + 460 * charge, peak = 40 + 45 * charge, pts = [];
        for (let i = 0; i <= 24; i++) { const u = i / 24; pts.push(new THREE.Vector3(v.x - OX + Math.cos(a) * (26 + dist * u), el + 10 + Math.sin(u * Math.PI) * peak, v.y - OZ + Math.sin(a) * (26 + dist * u))); }
        { const o = new THREE.Object3D(); for (let i = 0; i < 13; i++) { o.position.copy(pts[i * 2]); o.scale.setScalar(0.7 + i * 0.05); o.updateMatrix(); aimLine.setMatrixAt(i, o.matrix); } aimLine.instanceMatrix.needsUpdate = true; aimLine.visible = true; }
        aimRing.position.set(pts[24].x, el + 1.5, pts[24].z); aimRing.visible = true; aimRing.scale.setScalar(1 + Math.sin(time * 8) * 0.05);
      },
      splat(gx, gy) { burst(gx - OX, 10, gy - OZ, 26, 90, ['#fff6e6', '#ffffff', '#e0312f'], 0.8); ringFx(gx, gy, 60); },
      kartPos(id) { const v = views.get(id); return v ? { x: v.x - OX, z: v.y - OZ } : null; },
      update(dt) {
        fit();
        if (!assetsReady || !s) return;
        if (!worldBuilt) buildWorld();
        if (s) {
          updateKarts(dt); updateEnts(dt);
          updateMapFeatures(dt); updateEnvironment(dt);
          boxViews.forEach((g, i) => {
            const available=!!s.boxes[i];
            if(g.userData.available!==available){if(g.userData.available===true&&!available){burst(g.position.x,26,g.position.z,18,48,['#aaf5ff','#ffeaa1'],.45);ringFx(g.position.x+OX,g.position.z+OZ,28,map.accent);}g.userData.available=available;g.userData.appear=0;}
            g.userData.appear=Math.min(1,(g.userData.appear||0)+dt*3.5);const p=g.userData.appear,scale=reducedMotion?1:1+2.3*Math.pow(p-1,3)+1.3*Math.pow(p-1,2);
            g.visible=available;g.scale.setScalar(Math.max(.01,scale));g.rotation.y+=dt*(reducedMotion?.3:1.1);g.rotation.x=reducedMotion?0:Math.sin(time*1.3+i)*.12;g.position.y=(g.userData.base||0)+17+(reducedMotion?0:Math.sin(time*2.2+i)*2.5);
          });
        }
        for (const c of clouds) { c.position.x += c.userData.drift * dt; if (c.position.x > 2400) c.position.x = -2400; }
        for (const b of balloons) {b.userData.baseY??=b.position.y;b.position.y=b.userData.baseY+Math.sin(time*.6+b.userData.phase)*7;}
        for (let i = booms.length - 1; i >= 0; i--) {
          const b = booms[i]; b.t += dt; const p = Math.min(1, b.t / b.dur);
          if (b.ball) { b.ball.scale.setScalar(b.r * (0.25 + 0.6 * p)); b.ball.material.opacity = 0.85 * (1 - p); b.ball.material.color.setHSL(0.09 - 0.06 * p, 1, 0.6 - 0.25 * p); }
          b.ring.scale.setScalar(b.r * (0.2 + 1.1 * p)); b.ring.material.opacity = 1 - p;
          if (p >= 1) { if (b.ball) { scene.remove(b.ball); b.ball.geometry.dispose(); b.ball.material.dispose(); } scene.remove(b.ring); b.ring.geometry.dispose(); b.ring.material.dispose(); booms.splice(i, 1); }
        }
        stepParticles(dt); updateCamera(dt);
        if (composer) {
          composer.render(dt);
          /* drop bloom on machines that cannot keep up (under ~25 fps for most of the first few seconds) */
          if (bloomPref !== '1' && frameCount < 240) { frameCount++; if (dt > 0.04) slowFrames++; if (frameCount === 240 && slowFrames > 150) disposeComposer(); }
        } else renderer.render(scene, camera);
      },
      dispose() {
        scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) for (const mm of Array.isArray(m) ? m : [m]) { if (mm.map) mm.map.dispose(); if(mm.bumpMap)mm.bumpMap.dispose(); mm.dispose(); } });
        if(environment)environment.dispose();if(scene.background?.isTexture)scene.background.dispose();
        disposeComposer();
        renderer.dispose(); gl.remove(); canvas.style.background = prev.bg; canvas.style.position = prev.pos;
      },
    };
  }

  // ============================ input ============================
  function sendCtl() {
    const k = new Set([...G.keys,...touchKeys]);
    const c = { up: k.has('w') || k.has('ArrowUp'), down: k.has('s') || k.has('ArrowDown'), left: k.has('a') || k.has('ArrowLeft'), right: k.has('d') || k.has('ArrowRight') };
    const key = `${+c.up}${+c.down}${+c.left}${+c.right}`;
    if (key !== lastCtl) { lastCtl = key; G.send(Object.assign({ type: 'ctl' }, c)); }
  }

  // ============================ HUD ============================
  function hud(dt) {
    ctx.clearRect(0, 0, W, H);
    if (failed) { ctx.fillStyle = '#0b0d13'; ctx.fillRect(0, 0, W, H); G.text('3D could not start: ' + failed, W / 2, H / 2, { size: 16, color: '#ff8a7a' }); return; }
    if (!T || !T.ready || !s) { ctx.fillStyle = '#0b0d13'; ctx.fillRect(0, 0, W, H); G.text('Loading 3D arena…', W / 2, H / 2, { size: 22 }); return; }
    const me = s.karts.find((k) => k.id === G.me);
    // screen effects
    if (me && (me.mush || me.star || me.bill || me.bst)) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, r1 = 300 + Math.random() * 120, r2 = r1 + 60 + Math.random() * 120; ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(a) * r1 * 1.4, H / 2 + Math.sin(a) * r1); ctx.lineTo(W / 2 + Math.cos(a) * r2 * 1.4, H / 2 + Math.sin(a) * r2); ctx.stroke(); } }
    if (me && me.ink > 0) { const al = Math.min(1, me.ink / 1.2) * 0.93; ctx.fillStyle = `rgba(8,8,20,${al})`; const blobs = [[300, 220, 120], [520, 260, 150], [640, 180, 90], [400, 360, 110], [200, 330, 80], [700, 380, 100], [460, 130, 80]]; for (const [x, y, r] of blobs) { ctx.beginPath(); ctx.arc(x, y + (5 - me.ink) * 6, r, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(x + r * 0.3, y + r + (5 - me.ink) * 14, r * 0.18, r * 0.6, 0, 0, 7); ctx.fill(); } }
    if (me && me.pie > 0) { const al = Math.min(1, me.pie / 1.0) * 0.9, drip = (4 - me.pie) * 8; ctx.fillStyle = `rgba(255,246,230,${al})`; for (const [x, y, r] of [[250, 200, 130], [560, 240, 160], [720, 160, 95], [420, 380, 120], [160, 360, 90], [760, 400, 105], [470, 110, 85]]) { ctx.beginPath(); ctx.arc(x, y + drip * 0.6, r, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(x - r * 0.25, y + r + drip * 1.6, r * 0.16, r * 0.5, 0, 0, 7); ctx.fill(); } ctx.fillStyle = `rgba(224,49,47,${al})`; ctx.beginPath(); ctx.arc(590, 215, 14, 0, 7); ctx.fill(); }
    if (me && me.weapon === 'pie' && !me.dead) { const c = chargeNow(); if (chargeAt != null) { const bw = 220; rr(W / 2 - bw / 2, H - 196, bw, 14, 7, 'rgba(8,12,20,.7)', '#fff1d6'); rr(W / 2 - bw / 2 + 2, H - 194, (bw - 4) * c, 10, 5, '#fff1d6'); G.text(c >= 1 ? 'Full power. Let go to throw!' : 'Aiming... let go to throw', W / 2, H - 210, { size: 13, color: '#fff1d6', weight: 700 }); } else G.text(`Hold ${window.matchMedia('(pointer:coarse)').matches ? 'FIRE' : 'SPACE'} to aim the pie`, W / 2, H - 210, { size: 13, color: '#fff1d6' }); }
    if (hurt > 0) { hurt -= dt; const g = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 560); g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,0,0,${Math.max(0, hurt) * 0.9})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    if (flash > 0) { flash -= dt; ctx.fillStyle = `rgba(255,255,220,${Math.max(0, flash) * 1.4})`; ctx.fillRect(0, 0, W, H); }
    if (me && me.dead) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, H); G.text('WRECKED', W / 2, H / 2 - 20, { size: 54, color: '#ff5d5d' }); G.text('Respawning…', W / 2, H / 2 + 26, { size: 18, color: '#ddd' }); }
    // timer
    const timerY=W<700?52:28;
    rr(W / 2 - 46, timerY-18, 92, 34, 10, 'rgba(0,0,0,.55)'); G.text(`${Math.floor(s.t / 60)}:${String(s.t % 60).padStart(2, '0')}`, W / 2, timerY, { size: 20, color: s.t <= 10 ? '#ff6b6b' : '#fff', stroke: false });
    // what your item does: a card at the top while you hold one (pops when you pick it up)
    if (me && me.weapon !== cardW) { cardW = me.weapon; cardT = time; }
    if (me && me.weapon && !me.dead) {
      /* big for the first six seconds after a pickup (so you can read what it does), then it shrinks out of the way */
      const narrow = W < 700, fresh = Math.max(0, Math.min(1, (6.6 - (time - cardT)) / 0.6)), big = fresh, cw = Math.min(W - 24, 540 + 220 * big), cy = H - 96 - 16 * big, pop = reducedMotion ? 0 : Math.max(0, 1 - (time - cardT) / 0.3);
      const chh = 50 + 32 * big, ic = 13 + 7 * big, nameSz = 15 + 9 * big, infoSz = (cw < 440 ? 10.5 : 13) + 6 * big;
      ctx.save(); ctx.translate(W / 2, cy); ctx.scale(1 + pop * 0.14, 1 + pop * 0.14);
      rr(-cw / 2, -chh / 2, cw, chh, 14 + 4 * big, 'rgba(8,12,20,.82)', '#ffd84d'); if (big > 0) rr(-cw / 2, -chh / 2, 8 * big, chh, 4, '#ffd84d');
      (ICONS[me.weapon] || ICONS.green)(-cw / 2 + 28 + 8 * big, 0, ic);
      G.text(WEAPON_NAMES[me.weapon] || me.weapon, -cw / 2 + 54 + 16 * big, -10 - 9 * big, { size: nameSz, weight: 900, align: 'left', color: '#ffd84d', stroke: false });
      G.text(WEAPON_INFO[me.weapon] || '', -cw / 2 + 54 + 16 * big, 10 + 9 * big, { size: infoSz, weight: big > 0.5 ? 600 : 400, align: 'left', color: '#fff', stroke: false });
      ctx.restore();
    }
    // minimap
    const mx = 16, my = W<700?90:70, ms = (W<700?117:176)/MW; /* a little bigger, and it carries the match numbers underneath */
    rr(mx - 4, my - 4, MW * ms + 8, MH * ms + 8, 8, 'rgba(0,0,0,.5)', 'rgba(255,255,255,.25)');
    for (const z of map.zones || []) { ctx.fillStyle = 'rgba(140,90,40,.75)'; ctx.fillRect(mx + z.x * ms, my + z.y * ms, z.w * ms, z.h * ms); }
    for (const d of map.decks || []) { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(mx + d.x * ms, my + d.y * ms, d.w * ms, d.h * ms); }
    for (const rp of map.ramps || []) { ctx.fillStyle = 'rgba(255,210,31,.55)'; ctx.fillRect(mx + rp.x * ms, my + rp.y * ms, rp.w * ms, rp.h * ms); const cx = mx + (rp.x + rp.w / 2) * ms, cy = my + (rp.y + rp.h / 2) * ms, a = rp.dir === 'E' ? 0 : rp.dir === 'S' ? Math.PI / 2 : rp.dir === 'W' ? Math.PI : -Math.PI / 2; ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(4.5, 0); ctx.lineTo(-3.5, -3.5); ctx.lineTo(-3.5, 3.5); ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.restore(); }
    for (const pd of map.pads || []) { ctx.fillStyle = pd.kind === 'boost' ? '#ff9f43' : '#5ee07a'; ctx.fillRect(mx + pd.x * ms - 2.5, my + pd.y * ms - 2.5, 5, 5); }
    (map.portals || []).forEach((pair, i) => pair.forEach((e) => { ctx.beginPath(); ctx.arc(mx + e.x * ms, my + e.y * ms, 4, 0, 7); ctx.strokeStyle = ['#35e6ff', '#ff4dd8', '#ffd84d'][i % 3]; ctx.lineWidth = 2; ctx.stroke(); }));
    for (const h of s.haz || []) G.circle(mx + h[0] * ms, my + h[1] * ms, 3.5, map.theme === 'neon' ? '#ff4dd8' : '#c9a37a', '#3a2410');
    ctx.fillStyle = 'rgba(255,255,255,.28)'; for (const o of OBST) ctx.fillRect(mx + o.x * ms, my + o.y * ms, o.w * ms, o.h * ms);
    s.boxes.forEach((on, i) => { if (on) { ctx.fillStyle = '#ffd84d'; ctx.fillRect(mx + BOXES[i][0] * ms - 2, my + BOXES[i][1] * ms - 2, 4, 4); } });
    for (const e of s.ents) if (e.k === 'blue' || e.k === 'red') G.circle(mx + e.x * ms, my + e.y * ms, 2, e.k === 'blue' ? '#6ea0ff' : '#ff6a6a');
    for (const k of s.karts) { if (k.dead || (k.ghost && k.id !== G.me)) continue; const p = G.player(k.id), x = mx + k.x * ms, y = my + k.y * ms; G.circle(x, y, k.id === G.me ? 4.5 : 3.5, p.color, k.id === G.me ? '#fff' : null); if (k.id === G.me) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(k.a) * 10, y + Math.sin(k.a) * 10); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 8 + Math.sin(time * 5) * 1.5, 0, 7); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; ctx.stroke(); G.text('YOU', x, y - 13, { size: 9, weight: 800, color: '#fff' }); } }
    { /* who is in, who is still racing, where you stand */
      const total = s.karts.length, racing = s.karts.filter((k) => !k.dead).length, order = s.karts.slice().sort((a, b) => b.kills - a.kills), rank = order.findIndex((k) => k.id === G.me) + 1, iy = my + MH * ms + 16;
      rr(mx - 4, iy - 10, MW * ms + 8, 34, 8, 'rgba(0,0,0,.5)', 'rgba(255,255,255,.2)');
      G.text(`${total} players  ·  ${racing} racing  ·  ${Math.floor(s.t / 60)}:${String(s.t % 60).padStart(2, '0')} left`, mx + (MW * ms) / 2, iy, { size: 10.5, color: '#fff', stroke: false });
      if (me) G.text(`You: ${me.kills} tags  ·  ${rank ? rank + (rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th') + ' of ' + total : ''}  ·  ${map.name}`, mx + (MW * ms) / 2, iy + 14, { size: 10, color: '#ffd84d', stroke: false });
    }
    // item slot + hearts
    if (me) {
      rr(W / 2 - 150, H - 70, 300, 56, 14, 'rgba(0,0,0,.6)', 'rgba(255,255,255,.2)');
      rr(W / 2 - 142, H - 64, 44, 44, 10, me.weapon ? 'rgba(255,216,77,.22)' : 'rgba(255,255,255,.08)', me.weapon ? '#ffd84d' : 'rgba(255,255,255,.25)');
      if (me.weapon) { (ICONS[me.weapon] || ICONS.green)(W / 2 - 120, H - 42, 14); G.text(WEAPON_NAMES[me.weapon] || me.weapon, W / 2 - 86, H - 50, { size: 16, align: 'left', stroke: false }); G.text(me.bill ? 'autopilot!' : 'SPACE / click to use', W / 2 - 86, H - 31, { size: 11, align: 'left', color: '#bbb', stroke: false }); }
      else { G.text('?', W / 2 - 120, H - 42, { size: 22, color: 'rgba(255,255,255,.35)', stroke: false }); G.text(me.ghost ? 'Ghost: untouchable' : 'Drive through an item box', W / 2 - 86, H - 42, { size: 13, align: 'left', color: '#aaa', stroke: false }); }
      for (let i = 0; i < 3; i++) { /* three hearts that drain smoothly, so minigun chip damage is visible */
        const x = W / 2 + 92 + i * 20, y = H - 42, fill = Math.max(0, Math.min(1, me.hp - i));
        const heart = () => { ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.bezierCurveTo(x - 12, y - 4, x - 5, y - 11, x, y - 4); ctx.bezierCurveTo(x + 5, y - 11, x + 12, y - 4, x, y + 6); };
        heart(); ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fill();
        if (fill > 0) { ctx.save(); ctx.beginPath(); ctx.rect(x - 10, y - 10, 20 * fill, 18); ctx.clip(); heart(); ctx.fillStyle = '#ff4d4d'; ctx.fill(); ctx.restore(); }
      }
      const st = []; if (me.mud) st.push(['MUD', '#c9a37a']); if (me.bst && !me.mush) st.push(['BOOST', '#ff9f43']); if (me.star) st.push(['STAR', '#ffd84d']); if (me.ghost) st.push(['GHOST', '#e8e8ff']); if (me.small) st.push(['SHRUNK', '#fff27a']); if (me.egg > 0) st.push(['EGGED', '#fff3c4']); if (me.mush) st.push(['BOOST', '#ff7a3d']); if (me.bill) st.push(['BULLET', '#fff']);
      st.forEach(([t, c], i) => G.text(t, W / 2 - (st.length - 1) * 38 + i * 76, H - 84, { size: 13, color: c }));
      G.text(VEHICLE_NAMES[me.v % 8], W / 2, H - 6, { size: 10, color: 'rgba(255,255,255,.5)', stroke: false });
    }
    // scoreboard + kill feed
    const board = s.karts.slice().sort((a, b) => b.kills - a.kills);
    const boardY=W<700?88:68;
    rr(W - 160, boardY, 148, 14 + board.length * 20, 10, 'rgba(12,29,39,.72)');
    board.forEach((k, i) => { const p = G.player(k.id); G.text(`${i + 1}`, W - 150, boardY+17 + i * 20, { size: 11, align: 'left', color: '#a2b6b9', stroke: false }); G.circle(W - 132, boardY+17 + i * 20, 4, p.color); G.text(p.name.slice(0,12), W - 122, boardY+17 + i * 20, { size: 13, color: k.id === G.me ? '#fff' : '#ddd', align: 'left', stroke: false }); G.text(`${k.kills}`, W - 22, boardY+17 + i * 20, { size: 13, align: 'right', stroke: false }); });
    for (let i = feed.length - 1; i >= 0; i--) { feed[i].t -= dt; if (feed[i].t <= 0) feed.splice(i, 1); }
    feed.forEach((f, i) => G.text(f.text, W - 16, 98 + board.length * 20 + i * 18, { size: 12, align: 'right', color: `rgba(255,255,255,${Math.min(1, f.t)})` }));
    for (let i = banners.length - 1; i >= 0; i--) { banners[i].t -= dt; if (banners[i].t <= 0) banners.splice(i, 1); }
    banners.forEach((b,i)=>{const age=b.duration-b.t,p=Math.min(1,age/.3),scale=reducedMotion?1:1+2.3*Math.pow(p-1,3)+1.3*Math.pow(p-1,2);ctx.save();ctx.globalAlpha=Math.min(1,b.t/.3);ctx.translate(W/2,(W<700?270:135)+i*34);ctx.scale(Math.max(.1,scale),Math.max(.1,scale));G.text(b.text,0,0,{size:Math.min(28-i*4,W/Math.max(12,b.text.length)*1.4),color:b.color});ctx.restore();});
    G.text('H: what every item does', W / 2, H - 78 - (me && (me.star || me.ghost || me.small || me.egg > 0 || me.mush || me.bill || me.mud || me.bst) ? 24 : 0), { size: 10.5, color: 'rgba(255,255,255,.55)', stroke: false });
    if (showGuide) {
      const cols = W < 1040 ? 1 : 2, rows = Math.ceil(ITEM_ORDER.length / cols), rh = Math.min(30, (H - 150) / rows), pw = Math.min(W - 24, cols === 2 ? 1080 : 540), ph = rows * rh + 64, px = (W - pw) / 2, py = Math.max(8, (H - ph) / 2);
      rr(px, py, pw, ph, 16, 'rgba(8,12,20,.93)', 'rgba(255,216,77,.7)');
      G.text('Items', px + 22, py + 26, { size: 19, weight: 800, align: 'left', color: '#ffd84d', stroke: false });
      G.text('Space or click uses your item  •  H closes this', px + pw - 22, py + 26, { size: 11.5, align: 'right', color: '#aab', stroke: false });
      ITEM_ORDER.forEach((id, i) => {
        const col = Math.floor(i / rows), row = i % rows, x = px + 22 + col * (pw / cols), y = py + 58 + row * rh;
        (ICONS[id] || ICONS.green)(x + 10, y, Math.min(10, rh * 0.36));
        G.text(WEAPON_NAMES[id], x + 30, y, { size: 12.5, weight: 800, align: 'left', color: '#fff', stroke: false });
        G.text(WEAPON_INFO[id], x + 152, y, { size: W < 560 ? 9.5 : 11.5, align: 'left', color: '#c9d2e0', stroke: false });
      });
    }
  }

  return {
    state(ns) { s = ns;map=window.MEMEKARTS_MAPS.find(m=>m.id===ns.mapId)||window.MEMEKARTS_MAPS[0];OBST=map.obstacles;BOXES=map.boxes;MW=map.w||900;MH=map.h||600;OX=MW/2;OZ=MH/2; },
    event(e) {
      const mine = (id) => id === G.me;
      if (e.type === 'kill' && e.killer && e.streak >= 3) banner(e.streak >= 5 ? `${nm(e.killer)} is UNSTOPPABLE (${e.streak} in a row)` : `${nm(e.killer)} is on a rampage (${e.streak} in a row)`, '#ff9f43', 2.5);
      if (e.type === 'kill') { feed.unshift({ text: e.killer ? `${nm(e.killer)} ⟶ ${nm(e.victim)}  (${e.weapon})` : (e.weapon === 'Boulder' ? `${nm(e.victim)} was flattened by a boulder` : e.weapon === 'Drone' ? `${nm(e.victim)} was zapped by a drone` : `${nm(e.victim)} blew up (${e.weapon})`), t: 6 }); T && T.ready && T.boom(e.x, e.y, 70); if (mine(e.killer)) banner(`You wrecked ${nm(e.victim)}!`, '#5ee07a'); }
      if (e.type === 'boom') T && T.ready && T.boom(e.x, e.y, e.r);
      if (e.type === 'land') T && T.ready && T.ringFx(e.x, e.y, 70);
      if (e.type === 'warp' && T && T.ready) { T.ringFx(e.x, e.y, 46); T.ringFx(e.tx, e.ty, 46); T.burst(e.x - OX, 14, e.y - OZ, 26, 90, ['#35e6ff', '#ff4dd8', '#ffffff'], 0.6); T.burst(e.tx - OX, 14, e.ty - OZ, 26, 90, ['#35e6ff', '#ff4dd8', '#ffffff'], 0.6); }
      if (e.type === 'bonk' && T && T.ready) { T.ringFx(e.x, e.y, 50); T.burst(e.x - OX, 12, e.y - OZ, 22, 110, ['#c9a37a', '#8a6a4d', '#ffffff'], 0.6); if (mine(e.id)) banner(e.kind === 'drone' ? 'Zapped by a drone!' : 'Flattened by a boulder!', e.kind === 'drone' ? '#ff4dd8' : '#c9a37a', 1.6); }
      if (e.type === 'fakebox') { T && T.ready && T.boom(e.x, e.y, 40); feed.unshift({ text: `${nm(e.id)} fell for a fake box`, t: 4 }); }
      if (e.type === 'hit' && mine(e.id)) hurt = 0.6;
      if (e.type === 'egged') { feed.unshift({ text: `${nm(e.by)} egged ${nm(e.id)}`, t: 4 }); if (mine(e.id)) banner('You got egged!', '#fff3c4'); }
      if (e.type === 'slip') feed.unshift({ text: `${nm(e.id)} slipped on a banana`, t: 4 });
      if (e.type === 'pied') { feed.unshift({ text: `${nm(e.by)} pied ${nm(e.id)}`, t: 4 }); if (mine(e.id)) banner('Pie in the face!', '#fff1d6'); if (mine(e.by) && !mine(e.id)) banner(`Splat! ${nm(e.id)} got pied`, '#fff1d6', 1.6); }
      if (e.type === 'splat') T && T.ready && T.splat(e.x, e.y);
      if (e.type === 'steal') { feed.unshift({ text: `${nm(e.id)}'s ghost stole from ${nm(e.from)}`, t: 4 }); if (mine(e.from)) banner('A ghost stole your item!', '#e8e8ff'); if (mine(e.id)) banner(`Stole: ${WEAPON_NAMES[e.weapon] || e.weapon}`, '#e8e8ff'); }
      if (e.type === 'bolt') { flash = 0.6; banner(mine(e.id) ? 'LIGHTNING!' : `${nm(e.id)} used LIGHTNING`, '#fff27a'); }
      if (e.type === 'bill') feed.unshift({ text: `${nm(e.id)} became a Bullet Bill`, t: 4 });
      if (e.type === 'ink' && !mine(e.id)) banner('Inked!', '#9aa0ff', 1.5);
      if (e.type === 'pickup' && mine(e.id)) cardT = time; /* the item card at the top pops and explains it */
      if (e.type === 'over') banner(e.winner ? `${nm(e.winner)} wins!` : 'Time!', '#ffd84d', 5);
      if (feed.length > 6) feed.length = 6;
    },
    key(k, down) { if (k === ' ') trigger(down); if (down && k === 'h') showGuide = !showGuide; sendCtl(); },
    mouse(kind) { if (kind === 'down') trigger(true); else if (kind === 'up') trigger(false); },
    render(dt) {
      time += dt; sendCtl();
      if (!T && !failed && window.THREE) { try { T = create3D(); } catch (e) { failed = e.message; console.error(e); } }
      if (T) { try { T.update(dt); if (T.ready) { const mk = s && s.karts.find((q) => q.id === G.me); T.aim(chargeAt != null && mk && mk.weapon === 'pie' && !mk.dead ? mk : null, chargeNow()); if (chargeAt != null && !(mk && mk.weapon === 'pie')) chargeAt = null; } } catch (e) { failed = e.message; console.error(e); T.dispose(); T = null; } }
      hud(dt);
    },
    destroy() { if (T) T.dispose(); T = null;touchControls.remove();touchKeys.clear(); },
  };
});
