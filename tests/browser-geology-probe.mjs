// SPDX-License-Identifier: Apache-2.0
// Actual shader/CPU parity for reusable material evaluation.
async page=>{
 return await page.evaluate(async()=>{
  const {createTracer}=await import('/render/tracer.js'),{geologyDefaults,evaluateGeology,roughDiffuse}=await import('/material/geology.js'),{materialDefaults}=await import('/scene/materials.js'),{defaults,normalize}=await import('/scene/terrain.js');
  const reports=[];
  for(const [index,preset] of ['rules','rock','sand','snow','ground'].entries()) {
   const state={...defaults,seed:index%2?4294967295:9837,palette:index%2?'otherworld':'natural',materials:{...materialDefaults(),preset,detail:.8,geology:geologyDefaults()}};
   const tracer=await createTracer(state,{width:640,height:360,samples:8});
   try {
    const rays=[];for(let i=0;i<80;i++)rays.push({origin:[Math.sin(i*1.31)*32,Math.cos(i*.73)*12,Math.cos(i*.91)*32,[.0001,.01,.05,.3,4][i%5]],direction:normalize([Math.cos(i*.51),.2+Math.abs(Math.sin(i*.7)),Math.sin(i*.51)])});
    const gpu=await tracer.probe(rays,'materials');let worst=0;
    for(let i=0;i<rays.length;i++) {
     const r=rays[i],v=evaluateGeology(state.materials,r.origin.slice(0,3),r.direction,r.origin[3],state.seed,state.palette),expected=[...v.color,v.roughness,...v.normal,roughDiffuse(v.normal,normalize([.2,1,.3]),normalize([-.6,1,.4]),v.roughness)];
     for(let k=0;k<8;k++){const error=Math.abs(expected[k]-gpu[i*8+k]);worst=Math.max(worst,error);if(error>.003)throw Error(JSON.stringify({preset,i,k,error,expected:expected[k],actual:gpu[i*8+k]}));}
    }
    reports.push({preset,rays:rays.length,worst});
   }finally{tracer.dispose();}
  }
  return reports;
 });
}
