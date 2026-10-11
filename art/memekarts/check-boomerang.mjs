import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { launchArtBrowser } from '../browser.mjs';
const spec=JSON.parse(await readFile('art/memekarts/boomerang-validation.json','utf8')).boomerang;
const browser=await launchArtBrowser();
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try {
  await page.goto((process.env.TEST_URL||'http://127.0.0.1:3000')+'/?bltest=1');
  await page.waitForFunction(()=>window.THREE&&window.GLTFLoader&&window.G);
  const asset=await page.evaluate(async()=>{
    const ensure=(ok,msg)=>{if(!ok)throw Error(msg);};
    const files=await(await fetch('/models/list')).json();ensure(files.includes('boomerang.glb'),'Model discovery');
    const gltf=await new GLTFLoader().loadAsync('/models/boomerang.glb'),model=gltf.scene;
    model.updateMatrixWorld(true);
    const bb=new THREE.Box3().setFromObject(model),size=bb.getSize(new THREE.Vector3());
    let triangles=0;const materials=new Set();
    model.traverse(o=>{
      ensure(!o.isLight&&!o.isCamera&&!o.isSkinnedMesh,'Unexpected non-static object');
      if(!o.isMesh)return;
      triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
      ensure(o.material.isMeshStandardMaterial&&!o.material.map,'Plain Principled material required');
      for(const attr of ['position','normal'])ensure([...o.geometry.attributes[attr].array].every(Number.isFinite),'Invalid geometry');
      materials.add(o.material.name);
    });
    const ray=(x,z)=>new THREE.Raycaster(new THREE.Vector3(x,2,z),new THREE.Vector3(0,-1,0)).intersectObject(model,true).length;
    ensure(ray(.3,0)>0&&ray(-.35,0)===0,'Wide V silhouette / open notch');
    ensure(ray(-.38,-.97)>0&&ray(-.38,.97)>0,'Both wing tips');
    const scene=new THREE.Scene();scene.background=new THREE.Color('#243945');scene.add(model,new THREE.HemisphereLight('#fff7e9','#57727c',2.3));
    const sun=new THREE.DirectionalLight('#fff3dd',3);sun.position.set(2,5,4);scene.add(sun);
    const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(1440,1000);r.toneMapping=THREE.ACESFilmicToneMapping;
    r.domElement.style.cssText='position:fixed;inset:0;z-index:10000';document.body.appendChild(r.domElement);
    const camera=new THREE.PerspectiveCamera(35,1.44,.01,100);camera.position.set(2.8,3.4,2.4);camera.lookAt(0,.08,0);r.render(scene,camera);
    window.closeCatalog=()=>{r.domElement.remove();r.dispose();};
    return {triangles,size:size.toArray(),min:bb.min.toArray(),max:bb.max.toArray(),materials:[...materials],animations:gltf.animations.length};
  });
  assert.equal(asset.triangles,spec.triangles);assert(asset.triangles<=300);assert.equal(asset.animations,0);
  assert(Math.abs(asset.size[2]-2.2)<1e-5&&Math.abs(asset.size[1]-.18)<1e-5&&Math.abs(asset.min[1])<1e-5);
  assert(Math.abs(asset.min[0]+asset.max[0])<1e-5&&Math.abs(asset.min[2]+asset.max[2])<1e-5);
  assert(asset.materials.includes('Boomerang dark edge'));
  await page.screenshot({path:'art/memekarts/boomerang-catalog.png'});await page.evaluate(()=>closeCatalog());
  await page.evaluate(()=>{
    const add=THREE.Scene.prototype.add;
    THREE.Scene.prototype.add=function(...objects){const r=add.apply(this,objects);if(objects.some(o=>o.getObjectByName('boomerang_core')))window.boomScene=this;return r;};
    G.socket.on('g:state',s=>window.boomState=s);
    window.boomFrames=[];
    function sample(){
      if(window.captureBoom&&window.boomScene){
        const entity=window.boomState?.ents?.find(e=>e.k==='boomer'&&e.o===G.me);
        const model=boomScene.children.find(o=>o.visible&&o.userData.glb&&o.getObjectByName('boomerang_core'));
        if(entity&&model){
          const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
          boomFrames.push({position:model.position.toArray(),rotation:model.rotation.toArray().slice(0,3),height:size.y,entity:[entity.x,entity.y],id:entity.id});
        }
      }
      requestAnimationFrame(sample);
    }requestAnimationFrame(sample);
  });
  await page.locator('#gamePick [data-game="memekarts"]').click();await page.locator('#testBtn').click();
  await page.waitForFunction(()=>G.room?.players.length>=4);await page.locator('#startBtn').click();
  await page.waitForFunction(()=>window.boomScene&&window.boomState?.karts);
  const cycle=[];let shortcut=false;
  // Current gameplay has 21 items. Test a complete cycle without hard-coding 18.
  for(let i=0;i<21;i++){
    await page.keyboard.press(']');await page.waitForTimeout(130);
    const weapon=await page.evaluate(()=>boomState.karts.find(k=>k.id===G.me)?.weapon);cycle.push(weapon);
    if(weapon==='boomer'){shortcut=true;break;}
  }
  const blockers=[];
  if(!shortcut)blockers.push('public/games/memekarts.extras.js ITEMS omits boomer; ] cannot select Boomerang. Flight check used the existing practice-room give command.');
  await page.waitForFunction(()=>!boomState.karts.find(k=>k.id===G.me)?.dead);
  await page.evaluate(()=>G.send({type:'tp',x:400,y:90,a:0}));await page.waitForTimeout(250);
  await page.evaluate(()=>G.send({type:'give',weapon:'boomer'}));
  await page.waitForFunction(()=>boomState.karts.find(k=>k.id===G.me)?.weapon==='boomer');
  await page.screenshot({path:'art/memekarts/boomerang-equipped.png'});
  await page.evaluate(()=>{window.captureBoom=true;window.boomFrames=[];});
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>boomFrames.length>=5);
  await page.screenshot({path:'art/memekarts/boomerang-in-flight.png'});
  await page.waitForFunction(()=>!boomState.ents.some(e=>e.k==='boomer'&&e.o===G.me),undefined,{timeout:8000});
  const flight=await page.evaluate(()=>{
    const a=boomFrames,first=a[0];
    return {samples:a.length,first,last:a.at(-1),moving:a.some(f=>f.position.some((v,i)=>Math.abs(v-first.position[i])>5)),spinning:a.some(f=>f.rotation.some((v,i)=>Math.abs(v-first.rotation[i])>.05)),maxHeight:Math.max(...a.map(f=>f.height)),removed:!boomState.ents.some(e=>e.k==='boomer'&&e.o===G.me)};
  });
  assert(flight.moving&&flight.removed&&flight.samples>=5);assert(Math.abs(flight.maxHeight-1.8)<.001,'GLB must stay flat while flying');
  if(!flight.spinning)blockers.push('public/games/memekarts.js ENT.boomer returns asset() without userData.spin; updateEnts spins only the fallback wrapper and excludes boomer from its generic GLB rotation branch. Custom model moves flat but does not rotate.');
  assert.deepEqual([...new Set(errors)],[]);
  await writeFile('art/memekarts/boomerang-browser-validation.json',JSON.stringify({asset,flight,itemCycle:cycle,blockers,errors},null,2)+'\n');
  console.log(JSON.stringify({asset,flight,blockers,errors},null,2));
} finally {await browser.close();}
