// Dev check: the static site and a sleeping game server (as on Render's free plan). The site must wait for the server
// to wake rather than quietly going peer-to-peer, so a host and the friends who arrive a minute later end up in the
// same place. Three cases: the server wakes while the host waits; it never answers (fallback after the wait, with a
// message); it is awake from the start (no message). Usage: node tools/wake.js
const { chromium } = require('playwright-core'); const { spawn, execSync } = require('child_process'); const path = require('path'), fs = require('fs'), os = require('os');
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? '  ' + x : ''}`); };
const scr = (p) => p.evaluate(() => ['home', 'invite', 'lobby', 'game', 'results'].find((s) => !document.querySelector('#' + s).classList.contains('hidden'))).catch(() => null);
async function until(p, want, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await scr(p)) === want) return Date.now() - t0; await sleep(200); } return -1; }
(async () => {
  const GAME = 4600 + Math.floor(Math.random() * 200), SITE = GAME + 1, siteDir = path.join(os.tmpdir(), 'fg-wake-site'); fs.rmSync(siteDir, { recursive: true, force: true });
  execSync(`FG_SERVER_URL=http://localhost:${GAME} node server/build-manifest.js > /dev/null`, { cwd: ROOT }); fs.cpSync(path.join(ROOT, 'public'), siteDir, { recursive: true }); execSync('node server/build-manifest.js > /dev/null', { cwd: ROOT });
  const site = spawn('python3', ['-m', 'http.server', String(SITE)], { cwd: siteDir, stdio: 'ignore' }); await sleep(800);
  const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] }); const errors = [];
  const open = async (q) => { const ctx = await b.newContext(); await ctx.addInitScript(() => { try { localStorage.setItem('fg_name', 'Friend'); } catch (e) {} }); const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message)); await p.goto(`http://localhost:${SITE}/?game=memekarts${q}`); return p; };
  // 1. the server is asleep; it wakes 12 s after the host arrives
  let host = await open('&wakems=40000'); await host.fill('#name', 'Host'); await host.click('#createBtn'); await sleep(4500);
  const wakeShown = await host.evaluate(() => { const w = document.querySelector('#wake'); return !w.classList.contains('hidden') && w.getBoundingClientRect().height > 60 ? w.textContent.trim().slice(0, 60) : ''; }); check('while the server is waking, a big notice says so', !!wakeShown, wakeShown); await host.screenshot({ path: path.join(__dirname, 'shots', 'wake_banner.png') });
  check('...and is not dropped into a browser-to-browser room meanwhile', (await scr(host)) === 'home');
  const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: GAME }, stdio: 'ignore' });
  const t = await until(host, 'lobby', 30000); check('...and the notice goes away once it is awake', await host.evaluate(() => document.querySelector('#wake').classList.contains('hidden'))); check('when the server wakes, the room opens on it', t >= 0 && (await host.evaluate(() => window.G.socket.p2p === false)), t >= 0 ? `${(t / 1000).toFixed(1)} s later` : 'no lobby');
  const code = await host.evaluate(() => window.G.room && window.G.room.code);
  const friend = await open(`&room=${code}`.replace('&room', '&room')); const tf = await until(friend, 'lobby', 20000);
  check('a friend arriving a minute later lands in the same room', tf >= 0 && (await friend.evaluate(() => window.G.room.players.length)) === 2);
  await host.context().close(); await friend.context().close();
  // 2. the server is awake from the start: no waking message
  const quick = await open(''); await quick.fill('#name', 'Quick'); await quick.click('#createBtn'); const tq = await until(quick, 'lobby', 15000);
  check('an awake server opens the room at once, with no waking message', tq >= 0 && tq < 6000 && !/waking/i.test(await quick.textContent('#toast')), `${tq} ms`); await quick.context().close();
  // 3. the server never answers: after the wait, peer-to-peer with a message
  srv.kill(); await sleep(500);
  const alone = await open('&wakems=8000'); await alone.fill('#name', 'Alone'); await alone.click('#createBtn'); const ta = await until(alone, 'lobby', 30000);
  check('a server that never answers: the room still opens, browser to browser, after the wait', ta >= 4000 && (await alone.evaluate(() => window.G.socket.p2p === true)), `${ta} ms, p2p=${await alone.evaluate(() => window.G.socket.p2p)}`);
  check('...and the host is told it is browser to browser', /browser to browser/i.test(await alone.textContent('#toast')), JSON.stringify(await alone.textContent('#toast')));
  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); site.kill(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST CRASHED:', e.message.split('\n')[0]); process.exit(1); });
