# Prompt for Codex

Paste everything below the line into Codex.

---

Your closed ramp wedges are in and verified. Thanks.

Toy Box Blasters has a **third map, Pirate Cove**. Read `fps3d.md`, section "Third map: Pirate Cove". The game draws it from coloured blocks today; the one model for this round is the decorated arena:

**`fps_arena_cove.glb`**, built like `fps_arena.glb` and `fps_arena_towers.glb`. `node tools/blasters-map.js cove` writes `art/blasters/map-cove.json` with every collision box in Blender coordinates (1 unit = 1 m, origin at the centre on the floor). What is there, so you know what you are dressing: a beached toy pirate ship in the middle, long along Blender Y (hull 2.4 m with a 2 m walkway all round, main deck 4.8 m, bow platform 6 m, stern castle 7.2 m, two masts, crow's nest at 12 m, midship stairs both sides, stairs along the walkway up to the deck, stairs deck to castle, walk ramps at bow and stern); a lighthouse with a gallery in the north-east; a sandcastle fort with turrets in the south-west; beach huts, palms and crates in the other corners; the train road along the south shore. Make it read as toys: a plastic pirate ship with painted planks, a skull flag on the mast, portholes; a red-and-white striped lighthouse; a bucket-shaped sandcastle with a paper flag; a sandy mat floor with a tide line.

Rules, as for the other arenas: visible geometry must match the collision boxes (decoration may stick out up to 5 cm), box type `block` carries a `color`, keep ramps, teleporters, jump pads and the track clear, max 60 000 triangles, plain Principled materials, sources and build scripts under `art/`. Do not edit game code (nothing under `public/games/`, `server/`, `public/app.js`, `public/home.js`, `public/p2p.js`, `public/memekarts-maps.js`). Use your window-less browser launcher.

How to look at it: `cd ~/friendgame && npm start`, open http://localhost:3000, Toy Box Blasters, Practice lobby, pick the **Pirate Cove** card, Start. `MAP=cove node tools/blasters-shots.js` saves screenshots to `tools/shots/bl_*.png`.

Checks that must pass when you are done:

```bash
node tools/blasters-map-check.js
MAP=cove node tools/solo.js blasters 25
node tools/blasters-hit.js
node art/blasters/check-assets.mjs
node tools/coplanar.js
```

Finish by adding the arena, with its triangle count, to `art/blasters/README.md`.
