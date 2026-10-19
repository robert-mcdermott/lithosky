// SPDX-License-Identifier: Apache-2.0
// Original bounded world-XZ paint masks. Stroke data is portable; the 64² mask is derived.
export const MASK_GRID=64,MAX_PAINT_STROKES=32,MAX_PAINT_POINTS=512;
export const PAINT_MATERIALS=['rock','snow','sand','ground'];
const cache=new Map();
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export function strokeWeight(stroke,x,z){let distance=Infinity;const p=stroke.points;
 for(let i=0;i<p.length;i++){const a=p[Math.max(0,i-1)],b=p[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));distance=Math.min(distance,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));}
 return stroke.strength*(1-smooth(distance/stroke.radius));
}
export function paintMask(strokes=[]){const key=JSON.stringify(strokes);if(cache.has(key))return cache.get(key);const data=new Float32Array(MASK_GRID*MASK_GRID*4);
 for(let z=0;z<MASK_GRID;z++)for(let x=0;x<MASK_GRID;x++){const i=(z*MASK_GRID+x)*4;for(const stroke of strokes){const w=strokeWeight(stroke,x/(MASK_GRID-1)*64-32,z/(MASK_GRID-1)*64-32),channel=PAINT_MATERIALS.indexOf(stroke.material);for(let c=0;c<4;c++)data[i+c]=data[i+c]*(1-w)+(c===channel?w:0);}}
 cache.set(key,data);if(cache.size>2)cache.delete(cache.keys().next().value);return data;
}
export function paintWeights(strokes,x,z){if(!strokes?.length)return [0,0,0,0];const data=paintMask(strokes),gx=Math.max(0,Math.min(MASK_GRID-1,(x+32)/64*(MASK_GRID-1))),gz=Math.max(0,Math.min(MASK_GRID-1,(z+32)/64*(MASK_GRID-1))),ix=Math.min(MASK_GRID-2,Math.floor(gx)),iz=Math.min(MASK_GRID-2,Math.floor(gz)),u=gx-ix,v=gz-iz;
 return [0,1,2,3].map(c=>{const i=(iz*MASK_GRID+ix)*4+c;return (data[i]*(1-u)+data[i+4]*u)*(1-v)+(data[i+MASK_GRID*4]*(1-u)+data[i+MASK_GRID*4+4]*u)*v;});
}
export function blendPaint(weights,mask){const a=1-mask.reduce((a,b)=>a+b,0);return [weights[0]*a+mask[3],weights[1]*a+mask[0],weights[2]*a+mask[2],weights[3]*a+mask[1]];}
export function validatePaint(surface){if(surface?.paint?.length&&!surface.geology)throw Error('Paint masks require geological surfaces.');if((surface?.paint??[]).reduce((n,s)=>n+s.points.length,0)>MAX_PAINT_POINTS)throw Error('Paint masks exceed 512 points.');}
