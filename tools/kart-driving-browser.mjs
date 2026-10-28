// Live control, collision and ramp checks. Uses the actual game, not a mock renderer.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {launchArtBrowser} from '../art/browser.mjs';
const browser=await launchArtBrowser();
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try {
  await page.goto((process.env.TEST_URL||'http://127.0.0.1:3110')+'/?bltest=1');
  await page.locator('#testBtn').click();
  await page.waitForFunction(()=>G.room?.players.length>=4);
  await page.locator('#botClear').click();await page.waitForFunction(()=>G.room.players.length===1);
  await page.locator('#botAdd').click();await page.waitForFunction(()=>G.room.players.length===2);
  await page.evaluate(()=>{
    G.socket.on('g:state',s=>{window.driveState=s;});
    window.driveFrames=[];
    function record(){
      if(window.driveCapture){
        const pred=window.__kartPred?.(),view=window.__kartView?.();
        if(pred&&view)driveFrames.push({t:performance.now(),pred,view,server:driveState?.karts.find(k=>k.id===G.me)});
      }
      requestAnimationFrame(record);
    }requestAnimationFrame(record);
  });
  await page.locator('#startBtn').click();
  await page.waitForFunction(()=>window.__kartView?.()&&window.driveState?.karts);
  const tp=async(x,y,a)=>{
    await page.keyboard.up('w');await page.keyboard.up('s');await page.keyboard.up('a');await page.keyboard.up('d');
    await page.waitForFunction(()=>!driveState.karts.find(k=>k.id===G.me)?.dead);
    await page.evaluate(p=>G.send({type:'tp',...p}),{x,y,a});
    await page.waitForFunction(({x,y})=>{const p=window.__kartPred?.();return p&&Math.hypot(p.x-x,p.y-y)<2;},{x,y});
    await page.waitForTimeout(200);
    await page.evaluate(()=>{driveFrames=[];window.driveCapture=true;});
  };
  await tp(500,100,0);await page.keyboard.down('w');await page.waitForTimeout(750);
  const before=await page.evaluate(()=>({t:performance.now(),a:__kartView().a}));
  await page.keyboard.down('d');await page.waitForTimeout(500);await page.keyboard.up('d');
  const released=await page.evaluate(()=>({t:performance.now(),a:__kartView().a}));
  await page.waitForTimeout(250);await page.keyboard.up('w');
  const turn=await page.evaluate(({before,released})=>{
    const first=driveFrames.find(f=>f.t>=before.t&&f.view.a-before.a>.01);
    const end=driveFrames.at(-1);
    return {responseMs:first?first.t-before.t:null,angle:released.a-before.a,releaseDrift:end.view.a-released.a};
  },{before,released});
  await writeFile('tools/shots/driving-turn-frames.json',JSON.stringify(await page.evaluate(()=>driveFrames),null,2)+'\n');
  assert(turn.responseMs!==null&&turn.responseMs<120,JSON.stringify(turn));
  assert(turn.angle>.8&&turn.angle<2.1,JSON.stringify(turn));
  assert(Math.abs(turn.releaseDrift)<.25,'Steering keeps turning after release: '+JSON.stringify(turn));
  await tp(500,100,0);await page.keyboard.down('s');await page.waitForTimeout(700);
  await page.keyboard.down('d');await page.waitForTimeout(400);await page.keyboard.up('d');await page.keyboard.up('s');
  const reverse=await page.evaluate(()=>__kartView().a);assert(reverse<-.5,'Reverse steering did not follow wheels');
  const obstacle=await page.evaluate(()=>MEMEKARTS_MAPS[0].obstacles[0]);
  await tp(obstacle.x-85,obstacle.y+obstacle.h/2,0);
  for(const weapon of ['mush','star']){await page.evaluate(weapon=>G.send({type:'give',weapon}),weapon);await page.waitForTimeout(100);await page.keyboard.press('Space');await page.waitForTimeout(100);}
  await page.keyboard.down('w');
  for(let i=0;i<10;i++){
    await page.waitForTimeout(100);
    if(i===3)await page.evaluate(()=>{const end=performance.now()+110;while(performance.now()<end){};});
  }
  await page.keyboard.up('w');
  const collision=await page.evaluate(()=>({samples:driveFrames.length,maxPredX:Math.max(...driveFrames.map(f=>f.pred.x)),maxViewX:Math.max(...driveFrames.map(f=>f.view.x)),maxServerX:Math.max(...driveFrames.map(f=>f.server.x))}));
  for(const field of ['maxPredX','maxViewX','maxServerX'])assert(collision[field]<=obstacle.x-16+.2,field+': '+JSON.stringify(collision));
  await page.screenshot({path:'tools/shots/driving-block.png'});
  // Let power-ups expire so this drive follows the normal ramp approach.
  await page.waitForTimeout(6000);
  const ramp=await page.evaluate(()=>MEMEKARTS_MAPS[0].ramps[0]);
  const d={N:[0,-1],S:[0,1],E:[1,0],W:[-1,0]}[ramp.dir];
  const approach=(d[0]?ramp.w:ramp.h)/2+60;
  await tp(ramp.x+ramp.w/2-d[0]*approach,ramp.y+ramp.h/2-d[1]*approach,Math.atan2(d[1],d[0]));
  await page.keyboard.down('w');await page.waitForTimeout(1750);await page.keyboard.up('w');
  const climbing=await page.evaluate(()=>{
    const map=MEMEKARTS_MAPS[0];
    return {samples:driveFrames.length,top:Math.max(...driveFrames.map(f=>f.pred.el)),maxViewSeparation:Math.max(...driveFrames.map(f=>Math.hypot(f.pred.x-f.view.x,f.pred.y-f.view.y))),worstGroundGap:Math.min(...driveFrames.map(f=>f.view.el-MEMEKARTS_MAPS.surface(map,f.view.x,f.view.y)))};
  });
  assert(climbing.top>=48,'Predicted kart failed to climb: '+JSON.stringify(climbing));
  assert(climbing.maxViewSeparation<.001,'Own kart has extra visual input lag');
  assert(climbing.worstGroundGap>-.1,'Kart sinks into ramp: '+JSON.stringify(climbing));
  await page.screenshot({path:'tools/shots/driving-ramp.png'});
  assert.deepEqual([...new Set(errors)],[]);
  const result={turn,reverse,collision,climbing,errors};
  await writeFile('tools/shots/driving-validation.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
} finally {await browser.close();}
