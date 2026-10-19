// SPDX-License-Identifier: Apache-2.0
async (page) => {
  const output=__OUTPUT__;
  await page.setViewportSize({width:1440,height:1080});
  await page.waitForFunction(()=>!document.getElementById('render-start').disabled);
  await page.locator('#live-preview').uncheck();
  if(await page.getByRole('button',{name:'Keep this scene',exact:true}).isVisible()) await page.getByRole('button',{name:'Keep this scene',exact:true}).click();
  const studies=await page.evaluate(()=>fetch('/scenes/studies.json').then(r=>r.json()));
  const records=[];
  for(const study of studies) {
    await page.getByRole('combobox',{name:'Start with a scene',exact:true}).selectOption(study.id);
    await page.getByRole('combobox',{name:'Image size',exact:true}).selectOption('960');
    await page.getByRole('combobox',{name:'Samples',exact:true}).selectOption('64');
    await page.getByRole('combobox',{name:'Terrain detail',exact:true}).selectOption('512');
    await page.getByRole('button',{name:'Render image',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('render-status').textContent.startsWith('Complete.'),{},{timeout:120000});
    const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export PNG',exact:true}).click();
    const download=await pending;await download.saveAs(output+'/'+study.id+'.png');
    if(study.id==='alpine') { await page.screenshot({path:output+'/studio.png',fullPage:true}); }
    records.push({id:study.id,scene:study.scene,width:960,height:540,samples:64,detail:512});
    const sceneDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Save scene',exact:true}).click();
    const file=await sceneDownload;await file.saveAs(output+'/'+study.id+'.lithosky');
  }
  const build=await page.evaluate(()=>fetch('/api/info').then(r=>r.json()));
  const browser=await page.evaluate(()=>navigator.userAgent);
  return {records,build,browser};
}
