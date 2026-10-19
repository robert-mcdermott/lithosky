// SPDX-License-Identifier: Apache-2.0
import {FRAMES,LONG_EDGES,lensUniforms,pixelRegion} from '../camera/model.js';
import {waterUniforms} from '../water/model.js';
import {transportUniforms,lightUniforms} from '../lighting/model.js';
import { materialUniforms } from '../material/geology.js';
import { buildAtmosphere } from '../atmosphere/model.js';
import { sunDirection } from '../atmosphere/solar.js';
import { buildHierarchy, createHeightfield, fieldGrid, finalBudget } from './heightfield.js';
import { frameUniforms } from '../scene/terrain.js';
export const TILE_WIDTH = 64, TILE_HEIGHT = 32;
export function validateRenderOptions({width,height,samples,preview=false,region}) {
 const valid=Object.keys(FRAMES).some(frame=>(preview?[320]:LONG_EDGES).some(size=>{const a=FRAMES[frame],w=a>=1?size:Math.round(size*a),h=a>=1?Math.round(size/a):size;return width===w&&height===h;}));
 if(!valid||![8,16,32,64,128,256].includes(samples))throw Error('Choose a supported image size and sample count.');
 return {width,height,samples,region:pixelRegion(width,height,region)};
}
export function renderTiles(width, height) {
  const tiles=[];
  for (let y=0;y<height;y+=TILE_HEIGHT) for (let x=0;x<width;x+=TILE_WIDTH) tiles.push([x,y,Math.min(TILE_WIDTH,width-x),Math.min(TILE_HEIGHT,height-y)]);
  return tiles;
}
export async function createTracer(state, options, preparedField = null) {
  const settings=validateRenderOptions(options),{samples}=settings,fullWidth=settings.width,fullHeight=settings.height,{width,height}=settings.region;
  if (['layers-v1','heightmap-v1'].includes(state.generator) && !preparedField) throw new Error('Generate the terrain before rendering.');
  const field=preparedField ?? createHeightfield(state),grid=fieldGrid(field),budget=finalBudget(grid);
  if(field.vertices.byteLength!==budget.verticesBytes||!Number.isFinite(field.low)||!Number.isFinite(field.high)||field.low>field.high)throw new Error('Invalid final terrain field.');
  const constants={useHierarchy:options.traversal==='linear'?0:1,grid};
  if (!navigator.gpu) throw new Error('Final rendering requires WebGPU. The scene can still be edited and saved.');
  const adapter=await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No WebGPU adapter is available for final rendering.');
  const device=await adapter.requestDevice();
  const buffers=[];
  let disposed=false, failure=null, running=false;
  device.lost.then(info=>{ if (!disposed) failure=new Error('Render device lost: '+(info.message||info.reason)); });
  const onError=event=>{ failure=new Error(event.error.message); };
  device.addEventListener('uncapturederror',onError);
  const check=()=>{ if (disposed) throw new Error('Renderer is closed.'); if (failure) throw failure; };
  const buffer=(size,usage)=>{ const b=device.createBuffer({size,usage}); buffers.push(b); return b; };
  const dispose=()=>{ disposed=true; device.removeEventListener('uncapturederror',onError); for (const b of buffers) b.destroy(); device.destroy(); };
  try {
    const response=await fetch(new URL('./trace.wgsl',import.meta.url));
    if (!response.ok) throw new Error('Cannot load the embedded render shader.');
    const atmosphereSource=await fetch(new URL('../atmosphere/atmosphere.wgsl',import.meta.url));
    if(!atmosphereSource.ok)throw new Error('Cannot load atmosphere shader.');
    const materialSource=await fetch(new URL('../material/geology.wgsl',import.meta.url));
    if(!materialSource.ok)throw new Error('Cannot load geological material shader.');
    const lightingSource=await fetch(new URL('../lighting/transport.wgsl',import.meta.url));
    if(!lightingSource.ok)throw new Error('Cannot load light transport shader.');
    const waterSource=await fetch(new URL('../water/water.wgsl',import.meta.url));
    if(!waterSource.ok)throw new Error('Cannot load water shader.');
    const cameraSource=await fetch(new URL('../camera/camera.wgsl',import.meta.url));if(!cameraSource.ok)throw Error('Cannot load camera shader.');
    const module=device.createShaderModule({code:await response.text()+'\n'+await atmosphereSource.text()+'\n'+await materialSource.text()+'\n'+await lightingSource.text()+'\n'+await waterSource.text()+'\n'+await cameraSource.text()});
    const compilation=await module.getCompilationInfo();
    const errors=compilation.messages.filter(m=>m.type==='error');
    if (errors.length) throw new Error(errors.map(m=>m.message).join('; '));
    const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'render',constants}});
    const imageBytes=width*height*4;
    if (width*height*16>device.limits.maxStorageBufferBindingSize) throw new Error('This GPU cannot hold the selected image. Choose a smaller size.');
    if (budget.verticesBytes>Math.min(device.limits.maxStorageBufferBindingSize,device.limits.maxBufferSize)) throw new Error('This GPU cannot hold the selected terrain detail. Choose a lower detail tier.');
    device.pushErrorScope('validation');
    const uniform=buffer(352,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
    const vertices=buffer(field.vertices.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
    const bounds=field.hierarchy??buildHierarchy(field);
    if(bounds.byteLength!==budget.hierarchyBytes)throw new Error('Invalid final terrain hierarchy.');
    const hierarchy=buffer(bounds.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
    device.queue.writeBuffer(hierarchy,0,bounds);
    const accumulation=buffer(width*height*16,GPUBufferUsage.STORAGE);
    const pixels=buffer(imageBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC);
    const invalid=buffer(4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC);
    const readback=buffer(imageBytes+4,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
    device.queue.writeBuffer(vertices,0,field.vertices);
    const config=new ArrayBuffer(352), floats=new Float32Array(config), uints=new Uint32Array(config);
    floats.set(frameUniforms(state,fullWidth/fullHeight));
    floats.set(waterUniforms(state.waterOptics),72);
    floats.set(lensUniforms(state),80);uints.set([settings.region.x,settings.region.y,fullWidth,fullHeight],84);
    floats.set(materialUniforms(state),44);
    floats.set(transportUniforms(state.transport),60);
    const lightData=lightUniforms(state.transport),lights=buffer(lightData.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
    device.queue.writeBuffer(lights,0,lightData);
    floats.set([field.low,field.high,Number(state.waterEnabled),state.waterLevel],24);
    uints.set([width,height,0,state.seed],28);
    const atmosphere=state.atmosphere?await buildAtmosphere(state.atmosphere,floats[1],sunDirection(state.atmosphere),{signal:options.signal}):{data:new Float32Array(4)};
    if(state.atmosphere){const a=state.atmosphere;floats.set([1,a.altitude/1000,a.metresPerUnit/1000,a.aerosols,a.ozone,atmosphere.height,0,0],36);}
    floats[43]=state.terrainVisible===false?1:0;
    const skyBuffer=buffer(atmosphere.data.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
    device.queue.writeBuffer(skyBuffer,0,atmosphere.data);
    device.queue.writeBuffer(uniform,0,config);
    const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[[0,uniform],[1,vertices],[2,accumulation],[3,pixels],[4,invalid],[7,hierarchy],[8,skyBuffer],[9,lights]].map(([binding,b])=>({binding,resource:{buffer:b}}))});
    const validation=await device.popErrorScope(); if (validation) throw new Error(validation.message);
    check();
    return {
      dispose,
      async run(signal, onSample) {
        if (running) throw new Error('A render is already running.');
        running=true;
        try {
          for (let sample=0;sample<samples;sample++) {
            for (const tile of renderTiles(width,height)) {
              if (signal.aborted) return;
              check(); uints[30]=sample; uints.set(tile,32); device.queue.writeBuffer(uniform,0,config);
              const encoder=device.createCommandEncoder(), pass=encoder.beginComputePass();
              pass.setPipeline(pipeline); pass.setBindGroup(0,group); pass.dispatchWorkgroups(Math.ceil(tile[2]/8),Math.ceil(tile[3]/8)); pass.end();
              device.queue.submit([encoder.finish()]);
              // One tile in flight: cancellation cannot enqueue an entire image.
              await device.queue.onSubmittedWorkDone(); check();
            }
            if (signal.aborted) return;
            const encoder=device.createCommandEncoder();
            encoder.copyBufferToBuffer(pixels,0,readback,0,imageBytes);
            encoder.copyBufferToBuffer(invalid,0,readback,imageBytes,4);
            device.queue.submit([encoder.finish()]);
            await readback.mapAsync(GPUMapMode.READ); check();
            let rgba;
            try {
              const mapped=readback.getMappedRange();
              if (new Uint32Array(mapped,imageBytes,1)[0]) throw new Error('The renderer produced invalid radiance. The image was discarded.');
              rgba=new Uint8ClampedArray(mapped.slice(0,imageBytes));
            } finally { readback.unmap(); }
            if (signal.aborted) return;
            onSample({width,height,samples:sample+1,rgba,region:settings.region,frameWidth:fullWidth,frameHeight:fullHeight});
            await new Promise(resolve=>setTimeout(resolve,0));
          }
        } finally { running=false; }
      },
      // Used by browser diagnostics to compare the actual shader with CPU fixtures.
      async probe(rays, atmosphereTest=false) {
        if (running) throw new Error('Cannot probe during a render.');
        if (!rays.length || rays.length>4096) throw new Error('Invalid probe count.');
        const cameraTest=atmosphereTest==='camera',waterRayTest=atmosphereTest==='water-rays',waterTest=atmosphereTest==='water',shadowTest=atmosphereTest==='shadows',materialTest=atmosphereTest==='materials',transportTest=['transport','sampling'].includes(atmosphereTest),stride=(cameraTest||waterTest||materialTest||transportTest)?32:16;
        const p=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:cameraTest?'cameraProbe':waterRayTest?'waterRayProbe':waterTest?'waterProbe':shadowTest?'shadowProbe':transportTest?(atmosphereTest==='sampling'?'transportSampleProbe':'transportProbe'):materialTest?'materialProbe':atmosphereTest?'atmosphereProbe':'probe',constants}});
        const input=buffer(rays.length*32,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
        const output=buffer(rays.length*stride,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC);
        const read=buffer(rays.length*stride,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
        try {
          device.queue.writeBuffer(input,0,new Float32Array(rays.flatMap(({origin,direction})=>[...origin.slice(0,3),origin[3]??0,...direction,0])));
          const group=device.createBindGroup({layout:p.getBindGroupLayout(0),entries:(waterRayTest?[[0,uniform],[1,vertices],[5,input],[6,output],[7,hierarchy],[8,skyBuffer],[9,lights]]:shadowTest?[[0,uniform],[1,vertices],[5,input],[6,output],[7,hierarchy],[9,lights]]:(cameraTest||waterTest||materialTest||transportTest)?[[0,uniform],[5,input],[6,output]]:atmosphereTest?[[0,uniform],[5,input],[6,output],[8,skyBuffer]]:[[0,uniform],[1,vertices],[5,input],[6,output],[7,hierarchy]]).map(([binding,b])=>({binding,resource:{buffer:b}}))});
          const encoder=device.createCommandEncoder(), pass=encoder.beginComputePass();
          pass.setPipeline(p); pass.setBindGroup(0,group); pass.dispatchWorkgroups(Math.ceil(rays.length/64)); pass.end();
          encoder.copyBufferToBuffer(output,0,read,0,rays.length*stride); device.queue.submit([encoder.finish()]);
          await read.mapAsync(GPUMapMode.READ); check();
          const values=new Float32Array(read.getMappedRange().slice(0)); read.unmap(); return values;
        } finally { input.destroy(); output.destroy(); read.destroy(); }
      },
    };
  } catch(error) { dispose(); throw error; }
}
