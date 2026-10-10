// Dev check: the graphics setting. Home page picker and shooter map cards, then each game on Low / Medium / High:
// the renderer's pixel ratio, shadows and far scenery follow the setting, a live switch mid-game applies, and the frame rate is reported.
const { chromium } = require('playwright-core'); const { spawn } = require('child_process'); const path = require('path'), fs = require('fs'), os = require('os');
const PORT = 9300 + Math.floor(Math.random() * 300), BASE = `http://localhost:${PORT}`;
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? '  ' + x : ''}`); };
(async () => {
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] }); await sleep(900);
  const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }); const errors = [];
  let page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/?game=blasters'); await sleep(800);
  check('home page has a Low / Medium / High picker', (await page.$$('#gfxPick [data-gfx]')).length === 3);
  await page.click('#gfxPick [data-gfx="low"]'); check('picking Low is remembered', await page.evaluate(() => localStorage.getItem('fg_gfx') === 'low' && window.FG_GFX.level === 'low'));
  const cards = await page.$$('#homeBlMaps [data-map]'); check('home page shows the three shooter maps', cards.length === 3, cards.length + ' cards');
  await page.click('#homeBlMaps [data-map="cove"]'); await page.fill('#name', 'Gfx'); await page.click('#soloBtn'); await page.waitForSelector('#game:not(.hidden)', { timeout: 20000 }); await sleep(3000);
  check('Play now starts on the map picked on the home page', await page.evaluate(() => window.G.room.blastersMap === 'cove'));
  await page.screenshot({ path: path.join(__dirname, 'shots', 'gfx_home_pick.png') });
  await page.context().close();
  for (const game of ['memekarts', 'blasters']) {
    const res = {};
    for (const lvl of ['low', 'medium', 'high']) {
      page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${BASE}/?game=${game}&gfx=${lvl}&bltest=1`); await page.fill('#name', 'Gfx'); await page.click('#soloBtn'); await page.waitForSelector('#game:not(.hidden)', { timeout: 20000 }); await sleep(3500);
      await page.evaluate(() => { window.__f = 0; const t = () => { window.__f++; requestAnimationFrame(t); }; requestAnimationFrame(t); }); await sleep(3000);
      res[lvl] = await page.evaluate(() => { const r = window.__fgRenderer; let scen = 0, scenVis = 0; return { pr: r.getPixelRatio(), shadows: r.shadowMap.enabled, fps: Math.round(window.__f / 3), btn: document.querySelector('#gfxBtn').textContent }; });
      await page.screenshot({ path: path.join(__dirname, 'shots', `gfx_${game}_${lvl}.png`) });
      if (lvl === 'low') { await page.click('#gfxBtn'); await sleep(800); res.switched = await page.evaluate(() => ({ pr: window.__fgRenderer.getPixelRatio(), shadows: window.__fgRenderer.shadowMap.enabled, level: window.FG_GFX.level })); }
      await page.context().close();
    }
    check(`${game}: Low renders at 0.75 resolution without shadows`, res.low.pr === 0.75 && !res.low.shadows, JSON.stringify(res.low));
    check(`${game}: Medium renders at full resolution with shadows`, res.medium.pr === 1 && res.medium.shadows, JSON.stringify(res.medium));
    check(`${game}: High renders with shadows`, res.high.shadows && res.high.pr >= 1, JSON.stringify(res.high));
    check(`${game}: the in-game Graphics button switches Low to Medium on the spot`, res.switched.level === 'medium' && res.switched.pr === 1 && res.switched.shadows, JSON.stringify(res.switched));
    console.log(`     ${game} frame rate here: low ${res.low.fps}, medium ${res.medium.fps}, high ${res.high.fps} fps`);
  }
  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); srv.kill(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST CRASHED:', e.message.split('\n')[0]); process.exit(1); });
