// Dev check for Toy Box Blasters: a real browser aims at the nearest bot and fires; the server must confirm damage.
const { chromium } = require('playwright-core'); const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const PORT = 6900 + Math.floor(Math.random() * 90);
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); // the window-less test browser: no Dock icon, no windows
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] }); let log = ''; srv.stderr.on('data', (d) => (log += d));
  await sleep(800);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] /* real GPU: ~120 fps instead of ~6 with software rendering */ });
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 700 } })).newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(`http://localhost:${PORT}/?bltest=1`); await page.fill('#name', 'Tester'); await page.click('#testBtn');
  await page.waitForSelector('#lobby:not(.hidden)'); await page.waitForFunction(() => document.querySelectorAll('#playerList li').length >= 4);
  await page.evaluate(() => document.querySelector('.gcard[data-id="blasters"]').click()); await sleep(300);
  await page.evaluate(() => document.querySelector('#startBtn').click()); await page.waitForSelector('#game:not(.hidden)'); await sleep(2000);
  await page.evaluate(() => { window.__ev = {}; window.__mine = 0; window.G.socket.on('g:event', (e) => { window.__ev[e.type] = (window.__ev[e.type] || 0) + 1; if (e.type === 'shot' && e.id === window.G.me) window.__mine++; }); });
  const box = await page.locator('#canvas').boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await sleep(700);
  // Snap the crosshair onto the chest of a visible figure, fire once, and see whether the server confirms it.
  const t0 = Date.now(); let shots = 0;
  while (Date.now() - t0 < 40000 && shots < 40) {
    const dist = await page.evaluate(() => (window.__blAim ? window.__blAim() : false));
    if (dist === false || dist > 45) { await sleep(150); continue; }
    await page.mouse.down(); await sleep(40); await page.mouse.up(); shots++; await sleep(260);
  }
  await sleep(500);
  const ev = await page.evaluate(() => window.__ev), hits = ev.dmg || 0; const clicks = shots; shots = await page.evaluate(() => window.__mine); const rate = shots ? hits / shots : 0; // only darts the server actually fired count (clicks during a reload do not)
  const st = await page.evaluate(() => window.G.room.phase);
  console.log(`${clicks} clicks, ${shots} darts fired at visible, unprotected figures in ${((Date.now() - t0) / 1000).toFixed(0)}s; server confirmed ${hits} hits (${Math.round(rate * 100)}%)`);
  const pass = shots >= 10 && rate >= 0.7;
  console.log(pass ? 'ok   aimed shots land' : 'FAIL aimed shots are not landing reliably');
  const uniq = [...new Set(errors)]; console.log('errors=' + uniq.length, 'phase=' + st); for (const e of uniq.slice(0, 8)) console.log('  ' + e);
  if (log) console.log('SERVER: ' + log.slice(0, 1000));
  await browser.close(); srv.kill(); process.exit(pass && !uniq.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
