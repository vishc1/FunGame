# Meme Karts Blender assets

All 23 original required assets are exported in `../../public/models/`, along with six environment models and the later jump ramp. Each asset has an editable `.blend` source here. The optional arena was not generated.

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
