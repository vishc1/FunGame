// Live UI checks for the new items. Renderer blockers are reported, never patched.
import { launchArtBrowser } from '../browser.mjs';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const specs=JSON.parse(await readFile('art/blasters/validation.json','utf8'));
const browser=await launchArtBrowser();
const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[], fetched=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(r.url().includes('/models/')&&r.status()===200)fetched.push(r.url().split('/').at(-1));});
try {
  await page.goto((process.env.TEST_URL||'http://127.0.0.1:3000')+'/?bltest=1');
  await page.waitForFunction(()=>window.THREE&&window.G);
  await page.evaluate(()=>{
    const add=THREE.Scene.prototype.add;
    THREE.Scene.prototype.add=function(...objects){const r=add.apply(this,objects);if(objects.some(o=>o.getObjectByName('collision_000_wall')))window.itemScene=this;return r;};
    window.balloonFrames=[];window.swordFrames=[];
    function sample(){
      if(window.itemScene){
        const camera=itemScene.children.find(o=>o.isPerspectiveCamera),sword=camera.children[1];
        if(sword?.visible)swordFrames.push({rotation:sword.rotation.toArray().slice(0,3),custom:!!sword.getObjectByName('sword_blade')});
        const knot=itemScene.getObjectByName('balloon_knot');
        if(knot){let root=knot;while(root.parent!==itemScene)root=root.parent;
          const body=new THREE.Box3().setFromObject(root.getObjectByName('Balloon_body')).getCenter(new THREE.Vector3());
          const tail=new THREE.Box3().setFromObject(knot).getCenter(new THREE.Vector3());
          balloonFrames.push({position:root.position.toArray(),body:body.toArray(),knot:tail.toArray()});
        }
      }
      requestAnimationFrame(sample);
    } requestAnimationFrame(sample);
    window.meshTris=o=>{let n=0;o.traverse(m=>{if(m.isMesh)n+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;});return n;};
  });
  await page.locator('#gamePick [data-game="blasters"]').click();
  await page.locator('#testBtn').click();await page.waitForFunction(()=>G.room?.players.length>=4);
  await page.locator('[data-id="blasters"]').evaluate(e=>e.click());
  await page.waitForFunction(()=>G.room.gameId==='blasters');await page.locator('#startBtn').click();
  await page.waitForFunction(()=>window.itemScene?.getObjectByName('head_core')&&window.__blGo);
  await page.evaluate(()=>__blGo(0,3.2,0,0,.35));
  await page.locator('#canvas').click();await page.waitForTimeout(600);
  const weapons=[];
  for(let w=1;w<=7;w++){
    const id=await page.evaluate(w=>BLASTERS.WEAPONS[w].id,w);
    await page.keyboard.press(']');
    await page.waitForFunction(n=>{const c=itemScene.children.find(o=>o.isPerspectiveCamera),g=c.children.find(o=>o.getObjectByName('muzzle_tip'));return g&&meshTris(g)===n;},specs['fps_w_'+id].triangles);
    weapons.push(id);
    if(['burst','lob','zap'].includes(id)){
      await page.waitForTimeout(400);await page.screenshot({path:`art/blasters/in-game-${id}.png`});
    }
    if(id==='lob'){
      await page.evaluate(()=>__blGo(0,3.2,0,0,.35));
      await page.mouse.down();await page.waitForTimeout(70);await page.mouse.up();
      await page.waitForFunction(()=>balloonFrames.length>=5);
    }
  }
  await page.keyboard.press('e');await page.waitForFunction(()=>swordFrames.length>=5);
  const live=await page.evaluate(()=>{
    const camera=itemScene.children.find(o=>o.isPerspectiveCamera);
    const frames=balloonFrames.filter((s,i,a)=>i>0&&new THREE.Vector3(...s.position).distanceTo(new THREE.Vector3(...a[i-1].position))>.005);
    return {sword:{customLoaded:!!camera.getObjectByName('sword_blade'),samples:swordFrames.length,first:swordFrames[0],last:swordFrames.at(-1)},balloon:{samples:balloonFrames.length,movingSamples:frames.length,first:balloonFrames[0],last:balloonFrames.at(-1)}};
  });
  assert(live.balloon.movingSamples>=2,'Custom balloon not moving');
  assert(live.sword.first.rotation.some((n,i)=>Math.abs(n-live.sword.last.rotation[i])>.01),'Sword swing stalled');
  assert(fetched.includes('fps_sword.glb'),'Sword GLB was not fetched');
  assert.deepEqual(errors,[]);
  const blockers=[];
  if(!live.sword.customLoaded)blockers.push('fps_sword.glb loads successfully, but public/games/blasters.js constructs the sword before asynchronous MODELS loading finishes and never retries; E swings the placeholder. Defer sword creation or replace its mesh after assetsReady. Game code left untouched.');
  await writeFile('art/blasters/new-items-runtime.json',JSON.stringify({weapons,...live,fetchedSword:true,errors,blockers},null,2)+'\n');
  console.log(JSON.stringify({weapons,...live,errors,blockers},null,2));
  await page.evaluate(async()=>{
    const root=document.createElement('div');root.style.cssText='position:fixed;inset:0;z-index:99999;background:#20313e';document.body.appendChild(root);
    const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(1440,1000);r.toneMapping=THREE.ACESFilmicToneMapping;root.appendChild(r.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color('#20313e');
    scene.add((await new GLTFLoader().loadAsync('/models/ramp.glb')).scene,new THREE.HemisphereLight('#deefff','#846c4b',1.6));
    const sun=new THREE.DirectionalLight('#fff3df',2.6);sun.position.set(-10,20,14);scene.add(sun);
    const camera=new THREE.OrthographicCamera(-6.5,6.5,4.5,-4.5,.01,100);camera.position.set(-10,9,11);camera.lookAt(0,.6,0);r.render(scene,camera);
  });
  await page.screenshot({path:'art/memekarts/ramp-catalog.png'});
}finally{await browser.close();}
