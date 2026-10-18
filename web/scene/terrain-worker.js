// SPDX-License-Identifier: Apache-2.0
import { TerrainCache } from './generation.js';
const cache = new TerrainCache();
self.onmessage = async ({ data: { id, state } }) => {
  try {
    const result = await cache.build(state, { onProgress: progress => self.postMessage({ id, progress }) });
    const transfer = [result.mesh.buffer];
    if (result.field) transfer.push(result.field.vertices.buffer,result.field.hierarchy.buffer);
    self.postMessage({ id, result }, transfer);
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
