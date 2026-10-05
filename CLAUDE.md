# FriendGame

Browser party games for friends on a call. Node + Express + Socket.IO server, vanilla canvas client. `npm start` → http://localhost:3000.

## Layout
- `server.js` — rooms (4-letter codes), lobby, results, 30 Hz tick loop. Loads every `server/games/*.js`.
- `server/games/<id>.js` — one server module per game. Exports `{ id, name, tagline, min, max, controls, create(api) }`.
  `create(api)` returns `{ onInput(pid, msg), tick(dt), onLeave(pid), onJoin?(pid), destroy() }`.
  `api`: `players()`, `player(id)`, `emit(ev, data)` (room), `to(pid, ev, data)`, `after(ms, fn)`, `every(ms, fn)`, `clear(t)`, `end(pointsById, summary)`, `memory` (persists across games in a room).
  Games send `g:state` snapshots (≤30 Hz) and `g:event` one-offs. Call `api.end({pid: points}, 'summary')` to finish.
- `public/app.js` — client framework. `registerGame(id, (G) => ({ state(s), event(e), render(dt), key(k, down), mouse(kind, x, y), destroy() }))`.
  `G`: `ctx`, `W=900`, `H=600`, `me` (socket id), `players`, `player(id)`, `keys` (Set of held keys, lowercase), `mouse {x,y,down}`, `send(msg)`, `ui` (DOM overlay), `panel(html)`, `clearUI()`, `text()`, `circle()`, `nameTag()`, `timer()`, `clear()`.
- `public/games/<id>.js` — client module, included from `public/index.html`.
- `server/data/` — word lists and trivia.
- `server/bots.js` — test-mode bots. One brain per game (`BRAINS[gameId]`) that turns the latest state snapshot into input messages. Add a brain when adding a game.
- `public/vendor/` — vendored Three.js (ESM, via import map) and GLTFLoader; exposed as `window.THREE` / `window.GLTFLoader`.
- `public/models/` — optional `.glb` overrides for Meme Karts (see `3d.md`); `/models/list` lists them.
- `tools/` — dev checks. Run these after any change; all must be clean:
  - `node tools/fullrun.js [gameId]` — every game played to the end on a virtual clock, 8 scenarios each (min/4/8 players, junk input, leaves, joins). Fast.
  - `node tools/lifecycle.js` — room lifecycle and malformed messages against a real server process.
  - `node tools/kartsim.js <mapId>` — Meme Karts match where bots use all items.
  - `node tools/solo.js <gameId> [secs] [shot times]` — headless Chromium through Test mode (bots), screenshots in `tools/shots/`.
  - `node tools/multi.js <gameId> [secs] [shots] [players] [mapId]` — N real browser clients joining by code. Run WebGL games one at a time (software GL is slow). `QS='?bloom=1' MAP=neon node tools/solo.js memekarts` forces bloom on and picks a map.
  - `node tools/mapcheck.js` — Meme Karts map layouts: overlaps, bounds, reachability.
  - `node tools/blasters-hit.js`, `node tools/blasters-shots.js` — shooter: a real browser's shot must register; captures the main screens.
  - `node tools/mp.js` — two separate browsers in one room for both primary games: each sees the other move, shots land. `node tools/home.js` — home page and lobby game switch. `node tools/blasters-rules.js`, `node tools/blasters-map-check.js` — shooter rules and map physics without a browser.
  - `node tools/refresh.js [gameId]` — real page refresh in the lobby and mid-game, plus the Leave button.
  - `node tools/items.js [mapId]`, `node tools/playnow.js`, `node tools/shapes.js`, `node tools/glbinfo.js <file.glb>`.

## Conventions
- Server is authoritative for all game state; clients only render snapshots and send intents.
- Canvas is a fixed 900×600 logical space, CSS-scaled. Mouse coords arrive already in canvas space.
- Keep state snapshots small: round numbers, send only what the renderer needs.
- Reference implementation: `server/games/sumo.js` + `public/games/sumo.js`.
- Toy Box Blasters (`blasters`) is a first-person shooter and the one game that is NOT fully server-authoritative: each client simulates its own movement with the shared physics and reports it (`{type:'p'}`), and reports its own hitscan hits (`{type:'fire', hits}`); the server enforces fire rate, ammo, range, damage, pickups, rockets, scoring. Map, physics, rays and the weapon table live in `public/games/blasters.shared.js` (UMD: `require` on the server and bots, `window.BLASTERS` in the browser). Bots run the same physics in `server/bots.js`. Models: `fps_*.glb` in `public/models/` (figures fitted by their `head_core` mesh, blasters used at authored size with the grip-bottom origin, `fps_arena.glb` replaces the plain floor and boxes). Test hooks `__bl` / `__blAim` exist only with `?bltest=1`. The first-person blaster is a child of the camera on render layer 1, drawn in a second pass (Codex's `art/blasters/check-assets.mjs` relies on it being under the camera). The map also has `ramps` (true slopes; a ramp ending in mid-air is a launch ramp), `teles` (teleporter pairs) and `train` (server-simulated hazard along z = 0); skins (`sk`) restyle each figure's `Paint` material. `node tools/blasters-map-check.js` tests the map and movement physics without a browser. Graphics brief: `fps3d.md`; `node tools/blasters-map.js` exports the collision boxes for artists.
- Meme Karts maps are data in `public/memekarts-maps.js` (per-map `w`/`h`, obstacles, boxes, spawns, pads, portals, zones, movers). `node tools/mapcheck.js` validates them. The renderer uses `OX`/`OZ` world offsets, never literal 450/300.
- Games listed in `FULL_WINDOW` in `public/app.js` fill the whole window and manage the canvas size themselves.
- The site revolves around two primary games, Meme Karts and Toy Box Blasters. `public/home.js` drives the home page's two-game picker (`window.selectedGame`); the lobby has the same switch (`#gameSwitch`); the other 13 games live under "More games". `node tools/home.js` checks all of it.
- Meme Karts `ramps` launch a kart that drives up one in its direction (server); the renderer draws the wedge and lifts the kart. Blasters mechanics beyond shooting: crouch/slide (shared physics), aim-down-sights (per-weapon `ads`), bursts, lobbed projectiles (`gravity`), `MELEE` foam sword. `node tools/blasters-rules.js` checks the server rules.
- Meme Karts and Toy Box Blasters are the 3D games. For Meme Karts: the server sim is still flat 900×600; `public/games/memekarts.js` renders it with Three.js on a WebGL canvas placed behind the framework's 2D canvas, which it uses for the HUD.
- After changing a game, run `node tools/fullrun.js <gameId>` and `node tools/solo.js <gameId>`, and look at the screenshots; zero failures and zero console errors is the bar.
- Clients are untrusted: validate every input field (`Number.isFinite`, known ids). Socket handlers in `server.js` are registered through the `on()` wrapper so a bad payload cannot crash the server; game timers and join/leave hooks run through `room.guard()`.
- Player ids are stable (`u…`), not socket ids. A disconnected player keeps their seat for `REJOIN_GRACE_MS` (20 s) and the browser reclaims it with the id + secret key in `sessionStorage` (`rejoin`). A game that sends one-time setup by event (a map, a secret word) must also implement `onRejoin(pid)` to resend it. Client code uses `G.me`, never `socket.id`.
- A game must end itself when fewer than two players remain (`onLeave`), not leave one person alone until the clock runs out.
- Hosting: deployed to Vercel at https://friendgame.vercel.app (`npx vercel@latest deploy --prod`). `server.js` exports the HTTP server and only listens when run directly; `server/build-manifest.js` (runs on `npm start` and as the build step) writes `server/registry.js` and `server/models.json` because a serverless bundle cannot list folders; the client uses the WebSocket transport only. Vercel is a poor fit for this server: rooms live in memory, connections are cut at the function time limit (300 s on the Hobby plan) and there is no guarantee two players reach the same instance. `BASE_URL=<site> node tools/mp.js` and `node tools/longrun.js` test a deployed site.
- Browser test tools use Playwright's window-less `chrome-headless-shell` with `--use-angle=metal` (real GPU, ~120 fps, no Dock icons). Software rendering ran at ~6 fps and made timing tests fail. Codex's own checks under `art/` launch the real Google Chrome, which the user notices; avoid running those more than needed.
- Another agent (Codex) also edits this folder: check `stat` times before large edits and keep edits small and anchored. Never put a `//` comment in the middle of a long one-line statement.
