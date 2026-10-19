// SPDX-License-Identifier: Apache-2.0
import {createTracer} from './tracer.js';
// A disposable 320 × 180 lighting study, using the exact final kernels. Camera
// gestures retain immediate raster feedback; idle work never queues a full frame.
export function lightingPreview(getState,getField,onShow) {
 const canvas=document.getElementById('lighting-image'),toggle=document.getElementById('live-preview');
 let epoch=0,timer=null,controller=null,available=false,blocked=false;
 function cancel(){epoch++;clearTimeout(timer);controller?.abort();controller=null;canvas.hidden=true;}
 function schedule(){cancel();if(!available||blocked||!toggle.checked)return;
  const ticket=epoch;timer=setTimeout(async()=>{
   const abort=new AbortController();controller=abort;let tracer;
   try{
    tracer=await createTracer(structuredClone(getState()),{width:320,height:180,samples:16,preview:true,signal:abort.signal},getField());
    if(ticket!==epoch||abort.signal.aborted)return;
    await tracer.run(abort.signal,image=>{if(ticket!==epoch||abort.signal.aborted)return;canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').putImageData(new ImageData(image.rgba,image.width,image.height),0,0);canvas.hidden=false;onShow();});
   }catch(error){if(ticket===epoch&&!abort.signal.aborted){canvas.hidden=true;document.getElementById('view-description').textContent='Raster preview · Lighting preview unavailable: '+error.message;}}
   finally{tracer?.dispose();if(ticket===epoch)controller=null;}
  },450);
 }
 toggle.addEventListener('change',()=>{schedule();if(document.getElementById('render-image').hidden){document.getElementById('view-kind').textContent='PERSPECTIVE';document.getElementById('view-description').textContent='Raster preview · Render a still to inspect lighting and water.';}});
 return {schedule,cancel,setAvailable(value){if(available===value)return;available=value;schedule();},block(value){blocked=value;if(value)cancel();else schedule();}};
}
