// SPDX-License-Identifier: Apache-2.0
// Presents the accumulation buffer with exposure and AgX, and captures it as PNG.
// The rendered image may be smaller than the output; it is stretched to fill it.

import { bindGroup, shaderModule, uniformBuffer } from '../gpu/device.js';
import { StructWriter } from '../gpu/struct.js';

const CAPTURE_FORMAT = 'rgba8unorm';

export const LOOKS = Object.freeze({ none: 0, punchy: 1 });

// Scene radiance is relative to a sun illuminance of 1; this maps EV 0 to a bright day.
const EXPOSURE_SCALE = 12;

export class Display {
  static async create(device, context, format) {
    const module = await shaderModule(device, 'display/display.wgsl');
    const pipelineFor = targetFormat => device.createRenderPipelineAsync({
      label: `display ${targetFormat}`,
      layout: 'auto',
      vertex: { module, entryPoint: 'fullScreen' },
      fragment: { module, entryPoint: 'present', targets: [{ format: targetFormat }] },
      primitive: { topology: 'triangle-list' },
    });
    const [screen, capture] = await Promise.all([pipelineFor(format), pipelineFor(CAPTURE_FORMAT)]);
    return new Display(device, context, { screen, capture });
  }

  constructor(device, context, pipelines) {
    this.device = device;
    this.context = context;
    this.pipelines = pipelines;
    this.uniform = uniformBuffer(device, 'display', 32);
    this.accumulation = null;
    this.groups = null;
  }

  bind(accumulation) {
    if (accumulation === this.accumulation) {
      return;
    }
    this.accumulation = accumulation;
    this.groups = {
      screen: bindGroup(this.device, this.pipelines.screen, [this.uniform, accumulation]),
      capture: bindGroup(this.device, this.pipelines.capture, [this.uniform, accumulation]),
    };
  }

  // `image` is { exposure, look, viewMode }; sizes are [width, height] in pixels.
  write(image, renderSize, outputSize) {
    const exposure = EXPOSURE_SCALE * Math.pow(2, image.exposure);
    const writer = new StructWriter(32)
      .u32(...outputSize, ...renderSize)
      .f32(exposure)
      .u32(image.viewMode ?? 0, LOOKS[image.look] ?? 0, 0);
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

  present(image, renderSize) {
    const texture = this.context.getCurrentTexture();
    this.write(image, renderSize, [texture.width, texture.height]);
    const encoder = this.device.createCommandEncoder({ label: 'present' });
    this.encodeDraw(encoder, this.pipelines.screen, this.groups.screen, texture.createView());
    this.device.queue.submit([encoder.finish()]);
  }

  // Renders the image at its rendered size into a texture and returns a PNG blob.
  async capture(image, size) {
    const [width, height] = size;
    this.write(image, size, size);
    const device = this.device;
    const texture = device.createTexture({
      size: [width, height],
      format: CAPTURE_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const bytesPerRow = Math.ceil(width * 4 / 256) * 256;
    const readback = device.createBuffer({
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = device.createCommandEncoder({ label: 'capture' });
    this.encodeDraw(encoder, this.pipelines.capture, this.groups.capture, texture.createView());
    encoder.copyTextureToBuffer({ texture }, { buffer: readback, bytesPerRow }, [width, height]);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const source = new Uint8Array(readback.getMappedRange());
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row++) {
      const start = row * bytesPerRow;
      pixels.set(source.subarray(start, start + width * 4), row * width * 4);
    }
    readback.unmap();
    readback.destroy();
    texture.destroy();
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d').putImageData(new ImageData(pixels, width, height), 0, 0);
    return canvas.convertToBlob({ type: 'image/png' });
  }
}
