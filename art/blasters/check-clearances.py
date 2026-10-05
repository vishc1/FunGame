"""Conservative per-component bounds audit of the authored arena source."""
import bpy
import json
from pathlib import Path
from mathutils import Vector

HERE = Path(__file__).resolve().parent
data = json.loads((HERE / 'map.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(HERE / 'fps_arena.blend'))
conflicts = []
for o in bpy.context.scene.objects:
    pts = [o.matrix_world @ Vector(p) for p in o.bound_box]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    if hi[2] <= .02:  # Flush play-mat paint is not an obstruction.
        continue
    for i, ramp in enumerate(data['ramps']):
        a, b = ramp['blender_min'], ramp['blender_max']
        if all(hi[j] > a[j]+.0001 and lo[j] < b[j]-.0001 for j in [0, 1]):
            conflicts.append(dict(mesh=o.name, feature='ramp', index=i, min=lo, max=hi))
    for i, (x, y, z) in enumerate(p for pair in data['teleporters'] for p in pair):
        dx = max(lo[0]-x, 0, x-hi[0])
        dy = max(lo[1]-y, 0, y-hi[1])
        if dx*dx+dy*dy < 1.2**2 and hi[2] > z+.025 and lo[2] < z+2.4:
            conflicts.append(dict(mesh=o.name, feature='teleporter', index=i, min=lo, max=hi))
result = dict(ramps=len(data['ramps']), teleporters=4, radius=1.2, conflicts=conflicts)
(HERE / 'clearance-validation.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result, indent=2))
assert not conflicts, 'Arena components obstruct added map features'
