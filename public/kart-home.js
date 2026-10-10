(function () {
  window.kartMapCard = (m, selected = false, disabled = false) => `<button class="map-card ${m.theme} ${selected ? 'selected' : ''}" data-map="${m.id}" ${disabled ? 'disabled' : ''} aria-pressed="${selected}"><div class="map-art"><svg viewBox="0 0 ${m.w || 900} ${m.h || 600}" aria-hidden="true"><rect x="20" y="20" width="${(m.w || 900) - 40}" height="${(m.h || 600) - 40}" rx="30" fill="${m.floor}" stroke="${m.accent}" stroke-width="12"/>${m.obstacles.map(o => `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="7" fill="${m.accent}"/>`).join('')}${(m.decks||[]).map(o => `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="10" fill="${o.z ? m.accent : '#ffffff'}" fill-opacity="${o.z ? '1' : '.85'}" stroke="${m.accent}" stroke-width="8"/>`).join('')}${(m.ramps||[]).map(o => `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="6" fill="#ff8a1f"/>`).join('')}${m.boxes.map(([x,y]) => `<circle cx="${x}" cy="${y}" r="12" fill="#fff"/>`).join('')}</svg><span>${selected ? '✓ SELECTED' : 'BATTLE ARENA'}</span></div><div class="map-copy"><b>${m.name}</b><small>${m.tag}</small></div></button>`;
  function cards() {
    document.querySelector('#homeMaps').innerHTML = window.MEMEKARTS_MAPS.map(m => window.kartMapCard(m, m.id === (window.selectedKartMap || 'stadium'))).join('');
    document.querySelectorAll('#homeMaps [data-map]').forEach(b => b.onclick = () => { window.selectedKartMap = b.dataset.map; cards(); });
  }
  cards();
  let started = false;
  function showcase() {
    if (started || !window.THREE) return;
    started = true;
    const T = window.THREE, canvas = document.querySelector('#kartShowcase');
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true }); } catch (_) { return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(36, 1, .1, 100);
    camera.position.set(5, 4.2, 7.8); camera.lookAt(0, .9, 0);
    scene.add(new T.HemisphereLight(0xe4f4ff, 0x48545b, 2.6));
    const light = new T.DirectionalLight(0xffe4bb, 3); light.position.set(3, 7, 4); light.castShadow = true; light.shadow.mapSize.set(1024,1024);light.shadow.bias=-.001;light.shadow.normalBias=.025; scene.add(light);
    const floor = new T.Mesh(new T.CircleGeometry(2.7, 64), new T.MeshStandardMaterial({color:0x24484c,roughness:.7})); floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);
    const ring = new T.Mesh(new T.TorusGeometry(2.7,.025,6,64),new T.MeshBasicMaterial({color:0xe8ff83}));ring.rotation.x=Math.PI/2; scene.add(ring);
    let kart;
    new window.GLTFLoader().load('/models/kart_7.glb', gltf => {
      kart=gltf.scene;
      kart.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;if(o.material.name==='Paint') o.material.color.set('#ff794f');}});
      scene.add(kart);
    });
    // Toy Box Blasters showcase: a figure holding a blaster, shown instead of the kart when that game's tab is selected
    const toy = new T.Group(); toy.visible = false; toy.scale.setScalar(1.5); scene.add(toy); const toyPaint = [];
    new window.GLTFLoader().load('/models/fps_char_4.glb', gltf => { const f = gltf.scene; f.rotation.y = Math.PI; f.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (o.material.name === 'Paint') toyPaint.push(o.material); } }); toy.add(f); });
    new window.GLTFLoader().load('/models/fps_w_scatter.glb', gltf => { const w = gltf.scene; w.position.set(.33, 1.2 + .17 - .27, -.40); w.traverse(o => { if (o.isMesh) o.castShadow = true; }); toy.add(w); });
    const observer = new ResizeObserver(() => {const r=canvas.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/Math.max(1,r.height);camera.updateProjectionMatrix();}); observer.observe(canvas);
    let previous=0;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    function frame(now){ requestAnimationFrame(frame);const dt=Math.min(.05,(now-previous)/1000);previous=now;if(document.hidden || document.querySelector('#home').classList.contains('hidden')) return;const toyOn=window.selectedGame==='blasters';if(kart)kart.visible=!toyOn;toy.visible=toyOn;if(kart&&!reduced) kart.rotation.y+=dt*.18;if(!reduced)toy.rotation.y+=dt*.35;for(const m of toyPaint)m.color.setHSL((now*.00006)%1,.75,.55);renderer.render(scene,camera); }
    requestAnimationFrame(frame);
  }
  window.addEventListener('three-ready', showcase); showcase();
})();
