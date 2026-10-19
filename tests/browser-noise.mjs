// SPDX-License-Identifier: Apache-2.0
async page=>{page.on('dialog',d=>d.accept());await page.reload();await page.waitForFunction(()=>!document.getElementById('render-start').disabled);await page.locator('#live-preview').uncheck();return await page.evaluate(async()=>{
 const {createTracer}=await import('/render/tracer.js'),{defaultScene,renderState}=await import('/scene/document.js'),{TerrainCache}=await import('/scene/generation.js');
 const state=renderState(defaultScene()),field=await new TerrainCache().final(state,512),tracer=await createTracer(state,{width:640,height:360,samples:256},field),images=new Map();
 try {await tracer.run(new AbortController().signal,image=>{if([8,64,256].includes(image.samples))images.set(image.samples,image.rgba);});}finally{tracer.dispose();}
 const reference=images.get(256),errors=[];for(const samples of [8,64]){const image=images.get(samples);let sum=0,count=0;for(let y=80;y<330;y++)for(let x=80;x<560;x++){const i=(y*640+x)*4;for(let k=0;k<3;k++){sum+=(image[i+k]-reference[i+k])**2;count++;}}errors.push({samples,rmse:Math.sqrt(sum/count)});}
 if(errors[1].rmse>=errors[0].rmse*.65)throw Error(JSON.stringify(errors));return {width:640,height:360,detail:512,referenceSamples:256,errors,method:'Unfiltered progressive prefixes compared with their 256-sample result; display-code RMSE over x80–559/y80–329.'};
})
}
