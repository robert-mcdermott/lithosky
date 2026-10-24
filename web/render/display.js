// SPDX-License-Identifier: Apache-2.0
// Presents the post-processed HDR image (bloom, exposure, white balance, look, vignette,
// grain) and captures it as PNG. The rendered image may be smaller than the output; it is
// stretched to fill it.

import { bindGroup, shaderModule, uniformBuffer } from '../gpu/device.js';
import { StructWriter } from '../gpu/struct.js';
import { BLOOM_LEVELS } from './post.js';

const CAPTURE_FORMAT = 'rgba8unorm';

export const LOOKS = Object.freeze({ none: 0, punchy: 1, cinematic: 2, soft: 3, mono: 4 });

// Scene radiance is relative to a sun illuminance of 1; this maps manual EV 0 to a bright day.
const EXPOSURE_SCALE = 12;
const BLOOM_SCALE = 0.08;
const GRAIN_SEED = 7;

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
    this.uniform = uniformBuffer(device, 'display', 64);
    this.resources = null;
    this.groups = null;
  }

  // `resources` come from Post.run(); `post` supplies the sampler and exposure meter.
  bind(resources, post) {
    if (resources === this.resources) {
      return;
    }
    this.resources = resources;
    const entries = [this.uniform, resources.hdr.createView(), resources.bloom.createView(), post.sampler, post.exposure];
    this.groups = {
      screen: bindGroup(this.device, this.pipelines.screen, entries),
      capture: bindGroup(this.device, this.pipelines.capture, entries),
    };
  }

  // `image` holds the scene's image settings plus `viewMode`; outputSize is [width, height].
  // `region` places the image within the output (output UV x0, y0, x1, y1).
  write(image, outputSize, region = [0, 0, 1, 1]) {
    const scale = image.autoExposure ? 1 : EXPOSURE_SCALE;
    const writer = new StructWriter(64)
      .u32(...outputSize, image.viewMode ?? 0, LOOKS[image.look] ?? 0)
      .f32(scale * Math.pow(2, image.exposure)).u32(image.autoExposure ? 1 : 0)
      .f32(image.bloom * BLOOM_SCALE, image.warmth, image.vignette, image.grain)
      .u32(GRAIN_SEED).f32(BLOOM_LEVELS)
      .f32(...region);
    this.device.queue.writeBuffer(this.uniform, 0, writer.buffer);
  }

  // `area` ([x, y, width, height] in pixels) draws into part of the target, over what's there.
  encodeDraw(encoder, pipeline, group, view, area = null) {
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, loadOp: area ? 'load' : 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    if (area) {
      pass.setViewport(...area, 0, 1);
      pass.setScissorRect(...area);
    }
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
  }

  present(image) {
    const texture = this.context.getCurrentTexture();
    this.write(image, [texture.width, texture.height]);
    const encoder = this.device.createCommandEncoder({ label: 'present' });
    this.encodeDraw(encoder, this.pipelines.screen, this.groups.screen, texture.createView());
    this.device.queue.submit([encoder.finish()]);
  }

  // Draws the image over part of the view: `region` in canvas UV (x0, y0, x1, y1).
  presentRegion(image, region) {
    const texture = this.context.getCurrentTexture();
    const width = texture.width;
    const height = texture.height;
    const x = Math.max(0, Math.floor(region[0] * width));
    const y = Math.max(0, Math.floor(region[1] * height));
    const area = [x, y, Math.max(1, Math.min(width, Math.ceil(region[2] * width)) - x),
      Math.max(1, Math.min(height, Math.ceil(region[3] * height)) - y)];
    this.write(image, [width, height], region);
    const encoder = this.device.createCommandEncoder({ label: 'present region' });
    this.encodeDraw(encoder, this.pipelines.screen, this.groups.screen, texture.createView(), area);
    this.device.queue.submit([encoder.finish()]);
  }

  // Renders the image at `size` into a texture and returns a PNG blob.
  async capture(image, size, { type = 'image/png', quality } = {}) {
    const [width, height] = size;
    this.write(image, size);
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
    return canvas.convertToBlob({ type, quality });
  }
}
