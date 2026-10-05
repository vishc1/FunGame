// Dev check: drive a kart up a ramp in a real browser. Confirms it climbs onto the deck and comes back down, and saves
// pictures of the approach, the climb, the deck and the drop to tools/shots/ramp_<map>_*.png. Usage: node tools/kart-ramp.js [mapId=stadium] [rampIndex=0]
const { chromium } = require('playwright-core'); const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const MAP = process.argv[2] || 'stadium', RI = Number(process.argv[3] || 0);
const PORT = 7900 + Math.floor(Math.random() * 90), OUT = path.join(__dirname, 'shots');
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); // the window-less test browser: no Dock icon, no windows
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] }); let log = ''; srv.stderr.on('data', (d) => (log += d));
  await sleep(800);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 760 } })).newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/`); await page.fill('#name', 'Ramp'); await page.click('#testBtn'); await page.waitForSelector('#lobby:not(.hidden)');
  await page.evaluate((m) => { const el = document.querySelector(`#mapPicker [data-map="${m}"]`); if (el) el.click(); }, MAP); await sleep(300);
  await page.evaluate(() => { document.querySelector('#botClear').click(); }); await sleep(200); await page.evaluate(() => document.querySelector('#botAdd').click()); await sleep(300);
  await page.evaluate(() => document.querySelector('#startBtn').click()); await page.waitForSelector('#game:not(.hidden)'); await sleep(2500);
  await page.evaluate(() => { window.__k = null; window.__launch = 0; window.G.socket.on('g:state', (s) => { window.__k = s.karts.find((k) => k.id === window.G.me); }); window.G.socket.on('g:event', (e) => { if (e.type === 'launch' && e.id === window.G.me) window.__launch++; }); });
  const rp = await page.evaluate(([m, i]) => window.MEMEKARTS_MAPS.find((q) => q.id === m).ramps[i], [MAP, RI]);
  const d = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[rp.dir], cx = rp.x + rp.w / 2, cy = rp.y + rp.h / 2, a = Math.atan2(d[1], d[0]);
  await page.evaluate((m) => window.G.send(m), { type: 'tp', x: cx - d[0] * 108, y: cy - d[1] * 108, a }); await sleep(4400); // just in front of the bottom of the ramp; wait out the flicker of spawn protection
  await page.screenshot({ path: path.join(OUT, `ramp_${MAP}_1_approach.png`) });
  await page.keyboard.down('w'); let top = 0, shotOn = false, shotTop = false, down = false;
  for (let i = 0; i < 140; i++) { await sleep(40); const k = await page.evaluate(() => window.__k); if (!k) continue; top = Math.max(top, k.el);
    if (!shotOn && k.el > 12) { await page.screenshot({ path: path.join(OUT, `ramp_${MAP}_2_climbing.png`) }); shotOn = true; }
    if (!shotTop && k.el >= 32) { await sleep(120); await page.screenshot({ path: path.join(OUT, `ramp_${MAP}_3_on_deck.png`) }); shotTop = true; }
    if (shotTop && k.el === 0) { down = true; await page.screenshot({ path: path.join(OUT, `ramp_${MAP}_4_back_down.png`) }); break; } }
  await page.keyboard.up('w');
  console.log(`${MAP} ramp ${RI} (${rp.dir}): climbed to height ${top} of 32, ${down ? 'then came back down to the floor' : 'never came back down'}; page errors ${errors.length}`);
  const launches = top >= 32 && down ? 1 : 0;
  if (log) console.log('SERVER: ' + log.slice(0, 500));
  await browser.close(); srv.kill(); process.exit(launches > 0 && !errors.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
