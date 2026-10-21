// SPDX-License-Identifier: Apache-2.0
// The progressive path tracer: a full-frame dispatch per sample into a GPU accumulation
// buffer. Nothing is read back; the display pass reads the same buffer. The buffer is sized
// for the largest image; each sample may render a smaller image into its top-left part
// (the display stretches it), which keeps camera moves responsive.

import { bindGroup, computePipeline, storageBuffer, uniformBuffer } from '../gpu/device.js';
import { StructWriter } from '../gpu/struct.js';
import { surfaceUniform } from './biomes.js';
import { AERIAL_DISTANCE } from './sky.js';

let tracers = 0;

export class Tracer {
  static async create(device) {
    const pipeline = await computePipeline(device, 'trace/integrator.wgsl', 'render');
    return new Tracer(device, pipeline);
  }

  constructor(device, pipeline) {
    this.id = ++tracers;
    this.device = device;
    this.pipeline = pipeline;
    this.frameBuffer = uniformBuffer(device, 'frame', 144);
    this.fieldsBuffer = uniformBuffer(device, 'fields', 64);
    this.surfaceBuffer = uniformBuffer(device, 'surface', 176);
    this.capacity = 0;
    this.accumulation = null;
    this.guides = null;
    this.width = 1;
    this.height = 1;
    this.group = null;
  }

  // Grows the accumulation buffer to hold `pixels`. Returns true when it was reallocated.
  reserve(pixels) {
    if (pixels <= this.capacity) {
      return false;
    }
    this.accumulation?.destroy();
    this.guides?.destroy();
    this.capacity = pixels;
    this.accumulation = storageBuffer(this.device, 'accumulation', pixels * 16);
    this.guides = storageBuffer(this.device, 'denoise guides', pixels * 32);
    this.createGroup();
    return true;
  }

  // Frees the image buffers (an export's tracer, once it's done).
  release() {
    this.accumulation?.destroy();
    this.guides?.destroy();
    this.accumulation = null;
    this.guides = null;
    this.capacity = 0;
    this.group = null;
  }

  // The image size the next samples render at.
  setSize(width, height) {
    this.reserve(width * height);
    this.width = width;
    this.height = height;
  }

  // Biome palette, snow and tree lines, moisture, strata and water waves for a scene.
  writeSurface(scene) {
    this.device.queue.writeBuffer(this.surfaceBuffer, 0, surfaceUniform(scene));
  }

  bind(terrain, sky, clouds) {
    this.terrain = terrain;
    this.sky = sky;
    this.clouds = clouds;
    this.device.queue.writeBuffer(this.fieldsBuffer, 0, terrain.fieldsUniform());
    this.createGroup();
  }

  createGroup() {
    if (!this.terrain || !this.accumulation) {
      return;
    }
    const terrain = this.terrain;
    const sky = this.sky;
    const clouds = this.clouds;
    this.group = bindGroup(this.device, this.pipeline, [
      this.frameBuffer,
      sky.uniform,
      this.fieldsBuffer,
      terrain.nearHeight.createView(),
      terrain.nearPyramid.createView(),
      terrain.farHeight.createView(),
      terrain.farPyramid.createView(),
      terrain.masks.createView(),
      sky.transmittance.createView(),
      sky.skyView.createView(),
      sky.aerialScatter.createView(),
      sky.aerialTransmittance.createView(),
      sky.sampler,
      this.accumulation,
      this.guides,
      clouds.uniform,
      clouds.weatherMap.createView(),
      clouds.shapeNoise.createView(),
      clouds.detailNoise.createView(),
      clouds.sampler,
      terrain.exposure.createView(),
      this.surfaceBuffer,
    ], 'tracer');
  }

  // `view` carries the camera, sun and fog, and optionally the `window` of the view this
  // image covers; `sampleIndex` 0 restarts the accumulation.
  writeFrame(view, sampleIndex) {
    const camera = view.camera;
    const writer = new StructWriter(144)
      .f32(...camera.position, camera.tanHalfFov)
      .f32(...camera.right, camera.aspect)
      .f32(...camera.up, AERIAL_DISTANCE)
      .f32(...camera.forward).u32(sampleIndex)
      .f32(...view.sunDirection, Math.cos(view.sunRadius))
      .f32(...view.sunIlluminance, view.fogDensity)
      .f32(view.fogHeight, view.fogFalloff).u32(this.width, this.height)
      .u32(view.viewMode, view.bounces, view.seed).f32(view.sunRadius)
      .f32(...(view.window ?? [0, 0, 1, 1]));
    this.device.queue.writeBuffer(this.frameBuffer, 0, writer.buffer);
  }

  sample(view, sampleIndex) {
    this.writeFrame(view, sampleIndex);
    const encoder = this.device.createCommandEncoder({ label: 'trace sample' });
    const pass = encoder.beginComputePass({ label: 'trace sample' });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.group);
    pass.dispatchWorkgroups(Math.ceil(this.width / 8), Math.ceil(this.height / 8));
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
}
