// SPDX-License-Identifier: Apache-2.0
// GPU terrain: generation, droplet and thermal erosion, landform masks and min/max pyramids.
// Everything stays on the GPU; the CPU only queues work.

import { bindGroup, computePipeline, dispatch2d, storageBuffer, storageTexture, uniformBuffer } from './gpu.js';
import { StructWriter } from './struct.js';

export const NEAR_SIZE = 2048;
export const NEAR_EXTENT = 16000;
export const FAR_SIZE = 4096;
export const FAR_SPACING = 48;
export const NEAR_LEVELS = Math.log2(NEAR_SIZE) + 1;
export const FAR_LEVELS = Math.log2(FAR_SIZE) + 1;

// One full erosion pass: coarse batches carve valleys, fine batches cut gullies.
export const DROPLETS_PER_BATCH = 1 << 17;
export const EROSION_BATCHES = 24;
const COARSE_SHARE = 0.35;
const THERMAL_ITERATIONS = 2;

const SHAPE = {
  relief: 3200,
  valleyWidth: 2000,
  valleyFloor: 180,
  valleyLength: 22000,
};

const COARSE_DROPLETS = {
  lifetime: 80,
  stepCells: 2,
  radius: 3.5,
  inertia: 0.1,
  capacity: 10,
  minSlope: 0.01,
  erodeRate: 0.3,
  depositRate: 0.15,
  evaporation: 0.01,
  gravity: 6,
  maxSpeed: 10,
};

const FINE_DROPLETS = {
  lifetime: 160,
  stepCells: 1,
  radius: 2,
  inertia: 0.05,
  capacity: 6,
  minSlope: 0.01,
  erodeRate: 0.3,
  depositRate: 0.15,
  evaporation: 0.008,
  gravity: 4,
  maxSpeed: 8,
};

const FLOW_WEIGHT = 64;

// The lake surface, a little above the floor of the basin carved by the generator.
export const WATER_LEVEL = SHAPE.valleyFloor + 28;

const THERMAL = {
  rate: 0.06,
  screeTangent: Math.tan(35 * Math.PI / 180),
  rockTangent: Math.tan(58 * Math.PI / 180),
  looseDepth: 0.5,
};

const PIPELINES = {
  generateNear: ['terrain/generate.wgsl', 'generateNear'],
  generateFar: ['terrain/generate.wgsl', 'generateFar'],
  erode: ['terrain/droplet.wgsl', 'erode'],
  relax: ['terrain/thermal.wgsl', 'relax'],
  resolve: ['terrain/resolve.wgsl', 'resolve'],
  masks: ['terrain/masks.wgsl', 'buildMasks'],
  pyramidBase: ['terrain/pyramid.wgsl', 'baseLevel'],
  pyramidReduce: ['terrain/pyramid.wgsl', 'reduceLevel'],
};

function writeGrid(writer, grid) {
  return writer.f32(grid.origin[0], grid.origin[1], grid.spacing).u32(grid.size);
}

export class Terrain {
  static async create(device, placement) {
    const names = Object.keys(PIPELINES);
    const built = await Promise.all(names.map(name => computePipeline(device, ...PIPELINES[name])));
    const pipelines = Object.fromEntries(names.map((name, i) => [name, built[i]]));
    return new Terrain(device, pipelines, placement);
  }

  constructor(device, pipelines, placement) {
    this.device = device;
    this.pipelines = pipelines;
    this.placement = placement;
    this.near = { origin: placement.nearOrigin, spacing: NEAR_EXTENT / (NEAR_SIZE - 1), size: NEAR_SIZE };
    this.far = { origin: placement.farOrigin, spacing: FAR_SPACING, size: FAR_SIZE };
    this.batchSeed = 1;
    this.pendingBatches = 0;
    this.runBatches = 0;
    this.runDone = 0;
    this.createResources();
    this.createBindGroups();
  }

  createResources() {
    const device = this.device;
    const bytes = NEAR_SIZE * NEAR_SIZE * 4;
    const nearSize = [NEAR_SIZE, NEAR_SIZE];
    const farSize = [FAR_SIZE, FAR_SIZE];
    this.baseHeight = storageBuffer(device, 'base height', bytes);
    this.heightFixed = storageBuffer(device, 'height fixed', bytes);
    this.sediment = storageBuffer(device, 'sediment', bytes);
    this.flow = storageBuffer(device, 'flow', bytes);
    this.heightSnapshot = storageBuffer(device, 'height snapshot', bytes);
    this.sedimentSnapshot = storageBuffer(device, 'sediment snapshot', bytes);
    this.nearHeight = storageTexture(device, 'near height', nearSize, 'r32float');
    this.nearPyramid = storageTexture(device, 'near pyramid', nearSize, 'rg32float', { mipLevelCount: NEAR_LEVELS });
    this.masks = storageTexture(device, 'masks', nearSize, 'rgba16float');
    this.farHeight = storageTexture(device, 'far height', farSize, 'r32float');
    this.farPyramid = storageTexture(device, 'far pyramid', farSize, 'rg32float', { mipLevelCount: FAR_LEVELS });
    this.nearShape = uniformBuffer(device, 'near shape', 48);
    this.farShape = uniformBuffer(device, 'far shape', 48);
    this.nearGrid = uniformBuffer(device, 'near grid', 16);
    this.farGrid = uniformBuffer(device, 'far grid', 16);
    this.dropletParams = uniformBuffer(device, 'droplet params', 64);
    this.thermalParams = uniformBuffer(device, 'thermal params', 32);
    this.resolveParams = uniformBuffer(device, 'resolve params', 48);
    this.maskParams = uniformBuffer(device, 'mask params', 32);
    device.queue.writeBuffer(this.nearGrid, 0, writeGrid(new StructWriter(16), this.near).buffer);
    device.queue.writeBuffer(this.farGrid, 0, writeGrid(new StructWriter(16), this.far).buffer);
    this.writeStaticParams();
  }

  writeStaticParams() {
    const queue = this.device.queue;
    const thermal = new StructWriter(32)
      .u32(NEAR_SIZE)
      .f32(this.near.spacing, THERMAL.rate, THERMAL.screeTangent, THERMAL.rockTangent, THERMAL.looseDepth, 0, 0);
    queue.writeBuffer(this.thermalParams, 0, thermal.buffer);
    const resolve = new StructWriter(48);
    writeGrid(resolve, this.near);
    writeGrid(resolve, this.far);
    resolve.f32(48, 64, 0, 0);
    queue.writeBuffer(this.resolveParams, 0, resolve.buffer);
    const masks = new StructWriter(32);
    writeGrid(masks, this.near);
    masks.f32(FLOW_WEIGHT * 40, 4, 20, 30);
    queue.writeBuffer(this.maskParams, 0, masks.buffer);
  }

  createBindGroups() {
    const device = this.device;
    const p = this.pipelines;
    const nearHeightView = this.nearHeight.createView();
    this.groups = {
      generateNear: bindGroup(device, p.generateNear, [
        this.nearShape, this.nearGrid, this.baseHeight, this.heightFixed, null,
      ]),
      generateFar: bindGroup(device, p.generateFar, [
        this.farShape, this.farGrid, null, null, this.farHeight.createView(),
      ]),
      erode: bindGroup(device, p.erode, [this.dropletParams, this.heightFixed, this.sediment, this.flow]),
      relax: bindGroup(device, p.relax, [
        this.thermalParams, this.heightSnapshot, this.sedimentSnapshot, this.heightFixed, this.sediment,
      ]),
      resolve: bindGroup(device, p.resolve, [
        this.resolveParams, this.heightFixed, this.baseHeight, this.farHeight.createView(), nearHeightView,
      ]),
      masks: bindGroup(device, p.masks, [
        this.maskParams, nearHeightView, this.sediment, this.flow, this.masks.createView(),
      ]),
    };
    this.nearPyramidGroups = this.pyramidGroups(this.nearHeight, this.nearPyramid, NEAR_LEVELS);
    this.farPyramidGroups = this.pyramidGroups(this.farHeight, this.farPyramid, FAR_LEVELS);
  }

  pyramidGroups(heights, pyramid, levels) {
    const level = index => pyramid.createView({ baseMipLevel: index, mipLevelCount: 1 });
    const groups = [bindGroup(this.device, this.pipelines.pyramidBase, [heights.createView(), level(0)])];
    for (let index = 1; index < levels; index++) {
      groups.push(bindGroup(this.device, this.pipelines.pyramidReduce, [level(index - 1), level(index)]));
    }
    return groups;
  }

  writeShape(buffer, seed, finestWavelength) {
    const placement = this.placement;
    const shape = new StructWriter(48)
      .u32(seed)
      .f32(finestWavelength, SHAPE.relief, SHAPE.valleyWidth)
      .f32(...placement.valleyOrigin, ...placement.valleyDirection, ...placement.cameraXZ)
      .f32(SHAPE.valleyFloor, SHAPE.valleyLength);
    this.device.queue.writeBuffer(buffer, 0, shape.buffer);
  }

  encodePyramid(pass, groups, size) {
    groups.forEach((group, index) => {
      const pipeline = index === 0 ? this.pipelines.pyramidBase : this.pipelines.pyramidReduce;
      const levelSize = Math.max(1, size >> index);
      dispatch2d(pass, pipeline, group, levelSize, levelSize);
    });
  }

  // Resolve fixed-point heights, then rebuild masks and the near pyramid.
  encodeRebuild(pass) {
    dispatch2d(pass, this.pipelines.resolve, this.groups.resolve, NEAR_SIZE, NEAR_SIZE);
    dispatch2d(pass, this.pipelines.masks, this.groups.masks, NEAR_SIZE, NEAR_SIZE);
    this.encodePyramid(pass, this.nearPyramidGroups, NEAR_SIZE);
  }

  generate(seed) {
    this.writeShape(this.nearShape, seed, 2.5 * this.near.spacing);
    this.writeShape(this.farShape, seed, 2.5 * this.far.spacing);
    const encoder = this.device.createCommandEncoder({ label: 'generate terrain' });
    encoder.clearBuffer(this.sediment);
    encoder.clearBuffer(this.flow);
    const pass = encoder.beginComputePass({ label: 'generate terrain' });
    dispatch2d(pass, this.pipelines.generateFar, this.groups.generateFar, FAR_SIZE, FAR_SIZE);
    this.encodePyramid(pass, this.farPyramidGroups, FAR_SIZE);
    dispatch2d(pass, this.pipelines.generateNear, this.groups.generateNear, NEAR_SIZE, NEAR_SIZE);
    this.encodeRebuild(pass);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    this.pendingBatches = 0;
  }

  // Queues `amount` full erosion passes (fractions allowed) to run over the next frames.
  scheduleErosion(amount) {
    this.runBatches = Math.round(amount * EROSION_BATCHES);
    this.runDone = 0;
    this.pendingBatches = this.runBatches;
  }

  get eroding() {
    return this.pendingBatches > 0;
  }

  get progress() {
    return this.runBatches === 0 ? 1 : this.runDone / this.runBatches;
  }

  writeDroplets(settings) {
    const writer = new StructWriter(64)
      .u32(NEAR_SIZE, this.batchSeed++, DROPLETS_PER_BATCH, settings.lifetime)
      .f32(settings.stepCells, settings.radius, settings.inertia, settings.capacity)
      .f32(settings.minSlope, settings.erodeRate, settings.depositRate, settings.evaporation)
      .f32(settings.gravity, this.near.spacing, settings.maxSpeed, FLOW_WEIGHT);
    this.device.queue.writeBuffer(this.dropletParams, 0, writer.buffer);
  }

  // Runs up to `count` queued batches, each its own submit so its parameters can differ.
  erodeStep(count) {
    const queue = this.device.queue;
    const bytes = NEAR_SIZE * NEAR_SIZE * 4;
    const batches = Math.min(count, this.pendingBatches);
    for (let i = 0; i < batches; i++) {
      const coarse = this.runDone < this.runBatches * COARSE_SHARE;
      this.writeDroplets(coarse ? COARSE_DROPLETS : FINE_DROPLETS);
      const encoder = this.device.createCommandEncoder({ label: 'erode' });
      const droplets = encoder.beginComputePass({ label: 'droplets' });
      droplets.setPipeline(this.pipelines.erode);
      droplets.setBindGroup(0, this.groups.erode);
      droplets.dispatchWorkgroups(DROPLETS_PER_BATCH / 64);
      droplets.end();
      for (let k = 0; k < THERMAL_ITERATIONS; k++) {
        encoder.copyBufferToBuffer(this.heightFixed, 0, this.heightSnapshot, 0, bytes);
        encoder.copyBufferToBuffer(this.sediment, 0, this.sedimentSnapshot, 0, bytes);
        const thermal = encoder.beginComputePass({ label: 'thermal' });
        dispatch2d(thermal, this.pipelines.relax, this.groups.relax, NEAR_SIZE, NEAR_SIZE);
        thermal.end();
      }
      queue.submit([encoder.finish()]);
      this.pendingBatches--;
      this.runDone++;
    }
    const encoder = this.device.createCommandEncoder({ label: 'rebuild terrain' });
    const pass = encoder.beginComputePass({ label: 'rebuild terrain' });
    this.encodeRebuild(pass);
    pass.end();
    queue.submit([encoder.finish()]);
  }

  fieldsUniform() {
    const writer = new StructWriter(64);
    writeGrid(writer, this.near);
    writeGrid(writer, this.far);
    writer.u32(NEAR_LEVELS, FAR_LEVELS, 768, 384);
    writer.f32(WATER_LEVEL, 0, 0, 0);
    return writer.buffer;
  }
}
