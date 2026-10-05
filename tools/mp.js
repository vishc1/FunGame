// Dev check: is it really multiplayer? Two separate browsers join one room by code. For each primary game we check that
// each browser sees the other player move, and (shooter) that a shot fired in one browser lowers health seen in both.
// Usage: node tools/mp.js            (starts its own local server)
//        BASE_URL=https://friendgame.vercel.app node tools/mp.js   (tests a deployed site instead)
//        P2P=1 node tools/mp.js      (forces the peer-to-peer transport with ?p2p=1)
const { chromium } = require('playwright-core'); const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const PORT = 7600 + Math.floor(Math.random() * 300);
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); // the window-less test browser: no Dock icon, no windows
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? '  ' + x : ''}`); };
(async () => {
  const BASE = process.env.BASE_URL || `http://localhost:${PORT}`; let log = '';
  const srv = process.env.BASE_URL ? { kill() {} } : spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] }); if (srv.stderr) srv.stderr.on('data', (d) => (log += d));
  await sleep(800); console.log('testing ' + BASE + (process.env.P2P ? ' in peer-to-peer mode' : ''));
  const errors = [];
  for (const game of ['memekarts', 'blasters']) {
    // two completely separate browser processes, like two people on two computers
    const browsers = [], pages = [];
    for (let i = 0; i < 2; i++) { const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }); browsers.push(b); const page = await (await b.newContext({ viewport: { width: 1000, height: 700 } })).newPage(); page.on('pageerror', (e) => errors.push(`[${game} p${i}] ${e.message}`)); await page.goto(`${BASE}/?bltest=1&game=${game}${process.env.P2P ? '&p2p=1' : ''}`); pages.push(page); }
    const [A, Bp] = pages;
    await A.fill('#name', 'Alice'); await A.click('#createBtn'); await A.waitForSelector('#lobby:not(.hidden)'); const code = (await A.textContent('#roomCode')).trim();
    await Bp.fill('#name', 'Bob'); await Bp.fill('#code', code); await Bp.click('#joinBtn'); await Bp.waitForSelector('#lobby:not(.hidden)');
    check(`${game}: second browser joins the room by code and both see two players`, (await A.evaluate(() => window.G.room.players.length)) === 2 && (await Bp.evaluate(() => window.G.room.players.length)) === 2);
    await A.click('#startBtn'); await Promise.all(pages.map((p) => p.waitForSelector('#game:not(.hidden)')));
    for (const p of pages) await p.evaluate(() => { window.__st = null; window.__hurt = 0; window.G.socket.on('g:state', (s) => { window.__st = s; }); window.G.socket.on('g:event', (e) => { if (e.type === 'hurt') window.__hurt++; }); });
    await sleep(3500);
    const list = game === 'memekarts' ? 'karts' : 'ps';
    const seen = (viewer, whoPage) => whoPage.evaluate(() => window.G.me).then((id) => viewer.evaluate(([l, i]) => { const q = window.__st && window.__st[l].find((k) => k.id === i); return q ? { x: q.x, y: q.y, z: q.z, hp: q.hp } : null; }, [list, id]));
    for (const [mover, watcher, mn, wn] of [[Bp, A, 'Bob', 'Alice'], [A, Bp, 'Alice', 'Bob']]) {
      const before = await seen(watcher, mover);
      if (game === 'blasters') { const box = await mover.locator('#canvas').boundingBox(); await mover.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await sleep(600); }
      await mover.keyboard.down('w'); await sleep(1500); await mover.keyboard.up('w'); await sleep(300);
      const after = await seen(watcher, mover), moved = before && after ? Math.hypot(after.x - before.x, (after.z ?? after.y) - (before.z ?? before.y)) : 0;
      check(`${game}: ${wn}'s browser sees ${mn} move`, moved > (game === 'blasters' ? 2 : 40), `moved ${moved.toFixed(1)} ${game === 'blasters' ? 'm' : 'units'}`);
    }
    if (game === 'blasters') {
      // stand them in the open a few metres apart (test-only placement), wait out spawn protection, then Alice fires at Bob
      await A.evaluate(() => window.__blGo(-3, 0, 25.5, 0)); await Bp.evaluate(() => window.__blGo(5, 0, 25.5, 0)); await sleep(3200);
      let shots = 0; const t0 = Date.now();
      while (Date.now() - t0 < 12000 && shots < 8) { const d = await A.evaluate(() => window.__blAim()); if (d === false) { await sleep(200); continue; } await A.mouse.down(); await sleep(40); await A.mouse.up(); shots++; await sleep(280); }
      await sleep(500);
      const bobHurt = await Bp.evaluate(() => window.__hurt), hpA = (await seen(A, Bp)) || {}, hpB = (await seen(Bp, Bp)) || {};
      check("blasters: Alice's shots hurt Bob (Bob's browser got the hit)", bobHurt > 0, `${shots} shots, ${bobHurt} hits felt by Bob`);
      check("blasters: both browsers agree on Bob's health", hpA.hp === hpB.hp && hpA.hp !== undefined, `Alice sees ${hpA.hp}, Bob sees ${hpB.hp}`);
    }
    for (const b of browsers) await b.close();
  }
  const uniq = [...new Set(errors)]; check('no browser errors', uniq.length === 0, uniq.slice(0, 3).join(' | '));
  if (log) console.log('SERVER: ' + log.slice(0, 600));
  console.log(`\n${pass} passed, ${fail} failed`); srv.kill(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
