// Home page: the two primary games. The selected tab drives the hero text, the 3D showcase (kart-home.js reads
// window.selectedGame) and which game Play now / Play with friends start (app.js reads it too).
(function () {
  const $ = (s) => document.querySelector(s);
  const COPY = {
    memekarts: {
      eyebrow: 'YOUR FRIENDS. YOUR RIVALS.', title: 'MEME<br><span>KARTS</span><i>✦</i>', desc: "Small karts. Big chaos.<br>Grab a ridiculous weapon. Ruin a friend's lap.",
      label: 'YOUR DRIVER NAME', meta: `2–16 drivers <span>•</span> ${window.MEMEKARTS_MAPS.length} arenas <span>•</span> Absolutely no brakes*`,
      badge: '<span>MEET YOUR NEW BAD IDEA</span><b>The rocket sled.</b><small>One of eight ridiculous rides.</small>', sticker: 'READY.<br>SET.<br>CHAOS.',
      how: '<b>THE RULES ARE SIMPLE.</b><span><kbd>W A S D</kbd> Drive</span><span><kbd>?</kbd> Grab an item</span><span><kbd>SPACE</kbd> Make it personal</span><small>* Okay, S reverses.</small>',
      foot: 'MEME KARTS', explore: ['#arenas', 'Explore arenas ↗'],
    },
    blasters: {
      eyebrow: 'SMALL TOYS. BIG GRUDGES.', title: 'TOY BOX<br><span>BLASTERS</span><i>✦</i>', desc: 'Foam darts. First person. No mercy.<br>Find a better blaster. Tag everyone you know.',
      label: 'YOUR NAME', meta: '2–16 players <span>•</span> first to 20 tags <span>•</span> Nobody gets hurt*',
      badge: '<span>PICK YOUR FIGURE</span><b>The wizard.</b><small>One of eight toys, in nine finishes.</small>', sticker: 'AIM.<br>TAG.<br>GLOAT.',
      how: '<b>THE RULES ARE SIMPLE.</b><span><kbd>W A S D</kbd> Move</span><span><kbd>MOUSE</kbd> Aim and fire</span><span><kbd>SPACE</kbd> Jump, twice</span><span><kbd>H</kbd> What everything does</span><small>* Except feelings.</small>',
      foot: 'TOY BOX BLASTERS', explore: ['#toybox', "What's in the box ↗"],
    },
  };
  function select(g, save) {
    if (!COPY[g]) g = 'memekarts';
    window.selectedGame = g; const c = COPY[g];
    if (save) { try { localStorage.setItem('fg_game', g); } catch (e) { /* storage blocked */ } }
    $('#heroEyebrow').textContent = c.eyebrow; $('#heroTitle').innerHTML = c.title; $('#heroDesc').innerHTML = c.desc; $('#nameLabel').textContent = c.label; $('#heroMeta').innerHTML = c.meta;
    $('#heroBadge').innerHTML = c.badge; $('#heroSticker').innerHTML = c.sticker; $('#howTo').innerHTML = c.how; $('#footName').textContent = c.foot;
    $('#exploreLink').setAttribute('href', c.explore[0]); $('#exploreLink').textContent = c.explore[1];
    $('#home').classList.toggle('blasters', g === 'blasters');
    $('#arenas').classList.toggle('hidden', g !== 'memekarts'); $('#toybox').classList.toggle('hidden', g !== 'blasters');
    for (const b of document.querySelectorAll('#gamePick [data-game]')) { const on = b.dataset.game === g; b.classList.toggle('sel', on); b.setAttribute('aria-selected', on); }
  }
  for (const b of document.querySelectorAll('#gamePick [data-game]')) b.onclick = () => select(b.dataset.game, true);
  let saved = 'memekarts'; try { saved = localStorage.getItem('fg_game') || 'memekarts'; } catch (e) { /* ignore */ }
  select(new URLSearchParams(location.search).get('game') || saved, false);
  // shooter maps on the home page: the choice goes to the room when you press Play now or Play with friends
  function blCards() { const el = $('#homeBlMaps'); if (!el || !window.blMapCard || !window.BLASTERS) return; el.innerHTML = window.BLASTERS.MAPS.map((m) => window.blMapCard(m, m.id === (window.selectedBlMap || 'fort'))).join(''); for (const b of el.querySelectorAll('[data-map]')) b.onclick = () => { window.selectedBlMap = b.dataset.map; try { localStorage.setItem('fg_blmap', b.dataset.map); } catch (e) { /* ignore */ } blCards(); }; }
  try { window.selectedBlMap = localStorage.getItem('fg_blmap') || 'fort'; } catch (e) { window.selectedBlMap = 'fort'; }
  window.addEventListener('load', () => { blCards(); for (const e of document.querySelectorAll('.n-karts')) e.textContent = window.MEMEKARTS_MAPS.length; for (const e of document.querySelectorAll('.n-bl')) e.textContent = window.BLASTERS ? window.BLASTERS.MAPS.length : 3; }); /* the ribbon counts the real maps */
})();
