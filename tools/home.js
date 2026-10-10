// Dev check: the home page shows both primary games; each tab's Play now / Play with friends starts the right game;
// the lobby's two-game switch works. Screenshots in tools/shots/home_*.png. Usage: node tools/home.js
const { chromium } = require('playwright-core'); const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const PORT = 7200 + Math.floor(Math.random() * 300), OUT = path.join(__dirname, 'shots');
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); // the window-less test browser: no Dock icon, no windows
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? '  ' + x : ''}`); };
(async () => {
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] }); let log = ''; srv.stderr.on('data', (d) => (log += d));
  await sleep(800);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] /* real GPU: ~120 fps instead of ~6 with software rendering */ });
  const errors = [];
  const open = async (w = 1280, h = 860) => { const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage(); page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); }); await page.goto(`http://localhost:${PORT}/`); await sleep(1800); return page; };
  const room = (p) => p.evaluate(() => (window.G.room ? { game: window.G.room.gameId, phase: window.G.room.phase, n: window.G.room.players.length, bots: window.G.room.players.filter((q) => q.bot).length } : null));

  let page = await open();
  check('both games are on the home page', (await page.locator('#gamePick [data-game]').count()) === 2 && await page.locator('#gamePick [data-game="blasters"]').isVisible());
  check('Meme Karts is selected by default, with all five arenas', (await page.evaluate(() => window.selectedGame)) === 'memekarts' && (await page.locator('#homeMaps .map-card').count()) === 5 && await page.locator('#arenas').isVisible());
  await page.screenshot({ path: path.join(OUT, 'home_karts.png') });
  await page.click('#gamePick [data-game="blasters"]'); await sleep(1500);
  check('clicking Toy Box Blasters switches the hero', (await page.textContent('#heroTitle')).includes('BLASTERS') && await page.locator('#toybox').isVisible() && !(await page.locator('#arenas').isVisible()));
  await page.screenshot({ path: path.join(OUT, 'home_blasters.png'), fullPage: true });
  await page.fill('#name', 'Solo'); await page.click('#soloBtn'); await page.waitForSelector('#game:not(.hidden)', { timeout: 8000 }); await sleep(600);
  let r = await room(page); check('Play now on the Blasters tab starts Toy Box Blasters with bots', r.game === 'blasters' && r.phase === 'playing' && r.bots === 5, JSON.stringify(r));
  await page.reload(); await sleep(2500);
  page.on('dialog', (d) => d.accept()); await page.evaluate(() => document.querySelector('#quitBtn').click()); await sleep(800);
  check('the home page remembers the last game you picked', (await page.evaluate(() => window.selectedGame)) === 'blasters');
  await page.click('#createBtn'); await page.waitForSelector('#lobby:not(.hidden)'); await sleep(500);
  r = await room(page); check('Play with friends on the Blasters tab opens a Blasters lobby', r.game === 'blasters' && r.phase === 'lobby', JSON.stringify(r));
  await page.screenshot({ path: path.join(OUT, 'home_lobby_blasters.png') });
  await page.click('#gameSwitch [data-game="memekarts"]'); await sleep(500);
  r = await room(page); check('lobby switch changes the game to Meme Karts and shows the maps', r.game === 'memekarts' && await page.locator('#mapPicker').isVisible());
  await page.click('#gameSwitch [data-game="blasters"]'); await sleep(400); r = await room(page); check('lobby switch changes back to Toy Box Blasters', r.game === 'blasters');
  await page.click('#arcade summary'); await sleep(300); check('the other 13 games are still reachable under More games', (await page.locator('#gameGrid .gcard').count()) === 15 && await page.locator('[data-id="sumo"]').isVisible());
  await page.screenshot({ path: path.join(OUT, 'home_lobby_arcade.png') });

  const fresh = await open(); await fresh.fill('#name', 'Karter'); await fresh.click('#soloBtn'); await fresh.waitForSelector('#game:not(.hidden)', { timeout: 8000 }); await sleep(500);
  r = await room(fresh); check('a fresh visitor pressing Play now gets Meme Karts with 7 bots', r.game === 'memekarts' && r.bots === 7, JSON.stringify(r));
  const phone = await open(390, 844); await phone.screenshot({ path: path.join(OUT, 'home_phone.png') });
  check('phone layout: both game tabs fit the screen', await phone.evaluate(() => [...document.querySelectorAll('#gamePick button')].every((b) => { const q = b.getBoundingClientRect(); return q.left >= 0 && q.right <= innerWidth + 1; })) && await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const uniq = [...new Set(errors)]; check('no browser errors', uniq.length === 0, uniq.slice(0, 4).join(' | '));
  if (log) console.log('SERVER: ' + log.slice(0, 800));
  console.log(`\n${pass} passed, ${fail} failed`); await browser.close(); srv.kill(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
