"""Original bevelled toy V, with a continuous dark moulded edge stripe."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'blasters'))
import bpy
import bmesh
from mathutils import Vector
import build_assets as A
from build_towers import rgb

A.ART=Path(__file__).resolve().parent
A.REPORT_PATH=A.ART/'boomerang-validation.json'
A.REPORT={}
A.reset()
orange=A.material('Boomerang orange plastic',rgb('#ff891f'))
edge=A.material('Boomerang dark edge',rgb('#773719'))
bevel=A.material('Boomerang rounded edge',rgb('#ffb044'))
for m in (orange,edge,bevel):
    m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.33
    m.use_backface_culling=True

# CCW, symmetric wings; longest dimension is 2.2 m along Blender Y.
outline=[(.55,0),(.50,.15),(-.26,1.04),(-.38,1.10),(-.50,1.07),
         (-.55,.97),(-.51,.85),(.06,0),(-.51,-.85),(-.55,-.97),
         (-.50,-1.07),(-.38,-1.10),(-.26,-1.04),(.50,-.15)]
def inset(distance):
    result=[]
    for i,p in enumerate(outline):
        p=Vector(p)
        a=(p-Vector(outline[i-1])).normalized()
        b=(Vector(outline[(i+1)%len(outline)])-p).normalized()
        na,nb=Vector((-a.y,a.x)),Vector((-b.y,b.x))
        result.append(p+(na+nb)*(distance/(1+na.dot(nb))))
    return result

# The stripe is part of the closed mesh, so no overlapping coplanar decals.
layers=[(.035,0),(0,.035),(0,.068),(0,.112),(0,.145),(.035,.18),(.075,.18)]
vertices=[(p.x,p.y,z) for d,z in layers for p in inset(d)]
n=len(outline)
faces=[tuple(reversed(range(n)))]; indices=[0]
for row in range(len(layers)-1):
    for i in range(n):
        j=(i+1)%n
        faces.append((row*n+i,row*n+j,(row+1)*n+j,(row+1)*n+i))
        indices.append([2,0,1,0,2,1][row])
faces.append(tuple(range((len(layers)-1)*n,len(layers)*n)));indices.append(0)
mesh=bpy.data.meshes.new('Closed bevelled V');mesh.from_pydata(vertices,[],faces);mesh.update()
obj=bpy.data.objects.new('boomerang_core',mesh);bpy.context.collection.objects.link(obj)
for m in (orange,edge,bevel):mesh.materials.append(m)
for p,i in zip(mesh.polygons,indices):p.material_index=i
bm=bmesh.new();bm.from_mesh(mesh)
assert all(e.is_manifold for e in bm.edges),'Boomerang must be a closed solid'
assert bm.calc_volume(signed=True)>0,'Normals must face outwards'
volume=bm.calc_volume(signed=True);bm.free()
A.export('boomerang',300,center=False,metadata=dict(
    tip_span=2.2,thickness=.18,plane='Blender XY',forward='Blender +X',
    origin='horizontal centre of V, base at Z=0',closed=True,volume=volume))
