// SPDX-License-Identifier: Apache-2.0
// Playwright CLI callback; run against an isolated app with WebGPU.
async page=>{
 const check=(v,m)=>{if(!v)throw Error(m);},errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1440,height:1080});await page.reload();
 const ready=()=>page.waitForFunction(()=>!document.getElementById('render-start').disabled,{},{timeout:60000});await ready();
 if(await page.getByRole('button',{name:'Keep this scene',exact:true}).isVisible())await page.getByRole('button',{name:'Keep this scene',exact:true}).click();
 await page.evaluate(async()=>{const {History}=await import('/scene/history.js');for(const name of ['edit','replace','undo','redo']){const original=History.prototype[name];History.prototype[name]=function(...args){const r=original.apply(this,args);window.atmosphereScene=this.value;return r;};}});
 const number=async(name,value)=>{const input=page.getByRole('spinbutton',{name,exact:true});await input.fill(String(value));await input.press('Tab');await ready();};
 const download=async id=>{const promise=page.waitForEvent('download');await page.locator(id).click();const file=await promise,parts=[];for await(const c of await file.createReadStream())parts.push(c);return {file,bytes:Buffer.concat(parts)};};
 await page.getByRole('button',{name:'Build with layers',exact:true}).click();await ready();
 await page.getByRole('button',{name:'Use physical atmosphere',exact:true}).click();await ready();check(await page.evaluate(()=>window.atmosphereScene.version===6&&window.atmosphereScene.terrain.sculpt.length===0),'Unsculpted layer migration');
 await page.getByRole('button',{name:'Undo',exact:true}).click();await ready();await page.getByRole('button',{name:'Undo',exact:true}).click();await ready();
 await page.getByRole('button',{name:'Use physical atmosphere',exact:true}).click();await ready();check(await page.evaluate(()=>window.atmosphereScene.version)===6,'Enable v6');
 await page.getByRole('button',{name:'Undo',exact:true}).click();check(await page.evaluate(()=>window.atmosphereScene.version)===1,'Undo upgrade');await page.getByRole('button',{name:'Redo',exact:true}).click();
 await number('Sun azimuth',240);await number('Physical sun elevation',12);await number('Aerosol density',1.5);
 await page.getByRole('combobox',{name:'Sun positioning',exact:true}).selectOption('geographic');await number('UTC year',2024);await number('Day of year',366);await number('UTC year',2026);check(await page.locator('#atmosphere-day').inputValue()==='365','Leap date handling');await number('Latitude (north positive)',90);check(!(await page.locator('#atmosphere-status').textContent()).includes('NaN'),'Pole position');
 await page.getByRole('combobox',{name:'Sun positioning',exact:true}).selectOption('manual');
 const state=await page.evaluate(()=>window.atmosphereScene);const saved=await download('#save-scene');check(JSON.parse(saved.bytes).atmosphere.sunAzimuth===240,'Atmosphere save');
 await page.getByRole('combobox',{name:'Start with a scene',exact:true}).selectOption('alpine');await ready();
 await page.locator('#scene-file').setInputFiles({name:'atmosphere.lithosky',mimeType:'application/json',buffer:saved.bytes});await page.waitForFunction(()=>document.getElementById('file-status').textContent.startsWith('Opened atmosphere.lithosky'));await ready();check(await page.locator('#atmosphere-sunAzimuth').inputValue()==='240','Atmosphere reopen');
 await page.waitForFunction(()=>document.getElementById('autosave-status').textContent==='Recovery saved on this device');await page.reload();await ready();await page.getByRole('button',{name:'Restore scene',exact:true}).click();await page.waitForFunction(()=>document.getElementById('file-status').textContent.startsWith('Recovery restored.'));await ready();check(await page.locator('#atmosphere-aerosols').inputValue()==='1.5','Atmosphere recovery');
 const diagnostics=await page.evaluate(async scene=>{
  const {createTracer}=await import('/render/tracer.js'),{renderState}=await import('/scene/document.js'),{sunDirection}=await import('/atmosphere/solar.js'),{buildAtmosphere,earthModel,lookupTrans,sample2D,directionUV,SKY_OFFSET,SW,SH,integrate}=await import('/atmosphere/model.js'),{frameUniforms}=await import('/scene/terrain.js');
  const state=renderState(scene),sun=sunDirection(scene.atmosphere),eye=frameUniforms(state,16/9)[1],model=earthModel(scene.atmosphere),{data,height}=await buildAtmosphere(scene.atmosphere,eye,sun),tracer=await createTracer(state,{width:640,height:360,samples:8});
  try {
   const cases=[[0,1],[0,.1],[0,0],[2,.5],[10,-.02],[60,1]],directions=[[0,1,0],[0,0,-1],[1,0,0],[0,-1,0]],rays=[...cases.map(([h,mu])=>({origin:[h,mu,0,0],direction:[0,1,0]})),...directions.map(direction=>({origin:[0,0,0,1],direction})),{origin:[0,8,0,2],direction:[1,0,0]}];
   const gpu=await tracer.probe(rays,true),ref=[...cases.map(([h,mu])=>lookupTrans(data,h,mu,model)),...directions.map(d=>sample2D(data,SKY_OFFSET,SW,SH,...directionUV(d)))];
   const air=integrate(.8,[1,0,0],sun,model,(h,mu)=>lookupTrans(data,h,mu,model),16,1);ref.push(air.radiance.map((x,i)=>x+air.transmittance[i]));
   let worst=0;for(let i=0;i<ref.length;i++)for(let k=0;k<3;k++){const error=Math.abs(gpu[i*4+k]-ref[i][k]);worst=Math.max(worst,error);if(error>.002)throw Error('Atmosphere GPU mismatch '+i+': '+error);}
   return {gpuChecks:ref.length,worst,bytes:data.byteLength,height};
  }finally{tracer.dispose();}
 },state);
 await page.getByRole('combobox',{name:'Samples',exact:true}).selectOption('8');await page.getByRole('button',{name:'Render image',exact:true}).click();await page.waitForFunction(()=>document.getElementById('render-status').textContent.startsWith('Complete.'),{},{timeout:60000});
 const render=await page.locator('#render-status').textContent(),image=await download('#export-image');await image.file.saveAs('/Users/rmcdermo/mycode/lithosky/output/playwright/w3-atmosphere.png');
 await page.locator('#atmosphere-mode').scrollIntoViewIfNeeded();await page.screenshot({path:'/Users/rmcdermo/mycode/lithosky/output/playwright/w3-atmosphere-studio.png',fullPage:true});
 await number('Physical sun elevation',-18);check(await page.locator('#export-image').isDisabled(),'Sun edit retained stale image');
 await page.getByRole('button',{name:'Render image',exact:true}).click();await page.getByRole('button',{name:'Cancel render',exact:true}).click();await page.waitForFunction(()=>document.getElementById('render-status').textContent.startsWith('Canceled'),{},{timeout:60000});
 await page.getByRole('button',{name:'Render image',exact:true}).click();await page.waitForFunction(()=>document.getElementById('render-status').textContent.startsWith('Complete.'),{},{timeout:60000});
 // A heightmap + atmosphere must retain both its asset and v6 across other tools.
 await page.locator('#heightmap-file').setInputFiles('/Users/rmcdermo/mycode/lithosky/docs/site/assets/terraced-basin.heightmap');await page.waitForFunction(()=>document.getElementById('heightmap-status').textContent.startsWith('Heightmap imported.'));await ready();
 await page.getByRole('button',{name:'Customize surface',exact:true}).click();await ready();await page.getByRole('combobox',{name:'Interaction tool',exact:true}).selectOption('raise');await page.getByRole('button',{name:'Apply brush',exact:true}).click();await ready();
 const portable=await download('#save-scene');check(portable.bytes.subarray(0,2).toString()==='PK','v6 omitted heightmap');
 await page.getByRole('button',{name:'Use artistic sky',exact:true}).click();await page.getByRole('button',{name:'Undo',exact:true}).click();
 await page.locator('#scene-file').setInputFiles({name:'portable-atmosphere.lithosky',mimeType:'application/octet-stream',buffer:portable.bytes});await page.waitForFunction(()=>document.getElementById('file-status').textContent.startsWith('Opened portable-atmosphere.lithosky'));await ready();check(await page.locator('#atmosphere-aerosols').inputValue()==='1.5','Portable atmosphere lost');
 await page.getByRole('button',{name:'Build with layers',exact:true}).click();await ready();check(await page.locator('#atmosphere-aerosols').inputValue()==='1.5','Layer conversion lost atmosphere');
 await page.getByText('Graphics & compatibility',{exact:true}).click();await page.getByRole('combobox',{name:'Preview backend',exact:true}).selectOption('webgl2');await page.waitForFunction(()=>document.getElementById('backend').textContent==='WebGL 2');
 await page.setViewportSize({width:390,height:844});await page.locator('#atmosphere-sunElevation').fill('38');await page.locator('#atmosphere-sunElevation').press('Tab');check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow');await page.screenshot({path:'/Users/rmcdermo/mycode/lithosky/output/playwright/w3-atmosphere-mobile.png',fullPage:true});
 check(errors.length===0,errors.join('; '));return {diagnostics,render,persistence:true,portable:true,cancellation:true,night:true,mobileWebGL:true,errors};
}
