// SPDX-License-Identifier: Apache-2.0
// Presents the accumulation buffer with exposure and AgX, and captures it as PNG.

import { bindGroup, shaderModule, uniformBuffer } from './gpu.js';
import { StructWriter } from './struct.js';

const CAPTURE_FORMAT = 'rgba8unorm';

export const LOOKS = Object.freeze({ none: 0, punchy: 1 });

// Scene radiance is relative to a sun illuminance of 1; this maps EV 0 to a bright day.
const EXPOSURE_SCALE = 12;

export class Display {
  static async create(device, context, format, accumulation, width, height) {
    const module = await shaderModule(device, 'display/display.wgsl');
    const pipelineFor = targetFormat => device.createRenderPipelineAsync({
      label: `display ${targetFormat}`,
      layout: 'auto',
      vertex: { module, entryPoint: 'fullScreen' },
      fragment: { module, entryPoint: 'present', targets: [{ format: targetFormat }] },
      primitive: { topology: 'triangle-list' },
    });
    const [screen, capture] = await Promise.all([pipelineFor(format), pipelineFor(CAPTURE_FORMAT)]);
    return new Display(device, context, { screen, capture }, accumulation, width, height);
  }

  constructor(device, context, pipelines, accumulation, width, height) {
    this.device = device;
    this.context = context;
    this.pipelines = pipelines;
    this.width = width;
    this.height = height;
    this.uniform = uniformBuffer(device, 'display', 32);
    this.groups = {
      screen: bindGroup(device, pipelines.screen, [this.uniform, accumulation]),
      capture: bindGroup(device, pipelines.capture, [this.uniform, accumulation]),
    };
  }

  write(settings) {
    const exposure = EXPOSURE_SCALE * Math.pow(2, settings.exposure);
    const writer = new StructWriter(32)
      .u32(this.width, this.height)
      .f32(exposure)
      .u32(settings.viewMode, LOOKS[settings.look] ?? 0, 0, 0, 0);
    this.device.queue.writeBuffer(this.uniform, 0, writer.buffer);
  }

  encodeDraw(encoder, pipeline, group, view) {
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
  }

  present(settings) {
    this.write(settings);
    const encoder = this.device.createCommandEncoder({ label: 'present' });
    const view = this.context.getCurrentTexture().createView();
    this.encodeDraw(encoder, this.pipelines.screen, this.groups.screen, view);
    this.device.queue.submit([encoder.finish()]);
  }

  // Renders the current image into a texture, reads it back and encodes a PNG data URL.
  async capturePng(settings) {
    this.write(settings);
    const device = this.device;
    const texture = device.createTexture({
      size: [this.width, this.height],
      format: CAPTURE_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const bytesPerRow = Math.ceil(this.width * 4 / 256) * 256;
    const readback = device.createBuffer({
      size: bytesPerRow * this.height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = device.createCommandEncoder({ label: 'capture' });
    this.encodeDraw(encoder, this.pipelines.capture, this.groups.capture, texture.createView());
    encoder.copyTextureToBuffer({ texture }, { buffer: readback, bytesPerRow }, [this.width, this.height]);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const source = new Uint8Array(readback.getMappedRange());
    const pixels = new Uint8ClampedArray(this.width * this.height * 4);
    for (let row = 0; row < this.height; row++) {
      const start = row * bytesPerRow;
      pixels.set(source.subarray(start, start + this.width * 4), row * this.width * 4);
    }
    readback.unmap();
    readback.destroy();
    texture.destroy();
    const canvas = new OffscreenCanvas(this.width, this.height);
    canvas.getContext('2d').putImageData(new ImageData(pixels, this.width, this.height), 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }
}
