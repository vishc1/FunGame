import bpy, math, json, os
from mathutils import Vector
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
OUT=ROOT+'/public/models'
ART=ROOT+'/art/memekarts'
reports=[]
bpy.context.preferences.filepaths.save_version=0
def mat(n,c,metal=0,emit=0,alpha=1):
 m=bpy.data.materials.new(n);m.diffuse_color=(*c,alpha);m.use_nodes=True
 roughness=.27 if n=='Paint' else .85 if n=='Rubber' else .52 if n=='Peach' else .24 if metal else .33
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,alpha);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=roughness
 p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=emit;p.inputs['Alpha'].default_value=alpha
 if alpha<1:m.blend_method='BLEND'
 return m
def reset():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for m in list(bpy.data.materials):bpy.data.materials.remove(m)
 global P,D,W,C,S,Y,R,B,G,O
 P=mat('Paint',(.66,.7,.76),.12);D=mat('Rubber',(.025,.035,.055));W=mat('Ivory',(.94,.95,.9));C=mat('Chrome',(.4,.55,.63),.65);S=mat('Peach',(.93,.52,.28));Y=mat('Lemon',(1,.69,.015));R=mat('Coral',(.92,.06,.16));B=mat('Electric blue',(.035,.34,.95));G=mat('Mint',(.04,.75,.38));O=mat('Orange',(1,.24,.03))
def finish(o,n,m):
 o.name=n;o.data.materials.append(m);return o
def box(n,p,s,m,bev=.06):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bev:
  mod=o.modifiers.new('Soft toy edges','BEVEL');mod.width=bev;mod.segments=1;bpy.ops.object.modifier_apply(modifier=mod.name)
 return finish(o,n,m)
def ball(n,p,s,m,seg=12,rings=6):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,radius=1,location=p);o=bpy.context.object;o.scale=s
 for face in o.data.polygons:face.use_smooth=True
 return finish(o,n,m)
def cone(n,p,r1,r2,h,m,verts=12,axis='Z'):
 bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r1,radius2=r2,depth=h,location=p);o=bpy.context.object
 if verts>=8:
  for face in o.data.polygons:face.use_smooth=abs(face.normal.z)<.99
 if axis=='Y':o.rotation_euler.x=math.pi/2
 if axis=='X':o.rotation_euler.y=math.pi/2
 return finish(o,n,m)
def bar(n,a,b,r,m,verts=6):
 d=Vector(b)-Vector(a);o=cone(n,(Vector(a)+Vector(b))/2,r,r,d.length,m,verts);o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o
def join(obs,n,origin):
 bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();o=obs[0];o.name=n;bpy.context.scene.cursor.location=origin;bpy.ops.object.origin_set(type='ORIGIN_CURSOR');return o
def wheels(tractor=False):
 for x,ax in [(1.05,'f'),(-1.02,'r')]:
  r=.64 if tractor and ax=='r' else .35 if tractor else .46
  for y,side in [(.99,'l'),(-.99,'r')]:
   obs=[cone('Tyre',(x,y,r),r,r,.4,D,12,'Y'),cone('Hub',(x,y,r),r*.52,r*.52,.43,Y if tractor else C,10,'Y')]
   for yy in [y-.225,y+.225]:obs.append(cone('Axle cap',(x,yy,r),r*.2,r*.2,.03,D,8,'Y'))
   join(obs,'wheel_'+ax+side,(x,y,r))
def eyes(x,z,y=.18):
 for yy in [-y,y]:
  ball('Eye white',(x,yy,z),(.065,.115,.13),W,8,4);ball('Pupil',(x+.06,yy,z),(.04,.055,.075),D,8,4)
def driver(kind=0,p=(-.3,0,1.0)):
 x,y,z=p
 ball('Jacket',(x,y,z+.25),(.34,.36,.46),[B,R,G,O,Y,G,B,R][kind],10,5)
 ball('Head',(x+.04,y,z+.87),(.36,.33,.4),S,12,6)
 for yy in [-.38,.38]:bar('Sleeve',(x,yy,z+.4),(x+.48,yy*.8,z+.27),.12,W);ball('Glove',(x+.48,yy*.8,z+.27),(.14,.13,.13),W,8,4)
 eyes(x+.37,z+.92)
 ball('Nose',(x+.4,y,z+.78),(.17,.13,.13),S,8,4)
 if kind==0:
  ball('Cap',(x,y,z+1.13),(.41,.37,.18),O);box('Cap brim',(x+.33,y,z+1.08),(.43,.6,.07),O,.025)
  for yy in [-.1,.1]:ball('Moustache',(x+.405,yy,z+.66),(.08,.16,.075),D,8,4)
 elif kind==1:box('Trucker cap',(x,y,z+1.16),(.62,.6,.18),R);box('Visor',(x+.32,y,z+1.13),(.4,.63,.05),R,.01)
 elif kind==2:
  for yy in [-.31,.31]:ball('Pigtail',(x-.06,yy,z+1.14),(.17,.18,.18),D,8,4)
 elif kind==3:cone('Party hat',(x,y,z+1.42),.32,0,.7,Y,8)
 elif kind==4:
  ball('Racing helmet',(x-.07,y,z+.98),(.41,.4,.43),W);box('Dark visor',(x+.32,y,z+.98),(.1,.64,.2),D)
 elif kind==5:
  cone('Farmer brim',(x,y,z+1.15),.5,.5,.06,Y);cone('Farmer crown',(x,y,z+1.29),.26,.2,.25,Y)
 elif kind==6:ball('Chef hat',(x,y,z+1.25),(.38,.37,.25),W)
 else:
  ball('Pilot helmet',(x-.06,y,z+1.02),(.4,.37,.37),O);box('Goggles',(x+.35,y,z+1),(.13,.66,.18),D);box('Scarf',(x-.48,y,z+.58),(.7,.2,.12),R)
def export(name,budget):
 obs=list(bpy.context.scene.objects)
 for o in obs:
  bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.transform_apply(location=not o.name.startswith('wheel_'),rotation=True,scale=True);o.select_set(False)
 pts=[o.matrix_world@Vector(v) for o in obs for v in o.bound_box];lo=[min(v[i] for v in pts) for i in range(3)];hi=[max(v[i] for v in pts) for i in range(3)]
 shift=Vector((-(lo[0]+hi[0])/2,-(lo[1]+hi[1])/2,-lo[2]))
 for o in obs:
  if o.name.startswith('wheel_'):o.location+=shift
  else:
   for v in o.data.vertices:v.co+=shift
 tris=0
 for o in obs:o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles);o.select_set(True)
 assert tris<=budget,(name,tris,budget)
 bpy.ops.wm.save_as_mainfile(filepath=ART+'/'+name+'.blend')
 bpy.ops.export_scene.gltf(filepath=OUT+'/'+name+'.glb',export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False)
 reports.append(dict(name=name,triangles=tris,budget=budget,bounds_min=[lo[i]+shift[i] for i in range(3)],bounds_max=[hi[i]+shift[i] for i in range(3)],wheel_names=[o.name for o in obs if o.name.startswith('wheel_')],materials=sorted({m.name for o in obs for m in o.data.materials})))
 with open(ART+'/validation.json','w') as f:json.dump(reports,f,indent=2)
 print('ASSET_READY',name,tris,flush=True)
def kart(k):
 reset()
 if k!=7:wheels(k==5)
 box('Chassis',(0,0,.59),(3.05,1.45,.28),D)
 if k==0:
  box('Nose',(1,0,.85),(1,.95,.35),P);box('Side left',(-.2,.69,.8),(1.9,.23,.45),P);box('Side right',(-.2,-.69,.8),(1.9,.23,.45),P);box('Seat',(-.7,0,.97),(.35,.65,.9),D);box('Front bumper',(1.65,0,.53),(.22,1.5,.22),C);driver(k)
 elif k==1:
  box('Truck hood',(.95,0,1.02),(1.22,1.5,.56),P);box('Bed floor',(-1.06,0,.82),(.98,1.52,.2),P)
  for y in [-.7,.7]:box('Bed rail',(-1.05,y,1.1),(1.1,.14,.52),P)
  box('Tailgate',(-1.55,0,1.1),(.15,1.5,.52),P);driver(k,(-.22,0,1));box('Cab roof',(-.15,0,2.35),(1.2,1.7,.15),P)
  for x in [-.72,.41]:
   for y in [-.73,.73]:bar('Cab pillar',(x,y,1.1),(x,y,2.32),.055,C)
 elif k==2:
  box('Basket base',(.05,0,1),(2.3,1.55,.12),P)
  for z in [1.1,1.45,1.8]:
   for y in [-.76,.76]:bar('Basket horizontal',(-1.05,y,z),(1.2,y,z),.045,C)
   for x in [-1.05,1.2]:bar('Basket end',(x,-.76,z),(x,.76,z),.045,C)
  for x in [-1.05,-.6,0,.6,1.2]:
   for y in [-.76,.76]:bar('Basket upright',(x,y,1),(x,y,1.8),.04,C)
  bar('Handle',(-1.5,-.8,1.9),(-1.5,.8,1.9),.09,R);driver(k,(-.2,0,1.15))
 elif k==3:
  box('Bus body',(0,0,1.1),(3.1,1.6,1),P);box('Roof',(0,0,2.18),(3.1,1.7,.15),Y)
  for x in [-1.1,-.35,.4]:
   for y in [-.81,.81]:box('Window',(x,y,1.77),(.58,.025,.5),B,.03)
  driver(k,(.92,0,1.05))
  for x in [-.65,.65]:
   for y in [-.5,.5]:bar('Balloon tether',(x,y,2.2),(x*.8,y*.8,3.2),.025,C)
  ball('Balloon',(0,0,3.8),(1.05,.88,1.18),O,12,8);cone('Balloon mouth',(0,0,2.87),.28,.45,.4,Y)
  for y in [-.5,.5]:ball('Balloon stripe',(0,y,3.84),(.62,.55,1.13),Y,8,6)
 elif k==4:
  box('Sports body',(.1,0,.78),(3.2,1.5,.42),P);cone('Rocket exhaust',(-1.5,0,.9),.35,.27,.6,C,12,'X');driver(k,(-.15,0,.82))
  for y in [-.62,.62]:bar('Wing strut',(-1.17,y,.9),(-1.17,y,1.55),.06,D)
  box('Rear wing',(-1.3,0,1.59),(.5,2.04,.12),P)
 elif k==5:
  box('Engine',( .8,0,1.05),(1.3,.9,.8),P);box('Grille',(1.47,0,1.08),(.03,.65,.45),D,.015);cone('Exhaust',(.6,.46,1.71),.08,.08,.85,D,8);driver(k,(-.65,0,1.02))
  for x in [-1.18,.16]:
   for y in [-.65,.65]:bar('Roof post',(x,y,1),(x,y,2.55),.045,C)
  box('Canopy',(-.51,0,2.59),(1.75,1.6,.16),P)
 elif k==6:
  box('Van',(0,0,1.05),(3.05,1.55,1),P)
  for y in [-.79,.79]:box('Serving window',(-.6,y,1.3),(1.05,.04,.4),B);box('Candy stripe',(0,y,.88),(2.9,.035,.14),R,.005)
  driver(k,(.91,0,.97));cone('Roof cone',(-.55,0,1.8),.1,.34,.5,Y);ball('Strawberry scoop',(-.55,0,2.17),(.42,.4,.29),R);ball('Cherry',(-.55,0,2.51),(.05,.05,.05),O,8,4)
 else:
  ball('Capsule',(0,0,.85),(1.6,.65,.55),P,16,8);cone('Nozzle',(-1.57,0,.85),.51,.31,.43,C,12,'X');cone('Nozzle dark',(-1.8,0,.85),.4,.4,.02,D,12,'X');driver(k,(-.1,0,.87))
  for y in [-.8,.8]:
   box('Ski',(0,y,.1),(3.45,.22,.18),B);bar('Ski curl',(1.6,y,.1),(1.8,y,.37),.11,B);bar('Ski strut',(-.7,y,.18),(-.7,y,.8),.06,C);bar('Ski strut',(.7,y,.18),(.7,y,.8),.06,C)
 for y in [-.48,.48]:box('Headlight',(1.56,y,.86),(.06,.23,.13),Y,.02)
 export('kart_'+str(k),3500 if k==3 else 3000)

def glyph(n,segments,p,size,m,axis='X',flip=False):
 # Seven-segment style line art; each stroke is a closed rectangular solid.
 x,y,z=p
 for a,b in segments:
  u,v=a;u2,v2=b
  if flip:u,v,u2,v2=-u,-v,-u2,-v2
  if axis=='X':aa=(x,y+u*size,z+v*size);bb=(x,y+u2*size,z+v2*size)
  elif axis=='Y':aa=(x+u*size,y,z+v*size);bb=(x+u2*size,y,z+v2*size)
  else:aa=(x+u*size,y+v*size,z);bb=(x+u2*size,y+v2*size,z)
  a3,b3=Vector(aa),Vector(bb);normal=Vector((1,0,0) if axis=='X' else (0,1,0) if axis=='Y' else (0,0,1));side=(b3-a3).cross(normal).normalized()*size*.06
  mesh=bpy.data.meshes.new(n);mesh.from_pydata([a3-side,a3+side,b3+side,b3-side],[],[(0,1,2,3)]);mesh.update();o=bpy.data.objects.new(n,mesh);bpy.context.collection.objects.link(o);o.data.materials.append(m)
Q=[((-.24,.3),(-.15,.5)),((-.15,.5),(.2,.5)),((.2,.5),(.28,.2)),((.28,.2),(0,0)),((0,0),(0,-.13)),((0,-.38),(0,-.45))]
def items():
 reset();ball('Worried egg',(0,0,1.3),(.95,.85,1.3),W,12,8);eyes(.9,1.7,.3)
 for y in [-.3,.3]:bar('Worried eyebrow',(.91,y-.13,1.96),(.94,y+.1,2.03),.035,D)
 bar('Worried mouth',(.95,-.15,1.2),(.95,.15,1.2),.045,D);export('kart_egg',800)
 reset();ball('Bullet body',(0,0,.78),(1.4,.65,.72),D,16,8);cone('Tail band',(-1.15,0,.78),.65,.65,.23,C,12,'X');eyes(1.25,1.05,.29)
 for y in [-1,1]:
  bar('Little arm',(-.1,y*.5,.68),(.2,y*.86,.55),.13,D);ball('Fist',(.2,y*.86,.55),(.24,.22,.24),W,8,4);bar('Angry brow',(1.3,y*.18,1.23),(1.22,y*.45,1.36),.07,D)
 export('bullet_bill',1200)
 for fake in [False,True]:
  reset();gl=mat('Hologram', (1,.33,.04) if fake else (.08,.48,1),emit=.55,alpha=.55);ink=mat('Question glow',(1,.93,.6),emit=2)
  box('Mystery cube',(0,0,.75),(1.5,1.5,1.5),gl,0)
  for axis in ['X','Y','Z']:
   for sign in [-1,1]:
    p=(sign*.76,0,.75) if axis=='X' else (0,sign*.76,.75) if axis=='Y' else (0,0,.75+sign*.76)
    glyph('Upside down question' if fake else 'Question',Q,p,.9,ink,axis,fake)
  export('fake_box' if fake else 'item_box',300)
 for typ in ['green','red','blue']:
  reset();color={'green':G,'red':R,'blue':B}[typ]
  cone('Ivory bumper',(0,0,.19),.84,.84,.23,W,16);ball('Armored dome',(0,0,.35),(.76,.72,.6),color,12,6)
  # Broad central armor and nose distinguish orientation.
  box('Nose',(.7,0,.32),(.35,.38,.2),color,.05)
  if typ=='red':
   for x in [-.4,0,.4]:cone('Crest',(x,0,.93),.12,0,.3,Y,5)
  if typ=='blue':
   for x,y in [(-.4,-.35),(-.4,.35),(.3,-.35),(.3,.35),(0,0)]:cone('Spike',(x,y,.9),.14,0,.52,W,5)
   for y in [-1,1]:
    for i in range(3):o=box('Wing feather',(-.3+i*.18,y*(.84+i*.12),.58+i*.07),(.65,.28,.13),W,.035);o.rotation_euler.z=y*.4
  export('shell_'+typ,800 if typ=='blue' else 500)
 reset()
 for a in [0,2*math.pi/3,4*math.pi/3]:
  # Tapered, curved peel strips with a solid underside.
  verts=[]
  for r,z,w in [(0,.78,.18),(.35,.38,.27),(.8,.08,.2),(1.08,.15,.025)]:
   for side in [-1,1]:verts.append((r*math.cos(a)-side*w*math.sin(a),r*math.sin(a)+side*w*math.cos(a),z))
  faces=[(i,i+1,i+3,i+2) for i in [0,2,4]];mesh=bpy.data.meshes.new('Peel mesh');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Peel flap',mesh);bpy.context.collection.objects.link(o);o.data.materials.append(Y);bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Peel thickness','SOLIDIFY');mod.thickness=.09;bpy.ops.object.modifier_apply(modifier=mod.name)
 cone('Stem',(0,0,.85),.11,.08,.25,G,6);export('banana',400)
 reset();ball('Bomb',(0,0,.82),(.62,.62,.64),D,12,6)
 for y in [-.36,.36]:box('Boot',(.15,y,.16),(.55,.37,.3),O)
 eyes(.57,.93,.22);bar('Fuse',(0,0,1.4),(.18,0,1.72),.06,Y);ball('Fuse spark',(.18,0,1.77),(.13,.13,.13),R,6,3)
 bar('Key stem',(-.58,0,.83),(-.87,0,.83),.06,C)
 for y in [-.17,.17]:box('Key paddle',(-.88,y,.83),(.09,.26,.32),Y,.025)
 export('bobomb',700)
 reset();box('Crate',(0,0,.6),(1.2,1.2,1.2),R,.04)
 for y in [-.615,.615]:
  box('White label',(0,y,.65),(1.09,.025,.4),W,0)
  T=[((-.15,.2),(.15,.2)),((0,.2),(0,-.2))];N=[((-.13,-.2),(-.13,.2)),((-.13,.2),(.13,-.2)),((.13,-.2),(.13,.2))]
  for x,g in [(-.35,T),(0,N),(.35,T)]:glyph('TNT',g,(x,y*1.05,.65),.65,D,'Y')
 export('tnt',300)
 reset();ball('Egg',(0,0,.6),(.43,.43,.6),W,10,6);export('egg',200)
 reset();fire=mat('Fire glow',(1,.19,.015),emit=2);core=mat('Gold core',(1,.72,.03),emit=3);ball('Fire core',(0,0,.5),(.43,.43,.43),core,8,4)
 for i in range(6):
  a=i*math.tau/6;bar('Flame',(math.cos(a)*.24,math.sin(a)*.24,.45),(math.cos(a)*.53,math.sin(a)*.53,.75+(i%2)*.15),.11,fire,4)
 cone('Flame tip',(0,0,.91),.23,0,.65,fire,5);export('fireball',200)
 reset();gl=mat('Pad emission',(.025,.35,1),emit=1.5);cone('Pad base',(0,0,.12),1.25,1.18,.24,D,24);cone('Luminous ring',(0,0,.25),1.12,1.12,.035,gl,24);cone('Top',(0,0,.278),.93,.93,.02,B,20)
 for x in [-.4,.15]:
  for y in [-1,1]:bar('Chevron',(x-.18,y*.4,.31),(x+.22,0,.31),.075,W,4)
 export('launch_pad',400)
 reset();box('Concrete',(0,0,1.55),(9,3.6,3.1),P,.2);box('Bright cap',(0,0,3.15),(9,3.6,.3),O,.12)
 for x in [-3,-1,1,3]:
  for y in [-1.81,1.81]:o=box('Hazard slash',(x,y,1.65),(.35,.025,1.45),Y,0);o.rotation_euler.y=-.35
 export('obstacle',600)
 reset();cone('Trunk',(0,0,.65),.27,.23,1.3,mat('Bark',(.3,.13,.055)),8)
 for z,r in [(1.8,1.4),(2.55,1.1),(3.25,.8)]:cone('Pine tier',(0,0,z),r,0,1.7,G,9)
 export('tree',300)

if __name__=='__main__':
 import sys
 if '--items' not in sys.argv:
  for k in range(8):kart(k)
 else:
  with open(ART+'/validation.json') as f:reports=[r for r in json.load(f) if r['name'] in ['kart_'+str(k) for k in range(8)]]
 items()
