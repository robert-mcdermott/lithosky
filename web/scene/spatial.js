// SPDX-License-Identifier: Apache-2.0
// Column-major affine math. Euler angles apply X, then Y, then Z (degrees).
export const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export const transformDefaults=()=>({position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});
export const dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0);
export const unit=a=>{const n=Math.hypot(...a);return a.map(x=>x/(n||1));};
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const point=(m,p,w=1)=>[0,1,2].map(r=>m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r]*w);
export function multiply(a,b){const m=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=a[k*4+r]*b[c*4+k];return m;}
export function compose({position:p,rotation:r,scale:s}=transformDefaults()){
 const [x,y,z]=r.map(v=>v*Math.PI/180),cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
 return [cz*cy*s[0],sz*cy*s[0],-sy*s[0],0,(cz*sy*sx-sz*cx)*s[1],(sz*sy*sx+cz*cx)*s[1],cy*sx*s[1],0,(cz*sy*cx+sz*sx)*s[2],(sz*sy*cx-cz*sx)*s[2],cy*cx*s[2],0,...p,1];
}
export function inverse(m){
 const a=m[0],b=m[4],c=m[8],d=m[1],e=m[5],f=m[9],g=m[2],h=m[6],i=m[10],det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
 if(!Number.isFinite(det)||Math.abs(det)<1e-12)throw Error('Transform is singular.');
 const n=[(e*i-f*h)/det,(f*g-d*i)/det,(d*h-e*g)/det,0,(c*h-b*i)/det,(a*i-c*g)/det,(b*g-a*h)/det,0,(b*f-c*e)/det,(c*d-a*f)/det,(a*e-b*d)/det,0,0,0,0,1];
 n.splice(12,3,...point(n,m.slice(12,15),0).map(x=>-x));return n;
}
export function decompose(m){
 const s=[0,4,8].map(i=>Math.hypot(...m.slice(i,i+3))),r=m.map((x,i)=>i<12&&i%4<3?x/s[Math.floor(i/4)]:x),y=Math.asin(Math.max(-1,Math.min(1,-r[2])));
 const x=Math.abs(Math.cos(y))>1e-7?Math.atan2(r[6],r[10]):Math.atan2(-r[9],r[5]),z=Math.abs(Math.cos(y))>1e-7?Math.atan2(r[1],r[0]):0;
 const t={position:m.slice(12,15).map(v=>v===0?0:v),rotation:[x,y,z].map(v=>v===0?0:v*180/Math.PI),scale:s};
 if(compose(t).some((x,i)=>Math.abs(x-m[i])>1e-6*Math.max(1,Math.abs(x))))throw Error('This operation would shear the object. Use local scaling or uniform selection scaling.');return t;
}
export function worldMatrix(scene,id){const map=new Map(scene.entities.map(n=>[n.id,n]));let n=map.get(id),m=identity();for(let depth=0;n&&depth<=8;depth++){m=multiply(compose(n.components.transform),m);n=map.get(n.parent);}return m;}
export const translated=p=>compose({...transformDefaults(),position:p});
export const about=(pivot,m)=>multiply(translated(pivot),multiply(m,translated(pivot.map(x=>-x))));
export function axisRotation(axis,degrees){const [x,y,z]=unit(axis),a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a),q=1-c;return [c+x*x*q,y*x*q+z*s,z*x*q-y*s,0,x*y*q-z*s,c+y*y*q,z*y*q+x*s,0,x*z*q+y*s,y*z*q-x*s,c+z*z*q,0,0,0,0,1];}
export const identityTransform=t=>!t||compose(t).every((x,i)=>Math.abs(x-identity()[i])<1e-8);
export function boundsFor(matrix,shape='box'){
 const center=matrix.slice(12,15),extent=[0,1,2].map(i=>shape==='sphere'?.5*Math.hypot(matrix[i],matrix[4+i],matrix[8+i]):shape==='cylinder'?.5*(Math.hypot(matrix[i],matrix[8+i])+Math.abs(matrix[4+i])):.5*(Math.abs(matrix[i])+Math.abs(matrix[4+i])+Math.abs(matrix[8+i])));
 // A cone's enclosing transformed unit box is conservative, including its apex.
 return {min:center.map((x,i)=>x-extent[i]),max:center.map((x,i)=>x+extent[i])};
}
export function validateSpatial(scene){
 const nodes=scene.entities,map=new Map(nodes.map(n=>[n.id,n]));if(nodes.filter(n=>n.components.primitive).length>32)throw Error('At most 32 primitives are supported.');
 for(const n of nodes){const t=n.components.transform;if(n.components.group&&t&&Math.max(...t.scale)-Math.min(...t.scale)>1e-8)throw Error('Groups require uniform scaling.');
  if(!n.components.primitive&&!n.components.group){let p=map.get(n.parent);while(p){if(!identityTransform(p.components.transform))throw Error('Terrain, water, environment, camera and lights cannot inherit a transform.');p=map.get(p.parent);}}
  if(t){const m=worldMatrix(scene,n.id),s=[0,4,8].map(i=>Math.hypot(...m.slice(i,i+3))),b=boundsFor(m,n.components.primitive?.shape);if(s.some(x=>x<.01-1e-8||x>64+1e-8)||[...b.min,...b.max].some(x=>!Number.isFinite(x)||Math.abs(x)>256+1e-8))throw Error('World transform exceeds the supported size or ±256 scene-unit extent.');}
 }
}
