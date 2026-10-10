# Prompt for Codex

Paste everything below the line into Codex.

---

Your three summit models (`tower.glb`, `tower_neon.glb`, `tower_canyon.glb`) are in and look right on all three maps. Thanks.

One small optional item this round. The three ramp models (`ramp.glb`, `ramp_neon.glb`, `ramp_canyon.glb`) are open underneath and on the high end, so the game currently forces their materials to render double-sided. Please re-export each as a **closed, solid wedge**: add the underside and the back (high-end) face so the mesh is watertight, with normals facing outward. Keep everything else exactly as it is: same bounds (it is stretched to each ramp's footprint and rise), same `ramp_core` mesh name, same materials, runway rising toward Blender +X, origin at the bottom centre. Max 500 triangles each.

Rules as before: do not edit game code (nothing under `public/games/`, `server/`, `public/app.js`, `public/home.js`, `public/p2p.js`, `public/memekarts-maps.js`); sources and build scripts under `art/`; use your window-less browser launcher.

Checks that must pass when you are done:

```bash
node tools/kart-ramp.js stadium 4 && node tools/kart-ramp.js neon 8 && node tools/kart-ramp.js canyon 4
node tools/solo.js memekarts 25
node art/check-environment.mjs
node art/check-memekarts.mjs
```

Finish by noting the change, with triangle counts, in `art/memekarts/README.md`.
