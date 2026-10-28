// Deterministic handling, slow-frame collision, and height prediction regressions.
const assert = require('node:assert/strict');
const P = require('../public/memekarts-physics');
const MAPS = require('../public/memekarts-maps');
const def = require('../server/games/memekarts');
const options = {maxF:300,maxR:150,accel:420,turn:3.2};
const empty = {w:1800,h:1200,obstacles:[]};
const kart = (extra={}) => ({x:900,y:600,a:0,vx:0,vy:0,el:0,ctl:{up:true,right:true},...extra});
const baseline = kart();
for(let i=0;i<240;i++)P.stepGrounded(baseline,1/120,options,empty,()=>0);
for(const fps of [10,15,30,60,120]) {
  const k=kart();for(let i=0;i<fps*2;i++)P.stepGrounded(k,1/fps,options,empty,()=>0);
  assert(Math.hypot(k.x-baseline.x,k.y-baseline.y)<1e-6,`${fps} fps changed turning path`);
  assert(Math.abs(k.a-baseline.a)<1e-7,`${fps} fps changed heading`);
}
for(const dt of [1/120,1/30,.1,.25])for(const reverse of [false,true]) {
  const k=kart({x:reverse?150:70,y:100,a:reverse?Math.PI:0,vx:reverse?-729:729,ctl:{up:true}});
  const map={w:900,h:600,obstacles:[{x:100,y:50,w:10,h:100}]};
  for(let t=0;t<.5;t+=dt) {
    P.stepGrounded(k,dt,{...options,maxF:729,accel:756},map,()=>0);
    assert(reverse?k.x>=126-1e-6:k.x<=84+1e-6,'Boosted kart tunneled through a thin block');
  }
}
for(const right of [true,false]) {
  const k=kart({vx:-100,ctl:{down:true,right,left:!right}});
  P.stepCar(k,.1,options);assert(right?k.a<0:k.a>0,'Reverse steering is inverted');
}
{
  const k=kart({x:70,y:100,vx:520,ctl:{}}),map={w:900,h:600,obstacles:[{x:100,y:50,w:10,h:100}]};
  assert(P.moveGrounded(k,.1,map,()=>0));assert(k.x<=84&&k.vx<0,'Autopilot tunnels through thin block');
}
// Both ends run the same slope/collision integration, including consecutive tower ramps.
for(const map of MAPS)for(const rp of map.ramps) {
  const d={N:[0,-1],S:[0,1],E:[1,0],W:[-1,0]}[rp.dir];
  const distance=(d[0]?rp.w:rp.h)/2+18;
  const x=rp.x+rp.w/2-d[0]*distance,y=rp.y+rp.h/2-d[1]*distance;
  const surface=(x,y)=>MAPS.surface(map,x,y);
  const a=kart({x,y,a:Math.atan2(d[1],d[0]),el:surface(x,y),vx:d[0]*220,vy:d[1]*220,ctl:{up:true}}),b=structuredClone(a);
  for(let i=0;i<90;i++) {
    P.stepGrounded(a,1/30,options,map,surface);
    for(let n=0;n<4;n++)P.stepGrounded(b,1/120,options,map,surface);
    assert(Math.hypot(a.x-b.x,a.y-b.y)<1e-6&&Math.abs(a.el-b.el)<1e-6,`${map.id} ramp prediction diverges`);
  }
}
// Exercise the actual server tick, not only the shared helper.
{
  const players=['a','b'].map(id=>({id,name:id,color:'#fff'}));
  const game=def.create({memory:{memekartsMap:'stadium'},room:{bots:new Map()},players:()=>players,player:id=>players.find(p=>p.id===id),emit(){},to(){},after(){},every(){},clear(){},end(){}});
  const world=game.__state(),k=world.karts.get('a'),map=MAPS[0],block=map.obstacles[0];
  Object.assign(world.karts.get('b'),{x:60,y:60});
  Object.assign(k,{x:block.x-45,y:block.y+block.h/2,a:0,vx:729,vy:0,el:0,mush:10,star:10,ctl:{up:true}});
  for(let i=0;i<8;i++){game.tick(.1);assert(k.x<=block.x-16+1e-6,'Server allowed boosted wall crossing');}
}
console.log('Kart driving: identical paths at 10/15/30/60/120 fps, reverse steering, slow-frame walls, every ramp and server collisions: PASS');
