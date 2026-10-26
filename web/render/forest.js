// SPDX-License-Identifier: Apache-2.0
// The scene's plants on the near tile, baked on the GPU from the terrain's forest map, the
// scene's surface and vegetation, and its vegetation paint (trace/canopy.wgsl):
//   treeMap  one tree or shrub per cell (base height, kind, height)
//   reachMap which trees and shrubs reach each cell, and its grass height
//   canopy   the pyramid bounding the ground, grass and crowns
// The view's tracer, exports and region renders share them. A bake runs before the next
// sample once the terrain has finished building, and again whenever the terrain is rebuilt
// or the surface changes.

import { bindGroup, computePipeline, dispatch2d, storageTexture, uniformBuffer } from '../gpu/device.js';
import { NEAR_LEVELS, NEAR_SIZE } from '../terrain/terrain.js';
import { SURFACE_BYTES, surfaceUniform } from './biomes.js';
import { NEUTRAL, PAINT_SIZE } from '../scene/paint.js';

const ENTRIES = ['plantTrees', 'bakeCanopy', 'reduceCanopy'];

export class Forest {
  static async create(device, terrain) {
    const built = await Promise.all(ENTRIES.map(entry => computePipeline(device, 'trace/canopy.wgsl', entry)));
    return new Forest(device, terrain, Object.fromEntries(ENTRIES.map((entry, i) => [entry, built[i]])));
  }

  constructor(device, terrain, pipelines) {
    this.device = device;
    this.terrain = terrain;
    this.pipelines = pipelines;
    this.fieldsBuffer = uniformBuffer(device, 'forest fields', 64);
    this.surfaceBuffer = uniformBuffer(device, 'forest surface', SURFACE_BYTES);
    const size = [NEAR_SIZE, NEAR_SIZE];
    this.treeMap = storageTexture(device, 'tree map', size, 'rg32uint');
    this.reachMap = storageTexture(device, 'reach map', size, 'r32uint');
    this.paintMap = device.createTexture({
      label: 'vegetation paint',
      size: [PAINT_SIZE, PAINT_SIZE],
      format: 'r8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.setPaint(null);
    this.canopy = storageTexture(device, 'canopy', size, 'r32float', { mipLevelCount: NEAR_LEVELS });
    // The terrain version of the last bake; -1 forces the next one.
    this.bakedVersion = -1;
    this.createGroups();
  }

  createGroups() {
    const { plantTrees, bakeCanopy, reduceCanopy } = this.pipelines;
    const level = index => this.canopy.createView({ baseMipLevel: index, mipLevelCount: 1 });
    const terrain = this.terrain;
    const paint = this.paintMap.createView();
    this.plantGroup = bindGroup(this.device, plantTrees, [
      this.fieldsBuffer, this.surfaceBuffer, terrain.nearHeight.createView(), terrain.forest.createView(),
      null, null, this.treeMap.createView(), null, null, null, null, null, paint,
    ], 'plant trees');
    this.canopyGroups = [bindGroup(this.device, bakeCanopy, [
      this.fieldsBuffer, this.surfaceBuffer, terrain.nearHeight.createView(), terrain.forest.createView(), level(0),
      null, null, this.treeMap.createView(), null, null, this.reachMap.createView(), null, paint,
    ], 'canopy')];
    for (let index = 1; index < NEAR_LEVELS; index++) {
      this.canopyGroups.push(bindGroup(this.device, reduceCanopy, [null, null, null, null, level(index), level(index - 1)], 'canopy reduce'));
    }
  }

  // Takes the plants' biome, tree line and vegetation settings from `scene`.
  update(scene) {
    this.device.queue.writeBuffer(this.surfaceBuffer, 0, surfaceUniform(scene));
    this.bakedVersion = -1;
  }

  // The vegetation paint's levels (scene/paint.js), or null for none.
  setPaint(levels) {
    // r8unorm holds level / 15.
    const bytes = new Uint8Array(PAINT_SIZE * PAINT_SIZE).fill(NEUTRAL * 17);
    if (levels) {
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = levels[i] * 17;
      }
    }
    this.device.queue.writeTexture({ texture: this.paintMap }, bytes, { bytesPerRow: PAINT_SIZE }, [PAINT_SIZE, PAINT_SIZE]);
    this.bakedVersion = -1;
  }

  // Encodes a bake into `encoder` when one is due. Returns whether the trees can be traced:
  // false while the terrain is still building.
  prepare(encoder) {
    const terrain = this.terrain;
    if (terrain.busy) {
      return false;
    }
    if (this.bakedVersion !== terrain.version) {
      this.device.queue.writeBuffer(this.fieldsBuffer, 0, terrain.fieldsUniform());
      const pass = encoder.beginComputePass({ label: 'forest bake' });
      dispatch2d(pass, this.pipelines.plantTrees, this.plantGroup, NEAR_SIZE, NEAR_SIZE);
      this.canopyGroups.forEach((group, index) => {
        const pipeline = index === 0 ? this.pipelines.bakeCanopy : this.pipelines.reduceCanopy;
        const size = Math.max(1, NEAR_SIZE >> index);
        dispatch2d(pass, pipeline, group, size, size);
      });
      pass.end();
      this.bakedVersion = terrain.version;
    }
    return true;
  }
}
