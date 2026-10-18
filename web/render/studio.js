// SPDX-License-Identifier: Apache-2.0
import { TerrainGenerator } from '../scene/generator.js';
import { createTracer } from './tracer.js';

// Epoch checks cover pipeline creation, GPU completion, readback and PNG encoding.
// Only a complete sample from the current scene may be shown or exported.
export function renderStudio(getState, getTitle, getField = () => null) {
  const $=id=>document.getElementById(id), canvas=$('render-image');
  let epoch=0, controller=null, snapshot=null, available=false, busy=false;
  const options=()=>({width:Number($('render-size').value),height:Number($('render-size').value)*9/16,samples:Number($('render-samples').value),detail:Number($('render-detail').value)});
  function showRender(show) {
    canvas.hidden=!show;
    $('show-preview').textContent=show?'Show preview':'Show render';
    $('view-kind').textContent=show?'RAY-TRACED STILL':'PERSPECTIVE';
    $('view-description').textContent=show?'Ray-traced still · Export PNG saves this image.':'Procedural preview · Render a still with traced shadows and calm-water reflections.';
  }
  function controls() {
    $('render-start').disabled=!available||busy;
    $('render-cancel').disabled=!busy;
    $('export-image').disabled=!snapshot||busy;
    $('render-size').disabled=busy; $('render-samples').disabled=busy; $('render-detail').disabled=busy;
    $('show-preview').disabled=!snapshot||busy;
  }
  function invalidate(message) {
    epoch++; controller?.abort(); controller=null; busy=false; snapshot=null;
    $('render-detail-status').textContent='Final terrain: up to '+$('render-detail').value+'² cells, limited by source resolution. Preview remains 128².';
    showRender(false); $('render-progress').value=0;
    $('render-status').textContent=message ?? (available?'Scene changed. Render again to update the image.':'Final rendering requires WebGPU. Select Automatic and Retry graphics; scene editing and saving remain available.'); controls();
  }
  $('render-start').addEventListener('click',async()=>{
    invalidate('Preparing the ray tracer…');
    const ticket=epoch, abort=new AbortController(); controller=abort; busy=true; controls();
    const state=structuredClone(getState()), title=getTitle(), settings=options(), start=performance.now();
    $('render-progress').max=settings.samples;
    let renderer,worker;
    try {
      let field=getField();
      if(settings.detail!==128) {
        worker=new TerrainGenerator();
        abort.signal.addEventListener('abort',()=>worker.cancel(),{once:true});
        field=await worker.generate(state,p=>{if(ticket===epoch)$('render-status').textContent='Preparing detailed terrain · '+Math.round(p*100)+'%';},'final',settings.detail);
        worker.cancel();
      }
      if(ticket!==epoch||abort.signal.aborted)return;
      const grid=field?.resolution??128;
      $('render-detail-status').textContent=grid+' × '+grid+' final cells · '+(grid*grid*2).toLocaleString()+' triangles. Preview remains 128 × 128.';
      renderer=await createTracer(state,{...settings,signal:abort.signal},field);
      if (ticket!==epoch) return;
      if (abort.signal.aborted) { $('render-status').textContent='Canceled before the first sample.'; return; }
      $('render-status').textContent='Rendering the first sample…';
      await renderer.run(abort.signal,image=>{
        if (ticket!==epoch) return;
        snapshot={...image,title}; canvas.width=image.width; canvas.height=image.height;
        canvas.getContext('2d').putImageData(new ImageData(image.rgba,image.width,image.height),0,0); showRender(true);
        $('render-progress').value=image.samples;
        $('render-status').textContent=`${image.samples} / ${settings.samples} samples · ${image.width} × ${image.height} · ${((performance.now()-start)/1000).toFixed(1)} s`;
      });
      if (ticket===epoch) $('render-status').textContent=abort.signal.aborted ? (snapshot?`Canceled at ${snapshot.samples} samples. Export PNG keeps this image.`:'Canceled before the first sample.') : 'Complete. '+$('render-status').textContent;
    } catch(error) {
      if (ticket===epoch) { if(abort.signal.aborted) $('render-status').textContent='Canceled before the first sample.'; else invalidate('Rendering failed: '+error.message+' Retry rendering or use Retry graphics.'); }
    } finally {
      worker?.cancel();renderer?.dispose();
      if (ticket===epoch) { busy=false; controller=null; controls(); }
    }
  });
  $('render-cancel').addEventListener('click',()=>{
    controller?.abort(); $('render-cancel').disabled=true;
    $('render-status').textContent=snapshot?`Stopping at ${snapshot.samples} complete samples…`:'Stopping before the first sample…';
  });
  $('show-preview').addEventListener('click',()=>{
    showRender(canvas.hidden);
  });
  $('export-image').addEventListener('click',async()=>{
    if (!snapshot || busy) return;
    const ticket=epoch, image=snapshot;
    $('export-image').disabled=true;
    try {
      const output=document.createElement('canvas'); output.width=image.width; output.height=image.height;
      output.getContext('2d').putImageData(new ImageData(image.rgba,image.width,image.height),0,0);
      const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));
      if (ticket!==epoch) return;
      if (!blob) throw new Error('PNG encoding failed.');
      const url=URL.createObjectURL(blob), anchor=document.createElement('a'); anchor.href=url;
      anchor.download=(getTitle().replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').slice(0,60)||'landscape')+`-${image.width}x${image.height}-${image.samples}spp.png`;
      anchor.click(); setTimeout(()=>URL.revokeObjectURL(url),30000);
      $('render-status').textContent='PNG download requested · '+image.samples+' samples · sRGB';
    } catch(error) { if (ticket===epoch) $('render-status').textContent=error.message; }
    finally { if (ticket===epoch) controls(); }
  });
  for (const id of ['render-size','render-samples','render-detail']) $(id).addEventListener('change',()=>invalidate('Render settings changed. Start a new render.'));
  return {
    invalidate,
    preview() { if (busy) invalidate('Render stopped for terrain editing.'); else showRender(false); },
    setAvailable(value, message) { available=value; invalidate(message ?? (value?'Ready to render a 16:9 still.':'Final rendering requires WebGPU. Select Automatic and Retry graphics; scene editing and saving remain available.')); },
  };
}
