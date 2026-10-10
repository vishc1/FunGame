// Toy Box Blasters: pick your figure, skin and starter blaster BEFORE a game (home page and lobby). The game reads the same
// localStorage keys when it starts (tbb_char, tbb_skin, tbb_lo) and sends them to everyone, so a pick shows up for the whole room.
(function () {
  const CHAR_NAMES = ['Knight', 'Astronaut', 'Pirate', 'Robot', 'Wizard', 'Ninja', 'Chef', 'Dino Kid'];
  const SKINS = ['Classic', 'Pastel', 'Midnight', 'Chrome', 'Neon', 'Ice', 'Gold', 'Lava', 'Rainbow'];
  const SWATCH = ['#ff794f', 'linear-gradient(135deg,#fff,#ff794f)', 'radial-gradient(circle,#ff794f 0,#15181f 70%)', 'linear-gradient(135deg,#fff,#8a97a8,#fff,#6f7c8d)', 'radial-gradient(circle,#fff 0,#ff794f 45%,#000 100%)', 'linear-gradient(135deg,#ffffff,#9fdcff)', 'linear-gradient(135deg,#fff3b0,#ffb300,#8a5a00)', 'radial-gradient(circle,#ffd84d 0,#ff4d1f 45%,#2a0d05 100%)', 'linear-gradient(90deg,#ff5d5d,#ffd84d,#5ee07a,#4da6ff,#c77dff)'];
  const STARTERS = [[0, 'Sidearm only'], [1, 'Scatter'], [2, 'Rapid'], [5, 'Burst']];
  const ls = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : +v; } catch (e) { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* storage blocked */ } };
  const state = () => ({ ch: ((ls('tbb_char', 4) % 8) + 8) % 8, sk: Math.max(0, Math.min(8, ls('tbb_skin', 0))), lo: STARTERS.some((s) => s[0] === ls('tbb_lo', 0)) ? ls('tbb_lo', 0) : 0 });
  const listeners = [];
  function change(k, v) { set(k, v); for (const f of listeners) f(state()); for (const el of document.querySelectorAll('[data-toypicker]')) draw(el); }
  // the same look the game gives each skin (public/games/blasters.js paintSkin), for the 3D preview on the home page
  function paint(mats, color, sk, t, C) {
    for (const m of mats) {
      m.transparent = false; m.opacity = 1; m.emissive.setHex(0); m.emissiveIntensity = 1; m.metalness = 0.05; m.roughness = 0.45;
      if (sk === 1) { m.color.set(color).lerp(new C('#ffffff'), 0.55); m.roughness = 0.6; }
      else if (sk === 2) { m.color.set('#15181f'); m.emissive.set(color); m.emissiveIntensity = 0.35; m.metalness = 0.4; m.roughness = 0.35; }
      else if (sk === 3) { m.color.set('#f2f6fb'); m.metalness = 0.85; m.roughness = 0.12; m.emissive.set('#5d6a7a'); m.emissiveIntensity = 0.35; }
      else if (sk === 4) { m.color.set(color); m.emissive.set(color); m.emissiveIntensity = 1.5; }
      else if (sk === 5) { m.color.set('#d6f2ff'); m.transparent = true; m.opacity = 0.72; m.roughness = 0.04; m.metalness = 0.3; m.emissive.set('#7fd4ff'); m.emissiveIntensity = 0.18; }
      else if (sk === 6) { m.color.set('#ffcf40'); m.metalness = 0.8; m.roughness = 0.24; m.emissive.set('#b87400'); m.emissiveIntensity = 0.55; }
      else if (sk === 7) { m.color.set('#2a0d05'); m.roughness = 0.6; m.emissive.setHSL(0.03 + 0.04 * Math.sin(t * 2.3), 1, 0.5); m.emissiveIntensity = 1.5 + Math.sin(t * 5) * 0.7; }
      else if (sk === 8) { m.color.setHSL((t * 0.35) % 1, 0.95, 0.55); m.emissive.copy(m.color); m.emissiveIntensity = 0.45; m.roughness = 0.35; }
      else m.color.set(color);
    }
  }
  function draw(el) {
    const s = state(), compact = el.dataset.toypicker === 'compact';
    el.innerHTML = `<div class="tp-row tp-fig"><button class="tp-arrow" data-tp="prev" aria-label="Previous figure">‹</button><b class="tp-name">${CHAR_NAMES[s.ch]}</b><button class="tp-arrow" data-tp="next" aria-label="Next figure">›</button>${compact ? CHAR_NAMES.map((n, i) => `<button class="tp-chip ${i === s.ch ? 'sel' : ''}" data-ch="${i}">${n}</button>`).join('') : ''}</div>`
      + `<div class="tp-row tp-skins">${SKINS.map((n, i) => `<button class="tp-sw ${i === s.sk ? 'sel' : ''}" data-sk="${i}" title="${n}" aria-label="${n} skin" style="background:${SWATCH[i]}"></button>`).join('')}<small class="tp-skinname">${SKINS[s.sk]}</small></div>`
      + `<div class="tp-row tp-lo"><small>Start with</small>${STARTERS.map(([w, n]) => `<button class="tp-chip ${w === s.lo ? 'sel' : ''}" data-lo="${w}">${n}</button>`).join('')}</div>`;
    el.querySelector('[data-tp="prev"]').onclick = () => change('tbb_char', (s.ch + 7) % 8);
    el.querySelector('[data-tp="next"]').onclick = () => change('tbb_char', (s.ch + 1) % 8);
    for (const b of el.querySelectorAll('[data-ch]')) b.onclick = () => change('tbb_char', +b.dataset.ch);
    for (const b of el.querySelectorAll('[data-sk]')) b.onclick = () => change('tbb_skin', +b.dataset.sk);
    for (const b of el.querySelectorAll('[data-lo]')) b.onclick = () => change('tbb_lo', +b.dataset.lo);
  }
  window.TOY = { CHAR_NAMES, SKINS, state, paint, onChange: (f) => listeners.push(f), draw };
  document.addEventListener('DOMContentLoaded', () => { for (const el of document.querySelectorAll('[data-toypicker]')) draw(el); });
})();
