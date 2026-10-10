import { launchArtBrowser } from './browser.mjs';
import assert from 'node:assert/strict';
const base = process.env.TEST_URL || 'http://127.0.0.1:3000';
const browser = await launchArtBrowser();
const page = await browser.newPage({ viewport:{width:1440,height:1000} });
const errors=[];
page.on('pageerror', e=>errors.push(e.message));
page.on('console', m=>{if(m.type()==='error')errors.push(m.text());});
try {
  await page.goto(base);await page.waitForFunction(()=>window.THREE && window.G);
  await page.waitForTimeout(1600);await page.screenshot({path:'art/home-desktop.png',fullPage:true});
  assert.equal(await page.locator('#homeMaps .map-card').count(),await page.evaluate(()=>MEMEKARTS_MAPS.length));
  await page.locator('#name').fill('Kart tester');await page.locator('#createBtn').click();
  await page.waitForFunction(()=>G.room?.gameId==='memekarts');
  await page.locator('#botAdd').click();
  await page.evaluate(()=>{G.socket.on('g:state',s=>window.testState=s);});
  const roomCode=await page.locator('#roomCode').innerText();
  const guest=await browser.newPage();await guest.goto(base);await guest.locator('#name').fill('Guest');await guest.locator('#code').fill(roomCode);await guest.locator('#joinBtn').click();await guest.waitForFunction(()=>G.room?.players.length===3);
  await guest.evaluate(()=>G.socket.emit('pickMap',{mapId:'canyon'}));await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>G.room.mapId),'stadium');
  for(const map of ['stadium','neon','canyon','pitfall','skyway']) {
    await page.locator(`#mapPicker [data-map="${map}"]`).click();
    await guest.waitForFunction(id=>G.room.mapId===id,map);
    await page.locator('#startBtn').click();
    await page.waitForFunction(id=>window.testState?.mapId===id,map);await page.waitForTimeout(3500);
    const bounds=await page.locator('#canvas').boundingBox();assert.equal(bounds.width,1440);assert.equal(bounds.height,1000);assert.equal(bounds.x,0);assert.equal(bounds.y,0);
    await page.keyboard.down('w');await page.waitForTimeout(600);await page.keyboard.up('w');await page.screenshot({path:`art/map-${map}.png`});
    if(map==='neon') {
      await page.locator('#fullscreenBtn').click();await page.waitForFunction(()=>!!document.fullscreenElement);
      await page.locator('#fullscreenBtn').click();await page.waitForFunction(()=>!document.fullscreenElement);
      await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);const b=await page.locator('#canvas').boundingBox();assert.equal(b.width,390);assert.equal(b.height,844);await page.screenshot({path:'art/game-mobile.png'});await page.setViewportSize({width:1440,height:1000});
    }
    await page.evaluate(()=>G.socket.emit('lobby'));await page.waitForFunction(()=>G.room.phase==='lobby');
    console.log(`${map}: selection synced, map loaded, fullscreen canvas OK`);
  }
  await page.locator('#arcade summary').click();await page.locator('[data-id="sumo"]').click();await page.locator('#startBtn').click();await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>document.body.classList.contains('racing')),false);assert.equal(await page.locator('#canvas').getAttribute('width'),'900');
  await guest.close();await page.evaluate(()=>G.socket.emit('lobby'));await page.waitForFunction(()=>G.room.phase==='lobby');await page.locator('#leaveBtn').click();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'art/home-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#soloBtn').click();await page.waitForFunction(()=>G.room?.phase==='playing'&&G.room.players.length===8);await page.waitForTimeout(1500);
  const phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  phone.on('pageerror',e=>errors.push(e.message));
  await phone.goto(base);await phone.locator('#soloBtn').click();await phone.waitForFunction(()=>G.room?.phase==='playing');await phone.waitForTimeout(2500);
  assert.equal(await phone.locator('.touch-drive').isVisible(),true);
  await phone.evaluate(()=>{const emit=G.socket.emit;G.socket.emit=function(event,data,...rest){if(event==='input'&&data.type==='ctl')window.lastTouchControl=data;return emit.call(this,event,data,...rest);};});
  const accelerate=await phone.locator('[data-drive="w"]').boundingBox();await phone.mouse.move(accelerate.x+20,accelerate.y+20);await phone.mouse.down();await phone.waitForFunction(()=>window.lastTouchControl?.up===true);await phone.mouse.up();await phone.waitForFunction(()=>window.lastTouchControl?.up===false);
  await phone.screenshot({path:'art/game-touch.png'});await phone.close();
  await page.evaluate(()=>G.socket.emit('lobby'));await page.waitForFunction(()=>G.room.phase==='lobby');
  const animationResults=await page.evaluate(async()=>{
    // Drive the real renderer at controlled frame rates and feed quantized network jumps.
    const source=await(await fetch('/games/memekarts.js')).text();let factory;
    const register=window.registerGame;window.registerGame=(_id,f)=>factory=f;try{(0,eval)(source);}finally{window.registerGame=register;}
    document.querySelector('#lobby').classList.add('hidden');document.querySelector('#game').classList.remove('hidden');document.querySelector('#game').classList.add('kart-fullscreen');
    const originalAdd=THREE.Scene.prototype.add, scenes=[];
    THREE.Scene.prototype.add=function(...objects){if(!scenes.includes(this))scenes.push(this);return originalAdd.apply(this,objects);};
    const results=[];
    try{for(const fps of [30,60,120]){
      const keys=new Set(),g={...G,me:'animation',keys,send(){},player(){return {id:'animation',name:'Animation test',color:'#ff5d5d'};}};
      const game=factory(g);
      const state=t=>({mapId:'stadium',t:100,boxes:[1,1,1,1,1,1],ents:[],karts:[{id:'animation',v:0,x:100+t*100,y:65,a:Math.max(0,Math.min(1,t-.5))*.35,hp:3,kills:0,air:t>=.3&&t<1.5?Math.round((1.5-t)*10)/10:0,dead:0,inv:0,small:0,egg:0,star:0,ghost:0,bill:0,mush:0,spin:0,ink:0}]});
      game.state(state(0));game.render(0);
      let scene,kart;
      for(let tries=0;tries<150;tries++){await new Promise(r=>setTimeout(r,20));game.render(0);scene=scenes.findLast(s=>s.children.some(c=>c.userData.glbWheels));kart=scene?.children.find(c=>c.userData.glbWheels);if(kart)break;}
      if(!kart)throw Error('Animation test model failed to load');
      let maxStep=0,maxHeight=0,maxSteer=0,lastY=0,maxShadowGroundError=0;
      for(let frame=1;frame<=fps*2;frame++){
        const t=frame/fps;keys.clear();if(t>.5&&t<1.5)keys.add('d');game.state(state(t));game.render(1/fps);
        maxStep=Math.max(maxStep,Math.abs(kart.position.y-lastY));lastY=kart.position.y;maxHeight=Math.max(maxHeight,lastY);maxSteer=Math.max(maxSteer,Math.abs(kart.userData.glbWheels[0].rotation.y));
        const contact=kart.userData.contact;if(!contact||contact.material.depthWrite||contact.castShadow)throw Error('Invalid contact shadow');
        maxShadowGroundError=Math.max(maxShadowGroundError,Math.abs(contact.getWorldPosition(new THREE.Vector3()).y-.14));
      }
      results.push({fps,x:kart.position.x,height:kart.position.y,maxStep,maxHeight,maxSteer,maxShadowGroundError,spin:kart.userData.glbWheels[0].rotation.z,settledSteer:kart.userData.glbWheels[0].rotation.y});
      game.destroy();scenes.splice(0);
    }}finally{THREE.Scene.prototype.add=originalAdd;}
    return results;
  });
  for(const r of animationResults){assert(r.maxHeight>70&&r.maxHeight<=75.01);assert(r.maxStep<12);assert.equal(r.height,0);assert(r.maxSteer>.3);assert(Math.abs(r.settledSteer)<.01);assert(Math.abs(r.spin)>20);assert(r.maxShadowGroundError<.001);}
  assert(Math.max(...animationResults.map(r=>r.x))-Math.min(...animationResults.map(r=>r.x))<2);
  console.log('Animation checks at 30 / 60 / 120 fps:',JSON.stringify(animationResults));
  assert.deepEqual([...new Set(errors)],[]);
  console.log('Guest permissions, native fullscreen, mobile sizing, touch driving, arcade cleanup, solo entry, and browser errors: PASS');
} finally { await browser.close(); }
