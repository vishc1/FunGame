# Prompt for Codex

Paste everything below the line into Codex.

---

Everything from your last delivery is in and verified: the decks, the themed ramps, the cannon and the cannonball all load. Thanks.

This round is three optional models for `~/friendgame`, in priority order. Build what you have budget for, in Blender, exported as `.glb` into `~/friendgame/public/models/` with the exact file names given.

## 1. `pie.glb` (Meme Karts)

A new item, the Cream pie. Spec in `3d.md`, section "pie.glb": a tin pie dish about 16 units (1.6 m) across with a dome of whipped cream and a cherry on top, origin at the bottom of the dish, max 300 triangles. The game lobs it through the air and spins it slightly.

## 2. Figures with named limbs (Toy Box Blasters)

Figures are now animated: they lean, bob, tuck in the air, squash when they land, flinch, kick when they fire and topple when they are out. That already works on your figures. Leg and arm swinging needs separate limb meshes. Spec in `fps3d.md`, section "Walking animation": re-export each `fps_char_<n>.glb` with meshes named `leg_l`, `leg_r` and `arm_l` (the free arm), origins at the hip and shoulder joints, keeping `head_core` and `right_hand`. The game finds them by name; a figure without them simply does not swing.

## 3. `fps_arena_towers.glb` (Toy Box Blasters)

A decorated arena for the second map, Block Towers. Spec in `fps3d.md`, section "Second map: Block Towers". `node tools/blasters-map.js towers` writes `art/blasters/map-towers.json` with every box in Blender coordinates. Same rules as `fps_arena.glb`: 1 unit = 1 m, origin at the centre on the floor, visible geometry matches the collision boxes, keep ramps, teleporters, pads and the track clear. The game already draws coloured building blocks for this map, so skip it if budget is short.

## What else changed, for context

- Toy Box Blasters has a second map (Block Towers), a team mode and a ninth blaster. Team mode recolours each figure's `Paint` material red or blue, so keep using `Paint` for the parts that carry the colour.
- Meme Karts has real height: raised decks and 3.2 m ramps on every map.

## Rules

- Same as your earlier deliveries: original toy designs, plain Principled materials, triangle budgets from the briefs, sources and build scripts under `~/friendgame/art/`.
- Do not edit game code: nothing under `public/games/`, `server/`, `public/app.js`, `public/home.js`, `public/p2p.js` or `public/memekarts-maps.js`. If something there blocks you, write it in `art/memekarts/README.md` or `art/blasters/README.md`.
- Your own check scripts under `art/` are yours to update. Toy Box Blasters now has nine blasters and 19 kart items exist, so anything that counts or cycles items with the `]` key needs to allow for that.
- Use your window-less browser launcher for browser checks, as in your last pass.

## How to look at your work

```bash
cd ~/friendgame && npm start
```

Open http://localhost:3000, pick a game tab, click **Practice lobby** in the bottom-right corner, then Start.

- Meme Karts: press `]` until the item card says Cream pie, then hold SPACE to aim and let go to throw.
- Toy Box Blasters: in the lobby, pick the Block Towers map card. Press `]` to hand yourself each blaster in turn.

## Checks that must pass when you are done

```bash
node tools/fullrun.js
node tools/kart-items-check.js
node tools/solo.js memekarts 25
node tools/solo.js blasters 25
MAP=towers node tools/solo.js blasters 25
node tools/blasters-hit.js
node art/check-environment.mjs
node art/blasters/check-assets.mjs
```

Finish by adding what you built, with triangle counts, to `art/memekarts/README.md` and `art/blasters/README.md`.
