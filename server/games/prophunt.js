// Prop Hunt Arena: hiders disguise as reference props among decoys; seekers shoot what looks wrong.
const W = 900, H = 600;
const PROPS = [
  { kind: 'dirt', name: 'Dirt block', r: 16 }, { kind: 'console', name: 'Game console', r: 16 }, { kind: 'pizza', name: 'Pizza slice', r: 16 },
  { kind: 'duck', name: 'Rubber duck', r: 15 }, { kind: 'cone', name: 'Traffic cone', r: 15 }, { kind: 'box', name: 'Cardboard box', r: 17 },
  { kind: 'plant', name: 'Potted plant', r: 16 }, { kind: 'trash', name: 'Trash can', r: 16 },
];
const HIDE = 20, HUNT = 90, H_SPEED = 190, S_SPEED = 230, S_R = 15, BULLET = 650, CD = 0.35, HP = 25, TAUNT_CD = 10;

function makeWalls() {
  return [
    { x: 0, y: 0, w: W, h: 12 }, { x: 0, y: H - 12, w: W, h: 12 }, { x: 0, y: 0, w: 12, h: H }, { x: W - 12, y: 0, w: 12, h: H },
    { x: 180, y: 100, w: 20, h: 140 }, { x: 330, y: 70, w: 150, h: 20 }, { x: 460, y: 180, w: 20, h: 130 },
    { x: 600, y: 120, w: 170, h: 20 }, { x: 760, y: 120, w: 20, h: 150 }, { x: 110, y: 360, w: 190, h: 20 },
    { x: 280, y: 450, w: 20, h: 110 }, { x: 420, y: 400, w: 150, h: 20 }, { x: 640, y: 350, w: 20, h: 150 }, { x: 700, y: 470, w: 150, h: 20 },
  ];
}
function inWall(x, y, r, walls) { return walls.some((w) => x + r > w.x && x - r < w.x + w.w && y + r > w.y && y - r < w.y + w.h); }
function collide(p, walls, r) {
  for (const w of walls) {
    const cx = Math.max(w.x, Math.min(p.x, w.x + w.w)), cy = Math.max(w.y, Math.min(p.y, w.y + w.h));
    const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
    if (d < r) {
      if (d === 0) { const l = p.x - w.x, rr = w.x + w.w - p.x, t = p.y - w.y, b = w.y + w.h - p.y, m = Math.min(l, rr, t, b);
        if (m === l) p.x = w.x - r; else if (m === rr) p.x = w.x + w.w + r; else if (m === t) p.y = w.y - r; else p.y = w.y + w.h + r; }
      else { p.x = cx + (dx / d) * r; p.y = cy + (dy / d) * r; }
    }
  }
  p.x = Math.max(r, Math.min(W - r, p.x)); p.y = Math.max(r, Math.min(H - r, p.y));
}

module.exports = {
  id: 'prophunt',
  name: 'Prop Hunt Arena',
  tagline: 'Hiders become props among decoys. Seekers shoot what looks wrong.',
  min: 3, max: 8,
  controls: 'WASD / arrows to move. Hiders: 1-8 to pick a prop, T to taunt. Seekers: click to shoot (misses cost HP).',
  create(api) {
    const walls = makeWalls();
    const all = api.players();
    const nSeek = Math.max(1, Math.ceil(all.length / 4));
    const shuffled = all.slice().sort(() => Math.random() - 0.5);
    const seekerIds = new Set(shuffled.slice(0, nSeek).map((p) => p.id));
    const players = new Map();
    function freeSpot(r) { for (let i = 0; i < 200; i++) { const x = 40 + Math.random() * (W - 80), y = 40 + Math.random() * (H - 80); if (!inWall(x, y, r + 6, walls)) return { x, y }; } return { x: W / 2, y: H / 2 }; }
    for (const p of all) {
      const seeker = seekerIds.has(p.id);
      const sp = seeker ? { x: 60, y: 60 } : freeSpot(16);
      players.set(p.id, { id: p.id, seeker, x: sp.x, y: sp.y, dx: 0, dy: 0, aim: 0, kind: PROPS[Math.floor(Math.random() * PROPS.length)].kind, alive: true, hp: HP, cd: 0, tauntCd: 0, taunt: 0, taunts: 0, finds: 0 });
    }
    const decoys = []; const nDec = 25 + Math.floor(Math.random() * 11);
    for (let i = 0; i < nDec; i++) { const s = freeSpot(18); decoys.push({ x: Math.round(s.x), y: Math.round(s.y), kind: PROPS[Math.floor(Math.random() * PROPS.length)].kind }); }
    const order = []; // stable shuffled key order for anonymous props: decoy indexes and hider ids
    for (let i = 0; i < decoys.length; i++) order.push({ d: i }); for (const p of players.values()) if (!p.seeker) order.push({ h: p.id });
    order.sort(() => Math.random() - 0.5);
    const bullets = [];
    let phase = 'hide', t = 0, over = false;
    api.emit('g:event', { type: 'init', walls, props: PROPS.map((p) => ({ kind: p.kind, name: p.name, r: p.r })) });

    const seekers = () => [...players.values()].filter((p) => p.seeker);
    const hiders = () => [...players.values()].filter((p) => !p.seeker);
    const pr = (kind) => PROPS.find((p) => p.kind === kind) || PROPS[0];

    function finish(hidersWin) {
      if (over) return; over = true;
      const pts = {};
      for (const p of players.values()) {
        if (p.seeker) pts[p.id] = (hidersWin ? 0 : 5) + p.finds * 2;
        else pts[p.id] = (p.alive && hidersWin ? 4 : 0) + p.taunts;
      }
      api.emit('g:event', { type: 'over', hidersWin, reveal: hiders().map((h) => ({ id: h.id, x: Math.round(h.x), y: Math.round(h.y), kind: h.kind })) });
      api.after(2500, () => api.end(pts, hidersWin ? 'The props survived. Survivors +4, +1 per taunt.' : 'Every prop was found. Seekers +5, +2 per find.'));
    }

    function snapFor(viewer) {
      const base = { phase, t, timeLeft: phase === 'hide' ? HIDE - t : HUNT - t, bullets: bullets.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y) })),
        seekers: seekers().map((p) => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y), aim: Math.round(p.aim * 100) / 100, hp: p.hp, alive: p.alive, finds: p.finds })),
        hidersLeft: hiders().filter((h) => h.alive).length, hidersTotal: hiders().length };
      const anon = viewer && viewer.seeker && viewer.alive;
      const props = [];
      for (const o of order) {
        if (o.d !== undefined) { const d = decoys[o.d]; props.push({ x: d.x, y: d.y, kind: d.kind }); }
        else { const h = players.get(o.h); if (!h) continue;
          const e = { x: Math.round(h.x), y: Math.round(h.y), kind: h.kind, taunt: h.taunt > 0 };
          if (!h.alive) { e.dead = true; e.id = h.id; } else if (!anon) { e.id = h.id; }
          props.push(e); }
      }
      base.props = props;
      if (viewer) base.you = { seeker: viewer.seeker, alive: viewer.alive, kind: viewer.kind, hp: viewer.hp, cd: Math.max(0, viewer.cd), tauntCd: Math.max(0, viewer.tauntCd), x: Math.round(viewer.x), y: Math.round(viewer.y) };
      return base;
    }
    function broadcast() { for (const p of players.values()) api.to(p.id, 'g:state', snapFor(p)); }

    return {
      onJoin(pid) { api.to(pid, 'g:event', { type: 'init', walls, props: PROPS.map((p) => ({ kind: p.kind, name: p.name, r: p.r })) }); },
      onRejoin(pid) { api.to(pid, 'g:event', { type: 'init', walls, props: PROPS.map((p) => ({ kind: p.kind, name: p.name, r: p.r })) }); },
      onInput(pid, msg) {
        const p = players.get(pid); if (!p || over || !p.alive) return;
        if (msg.type === 'move') { const d = Math.hypot(msg.dx || 0, msg.dy || 0); p.dx = d > 0 ? msg.dx / d : 0; p.dy = d > 0 ? msg.dy / d : 0; }
        else if (msg.type === 'aim' && typeof msg.a === 'number' && isFinite(msg.a)) p.aim = msg.a;
        else if (msg.type === 'pick' && !p.seeker && phase === 'hide' && PROPS.some((q) => q.kind === msg.kind)) p.kind = msg.kind;
        else if (msg.type === 'taunt' && !p.seeker && phase === 'hunt' && p.tauntCd <= 0) { p.tauntCd = TAUNT_CD; p.taunt = 0.5; p.taunts++; api.emit('g:event', { type: 'taunt', x: Math.round(p.x), y: Math.round(p.y) }); }
        else if (msg.type === 'shoot' && p.seeker && phase === 'hunt' && p.cd <= 0) {
          p.cd = CD; const a = p.aim;
          bullets.push({ x: p.x + Math.cos(a) * (S_R + 4), y: p.y + Math.sin(a) * (S_R + 4), vx: Math.cos(a) * BULLET, vy: Math.sin(a) * BULLET, owner: p.id, life: 1.5 });
        }
      },
      onLeave(pid) {
        const p = players.get(pid); players.delete(pid);
        if (!p || over) return;
        if (p.seeker && seekers().filter((s) => s.alive).length === 0) finish(true);
        else if (!p.seeker && hiders().filter((h) => h.alive).length === 0) finish(false);
      },
      tick(dt) {
        if (over) return;
        t += dt;
        if (phase === 'hide' && t >= HIDE) { phase = 'hunt'; t = 0; api.emit('g:event', { type: 'hunt' }); }
        for (const p of players.values()) {
          if (!p.alive) continue;
          if (p.seeker && phase === 'hide') continue;
          const sp = p.seeker ? S_SPEED : H_SPEED, r = p.seeker ? S_R : pr(p.kind).r;
          p.x += p.dx * sp * dt; p.y += p.dy * sp * dt; collide(p, walls, r);
          p.cd -= dt; p.tauntCd -= dt; p.taunt = Math.max(0, p.taunt - dt);
        }
        if (phase === 'hunt') {
          for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
            const owner = players.get(b.owner);
            let hit = false;
            for (const h of hiders()) {
              if (!h.alive) continue;
              if (Math.hypot(h.x - b.x, h.y - b.y) < pr(h.kind).r + 3) {
                h.alive = false; hit = true; if (owner) owner.finds++;
                api.emit('g:event', { type: 'hit', id: h.id, x: Math.round(h.x), y: Math.round(h.y), by: b.owner }); break;
              }
            }
            if (!hit && (b.life <= 0 || inWall(b.x, b.y, 3, walls) || b.x < 0 || b.x > W || b.y < 0 || b.y > H)) {
              if (owner && owner.alive) { owner.hp--; if (owner.hp <= 0) { owner.alive = false; api.emit('g:event', { type: 'seekerOut', id: owner.id }); } }
              hit = true; api.emit('g:event', { type: 'miss', x: Math.round(b.x), y: Math.round(b.y) });
            }
            if (hit) bullets.splice(i, 1);
          }
          if (hiders().every((h) => !h.alive)) finish(false);
          else if (seekers().every((s) => !s.alive) || t >= HUNT) finish(true);
        }
        broadcast();
      },
      destroy() {},
    };
  },
};
