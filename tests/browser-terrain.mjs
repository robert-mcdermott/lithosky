// SPDX-License-Identifier: Apache-2.0
// Playwright CLI callback; run against an isolated app instance (docs/terrain.md).
async (page) => {
  const check=(value,message)=>{if(!value)throw new Error(message);};
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:1080});await page.reload();
  const ready=()=>page.waitForFunction(()=>!document.getElementById('render-start').disabled,{},{timeout:60000});
  await ready();
  if(await page.getByRole('button',{name:'Keep this scene',exact:true}).isVisible())await page.getByRole('button',{name:'Keep this scene',exact:true}).click();
  await page.evaluate(async()=>{
    const {TerrainGenerator}=await import('/scene/generator.js');const original=TerrainGenerator.prototype.generate;
    window.terrainJobs=[];
    TerrainGenerator.prototype.generate=async function(...args){const job={seed:args[0].seed};window.terrainJobs.push(job);try{const result=await original.apply(this,args);job.heights=result.heightsChanged;job.surface=result.surfaceChanged;return result;}catch(error){job.error=error.name;throw error;}};
  });
  // Explicit old-format fixture: new starter studies use v9.
 const legacyFixture=await page.evaluate(async()=>(await import('/scene/document.js')).legacyScene());
 await page.locator('#scene-file').setInputFiles({name:'legacy-fixture.lithosky',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacyFixture))});
 await page.waitForFunction(()=>document.getElementById('file-status').textContent.startsWith('Opened legacy-fixture.lithosky'));await ready();await page.locator('#live-preview').uncheck();
 await page.getByRole('button',{name:'Build with layers',exact:true}).click();await ready();
  check(await page.locator('#terrain-layers fieldset').count()===3,'Three initial layers');
  await page.getByRole('combobox',{name:'New layer',exact:true}).selectOption('terrace');
  await page.getByRole('button',{name:'Add layer',exact:true}).click();await ready();
  await page.getByRole('spinbutton',{name:'Step height, layer 4',exact:true}).fill('1.5');
  await page.getByRole('spinbutton',{name:'Step height, layer 4',exact:true}).press('Tab');await ready();
  await page.getByRole('button',{name:'Move up, layer 4',exact:true}).click();await ready();
  await page.getByRole('button',{name:'Undo',exact:true}).click();await ready();
  check(await page.getByRole('spinbutton',{name:'Step height, layer 4',exact:true}).inputValue()==='1.5','Layer reorder is undoable');
  await page.getByRole('checkbox',{name:'Enabled, layer 4',exact:true}).uncheck();await ready();
  await page.getByRole('button',{name:'Undo',exact:true}).click();await ready();
  // Changing title, camera and light must not submit terrain work.
  const jobs=await page.evaluate(()=>window.terrainJobs.length);
  await page.getByRole('textbox',{name:'Scene name',exact:true}).fill('Layered test');await page.getByRole('textbox',{name:'Scene name',exact:true}).press('Tab');
  await page.locator('#viewport').focus();await page.locator('#viewport').press('ArrowRight');
  await page.getByRole('slider',{name:'Sun elevation',exact:true}).fill('25');
  check(await page.evaluate(()=>window.terrainJobs.length)===jobs,'Non-geometry edits submitted terrain jobs');
  await page.getByRole('combobox',{name:'Color palette',exact:true}).selectOption('otherworld');await ready();
  check(await page.evaluate(()=>{const j=window.terrainJobs.at(-1);return !j.heights&&j.surface;}),'Palette regenerated heights');
  await page.getByRole('checkbox',{name:'Show water',exact:true}).uncheck();await ready();
  check(await page.evaluate(()=>{const j=window.terrainJobs.at(-1);return !j.heights&&!j.surface;}),'Water regenerated terrain');
  // Save/reopen the complete layered scene and check server-side recovery accepts it.
  let pending=page.waitForEvent('download');await page.getByRole('button',{name:'Save scene',exact:true}).click();const download=await pending;
  const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const bytes=Buffer.concat(chunks),scene=JSON.parse(bytes);
  check(scene.version===2&&scene.terrain.layers.length===4,'Saved v2 layer stack');
  await page.getByRole('combobox',{name:'Start with a scene',exact:true}).selectOption('alpine');await ready();
  await page.locator('#scene-file').setInputFiles({name:'layered.lithosky',mimeType:'application/json',buffer:bytes});await ready();
  await page.waitForFunction(()=>document.getElementById('scene-name').textContent==='Layered test');
  check(await page.getByRole('spinbutton',{name:'Step height, layer 4',exact:true}).inputValue()==='1.5','Reopened layer settings');
  await page.waitForFunction(()=>document.getElementById('autosave-status').textContent==='Recovery saved on this device');
  await page.reload();await ready();await page.locator('#live-preview').uncheck();await page.getByRole('button',{name:'Restore scene',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('scene-name').textContent==='Layered test');await ready();
  check(await page.locator('#terrain-layers fieldset').count()===4,'Layered recovery');
  // Cancellation is immediate even for the largest grid; render remains disabled.
  await page.evaluate(()=>{const r=document.getElementById('terrain-resolution');r.value='2048';r.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('cancel-terrain').click();});
  await page.waitForFunction(()=>document.getElementById('terrain-status').textContent.startsWith('Generation canceled.'));
  check(await page.getByRole('button',{name:'Render image',exact:true}).isDisabled(),'Canceled geometry rendered');
  // A worker startup failure preserves the scene and offers a working retry.
  await page.evaluate(()=>{window.originalTerrainWorker=window.Worker;window.Worker=class {constructor(){throw new Error('Injected terrain worker startup failure');}};});
  await page.getByRole('button',{name:'Regenerate terrain',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('terrain-status').textContent.includes('Injected terrain worker startup failure'));
  check(await page.getByRole('button',{name:'Render image',exact:true}).isDisabled(),'Failed geometry rendered');
  await page.evaluate(()=>{window.Worker=window.originalTerrainWorker;});
  await page.evaluate(()=>{window.framesDuringTerrain=0;window.measureTerrain=true;const tick=()=>{if(window.measureTerrain){window.framesDuringTerrain++;requestAnimationFrame(tick);}};requestAnimationFrame(tick);});
  const start=Date.now();await page.getByRole('button',{name:'Regenerate terrain',exact:true}).click();await ready();
  const largest={milliseconds:Date.now()-start,frames:await page.evaluate(()=>{window.measureTerrain=false;return window.framesDuringTerrain;})};
  check(largest.frames>2,'Terrain blocked the UI');
  check((await page.locator('#geometry').textContent()).includes('2048²'),'Wrong grid budget');
  // The shader must intersect the exact reduced field returned by the worker.
  const parity=await page.evaluate(async(scene)=>{
    const {TerrainGenerator}=await import('/scene/generator.js');const {renderState}=await import('/scene/document.js');
    const {createTracer}=await import('/render/tracer.js');const {intersectHeightfield}=await import('/render/heightfield.js');
    const state=renderState(scene),generator=new TerrainGenerator();const result=await generator.generate(state);generator.cancel();
    const rays=Array.from({length:100},(_,i)=>({origin:[(i%10)*6-27,50,Math.floor(i/10)*6-27],direction:[0,-1,0]}));
    const tracer=await createTracer(state,{width:640,height:360,samples:8},result.field);let worst=0;
    try {const gpu=await tracer.probe(rays);rays.forEach((ray,i)=>{const cpu=intersectHeightfield(result.field,ray.origin,ray.direction)?.t??1e6;worst=Math.max(worst,Math.abs(cpu-gpu[i*4]));});}finally{tracer.dispose();}
    return worst;
  },scene);check(parity<.002,'Layered CPU/GPU intersection mismatch');
  await page.getByRole('combobox',{name:'Samples',exact:true}).selectOption('8');await page.getByRole('button',{name:'Render image',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('render-status').textContent.startsWith('Complete.'),{},{timeout:60000});
  const rendered=await page.locator('#render-status').textContent();
  await page.getByRole('textbox',{name:'Scene name',exact:true}).fill('Layered renamed');await page.getByRole('textbox',{name:'Scene name',exact:true}).press('Tab');
  check(await page.getByRole('button',{name:'Export PNG',exact:true}).isEnabled(),'Title edit cleared render');
  pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export PNG',exact:true}).click();const png=await pending;await png.saveAs('/Users/rmcdermo/mycode/lithosky/output/playwright/w2-layered.png');
  await page.screenshot({path:'/Users/rmcdermo/mycode/lithosky/output/playwright/w2-studio.png',fullPage:true});
  await page.getByText('Graphics & compatibility',{exact:true}).click();await page.getByRole('combobox',{name:'Preview backend',exact:true}).selectOption('webgl2');
  await page.waitForFunction(()=>document.getElementById('backend').textContent==='WebGL 2');check(await page.getByRole('button',{name:'Render image',exact:true}).isDisabled(),'WebGL final render enabled');
  await page.setViewportSize({width:390,height:844});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow');
  await page.getByRole('button',{name:'Remove, layer 4',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('cancel-terrain').disabled);
  check(await page.locator('#terrain-layers fieldset').count()===3,'Mobile layer removal');
  await page.screenshot({path:'/Users/rmcdermo/mycode/lithosky/output/playwright/w2-mobile.png',fullPage:true});
  check(errors.length===0,'Browser errors: '+errors.join('; '));return {largest,parity,rendered,errors};
}
