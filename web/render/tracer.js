// SPDX-License-Identifier: Apache-2.0
import { createHeightfield } from './heightfield.js';
import { frameUniforms } from '../scene/terrain.js';
export const TILE_WIDTH = 64, TILE_HEIGHT = 32;
export function validateRenderOptions({ width, height, samples }) {
  if (![[640,360],[960,540]].some(([w,h])=>width===w && height===h) || ![8,16,32,64].includes(samples)) {
    throw new Error('Choose a supported image size and sample count.');
  }
  return { width, height, samples };
}
export function renderTiles(width, height) {
  const tiles=[];
  for (let y=0;y<height;y+=TILE_HEIGHT) for (let x=0;x<width;x+=TILE_WIDTH) tiles.push([x,y,Math.min(TILE_WIDTH,width-x),Math.min(TILE_HEIGHT,height-y)]);
  return tiles;
}
export async function createTracer(state, options) {
  const { width, height, samples } = validateRenderOptions(options);
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
    const module=device.createShaderModule({code:await response.text()});
    const compilation=await module.getCompilationInfo();
    const errors=compilation.messages.filter(m=>m.type==='error');
    if (errors.length) throw new Error(errors.map(m=>m.message).join('; '));
    const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'render'}});
    const field=createHeightfield(state), imageBytes=width*height*4;
    if (width*height*16>device.limits.maxStorageBufferBindingSize) throw new Error('This GPU cannot hold the selected image. Choose a smaller size.');
    device.pushErrorScope('validation');
    const uniform=buffer(144,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
    const vertices=buffer(field.vertices.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
    const accumulation=buffer(width*height*16,GPUBufferUsage.STORAGE);
    const pixels=buffer(imageBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC);
    const invalid=buffer(4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC);
    const readback=buffer(imageBytes+4,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
    device.queue.writeBuffer(vertices,0,field.vertices);
    const config=new ArrayBuffer(144), floats=new Float32Array(config), uints=new Uint32Array(config);
    floats.set(frameUniforms(state,width/height));
    floats.set([field.low,field.high,Number(state.waterEnabled),state.waterLevel],24);
    uints.set([width,height,0,state.seed],28);
    device.queue.writeBuffer(uniform,0,config);
    const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[uniform,vertices,accumulation,pixels,invalid].map((b,binding)=>({binding,resource:{buffer:b}}))});
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
            onSample({width,height,samples:sample+1,rgba});
            await new Promise(resolve=>setTimeout(resolve,0));
          }
        } finally { running=false; }
      },
      // Used by browser diagnostics to compare the actual shader with CPU fixtures.
      async probe(rays) {
        if (running) throw new Error('Cannot probe during a render.');
        if (!rays.length || rays.length>4096) throw new Error('Invalid probe count.');
        const p=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'probe'}});
        const input=buffer(rays.length*32,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
        const output=buffer(rays.length*16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC);
        const read=buffer(rays.length*16,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
        try {
          device.queue.writeBuffer(input,0,new Float32Array(rays.flatMap(({origin,direction})=>[...origin,0,...direction,0])));
          const group=device.createBindGroup({layout:p.getBindGroupLayout(0),entries:[[0,uniform],[1,vertices],[5,input],[6,output]].map(([binding,b])=>({binding,resource:{buffer:b}}))});
          const encoder=device.createCommandEncoder(), pass=encoder.beginComputePass();
          pass.setPipeline(p); pass.setBindGroup(0,group); pass.dispatchWorkgroups(Math.ceil(rays.length/64)); pass.end();
          encoder.copyBufferToBuffer(output,0,read,0,rays.length*16); device.queue.submit([encoder.finish()]);
          await read.mapAsync(GPUMapMode.READ); check();
          const values=new Float32Array(read.getMappedRange().slice(0)); read.unmap(); return values;
        } finally { input.destroy(); output.destroy(); read.destroy(); }
      },
    };
  } catch(error) { dispose(); throw error; }
}
