"""Toy Box Blasters original Blender art. No game code is changed.

Stages: -- figures, -- weapons, -- props, -- arena, -- train, -- expansion.
Blender 4.0+, no textures or external asset dependencies.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'art/blasters'
OUT = ROOT / 'public/models'
REPORT_PATH = ART / 'validation.json'
REPORT = json.loads(REPORT_PATH.read_text()) if REPORT_PATH.exists() else {}
bpy.context.preferences.filepaths.save_version = 0


def material(name, rgb, metallic=0, emission=0, alpha=1):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, alpha)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    roughness = .30
    if name in ['Ink navy', 'Warm vinyl']: roughness = .55
    if name in ['Cardboard', 'Paper tape', 'Book pages']: roughness = .88
    if name.startswith('Playmat'): roughness = .92
    if name in ['Balloon pink', 'Knot pink']: roughness = .23
    if metallic: roughness = .26
    for key, value in [('Base Color', (*rgb, alpha)), ('Roughness', roughness),
                       ('Metallic', metallic), ('Emission Color', (*rgb, 1)),
                       ('Emission Strength', emission), ('Alpha', alpha)]:
        p.inputs[key].default_value = value
    if alpha < 1:
        m.blend_method = 'BLEND'
        m.use_screen_refraction = False
    return m


def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)
    global PAINT, DARK, WHITE, SKIN, ORANGE, BLUE, YELLOW, RED, GREEN, PURPLE, METAL, CARD, TAPE, GLOW
    PAINT = material('Paint', (.68, .72, .78))
    DARK = material('Ink navy', (.022, .035, .065))
    WHITE = material('Vanilla plastic', (.95, .91, .78))
    SKIN = material('Warm vinyl', (.82, .43, .23))
    ORANGE = material('Tangerine', (1, .24, .025))
    BLUE = material('Blueberry', (.035, .23, .8))
    YELLOW = material('Lemon', (1, .72, .045))
    RED = material('Coral', (.9, .075, .13))
    GREEN = material('Apple', (.11, .65, .3))
    PURPLE = material('Grape', (.35, .10, .75))
    METAL = material('Toy silver', (.42, .58, .67), .35)
    CARD = material('Cardboard', (.61, .36, .16))
    TAPE = material('Paper tape', (.89, .73, .43))
    GLOW = material('Visor glow', (.1, .8, .95), emission=.7)


def finish(o, name, m):
    o.name = name
    o.data.materials.append(m)
    return o


def box(name, p, size, m, bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=p)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = o.modifiers.new('Moulded edges', 'BEVEL')
        b.width = min(bevel, min(size) * .22)
        b.segments = 1
        bpy.ops.object.modifier_apply(modifier=b.name)
    return finish(o, name, m)


def ball(name, p, size, m, seg=12, rings=6):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1, location=p)
    o = bpy.context.object
    o.scale = size
    for face in o.data.polygons:
        face.use_smooth = True
    return finish(o, name, m)


def cone(name, p, r0, r1, height, m, vertices=10, axis='Z'):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r0, radius2=r1, depth=height, location=p)
    o = bpy.context.object
    if vertices >= 8:
        for face in o.data.polygons:
            face.use_smooth = abs(face.normal.z) < .99
    if axis == 'Y':
        o.rotation_euler.x = -math.pi / 2  # +Z cone tip becomes +Y
    if axis == 'X':
        o.rotation_euler.y = math.pi / 2
    return finish(o, name, m)


def beam(name, a, b, radius, m, vertices=8):
    d = Vector(b) - Vector(a)
    o = cone(name, (Vector(a) + Vector(b)) / 2, radius, radius, d.length, m, vertices)
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return o


def bounds(objects):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(p) for o in objects for p in o.bound_box]
    return [min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]


def apply(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=o.name not in ('leg_l', 'leg_r', 'arm_l'), rotation=True, scale=True)


def joint_mesh(objects, name, pivot):
    """Keep all colours of a limb together around its runtime rotation joint."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    o = objects[0]
    o.name = name
    bpy.context.scene.cursor.location = pivot
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return o


def export(name, budget, center=True, metadata=None):
    objects = list(bpy.context.scene.objects)
    lo, hi = bounds(objects)
    # Figures are built around the hitbox and weapons around their grip: do not recentre them here.
    if center:
        shift = Vector((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]))
        for o in objects:
            o.location += shift
    for o in objects:
        apply(o)
    lo, hi = bounds(objects)
    triangles = 0
    for o in objects:
        o.data.calc_loop_triangles()
        triangles += len(o.data.loop_triangles)
    assert triangles <= budget, (name, triangles, budget)
    assert all(o.type == 'MESH' for o in objects)
    assert all((o.location.length < 1e-8 or o.name in ('leg_l', 'leg_r', 'arm_l'))
               and all(abs(s - 1) < 1e-8 for s in o.scale) for o in objects)
    bpy.ops.wm.save_as_mainfile(filepath=str(ART / (name + '.blend')))
    # Export static pieces by material, retaining semantic meshes for runtime validation.
    groups = {}
    for o in objects:
        if o.name.startswith(('head_core', 'right_hand', 'leg_l', 'leg_r', 'arm_l', 'muzzle_tip', 'grip', 'collision_', 'train_nose', 'balloon_knot', 'sword_blade', 'ramp_core')):
            continue
        groups.setdefault(o.data.materials[0].name, []).append(o)
    for mat_name, group in groups.items():
        if len(group) == 1:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in group:
            o.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        bpy.ops.object.join()
        group[0].name = 'detail_' + mat_name
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(OUT / (name + '.glb')), export_format='GLB',
                             use_selection=True, export_yup=True, export_apply=True,
                             export_animations=False, export_cameras=False, export_lights=False,
                             export_extras=True)
    REPORT[name] = dict(triangles=triangles, budget=budget, min=lo, max=hi,
                        materials=sorted({m.name for o in bpy.context.scene.objects for m in o.data.materials}),
                        **(metadata or {}))
    REPORT_PATH.write_text(json.dumps(REPORT, indent=2) + '\n')
    print('ASSET_READY', name, triangles, flush=True)


def face():
    for x in [-.075, .075]:
        ball('Eye', (x, -.199, 1.58), (.026, .025, .034), DARK, 8, 4)
        ball('Eye glint', (x - .006, -.22, 1.59), (.008, .006, .010), WHITE, 6, 3)
    ball('Button nose', (0, -.212, 1.52), (.045, .039, .037), SKIN, 8, 4)
    box('Smile', (0, -.19, 1.46), (.075, .025, .017), DARK, .005)


def figure(k):
    reset()
    # The body/head use the 1.8 m figure proportions; head_core is the current loader's fitting anchor.
    # Decorative hats extend above the head without shifting its 1.56 m centre.
    # Character-right is Blender -X when facing -Y. The renderer rotates characters 180 degrees after import.
    for x in [-.175, .175]:
        before = set(bpy.context.scene.objects)
        box('Boot', (x, -.06, .10), (.26, .38, .20), DARK)
        box('Sole', (x, -.06, .035), (.27, .39, .07), WHITE, .008)
        box('Leg', (x, .015, .43), (.215, .24, .51), BLUE if k != 5 else DARK)
        ball('Knee joint', (x, -.114, .49), (.10, .035, .08), METAL, 8, 4)
        joint_mesh(list(set(bpy.context.scene.objects) - before), 'leg_l' if x > 0 else 'leg_r', (x, 0, .70))
    box('Torso', (0, 0, 1.02), (.57, .38, .59), PAINT, .035)
    box('Belt', (0, -.005, .745), (.59, .405, .09), DARK)
    box('Buckle', (0, -.216, .745), (.10, .04, .07), YELLOW, .01)
    # Symmetric bounds also preserve the head's X/Y origin under the loader's bbox-centering.
    joint_mesh([
        box('Left sleeve', (.33, .015, 1.05), (.18, .23, .43), PAINT, .025),
        ball('Left hand', (.33, -.005, .79), (.09, .09, .105), SKIN, 10, 5)
    ], 'arm_l', (.33, 0, 1.265))
    box('Right sleeve', (-.33, -.11, 1.2), (.18, .43, .18), PAINT, .025)
    box('right_hand', (-.33, -.36, 1.2), (.18, .12, .145), SKIN, .025)
    box('Back shell', (0, .3075, 1.06), (.36, .225, .4), PAINT, .025)
    box('Chest badge', (.10, -.199, 1.15), (.11, .025, .13), [YELLOW, BLUE, RED, GLOW, PURPLE, RED, WHITE, GREEN][k], .01)
    cone('Neck', (0, 0, 1.345), .09, .09, .09, SKIN)
    ball('head_core', (0, 0, 1.56), (.21, .20, .19 if k == 0 else .21), SKIN)
    if k in [1, 2, 4, 6]:
        face()
    if k == 0:
        cone('Bucket helmet', (0, .015, 1.56), .235, .22, .40, METAL, 12)
        box('Visor slit', (0, -.224, 1.575), (.30, .025, .062), DARK, .009)
        for x in [-.09, 0, .09]:
            box('Helmet vent', (x, -.222, 1.475), (.022, .026, .07), DARK, .004)
        box('Crest', (0, .025, 1.835), (.065, .30, .17), RED, .012)
        for x in [-.30, .30]:
            box('Shoulder plate', (x, .02, 1.27), (.18, .26, .10), METAL)
    elif k == 1:
        glass = material('Bubble clear', (.67, .9, 1), metallic=.08, alpha=.22)
        ball('Bubble helmet', (0, 0, 1.56), (.24, .24, .24), glass, 16, 8)
        cone('Collar ring', (0, 0, 1.35), .235, .235, .075, WHITE, 12)
        box('Backpack', (0, .32, 1.04), (.40, .2, .48), WHITE)
        for x in [-.14, .14]:
            cone('Air canister', (x, .32, 1.05), .07, .07, .42, BLUE, 8)
        box('Control panel', (0, -.206, 1.07), (.3, .03, .21), WHITE)
        for x in [-.075, 0, .075]:
            box('Panel button', (x, -.227, 1.10), (.04, .014, .05), ORANGE if x else GLOW, .004)
    elif k == 2:
        # Wide, folded paper-captain hat; not a branded character's tricorn.
        box('Hat brim', (0, .015, 1.66), (.70, .43, .055), DARK)
        cone('Hat crown', (0, .015, 1.79), .23, .19, .24, DARK, 8)
        for x in [-.29, .29]:
            flap = box('Folded hat corner', (x, .01, 1.77), (.16, .36, .055), DARK)
            flap.rotation_euler.y = math.copysign(.55, x)
        box('Hat badge', (0, -.194, 1.80), (.12, .025, .065), YELLOW)
        box('Eye patch', (.076, -.223, 1.58), (.10, .036, .075), DARK)
        box('Patch strap', (0, -.215, 1.61), (.34, .02, .024), DARK, .003)
        box('Sash', (0, -.207, .90), (.54, .032, .06), RED)
    elif k == 3:
        # Replace the round vinyl head with an equally centred, sphere-contained box.
        bpy.data.objects.remove(bpy.data.objects['head_core'], do_unlink=True)
        box('head_core', (0, 0, 1.56), (.33, .33, .33), METAL, .035)
        box('Robot face', (0, -.178, 1.575), (.28, .038, .15), DARK)
        for x in [-.075, .075]:
            box('Visor eye', (x, -.202, 1.595), (.075, .015, .05), GLOW, .004)
        box('Robot smile', (0, -.202, 1.535), (.09, .015, .018), YELLOW, .003)
        beam('Antenna', (.10, .03, 1.70), (.17, .03, 1.97), .018, METAL, 6)
        ball('Antenna bulb', (.17, .03, 1.98), (.035, .035, .035), RED, 8, 4)
        for x in [-.19, .19]:
            cone('Ear joint', (x, 0, 1.55), .07, .07, .05, BLUE, 8, 'X')
    elif k == 4:
        cone('Wizard brim', (0, .015, 1.695), .34, .34, .035, PURPLE, 12)
        cone('Hat taper', (0, .015, 1.90), .30, .09, .45, PURPLE, 10)
        beam('Bent hat tip', (0, .015, 2.10), (.20, .015, 2.16), .04, PURPLE, 8)
        ball('Hat bell', (.22, .015, 2.16), (.04, .04, .04), YELLOW, 8, 4)
        beard = cone('Beard', (0, -.18, 1.35), .015, .135, .28, WHITE, 8)
        for x in [-.065, .065]:
            ball('Moustache', (x, -.211, 1.455), (.078, .04, .037), WHITE, 8, 4)
        box('Robe hem', (0, .01, .70), (.59, .42, .15), PAINT)
    elif k == 5:
        ball('Mask', (0, .0, 1.56), (.222, .211, .24), DARK)
        box('Eye opening', (0, -.203, 1.59), (.32, .04, .085), SKIN)
        for x in [-.075, .075]:
            box('Ninja eye', (x, -.229, 1.59), (.036, .01, .035), DARK, .004)
        box('Headband', (0, -.203, 1.68), (.32, .05, .045), RED)
        for x in [-.12, .12]:
            tail = box('Headband tail', (x, .285, 1.60), (.07, .26, .045), RED)
            tail.rotation_euler.x = x * 1.4
        box('Sash knot', (.18, -.225, .8), (.09, .06, .12), RED)
    elif k == 6:
        cone('Chef hat band', (0, .015, 1.80), .205, .205, .23, WHITE, 12)
        for x, y in [(-.12, 0), (.12, 0), (0, -.055), (0, .085)]:
            ball('Chef puff', (x, y, 1.94), (.13, .13, .15), WHITE, 10, 5)
        for x in [-.058, .058]:
            ball('Moustache', (x, -.218, 1.475), (.07, .029, .025), DARK, 8, 4)
        box('Apron', (0, -.199, .95), (.32, .026, .37), WHITE)
        for z in [.99, 1.12]:
            box('Apron button', (.095, -.219, z), (.026, .014, .026), DARK, .003)
    else:
        ball('Dinosaur hood', (0, .035, 1.57), (.245, .215, .23), GREEN)
        # Raised face opening reads as a vinyl child's face inside the costume.
        ball('Face opening', (0, -.148, 1.535), (.175, .093, .17), SKIN)
        for x in [-.065, .065]:
            ball('Dino kid eye', (x, -.24, 1.565), (.022, .018, .029), DARK, 8, 4)
            ball('Dino kid eye glint', (x-.004, -.256, 1.574), (.007, .005, .008), WHITE, 6, 3)
        box('Dino kid smile', (0, -.241, 1.485), (.055, .015, .014), DARK, .003)
        box('Hood snout', (0, -.177, 1.695), (.32, .19, .08), GREEN)
        for x in [-.12, -.04, .04, .12]:
            cone('Soft hood tooth', (x, -.255, 1.642), 0, .029, .052, WHITE, 5)
        for x in [-.17, .17]:
            ball('Hood eye', (x, -.10, 1.715), (.048, .046, .04), WHITE, 8, 4)
            ball('Hood pupil', (x, -.138, 1.716), (.021, .013, .025), DARK, 8, 4)
        for z in [.83, 1.03, 1.23]:
            o = cone('Back spikes', (0, .38, z), .06, 0, .08, YELLOW, 5, 'Y')
    lo, hi = bounds(list(bpy.context.scene.objects))
    assert 1.7999 <= hi[2] <= 2.4, (k, hi)
    assert lo[0] >= -.421 and hi[0] <= .421 and lo[1] >= -.421 and hi[1] <= .421, (k, lo, hi)
    export('fps_char_' + str(k), 2500, center=False,
           metadata=dict(head_center=[0, 0, 1.56], body_box=[.84, .84, 1.36], facing='-Y',
                         joints={'leg_l': [.175, 0, .70], 'leg_r': [-.175, 0, .70], 'arm_l': [.33, 0, 1.265]}))


def blaster(kind):
    reset()
    main = dict(dart=ORANGE, scatter=BLUE, rapid=YELLOW, long=PURPLE, boom=GREEN)[kind]
    box('grip', (0, 0, .10), (.11, .13, .20), BLUE if kind == 'dart' else DARK, .018)
    box('Grip heel', (0, 0, .025), (.13, .15, .05), main, .009)
    if kind == 'dart':
        box('Pistol shell', (0, .095, .255), (.16, .42, .18), main, .025)
        cone('Barrel', (0, .315, .27), .06, .06, .12, YELLOW, 10, 'Y')
        cone('muzzle_tip', (0, .38, .27), .045, .045, .016, DARK, 10, 'Y')
        box('Slide stripe', (0, .065, .353), (.08, .30, .02), WHITE, .004)
        box('Sight', (0, .22, .38), (.035, .05, .04), BLUE, .004)
    elif kind == 'scatter':
        box('Pump shell', (0, .12, .26), (.20, .49, .19), main, .025)
        box('Stock', (0, -.22, .22), (.13, .26, .18), ORANGE)
        box('Pump', (0, .22, .15), (.22, .21, .11), YELLOW)
        cone('Flared barrel', (0, .42, .27), .075, .12, .17, ORANGE, 10, 'Y')
        cone('muzzle_tip', (0, .507, .27), .093, .093, .015, DARK, 10, 'Y')
        for y in [.16, .22, .28]:
            box('Pump rib', (0, y, .095), (.20, .016, .015), BLUE, 0)
    elif kind == 'rapid':
        box('Compact shell', (0, .10, .28), (.17, .42, .19), main, .025)
        cone('Foam drum', (0, .17, .105), .105, .105, .20, ORANGE, 12, 'X')
        for x in [-.105, .105]:
            cone('Drum cap', (x, .17, .10), .06, .06, .014, BLUE, 10, 'X')
        cone('Barrel', (0, .37, .27), .045, .045, .16, BLUE, 10, 'Y')
        cone('muzzle_tip', (0, .458, .27), .065, .065, .026, ORANGE, 10, 'Y')
        box('Carry handle', (0, .085, .425), (.08, .26, .06), main)
        for y in [.0, .17]:
            box('Handle support', (0, y, .39), (.07, .035, .07), BLUE, .008)
    elif kind == 'long':
        box('Long receiver', (0, .15, .255), (.13, .53, .15), main)
        box('Butt stock', (0, -.26, .22), (.15, .29, .19), main)
        cone('Long barrel', (0, .60, .27), .035, .035, .39, BLUE, 10, 'Y')
        cone('muzzle_tip', (0, .80, .27), .057, .057, .04, ORANGE, 10, 'Y')
        box('Scope mount', (0, .13, .36), (.06, .18, .08), WHITE)
        cone('Scope', (0, .13, .43), .07, .07, .30, DARK, 12, 'Y')
        for y in [-.035, .295]:
            cone('Scope rim', (0, y, .43), .085, .085, .04, YELLOW, 12, 'Y')
        cone('Scope glass', (0, .318, .43), .065, .065, .01, GLOW, 10, 'Y')
    else:
        cone('Launcher tube', (0, .11, .27), .145, .145, .62, main, 12, 'Y')
        for y in [-.20, .40]:
            cone('Tube ring', (0, y, .27), .166, .166, .055, ORANGE, 12, 'Y')
        cone('Tube opening', (0, .431, .27), .126, .126, .012, DARK, 12, 'Y')
        cone('Foam rocket nose', (0, .50, .27), .105, .035, .15, RED, 10, 'Y')
        cone('muzzle_tip', (0, .58, .27), .04, .02, .025, WHITE, 8, 'Y')
        box('Front grip', (0, .26, .095), (.10, .1, .19), DARK)
        box('Carry loop', (0, .0, .475), (.075, .22, .055), YELLOW)
        for y in [-.075, .075]:
            box('Carry loop support', (0, y, .4275), (.06, .035, .07), YELLOW, 0)
    for x in [-1, 1]:
        box('Side flash', (x * dict(dart=.083, scatter=.103, rapid=.088, long=.068, boom=.136)[kind], .095, .265),
            (.012, .13, .035), WHITE, 0)
    # Raw-origin loader: retain grip zero and distinguish pistol/rifle lengths.
    length = dict(dart=.5, scatter=.85, rapid=.6, long=1.2, boom=.85)[kind]
    objects = list(bpy.context.scene.objects)
    lo, hi = bounds(objects)
    length_scale = length / (hi[1] - lo[1])
    for o in objects:
        apply(o)
        for v in o.data.vertices:
            v.co.y *= length_scale
    export('fps_w_' + kind, dict(dart=500, scatter=700, rapid=700, long=800, boom=700)[kind],
           center=False, metadata=dict(facing='+Y', origin='bottom of grip at (0,0,0)', length=length, barrel_height=.27))


def new_blaster(kind):
    reset()
    pink = material('Balloon pink', (1, .075, .32))
    sky = material('Pool blue', (.035, .60, .95))
    cyan = material('Ray cyan', (.05, .95, 1), emission=2.4)
    box('grip', (0, 0, .10), (.095, .12, .20), DARK, .015)
    box('Grip heel', (0, 0, .025), (.12, .14, .05), GREEN if kind == 'burst' else sky if kind == 'lob' else PURPLE)
    if kind == 'burst':
        box('Carbine receiver', (0, .085, .265), (.14, .35, .14), GREEN, .025)
        box('Skeletal toy stock', (0, -.18, .255), (.085, .23, .085), GREEN)
        box('Stock end', (0, -.30, .25), (.12, .055, .17), GREEN)
        cone('Long thin barrel', (0, .35, .27), .030, .030, .26, BLUE, 10, 'Y')
        cone('muzzle_tip', (0, .49, .27), .043, .043, .035, ORANGE, 10, 'Y')
        box('Small box magazine', (0, .13, .125), (.085, .09, .18), DARK, .012)
        box('Magazine base', (0, .13, .049), (.105, .11, .035), ORANGE, .006)
        box('Sight bridge', (0, .065, .352), (.045, .17, .055), YELLOW, .006)
        for x in [-.073, .073]:
            for y in [.005, .070, .135]:
                box('Three-shot marks', (x, y, .277), (.008, .030, .048), WHITE, 0)
    elif kind == 'lob':
        cone('Wide lobber tube', (0, .12, .27), .142, .154, .40, sky, 12, 'Y')
        cone('Rear cap', (0, -.105, .27), .15, .15, .06, sky, 12, 'Y')
        cone('Muzzle rim', (0, .335, .27), .175, .175, .07, WHITE, 12, 'Y')
        cone('Dark muzzle well', (0, .375, .27), .140, .140, .012, DARK, 12, 'Y')
        ball('muzzle_tip', (0, .402, .27), (.119, .145, .119), pink, 12, 6)
        box('Water tank foot', (0, -.145, .255), (.20, .12, .13), sky, .025)
        box('Top carry rail', (0, .045, .475), (.075, .20, .05), sky, .009)
        for y in [-.035, .125]:
            box('Carry rail support', (0, y, .43), (.06, .035, .08), WHITE, .006)
        for x in [-.15, .15]:
            box('Lobber side badge', (x, .09, .27), (.012, .10, .065), WHITE, 0)
    else:
        ball('Retro ray housing', (0, .035, .27), (.105, .205, .105), PURPLE, 12, 6)
        cone('Ray barrel', (0, .30, .27), .045, .045, .30, PURPLE, 10, 'Y')
        for y, radius in [(.22, .09), (.31, .105), (.40, .085)]:
            cone('White ray ring', (0, y, .27), radius, radius, .035, WHITE, 12, 'Y')
        ball('muzzle_tip', (0, .485, .27), (.061, .073, .061), cyan, 10, 5)
        box('Retro dorsal fin', (0, -.035, .37), (.035, .19, .10), PURPLE, .009)
        cone('Charge dial', (-.101, .035, .27), .045, .045, .014, cyan, 10, 'X')
        cone('Charge dial', (.101, .035, .27), .045, .045, .014, cyan, 10, 'X')
    objects = list(bpy.context.scene.objects)
    lo, hi = bounds(objects)
    for o in objects:
        apply(o)
        for v in o.data.vertices:
            v.co.y *= .7 / (hi[1] - lo[1])
    export('fps_w_' + kind, 700, center=False,
           metadata=dict(facing='+Y', origin='bottom of grip at (0,0,0)', length=.7, barrel_height=.27))


def balloon():
    reset()
    pink = material('Balloon pink', (1, .075, .32))
    rubber = material('Knot pink', (.75, .035, .16))
    ball('Balloon body', (0, .035, .185), (.18, .215, .185), pink, 12, 6)
    cone('Balloon neck', (0, -.185, .185), .028, .032, .055, rubber, 8, 'Y')
    cone('balloon_knot', (0, -.245, .185), .053, .020, .08, rubber, 8, 'Y')
    objects = list(bpy.context.scene.objects)
    lo, hi = bounds(objects)
    scale = .5 / max(hi[0]-lo[0], hi[1]-lo[1])
    for o in objects:
        apply(o)
        for v in o.data.vertices:
            v.co *= scale
    export('fps_balloon', 200, metadata=dict(facing='+Y', knot_direction='-Y', length=.5))


def sword():
    reset()
    foam = material('Orange foam', (1, .28, .025))
    foam.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .86
    cone('grip', (0, 0, .12), .046, .046, .24, DARK, 10)
    cone('Pommel', (0, 0, .025), .059, .059, .05, BLUE, 8)
    box('Blue crossguard', (0, 0, .265), (.43, .125, .08), BLUE, .025)
    # A wide blunt foam paddle, with moulded bevels and no sharp metal edge.
    profile = [(-.115,.28),(.115,.28),(.145,.94),(.10,1.12),(0,1.20),(-.10,1.12),(-.145,.94)]
    n = len(profile)
    vertices = [(x, y, z) for y in [-.05, .05] for x, z in profile]
    faces = [tuple(range(n)), tuple(reversed(range(n,2*n)))]
    faces += [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
    mesh = bpy.data.meshes.new('Foam blade mesh'); mesh.from_pydata(vertices, [], faces); mesh.update()
    o = bpy.data.objects.new('sword_blade', mesh); bpy.context.collection.objects.link(o); finish(o, 'sword_blade', foam)
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bevel = o.modifiers.new('Soft foam edge', 'BEVEL'); bevel.width = .018; bevel.segments = 1
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    for y in [-.051, .051]:
        box('Foam centre stripe', (0, y, .68), (.047, .007, .61), YELLOW, 0)
    for z in [.075,.13,.185]:
        cone('Grip wrap', (0, 0, z), .049, .049, .013, BLUE, 8)
    objects = list(bpy.context.scene.objects); lo, hi = bounds(objects)
    for o in objects:
        apply(o)
        for v in o.data.vertices:
            v.co.z *= 1.2 / hi[2]
    export('fps_sword', 300, center=False, metadata=dict(blade_direction='+Z', origin='bottom of grip', height=1.2))


def train():
    reset()
    # Three chunky wooden-toy cars; the front bumper fixes the +Y nose at 4.1 m.
    box('Engine chassis', (0, 2.4, .55), (1.48, 3.2, .30), RED, .06)
    cone('Boiler', (0, 2.7, 1.21), .48, .48, 1.75, YELLOW, 12, 'Y')
    for y in [1.90, 3.48]:
        cone('Boiler band', (0, y, 1.21), .495, .495, .11, ORANGE, 12, 'Y')
    cone('Boiler face', (0, 3.62, 1.21), .39, .39, .12, BLUE, 12, 'Y')
    cone('Headlamp', (0, 3.72, 1.35), .17, .17, .12, WHITE, 10, 'Y')
    box('train_nose', (0, 4.0, .53), (1.64, .2, .24), ORANGE, .045)
    cone('Chimney', (0, 3.12, 1.88), .13, .20, .63, BLUE, 10)
    cone('Chimney lip', (0, 3.12, 2.20), .245, .245, .13, ORANGE, 10)
    box('Cab back', (0, 1.08, 1.35), (1.42, .14, 1.32), RED, .04)
    box('Cab sill', (0, 1.49, .95), (1.42, .88, .45), RED, .04)
    for x in [-.63, .63]:
        for y in [1.11, 1.84]:
            box('Cab window post', (x, y, 1.61), (.13, .13, .91), RED, .02)
    box('Cab roof', (0, 1.46, 2.12), (1.76, 1.13, .20), BLUE, .07)
    box('Back window', (0, .998, 1.62), (.85, .025, .55), GLOW, .035)
    for y in [.64, -1.85]:
        box('Toy coupler', (0, y, .49), (.22, .44, .16), DARK, .025)
    for index, (y, color) in enumerate([(-.55, GREEN), (-3.0, BLUE)]):
        box('Wagon floor', (0, y, .57), (1.50, 2.20, .20), color, .04)
        for x in [-.70, .70]:
            box('Wagon side', (x, y, 1.02), (.12, 2.20, .72), color, .025)
            box('Wagon stripe', (x*1.10, y, 1.08), (.024, 1.94, .15), YELLOW, 0)
            for yy in [y-.85, y+.85]:
                box('Wagon corner cap', (x, yy, 1.40), (.16, .20, .08), ORANGE, 0)
        for yy in [y-1.04, y+1.04]:
            box('Wagon end', (0, yy, 1.02), (1.35, .12, .72), color, .025)
        # Loose cargo stays below the rim and reads as playroom building blocks.
        box('Cargo block', (-.26, y-.32, .92), (.56, .65, .48), PURPLE if index else ORANGE, .06)
        box('Cargo block', (.29, y+.40, .97), (.54, .61, .58), RED if index else YELLOW, .06)
    for y in [1.34, 2.42, 3.5, -1.26, .16, -3.71, -2.29]:
        for side in [-1, 1]:
            cone('Wheel', (side*.72, y, .34), .34, .34, .18, DARK, 10, 'X')
            cone('Wheel hub', (side*.824, y, .34), .19, .19, .035, YELLOW, 8, 'X')
    lo, hi = bounds(list(bpy.context.scene.objects))
    assert hi[0]-lo[0] <= 1.8 and hi[2]-lo[2] <= 2.4
    assert abs(hi[1]-lo[1]-8.2) < .0001
    export('fps_train', 2500, metadata=dict(facing='+Y', wagons=2, length=8.2, max_width=1.8, max_height=2.4))


def plus(p, size, m, axis='Y'):
    x, y, z = p
    box('Plus horizontal', (x, y, z), (size, .025, size * .28), m, 0)
    box('Plus vertical', (x, y - .001, z), (size * .28, .025, size), m, 0)


def prop(kind):
    reset()
    if kind == 'health':
        box('Juice carton', (0, 0, .23), (.30, .23, .46), WHITE, .02)
        box('Orange band', (0, 0, .12), (.308, .238, .06), ORANGE, .005)
        box('Carton seam', (0, 0, .48), (.30, .045, .06), BLUE, .008)
        beam('Straw', (.085, .03, .45), (.085, .03, .65), .018, ORANGE, 6)
        beam('Straw bend', (.085, .03, .64), (.155, .03, .66), .018, ORANGE, 6)
        plus((0, -.13, .285), .16, RED)
        budget = 300
    elif kind == 'mega':
        box('Lunchbox', (0, 0, .22), (.67, .31, .44), RED, .035)
        box('Lid', (0, 0, .465), (.69, .33, .09), RED, .018)
        for x in [-.16, .16]:
            box('Handle side', (x, 0, .565), (.05, .075, .16), DARK, .008)
        box('Handle top', (0, 0, .635), (.35, .075, .05), DARK, .008)
        for x in [-.22, .22]:
            box('Latch', (x, -.17, .425), (.055, .035, .10), YELLOW, .004)
        plus((0, -.172, .245), .25, WHITE)
        budget = 500
    elif kind == 'armor':
        box('Cardboard breastplate', (0, 0, .25), (.48, .14, .5), CARD, .02)
        for x in [-.22, .22]:
            box('Blue edge', (x, -.081, .25), (.04, .024, .48), BLUE, .004)
            box('Shoulder flap', (x, .03, .50), (.10, .22, .07), CARD, .009)
        box('Tape crossbar', (0, -.087, .27), (.46, .02, .055), TAPE, 0)
        box('Tape upright', (0, -.088, .27), (.06, .02, .44), TAPE, 0)
        box('Blue bottom', (0, -.084, .027), (.46, .02, .045), BLUE, 0)
        budget = 400
    elif kind == 'rocket':
        cone('Foam body', (0, -.02, .095), .075, .075, .40, ORANGE, 10, 'Y')
        cone('muzzle_tip', (0, .245, .095), .077, .015, .15, RED, 10, 'Y')
        cone('Soft nose', (0, .325, .095), .024, .01, .02, WHITE, 8, 'Y')
        for x in [-.09, .09]:
            box('Foam fin', (x, -.145, .095), (.055, .17, .025), BLUE, 0)
        box('Upper fin', (0, -.145, .165), (.025, .17, .14), BLUE, 0)
        budget = 300
    else:
        box('Wooden toy crate', (0, 0, 1.1), (2.2, 2.2, 2.2), CARD, .025)
        for y in [-1.105, 1.105]:
            for z in [.22, 1.98]:
                box('Crate rail', (0, y, z), (2.12, .018, .15), TAPE, 0)
            for x in [-.91, .91]:
                box('Crate upright', (x, y, 1.1), (.15, .018, 1.76), TAPE, 0)
        for x in [-1.105, 1.105]:
            box('Side band', (x, 0, 1.1), (.018, 2.1, .22), BLUE, 0)
        budget = 300
    export('fps_' + kind, budget, metadata=dict(facing='+Y' if kind == 'rocket' else '-Y'))


def arena():
    reset()
    data = json.loads((ART / 'map.json').read_text())
    assert len(data['boxes']) == 101
    grass = material('Playmat green', (.20, .43, .31))
    grass_alt = material('Playmat checks', (.23, .48, .35))
    road = material('Playmat roads', (.13, .24, .30))
    pages = material('Book pages', (.86, .79, .63))
    navy = material('Book navy', (.04, .14, .25))
    palette = [RED, BLUE, YELLOW, GREEN, PURPLE, ORANGE]
    for m in [CARD, TAPE, grass, grass_alt, pages]:
        m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .85

    def plane(name, center, size, mat):
        x, y, z = center
        w, d = size
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([(x-w/2, y-d/2, z), (x+w/2, y-d/2, z),
                          (x+w/2, y+d/2, z), (x-w/2, y+d/2, z)], [], [(0, 1, 2, 3)])
        mesh.update()
        o = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(o)
        o.data.materials.append(mat)
        return o

    def text(name, value, p, size, mat, rotation=(0, 0, 0)):
        curve = bpy.data.curves.new(name, 'FONT')
        curve.body = value
        curve.align_x = 'CENTER'
        curve.size = size
        curve.resolution_u = 2
        curve.extrude = 0
        o = bpy.data.objects.new(name, curve)
        bpy.context.collection.objects.link(o)
        o.location = p
        o.rotation_euler = rotation
        o.data.materials.append(mat)
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.convert(target='MESH')
        return bpy.context.object

    def ring(name, x, y, radius, width, mat):
        verts, faces = [], []
        for i in range(64):
            a = i * math.tau / 64
            for r in [radius - width / 2, radius + width / 2]:
                verts.append((x + math.cos(a) * r, y + math.sin(a) * r, .009))
        for i in range(64):
            j = (i + 1) % 64
            faces.append((i*2, i*2+1, j*2+1, j*2))
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        o = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(o)
        o.data.materials.append(mat)

    plane('Playmat floor', (0, 0, 0), (64, 64), grass)
    for ix in range(8):
        for iy in range(8):
            if (ix + iy) % 2:
                plane('Woven checker', (-28 + ix * 8, -28 + iy * 8, .001), (8, 8), grass_alt)
    for x, y, mat in [(-24, -24, RED), (24, -24, BLUE), (-24, 24, YELLOW), (24, 24, GREEN)]:
        plane('Corner team zone', (x, y, .002), (14.5, 14.5), mat)
    # Printed roads and markings have no appreciable height and do not obscure pads or pickups.
    plane('Crossroad east west', (0, 0, .003), (64, 3.8), road)
    plane('Crossroad north south', (0, 0, .003), (3.8, 64), road)
    for side in [-1, 1]:
        plane('Ring road', (0, side * 17, .004), (37.8, 3.8), road)
        plane('Ring road', (side * 17, 0, .004), (3.8, 37.8), road)
    for n in range(-15, 16):
        for c in [-17, 0, 17]:
            if abs(c) > 0 and abs(n * 2) > 18:
                continue
            plane('Road dash', (n * 2, c, .007), (.8, .11), WHITE)
            plane('Road dash', (c, n * 2, .007), (.11, .8), WHITE)
    ring('Centre orientation circle', 0, 0, 11, .20, YELLOW)
    for side in [-1, 1]:
        # Guides stop short of the orange jump-pad surfaces (which the game draws).
        for z in [22, 24]:
            plane('Orange launch guide', (side * 2.8, side * z, .008), (.22, 1.0), ORANGE)

    decor_bounds = []
    for b in data['boxes']:
        i, kind = b['i'], b['type']
        x, y, z = b['blender_center']
        w, d, h = b['blender_size']
        top = z + h/2
        mat = dict(wall=CARD, tower=palette[i % 3], step=pages, bridge=TAPE, plat=CARD,
                   pillar=palette[i % 6], rail=WHITE, fort=palette[i % 4], crate=CARD,
                   lowwall=GREEN if i % 2 else RED)[kind]
        core = box(f'collision_{i:03d}_{kind}', (x, y, z), (w, d, h), mat, 0)
        core['collision_index'] = i
        before = set(bpy.context.scene.objects)
        if kind == 'wall':
            # Cardboard seams and tape are no more than 2 cm proud of the collision surface.
            axis = 'Y' if w > d else 'X'
            span = w if axis == 'Y' else d
            face = y - math.copysign(d/2 + .012, y) if axis == 'Y' else x - math.copysign(w/2 + .012, x)
            for offset in range(-28, 29, 8):
                if axis == 'Y':
                    box('Packing tape seam', (offset, face, z), (.24, .02, h-.12), TAPE, 0)
                else:
                    box('Packing tape seam', (face, offset, z), (.02, .24, h-.12), TAPE, 0)
            if axis == 'Y':
                for zz in [1.1, 7.8]:
                    box('Packing tape band', (x, face, zz), (span-.1, .02, .18), TAPE, 0)
                rot = (math.pi/2, 0, 0 if y > 0 else math.pi)
                text('Playroom title', 'TOY BOX' if y > 0 else 'FOAM DART CLUB', (0, face, 5.7), 2.3, BLUE if y > 0 else RED, rot)
                text('Playroom subtitle', 'PLAY NICE. AIM BETTER.', (0, face, 4.1), .8, DARK, rot)
                # Simple crayon suns/rays, in geometry rather than copyrighted art.
                for xx in [-20, 20]:
                    cone('Crayon sun', (xx, face, 4.8), 1.0, 1.0, .012, YELLOW, 12, 'Y')
                    for n in range(8):
                        a = n * math.tau / 8
                        beam('Crayon sun ray', (xx + math.cos(a)*1.3, face, 4.8 + math.sin(a)*1.3),
                             (xx + math.cos(a)*1.7, face, 4.8 + math.sin(a)*1.7), .03, ORANGE, 4)
            else:
                for zz in [1.1, 7.8]:
                    box('Packing tape band', (face, y, zz), (.02, span-.1, .18), TAPE, 0)
                rot = (math.pi/2, 0, math.pi/2 if x < 0 else -math.pi/2)
                text('Wing label', 'BUILD / BLAST / REPEAT', (face, 0, 5.8), 1.5, GREEN if x < 0 else PURPLE, rot)
        elif kind == 'step':
            plane('Book cover', (x, y, top+.012), (w, d), palette[i % 6])
            # A short spine at each tread height avoids overlapping whole-height decorations on nested steps.
            for side in [-1, 1]:
                box('Book spine', (x, y+side*(d/2+.008), top-.11), (w-.04, .012, .15), palette[i % 6], 0)
                box('Book page line', (x+side*(w/2+.008), y, top-.19), (.012, d-.04, .018), CARD, 0)
        elif kind in ['bridge', 'plat']:
            plane('Ruler face', (x, y, top+.008), (w, d), TAPE if kind == 'bridge' else navy)
            axis_x = w >= d
            length, width = (w, d) if axis_x else (d, w)
            for n in range(int(length)-1):
                a = -length/2 + n + 1
                tick = .7 if n % 5 == 0 else .35
                p = (x+a, y-width/2+tick/2+.08, top+.014) if axis_x else (x-width/2+tick/2+.08, y+a, top+.014)
                plane('Ruler tick', p, (.045, tick) if axis_x else (tick, .045), DARK if kind == 'bridge' else WHITE)
        elif kind == 'pillar':
            # Square crayon cartons keep the rectangular hit shape completely visible.
            for side in [-1, 1]:
                box('Crayon wrapper stripe', (x, y+side*(d/2+.009), z), (w*.52, .015, h*.78), WHITE, 0)
                box('Crayon wrapper band', (x+side*(w/2+.009), y, z), (.015, d*.9, .16), YELLOW, 0)
        elif kind == 'rail':
            long_x = w > d
            length = w if long_x else d
            count = max(1, int(length / 1.5))
            for n in range(count):
                along = -length/2 + (n+.5)*length/count
                for side in [-1, 1]:
                    for dz in [-.18, .18]:
                        p = (x+along, y+side*(d/2+.01), z+dz) if long_x else (x+side*(w/2+.01), y+along, z+dz)
                        cone('Domino pip', p, .075, .075, .015, DARK, 8, 'Y' if long_x else 'X')
        elif kind in ['tower', 'fort', 'crate']:
            # Wooden-block inset borders and grain marks stay flush with the solid block.
            for side in [-1, 1]:
                for zz in [z-h/2+.10, top-.10]:
                    box('Block face border', (x, y+side*(d/2+.01), zz), (w-.10, .015, .09), TAPE, 0)
                    box('Block end border', (x+side*(w/2+.01), y, zz), (.015, d-.10, .09), TAPE, 0)
                for xx in [-w/2+.10, w/2-.10]:
                    box('Block edge', (x+xx, y+side*(d/2+.01), z), (.09, .015, max(.1,h-.20)), TAPE, 0)
            if kind == 'crate':
                text('Alphabet block', 'ABCXYZ'[i % 6], (x, y-d/2-.021, z-h*.24), min(w,h)*.60, BLUE, (math.pi/2,0,0))
            elif kind == 'fort':
                text('Fort number', str(1 + (i-53)//3), (x, y-d/2-.021, z-h*.26), h*.7, WHITE, (math.pi/2,0,0))
            elif kind == 'tower' and h > 1:
                text('Central building block', 'FORT', (x, y-d/2-.021, z-.5), .9, WHITE, (math.pi/2,0,0))
        else:
            # Low cover reads as a two-tone eraser with a paper wrapper, never a fence with false gaps.
            for side in [-1, 1]:
                box('Eraser sleeve', (x, y+side*(d/2+.01), z), (w*.52, .015, h*.94), WHITE, 0)
                box('Sleeve stripe', (x, y+side*(d/2+.02), z), (w*.48, .012, .13), BLUE, 0)

        decorations = list(set(bpy.context.scene.objects) - before)
        if decorations:
            lo, hi = bounds(decorations)
            for axis in range(3):
                assert lo[axis] >= b['blender_center'][axis] - b['blender_size'][axis]/2 - .0501, (i, kind, lo, hi)
                assert hi[axis] <= b['blender_center'][axis] + b['blender_size'][axis]/2 + .0501, (i, kind, lo, hi)
            decor_bounds.append(dict(box=i, min=lo, max=hi))
    export('fps_arena', 80000, center=False,
           metadata=dict(collision_boxes=101, decoration_bounds=decor_bounds, units='metres; no rescaling', floor_size=[64,64]))


if __name__ == '__main__':
    stage = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'figures'
    if stage == 'figures':
        for k in range(8):
            figure(k)
    elif stage == 'weapons':
        for kind in ['dart', 'scatter', 'rapid', 'long', 'boom']:
            blaster(kind)
    elif stage == 'props':
        for kind in ['health', 'mega', 'armor', 'rocket', 'crate']:
            prop(kind)
    elif stage == 'arena':
        arena()
    elif stage == 'train':
        train()
    elif stage == 'expansion':
        for kind in ['burst', 'lob', 'zap']:
            new_blaster(kind)
        balloon()
        sword()
    else:
        raise ValueError('Unknown stage: ' + stage)
