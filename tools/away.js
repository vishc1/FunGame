// Dev check: stepping away with Esc, in both games. Esc starts a 2 s countdown that a click cancels; after it, an away screen
// shows your toy and stats, the server keeps you out of the world with your score kept, and Back puts you in the same match.
const { chromium } = require('playwright-core'); const { spawn } = require('child_process'); const path = require('path'), fs = require('fs'), os = require('os');
const PORT = 9900 + Math.floor(Math.random() * 90), BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? '  ' + x : ''}`); };
(async () => {
  const srv = process.env.BASE_URL ? { kill() {} } : spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] }); await sleep(900);
  const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }); const errors = [];
  for (const game of ['blasters', 'memekarts']) {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 760 } })).newPage(); p.on('pageerror', (e) => errors.push(game + ': ' + e.message));
    await p.goto(`${BASE}/?game=${game}&bltest=1`); await p.fill('#name', 'Away'); await p.click('#soloBtn'); await p.waitForSelector('#game:not(.hidden)', { timeout: 20000 }); await sleep(3500);
    if (game === 'blasters') { await p.mouse.click(640, 380); await sleep(500); }
    const me = () => p.evaluate((g) => new Promise((res) => window.G.socket.once('g:state', (s) => { const k = (g === 'blasters' ? s.ps : s.karts).find((q) => q.id === window.G.me); res({ aw: !!k.aw, k: g === 'blasters' ? k.k : k.kills, x: k.x }); })), game);
    await p.keyboard.press('Escape'); await sleep(900); await p.mouse.click(640, 380); await sleep(1800);
    check(`${game}: Esc then a click within 2 s keeps you playing`, !(await me()).aw && !(await p.$('#awayBack')));
    if (game === 'blasters') { await p.mouse.click(640, 380); await sleep(400); }
    // give the player a score to keep, then step away for real
    await p.evaluate((g) => { if (g === 'memekarts') window.G.socket.emit('input', { type: 'give', weapon: 'green' }); }, game);
    const before = await me();
    await p.keyboard.press('Escape'); await sleep(2600);
    check(`${game}: after 2 s the away screen shows`, !!(await p.$('#awayBack')));
    const awayState = await me(); check(`${game}: the server marks you away and keeps your score`, awayState.aw && awayState.k === before.k, JSON.stringify(awayState));
    await p.screenshot({ path: path.join(__dirname, 'shots', `away_${game}.png`) });
    // the Esc menu has the settings: graphics and sound change right there, mid-match
    const g0 = await p.evaluate(() => window.FG_GFX.level); await p.click('[data-set-gfx="low"]'); await p.click('[data-set-snd="0"]'); await sleep(300);
    const set1 = await p.evaluate(() => ({ gfx: window.FG_GFX.level, mute: localStorage.getItem('mk_mute'), sel: document.querySelector('[data-set-gfx="low"]').classList.contains('sel'), aim: !!document.querySelector('input[data-set="sens"]') }));
    check(`${game}: the Esc menu changes graphics and sound mid-match`, set1.gfx === 'low' && set1.mute === '1' && set1.sel, `was ${g0}, now ${JSON.stringify(set1)}`);
    check(`${game}: ...with mouse and view sliders only in the shooter`, set1.aim === (game === 'blasters'));
    await p.click(`[data-set-gfx="${g0}"]`); await p.click('[data-set-snd="1"]');
    await sleep(3000); check(`${game}: still in the same match after 3 s away`, await p.evaluate(() => !document.querySelector('#game').classList.contains('hidden')));
    await p.click('#awayBack'); await sleep(1500); const back = await me(); check(`${game}: Back puts you into the same match with your score`, !back.aw && back.k === before.k && !(await p.$('#awayBack')), JSON.stringify(back));
    await p.context().close();
  }
  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); srv.kill(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST CRASHED:', e.message.split('\n')[0]); process.exit(1); });
