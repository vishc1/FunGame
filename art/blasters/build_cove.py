"""Pirate Cove: collision-exact plastic toys and printed beach playmat.

Rebuild: node art/blasters/prepare-cove.cjs, then Blender -b --python this file.
Flags, foliage and bucket profiles are shallow printed motifs, not new obstacles.
"""
import sys
import json
import math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
import build_assets as A
from build_towers import rgb, plane


def main():
    A.reset()
    data = json.loads((A.ART/'map-cove.json').read_text())
    assert len(data['boxes']) == 96
    assert all('color' in b for b in data['boxes'] if b['type'] == 'block')
    def material(name, color, rough=.48):
        m = A.material(name, rgb(color))
        m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = rough
        return m
    sand = material('Cove warm sand', '#eaca8c', .8)
    sandlight = material('Cove sand speckles', '#f8dfa7', .8)
    wet = material('Cove damp tide line', '#bbad82', .8)
    sea = material('Cove turquoise tide ink', '#58c8cc')
    foam = material('Cove seafoam ink', '#d2f7ed')
    sky = material('Cove sky blue backdrop', '#9cdbe9')
    wood = material('Cove moulded cedar', '#a86945', .36)
    plank = material('Cove deck honey plastic', '#d9a966', .36)
    dark = material('Cove navy ink', '#22394a')
    cream = material('Cove ivory paint', '#fff0c5')
    gold = material('Cove brass plastic', '#efbb4e', .3)
    red = material('Cove lighthouse coral', '#e95e53', .35)
    teal = material('Cove hut teal', '#369f9d')
    green = material('Cove palm ink', '#428b68')
    colors = {v: material('Cove block enamel '+v[1:], v, .38)
              for v in {b['color'] for b in data['boxes'] if b.get('color')}}
    plane('Sandy playmat',0,0,0,68,68,sand)
    # A printed shoreline, not water geometry: all floor decoration is <= 18 mm.
    for n in range(68):
        x = -33.5+n
        shore = -31.8 + .35*math.sin(n*.26)
        for name, edge, depth, z, mat in [('Wet sand',shore+.5,1,.008,wet),
                ('Turquoise tide',shore,shore+34,.012,sea),
                ('Foamy tide edge',shore+.04,.12,.018,foam)]:
            cy = edge-depth/2
            plane(name,x,cy,z,1,depth,mat)
    for ix in range(-16,17):
        for iy in range(-14,17):
            if (ix*7+iy*11)%5 == 0:
                plane('Printed sand fleck',ix*2+.31*math.sin(iy),iy*2,.008,.12,.035,sandlight)
    plane('Shore road',0,-29,.012,68,2.8,wet)
    for x in range(-33,34,3):
        plane('Shore road dash',x,-29,.018,.8,.06,cream)

    rejected, count = [], 0
    def keep(o,b):
        nonlocal count
        lo,hi=A.bounds([o]); c,s=b['blender_center'],b['blender_size']
        assert all(lo[j]>=c[j]-s[j]/2-.0501 and hi[j]<=c[j]+s[j]/2+.0501 for j in range(3)),o.name
        blocked = any(all(hi[j]>r['blender_min'][j]+.0001 and lo[j]<r['blender_max'][j]-.0001 for j in (0,1)) for r in data['ramps'])
        # Nested stair boxes include buried treads. Do not paint a second surface
        # where the hull already has its own walking-face paint.
        if b['type']=='step':
            for other in data['boxes']:
                if other['i']==b['i']: continue
                oc,os=other['blender_center'],other['blender_size']
                if all(lo[j]>=oc[j]-os[j]/2-.0151 and hi[j]<=oc[j]+os[j]/2+.0151 for j in range(3)):
                    blocked=True
        spots=[(p,1.2,2.4) for pair in data['teleporters'] for p in pair]
        spots += [(p['blender_pos'],p['radius']+.12,2) for p in data['jump_pads']]
        spots += [(p['blender_pos'],.7,1.7) for p in data['pickups']]
        for (x,y,z),r,h in spots:
            dx,dy=max(lo[0]-x,0,x-hi[0]),max(lo[1]-y,0,y-hi[1])
            if dx*dx+dy*dy<r*r and hi[2]>z+.015 and lo[2]<z+h: blocked=True
        track_y=data['train']['blender_y']
        if hi[1]>track_y-data['train']['track_half_width'] and lo[1]<track_y+data['train']['track_half_width'] and lo[2]<data['train']['max_height']: blocked=True
        if blocked:
            rejected.append(o.name); bpy.data.objects.remove(o,do_unlink=True)
        else:
            o['decor_box']=b['i']; count+=1

    def face(b,axis,side,points,mat,name,offset=.008):
        c,s=b['blender_center'],b['blender_size']; other=1-axis
        verts=[]
        for u,v in points:
            p=list(c); p[axis]+=side*(s[axis]/2+offset); p[other]+=u; p[2]+=v; verts.append(p)
        indices=list(range(len(verts)))
        if (axis==0 and side<0) or (axis==1 and side>0): indices.reverse()
        mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],[indices]); mesh.update()
        o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o); mesh.materials.append(mat); keep(o,b)
    def rect(b,axis,side,u,v,w,h,mat,name,offset=.008):
        face(b,axis,side,[(u-w/2,v-h/2),(u+w/2,v-h/2),(u+w/2,v+h/2),(u-w/2,v+h/2)],mat,name,offset)
    def disc(b,axis,side,u,v,r,mat,name,offset=.012):
        face(b,axis,side,[(u+r*math.cos(t*math.tau/16),v+r*math.sin(t*math.tau/16)) for t in range(16)],mat,name,offset)
    def bands(b,mat,height=.08,spacing=.6):
        h=b['blender_size'][2]
        for axis in (0,1):
            length=b['blender_size'][1-axis]
            for side in (-1,1):
                for k in range(1,int(h/spacing)+1):
                    v=-h/2+k*spacing
                    if v+height/2<h/2: rect(b,axis,side,0,v,length-.02,height,mat,'Painted moulding band')
    def deck(b):
        x,y,z=b['blender_center']; w,d,h=b['blender_size']
        keep(plane('Honey deck face',x,y,z+h/2+.008,w-.012,d-.012,plank),b)
        for n in range(1,int(w/.5)):
            keep(plane('Deck plank seam',x-w/2+n*.5,y,z+h/2+.011,.019,d-.024,wood),b)
        for n in range(1,int(d/2)):
            for col in range(int(w)):
                keep(plane('Staggered plank end',x-w/2+col+.25,y-d/2+n*2+(col%2)*.5,z+h/2+.014,.48,.018,wood),b)

    for b in data['boxes']:
        i,kind=b['i'],b['type']; x,y,z=b['blender_center']; w,d,h=b['blender_size']
        base=colors[b['color']] if b.get('color') else sky if kind=='wall' else sand if 72<=i<=83 else teal if i in (84,87) else wood
        core=A.box(f'collision_{i:03d}_{kind}',(x,y,z),(w,d,h),base,0); core['collision_index']=i
        if i<4:
            axis=1 if w>d else 0; side=-1 if b['blender_center'][axis]>0 else 1; length=b['blender_size'][1-axis]
            rect(b,axis,side,0,-h/2+.6,length-.03,1.2,sea,'Backdrop sea band')
            rect(b,axis,side,0,-h/2+1.23,length-.03,.08,foam,'Backdrop horizon')
            for u in range(-30,31,10):
                for du,dv,r in [(-.7,0,.6),(0,.25,.8),(.8,0,.55)]:
                    disc(b,axis,side,u+du,2+dv,r,cream,'Printed cloud')
            if i==0: disc(b,axis,side,-20,1,1.7,gold,'Sunny playmat sun',.025)
        elif 4<=i<=7:
            deck(b); bands(b,wood,.035,.48)
            for axis in (0,1):
                length=b['blender_size'][1-axis]
                for side in (-1,1):
                    rect(b,axis,side,0,h/2-.12,length-.04,.18,gold,'Ship gunwale stripe',.016)
                    for n in range(-int(length/2)+2,int(length/2)-1,3):
                        disc(b,axis,side,n,0,.38,gold,'Porthole brass rim',.019)
                        disc(b,axis,side,n,0,.28,dark,'Porthole glass',.022)
                        disc(b,axis,side,n-.07,.08,.075,foam,'Porthole glint',.025)
        elif i in (8,9):
            bands(b,plank,.06,1.2)
            for side in (-1,1):
                rect(b,0,side,0,2.4,.89,1.4,dark,'Printed skull flag')
                disc(b,0,side,0,2.65,.25,cream,'Skull flag head',.014)
                rect(b,0,side,0,2.43,.3,.22,cream,'Skull flag jaw',.014)
                for u in (-.10,.10): disc(b,0,side,u,2.68,.067,dark,'Skull eyes',.018)
                for direction in (-1,1):
                    face(b,0,side,[(-.32,2.05+direction*.12),(.28,2.05-direction*.12),(.32,2.11-direction*.12),(-.28,2.11+direction*.12)],cream,'Crossed toy bones',.014)
        elif i==10 or 11<=i<=14:
            deck(b); bands(b,gold,.1,.3)
        elif 15<=i<=68:
            deck(b)
            # Thin cream nosing remains below 1 cm: no raised tread ornaments.
            keep(plane('Stair nosing',x,y-d/2+.025,z+h/2+.011,w-.04,.04,cream),b)
        elif i==69:
            for axis in (0,1):
                for side in (-1,1):
                    for level in range(8):
                        rect(b,axis,side,0,-3.5+level,5.99,.98,cream if level%2 else red,'Lighthouse stripe')
                    rect(b,axis,side,0,-2.8,1.5,2.1,teal,'Lighthouse door',.018)
                    disc(b,axis,side,.46,-2.9,.08,gold,'Lighthouse handle',.024)
                    for v in (0,2):
                        disc(b,axis,side,0,v,.48,gold,'Gallery window rim',.019)
                        disc(b,axis,side,0,v,.37,dark,'Gallery window glass',.024)
        elif i==70:
            deck(b); bands(b,cream,.09,.2)
        elif 71<=i<=83:
            if i==71 or i>=80:
                bands(b,plank,.035,.4)
                for axis in (0,1):
                    for side in (-1,1):
                        length=b['blender_size'][1-axis]
                        # Bucket silhouette printed on the collision-exact square fort.
                        if i==71:
                            face(b,axis,side,[(-2.5,-1.45),(2.5,-1.45),(3,1.1),(-3,1.1)],sandlight,'Sand bucket relief',.012)
                            rect(b,axis,side,0,1.15,6.3,.2,plank,'Bucket rolled rim',.017)
                            rect(b,axis,side,0,-.55,1.3,1.7,wood,'Sandcastle arch door',.021)
                            disc(b,axis,side,0,.3,.65,wood,'Sandcastle arch crown',.021)
                            rect(b,axis,side,2,.2,.055,1.35,cream,'Paper flag stick',.021)
                            face(b,axis,side,[(2,.8),(2.8,.6),(2,.35)],red,'Paper pennant',.027)
                        else:
                            rect(b,axis,side,0,.35,length-.02,.18,sandlight,'Turret bucket rim')
                            rect(b,axis,side,0,-.03,.2,.35,wood,'Turret arrow slit')
            else:
                keep(plane('Sand stair edge',x,y-d/2+.025,z+h/2+.008,w-.02,.04,sandlight),b)
        elif i in (86,89):
            bands(b,plank,.09,.55)
            # Palm fronds wrap the existing narrow toy post; no floating canopy.
            for axis in (0,1):
                for side in (-1,1):
                    for sideleaf in (-1,1):
                        for v in (1.5,2,2.5):
                            face(b,axis,side,[(0,2.85),(sideleaf*.48,v),(sideleaf*.27,v+.45)],green,'Painted palm frond',.012)
                    disc(b,axis,side,0,1.7,.16,gold,'Painted coconut',.018)
        elif kind=='crate':
            for axis in (0,1):
                length=b['blender_size'][1-axis]
                for side in (-1,1):
                    if i in (84,87):
                        for n in range(int(length/.35)):
                            rect(b,axis,side,-length/2+.15+n*.35,0,.028,h-.04,cream,'Hut painted boards')
                        rect(b,axis,side,0,-.25,.9,1.9,dark,'Hut door',.017)
                        rect(b,axis,side,0,.84,1.05,.1,gold,'Hut door lintel',.022)
                        rect(b,axis,side,0,h/2-.2,length-.02,.25,red,'Hut canopy stripe',.016)
                    else:
                        for u in (-length*.4,length*.4): rect(b,axis,side,u,0,.14,h-.02,plank,'Crate corner strap')
                        for v in (-h*.38,h*.38): rect(b,axis,side,0,v,length-.02,.13,plank,'Crate rail')
                        face(b,axis,side,[(-length*.38,-h*.3),(-length*.29,-h*.3),(length*.38,h*.3),(length*.29,h*.3)],cream,'Crate diagonal brace',.016)
            keep(plane('Crate lid',x,y,z+h/2+.005,w-.025,d-.025,plank),b)
        else:
            bands(b,cream,.1,.4)
    A.export('fps_arena_cove',60000,center=False,metadata=dict(collision_boxes=96,floor_size=[68,68],units='metres; no rescaling',decoration_components=count,omitted_reserved_decoration=len(rejected)))
    (A.ART/'cove-clearance-validation.json').write_text(json.dumps(dict(collision_boxes=96,decoration_components=count,omitted_reserved_decoration=rejected,conflicts=[]),indent=2)+'\n')


if __name__=='__main__': main()
