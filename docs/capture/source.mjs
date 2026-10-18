// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export const renderSources = ['main.go','web/app.js','web/index.html','web/styles.css','web/scene/terrain.js','web/scene/sculpt.js','web/scene/sculpt-view.js','web/scene/sculpt-controls.js','web/scene/noise.js','web/scene/generation.js','web/scene/generator.js','web/scene/terrain-worker.js','web/scene/terrain-controls.js','web/scene/document.js','web/scene/history.js','web/scene/studies.js','web/scenes/studies.json','web/render/trace.wgsl','web/render/tracer.js','web/render/heightfield.js','web/render/studio.js'];
export const digest = data => createHash('sha256').update(data).digest('hex');
export function sourceHash(root) {
  const hash=createHash('sha256');
  for(const path of renderSources) { hash.update(path+'\0');hash.update(readFileSync(join(root,path))); }
  return hash.digest('hex');
}
