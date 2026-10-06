// Dev harness: N real Chromium pages (no bots) create/join a room by code and play a game with random input.
// This is the real multiplayer path. Usage: node tools/multi.js <gameId> [seconds=40] [shot seconds] [players=4] [mapId]
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const GAME = process.argv[2] || 'sumo', SECS = Number(process.argv[3] || 40), SHOTS = (process.argv[4] || '8,20,35').split(',').map(Number), N = Number(process.argv[5] || 4), MAP = process.argv[6];
const PORT = 5000 + Math.floor(Math.random() * 800), ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'shots');
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); // the window-less test browser: no Dock icon, no windows
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
  await sleep(800);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] /* real GPU: ~120 fps instead of ~6 with software rendering */ });
  const pages = [], errors = [];
  for (let i = 0; i < N; i++) {
    const page = await (await browser.newContext({ viewport: { width: 1100, height: 760 } })).newPage();
    page.on('pageerror', (e) => errors.push(`[p${i}] pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[p${i}] console: ${m.text().slice(0, 300)}`); });
    await page.goto(`http://localhost:${PORT}/${process.env.QS || ''}`); pages.push(page); // QS='?p2p=1' runs the peer-to-peer transport
  }
  await pages[0].fill('#name', 'Host'); await pages[0].evaluate(() => document.querySelector('#createBtn').click());
  await pages[0].waitForSelector('#lobby:not(.hidden)');
  const code = (await pages[0].textContent('#roomCode')).trim();
  for (let i = 1; i < N; i++) { await pages[i].fill('#name', 'P' + i); await pages[i].fill('#code', code); await pages[i].evaluate(() => document.querySelector('#joinBtn').click()); await pages[i].waitForSelector('#lobby:not(.hidden)'); }
  await pages[0].waitForFunction((n) => document.querySelectorAll('#playerList li').length >= n, N);
  await pages[0].evaluate((g) => { const el = document.querySelector(`.gcard[data-id="${g}"]`); if (el) el.click(); }, GAME); await sleep(300);
  if (process.env.MODE) { await pages[0].evaluate((m) => { const el = document.querySelector(`#modePick [data-mode="${m}"]`); if (el) el.click(); }, process.env.MODE); await sleep(300); }
  if (MAP) { await pages[0].evaluate((m) => { const el = document.querySelector(`#mapPicker [data-map="${m}"]`); if (el) el.click(); }, MAP); await sleep(300); }
  await pages[0].evaluate(() => document.querySelector('#startBtn').click());
  await Promise.all(pages.map((p) => p.waitForSelector('#game:not(.hidden)', { timeout: 8000 })));
  const keys = ['w', 'a', 's', 'd', 'w', 'w', ' ', 'f', 'j', 'k', 'q', 'e', 't', '1', '2', 'Shift', 'ArrowUp', 'ArrowLeft', 'ArrowRight'];
  const start = Date.now(); let done = false;
  const loops = pages.map(async (page) => {
    const held = new Set();
    while (!done) {
      try {
        if (await page.evaluate(() => document.querySelector('#game').classList.contains('hidden'))) { await sleep(300); continue; }
        const box = await page.locator('#canvas').boundingBox(); const r = Math.random();
        if (r < 0.38) { const k = keys[Math.floor(Math.random() * keys.length)]; if (held.has(k)) { await page.keyboard.up(k); held.delete(k); } else { await page.keyboard.down(k); held.add(k); } }
        else if (r < 0.68) await page.mouse.move(box.x + Math.random() * box.width, box.y + Math.random() * box.height, { steps: 3 });
        else if (r < 0.9) { await page.mouse.down(); await page.mouse.move(box.x + Math.random() * box.width, box.y + Math.random() * box.height, { steps: 4 }); await page.mouse.up(); }
        else { const b = page.locator('#ui button'); const n = await b.count(); if (n) await b.nth(Math.floor(Math.random() * n)).click({ timeout: 400 }).catch(() => {}); const inp = page.locator('#ui input'); if (await inp.count()) { await inp.first().fill(['cat', 'dog', 'tree', 'house', 'sun'][Math.floor(Math.random() * 5)]).catch(() => {}); await page.keyboard.press('Enter'); } }
      } catch (e) { /* busy */ }
      await sleep(70 + Math.random() * 90);
    }
    for (const k of held) await page.keyboard.up(k).catch(() => {});
  });
  for (const t of SHOTS) { const w = start + t * 1000 - Date.now(); if (w > 0) await sleep(w); await pages[0].screenshot({ path: path.join(OUT, `multi_${GAME}${MAP ? '_' + MAP : ''}_${t}s_host.png`) }).catch(() => {}); await pages[1].screenshot({ path: path.join(OUT, `multi_${GAME}${MAP ? '_' + MAP : ''}_${t}s_p1.png`) }).catch(() => {}); }
  const rem = start + SECS * 1000 - Date.now(); if (rem > 0) await sleep(rem);
  done = true; await Promise.all(loops);
  const phases = await Promise.all(pages.map((p) => p.evaluate(() => ['home', 'lobby', 'game', 'results'].find((s) => !document.querySelector('#' + s).classList.contains('hidden')))));
  const uniq = [...new Set(errors)];
  console.log(`multi game=${GAME}${MAP ? ' map=' + MAP : ''} players=${N} phases=${phases.join(',')} errors=${uniq.length}`); for (const e of uniq.slice(0, 12)) console.log('  ' + e);
  if (/Error|\[bot\]|\[tick\]|\[input\]|\[socket\]|\[timer\]|\[start\]/.test(log)) console.log('SERVER: ' + log.slice(0, 1500));
  await browser.close(); srv.kill();
})().catch((e) => { console.error(e); process.exit(1); });
