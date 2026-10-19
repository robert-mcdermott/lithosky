// SPDX-License-Identifier: Apache-2.0
async page=>{
 page.on('dialog',d=>d.accept());await page.reload();await page.waitForFunction(()=>!document.querySelector('#render-start').disabled);await page.locator('#live-preview').uncheck();
 return page.evaluate(async()=>{
  const {defaultScene,legacyScene,renderState}=await import('/scene/document.js'),{cameraRay,cameraFrame,lensUniforms}=await import('/camera/model.js'),{createTracer}=await import('/render/tracer.js');
  const reports=[];
  for(const modern of [false,true]) {
   const scene=modern?defaultScene():legacyScene();if(modern)Object.assign(scene.camera.lens,{dof:true,fNumber:1.4,metresPerUnit:.1,focusDistance:2,roll:31,targetX:2,targetY:3,targetZ:-1,focalLength:43});
   const state=renderState(scene),aspect=16/9,frame=cameraFrame(state,aspect),lens=lensUniforms(state),rays=[];
   for(let i=0;i<256;i++)rays.push({origin:[(i%16)/15,Math.floor(i/16)/15,(i%13)/12,((i*7)%19)/19],direction:[0,0,0]});
   const tracer=await createTracer(state,{width:320,height:180,samples:8,preview:true});let worst=0;
   try{const gpu=await tracer.probe(rays,'camera');for(let i=0;i<rays.length;i++){const ray=cameraRay(state,aspect,...rays[i].origin),expected=[...ray.origin,...ray.direction,frame[7],lens[1]];for(let k=0;k<8;k++){const error=Math.abs(expected[k]-gpu[i*8+k])/Math.max(1,Math.abs(expected[k]));worst=Math.max(worst,error);if(error>5e-5)throw Error(JSON.stringify({modern,i,k,expected:expected[k],actual:gpu[i*8+k],error}));}}}finally{tracer.dispose();}
   reports.push({modern,scalars:rays.length*8,worst});
  }
  const crop={x:37,y:21,width:173,height:95},regions=[];
  for(const dof of [false,true]) {
   const scene=defaultScene();Object.assign(scene.camera.lens,{dof,fNumber:1,metresPerUnit:.1,focusDistance:2});const state=renderState(scene),images=[];
   for(const region of [undefined,crop]){const tracer=await createTracer(state,{width:320,height:180,samples:8,preview:true,region});try{await tracer.run(new AbortController().signal,s=>images[region?1:0]=s);}finally{tracer.dispose();}}
   let different=0;for(let y=0;y<crop.height;y++)for(let x=0;x<crop.width;x++)for(let c=0;c<4;c++)if(images[0].rgba[((y+crop.y)*320+x+crop.x)*4+c]!==images[1].rgba[(y*crop.width+x)*4+c])different++;
   if(different)throw Error('Region changed full-frame samples: '+different);regions.push({dof,crop,pixels:crop.width*crop.height,different});
  }
  const large=[];
  for(const [width,height]of [[2048,1152],[1365,2048],[2048,2048]]){const state=renderState(legacyScene()),controller=new AbortController(),start=performance.now();const tracer=await createTracer(state,{width,height,samples:8});let sample;
   try{await tracer.run(controller.signal,s=>{sample=s;controller.abort();});if(sample?.samples!==1||sample.rgba.length!==width*height*4)throw Error('2K sample failed');large.push({width,height,samples:1,milliseconds:performance.now()-start,imageBuffersBytes:width*height*24});}finally{tracer.dispose();}}
  const adapter=await navigator.gpu.requestAdapter();return {reports,regions,large,browser:navigator.userAgent,adapter:{vendor:adapter.info.vendor,architecture:adapter.info.architecture}};
 });
}
