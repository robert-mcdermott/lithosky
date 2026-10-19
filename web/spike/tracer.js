// SPDX-License-Identifier: Apache-2.0
// The progressive path tracer: a full-frame dispatch per sample into a GPU accumulation
// buffer. Nothing is read back; the display pass reads the same buffer.

import { bindGroup, computePipeline, storageBuffer, uniformBuffer } from '../gpu/device.js';
import { StructWriter } from '../gpu/struct.js';
import { AERIAL_DISTANCE } from './sky.js';

export class Tracer {
  static async create(device, width, height) {
    const pipeline = await computePipeline(device, 'trace/integrator.wgsl', 'render');
    return new Tracer(device, pipeline, width, height);
  }

  constructor(device, pipeline, width, height) {
    this.device = device;
    this.pipeline = pipeline;
    this.width = width;
    this.height = height;
    this.frameBuffer = uniformBuffer(device, 'frame', 128);
    this.fieldsBuffer = uniformBuffer(device, 'fields', 64);
    this.accumulation = storageBuffer(device, 'accumulation', width * height * 16);
  }

  bind(terrain, sky) {
    this.device.queue.writeBuffer(this.fieldsBuffer, 0, terrain.fieldsUniform());
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
    ], 'tracer');
  }

  // `view` carries the camera, sun and fog; `sampleIndex` 0 restarts the accumulation.
  writeFrame(view, sampleIndex) {
    const camera = view.camera;
    const writer = new StructWriter(128)
      .f32(...camera.position, camera.tanHalfFov)
      .f32(...camera.right, camera.aspect)
      .f32(...camera.up, AERIAL_DISTANCE)
      .f32(...camera.forward).u32(sampleIndex)
      .f32(...view.sunDirection, Math.cos(view.sunRadius))
      .f32(...view.sunIlluminance, view.fogDensity)
      .f32(view.fogHeight, view.fogFalloff).u32(this.width, this.height)
      .u32(view.viewMode, view.bounces, view.seed).f32(view.sunRadius);
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
