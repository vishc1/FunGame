// Dev check: a real browser refresh must put the player back in the same room, as the same player, in the running game.
// Usage: node tools/refresh.js [gameId=liarsmap]
const { chromium } = require('playwright-core'); const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const GAME = process.argv[2] || 'liarsmap';
const PORT = 6000 + Math.floor(Math.random() * 500), OUT = path.join(__dirname, 'shots');
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); // the window-less test browser: no Dock icon, no windows
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? '  ' + x : ''}`); };
const screen = (p) => p.evaluate(() => ['home', 'lobby', 'game', 'results'].find((s) => !document.querySelector('#' + s).classList.contains('hidden')));
(async () => {
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] }); let log = ''; srv.stderr.on('data', (d) => (log += d));
  await sleep(800);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] /* real GPU: ~120 fps instead of ~6 with software rendering */ });
  const errors = []; const mk = async (i) => { const page = await (await browser.newContext({ viewport: { width: 1100, height: 760 } })).newPage(); page.on('pageerror', (e) => errors.push(`[p${i}] ${e.message}`)); page.on('console', (m) => { if (m.type() === 'error') errors.push(`[p${i}] ${m.text().slice(0, 200)}`); }); await page.goto(`http://localhost:${PORT}/`); return page; };
  const host = await mk(0), p1 = await mk(1);
  await host.fill('#name', 'Host'); await host.evaluate(() => document.querySelector('#createBtn').click()); await host.waitForSelector('#lobby:not(.hidden)');
  const code = (await host.textContent('#roomCode')).trim();
  await p1.fill('#name', 'Refresher'); await p1.fill('#code', code); await p1.evaluate(() => document.querySelector('#joinBtn').click()); await p1.waitForSelector('#lobby:not(.hidden)');
  await host.evaluate(() => document.querySelector('#botAdd').click()); await sleep(300);

  // refresh while in the lobby
  const idBefore = await p1.evaluate(() => window.G.me);
  await p1.reload(); await sleep(1500);
  check('refresh in the lobby returns to the lobby', (await screen(p1)) === 'lobby');
  check('same player id after a lobby refresh', (await p1.evaluate(() => window.G.me)) === idBefore);
  check('room still has 3 players, no duplicate', (await host.evaluate(() => window.G.room.players.length)) === 3);

  // refresh in the middle of a game
  await host.evaluate((g) => { const el = document.querySelector(`.gcard[data-id="${g}"]`); if (el) el.click(); }, GAME); await sleep(300);
  await host.evaluate(() => document.querySelector('#startBtn').click());
  await p1.waitForSelector('#game:not(.hidden)'); await sleep(2500);
  await p1.reload(); const tr = Date.now(); let scr = null; while (Date.now() - tr < 12000) { await sleep(400); scr = await screen(p1).catch(() => null); if (scr === 'game') break; }
  check('refresh mid-game returns to the game screen', scr === 'game', `after ${((Date.now() - tr) / 1000).toFixed(1)}s (screen: ${scr})`);
  check('same player id after a mid-game refresh', (await p1.evaluate(() => window.G.me)) === idBefore);
  check('player list unchanged and everyone connected', await host.evaluate(() => window.G.room.players.length === 3 && window.G.room.players.every((p) => p.connected)));
  await p1.screenshot({ path: path.join(OUT, `refresh_${GAME}.png`) });

  // the host refreshes mid-game: game keeps running, there is still exactly one host, and the host is back in the game
  await host.reload(); const th = Date.now(); let hs = null; while (Date.now() - th < 12000) { await sleep(400); hs = await screen(host).catch(() => null); if (hs === 'game') break; }
  check('host refresh mid-game returns the host to the game', hs === 'game', `after ${((Date.now() - th) / 1000).toFixed(1)}s (screen: ${hs})`);
  const hostInfo = await p1.evaluate(() => ({ hostId: window.G.room.hostId, ids: window.G.room.players.map((p) => p.id), phase: window.G.room.phase }));
  check('game still running with a valid host after the host refreshed', hostInfo.phase === 'playing' && hostInfo.ids.includes(hostInfo.hostId));

  // Leave button works for a non-host and the page then forgets the room
  const leaver = (await p1.evaluate(() => window.G.room.hostId === window.G.me)) ? host : p1;
  leaver.on('dialog', (d) => d.accept());
  await leaver.evaluate(() => document.querySelector('#quitBtn').click()); await sleep(600);
  check('Leave button takes a non-host player home', (await screen(leaver)) === 'home');
  await leaver.reload(); await sleep(1200);
  check('after leaving, a refresh stays on the home page', (await screen(leaver)) === 'home');

  const uniq = [...new Set(errors)]; check('no browser errors', uniq.length === 0, uniq.slice(0, 4).join(' | '));
  if (log) console.log('SERVER: ' + log.slice(0, 1000));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); srv.kill(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
