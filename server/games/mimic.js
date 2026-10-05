// Mimic: the leader draws a shape in the air, everyone copies it from memory, worst copy is out.
const words = null;
const LEADER_T = 4, WATCH_T = 2.5, COPY_T = 5, REVEAL_T = 4, N = 64;

function genShape() {
  const kinds = ['circle', 'star', 'zigzag', 'spiral', 'heart', 'letter'];
  const k = kinds[Math.floor(Math.random() * kinds.length)];
  const pts = [];
  const push = (x, y) => pts.push([0.5 + x * 0.3, 0.5 + y * 0.3]);
  if (k === 'circle') for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2; push(Math.cos(a), Math.sin(a)); }
  else if (k === 'star') for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + i * (4 * Math.PI / 5); push(Math.cos(a), Math.sin(a)); }
  else if (k === 'zigzag') { const n = 3 + Math.floor(Math.random() * 3); for (let i = 0; i <= n; i++) push(-1 + 2 * i / n, i % 2 ? 1 : -1); }
  else if (k === 'spiral') for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 5, r = i / 60; push(Math.cos(a) * r, Math.sin(a) * r); }
  else if (k === 'heart') for (let i = 0; i <= 50; i++) { const t = i / 50 * Math.PI * 2; push(16 * Math.pow(Math.sin(t), 3) / 17, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17); }
  else { // letter-like: M, W, N, Z, V
    const L = { M: [[-1, 1], [-1, -1], [0, 0.2], [1, -1], [1, 1]], W: [[-1, -1], [-0.5, 1], [0, -0.2], [0.5, 1], [1, -1]], N: [[-1, 1], [-1, -1], [1, 1], [1, -1]], Z: [[-1, -1], [1, -1], [-1, 1], [1, 1]], V: [[-1, -1], [0, 1], [1, -1]] };
    const keys = Object.keys(L); const s = L[keys[Math.floor(Math.random() * keys.length)]];
    for (const [x, y] of s) push(x, y);
  }
  return pts;
}

function resample(path, n) {
  if (!path || path.length < 2) return null;
  let total = 0; const seg = [];
  for (let i = 1; i < path.length; i++) { const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); seg.push(d); total += d; }
  if (total === 0) return null;
  const step = total / (n - 1), out = [path[0]];
  let acc = 0;
  for (let i = 1; i < path.length && out.length < n; i++) {
    let d = seg[i - 1];
    let [ax, ay] = path[i - 1]; const [bx, by] = path[i];
    while (acc + d >= step && out.length < n) {
      const t = (step - acc) / d;
      const nx = ax + (bx - ax) * t, ny = ay + (by - ay) * t;
      out.push([nx, ny]); ax = nx; ay = ny; d -= (step - acc); acc = 0;
    }
    acc += d;
  }
  while (out.length < n) out.push(path[path.length - 1]);
  return out;
}
function normalize(pts) {
  let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (const p of pts) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
  const s = Math.max(maxx - minx, maxy - miny) || 1;
  return pts.map((p) => [(p[0] - cx) / s, (p[1] - cy) / s]);
}
function similarity(orig, copy) {
  const a = resample(orig, N), b = resample(copy, N);
  if (!a || !b) return 0;
  const na = normalize(a);
  const score = (pts) => { const nb = normalize(pts); let d = 0; for (let i = 0; i < N; i++) d += Math.hypot(na[i][0] - nb[i][0], na[i][1] - nb[i][1]); return d / N; };
  let d = Math.min(score(b), score(b.slice().reverse()));
  // closed loops (circles, hearts, stars): the start point shouldn't matter either
  const closed = (p) => Math.hypot(p[0][0] - p[N - 1][0], p[0][1] - p[N - 1][1]) < 0.2;
  if (closed(na) && closed(normalize(b))) {
    for (let sh = 4; sh < N; sh += 4) {
      const r = b.slice(sh).concat(b.slice(0, sh));
      d = Math.min(d, score(r), score(r.slice().reverse()));
    }
  }
  return Math.max(0, Math.round(100 - d * 220));
}
function cleanPath(p) {
  if (!Array.isArray(p)) return null;
  const out = [];
  for (const q of p.slice(0, 600)) {
    if (!Array.isArray(q) || q.length < 2) continue;
    const x = +q[0], y = +q[1];
    if (Number.isFinite(x) && Number.isFinite(y)) out.push([Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]);
  }
  return out.length >= 8 ? out : null;
}

module.exports = {
  id: 'mimic',
  name: 'Mimic',
  tagline: 'Leader draws a move in the air. Copy it from memory. Worst copy is out.',
  min: 3, max: 8,
  controls: 'Hold the mouse and draw one stroke. Watch carefully — the shape is hidden while you copy.',
  create(api) {
    const ps = api.players();
    let survivors = ps.map((p) => p.id);
    const eliminated = []; // in order of elimination
    let phase = 'intro', timeLeft = 2, leader = null, leaderIdx = -1, original = null, faceoff = false;
    let copies = {}; // pid -> path
    let scores = {}; // pid -> similarity
    let over = false, sendAcc = 0;

    const setPhase = (p, t) => { phase = p; timeLeft = t; api.emit('g:state', snap(true)); };

    function startRound() {
      copies = {}; scores = {}; original = null;
      if (survivors.length <= 1) return finish();
      if (survivors.length === 2) {
        faceoff = true; leader = null; original = genShape();
        return setPhase('watch', WATCH_T);
      }
      faceoff = false;
      leaderIdx = (leaderIdx + 1) % survivors.length;
      leader = survivors[leaderIdx];
      setPhase('leader', LEADER_T);
    }
    function leaderDone(path) {
      original = path || genShape();
      setPhase('watch', WATCH_T);
    }
    function reveal() {
      const copiers = survivors.filter((id) => id !== leader);
      for (const id of copiers) scores[id] = copies[id] ? similarity(original, copies[id]) : 0;
      let worst = null;
      const minScore = Math.min(...copiers.map((id) => scores[id]));
      const worstPool = copiers.filter((id) => scores[id] === minScore);
      worst = worstPool[Math.floor(Math.random() * worstPool.length)];
      if (worst) {
        eliminated.push(worst);
        const wi = survivors.indexOf(worst);
        survivors.splice(wi, 1);
        if (wi <= leaderIdx) leaderIdx--;
        api.emit('g:event', { type: 'eliminated', id: worst, score: scores[worst] });
      }
      setPhase('reveal', REVEAL_T);
    }
    function finish() {
      if (over) return; over = true;
      const order = [...survivors, ...eliminated.slice().reverse()];
      const pts = {};
      order.forEach((id, i) => { pts[id] = i === 0 ? 5 : i === 1 ? 3 : i === 2 ? 2 : 1; });
      const w = api.player(order[0]);
      api.end(pts, w ? `${w.name} is the best mimic.` : 'Everyone left.');
    }

    return {
      onInput(pid, msg) {
        if (over || msg.type !== 'path') return;
        const path = cleanPath(msg.path);
        if (phase === 'leader' && pid === leader) { leaderDone(path); return; }
        if (phase === 'copy' && survivors.includes(pid) && pid !== leader && !copies[pid]) {
          if (path) copies[pid] = path; else copies[pid] = [];
          api.emit('g:event', { type: 'submitted', id: pid });
          const copiers = survivors.filter((id) => id !== leader);
          if (copiers.every((id) => copies[id])) reveal();
        }
      },
      onLeave(pid) {
        if (over) return;
        const si = survivors.indexOf(pid);
        if (si >= 0) { survivors.splice(si, 1); if (si <= leaderIdx) leaderIdx--; }
        delete copies[pid];
        if (survivors.length <= 1) return finish();
        if (pid === leader && phase === 'leader') leaderDone(null);
        else if (pid === leader) { /* leader left during watch/copy: round continues with its shape */ }
        if (phase === 'copy') { const copiers = survivors.filter((id) => id !== leader); if (copiers.length && copiers.every((id) => copies[id])) reveal(); }
      },
      tick(dt) {
        if (over) return;
        timeLeft -= dt;
        sendAcc += dt;
        if (timeLeft <= 0) {
          if (phase === 'intro') startRound();
          else if (phase === 'leader') leaderDone(null);
          else if (phase === 'watch') setPhase('copy', COPY_T);
          else if (phase === 'copy') reveal();
          else if (phase === 'reveal') startRound();
          return;
        }
        if (sendAcc >= 0.25) { sendAcc = 0; api.emit('g:state', snap(false)); }
      },
      destroy() {},
    };

    function snap(full) {
      const s = { phase, timeLeft: Math.max(0, +timeLeft.toFixed(2)), leader, faceoff, survivors, eliminated, submitted: Object.keys(copies) };
      if (phase === 'watch' || phase === 'reveal') s.original = original;
      if (phase === 'reveal') { s.copies = copies; s.scores = scores; }
      void full;
      return s;
    }
  },
};

module.exports._test = { similarity, genShape };
