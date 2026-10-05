// Hot Potato Trivia: a question is live; whoever holds the potato when the hidden fuse ends must answer.
const TRIVIA = require('../data/trivia');
const ANSWER_T = 10, MAX_Q = 25, PASS_CD = 0.25, SHOW_T = 2.5;

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

module.exports = {
  id: 'hotpotato',
  name: 'Hot Potato Trivia',
  tagline: 'Pass the potato fast. Whoever holds it when it pops must answer or go out.',
  min: 3, max: 8,
  controls: 'Holding the potato? Click another player to pass it. If it explodes on you, pick an answer within 10s.',
  create(api) {
    const ps = api.players();
    const alive = ps.map((p) => p.id);
    const out = []; // elimination order
    const correct = {};
    const deck = shuffle(TRIVIA.slice());
    let qIndex = 0, q = null, holder = null, fuse = 0, held = 0, phase = 'potato', timer = 0, over = false, lastPass = {};
    let answerer = null;

    const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];

    function nextQuestion(preferHolder) {
      if (over) return;
      if (alive.length <= 1 || qIndex >= MAX_Q) return finish();
      const src = deck[qIndex % deck.length]; qIndex++;
      const order = shuffle(src.options.map((_, i) => i));
      q = { q: src.q, options: order.map((i) => src.options[i]), answer: order.indexOf(src.answer), n: qIndex };
      holder = preferHolder && alive.includes(preferHolder) ? preferHolder : rnd(alive);
      fuse = 5 + Math.random() * 8; held = 0; phase = 'potato'; timer = 0; answerer = null;
      api.emit('g:event', { type: 'question', n: qIndex, q: q.q, options: q.options, holder });
    }
    function boom() {
      phase = 'answer'; timer = ANSWER_T; answerer = holder;
      api.emit('g:event', { type: 'boom', holder });
    }
    function resolve(i) {
      if (phase !== 'answer') return;
      const ok = i === q.answer;
      phase = 'show'; timer = SHOW_T;
      if (ok) correct[answerer] = (correct[answerer] || 0) + 1;
      else eliminate(answerer);
      api.emit('g:event', { type: 'result', id: answerer, ok, answer: q.answer, picked: i });
      const who = answerer;
      api.after(SHOW_T * 1000, () => nextQuestion(ok ? who : null));
    }
    function eliminate(id) {
      const k = alive.indexOf(id); if (k < 0) return;
      alive.splice(k, 1); out.push(id);
    }
    function finish() {
      if (over) return; over = true;
      const pts = {};
      const n = ps.length;
      const order = [...out];
      // survivors share top placement
      for (const id of alive) pts[id] = n;
      order.forEach((id, i) => { pts[id] = i + 1; });
      for (const id in correct) if (pts[id] !== undefined) pts[id] += correct[id];
      const names = alive.map((id) => (api.player(id) || { name: '?' }).name);
      const summary = alive.length === 1 ? `${names[0]} is the last one standing.` : alive.length > 1 ? `${names.join(', ')} survived all ${MAX_Q} questions.` : 'Everyone got cooked.';
      api.emit('g:event', { type: 'over', winners: alive });
      api.after(2000, () => api.end(pts, summary + ' Points: placement + 1 per correct answer.'));
    }

    api.after(1500, () => nextQuestion(null));

    return {
      onRejoin(pid) { if (q) api.to(pid, 'g:event', { type: 'question', n: q.n, q: q.q, options: q.options, holder }); },
      onInput(pid, msg) {
        if (over) return;
        if (msg.type === 'pass' && phase === 'potato' && pid === holder && alive.includes(msg.to) && msg.to !== pid) {
          const now = Date.now();
          if (now - (lastPass[pid] || 0) < PASS_CD * 1000) return;
          lastPass[pid] = now;
          const from = holder; holder = msg.to; held = 0;
          api.emit('g:event', { type: 'pass', from, to: holder });
        }
        if (msg.type === 'answer' && phase === 'answer' && pid === answerer && Number.isInteger(msg.i) && msg.i >= 0 && msg.i < 4) resolve(msg.i);
      },
      onLeave(pid) {
        if (over) return;
        const wasAlive = alive.includes(pid);
        eliminate(pid);
        if (!wasAlive) return;
        if (alive.length <= 1) return finish();
        if (phase === 'potato' && holder === pid) { holder = rnd(alive); held = 0; api.emit('g:event', { type: 'pass', from: null, to: holder }); }
        else if (phase === 'answer' && answerer === pid) { phase = 'show'; timer = 0.5; api.after(500, () => nextQuestion(null)); }
      },
      tick(dt) {
        if (over) return;
        if (phase === 'potato' && q) {
          fuse -= dt; held += dt;
          if (fuse <= 0) boom();
        } else if (phase === 'answer') {
          timer -= dt;
          if (timer <= 0) resolve(-1);
        } else if (phase === 'show') timer -= dt;
        api.emit('g:state', { phase, holder, held: Math.round(held * 10) / 10, timer: Math.max(0, Math.round(timer * 10) / 10), alive, out, answerer, n: qIndex, correct });
      },
      destroy() {},
    };
  },
};
