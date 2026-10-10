// Dev check for the peer-to-peer transport (what the Vercel deployment uses). Real browsers, real WebRTC.
//   - solo "Play now" with bots works with no game server
//   - a guest who refreshes mid-game gets their seat back
//   - when the host leaves, the guest is sent home with an explanation
// Usage: node tools/p2p.js                         (local files, forced with ?p2p=1)
//        BASE_URL=https://friendgame.vercel.app node tools/p2p.js
const { chromium } = require('playwright-core'); const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const PORT = 8100 + Math.floor(Math.random() * 300), LOCAL = !process.env.BASE_URL, BASE = process.env.BASE_URL || `http://localhost:${PORT}`, Q = LOCAL ? '?p2p=1' : '';
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); // the window-less test browser: no Dock icon, no windows
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? '  ' + x : ''}`); };
const screen = (p) => p.evaluate(() => ['home', 'lobby', 'game', 'results'].find((s) => !document.querySelector('#' + s).classList.contains('hidden')));
(async () => {
  const srv = LOCAL ? spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] }) : { kill() {} };
  await sleep(800); console.log('testing ' + BASE + Q);
  const errors = [], browsers = [];
  const open = async (i) => { const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns'] /* real local IPs: two browsers on one Mac can only reach each other over WebRTC when mDNS works, and it does not always */ }); browsers.push(b); const page = await (await b.newContext({ viewport: { width: 1000, height: 700 } })).newPage(); page.on('pageerror', (e) => errors.push(`[p${i}] ${e.message}`)); page.on('console', (m) => { if (m.type() === 'error') errors.push(`[p${i}] ${m.text().slice(0, 160)}`); }); await page.goto(BASE + '/' + Q); return page; };

  // solo with bots: the whole game server runs inside this one browser
  const solo = await open(0); await solo.fill('#name', 'Solo'); await solo.click('#soloBtn'); await solo.waitForSelector('#game:not(.hidden)', { timeout: 20000 });
  await solo.evaluate(() => { window.__n = 0; window.G.socket.on('g:state', () => window.__n++); }); await sleep(3000);
  const s1 = await solo.evaluate(() => ({ n: window.__n, p2p: !!window.G.socket.p2p, hosting: window.G.socket.hosting, bots: window.G.room.players.filter((p) => p.bot).length }));
  check('this page is using the peer-to-peer transport', s1.p2p && s1.hosting);
  check('solo Play now runs with bots and no game server', s1.bots === 7 && s1.n > 60, `${s1.n} state updates in 3s, ${s1.bots} bots`);
  await browsers[0].close();

  // host + guest
  const host = await open(1), guest = await open(2);
  await host.fill('#name', 'Host'); await host.click('#createBtn'); await host.waitForSelector('#lobby:not(.hidden)', { timeout: 20000 }); const code = (await host.textContent('#roomCode')).trim();
  await guest.fill('#name', 'Guest'); await guest.fill('#code', code); await guest.click('#joinBtn'); await guest.waitForSelector('#lobby:not(.hidden)', { timeout: 25000 });
  check('a guest joins the host directly by room code', (await host.evaluate(() => window.G.room.players.length)) === 2);
  const wrong = await open(3); await wrong.fill('#name', 'Lost'); await wrong.fill('#code', code === 'ZZZZ' ? 'YYYY' : 'ZZZZ'); await wrong.click('#joinBtn'); await sleep(6000);
  check('a wrong room code is refused and stays on the home page', (await screen(wrong)) === 'home'); await browsers[3].close();
  await host.evaluate(() => document.querySelector('.gcard[data-id="liarsmap"]').click()); await sleep(300); await host.evaluate(() => document.querySelector('#botAdd').click()); await sleep(400);
  await host.evaluate(() => document.querySelector('#startBtn').click()); await guest.waitForSelector('#game:not(.hidden)', { timeout: 10000 }); await sleep(2000);
  const idBefore = await guest.evaluate(() => window.G.me);
  await guest.reload(); let scr = null; const t0 = Date.now(); while (Date.now() - t0 < 25000) { await sleep(500); scr = await screen(guest).catch(() => null); if (scr === 'game') break; }
  check('a guest who refreshes mid-game is back in the game', scr === 'game', `after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  check('...as the same player, and the host sees them connected', (await guest.evaluate(() => window.G.me)) === idBefore && await host.evaluate(() => window.G.room.players.filter((p) => !p.bot).every((p) => p.connected)));
  // the host walks away
  host.on('dialog', (d) => d.accept()); await host.evaluate(() => document.querySelector('#quitBtn').click());
  let gs = null; const t1 = Date.now(); while (Date.now() - t1 < 30000) { await sleep(500); gs = await screen(guest).catch(() => null); if (gs === 'home') break; }
  const msg = await guest.evaluate(() => document.querySelector('#toast').textContent);
  check('when the host leaves, the guest is returned home with an explanation', gs === 'home', `after ${((Date.now() - t1) / 1000).toFixed(1)}s: "${msg}"`);
  const real = [...new Set(errors)].filter((e) => !/favicon/.test(e)); check('no browser errors', real.length === 0, real.slice(0, 3).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`); for (const b of browsers) await b.close().catch(() => {}); srv.kill(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
