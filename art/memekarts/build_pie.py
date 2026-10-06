"""Cream pie: closed folded tin, whipped dome, cherry and tilted stem."""
import sys
import math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'blasters'))
import build_assets as A
import bpy

A.ART = Path(__file__).resolve().parent
A.REPORT_PATH = A.ART / 'pie-validation.json'
A.REPORT = {}
A.reset()
tin = A.material('Fluted pie tin', (.48, .61, .69), metallic=.72)
cream = A.material('Whipped vanilla', (1, .94, .78))
cream.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .62
cherry = A.material('Cherry glaze', (.68, .008, .028))
cherry.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .2
stem = A.material('Cherry stem', (.13, .25, .045))

# The folded rim belongs to the dish, not a second intersecting cylinder.
verts, faces = [], []
for radius, z in [(.59, 0), (.80, .16), (.80, .205), (.72, .205)]:
    for i in range(16):
        a = i * math.tau / 16
        verts.append((radius * math.cos(a), radius * math.sin(a), z))
faces.append(tuple(reversed(range(16))))
for row in range(3):
    for i in range(16):
        j = (i + 1) % 16
        faces.append((row*16+i, row*16+j, (row+1)*16+j, (row+1)*16+i))
faces.append(tuple(range(48, 64)))
mesh = bpy.data.meshes.new('Folded tin'); mesh.from_pydata(verts, [], faces); mesh.update()
o = bpy.data.objects.new('pie_dish', mesh); bpy.context.collection.objects.link(o); o.data.materials.append(tin)

# Broad cream mound, closed underneath, with a gently twisted piped crown.
verts, faces = [], []
for row, (radius, z) in enumerate([(.72, .18), (.64, .40), (.37, .60), (.07, .73)]):
    for i in range(12):
        a = i * math.tau / 12 + row * .12
        r = radius * (1 if i % 2 else .94)
        verts.append((r * math.cos(a), r * math.sin(a), z))
faces.append(tuple(reversed(range(12))))
for row in range(3):
    for i in range(12):
        j = (i + 1) % 12
        faces.append((row*12+i, row*12+j, (row+1)*12+j, (row+1)*12+i))
faces.append(tuple(range(36, 48)))
mesh = bpy.data.meshes.new('Whipped dome'); mesh.from_pydata(verts, [], faces); mesh.update()
for face in mesh.polygons:
    face.use_smooth = len(face.vertices) == 4
o = bpy.data.objects.new('cream_dome', mesh); bpy.context.collection.objects.link(o); o.data.materials.append(cream)
A.ball('Cherry', (.045, 0, .79), (.13, .13, .13), cherry, 8, 4)
A.beam('Cherry stem', (.045, 0, .895), (.105, 0, 1.015), .014, stem, 5)
A.export('pie', 300, center=False, metadata={'diameter': 1.6, 'origin': 'dish bottom'})
