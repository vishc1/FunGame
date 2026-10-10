import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchArtBrowser } from './browser.mjs';
const tag=process.argv[2]||'after';assert(['before','after'].includes(tag));
await mkdir('art/graphics/model-polish',{recursive:true});
const browser=await launchArtBrowser();
try {
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.TEST_URL||'http://127.0.0.1:3094');
 await page.waitForFunction(()=>window.THREE&&window.GLTFLoader&&window.RoomEnvironment);
 for(const category of ['kart','fps_char']){
  const result=await page.evaluate(async({category})=>{
   window.polishRoot?.remove();window.polishRenderer?.dispose();
   const root=document.createElement('div');window.polishRoot=root;root.style.cssText='position:fixed;inset:0;z-index:99999;background:#152638;color:white;font:600 18px system-ui';document.body.appendChild(root);
   const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});window.polishRenderer=r;r.setSize(1600,1000);r.toneMapping=THREE.ACESFilmicToneMapping;r.setScissorTest(true);root.appendChild(r.domElement);
   const pmrem=new THREE.PMREMGenerator(r),room=new RoomEnvironment(),env=pmrem.fromScene(room,.06),result=[];
   const colors=['#f55e50','#52a8ff','#38c9a0','#ffba38','#9566ef','#8ac142','#f078b5','#46c9db'];
   for(let i=0;i<8;i++){
    const {scene:model}=await new GLTFLoader().loadAsync('/models/'+category+'_'+i+'.glb');let tris=0;
    model.traverse(o=>{if(o.isMesh){tris+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;if(o.material.name==='Paint'){o.material=o.material.clone();o.material.color.set(colors[i]);}}});
    const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),c=bounds.getCenter(new THREE.Vector3());
    const scene=new THREE.Scene();scene.background=new THREE.Color(i%2?'#21354b':'#1a3040');scene.environment=env.texture;scene.environmentIntensity=.45;scene.add(model,new THREE.HemisphereLight('#e1efff','#685445',1.3));
    const sun=new THREE.DirectionalLight('#fff1d5',2.5);sun.position.set(-4,8,6);scene.add(sun);
    const rad=Math.max(size.y*.65,size.x*.82,size.z*.82),cam=new THREE.OrthographicCamera(-rad*.8,rad*.8,rad,-rad,.01,200);
    cam.position.copy(c).add(new THREE.Vector3(category==='kart'?1.35:.7,.68,1.5).multiplyScalar(rad*4));cam.lookAt(c);
    const x=i%4*400,y=500-Math.floor(i/4)*500;r.setViewport(x,y,400,500);r.setScissor(x,y,400,500);r.render(scene,cam);
    const label=document.createElement('div');label.textContent=category+'_'+i+' · '+tris+' tris';label.style.cssText=`position:absolute;left:${x+18}px;top:${500-y+18}px`;root.appendChild(label);
    result.push({name:category+'_'+i,triangles:tris,size:size.toArray()});
   }
   env.dispose();pmrem.dispose();room.dispose();return result;
  },{category});
  await page.screenshot({path:`art/graphics/model-polish/${category}-${tag}.png`});
  await writeFile(`art/graphics/model-polish/${category}-${tag}.json`,JSON.stringify(result,null,2)+'\n');
 }
 assert.deepEqual(errors,[]);console.log('Model comparison sheets captured: '+tag);
}finally{await browser.close();}
