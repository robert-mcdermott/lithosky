// SPDX-License-Identifier: Apache-2.0
export const MAX_PROJECT_BYTES=20*1024*1024;
export const HEIGHTMAP_RESOLUTIONS=[128,256,512,1024,2048];
export function decodeHeightSamples(raw,state) {
  if(!HEIGHTMAP_RESOLUTIONS.includes(state.resolution)||raw.byteLength!==2*(state.resolution+1)**2)throw new Error('Height sample size mismatch.');
  const bytes=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),heights=new Float32Array(raw.byteLength/2);
  for(let i=0;i<heights.length;i++)heights[i]=state.minimum+bytes.getUint16(i*2,false)/65535*(state.maximum-state.minimum);
  return heights;
}
export async function loadHeightSamples(state) {
  const session=await fetch('/api/session');if(!session.ok)throw new Error('Cannot authenticate heightmap access.');
  const {token}=await session.json(),response=await fetch('/api/heightmaps/'+state.asset,{headers:{'X-Lithosky-Session':token}});
  if(!response.ok)throw new Error('Heightmap asset missing or damaged. Reopen the portable scene.');
  const raw=new Uint8Array(await response.arrayBuffer());
  if(raw.byteLength!==2*(state.resolution+1)**2)throw new Error('Height sample size mismatch.');
  return raw;
}
export function quantizeHeights(heights,resolution) {
  if(!HEIGHTMAP_RESOLUTIONS.includes(resolution)||heights.length!==(resolution+1)**2)throw new Error('Invalid heightmap export budget.');
  let minimum=Infinity,maximum=-Infinity;
  for(const h of heights){if(!Number.isFinite(h)||h<-64||h>64)throw new Error('Heightmap export range must be within −64…64 base-height units.');minimum=Math.min(minimum,h);maximum=Math.max(maximum,h);}
  const raw=new Uint8Array(heights.length*2),view=new DataView(raw.buffer),range=maximum-minimum;
  for(let i=0;i<heights.length;i++)view.setUint16(i*2,range?Math.round((heights[i]-minimum)/range*65535):0,false);
  return {raw,minimum,maximum};
}
export function exportSamples(cache,state) {
  const untouched=state.generator==='heightmap-v1'&&!state.sculpt.length;
  const data=untouched?{raw:cache.base.raw.slice(),minimum:state.minimum,maximum:state.maximum}:quantizeHeights(cache.effective.heights,cache.effective.resolution);
  return {raw:data.raw,scale:{format:'lithosky-heightmap',version:1,resolution:cache.effective.resolution,minimum:data.minimum,maximum:data.maximum,metersPerUnit:state.metersPerUnit??1,elevation:state.elevation,rowOrder:'z-increasing'}};
}
export function importedTerrain(previous,asset,scale) {
  return {generator:'heightmap-v1',seed:previous.seed,elevation:scale.elevation,palette:previous.palette,resolution:scale.resolution,sculpt:[],asset,minimum:scale.minimum,maximum:scale.maximum,metersPerUnit:scale.metersPerUnit};
}
