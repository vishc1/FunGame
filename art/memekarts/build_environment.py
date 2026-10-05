"""Original toy-arena scenery. Run with Blender --background --python this_file.

Exports only the six environment assets listed below; existing kart/item art is untouched.
Blender +Z up, +X forward. Animated pieces retain their centre pivots.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'art/memekarts'
OUT = ROOT / 'public/models'
REPORT = []
bpy.context.preferences.filepaths.save_version = 0


def material(name, color, metal=0, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = .25 if metal else .87 if name in ['Terracotta', 'Sandstone', 'Cactus green'] else .38
    p.inputs['Metallic'].default_value = metal
    p.inputs['Emission Color'].default_value = (*color, 1)
    p.inputs['Emission Strength'].default_value = emission
    return m


def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)
    global DARK, CREAM, GOLD, CORAL, CYAN, ROCK, SAND, GREEN
    DARK = material('Midnight', (.025, .045, .085), .25)
    CREAM = material('Warm ivory', (.94, .84, .61))
    GOLD = material('Trophy gold', (1, .55, .065), .7)
    CORAL = material('Arcade pink', (.85, .065, .23), .2, .35)
    CYAN = material('Neon cyan', (.045, .75, .9), .2, 1.3)
    ROCK = material('Terracotta', (.54, .21, .11))
    SAND = material('Sandstone', (.86, .47, .23))
    GREEN = material('Cactus green', (.13, .42, .24))


def finish(o, name, m):
    o.name = name
    o.data.materials.append(m)
    return o


def box(name, pos, size, m, bevel=.08):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = o.modifiers.new('Toy bevel', 'BEVEL')
        b.width = bevel
        b.segments = 1
        bpy.ops.object.modifier_apply(modifier=b.name)
    return finish(o, name, m)


def cone(name, pos, bottom, top, height, m, vertices=12):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=bottom, radius2=top,
                                    depth=height, location=pos)
    o = bpy.context.object
    if vertices >= 10:
        for face in o.data.polygons:
            face.use_smooth = abs(face.normal.z) < .99
    return finish(o, name, m)


def ball(name, pos, size, m):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=1, location=pos)
    o = bpy.context.object
    o.scale = size
    for face in o.data.polygons:
        face.use_smooth = True
    return finish(o, name, m)


def beam(name, a, b, radius, m):
    delta = Vector(b) - Vector(a)
    o = cone(name, (Vector(a) + Vector(b)) / 2, radius, radius, delta.length, m, 8)
    o.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    return o


def torus(name, pos, radius, tube, m, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=tube,
                                    major_segments=16, minor_segments=6, location=pos,
                                    rotation=rotation)
    for face in bpy.context.object.data.polygons:
        face.use_smooth = True
    return finish(bpy.context.object, name, m)


def join(objects, name, pivot=(0, 0, 0)):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    o = objects[0]
    o.name = name
    bpy.context.scene.cursor.location = pivot
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return o


def export(name, budget):
    # Combine static meshes by material to keep draw calls low. Keep rotor pivots separate.
    static = [o for o in bpy.context.scene.objects if not o.name.startswith('anim_')]
    groups = {}
    for o in static:
        groups.setdefault(o.data.materials[0].name, []).append(o)
    for mat_name, objects in groups.items():
        join(objects, 'static_' + mat_name)
    objects = list(bpy.context.scene.objects)
    points = [o.matrix_world @ Vector(p) for o in objects for p in o.bound_box]
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    shift = Vector((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]))
    triangles = 0
    for o in objects:
        o.location += shift
        o.data.calc_loop_triangles()
        triangles += len(o.data.loop_triangles)
    assert triangles <= budget, (name, triangles, budget)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.wm.save_as_mainfile(filepath=str(ART / (name + '.blend')))
    bpy.ops.export_scene.gltf(filepath=str(OUT / (name + '.glb')), export_format='GLB',
                             use_selection=True, export_yup=True, export_apply=True,
                             export_animations=False, export_cameras=False, export_lights=False)
    REPORT.append(dict(name=name, triangles=triangles, budget=budget,
                       size=[hi[i] - lo[i] for i in range(3)],
                       animated=[o.name for o in objects if o.name.startswith('anim_')]))
    print('ENVIRONMENT_READY', name, triangles, flush=True)


def trophy():
    reset()
    box('Podium', (0, 0, .4), (8, 6, .8), DARK)
    box('Upper step', (0, 0, 1), (6.5, 5, .5), CORAL)
    cone('Foot', (0, 0, 1.7), 2, 1.4, .9, GOLD)
    cone('Stem', (0, 0, 3.2), .7, .55, 2.2, GOLD)
    cone('Cup', (0, 0, 5.3), .8, 2.8, 2.6, GOLD, 16)
    cone('Dark inset', (0, 0, 6.62), 2.35, 2.35, .08, DARK, 16)
    torus('Cup lip', (0, 0, 6.65), 2.6, .18, GOLD)
    for y in [-1, 1]:
        torus('Handle', (0, y * 2.5, 5.1), 1.25, .25, GOLD, (0, math.pi / 2, 0))
    # A tiny grumpy race face, not a borrowed character.
    for y in [-.75, .75]:
        box('Eye', (2.02, y, 5.85), (.15, .46, .45), DARK, .04)
        brow = box('Brow', (2.09, y, 6.2), (.18, .8, .17), DARK, .02)
        brow.rotation_euler.x = math.copysign(.24, y)
    box('Unimpressed mouth', (1.68, 0, 5.08), (.15, .9, .16), DARK, .02)
    # A checkered pennant that slowly turns above the trophy.
    beam('Mast', (0, 0, 6.5), (0, 0, 9.4), .09, GOLD)
    pieces = []
    for x in range(4):
        for z in range(3):
            pieces.append(box('Checker', (.3 + x * .48, 0, 8.15 + z * .38),
                              (.48, .10, .38), CREAM if (x + z) % 2 else DARK, 0))
    join(pieces, 'anim_spinner', (0, 0, 8.5))
    export('landmark_stadium', 4000)


def arcade():
    reset()
    box('Foot', (0, 0, .35), (6.3, 7.2, .7), DARK)
    box('Cabinet', (0, 0, 4.25), (4.8, 6, 7.2), DARK, .22)
    for y in [-3, 3]:
        box('Pink cheek', (0, y, 4.8), (4.5, .3, 7.4), CORAL, .12)
        box('Side light', (2.2, y, 5.2), (.15, .35, 6.5), CYAN, .04)
    box('Header', (0, 0, 9.1), (5.3, 6.8, 1.4), CORAL, .16)
    box('Header glow', (2.7, 0, 9.1), (.08, 5.7, .75), CYAN, .03)
    box('Screen frame', (2.55, 0, 6.25), (.45, 5.7, 3.5), CREAM)
    box('Screen', (2.8, 0, 6.25), (.10, 5.15, 3), DARK, .03)
    # Pixel-like original face in emissive geometry, visible from across the arena.
    for y in [-1.35, 1.35]:
        box('Pixel eye', (2.88, y, 6.8), (.10, .65, .65), CYAN, 0)
    for y, z in [(-1.1, 5.8), (-.55, 5.45), (0, 5.45), (.55, 5.45), (1.1, 5.8)]:
        box('Pixel smile', (2.88, y, z), (.10, .5, .3), CYAN, 0)
    box('Control deck', (3, 0, 3.9), (2, 6.5, .45), CORAL)
    cone('Joystick', (3, -1.5, 4.65), .12, .12, 1.1, CREAM)
    ball('Joystick ball', (3, -1.5, 5.25), (.4, .4, .4), CYAN)
    for y in [.4, 1.3, 2.2]:
        cone('Button', (3.2, y, 4.3), .28, .28, .2, GOLD)
    box('Coin slot', (2.46, 0, 2), (.08, .35, .8), CYAN, .02)
    beam('Aerial', (0, 0, 9.7), (0, 0, 11.8), .12, CREAM)
    pieces = [torus('Orbit', (0, 0, 12), 1.4, .15, CYAN, (math.pi / 3, 0, 0)),
              ball('Orbit core', (0, 0, 12), (.55, .55, .55), CORAL)]
    join(pieces, 'anim_spinner', (0, 0, 12))
    export('landmark_neon', 4000)


def windmill():
    reset()
    box('Foundation', (0, 0, .25), (5, 6, .5), ROCK)
    for y in [-2, 2]:
        beam('Tower leg', (-1.7, y, .3), (0, y * .5, 9), .17, CREAM)
        beam('Tower leg', (1.7, y, .3), (0, y * .5, 9), .17, CREAM)
    for z in [2, 4, 6]:
        width = 2 * (1 - z / 12)
        for y in [-1, 1]:
            beam('Brace', (-width, y * width, z), (width * .7, y * width * .7, z + 1.8), .09, ROCK)
    cone('Water tank', (-2.5, 0, 2.1), 1.9, 1.9, 3.7, CYAN)
    cone('Tank roof', (-2.5, 0, 4.2), 2.1, .1, .6, ROCK)
    for z in [.6, 3.4]:
        torus('Tank band', (-2.5, 0, z), 1.91, .09, CREAM)
    hub = (1.05, 0, 9.2)
    pieces = [ball('Hub', hub, (.4, .4, .4), GOLD)]
    for i in range(8):
        angle = i * math.tau / 8
        end = (hub[0], math.sin(angle) * 3.4, hub[2] + math.cos(angle) * 3.4)
        pieces.append(beam('Spoke', hub, end, .10, GOLD))
        blade = box('Wind sail', (hub[0], math.sin(angle) * 2.65, hub[2] + math.cos(angle) * 2.65),
                    (.15, .8, 1.55), CREAM if i % 2 else CORAL, .04)
        blade.rotation_euler.x = -angle
        pieces.append(blade)
    join(pieces, 'anim_rotor', hub)
    export('landmark_canyon', 3500)


def bunker():
    reset()
    box('Foundation', (0, 0, .2), (9, 3.6, .4), DARK, .04)
    box('Bunker', (0, 0, 1.55), (8.85, 3.48, 2.8), DARK, .12)
    box('Roof', (0, 0, 3.1), (9, 3.6, .4), CORAL, .04)
    for y in [-1.76, 1.76]:
        box('Light rail', (0, y, 2.6), (8.4, .04, .12), CYAN, .015)
        for x in [-3.2, -1.6, 0, 1.6, 3.2]:
            box('Panel', (x, y, 1.5), (1.1, .05, 1.35), ROCK, .04)
            box('Panel light', (x, y * 1.015, 1.5), (.12, .015, .65), CYAN, 0)
    for x in [-4.45, 4.45]:
        box('End panel', (x, 0, 1.5), (.08, 2.9, 1.8), CORAL, .04)
    export('obstacle_neon', 2200)


def mesa():
    reset()
    # Eight-corner rectangular strata: exact full footprint, only tiny clipped corners.
    # The top/bottom stay flat, preserving the server's rectangular collision silhouette.
    levels = [(0, 1), (.8, .995), (1.1, .985), (1.85, .995), (2.1, .98), (3.05, .98), (3.3, 1)]
    shape = [(-4.4, -1.8), (4.4, -1.8), (4.5, -1.7), (4.5, 1.7),
             (4.4, 1.8), (-4.4, 1.8), (-4.5, 1.7), (-4.5, -1.7)]
    verts = [(x * scale, y * scale, z) for z, scale in levels for x, y in shape]
    faces = [tuple(reversed(range(8)))]
    for level in range(len(levels) - 1):
        for i in range(8):
            faces.append((level * 8 + i, level * 8 + (i + 1) % 8,
                          (level + 1) * 8 + (i + 1) % 8, (level + 1) * 8 + i))
    faces.append(tuple(range((len(levels) - 1) * 8, len(levels) * 8)))
    data = bpy.data.meshes.new('Layered mesa')
    data.from_pydata(verts, [], faces)
    o = bpy.data.objects.new('Mesa', data)
    bpy.context.collection.objects.link(o)
    for m in [ROCK, SAND, CREAM]:
        data.materials.append(m)
    for f in data.polygons:
        f.material_index = [0, 1, 0, 2, 0, 1][min(5, max(0, (f.index - 1) // 8))]
    export('obstacle_canyon', 600)


def cactus():
    reset()
    cone('Trunk', (0, 0, 2.6), .43, .32, 5.2, GREEN, 8)
    ball('Tip', (0, 0, 5.2), (.32, .32, .36), GREEN)
    for sign, z in [(-1, 2), (1, 3.1)]:
        beam('Arm', (0, 0, z), (0, sign * 1.35, z), .24, GREEN)
        cone('Upright arm', (0, sign * 1.35, z + .75), .25, .22, 1.5, GREEN, 8)
        ball('Arm tip', (0, sign * 1.35, z + 1.5), (.22, .22, .25), GREEN)
    for z in [1, 2, 3, 4, 4.8]:
        for y in [-.15, .15]:
            beam('Spine', (.32, y, z), (.5, y, z + .12), .025, CREAM)
    ball('Flower', (0, 0, 5.62), (.28, .28, .16), CORAL)
    export('prop_cactus', 1800)


for build in [trophy, arcade, windmill, bunker, mesa, cactus]:
    build()
(ART / 'environment-validation.json').write_text(json.dumps(REPORT, indent=2) + '\n')
