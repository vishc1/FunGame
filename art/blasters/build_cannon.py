"""Original handheld wooden toy cannon and iron-look ball, Blender 4.0+."""
import math
import sys
from pathlib import Path
import bpy
sys.path.insert(0,str(Path(__file__).resolve().parent))
import build_assets as A

A.reset()
iron=A.material('Charcoal toy iron',(.025,.036,.053),metallic=.55)
gold=A.material('Warm gold bands',(.95,.57,.075),metallic=.45)
wood=A.material('Honey wood',(.45,.21,.065))
endgrain=A.material('End grain',(.70,.40,.14))
black=A.material('Recess shadow',(.004,.007,.014))
A.box('grip',(0,0,.075),(.105,.14,.15),wood,.015)
A.box('Carriage bed',(0,.15,.16),(.29,.38,.055),wood,0)
for x in [-.15,.15]:
    A.box('Carriage cheek',(x,.13,.215),(.045,.34,.10),endgrain,.01)
    A.cone('Gold trunnion',(x*1.12,.12,.27),.044,.044,.025,gold,8,'X')
A.ball('Rounded breech',(0,-.17,.27),(.12,.15,.12),iron,12,4)
A.cone('Cannon barrel',(0,.115,.27),.119,.143,.57,iron,14,'Y')
for y,r in [(-.115,.13),(.335,.15)]:
    A.cone('Gold hoop',(0,y,.27),r,r,.043,gold,14,'Y')
verts=[]
for y,r in [(.48,.15),(.48,.11),(.405,.11),(.395,.15)]:
    verts.extend([(math.cos(i*2*math.pi/14)*r,y,.27+math.sin(i*2*math.pi/14)*r) for i in range(14)])
faces=[]
for band in range(2):
    for i in range(14):
        j=(i+1)%14
        faces.append(((band+1)*14+i,(band+1)*14+j,band*14+j,band*14+i))
for i in range(14):
    j=(i+1)%14
    faces.append((i,j,42+j,42+i))
mesh=bpy.data.meshes.new('Muzzle ring');mesh.from_pydata(verts,[],faces);mesh.update()
o=bpy.data.objects.new('muzzle_tip',mesh);bpy.context.collection.objects.link(o);A.finish(o,'muzzle_tip',gold)
A.cone('Bore shadow',(0,.406,.27),.109,.109,.002,black,14,'Y')
for x in [-.091,.091]: A.box('Wood grain inlay',(x,.15,.19),(.009,.24,.002),wood,0)
A.export('fps_w_cannon',700,center=False,metadata=dict(facing='+Y',origin='bottom of grip at (0,0,0)',length=.8,barrel_height=.27))

A.reset()
iron=A.material('Polished toy iron',(.032,.044,.062),metallic=.65)
iron.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.22
ball=A.ball('Cannonball',(0,0,.25),(.25,.25,.25),iron,12,6)
highlight=A.material('Iron highlight',(.40,.53,.65),metallic=.35)
ball.data.materials.append(highlight)
for p in ball.data.polygons:
    if p.normal.x<-.35 and p.normal.y<-.35 and p.normal.z>.45: p.material_index=1
A.export('fps_cannonball',150,metadata=dict(diameter=.5,highlight=True))
