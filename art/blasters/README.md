# Toy Box Blasters: Blender delivery

Built from `fps3d.md`, starting with eight figures, five blasters, five pickups/props, then the arena. Later deliveries add a train, four more blasters, a water balloon, a foam sword, a cannonball and Block Towers. All **28 GLBs** are in `../../public/models/`, with matching editable `.blend` sources here. The figures now have named limb pivots for walking. All designs are original moulded-plastic toys. The game-code owner's sword-loading fix is verified: the custom model appears and swings in-game.

## Assets and triangle counts

Counts are measured in Blender and independently checked after GLTFLoader imports the exported GLBs. Every asset is under its individual budget.

| File | Built | Triangles | Budget |
| --- | --- | ---: | ---: |
| `fps_char_0.glb` | Bucket-helmet knight, red crest, silver shoulder caps | 1,300 | 2,500 |
| `fps_char_1.glb` | Astronaut, transparent bubble, backpack and chest controls | 1,728 | 2,500 |
| `fps_char_2.glb` | Pirate, folded broad hat, patch and sash | 1,520 | 2,500 |
| `fps_char_3.glb` | Square robot, antenna and emissive visor | 1,172 | 2,500 |
| `fps_char_4.glb` | Wizard, tall bent purple hat, bell and beard | 1,508 | 2,500 |
| `fps_char_5.glb` | Masked ninja, red headband tails and sash knot | 1,376 | 2,500 |
| `fps_char_6.glb` | Chef, puffed white hat, moustache and apron | 1,776 | 2,500 |
| `fps_char_7.glb` | Dinosaur hoodie kid, teeth, costume eyes and back spikes | 1,668 | 2,500 |
| `fps_w_dart.glb` | Orange pistol with blue grip | 316 | 500 |
| `fps_w_scatter.glb` | Blue pump blaster, flared orange muzzle | 352 | 700 |
| `fps_w_rapid.glb` | Yellow compact blaster, round orange drum | 476 | 700 |
| `fps_w_long.glb` | Purple long blaster, thin barrel and large scope | 484 | 800 |
| `fps_w_boom.glb` | Green shoulder tube, orange rings, supported carry handle and visible foam rocket | 464 | 700 |
| `fps_w_burst.glb` | Slim green carbine, thin barrel, small magazine and three-shot markings | 496 | 700 |
| `fps_w_lob.glb` | Sky-blue wide tube, carry handle, white rim and loaded pink balloon | 584 | 700 |
| `fps_w_zap.glb` | Purple retro ray gun, three white barrel rings and emissive cyan tip | 572 | 700 |
| `fps_w_cannon.glb` | Stubby charcoal cannon, gold bands, recessed muzzle and wooden hand-carriage | 588 | 700 |
| `fps_cannonball.glb` | Dark iron-look ball with a pale highlight facet | 120 | 150 |
| `fps_balloon.glb` | Pink water balloon with a darker tied neck and flared knot | 176 | 200 |
| `fps_sword.glb` | Beveled orange foam blade, blue crossguard and wrapped dark grip | 288 | 300 |
| `fps_health.glb` | Juice carton, bent straw and red plus | 196 | 300 |
| `fps_mega.glb` | Red lunchbox, handle, latches and white plus | 332 | 500 |
| `fps_armor.glb` | Taped cardboard breastplate with blue trim | 256 | 400 |
| `fps_rocket.glb` | Orange foam rocket, soft red nose and blue fins | 136 | 300 |
| `fps_crate.glb` | Cuboid wooden toy crate with stretch-safe bands | 164 | 300 |
| `fps_arena.glb` | Complete decorated 101-box arena and 64 × 64 m play-mat | 15,752 | 80,000 |
| `fps_arena_towers.glb` | Decorated Block Towers, 117 collision boxes and 60 × 60 m play-mat | 11,238 | 60,000 |
| `fps_train.glb` | Red/yellow engine, open green and blue wagons, toy-block cargo | 2,468 | 2,500 |

The complete set contains **47,506 triangles**, counting each unique asset once. In-game totals depend on how many instances are visible.

## Arena

`node tools/blasters-map.js` was run before building the arena. `map.json` is the sole source for its 101 collision solids. Every solid retains an independently checkable `collision_NNN_type` mesh at the exported coordinates, at exactly 1 Blender unit per metre. No global rescaling or recentering is applied.

The arena includes taped cardboard perimeter walls with original crayon-style drawings and lettering, coloured wooden tower blocks around the existing tunnel, book stairs, ruler bridges, cardboard walkways, square crayon-carton pillars, coloured corner forts, domino parapets, alphabet-block crates, and wrapped eraser cover. Pillars and low walls retain solid cuboid silhouettes rather than implying non-existent gaps. Geometry stays within 5 cm of its corresponding collision box. The thin floor markings include roads, a centre ring and four coloured corner zones; pads, pickups and spawns are unobstructed. The game continues to draw its jump pads, pickups and giant exterior toys.

The refreshed `map.json` also contains four ramps, four teleporter positions and the train track. A conservative bounds audit of every source component found no geometry above the floor in any ramp footprint and no obstruction within 1.2 m of any teleporter. Flush floor paint and the gallery surface below its rings remain. No arena rebuild was needed: the 101 collision boxes are unchanged. Ramps, rails, rings and effects remain game-owned.

## Train

`fps_train.glb` has a front-facing engine, two open wagons, 14 wheels, couplers, cab windows, a headlamp and coloured block cargo. Its exported bounds are **8.2 m long × 1.76 m wide × 2.2484 m high**. The nose points Blender +Y. It is grounded and centred before the game's length fit. The source keeps individual editable components; the GLB merges static pieces by material and retains `train_nose` for orientation checks. The existing game moves the whole train; the asset contains no wheel animation or rig.

## Export conventions

- Blender +Z is up. Figures face −Y; blasters and rockets point +Y. Rotation and scale are applied. Named limbs retain their joint-position translations; other transforms are applied. GLBs export with +Y Up and contain static mesh art, with no cameras, lights, rigs or baked animations. Multi-material limbs become named glTF parent nodes with material-specific mesh children.
- Figures are grounded and horizontally centred, with the 1.8 m body/head proportions from the brief. Decorative hats and antennae extend above that height, up to 2.2 m on the wizard. Head-core centres remain at 1.56 m after the current loader's anchor-based fit; body geometry below 1.36 m stays within the 0.84 × 0.84 m footprint. Character-right is Blender −X when facing −Y, so the reaching hand aligns with the game's positive-X weapon side after its 180° rotation.
- Each figure has an exact `Paint` material on torso, arms and back shell. All eight player colours and all nine skin finishes were tested on all eight figures. The locker check confirms fixed accents stay unchanged and Lava/Rainbow update over time. Materials are plain Principled BSDF; no image textures or external dependencies are used.
- Blaster origins are at the bottom of the grip, `(0,0,0)`, with every barrel centre line at Z = 0.27 m. Authored lengths are Dart 0.5 m, Scatter 0.85 m, Rapid 0.6 m, Long Shot 1.2 m, Boom Tube 0.85 m, and 0.7 m each for Burst, Splash Lobber and Zap Ray. These supersede the first delivery's uniform 0.7 m length. Weapons are not recentered during export. Pickups and props are grounded and horizontally centred.
- Static parts are merged by material for export, while source `.blend` files retain the editable component pieces. Semantic head, hand, muzzle, grip and arena-solid meshes are retained for independent checks.

## Integration notes and concurrent renderer update

This art task did not edit `public/games/blasters.js`, `public/games/blasters.shared.js`, `server/games/blasters.js`, or `server/bots.js`. During the first delivery, a concurrent edit to `public/games/blasters.js` was detected and left intact. Its fitting rules resolved the two loader blockers found in that art pass.

1. **Tall hats:** the initial renderer fitted total character height to 1.8 m, shrinking figures with tall hats below their hitboxes. The concurrent update fits the `head_core` centre to 1.56 m instead. The final knight crest, pirate hat, robot antenna, wizard hat and chef hat use that support. Reverting to total-height fitting would shrink these figures incorrectly.
2. **Grip and first-person size:** the initial renderer recentred fitted blasters, bringing their backs too close to the camera. The concurrent update preserves their authored grip origin, uses `right_hand` for attachments, and moves/scales the first-person model. Blasters now use the distinct authored lengths listed above, as specified in the expanded brief. Source geometry was adjusted; renderer code was not edited by this art task.
3. Hit detection remains the existing analytic body box plus head sphere, not mesh-triangle intersection. Validation checks fitted proportions and representative body/head/outside rays; it does not claim pixel-perfect silhouette hit detection at every cosmetic gap or protrusion.

## Verification from the train delivery

- `node tools/fullrun.js blasters`: **PASS**, all eight scenarios, after the final model exports.
- `node tools/solo.js blasters 25`: **PASS**, game still running at completion, zero browser errors.
- `node tools/blasters-hit.js`: **PASS**, final run: 40 clicks produced 19 darts fired at visible, unprotected figures in 32 seconds; 14 server-confirmed hits (74%, above the harness's 60% threshold), zero browser errors. The existing harness was not edited by this art task.
- `node art/blasters/check-assets.mjs`: **PASS**. All 20 assets satisfy their budgets and geometry checks. The audit covers fitted head centres, body bounds, 64 Paint recolours, hand/barrel orientation, per-weapon lengths, 0.27 m barrel heights, train tunnel fit, the 101-box layout and the 5 cm decoration envelope. A real eight-player match loaded the arena, seven remote custom figures with distinct Paint colours, and first- and third-person custom blasters. All seven live head centres were 1.56 m above their figures' feet, including the tall-hat figures. No browser errors occurred.
- `node tools/blasters-map-check.js`: **PASS**, including ramps, teleporters, jump pads and tunnel traversal.
- Blender `check-clearances.py`: **PASS**, four ramp footprints and four 1.2 m teleporter clearances; no conflicting components.
- `node art/blasters/check-expansion.mjs`: **PASS**, 72 figure/skin combinations, 16 animated Lava/Rainbow combinations, unchanged non-Paint accents, and the custom train travelling nose-first through the tower tunnel. Zero browser errors.

`validation.json` contains Blender measurements; `browser-validation.json` contains independent browser measurements and the live integration result. `clearance-validation.json` records the feature-clearance audit; `expansion-validation.json` records skin properties and live train samples. Contact sheets: `figures-catalog.png`, `items-catalog.png`, `arena-catalog.png`, `train-catalog.png`, `skins-catalog.png`. `in-game.png` shows the exported models in the running game. The prescribed solo harness writes gameplay screenshots under `../../tools/shots/`.

## Rebuild

From the repository root, using Blender 4.0.2:

```sh
node tools/blasters-map.js
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python art/blasters/build_assets.py -- figures
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python art/blasters/build_assets.py -- weapons
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python art/blasters/build_assets.py -- props
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python art/blasters/build_assets.py -- arena
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python art/blasters/build_assets.py -- train
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python art/blasters/check-clearances.py
```

Start the local server with `npm start` before `node art/blasters/check-assets.mjs`; `TEST_URL` can override its default `http://127.0.0.1:3000`. The three prescribed checks launch their own test servers where needed.

The train-delivery work made no changes to the four protected game files; their before/after SHA-256 hashes matched. No art integration blockers remained at that point. The owner's notes below describe the earlier delivery and are retained as history.

## Follow-up from the game-code owner (2026-10-04)

The pending checks were run after Codex stopped: `node tools/fullrun.js blasters` passes, `node tools/solo.js blasters 25` reports zero browser errors, and `node tools/blasters-hit.js` passes.

Both loader constraints listed above are now lifted in `public/games/blasters.js`, and `fps3d.md` describes the new rules:

1. Figures are scaled so the centre of `head_core` is 1.56 m above the feet and centred under the head, instead of fitting the whole bounding box to 1.8 m. Tall hats are now safe.
2. Blasters are loaded as authored (1 unit = 1 m, origin kept at the bottom of the grip, barrel line 0.27 m above it) and placed in the figure's `right_hand`. The first-person blaster was far too large before this change because every blaster was stretched to the same length.

`tools/blasters-hit.js` now snaps the crosshair onto a visible figure (test-only, behind `?bltest=1`), fires single darts and requires at least 60% to be confirmed by the server.

Later the same day: the re-exported figures (tall hats) and 0.7 m blasters were verified by the game-code owner with all checks above passing. One more renderer change: the first-person blaster is still a child of the camera but is on render layer 1 and drawn in a second pass with a cleared depth buffer and a fixed 78° field of view, so walls cannot clip it. `check-assets.mjs` passes unchanged.

## Latest delivery: three blasters, balloon, sword and kart ramp

The five new shooter models add 2,116 triangles. Their individual counts and budgets are in the table above. `../memekarts/ramp.blend` and `../../public/models/ramp.glb` add the 44-triangle kart ramp; its dimensions and map checks are documented in `../memekarts/README.md`.

All three new blasters are 0.7 m long, point Blender +Y and retain their bottom-of-grip origins. The barrel centre line is Z = 0.27 m. The balloon is 0.5 m along its longest horizontal side with its knot trailing toward −Y. The sword is 1.2 m tall, with its grip bottom at the origin and its blade along +Z. Its blade uses a rough orange Principled material; the Zap Ray's cyan tip uses Principled emission. No textures, rigs or baked animations are included.

Rebuild only the five new shooter assets:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python art/blasters/build_assets.py -- expansion
```

`check-assets.mjs` now checks all 25 shooter exports, the balloon's trailing knot, the sword's upright blade, the Zap Ray's emission and all eight figures squashed to 62% height. Live head-height checks account for the renderer's crouch scale. `new-items-catalog.png` shows the five exports; `crouched-catalog.png` shows the compressed silhouettes. The latter retain their distinctive helmets, hats and faces.

`node art/blasters/check-new-items.mjs` uses the practice lobby and `]` to cycle the seven non-default blasters, checking the actual first-person GLB geometry. It fires a custom balloon and checks its movement, then presses E and samples the swing. Results are in `new-items-runtime.json`; `in-game-burst.png`, `in-game-lob.png` and `in-game-zap.png` show the new blasters in use. This diagnostic reports loader blockers separately from browser errors.

### Resolved blocker from the model delivery: sword placeholder

Update from the graphics pass: the game-code owner deferred sword construction until assets are ready. `check-new-items.mjs` now reports `customLoaded: true`, a moving custom blade, zero browser errors and no blockers. The original finding below is retained as history.

`fps_sword.glb` is fetched successfully and passes the independent asset checks, but the live camera has no `sword_blade` mesh. `public/games/blasters.js` creates the sword near line 356, immediately after starting asynchronous model loading. At that point `asset('fps_sword', 1.2, 'h')` returns null. The sword is never rebuilt when `assetsReady` becomes true, so pressing E animates the placeholder.

The game-code owner needs to defer sword construction until models are ready, or replace the placeholder once `fps_sword` is available. The existing swing transform and view-model layer can stay unchanged. No protected game code was edited for this delivery.

### Requested verification for this delivery

- `node tools/fullrun.js`: PASS, every game and scenario.
- `node tools/solo.js blasters 25`: PASS, game still running, zero browser errors.
- `node tools/solo.js memekarts 25`: PASS, game still running, zero browser errors.
- `node tools/blasters-hit.js`: PASS, 40 clicks produced 18 fired darts in 23 seconds; 16 server-confirmed hits (89%, above the current 70% threshold). Zero browser errors.
- `node art/blasters/check-assets.mjs`: PASS, all 25 assets and the existing eight-player integration checks.
- `node art/check-environment.mjs`: PASS, existing environment checks plus all 11 custom ramps across Stadium, Neon and Canyon. Each ramp matches its map footprint and 15-unit lip height; ray samples confirm the uphill direction.

All six requested checks pass. They do not test whether the custom sword replaces its placeholder; the separate live-item diagnostic found the blocker documented above. The before/after hashes of all files under `public/games/` and `server/`, plus `public/app.js`, `public/home.js` and `public/memekarts-maps.js`, match.

`npm start` found an existing listener on port 3000, so browser asset checks used the running local server. The solo and hit harnesses start their own isolated test servers.

## Graphics pass after rendering approval

Rebuilt all 25 sources and exports with smooth shading on rounded parts and separate material roughness for plastic, foam and paper. Triangle counts in the table remain unchanged, totalling 35,560. The arena's collision geometry and figure attachment points are unchanged.

The renderer now has stronger directional lighting with cool fill, subtle paper grain, soft player contact shadows and round sparks. World shadows update once per frame, without a redundant update during the first-person weapon pass. The game-code owner's deferred sword loading remains intact and passes the live swing check.

All six requested checks were rerun and passed. Both solo runs ended in-game with zero browser errors. The hit test recorded 24 confirmed hits from 32 fired darts (75%, above its 70% threshold). The asset audit checked all 25 exports and eight-player integration. Map/rules checks and the Blender ramp/teleporter clearance audit also passed. Blender's first clearance-check launch crashed during sandboxed Metal initialization; the same check passed outside the sandbox.

Server files, shared shooter physics and kart map data match their starting SHA-256 hashes. Comparison captures and rendering notes are in `../graphics/README.md`.

## Toy Cannon delivery

Built `fps_w_cannon.glb` and `fps_cannonball.glb` from the new Toy Cannon bullet in `fps3d.md`. The original cannon has a rounded charcoal breech, gold barrel hoops, a recessed annular muzzle and a honey-coloured wooden hand-carriage with a grip underneath. It is 0.8 m long, points Blender +Y, and retains the bottom-of-grip origin and 0.27 m barrel centre line. Its 588 triangles fit the 700-triangle budget.

The cannonball is 0.5 m in diameter and has smooth-shaded iron-look material with a pale highlight facet. It uses 120 of its 150 allowed triangles. Both exports use plain Principled materials without textures, cameras, rigs or animations. Editable sources are `fps_w_cannon.blend` and `fps_cannonball.blend`.

Rebuild this pair only:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python art/blasters/build_cannon.py
```

`validation.json` contains Blender measurements. `check-assets.mjs` now independently checks all 27 GLBs, including the cannon's length/orientation and the ball's diameter/highlight. `cannon-catalog.png` shows the exported pair. The live-item check now allows all nine blasters and samples the custom cannonball in flight.

All checks requested in `codex.md` passed: the full-game suite, map and kart-height checks, ramp driving on all three maps, both 25-second solo runs, hit detection, and both art audits. The hit check confirmed 30 of 31 fired darts (97%); both solo runs completed in-game with zero browser errors. Detailed height results are in `../memekarts/README.md`.

This delivery changed no protected game files, and their SHA-256 hashes match the starting baseline. GitHub and deployment state were not touched. A local server was already listening on port 3000; the start attempt skipped `prestart` to avoid regenerating protected files.

The supplementary `node art/blasters/check-new-items.mjs` also passes: all eight non-default blasters load through `]`, the custom cannonball moves in flight, and the balloon and sword checks remain clean. `new-items-runtime.json` records 11 cannonball samples with two position changes, zero browser errors and no blockers. The diagnostic now waits briefly after its test-only teleport before firing; the initial immediate-fire probe missed the cannon projectile. `in-game-cannon.png` shows the custom first-person cannon.

## Walking figures and Block Towers delivery

All eight `fps_char_<n>.glb` files were rebuilt with `leg_l`, `leg_r` and `arm_l`. Boots, soles and knee caps move with their legs; the free hand moves with its sleeve. `head_core` and `right_hand` are preserved, as are the figure shapes and neutral `Paint` material. Team recolouring includes the moving sleeve.

| Figure | Triangles | Budget |
| --- | ---: | ---: |
| `fps_char_0.glb` | 1,300 | 2,500 |
| `fps_char_1.glb` | 1,728 | 2,500 |
| `fps_char_2.glb` | 1,520 | 2,500 |
| `fps_char_3.glb` | 1,172 | 2,500 |
| `fps_char_4.glb` | 1,508 | 2,500 |
| `fps_char_5.glb` | 1,376 | 2,500 |
| `fps_char_6.glb` | 1,776 | 2,500 |
| `fps_char_7.glb` | 1,668 | 2,500 |

Counts are unchanged. Blender joint origins are left hip `(0.175, 0, 0.70)`, right hip `(-0.175, 0, 0.70)` and left shoulder `(0.33, 0, 1.265)`. The zero forward-axis offset also matches the runtime's leg-position animation. Limbs are joined multi-material meshes in Blender; GLTFLoader preserves each named pivot as the parent of its material primitives. No skeleton or baked animation is needed.

`fps_arena_towers.glb` uses **11,238 / 60,000 triangles**. Its 117 solid cuboids match `map-towers.json` exactly at 1 metre per unit. The 60 × 60 m floor has a warm checker pattern and printed roads. Block colours match the map; shallow studs and side seams give them moulded-toy detail. Catwalks are yellow rulers, stairs have book covers, and cardboard perimeter walls have tape and crayon-coloured bands.

`node tools/blasters-map.js towers` ran before construction. Its JSON omits the map's block colour field, so `prepare-towers.cjs` reruns that exporter and adds the original colours from `BLASTERS.mapById('towers').boxes[i].c`, read-only. Collision coordinates remain the official export. No game or tool file was changed for this workaround.

The arena has 606 shallow decoration components. Each remains within 5 cm of a collision box. The build skips two decorations that would enter reserved areas; the saved-source audit checks every remaining component against all four ramps, four teleporters, four jump pads, 24 pickups and the train corridor. It reports zero conflicts. The game continues to draw these interactive features itself.

Rebuild from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python art/blasters/build_assets.py -- figures
node art/blasters/prepare-towers.cjs
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python art/blasters/build_towers.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python art/blasters/check-towers-clearances.py
```

Matching `.blend` sources are saved here. `validation.json` records counts; `browser-validation.json` records independent GLB measurements; `towers-source-audit.json` records the clearance audit. `walking-catalog.png` shows all eight posed exports, and `arena_towers-catalog.png` shows the decorated arena.

All eight user-requested checks passed. The complete command list and results are in `../memekarts/README.md`, under “Required checks for this delivery”. The shooter audit now checks 28 models and both arenas' 218 boxes. Its live head-height check measures in the figure's local coordinates so existing lean and bob do not create false failures. Nine-blaster checks remain supported. All browser checks use the windowless launcher.

No protected game code was edited. The kart `]` shortcut omission is documented in the Meme Karts README. GitHub and deployment state were left untouched; static model manifests still require the owner's normal publishing build.

The supplementary `node art/check-optional-delivery.mjs` verifies the custom Towers arena in a live team match. All three remote figures have moving legs and free arms; their `Paint` materials are red or blue. No browser errors were recorded. The same check reports the kart shortcut omission and missing pie spin separately, without changing game code.

The team-colour audit accounts for the bots' Classic, Pastel and Neon finishes, including the white mix applied by Pastel. Before/after SHA-256 hashes of every protected game file match.
