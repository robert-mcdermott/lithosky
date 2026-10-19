// SPDX-License-Identifier: Apache-2.0
async page=>{
 const output=__OUTPUT__,errors=[];page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:1080});await page.reload();
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#render-start').disabled,{},{timeout:60000});await ready();await page.locator('#live-preview').uncheck();if(await page.locator('#start-fresh').isVisible())await page.locator('#start-fresh').click();
 const studies=await page.evaluate(()=>fetch('/scenes/compositions.json').then(r=>r.json())),records=[];
 const exportPNG=async name=>{const pending=page.waitForEvent('download');await page.locator('#export-image').click();await(await pending).saveAs(output+'/'+name+'.png');};
 for(const study of studies){
  await page.locator('#study-select').selectOption(study.id);await ready();await page.locator('#render-size').selectOption('2048');await page.locator('#render-detail').selectOption('1024');await page.locator('#render-samples').selectOption('64');const start=Date.now();await page.locator('#render-start').click();await page.waitForFunction(()=>document.querySelector('#render-status').textContent.startsWith('Complete.')||document.querySelector('#render-status').textContent.startsWith('Rendering failed:'),{},{timeout:240000});
  const status=await page.locator('#render-status').textContent();if(!status.startsWith('Complete.'))throw Error(status);const milliseconds=Date.now()-start,name=study.id+'-composition';await exportPNG(name);
  const dimensions=await page.locator('#render-image').evaluate(e=>({width:e.width,height:e.height}));records.push({name,id:study.id,scene:study.scene,...dimensions,samples:64,detail:1024,milliseconds,imageBuffersBytes:dimensions.width*dimensions.height*24});
  for(const [label,u,v]of [['foreground',.5,.8],['middle',.5,.5],['horizon',.5,.2]]){
   const r={x:Math.floor(dimensions.width*u-128),y:Math.floor(dimensions.height*v-64),width:256,height:128},cropName=name+'-'+label,pending=page.waitForEvent('download');
   await page.evaluate(async({name,r})=>{const source=document.querySelector('#render-image'),canvas=document.createElement('canvas');canvas.width=r.width;canvas.height=r.height;canvas.getContext('2d').putImageData(source.getContext('2d').getImageData(r.x,r.y,r.width,r.height),0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);},{name:cropName,r});await(await pending).saveAs(output+'/'+cropName+'.png');records.push({name:cropName,parent:name,crop:r,width:r.width,height:r.height});
  }
 }
 // Deliberately small physical scale makes ideal thin-lens blur inspectable.
 const optical=structuredClone(studies[1].scene);optical.title='Thin lens study';Object.assign(optical.camera.lens,{frame:'3:2',focalLength:50,fNumber:1,metresPerUnit:.1,focusDistance:1.5,dof:false});
 for(const dof of [false,true]){optical.camera.lens.dof=dof;const filename='lens-'+dof+'.lithosky';await page.locator('#scene-file').setInputFiles({name:filename,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(optical))});await page.waitForFunction(name=>document.querySelector('#file-status').textContent.startsWith('Opened '+name),filename);await ready();await page.locator('#render-size').selectOption('640');await page.locator('#render-samples').selectOption('128');await page.locator('#render-start').click();await page.waitForFunction(()=>document.querySelector('#render-status').textContent.startsWith('Complete.'),{},{timeout:120000});const name='camera-'+(dof?'lens':'pinhole');await exportPNG(name);records.push({name,scene:structuredClone(optical),width:640,height:427,samples:128,detail:1024});}
 if(errors.length)throw Error(errors.join('; '));return {records,errors};
}
