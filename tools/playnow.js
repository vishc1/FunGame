// Dev check: the home page "Play now" button should drop you straight into a Meme Karts race with bots.
const { chromium } = require('playwright-core'); const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const PORT = 5900 + Math.floor(Math.random() * 90), OUT = path.join(__dirname, 'shots');
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); // the window-less test browser: no Dock icon, no windows
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] }); let log = ''; srv.stderr.on('data', (d) => (log += d));
  await sleep(800);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] /* real GPU: ~120 fps instead of ~6 with software rendering */ });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(`http://localhost:${PORT}/`); await sleep(1500);
  await page.screenshot({ path: path.join(OUT, 'home_full.png'), fullPage: true });
  await page.fill('#name', 'Solo'); await page.click('#soloBtn');
  await page.waitForSelector('#game:not(.hidden)', { timeout: 8000 });
  await page.keyboard.down('w'); await sleep(9000); await page.keyboard.press(' ');
  await page.screenshot({ path: path.join(OUT, 'playnow_9s.png') });
  const info = await page.evaluate(() => ({ players: window.G.room.players.length, bots: window.G.room.players.filter((p) => p.bot).length, game: window.G.room.gameId, phase: window.G.room.phase, endLabel: document.querySelector('#endBtn').textContent, local: window.G.socket.local === true }));
  if (!info.local) errors.push('Play now should run inside the browser (socket.local), not on a server');
  console.log('play now ->', JSON.stringify(info), 'errors=' + errors.length); for (const e of errors.slice(0, 8)) console.log('  ' + e);
  if (log) console.log('SERVER: ' + log.slice(0, 800));
  await browser.close(); srv.kill();
})().catch((e) => { console.error(e); process.exit(1); });
