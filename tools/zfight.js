// Dev check: z-fighting in what is actually drawn. Loads every map of both games, walks the rendered scene, and reports
// pairs of axis-aligned boxes/planes (and the deck/tower models) whose faces lie in the same plane, facing the same way, with
// overlapping area: that is what shimmers. Usage: node tools/zfight.js
const { chromium } = require('playwright-core'); const { spawn } = require('child_process'); const path = require('path'), fs = require('fs'), os = require('os');
const PORT = 9700 + Math.floor(Math.random() * 200), BASE = `http://localhost:${PORT}`;
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const JOBS = [['memekarts', 'stadium', 0.05], ['memekarts', 'neon', 0.05], ['memekarts', 'canyon', 0.05], ['blasters', 'fort', 0.004], ['blasters', 'towers', 0.004], ['blasters', 'cove', 0.004]];
(async () => {
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] }); await sleep(900);
  const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }); let total = 0;
  for (const [game, map, eps] of JOBS) {
    const page = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
    await page.goto(`${BASE}/?game=${game}&bltest=1`); await page.fill('#name', 'Z'); await page.click('#createBtn'); await page.waitForSelector('#lobby:not(.hidden)', { timeout: 20000 });
    await page.evaluate((m) => document.querySelector(`#mapPicker [data-map="${m}"]`).click(), map); await sleep(300); await page.evaluate(() => document.querySelector('#botAdd').click()); await sleep(300);
    await page.evaluate(() => document.querySelector('#startBtn').click()); await page.waitForSelector('#game:not(.hidden)', { timeout: 20000 }); await sleep(4500);
    const found = await page.evaluate((eps) => {
      const T = window.THREE, scene = window.__fgScene, items = [], v = new T.Vector3();
      const aligned = (o) => { const e = o.matrixWorld.elements; const ax = [[e[0], e[1], e[2]], [e[4], e[5], e[6]], [e[8], e[9], e[10]]]; return ax.every((a) => { const l = Math.hypot(...a) || 1; return a.filter((c) => Math.abs(c / l) > 1e-3).length === 1; }); };
      scene.updateMatrixWorld(true);
      scene.traverse((o) => { if (!o.isMesh || !o.visible || o.isInstancedMesh) return; let p = o; while (p) { if (!p.visible) return; p = p.parent; }
        const t = o.geometry && o.geometry.type; const deckModel = (() => { let p = o; while (p) { if (p.name === 'deck') return p; p = p.parent; } return null; })();
        if (!(t === 'BoxGeometry' || t === 'PlaneGeometry' || deckModel) || !aligned(o) || (o.material && o.material.depthWrite === false && o.material.transparent)) return;
        const bb = new T.Box3().setFromObject(o); items.push({ bb, name: (deckModel ? 'model ' + deckModel.uuid.slice(0, 4) : t) + ' @' + bb.getCenter(v).toArray().map((x) => x.toFixed(1)).join(','), group: deckModel ? deckModel.uuid : o.uuid, plane: t === 'PlaneGeometry', pn: t === 'PlaneGeometry' ? new T.Vector3(0, 0, 1).transformDirection(o.matrixWorld).toArray() : null }); });
      const out = []; const D = ['x', 'y', 'z'];
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) { const a = items[i], c = items[j]; if (a.group === c.group) continue;
        for (let k = 0; k < 3; k++) { const d = D[k], o1 = D[(k + 1) % 3], o2 = D[(k + 2) % 3];
          const ov = (q) => Math.min(a.bb.max[q], c.bb.max[q]) - Math.max(a.bb.min[q], c.bb.min[q]);
          if (ov(o1) <= eps * 20 || ov(o2) <= eps * 20) continue;
          const flat = (q) => !q.plane && q.bb.max[d] - q.bb.min[d] < eps; /* a flat face inside a model: which way it points is unknown, skip */
          /* two bottoms resting on the same floor point down and are never seen; two tops, or two side faces, are */
          const same = !a.plane && !c.plane && !flat(a) && !flat(c) && (Math.abs(a.bb.max[d] - c.bb.max[d]) < eps || (d !== 'y' && Math.abs(a.bb.min[d] - c.bb.min[d]) < eps));
          /* a plane fights a box face only when that face points the same way as the plane (a box standing on the floor shows its top, not its bottom, to the camera) */
          const pf = (P, Bx) => { if (!P.plane || Bx.plane) return false; const n = P.pn[k]; if (Math.abs(n) < 0.9) return false; const at = P.bb.min[d]; return n > 0 ? Math.abs(Bx.bb.max[d] - at) < eps : Math.abs(Bx.bb.min[d] - at) < eps; };
          const pp = a.plane && c.plane && Math.abs(a.bb.min[d] - c.bb.min[d]) < eps && Math.abs(a.pn[k]) > 0.9 && Math.abs(c.pn[k]) > 0.9;
          const planeOn = pf(a, c) || pf(c, a) || pp;
          if (same || planeOn) { out.push(`${d}: ${a.name} [${a.bb.min[d].toFixed(2)}..${a.bb.max[d].toFixed(2)}]  <->  ${c.name} [${c.bb.min[d].toFixed(2)}..${c.bb.max[d].toFixed(2)}]`); break; } } }
      return { n: items.length, out };
    }, eps);
    total += found.out.length; console.log(`${game}/${map}: ${found.n} surfaces checked, ${found.out.length} flush pairs`); for (const l of found.out.slice(0, 12)) console.log('   ' + l);
    await page.context().close();
  }
  console.log(total ? `\n${total} flush pairs to fix` : '\nno z-fighting surfaces in any map'); await b.close(); srv.kill(); process.exit(total ? 1 : 0);
})().catch((e) => { console.error('TEST CRASHED:', e.message.split('\n')[0]); process.exit(1); });
