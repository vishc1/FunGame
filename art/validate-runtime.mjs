// Read-only browser checks for the Blender exports; no game source is changed.
import { launchArtBrowser } from './browser.mjs';
import { readFile, writeFile } from 'node:fs/promises';
const browser = await launchArtBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3000');
  await page.waitForFunction(() => window.THREE && window.GLTFLoader);
  const assets = await page.evaluate(async () => {
    const T = window.THREE, files = await (await fetch('/models/list')).json();
    const result = [];
    for (const file of files.filter(f=>!/^fps_/i.test(f))) {
      const { scene } = await new window.GLTFLoader().loadAsync('/models/' + file);
      const bb = new T.Box3().setFromObject(scene), size = bb.getSize(new T.Vector3());
      const wheels = [], materials = new Set(); let triangles = 0, multiMaterial = 0;
      scene.traverse(o => {
        if (/^wheel/i.test(o.name)) {
          const b = new T.Box3().setFromObject(o), c = b.getCenter(new T.Vector3()), p = o.getWorldPosition(new T.Vector3());
          wheels.push({ name: o.name, centerError: c.distanceTo(p), position: p.toArray(), quaternion: o.quaternion.toArray() });
        }
        if (!o.isMesh) return;
        triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
        if (Array.isArray(o.material)) multiMaterial++;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m.name);
      });
      result.push({ file, size: size.toArray(), min: bb.min.toArray(), max: bb.max.toArray(), triangles, wheels, materials: [...materials], multiMaterial });
    }
    const original = T.Scene.prototype.add;
    T.Scene.prototype.add = function (...objects) { window.__assetTestScene = this; return original.apply(this, objects); };
    return result;
  });
  await page.locator('#name').fill('Asset check');
  await page.locator('#testBtn').click();
  await page.waitForFunction(() => document.querySelectorAll('#playerList li').length === 4);
  for (let count = 5; count <= 8; count++) {
    await page.locator('#botAdd').click();
    await page.waitForFunction(n => document.querySelectorAll('#playerList li').length === n, count);
  }
  await page.locator('#gameSwitch [data-game="memekarts"]').click();
  await page.locator('#startBtn').click();
  await page.waitForTimeout(6000);
  await page.keyboard.down('w');
  await page.waitForTimeout(800);
  await page.keyboard.up('w');
  const gameplay = await page.evaluate(() => {
    const s = window.__assetTestScene, karts = [];
    if (!s) return { error: 'No rendered scene captured' };
    s.traverse(o => {
      if (!o.userData.glbWheels) return;
      const custom = o.userData.body.children.find(c => c.userData.glb);
      const clone = custom.clone(true);
      clone.traverse(o => { if (/^wheel/i.test(o.name)) o.rotation.set(0, 0, 0); });
      clone.updateMatrixWorld(true);
      const bb = new window.THREE.Box3().setFromObject(clone, true), size = bb.getSize(new window.THREE.Vector3());
      const paint = [];
      custom.traverse(m => { if (m.isMesh && m.material.name === 'Paint') paint.push(m.material.color.getHexString()); });
      karts.push({ size: size.toArray(), floor: bb.min.y, paint: [...new Set(paint)], wheels: o.userData.glbWheels.map(w => ({ name: w.name, angle: w.rotation.z })) });
    });
    return { karts, sceneObjects: s.children.length };
  });
  await page.screenshot({ path: 'art/runtime-game.png' });
  const brief = await readFile('3d.md', 'utf8');
  const required = [...brief.matchAll(/\| `([^`]+\.glb)` \|[^\n]+\| ([\d,]+) \|/g)].map(m => ({ file: m[1], budget: Number(m[2].replaceAll(',', '')) }));
  const validation = [];
  for (const a of assets) {
    const spec = required.find(r => r.file === a.file);
    if (spec && a.triangles > spec.budget) validation.push(`${a.file}: triangle budget exceeded`);
    if (a.multiMaterial) validation.push(`${a.file}: incompatible multi-material mesh`);
    if (a.file !== 'arena.glb' && Math.abs(a.min[1]) > 1e-5) validation.push(`${a.file}: not grounded`);
    if (/^kart_[0-7]\.glb$/.test(a.file)) {
      if (!a.materials.includes('Paint')) validation.push(`${a.file}: Paint missing`);
      if (a.file !== 'kart_3.glb' && a.size[1] * 3.6 / Math.max(a.size[0], a.size[2]) >= 3) validation.push(`${a.file}: fitted height exceeds 3 m`);
      if (a.file !== 'kart_7.glb' && a.wheels.map(w => w.name).sort().join(',') !== 'wheel_fl,wheel_fr,wheel_rl,wheel_rr') validation.push(`${a.file}: wheel names/count incorrect`);
      if (a.wheels.some(w => w.centerError > 1e-5)) validation.push(`${a.file}: off-center wheel origin`);
    }
  }
  if (process.argv.includes('--complete')) {
    for (const r of required) if (!assets.some(a => a.file === r.file)) validation.push(`${r.file}: missing`);
    if (gameplay.karts?.length !== 8) validation.push('Not all eight custom karts appeared in game');
  }
  const report = { assets, gameplay, validation, errors: [...new Set(errors)] };
  await writeFile('art/runtime-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ files: assets.length, triangles: assets.reduce((n, a) => n + a.triangles, 0), gameplay, validation, errors: report.errors }, null, 2));
  if (errors.length || validation.length || !assets.length || gameplay.error) process.exitCode = 1;
} finally { await browser.close(); }
