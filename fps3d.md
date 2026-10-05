# Graphics brief for Codex — Toy Box Blasters

Paste everything below the line into Codex. It is self-contained.

---

## The job

You are making the 3D art for **Toy Box Blasters**, a browser first-person shooter in the shape of Shell Shockers, except the players are **toy action figures** in a child's playroom, not eggs. They shoot foam darts. Nobody dies, they get "tagged out". The tone is bright, funny and harmless.

The game already runs with placeholder models built from boxes in code. Your job is to replace them with proper models made in **Blender**, exported as **.glb**. You do not need to write game code. The game finds files by name and swaps them in.

- Project folder: `~/friendgame`
- Put every export in: `~/friendgame/public/models/`
- Keep your `.blend` sources and build script in: `~/friendgame/art/blasters/`
- Renderer, for reference only: `public/games/blasters.js`. Map, sizes and hitboxes: `public/games/blasters.shared.js`.
- Engine: Three.js r186, `MeshStandardMaterial`, ACES tone mapping, one sun with soft shadows.

**Do not edit** `public/games/blasters.js`, `public/games/blasters.shared.js`, `server/games/blasters.js` or `server/bots.js`. Another agent owns those. If something in them blocks you, write it down in `art/blasters/README.md` instead.

## Art direction

- **A playroom seen from toy height.** You are 1.8 "metres" tall, which in the fiction is a 10 cm action figure. The arena is a fort built on a play-mat out of cardboard, wooden blocks and tape. Outside the walls are giant alphabet blocks, crayons and a ball.
- **Chunky, moulded-plastic toys.** Soft bevels, slightly glossy, saturated colours. Think vinyl figures and foam-dart blasters, not military hardware.
- **Readable in half a second.** This is a fast shooter. Every figure must have a clear silhouette at 30 m, and every blaster must be recognisable in the hand and floating as a pickup.
- **Plain Principled BSDF materials**: base colour, roughness, metallic, emission. No image textures required. If you use any, keep them 512×512 or smaller and pack them into the .glb.
- **Original designs only.** No real brands, no real toy lines, no characters from games or films. "A knight toy" is right. A copy of a specific product is wrong.

## Hard rules for every model

1. **Up is Blender +Z.** Sits on the ground at Z = 0, centred on the origin in X and Y.
2. **Apply all transforms.** Delete cameras, lights and empties before exporting.
3. **Scale.** Pickups and props are measured and rescaled to the size in the table, so only proportions matter. Figures and blasters are different, see their sections.
4. **Export:** glTF 2.0, format **glTF Binary (.glb)**, **+Y Up** ticked, Apply Modifiers ticked, selected objects only, no animations.
5. **File names must match the tables exactly**, lower-case.
6. **Stay inside the triangle budget.** Up to 8 figures are on screen with weapons, pickups and effects.

## Figures (the players)

Eight figures, about **1.8 m tall**. The game scales each figure so the centre of its `head_core` mesh sits 1.56 m above its feet and centres the figure under that head. So a tall hat or an outstretched arm does not shrink or shift the body.

| File | Figure | Signature shape | Max tris |
|---|---|---|---|
| `fps_char_0.glb` | Knight | bucket helmet with a crest | 2,500 |
| `fps_char_1.glb` | Astronaut | clear bubble helmet, backpack | 2,500 |
| `fps_char_2.glb` | Pirate | big hat, eye patch | 2,500 |
| `fps_char_3.glb` | Robot | square head, antenna, glowing visor | 2,500 |
| `fps_char_4.glb` | Wizard | tall bent hat, beard | 2,500 |
| `fps_char_5.glb` | Ninja | mask, headband tail | 2,500 |
| `fps_char_6.glb` | Chef | tall chef hat, moustache | 2,500 |
| `fps_char_7.glb` | Dino Kid | kid in a dinosaur hoodie with teeth | 2,500 |

Rules that matter for gameplay:

- **Faces Blender −Y** (the standard Front view looks at its face).
- **One material named exactly `Paint`.** The game recolours it to the player's colour (red, blue, green, yellow, purple, orange, teal, pink). Use it for the torso and arms so team colour reads from any angle. Model it in light grey and make sure the figure still looks good in all eight colours.
- **Match the hitbox.** Shots are tested against a body box 0.84 m wide and deep from the floor to 1.36 m, plus a head sphere of radius 0.27 m centred 1.56 m up. Keep the body inside that box and put the head where the sphere is. A big hat above the head is fine and encouraged, but do not make the head itself bigger or lower.
- **Name two meshes.** `head_core`: the head itself, without hat, centred where the head hitbox is. `right_hand`: the hand that holds the blaster.
- **Right arm forward, empty hand.** The game places the blaster's grip in `right_hand`. Left arm relaxed.
- **Static pose.** No rig, no animation. Stand with feet slightly apart.

## Blasters

Five foam-dart blasters. Each file is used three ways: in your own hands in first person, in other figures' hands, and floating as a pickup. So model the whole thing, both sides.

**Barrel points along Blender +Y.** Blasters are used at the size you model them, **1 Blender unit = 1 metre**, and are not recentred. Put the **origin at the bottom of the grip** and the **barrel centre line 0.27 m above it**. A pistol is about 0.5 m long, the Long Shot about 1.2 m.

| File | Blaster | Look | Max tris |
|---|---|---|---|
| `fps_w_dart.glb` | Dart Blaster | small pistol, orange body, blue grip | 500 |
| `fps_w_scatter.glb` | Scatter Blaster | fat pump shotgun, wide flared muzzle | 700 |
| `fps_w_rapid.glb` | Rapid Blaster | compact machine blaster with a round drum underneath | 700 |
| `fps_w_long.glb` | Long Shot | long thin rifle with a big scope | 800 |
| `fps_w_boom.glb` | Boom Tube | shoulder tube launcher, visibly loaded with a foam rocket | 700 |

Each one must be told apart by silhouette alone, and by a different dominant colour.

## Pickups and props

| File | What it is | Size | Max tris |
|---|---|---|---|
| `fps_health.glb` | Snack: a juice box or cookie with a red plus on it | 0.6 m | 300 |
| `fps_mega.glb` | Lunchbox: red lunchbox with a white plus, clearly bigger and better | 0.9 m | 500 |
| `fps_armor.glb` | Cardboard armour: a chest plate cut from a box, taped, blue trim | 0.6 m | 400 |
| `fps_rocket.glb` | Foam rocket in flight. **Nose points along Blender +Y** | 0.6 m | 300 |
| `fps_crate.glb` | Toy crate or wooden block. It is stretched to several box sizes, so keep it a plain cuboid with detail that survives stretching | 2.2 m | 300 |

Drawn by the game as effects, so do not model them: muzzle flashes, tracers, explosions, the power-up gem, jump-pad glow, name tags, health bars.

## Optional big one: the arena

The arena collision is a fixed set of 101 boxes. The game currently draws each box as a flat-coloured block. You can replace all of that with one decorated model.

1. Run `node tools/blasters-map.js`. It writes `art/blasters/map.json` with every box (type, centre, size), jump pad, pickup and spawn, **already converted to Blender coordinates**.
2. Build `fps_arena.glb` in Blender from that data. **1 Blender unit = 1 metre. Origin at the arena centre on the floor.** Do not rescale or move anything.
3. When `fps_arena.glb` exists, the game hides its own floor and blocks and shows yours.

Rules:

- **Your visible geometry must match the collision boxes.** A player must never see a gap they cannot walk through or bump into something they cannot see. Decoration may stick out from a box by up to 5 cm.
- Box types and what they should look like:

| Type | Count | Suggested look |
|---|---|---|
| `wall` | 4 | 9 m tall cardboard perimeter, taped seams, scribbled crayon drawings |
| `tower` | 3 | the central block tower with a tunnel through it; big wooden building blocks |
| `step` | 44 | stair treads made of stacked books or blocks |
| `bridge`, `plat` | 4 | rulers, planks or a cardboard sheet as walkways |
| `pillar` | 12 | crayons, thread spools, stacked cans |
| `fort` | 4 | corner forts: large toy bricks |
| `rail` | 10 | low parapets: dominoes or pencils |
| `crate` | 14 | toy crates and alphabet blocks |
| `lowwall` | 6 | low cover: erasers, sponges, a toy fence |

- The floor is a 64 × 64 m play-mat. Paint roads, a centre circle and coloured zones on it. Keep markings that help players orient: the tower is the middle, the two orange jump pads are at the north and south edges, the four blue jump pads sit by the corner forts.
- Leave the jump pads and pickup spots clear. The game draws those itself.
- Budget: 80,000 triangles for the whole arena.

## Added after the first delivery

The map gained features that the game draws itself. `node tools/blasters-map.js` now also exports them (`ramps`, `teleporters`, `train`).

- **Ramps.** Two tan walk-up ramps onto the galleries and two orange launch ramps beside the bridges. Keep arena decoration out of their footprints.
- **Teleporters.** Four glowing rings (two pairs). Keep a 1.2 m circle clear around each.
- **Toy train.** Rails run along the middle road (Blender Y = 0) through the tower tunnel. The game draws a placeholder train. Optional model: `fps_train.glb`, an engine plus two wagons, **nose along Blender +Y**, about 8.2 m long, at most 2.4 m tall and 1.8 m wide (it must fit the tunnel), max 2,500 triangles. It is fitted to 8.2 m long.
- **Three new blasters.** Same rules as the first five (barrel along Blender +Y, origin at the bottom of the grip, barrel line 0.27 m above it, about 0.7 m long, max 700 triangles each). Each needs its own silhouette and dominant colour:
  - `fps_w_burst.glb` Burst Blaster: a slim green carbine with a long thin barrel and a small box magazine.
  - `fps_w_lob.glb` Splash Lobber: a short, fat, sky-blue tube with a pink water balloon visibly loaded in the muzzle.
  - `fps_w_zap.glb` Zap Ray: a purple retro ray gun with three white rings on the barrel and a glowing cyan tip (use emission).
- **Water balloon.** `fps_balloon.glb`: the Splash Lobber's projectile. A pink water balloon with a knot, **knot toward Blender −Y** (it flies toward +Y), fitted to 0.5 m, max 200 triangles.
- **Foam sword.** `fps_sword.glb`: every player's melee weapon, seen only in first person during a swing. A chunky orange foam blade with a blue crossguard and dark grip, **blade pointing up Blender +Z, grip at the origin**, fitted to 1.2 m tall, max 300 triangles.
- **Crouching.** Crouched figures are squashed to 62% height by the game. Nothing to model, but check that each figure still reads when squashed.
- **Skins.** Players can pick a finish (Classic, Pastel, Midnight, Chrome, Neon, Ice, Gold, Lava, Rainbow). Skins only restyle the material named `Paint`, so keep using `Paint` for the parts that should change and nothing else.

## How to check your work

```bash
cd ~/friendgame && npm start
```

1. Open http://localhost:3000, click the test-mode button in the bottom-right corner, open "More games", pick **Toy Box Blasters**, press Start.
2. Click the game to capture the mouse. W/A/S/D moves, mouse aims, click fires, Tab shows scores, H explains every item.
3. http://localhost:3000/models/list shows which files the game found. Missing files fall back to placeholders, so deliver in any order.

Automated checks that must stay green after you add files:

```bash
node tools/fullrun.js blasters      # full bot matches, no browser
node tools/solo.js blasters 25      # real browser, zero console errors expected
node tools/blasters-hit.js          # a shot at a bot must register
```

Acceptance checklist:

- Figures face the way they are aiming and stand on the floor.
- The `Paint` material changes with player colour on all eight figures.
- Each blaster points forward in first person, in other players' hands, and looks right spinning as a pickup.
- Shots that visibly hit a figure's body or head register; shots that visibly miss do not. If your figure is wider or shorter than the hitbox, fix the model, not the hitbox.
- No black or pink surfaces, no flipped normals.

Write what you built, the triangle counts and anything you could not do in `art/blasters/README.md`.
