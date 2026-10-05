import bpy, os, math, json
from mathutils import Vector
ART=os.path.dirname(os.path.abspath(__file__))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
with open(ART+'/validation.json') as f:reports=json.load(f)
for i,r in enumerate(reports):
 name=r['name'];col=i%6;row=i//6
 with bpy.data.libraries.load(ART+'/'+name+'.blend',link=False) as (src,dst):dst.objects=src.objects
 obs=[o for o in dst.objects if o and o.type=='MESH']
 size=max(r['bounds_max'][j]-r['bounds_min'][j] for j in range(3));s=3.3/size
 for o in obs:
  bpy.context.collection.objects.link(o);o.location*=s;o.scale*=s;o.location+=Vector((col*5,-row*5,0))
 bpy.ops.object.text_add(location=(col*5-1.7,-row*5-1.9,.04));t=bpy.context.object;t.name='Label';t.data.body=name;t.data.size=.3;t.data.extrude=0;t.rotation_euler=(0,0,0)
scene=bpy.context.scene;scene.render.engine='BLENDER_WORKBENCH';scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL';scene.display.shading.show_shadows=True;scene.display.shading.show_cavity=True;scene.display.shading.cavity_type='BOTH';scene.display.shading.background_type='WORLD';scene.world.color=(.065,.08,.12)
bpy.ops.object.camera_add(location=(29,-34,42));cam=bpy.context.object;target=Vector((12.5,-7.5,0));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=35;scene.camera=cam
scene.render.resolution_x=2200;scene.render.resolution_y=1600;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=ART+'/contact-sheet.png';bpy.ops.render.render(write_still=True)
