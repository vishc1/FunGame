// Dev check: does a full-length match stay smooth? Plays a practice match with bots for SECS seconds in a real browser and
// every 30 s prints the frame rate, the JS heap, and how many geometries/textures the renderer holds. Growing counts = a leak.
// Usage: node tools/perf.js <memekarts|blasters> [secs=300]
const { chromium } = require('playwright-core'); const { spawn } = require('child_process'); const path = require('path'), fs = require('fs'), os = require('os');
const GAME = process.argv[2] || 'memekarts', SECS = Number(process.argv[3] || 300), PORT = 8900 + Math.floor(Math.random() * 300);
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop();
const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] }); await sleep(900);
  const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/?game=${GAME}&bltest=1`); await page.fill('#name', 'Perf'); await page.click('#soloBtn'); await page.waitForSelector('#game:not(.hidden)', { timeout: 20000 }); await sleep(2000);
  if (GAME === 'blasters') await page.mouse.click(640, 400);
  await page.evaluate(() => { window.__frames = 0; window.__worst = 0; let last = performance.now(); const tick = (t) => { window.__frames++; window.__worst = Math.max(window.__worst, t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  // keep the player busy: drive / strafe with the keys, fire now and then
  const keys = GAME === 'blasters' ? ['w', 'a', 'd', ' '] : ['w', 'a', 'd', ' ']; let ki = 0;
  const rows = []; const t0 = Date.now();
  while (Date.now() - t0 < SECS * 1000) {
    const k = keys[ki++ % keys.length]; await page.keyboard.down(k); await sleep(700); await page.keyboard.up(k); if (ki % 5 === 0 && GAME === 'blasters') await page.mouse.click(640, 400);
    if (ki % 40 === 0) { const r = await page.evaluate(() => { const i = window.__fgRenderer ? window.__fgRenderer.info : { memory: {}, render: {} }, f = window.__frames, w = window.__worst; window.__frames = 0; window.__worst = 0; return { fps: f, worstMs: w, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1, geometries: i.memory.geometries, textures: i.memory.textures, drawCalls: i.render.calls, triangles: i.render.triangles, phase: (document.querySelector('#game').classList.contains('hidden') ? 'over' : 'game') }; });
      r.t = Math.round((Date.now() - t0) / 1000); r.fps = Math.round(r.fps / 30); rows.push(r); console.log(`${String(r.t).padStart(4)}s  ${String(r.fps).padStart(3)} fps  worst frame ${r.worstMs.toFixed(0).padStart(4)} ms  heap ${r.heapMB} MB  geometries ${r.geometries}  textures ${r.textures}  draw calls ${r.drawCalls}  tris ${r.triangles}  ${r.phase}`); if (r.phase === 'over') break; }
  }
  const a = rows[0], z = rows[rows.length - 1]; console.log(`\n${GAME}: fps ${a.fps} -> ${z.fps}, heap ${a.heapMB} -> ${z.heapMB} MB, geometries ${a.geometries} -> ${z.geometries}, textures ${a.textures} -> ${z.textures}, draw calls ${a.drawCalls} -> ${z.drawCalls}; page errors ${errors.length}`);
  await b.close(); srv.kill(); process.exit(0);
})().catch((e) => { console.error('TEST CRASHED:', e.message.split('\n')[0]); process.exit(1); });
