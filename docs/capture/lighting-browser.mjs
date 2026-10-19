// SPDX-License-Identifier: Apache-2.0
async page=>{
 const output=__OUTPUT__,scene=__SCENE__,check=(v,m)=>{if(!v)throw Error(m);},errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:1080});await page.reload();
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#render-start').disabled,{},{timeout:60000});await ready();
 if(await page.getByRole('button',{name:'Keep this scene',exact:true}).isVisible())await page.getByRole('button',{name:'Keep this scene',exact:true}).click();
 const canonical=v=>JSON.stringify(v,(key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
 const classic=structuredClone(scene);delete classic.lighting.transport;classic.version=7;
 const direct=structuredClone(scene);direct.lighting.transport.bounces=1;
 const bright=structuredClone(scene);bright.lighting.transport.exposure+=1;
 const area=structuredClone(scene);area.lighting.transport.lights=[{name:'Warm valley fill',enabled:true,x:-8,y:14,z:4,yaw:0,pitch:-90,width:14,height:12,intensity:.2,red:1,green:.85,blue:.65}];
 const records=[];
 for(const [name,s] of [['lighting-classic',classic],['lighting-direct',direct],['lighting-studio',scene],['lighting-exposure',bright],['lighting-area',area]]) {
  await page.locator('#scene-file').setInputFiles({name:'lighting-study.lithosky',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});await page.waitForFunction(()=>document.querySelector('#file-status').textContent.startsWith('Opened lighting-study.lithosky'));await ready();
  await page.locator('#render-size').selectOption('960');await page.locator('#render-detail').selectOption('1024');await page.locator('#render-samples').selectOption('64');
  const start=Date.now();await page.locator('#render-start').click();await page.waitForFunction(()=>document.querySelector('#render-status').textContent.startsWith('Complete.'),{},{timeout:180000});const milliseconds=Date.now()-start;
  const statistics=await page.evaluate(()=>{const c=document.querySelector('#render-image'),data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let black=0,white=0;const histogram=new Array(256).fill(0);for(let i=0;i<data.length;i+=4){const rgb=[data[i],data[i+1],data[i+2]];if(rgb.every(x=>x===0))black++;if(rgb.every(x=>x===255))white++;histogram[Math.round(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)]++;}const quantile=q=>{let n=0;for(let i=0;i<256;i++){n+=histogram[i];if(n>=c.width*c.height*q)return i;}return 255;};return {blackPixels:black,whitePixels:white,p01:quantile(.01),p50:quantile(.5),p99:quantile(.99)};});
  check(statistics.blackPixels===0&&statistics.whitePixels===0,'Clipped or crushed benchmark: '+name);
  const pending=page.waitForEvent('download');await page.locator('#export-image').click();await(await pending).saveAs(output+'/'+name+'.png');
  const saved=page.waitForEvent('download');await page.locator('#save-scene').click();const chunks=[];for await(const c of await(await saved).createReadStream())chunks.push(c);check(canonical(JSON.parse(Buffer.concat(chunks)))===canonical(s),'Scene changed during capture');
  records.push({name,scene:s,width:960,height:540,detail:1024,samples:64,milliseconds,statistics});
 }
 check(errors.length===0,errors.join('; '));return {records,errors,browser:await page.evaluate(()=>navigator.userAgent),hardware:await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter();return {vendor:a.info.vendor,architecture:a.info.architecture,description:a.info.description};})};
}
