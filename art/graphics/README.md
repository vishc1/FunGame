# Graphics pass

This pass updates Toy Box Blasters and Meme Karts with the user's permission to change rendering code. Gameplay, shared physics, map layouts and server files are unchanged.

## Appearance

All 55 Blender assets were rebuilt. Rounded surfaces now use smooth normals; cylinder caps and deliberately angular pieces keep their hard edges. Painted plastic has tighter highlights, with rougher rubber, foam and cardboard. Exports still use plain Principled materials and have no external texture dependencies.

Both renderers have stronger directional lighting, adjusted ambient fill and soft contact shadows beneath players. Contact shadows fade during jumps and hide on ramps. Blasters adds cool fill light and round particle sprites, and updates shadow maps only during the world pass. Procedural bump textures add grain to paper and track surfaces without adding mesh geometry.

Triangle counts are unchanged: 35,560 across the 25 shooter exports, 17,518 across the 23 original kart/item exports, 5,880 across six kart environment exports, and 44 for the ramp. The total is 59,002 across 55 unique assets. In-game totals depend on visible instances; contact-shadow planes add two triangles per player.

Rebuild scripts and editable sources remain in `../blasters/` and `../memekarts/`. Their validation JSON files contain per-model counts and budgets.

## Visual comparison

- `blasters-before.png` / `blasters-after.png`: the same arena viewpoint.
- `memekarts-before.png` / `memekarts-after.png`: the Stadium starting view.
- `figure-before.png` / `figure-after.png`: the astronaut locker preview.

Run `node art/check-graphics.mjs after` with the local server running to refresh the after captures. The test also checks contact-shadow transforms and browser errors. Bots and decorative movement make the captures unsuitable for exact pixel comparisons.

The short 90-frame samples in `before.json` and `after.json` show roughly 8.3 ms median frame intervals for Blasters and 8.4 ms for Karts on this machine, both before and after. This is a local smoke check, not a hardware-independent performance benchmark. Render call and triangle counters describe the last render pass only.

Browser art checks use `../browser.mjs` to launch a windowless GPU browser. `CHROMIUM_PATH` can override the executable.

## Verification

Passed after the rebuild:

- `node tools/fullrun.js`: every game and scenario.
- `node tools/solo.js blasters 25` and `node tools/solo.js memekarts 25`: still in-game, zero browser errors.
- `node tools/blasters-hit.js`: 24/32 fired darts confirmed (75%; required 70%).
- `node art/blasters/check-assets.mjs`: all 25 shooter models and eight-player integration.
- `node art/check-environment.mjs`: all three maps, ramp fit, landmark motion and reduced motion.
- `node art/blasters/check-new-items.mjs`: custom blasters, moving balloon and the game-code owner's custom sword-loading fix; no blockers.
- `node art/validate-runtime.mjs --complete`: all 30 kart/item/environment models and eight custom karts, including wheel pivots.
- `node art/check-memekarts.mjs`: native fullscreen, mobile sizing, touch driving, and kart jump/steering/wheel animation at 30/60/120 fps. Contact-shadow height stayed within 0.001 units of the ground during jumps.
- Shooter rules, both games' map checks, and Blender's arena-clearance audit.

The SHA-256 comparison of server files, shared shooter physics and kart map data matched the pre-edit baseline.
