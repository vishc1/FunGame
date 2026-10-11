// Dev check: playing with friends. (1) An invite link opens a "Join the party" screen and, with a saved name, joins on its own.
// (2) Without a saved name: type it, press the button, you are in. (3) A dead link says so and offers the home page.
// (4) In the lobby every player (not just the host) has graphics, sound and mouse settings, and they carry into the game.
// Usage: node tools/friends.js   or   BASE_URL=https://friendgame.vercel.app node tools/friends.js
const { chromium } = require('playwright-core'); const { spawn } = require('child_process'); const path = require('path'), fs = require('fs'), os = require('os');
const PORT = 9650 + Math.floor(Math.random() * 90), LOCAL = !process.env.BASE_URL, BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? '  ' + x : ''}`); };
const screen = (p) => p.evaluate(() => ['home', 'invite', 'lobby', 'game', 'results'].find((s) => !document.querySelector('#' + s).classList.contains('hidden')));
async function until(p, want, ms = 25000) { const t0 = Date.now(); let s = null; while (Date.now() - t0 < ms) { s = await screen(p).catch(() => null); if (s === want) return s; await sleep(300); } return s; }
(async () => {
  const srv = LOCAL ? spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] }) : { kill() {} }; await sleep(900);
  const errors = [], browsers = [];
  const open = async (url, name) => { const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns'] }); browsers.push(b); const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); if (name) await ctx.addInitScript((n) => { try { localStorage.setItem('fg_name', n); } catch (e) {} }, name); const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message)); await p.goto(url); return p; };
  const host = await open(`${BASE}/?game=blasters`); await host.fill('#name', 'Host'); await host.click('#createBtn'); await host.waitForSelector('#lobby:not(.hidden)', { timeout: 20000 });
  const code = (await host.textContent('#roomCode')).trim(), link = await host.evaluate(() => `${location.origin}/?room=${window.G.room.code}`);
  // 1: a friend who has played before: the link alone gets them in
  const f1 = await open(link, 'Sam'); check('a returning friend opens the link and lands in the lobby by themselves', (await until(f1, 'lobby')) === 'lobby');
  check('...the address bar no longer has the invite (a refresh rejoins the seat)', !(await f1.evaluate(() => location.search.includes('room='))));
  // 2: a new friend: one name box, one button
  const f2 = await open(link); const s2 = await until(f2, 'invite', 8000); check('a new friend sees the Join the party screen with the code', s2 === 'invite' && (await f2.textContent('#invCode')).trim() === code);
  await f2.fill('#invName', 'Alex'); await f2.click('#invGo'); check('...types a name, presses one button, and is in the lobby', (await until(f2, 'lobby')) === 'lobby');
  await sleep(500); const names = await host.evaluate(() => window.G.room.players.map((p) => p.name)); check('the host sees both friends', names.includes('Sam') && names.includes('Alex'), names.join(', '));
  // 3: a dead link
  const f3 = await open(`${BASE}/?room=ZZZQ`, 'Late'); await sleep(LOCAL ? 2500 : 9000); const msg = await f3.textContent('#invMsg'); check('a dead link says so and stays on the invite screen with a way home', (await screen(f3)) === 'invite' && /room|code|answer/i.test(msg) && await f3.isVisible('#invHome'), msg.slice(0, 80));
  // 4: settings in the lobby for a non-host player
  check('a friend in the lobby has the settings card', await f2.isVisible('.lobby-settings'));
  await f2.click('.lobby-settings [data-gfx="low"]'); await f2.click('#sndOff'); await f2.evaluate(() => { const s = document.querySelector('#lsSens'); s.value = '1.8'; s.dispatchEvent(new Event('input')); });
  const saved = await f2.evaluate(() => ({ gfx: localStorage.getItem('fg_gfx'), mute: localStorage.getItem('mk_mute'), sens: localStorage.getItem('tbb_sens') })); check('...graphics, sound and mouse are saved', saved.gfx === 'low' && saved.mute === '1' && saved.sens === '1.8', JSON.stringify(saved));
  await host.evaluate(() => document.querySelector('#startBtn').click()); check('the host starts and the friend is in the game', (await until(f2, 'game')) === 'game');
  await sleep(2500); const pr = await f2.evaluate(() => window.__fgRenderer && window.__fgRenderer.getPixelRatio()); check('...playing on the Low graphics they picked in the lobby', pr === 0.75, 'pixel ratio ' + pr);
  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`); for (const b of browsers) await b.close().catch(() => {}); srv.kill(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST CRASHED:', e.message.split('\n')[0]); process.exit(1); });
