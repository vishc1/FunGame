// Dev check: peer-to-peer joining stays reliable.
// 1. The host's link to the introduction service drops (as when Chrome throttles a background tab): it comes back by
//    itself within seconds, and a friend can still join afterwards.
// 2. A tab that still holds a seat from another room opens an invite link: the old seat does not cancel the join.
// 3. An invite to a room that is gone says so instead of spinning on "Joining".
// Usage: node tools/p2p-keepalive.js   (BASE_URL= for the live site)
const { chromium } = require('playwright-core'); const { spawn } = require('child_process'); const path = require('path'), fs = require('fs'), os = require('os');
const PORT = 9650 + Math.floor(Math.random() * 90), LOCAL = !process.env.BASE_URL, BASE = process.env.BASE_URL || `http://localhost:${PORT}`, Q = LOCAL ? '&p2p=1' : '';
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? '  ' + x : ''}`); };
const scr = (p) => p.evaluate(() => ['home', 'invite', 'lobby', 'game', 'results'].find((s) => !document.querySelector('#' + s).classList.contains('hidden'))).catch(() => null);
async function until(p, want, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await scr(p)) === want) return Date.now() - t0; await sleep(250); } return -1; }
(async () => {
  const srv = LOCAL ? spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT }, stdio: 'ignore' }) : { kill() {} }; await sleep(900);
  const browsers = [], errors = [];
  const open = async (url, init) => { const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] }); browsers.push(b); const ctx = await b.newContext(); await ctx.addInitScript(init || (() => {})); const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message)); await p.goto(url); return p; };
  const host = await open(`${BASE}/?game=memekarts${Q}`); await host.fill('#name', 'Host'); await host.click('#createBtn'); await until(host, 'lobby', 20000);
  const code = await host.evaluate(() => window.G.room.code), link = `${BASE}/?room=${code}${Q}`;
  // 1. drop the host's signalling link
  await host.evaluate(() => window.G.socket._peer.disconnect()); await sleep(300);
  check('the host\'s link to the service drops', await host.evaluate(() => window.G.socket._peer.disconnected));
  const t0 = Date.now(); let back = false; while (Date.now() - t0 < 15000) { if (!(await host.evaluate(() => window.G.socket._peer.disconnected))) { back = true; break; } await sleep(300); }
  check('...and comes back by itself', back, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const a = await open(link, () => { try { localStorage.setItem('fg_name', 'Ana'); } catch (e) {} }); const ta = await until(a, 'lobby', 30000);
  check('a friend joins with the link after that', ta >= 0, ta >= 0 ? `${(ta / 1000).toFixed(1)} s` : 'stuck on ' + (await scr(a)) + ': ' + (await a.textContent('#invMsg')));
  // 2. a stale seat from another room
  const b2 = await open(link, () => { try { localStorage.setItem('fg_name', 'Ben'); sessionStorage.setItem('fg_session', JSON.stringify({ code: 'QQQQ', id: 'u000000000000', key: 'x' })); } catch (e) {} });
  const tb = await until(b2, 'lobby', 30000); check('a tab holding a seat in another room still joins from the invite', tb >= 0, tb >= 0 ? `${(tb / 1000).toFixed(1)} s` : 'stuck on ' + (await scr(b2)) + ': ' + (await b2.textContent('#invMsg')));
  const names = (await host.evaluate(() => window.G.room.players.map((p) => p.name))).join(', '); check('the host sees both friends', /Ana/.test(names) && /Ben/.test(names), names);
  // 3. a room that is gone
  const c = await open(`${BASE}/?room=ZZZZ${Q}`, () => { try { localStorage.setItem('fg_name', 'Cy'); } catch (e) {} }); await sleep(8000);
  const msg = await c.textContent('#invMsg'), btn = await c.textContent('#invGo'); check('an invite to a closed room says so, and the button is usable again', /fresh link|code/i.test(msg) && !/Joining/.test(btn), `"${msg}" / button "${btn}"`);
  // 4. a second tab of the host's own browser joins over the tab channel: no network, so no local-name lookup needed.
  // This browser gets no mDNS workaround flag, which on this Mac makes WebRTC between two tabs fail.
  const plain = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }); browsers.push(plain); /* real GPU like the other tools, but no mDNS workaround: the tab channel must carry this */ const ctx = await plain.newContext();
  const h2 = await ctx.newPage(); h2.on('pageerror', (e) => errors.push(e.message)); await h2.goto(`${BASE}/?game=memekarts${Q}`); await h2.fill('#name', 'Host2'); await h2.click('#createBtn'); await until(h2, 'lobby', 20000);
  const code2 = await h2.evaluate(() => window.G.room.code); const t2 = await ctx.newPage(); t2.on('pageerror', (e) => errors.push(e.message)); await t2.addInitScript(() => { try { localStorage.setItem('fg_name', 'Tab'); } catch (e) {} });
  await t2.goto(`${BASE}/?room=${code2}${Q}`); const tt = await until(t2, 'lobby', 8000);
  check('a second tab of the same browser joins the room (no network lookup needed)', tt >= 0, tt >= 0 ? `${(tt / 1000).toFixed(1)} s` : 'stuck on ' + (await scr(t2)) + ': ' + (await t2.textContent('#invMsg')));
  if (tt >= 0) { await h2.evaluate(() => { document.querySelector('#botAdd').click(); }); await sleep(300); await h2.evaluate(() => document.querySelector('#startBtn').click()); const tg = await until(t2, 'game', 15000); check('...and the game starts in that tab too', tg >= 0);
    await t2.reload(); check('...the tab can refresh and is back in the game', (await until(t2, 'game', 15000)) >= 0);
    await h2.evaluate(() => { window.confirm = () => true; document.querySelector('#leaveBtn') && document.querySelector('#leaveBtn').click(); document.querySelector('#quitBtn') && document.querySelector('#quitBtn').click(); }); const th = await until(t2, 'home', 10000);
    check('...and when the host tab leaves, the other tab is told the room closed', th >= 0 && /closed/i.test(await t2.textContent('#toast')), th >= 0 ? await t2.textContent('#toast') : 'still on ' + (await scr(t2))); }
  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`); for (const b of browsers) await b.close().catch(() => {}); srv.kill(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST CRASHED:', e.message.split('\n')[0]); process.exit(1); });
