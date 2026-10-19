// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export const renderSources = ['web/lighting/model.js','web/lighting/transport.wgsl','web/lighting/controls.js','internal/scene/schema.json','web/material/geology.js','web/material/geology.wgsl','main.go','web/atmosphere/solar.js','web/atmosphere/model.js','web/atmosphere/controls.js','web/atmosphere/atmosphere.wgsl','web/app.js','web/index.html','web/styles.css','web/scene/terrain.js','web/scene/heightmaps.js','web/scene/heightmap-controls.js','web/scene/materials.js','web/scene/material-controls.js','web/scene/sculpt.js','web/scene/sculpt-view.js','web/scene/sculpt-controls.js','web/scene/noise.js','web/scene/generation.js','web/scene/generator.js','web/scene/terrain-worker.js','web/scene/terrain-controls.js','web/scene/document.js','web/scene/history.js','web/scene/studies.js','web/scenes/studies.json','web/render/trace.wgsl','web/render/tracer.js','web/render/heightfield.js','web/render/studio.js'];
export const digest = data => createHash('sha256').update(data).digest('hex');
export function sourceHash(root) {
  const hash=createHash('sha256');
  for(const path of renderSources) { hash.update(path+'\0');hash.update(readFileSync(join(root,path))); }
  return hash.digest('hex');
}
