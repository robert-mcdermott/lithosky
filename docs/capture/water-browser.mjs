// SPDX-License-Identifier: Apache-2.0
async page=>{
 const output=__OUTPUT__,scene=__SCENE__,errors=[];page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:1080});await page.reload();
 const ready=()=>page.waitForFunction(()=>!document.getElementById('render-start').disabled,{},{timeout:60000});await ready();if(await page.locator('#start-fresh').isVisible())await page.locator('#start-fresh').click();await page.locator('#live-preview').uncheck();
 const classic=structuredClone(scene);delete classic.water.optics;classic.version=8;const calm=structuredClone(scene);calm.water.optics.ripples=0;const clear=structuredClone(scene);clear.water.optics.density=.1;const grazing=structuredClone(scene);grazing.camera.pitch=.12;grazing.camera.distance=19;
 const records=[];
 for(const [name,s,samples] of [['water-classic',classic,64],['water-calm',calm,64],['water-ripples',scene,64],['water-clear',clear,64],['water-grazing',grazing,64],['water-clean',scene,256]]) {
  await page.locator('#scene-file').setInputFiles({name:'water-study.lithosky',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});await page.waitForFunction(()=>document.getElementById('file-status').textContent.startsWith('Opened water-study.lithosky'));await ready();
  await page.locator('#render-size').selectOption('960');await page.locator('#render-detail').selectOption('1024');await page.locator('#render-samples').selectOption(String(samples));const start=Date.now();await page.locator('#render-start').click();
  await page.waitForFunction(()=>document.getElementById('render-status').textContent.startsWith('Complete.')||document.getElementById('render-status').textContent.startsWith('Rendering failed:'),{},{timeout:180000});const status=await page.locator('#render-status').textContent();if(!status.startsWith('Complete.'))throw Error(status);
  const milliseconds=Date.now()-start,statistics=await page.evaluate(()=>{const c=document.getElementById('render-image'),a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let black=0,white=0;for(let i=0;i<a.length;i+=4){if(a[i]===0&&a[i+1]===0&&a[i+2]===0)black++;if(a[i]===255&&a[i+1]===255&&a[i+2]===255)white++;}return {blackPixels:black,whitePixels:white};});
  const pending=page.waitForEvent('download');await page.locator('#export-image').click();await(await pending).saveAs(output+'/'+name+'.png');records.push({name,scene:s,width:960,height:540,detail:1024,samples,milliseconds,statistics});
 }
 if(errors.length)throw Error(errors.join('; '));return {records,errors,browser:await page.evaluate(()=>navigator.userAgent),hardware:await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter();return {vendor:a.info.vendor,architecture:a.info.architecture,description:a.info.description};})};
}
