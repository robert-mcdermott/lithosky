// SPDX-License-Identifier: Apache-2.0
const shader = `
struct Camera { eye: vec4f, right: vec4f, up: vec4f, forward: vec4f, light: vec4f, fog: vec4f }
@group(0) @binding(0) var<uniform> camera: Camera;
struct Vertex { @builtin(position) position: vec4f, @location(0) normal: vec3f, @location(1) color: vec3f, @location(2) distance: f32 }
@vertex fn vertexMain(@location(0) position: vec3f, @location(1) normal: vec3f, @location(2) color: vec3f) -> Vertex {
  let delta = position - camera.eye.xyz;
  let depth = dot(delta, camera.forward.xyz);
  var result: Vertex;
  result.position = vec4f(dot(delta, camera.right.xyz) / (0.48 * camera.eye.w), dot(delta, camera.up.xyz) / 0.48, 150.0 / 149.9 * depth - 15.0 / 149.9, depth);
  result.normal = normal; result.color = color; result.distance = length(delta);
  return result;
}
@fragment fn fragmentMain(v: Vertex) -> @location(0) vec4f {
  let diffuse = max(0.0, dot(normalize(v.normal), camera.light.xyz));
  let lit = v.color * (0.32 + diffuse * 0.85);
  let haze = 1.0 - exp(-v.distance * v.distance * 0.00042);
  return vec4f(mix(lit, camera.fog.xyz, haze), 1.0);
}`;

export async function createWebGPU(canvas, onLost) {
  if (!globalThis.isSecureContext) throw new Error('A secure local context is required');
  if (!navigator.gpu) throw new Error('WebGPU is unavailable');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No GPU adapter was granted');
  const device = await adapter.requestDevice();
  let disposed = false, vertexBuffer, depth, context;
  // Register before pipeline compilation: even a newly requested device can be lost.
  device.lost.then(info => { if (!disposed) onLost(`Graphics device lost: ${info.message || info.reason}`); });
  const onError = event => { if (!disposed) onLost(`Graphics error: ${event.error.message}`); };
  device.addEventListener('uncapturederror', onError);
  try {
    context = canvas.getContext('webgpu');
    if (!context) throw new Error('WebGPU canvas unavailable');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });
    const module = device.createShaderModule({ code: shader });
    const compilation = await module.getCompilationInfo();
    const errors = compilation.messages.filter(m => m.type === 'error');
    if (errors.length) throw new Error(errors.map(m => m.message).join('; '));
    const pipeline = await device.createRenderPipelineAsync({
      layout: 'auto',
      vertex: { module, entryPoint: 'vertexMain', buffers: [{ arrayStride: 36, attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x3' },
      ] }] },
      fragment: { module, entryPoint: 'fragmentMain', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    });
    const uniform = device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] });
    let count = 0, width = 0, height = 0;
    return {
      canvas,
      details: `WebGPU · max texture ${device.limits.maxTextureDimension2D} px · ${Math.round(device.limits.maxStorageBufferBindingSize / 1048576)} MiB storage binding`,
      setMesh(mesh) {
        vertexBuffer?.destroy();
        vertexBuffer = device.createBuffer({ size: mesh.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
        device.queue.writeBuffer(vertexBuffer, 0, mesh); count = mesh.length / 9;
      },
      draw(values) {
        if (disposed || !vertexBuffer) return;
        if (width !== canvas.width || height !== canvas.height) {
          depth?.destroy(); width = canvas.width; height = canvas.height;
          depth = device.createTexture({ size: [width, height], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
        }
        device.queue.writeBuffer(uniform, 0, values);
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: values[20], g: values[21], b: values[22], a: 1 }, loadOp: 'clear', storeOp: 'store' }], depthStencilAttachment: { view: depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' } });
        pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.setVertexBuffer(0, vertexBuffer); pass.draw(count); pass.end();
        device.queue.submit([encoder.finish()]);
      },
      dispose() { disposed = true; device.removeEventListener('uncapturederror', onError); vertexBuffer?.destroy(); uniform.destroy(); depth?.destroy(); context.unconfigure(); device.destroy(); },
    };
  } catch (error) { disposed = true; context?.unconfigure(); device.destroy(); throw error; }
}
