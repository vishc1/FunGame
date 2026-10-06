# Meme Karts

A browser kart battle for 2–8 players, with eight rides, original Blender models, and three arenas. Play immediately against seven bots, or create a room and share its four-letter code with friends. No accounts or downloads for players. The other thirteen party games remain in the lobby's **More games in the arcade** section.

## Run it

```bash
npm install
npm start          # http://localhost:3000
```

Friends outside your network need a public URL. Easiest options: deploy to any Node host (Render, Railway, Fly, a VPS) or tunnel your laptop with `npx localtunnel --port 3000` / `cloudflared tunnel --url http://localhost:3000`.

## Play

Choose a map on the home page and click **Play now** to start with seven bots. **Play with friends** opens a lobby; the host can change maps and add bots before starting. **Practice lobby** opens a room with three bots for trying any game.

Meme Karts fills the browser window. Use WASD or the arrow keys to drive, Space or click to fire, and **F** or the Fullscreen button to hide browser chrome. Touch devices have steering, accelerator, reverse, and fire buttons.

The maps are **Sunset Stadium**, **Neon Overdrive**, and **Canyon Rush**. Their obstacle and pickup layouts live in `public/memekarts-maps.js`, shared by the server, map cards, and renderer. Map selection belongs to the host and is fixed for a match. Each room keeps its own collision layout.

Hold **C** to look behind you and press **M** to mute sound. In a room with bots, **[** and **]** hand you any item for testing.

Refreshing the page or a short connection drop does not lose your seat: it is held for 20 seconds and the page rejoins the same room as the same player, straight back into the running game. Everyone has a **Leave** button during a game; the host also has **End game**.

## Games

| Game | Shape | Controls |
|---|---|---|
| Mimic | copy the leader's mouse-drawn move, worst copy is out | mouse |
| Three Lines | skribbl with only three straight lines | mouse drag, type guesses |
| Egg Boss | one giant slow egg vs. everyone, 90 s | WASD, click to hit / smash |
| Sumo Royale | dash-only blobs on a shrinking circle | click / Space to dash |
| Liar's Map | race a maze; one player's map is subtly wrong | WASD, click to vote |
| Hot Potato Trivia | pass the potato, whoever holds it when it pops answers | click a player, click an answer |
| Shadow Tag | dark map, flashlight cones, you only see lit players | WASD, mouse aim, F toggles light |
| Build & Break | 60 s to stack blocks, then one wrecking-ball shot each | A/D, Q/E rotate, Space drop, drag to fire |
| Meme Karts | **3D** kart battle (Smash Karts shape) with 19 items (including a Cream pie you aim by holding Space) on three large maps (speedway + fort, neon city with portals and drones, canyon with boulders and quicksand), all with raised decks you reach by ramp: shells, Boo ghost, lightning, star, Bullet Bill, bob-ombs… | WASD drive, Space fire |
| Character Brawl | one-screen platform brawler, parody characters | A/D, W jump, J attack, K special |
| Prop Hunt Arena | hiders are props, seekers shoot what looks wrong | WASD, click shoot, 1-8 pick prop |
| Tag with Powers | tag where everyone has a random power | WASD, Space power |
| Dodge the Boss | survive a giant boss's telegraphed attacks | WASD |
| Rocket Soccer | top-down car soccer, boost, 3v3 | WASD, Shift boost |
| Toy Box Blasters | **3D first-person** foam-dart arena: toy figures, weapon and power-up pickups, first to 20 tags | WASD, mouse aim, click fire, right-click aim, C crouch/slide, E sword, Space jump, Shift dash |

## Toy Box Blasters

A first-person arena shooter in the shape of Shell Shockers, with toy action figures instead of eggs. Everyone spawns with a Dart Blaster; the Scatter, Rapid, Long Shot and Boom Tube blasters, health, armour and a rotating power-up are picked up off the map. Tagged players drop their best blaster. Nine blasters (including a three-dart Burst Blaster, a Splash Lobber that arcs water balloons, a Zap Ray and a Toy Cannon whose recoil can launch you), a foam sword on E, G to drop your blaster for someone else, a starter-blaster loadout in the locker, two maps (Fort Cardboard and Block Towers, picked in the lobby), a team mode (Red vs Blue, no friendly fire, up to 12 players, made for parties), four rare power-ups (Bottomless Mag, Vampire Darts, Moon Boots, Big Head Mode) that show up one cycle in four, animated figures, aiming on right-click, crouch on C and a slide when you tap it while running. Double jump, dash, jump pads, walk-up ramps, launch ramps, teleporter pairs, and a toy train that crosses the map every 30 seconds. Headshots, streak callouts, and XP levels that unlock figures and skins (kept in your browser). Press **L** for the locker; rooms with bots unlock everything so you can try it all. Press **H** in game for what everything does. The map, physics and weapon numbers are in `public/games/blasters.shared.js`; `fps3d.md` is the graphics brief for an artist or agent.

## 3D models (Blender)

Meme Karts renders 23 original Blender assets with Three.js. Any `.glb` dropped into `public/models/` with the right file name replaces its fallback automatically. Editable sources and rebuild instructions are in `art/memekarts/`; the asset specification is `3d.md`. An optional `arena.glb` overrides only Sunset Stadium, whose layout it must match.

Animation includes front-wheel steering, wheel spin, body lean and pitch, interpolated jumps, landing suspension, pickup particles, skids, and camera easing. Decorative motion follows the system's reduced-motion preference.

## Hosting

Run it anywhere Node runs with `npm start`: that is the normal mode, with a game server and Socket.IO.

The Vercel deployment (https://friendgame.vercel.app) is different, because Vercel cannot keep a game server running. There the site is static files and rooms are **peer-to-peer**: the room creator's browser runs the game and friends' browsers connect straight to it. Nothing to pay for and no time limit, with two things to know: the room ends if its creator closes or refreshes their tab, and a few very strict networks (some schools and offices) block direct connections. Deploy with `npx vercel@latest deploy --prod --yes`.

## Checks

Game logic and server checks, no browser needed: `node tools/fullrun.js` plays every game to the end in 8 scenarios each, and `node tools/lifecycle.js` covers rooms, rejoin, and malformed messages. Browser checks: `node tools/solo.js <gameId>`, `node tools/multi.js <gameId>`, `node tools/refresh.js`, `node tools/items.js`. Details are in `CLAUDE.md`.

`node art/check-maps.cjs` simulates three simultaneous maps with eight drivers and weapons. With the server running, `node art/check-memekarts.mjs` checks the home page, multiplayer map selection, fullscreen, responsive layouts, touch controls, arcade cleanup, and animation at 30, 60, and 120 fps. The browser check uses the installed macOS Chrome and saves screenshots in `art/`; set `TEST_URL` to test another local port.

## Adding content

Each game is one server file (`server/games/<id>.js`) and one client file (`public/games/<id>.js`); see `CLAUDE.md` for the interface. Weapons (Meme Karts), characters (Character Brawl), props (Prop Hunt), powers (Tag with Powers) and bosses (Dodge the Boss) are plain arrays at the top of their files, built to be extended when someone on the call suggests one.
