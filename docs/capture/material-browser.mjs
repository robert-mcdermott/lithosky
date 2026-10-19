// SPDX-License-Identifier: Apache-2.0
async page=>{
 const output=__OUTPUT__,scene=__SCENE__,check=(v,m)=>{if(!v)throw Error(m);},errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:1080});await page.reload();
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#render-start').disabled,{},{timeout:60000});await ready();
 if(await page.getByRole('button',{name:'Keep this scene',exact:true}).isVisible())await page.getByRole('button',{name:'Keep this scene',exact:true}).click();
 const open=async s=>{await page.locator('#scene-file').setInputFiles({name:'material-study.lithosky',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});await page.waitForFunction(()=>document.querySelector('#file-status').textContent.startsWith('Opened material-study.lithosky'));await ready();};
 const exportImage=async name=>{const pending=page.waitForEvent('download');await page.locator('#export-image').click();await(await pending).saveAs(output+'/'+name+'.png');};
 const crop=async(name,rectangle)=>{
  const pending=page.waitForEvent('download');await page.evaluate(async({name,r})=>{
   const source=document.querySelector('#render-image'),canvas=document.createElement('canvas');canvas.width=r.width;canvas.height=r.height;
   canvas.getContext('2d').putImageData(source.getContext('2d').getImageData(r.x,r.y,r.width,r.height),0,0);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  },{name,r:rectangle});await(await pending).saveAs(output+'/'+name+'.png');
 };
 const canonical=v=>JSON.stringify(v,(key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
 const records=[],regions=[{name:'foreground',x:320,y:350,width:256,height:128},{name:'middle',x:410,y:190,width:256,height:128},{name:'horizon',x:150,y:28,width:256,height:128}];
 const simple=structuredClone(scene);delete simple.surface.geology;simple.version=6;
 for(const [name,s] of [['material-simple',simple],['material-geology',scene],...['rock','ground','snow'].map(preset=>{const s=structuredClone(scene);s.camera={yaw:-.7,pitch:.75,distance:10};s.water.enabled=false;s.surface.preset=preset;s.atmosphere.sunElevation=60;return ['material-'+preset,s];})]) {
  await open(s);await page.locator('#render-size').selectOption('960');await page.locator('#render-detail').selectOption('1024');await page.locator('#render-samples').selectOption('32');
  const start=Date.now();await page.locator('#render-start').click();await page.waitForFunction(()=>document.querySelector('#render-status').textContent.startsWith('Complete.'),{},{timeout:120000});
  const milliseconds=Date.now()-start;await exportImage(name);
  records.push({name,scene:s,width:960,height:540,detail:1024,samples:32,milliseconds});
  if(name==='material-simple'||name==='material-geology')for(const region of regions){const cropped=name+'-'+region.name;await crop(cropped,region);records.push({name:cropped,parent:name,crop:region,width:region.width,height:region.height});}
  const pending=page.waitForEvent('download');await page.locator('#save-scene').click();const file=await pending,chunks=[];for await(const c of await file.createReadStream())chunks.push(c);
  check(canonical(JSON.parse(Buffer.concat(chunks)))===canonical(s),'Scene changed during material capture: '+name);
 }
 check(errors.length===0,errors.join('; '));
 return {records,regions,errors,browser:await page.evaluate(()=>navigator.userAgent),hardware:await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter();return {vendor:a.info.vendor,architecture:a.info.architecture,description:a.info.description};})};
}
