// Dev check: the victory lap. When a match ends, for 5 seconds only the winner can move, everyone else's camera follows the
// winner, and there is confetti. Headless rules for both games, plus a browser screenshot of each.
const kart = require('../server/games/memekarts.js'), bl = require('../server/games/blasters.js');
let bad = 0; const ok = (n, c, x = '') => { if (!c) bad++; console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
function world(mod, mem) { const ev = [], timers = []; let st = null, vt = 0, ended = false; const players = ['a', 'b'].map((id) => ({ id, name: id, color: '#fff' }));
  const api = { memory: mem, room: { bots: new Map([['x', 1]]) }, players: () => players, player: (id) => players.find((p) => p.id === id), emit(e, d) { if (e === 'g:event') ev.push(d); if (e === 'g:state') st = d; }, to() {}, after(ms, fn) { timers.push({ at: vt + ms / 1000, fn }); }, every() {}, clear() {}, end() { ended = true; } };
  const g = mod.create(api); return { g, ev, st: () => st, ended: () => ended, run(secs) { for (let i = 0; i < secs * 30; i++) { vt += 1 / 30; g.tick(1 / 30); for (const t of timers.splice(0)) { if (t.at <= vt) t.fn(); else timers.push(t); } } } }; }
// karts: a wins on kills, then only a drives
{ const w = world(kart, { __fast: 3, memekartsMap: 'stadium' }); w.run(0.5); w.g.__state().karts.get('a').kills = 2; w.run(3);
  const over = w.ev.find((e) => e.type === 'over'); ok('karts: the match ends with a winner and a 5 s party', over && over.winner === 'a' && over.party === 5);
  const pa = { ...w.g.__state().karts.get('a') }, pb = { ...w.g.__state().karts.get('b') };
  for (const id of ['a', 'b']) w.g.onInput(id, { type: 'ctl', up: true, down: false, left: false, right: false }); w.run(1.5);
  const a = w.g.__state().karts.get('a'), b = w.g.__state().karts.get('b');
  ok('karts: the winner can still drive', Math.hypot(a.x - pa.x, a.y - pa.y) > 40, Math.hypot(a.x - pa.x, a.y - pa.y).toFixed(0) + ' units');
  ok('karts: everyone else is frozen', Math.hypot(b.x - pb.x, b.y - pb.y) < 1, Math.hypot(b.x - pb.x, b.y - pb.y).toFixed(1) + ' units');
  ok('karts: snapshots say who won so cameras can follow them', w.st().win === 'a'); ok('karts: nothing hurts during the party', b.hp === 3 && a.hp === 3);
  w.run(5); ok('karts: the results come after the party', w.ended()); }
// shooter: a wins, only a moves
{ const w = world(bl, { __fast: 3, blastersMap: 'fort', blastersRounds: 'one' }); w.run(3.5); w.g.onInput('a', { type: 'p', x: 10, y: 0, z: 28, yaw: 0, pitch: 0, cr: 0 }); w.g.onInput('b', { type: 'p', x: 12, y: 0, z: 28, yaw: 0, pitch: 0, cr: 0 }); w.run(0.1);
  w.g.onInput('a', { type: 'fire', w: 0, hits: [{ id: 'b', n: 1, h: 0 }] }); w.run(1.5);
  const over = w.ev.find((e) => e.type === 'over'); ok('shooter: the match ends with a winner and a 5 s party', over && over.champ === 'a' && over.party === 5, JSON.stringify(over && { champ: over.champ }));
  const b0 = { ...w.st().ps.find((p) => p.id === 'b') };
  w.g.onInput('a', { type: 'p', x: 0, y: 0, z: 26, yaw: 0, pitch: 0, cr: 0 }); w.g.onInput('b', { type: 'p', x: -20, y: 0, z: -20, yaw: 0, pitch: 0, cr: 0 }); w.run(0.2);
  const A = w.st().ps.find((p) => p.id === 'a'), Bp = w.st().ps.find((p) => p.id === 'b');
  ok('shooter: the winner can still move', A.x === 0 && A.z === 26); ok('shooter: everyone else is frozen', Bp.x === b0.x && Bp.z === b0.z, `b at ${Bp.x},${Bp.z}, was ${b0.x},${b0.z}`); ok('shooter: snapshots say who won', w.st().win === 'a');
  w.run(6); ok('shooter: the results come after the party', w.ended()); }
// in a browser: end a practice match and photograph the victory lap from the winner's and a bot's point of view
(async () => {
  if (process.argv.includes('--no-browser')) return finishUp();
  const { chromium } = require('playwright-core'); const path = require('path'), fs = require('fs'), os = require('os'); const { spawn } = require('child_process');
  const PORT = 9850 + Math.floor(Math.random() * 40), cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'), dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
  const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] }); await sleep(900);
  const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }); const errs = [];
  for (const game of ['memekarts', 'blasters']) { const p = await (await b.newContext({ viewport: { width: 1280, height: 760 } })).newPage(); p.on('pageerror', (e) => errs.push(game + ': ' + e.message));
    await p.goto(`http://localhost:${PORT}/?game=${game}&bltest=1`); await p.fill('#name', 'Me'); await p.click('#soloBtn'); await p.waitForSelector('#game:not(.hidden)'); await sleep(3000); if (game === 'blasters') { await p.mouse.click(640, 380); await sleep(400); }
    await p.evaluate(() => window.G.send({ type: 'endnow' })); await sleep(1200); await p.screenshot({ path: path.join(__dirname, 'shots', `party_${game}.png`) });
    const win = await p.evaluate(() => new Promise((res) => window.G.socket.once('g:state', (s) => res(s.win)))); ok(`${game} in a browser: the victory lap is on (winner is you)`, !!win);
    await p.context().close(); }
  ok('no page errors in the browser', errs.length === 0, errs.slice(0, 2).join(' | ')); await b.close(); srv.kill(); finishUp();
})();
function finishUp() { console.log(bad ? `${bad} PROBLEMS` : 'victory lap ok'); process.exit(bad ? 1 : 0); }
