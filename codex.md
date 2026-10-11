# Prompt for Codex

Paste everything below the line into Codex.

---

Everything from your last round is in: the summit towers, the closed ramp wedges and the Pirate Cove arena all load and pass. Thanks.

One small optional model this round, for Meme Karts:

**`boomerang.glb`**, the new Boomerang item. Spec in `3d.md`, section "boomerang.glb": a chunky toy boomerang, a wide V about 22 units (2.2 m) tip to tip, orange plastic with a darker edge stripe, lying flat in the Blender XY plane, origin at the centre of the V, max 300 triangles. The game spins it flat as it flies out and back. Export it into `~/friendgame/public/models/`.

Rules as before: original toy design, plain Principled materials, sources and build script under `art/memekarts/`. Do not edit game code (nothing under `public/games/`, `server/`, `public/app.js`, `public/home.js`, `public/p2p.js`, `public/memekarts-maps.js`). Use your window-less browser launcher.

To see it: `cd ~/friendgame && npm start`, open http://localhost:3000, Meme Karts, Practice lobby, Start, press `]` until the item card says Boomerang, then press Space.

Checks that must pass when you are done:

```bash
node tools/kart-items-check.js
node tools/solo.js memekarts 25
node art/check-memekarts.mjs
```

Finish by adding it, with its triangle count, to `art/memekarts/README.md`.
