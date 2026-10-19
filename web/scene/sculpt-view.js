// SPDX-License-Identifier: Apache-2.0
import {cameraRay as modelRay} from '../camera/model.js';
import { frameUniforms, normalize } from './terrain.js';
import { intersectHeightfield, GRID } from '../render/heightfield.js';
export function cameraRay(state,aspect,u,v) {
  return modelRay({...state,lens:state.lens?{...state.lens,dof:false}:undefined},aspect,u,v);
}
export function pickTerrain(field,state,aspect,u,v) {
  if(!field||u<0||u>1||v<0||v>1)return null;
  const {origin,direction}=cameraRay(state,aspect,u,v),hit=intersectHeightfield(field,origin,direction);
  return hit?origin.map((x,i)=>x+direction[i]*hit.t):null;
}
export function fieldHeight(field,x,z) {
  const gx=Math.max(0,Math.min(GRID,(x+32)*2)),gz=Math.max(0,Math.min(GRID,(z+32)*2));
  const ix=Math.min(GRID-1,Math.floor(gx)),iz=Math.min(GRID-1,Math.floor(gz)),u=gx-ix,v=gz-iz;
  const a=(iz*(GRID+1)+ix)*12+1,b=a+(GRID+1)*12,c=a+12,d=b+12,h=field.vertices;
  return u+v<=1?h[a]*(1-u-v)+h[c]*u+h[b]*v:h[d]*(u+v-1)+h[b]*(1-u)+h[c]*(1-v);
}
export function projectPoint(state,aspect,point) {
  const f=frameUniforms(state,aspect),d=point.map((v,i)=>v-f[i]),dot=offset=>d.reduce((n,v,i)=>n+v*f[offset+i],0),depth=dot(12);
  if(depth<=.1)return null;
  return [.5+dot(4)/((f[15]>.5?1:depth)*f[7]*aspect)*.5,.5-dot(8)/((f[15]>.5?1:depth)*f[7])*.5];
}
