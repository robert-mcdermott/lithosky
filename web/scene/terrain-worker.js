// SPDX-License-Identifier: Apache-2.0
import { exportSamples } from './heightmaps.js';
import { TerrainCache } from './generation.js';
const cache = new TerrainCache();
self.onmessage = async ({ data: { id, state, action, resolution } }) => {
  try {
    if(action==='final') {
      const field=await cache.final(state,resolution,{onProgress:progress=>self.postMessage({id,progress})});
      self.postMessage({id,result:field},[field.vertices.buffer,field.hierarchy.buffer]);return;
    }
    const result = await cache.build(state, { onProgress: progress => self.postMessage({ id, progress }) });
    if(action==='export'){const data=exportSamples(cache,state);self.postMessage({id,result:data},[data.raw.buffer]);return;}
    const transfer = [result.mesh.buffer];
    if (result.field) transfer.push(result.field.vertices.buffer,result.field.hierarchy.buffer);
    self.postMessage({ id, result }, transfer);
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
