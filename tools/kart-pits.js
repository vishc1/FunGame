// Server-only regression checks for pit scoring, jump clearance, bridges and respawns.
const assert=require('node:assert/strict');
const maps=require('../public/memekarts-maps'),def=require('../server/games/memekarts');
function world(mapId='pitfall') {
  const players=['a','b'].map(id=>({id,name:id,color:'#fff'})),events=[],timers=[];let state,ended;
  const game=def.create({memory:{memekartsMap:mapId,__fast:120},room:{bots:new Map()},players:()=>players,player:id=>players.find(p=>p.id===id),emit:(ev,s)=>{if(ev==='g:state')state=s;else if(ev==='g:event')events.push(s);},to(){},after:(ms,fn)=>timers.push(fn),every(){},clear(){},end:pts=>ended=pts});
  const k=game.__state().karts.get('a'),other=game.__state().karts.get('b');
  Object.assign(other,{x:90,y:90,inv:0});
  return {game,k,other,events,tick(n=1){for(let i=0;i<n;i++)game.tick(1/30);},state:()=>state,finish(){game.tick(120);timers.forEach(f=>f());return ended;}};
}
const map=maps.find(m=>m.id==='pitfall');
assert(maps.isPit(map,900,450));assert.equal(maps.surface(map,900,600),48);assert(!maps.isPit(map,900,600));
for(const kills of [0,3,-2])for(const power of ['none','star','ghost','bill','inv']){
  const w=world();Object.assign(w.k,{x:900,y:450,el:0,kills,inv:0,weapon:'green',streak:4});if(power!=='none')w.k[power]=5;
  w.tick(25);assert(w.k.dead>0,power+' must not bypass pit');assert.equal(w.k.kills,kills-1);assert.equal(w.k.deaths,1);assert.equal(w.other.kills,0);
  assert.equal(w.events.filter(e=>e.type==='pit').length,1);assert.equal(w.events.filter(e=>e.type==='kill').length,0);
  assert.equal(w.k.weapon,null);assert.equal(w.k.streak,0);w.tick(25);assert.equal(w.k.kills,kills-1,'one penalty per fall');
  w.tick(70);assert.equal(w.k.dead,0);assert.equal(w.k.pitFall,false);assert.equal(w.k.hp,2);assert(w.k.inv>0);assert(!maps.isPit(map,w.k.x,w.k.y));
}
{
  const w=world();Object.assign(w.k,{x:900,y:360,el:0,a:Math.PI/2,inv:0});w.game.onInput('a',{type:'ctl',up:true});w.tick(50);
  assert(w.k.dead>0);assert.equal(w.k.kills,-1,'driving off the lip costs one kill');
}
{
  const w=world();Object.assign(w.k,{x:900,y:450,el:0,air:1.2,avx:0,avy:0});w.tick(20);assert.equal(w.k.kills,0);assert(!w.k.pitFall,'airborne karts must not fall early');w.tick(40);assert.equal(w.k.kills,-1,'landing in the pit counts');
}
{
  // Launch from the lip: arrive at the bridge while the arc is still above 48.
  // The old y=300 / speed=250 setup hit its side during descent, below the deck.
  const w=world();Object.assign(w.k,{x:900,y:360,el:0,air:1.2,avx:0,avy:220});w.tick(38);assert.equal(w.k.kills,0);assert.equal(w.k.el,48,'jump clears pit onto bridge');assert(!w.k.pitFall);
}
{
  const w=world();Object.assign(w.k,{x:540,y:600,el:48,a:0});w.game.onInput('a',{type:'ctl',up:true});w.tick(95);assert.equal(w.k.kills,0);assert(!w.k.pitFall,'bridge is safe');
}
{
  const w=world();Object.assign(w.k,{x:900,y:600,el:48,a:-Math.PI/2});w.game.onInput('a',{type:'ctl',up:true});w.tick(60);assert.equal(w.k.kills,-1,'driving off bridge falls into pit');
}
{
  const w=world();Object.assign(w.k,{x:900,y:450,el:0,weapon:'green'});w.tick();w.game.onInput('a',{type:'fire'});assert.equal(w.game.__state().ents.length,0,'falling kart cannot fire');
  w.k.kills=-10;assert(Object.values(w.finish()).every(p=>p>=0),'overall party points remain nonnegative');
}
for(const m of maps)for(const [x,y] of m.spawns)assert.equal(maps.surface(m,x,y),0,m.id+' safe spawn');
console.log('Pit penalty, negative kills, powers, one-shot scoring, safe respawn, jumping, bridges and match points: PASS');
