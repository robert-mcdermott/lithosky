// SPDX-License-Identifier: Apache-2.0
export const MAX_STROKES=32, MAX_DABS=24, MIN_HEIGHT=-64, MAX_HEIGHT=64;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function validateStroke(stroke) {
  if(!stroke || !['raise','lower','smooth','flatten'].includes(stroke.tool) || !Number.isFinite(stroke.radius) || stroke.radius<.5 || stroke.radius>8 || !Number.isFinite(stroke.strength) || stroke.strength<.05 || stroke.strength>1 || !Number.isFinite(stroke.height) || stroke.height<MIN_HEIGHT || stroke.height>MAX_HEIGHT || !Array.isArray(stroke.points) || !stroke.points.length || stroke.points.length>MAX_DABS || stroke.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||Math.abs(v)>32))) throw new Error('Invalid sculpt stroke.');
}
export function brushBounds(resolution, x, z, radius) {
  const scale=resolution/64;
  return {x0:clamp(Math.ceil((x-radius+32)*scale),0,resolution),x1:clamp(Math.floor((x+radius+32)*scale),0,resolution),z0:clamp(Math.ceil((z-radius+32)*scale),0,resolution),z1:clamp(Math.floor((z+radius+32)*scale),0,resolution)};
}
// Each dab reads smoothing neighbors from an immutable local patch. Traversal order
// cannot bias a blur, and scratch storage stays below 1.2 MiB at the largest budget.
export function applyDab(heights,resolution,stroke,point) {
  const size=resolution+1, step=64/resolution, [cx,cz]=point;
  const b=brushBounds(resolution,cx,cz,stroke.radius), reach=Math.max(1,Math.round(resolution/128));
  let patch,px0,pz0,width,pz1,px1;
  if(stroke.tool==='smooth') {
    px0=Math.max(0,b.x0-reach);px1=Math.min(resolution,b.x1+reach);pz0=Math.max(0,b.z0-reach);pz1=Math.min(resolution,b.z1+reach);
    width=px1-px0+1;patch=new Float32Array(width*(pz1-pz0+1));
    for(let z=pz0;z<=pz1;z++)patch.set(heights.subarray(z*size+px0,z*size+px1+1),(z-pz0)*width);
  }
  for(let z=b.z0;z<=b.z1;z++)for(let x=b.x0;x<=b.x1;x++) {
    const d2=((x*step-32-cx)**2+(z*step-32-cz)**2)/stroke.radius**2;if(d2>=1)continue;
    const weight=(1-d2)**2*stroke.strength,i=z*size+x,old=heights[i];let next;
    if(stroke.tool==='raise'||stroke.tool==='lower')next=old+(stroke.tool==='raise'?weight:-weight);
    else {
      let target=stroke.height;
      if(patch) {target=0;for(const dz of [-reach,0,reach])for(const dx of [-reach,0,reach])target+=patch[(clamp(z+dz,pz0,pz1)-pz0)*width+clamp(x+dx,px0,px1)-px0];target/=9;}
      next=old+(target-old)*weight;
    }
    heights[i]=clamp(next,MIN_HEIGHT,MAX_HEIGHT);
  }
}
export async function sculptHeights(source,resolution,strokes,{signal,onProgress=()=>{},yieldControl=()=>new Promise(r=>setTimeout(r,0))}={}) {
  if(![256,512,1024,2048].includes(resolution)||source.length!==(resolution+1)**2||!Array.isArray(strokes)||strokes.length>MAX_STROKES)throw new Error('Invalid sculpt budget.');
  strokes.forEach(validateStroke);
  const canceled=()=>{if(signal?.aborted)throw new DOMException('Terrain generation canceled.','AbortError');};canceled();
  const heights=source.slice(),total=strokes.reduce((n,s)=>n+s.points.length,0);let done=0;
  for(const stroke of strokes)for(const point of stroke.points) {
    canceled();applyDab(heights,resolution,stroke,point);onProgress(++done/total);await yieldControl();
  }
  canceled();return heights;
}
// Fixed spatial spacing makes stroke strength independent of pointer event rate.
export function extendStroke(stroke,point) {
  const p=point.map(v=>Math.round(clamp(v,-32,32)*10000)/10000);
  if(!stroke.points.length){stroke.points.push(p);return;}
  const start=stroke.points.at(-1),distance=Math.hypot(p[0]-start[0],p[1]-start[1]),spacing=stroke.radius*.35;
  const count=Math.min(MAX_DABS-stroke.points.length,Math.floor(distance/spacing));
  for(let i=1;i<=count;i++)stroke.points.push(start.map((v,axis)=>Math.round((v+(p[axis]-v)*i*spacing/distance)*10000)/10000));
}
