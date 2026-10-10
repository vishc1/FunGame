import { readFile,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

export async function validateHeightAssets(page){
 const specs={...JSON.parse(await readFile('art/memekarts/height-validation.json','utf8')),...JSON.parse(await readFile('art/memekarts/tower-validation.json','utf8'))};
 const result=await page.evaluate(async specs=>{
  const root=document.createElement('div');root.style.cssText='position:fixed;inset:0;z-index:99999;background:#19293b;color:white;font:700 18px system-ui';document.body.appendChild(root);
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1440,1200);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.setScissorTest(true);root.appendChild(renderer.domElement);
  const result=[],loaded=[],assert=(ok,message)=>{if(!ok)throw Error(message);};
  for(const [name,spec] of Object.entries(specs)){
   const gltf=await new GLTFLoader().loadAsync('/models/'+name+'.glb'),model=gltf.scene;
   model.updateMatrixWorld(true);
   const bb=new THREE.Box3().setFromObject(model),size=bb.getSize(new THREE.Vector3()),[w,d,authoredH]=spec.nominal_size;
   assert(size.distanceTo(new THREE.Vector3(w,authoredH,d))<.001,name+' dimensions');
   assert(Math.abs(bb.min.y)<.0001&&Math.abs(bb.min.x+bb.max.x)<.0001&&Math.abs(bb.min.z+bb.max.z)<.0001,name+' origin');
   let tris=0;
   model.traverse(o=>{assert(!o.isLight&&!o.isCamera&&!o.isSkinnedMesh,name+' forbidden object');if(!o.isMesh)return;
    assert(!Array.isArray(o.material)&&o.material.isMeshStandardMaterial,name+' material');
    assert(!o.material.map,name+' must be texture-free');
    for(const a of ['position','normal'])assert([...o.geometry.attributes[a].array].every(Number.isFinite),name+' nonfinite '+a);
    tris+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
   });
   assert(tris===spec.triangles&&tris<=spec.budget,name+' triangle budget');assert(!gltf.animations.length,name+' animations');
   const h=name.startsWith('tower')?10:name.startsWith('deck')?4.8:5.2;
   model.scale.y=h/authoredH;model.updateMatrixWorld(true);
   for(let i=0;i<11;i++)for(let j=0;j<11;j++){
    const x=(-.499+i*.0998)*w,z=(-.499+j*.0998)*d;
    const hits=new THREE.Raycaster(new THREE.Vector3(x,h+1,z),new THREE.Vector3(0,-1,0)).intersectObject(model,true);
    const expected=name.startsWith('ramp')?(x/w+.5)*h:h;
    assert(hits.length&&Math.abs(hits[0].point.y-expected)<.0001,name+' top gap or nonflat paint at '+x+','+z);
   }
   if(!name.startsWith('ramp'))for(const y of [.01,h/2,h-.01,...(name.startsWith('tower')?[4.8]:[])])for(const u of [-.499,0,.499]){
    for(const [origin,dir,expected] of [[new THREE.Vector3(w,y,u*d),new THREE.Vector3(-1,0,0),w/2],[new THREE.Vector3(-w,y,u*d),new THREE.Vector3(1,0,0),w/2],[new THREE.Vector3(u*w,y,d),new THREE.Vector3(0,0,-1),d/2],[new THREE.Vector3(u*w,y,-d),new THREE.Vector3(0,0,1),d/2]]){
     const hit=new THREE.Raycaster(origin,dir).intersectObject(model,true)[0];assert(hit&&Math.abs(hit.distance-expected)<.0001,name+' side gap');
    }
   }
   result.push({name,triangles:tris,authoredSize:size.toArray(),testedSize:[w,h,d],surfaceSamples:121});loaded.push(model);
  }
  for(let i=0;i<loaded.length;i++){
   const model=loaded[i],bb=new THREE.Box3().setFromObject(model),size=bb.getSize(new THREE.Vector3()),c=bb.getCenter(new THREE.Vector3());
   const scene=new THREE.Scene();scene.background=new THREE.Color(i%2?'#24394b':'#20313e');scene.add(model,new THREE.HemisphereLight('#deefff','#74614c',1.4));
   const sun=new THREE.DirectionalLight('#fff0d7',3);sun.position.set(-20,35,18);scene.add(sun);
   const r=Math.max(size.x,size.z,size.y*1.7)*.9,cam=new THREE.OrthographicCamera(-r,r,r*400/480,-r*400/480,.01,500);
   cam.position.copy(c).add(new THREE.Vector3(-1,.9,1.15).multiplyScalar(r*3));cam.lookAt(c);
   const x=i%3*480,y=800-Math.floor(i/3)*400;renderer.setViewport(x,y,480,400);renderer.setScissor(x,y,480,400);renderer.render(scene,cam);
   const label=document.createElement('div');label.textContent=result[i].name+' · '+result[i].triangles+' tris · '+result[i].testedSize[1]+' m';label.style.cssText=`position:absolute;left:${x+20}px;top:${1200-y-380}px`;root.appendChild(label);
  }
  window.heightCatalog={root,renderer};return result;
 },specs);
 assert.equal(result.length,9);
 const viewport=page.viewportSize();await page.setViewportSize({width:1440,height:1200});
 await page.screenshot({path:'art/memekarts/height-catalog.png'});
 await page.evaluate(()=>{heightCatalog.renderer.dispose();heightCatalog.root.remove();delete window.heightCatalog;});
 await page.setViewportSize(viewport);
 await writeFile('art/memekarts/height-browser-validation.json',JSON.stringify(result,null,2)+'\n');
 console.log('Nine height assets at 4.8/5.2/10 m, budgets, exact bounds, solid sides and 121 top samples per asset: PASS');
}
