"""Original +X kicker ramp. Reuses the static Blender export helpers only."""
import sys
from pathlib import Path
import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'blasters'))
import build_assets as A

A.ART = HERE
A.REPORT_PATH = HERE / 'ramp-validation.json'
A.REPORT = {}
A.reset()

def polygon(name, vertices, faces, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces); mesh.update()
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj)
    return A.finish(obj, name, mat)

def paint(name, outline, mat, lift=.003):
    return polygon(name, [(x,y,(x+3.6)*1.5/7.2+lift) for x,y in outline], [tuple(range(len(outline)))], mat)

vertices = [(-3.6,-3.2,0),(3.6,-3.2,0),(3.6,3.2,0),(-3.6,3.2,0),(3.6,-3.2,1.5),(3.6,3.2,1.5)]
polygon('ramp_core', vertices, [(0,3,2,1),(0,1,4),(3,5,2),(1,2,5,4),(0,4,5,3)], A.ORANGE)
paint('Grippy dark runway', [(-3.50,-2.72),(3.18,-2.72),(3.18,2.72),(-3.50,2.72)], A.DARK)
for x in [-1.95, -.05, 1.85]:
    paint('Up-slope chevron', [(x+.58,0),(x-.25,1.60),(x-.62,1.40),(x+.12,0),(x-.62,-1.40),(x-.25,-1.60)], A.WHITE, .006)
for y in [-2.91, 2.91]:
    paint('Blue edge stripe', [(-3.45,y-.10),(3.18,y-.10),(3.18,y+.10),(-3.45,y+.10)], A.BLUE, .004)
paint('Bright launch lip', [(3.21,-3.15),(3.57,-3.15),(3.57,3.15),(3.21,3.15)], A.YELLOW, .005)
# Small recessed-looking marks on the solid sides, without holes or overhanging rails.
for side in [-1,1]:
    for x in [.25,1.05,1.85,2.65]:
        z = .14
        polygon('Side moulding', [(x-.12,side*3.201,z),(x+.12,side*3.201,z),
                                 (x+.12,side*3.201,z+.24),(x-.12,side*3.201,z+.24)],
                [(0,1,2,3) if side<0 else (3,2,1,0)], A.BLUE)
A.export('ramp', 400, metadata=dict(facing='+X', rises_toward='+X', nominal_size=[7.2,6.4,1.5]))
