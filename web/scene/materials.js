// SPDX-License-Identifier: Apache-2.0
import { noise } from './noise.js';
export const materialDefaults = () => ({preset:'rules',snowHeight:5.4,sandHeight:.6,rockSlope:39,blend:.6,detail:.25,detailScale:1});
const clamp = x => Math.max(0,Math.min(1,x));
const smooth = (a,b,x) => {const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const mix = (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t);
// Linear reflectances, authored here; no downloaded textures. Detail affects color
// only, so both renderers retain the same normals, silhouettes and triangle mesh.
export function materialColor(x,z,height,normal,state) {
  const m=state.materials,alien=state.palette==='otherworld';
  const colors=alien ? {ground:[.36,.27,.46],rock:[.43,.38,.53],sand:[.58,.41,.48],snow:[.83,.78,.93]}
    : {ground:[.28,.35,.26],rock:[.39,.41,.37],sand:[.5,.48,.34],snow:[.82,.85,.82]};
  let color=colors[m.preset];
  if(m.preset==='rules') {
    const slope=Math.acos(clamp(normal[1]))*180/Math.PI;
    const rock=smooth(m.rockSlope-m.blend*8,m.rockSlope+m.blend*8,slope);
    const sand=1-smooth(m.sandHeight-m.blend,m.sandHeight+m.blend,height);
    const snow=smooth(m.snowHeight-m.blend,m.snowHeight+m.blend,height)*(1-rock);
    color=mix(mix(mix(colors.ground,colors.sand,sand),colors.rock,rock),colors.snow,snow);
  }
  const grain=(noise(x*m.detailScale,z*m.detailScale,state.seed+911)*.7+noise(x*m.detailScale*2,z*m.detailScale*2,state.seed+1777)*.3)*2-1;
  return color.map(c=>clamp(c*(1+grain*m.detail*.45)));
}
