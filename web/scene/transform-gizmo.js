// SPDX-License-Identifier: Apache-2.0
import {selectionAxis,selectionPivot} from './spatial-editor.js';
import {unit,cross} from './spatial.js';
import {frameUniforms} from './terrain.js';
import {projectPoint} from './sculpt-view.js';
export function gizmoGeometry(scene,ids,state,width,height,mode,space){
 const pivot=selectionPivot(scene,ids),f=frameUniforms(state,width/height),distance=Math.hypot(...pivot.map((v,i)=>v-f[i])),length=Math.max(.2,Math.min(30,(f[15]>.5?1:distance)*2*f[7]*.14)),project=p=>{const uv=projectPoint(state,width/height,p);return uv&&[uv[0]*width,uv[1]*height];},center=project(pivot);
 const handles=[0,1,2].map(axis=>{const direction=selectionAxis(scene,ids,axis,mode==='scale'?'local':space),end=project(pivot.map((x,i)=>x+direction[i]*length));let ring=[];
  if(mode==='rotate'){const a=unit(cross(direction,Math.abs(direction[1])>.9?[1,0,0]:[0,1,0])),b=cross(direction,a);ring=Array.from({length:49},(_,i)=>{const angle=i/48*Math.PI*2;return project(pivot.map((x,j)=>x+length*.75*(a[j]*Math.cos(angle)+b[j]*Math.sin(angle))));});}
  return {axis,direction,end,ring};});return {pivot,center,length,handles};
}
export function hitGizmo(geometry,x,y,mode){
 if(!geometry.center)return null;const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]),p=[x,y];
 if(mode==='scale'&&distance(p,geometry.center)<11)return {axis:0,uniform:true};
 const segment=(a,b)=>{if(!a||!b)return Infinity;const d=b.map((x,i)=>x-a[i]),t=Math.max(0,Math.min(1,(d[0]*(x-a[0])+d[1]*(y-a[1]))/(d[0]**2+d[1]**2||1)));return distance(p,a.map((x,i)=>x+d[i]*t));};
 let nearest=11,hit=null;for(const h of geometry.handles){let d;if(mode==='rotate')d=Math.min(...h.ring.slice(1).map((p,i)=>segment(h.ring[i],p)));else{if(!h.end||distance(geometry.center,h.end)<15)continue;d=mode==='scale'?distance(p,h.end):segment(geometry.center.map((x,i)=>x+(h.end[i]-x)*.2),h.end);}if(d<nearest){nearest=d;hit={axis:h.axis,uniform:false};}}return hit;
}
