// Dev check: do two players on a deployed site stay connected past a host's connection time limit?
// Host and guest (two separate browsers) play Meme Karts for SECS seconds; every minute we confirm the guest is still
// receiving the game, and at the end that both still share the room. Usage: BASE_URL=https://friendgame.vercel.app node tools/p2p-long.js [seconds=400]
const { chromium } = require('playwright-core'); const path = require('path'), fs = require('fs'), os = require('os');
const BASE = process.env.BASE_URL || 'http://localhost:3000', SECS = Number(process.argv[2] || 400), Q = process.env.QS || '';
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); // the window-less test browser: no Dock icon, no windows
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browsers = [], open = async () => { const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns'] /* real local IPs: two browsers on one Mac can only reach each other over WebRTC when mDNS works, and it does not always */ }); browsers.push(b); const p = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage(); await p.goto(BASE + '/' + Q); return p; };
  const host = await open(), guest = await open();
  await host.fill('#name', 'Host'); await host.click('#createBtn'); await host.waitForSelector('#lobby:not(.hidden)', { timeout: 20000 }); const code = (await host.textContent('#roomCode')).trim();
  await guest.fill('#name', 'Guest'); await guest.fill('#code', code); await guest.click('#joinBtn'); await guest.waitForSelector('#lobby:not(.hidden)', { timeout: 25000 });
  for (const p of [host, guest]) await p.evaluate(() => { window.__n = 0; window.__drops = 0; window.G.socket.on('g:state', () => window.__n++); window.G.socket.on('disconnect', () => window.__drops++); });
  const t0 = Date.now(), at = () => String(Math.round((Date.now() - t0) / 1000)).padStart(4) + 's';
  console.log(`${at()}  room ${code} on ${BASE}; playing for ${SECS}s`);
  let lastN = 0, stalls = 0;
  while (Date.now() - t0 < SECS * 1000) {
    const phase = await host.evaluate(() => window.G.room && window.G.room.phase);
    if (phase === 'lobby' || phase === 'results') await host.evaluate(() => window.G.socket.emit('start')); // keep a match running
    await sleep(60000);
    const g = await guest.evaluate(() => ({ n: window.__n, drops: window.__drops, room: !!window.G.room, players: window.G.room ? window.G.room.players.filter((p) => p.connected).length : 0 }));
    console.log(`${at()}  guest received ${g.n - lastN} game updates this minute; connection drops so far: ${g.drops}; connected players: ${g.players}`);
    if (g.n - lastN < 200) stalls++; lastN = g.n;
  }
  const g = await guest.evaluate(() => ({ drops: window.__drops, players: window.G.room ? window.G.room.players.filter((p) => p.connected).length : 0 }));
  const ok = g.players === 2 && stalls === 0;
  console.log(`${at()}  RESULT: ${ok ? 'both players still connected and playing' : 'the room did NOT survive'} (drops ${g.drops}, quiet minutes ${stalls})`);
  for (const b of browsers) await b.close(); process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
