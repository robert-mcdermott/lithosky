// SPDX-License-Identifier: Apache-2.0
// Playwright CLI run-code callback. Run against a disposable --data-dir, using
// the command in docs/rendering.md. This is not a Node unit test.
async (page) => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  page.on('console', message=>{if(['error','warning'].includes(message.type())) errors.push(message.text());});
  await page.setViewportSize({width:1440,height:1080});
  await page.reload();
  await page.waitForFunction(()=>!document.getElementById('render-start').disabled);
  if(await page.getByRole('button',{name:'Keep this scene',exact:true}).isVisible()) await page.getByRole('button',{name:'Keep this scene',exact:true}).click();
  await page.locator('#live-preview').uncheck();
  const probes=await page.evaluate(async()=>{
    const {createTracer}=await import('/render/tracer.js');
    const {createHeightfield,intersectHeightfield,displayChannel,fresnel}=await import('/render/heightfield.js');
    const {defaults,normalize}=await import('/scene/terrain.js');
    const reports=[];
    for(const seed of [1847,972,42107,4294967295]) {
      const state={...defaults,seed}, field=createHeightfield(state);
      const rays=[{origin:[0,30,0],direction:[0,-1,0]},{origin:[32,30,32],direction:[0,-1,0]},{origin:[-32,30,-32],direction:[0,-1,0]},{origin:[0,-20,0],direction:[0,1,0]},{origin:[40,30,0],direction:[0,-1,0]},{origin:[-40,2,0],direction:[1,0,0]}];
      for(let i=0;i<250;i++) rays.push({origin:[Math.sin(i*3)*40,6+i%6,Math.cos(i*7)*40],direction:normalize([Math.cos(i),-.2,Math.sin(i)])});
      const renderer=await createTracer(state,{width:640,height:360,samples:8});
      try {
        const values=await renderer.probe(rays); let worst=0,hits=0;
        for(let i=0;i<rays.length;i++) {
          const {origin,direction}=rays[i], expected=intersectHeightfield(field,origin,direction)?.t??1e6;
          const error=Math.abs(expected-values[i*4]); worst=Math.max(worst,error);
          if(error>.002) throw new Error(JSON.stringify({seed,i,expected,actual:values[i*4],error}));
          if(expected<1e6) hits++;
          if(Math.abs(values[i*4+1]-displayChannel(.18))>1e-6 || Math.abs(values[i*4+2]-fresnel(.5,1/1.333))>1e-6 || values[i*4+3]!==1) throw new Error('GPU color/energy mismatch');
        }
        reports.push({seed,rays:rays.length,hits,worst});
      } finally { renderer.dispose(); }
    }
    return reports;
  });
  const render=page.getByRole('button',{name:'Render image',exact:true});
  const cancel=page.getByRole('button',{name:'Cancel render',exact:true});
  const exportPNG=page.getByRole('button',{name:'Export PNG',exact:true});
  const samples=page.getByRole('combobox',{name:'Samples',exact:true});
  await samples.selectOption('8');
  await render.click();
  await page.waitForFunction(()=>document.getElementById('render-status').textContent.startsWith('Complete.'),{},{timeout:60000});
  const first=await page.locator('#render-status').textContent();
  const pending=page.waitForEvent('download'); await exportPNG.click(); const download=await pending;
  const stream=await download.createReadStream(), chunks=[]; for await(const chunk of stream) chunks.push(chunk);
  const png=Buffer.concat(chunks);
  check(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'PNG signature');
  check(png.readUInt32BE(16)===640 && png.readUInt32BE(20)===360,'PNG dimensions');
  await download.saveAs('/tmp/lithosky-s3-export.png');
  const matches=await page.evaluate(async(bytes)=>{
    const image=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const context=canvas.getContext('2d');context.drawImage(image,0,0);image.close();
    const decoded=context.getImageData(0,0,canvas.width,canvas.height).data;
    const source=document.getElementById('render-image').getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    return decoded.length===source.length && decoded.every((v,i)=>v===source[i]);
  },Array.from(png));
  check(matches,'PNG pixels differ from the displayed sRGB result');
  await page.getByRole('button',{name:'Show preview',exact:true}).click();
  check(await page.locator('#render-image').isHidden(),'Preview toggle');
  await page.getByRole('button',{name:'Show render',exact:true}).click();
  // An edit during asynchronous PNG encoding must suppress the stale download.
  let staleDownloads=0; const recordDownload=()=>staleDownloads++;
  page.on('download',recordDownload);
  await page.evaluate(()=>{
    const original=HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob=function(callback,...args){return original.call(this,blob=>setTimeout(()=>callback(blob),200),...args);};
    window.restorePNG=()=>{HTMLCanvasElement.prototype.toBlob=original;};
  });
  await exportPNG.click();
  await page.getByRole('spinbutton',{name:'Terrain seed',exact:true}).fill('7002');
  await page.getByRole('spinbutton',{name:'Terrain seed',exact:true}).press('Tab');
  await page.waitForTimeout(250);
  check(staleDownloads===0,'Stale PNG downloaded after scene edit');
  page.off('download',recordDownload); await page.evaluate(()=>window.restorePNG());
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.waitForFunction(()=>!document.getElementById('render-start').disabled);
  // Cancel while adapter creation is unresolved, then reject initialization.
  await page.evaluate(()=>{
    const original=navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter=async(...args)=>{await new Promise(resolve=>setTimeout(resolve,200));return original(...args);};
    window.restoreAdapter=()=>{navigator.gpu.requestAdapter=original;};
    document.getElementById('render-start').click();document.getElementById('render-cancel').click();
  });
  await page.waitForFunction(()=>document.getElementById('render-status').textContent==='Canceled before the first sample.');
  check(await exportPNG.isDisabled(),'Empty canceled render cannot export');
  await page.evaluate(()=>{
    window.restoreAdapter(); const original=GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice=async()=>{throw new Error('Injected render initialization failure');};
    window.restoreFailedDevice=()=>{GPUAdapter.prototype.requestDevice=original;};
  });
  await render.click();
  await page.waitForFunction(()=>document.getElementById('render-status').textContent.includes('Injected render initialization failure'));
  await page.evaluate(()=>window.restoreFailedDevice());
  await samples.selectOption('64');
  await render.click();
  await page.waitForFunction(()=>document.getElementById('render-progress').value>=1);
  await cancel.click();
  await page.waitForFunction(()=>!document.getElementById('render-start').disabled);
  check((await page.locator('#render-status').textContent()).startsWith('Canceled at'),'Cancel preserves complete sample');
  check(await exportPNG.isEnabled(),'Canceled image is exportable');
  const before=await page.locator('#render-progress').getAttribute('value');
  await page.waitForTimeout(100);
  check(await page.locator('#render-progress').getAttribute('value')===before,'No samples after cancellation');
  await render.click();
  await page.waitForFunction(()=>document.getElementById('render-progress').value>=1);
  await page.getByRole('spinbutton',{name:'Terrain seed',exact:true}).fill('7001');
  await page.getByRole('spinbutton',{name:'Terrain seed',exact:true}).press('Tab');
  await page.waitForTimeout(100);
  check(await page.locator('#render-image').isHidden() && await exportPNG.isDisabled(),'Edits invalidate old render');
  check(await page.locator('#render-progress').getAttribute('value')==='0','Accumulation resets');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await samples.selectOption('8');
  await page.getByRole('combobox',{name:'Image size',exact:true}).selectOption('960');
  await page.getByRole('combobox',{name:'Color palette',exact:true}).selectOption('otherworld');
  await page.getByRole('checkbox',{name:'Show water',exact:true}).uncheck();
  await render.click();
  await page.waitForFunction(()=>document.getElementById('render-status').textContent.startsWith('Complete.'),{},{timeout:60000});
  check(await page.locator('#render-image').getAttribute('width')==='960','Larger render dimensions');
  const second=await page.locator('#render-status').textContent();
  // Force render-device loss only; preview has its own device and must survive.
  await page.evaluate(()=>{
    const original=GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice=async function(...args){const d=await original.apply(this,args);window.renderTestDevice=d;return d;};
    window.restoreDeviceRequest=()=>{GPUAdapter.prototype.requestDevice=original;};
  });
  await samples.selectOption('64'); await render.click();
  await page.waitForFunction(()=>document.getElementById('render-progress').value>=1);
  await page.evaluate(()=>window.renderTestDevice.destroy());
  await page.waitForFunction(()=>document.getElementById('render-status').textContent.startsWith('Rendering failed:'));
  check(await page.getByRole('spinbutton',{name:'Terrain seed',exact:true}).inputValue()==='1847','Device loss preserves scene');
  check(await exportPNG.isDisabled(),'Failed render cannot export');
  await page.evaluate(()=>window.restoreDeviceRequest());
  await samples.selectOption('8'); await render.click();
  await page.waitForFunction(()=>document.getElementById('render-status').textContent.startsWith('Complete.'),{},{timeout:60000});
  await page.getByText('Graphics & compatibility',{exact:true}).click();
  await page.getByRole('combobox',{name:'Preview backend',exact:true}).selectOption('webgl2');
  await page.waitForFunction(()=>document.getElementById('backend').textContent==='WebGL 2');
  check(await render.isDisabled() && await exportPNG.isDisabled(),'WebGL fallback explains unavailable final rendering');
  await page.getByRole('combobox',{name:'Preview backend',exact:true}).selectOption('auto');
  await page.waitForFunction(()=>!document.getElementById('render-start').disabled);
  await page.setViewportSize({width:390,height:844});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile horizontal overflow');
  await page.screenshot({path:'/tmp/lithosky-s3-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1080});
  const waterChecks=await page.evaluate(async()=>{
    const {createTracer}=await import('/render/tracer.js'); const {defaults}=await import('/scene/terrain.js');
    const settings={width:640,height:360,samples:8}, reports=[]; let dry;
    for(const variant of [
      {waterEnabled:false,elevation:.4},
      {waterEnabled:true,elevation:.4,waterLevel:2},
      {waterEnabled:true,elevation:1.7,waterLevel:5,pitch:.08,distance:10,palette:'otherworld',sun:5},
      {waterEnabled:true,elevation:.4,waterLevel:-3,pitch:1.2,distance:48,sun:85},
    ]) {
      const renderer=await createTracer({...defaults,...variant},settings), abort=new AbortController(); let image;
      try { await renderer.run(abort.signal,sample=>{image=sample;abort.abort();}); }
      finally { renderer.dispose(); }
      if(!image || image.rgba.every((v,i)=>i%4===3||v===0)) throw new Error('Missing finite render for water fixture');
      if(!dry) dry=image.rgba;
      const differences=image.rgba.reduce((n,v,i)=>n+Number(v!==dry[i]),0);
      if(variant.waterLevel===2 && differences<1000) throw new Error('Water reflection/refraction did not change pixels');
      reports.push({...variant,differences});
    }
    return reports;
  });
  const hardware=await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter();return {vendor:a.info.vendor,architecture:a.info.architecture,device:a.info.device,description:a.info.description,browser:navigator.userAgent};});
  check(errors.length===0,'Unexpected browser errors: '+errors.join('; '));
  return {probes,waterChecks,first,second,export:download.suggestedFilename(),hardware,errors};
}
