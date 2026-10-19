// SPDX-License-Identifier: Apache-2.0
async page=>await page.evaluate(async()=>{
 const {createTracer}=await import('/render/tracer.js'),{defaults}=await import('/scene/terrain.js');
 const {transportDefaults,bsdf,bsdfPDF,displayColor,dielectric,interfaceF,normalize}=await import('/lighting/model.js');
 const state={...defaults,transport:transportDefaults()},tracer=await createTracer(state,{width:640,height:360,samples:8});
 try {
  const rays=[];for(let i=0;i<256;i++)rays.push({origin:[...normalize([Math.sin(i*1.7),.05+Math.abs(Math.cos(i*.7)),Math.cos(i*1.3)]),[.1,.3,.65,1][i%4]],direction:normalize([Math.cos(i*.51),.05+Math.abs(Math.sin(i*.7)),Math.sin(i*.51)])});
  const gpu=await tracer.probe(rays,'transport');let worst=0;
  for(let i=0;i<rays.length;i++) {const r=rays[i],l=r.origin.slice(0,3),v=r.direction,roughness=r.origin[3],expected=[...bsdf([0,1,0],v,l,[1,1,1],roughness),bsdfPDF([0,1,0],v,l,roughness),...displayColor(l.map(Math.abs),state.transport.exposure),dielectric(v[1])];
   for(let k=0;k<8;k++){const error=Math.abs(expected[k]-gpu[i*8+k])/Math.max(1,Math.abs(expected[k]));worst=Math.max(worst,error);if(error>.002)throw Error(JSON.stringify({i,k,expected:expected[k],actual:gpu[i*8+k],error}));}
  }
  const samples=[];for(const r of [.1,.3,.65,1])for(const mu of [1,.5,.05])for(let i=0;i<256;i++)samples.push({origin:[i%2?1.333:1/1.333,0,0,r],direction:[Math.sqrt(1-mu*mu),mu,0]});
  const sampled=await tracer.probe(samples,'sampling'),{sampleBSDF}=await import('/lighting/model.js');let sampleWorst=0;const furnace=[];
  for(let i=0;i<samples.length;i++) {
   let seed=i+1;const random=()=>{seed=Math.imul(seed^(seed>>>16),2246822519)>>>0;seed=Math.imul(seed^(seed>>>13),3266489917)>>>0;seed=(seed^(seed>>>16))>>>0;return (seed>>>8)/16777216;};
   const r=samples[i],reference=sampleBSDF([0,1,0],r.direction,r.origin[3],random(),random(),random()),l=Array.from(sampled.slice(i*8,i*8+3)),pdf=sampled[i*8+3];
   const expected=[...reference.direction,reference.pdf,...bsdf([0,1,0],r.direction,reference.direction,[1,1,1],r.origin[3]),interfaceF(r.direction[1],r.origin[0])];
   for(let k=0;k<8;k++){const error=Math.abs(expected[k]-sampled[i*8+k])/Math.max(1,Math.abs(expected[k]));sampleWorst=Math.max(sampleWorst,error);if(error>.005)throw Error(JSON.stringify({i,k,error,expected:expected[k],actual:sampled[i*8+k]}));}
   const group=Math.floor(i/256);furnace[group]=(furnace[group]||0)+(pdf>0?sampled[i*8+4]*Math.max(0,l[1])/pdf/256:0);
  }
  if(furnace.some(e=>e<.3||e>1.05))throw Error('GPU furnace energy: '+JSON.stringify(furnace));
  const {createHeightfield,intersectHeightfield}=await import('/render/heightfield.js');const field=createHeightfield(state);delete field.hierarchy;field.low=-100;field.high=100;
  for(let i=0;i<field.vertices.length;i+=12){const x=field.vertices[i],u=Math.max(0,Math.min(1,(x-20)/6));field.vertices[i+1]=-100+200*u*u*(3-2*u);}
  const shadowRays=[{origin:[-30,-99.9,0],direction:normalize([1,3,0])},{origin:[-30,-99.9,0],direction:normalize([-1,3,0])}],expected=intersectHeightfield(field,shadowRays[0].origin,shadowRays[0].direction)?.t;
  if(!(expected>150))throw Error('Tall shadow fixture did not exceed the old cutoff');
  const shadowTracer=await createTracer(state,{width:640,height:360,samples:8},field);let tallShadow;
  try{const result=await shadowTracer.probe(shadowRays,'shadows');if(Math.abs(result[0]-expected)>.002||result[1]!==0||result[5]!==1)throw Error('Tall terrain shadow leak: '+JSON.stringify(Array.from(result)));tallShadow={distance:result[0],occluded:true,openSky:true};}finally{shadowTracer.dispose();}
  return {tallShadow,rays:rays.length,scalars:rays.length*8,worst,sampleRays:samples.length,sampleWorst,furnace};
 }finally{tracer.dispose();}
})
