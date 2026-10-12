#!/usr/bin/env node
// Make the live site use THIS computer as the game server.  Usage: npm run online   (Ctrl+C to stop)
//
// Why: the static site normally links players' browsers to each other, which some networks block and which ends the
// room when the host closes their tab. With this running, every player connects to a game server on this computer
// through a free Cloudflare tunnel instead: works on every network, and rooms outlive any tab.
//
// What it does: starts the game server (or uses one already on PORT), opens a tunnel, waits until the tunnel's name is
// known to DNS and answers, then redeploys the live site built with FG_SERVER_URL=<tunnel>. On Ctrl+C it redeploys the
// site back to peer-to-peer and stops what it started. If the tunnel dies while the site points at it, the site falls
// back to peer-to-peer by itself (remoteOrP2P in public/app.js), so nothing is left broken.
//   --no-vercel   just run the server and the tunnel, print the link, do not touch the live site
const { spawn, spawnSync } = require('child_process'); const dns = require('dns').promises; const path = require('path'); const http = require('http'), https = require('https');
const ROOT = path.join(__dirname, '..'), PORT = +(process.env.PORT || 3000), SITE = process.env.SITE || 'https://friendgame.vercel.app', NO_VERCEL = process.argv.includes('--no-vercel');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const say = (m) => console.log(`\x1b[1m${m}\x1b[0m`);
const get = (url, ms = 8000) => new Promise((res) => { const req = (url.startsWith('https') ? https : http).get(url, (r) => { let b = ''; r.on('data', (d) => b += d); r.on('end', () => res({ status: r.statusCode, body: b })); }); req.on('error', () => res({ status: 0, body: '' })); req.setTimeout(ms, () => { req.destroy(); res({ status: 0, body: '' }); }); });
const kids = []; const run = (cmd, args, opts = {}) => { const k = spawn(cmd, args, Object.assign({ cwd: ROOT }, opts)); kids.push(k); return k; };
async function deploy(buildEnv) { const args = ['-y', 'vercel@latest', 'deploy', '--prod', '--yes'].concat(buildEnv ? ['--build-env', 'FG_SERVER_URL=' + buildEnv] : []);
  for (let i = 1; i <= 3; i++) { const r = spawnSync('npx', args, { cwd: ROOT, encoding: 'utf8' }); if (/ready. Production URL|Production: /.test(r.stdout + r.stderr)) return true; await sleep(4000); } return false; }
(async () => {
  let stopping = false;
  if (spawnSync('which', ['cloudflared']).status !== 0) { console.error('cloudflared is not installed. Run:  brew install cloudflared   then try again.'); process.exit(1); }
  // 1. the game server
  let srv = null; if ((await get(`http://localhost:${PORT}/health`, 1500)).status === 200) say(`Using the game server already running on port ${PORT}.`);
  else { srv = run('node', ['server.js'], { env: Object.assign({}, process.env, { PORT }), stdio: ['ignore', 'ignore', 'inherit'] }); for (let i = 0; i < 40 && (await get(`http://localhost:${PORT}/health`, 1000)).status !== 200; i++) await sleep(500);
    if ((await get(`http://localhost:${PORT}/health`, 1000)).status !== 200) { console.error('The game server did not start.'); process.exit(1); } say(`Game server started on port ${PORT}.`); }
  // 2. the tunnel
  const fs = require('fs'), tunLog = path.join(require('os').tmpdir(), 'friendgame-tunnel.log'); let tun = null, url = null;
  async function openTunnel() { /* returns the tunnel's address once DNS knows it and it answers, or null */
    let log = ''; url = null; tun = run('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] }); const mine = tun;
    tun.stderr.on('data', (d) => { log += d; try { fs.appendFileSync(tunLog, d); } catch (e) { /* ignore */ } const m = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/); if (m && !url) url = m[0]; });
    tun.on('exit', () => { if (tun === mine) tun = null; });
    for (let i = 0; i < 60 && !url && tun; i++) await sleep(500); if (!url) { console.error('No tunnel address after 30 s.\n' + log.slice(-600)); return null; }
    const host = url.replace('https://', ''), r = new dns.Resolver(); r.setServers(['1.1.1.1']); /* wait for DNS first: asking the system too early caches a "no such name" for minutes */
    for (let i = 0; i < 60; i++) { try { await r.resolve4(host); const ok = await dns.lookup(host).then(() => true).catch(() => false); if (ok) break; } catch (e) { /* not yet */ } await sleep(2000); }
    for (let i = 0; i < 30 && (await get(url + '/health')).status !== 200; i++) await sleep(2000);
    if ((await get(url + '/health')).status !== 200) { console.error('The tunnel does not answer at ' + url); try { tun && tun.kill(); } catch (e) { /* gone */ } return null; }
    say(`Tunnel open: ${url}  (log: ${tunLog})`); return url; }
  if (!(await openTunnel())) { shutdown(); return; }
  // 3. the live site
  async function pointSite() {
    if (NO_VERCEL) { say(`Friends can play at ${url} (served from this computer). Keep this window open. Ctrl+C to stop.`); return; }
    say(`Redeploying ${SITE} to use this computer as its game server (about a minute)...`); if (!(await deploy(url))) { console.error('The deploy failed. Friends can still play at ' + url); return; }
    const c = await get(SITE + '/config.js'); say(c.body.includes(url) ? `\n${SITE} now runs its games on this computer. Send friends the usual link.\nKeep this window open while you play. Ctrl+C stops and puts the site back to normal.` : 'Deployed, but the site does not show the new setting yet; give it a minute.'); }
  await pointSite();
  // Watchdog: a free quick tunnel can lose its name or its link without the process dying. Check it every 20 s; after
  // three misses in a row, open a fresh tunnel and point the site at it. Players are on peer-to-peer meanwhile (the
  // client falls back by itself) and get the new server on their next page load.
  let misses = 0, healing = false;
  setInterval(async () => { if (stopping || healing) return; const ok = (await get(url + '/health', 6000)).status === 200; misses = ok ? 0 : misses + 1; if (misses < 3) return;
    healing = true; say(`\nThe tunnel stopped answering (${new Date().toLocaleTimeString()}). Opening a new one...`); try { tun && tun.kill(); } catch (e) { /* gone */ } await sleep(1000);
    if (await openTunnel()) { await pointSite(); misses = 0; } else { console.error('Could not open a new tunnel; trying again in 20 s.'); } healing = false; }, 20000);
  async function shutdown() { if (stopping) return; stopping = true; say('\nStopping...'); if (!NO_VERCEL) { say('Putting the live site back to peer-to-peer...'); await deploy(null); } for (const k of kids) { try { k.kill(); } catch (e) { /* gone */ } } process.exit(0); }
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
})();
