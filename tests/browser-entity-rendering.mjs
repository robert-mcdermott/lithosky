// SPDX-License-Identifier: Apache-2.0
async page=>{
 await page.locator('#live-preview').uncheck();
 return page.evaluate(async()=>{
  const {defaultScene,renderState}=await import('/scene/document.js'),{entityScene,entityCommand,editScene}=await import('/scene/entities.js'),{createTracer}=await import('/render/tracer.js'),{cameraRay}=await import('/camera/model.js'),{areaLightDefaults}=await import('/lighting/model.js');
  const render=async(scene)=>{const tracer=await createTracer(renderState(scene),{width:320,height:180,samples:8,preview:true});let image;try{await tracer.run(new AbortController().signal,s=>image=s);return image.rgba;}finally{tracer.dispose();}};
  const original=defaultScene(),graph=entityScene(original),legacy=await render(original),migrated=await render(graph);let different=0;for(let i=0;i<legacy.length;i++)if(legacy[i]!==migrated[i])different++;if(different)throw Error('Migration changed renderer pixels: '+different);
  entityCommand(graph,'visible','terrain-main',false);const tracer=await createTracer(renderState(graph),{width:320,height:180,samples:8,preview:true});try{const probe=await tracer.probe([{origin:[0,30,0],direction:[0,-1,0]}]);if(probe[0]!==1e6)throw Error('Hidden terrain still intersects');}finally{tracer.dispose();}
  entityCommand(graph,'visible','water-main',false);const sky=await render(graph);entityCommand(graph,'visible','environment-main',false);const dark=await render(graph);let skyPixels=0,darkPixels=0;for(let i=0;i<dark.length;i+=4){if(sky[i]+sky[i+1]+sky[i+2]>0)skyPixels++;if(dark[i]+dark[i+1]+dark[i+2]>0)darkPixels++;}if(!skyPixels||darkPixels)throw Error(JSON.stringify({skyPixels,darkPixels}));
  const state=renderState(graph),ray=cameraRay(state,16/9,.5,.5),position=ray.origin.map((x,i)=>x+ray.direction[i]*2),normal=ray.direction.map(x=>-x);editScene(graph,s=>s.lighting.transport.lights.push({...areaLightDefaults(),x:position[0],y:position[1],z:position[2],yaw:Math.atan2(normal[0],-normal[2])*180/Math.PI,pitch:Math.asin(normal[1])*180/Math.PI,width:8,height:8,intensity:2}));const lit=await render(graph);let litPixels=0;for(let i=0;i<lit.length;i+=4)if(lit[i]+lit[i+1]+lit[i+2]>0)litPixels++;if(litPixels<320*180*.5)throw Error('Environment visibility suppressed independent area lights');
  const adapter=await navigator.gpu.requestAdapter();return {migrationPixels:320*180,migrationDifferences:different,hiddenTerrainMiss:true,skyPixels,darkPixels,independentLightPixels:litPixels,browser:navigator.userAgent,hardware:{vendor:adapter.info.vendor,architecture:adapter.info.architecture}};
 });
}
