// SPDX-License-Identifier: Apache-2.0
import {noise} from '../scene/noise.js';
import {evaluateGeology,geologyDefaults} from './geology.js';
import {materialDefaults} from '../scene/materials.js';
export const FINISHES=['solid','rock','snow','sand','ground'];
export function objectSurface(object,p,normal,footprint=.35){const f=object.finish;if(!f||f.preset==='solid')return {color:object.color,normal,roughness:object.roughness};
 const surface=evaluateGeology({...materialDefaults(),preset:f.preset,detail:f.detail,geology:{...geologyDefaults(),scale:f.scale,roughness:object.roughness}},p,normal,footprint,0,'natural');
 surface.color=surface.color.map((v,i)=>v*object.color[i]);return surface;
}
export const linearChannel=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
export const srgbChannel=x=>x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;
export const hexColor=color=>'#'+color.map(x=>Math.round(Math.max(0,Math.min(1,srgbChannel(x)))*255).toString(16).padStart(2,'0')).join('');
export const linearColor=hex=>[1,3,5].map(i=>linearChannel(parseInt(hex.slice(i,i+2),16)/255));

// Raster uses broad seeded color only; exact joints, grain and bump belong to traced views.
export function objectPreviewColor(object,x,y,z){const f=object.finish;if(!f||f.preset==='solid')return object.color;const scale=f.scale,n=noise((x+y*.37)/scale,z/scale,1777),bases={rock:[.34,.305,.24],snow:[.82,.87,.9],sand:[.46,.345,.185],ground:[.137,.1775,.044]},factor=1+(n-.5)*f.detail*.7+(f.preset==='rock'?Math.sin(y*12/scale+n*2)*.04:0);return bases[f.preset].map((v,i)=>v*object.color[i]*factor);}
