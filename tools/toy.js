// Dev check: figure, skin and starter blaster are picked before the game (home page and lobby) and the game uses them.
const { chromium } = require('playwright-core'); const path = require('path'), fs = require('fs'), os = require('os');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? '  ' + x : ''}`); };
(async () => {
  const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }); const errors = [];
  const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/?game=blasters'); await sleep(2000);
  check('the home page shows the toy picker on the Toy Box Blasters tab', await page.isVisible('#toyPick'));
  await page.click('#toyPick [data-tp="next"]'); await page.click('#toyPick [data-tp="next"]'); await page.click('#toyPick [data-sk="6"]'); await page.click('#toyPick [data-lo="5"]'); await sleep(1500);
  const st = await page.evaluate(() => window.TOY.state()); check('picks are saved: figure, Gold skin, Burst starter', st.sk === 6 && st.lo === 5, JSON.stringify(st));
  await page.screenshot({ path: path.join(__dirname, 'shots', 'toy_home.png') });
  await page.fill('#name', 'Toy'); await page.click('#createBtn'); await page.waitForSelector('#lobby:not(.hidden)', { timeout: 20000 }); await sleep(600);
  check('the lobby shows the same picker', await page.isVisible('#lobbyToy'));
  await page.click('#lobbyToy [data-ch="3"]'); await sleep(300); const st2 = await page.evaluate(() => window.TOY.state()); check('picking Robot in the lobby is saved', st2.ch === 3);
  await page.screenshot({ path: path.join(__dirname, 'shots', 'toy_lobby.png') });
  await page.evaluate(() => document.querySelector('#botAdd').click()); await sleep(300); await page.evaluate(() => document.querySelector('#startBtn').click()); await page.waitForSelector('#game:not(.hidden)', { timeout: 20000 }); await sleep(3000);
  const me = await page.evaluate(() => new Promise((res) => window.G.socket.once('g:state', (s) => { const p = s.ps.find((q) => q.id === window.G.me); res({ ch: p.ch, sk: p.sk, own: p.own }); })));
  check('the game uses them: the server has Robot in Gold for everyone', me.ch === 3 && me.sk === 6, JSON.stringify(me));
  check('...and the player starts holding the Burst Blaster too', (me.own & (1 << 5)) !== 0);
  await page.keyboard.press('l'); await sleep(400); const lockerHas = await page.evaluate(() => ({ figs: document.querySelectorAll('[data-fig]').length, skins: document.querySelectorAll('[data-skin]').length, sens: !!document.querySelector('input[data-set="sens"]'), gfx: document.querySelectorAll('[data-set-gfx]').length }));
  check('in the game, L opens settings only: no figure or skin changes mid-game', lockerHas.figs === 0 && lockerHas.skins === 0 && lockerHas.sens && lockerHas.gfx === 3, JSON.stringify(lockerHas));
  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST CRASHED:', e.message.split('\n')[0]); process.exit(1); });
