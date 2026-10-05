// Real GLB loading, collision-footprint checks, animation checks, and visual captures.
import { launchArtBrowser } from './browser.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const specs = JSON.parse(await readFile('art/memekarts/environment-validation.json', 'utf8'));
const rampSpec = JSON.parse(await readFile('art/memekarts/ramp-validation.json', 'utf8')).ramp;
const browser = await launchArtBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const base = process.env.TEST_URL || 'http://127.0.0.1:3000';
try {
  await page.goto(base + '/?bloom=0');
  await page.waitForFunction(() => window.THREE && window.GLTFLoader);
  const rampAsset = await page.evaluate(async () => {
    const gltf = await new GLTFLoader().loadAsync('/models/ramp.glb');
    let triangles=0; gltf.scene.traverse(o=>{ if(o.isMesh) triangles+=(o.geometry.index?.count ?? o.geometry.attributes.position.count)/3; });
    const bb=new THREE.Box3().setFromObject(gltf.scene),size=bb.getSize(new THREE.Vector3());
    const ray=new THREE.Raycaster(new THREE.Vector3(-2,5,0),new THREE.Vector3(0,-1,0));
    const low=ray.intersectObject(gltf.scene.getObjectByName('ramp_core'))[0]?.point.y;
    ray.ray.origin.x=2; const high=ray.intersectObject(gltf.scene.getObjectByName('ramp_core'))[0]?.point.y;
    return {triangles, size:size.toArray(),floor:bb.min.y,low,high,animations:gltf.animations.length};
  });
  assert.equal(rampAsset.triangles,rampSpec.triangles); assert(rampAsset.triangles<=400);
  assert.equal(rampAsset.animations,0); assert(Math.abs(rampAsset.floor)<.0001);
  assert(rampAsset.high>rampAsset.low && Math.abs(rampAsset.size[0]-7.2)<.001 && Math.abs(rampAsset.size[2]-6.4)<.01 && Math.abs(rampAsset.size[1]-1.5)<.001);
  const assets = await page.evaluate(async specs => {
    const T = THREE, root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#172330;color:#fff;font:700 20px system-ui';
    document.body.appendChild(root);
    const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1440, 1000); renderer.toneMapping = T.ACESFilmicToneMapping;
    root.appendChild(renderer.domElement); renderer.setScissorTest(true);
    const pmrem = new T.PMREMGenerator(renderer), studio = new RoomEnvironment(), env = pmrem.fromScene(studio, .06);
    const results = [];
    for (let i = 0; i < specs.length; i++) {
      const { scene: model } = await new GLTFLoader().loadAsync('/models/' + specs[i].name + '.glb');
      const bounds = new T.Box3().setFromObject(model), size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3());
      let triangles = 0;
      model.traverse(o => {
        if (!o.isMesh) return;
        triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
        if (Array.isArray(o.material)) throw Error('Unsupported multi-material mesh');
        if (![...o.geometry.attributes.position.array].every(Number.isFinite)) throw Error('Non-finite vertices');
      });
      results.push({ name: specs[i].name, triangles, floor: bounds.min.y });
      const scene = new T.Scene(); scene.background = new T.Color(i % 2 ? '#263247' : '#203b43');
      scene.environment = env.texture; scene.environmentIntensity = .4;
      scene.add(model, new T.HemisphereLight('#d9eeff', '#77654c', 2));
      const sun = new T.DirectionalLight('#fff0d8', 3); sun.position.set(8, 14, 9); scene.add(sun);
      const radius = Math.max(size.x, size.y, size.z) * .72;
      const camera = new T.OrthographicCamera(-radius, radius, radius, -radius, .1, 200);
      camera.position.copy(center).add(new T.Vector3(1, .65, 1.1).multiplyScalar(radius * 3)); camera.lookAt(center);
      const x = (i % 3) * 480, y = i < 3 ? 500 : 0;
      renderer.setViewport(x, y, 480, 480); renderer.setScissor(x, y, 480, 480); renderer.render(scene, camera);
      const title = document.createElement('div'); title.textContent = specs[i].name.replaceAll('_', ' ') + ` · ${triangles} tris`;
      title.style.cssText = `position:absolute;left:${x + 22}px;top:${i < 3 ? 20 : 520}px;font-size:17px`;
      root.appendChild(title);
    }
    return results;
  }, specs);
  for (const a of assets) {
    assert(a.triangles <= specs.find(s => s.name === a.name).budget);
    assert(Math.abs(a.floor) < .0001, a.name + ' is not grounded');
  }
  await page.screenshot({ path: 'art/memekarts/environment-catalog.png' });
  await page.reload(); await page.waitForFunction(() => window.THREE && window.G);
  await page.evaluate(() => {
    const Base = THREE.WebGLRenderer;
    window.THREE = { ...THREE, WebGLRenderer: class extends Base {
      constructor(...args) {
        super(...args);
        const render = this.render.bind(this);
        this.render = (scene, camera) => {
          if (scene.children.some(o => o.userData.environment)) {
            window.environmentScene = scene;
            if (window.environmentCamera) camera = window.environmentCamera;
          }
          if (!window.environmentSkipDraw) return render(scene, camera);
        };
      }
    }
    };
  });
  await page.locator('#name').fill('Environment check'); await page.locator('#testBtn').click();
  await page.waitForFunction(() => G.room?.players.length >= 4);
  // The default game is Meme Karts; use the UI too, in case the room preference changes.
  await page.locator('[data-id="memekarts"]').evaluate(e => e.click());
  for (const id of ['stadium', 'neon', 'canyon']) {
    await page.locator(`#mapPicker [data-map="${id}"]`).click();
    await page.waitForFunction(id => G.room.mapId === id, id);
    await page.locator('#startBtn').click();
    await page.waitForFunction(id => window.environmentScene?.children.some(o => o.name === 'landmark_' + id), id);
    const result = await page.evaluate(id => {
      const scene = window.environmentScene, map = MEMEKARTS_MAPS.find(m => m.id === id), T = THREE;
      scene.updateMatrixWorld(true);
      const landmarks = scene.children.filter(o => o.name === 'landmark_' + id);
      const decorations = scene.children.filter(o => o.userData.environment);
      for (const g of decorations) {
        const b = new T.Box3().setFromObject(g);
        if (!(b.min.x >= map.w / 2 - 20 || b.max.x <= -map.w / 2 + 20 || b.min.z >= map.h / 2 - 20 || b.max.z <= -map.h / 2 + 20)) throw Error('Scenery enters driveable area');
      }
      const obstacles = scene.children.filter(o => o.userData.obstacle);
      const ramps = scene.children.filter(o=>o.getObjectByName('ramp_core'));
      if(ramps.length !== (map.ramps||[]).length) throw Error('Missing custom ramps');
      for(const rp of map.ramps||[]) {
        const cx=rp.x+rp.w/2-map.w/2,cz=rp.y+rp.h/2-map.h/2;
        const g=ramps.find(g=>Math.abs(g.position.x-cx)<.01&&Math.abs(g.position.z-cz)<.01);
        if(!g) throw Error('Ramp missing at map coordinates');
        const bb=new T.Box3().setFromObject(g),size=bb.getSize(new T.Vector3());
        if(Math.abs(size.x-rp.w)>.02||Math.abs(size.z-rp.h)>.02||Math.abs(size.y-32)>.02 /* RAMP_H in public/games/memekarts.js, raised from 15 by the game-code owner */||Math.abs(bb.min.y)>.02) throw Error('Ramp collision footprint/height mismatch');
        const dx=rp.dir==='E'?1:rp.dir==='W'?-1:0,dz=rp.dir==='S'?1:rp.dir==='N'?-1:0;
        const len=dx?rp.w:rp.h,ray=new T.Raycaster(new T.Vector3(cx-dx*len*.25,40,cz-dz*len*.25),new T.Vector3(0,-1,0));
        const low=ray.intersectObject(g.getObjectByName('ramp_core'))[0]?.point.y;
        ray.ray.origin.set(cx+dx*len*.25,40,cz+dz*len*.25);
        const high=ray.intersectObject(g.getObjectByName('ramp_core'))[0]?.point.y;
        if(Math.abs(low-8)>.02||Math.abs(high-24)>.02) throw Error('Ramp slopes against its uphill direction'); /* a quarter and three quarters of the way up a 32-unit ramp (was 15) */
      }
      for (const g of obstacles) {
        const b = new T.Box3().setFromObject(g), size = b.getSize(new T.Vector3()), o = g.userData.obstacle;
        if (Math.abs(size.x - o.w) > .02 || Math.abs(size.z - o.h) > .02 || Math.abs(size.y - 33) > .02 || Math.abs(b.min.y) > .02) throw Error('Obstacle collision footprint mismatch');
      }
      const pivots = []; scene.traverse(o => { if (o.name.endsWith('_pivot')) pivots.push(o); });
      window.environmentPivot = pivots[0];
      return { landmarks: landmarks.length, obstacles: obstacles.length, expectedObstacles: map.obstacles.length, ramps:ramps.length, pivots: pivots.length, angle: pivots[0]?.rotation.toArray().slice(0, 3) };
    }, id);
    assert.equal(result.landmarks, 4); assert.equal(result.pivots, 4); assert.equal(result.obstacles, result.expectedObstacles);
    await page.waitForTimeout(1000);
    const nextAngle = await page.evaluate(() => environmentPivot.rotation.toArray().slice(0, 3));
    assert(nextAngle.some((a, i) => Math.abs(a - result.angle[i]) > .01), 'Landmark animation stalled');
    await page.keyboard.down('w'); await page.waitForTimeout(1000); await page.keyboard.up('w');
    await page.screenshot({ path: `art/environment-${id}-drive.png` });
    // A second view of the actual game scene, not an artist-only mockup.
    await page.evaluate(id => {
      const map = MEMEKARTS_MAPS.find(m => m.id === id), camera = new THREE.PerspectiveCamera(55, 1.44, 1, 6000);
      camera.position.set(map.w * .65, map.w * .8, map.h * 1.05); camera.lookAt(0, 0, 0); window.environmentCamera = camera;
    }, id);
    await page.waitForTimeout(200); await page.screenshot({ path: `art/environment-${id}-overview.png` });
    await page.evaluate(() => { window.environmentCamera = null; window.environmentScene = null; G.socket.emit('lobby'); });
    await page.waitForFunction(() => G.room.phase === 'lobby');
    console.log(id + ': ' + JSON.stringify(result));
  }
  for (const reduce of [false, true]) {
    await page.emulateMedia({ reducedMotion: reduce ? 'reduce' : 'no-preference' });
    const angles = await page.evaluate(async () => {
      const source = await (await fetch('/games/memekarts.js')).text(); let factory;
      const register = window.registerGame; window.registerGame = (_id, f) => factory = f;
      try { (0, eval)(source); } finally { window.registerGame = register; }
      document.querySelector('#lobby').classList.add('hidden');
      document.querySelector('#game').classList.remove('hidden');
      document.querySelector('#game').classList.add('kart-fullscreen');
      const angles = [];
      for (const fps of [30, 60, 120]) {
        window.environmentScene = null; window.environmentSkipDraw = false;
        const game = factory({ ...G, me: 'animation-test', keys: new Set(), send() {} });
        try {
          const map = MEMEKARTS_MAPS.find(m => m.id === 'canyon');
          game.state({ mapId: 'canyon', t: 100, karts: [], ents: [], boxes: map.boxes.map(() => 1), haz: [] });
          for (let n = 0; n < 200 && !window.environmentScene; n++) {
            game.render(0); await new Promise(r => setTimeout(r, 20));
          }
          if (!window.environmentScene) throw Error('Animation scene did not load');
          const pivot = environmentScene.getObjectByName('anim_rotor_pivot');
          const before = pivot.rotation.x;
          // Exercise actual update logic at exact frame rates, without benchmarking GPU throughput.
          window.environmentSkipDraw = true;
          for (let frame = 0; frame < fps; frame++) game.render(1 / fps);
          angles.push({ fps, rotation: pivot.rotation.x - before });
        } finally { game.destroy(); window.environmentSkipDraw = false; }
      }
      return angles;
    });
    for (const a of angles) assert(Math.abs(a.rotation - (reduce ? 0 : .65)) < .00001);
    console.log(`Landmark animation, reduced motion ${reduce}: ${JSON.stringify(angles)}`);
  }
  assert.deepEqual([...new Set(errors)], []);
  console.log('Seven GLBs grounded and within budget; three maps, exact ramp/obstacle footprints and slope directions, safe scenery, moving landmarks, no browser errors: PASS');
} catch (error) {
  console.error('Browser errors:', errors);
  throw error;
} finally {
  await browser.close();
}
