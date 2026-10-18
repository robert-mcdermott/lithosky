// SPDX-License-Identifier: Apache-2.0
import { heightAt, normalize, surfacePoint } from './terrain.js';
import { buildHierarchy } from '../render/heightfield.js';
import { sculptHeights } from './sculpt.js';
export const RENDER_GRID = 128;
export const RESOLUTIONS = Object.freeze([256, 512, 1024, 2048]);
export function terrainBudget(resolution) {
  if (!RESOLUTIONS.includes(resolution)) throw new Error('Unsupported terrain resolution.');
  const heightBytes = (resolution + 1) ** 2 * 4;
  // Pristine/sculpted/replacement grids plus bounded smoothing scratch and surfaces.
  return { resolution, samples: (resolution + 1) ** 2, heightBytes, peakBytes: heightBytes * 3 + 14 * 1024 * 1024 };
}
export function baseKey(state) {
  return JSON.stringify([state.generator || 'terrain-v1', state.seed,
    state.generator === 'layers-v1' ? state.resolution : 128,
    state.generator === 'layers-v1' ? state.layers.filter(l => l.enabled).map(l => [l.kind,l.strength,l.scale,l.kind === 'terrace' ? 1 : l.octaves]) : []]);
}
export const heightKey = state => JSON.stringify([baseKey(state), state.sculpt ?? []]);
export const surfaceKey = state => JSON.stringify([heightKey(state), state.elevation, state.palette, state.materials ?? null]);
export const geometryKey = state => JSON.stringify([surfaceKey(state), state.waterEnabled, state.waterEnabled ? state.waterLevel : 0]);
const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));
function canceled(signal) { if (signal?.aborted) throw new DOMException('Terrain generation canceled.', 'AbortError'); }

// Dense scalar storage stays in the worker. Only bounded render buffers cross to UI.
// Row chunks give progress and test cancellation; UI cancellation terminates the worker.
export async function generateHeights(state, { signal, onProgress = () => {}, yieldControl = yieldTask } = {}) {
  const layered = state.generator === 'layers-v1', resolution = layered ? terrainBudget(state.resolution).resolution : RENDER_GRID;
  const plain = { ...state, elevation: 1 }, size = resolution + 1;
  const heights = new Float32Array(size * size);
  for (let z = 0; z <= resolution; z++) {
    canceled(signal);
    for (let x = 0; x <= resolution; x++) heights[z * size + x] = heightAt(x / resolution * 64 - 32, z / resolution * 64 - 32, plain);
    if (z % 16 === 0 || z === resolution) { onProgress((z + 1) / size); await yieldControl(); }
  }
  canceled(signal);
  return sampleHeights(heights, resolution, layered ? null : plain);
}
export function sampleHeights(heights, resolution, legacy = null) {
  const size = resolution + 1;
  const sample = (x, z) => {
    const gx = Math.max(0, Math.min(resolution, (x + 32) / 64 * resolution));
    const gz = Math.max(0, Math.min(resolution, (z + 32) / 64 * resolution));
    const ix = Math.min(resolution - 1, Math.floor(gx)), iz = Math.min(resolution - 1, Math.floor(gz));
    const u = gx - ix, v = gz - iz, i = iz * size + ix;
    return (heights[i] * (1-u) + heights[i+1] * u) * (1-v) + (heights[i+size] * (1-u) + heights[i+size+1] * u) * v;
  };
  // Preserve the original generator's double-precision samples and 0.08 normals.
  const at = legacy ? (x, z) => heightAt(x, z, legacy) : sample;
  const samples = new Float64Array((RENDER_GRID + 1) ** 2 * 5);
  for (let z = 0; z <= RENDER_GRID; z++) for (let x = 0; x <= RENDER_GRID; x++) {
    const px = x * .5 - 32, pz = z * .5 - 32, i = (z * (RENDER_GRID+1) + x) * 5;
    samples.set([at(px,pz),at(px-.08,pz),at(px+.08,pz),at(px,pz-.08),at(px,pz+.08)],i);
  }
  return { heights, samples, resolution };
}
function buildSurface(base, state) {
  const vertices = new Float32Array((RENDER_GRID+1) ** 2 * 12);
  let low = Infinity, high = -Infinity;
  for (let z = 0; z <= RENDER_GRID; z++) for (let x = 0; x <= RENDER_GRID; x++) {
    const i = (z * (RENDER_GRID+1) + x), s = i * 5, a = base.samples, e = state.elevation;
    const normal = normalize([a[s+1]*e-a[s+2]*e,.16,a[s+3]*e-a[s+4]*e]);
    const p = surfacePoint(x*.5-32,z*.5-32,a[s]*e,normal,{...state,waterEnabled:false});
    vertices.set(p.slice(0,3),i*12);vertices.set(p.slice(3,6),i*12+4);vertices.set(p.slice(6,9),i*12+8);
    low=Math.min(low,vertices[i*12+1]);high=Math.max(high,vertices[i*12+1]);
  }
  return { vertices, low, high };
}
function buildPreview(field, base, state) {
  const points = new Float32Array((RENDER_GRID+1) ** 2 * 9);
  for (let i=0;i<points.length/9;i++) {
    const v=field.vertices, j=i*12;
    // Retain traced terrain reflectance unless a preview water surface covers it.
    const rawHeight=base.samples[i*5]*state.elevation;
    const water=state.waterEnabled && rawHeight<state.waterLevel;
    const p=water ? surfacePoint(v[j],v[j+2],rawHeight,[0,1,0],state) : [...v.slice(j,j+3),...v.slice(j+4,j+7),...v.slice(j+8,j+11)];
    points.set(p,i*9);
  }
  const mesh=new Float32Array(RENDER_GRID**2*54);let offset=0;
  for(let z=0;z<RENDER_GRID;z++) for(let x=0;x<RENDER_GRID;x++) {
    const a=z*(RENDER_GRID+1)+x,b=a+RENDER_GRID+1,c=a+1,d=b+1;
    for(const i of [a,b,c,c,b,d]) {mesh.set(points.subarray(i*9,i*9+9),offset);offset+=9;}
  }
  return mesh;
}
export class TerrainCache {
  async build(state, options) {
    const heightsChanged=this.heightsKey!==heightKey(state);
    const surfaceChanged=this.fieldKey!==surfaceKey(state);
    const noiseChanged=this.noiseKey!==baseKey(state);
    if(noiseChanged) {
      this.base=await generateHeights(state, state.sculpt?.length ? {...options,onProgress:p=>options?.onProgress?.(p*.5)} : options);this.noiseKey=baseKey(state);
    }
    if(heightsChanged) {
      if(state.sculpt?.length) {
        const heights=await sculptHeights(this.base.heights,this.base.resolution,state.sculpt,noiseChanged ? {...options,onProgress:p=>options?.onProgress?.(.5+p*.5)} : options);
        this.effective=sampleHeights(heights,this.base.resolution);
      } else this.effective=this.base;
      this.heightsKey=heightKey(state);
    }
    if(surfaceChanged) {
      const boundsKey=JSON.stringify([heightKey(state),state.elevation]);
      this.field=buildSurface(this.effective,state);
      if(this.boundsKey!==boundsKey){this.hierarchy=buildHierarchy(this.field);this.boundsKey=boundsKey;}
      this.field.hierarchy=this.hierarchy;this.fieldKey=surfaceKey(state);
    }
    return { mesh:buildPreview(this.field,this.effective,state), field:surfaceChanged?{...this.field,vertices:this.field.vertices.slice(),hierarchy:this.field.hierarchy.slice()}:null,
      heightsChanged,surfaceChanged,noiseChanged,resolution:this.base.resolution };
  }
}

export const renderKey = state => JSON.stringify([geometryKey(state), state.yaw, state.pitch, state.distance, state.sun]);
