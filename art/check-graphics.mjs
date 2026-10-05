import { launchArtBrowser } from './browser.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const tag=process.argv[2]||'after';
assert(['before','after'].includes(tag));
await mkdir('art/graphics',{recursive:true});
const browser=await launchArtBrowser(),errors=[],results=[];
try{
 for(const game of ['blasters','memekarts']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto((process.env.TEST_URL||'http://127.0.0.1:3000')+'/?bltest=1');
  await page.waitForFunction(()=>window.THREE&&window.G);
  await page.evaluate(()=>{
   const Base=THREE.WebGLRenderer;
   window.THREE={...THREE,WebGLRenderer:class extends Base{
    constructor(...args){super(...args);window.reviewRenderer=this;const render=this.render.bind(this);this.render=(s,c)=>{
     if(s.getObjectByName('collision_000_wall')||s.children.some(o=>o.userData.body)){window.reviewScene=s;window.reviewCamera=c;}
     return render(s,c);
    };}
   }};
  });
  await page.locator(`#gamePick [data-game="${game}"]`).click();await page.locator('#testBtn').click();
  await page.waitForFunction(()=>G.room?.players.length>=4);await page.locator('#startBtn').click();
  await page.waitForFunction(()=>window.reviewScene);
  await page.locator('#canvas').click();await page.waitForTimeout(700);
  if(game==='blasters')await page.evaluate(()=>__blGo(-9,0,14,.05,-.025));
  await page.waitForTimeout(500);await page.screenshot({path:`art/graphics/${game}-${tag}.png`});
  if(game==='blasters'){
   await page.keyboard.press('l');await page.locator('[data-fig="1"]').click();await page.waitForTimeout(200);
   await page.screenshot({path:`art/graphics/figure-${tag}.png`});await page.keyboard.press('l');
  }
  const result=await page.evaluate(async()=>{
   const times=[];let previous=performance.now();for(let i=0;i<90;i++)await new Promise(resolve=>requestAnimationFrame(t=>{times.push(t-previous);previous=t;resolve();}));times.sort((a,b)=>a-b);
   const lights=reviewScene.children.filter(o=>o.isLight).map(o=>({type:o.type,intensity:o.intensity}));
   const contacts=[];reviewScene.traverse(o=>{if(o.userData.contact){const c=o.userData.contact;contacts.push({finite:c.matrixWorld.elements.every(Number.isFinite),depthWrite:c.material.depthWrite,castShadow:c.castShadow});}});
   return {lights,contacts,medianFrameMs:times[45],p95FrameMs:times[85],lastPassCalls:reviewRenderer.info.render.calls,lastPassTriangles:reviewRenderer.info.render.triangles,geometries:reviewRenderer.info.memory.geometries,textures:reviewRenderer.info.memory.textures};
  });
  if(tag==='after'){assert(result.contacts.length>0,`${game}: contact shadows exist`);for(const c of result.contacts){assert(c.finite);assert.equal(c.depthWrite,false);assert.equal(c.castShadow,false);}}
  results.push({game,...result});await page.close();
 }
 assert.deepEqual(errors,[]);await writeFile(`art/graphics/${tag}.json`,JSON.stringify({results,errors},null,2)+'\n');console.log(JSON.stringify({results,errors}));
}finally{await browser.close();}
