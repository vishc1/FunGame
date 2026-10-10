// Takes the screenshots for the home page gallery (public/img/shots/*.jpg) from real games with bots.
// Usage: node tools/gallery.js   (needs the local server on :3000)
const { chromium } = require('playwright-core'); const path = require('path'), fs = require('fs'), os = require('os'); const { execSync } = require('child_process');
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'public', 'img', 'shots');
const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
(async () => {
  const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  async function room(game, map) { const page = await (await b.newContext({ viewport: { width: 1280, height: 760 } })).newPage(); await page.goto(`http://localhost:3000/?game=${game}&bltest=1&gfx=high`); await page.fill('#name', 'You'); await page.click('#createBtn'); await page.waitForSelector('#lobby:not(.hidden)');
    await page.evaluate((m) => document.querySelector(`#mapPicker [data-map="${m}"]`).click(), map); await sleep(200); for (let i = 0; i < 5; i++) { await page.evaluate(() => document.querySelector('#botAdd').click()); await sleep(150); }
    await page.evaluate(() => document.querySelector('#startBtn').click()); await page.waitForSelector('#game:not(.hidden)'); await sleep(3500); return page; }
  const save = async (page, name) => { const png = path.join(OUT, name + '.png'); await page.screenshot({ path: png }); execSync(`sips -s format jpeg -s formatOptions 72 --resampleWidth 960 "${png}" --out "${path.join(OUT, name + '.jpg')}" >/dev/null && rm "${png}"`); };
  // Meme Karts
  let p = await room('memekarts', 'stadium'); await p.evaluate(() => window.G.send({ type: 'tp', x: 1150, y: 170, a: Math.PI })); await sleep(4800); await p.keyboard.down('w'); await sleep(900); await save(p, 'karts_tower'); await p.keyboard.up('w'); await p.context().close();
  p = await room('memekarts', 'neon'); await p.evaluate(() => window.G.send({ type: 'tp', x: 300, y: 600, a: 0 })); await sleep(4800); await p.keyboard.down('w'); await sleep(1400); await save(p, 'karts_neon'); await p.keyboard.up('w'); await p.context().close();
  p = await room('memekarts', 'canyon'); await p.evaluate(() => window.G.send({ type: 'tp', x: 560, y: 240, a: 0 })); await sleep(4800); await p.keyboard.down('w'); await sleep(1500); await save(p, 'karts_canyon'); await p.keyboard.up('w'); await p.context().close();
  p = await room('memekarts', 'stadium'); await p.evaluate(() => { window.G.send({ type: 'tp', x: 700, y: 600, a: 0 }); }); await sleep(4800); await p.evaluate(() => window.G.send({ type: 'give', weapon: 'pie' })); await sleep(300); await p.keyboard.down(' '); await sleep(1000); await save(p, 'karts_pie'); await p.keyboard.up(' '); await p.context().close();
  // Toy Box Blasters
  for (const [map, x, y, z, tx, tz, name] of [['cove', -24, 0, -12, 0, 0, 'bl_cove'], ['towers', 22, 0, -4, -17, -17, 'bl_towers'], ['fort', 0, 0, -26, 0, 0, 'bl_fort'], ['cove', 0, 4.8, 8, 0, -20, 'bl_deck']]) {
    p = await room('blasters', map); await p.mouse.click(640, 380); await sleep(400); await p.evaluate(([x, y, z, yaw]) => window.__blGo(x, y, z, yaw, -0.05), [x, y, z, yawTo(x, z, tx, tz)]); await sleep(1800); await save(p, name); await p.context().close();
  }
  console.log('gallery:', fs.readdirSync(OUT).join(' ')); await b.close(); process.exit(0);
})().catch((e) => { console.error('TEST CRASHED:', e.message.split('\n')[0]); process.exit(1); });
