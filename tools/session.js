// Dev check: a whole evening with friends, four real browsers (host + 3 friends), every multiplayer capability in order.
// Runs in server mode (local) and peer-to-peer mode (local with ?p2p=1, or the live site).
// Usage: node tools/session.js            server mode
//        SERVER=1 BASE_URL=<static site> node tools/session.js   static site + game server on another host (FG_SERVER_URL)
//        P2P=1 node tools/session.js      peer-to-peer
//        BASE_URL=https://friendgame.vercel.app node tools/session.js
const { chromium } = require('playwright-core'); const { spawn } = require('child_process'); const path = require('path'), fs = require('fs'), os = require('os');
const PORT = 9550 + Math.floor(Math.random() * 90), LOCAL = !process.env.BASE_URL, BASE = process.env.BASE_URL || `http://localhost:${PORT}`, P2P = process.env.SERVER ? false : (!LOCAL || !!process.env.P2P), /* SERVER=1: BASE_URL is a static site that talks to a game server elsewhere */ Q = LOCAL && process.env.P2P ? '&p2p=1' : '';
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? '  ' + x : ''}`); };
const scr = (p) => p.evaluate(() => ['home', 'invite', 'lobby', 'game', 'results'].find((s) => !document.querySelector('#' + s).classList.contains('hidden'))).catch(() => null);
async function until(p, want, ms = 25000) { const t0 = Date.now(); let s; while (Date.now() - t0 < ms) { s = await scr(p); if (s === want) return true; await sleep(250); } return false; }
const room = (p) => p.evaluate(() => window.G.room && JSON.parse(JSON.stringify(window.G.room)));
const snap = (p) => p.evaluate(() => new Promise((res) => { const t = setTimeout(() => res(null), 5000); window.G.socket.once('g:state', (s) => { clearTimeout(t); res(s); }); }));
(async () => {
  const srv = LOCAL ? spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] }) : { kill() {} }; await sleep(900);
  console.log(`testing ${BASE} in ${P2P ? 'peer-to-peer' : 'server'} mode`);
  const errors = [], browsers = [];
  const open = async (url, name) => { const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns'] }); browsers.push(b); const ctx = await b.newContext({ viewport: { width: 1100, height: 720 } }); if (name) await ctx.addInitScript((n) => { try { localStorage.setItem('fg_name', n); localStorage.setItem('fg_gfx', 'low'); } catch (e) {} }, name); const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message)); p.on('dialog', (d) => d.accept()); await p.goto(url); return p; };
  // --- lobby
  const host = await open(`${BASE}/?game=memekarts${Q}`); await host.fill('#name', 'Host'); await host.click('#createBtn'); await until(host, 'lobby');
  const link = await host.evaluate(() => `${location.origin}/?room=${window.G.room.code}`) + Q;
  const sam = await open(link, 'Sam'), sam2 = await open(link, 'Sam'), kim = await open(link, 'Kim');
  check('three friends open the invite link and land in the lobby', (await until(sam, 'lobby')) && (await until(sam2, 'lobby')) && (await until(kim, 'lobby')));
  await sleep(600); let r = await room(host); const names = r.players.map((p) => p.name), colors = new Set(r.players.map((p) => p.color));
  check('everyone is in the room with a name nobody else has', names.length === 4 && new Set(names).size === 4, names.join(', ')); check('...and a colour nobody else has', colors.size === 4);
  check('everyone sees the same room', JSON.stringify((await room(kim)).players.map((p) => p.id)) === JSON.stringify(r.players.map((p) => p.id)));
  // --- only the host controls the game
  await kim.evaluate(() => { window.G.socket.emit('pick', { gameId: 'sumo' }); window.G.socket.emit('pickMap', { mapId: 'neon' }); window.G.socket.emit('start'); }); await sleep(800);
  r = await room(host); check('a friend cannot change the game, the map or start it', r.gameId === 'memekarts' && r.mapId === 'stadium' && r.phase === 'lobby', `${r.gameId} ${r.mapId} ${r.phase}`);
  check('...and their buttons say so (disabled)', await kim.evaluate(() => document.querySelector('#gameSwitch [data-game]').disabled && !!document.querySelector('#mapPicker [data-map]').disabled));
  // host sets up Toy Box Blasters, Pirate Cove, teams, back-to-back rounds
  await host.evaluate(() => document.querySelector('#gameSwitch [data-game="blasters"]').click()); await sleep(500);
  await host.evaluate(() => { document.querySelector('#mapPicker [data-map="cove"]').click(); }); await sleep(300); await host.evaluate(() => { document.querySelector('#modePick [data-mode="teams"]').click(); }); await sleep(300); await host.evaluate(() => { document.querySelector('#modePick [data-mode="loop"]').click(); }); await sleep(500);
  r = await room(sam); check('the host\'s picks show up for friends: game, map, teams', r.gameId === 'blasters' && r.blastersMap === 'cove' && r.blastersMode === 'teams', `${r.gameId} ${r.blastersMap} ${r.blastersMode}`);
  await host.evaluate(() => document.querySelector('#botAdd').click()); await sleep(400); // a bot makes it a test room, which allows the end-the-match hook below
  await host.evaluate(() => document.querySelector('#startBtn').click());
  const allIn = (await until(host, 'game')) && (await until(sam, 'game')) && (await until(sam2, 'game')) && (await until(kim, 'game')); check('the host presses Start and all four are in the match', allIn);
  await sleep(2500); let s = await snap(sam); const humans = s ? s.ps.filter((p) => !p.id.startsWith('bot')) : [];
  check('every player is in everyone\'s game', humans.length === 4); const teams = humans.map((p) => p.tm); check('teams are even: two humans each side', teams.filter((t) => t === 0).length === 2 && teams.filter((t) => t === 1).length === 2, teams.join(''));
  // --- leaving and coming back mid-game
  const kimId = await kim.evaluate(() => window.G.me); await kim.evaluate(() => document.querySelector('#quitBtn').click()); await until(kim, 'home', 8000); await sleep(1200);
  s = await snap(host); check('a friend who leaves is gone from the match for everyone', s && !s.ps.some((p) => p.id === kimId)); check('...and the match goes on', (await scr(host)) === 'game' && (await scr(sam)) === 'game');
  await kim.goto(link); check('they open the invite link again and are back in the same running match', await until(kim, 'game'));
  const samId = await sam.evaluate(() => window.G.me); await sam.reload(); check('a friend who refreshes is back in the match', await until(sam, 'game')); check('...as the same player', (await sam.evaluate(() => window.G.me)) === samId);
  // --- the end of a round: victory lap, then the next round for everyone on the same map
  await host.evaluate(() => window.G.send({ type: 'endnow' })); await sleep(1200);
  s = await snap(sam2); const hostId = await host.evaluate(() => window.G.me); check('when the round ends, everyone is told who won (the victory lap)', s && !!s.win, 'winner ' + (s && s.win === hostId ? 'host' : s && s.win));
  const sam2Id = await sam2.evaluate(() => window.G.me), frozen0 = s.ps.find((p) => p.id === sam2Id); await sam2.keyboard.down('w'); await sleep(900); await sam2.keyboard.up('w'); const s2 = await snap(host);
  const frozen1 = s2.ps.find((p) => p.id === frozen0.id); check('...friends who did not win cannot move during it', Math.hypot(frozen1.x - frozen0.x, frozen1.z - frozen0.z) < 0.05);
  const round2 = await Promise.all([host, sam, sam2, kim].map((p) => p.evaluate(() => new Promise((res) => { const t = setTimeout(() => res(false), 12000); window.G.socket.on('g:event', (e) => { if (e.type === 'round') { clearTimeout(t); res(e.round); } }); }))));
  check('then the next round starts for all four on the same map', round2.every((x) => x === 2) && (await snap(kim)).map === 'cove', round2.join(','));
  // --- host ends the game: back to the lobby together
  await host.evaluate(() => { window.confirm = () => true; document.querySelector('#endBtn').click(); });
  check('the host ends the game and everyone is back in the lobby together', (await until(host, 'lobby')) && (await until(sam, 'lobby')) && (await until(kim, 'lobby')));
  // --- the host leaves
  await host.evaluate(() => document.querySelector('#leaveBtn').click()); await sleep(P2P ? 4000 : 1500);
  if (P2P) { const home = await until(sam, 'home', 15000), t = await sam.textContent('#toast'); check('peer-to-peer: when the host leaves, friends are told the room closed', home && /closed/i.test(t), `home ${home}, toast "${t}", screen ${await scr(sam)}`); }
  else { r = await room(sam); check('server mode: when the host leaves, a friend becomes the host and the room stays', r && r.players.length >= 3 && r.hostId !== hostId && r.players.some((p) => p.id === r.hostId && !p.bot), r && r.hostId); }
  check('no page errors in any browser', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`); for (const b of browsers) await b.close().catch(() => {}); srv.kill(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST CRASHED:', e.message.split('\n')[0]); process.exit(1); });
