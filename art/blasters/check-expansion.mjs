// Exercise the existing game renderer through its locker UI; never patch game logic.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3000');
  await page.waitForFunction(() => window.THREE && window.G);
  await page.evaluate(() => {
    const add = THREE.Scene.prototype.add;
    THREE.Scene.prototype.add = function(...objects) {
      const result = add.apply(this, objects);
      if (objects.some(o => o.getObjectByName('collision_000_wall'))) window.artScene = this;
      return result;
    };
    window.trainSamples = [];
    function sample() {
      const nose = window.artScene?.getObjectByName('train_nose');
      if (nose) {
        let root = nose; while (root.parent !== artScene) root = root.parent;
        if (root.visible) {
          const bb = new THREE.Box3().setFromObject(root);
          const nc = new THREE.Box3().setFromObject(nose).getCenter(new THREE.Vector3());
          trainSamples.push({ x: root.position.x, noseX: nc.x, centerX: bb.getCenter(new THREE.Vector3()).x, centerZ: bb.getCenter(new THREE.Vector3()).z, direction: Math.cos(root.rotation.y), size: bb.getSize(new THREE.Vector3()).toArray(), floor: bb.min.y });
        }
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await page.locator('#testBtn').click();
  await page.waitForFunction(() => G.room?.players.length >= 4);
  await page.locator('[data-id="blasters"]').evaluate(e => e.click());
  await page.waitForFunction(() => G.room.gameId === 'blasters');
  await page.locator('#startBtn').click();
  await page.waitForFunction(() => window.artScene?.getObjectByName('train_nose'));
  await page.keyboard.press('l');
  await page.waitForSelector('[data-skin="8"]');
  const skins = await page.evaluate(async () => {
    const ensure = (ok, msg) => { if (!ok) throw Error(msg); };
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const values = m => ({ color: m.color.getHexString(), emissive: m.emissive.getHexString(), intensity: m.emissiveIntensity, opacity: m.opacity, roughness: m.roughness, metalness: m.metalness, transparent: m.transparent });
    const names = ['Classic','Pastel','Midnight','Chrome','Neon','Ice','Gold','Lava','Rainbow'];
    const result = []; window.skinModels = [];
    for (let ch = 0; ch < 8; ch++) {
      document.querySelector(`[data-fig="${ch}"]`).click();
      let fixed = null;
      for (let sk = 0; sk < 9; sk++) {
        document.querySelector(`[data-skin="${sk}"]`).click(); await frame();
        const fig = artScene.children.find(o => o.userData.parts?.custom && o.userData.label.visible === false && o.userData.sk === sk);
        ensure(fig, `Missing locker preview ${ch}/${sk}`);
        const mats = new Map();
        fig.userData.parts.custom.traverse(o => { if (o.isMesh) mats.set(o.material.name, o.material); });
        ensure(mats.has('Paint') && fig.userData.paint.every(m => m.name === 'Paint'), 'Skin targets non-Paint material');
        const unpainted = JSON.stringify([...mats].filter(([n]) => n !== 'Paint').map(([n,m]) => [n,values(m)]).sort());
        if (sk === 0) fixed = unpainted;
        ensure(unpainted === fixed, `Skin changed fixed accents ${ch}/${sk}`);
        const m = mats.get('Paint'), before = values(m);
        ensure(Math.abs(m.roughness - [.45,.6,.35,.12,.45,.04,.24,.6,.35][sk]) < .00001, 'Wrong finish roughness');
        if (sk === 5) ensure(m.transparent && m.opacity === .72, 'Ice not translucent');
        if (sk === 3 || sk === 6) ensure(m.metalness >= .8, 'Metal skin not metallic');
        if (sk === 4) ensure(m.emissiveIntensity === 1.5, 'Neon not emissive');
        let animated = null;
        if (sk >= 7) {
          await new Promise(r => setTimeout(r, 180));
          animated = JSON.stringify(before) !== JSON.stringify(values(m));
          ensure(animated, `Animated finish frozen ${ch}/${sk}`);
        }
        if (ch === 0) {
          const clone = fig.userData.parts.custom.clone(true);
          clone.traverse(o => { if (o.isMesh) o.material = o.material.clone(); });
          window.skinModels.push(clone);
        }
        result.push({ figure: ch, skin: names[sk], paint: values(m), accentsUnchanged: true, animated });
      }
    }
    return result;
  });
  assert.equal(skins.length, 72);
  await page.waitForFunction(() => trainSamples.length > 10 && Math.abs(trainSamples.at(-1).x-trainSamples[0].x) > 50, null, { timeout: 45000 });
  const train = await page.evaluate(() => ({ samples: trainSamples.length, first: trainSamples[0], tunnel: trainSamples.find(s => Math.abs(s.centerX)<1), last: trainSamples.at(-1) }));
  assert(train.tunnel, 'Train was not observed traversing the tower tunnel');
  for (const s of [train.first, train.last]) {
    assert(Math.abs(s.size[0]-8.2)<.001 && s.size[1]<=2.4 && s.size[2]<=1.8, 'Live train fit');
    assert(Math.abs(s.floor)<.001 && Math.abs(s.centerZ)<.001 && (s.noseX-s.centerX)*s.direction>3.9, 'Train ground/track/direction');
  }
  // Contact sheet uses clones of the actual game's nine rendered finishes.
  await page.evaluate(() => {
    const names = ['Classic','Pastel','Midnight','Chrome','Neon','Ice','Gold','Lava','Rainbow'];
    const root = document.createElement('div'); root.style.cssText = 'position:fixed;inset:0;z-index:99999;color:white;font:700 18px system-ui'; document.body.appendChild(root);
    const r = new THREE.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true }); r.setSize(1440,1000); r.toneMapping=THREE.ACESFilmicToneMapping; r.setScissorTest(true); root.appendChild(r.domElement);
    skinModels.forEach((model,i) => {
      const scene = new THREE.Scene(); scene.background = new THREE.Color(i%2?'#26394a':'#20313e');
      scene.add(model,new THREE.HemisphereLight('#deefff','#846c4b',1.6));
      const sun=new THREE.DirectionalLight('#fff3df',2.6); sun.position.set(-10,20,14); scene.add(sun);
      const cam=new THREE.OrthographicCamera(-1.8,1.8,1.25,-1.25,.01,100); cam.position.set(3,2.5,-6); cam.lookAt(0,1.05,0);
      const x=i%3*480,y=1000-(Math.floor(i/3)+1)*1000/3;
      r.setViewport(x,y,480,1000/3); r.setScissor(x,y,480,1000/3); r.render(scene,cam);
      const label=document.createElement('div'); label.textContent=names[i]; label.style.cssText=`position:absolute;left:${x+18}px;top:${Math.floor(i/3)*1000/3+12}px`; root.appendChild(label);
    });
  });
  await page.screenshot({ path: 'art/blasters/skins-catalog.png' });
  assert.deepEqual([...new Set(errors)], []);
  await writeFile('art/blasters/expansion-validation.json', JSON.stringify({ skins, train, errors },null,2)+'\n');
  console.log('PASS: 72 figure/skin combinations, 16 animated finishes, unchanged accents, custom train moving nose-first on track, zero browser errors');
} finally { await browser.close(); }
