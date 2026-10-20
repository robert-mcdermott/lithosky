// SPDX-License-Identifier: Apache-2.0
// Post passes between the tracer and the display, all on the GPU:
//   resolve   accumulated sums -> mean radiance (+ noise estimate) and denoise guides
//   denoise   four edge-avoiding a-trous passes (1, 2, 4, 8 px), then a blend with the raw
//             image that fades as samples accumulate
//   bloom     a six-level downsample/upsample glow
//   meter     centre-weighted mean luminance for automatic exposure
// Textures are cached per render size, so moving (half size) and settled frames each keep
// their own set.

import { bindGroup, computePipeline, dispatch2d, storageBuffer, uniformBuffer } from '../gpu/device.js';
import { StructWriter } from '../gpu/struct.js';

const DENOISE_STEPS = [1, 2, 4, 8];
export const BLOOM_LEVELS = 6;
// Ease the meter toward new readings over roughly ten frames.
const METER_BLEND = 0.12;

const PIPELINES = {
  resolve: ['post/resolve.wgsl', 'resolve'],
  denoise: ['post/atrous.wgsl', 'denoisePass'],
  finish: ['post/atrous.wgsl', 'finish'],
  downsample: ['post/bloom.wgsl', 'downsample'],
  upsample: ['post/bloom.wgsl', 'upsample'],
  meter: ['post/meter.wgsl', 'meter'],
};

// The share of the denoised image to show after `samples` samples per pixel.
export function denoiseMix(samples) {
  return Math.min(1, Math.max(0, 1 - Math.log2(samples + 1) / 9));
}

export class Post {
  static async create(device) {
    const names = Object.keys(PIPELINES);
    const built = await Promise.all(names.map(name => computePipeline(device, ...PIPELINES[name])));
    return new Post(device, Object.fromEntries(names.map((name, i) => [name, built[i]])));
  }

  constructor(device, pipelines) {
    this.device = device;
    this.pipelines = pipelines;
    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    this.exposure = storageBuffer(device, 'exposure meter', 16);
    this.baseParams = uniformBuffer(device, 'post params', 32);
    this.stepParams = DENOISE_STEPS.map(step => uniformBuffer(device, `denoise step ${step}`, 32));
    this.firstBloom = uniformBuffer(device, 'bloom first level', 16);
    this.laterBloom = uniformBuffer(device, 'bloom later levels', 16);
    device.queue.writeBuffer(this.firstBloom, 0, new Uint32Array([1, 0, 0, 0]));
    device.queue.writeBuffer(this.laterBloom, 0, new Uint32Array([0, 0, 0, 0]));
    this.cache = new Map();
  }

  // Forgets the metered exposure, so the next reading applies at once.
  resetMeter() {
    this.device.queue.writeBuffer(this.exposure, 0, new Float32Array(4));
  }

  texture(label, width, height, format) {
    return this.device.createTexture({
      label,
      size: [width, height],
      format,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  // Textures and bind groups for one render size, rebuilt if the tracer's buffers changed.
  resources(width, height, tracer) {
    const key = `${width}x${height}`;
    const cached = this.cache.get(key);
    if (cached && cached.accumulation === tracer.accumulation) {
      return cached;
    }
    cached?.destroy();
    const built = this.build(width, height, tracer);
    this.cache.set(key, built);
    return built;
  }

  release(width, height) {
    const key = `${width}x${height}`;
    this.cache.get(key)?.destroy();
    this.cache.delete(key);
  }

  build(width, height, tracer) {
    const device = this.device;
    const p = this.pipelines;
    const view = texture => texture.createView();
    const raw = this.texture('raw radiance', width, height, 'rgba16float');
    const colors = [0, 1].map(i => this.texture(`denoise ${i}`, width, height, 'rgba16float'));
    const guideNormal = this.texture('normal guide', width, height, 'rgba32float');
    const guideAlbedo = this.texture('albedo guide', width, height, 'rgba16float');
    const hdr = this.texture('hdr', width, height, 'rgba16float');
    const sizes = [];
    for (let level = 1; level <= BLOOM_LEVELS; level++) {
      sizes.push([Math.max(1, width >> level), Math.max(1, height >> level)]);
    }
    const down = sizes.map(([w, h], i) => this.texture(`bloom down ${i}`, w, h, 'rgba16float'));
    const up = sizes.map(([w, h], i) => this.texture(`bloom up ${i}`, w, h, 'rgba16float'));
    const textures = [raw, ...colors, guideNormal, guideAlbedo, hdr, ...down, ...up];

    const resolve = bindGroup(device, p.resolve, [
      this.baseParams, tracer.accumulation, tracer.guides, view(raw), view(guideNormal), view(guideAlbedo),
    ]);
    // Pass i reads `inputs[i]` and writes `outputs[i]`: raw -> 0 -> 1 -> 0 -> 1.
    const inputs = [raw, colors[0], colors[1], colors[0]];
    const outputs = [colors[0], colors[1], colors[0], colors[1]];
    const denoise = DENOISE_STEPS.map((step, i) => bindGroup(device, p.denoise, [
      this.stepParams[i], view(inputs[i]), view(guideNormal), view(guideAlbedo), view(outputs[i]),
    ]));
    const finish = bindGroup(device, p.finish, [
      this.baseParams, view(outputs[outputs.length - 1]), null, null, view(hdr), view(raw),
    ]);
    const downsample = sizes.map((_, i) => bindGroup(device, p.downsample, [
      i === 0 ? this.firstBloom : this.laterBloom, view(i === 0 ? hdr : down[i - 1]), null, this.sampler, view(down[i]),
    ]));
    // up[i] = down[i] + tent(next smaller), where the smallest level starts from down.
    const upsample = [];
    for (let i = BLOOM_LEVELS - 2; i >= 0; i--) {
      const smaller = i === BLOOM_LEVELS - 2 ? down[BLOOM_LEVELS - 1] : up[i + 1];
      upsample.push({
        size: sizes[i],
        group: bindGroup(device, p.upsample, [null, view(down[i]), view(smaller), this.sampler, view(up[i])]),
      });
    }
    const meter = bindGroup(device, p.meter, [this.baseParams, view(hdr), this.exposure]);
    return {
      width,
      height,
      accumulation: tracer.accumulation,
      hdr,
      bloom: up[0],
      groups: { resolve, denoise, finish, downsample, upsample, meter },
      sizes,
      destroy: () => textures.forEach(texture => texture.destroy()),
    };
  }

  writeParams(width, height, mix, meterBlend) {
    const queue = this.device.queue;
    const params = step => new StructWriter(32).u32(width, height, step, 0).f32(mix, meterBlend, 0, 0).buffer;
    queue.writeBuffer(this.baseParams, 0, params(0));
    DENOISE_STEPS.forEach((step, i) => queue.writeBuffer(this.stepParams[i], 0, params(step)));
  }

  // Encodes every post pass for the tracer's current image. Returns the resources the
  // display reads (`hdr`, `bloom`).
  run(tracer, samples, { meterBlend = METER_BLEND } = {}) {
    const width = tracer.width;
    const height = tracer.height;
    const resources = this.resources(width, height, tracer);
    this.writeParams(width, height, denoiseMix(samples), meterBlend);
    const p = this.pipelines;
    const g = resources.groups;
    const encoder = this.device.createCommandEncoder({ label: 'post' });
    const pass = encoder.beginComputePass({ label: 'post' });
    dispatch2d(pass, p.resolve, g.resolve, width, height);
    for (const group of g.denoise) {
      dispatch2d(pass, p.denoise, group, width, height);
    }
    dispatch2d(pass, p.finish, g.finish, width, height);
    g.downsample.forEach((group, i) => dispatch2d(pass, p.downsample, group, ...resources.sizes[i]));
    for (const { size, group } of g.upsample) {
      dispatch2d(pass, p.upsample, group, ...size);
    }
    pass.setPipeline(p.meter);
    pass.setBindGroup(0, g.meter);
    pass.dispatchWorkgroups(1);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    return resources;
  }
}
