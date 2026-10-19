// SPDX-License-Identifier: Apache-2.0
import {cameraRay} from '../camera/model.js';
import {intersectHeightfield} from '../render/heightfield.js';
import {lightFrame,dot} from '../lighting/model.js';
import {entityScene,entityState,kindOf} from './entities.js';
export function lightCorners(light) {
 const {t,b}=lightFrame(light),center=[light.x,light.y,light.z];
 return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>center.map((x,i)=>x+t[i]*u*light.width/2+b[i]*v*light.height/2));
}
export function pickEntity(scene,state,field,aspect,u,v) {
 if(u<0||u>1||v<0||v>1)return null;
 const graph=scene.version===11?scene:entityScene(scene),ray=cameraRay({...state,lens:state.lens?{...state.lens,dof:false}:undefined},aspect,u,v);let distance=Infinity,picked=null;
 const visible=kind=>{const n=graph.entities.find(n=>kindOf(n)===kind);return n&&entityState(graph,n.id).visible?n:null;};
 const land=visible('terrain');if(land&&field){const hit=intersectHeightfield(field,ray.origin,ray.direction);if(hit){distance=hit.t;picked=land.id;}}
 const water=visible('water');if(water&&state.waterEnabled&&Math.abs(ray.direction[1])>1e-8){const t=(state.waterLevel-ray.origin[1])/ray.direction[1],p=ray.origin.map((x,i)=>x+ray.direction[i]*t);if(t>.001&&t<distance&&Math.abs(p[0])<=32&&Math.abs(p[2])<=32){distance=t;picked=water.id;}}
 for(const n of graph.entities.filter(n=>kindOf(n)==='light')){if(!entityState(graph,n.id).visible)continue;const l=n.components.areaLight,{n:normal,t:right,b:up}=lightFrame(l),denom=dot(ray.direction,normal);if(Math.abs(denom)<1e-8)continue;const delta=[l.x,l.y,l.z].map((x,i)=>x-ray.origin[i]),t=dot(delta,normal)/denom,p=ray.origin.map((x,i)=>x+ray.direction[i]*t-[l.x,l.y,l.z][i]);if(t>.001&&t<distance&&Math.abs(dot(p,right))<=l.width/2&&Math.abs(dot(p,up))<=l.height/2){distance=t;picked=n.id;}}
 return picked??visible('environment')?.id??null;
}
