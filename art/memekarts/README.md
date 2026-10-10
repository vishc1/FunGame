# Meme Karts Blender assets

All 23 original required assets are exported in `../../public/models/`, along with six environment models, three decks, three ramps and the Cream pie: 36 GLBs. Each asset has an editable `.blend` source here. The optional kart arena was not generated.

`contact-sheet.png` shows the full set. `validation.json` records Blender triangle counts, budgets, grounded bounds, wheel names, and materials. The parent `../runtime-report.json` contains the independent Three.js browser checks; `../runtime-game.png` shows the models in the running game.

## Rebuild

Generated and tested with Blender 4.0.2:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python art/memekarts/build_assets.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python art/memekarts/render_catalog.py
```

Run from the repository root. The generator asserts every triangle budget before export. Assets use plain Principled materials without image textures, with transparent emissive item boxes. `Paint` is neutral gray in the source and recolored by the game.

Forward is Blender +X; up is +Z. Bounds are horizontally centered and grounded. Wheel meshes retain center-position translations to preserve their pivots; rotation and scale are applied, and axles follow Blender Y (glTF Z). All other transforms are applied. The rocket sled intentionally has no wheels, as specified. Exported GLBs contain no cameras, lights, animations, or empty objects.

The originals use an orange-capped mustachioed driver, party bus balloon, basket kid, farmer, racing pilot, chef, and scarf-wearing sled pilot. Their silhouettes are designed for the game's distant chase camera. The graphics pass adds smooth shading to rounded surfaces while retaining the low-poly geometry.

## Environment expansion

Six additional original Blender models are integrated into the renderer:

| Asset | Use | Triangles |
| --- | --- | ---: |
| `landmark_stadium.glb` | Grumpy gold trophy with a turning checkered flag | 1,264 |
| `landmark_neon.glb` | Giant arcade cabinet with an orbiting antenna | 1,248 |
| `landmark_canyon.glb` | Desert windmill with spinning sails and a water tank | 1,492 |
| `obstacle_neon.glb` | Beveled bunker with illuminated panels | 868 |
| `obstacle_canyon.glb` | Layered sandstone mesa | 108 |
| `prop_cactus.glb` | Flowering, branching cactus | 900 |

The matching editable `.blend` files are in this directory. Rebuild only this set with:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python art/memekarts/build_environment.py
node art/check-environment.mjs
```

The browser check needs the local server running on port 3000 (or `TEST_URL`). It writes `environment-catalog.png` here and gameplay/overview captures in `art/`. Blender records budgets in `environment-validation.json`; the browser independently verifies triangle counts, grounding, exact obstacle bounds, and that scenery stays outside the drivable area.

Static geometry is combined by material to limit draw calls. `anim_spinner` and `anim_rotor` retain their pivots; the renderer adds axis-aligned wrappers and animates them using elapsed seconds, with decorative motion disabled for reduced-motion users. No baked animation, image textures, new lights, or server/collision changes are required. Missing environment files fall back to the original obstacles or omit decorative scenery.

## Jump ramp: `ramp.glb`

Historical first delivery: the height/deck delivery below replaces this 1.5 m kicker with a 3.2 m access ramp. `build_ramp.py` now rebuilds the current version.

The original toy kicker ramp has solid orange sides, a dark runway, three white uphill chevrons, blue edge stripes and a bright yellow lip. It rises from Blender −X to +X, sits at Z = 0 and is horizontally centred. Its bounds are **7.2 × 6.402 × 1.5 m**, including 1 mm raised side markings. The game stretches it to each map ramp's footprint and 15-unit lip height.

The export has **44 triangles**, below the 400-triangle budget. `ramp.blend` keeps the editable wedge and markings; `ramp-validation.json` records the dimensions, budget and materials. `ramp-catalog.png` shows the exported GLB. Materials are plain Principled BSDF with no textures. Transforms are applied, +Y Up is enabled for export, and no cameras, lights, empties or animations are exported.

Rebuild only this asset from the project root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python art/memekarts/build_ramp.py
```

The generator reuses static export helpers from `../blasters/build_assets.py` without rebuilding other assets. `node art/check-environment.mjs` passes with all previous scenery and animation checks retained. It also checks all 11 custom ramps (4 Stadium, 4 Neon, 3 Canyon): exact footprint, grounded height and ray-sampled uphill direction. `node tools/solo.js memekarts 25` passes with the game running at completion and zero browser errors. The full all-game bot suite and all six requested checks pass; the complete results and a separate shooter sword-loader blocker are recorded in `../blasters/README.md`. No game code was edited, and the protected-file hashes match their starting values.

## Graphics pass after rendering approval

Rebuilt the 30 kart/item/environment exports with smooth rounded surfaces and distinct plastic, rubber and metal finishes. Geometry and animation pivots are unchanged. Triangle totals remain 17,518 for the original 23 exports, 5,880 for the six environment exports, and 44 for the ramp: 23,442 across all 30 models.

The renderer adds soft contact shadows beneath karts, stronger directional lighting and procedural track grain. Jump shadows fade with height and stay below the vehicle; ramps and ghost karts hide them. Existing steering, suspension, landing and wheel motion remain in place.

The all-game suite, 25-second kart playtest, 30-model browser audit and environment checks pass. All eight custom karts load with correct wheel pivots and player colours. The environment audit checks all three maps, 11 ramp footprints, and landmark motion at 30/60/120 fps with reduced-motion support. Browser errors: zero. Comparison captures are in `../graphics/`; the earlier shooter sword blocker is now resolved and verified.

`node art/check-memekarts.mjs` also passes native fullscreen, mobile sizing, touch controls and kart animation checks at 30/60/120 fps. Wheel steering settles after release, jumps land at ground level, and contact shadows stay within 0.001 units of the floor during the jump sequence.

## Height delivery: decks and access ramps

Built from `codex.md` and the newer height section in `3d.md`. This delivery changes art and art checks only. The old kicker dimensions are superseded by the 10 × 8.4 × 3.2 m ramp specification.

| Export | Design | Authored size (X × Y × Z, metres) | Triangles | Budget |
| --- | --- | --- | ---: | ---: |
| `deck.glb` | Teal podium, yellow checker border, diagonal hazard skirt and coral panels | 20 × 16 × 3.2 | 402 | 600 |
| `deck_neon.glb` | Navy rooftop, cyan landing markings and lit window panels | 30 × 22 × 3.2 | 482 | 800 |
| `deck_canyon.glb` | Layered sandstone plateau with a cream perimeter and clay-coloured top patches | 22 × 12 × 3.2 | 210 | 600 |
| `ramp.glb` | Orange Stadium slope, ivory uphill chevrons and yellow edges | 10 × 8.4 × 3.2 | 62 | 400 |
| `ramp_neon.glb` | Magenta slope, cyan borders and pale uphill chevrons | 10 × 8.4 × 3.2 | 62 | 400 |
| `ramp_canyon.glb` | Orange clay slope, cream borders and turquoise uphill chevrons | 10 × 8.4 × 3.2 | 62 | 400 |

The six exports contain 1,280 triangles. All 35 kart/item/environment assets now total 24,678 triangles, counting each unique model once.

Decks are closed cuboids with completely flat tops. Markings are coplanar coloured faces, so there are no raised decals, railings or gaps inside the collision rectangle. Ramps have solid sides and rise toward Blender +X; their arrows and borders lie exactly on the slope. The game continues to supply rim lights and ramp-entry decorations. Its runway recolouring remains supported by the `Runway enamel` material.

All materials are plain Principled BSDF, with no textures or external dependencies. Transforms are applied before export, Blender +Z is up, and glTF +Y Up is enabled. The source ramp mesh is named `ramp_core`; its exported material primitives remain underneath that node for slope checks.

Rebuild all six, or just the Stadium ramp:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python art/memekarts/build_height.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python art/memekarts/build_ramp.py
```

`height-validation.json` records Blender measurements. `height-browser-validation.json` records the independent GLTFLoader audit: exact dimensions, solid sides and 121 surface samples on each deck/ramp. `height-catalog.png` shows all six exports. `check-environment.mjs` includes this audit and verifies the custom models on all eight decks and 16 ramps across the three maps.

### Checks for the height and cannon delivery

- `node tools/fullrun.js`: PASS, all games and scenarios.
- `node tools/mapcheck.js`: PASS, all three maps.
- `node tools/kart-height.js`: PASS, deck access, falls, side collisions and level-specific item interactions.
- `node tools/kart-ramp.js stadium`, `neon`, and `canyon`: PASS on each map; climbed to 32 units, returned to floor level, zero browser errors. Captures are in `../../tools/shots/ramp_*_*.png`.
- `node tools/solo.js memekarts 25` and `node tools/solo.js blasters 25`: PASS, still in-game at completion, zero browser errors.
- `node tools/blasters-hit.js`: PASS, 30 server-confirmed hits from 31 fired darts (97%).
- `node art/check-environment.mjs`: PASS, including the new raw-asset and live-deck checks; landmark animations and reduced-motion checks retained.
- `node art/blasters/check-assets.mjs`: PASS, all 27 shooter exports and eight-player integration.

No game code or GitHub state was changed. Protected-file SHA-256 hashes match the starting baseline. `npm --ignore-scripts start` skipped the manifest-writing prestart hook and found port 3000 already occupied, so art checks used the existing local server. Driving and shooting harnesses started their own isolated servers. Static deployment manifests were left untouched; they will need the owner's normal build step when publishing the new files.

## Cream pie delivery

`pie.glb` contains a folded silver tin, a whipped-cream dome and a glazed red cherry with a green stem. It is 1.6 m across, with its origin at the dish bottom and all geometry above Z = 0. Plain Principled materials provide the metal, cream and cherry finishes; there are no textures, rigs or baked animations.

| Export | Triangles | Budget |
| --- | ---: | ---: |
| `pie.glb` | 280 | 300 |

The 36 kart/item/environment exports now total 24,958 triangles. Source: `pie.blend`; build script: `build_pie.py`; measurements: `pie-validation.json`; exported-model preview: `pie-catalog.png`.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python art/memekarts/build_pie.py
```

### Preview shortcut blocker

`public/games/memekarts.extras.js` still has 18 entries in its `ITEMS` array and omits `pie`. Pressing `]` wraps from Blooper to Green shell without offering Cream pie. The renderer and server support it. The game-code owner needs to add `['pie', 'Cream pie']` to that shortcut list. No game code was edited.

For now, start a Meme Karts practice lobby and run `G.send({type:'give', weapon:'pie'})` in the browser console. Hold SPACE to aim and release to throw. The separate art diagnostic uses that existing practice-room command when the shortcut skips the pie, and records the shortcut issue in `../optional-delivery-validation.json`.

The current `public/games/memekarts.js` entity update also has no rotation branch for `pie`. The model loads and moves, but does not spin. This needs a renderer change by the game-code owner; the GLB stays static as required by the brief.

`node art/check-optional-delivery.mjs` observed 92 frames of the player's custom pie moving through its lobbed trajectory, with zero browser errors. It uses the existing practice-room positioning command to keep the throw away from immediate collisions. `pie-aim.png` and `pie-in-flight.png` capture the live check. Both game-code issues above are reported separately from asset validation.

### Required checks for this delivery

All eight requested checks passed:

- `node tools/fullrun.js`: all games and scenarios.
- `node tools/kart-items-check.js`: all 19 logical items, including the pie.
- `node tools/solo.js memekarts 25`: completed in-game, zero browser errors.
- `node tools/solo.js blasters 25`: completed in-game, zero browser errors.
- `MAP=towers node tools/solo.js blasters 25`: completed in-game, zero browser errors.
- `node tools/blasters-hit.js`: 28 confirmed hits from 36 fired darts (78%; required threshold 70%), zero browser errors.
- `node art/check-environment.mjs`: all three maps, deck/ramp geometry and landmark animation at 30/60/120 fps, including reduced motion.
- `node art/blasters/check-assets.mjs`: all 28 shooter exports, joint pivots, team-compatible Paint materials and both arenas' 218 collision boxes.

Browser checks use the windowless launcher. The start attempt skipped the manifest-writing `prestart` hook and found port 3000 occupied; a fresh server on port 3093 was used for the supplementary live art check. GitHub and deployment files were left untouched.

SHA-256 hashes of all protected game files match the starting baseline. The temporary port-3093 test server was stopped after validation; the pre-existing port-3000 server was left running.

## Model polish, 2026-10-09

Rebuilt all eight karts. The seven wheeled vehicles now have rounded 16-sided tyres, white sidewall rings and five-spoke rim details. Rear bumpers support the lamps on open chassis. Headlights have inset warm lenses, and vehicle trim adds racing stripes, truck-bed planks, grilles, bus-window reflections and serving-window awnings. The sled has bright ski inserts and an orange exhaust lip. Drivers' heads have finer silhouettes, and weighted normals soften the body-panel shading.

| Export | Triangles | Budget |
| --- | ---: | ---: |
| `kart_0.glb` | 2,676 | 3,000 |
| `kart_1.glb` | 2,648 | 3,000 |
| `kart_2.glb` | 2,804 | 3,000 |
| `kart_3.glb` | 2,826 | 3,500 |
| `kart_4.glb` | 2,588 | 3,000 |
| `kart_5.glb` | 2,528 | 3,000 |
| `kart_6.glb` | 2,636 | 3,000 |
| `kart_7.glb` | 1,568 | 3,000 |

The original 23-model set now contains 24,046 triangles; all 36 kart/item/environment models total 31,486. Items, ramps, decks and scenery were not rebuilt. Plain Principled materials and player-recolourable `Paint` remain in use. Static kart pieces are combined by material on export to limit draw calls; each wheel remains separate with its original axle pivot. Thin trim uses flat geometry to leave more of the triangle budget for visible silhouettes.

Rebuild just the karts, keeping the other asset records:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python art/memekarts/build_assets.py --karts
```

Updated sources are `kart_0.blend` through `kart_7.blend`. `validation.json` contains current counts and bounds. `../graphics/model-polish/kart-after.png` shows the exported models with player colours. The windowless runtime audit verifies all eight custom karts in one match, grounded models, wheel origins and live wheel rotation.

The all-game suite, 19-item logic check, final eight-kart runtime audit and 25-second gameplay check pass. Full results, including the shooter hit-test retry and preserved concurrent game-code edits, are in `../graphics/model-polish/README.md`. No game code, GitHub state or deployment was changed by this art pass.

## Sky towers, 2026-10-09

Three new summit models are in `public/models/`. Stadium has a radio-lattice facade and a flush beacon target. Neon has lit penthouse windows and a magenta lightning roof sign. Canyon has uneven sandstone strata and a pale summit rim. The beacon and sign are surface designs: nothing projects above the driveable roof or outside the collision box.

| Export | Triangles | Budget |
| --- | ---: | ---: |
| `tower.glb` | 754 | 800 |
| `tower_neon.glb` | 770 | 800 |
| `tower_canyon.glb` | 770 | 800 |

Each model is authored as a 10 × 10 × 10 m closed cuboid, with its origin at the bottom centre. The loader stretches the horizontal dimensions to each summit's footprint. Facade detail starts at 4.8 m, above the portion hidden by the first deck. All materials use plain Principled BSDF shaders; the exports have no textures, lights, cameras, rigs or baked animation. Each GLB has five material meshes. Colour boundaries are tessellated into the surfaces, with no overlapping decals or roof obstacles.

Editable sources are `tower.blend`, `tower_neon.blend` and `tower_canyon.blend`. `tower-validation.json` records bounds, materials and triangle counts. Rebuild all three with:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python art/memekarts/build_towers.py
```

The build script reuses `build_height.py` and the shared Blender export helpers in `../blasters/build_assets.py`.

### Existing decks and ramps

Inspected all three decks stretched to 4.8 m and all three ramps at a 5.2 m rise. The side bands, window panels and uphill arrows remain readable; the roofs and slopes stay flat. No re-export was needed. Existing counts remain 402 / 482 / 210 triangles for Stadium / Neon / Canyon decks, and 62 triangles for each ramp. The three towers add 2,294 triangles; the 39 kart/item/environment exports now total 33,780.

`height-catalog.png` shows the nine exports at their tested heights. `height-browser-validation.json` records 121 roof/slope ray samples for each asset, plus cuboid side checks. The live environment check verifies every deck and ramp at its map coordinates and checks tower-specific materials to reject an accidental fallback to the old deck models. The game-code owner's `d.z || 48`, per-ramp `z0` / `z1` rise and y = 140 ray origins remain intact.

### Validation

All requested checks passed:

- `node tools/fullrun.js memekarts`: all eight scenarios.
- `node tools/mapcheck.js`: all three maps.
- `node tools/kart-height.js`: deck and tower climbs, drops, pickups and level-separated item interactions.
- `node tools/kart-ramp.js stadium 5`, `neon 9` and `canyon 5`: each reached height 100 and returned to floor height 0, with zero page errors.
- `node tools/solo.js memekarts 25`: completed in-game with zero errors.
- `node art/check-environment.mjs`: all 15 environment/height exports, custom summits on all three maps, exact collision surfaces, landmark animation and reduced motion.
- `node art/check-memekarts.mjs`: map selection, guest permissions, fullscreen, mobile sizing, touch driving, solo entry and kart animation at 30 / 60 / 120 fps; zero browser errors.

Browser checks used the windowless headless-shell launcher. The art checks used `TEST_URL=http://127.0.0.1:3095`, with a local server started through `PORT=3095 npm --ignore-scripts start`. This skips the manifest-writing prestart hook and leaves the existing port-3000 server alone. Ramp screenshots are in `tools/shots/ramp_<map>_*.png`; live overview captures are `../environment-<map>-overview.png`.

Protected game-file SHA-256 hashes match the starting baseline. No game-code changes or loader fixes were needed. GitHub and deployment were not touched. The temporary port-3095 preview server was stopped after validation; the existing port-3000 server was left running.
