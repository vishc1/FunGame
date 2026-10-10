import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { launchArtBrowser } from './browser.mjs';

export async function validateRampSolids(page, baselineDir=process.env.RAMP_BASELINE_DIR) {
  const names=['ramp','ramp_neon','ramp_canyon'];
  const baseline=baselineDir?await Promise.all(names.map(async n=>Array.from(await readFile(`${baselineDir}/${n}.glb`)))):null;
  const results=await page.evaluate(async ({names,baseline})=>{
    const T=THREE, assert=(ok,msg)=>{if(!ok)throw Error(msg);}, models=[];
    const key=v=>v.toArray().map(n=>Math.round(n*1e5)).join(',');
    function inspect(model,name,strict){
      model.updateMatrixWorld(true);
      const bb=new T.Box3().setFromObject(model), size=bb.getSize(new T.Vector3());
      assert(size.distanceTo(new T.Vector3(10,3.2,8.4))<.00001,name+' bounds');
      assert(Math.abs(bb.min.y)<.00001&&Math.abs(bb.min.x+bb.max.x)<.00001&&Math.abs(bb.min.z+bb.max.z)<.00001,name+' origin');
      assert(model.getObjectByName('ramp_core'),name+' missing ramp_core');
      const edges=new Map(), vertices=new Set(), materials={}, sample=[], interior=new T.Vector3(0,3.2/3,0);
      let triangles=0, volume=0, inward=0;
      model.traverse(o=>{
        if(!o.isMesh)return;
        const m=o.material;
        assert(m.isMeshStandardMaterial&&!m.map,name+' material');
        materials[m.name]={color:m.color.toArray(),roughness:m.roughness,metalness:m.metalness,emissive:m.emissive.toArray(),emissiveIntensity:m.emissiveIntensity,opacity:m.opacity};
        if(strict)assert(m.side===T.FrontSide,name+' export still double-sided');
        // Even baseline sampling must not hide an inward face with DoubleSide.
        m.side=T.FrontSide;
        const pos=o.geometry.attributes.position, normal=o.geometry.attributes.normal;
        const index=o.geometry.index, count=index?.count??pos.count;
        for(let i=0;i<count;i+=3){
          const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);
          const p=ids.map(j=>new T.Vector3().fromBufferAttribute(pos,j).applyMatrix4(o.matrixWorld));
          const n=new T.Vector3().subVectors(p[1],p[0]).cross(new T.Vector3().subVectors(p[2],p[0]));
          assert(n.length()>1e-7,name+' degenerate triangle');
          const c=p[0].clone().add(p[1]).add(p[2]).multiplyScalar(1/3);
          if(n.dot(c.sub(interior))<=0)inward++;
          if(strict)for(const id of ids)assert(new T.Vector3().fromBufferAttribute(normal,id).transformDirection(o.matrixWorld).dot(n.clone().normalize())>.999,name+' vertex normal');
          volume+=p[0].dot(new T.Vector3().crossVectors(p[1],p[2]))/6;
          triangles++;
          const keys=p.map(key);keys.forEach(k=>vertices.add(k));
          for(let j=0;j<3;j++){
            const a=keys[j],b=keys[(j+1)%3],k=[a,b].sort().join('|');
            const e=edges.get(k)||{count:0,winding:0};e.count++;e.winding+=a<b?1:-1;edges.set(k,e);
          }
        }
      });
      const badEdges=[...edges.values()].filter(e=>e.count!==2||e.winding!==0).length;
      if(strict){assert(triangles<=500,name+' budget');assert(badEdges===0,name+' nonmanifold seams: '+badEdges);assert(inward===0,name+' inward faces');assert(vertices.size-edges.size+triangles===2,name+' shell topology');assert(Math.abs(volume-134.4)<.001,name+' volume');}
      // Exterior rays cover the top, underside, high-end and both triangular sides.
      for(let i=0;i<9;i++)for(let j=0;j<9;j++){
        const u=(i+.371)/9,v=(j+.619)/9,x=-5+10*u,z=-4.2+8.4*v;
        const probes=[[[x,5,z],[0,-1,0],[x,3.2*u,z]],[[x,-1,z],[0,1,0],[x,0,z]],
          [[6,3.2*u,z],[-1,0,0],[5,3.2*u,z]],[[x,3.2*u*v,5],[0,0,-1],[x,3.2*u*v,4.2]],[[x,3.2*u*v,-5],[0,0,1],[x,3.2*u*v,-4.2]]];
        for(const [o,d,p] of probes){const hit=new T.Raycaster(new T.Vector3(...o),new T.Vector3(...d)).intersectObject(model,true)[0];assert(hit&&hit.point.distanceTo(new T.Vector3(...p))<.00001,name+' exterior gap');sample.push(hit.object.material.name);}
      }
      return {name,triangles,badEdges,inward,volume,vertices:vertices.size,edges:edges.size,materials,surfaceSamples:sample};
    }
    const results=[];
    for(let i=0;i<names.length;i++){
      const name=names[i], gltf=await new GLTFLoader().loadAsync('/models/'+name+'.glb');
      assert(!gltf.animations.length,name+' animation');
      const r=inspect(gltf.scene,name,true);
      if(baseline){
        const old=await new GLTFLoader().parseAsync(new Uint8Array(baseline[i]).buffer,'');
        const b=inspect(old.scene,name+' before',false);
        assert(JSON.stringify(r.materials)===JSON.stringify(b.materials),name+' material finish changed');
        assert(JSON.stringify(r.surfaceSamples)===JSON.stringify(b.surfaceSamples),name+' surface artwork changed');
        r.before={triangles:b.triangles,badEdges:b.badEdges,inward:b.inward};r.appearanceMatchesBaseline=true;
      }
      r.exteriorSamples=r.surfaceSamples.length;delete r.surfaceSamples;results.push(r);models.push(gltf.scene);
    }
    const root=document.createElement('div');root.style.cssText='position:fixed;inset:0;z-index:99999;background:#20313e;color:white;font:700 18px system-ui';document.body.appendChild(root);
    const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1440,900);renderer.setScissorTest(true);renderer.toneMapping=T.ACESFilmicToneMapping;root.appendChild(renderer.domElement);
    for(let row=0;row<2;row++)for(let i=0;i<3;i++){
      const scene=new T.Scene();scene.background=new T.Color('#20313e');scene.add(models[i],new T.AmbientLight('white',1.6));
      const light=new T.DirectionalLight('#fff4e2',2.5);light.position.set(8,row? -12:12,10);scene.add(light);
      const camera=new T.OrthographicCamera(-8,8,7.5,-7.5,.1,100);camera.position.set(16,row?-13:13,18);camera.lookAt(0,1.5,0);
      const x=i*480,y=(1-row)*450;renderer.setViewport(x,y,480,450);renderer.setScissor(x,y,480,450);renderer.render(scene,camera);
      const label=document.createElement('div');label.textContent=names[i]+' · '+results[i].triangles+' tris · '+(row?'underside / back':'top / back');label.style.cssText=`position:absolute;left:${x+18}px;top:${row*450+18}px`;root.appendChild(label);
    }
    window.rampSolidPreview={root,renderer,models};return results;
  },{names,baseline});
  const viewport=page.viewportSize();await page.setViewportSize({width:1440,height:900});
  await page.screenshot({path:'art/memekarts/ramp-solid-catalog.png'});
  await page.evaluate(()=>{const {root,renderer,models}=rampSolidPreview;models.forEach(m=>m.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}}));renderer.dispose();root.remove();delete window.rampSolidPreview;});
  await page.setViewportSize(viewport);
  await writeFile('art/memekarts/ramp-solid-validation.json',JSON.stringify(results,null,2)+'\n');
  console.log('Three closed wedges: welded edge topology, outward normals, front-face-only exterior rays and 500-triangle budgets PASS'+(baselineDir?'; original artwork/materials match':''));
  return results;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const browser=await launchArtBrowser();
  try{const page=await browser.newPage();await page.goto(process.env.TEST_URL||'http://127.0.0.1:3000');await page.waitForFunction(()=>window.THREE&&window.GLTFLoader);await validateRampSolids(page);}
  finally{await browser.close();}
}
