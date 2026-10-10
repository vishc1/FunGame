"""Collision-exact summit art. Run with Blender --background --python.

All decoration is tessellated into the cuboid: no overlaid coplanar faces,
roof furniture, railings or geometry hidden outside the collision volume.
"""
import math
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_height as H

A = H.A
A.REPORT_PATH = H.HERE / 'tower-validation.json'
A.REPORT = {}


def build(theme):
    base, top, bright, accent, trim = H.palette(theme)
    w, d, h = 10, 10, 10
    if theme == 'stadium':
        trim = A.material('Beacon ivory', (.98, .87, .48), emission=.35)
    elif theme == 'neon':
        accent = A.material('Penthouse magenta', (.95, .025, .38), emission=.3)
    else:
        trim = A.material('Weathered sandstone', (.64, .30, .12))
    H.poly('Closed underside', [(-5,5,0),(5,5,0),(5,-5,0),(-5,-5,0)], base)
    levels = [0, 4.8, 5.2, 6, 7, 8.1, 9.2, 9.55, 10]
    # Upper detail starts above the supporting deck. Shared boundary points
    # make the canyon strata continuous around corners without opening cracks.
    for edge in range(4):
        for row in range(8):
            for col in range(10):
                def point(c, r):
                    z = levels[r]
                    if theme == 'canyon' and r in (3,4,5,6):
                        z += .17 * math.sin((edge*10+c)*math.pi/5 + r*1.7)
                    return H.wall_point(edge, c/10, z, w, d)
                p = [point(col,row),point(col+1,row),point(col+1,row+1),point(col,row+1)]
                m = base
                if theme == 'stadium':
                    if row == 1: m = accent
                    elif row in (2,3,4,5):
                        m = top if col in (0,9) else base
                        if col in (4,5): m = trim if row%2 else accent
                    elif row == 6: m = trim if col in (3,4,5,6) else accent
                    elif row == 7: m = bright
                    if (row in (2,3,4,5) and col in (2,3,6,7)) or row == 7:
                        # Cross-braced radio-tower motif and hazard-striped cornice.
                        H.poly('Radio lattice', p[:3], bright if row == 7 else top)
                        H.poly('Radio lattice', [p[0],p[2],p[3]], base)
                        continue
                elif theme == 'neon':
                    if row in (1,6): m = accent
                    elif row in (2,3,4,5):
                        m = trim if col%3 != 0 and row%2 == 0 else top
                        if row == 5: m = bright if col in (1,2,4,5,7,8) else base
                    elif row == 7: m = bright
                else:
                    m = [base,accent,top,bright,trim,top,accent,bright][row]
                    if row in (2,4,5) and (col+edge*3)%7 == 0: m = base
                H.poly('Summit facade', p, m)
    if theme == 'stadium':
        # Flush beacon target: circular enamel rings meet the rectangular rim.
        rings = []
        for radius in (1.1,1.65,3.5,None):
            ring=[]
            for i in range(16):
                a=2*math.pi*i/16
                x,y=math.cos(a),math.sin(a)
                r=radius if radius else 5/max(abs(x),abs(y))
                ring.append((x*r,y*r,h))
            rings.append(ring)
        for i in range(16):
            j=(i+1)%16
            H.poly('Beacon lens',[(0,0,h),rings[0][i],rings[0][j]],trim)
            for r,m in enumerate((accent,top,bright)):
                H.poly('Beacon roof ring',[rings[r][i],rings[r+1][i],rings[r+1][j],rings[r][j]],m if r!=2 or i%2 else base)
    else:
        for x in range(8):
            for y in range(8):
                rim=x in (0,7) or y in (0,7)
                m=bright if rim else top
                if theme=='neon':
                    # Original pixel-light lightning sign painted into the roof.
                    if (x,y) in ((4,1),(3,2),(3,3),(4,3),(3,4),(4,4),(4,5),(3,6)): m=accent
                    elif not rim: m=base
                elif not rim and (x*3+y)%13==0: m=trim
                x0,y0=-5+x*1.25,-5+y*1.25
                H.poly('Flat summit roof',[(x0,y0,h),(x0+1.25,y0,h),(x0+1.25,y0+1.25,h),(x0,y0+1.25,h)],m)
    name='tower' if theme=='stadium' else 'tower_'+theme
    A.export(name,800,metadata=dict(nominal_size=[w,d,h],flat_top=True,
             full_footprint=True,visible_detail_above=4.8,theme=theme))


if __name__=='__main__':
    for theme in ('stadium','neon','canyon'):
        build(theme)
