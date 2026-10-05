// Three Lines: skribbl with exactly three straight lines per drawer.
const WORDS = require('../data/words');
const TURN_T = 60, REVEAL_T = 3, HINT_AT = 30;

function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

module.exports = {
  id: 'threelines',
  name: 'Three Lines',
  tagline: 'Skribbl, but the drawer only gets three straight lines.',
  min: 3, max: 8,
  controls: 'Drawer: click-drag to place a line (3 total). Everyone else: type guesses and press Enter.',
  create(api) {
    const order = api.players().map((p) => p.id);
    const pts = {}; order.forEach((id) => (pts[id] = 0));
    const deck = WORDS.slice().sort(() => Math.random() - 0.5);
    let turn = -1, drawer = null, word = '', lines = [], guessed = new Set(), feed = [], phase = 'turn', timeLeft = 0, hint = -1, over = false, sendAcc = 0;

    const guessers = () => api.players().map((p) => p.id).filter((id) => id !== drawer && order.includes(id));
    const mask = () => word.split('').map((c, i) => (c === ' ' ? ' ' : i === hint ? c : '_')).join('');

    function nextTurn() {
      turn++;
      // skip players who left
      while (turn < order.length && !api.player(order[turn])) turn++;
      if (turn >= order.length || api.players().filter((p) => order.includes(p.id)).length < 2) return finish();
      drawer = order[turn]; word = deck[turn % deck.length]; lines = []; guessed = new Set(); feed = []; hint = -1;
      phase = 'turn'; timeLeft = TURN_T;
      api.emit('g:event', { type: 'turn', drawer });
      broadcast();
    }
    function endTurn() {
      phase = 'reveal'; timeLeft = REVEAL_T; broadcast();
    }
    function finish() {
      if (over) return; over = true;
      const best = Object.entries(pts).sort((a, b) => b[1] - a[1])[0];
      const w = best && api.player(best[0]);
      api.end(pts, w ? `${w.name} wins with ${best[1]} points.` : 'Game over.');
    }
    function broadcast() {
      api.emit('g:state', snap());
      if (drawer) api.to(drawer, 'g:event', { type: 'word', word });
    }
    function push(entry) { feed.push(entry); if (feed.length > 8) feed.shift(); }

    api.after(10, nextTurn);
    return {
      _word: () => word, // test-mode bots peek at this
      onRejoin(pid) { if (pid === drawer && phase === 'turn') api.to(pid, 'g:event', { type: 'word', word }); },
      onInput(pid, msg) {
        if (over || phase !== 'turn') return;
        if (msg.type === 'line' && pid === drawer && lines.length < 3) {
          // keep both ends on the paper (x 0..660, y 50..600) so a line cannot run across the scoreboard
          const l = [msg.x1, msg.y1, msg.x2, msg.y2].map((v, i) => Math.round(i % 2 === 0 ? Math.max(4, Math.min(656, +v || 0)) : Math.max(54, Math.min(596, +v || 0))));
          if (Math.hypot(l[2] - l[0], l[3] - l[1]) < 4) return;
          lines.push(l); broadcast();
        }
        if (msg.type === 'guess' && pid !== drawer && order.includes(pid)) {
          const text = String(msg.text || '').trim().slice(0, 40);
          if (!text) return;
          const p = api.player(pid); if (!p) return;
          if (guessed.has(pid)) { push({ id: pid, text, kind: 'chat' }); broadcast(); return; }
          const g = text.toLowerCase(), w = word.toLowerCase();
          if (g === w) {
            guessed.add(pid);
            pts[pid] += 100 + Math.round(timeLeft * 2);
            if (pts[drawer] !== undefined) pts[drawer] += 40;
            push({ id: pid, kind: 'correct' });
            api.emit('g:event', { type: 'correct', id: pid });
            broadcast();
            if (guessers().every((id) => guessed.has(id))) endTurn();
          } else {
            push({ id: pid, text, kind: 'guess' });
            if (lev(g, w) <= 2) api.to(pid, 'g:event', { type: 'close' });
            broadcast();
          }
        }
      },
      onLeave(pid) {
        if (over) return;
        if (api.players().filter((p) => order.includes(p.id)).length < 2) return finish();
        if (pid === drawer && phase === 'turn') endTurn();
        else if (phase === 'turn' && guessers().length && guessers().every((id) => guessed.has(id))) endTurn();
      },
      tick(dt) {
        if (over || !drawer) return;
        timeLeft -= dt; sendAcc += dt;
        if (phase === 'turn' && hint < 0 && timeLeft <= TURN_T - HINT_AT) {
          const idx = word.split('').map((c, i) => (c === ' ' ? -1 : i)).filter((i) => i >= 0);
          hint = idx[Math.floor(Math.random() * idx.length)]; broadcast();
        }
        if (timeLeft <= 0) { if (phase === 'turn') endTurn(); else nextTurn(); return; }
        if (sendAcc >= 1) { sendAcc = 0; api.emit('g:state', snap()); }
      },
      destroy() {},
    };
    function snap() {
      return { phase, timeLeft: Math.max(0, Math.round(timeLeft)), drawer, turn: turn + 1, turns: order.length, lines, mask: mask(), word: phase === 'reveal' ? word : null, guessed: [...guessed], feed, pts };
    }
  },
};
