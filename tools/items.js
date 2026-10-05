// Dev harness: in Test mode, cycles through every Meme Karts item with ] and fires it, saving one screenshot per item
// to tools/shots/item_<n>.png. Usage: node tools/items.js [mapId]
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
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
  const errors = []; page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(`http://localhost:${PORT}/${process.env.QS || ''}`); // QS='?bloom=1' forces bloom on in slow headless runs
  await page.fill('#name', 'Tester'); await page.click('#testBtn');
  await page.waitForSelector('#lobby:not(.hidden)');
  await page.waitForFunction(() => document.querySelectorAll('#playerList li').length >= 4);
  await page.evaluate(() => { const el = document.querySelector('.gcard[data-id="memekarts"]'); if (el) el.click(); }); await sleep(300);
  if (process.argv[2]) { await page.evaluate((m) => { const el = document.querySelector(`[data-map="${m}"]`); if (el) el.click(); }, process.argv[2]); await sleep(300); }
  await page.evaluate(() => document.querySelector('#startBtn').click());
  await page.waitForSelector('#game:not(.hidden)');
  await sleep(4000);
  await page.keyboard.down('w');
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press(']'); await sleep(250);
    const name = await page.evaluate(() => document.querySelector('#toast').textContent);
    await page.screenshot({ path: path.join(OUT, `item_${String(i).padStart(2, '0')}.png`) }); // taken while holding it, so the top card is visible
    await page.keyboard.press(' '); await sleep(i === 11 ? 300 : 650);
    console.log(i, name);
    if (i % 4 === 3) { await page.keyboard.down('a'); await sleep(700); await page.keyboard.up('a'); }
    await sleep(900);
  }
  await page.keyboard.up('w');
  await page.keyboard.press('h'); await sleep(500); await page.screenshot({ path: path.join(OUT, 'item_guide.png') }); await page.keyboard.press('h');
  const uniq = [...new Set(errors)]; console.log(`errors=${uniq.length}`); for (const e of uniq.slice(0, 10)) console.log('  ' + e);
  if (/Error|\[bot\]|\[tick\]|\[input\]/.test(log)) console.log('SERVER: ' + log.slice(0, 1200));
  await browser.close(); srv.kill();
})().catch((e) => { console.error(e); process.exit(1); });
