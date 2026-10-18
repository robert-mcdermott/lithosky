// SPDX-License-Identifier: Apache-2.0
// Playwright CLI callback against an isolated app instance.
async (page) => {
  const check=(ok,message)=>{if(!ok)throw new Error(message);},errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:1080});await page.reload();
  const ready=()=>page.waitForFunction(()=>!document.getElementById('render-start').disabled,{},{timeout:60000});
  await ready();
  if(await page.getByRole('button',{name:'Keep this scene',exact:true}).isVisible())await page.getByRole('button',{name:'Keep this scene',exact:true}).click();
  await page.getByRole('combobox',{name:'Start with a scene',exact:true}).selectOption('alpine');await ready();
  await page.evaluate(async()=>{
    const {TerrainGenerator}=await import('/scene/generator.js'),generate=TerrainGenerator.prototype.generate;
    window.materialJobs=[];
    TerrainGenerator.prototype.generate=async function(...args){const r=await generate.apply(this,args);window.materialJobs.push({heights:r.heightsChanged,surface:r.surfaceChanged,noise:r.noiseChanged});return r;};
  });
  await page.getByRole('button',{name:'Customize surface',exact:true}).click();await ready();
  check(await page.evaluate(()=>{const r=window.materialJobs.at(-1);return r.surface&&!r.heights&&!r.noise;}),'Material changed heights');
  const number=async(name,value)=>{const input=page.getByRole('spinbutton',{name,exact:true});await input.fill(value);await input.press('Tab');await ready();};
  await number('Snow height','3.2');await number('Rock slope (degrees)','55');await number('Color detail','0.7');
  await page.getByRole('button',{name:'Undo',exact:true}).click();await ready();check(await page.locator('#material-detail').inputValue()==='0.25','Detail undo');
  await page.getByRole('button',{name:'Redo',exact:true}).click();await ready();
  for(const preset of ['rock','snow','sand','ground','rules']){await page.getByRole('combobox',{name:'Surface preset',exact:true}).selectOption(preset);await ready();}
  await number('Transition softness','0');check(await page.locator('#material-blend').inputValue()==='0.6','Invalid blend changed scene');
  // Materials remain intact when converting the original terrain to layers and sculpting.
  await page.getByRole('button',{name:'Build with layers',exact:true}).click();await ready();
  await page.getByRole('combobox',{name:'Interaction tool',exact:true}).selectOption('raise');
  await page.getByRole('button',{name:'Apply brush',exact:true}).click();await ready();
  await page.getByRole('combobox',{name:'Interaction tool',exact:true}).selectOption('orbit');
  await page.getByRole('checkbox',{name:'Show water',exact:true}).uncheck();await ready();
  let pending=page.waitForEvent('download');await page.getByRole('button',{name:'Save scene',exact:true}).click();const file=await pending;
  const stream=await file.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const bytes=Buffer.concat(chunks),scene=JSON.parse(bytes);
  check(scene.version===4&&scene.surface.detail===.7&&scene.terrain.sculpt.length===1,'V4 sculpt/material save');
  await page.getByRole('combobox',{name:'Start with a scene',exact:true}).selectOption('alpine');await ready();
  check(await page.getByRole('button',{name:'Customize surface',exact:true}).isVisible(),'Legacy appearance did not return');
  await page.locator('#scene-file').setInputFiles({name:'surface.lithosky',mimeType:'application/json',buffer:bytes});await page.waitForFunction(()=>document.getElementById('file-status').textContent.startsWith('Opened surface.lithosky'));await ready();
  check(await page.locator('#material-snowHeight').inputValue()==='3.2','Material reopen');
  await page.waitForFunction(()=>document.getElementById('autosave-status').textContent==='Recovery saved on this device');
  await page.reload();await ready();await page.getByRole('button',{name:'Restore scene',exact:true}).click();await page.waitForFunction(()=>document.getElementById('file-status').textContent.startsWith('Recovery restored.'));await ready();
  check(await page.locator('#material-detail').inputValue()==='0.7','Material recovery');
  check(!(await page.locator('#sculpt-status').textContent()).includes('Build with layers'),'Restored layered terrain shows legacy sculpt hint');
  await page.getByRole('combobox',{name:'Samples',exact:true}).selectOption('8');await page.getByRole('button',{name:'Render image',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('render-status').textContent.startsWith('Complete.'),{},{timeout:60000});
  pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export PNG',exact:true}).click();await (await pending).saveAs('/Users/rmcdermo/mycode/lithosky/output/playwright/w2-materials.png');
  await page.locator('#material-preset').scrollIntoViewIfNeeded();await page.screenshot({path:'/Users/rmcdermo/mycode/lithosky/output/playwright/w2-material-studio.png',fullPage:true});
  // Compare the actual compute shader's two traversals on the same fields/rays.
  const diagnostics=await page.evaluate(async scene=>{
    const {createTracer}=await import('/render/tracer.js'),{TerrainCache}=await import('/scene/generation.js');
    const {defaults,normalize}=await import('/scene/terrain.js'),{renderState}=await import('/scene/document.js');
    const {cameraRay}=await import('/scene/sculpt-view.js');
    const {createHeightfield,buildHierarchy,intersectHeightfield,intersectLinear}=await import('/render/heightfield.js');
    const check=(ok,m)=>{if(!ok)throw new Error(m);},reports=[];
    const layered=renderState(scene),cache=new TerrainCache(),generated=await cache.build(layered,{yieldControl:async()=>{}});
    const peak=createHeightfield(defaults);for(let i=1;i<peak.vertices.length;i+=12)peak.vertices[i]=0;
    peak.vertices[(64*129+64)*12+1]=10;peak.low=0;peak.high=10;peak.hierarchy=buildHierarchy(peak);
    for(const [name,state,field] of [['original',defaults,createHeightfield(defaults)],['sculpted materials',layered,generated.field],['single-cell peak',defaults,peak]]) {
      const rays=[];
      for(let i=0;i<512;i++)rays.push({origin:[Math.sin(i*13.17)*40,i%17-4,Math.cos(i*7.97)*40],direction:normalize([Math.sin(i),Math.cos(i*3)*.2,Math.cos(i)])});
      for(const pitch of [.08,.3,1.2])for(let i=0;i<64;i++)rays.push(cameraRay({...state,pitch},16/9,i/63,.35+i%3*.1));
      for(const x of [-32,-28,0,28,32])for(const z of [-32,-28,0,28,32])rays.push({origin:[x,30,z],direction:[0,-1,0]});
      for(const y of [.001,5,9.999,10,10.001])rays.push({origin:[-40,y,0],direction:[1,0,0]});
      const report={name,rays:rays.length,hierarchyBytes:field.hierarchy.byteLength,vertexBytes:field.vertices.byteLength},images={};
      let cpuCells=0,hierarchyCells=0,worst=0;
      for(const ray of rays){const a={},b={};intersectLinear(field,ray.origin,ray.direction,1e6,null,a);intersectHeightfield(field,ray.origin,ray.direction,1e6,b);cpuCells+=a.cells??0;hierarchyCells+=b.cells??0;}
      report.linearCellTests=cpuCells;report.hierarchyCellTests=hierarchyCells;
      const tracers={},times={hierarchical:[],linear:[]};
      try {
        for(const traversal of ['hierarchical','linear']) {
          const tracer=await createTracer(state,{width:640,height:360,samples:8,traversal},field);tracers[traversal]=tracer;
          const gpu=await tracer.probe(rays);
          rays.forEach((r,i)=>{const cpu=intersectHeightfield(field,r.origin,r.direction)?.t??1e6;const error=Math.abs(cpu-gpu[i*4]);check(error<.003,name+' '+traversal+' ray '+i+' CPU '+cpu+' GPU '+gpu[i*4]);worst=Math.max(worst,error);});
        }
        // Warm both routes once, then alternate order across three timed pairs.
        for(let run=0;run<4;run++)for(const traversal of run%2?['linear','hierarchical']:['hierarchical','linear']) {
          const start=performance.now();await tracers[traversal].run(new AbortController().signal,sample=>{images[traversal]=sample.rgba;});
          if(run)times[traversal].push(performance.now()-start);
        }
        for(const traversal of ['hierarchical','linear'])report[traversal+'Ms']=times[traversal].sort((a,b)=>a-b)[1];
      } finally {for(const tracer of Object.values(tracers))tracer.dispose();}
      let pixelDifference=0;for(let i=0;i<images.linear.length;i++)pixelDifference=Math.max(pixelDifference,Math.abs(images.linear[i]-images.hierarchical[i]));
      report.maxPixelDifference=pixelDifference;report.worstHitError=worst;check(pixelDifference<=1,'Traversal image mismatch '+name+': '+pixelDifference);reports.push(report);
    }
    return reports;
  },scene);
  await page.getByRole('button',{name:'Show preview',exact:true}).click();
  await number('Sand height','0.4');check(await page.getByRole('button',{name:'Export PNG',exact:true}).isDisabled(),'Material edit retained stale render');
  await page.getByText('Graphics & compatibility',{exact:true}).click();await page.getByRole('combobox',{name:'Preview backend',exact:true}).selectOption('webgl2');
  await page.waitForFunction(()=>document.getElementById('backend').textContent==='WebGL 2');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('combobox',{name:'Surface preset',exact:true}).selectOption('sand');
  await page.waitForFunction(()=>document.getElementById('cancel-terrain').disabled);
  check(await page.getByRole('button',{name:'Render image',exact:true}).isDisabled(),'WebGL enabled final rendering');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow');
  await page.screenshot({path:'/Users/rmcdermo/mycode/lithosky/output/playwright/w2-material-mobile.png',fullPage:true});
  check(errors.length===0,errors.join('; '));return {diagnostics,persistence:true,mobileWebGL:true,errors};
}
