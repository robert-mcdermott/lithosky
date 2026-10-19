// SPDX-License-Identifier: Apache-2.0
import {editorFrame,viewCamera} from './editor.js';
export const FRAMES=Object.freeze({'16:9':16/9,'3:2':3/2,'2:3':2/3,'1:1':1});
export const LONG_EDGES=Object.freeze([640,960,1280,1600,2048]);
const norm=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const frameAspect=state=>FRAMES[state.lens?.frame??'16:9'];
export function cameraDefaults(camera={},metresPerUnit=100) {
 return {model:'thin-lens-v1',frame:'16:9',focalLength:21.09375,fNumber:8,dof:false,focusDistance:(camera.distance??23)*metresPerUnit,metresPerUnit,targetX:0,targetY:1.8,targetZ:-4,roll:0};
}
export function enableCamera(scene) {
 scene.camera.lens??=cameraDefaults(scene.camera,scene.atmosphere?.metresPerUnit??100);
 scene.version=10;if(scene.terrain.generator==='layers-v1')scene.terrain.sculpt??=[];return scene;
}
export function imageDimensions(longEdge,frame='16:9') {
 if(!LONG_EDGES.includes(longEdge)||!Object.hasOwn(FRAMES,frame))throw Error('Unsupported output size or frame.');
 const a=FRAMES[frame];return a>=1?{width:longEdge,height:Math.round(longEdge/a)}:{width:Math.round(longEdge*a),height:longEdge};
}
export function previewDimensions(state) {const a=frameAspect(state);return a>=1?{width:320,height:Math.round(320/a)}:{width:Math.round(320*a),height:320};}
export function cameraFrame(state,aspect) {
 if(state.editor){const frame=editorFrame(state.editor,aspect);if(frame)return frame;return cameraFrame({...state,...viewCamera(state.editor),editor:undefined},aspect);}
 const l=state.lens,target=l?[l.targetX,l.targetY,l.targetZ]:[0,1.8,-4];
 const eye=[Math.sin(state.yaw)*Math.cos(state.pitch)*state.distance+target[0],Math.sin(state.pitch)*state.distance+target[1],Math.cos(state.yaw)*Math.cos(state.pitch)*state.distance+target[2]];
 const forward=norm(target.map((v,i)=>v-eye[i])),r=norm(cross(forward,[0,1,0])),u=cross(r,forward),roll=(l?.roll??0)*Math.PI/180;
 const right=r.map((x,i)=>x*Math.cos(roll)+u[i]*Math.sin(roll)),up=u.map((x,i)=>x*Math.cos(roll)-r[i]*Math.sin(roll));
 const half=l?36/Math.max(1,aspect)/(2*l.focalLength):.48;
 return new Float32Array([...eye,aspect,...right,half,...up,0,...forward,0]);
}
export function lensUniforms(state) {const l=state.lens;return new Float32Array(l?[1,l.focusDistance/l.metresPerUnit,l.dof?l.focalLength/(2*l.fNumber)/1000/l.metresPerUnit:0,0]:[0,1,0,0]);}
export function cameraRay(state,aspect,u,v,diskU=0,diskV=0) {
 const f=cameraFrame(state,aspect),lens=lensUniforms(state),origin=Array.from(f.slice(0,3));
 if(f[15]>.5){for(let i=0;i<3;i++)origin[i]+=f[4+i]*(2*u-1)*f[7]*aspect+f[8+i]*(1-2*v)*f[7];return {origin,direction:Array.from(f.slice(12,15))};}
 let direction=norm([0,1,2].map(i=>f[12+i]+f[4+i]*(2*u-1)*f[7]*aspect+f[8+i]*(1-2*v)*f[7]));
 if(lens[2]>0){const radius=Math.sqrt(diskU)*lens[2],angle=2*Math.PI*diskV,axial=direction.reduce((s,x,i)=>s+x*f[12+i],0),focus=origin.map((x,i)=>x+direction[i]*lens[1]/axial);
  for(let i=0;i<3;i++)origin[i]+=radius*(Math.cos(angle)*f[4+i]+Math.sin(angle)*f[8+i]);direction=norm(focus.map((x,i)=>x-origin[i]));}
 return {origin,direction};
}
export function pixelRegion(width,height,region) {
 const r=region??{x:0,y:0,width,height};
 if(!['x','y','width','height'].every(k=>Number.isInteger(r[k]))||r.x<0||r.y<0||r.width<1||r.height<1||r.x+r.width>width||r.y+r.height>height)throw Error('Render region is outside the full frame.');
 return {x:r.x,y:r.y,width:r.width,height:r.height};
}
export function percentRegion(width,height,r) {
 if(!r||!['x','y','width','height'].every(k=>Number.isFinite(r[k]))||r.x<0||r.y<0||r.width<1||r.height<1||r.x+r.width>100.000001||r.y+r.height>100.000001)throw Error('Choose a region inside the frame.');
 const x=Math.floor(width*r.x/100),y=Math.floor(height*r.y/100);
 return pixelRegion(width,height,{x,y,width:Math.min(width-x,Math.max(1,Math.round(width*r.width/100))),height:Math.min(height-y,Math.max(1,Math.round(height*r.height/100)))});
}
