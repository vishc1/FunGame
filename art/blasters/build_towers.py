"""Block Towers: exact collision solids with shallow toy-block decoration."""
import sys
import json
import math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_assets as A
import bpy


def rgb(value):
    # Map hex colours are sRGB; Principled base colours are linear.
    c = [int(value[i:i+2], 16)/255 for i in (1, 3, 5)]
    return tuple(v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in c)


def plane(name, x, y, z, w, d, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(x-w/2,y-d/2,z),(x+w/2,y-d/2,z),(x+w/2,y+d/2,z),(x-w/2,y+d/2,z)], [], [(0,1,2,3)])
    mesh.update()
    o = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(o)
    o.data.materials.append(mat)
    return o


def main():
    A.reset()
    data = json.loads((A.ART / 'map-towers.json').read_text())
    assert len(data['boxes']) == 117
    assert all('color' in b for b in data['boxes'] if b['type'] == 'block'), 'Run prepare-towers.cjs first'
    floor = A.material('Playmat warm cork', rgb('#dcb47c'))
    checker = A.material('Playmat woven squares', rgb('#d4ac77'))
    road = A.material('Playmat ink roads', rgb('#354a5a'))
    paper = A.material('Book pages', rgb('#f3dfb3'))
    yellow = A.material('Ruler yellow', rgb('#f2d16b'))
    ink = A.material('Ink navy', rgb('#243348'))
    white = A.material('Ivory printed marks', rgb('#fff3dc'))
    card = A.material('Cardboard', rgb('#c9a06a'))
    tape = A.material('Paper tape', rgb('#ebcda0'))
    palette, caps = {}, {}
    for value in sorted({b['color'] for b in data['boxes'] if b.get('color')}):
        palette[value] = A.material('Block enamel ' + value[1:], rgb(value))
        caps[value] = A.material('Block top ' + value[1:], tuple(v*.82+.18 for v in rgb(value)))
    plane('Playmat floor', 0, 0, 0, 60, 60, floor)
    for ix in range(12):
        for iy in range(12):
            if (ix+iy) % 2:
                plane('Woven square', -27.5+ix*5, -27.5+iy*5, .001, 5, 5, checker)
    # Flush ink only: the train and four ramps remain game-owned objects.
    plane('Track bed print', 0, 0, .003, 60, 2.8, road)
    plane('Cross avenue print', 0, 0, .003, 3.8, 60, road)
    for n in range(-14, 15):
        if abs(n) < 2 or 6 <= abs(n) <= 9:
            continue
        plane('Avenue dash', 0, n*2, .005, .12, .75, white)
    for s in (-1, 1):
        plane('Mat edge', 0, s*29.7, .005, 59.4, .12, white)
        plane('Mat edge', s*29.7, 0, .005, .12, 59.4, white)

    rejected, decoration_count = [], 0

    def keep(o, box):
        """Reject dressing that extends >5 cm or enters a reserved feature."""
        nonlocal decoration_count
        lo, hi = A.bounds([o])
        c, s = box['blender_center'], box['blender_size']
        assert all(lo[j] >= c[j]-s[j]/2-.0501 and hi[j] <= c[j]+s[j]/2+.0501 for j in range(3)), o.name
        blocked = False
        for r in data['ramps']:
            a, b = r['blender_min'], r['blender_max']
            if all(hi[j] > a[j]+.0001 and lo[j] < b[j]-.0001 for j in (0,1)):
                blocked = True
        spots = [(p, 1.2, 2.4) for pair in data['teleporters'] for p in pair]
        spots += [(p['blender_pos'], p['radius']+.12, 2) for p in data['jump_pads']]
        spots += [(p['blender_pos'], .7, 1.7) for p in data['pickups']]
        for (x,y,z), radius, height in spots:
            dx, dy = max(lo[0]-x, 0, x-hi[0]), max(lo[1]-y, 0, y-hi[1])
            if dx*dx+dy*dy < radius*radius and hi[2] > z+.015 and lo[2] < z+height:
                blocked = True
        if hi[1] > -data['train']['track_half_width'] and lo[1] < data['train']['track_half_width'] and lo[2] < 2.4 and abs(c[0]) < 30:
            blocked = True
        if blocked:
            rejected.append(o.name)
            bpy.data.objects.remove(o, do_unlink=True)
        else:
            o['decor_box'] = box['i']
            decoration_count += 1

    for b in data['boxes']:
        i, kind = b['i'], b['type']
        x,y,z = b['blender_center']; w,d,h = b['blender_size']; top = z+h/2
        mat = palette[b['color']] if b.get('color') else dict(wall=card, step=paper, beam=yellow, pillar=A.BLUE, rail=white, lowwall=A.GREEN)[kind]
        core = A.box(f'collision_{i:03d}_{kind}', (x,y,z), (w,d,h), mat, 0)
        core['collision_index'] = i
        if kind == 'block':
            cap = caps[b['color']]
            keep(plane('Lighter block top', x,y,top+.006,w-.07,d-.07,cap), b)
            # Four shallow round bosses read as moulded toy blocks without changing walkable height.
            for dx in (-.27*w, .27*w):
                for dy in (-.27*d, .27*d):
                    keep(A.cone('Moulded stud', (x+dx,y+dy,top+.024), min(w,d)*.115, min(w,d)*.11, .044, cap, 12), b)
            for side in (-1, 1):
                keep(A.box('Block seam', (x,y+side*(d/2+.006),z-h*.28), (w-.14,.012,.045), ink,0), b)
                keep(A.box('Block seam', (x+side*(w/2+.006),y,z-h*.28), (.012,d-.14,.045), ink,0), b)
                # Tiny moulding circles on the side add a visible toy finish at eye level.
                for dx in (-.28*w,.28*w):
                    keep(A.cone('Side moulding button',(x+dx,y+side*(d/2+.013),z),min(.19,h*.16),min(.19,h*.16),.024,cap,10,'Y'),b)
        elif kind == 'step':
            keep(plane('Book cover', x,y,top+.008,w-.018,d-.018,yellow if i%3 else A.BLUE), b)
            for side in (-1,1):
                keep(A.box('Book spine', (x,y+side*(d/2+.007),z), (w-.03,.014,min(.055,h*.25)),tape,0),b)
        elif kind == 'beam':
            keep(plane('Ruler walking face',x,y,top+.004,w-.04,d-.04,yellow),b)
            along_x = w >= d
            length = w if along_x else d
            for tick in range(-int(length/2)+1,int(length/2)):
                tx,ty=(x+tick,y-d/2+.36) if along_x else (x-w/2+.36,y+tick)
                tw,td=(.035,.35 if tick%5 else .65) if along_x else (.35 if tick%5 else .65,.035)
                keep(plane('Ruler tick',tx,ty,top+.012,tw,td,ink),b)
        elif kind == 'wall':
            horizontal = w > d
            inward = y-math.copysign(d/2+.012,y) if horizontal else x-math.copysign(w/2+.012,x)
            for offset in range(-27,28,6):
                pos=(offset,inward,z) if horizontal else (inward,offset,z)
                size=(.22,.024,h-.08) if horizontal else (.024,.22,h-.08)
                keep(A.box('Packing tape',pos,size,tape,0),b)
            for height in (1.1,7.8):
                pos=(x,inward,height) if horizontal else (inward,y,height)
                size=(w-.08,.024,.15) if horizontal else (.024,d-.08,.15)
                keep(A.box('Crayon wall stripe',pos,size,yellow if height>5 else A.BLUE,0),b)
        elif kind in ('rail','lowwall','pillar'):
            keep(plane('Toy edge cap',x,y,top+.008,w-.025,d-.025,white if kind=='rail' else yellow),b)
            for side in (-1,1):
                keep(A.box('Toy side band',(x,y+side*(d/2+.008),z),(w-.04,.016,min(.12,h*.2)),white,0),b)
    A.export('fps_arena_towers',60000,center=False,metadata=dict(collision_boxes=len(data['boxes']),floor_size=[60,60],units='metres; no rescaling',decoration_components=decoration_count,omitted_reserved_decoration=len(rejected)))
    (A.ART/'towers-clearance-validation.json').write_text(json.dumps(dict(collision_boxes=117,decoration_components=decoration_count,omitted_reserved_decoration=rejected,conflicts=[]),indent=2)+'\n')


if __name__ == '__main__':
    main()
