const assert=require('node:assert/strict');
const maps=require('../public/memekarts-maps');
const game=require('../server/games/memekarts');
function clear([x,y],obstacles,r=17){return obstacles.every(o=>Math.hypot(x-Math.max(o.x,Math.min(x,o.x+o.w)),y-Math.max(o.y,Math.min(y,o.y+o.h)))>=r);}
for(const map of maps){
  for(const p of [...map.spawns,...map.boxes])assert(clear(p,map.obstacles),`${map.id} blocked spawn/pickup`);
  for(const o of map.obstacles)assert(o.x>=20&&o.y>=20&&o.x+o.w<=(map.w||900)-20&&o.y+o.h<=(map.h||600)-20); // arena size is per map now
}
// Concurrent matches must keep separate collision layouts.
const matches=maps.map(map=>{let state;const players=Array.from({length:8},(_,i)=>({id:'p'+i,name:'P'+i,color:'#ffffff'}));const api={memory:{memekartsMap:map.id},players:()=>players,player:id=>players.find(p=>p.id===id),emit:(e,s)=>{if(e==='g:state')state=s;},end(){},to(){}};return {map,match:game.create(api),get state(){return state;}};});
for(let step=0;step<1200;step++)for(const m of matches){for(let i=0;i<8;i++){m.match.onInput('p'+i,{type:'ctl',up:true,left:(step+i*45)%240<60,right:(step+i*45)%240>180});if(step%60===0){m.match._debugGive('p'+i,game.WEAPONS[(step/60+i)%game.WEAPONS.length].id);m.match.onInput('p'+i,{type:'fire'});}}m.match.tick(1/30);assert.equal(m.state.mapId,m.map.id);for(const k of m.state.karts)assert(Number.isFinite(k.x)&&Number.isFinite(k.y));}
console.log('Three concurrent maps, clear spawns and pickups, 40 seconds of driving and all weapons: PASS');
