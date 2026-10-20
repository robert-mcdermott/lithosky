// SPDX-License-Identifier: Apache-2.0
// Cloud resources: tileable 3D shape and detail noise (generated once on the GPU), a weather
// map over the cloud region (rebuilt when the sky's seed changes) and the cloud uniform.
// Scene settings use metres and 0..1 amounts; the shader works in kilometres.

import { bindGroup, computePipeline, uniformBuffer } from '../gpu/device.js';
import { StructWriter } from '../gpu/struct.js';
import { cloudSettingsOf } from '../scene/document.js';

const SHAPE_SIZE = 128;
const DETAIL_SIZE = 32;
const WEATHER_SIZE = 1024;
// The weather map spans this many kilometres around the origin.
const WEATHER_EXTENT = 200;
// Kilometres per tile of the shape noise, from the layer thickness: thin high layers break
// into small cells (a mackerel sky), deep layers into large heaps and towers.
function shapeScale(thicknessKm) {
  return Math.min(12, Math.max(3.5, thicknessKm * 5.5));
}
const DETAIL_SCALE = 1.3;
// Extinction per kilometre at density 1: a cumulus interior.
const EXTINCTION = 40;

function seedOffset(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  const z = Math.sin(seed * 78.233) * 12543.2;
  return [(x - Math.floor(x)) * 500, (z - Math.floor(z)) * 500];
}

export class Clouds {
  static async create(device) {
    const [shape, detail, weather] = await Promise.all([
      computePipeline(device, 'clouds/noise.wgsl', 'generateShape'),
      computePipeline(device, 'clouds/noise.wgsl', 'generateDetail'),
      computePipeline(device, 'clouds/noise.wgsl', 'generateWeather'),
    ]);
    return new Clouds(device, { shape, detail, weather });
  }

  constructor(device, pipelines) {
    this.device = device;
    this.pipelines = pipelines;
    const usage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING;
    const volume = size => device.createTexture({
      size: [size, size, size],
      dimension: '3d',
      format: 'rgba8unorm',
      usage,
    });
    this.shapeNoise = volume(SHAPE_SIZE);
    this.detailNoise = volume(DETAIL_SIZE);
    this.weatherMap = device.createTexture({ size: [WEATHER_SIZE, WEATHER_SIZE], format: 'rgba8unorm', usage });
    this.uniform = uniformBuffer(device, 'clouds', 48);
    this.weatherParams = uniformBuffer(device, 'weather params', 16);
    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      addressModeW: 'repeat',
    });
    this.weatherSeed = null;
    this.generateNoise();
  }

  generateNoise() {
    const device = this.device;
    const shape = bindGroup(device, this.pipelines.shape, [this.shapeNoise.createView()]);
    const detail = bindGroup(device, this.pipelines.detail, [null, this.detailNoise.createView()]);
    const encoder = device.createCommandEncoder({ label: 'cloud noise' });
    const pass = encoder.beginComputePass({ label: 'cloud noise' });
    pass.setPipeline(this.pipelines.shape);
    pass.setBindGroup(0, shape);
    pass.dispatchWorkgroups(SHAPE_SIZE / 4, SHAPE_SIZE / 4, SHAPE_SIZE / 4);
    pass.setPipeline(this.pipelines.detail);
    pass.setBindGroup(0, detail);
    pass.dispatchWorkgroups(DETAIL_SIZE / 4, DETAIL_SIZE / 4, DETAIL_SIZE / 4);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  generateWeather(seed) {
    const device = this.device;
    device.queue.writeBuffer(this.weatherParams, 0, new StructWriter(16).u32(seed).f32(WEATHER_EXTENT, 0, 0).buffer);
    const group = bindGroup(device, this.pipelines.weather, [null, null, this.weatherMap.createView(), this.weatherParams]);
    const encoder = device.createCommandEncoder({ label: 'weather map' });
    const pass = encoder.beginComputePass({ label: 'weather map' });
    pass.setPipeline(this.pipelines.weather);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(WEATHER_SIZE / 8, WEATHER_SIZE / 8);
    pass.end();
    device.queue.submit([encoder.finish()]);
    this.weatherSeed = seed;
  }

  // Applies a scene's cloud settings; rebuilds the weather map only when the seed changed.
  update(scene) {
    const settings = cloudSettingsOf(scene);
    if (settings.seed !== this.weatherSeed) {
      this.generateWeather(settings.seed);
    }
    const enabled = settings.coverage > 0 || settings.cirrus > 0;
    const writer = new StructWriter(48)
      .f32(settings.coverage, settings.type, settings.altitude / 1000, settings.thickness / 1000)
      .f32(settings.density * EXTINCTION, settings.cirrus, WEATHER_EXTENT, shapeScale(settings.thickness / 1000))
      .f32(...seedOffset(settings.seed), DETAIL_SCALE).u32(enabled ? 1 : 0);
    this.device.queue.writeBuffer(this.uniform, 0, writer.buffer);
  }
}
