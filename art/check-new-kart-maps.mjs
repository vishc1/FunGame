import assert from 'node:assert/strict';
import {launchArtBrowser} from './browser.mjs';
const browser=await launchArtBrowser(),base=process.env.TEST_URL||'http://127.0.0.1:3000';
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
  await page.goto(base+'/?bloom=0');await page.waitForFunction(()=>window.THREE&&window.G);
  assert.equal(await page.locator('#homeMaps .map-card').count(),5);
  assert.match(await page.locator('#heroMeta').innerText(),/5 arenas/);
  await page.evaluate(()=>{
    const Original=THREE.WebGLRenderer;
    window.THREE={...THREE,WebGLRenderer:class extends Original{constructor(...a){super(...a);const render=this.render.bind(this);this.render=(s,c)=>{if(s.getObjectByName('arena_floor')){window.mapScene=s;return render(s,window.mapCamera||c);}return render(s,c);};}}};
    G.socket.on('g:state',s=>{window.kartState=s;});G.socket.on('g:event',e=>{if(e.type==='pit')window.pitEvent=e;});
  });
  await page.locator('#name').fill('Map check');await page.locator('#testBtn').click();await page.waitForFunction(()=>G.room?.players.length>=4);
  await page.locator('#botClear').click();await page.waitForFunction(()=>G.room.players.length===1);await page.locator('#botAdd').click();await page.waitForFunction(()=>G.room.players.length===2);
  for(const id of ['pitfall','skyway']){
    await page.locator(`#mapPicker [data-map="${id}"]`).click();await page.waitForFunction(id=>G.room.mapId===id,id);
    await page.locator('#startBtn').click();await page.waitForFunction(id=>window.kartState?.mapId===id&&!!window.mapScene,id);await page.waitForTimeout(2000);
    const geometry=await page.evaluate(id=>{
      const scene=mapScene,m=MEMEKARTS_MAPS.find(m=>m.id===id);scene.updateMatrixWorld(true);
      if(id==='pitfall'){
        const ray=new THREE.Raycaster(new THREE.Vector3(0,140,-150),new THREE.Vector3(0,-1,0));
        if(ray.intersectObjects([scene.getObjectByName('arena_floor'),scene.getObjectByName('arena_ground')]).length)throw Error('Pit is covered by a floor');
        const bottom=ray.intersectObject(scene.getObjectByName('pit_well'),true)[0];if(!bottom||Math.abs(bottom.point.y+180)>.01)throw Error('Missing pit floor / depth');
        ray.ray.origin.z=0;const top=ray.intersectObjects(scene.children.filter(o=>o.name==='deck'),true)[0];if(!top||Math.abs(top.point.y-48)>.01)throw Error('Bridge height mismatch');
      }
      const camera=new THREE.PerspectiveCamera(52,1.44,1,6000);camera.position.set(1100,1400,1450);camera.lookAt(0,0,0);window.mapCamera=camera;
      return {decks:scene.children.filter(o=>o.name==='deck').length,ramps:scene.children.filter(o=>o.getObjectByName('ramp_core')).length,expectedDecks:m.decks.length,expectedRamps:m.ramps.length};
    },id);
    assert.equal(geometry.decks,geometry.expectedDecks);assert.equal(geometry.ramps,geometry.expectedRamps);
    await page.waitForTimeout(200);await page.screenshot({path:`art/memekarts/${id}-overview.png`});await page.evaluate(()=>window.mapCamera=null);
    if(id==='pitfall'){
      await page.evaluate(()=>G.send({type:'tp',x:780,y:340,a:Math.PI/2}));await page.waitForTimeout(300);
      const before=await page.evaluate(()=>kartState.karts.find(k=>k.id===G.me).kills);
      await page.keyboard.down('w');await page.waitForFunction(()=>kartState.karts.find(k=>k.id===G.me)?.pit===1);await page.keyboard.up('w');
      await page.screenshot({path:'art/memekarts/pitfall-falling.png'});
      await page.waitForFunction(()=>window.pitEvent?.id===G.me&&kartState.karts.find(k=>k.id===G.me).dead);
      assert.equal(await page.evaluate(()=>kartState.karts.find(k=>k.id===G.me).kills),before-1);
      await page.screenshot({path:'art/memekarts/pitfall-penalty.png'});
      await page.waitForFunction(()=>{const k=kartState.karts.find(k=>k.id===G.me);return !k.dead&&!k.pit&&k.hp===3;});
      assert.equal(await page.evaluate(()=>{const k=kartState.karts.find(k=>k.id===G.me);return MEMEKARTS_MAPS.isPit(MEMEKARTS_MAPS.find(m=>m.id==='pitfall'),k.x,k.y);}),false);
      assert.equal(await page.evaluate(()=>kartState.karts.find(k=>k.id===G.me).kills),before-1);
    }
    console.log(id,geometry,'PASS');await page.evaluate(()=>{window.mapScene=null;G.socket.emit('lobby');});await page.waitForFunction(()=>G.room.phase==='lobby');
  }
  assert.deepEqual(errors,[]);console.log('Five map cards, open pit geometry, safe bridge, real fall/penalty/respawn, both live maps and zero browser errors: PASS');
}finally{await browser.close();}
