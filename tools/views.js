// Dev tool: photographs every map of both games from fixed cameras (a high overview from two corners and a low ground view)
// so a person can look for things that do not line up. Saves tools/shots/view_<game>_<map>_<n>.png. Starts its own server.
const { chromium } = require('playwright-core'); const { spawn } = require('child_process'); const PORT = 9500 + Math.floor(Math.random() * 200); const path = require('path'), fs = require('fs'), os = require('os');
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KMAPS = require('../public/memekarts-maps.js'), BL = require('../public/games/blasters.shared.js'), KM = KMAPS.map((m) => m.id), BM = BL.MAPS.map((m) => m.id);
(async () => {
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] }); await sleep(900);
  const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }); const errs = [];
  for (const [game, maps] of [['memekarts', KM], ['blasters', BM]]) for (const map of maps) {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 760 } })).newPage(); p.on('pageerror', (e) => errs.push(map + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(map + ': ' + m.text().slice(0, 120)); });
    await p.goto(`http://localhost:${PORT}/?game=${game}&bltest=1&gfx=high`); await p.fill('#name', 'V'); await p.click('#createBtn'); await p.waitForSelector('#lobby:not(.hidden)');
    await p.evaluate((m) => document.querySelector(`#mapPicker [data-map="${m}"]`).click(), map); await sleep(200); await p.evaluate(() => document.querySelector('#botAdd').click()); await sleep(200);
    await p.evaluate(() => document.querySelector('#startBtn').click()); await p.waitForSelector('#game:not(.hidden)'); await sleep(4000);
    const S = game === 'memekarts' ? KMAPS.find((m) => m.id === map).w / 2 : BL.mapById(map).size; /* frame each map by its own size */
    const cams = game === 'memekarts' ? [[[-S * 1.05, 900, -S * 0.75], [0, 0, 0]], [[S * 1.05, 700, S * 0.75], [0, 0, 0]], [[-S * 0.55, 90, S * 0.15], [S * 0.2, 30, -S * 0.1]]]
      : [[[-S * 1.2, 40, -S * 1.2], [0, 0, 0]], [[S * 1.2, 30, S * 1.1], [0, 0, 0]], [[-S * 0.75, 2.2, S * 0.3], [S * 0.3, 2, -S * 0.2]]];
    for (let i = 0; i < cams.length; i++) { await p.evaluate((c) => { window.__camOverride = { p: c[0], l: c[1] }; }, cams[i]); await sleep(700); await p.screenshot({ path: path.join(__dirname, 'shots', `view_${game}_${map}_${i}.png`) }); }
    await p.context().close();
  }
  console.log('views saved; page errors', errs.length, errs.slice(0, 3).join(' | ')); await b.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.error('TEST CRASHED:', e.message.split('\n')[0]); process.exit(1); });
