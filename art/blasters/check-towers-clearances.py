"""Independent source audit of every solid and decoration around reserved features."""
import bpy
import json
import sys
from pathlib import Path
from mathutils import Vector

HERE = Path(__file__).resolve().parent
variant = sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'towers'
assert variant in ('towers', 'cove')
data = json.loads((HERE/f'map-{variant}.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(HERE/f'fps_arena_{variant}.blend'))
half = data['arena']['half_size']
track_y = data['train'].get('blender_y', 0)
conflicts, solids, decorations = [], 0, 0
for o in bpy.context.scene.objects:
    assert o.type == 'MESH'
    assert o.location.length < 1e-7 and all(abs(s-1)<1e-7 for s in o.scale)
    points = [o.matrix_world @ Vector(p) for p in o.bound_box]
    lo = [min(p[j] for p in points) for j in range(3)]
    hi = [max(p[j] for p in points) for j in range(3)]
    if o.name.startswith('collision_'):
        b = data['boxes'][o['collision_index']]
        assert all(abs(lo[j]-(b['blender_center'][j]-b['blender_size'][j]/2))<.0001 and
                   abs(hi[j]-(b['blender_center'][j]+b['blender_size'][j]/2))<.0001 for j in range(3)), o.name
        solids += 1
        continue
    if 'decor_box' not in o:
        assert -.0001 <= lo[2] <= hi[2] <= .02
        assert lo[0]>=-half-.001 and lo[1]>=-half-.001 and hi[0]<=half+.001 and hi[1]<=half+.001
        continue
    decorations += 1
    b = data['boxes'][o['decor_box']]
    assert all(lo[j]>=b['blender_center'][j]-b['blender_size'][j]/2-.0501 and
               hi[j]<=b['blender_center'][j]+b['blender_size'][j]/2+.0501 for j in range(3)), o.name
    for i,r in enumerate(data['ramps']):
        if all(hi[j]>r['blender_min'][j]+.0001 and lo[j]<r['blender_max'][j]-.0001 for j in (0,1)):
            conflicts.append([o.name,'ramp',i])
    spots = [('teleporter',p,1.2,2.4) for pair in data['teleporters'] for p in pair]
    spots += [('pad',p['blender_pos'],p['radius']+.12,2) for p in data['jump_pads']]
    spots += [('pickup',p['blender_pos'],.7,1.7) for p in data['pickups']]
    for kind,(x,y,z),radius,height in spots:
        dx,dy=max(lo[0]-x,0,x-hi[0]),max(lo[1]-y,0,y-hi[1])
        if dx*dx+dy*dy<radius*radius and hi[2]>z+.015 and lo[2]<z+height:
            conflicts.append([o.name,kind,[x,y,z]])
    if hi[1]>track_y-data['train']['track_half_width'] and lo[1]<track_y+data['train']['track_half_width'] and lo[2]<2.4 and abs(b['blender_center'][0])<half:
        conflicts.append([o.name,'track'])
assert solids == len(data['boxes'])
result = dict(solids=solids,decorations=decorations,ramps=len(data['ramps']),teleporters=4,pads=len(data['jump_pads']),pickups=len(data['pickups']),conflicts=conflicts)
(HERE/f'{variant}-source-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
assert not conflicts
