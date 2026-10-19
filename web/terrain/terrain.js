// SPDX-License-Identifier: Apache-2.0
// GPU terrain: generation, stream-power drainage, droplet and thermal erosion, landform masks
// and min/max pyramids. Everything stays on the GPU; the CPU only queues work.
//
// A build runs as a staged job spread over frames so the view stays live:
//   1. far field: generate on a coarse grid, carve drainage, write the 196 km height texture
//   2. near tile: generate (or import) 2048² heights, carve drainage on a 512² grid, apply it
//   3. near tile: droplet erosion with thermal relaxation adds gullies, talus and deposits
//   4. resolve heights, rebuild masks and pyramids
// The same settings and placement give the same terrain, except for tiny differences from
// the order in which concurrent droplets update shared heights.

import { bindGroup, computePipeline, dispatch2d, storageBuffer, storageTexture, uniformBuffer } from '../gpu/device.js';
import { StructWriter } from '../gpu/struct.js';
import { terrainSettings } from './settings.js';

export const NEAR_SIZE = 2048;
export const NEAR_EXTENT = 16000;
export const FAR_SIZE = 4096;
export const FAR_SPACING = 48;
export const NEAR_LEVELS = Math.log2(NEAR_SIZE) + 1;
export const FAR_LEVELS = Math.log2(FAR_SIZE) + 1;
const FAR_EXTENT = (FAR_SIZE - 1) * FAR_SPACING;

// Drainage grids: about 16 m cells on the near tile, about 256 m cells on the far field.
const NEAR_DRAINAGE_SIZE = 1024;
const FAR_DRAINAGE_SIZE = 768;

const SHAPE = {
  valleyWidth: 2000,
  valleyFloor: 180,
  valleyLength: 22000,
};

// The lake surface, a little above the floor of the basin carved by the generator.
export const WATER_LEVEL = SHAPE.valleyFloor + 28;

// Stream power: incision scales with drainage area^0.5, so rivers grade their valleys while
// hillslopes barely change. `incision` is per iteration at drainage multiplier 1.
const NEAR_DRAINAGE = {
  fillSweeps: 1024,
  iterations: 1600,
  fillSlope: 0.01,
  flowExponent: 1.3,
  incision: 3e-5,
  areaExponent: 0.5,
  talusSlope: Math.tan(42 * Math.PI / 180),
  talusRate: 0.04,
};

const FAR_DRAINAGE = {
  ...NEAR_DRAINAGE,
  fillSweeps: 768,
  iterations: 600,
  fillSlope: 0.02,
  incision: 1.2e-4,
  talusSlope: Math.tan(35 * Math.PI / 180),
};

// Iterations queued per frame while a build runs.
const DRAINAGE_ITERATIONS_PER_STEP = 30;
const FILL_SWEEPS_PER_STEP = 128;
const DROPLET_BATCHES_PER_STEP = 2;

const DROPLETS = {
  perBatch: 1 << 17,
  batches: 12,
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
const THERMAL_ITERATIONS = 2;

const THERMAL = {
  rate: 0.06,
  screeTangent: Math.tan(35 * Math.PI / 180),
  rockTangent: Math.tan(58 * Math.PI / 180),
  looseDepth: 0.5,
};

const PIPELINES = {
  generateNear: ['terrain/generate.wgsl', 'generateNear'],
  generateCoarse: ['terrain/generate.wgsl', 'generateCoarse'],
  generateFar: ['terrain/generate.wgsl', 'generateFar'],
  drainageBegin: ['terrain/drainage.wgsl', 'begin'],
  drainageFill: ['terrain/drainage.wgsl', 'fill'],
  drainageShare: ['terrain/drainage.wgsl', 'share'],
  drainageAccumulate: ['terrain/drainage.wgsl', 'accumulate'],
  drainageIncise: ['terrain/drainage.wgsl', 'incise'],
  drainageRelax: ['terrain/drainage.wgsl', 'relax'],
  downsample: ['terrain/coarse.wgsl', 'downsample'],
  difference: ['terrain/coarse.wgsl', 'difference'],
  apply: ['terrain/coarse.wgsl', 'apply'],
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

function gridBuffer(device, label, grid) {
  const buffer = uniformBuffer(device, label, 16);
  device.queue.writeBuffer(buffer, 0, writeGrid(new StructWriter(16), grid).buffer);
  return buffer;
}

// One stream-power solve on a coarse grid, with ping-ponged filled surface and area.
class DrainageSolver {
  constructor(device, pipelines, grid, label) {
    this.device = device;
    this.pipelines = pipelines;
    this.grid = grid;
    const bytes = grid.size * grid.size * 4;
    const buffer = name => storageBuffer(device, `${label} ${name}`, bytes);
    this.height = buffer('height');
    this.scratch = buffer('scratch height');
    this.filled = [buffer('filled 0'), buffer('filled 1')];
    this.area = [buffer('area 0'), buffer('area 1')];
    this.share = buffer('share');
    this.pristine = buffer('pristine');
    this.carving = buffer('carving');
    this.params = uniformBuffer(device, `${label} params`, 32);
    this.gridUniform = gridBuffer(device, `${label} grid`, grid);
    this.current = 0;
    this.createGroups();
  }

  createGroups() {
    const p = this.pipelines;
    const group = (pipeline, resources) => bindGroup(this.device, pipeline, resources);
    const params = this.params;
    this.begin = group(p.drainageBegin, [params, this.height, null, null, null, null, this.filled[0], this.area[0]]);
    this.fill = [0, 1].map(c => group(p.drainageFill, [
      params, this.height, this.filled[c], null, null, null, this.filled[1 - c],
    ]));
    this.shareGroups = [0, 1].map(c => group(p.drainageShare, [
      params, null, this.filled[1 - c], this.area[c], null, null, null, null, this.share,
    ]));
    this.accumulate = [0, 1].map(c => group(p.drainageAccumulate, [
      params, null, this.filled[1 - c], null, this.share, null, null, this.area[1 - c],
    ]));
    this.incise = [0, 1].map(c => group(p.drainageIncise, [
      params, this.height, this.filled[1 - c], this.area[1 - c], null, this.scratch,
    ]));
    this.relax = group(p.drainageRelax, [params, this.scratch, null, null, null, this.height]);
  }

  writeParams(settings, strength, talus) {
    const writer = new StructWriter(32)
      .u32(this.grid.size)
      .f32(this.grid.spacing, settings.fillSlope, settings.flowExponent)
      .f32(settings.incision * strength, settings.areaExponent, settings.talusSlope, settings.talusRate * talus);
    this.device.queue.writeBuffer(this.params, 0, writer.buffer);
  }

  encodeBegin(pass) {
    dispatch2d(pass, this.pipelines.drainageBegin, this.begin, this.grid.size, this.grid.size);
    this.current = 0;
  }

  encodeFillSweeps(pass, count) {
    for (let i = 0; i < count; i++) {
      dispatch2d(pass, this.pipelines.drainageFill, this.fill[this.current], this.grid.size, this.grid.size);
      this.current = 1 - this.current;
    }
  }

  // Each iteration fills from the current surface, routes area, incises, then relaxes.
  encodeIterations(pass, count) {
    const p = this.pipelines;
    const size = this.grid.size;
    for (let i = 0; i < count; i++) {
      const c = this.current;
      dispatch2d(pass, p.drainageFill, this.fill[c], size, size);
      dispatch2d(pass, p.drainageShare, this.shareGroups[c], size, size);
      dispatch2d(pass, p.drainageAccumulate, this.accumulate[c], size, size);
      dispatch2d(pass, p.drainageIncise, this.incise[c], size, size);
      dispatch2d(pass, p.drainageRelax, this.relax, size, size);
      this.current = 1 - c;
    }
  }

  // The area buffer holding the latest routed drainage area.
  get currentArea() {
    return this.area[this.current];
  }
}

export class Terrain {
  static async create(device, placement, settings = terrainSettings()) {
    const names = Object.keys(PIPELINES);
    const built = await Promise.all(names.map(name => computePipeline(device, ...PIPELINES[name])));
    const pipelines = Object.fromEntries(names.map((name, i) => [name, built[i]]));
    return new Terrain(device, pipelines, placement, settings);
  }

  constructor(device, pipelines, placement, settings) {
    this.device = device;
    this.pipelines = pipelines;
    this.placement = placement;
    this.settings = settings;
    this.near = { origin: placement.nearOrigin, spacing: NEAR_EXTENT / (NEAR_SIZE - 1), size: NEAR_SIZE };
    this.far = { origin: placement.farOrigin, spacing: FAR_SPACING, size: FAR_SIZE };
    this.nearCoarse = {
      origin: placement.nearOrigin,
      spacing: NEAR_EXTENT / (NEAR_DRAINAGE_SIZE - 1),
      size: NEAR_DRAINAGE_SIZE,
    };
    this.farCoarse = {
      origin: placement.farOrigin,
      spacing: FAR_EXTENT / (FAR_DRAINAGE_SIZE - 1),
      size: FAR_DRAINAGE_SIZE,
    };
    this.source = { mode: 0, base: 0, relief: settings.relief };
    this.job = null;
    this.jobLength = 1;
    this.jobDone = 0;
    this.createResources();
    this.createBindGroups();
  }

  createResources() {
    const device = this.device;
    const bytes = NEAR_SIZE * NEAR_SIZE * 4;
    this.baseHeight = storageBuffer(device, 'base height', bytes);
    this.heightFixed = storageBuffer(device, 'height fixed', bytes);
    this.sediment = storageBuffer(device, 'sediment', bytes);
    this.flow = storageBuffer(device, 'flow', bytes);
    this.drainage = storageBuffer(device, 'fine drainage area', bytes);
    this.heightSnapshot = storageBuffer(device, 'height snapshot', bytes);
    this.sedimentSnapshot = storageBuffer(device, 'sediment snapshot', bytes);
    const nearSize = [NEAR_SIZE, NEAR_SIZE];
    const farSize = [FAR_SIZE, FAR_SIZE];
    this.nearHeight = storageTexture(device, 'near height', nearSize, 'r32float');
    this.nearPyramid = storageTexture(device, 'near pyramid', nearSize, 'rg32float', { mipLevelCount: NEAR_LEVELS });
    this.masks = storageTexture(device, 'masks', nearSize, 'rgba16float');
    this.exposure = storageTexture(device, 'exposure masks', nearSize, 'rgba16float');
    this.farHeight = storageTexture(device, 'far height', farSize, 'r32float');
    this.farPyramid = storageTexture(device, 'far pyramid', farSize, 'rg32float', { mipLevelCount: FAR_LEVELS });
    this.nearShape = uniformBuffer(device, 'near shape', 48);
    this.farShape = uniformBuffer(device, 'far shape', 48);
    this.farCoarseShape = uniformBuffer(device, 'far coarse shape', 48);
    this.nearGrid = gridBuffer(device, 'near grid', this.near);
    this.farGrid = gridBuffer(device, 'far grid', this.far);
    this.sourceParams = uniformBuffer(device, 'source params', 16);
    this.sourceHeight = this.createSourceTexture(2, new Float32Array(4));
    this.dropletParams = uniformBuffer(device, 'droplet params', 64);
    this.thermalParams = uniformBuffer(device, 'thermal params', 32);
    this.resolveParams = uniformBuffer(device, 'resolve params', 48);
    this.maskParams = uniformBuffer(device, 'mask params', 48);
    this.nearCoarseParams = uniformBuffer(device, 'near coarse params', 32);
    this.nearSolver = new DrainageSolver(device, this.pipelines, this.nearCoarse, 'near drainage');
    this.farSolver = new DrainageSolver(device, this.pipelines, this.farCoarse, 'far drainage');
    this.farCoarseParams = uniformBuffer(device, 'far coarse params', 32);
    this.writeStaticParams();
  }

  createSourceTexture(size, samples) {
    const texture = this.device.createTexture({
      label: 'heightmap source',
      size: [size, size],
      format: 'r32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.device.queue.writeTexture({ texture }, samples, { bytesPerRow: size * 4 }, [size, size]);
    return texture;
  }

  writeStaticParams() {
    const queue = this.device.queue;
    const resolve = new StructWriter(48);
    writeGrid(resolve, this.near);
    writeGrid(resolve, this.far);
    resolve.f32(48, 64, 0, 0);
    queue.writeBuffer(this.resolveParams, 0, resolve.buffer);
    const masks = new StructWriter(48);
    writeGrid(masks, this.near);
    masks.f32(FLOW_WEIGHT * 40, 4, 20, 30, 18, WATER_LEVEL, 0, 0);
    queue.writeBuffer(this.maskParams, 0, masks.buffer);
    const nearCoarse = new StructWriter(32);
    writeGrid(nearCoarse, this.near);
    writeGrid(nearCoarse, this.nearCoarse);
    queue.writeBuffer(this.nearCoarseParams, 0, nearCoarse.buffer);
    const farCoarse = new StructWriter(32);
    writeGrid(farCoarse, this.far);
    writeGrid(farCoarse, this.farCoarse);
    queue.writeBuffer(this.farCoarseParams, 0, farCoarse.buffer);
  }

  createBindGroups() {
    const device = this.device;
    const p = this.pipelines;
    const near = this.nearSolver;
    const far = this.farSolver;
    const nearHeightView = this.nearHeight.createView();
    this.groups = {
      generateCoarse: bindGroup(device, p.generateCoarse, [this.farCoarseShape, far.gridUniform, far.height]),
      generateFar: bindGroup(device, p.generateFar, [
        this.farShape, this.farGrid, null, null, this.farHeight.createView(), far.gridUniform, far.carving,
      ]),
      downsample: bindGroup(device, p.downsample, [
        this.nearCoarseParams, this.baseHeight, null, null, null, null, near.height, near.pristine,
      ]),
      nearDifference: bindGroup(device, p.difference, [
        this.nearCoarseParams, null, near.height, near.pristine, null, null, null, null, near.carving,
      ]),
      farDifference: bindGroup(device, p.difference, [
        this.farCoarseParams, null, far.height, far.pristine, null, null, null, null, far.carving,
      ]),
      apply: [0, 1].map(c => bindGroup(device, p.apply, [
        this.nearCoarseParams, this.baseHeight, null, null, near.area[c], near.carving,
        null, null, null, this.heightFixed, this.drainage,
      ])),
      erode: bindGroup(device, p.erode, [this.dropletParams, this.heightFixed, this.sediment, this.flow]),
      relax: bindGroup(device, p.relax, [
        this.thermalParams, this.heightSnapshot, this.sedimentSnapshot, this.heightFixed, this.sediment,
      ]),
      resolve: bindGroup(device, p.resolve, [
        this.resolveParams, this.heightFixed, this.baseHeight, this.farHeight.createView(), nearHeightView,
      ]),
      masks: bindGroup(device, p.masks, [
        this.maskParams, nearHeightView, this.sediment, this.flow, this.masks.createView(),
        this.drainage, this.exposure.createView(),
      ]),
    };
    this.createGenerateGroup();
    this.nearPyramidGroups = this.pyramidGroups(this.nearHeight, this.nearPyramid, NEAR_LEVELS);
    this.farPyramidGroups = this.pyramidGroups(this.farHeight, this.farPyramid, FAR_LEVELS);
  }

  createGenerateGroup() {
    this.groups.generateNear = bindGroup(this.device, this.pipelines.generateNear, [
      this.nearShape, this.nearGrid, this.baseHeight, this.heightFixed,
      null, null, null, this.sourceParams, this.sourceHeight.createView(),
    ]);
  }

  pyramidGroups(heights, pyramid, levels) {
    const level = index => pyramid.createView({ baseMipLevel: index, mipLevelCount: 1 });
    const groups = [bindGroup(this.device, this.pipelines.pyramidBase, [heights.createView(), level(0)])];
    for (let index = 1; index < levels; index++) {
      groups.push(bindGroup(this.device, this.pipelines.pyramidReduce, [level(index - 1), level(index)]));
    }
    return groups;
  }

  // Uses imported heights (values 0..1, `size` x `size`, rows north to south) for the near
  // tile, scaled to `relief` metres above `base`. Call generate() afterwards.
  setHeightmap({ size, samples, base = 0, relief = this.settings.relief }) {
    if (!Number.isInteger(size) || size < 2 || samples.length !== size * size) {
      throw new Error('Heightmap samples must form a square grid of at least 2 x 2.');
    }
    this.sourceHeight.destroy();
    this.sourceHeight = this.createSourceTexture(size, samples);
    this.source = { mode: 1, base, relief };
    this.createGenerateGroup();
  }

  clearHeightmap() {
    this.sourceHeight.destroy();
    this.sourceHeight = this.createSourceTexture(2, new Float32Array(4));
    this.source = { mode: 0, base: 0, relief: this.settings.relief };
    this.createGenerateGroup();
  }

  get usesHeightmap() {
    return this.source.mode === 1;
  }

  writeShape(buffer, seed, finestWavelength) {
    const placement = this.placement;
    const shape = new StructWriter(48)
      .u32(seed)
      .f32(finestWavelength, this.settings.relief, SHAPE.valleyWidth)
      .f32(...placement.valleyOrigin, ...placement.valleyDirection, ...placement.cameraXZ)
      .f32(SHAPE.valleyFloor, SHAPE.valleyLength);
    this.device.queue.writeBuffer(buffer, 0, shape.buffer);
  }

  writeDroplets(batch) {
    const d = DROPLETS;
    const writer = new StructWriter(64)
      .u32(NEAR_SIZE, this.settings.seed * 1009 + batch, d.perBatch, d.lifetime)
      .f32(d.stepCells, d.radius, d.inertia, d.capacity)
      .f32(d.minSlope, d.erodeRate, d.depositRate, d.evaporation)
      .f32(d.gravity, this.near.spacing, d.maxSpeed, FLOW_WEIGHT);
    this.device.queue.writeBuffer(this.dropletParams, 0, writer.buffer);
  }

  writeThermal() {
    const thermal = new StructWriter(32)
      .u32(NEAR_SIZE)
      .f32(this.near.spacing, THERMAL.rate * this.settings.talus, THERMAL.screeTangent, THERMAL.rockTangent)
      .f32(THERMAL.looseDepth, 0, 0);
    this.device.queue.writeBuffer(this.thermalParams, 0, thermal.buffer);
  }

  // Submits one command buffer built by `encode(pass, encoder)` inside a single compute pass.
  submit(label, encode) {
    const encoder = this.device.createCommandEncoder({ label });
    const pass = encoder.beginComputePass({ label });
    encode(pass, encoder);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
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

  // Starts a full rebuild with new settings. Work runs through step() over later frames.
  generate(settings = this.settings) {
    this.settings = settings;
    this.source.relief = settings.relief;
    this.startJob(this.buildJob());
  }

  // Carves more drainage into the current near tile, then re-runs droplets on top.
  erodeMore(amount = 0.5) {
    if (this.busy) {
      return;
    }
    this.startJob(this.nearErosionJob(amount));
  }

  startJob(stages) {
    this.job = stages;
    this.jobLength = stages.length;
    this.jobDone = 0;
  }

  get busy() {
    return this.job !== null && this.jobDone < this.jobLength;
  }

  get progress() {
    return this.busy ? this.jobDone / this.jobLength : 1;
  }

  // Queues the next stage of the running job. Returns true while work remains.
  step() {
    if (!this.busy) {
      return false;
    }
    this.job[this.jobDone]();
    this.jobDone++;
    return this.busy;
  }

  // Splits `total` iterations into per-frame stages of at most `chunk`.
  chunked(total, chunk, makeStage) {
    const stages = [];
    for (let done = 0; done < total; done += chunk) {
      stages.push(makeStage(Math.min(chunk, total - done)));
    }
    return stages;
  }

  drainageStages(solver, settings, strength) {
    const stages = [() => {
      solver.writeParams(settings, strength, this.settings.talus);
      this.submit('drainage begin', pass => solver.encodeBegin(pass));
    }];
    stages.push(...this.chunked(settings.fillSweeps, FILL_SWEEPS_PER_STEP, count => () => {
      this.submit('drainage fill', pass => solver.encodeFillSweeps(pass, count));
    }));
    const iterations = Math.round(settings.iterations * Math.min(strength, 1.5));
    if (strength > 0) {
      stages.push(...this.chunked(iterations, DRAINAGE_ITERATIONS_PER_STEP, count => () => {
        this.submit('drainage', pass => solver.encodeIterations(pass, count));
      }));
    }
    return stages;
  }

  farStages() {
    const settings = this.settings;
    const far = this.farSolver;
    return [
      () => {
        this.writeShape(this.farCoarseShape, settings.seed, 2.5 * this.farCoarse.spacing);
        this.writeShape(this.farShape, settings.seed, 2.5 * this.far.spacing);
        this.submit('far coarse', (pass, encoder) => {
          dispatch2d(pass, this.pipelines.generateCoarse, this.groups.generateCoarse, far.grid.size, far.grid.size);
        });
        const encoder = this.device.createCommandEncoder({ label: 'far pristine' });
        encoder.copyBufferToBuffer(far.height, 0, far.pristine, 0, far.height.size);
        this.device.queue.submit([encoder.finish()]);
      },
      ...this.drainageStages(far, FAR_DRAINAGE, settings.drainage),
      () => {
        this.submit('far field', pass => {
          const size = far.grid.size;
          dispatch2d(pass, this.pipelines.difference, this.groups.farDifference, size, size);
          dispatch2d(pass, this.pipelines.generateFar, this.groups.generateFar, FAR_SIZE, FAR_SIZE);
          this.encodePyramid(pass, this.farPyramidGroups, FAR_SIZE);
        });
      },
    ];
  }

  nearGenerateStage() {
    return () => {
      const settings = this.settings;
      this.writeShape(this.nearShape, settings.seed, 2.5 * this.near.spacing);
      const source = new StructWriter(16).u32(this.source.mode).f32(this.source.base, this.source.relief, 0);
      this.device.queue.writeBuffer(this.sourceParams, 0, source.buffer);
      this.writeThermal();
      const encoder = this.device.createCommandEncoder({ label: 'generate near' });
      encoder.clearBuffer(this.sediment);
      encoder.clearBuffer(this.flow);
      encoder.clearBuffer(this.drainage);
      const pass = encoder.beginComputePass({ label: 'generate near' });
      const near = this.nearSolver;
      dispatch2d(pass, this.pipelines.generateNear, this.groups.generateNear, NEAR_SIZE, NEAR_SIZE);
      dispatch2d(pass, this.pipelines.downsample, this.groups.downsample, near.grid.size, near.grid.size);
      this.encodeRebuild(pass);
      pass.end();
      this.device.queue.submit([encoder.finish()]);
    };
  }

  // Applies the coarse carving to the fine tile, then runs droplets and rebuilds.
  nearFinishStages(rillAmount) {
    const near = this.nearSolver;
    const stages = [() => {
      const encoder = this.device.createCommandEncoder({ label: 'apply drainage' });
      encoder.clearBuffer(this.sediment);
      encoder.clearBuffer(this.flow);
      const pass = encoder.beginComputePass({ label: 'apply drainage' });
      dispatch2d(pass, this.pipelines.difference, this.groups.nearDifference, near.grid.size, near.grid.size);
      const apply = this.groups.apply[near.area.indexOf(near.currentArea)];
      dispatch2d(pass, this.pipelines.apply, apply, NEAR_SIZE, NEAR_SIZE);
      this.encodeRebuild(pass);
      pass.end();
      this.device.queue.submit([encoder.finish()]);
    }];
    const batches = Math.round(DROPLETS.batches * rillAmount);
    for (let first = 0; first < batches; first += DROPLET_BATCHES_PER_STEP) {
      const count = Math.min(DROPLET_BATCHES_PER_STEP, batches - first);
      stages.push(() => this.encodeDroplets(first, count));
    }
    return stages;
  }

  encodeDroplets(first, count) {
    const bytes = NEAR_SIZE * NEAR_SIZE * 4;
    for (let batch = first; batch < first + count; batch++) {
      this.writeDroplets(batch);
      const encoder = this.device.createCommandEncoder({ label: 'droplets' });
      const droplets = encoder.beginComputePass({ label: 'droplets' });
      droplets.setPipeline(this.pipelines.erode);
      droplets.setBindGroup(0, this.groups.erode);
      droplets.dispatchWorkgroups(DROPLETS.perBatch / 64);
      droplets.end();
      for (let k = 0; k < THERMAL_ITERATIONS; k++) {
        encoder.copyBufferToBuffer(this.heightFixed, 0, this.heightSnapshot, 0, bytes);
        encoder.copyBufferToBuffer(this.sediment, 0, this.sedimentSnapshot, 0, bytes);
        const thermal = encoder.beginComputePass({ label: 'thermal' });
        dispatch2d(thermal, this.pipelines.relax, this.groups.relax, NEAR_SIZE, NEAR_SIZE);
        thermal.end();
      }
      this.device.queue.submit([encoder.finish()]);
    }
    this.submit('rebuild terrain', pass => this.encodeRebuild(pass));
  }

  buildJob() {
    const settings = this.settings;
    return [
      ...this.farStages(),
      this.nearGenerateStage(),
      ...this.drainageStages(this.nearSolver, NEAR_DRAINAGE, settings.drainage),
      ...this.nearFinishStages(settings.rills),
    ];
  }

  // Continues the near drainage solve from its current state; the filled surface and
  // drainage area carry over, so no restart sweeps are needed.
  nearErosionJob(amount) {
    const near = this.nearSolver;
    const iterations = Math.round(NEAR_DRAINAGE.iterations * amount);
    const stages = [() => near.writeParams(NEAR_DRAINAGE, Math.max(this.settings.drainage, 0.25), this.settings.talus)];
    stages.push(...this.chunked(iterations, DRAINAGE_ITERATIONS_PER_STEP, count => () => {
      this.submit('drainage', pass => near.encodeIterations(pass, count));
    }));
    stages.push(...this.nearFinishStages(Math.max(this.settings.rills, 0.5)));
    return stages;
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
