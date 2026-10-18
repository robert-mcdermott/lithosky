// SPDX-License-Identifier: Apache-2.0
async page=>{
  const scene=__SCENE__;
  const output=__OUTPUT__,check=(v,m)=>{if(!v)throw Error(m);},errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:1080});await page.reload();
  const ready=()=>page.waitForFunction(()=>!document.querySelector('#render-start').disabled,{},{timeout:60000});await ready();
  if(await page.getByRole('button',{name:'Keep this scene',exact:true}).isVisible())await page.getByRole('button',{name:'Keep this scene',exact:true}).click();
  await page.locator('#scene-file').setInputFiles(output+'/sunlit-ridges.lithosky');
  await page.waitForFunction(()=>document.querySelector('#file-status').textContent.startsWith('Opened sunlit-ridges.lithosky'));await ready();
  const diagnostics=await page.evaluate(async(scene)=>{
    const {TerrainGenerator}=await import('/scene/generator.js'),{renderState}=await import('/scene/document.js'),{intersectHeightfield,finalBudget}=await import('/render/heightfield.js'),{createTracer}=await import('/render/tracer.js'),{normalize}=await import('/scene/terrain.js');
    const state=renderState(scene),worker=new TerrainGenerator(),reports=[];
    try {
      for(const grid of [128,256,512,1024]) {
        const start=performance.now(),field=await worker.generate(state,()=>{},'final',grid),preparationMS=performance.now()-start;
        const rays=[{origin:[-32,30,-32],direction:[0,-1,0]},{origin:[32,30,32],direction:[0,-1,0]},{origin:[0,-20,0],direction:[0,1,0]},{origin:[40,30,0],direction:[0,-1,0]}];
        for(let i=0;i<200;i++)rays.push({origin:[Math.sin(i*3)*36,4+i%9,Math.cos(i*7)*36],direction:normalize([Math.cos(i),-.08,Math.sin(i)])});
        const tracer=await createTracer(state,{width:640,height:360,samples:8},field);
        let worst=0,hits=0;
        try {const values=await tracer.probe(rays);for(let i=0;i<rays.length;i++){const expected=intersectHeightfield(field,rays[i].origin,rays[i].direction)?.t??1e6,error=Math.abs(expected-values[i*4]);worst=Math.max(worst,error);if(expected<1e6)hits++;if(error>.002)throw Error(JSON.stringify({grid,i,expected,actual:values[i*4],error}));}}
        finally {tracer.dispose();}
        reports.push({...finalBudget(grid),preparationMS,rays:rays.length,hits,worst});
      }
    }finally{worker.cancel();}
    const adapter=await navigator.gpu.requestAdapter();return {reports,adapter:{vendor:adapter.info.vendor,architecture:adapter.info.architecture},browser:navigator.userAgent,scene};
  },scene);
  // Cancellation during worker preparation, followed by scene edit and retry.
  await page.locator('#render-detail').selectOption('1024');
  await page.evaluate(()=>{document.querySelector('#render-start').click();document.querySelector('#render-cancel').click();});
  await page.waitForFunction(()=>document.querySelector('#render-status').textContent==='Canceled before the first sample.');
  check(await page.locator('#export-image').isDisabled(),'Partial preparation exported');
  await page.evaluate(()=>{document.querySelector('#render-start').click();document.querySelector('#undo').click();});
  await ready();check(await page.locator('#render-image').isHidden(),'Stale prepared terrain published');
  await page.locator('#redo').click();await ready();
  await page.evaluate(()=>{
    const original=GPUDevice.prototype.createBuffer;
    GPUDevice.prototype.createBuffer=function(descriptor){if(descriptor.size>40*1024*1024)throw Error('Injected final terrain allocation failure');return original.call(this,descriptor);};
    window.restoreTerrainBuffers=()=>{GPUDevice.prototype.createBuffer=original;};
  });
  try {
    await page.locator('#render-start').click();
    await page.waitForFunction(()=>document.querySelector('#render-status').textContent.includes('Injected final terrain allocation failure'));
    check(await page.locator('#export-image').isDisabled(),'Failed allocation exported');
    await ready();
  } finally {await page.evaluate(()=>window.restoreTerrainBuffers());}
  await page.locator('#render-size').selectOption('960');await page.locator('#render-samples').selectOption('32');
  const records=[];
  for(const detail of [128,512,1024]) {
    await page.locator('#render-detail').selectOption(String(detail));
    const start=Date.now();await page.locator('#render-start').click();
    await page.waitForFunction(()=>document.querySelector('#render-status').textContent.startsWith('Complete.'),{},{timeout:120000});
    const milliseconds=Date.now()-start;
    const status=await page.locator('#render-detail-status').textContent();check(status.startsWith(detail+' × '+detail),'Wrong geometry tier: '+status);
    const download=page.waitForEvent('download');await page.locator('#export-image').click();await (await download).saveAs(output+'/terrain-'+detail+'.png');
    records.push({detail,width:960,height:540,samples:32,milliseconds,status});
  }
  check(errors.length===0,errors.join('; '));
  return {diagnostics,records,cancellation:true,editInvalidation:true,allocationFailureRetry:true,errors};
}
