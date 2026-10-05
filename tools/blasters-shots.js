// Dev harness for Toy Box Blasters: plays in Test mode and captures the guide, the scoreboard and a look at another player.
const { chromium } = require('playwright-core'); const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const PORT = 6600 + Math.floor(Math.random() * 300), OUT = path.join(__dirname, 'shots');
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); // the window-less test browser: no Dock icon, no windows
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] }); let log = ''; srv.stderr.on('data', (d) => (log += d));
  await sleep(800);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] /* real GPU: ~120 fps instead of ~6 with software rendering */ });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  const CALM = !!process.env.CALM; // CALM=1: the only other player is an idle second page (nobody shoots the camera) and levels come from saved XP
  await page.goto(`http://localhost:${PORT}/?bltest=1`);
  if (CALM) await page.evaluate(() => localStorage.setItem('tbb_xp', '200000'));
  await page.fill('#name', 'Tester'); await page.click(CALM ? '#createBtn' : '#testBtn');
  await page.waitForSelector('#lobby:not(.hidden)');
  if (CALM) { const code = (await page.textContent('#roomCode')).trim(); const p2 = await (await browser.newContext({ viewport: { width: 640, height: 400 } })).newPage(); await p2.goto(`http://localhost:${PORT}/`); await p2.fill('#name', 'Dummy'); await p2.fill('#code', code); await p2.evaluate(() => document.querySelector('#joinBtn').click()); await page.waitForFunction(() => document.querySelectorAll('#playerList li').length >= 2); }
  else await page.waitForFunction(() => document.querySelectorAll('#playerList li').length >= 4);
  await page.evaluate(() => document.querySelector('.gcard[data-id="blasters"]').click()); await sleep(300);
  await page.evaluate(() => document.querySelector('#startBtn').click()); await page.waitForSelector('#game:not(.hidden)'); await sleep(2500);
  await page.screenshot({ path: path.join(OUT, 'bl_click_to_play.png') });
  const box = await page.locator('#canvas').boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await sleep(700);
  // new mechanics, captured right after spawning (spawn protection keeps the bots off for a moment)
  if (!CALM) {
    await page.keyboard.press(']'); await page.keyboard.press(']'); await page.keyboard.press(']'); await page.keyboard.press(']'); await page.keyboard.press(']'); await sleep(700); // ends on the Burst Blaster (5)
    await page.mouse.down({ button: 'right' }); await sleep(450); await page.screenshot({ path: path.join(OUT, 'bl_aim_burst.png') }); await page.mouse.down(); await sleep(60); await page.mouse.up(); await sleep(350); await page.mouse.up({ button: 'right' });
    const mag = await page.evaluate(() => { let st = null; return new Promise((r) => window.G.socket.once('g:state', (s) => r(s.ps.find((p) => p.id === window.G.me).m))); });
    console.log('burst blaster: one click left', mag, 'of 24 darts in the magazine', mag === 21 ? '(ok, 3 fired)' : '(UNEXPECTED)');
    await page.keyboard.down('c'); await sleep(350); await page.screenshot({ path: path.join(OUT, 'bl_crouch.png') }); await page.keyboard.up('c');
    await page.keyboard.press('e'); await sleep(110); await page.screenshot({ path: path.join(OUT, 'bl_sword.png') }); await sleep(400);
    await page.keyboard.press(']'); await sleep(600); await page.screenshot({ path: path.join(OUT, 'bl_lobber.png') }); await page.mouse.down(); await sleep(50); await page.mouse.up(); await sleep(500); await page.screenshot({ path: path.join(OUT, 'bl_lobber_flight.png') });
    await page.keyboard.press(']'); await sleep(600); await page.mouse.down(); await sleep(350); await page.screenshot({ path: path.join(OUT, 'bl_zap.png') }); await page.mouse.up();
  }
  // turn until some other player is roughly in front, then shoot at them
  for (let i = 0; i < 40; i++) {
    const info = await page.evaluate(() => { const st = window.__bl && window.__bl(); return st || null; });
    if (!info) break;
    if (info.err !== null && Math.abs(info.err) < 0.12) break;
    await page.keyboard.down(info.err > 0 ? 'ArrowLeft' : 'ArrowRight'); await sleep(Math.min(400, Math.abs(info.err) / 2.4 * 1000)); await page.keyboard.up(info.err > 0 ? 'ArrowLeft' : 'ArrowRight'); await sleep(60);
  }
  await page.screenshot({ path: path.join(OUT, 'bl_enemy.png') });
  // walk up to the nearest player for a close look at a figure holding its blaster
  await page.keyboard.down('w');
  for (let i = 0; i < 90; i++) {
    const info = await page.evaluate(() => (window.__bl ? window.__bl() : null)); if (!info || info.err === null) break;
    if (info.dist < 4.5 && Math.abs(info.err) < 0.15) break;
    if (Math.abs(info.perr) > 0.06) { const k = info.perr > 0 ? 'ArrowUp' : 'ArrowDown'; await page.keyboard.down(k); await sleep(Math.min(150, Math.abs(info.perr) / 1.6 * 1000)); await page.keyboard.up(k); }
    if (Math.abs(info.err) > 0.06) { const k = info.err > 0 ? 'ArrowLeft' : 'ArrowRight'; await page.keyboard.down(k); await sleep(Math.min(220, Math.abs(info.err) / 2.4 * 1000)); await page.keyboard.up(k); } else await sleep(100);
  }
  await page.keyboard.up('w'); await page.screenshot({ path: path.join(OUT, 'bl_closeup.png') });
  await page.mouse.down(); await sleep(1500); await page.mouse.up(); await page.screenshot({ path: path.join(OUT, 'bl_shooting.png') });
  await page.keyboard.down('w'); await sleep(2500); await page.keyboard.press(' '); await sleep(250); await page.keyboard.press(' '); await sleep(300); await page.screenshot({ path: path.join(OUT, 'bl_moving.png') }); await page.keyboard.up('w');
  await page.keyboard.press('h'); await sleep(400); await page.screenshot({ path: path.join(OUT, 'bl_guide.png') }); await page.keyboard.press('h');
  // map features: stand in fixed spots and look at them
  const go = async (name, x, y, z, yaw, pitch, wait = 500) => { await page.evaluate((a) => window.__blGo(...a), [x, y, z, yaw, pitch]); await sleep(wait); await page.screenshot({ path: path.join(OUT, name) }); };
  await go('bl_ramp_walk.png', 17, 0, 21, -0.6, 0.1);             // the east gallery ramp, from the south
  await go('bl_ramp_launch.png', 17.5, 0, 10, 0.75, 0.08);        // the east launch ramp with the bridge behind it
  await go('bl_teleporter.png', 16.5, 0, -26, -1.0, -0.1);        // the north-east ground teleporter
  await go('bl_gallery_tele.png', 22, 3.25, 2, 0, -0.15);         // on the east gallery, looking at its teleporter
  // wait for the train and watch it pass under the west bridge
  await page.evaluate(() => { window.__tr = null; window.G.socket.on('g:state', (st) => { window.__tr = st.tr; }); });
  let seen = null; const tStart = Date.now();
  while (Date.now() - tStart < 45000) { const tr = await page.evaluate(() => { window.__blGo(-17, 0, 6.2, 0.15, 0.05); return window.__tr; }); if (tr && Math.abs(tr[0] - tr[1] * 4 + 17) < 4) { seen = tr; break; } await sleep(30); }
  console.log('train seen at', JSON.stringify(seen), 'after', ((Date.now() - tStart) / 1000).toFixed(1) + 's');
  await page.screenshot({ path: path.join(OUT, 'bl_train.png') });
  // locker
  await page.keyboard.press('l'); await sleep(700); await page.screenshot({ path: path.join(OUT, 'bl_locker.png') });
  await page.evaluate(() => { document.querySelector('[data-fig="4"]').click(); }); await sleep(300); await page.evaluate(() => { document.querySelector('[data-skin="6"]').click(); }); await sleep(900); await page.screenshot({ path: path.join(OUT, 'bl_locker_gold_wizard.png') });
  await page.evaluate(() => { document.querySelector('[data-fig="3"]').click(); }); await sleep(200); await page.evaluate(() => { document.querySelector('[data-skin="8"]').click(); }); await sleep(900); await page.screenshot({ path: path.join(OUT, 'bl_locker_rainbow_robot.png') });
  await page.keyboard.press('l'); await sleep(300);
  await page.keyboard.down('Tab'); await sleep(400); await page.screenshot({ path: path.join(OUT, 'bl_scores.png') }); await page.keyboard.up('Tab');
  const fin = await page.evaluate(() => { const me = window.G.room && window.G.me; return { phase: window.G.room.phase, me: !!me }; });
  const uniq = [...new Set(errors)]; console.log('blasters shots', JSON.stringify(fin), 'errors=' + uniq.length); for (const e of uniq.slice(0, 10)) console.log('  ' + e);
  if (log) console.log('SERVER: ' + log.slice(0, 1000));
  await browser.close(); srv.kill();
})().catch((e) => { console.error(e); process.exit(1); });
