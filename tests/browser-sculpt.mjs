// SPDX-License-Identifier: Apache-2.0
// Playwright CLI run-code callback; use a disposable recovery directory.
async (page) => {
  const check=(v,message)=>{if(!v)throw new Error(message);},errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:1080});await page.reload();
  const ready=()=>page.waitForFunction(()=>!document.getElementById('render-start').disabled,{},{timeout:60000});await ready();
  if(await page.getByRole('button',{name:'Keep this scene',exact:true}).isVisible())await page.getByRole('button',{name:'Keep this scene',exact:true}).click();
  await page.evaluate(async()=>{
    const {History}=await import('/scene/history.js'),{TerrainGenerator}=await import('/scene/generator.js');
    for(const name of ['edit','undo','redo']){const original=History.prototype[name];History.prototype[name]=function(...args){const result=original.apply(this,args);window.sculptScene=this.value;window.historyBytes=this.snapshotBytes;return result;};}
    const original=TerrainGenerator.prototype.generate;TerrainGenerator.prototype.generate=async function(...args){const r=await original.apply(this,args);if(r.field)window.sculptField=r.field;window.reusedNoise=!r.noiseChanged;return r;};
  });
  // Explicit old-format fixture: new starter studies use v9.
 const legacyFixture=await page.evaluate(async()=>(await import('/scene/document.js')).legacyScene());
 await page.locator('#scene-file').setInputFiles({name:'legacy-fixture.lithosky',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacyFixture))});
 await page.waitForFunction(()=>document.getElementById('file-status').textContent.startsWith('Opened legacy-fixture.lithosky'));await ready();await page.locator('#live-preview').uncheck();
 await page.getByRole('button',{name:'Build with layers',exact:true}).click();await ready();
  await page.getByRole('checkbox',{name:'Show water',exact:true}).uncheck();await ready();
  const hash=()=>page.evaluate(async()=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',window.sculptField.vertices))).map(v=>v.toString(16).padStart(2,'0')).join(''));
  const baseline=await hash();
  const tool=page.getByRole('combobox',{name:'Interaction tool',exact:true});await tool.selectOption('raise');
  await page.getByRole('slider',{name:'Brush strength',exact:true}).fill('1');
  const viewport=page.locator('#viewport');await viewport.scrollIntoViewIfNeeded();
  const bounds=await viewport.boundingBox();const x=bounds.x+bounds.width*.5,y=bounds.y+bounds.height*.6;
  const camera=await page.evaluate(()=>JSON.stringify(window.sculptScene.camera));
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+60,y+15,{steps:12});await page.mouse.up();await ready();
  check(await page.locator('#sculpt-count').textContent()==='1 / 32 strokes','Pointer stroke count');
  const raised=await hash();check(raised!==baseline,'Pointer stroke did not alter heights');
  check(await page.evaluate(()=>JSON.stringify(window.sculptScene.camera))===camera,'Sculpt drag moved camera');
  check(await page.evaluate(()=>window.reusedNoise),'Stroke regenerated procedural noise');
  check(await page.locator('#sculpt-overlay').isVisible(),'Brush outline missing');
  await page.getByRole('button',{name:'Undo',exact:true}).click();await ready();check(await hash()===baseline,'Undo did not restore original heightfield');
  await page.getByRole('button',{name:'Redo',exact:true}).click();await ready();check(await hash()===raised,'Redo did not restore stroke');
  // Escape and pointer cancellation must discard staged strokes without history edits.
  for(const cancel of ['escape','pointercancel','blur']) {
    await viewport.scrollIntoViewIfNeeded();const r=await viewport.boundingBox();await page.mouse.move(r.x+r.width*.5,r.y+r.height*.6);await page.mouse.down();await page.mouse.move(r.x+r.width*.55,r.y+r.height*.65,{steps:4});
    if(cancel==='escape')await viewport.press('Escape');else if(cancel==='pointercancel')await viewport.dispatchEvent('pointercancel',{pointerId:1});else await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    await page.mouse.up();check(await page.locator('#sculpt-count').textContent()==='1 / 32 strokes','Canceled stroke committed');check(await hash()===raised,'Canceled stroke changed heightfield');
  }
  const reports=[];
  for(const name of ['lower','smooth','flatten']) {
    await tool.selectOption(name);await viewport.focus();await viewport.press('Home');await viewport.press('ArrowRight');await viewport.press('ArrowDown');
    const before=await hash();await viewport.press('Space');await ready();const after=await hash();check(before!==after,name+' did not alter heightfield');
    reports.push(name);check(await page.evaluate(()=>window.historyBytes)<=4*1048576,'History budget exceeded');
  }
  check(await page.locator('#sculpt-count').textContent()==='4 / 32 strokes','Keyboard strokes missing');
  const savedHash=await hash();let pending=page.waitForEvent('download');await page.getByRole('button',{name:'Save scene',exact:true}).click();const download=await pending;
  const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);const bytes=Buffer.concat(chunks),scene=JSON.parse(bytes);check(scene.version===3&&scene.terrain.sculpt.length===4,'Sculpt file omitted strokes');
  await page.getByRole('button',{name:'Clear sculpting',exact:true}).click();await ready();check(await hash()===baseline,'Clear did not restore base');
  await page.getByRole('button',{name:'Undo',exact:true}).click();await ready();check(await hash()===savedHash,'Clear was not undoable');
  await page.getByRole('combobox',{name:'Start with a scene',exact:true}).selectOption('alpine');await ready();
  await page.locator('#scene-file').setInputFiles({name:'sculpted.lithosky',mimeType:'application/json',buffer:bytes});
  await page.waitForFunction(()=>document.getElementById('sculpt-count').textContent==='4 / 32 strokes');await ready();check(await hash()===savedHash,'Open changed sculpted geometry');
  await page.waitForFunction(()=>document.getElementById('autosave-status').textContent==='Recovery saved on this device');
  await page.reload();await ready();await page.locator('#live-preview').uncheck();await page.getByRole('button',{name:'Restore scene',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('sculpt-count').textContent==='4 / 32 strokes');await ready();
  await page.getByRole('combobox',{name:'Samples',exact:true}).selectOption('8');await page.getByRole('button',{name:'Render image',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('render-status').textContent.startsWith('Complete.'),{},{timeout:60000});
  const rendered=await page.locator('#render-status').textContent();pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export PNG',exact:true}).click();await(await pending).saveAs('/Users/rmcdermo/mycode/lithosky/output/playwright/w2-sculpt.png');
  // Work still functions with the compatibility preview on a narrow screen.
  await page.getByText('Graphics & compatibility',{exact:true}).click();await page.getByRole('combobox',{name:'Preview backend',exact:true}).selectOption('webgl2');
  await page.waitForFunction(()=>document.getElementById('backend').textContent==='WebGL 2');await tool.selectOption('raise');await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Apply brush',exact:true}).click();await page.waitForFunction(()=>document.getElementById('cancel-terrain').disabled);
  check(await page.locator('#sculpt-count').textContent()==='5 / 32 strokes','Compatibility/mobile brush failed');check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow');
  await page.screenshot({path:'/Users/rmcdermo/mycode/lithosky/output/playwright/w2-sculpt-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1080});await viewport.scrollIntoViewIfNeeded();await page.mouse.move(x,y);await page.screenshot({path:'/Users/rmcdermo/mycode/lithosky/output/playwright/w2-sculpt-studio.png',fullPage:true});
  // Cap the log explicitly; no stroke may silently drop older sculpted work.
  scene.terrain.sculpt=Array.from({length:32},()=>scene.terrain.sculpt[0]);
  await page.locator('#scene-file').setInputFiles({name:'full-sculpt.lithosky',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(scene))});
  await page.waitForFunction(()=>document.getElementById('sculpt-count').textContent==='32 / 32 strokes');await page.waitForFunction(()=>document.getElementById('cancel-terrain').disabled,{},{timeout:60000});
  check(await page.getByRole('button',{name:'Apply brush',exact:true}).isDisabled(),'Stroke cap did not stop edits');
  check(errors.length===0,'Browser errors: '+errors.join('; '));return {reports,rendered,pointerUndoExact:true,persistence:true,errors};
}
