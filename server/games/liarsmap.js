// Liar's Map: everyone races the same maze, except one player who sees a subtly different one.
const COLS = 21, ROWS = 15, CELL = 40, OX = 30, OY = 0;
const STEP = 0.11, RACE_T = 120, VOTE_T = 15, REVEAL_T = 6, GRACE_T = 10;
const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
const DI = { N: 0, E: 1, S: 2, W: 3 };

function genMaze() {
  // walls[y][x] = 4-bit mask N=1,E=2,S=4,W=8 (bit set = wall present)
  const walls = [];
  for (let y = 0; y < ROWS; y++) { walls.push([]); for (let x = 0; x < COLS; x++) walls[y].push(15); }
  const seen = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const stack = [[0, 0]]; seen[0][0] = true;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const opts = [];
    for (const d of 'NESW') { const [dx, dy] = DIRS[d]; const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && !seen[ny][nx]) opts.push([d, nx, ny]); }
    if (!opts.length) { stack.pop(); continue; }
    const [d, nx, ny] = opts[Math.floor(Math.random() * opts.length)];
    walls[y][x] &= ~(1 << DI[d]); walls[ny][nx] &= ~(1 << DI[OPP[d]]);
    seen[ny][nx] = true; stack.push([nx, ny]);
  }
  return walls;
}
const hasWall = (walls, x, y, d) => (walls[y][x] >> DI[d]) & 1;
function setWall(walls, x, y, d, on) {
  const [dx, dy] = DIRS[d]; const nx = x + dx, ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return;
  if (on) { walls[y][x] |= 1 << DI[d]; walls[ny][nx] |= 1 << DI[OPP[d]]; }
  else { walls[y][x] &= ~(1 << DI[d]); walls[ny][nx] &= ~(1 << DI[OPP[d]]); }
}
function solve(walls) {
  const prev = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const q = [[0, 0]]; prev[0][0] = [-1, -1];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === COLS - 1 && y === ROWS - 1) break;
    for (const d of 'NESW') {
      if (hasWall(walls, x, y, d)) continue;
      const [dx, dy] = DIRS[d]; const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || prev[ny][nx]) continue;
      prev[ny][nx] = [x, y]; q.push([nx, ny]);
    }
  }
  const path = []; let c = [COLS - 1, ROWS - 1];
  while (c && c[0] >= 0) { path.push(c); c = prev[c[1]][c[0]]; }
  return path.reverse();
}
function dirBetween(a, b) { for (const d in DIRS) if (a[0] + DIRS[d][0] === b[0] && a[1] + DIRS[d][1] === b[1]) return d; return null; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function makeLiarMaze(M, path) {
  const L = M.map((r) => r.slice());
  const diffs = []; // {x,y,d,kind:'added'|'removed'}
  const onPath = new Set(path.map(([x, y]) => x + ',' + y));
  // add 3 walls on the solution path, spaced out, away from first 3 cells
  const idx = shuffle(path.slice(3, -1).map((_, i) => i + 3)).sort((a, b) => a - b);
  const picked = [];
  for (const i of idx) { if (picked.every((p) => Math.abs(p - i) >= 4)) picked.push(i); if (picked.length === 3) break; }
  for (const i of picked) {
    const d = dirBetween(path[i], path[i + 1]);
    setWall(L, path[i][0], path[i][1], d, true);
    diffs.push({ x: path[i][0], y: path[i][1], d, kind: 'added' });
  }
  // remove 3-4 real walls adjacent to the path (fake shortcuts)
  const want = 3 + Math.floor(Math.random() * 2);
  const cand = shuffle(path.slice(3).flatMap(([x, y]) => 'NESW'.split('').map((d) => ({ x, y, d }))));
  let n = 0;
  for (const c of cand) {
    if (n >= want) break;
    const [dx, dy] = DIRS[c.d]; const nx = c.x + dx, ny = c.y + dy;
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
    if (!hasWall(M, c.x, c.y, c.d) || !hasWall(L, c.x, c.y, c.d)) continue;
    if (diffs.some((f) => f.x === c.x && f.y === c.y)) continue;
    setWall(L, c.x, c.y, c.d, false);
    diffs.push({ x: c.x, y: c.y, d: c.d, kind: 'removed' }); n++;
  }
  return { L, diffs };
}

module.exports = {
  id: 'liarsmap',
  name: "Liar's Map",
  tagline: 'Race the maze. One player sees a different map. Spot who walks into walls.',
  min: 3, max: 8,
  controls: 'Hold WASD / arrows to move. Reach the green exit. Then vote for the liar.',
  create(api) {
    const M = genMaze();
    const path = solve(M);
    const { L, diffs } = makeLiarMaze(M, path);
    const ps = api.players();
    const liar = ps[Math.floor(Math.random() * ps.length)].id;
    const players = new Map();
    for (const p of ps) players.set(p.id, { id: p.id, x: 0, y: 0, dir: null, acc: 0, finished: 0, votes: null });
    const finishers = [];
    let phase = 'race', t = 0, graceLeft = null, over = false;
    const votes = {}; // voter -> accused

    for (const p of ps) api.to(p.id, 'g:event', { type: 'maze', walls: p.id === liar ? L : M, cols: COLS, rows: ROWS, liar: p.id === liar });

    function startVote() {
      if (phase !== 'race') return;
      phase = 'vote'; t = 0;
      for (const p of players.values()) p.dir = null;
      api.emit('g:event', { type: 'phase', phase: 'vote' });
    }
    function tally() {
      if (phase !== 'vote') return;
      phase = 'reveal'; t = 0;
      const pts = {};
      const liarPlayer = players.get(liar);
      const others = [...players.keys()].filter((id) => id !== liar);
      const accusers = others.filter((id) => votes[id] === liar);
      finishers.forEach((id, i) => { pts[id] = (pts[id] || 0) + ([4, 2, 1][i] || 0); });
      for (const id of accusers) pts[id] = (pts[id] || 0) + 2;
      const caught = accusers.length * 2 >= others.length && others.length > 0;
      let liarPts = 0;
      if (liarPlayer && !caught) liarPts += 3;
      if (liarPlayer && finishers[0] === liar) liarPts += 2;
      if (liarPlayer) pts[liar] = (pts[liar] || 0) + liarPts;
      const liarName = (api.player(liar) || { name: 'The liar' }).name;
      const first = finishers[0] ? (api.player(finishers[0]) || {}).name : null;
      const summary = (liarPlayer ? `${liarName} was the liar and ${caught ? 'got caught' : 'got away with it'} (${accusers.length}/${others.length} voted right).` : 'The liar left the game early.') + (first ? ` ${first} reached the exit first.` : ' Nobody reached the exit.');
      api.emit('g:event', { type: 'reveal', liar, diffs, trueWalls: M, votes, finishers });
      api.after(REVEAL_T * 1000, () => { over = true; api.end(pts, summary); });
    }

    return {
      onRejoin(pid) { if (players.has(pid)) api.to(pid, 'g:event', { type: 'maze', walls: pid === liar ? L : M, cols: COLS, rows: ROWS, liar: pid === liar }); },
      onInput(pid, msg) {
        const p = players.get(pid); if (!p || over) return;
        if (msg.type === 'dir' && phase === 'race') { p.dir = DIRS[msg.d] ? msg.d : null; if (p.dir && p.acc < STEP) p.acc = STEP; }
        if (msg.type === 'vote' && phase === 'vote' && players.has(msg.to) && msg.to !== pid) {
          votes[pid] = msg.to;
          api.emit('g:event', { type: 'voted', by: pid });
          if ([...players.keys()].every((id) => votes[id])) tally();
        }
      },
      onLeave(pid) {
        players.delete(pid); delete votes[pid];
        if (players.size === 0) return;
        if (pid === liar && !over) { if (phase === 'race') startVote(); if (phase === 'vote') tally(); return; }
        if (phase === 'vote' && [...players.keys()].every((id) => votes[id])) tally();
      },
      tick(dt) {
        if (over) return;
        t += dt;
        if (phase === 'race') {
          if (graceLeft !== null) graceLeft -= dt;
          for (const p of players.values()) {
            if (p.finished) continue;
            if (!p.dir) { p.acc = 0; continue; }
            p.acc += dt;
            if (p.acc >= STEP) {
              p.acc = 0;
              if (hasWall(M, p.x, p.y, p.dir)) { if (p.id === liar && !hasWall(L, p.x, p.y, p.dir)) api.to(p.id, 'g:event', { type: 'bonk' }); }
              else {
                p.x += DIRS[p.dir][0]; p.y += DIRS[p.dir][1];
                if (p.x === COLS - 1 && p.y === ROWS - 1) {
                  p.finished = finishers.length + 1; finishers.push(p.id); p.dir = null;
                  api.emit('g:event', { type: 'finish', id: p.id, place: p.finished });
                  if (graceLeft === null) graceLeft = GRACE_T;
                }
              }
            }
          }
          const allDone = [...players.values()].every((p) => p.finished);
          if (t >= RACE_T || allDone || (graceLeft !== null && graceLeft <= 0)) startVote();
        } else if (phase === 'vote') {
          if (t >= VOTE_T) tally();
        }
        api.emit('g:state', {
          phase, t,
          left: phase === 'race' ? Math.max(0, graceLeft === null ? RACE_T - t : Math.min(RACE_T - t, graceLeft)) : phase === 'vote' ? Math.max(0, VOTE_T - t) : Math.max(0, REVEAL_T - t),
          players: [...players.values()].map((p) => ({ id: p.id, x: p.x, y: p.y, fin: p.finished, voted: !!votes[p.id] })),
        });
      },
      destroy() {},
    };
  },
};
