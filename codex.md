# Prompt for Codex

Paste everything below the line into Codex.

---

Everything from your last round is in: the pie, the limbed figures and the Block Towers arena all load and the figures swing their legs. Thanks.

Since then the Meme Karts maps got **more height**. Read `3d.md`, section "Added later: height (decks and ramps)", which now describes:

- Decks are **4.8 m** tall (were 3.2 m). Your `deck*.glb` models are stretched to that; check they still look right taller.
- Every map has a **sky tower**: a deck with a second deck stacked on top at **10 m**, reached by a second ramp that starts on the first deck and climbs 5.2 m. Right now the summit reuses the deck model stretched to 10 m.
- Ramps rise 4.8 m (floor ramps) or 5.2 m (the tower's second ramp). `ramp*.glb` is stretched to each ramp's rise.

## Models for this round, in priority order

1. **`tower.glb`, `tower_neon.glb`, `tower_canyon.glb`**: summit models for the three themes (a radio-mast podium with a beacon, a neon penthouse with a rooftop sign, a sandstone pinnacle). Rules in `3d.md`: a cuboid that fills its whole bounding box, flat level top, origin at the bottom centre; the game stretches it to the summit footprint and to 10 m, and the lower half sits inside the first deck. Max 800 triangles each.
2. Re-check `deck.glb`, `deck_neon.glb`, `deck_canyon.glb` at 4.8 m and `ramp*.glb` at a 5.2 m rise; re-export if the stretch hurts them.

## Where things are

- Sunset Stadium: two towers, facing the north and south fort gates.
- Neon Overdrive: the north middle city block is the tower; the ramp comes up from the boulevard.
- Canyon Rush: the north-row mesa next to the start is the tower: one straight 20 m climb from the west and a 10 m drop off the east face.

`node tools/kart-ramp.js stadium 5` (also `neon 9`, `canyon 5`) drives a kart up a tower's second ramp and saves pictures to `tools/shots/ramp_*.png`.

## Rules

- Same as before: original toy designs, plain Principled materials, sources and build scripts under `art/`.
- Do not edit game code: nothing under `public/games/`, `server/`, `public/app.js`, `public/home.js`, `public/p2p.js` or `public/memekarts-maps.js`. If something blocks you, write it in `art/memekarts/README.md`.
- Your `art/check-environment.mjs` was edited by the game-code owner: decks are checked at `d.z || 48`, ramps at their own `z0`/`z1` rise, rays start at y = 140. Keep that when you touch it.
- Use your window-less browser launcher for browser checks.

## How to look at your work

`cd ~/friendgame && npm start`, open http://localhost:3000, Meme Karts, **Practice lobby**, Start. The towers are the tall glowing blocks; drive up the bright ramps.

## Checks that must pass when you are done

```bash
node tools/fullrun.js memekarts
node tools/mapcheck.js
node tools/kart-height.js
node tools/kart-ramp.js stadium 5 && node tools/kart-ramp.js neon 9 && node tools/kart-ramp.js canyon 5
node tools/solo.js memekarts 25
node art/check-environment.mjs
node art/check-memekarts.mjs
```

Finish by adding what you built, with triangle counts, to `art/memekarts/README.md`.
