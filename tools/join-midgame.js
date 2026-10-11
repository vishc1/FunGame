// Dev check: a friend can join a game that is already running, in both games, even when the room is full of bots.
// Host presses Play now (bots fill the room, the match starts), then a second browser joins by code and must land in the match.
// Usage: node tools/join-midgame.js   or   BASE_URL=https://friendgame.vercel.app node tools/join-midgame.js
const { chromium } = require('playwright-core'); const { spawn } = require('child_process'); const path = require('path'), fs = require('fs'), os = require('os');
const PORT = 9750 + Math.floor(Math.random() * 90), LOCAL = !process.env.BASE_URL, BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? '  ' + x : ''}`); };
(async () => {
  const srv = LOCAL ? spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] }) : { kill() {} }; await sleep(900);
  const errors = [], browsers = [];
  const open = async (url) => { const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns'] }); browsers.push(b); const p = await (await b.newContext({ viewport: { width: 1000, height: 650 } })).newPage(); p.on('pageerror', (e) => errors.push(e.message)); await p.goto(url); return p; };
  for (const game of ['memekarts', 'blasters']) {
    const host = await open(`${BASE}/?game=${game}`); await host.fill('#name', 'Host'); await host.click('#soloBtn'); await host.waitForSelector('#game:not(.hidden)', { timeout: 25000 }); await sleep(2500);
    const code = await host.evaluate(() => window.G.room.code), before = await host.evaluate(() => window.G.room.players.length);
    // fill the room right up with bots so the friend has to take a bot's seat
    await host.evaluate(() => window.G.socket.emit('bots', { op: 'add', n: 15 })); await sleep(800); const full = await host.evaluate(() => window.G.room.players.length);
    const guest = await open(`${BASE}/?room=${code}&game=${game}`); await guest.fill('#name', 'Friend'); await guest.click('#joinBtn');
    let scr = null; const t0 = Date.now(); while (Date.now() - t0 < 25000) { await sleep(500); scr = await guest.evaluate(() => ['home', 'lobby', 'game', 'results'].find((s) => !document.querySelector('#' + s).classList.contains('hidden'))); if (scr === 'game') break; }
    const toast = await guest.evaluate(() => (document.querySelector('#toast') || {}).textContent);
    check(`${game}: a friend joins a running match from the invite link (room was full: ${full} players)`, scr === 'game', `screen ${scr}${toast ? ', said "' + toast + '"' : ''}`);
    await sleep(2500);
    const seen = await guest.evaluate((g) => new Promise((res) => { const t = setTimeout(() => res(null), 4000); window.G.socket.once('g:state', (s) => { clearTimeout(t); res((g === 'blasters' ? s.ps : s.karts).some((p) => p.id === window.G.me)); }); }), game);
    check(`${game}: ...and is a player in that match`, seen === true);
    const hostSees = await host.evaluate(() => window.G.room.players.some((p) => p.name === 'Friend' && p.connected)); check(`${game}: the host sees the friend in the room`, hostSees);
    for (const b of browsers.splice(0)) await b.close();
  }
  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`); srv.kill(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST CRASHED:', e.message.split('\n')[0]); process.exit(1); });
