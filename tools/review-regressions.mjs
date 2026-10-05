import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1100,height:760}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',d=>d.accept());
await page.addInitScript(()=>{
  window.reviewEngineTargets=[];
  const original=AudioContext.prototype.createGain;
  AudioContext.prototype.createGain=function(){const gain=original.call(this),set=gain.gain.setTargetAtTime;gain.gain.setTargetAtTime=function(value,...args){window.reviewEngineTargets.push(value);return set.call(this,value,...args);};return gain;};
});
try{
  await page.goto('http://127.0.0.1:3000/?bloom=1');
  await page.waitForFunction(()=>window.THREE_PP);
  await page.evaluate(()=>{
    window.reviewBloom={made:0,disposed:0};
    const Original=THREE_PP.UnrealBloomPass;
    THREE_PP.UnrealBloomPass=class extends Original{constructor(...args){super(...args);window.reviewBloom.made++;}dispose(){window.reviewBloom.disposed++;super.dispose();}};
  });
  await page.locator('#soloBtn').click();await page.waitForFunction(()=>G.room?.phase==='playing');
  await page.keyboard.press('w');await page.waitForTimeout(2500);
  await page.waitForFunction(()=>window.reviewEngineTargets.some(n=>n>0));
  await page.locator('#quitBtn').click();await page.waitForFunction(()=>G.room===null);await page.waitForTimeout(500);
  const before=await page.evaluate(()=>localStorage.getItem('mk_mute'));
  await page.keyboard.press('m');
  const result=await page.evaluate(()=>({bloom:reviewBloom,engineLastTarget:reviewEngineTargets.at(-1),mute:localStorage.getItem('mk_mute')}));
  console.log(JSON.stringify(result));
  assert.deepEqual(errors,[]);
  assert(result.bloom.made>0&&result.bloom.disposed===result.bloom.made,'Bloom passes not disposed on exit');
  assert.equal(result.engineLastTarget,0,'Engine keeps running after leaving the room');
  assert.equal(result.mute,before,'Kart hotkeys stay active on the home page');
  console.log('Bloom and audio cleanup on Leave: PASS');
}finally{await browser.close();}
