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
  const coarse = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
  let level = coarse ? 'medium' : 'high';
  try { const v = localStorage.getItem('fg_gfx'); if (LEVELS[v]) level = v; } catch (e) { /* storage blocked */ }
  const q = new URLSearchParams(location.search).get('gfx'); if (LEVELS[q]) level = q; // ?gfx=low for tests
  window.FG_GFX = {
    LEVELS, ORDER,
    get level() { return level; },
    cfg() { return LEVELS[level]; },
    set(v) { if (!LEVELS[v] || v === level) return; level = v; try { localStorage.setItem('fg_gfx', v); } catch (e) { /* ignore */ } window.dispatchEvent(new CustomEvent('fg-gfx', { detail: LEVELS[v] })); syncUI(); },
    next() { this.set(ORDER[(ORDER.indexOf(level) + 1) % ORDER.length]); },
  };
  function syncUI() {
    for (const b of document.querySelectorAll('[data-gfx]')) { const on = b.dataset.gfx === level; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on); }
    const btn = document.querySelector('#gfxBtn'); if (btn) btn.textContent = 'Graphics: ' + LEVELS[level].name;
  }
  document.addEventListener('DOMContentLoaded', () => {
    for (const b of document.querySelectorAll('[data-gfx]')) b.onclick = () => window.FG_GFX.set(b.dataset.gfx);
    const btn = document.querySelector('#gfxBtn'); if (btn) btn.onclick = () => window.FG_GFX.next();
    syncUI();
  });
})();
