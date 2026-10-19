// SPDX-License-Identifier: Apache-2.0
async page=>{page.on('dialog',d=>d.accept());await page.reload();await page.waitForFunction(()=>!document.getElementById('render-start').disabled);await page.locator('#live-preview').uncheck();return await page.evaluate(async()=>{
 const {createTracer}=await import('/render/tracer.js'),{defaultScene,renderState}=await import('/scene/document.js'),{waterNormal,waterTransmittance}=await import('/water/model.js'),{interfaceF}=await import('/lighting/model.js');
 const state=renderState(defaultScene()),rays=[];for(let i=0;i<256;i++)rays.push({origin:[Math.sin(i)*12,0,Math.cos(i*1.7)*12,i/32],direction:[(i%8)*.04,(i+.5)/256,0]});
 const tracer=await createTracer(state,{width:320,height:180,samples:8,preview:true});let worst=0;
 try{const actual=await tracer.probe(rays,'water');for(let i=0;i<rays.length;i++){const {origin:a,direction:b}=rays[i],expected=[...waterTransmittance(a[3],state.waterOptics),interfaceF(b[1],1/1.333),...waterNormal(a[0],a[2],state.waterOptics,b[0]),interfaceF(b[1],1.333)];for(let k=0;k<8;k++){worst=Math.max(worst,Math.abs(actual[i*8+k]-expected[k]));if(Math.abs(actual[i*8+k]-expected[k])>.0001)throw Error(JSON.stringify({i,k,actual:actual[i*8+k],expected:expected[k]}));}}}finally{tracer.dispose();}
 const {createHeightfield}=await import('/render/heightfield.js');const field=createHeightfield(state);delete field.hierarchy;field.low=-2;field.high=-2;
 for(let i=0;i<field.vertices.length;i+=12){field.vertices[i+1]=-2;field.vertices.set([0,1,0],i+4);field.vertices.set([.3,.35,.2],i+8);}
 const views=[{origin:[0,2,0],direction:[0,-1,0]},{origin:[0,2,0],direction:[.99,-.15,0]},{origin:[0,-1,0],direction:[0,1,0]},{origin:[0,-1,0],direction:[1,.1,0]},{origin:[0,-1,0],direction:[0,-1,0]}];
 const cases=[];for(const level of [-3,.25,5])for(const dark of [false,true]) {
  const s=structuredClone(state);s.waterLevel=level;if(dark){s.transport.sun=0;s.transport.sky=0;}
  const t=await createTracer(s,{width:320,height:180,samples:8,preview:true},field);
  try{const output=await t.probe(views,'water-rays');for(let i=0;i<views.length;i++)for(let k=0;k<3;k++){const v=output[i*4+k];if(!Number.isFinite(v)||v<0||v>1e4||(dark&&v!==0))throw Error(JSON.stringify({level,dark,i,k,v}));}cases.push({level,dark,radiance:Array.from(output).filter((_,i)=>i%4!==3)});}finally{t.dispose();}
 }
 return {rays:rays.length,scalars:rays.length*8,worst,cases};
})
}
