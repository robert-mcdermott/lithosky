// SPDX-License-Identifier: Apache-2.0
import {cameraFrame,cameraDefaults} from './model.js';
import {boundsFor,worldMatrix} from '../scene/spatial.js';
import {entityScene,entityState,kindOf} from '../scene/entities.js';
import {descendants} from '../scene/spatial-editor.js';
export function editorFrame(editor,aspect){
 const {mode,target,span}=editor;let right,up,forward;
 if(mode==='top'){right=[1,0,0];up=[0,0,-1];forward=[0,-1,0];}
 else if(mode==='front'){right=[1,0,0];up=[0,1,0];forward=[0,0,-1];}
 else if(mode==='side'){right=[0,0,-1];up=[0,1,0];forward=[-1,0,0];}
 else return null;
 const eye=target.map((x,i)=>x-forward[i]*512);return new Float32Array([...eye,aspect,...right,span/2,...up,0,...forward,1]);
}
export function editorCamera(state){const l=state.lens??cameraDefaults(state);return {mode:'perspective',target:[l.targetX,l.targetY,l.targetZ],span:32,yaw:state.yaw,pitch:state.pitch,distance:state.distance,lens:structuredClone(l)};}
export function viewCamera(editor){return {yaw:editor.yaw,pitch:editor.pitch,distance:editor.distance,lens:{...editor.lens,targetX:editor.target[0],targetY:editor.target[1],targetZ:editor.target[2]}};}
export function selectionBounds(scene,ids,field){const graph=entityScene(scene),set=new Set(ids.flatMap(id=>descendants(graph,id).map(n=>n.id))),bounds=[];
 for(const n of graph.entities){if(!set.has(n.id)||!entityState(graph,n.id).visible)continue;const k=kindOf(n);if(k==='primitive')bounds.push(boundsFor(worldMatrix(graph,n.id),n.components.primitive.shape));else if(k==='terrain')bounds.push({min:[-32,field?.low??0,-32],max:[32,field?.high??8,32]});else if(k==='water')bounds.push({min:[-32,n.components.water.level,-32],max:[32,n.components.water.level,32]});else if(k==='light'){const l=n.components.areaLight,r=Math.hypot(l.width,l.height)/2;bounds.push({min:[l.x-r,l.y-r,l.z-r],max:[l.x+r,l.y+r,l.z+r]});}}
 if(!bounds.length)throw Error('Select visible geometry to frame.');return {min:[0,1,2].map(i=>Math.min(...bounds.map(b=>b.min[i]))),max:[0,1,2].map(i=>Math.max(...bounds.map(b=>b.max[i])))};
}
export function frameBounds(editor,bounds,aspect){const target=bounds.min.map((v,i)=>(v+bounds.max[i])/2),radius=Math.max(.1,Math.hypot(...bounds.max.map((v,i)=>(v-bounds.min[i])/2))),next={...editor,target};
 if(editor.mode==='perspective'){const half=36/Math.max(1,aspect)/(2*editor.lens.focalLength),angle=Math.atan(half*Math.min(1,aspect));next.distance=Math.min(512,Math.max(.5,radius/Math.sin(angle)*1.12));}
 else {const f=editorFrame({...editor,target},aspect),size=bounds.max.map((v,i)=>v-bounds.min[i]),width=size.reduce((v,x,i)=>v+x*Math.abs(f[4+i]),0),height=size.reduce((v,x,i)=>v+x*Math.abs(f[8+i]),0);next.span=Math.min(1024,Math.max(.5,1.2*Math.max(height,width/aspect)));}
 return next;
}
