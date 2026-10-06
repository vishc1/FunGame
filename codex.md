# Prompt for Codex

Paste everything below the line into Codex.

---

Read `fps3d.md` in `~/friendgame`, section "Second map: Block Towers", then build the optional model it describes in Blender and export it as `.glb` into `~/friendgame/public/models/` with the exact file name given.

## What changed since your last delivery

**Everything from the previous round is in and verified: thanks.** Decks, themed ramps, cannon and cannonball all load.

**Meme Karts now has real height.** Every map has raised decks that karts drive on top of, reached by ramps. The old launch-ramp kickers are gone. The game currently draws decks as plain blocks. Ramp height went from 1.5 m to 3.2 m.

**Toy Box Blasters has a second map (Block Towers), a team mode and a ninth blaster.** Team mode recolours each figure's `Paint` material red or blue, so keep using `Paint` for the parts that should carry the colour.

## Models to make

Meme Karts: `pie.glb`, the new Cream pie item (see `3d.md`, "pie.glb"). Optional.

Toy Box Blasters figures: optional re-export with named limb meshes so they swing when walking (see the new "Walking animation" section in `fps3d.md`).

Toy Box Blasters:
4. Optional: `fps_arena_towers.glb`, a decorated arena for the new second map **Block Towers** (see the new section at the end of `fps3d.md`; `node tools/blasters-map.js towers` exports its boxes). Only if you have budget left; the game draws coloured building blocks for it already.

## Rules

- Same as your earlier deliveries: original toy designs, plain Principled materials, triangle budgets from the briefs, sources and build scripts under `~/friendgame/art/`.
- Deck tops must be flat and level, and a deck must fill its whole rectangular footprint. Karts drive on the top and the collision is the exact rectangle.
- Do not edit game code: nothing under `public/games/`, `server/`, `public/app.js`, `public/home.js`, `public/p2p.js` or `public/memekarts-maps.js`. If something there blocks you, write it in `art/memekarts/README.md` or `art/blasters/README.md`.
- Your own check scripts under `art/` are yours to update. Two notes: `art/check-environment.mjs` was edited by the game-code owner to expect 3.2 m (32-unit) ramps, and Toy Box Blasters now has nine blasters, so anything that counts or cycles blasters with the `]` key needs to allow for one more.
- Use your window-less browser launcher for browser checks, as in your last pass.

## How to look at your work

```bash
cd ~/friendgame && npm start
```

Open http://localhost:3000, pick a game tab, click **Practice lobby** in the bottom-right corner, then Start.

- Meme Karts: the decks are the big raised blocks with glowing edges. `node tools/kart-ramp.js stadium` (also `neon`, `canyon`) drives a kart up a ramp and saves pictures to `tools/shots/ramp_*.png`.
- Toy Box Blasters: press `]` repeatedly to hand yourself each blaster in turn; the cannon is number 9.

## Checks that must pass when you are done

```bash
node tools/fullrun.js
node tools/mapcheck.js
node tools/kart-height.js
node tools/kart-ramp.js stadium && node tools/kart-ramp.js neon && node tools/kart-ramp.js canyon
node tools/solo.js memekarts 25
node tools/solo.js blasters 25
node tools/blasters-hit.js
node art/check-environment.mjs
node art/blasters/check-assets.mjs
```

Finish by adding what you built, with triangle counts, to `art/memekarts/README.md` and `art/blasters/README.md`.
