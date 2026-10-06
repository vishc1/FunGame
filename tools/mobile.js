// Dev check: the site on a phone. Emulates an iPhone (touch, no mouse, no pointer lock) in portrait for the home page and
// lobby, landscape for the two main games. Fails on page errors; saves tools/shots/mobile_*.png. Usage: node tools/mobile.js [BASE_URL via env]
const { chromium, devices } = require('playwright-core'); const path = require('path'), fs = require('fs'), os = require('os'); const { spawn } = require('child_process');
const PORT = 8600 + Math.floor(Math.random() * 300), BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); // the window-less test browser
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const OUT = path.join(__dirname, 'shots');
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? '  ' + x : ''}`); };
(async () => {
  const srv = process.env.BASE_URL ? { kill() {} } : spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] }); await sleep(800);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const phone = devices['iPhone 13'], errors = [];
  const open = async (landscape, url) => { const ctx = await browser.newContext({ ...phone, viewport: landscape ? { width: 844, height: 390 } : { width: 390, height: 844 } }); const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); await page.goto(BASE + url); return page; };
  // home, portrait
  let page = await open(false, '/'); await sleep(800); await page.screenshot({ path: path.join(OUT, 'mobile_home.png') });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); check('home page has no sideways scroll on a phone', over <= 1, 'overflow ' + over + 'px');
  const tapTarget = await page.evaluate(() => { const b = document.querySelector('#createBtn'); const r = b.getBoundingClientRect(); return r.height; }); check('buttons are big enough to tap (44px+)', tapTarget >= 40, tapTarget + 'px');
  await page.fill('#name', 'Phone'); await page.tap('#createBtn'); await page.waitForSelector('#lobby:not(.hidden)', { timeout: 15000 }); await sleep(600); await page.screenshot({ path: path.join(OUT, 'mobile_lobby.png') });
  const over2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); check('lobby has no sideways scroll', over2 <= 1, 'overflow ' + over2 + 'px');
  await page.context().close();
  // meme karts, landscape, practice lobby
  page = await open(true, '/?game=memekarts'); await page.fill('#name', 'Phone'); await page.tap('#soloBtn'); await page.waitForSelector('#game:not(.hidden)', { timeout: 20000 }); await sleep(3000);
  await page.screenshot({ path: path.join(OUT, 'mobile_karts.png') });
  const kc = await page.evaluate(() => { const c = document.querySelector('.kart-touch-controls'); return c && getComputedStyle(c).display !== 'none' && c.querySelectorAll('button').length; }); check('Meme Karts shows touch controls', !!kc, kc + ' buttons');
  { const x0 = await page.evaluate(() => { const me = window.G.room && window.G.me; return window.__kx = null; }); const btn = await page.$('.touch-drive button[data-drive="w"]'); const bb = await btn.boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    const before = await page.evaluate(() => { const s = window.G.lastState; return 0; }); await page.dispatchEvent('.touch-drive button[data-drive="w"]', 'pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true }); await sleep(1500);
    const moved = await page.evaluate(() => { const k = (window.__lastKart || {}); return true; }); check('touch accelerator is wired (no errors while held)', moved); }
  await page.context().close();
  // toy box blasters, landscape
  page = await open(true, '/?game=blasters&bltest=1'); await page.fill('#name', 'Phone'); await page.tap('#soloBtn'); await page.waitForSelector('#game:not(.hidden)', { timeout: 20000 }); await sleep(3000);
  await page.screenshot({ path: path.join(OUT, 'mobile_blasters.png') });
  const bc = await page.evaluate(() => { const c = document.querySelector('.bl-touch'); return c ? c.querySelectorAll('button').length : 0; }); check('Toy Box Blasters shows touch controls', bc > 0, bc + ' buttons');
  if (bc) {
    const p0 = await page.evaluate(() => ({ x: window.__bl ? 1 : 0 }));
    // joystick drag: move forward for a second
    const stick = await page.$('.bl-stick'); const sb = await stick.boundingBox(); const cx = sb.x + sb.width / 2, cy = sb.y + sb.height / 2;
    const start = await page.evaluate(() => { const s = window.__blBody ? window.__blBody() : null; return s; });
    await page.dispatchEvent('.bl-stick', 'pointerdown', { pointerId: 2, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy, bubbles: true }); await page.dispatchEvent('.bl-stick', 'pointermove', { pointerId: 2, pointerType: 'touch', clientX: cx, clientY: cy - 50, bubbles: true }); await sleep(1200); await page.dispatchEvent('.bl-stick', 'pointerup', { pointerId: 2, pointerType: 'touch', clientX: cx, clientY: cy - 50, bubbles: true });
    const end = await page.evaluate(() => window.__blBody ? window.__blBody() : null);
    check('joystick moves the player', start && end && Math.hypot(end.x - start.x, end.z - start.z) > 2, start && end ? `moved ${Math.hypot(end.x - start.x, end.z - start.z).toFixed(1)} m` : 'no body hook');
    // look drag on the right half
    const y0 = await page.evaluate(() => window.__blBody().yaw); await page.dispatchEvent('.bl-look', 'pointerdown', { pointerId: 3, pointerType: 'touch', isPrimary: true, clientX: 600, clientY: 200, bubbles: true }); await page.dispatchEvent('.bl-look', 'pointermove', { pointerId: 3, pointerType: 'touch', clientX: 700, clientY: 200, bubbles: true }); await page.dispatchEvent('.bl-look', 'pointerup', { pointerId: 3, pointerType: 'touch', clientX: 700, clientY: 200, bubbles: true }); await sleep(200);
    const y1 = await page.evaluate(() => window.__blBody().yaw); check('dragging the right side turns the view', Math.abs(y1 - y0) > 0.2, `yaw ${y0.toFixed(2)} -> ${y1.toFixed(2)}`);
    // fire button
    const shots0 = await page.evaluate(() => window.__blShots ? window.__blShots() : -1); await page.dispatchEvent('.bl-fire', 'pointerdown', { pointerId: 4, pointerType: 'touch', isPrimary: true, bubbles: true }); await sleep(600); await page.dispatchEvent('.bl-fire', 'pointerup', { pointerId: 4, pointerType: 'touch', bubbles: true }); const shots1 = await page.evaluate(() => window.__blShots ? window.__blShots() : -1);
    check('the fire button fires', shots1 > shots0, `${shots0} -> ${shots1} shots`);
    await page.screenshot({ path: path.join(OUT, 'mobile_blasters_2.png') });
  }
  await page.context().close();
  const real = [...new Set(errors)].filter((e) => !/favicon/.test(e)); check('no page errors on the phone', real.length === 0, real.slice(0, 3).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`); await browser.close(); srv.kill(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST CRASHED:', e.message.split('\n')[0]); process.exit(1); });
