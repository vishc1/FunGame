// Read-only live integration and viewpoints, using the window-less art browser.
import { launchArtBrowser } from '../browser.mjs';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const browser = await launchArtBrowser();
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const errors = [];
page.on('pageerror', e=>errors.push(e.message));
page.on('console', m=>{if(m.type()==='error')errors.push(m.text());});
try {
  await page.goto((process.env.TEST_URL||'http://127.0.0.1:3000')+'/?bltest=1');
  await page.waitForFunction(()=>window.THREE&&window.G);
  await page.evaluate(()=>{
    const add=THREE.Scene.prototype.add;
    THREE.Scene.prototype.add=function(...objects){
      const value=add.apply(this,objects);
      if(objects.some(o=>o.getObjectByName('collision_095_lowwall')))window.coveScene=this;
      return value;
    };
  });
  await page.locator('#testBtn').click();
  await page.waitForFunction(()=>G.room?.players.length>=4);
  await page.locator('[data-id="blasters"]').evaluate(e=>e.click());
  await page.waitForFunction(()=>G.room.gameId==='blasters');
  await page.locator('#mapPicker [data-map="cove"]').click();
  await page.waitForTimeout(300);
  await page.locator('#startBtn').click();
  await page.waitForFunction(()=>window.coveScene?.getObjectByName('collision_095_lowwall'));
  const integration=await page.evaluate(()=>{
    let boxes=0,coveMaterial=false;
    coveScene.traverse(o=>{if(o.name.startsWith('collision_'))boxes++;if(o.isMesh&&o.material?.name==='Cove navy ink')coveMaterial=true;});
    return {boxes,coveMaterial};
  });
  assert.equal(integration.boxes,96);assert(integration.coveMaterial,'Live match did not load Cove art');
  await page.locator('#canvas').click();
  await page.evaluate(()=>window.__blGo(17,0,5,Math.PI/2,0));
  await page.waitForTimeout(350);
  await page.screenshot({path:'art/blasters/cove-first-person.png'});
  // An independent renderer shows the exact scene loaded by the real game.
  for(const [name,eye,target] of [
    ['overview',[43,39,49],[0,2,0]],
    ['ship',[17,10,13],[0,5,0]],
    ['lighthouse',[13,11,-13],[24,4,-24]],
    ['sandcastle',[-14,7,14],[-24,2,24]],
  ]) {
    await page.evaluate(({eye,target})=>{
      window.covePreview?.remove();
      const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(1440,1000);r.toneMapping=THREE.ACESFilmicToneMapping;
      r.domElement.style.cssText='position:fixed;inset:0;z-index:10000';document.body.appendChild(r.domElement);window.covePreview=r.domElement;
      const cam=new THREE.PerspectiveCamera(58,1.44,.1,500);cam.position.set(...eye);cam.lookAt(...target);r.render(coveScene,cam);r.dispose();
    },{eye,target});
    await page.screenshot({path:`art/blasters/cove-${name}.png`});
  }
  assert.deepEqual([...new Set(errors)],[]);
  await writeFile('art/blasters/cove-browser-validation.json',JSON.stringify({integration,errors},null,2)+'\n');
  console.log('Pirate Cove live GLB: 96 collision meshes, themed materials, four viewpoints, zero errors: PASS');
} finally {await browser.close();}
