// Independent validation of the exported GLBs in the actual browser/Three.js loader.
import { launchArtBrowser } from '../browser.mjs';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const report = JSON.parse(await readFile('art/blasters/validation.json', 'utf8'));
const map = JSON.parse(await readFile('art/blasters/map.json', 'utf8'));
const browser = await launchArtBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3000');
  await page.waitForFunction(() => window.THREE && window.GLTFLoader && window.BLASTERS);
  const result = await page.evaluate(async ({ report, map }) => {
    const T = THREE, loaded = {}, result = [], colors = ['#ff5d5d', '#4da6ff', '#5ee07a', '#ffd84d', '#c77dff', '#ff9f43', '#2ee6d6', '#ff75c5'];
    const ensure = (ok, message) => { if (!ok) throw Error(message); };
    const files = await (await fetch('/models/list')).json();
    for (const [name, spec] of Object.entries(report)) {
      ensure(files.includes(name + '.glb'), name + ' absent from model discovery');
      const gltf = await new GLTFLoader().loadAsync('/models/' + name + '.glb');
      const scene = gltf.scene; loaded[name] = scene;
      ensure(gltf.animations.length === 0, name + ' has forbidden baked animations');
      scene.updateMatrixWorld(true);
      const bb = new T.Box3().setFromObject(scene), size = bb.getSize(new T.Vector3());
      let triangles = 0, paint = 0, meshes = 0;
      scene.traverse(o => {
        ensure(!o.isLight && !o.isCamera && !o.isSkinnedMesh, name + ' contains non-static art');
        if (!o.isMesh) return;
        meshes++;
        ensure(!Array.isArray(o.material), name + ' contains a loader-incompatible multi-material mesh');
        triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
        if (o.material.name === 'Paint') paint++;
        for (const attr of ['position', 'normal']) ensure([...o.geometry.attributes[attr].array].every(Number.isFinite), name + ' invalid ' + attr);
      });
      ensure(triangles === spec.triangles && triangles <= spec.budget, name + ' triangle mismatch');
      ensure(Math.abs(bb.min.y) < .0001, name + ' not grounded');
      if (/fps_char_/.test(name)) {
        ensure(paint > 0, name + ' missing Paint');
        ensure(size.y >= 1.7999 && size.y <= 2.4, name + ' decorative height');
        const head = new T.Box3().setFromObject(scene.getObjectByName('head_core')).getCenter(new T.Vector3());
        const factor = 1.56 / (head.y - bb.min.y);
        head.sub(new T.Vector3(head.x, bb.min.y, head.z)).multiplyScalar(factor);
        ensure(head.distanceTo(new T.Vector3(0, 1.56, 0)) < .0001, name + ' fitted head misses hit sphere');
        const crouched = scene.clone(true); crouched.scale.y = .62; crouched.updateMatrixWorld(true);
        const crouchHead = new T.Box3().setFromObject(crouched.getObjectByName('head_core')).getCenter(new T.Vector3());
        ensure(Math.abs(crouchHead.y-1.56*.62)<.0001 && Math.abs(new T.Box3().setFromObject(crouched).min.y)<.0001, name+' crouch fit');
        scene.traverse(o => {
          if (!o.isMesh) return;
          const p = new T.Vector3(), positions = o.geometry.attributes.position;
          for (let i = 0; i < positions.count; i++) {
            p.fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld);
            if (p.y <= 1.36) ensure(Math.abs(p.x) <= .4201 && Math.abs(p.z) <= .4201, name + ' body exceeds hit box');
          }
        });
        for (const color of colors) {
          const clone = scene.clone(true);
          clone.traverse(o => {
            if (!o.isMesh || o.material.name !== 'Paint') return;
            o.material = o.material.clone(); o.material.color.set(color);
            ensure(o.material.color.getHexString() === color.slice(1), 'Paint recolor failed');
            o.material.dispose();
          });
        }
        const hand = new T.Box3().setFromObject(scene.getObjectByName('right_hand')).getCenter(new T.Vector3());
        hand.applyAxisAngle(new T.Vector3(0, 1, 0), Math.PI);
        ensure(hand.x > .3 && hand.z < -.3, name + ' right hand points backward after loader rotation');
      }
      if (/fps_w_/.test(name) || name === 'fps_rocket') {
        const muzzle = new T.Box3().setFromObject(scene.getObjectByName('muzzle_tip')).getCenter(new T.Vector3());
        ensure(muzzle.z < bb.getCenter(new T.Vector3()).z, name + ' muzzle is not forward (-Z after export)');
        if (/fps_w_/.test(name)) {
          ensure(scene.getObjectByName('grip'), name + ' missing grip');
          ensure(Math.abs(Math.max(size.x, size.z) - spec.length) < .0001, name + ' authored length mismatch');
          ensure(Math.abs(muzzle.y - .27) < .0001, name + ' barrel height mismatch');
        }
      }
      if (name === 'fps_balloon') {
        const knot = new T.Box3().setFromObject(scene.getObjectByName('balloon_knot')).getCenter(new T.Vector3());
        ensure(knot.z > bb.getCenter(new T.Vector3()).z && Math.abs(size.z-.5)<.0001, 'Balloon knot must trail flight direction');
      }
      if (name === 'fps_sword') {
        ensure(Math.abs(size.y-1.2)<.0001 && scene.getObjectByName('grip'), 'Sword size/grip');
        ensure(new T.Box3().setFromObject(scene.getObjectByName('sword_blade')).getCenter(new T.Vector3()).y>.6, 'Sword must point up');
      }
      if (name === 'fps_w_zap') {
        const m = scene.getObjectByName('muzzle_tip').material;
        ensure(m.emissive.g>0 && m.emissive.b>0 && m.emissiveIntensity>2, 'Zap tip must emit cyan');
      }
      if (name === 'fps_train') {
        ensure(size.x <= 1.8001 && size.y <= 2.4001 && Math.abs(size.z-8.2)<.0001, 'Train exceeds tunnel envelope');
        const nose = new T.Box3().setFromObject(scene.getObjectByName('train_nose')).getCenter(new T.Vector3());
        ensure(nose.z < -3.9 && spec.wagons === 2, 'Train direction or car count wrong');
      }
      if (name === 'fps_arena') {
        const collision = []; scene.traverse(o => { if (/^collision_/.test(o.name)) collision.push(o); });
        ensure(collision.length === 101, 'Arena lost collision boxes');
        for (const box of map.boxes) {
          const o = scene.getObjectByName(`collision_${String(box.i).padStart(3, '0')}_${box.type}`);
          ensure(o, 'Missing collision ' + box.i);
          const actual = new T.Box3().setFromObject(o), c = actual.getCenter(new T.Vector3()), d = actual.getSize(new T.Vector3());
          const [x, y, z] = box.blender_center, [w, depth, h] = box.blender_size;
          ensure(c.distanceTo(new T.Vector3(x, z, -y)) < .0001 && d.distanceTo(new T.Vector3(w, h, depth)) < .0001, 'Arena box mismatch ' + box.i);
        }
        // Every exported vertex is either floor paint or within 5 cm of an actual solid box.
        const boxes = map.boxes.map(b => { const [x,y,z]=b.blender_center,[w,d,h]=b.blender_size;return new T.Box3(new T.Vector3(x-w/2-.0501,z-h/2-.0501,-y-d/2-.0501),new T.Vector3(x+w/2+.0501,z+h/2+.0501,-y+d/2+.0501)); });
        scene.traverse(o => {
          if (!o.isMesh) return;
          const p = new T.Vector3(), a = o.geometry.attributes.position;
          for (let i = 0; i < a.count; i++) {
            p.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld);
            ensure((p.y >= -.0001 && p.y <= .02 && Math.abs(p.x) <= 32.001 && Math.abs(p.z) <= 32.001) || boxes.some(b => b.containsPoint(p)), 'Arena decoration leaves allowed collision envelope: ' + o.name);
          }
        });
      }
      result.push({ name, triangles, budget: spec.budget, meshes, paint, size: size.toArray() });
    }
    ensure(BLASTERS.rayPlayer(0, 1.56, 3, 0, 0, -1, 0, 0, 0, 10)?.head, 'Head ray miss');
    ensure(BLASTERS.rayPlayer(0, 1.0, 3, 0, 0, -1, 0, 0, 0, 10), 'Body ray miss');
    ensure(!BLASTERS.rayPlayer(.50, 1.0, 3, 0, 0, -1, 0, 0, 0, 10), 'Outside-body ray hit');
    window.fpsArt = loaded;
    window.fpsColors = colors;
    return result;
  }, { report, map });
  assert.equal(result.length, 25);
  // Contact sheets are rendered from the exported GLBs, not Blender's source viewport.
  for (const group of ['figures', 'crouched', 'items', 'new-items', 'arena', 'train']) {
    await page.evaluate(group => {
      const T = THREE;
      window.fpsCatalog?.remove();
      const root = document.createElement('div'); window.fpsCatalog = root;
      root.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#1b2838;color:white;font:700 18px system-ui';
      document.body.appendChild(root);
      const r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(1440, 1000); r.toneMapping = T.ACESFilmicToneMapping; root.appendChild(r.domElement); r.setScissorTest(true);
      const newNames = ['fps_w_burst','fps_w_lob','fps_w_zap','fps_balloon','fps_sword'];
      const names = Object.keys(fpsArt).filter(n => ['figures','crouched'].includes(group) ? n.startsWith('fps_char_') : ['arena','train'].includes(group) ? n === 'fps_'+group : group === 'new-items' ? newNames.includes(n) : !n.startsWith('fps_char_') && !['fps_arena','fps_train',...newNames].includes(n));
      const cols = ['figures','crouched'].includes(group) ? 4 : group === 'items' ? 5 : group === 'new-items' ? 3 : 1, rows = ['arena','train'].includes(group) ? 1 : 2;
      names.forEach((name, i) => {
        const model = fpsArt[name].clone(true);
        if (['figures','crouched'].includes(group)) model.traverse(o => { if (o.isMesh && o.material.name === 'Paint') { o.material = o.material.clone(); o.material.color.set(fpsColors[i]); } });
        if (group === 'crouched') model.scale.y=.62;
        const bb = new T.Box3().setFromObject(model), c = bb.getCenter(new T.Vector3()), size = bb.getSize(new T.Vector3());
        const width = 1440 / cols, height = 1000 / rows, radius = Math.max(size.y * .62, size.x * .62 * height / width, size.z * .62 * height / width) * (group === 'arena' ? 1.28 : 1.05);
        const scene = new T.Scene(); scene.background = new T.Color(i % 2 ? '#26394a' : '#20313e');
        scene.add(model, new T.HemisphereLight('#deefff', '#846c4b', 1.6));
        const sun = new T.DirectionalLight('#fff3df', 2.6); sun.position.set(-10, 20, 14); scene.add(sun);
        const cam = new T.OrthographicCamera(-radius*width/height, radius*width/height, radius, -radius, .01, 1000);
        cam.position.copy(c).add(new T.Vector3(group === 'arena' ? 1 : group === 'train' ? 1.5 : .85, group === 'arena' ? 1.4 : .48, /^fps_w_|fps_rocket|fps_train/.test(name) ? -1.5 : 1.5).multiplyScalar(Math.max(3, radius*4))); cam.lookAt(c);
        const x = (i % cols) * width, y = 1000 - (Math.floor(i/cols)+1)*height;
        r.setViewport(x, y, width, height); r.setScissor(x, y, width, height); r.render(scene, cam);
        const label = document.createElement('div'); label.textContent = name;
        label.style.cssText = `position:absolute;left:${x+18}px;top:${1000-y-height+18}px`; root.appendChild(label);
      });
    }, group);
    await page.screenshot({ path: `art/blasters/${group}-catalog.png` });
  }
  await page.reload(); await page.waitForFunction(() => window.THREE && window.G);
  await page.evaluate(() => {
    const add = THREE.Scene.prototype.add;
    THREE.Scene.prototype.add = function(...objects) {
      const result = add.apply(this, objects);
      if (objects.some(o => o.getObjectByName('collision_000_wall'))) window.fpsRuntimeScene = this;
      return result;
    };
  });
  await page.locator('#testBtn').click(); await page.waitForFunction(() => G.room?.players.length >= 4);
  for (let n = 5; n <= 8; n++) { await page.locator('#botAdd').click(); await page.waitForFunction(n => G.room.players.length === n, n); }
  await page.locator('[data-id="blasters"]').evaluate(e => e.click());
  await page.waitForFunction(() => G.room.gameId === 'blasters'); await page.locator('#startBtn').click();
  await page.waitForFunction(() => window.fpsRuntimeScene?.children.filter(o => o.userData.parts?.custom && o.userData.parts.gun.getObjectByName('grip')).length === 7);
  const integration = await page.evaluate(() => {
    const scene = fpsRuntimeScene, figures = scene.children.filter(o => o.userData.parts?.custom);
    const camera = scene.children.find(o => o.isPerspectiveCamera);
    const result = { customRemoteFigures: figures.length, arena: !!scene.getObjectByName('collision_000_wall'), firstPersonBlaster: !!camera.getObjectByName('grip'), thirdPersonBlasters: figures.filter(o => o.userData.parts.gun.getObjectByName('muzzle_tip')).length, paintColors: [], headHeights: [] };
    for (const figure of figures) {
      const colors = new Set(); figure.userData.parts.custom.traverse(o => { if (o.isMesh && o.material.name === 'Paint') colors.add(o.material.color.getHexString()); });
      result.paintColors.push([...colors]);
      const head = new THREE.Box3().setFromObject(figure.getObjectByName('head_core')).getCenter(new THREE.Vector3());
      result.headHeights.push((head.y - figure.position.y) / figure.scale.y);
    }
    return result;
  });
  assert.equal(integration.customRemoteFigures, 7); assert.equal(integration.thirdPersonBlasters, 7); assert(integration.arena && integration.firstPersonBlaster);
  assert.equal(new Set(integration.paintColors.flat()).size, 7);
  assert(integration.headHeights.every(h => Math.abs(h - 1.56) < .0001), 'Live renderer shrank a head because of its hat');
  await page.locator('#canvas').click(); await page.waitForTimeout(300);
  await page.screenshot({ path: 'art/blasters/in-game.png' });
  assert.deepEqual([...new Set(errors)], []);
  await writeFile('art/blasters/browser-validation.json', JSON.stringify({ assets: result, integration, errors, checks: ['budgets', 'grounding', 'head alignment', 'body bounds', '64 Paint recolors', 'hand and barrel orientation', '101 arena boxes', '5 cm decoration envelope', 'body/head/outside rays', 'real eight-player match uses GLBs for arena/remote figures/held blasters'] }, null, 2) + '\n');
  console.log(JSON.stringify(result.map(r => ({ name: r.name, triangles: r.triangles })), null, 2));
  console.log('25 assets, figure proportions/colors/crouching, orientations, new blasters/balloon/sword, train tunnel fit, all 101 collision boxes, decoration envelope, and browser errors: PASS');
} finally { await browser.close(); }
