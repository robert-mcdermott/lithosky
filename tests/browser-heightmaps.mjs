// SPDX-License-Identifier: Apache-2.0
// Playwright CLI callback. Run with isolated recovery storage.
async page=>{
 const canonical=v=>JSON.stringify(v,(key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
 const check=(v,m)=>{if(!v)throw new Error(m);},errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1440,height:1080});await page.reload();
 const ready=()=>page.waitForFunction(()=>!document.getElementById('render-start').disabled,{},{timeout:60000});await ready();
 if(await page.getByRole('button',{name:'Keep this scene',exact:true}).isVisible())await page.getByRole('button',{name:'Keep this scene',exact:true}).click();
 await page.evaluate(async()=>{const {History}=await import('/scene/history.js');for(const name of ['edit','undo','redo']){const original=History.prototype[name];History.prototype[name]=function(...args){const r=original.apply(this,args);window.heightmapScene=this.value;return r;};}});
 const download=async(id)=>{const event=page.waitForEvent('download');await page.locator(id).click();const file=await event,chunks=[];for await(const c of await file.createReadStream())chunks.push(c);return {file,bytes:Buffer.concat(chunks)};};
 const importMap=async(buffer,name='terrain.heightmap')=>{await page.locator('#heightmap-file').setInputFiles({name,mimeType:'application/octet-stream',buffer});await page.waitForFunction(()=>document.getElementById('heightmap-status').textContent.startsWith('Heightmap imported.'));await ready();};
 // Migrate the v1 starter through a full-depth export; no UI canvas conversion.
 const original=await download('#export-heightmap');check(original.bytes.subarray(0,2).toString()==='PK','Export is not a bundle');
 await importMap(original.bytes);let scene=await page.evaluate(()=>window.heightmapScene);check(scene.version===5&&scene.terrain.resolution===128,'v1 migration');
 check(scene.camera.distance===23&&scene.terrain.elevation===1,'Migration changed camera/scale');
 await page.getByRole('button',{name:'Undo',exact:true}).click();await ready();check(await page.evaluate(()=>window.heightmapScene.version)===1,'Migration undo');
 await page.getByRole('button',{name:'Redo',exact:true}).click();await ready();
 const hash=scene.terrain.asset,roundtrip=await download('#export-heightmap');await importMap(roundtrip.bytes);check(await page.evaluate(()=>window.heightmapScene.terrain.asset)===hash,'16-bit samples changed on export/import');
 // Plain PNG uses explicit scale. The bundled example then restores its own scale.
 await page.getByText('PNG import scale',{exact:true}).click();
 await page.getByRole('spinbutton',{name:'Black height',exact:true}).fill('-3');await page.getByRole('spinbutton',{name:'White height',exact:true}).fill('8');await page.getByRole('spinbutton',{name:'Metres per scene unit',exact:true}).fill('10');
 await page.locator('#heightmap-file').setInputFiles('/Users/rmcdermo/mycode/lithosky/docs/site/assets/terraced-basin.png');await page.waitForFunction(()=>window.heightmapScene?.terrain.resolution===256);await ready();
 check(await page.evaluate(()=>window.heightmapScene.terrain.metersPerUnit)===10,'Plain PNG scale missing');
 await page.getByRole('spinbutton',{name:'Black height',exact:true}).fill('');
 await page.locator('#heightmap-file').setInputFiles('/Users/rmcdermo/mycode/lithosky/docs/site/assets/terraced-basin.heightmap');await page.waitForFunction(()=>document.getElementById('heightmap-status').textContent.startsWith('Heightmap imported.'));await ready();
 await page.getByRole('combobox',{name:'Interaction tool',exact:true}).selectOption('raise');await page.getByRole('button',{name:'Apply brush',exact:true}).click();await ready();
 await page.getByRole('button',{name:'Customize surface',exact:true}).click();await ready();
 check(await page.evaluate(()=>window.heightmapScene.version===5&&window.heightmapScene.terrain.sculpt.length===1&&window.heightmapScene.surface.preset==='rules'),'Sculpt/material lost v5');
 const saved=await download('#save-scene');check(saved.bytes.subarray(0,2).toString()==='PK','Scene omitted its asset');await saved.file.saveAs('/Users/rmcdermo/mycode/lithosky/output/playwright/w2-heightmap.lithosky');
 scene=await page.evaluate(()=>window.heightmapScene);
 await page.getByRole('combobox',{name:'Start with a scene',exact:true}).selectOption('alpine');await ready();
 await page.locator('#scene-file').setInputFiles({name:'heightmap.lithosky',mimeType:'application/octet-stream',buffer:saved.bytes});await page.waitForFunction(()=>document.getElementById('file-status').textContent.startsWith('Opened heightmap.lithosky'));await ready();
 check(canonical(await page.evaluate(()=>window.heightmapScene))===canonical(scene),'Portable scene reopen changed state');
 const before=canonical(scene);
 await page.locator('#heightmap-file').setInputFiles({name:'bad.heightmap',mimeType:'application/octet-stream',buffer:Buffer.from('PKbroken')});await page.waitForFunction(()=>document.getElementById('heightmap-status').textContent.startsWith('Could not import:'));
 check(canonical(await page.evaluate(()=>window.heightmapScene))===before,'Bad heightmap mutated scene');
 await page.locator('#scene-file').setInputFiles({name:'bad.lithosky',mimeType:'application/octet-stream',buffer:Buffer.from('PKbroken')});await page.waitForFunction(()=>document.getElementById('file-status').textContent.startsWith('Could not open scene:'));
 check(canonical(await page.evaluate(()=>window.heightmapScene))===before,'Bad container mutated scene');
 // A completed upload must not overwrite a newer user edit.
 await page.route('**/api/heightmap/import',async route=>{const response=await route.fetch();await new Promise(r=>setTimeout(r,300));await route.fulfill({response});});
 await page.locator('#heightmap-file').setInputFiles({name:'slow.heightmap',mimeType:'application/octet-stream',buffer:original.bytes});
 await page.getByRole('textbox',{name:'Scene name',exact:true}).fill('Imported landscape');await page.getByRole('textbox',{name:'Scene name',exact:true}).press('Tab');
 await page.waitForFunction(()=>document.getElementById('heightmap-status').textContent.includes('scene changed while importing'));await page.unroute('**/api/heightmap/import');
 check(await page.evaluate(()=>window.heightmapScene.terrain.resolution)===256,'Stale import replaced newer scene');
 await page.waitForFunction(()=>document.getElementById('autosave-status').textContent==='Recovery saved on this device');
 await page.reload();await ready();await page.getByRole('button',{name:'Restore scene',exact:true}).click();await page.waitForFunction(()=>document.getElementById('file-status').textContent.startsWith('Recovery restored.'));await ready();
 check((await page.locator('#heightmap-info').textContent()).includes('257 × 257'),'Heightmap recovery');
 await page.getByRole('combobox',{name:'Samples',exact:true}).selectOption('8');await page.getByRole('button',{name:'Render image',exact:true}).click();await page.waitForFunction(()=>document.getElementById('render-status').textContent.startsWith('Complete.'),{},{timeout:60000});
 const rendered=await page.locator('#render-status').textContent(),image=await download('#export-image');await image.file.saveAs('/Users/rmcdermo/mycode/lithosky/output/playwright/w2-heightmap.png');
 await page.locator('#heightmap-info').scrollIntoViewIfNeeded();await page.screenshot({path:'/Users/rmcdermo/mycode/lithosky/output/playwright/w2-heightmap-studio.png',fullPage:true});
 await page.getByText('Graphics & compatibility',{exact:true}).click();await page.getByRole('combobox',{name:'Preview backend',exact:true}).selectOption('webgl2');await page.waitForFunction(()=>document.getElementById('backend').textContent==='WebGL 2');
 await page.setViewportSize({width:390,height:844});const mobile=await download('#export-heightmap');check(mobile.bytes.length>100,'Mobile export failed');check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow');
 await page.screenshot({path:'/Users/rmcdermo/mycode/lithosky/output/playwright/w2-heightmap-mobile.png',fullPage:true});check(errors.length===0,errors.join('; '));
 return {v1Migration:true,sampleHashPreserved:true,portableBytes:saved.bytes.length,persistence:true,malformedRejected:true,staleImportRejected:true,rendered,mobileWebGL:true,errors};
}
