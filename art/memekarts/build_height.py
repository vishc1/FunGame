"""Original collision-exact decks and +X ramps, Blender 4.0+."""
import sys
import json
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'blasters'))
import build_assets as A
A.ART = HERE
A.REPORT_PATH = HERE / 'height-validation.json'
A.REPORT = json.loads(A.REPORT_PATH.read_text()) if A.REPORT_PATH.exists() else {}


def poly(name, points, material):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], [tuple(range(len(points)))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return A.finish(obj, name, material)


def palette(theme):
    A.reset()
    if theme == 'neon':
        colors = [('Midnight alloy', (.025,.045,.10)), ('Roof slate', (.075,.13,.23)),
                  ('Cyan enamel', (.06,.8,.95)), ('Raspberry enamel', (.95,.025,.38)),
                  ('Window glow', (.15,.85,1))]
    elif theme == 'canyon':
        colors = [('Red sandstone', (.48,.18,.075)), ('Mesa sand', (.83,.49,.22)),
                  ('Chalk cream', (.98,.83,.52)), ('Clay orange', (.82,.30,.085)),
                  ('Turquoise paint', (.04,.58,.52))]
    else:
        colors = [('Podium concrete', (.13,.24,.28)), ('Court teal', (.26,.48,.5)),
                  ('Safety lemon', (1,.69,.02)), ('Coral enamel', (.95,.12,.065)),
                  ('Ivory paint', (.96,.94,.79))]
    mats = [A.material(n,c,emission=.45 if n=='Window glow' else 0) for n,c in colors]
    for m in mats:
        m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .8 if theme=='canyon' else .52
    return mats


def wall_point(edge, u, z, w, d):
    return [(-w/2+u*w,-d/2,z),(w/2,-d/2+u*d,z),
            (w/2-u*w,d/2,z),(-w/2,d/2-u*d,z)][edge]


def build_deck(theme):
    base, top, bright, accent, trim = palette(theme)
    w,d = {'stadium':(20,16),'neon':(30,22),'canyon':(22,12)}[theme]
    h=3.2
    poly('Solid underside',[(-w/2,d/2,0),(w/2,d/2,0),(w/2,-d/2,0),(-w/2,-d/2,0)],base)
    # All paint is coplanar tessellation, with no raised decals or collision gaps.
    nx,ny = (12,10) if theme=='neon' else (10,8)
    for x in range(nx):
        for y in range(ny):
            m=top
            if theme=='neon':
                if x in [1,nx-2] or y in [1,ny-2]: m=bright
                if (x in [4,7] and 3<=y<=6) or (y==4 and 4<=x<=7): m=trim
            elif theme=='stadium':
                if x in [0,nx-1] or y in [0,ny-1]: m=bright if (x+y)%2 else base
                elif (x in [4,5] and y in [2,5]) or (y in [3,4] and x in [3,6]): m=trim
            else:
                if x in [0,nx-1] or y in [0,ny-1]: m=bright
                elif (x+y*3)%17==0: m=accent
            x0,x1=-w/2+x*w/nx,-w/2+(x+1)*w/nx
            y0,y1=-d/2+y*d/ny,-d/2+(y+1)*d/ny
            poly('Flat roof tile',[(x0,y0,h),(x1,y0,h),(x1,y1,h),(x0,y1,h)],m)
    for edge in range(4):
        n=12 if edge%2==0 else 8
        # Canyon layers need no lateral subdivisions.
        if theme=='canyon': n=1
        bands=[0,.42,2.55,h] if theme!='canyon' else [0,.35,1.0,1.3,2.35,2.65,h]
        for row,(z0,z1) in enumerate(zip(bands,bands[1:])):
            for col in range(n):
                u0,u1=col/n,(col+1)/n
                m=base
                if theme=='neon': m=trim if row==1 and col%3!=2 else base
                elif theme=='canyon': m=[base,accent,bright,top,bright,accent][row]
                elif row==1: m=base if col%2 else accent
                else: m=bright if row==2 else base
                points=[wall_point(edge,u0,z0,w,d),wall_point(edge,u1,z0,w,d),wall_point(edge,u1,z1,w,d),wall_point(edge,u0,z1,w,d)]
                if theme=='stadium' and row==2:
                    poly('Hazard stripe',points[:3],bright)
                    poly('Hazard stripe',[points[0],points[2],points[3]],base)
                else: poly('Layered side panel',points,m)
    name='deck' if theme=='stadium' else 'deck_'+theme
    A.export(name,800 if theme=='neon' else 600,metadata=dict(nominal_size=[w,d,h],flat_top=True,full_footprint=True))


def seal_ramp(obj):
    """Weld panel seams and split T-junctions without moving the painted edges."""
    old = obj.data
    points, lookup = [], {}
    def vertex(co):
        key = tuple(round(v, 5) for v in co)
        if key not in lookup:
            lookup[key] = len(points)
            points.append(Vector(key))
        return lookup[key]
    panels = [(list(dict.fromkeys(vertex(old.vertices[i].co) for i in p.vertices)),
               p.material_index) for p in old.polygons]
    boundary_points = list(points)
    faces, materials = [], []
    for indices, material_index in panels:
        boundary = []
        for a, b in zip(indices, indices[1:]+indices[:1]):
            start, direction = points[a], points[b]-points[a]
            on_edge = []
            for i, point in enumerate(boundary_points):
                t = (point-start).dot(direction)/direction.length_squared
                if -.000001 <= t < .999999 and (point-start-t*direction).length < .00002:
                    on_edge.append((t, i))
            boundary.extend(i for _, i in sorted(on_edge))
        # Convex panels: a centre fan preserves every boundary segment, including
        # collinear paint seams that an ngon tessellator could otherwise discard.
        centre = vertex(sum((points[i] for i in boundary), Vector())/len(boundary))
        for a, b in zip(boundary, boundary[1:]+boundary[:1]):
            faces.append((centre,a,b))
            materials.append(material_index)
    mesh = bpy.data.meshes.new('Watertight ramp wedge')
    mesh.from_pydata(points, [], faces)
    for material in old.materials:
        mesh.materials.append(material)
        material.use_backface_culling = True
    for face, material_index in zip(mesh.polygons, materials):
        face.material_index = material_index
    mesh.update()
    obj.data = mesh
    bpy.data.meshes.remove(old)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    assert all(e.is_manifold and e.is_contiguous for e in bm.edges), 'Open or misoriented ramp seam'
    assert len(bm.verts)-len(bm.edges)+len(bm.faces) == 2, 'Ramp must be a closed genus-zero shell'
    assert abs(bm.calc_volume(signed=True)-134.4) < .001, 'Wrong wedge volume or orientation'
    interior = Vector((0,0,3.2/3))
    assert all(f.normal.dot(f.calc_center_median()-interior) > 0 for f in bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def build_ramp(theme):
    base,top,bright,accent,trim=palette(theme)
    w,d,h=10,8.4,3.2
    for edge,points in enumerate([
        [(-5,4.2,0),(5,4.2,0),(5,-4.2,0),(-5,-4.2,0)],
        [(-5,-4.2,0),(5,-4.2,0),(5,-4.2,h)],
        [(5,4.2,0),(-5,4.2,0),(5,4.2,h)],
        [(5,-4.2,0),(5,4.2,0),(5,4.2,h),(5,-4.2,h)]
    ]): poly('Solid ramp side',points,accent if edge in [1,2] else base)
    road=A.material('Runway enamel',(.95,.18,.045) if theme!='neon' else (.95,.025,.38))
    def surface(points): return [(x,y,(x+5)*h/w) for x,y in points]
    for y0,y1 in [(-4.2,-3.6),(3.6,4.2)]:
        poly('Edge enamel',surface([(-5,y0),(4.7,y0),(4.7,y1),(-5,y1)]),bright)
    poly('Top lip',surface([(4.7,-4.2),(5,-4.2),(5,4.2),(4.7,4.2)]),trim)
    for x0,x1,arrow in [(-5,-3.8,False),(-3.8,-1.5,True),(-1.5,-.8,False),(-.8,1.5,True),(1.5,2.2,False),(2.2,4.5,True),(4.5,4.7,False)]:
        if not arrow:
            poly('Runway fill',surface([(x0,-3.6),(x1,-3.6),(x1,3.6),(x0,3.6)]),road)
            continue
        mid=x0+.8
        for side in [-1,1]:
            regions=[([(x0,0),(mid,0),(x1-.65,side*2.9),(x0,side*2.9)],road),
                     ([(mid,0),(mid+.65,0),(x1,side*2.9),(x1-.65,side*2.9)],trim),
                     ([(mid+.65,0),(x1,0),(x1,side*2.9)],road),
                     ([(x0,side*2.9),(x1,side*2.9),(x1,side*3.6),(x0,side*3.6)],road)]
            for points,m in regions:
                points=[(x0+x1-x,y) for x,y in points]
                if side>0: points.reverse()
                poly('Uphill chevron' if m==trim else 'Runway fill',surface(points),m)
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active=bpy.context.scene.objects[0]
    bpy.ops.object.join()
    bpy.context.object.name='ramp_core'
    seal_ramp(bpy.context.object)
    name='ramp' if theme=='stadium' else 'ramp_'+theme
    A.export(name,500,metadata=dict(facing='+X',rises_toward='+X',nominal_size=[w,d,h],
             watertight=True,outward_normals=True,volume=134.4))
    if theme=='stadium':
        (HERE/'ramp-validation.json').write_text(json.dumps({'ramp':A.REPORT[name]},indent=2)+'\n')


if __name__=='__main__':
    for theme in ['stadium','neon','canyon']: build_deck(theme)
    for theme in ['stadium','neon','canyon']: build_ramp(theme)
