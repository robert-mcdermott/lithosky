// SPDX-License-Identifier: Apache-2.0
// Playwright CLI callback against an isolated app/recovery directory.
async page=>{
 const check=(v,m)=>{if(!v)throw Error(m);},errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1440,height:1080});await page.reload();
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#render-start').disabled,{},{timeout:60000});await ready();
 if(await page.getByRole('button',{name:'Keep this scene',exact:true}).isVisible())await page.getByRole('button',{name:'Keep this scene',exact:true}).click();
 const observe=()=>page.evaluate(async()=>{const {History}=await import('/scene/history.js');for(const name of ['edit','replace','undo','redo']){const original=History.prototype[name];History.prototype[name]=function(...args){const r=original.apply(this,args);window.geologyScene=this.value;return r;};}});await observe();
 const number=async(id,value)=>{await page.locator(id).fill(String(value));await page.locator(id).press('Tab');await ready();};
 const download=async()=>{const pending=page.waitForEvent('download');await page.locator('#save-scene').click();const file=await pending,chunks=[];for await(const chunk of await file.createReadStream())chunks.push(chunk);return Buffer.concat(chunks);};
 await page.locator('#study-select').selectOption('alpine');await ready();
 // Explicit old-format fixture: new starter studies use v9.
 const legacyFixture=await page.evaluate(async()=>(await import('/scene/document.js')).legacyScene());
 await page.locator('#scene-file').setInputFiles({name:'legacy-fixture.lithosky',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacyFixture))});
 await page.waitForFunction(()=>document.getElementById('file-status').textContent.startsWith('Opened legacy-fixture.lithosky'));await ready();await page.locator('#live-preview').uncheck();
 await page.locator('#enable-geology').click();await ready();check(await page.evaluate(()=>window.geologyScene.version===7&&!window.geologyScene.atmosphere),'v1 geology upgrade');
 await page.locator('#undo').click();await ready();check(await page.evaluate(()=>window.geologyScene.version)===1,'Undo geology');await page.locator('#redo').click();await ready();
 await number('#geology-bump',.8);await number('#geology-strata',.55);await number('#geology-scale',.75);
 const before=await page.locator('#geology-scale').inputValue();await page.locator('#geology-scale').fill('0');await page.locator('#geology-scale').press('Tab');check(await page.locator('#geology-scale').inputValue()===before,'Invalid geology value changed scene');
 const json=await download();check(JSON.parse(json).surface.geology.bump===.8,'JSON save omitted geology');
 await page.locator('#enable-atmosphere').click();await ready();check(await page.evaluate(()=>window.geologyScene.version)===7,'Atmosphere downgraded geology');
 await page.locator('#enable-layers').click();await ready();
 await page.locator('#sculpt-tool').selectOption('raise');await page.locator('#apply-sculpt').click();await ready();
 check(await page.evaluate(()=>window.geologyScene.version===7&&window.geologyScene.terrain.sculpt.length===1),'Sculpt lost geology');
 await page.locator('#heightmap-file').setInputFiles('/Users/rmcdermo/mycode/lithosky/docs/site/assets/terraced-basin.heightmap');
 await page.waitForFunction(()=>document.querySelector('#heightmap-status').textContent.startsWith('Heightmap imported.'));await ready();
 check(await page.evaluate(()=>window.geologyScene.version===7&&window.geologyScene.surface.geology.bump===.8),'Import lost geology');
 const portable=await download();check(portable.subarray(0,2).toString()==='PK','Missing portable heightmap');
 await page.locator('#study-select').selectOption('highland');await ready();
 await page.locator('#scene-file').setInputFiles({name:'geology-portable.lithosky',mimeType:'application/octet-stream',buffer:portable});
 await page.waitForFunction(()=>document.querySelector('#file-status').textContent.startsWith('Opened geology-portable.lithosky'));await ready();
 check(await page.evaluate(()=>window.geologyScene.version===7&&window.geologyScene.surface.geology.bump===.8),'Portable reopen lost geology');
 await page.locator('#disable-atmosphere').click();await ready();check(await page.evaluate(()=>window.geologyScene.version===7&&!window.geologyScene.atmosphere),'Sky removal lost geology');
 await page.locator('#enable-atmosphere').click();await ready();await page.locator('#enable-layers').click();await ready();
 check(await page.evaluate(()=>window.geologyScene.version===7&&window.geologyScene.terrain.generator==='layers-v1'),'Layer conversion lost geology');
 await page.waitForFunction(()=>document.querySelector('#autosave-status').textContent==='Recovery saved on this device');await page.reload();await ready();await page.locator('#live-preview').uncheck();await observe();await page.locator('#restore-scene').click();await page.waitForFunction(()=>document.querySelector('#file-status').textContent.startsWith('Recovery restored.'));await ready();
 check(await page.locator('#geology-bump').inputValue()==='.8'||await page.locator('#geology-bump').inputValue()==='0.8','Recovery lost geology');
 await page.locator('#render-detail').selectOption('512');await page.locator('#render-samples').selectOption('8');await page.locator('#render-start').click();
 await page.waitForFunction(()=>document.querySelector('#render-status').textContent.startsWith('Complete.'),{},{timeout:60000});
 check(await page.locator('#export-image').isEnabled(),'Geological still cannot export');
 await number('#geology-roughness',.9);check(await page.locator('#export-image').isDisabled(),'Material edit retained stale render');
 await page.locator('#render-start').click();await page.locator('#render-cancel').click();await ready();
 await page.locator('#disable-geology').click();await ready();check(await page.evaluate(()=>window.geologyScene.version===6&&!window.geologyScene.surface.geology),'Simple surface did not downgrade safely');
 await page.locator('#undo').click();await ready();check(await page.evaluate(()=>window.geologyScene.version)===7,'Undo simple surface');
 await page.locator('#scene-file').setInputFiles({name:'geology-json.lithosky',mimeType:'application/json',buffer:json});await page.waitForFunction(()=>document.querySelector('#file-status').textContent.startsWith('Opened geology-json.lithosky'));await ready();
 await page.getByText('Graphics & compatibility',{exact:true}).click();await page.locator('#graphics-mode').selectOption('webgl2');await page.waitForFunction(()=>document.querySelector('#backend').textContent==='WebGL 2');
 await page.setViewportSize({width:390,height:844});await page.locator('#geology-fractures').fill('0.4');await page.locator('#geology-fractures').press('Tab');await page.waitForFunction(()=>window.geologyScene.surface.geology.fractures===.4);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile geology overflow');
 await page.locator('#geology-editor').scrollIntoViewIfNeeded();await page.screenshot({path:'output/playwright/geology-mobile.png',fullPage:true});
 check(errors.length===0,errors.join('; '));return {migration:true,json:true,portable:true,recovery:true,sculpt:true,sourceConversion:true,render:true,cancellation:true,invalidation:true,mobileWebGL:true,errors};
}
