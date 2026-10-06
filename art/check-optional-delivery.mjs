// Asset-specific browser checks, using only the shipped UI and in-memory observations.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { launchArtBrowser } from './browser.mjs';
const browser = await launchArtBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3000');
  await page.waitForFunction(() => window.THREE && window.GLTFLoader && window.G);
  const pie = await page.evaluate(async () => {
    const { scene: model, animations } = await new GLTFLoader().loadAsync('/models/pie.glb');
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
    let triangles = 0;
    model.traverse(o => { if (o.isMesh) {
      triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count)/3;
      if (!o.material.isMeshStandardMaterial || o.material.map) throw Error('Pie needs plain Principled materials');
      for (const key of ['position','normal']) if (![...o.geometry.attributes[key].array].every(Number.isFinite)) throw Error('Invalid pie geometry');
    }});
    const root = document.createElement('div'); root.style.cssText='position:fixed;inset:0;z-index:99999';document.body.appendChild(root);
    const r = new THREE.WebGLRenderer({ antialias:true });r.setSize(1440,1000);r.toneMapping=THREE.ACESFilmicToneMapping;root.appendChild(r.domElement);
    const scene = new THREE.Scene();scene.background=new THREE.Color('#284552');
    const pmrem=new THREE.PMREMGenerator(r), env=pmrem.fromScene(new RoomEnvironment(),.06);scene.environment=env.texture;
    scene.add(model,new THREE.HemisphereLight('#fff4df','#405063',2));
    const sun=new THREE.DirectionalLight('#ffffff',3);sun.position.set(-3,6,4);scene.add(sun);
    const cam=new THREE.PerspectiveCamera(34,1.44,.01,100);cam.position.set(2.5,2.2,3);cam.lookAt(0,.4,0);r.render(scene,cam);
    window.removePieCatalog=()=>{root.remove();r.dispose();env.dispose();pmrem.dispose();};
    return { triangles,size:size.toArray(),floor:box.min.y,animations:animations.length,parts:['pie_dish','cream_dome','Cherry'].every(n=>model.getObjectByName(n)) };
  });
  assert.equal(pie.triangles,280);assert(pie.triangles<=300 && pie.parts);assert.equal(pie.animations,0);
  assert(Math.abs(pie.floor)<.0001 && Math.abs(pie.size[0]-1.6)<.0001 && Math.abs(pie.size[2]-1.6)<.0001);
  await page.screenshot({ path:'art/memekarts/pie-catalog.png' });await page.evaluate(()=>removePieCatalog());
  await page.evaluate(() => {
    const Base=THREE.WebGLRenderer;
    window.THREE={...THREE,WebGLRenderer:class extends Base {
      constructor(...args){
        super(...args);
        const render=this.render.bind(this);
        this.render=(s,c)=>{
          if(s.children.some(o=>o.userData.environment||o.userData.parts?.custom))window.deliveryScene=s;
          return render(s,c);
        };
      }
    }};
    window.pieFrames=[];window.limbFrames=[];
    const sample=()=>{
      const scene=window.deliveryScene;
      const ownPie=window.deliveryState?.ents?.find(e=>e.k==='pie'&&e.o===G.me);
      if(scene&&ownPie&&window.capturePie){
        const map=MEMEKARTS_MAPS.find(m=>m.id===deliveryState.mapId);
        const root=scene.children.find(o=>o.getObjectByName('pie_dish')&&Math.hypot(o.position.x-(ownPie.x-map.w/2),o.position.z-(ownPie.y-map.h/2))<80);
        if(root)pieFrames.push({position:root.position.toArray(),rotation:root.rotation.toArray().slice(0,3)});
      }
      if(scene)for(const fig of scene.children.filter(o=>o.userData.parts?.custom)){
        const p=fig.userData.parts;
        if(p.legL&&p.legR&&p.armL)limbFrames.push({id:fig.uuid,l:p.legL.rotation.x,r:p.legR.rotation.x,a:p.armL.rotation.x});
      }
      requestAnimationFrame(sample);
    };requestAnimationFrame(sample);
    G.socket.on('g:state',s=>window.deliveryState=s);
  });
  await page.locator('#gamePick [data-game="memekarts"]').click();await page.locator('#testBtn').click();
  await page.waitForFunction(()=>G.room?.players.length>=4);await page.locator('#startBtn').click();
  await page.waitForFunction(()=>window.deliveryScene&&window.deliveryState?.karts);
  let found=false;const cycle=[];
  for(let i=0;i<19;i++){
    await page.keyboard.press(']');await page.waitForTimeout(160);
    const weapon=await page.evaluate(()=>({weapon:deliveryState.karts.find(k=>k.id===G.me)?.weapon,toast:document.querySelector('#toast').textContent}));
    cycle.push(weapon);
    if(weapon.weapon==='pie'){found=true;break;}
  }
  const blockers=[];
  if(!found){
    blockers.push('public/games/memekarts.extras.js ITEMS still lists 18 items and omits pie, so ] cannot equip Cream pie. Game code left untouched; flight check uses the existing practice-room give command.');
  }
  await page.waitForFunction(()=>!deliveryState.karts.find(k=>k.id===G.me)?.dead);
  // Existing test-room positioning keeps the short throw away from bots and walls.
  await page.evaluate(()=>G.send({type:'tp',x:400,y:90,a:0}));await page.waitForTimeout(200);
  await page.evaluate(()=>G.send({type:'give',weapon:'pie'}));
  await page.waitForFunction(()=>deliveryState.karts.find(k=>k.id===G.me)?.weapon==='pie');
  await page.keyboard.down('Space');await page.waitForTimeout(650);
  await page.screenshot({path:'art/memekarts/pie-aim.png'});
  await page.evaluate(()=>{window.pieFrames=[];window.capturePie=true;});await page.keyboard.up('Space');
  await page.waitForFunction(()=>pieFrames.length>=3,undefined,{timeout:10000});
  await page.screenshot({path:'art/memekarts/pie-in-flight.png'});
  await page.waitForTimeout(500);
  const flight=await page.evaluate(()=>({samples:pieFrames.length,first:pieFrames[0],last:pieFrames.at(-1),moving:pieFrames.some(f=>f.position.some((v,i)=>Math.abs(v-pieFrames[0].position[i])>1)),spinning:pieFrames.some(f=>f.rotation.some((v,i)=>Math.abs(v-pieFrames[0].rotation[i])>.01))}));
  assert(flight.moving,'Custom pie must move: '+JSON.stringify(flight));
  if(!flight.spinning)blockers.push('public/games/memekarts.js updateEnts does not rotate pie entities; the custom GLB moves but has no runtime spin. Static asset export intentionally has no baked animation.');
  await page.evaluate(()=>{G.socket.emit('lobby');window.deliveryScene=null;});
  await page.waitForFunction(()=>G.room.phase==='lobby');
  await page.locator('[data-id="blasters"]').evaluate(e=>e.click());await page.waitForFunction(()=>G.room.gameId==='blasters');
  await page.locator('#mapPicker [data-map="towers"]').click();await page.locator('#modePick [data-mode="teams"]').click();
  await page.locator('#startBtn').click();
  await page.waitForFunction(()=>window.deliveryState?.map==='towers'&&window.deliveryScene?.getObjectByName('collision_116_lowwall'));
  await page.locator('#canvas').click();await page.waitForTimeout(4000);
  const towers=await page.evaluate(()=>{
    const scene=deliveryScene, collisions=[];scene.traverse(o=>{if(/^collision_/.test(o.name))collisions.push(o);});
    const figures=scene.children.filter(o=>o.userData.parts?.custom), paint=[],finishes=[];
    for(const fig of figures){
      const base=fig.userData.color,sk=fig.userData.sk,expected=new THREE.Color(base);
      if(sk===1)expected.lerp(new THREE.Color('#ffffff'),.55);
      const actual=[];
      fig.userData.parts.custom.traverse(o=>{if(o.isMesh&&o.material.name==='Paint'){paint.push(o.material.color.getHexString());actual.push(o.material.color.getHexString());}});
      finishes.push({base,skin:sk,expected:expected.getHexString(),actual:[...new Set(actual)]});
    }
    const ids=[...new Set(limbFrames.map(f=>f.id))];
    const swings=ids.map(id=>{const a=limbFrames.filter(f=>f.id===id);return {id,samples:a.length,leg:Math.max(...a.map(f=>f.l))-Math.min(...a.map(f=>f.l)),arm:Math.max(...a.map(f=>f.a))-Math.min(...a.map(f=>f.a))};});
    return {collisionBoxes:collisions.length,teams:deliveryState.tm,paint:[...new Set(paint)],finishes,figures:figures.length,namedLimbs:figures.filter(f=>['leg_l','leg_r','arm_l'].every(n=>f.getObjectByName(n))).length,swings};
  });
  assert.equal(towers.collisionBoxes,117);assert(towers.teams);assert.equal(towers.namedLimbs,towers.figures);assert(towers.figures>=3);
  assert(towers.finishes.every(f=>['#ff5d5d','#4da6ff'].includes(f.base)&&[0,1,4].includes(f.skin)&&f.actual.length===1&&f.actual[0]===f.expected),'Team Paint/skin colours: '+JSON.stringify(towers));
  assert(towers.swings.some(s=>s.leg>.1&&s.arm>.1),'Leg and arm animation did not change');
  await page.screenshot({path:'art/blasters/towers-in-game.png'});
  assert.deepEqual(errors,[]);
  await writeFile('art/optional-delivery-validation.json',JSON.stringify({pie,flight,towers,itemCycle:cycle,blockers,errors},null,2)+'\n');
  console.log(JSON.stringify({pie,flight,towers,blockers,errors},null,2));
} finally { await browser.close(); }
