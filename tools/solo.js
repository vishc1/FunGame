// Dev harness: one real Chromium page uses Test mode (bots) to play a game solo with random input.
// Usage: node tools/solo.js <gameId> [seconds=30] [screenshot seconds e.g. 5,15,25]
// Prints console/page errors and saves screenshots to tools/shots/.
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const GAME = process.argv[2] || 'sumo', SECS = Number(process.argv[3] || 30), SHOTS = (process.argv[4] || '5,15,25').split(',').map(Number);
const PORT = 4100 + Math.floor(Math.random() * 800), ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'shots');
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); // the window-less test browser: no Dock icon, no windows
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
  await sleep(800);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] /* real GPU: ~120 fps instead of ~6 with software rendering */ });
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(`http://localhost:${PORT}/${process.env.QS || ''}`); // QS='?bloom=1' forces bloom on in slow headless runs
  await page.fill('#name', 'Tester');
  await page.screenshot({ path: path.join(OUT, `home.png`) });
  await page.click('#testBtn');
  await page.waitForSelector('#lobby:not(.hidden)');
  await page.waitForFunction(() => document.querySelectorAll('#playerList li').length >= 4);
  // pick the game without depending on the lobby layout (the card may be hidden by a redesigned lobby)
  await page.evaluate((g) => { const el = document.querySelector(`.gcard[data-id="${g}"]`); if (el) el.click(); }, GAME); await sleep(300);
  await page.screenshot({ path: path.join(OUT, `lobby.png`) });
  if (process.env.MAP) { await page.evaluate((m) => { const el = document.querySelector(`#mapPicker [data-map="${m}"]`); if (el) el.click(); }, process.env.MAP); await sleep(300); }
  await page.evaluate(() => document.querySelector('#startBtn').click());
  await page.waitForSelector('#game:not(.hidden)');
  const keys = ['w', 'a', 'd', 'w', 'w', ' ', 's', 'j', 'k', 'q', 'e', 'Shift'];
  const start = Date.now(); let done = false; const held = new Set();
  const loop = (async () => {
    while (!done) {
      try {
        if (await page.evaluate(() => document.querySelector('#game').classList.contains('hidden'))) { await sleep(300); continue; }
        const box = await page.locator('#canvas').boundingBox(); const r = Math.random();
        if (r < 0.4) { const k = keys[Math.floor(Math.random() * keys.length)]; if (held.has(k)) { await page.keyboard.up(k); held.delete(k); } else { await page.keyboard.down(k); held.add(k); } }
        else if (r < 0.7) await page.mouse.move(box.x + Math.random() * box.width, box.y + Math.random() * box.height, { steps: 3 });
        else if (r < 0.9) { await page.mouse.down(); await page.mouse.move(box.x + Math.random() * box.width, box.y + Math.random() * box.height, { steps: 4 }); await page.mouse.up(); }
        else { const b = page.locator('#ui button'); const n = await b.count(); if (n) await b.nth(Math.floor(Math.random() * n)).click({ timeout: 400 }).catch(() => {}); const i = page.locator('#ui input'); if (await i.count()) { await i.first().fill('cat').catch(() => {}); await page.keyboard.press('Enter'); } }
      } catch (e) { /* busy */ }
      await sleep(70 + Math.random() * 80);
    }
  })();
  for (const t of SHOTS) { const w = start + t * 1000 - Date.now(); if (w > 0) await sleep(w); await page.screenshot({ path: path.join(OUT, `${GAME}${process.env.MAP ? '_' + process.env.MAP : ''}_${t}s.png`) }).catch(() => {}); }
  const rem = start + SECS * 1000 - Date.now(); if (rem > 0) await sleep(rem);
  done = true; await loop;
  const phase = await page.evaluate(() => ['home', 'lobby', 'game', 'results'].find((s) => !document.querySelector('#' + s).classList.contains('hidden')));
  const uniq = [...new Set(errors)];
  console.log(`game=${GAME} phase_at_end=${phase} errors=${uniq.length}`); for (const e of uniq.slice(0, 12)) console.log('  ' + e);
  if (/Error|\[bot\]|\[tick\]|\[input\]/.test(log)) console.log('SERVER: ' + log.slice(0, 1500));
  await browser.close(); srv.kill();
})().catch((e) => { console.error(e); process.exit(1); });
