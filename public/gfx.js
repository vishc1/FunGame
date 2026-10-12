// Graphics quality, picked by the player (home page and the in-game Graphics button), remembered in this browser.
// Low trades looks for speed on weak laptops and phones: lower resolution, no shadows, no bloom, no far scenery.
// Games read window.FG_GFX.cfg() when they build, and listen for the 'fg-gfx' event to apply a change on the spot.
(function () {
  const LEVELS = {
    low:    { name: 'Low',    pixelRatio: 0.75, shadows: false, shadowSize: 512,  bloom: false, scenery: false },
    medium: { name: 'Medium', pixelRatio: 1,    shadows: true,  shadowSize: 1024, bloom: false, scenery: true },
    high:   { name: 'High',   pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5), shadows: true, shadowSize: 2048, bloom: true, scenery: true },
  };
  const ORDER = ['low', 'medium', 'high'];
  let level = 'low'; /* the default everywhere; FG_GFX.DEFAULT. Low first: a smooth game beats shadows, and anyone can turn it up */
  try { const v = localStorage.getItem('fg_gfx'); if (LEVELS[v]) level = v; } catch (e) { /* storage blocked */ }
  const q = new URLSearchParams(location.search).get('gfx'); if (LEVELS[q]) level = q; // ?gfx=low for tests
  window.FG_GFX = {
    LEVELS, ORDER,
    get level() { return level; },
    cfg() { return LEVELS[level]; },
    set(v) { if (!LEVELS[v]) return; try { localStorage.setItem('fg_gfx', v); } catch (e) { /* ignore */ } /* saved even when it is already the level, so a deliberate pick of the default sticks */ if (v === level) return; level = v; window.dispatchEvent(new CustomEvent('fg-gfx', { detail: LEVELS[v] })); syncUI(); },
    next() { this.set(ORDER[(ORDER.indexOf(level) + 1) % ORDER.length]); },
    get DEFAULT() { return 'low'; },
    reset() { this.set(this.DEFAULT); try { localStorage.removeItem('fg_gfx'); } catch (e) { /* ignore */ } },
  };
  // One settings panel for the in-game Esc menu and the shooter's Settings (L): graphics, sound and, for the shooter, mouse and view.
  // Same storage keys as the lobby, so a change anywhere is the same setting everywhere.
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }, lsSet = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* storage blocked */ } };
  window.FG_SETTINGS = {
    html(aim) {
      const muted = lsGet('mk_mute', '0') === '1', sens = Math.max(0.2, Math.min(3, +lsGet('tbb_sens', 1) || 1)), fov = Math.max(60, Math.min(105, +lsGet('tbb_fov', 78) || 78));
      return `<div class="fg-set"><div class="fg-set-row"><span>Graphics</span>${ORDER.map((v) => `<button type="button" class="chip${v === level ? ' sel' : ''}" data-set-gfx="${v}">${LEVELS[v].name}</button>`).join('')}</div>
        <div class="fg-set-row"><span>Sound</span><button type="button" class="chip${muted ? '' : ' sel'}" data-set-snd="1">On</button><button type="button" class="chip${muted ? ' sel' : ''}" data-set-snd="0">Off</button></div>
        ${aim ? `<label class="fg-set-slider">Mouse sensitivity <b data-set-v="sens">${sens.toFixed(2)}</b><input type="range" data-set="sens" min="0.2" max="3" step="0.05" value="${sens}"></label>
        <label class="fg-set-slider">Field of view <b data-set-v="fov">${fov}</b><input type="range" data-set="fov" min="60" max="105" step="1" value="${fov}"></label>` : ''}<small>Pick Low graphics if the game lags. Saved in this browser.</small></div>`;
    },
    bind(root, hooks = {}) {
      const redraw = () => { for (const b of root.querySelectorAll('[data-set-gfx]')) b.classList.toggle('sel', b.dataset.setGfx === level); const m = lsGet('mk_mute', '0') === '1'; for (const b of root.querySelectorAll('[data-set-snd]')) b.classList.toggle('sel', (b.dataset.setSnd === '1') !== m); };
      for (const b of root.querySelectorAll('[data-set-gfx]')) b.onclick = (e) => { e.stopPropagation(); window.FG_GFX.userPicked = true; window.FG_GFX.set(b.dataset.setGfx); redraw(); };
      for (const b of root.querySelectorAll('[data-set-snd]')) b.onclick = (e) => { e.stopPropagation(); const on = b.dataset.setSnd === '1'; lsSet('mk_mute', on ? '0' : '1'); window.dispatchEvent(new CustomEvent('fg-sound', { detail: { muted: !on } })); redraw(); };
      const live = () => { if (!root.querySelector('[data-set-gfx]')) { window.removeEventListener('fg-sound', live); window.removeEventListener('fg-gfx', live); return; } redraw(); }; /* M key, the lobby or another panel changed it */
      window.addEventListener('fg-sound', live); window.addEventListener('fg-gfx', live);
      for (const r of root.querySelectorAll('input[data-set]')) r.oninput = () => { const k = r.dataset.set, v = +r.value; lsSet(k === 'sens' ? 'tbb_sens' : 'tbb_fov', v); const out = root.querySelector(`[data-set-v="${k}"]`); if (out) out.textContent = k === 'sens' ? v.toFixed(2) : v; if (hooks[k]) hooks[k](v); };
    },
  };
  // Menu size: grow with the window on big monitors, but only as far as the home page's first screen still fits the
  // window's height (it needs about 1000 x 1000 css px at normal size). Games are not zoomed.
  function fitZoom() { const z = Math.max(1, Math.min(2.2, innerWidth / 1500, innerHeight / 1000)); document.documentElement.style.setProperty('--ui-zoom', (Math.floor(z * 20) / 20).toFixed(2)); }
  fitZoom(); window.addEventListener('resize', fitZoom);
  // Lag guard: while a game is on screen, count frames; if two 3-second windows in a row run under 30 fps, step the
  // graphics down one level (once per page load, and never over a level the player picked by hand this session).
  let frames = 0, winStart = 0, slowWins = 0, autoDone = false; window.FG_GFX.userPicked = false;
  function watch(now) { requestAnimationFrame(watch); const game = document.querySelector('#game'); if (!game || game.classList.contains('hidden') || document.hidden) { frames = 0; winStart = now; return; }
    frames++; if (now - winStart < 3000) return; const fps = frames / ((now - winStart) / 1000); frames = 0; winStart = now;
    slowWins = fps < 30 ? slowWins + 1 : 0; if (slowWins < 2 || autoDone || window.FG_GFX.userPicked || level === 'low') return;
    autoDone = true; const lower = ORDER[Math.max(0, ORDER.indexOf(level) - 1)]; window.FG_GFX.set(lower); window.dispatchEvent(new CustomEvent('fg-gfx-auto', { detail: { level: lower, fps: Math.round(fps) } })); }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(watch);
  function syncUI() {
    for (const b of document.querySelectorAll('[data-gfx]')) { const on = b.dataset.gfx === level; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on); }
    const btn = document.querySelector('#gfxBtn'); if (btn) btn.textContent = 'Graphics: ' + LEVELS[level].name;
  }
  document.addEventListener('DOMContentLoaded', () => {
    for (const b of document.querySelectorAll('[data-gfx]')) b.onclick = () => { window.FG_GFX.userPicked = true; window.FG_GFX.set(b.dataset.gfx); };
    const btn = document.querySelector('#gfxBtn'); if (btn) btn.onclick = () => window.FG_GFX.next();
    syncUI();
  });
})();
