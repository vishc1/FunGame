# Model polish, 2026-10-09

Sixteen existing models were rebuilt: eight Meme Karts vehicles and eight Toy Box Blasters figures. Game code, item models and arena geometry were left unchanged.

The karts have rounded tyres with white sidewall rings and five-spoke rims, plus inset lamps and vehicle-specific body trim. Drivers have smoother head silhouettes. Static pieces are combined by material for export; wheel pivots remain separate. Figures have finer heads, softer moulded-edge shading, ivory torso seams and framed badges. Their named limbs, head anchor and weapon hand are preserved.

Current exported-model previews:

- [Karts](kart-after.png)
- [Figures](fps_char-after.png)

The `*-before.json` files record the previous triangle counts and dimensions. Initial `*-before.png` captures lost earlier panels between asynchronous model loads, so they are incomplete and should not be used as comparison sheets. The capture script now preserves the drawing buffer; the current previews show all eight models in each category.

Sources and rebuild commands are in `../../memekarts/README.md` and `../../blasters/README.md`. Current totals: 31,486 triangles across 36 kart/item/environment assets; 49,994 across 28 shooter assets. Each model remains inside its individual budget.

The all-game simulation suite passes. Independent browser audits pass all 36 kart assets and 28 shooter assets, with eight-player model loading, grounded bounds, player colours, wheel rotation, named limb pivots and head alignment. Browser checks use `art/browser.mjs`, the windowless launcher.

## Verification

- `node tools/fullrun.js`: all scenarios passed. The kart subset was rerun after concurrent map/code edits and also passed.
- `node tools/kart-items-check.js`: all 19 items passed.
- `node art/validate-runtime.mjs --complete`: all 36 kart/item/environment GLBs passed, including eight custom vehicles in a live match. Repeated after the rear-light adjustment.
- `node art/blasters/check-assets.mjs`: all 28 shooter GLBs passed, including head proportions, colours, limb pivots and eight-player integration.
- `node tools/solo.js memekarts 25`, `node tools/solo.js blasters 25`, and `MAP=towers MODE=teams node tools/solo.js blasters 25`: completed in-game with zero browser errors. The kart run was repeated after the final model adjustment.
- `node tools/blasters-hit.js`: the first run missed its 70% threshold (23/40, 57%). A second unchanged run passed (14/18, 78%). Both had zero browser errors; the cause of the variation was not established.

This pass did not edit game code, touch GitHub or deploy. A final hash comparison found concurrent changes in `public/games/memekarts.js`, `server/games/memekarts.js` and `public/memekarts-maps.js`; those changes were preserved. Other protected files match the starting baseline. The preview server used port 3094 and skipped the manifest-writing prestart hook; it was stopped after validation.
