// Egg Boss: one giant slow egg vs. small fast players who must crack it in 90 seconds.
const W = 900, H = 600, M = 20;
const ROUND = 90;
const EGG_R = 60, EGG_SPEED = 95, ROLL_SPEED = 180, ROLL_MAX = 1.5, ROLL_CD = 4;
const SMALL_R = 14, SMALL_SPEED = 270, HIT_RANGE = 95, HIT_CD = 0.45;
const SMASH_WINDUP = 0.35, SMASH_R = 150, SMASH_CD = 2.5, SMASH_STUN = 1.6, SMASH_IMPULSE = 700;

module.exports = {
  id: 'eggboss',
  name: 'Egg Boss',
  tagline: 'One giant egg vs. everyone. Crack it in 90 seconds.',
  min: 3, max: 8,
  controls: 'WASD to move. Click/Space to attack (smalls) or smash (egg). Egg: hold Shift/right-click to roll.',
  create(api) {
    const ps = api.players();
    let bossId = api.memory.nextBoss && ps.some((p) => p.id === api.memory.nextBoss) ? api.memory.nextBoss : ps[Math.floor(Math.random() * ps.length)].id;
    const ents = new Map();
    const smallCount = ps.length - 1;
    const maxHp = 18 * smallCount;
    let hp = maxHp, t = 0, countdown = 3, over = false, lastHitter = null;
    let smash = null; // {x,y,at}
    const dmg = {};

    function spawn(p, i) {
      const isBoss = p.id === bossId;
      const a = (i / Math.max(1, ps.length)) * Math.PI * 2;
      ents.set(p.id, {
        id: p.id, boss: isBoss,
        x: isBoss ? W / 2 : W / 2 + Math.cos(a) * 240, y: isBoss ? H / 2 : H / 2 + Math.sin(a) * 200,
        vx: 0, vy: 0, dx: 0, dy: 0, stun: 0, cd: 0, r: isBoss ? EGG_R : SMALL_R,
        roll: 0, rollCd: 0, rolling: false, rollHeld: false, swing: 0,
      });
      if (!isBoss) dmg[p.id] = 0;
    }
    ps.forEach(spawn);
    const boss = () => ents.get(bossId);

    function finish(cracked) {
      if (over) return; over = true;
      const pts = {};
      let summary;
      if (cracked) {
        for (const id in dmg) pts[id] = 3;
        if (lastHitter) { pts[lastHitter] = (pts[lastHitter] || 0) + 3; api.memory.nextBoss = lastHitter; }
        pts[bossId] = 0;
        const lh = api.player(lastHitter);
        summary = `The egg cracked! ${lh ? lh.name + ' landed the final hit and is the next boss.' : ''}`;
      } else {
        pts[bossId] = 6;
        let best = null;
        for (const id in dmg) { pts[id] = Math.floor(dmg[id] / 5); if (!best || dmg[id] > dmg[best]) best = id; }
        if (best) api.memory.nextBoss = best;
        const b = api.player(bossId), bp = api.player(best);
        summary = `${b ? b.name : 'The egg'} survived unbroken. ${bp ? bp.name + ' dealt the most damage and is the next boss.' : ''}`;
      }
      api.emit('g:event', { type: 'over', cracked, bossId, lastHitter });
      api.after(cracked ? 2500 : 1500, () => api.end(pts, summary));
    }

    function snap() {
      return {
        t, countdown: Math.max(0, countdown), hp, maxHp, bossId,
        smash: smash ? { x: Math.round(smash.x), y: Math.round(smash.y), p: Math.min(1, (t - smash.at) / SMASH_WINDUP) } : null,
        ents: [...ents.values()].map((e) => ({
          id: e.id, x: Math.round(e.x), y: Math.round(e.y), stun: +e.stun.toFixed(2), cd: +Math.max(0, e.cd).toFixed(2),
          rolling: e.rolling, rollCd: +Math.max(0, e.rollCd).toFixed(2), swing: +Math.max(0, e.swing).toFixed(2), dmg: dmg[e.id] || 0,
        })),
      };
    }

    return {
      onInput(pid, msg) {
        const e = ents.get(pid);
        if (!e || over) return;
        if (msg.type === 'move') { const d = Math.hypot(msg.dx || 0, msg.dy || 0); e.dx = d > 0 ? msg.dx / d : 0; e.dy = d > 0 ? msg.dy / d : 0; return; }
        if (countdown > 0) return;
        if (msg.type === 'roll') { e.rollHeld = !!msg.down; return; }
        if (msg.type === 'attack' && e.stun <= 0 && e.cd <= 0) {
          if (e.boss) {
            if (smash) return;
            smash = { x: e.x, y: e.y, at: t };
            e.cd = SMASH_CD;
            api.emit('g:event', { type: 'windup', x: Math.round(e.x), y: Math.round(e.y) });
          } else {
            const b = boss(); if (!b) return;
            e.cd = HIT_CD; e.swing = 0.2;
            const dx = b.x - e.x, dy = b.y - e.y, d = Math.hypot(dx, dy) || 1;
            if (d <= HIT_RANGE + SMALL_R) {
              hp = Math.max(0, hp - 1); dmg[pid] = (dmg[pid] || 0) + 1; lastHitter = pid;
              e.vx -= (dx / d) * 220; e.vy -= (dy / d) * 220;
              api.emit('g:event', { type: 'hit', id: pid, x: Math.round(b.x + (-dx / d) * EGG_R), y: Math.round(b.y + (-dy / d) * EGG_R) });
              if (hp <= 0) finish(true);
            }
          }
        }
      },
      onLeave(pid) {
        const e = ents.get(pid);
        if (!e) return;
        ents.delete(pid); delete dmg[pid];
        if (over) return;
        if (pid === bossId) { api.end({}, 'The egg left the game.'); over = true; return; }
        if (ents.size < 2) { api.end({ [bossId]: 3 }, 'Not enough players left.'); over = true; }
      },
      tick(dt) {
        if (over) return;
        if (countdown > 0) { countdown -= dt; api.emit('g:state', snap()); return; }
        t += dt;
        const b = boss();
        for (const e of ents.values()) {
          e.cd -= dt; e.swing -= dt; e.rollCd -= dt;
          if (e.stun > 0) e.stun -= dt;
          let speed = e.boss ? EGG_SPEED : SMALL_SPEED;
          if (e.boss) {
            if (e.rollHeld && !e.rolling && e.rollCd <= 0 && e.stun <= 0) { e.rolling = true; e.roll = ROLL_MAX; }
            if (e.rolling) {
              e.roll -= dt; speed = ROLL_SPEED;
              if (e.roll <= 0 || !e.rollHeld) { e.rolling = false; e.rollCd = ROLL_CD; }
            }
          }
          if (e.stun <= 0) { e.x += e.dx * speed * dt; e.y += e.dy * speed * dt; }
          e.x += e.vx * dt; e.y += e.vy * dt;
          const f = Math.pow(0.02, dt); e.vx *= f; e.vy *= f;
          e.x = Math.max(M + e.r, Math.min(W - M - e.r, e.x));
          e.y = Math.max(M + e.r, Math.min(H - M - e.r, e.y));
        }
        // smash resolve
        if (smash && t - smash.at >= SMASH_WINDUP) {
          for (const e of ents.values()) {
            if (e.boss) continue;
            const dx = e.x - smash.x, dy = e.y - smash.y, d = Math.hypot(dx, dy) || 1;
            if (d <= SMASH_R + e.r) { e.vx += (dx / d) * SMASH_IMPULSE; e.vy += (dy / d) * SMASH_IMPULSE; e.stun = SMASH_STUN; }
          }
          api.emit('g:event', { type: 'smash', x: Math.round(smash.x), y: Math.round(smash.y) });
          smash = null;
        }
        // collisions
        const list = [...ents.values()];
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const a = list[i], c = list[j];
          const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy), min = a.r + c.r;
          if (d < min && d > 0) {
            const nx = dx / d, ny = dy / d, ov = min - d;
            const wa = a.boss ? 0.05 : (c.boss ? 0.95 : 0.5), wc = 1 - wa;
            a.x -= nx * ov * wa; a.y -= ny * ov * wa; c.x += nx * ov * wc; c.y += ny * ov * wc;
            const bossE = a.boss ? a : (c.boss ? c : null), small = a.boss ? c : (c.boss ? a : null);
            if (bossE && bossE.rolling && small.stun <= 0) {
              small.stun = 1; const s = a.boss ? 1 : -1;
              small.vx += nx * s * 350; small.vy += ny * s * 350;
            }
          }
        }
        if (t >= ROUND) finish(false);
        api.emit('g:state', snap());
      },
      destroy() {},
    };
  },
};
