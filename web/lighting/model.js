// SPDX-License-Identifier: Apache-2.0
// Original scalar reference equations; shader counterparts live in transport.wgsl.
export const transportDefaults=()=>({model:'path-v1',bounces:3,exposure:2,toneMap:'filmic',sun:1,sky:1,roughness:.65,ior:1.5,lights:[]});
export const areaLightDefaults=()=>({name:'Area light',enabled:true,x:-8,y:14,z:4,yaw:0,pitch:-55,width:10,height:10,intensity:2,red:1,green:.85,blue:.65});
export const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export const normalize=a=>{const l=Math.hypot(...a);return l?a.map(x=>x/l):[0,1,0];};
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function interfaceF(c,eta) {
 c=Math.min(1,Math.max(0,c));const sin2=eta*eta*(1-c*c);if(sin2>=1)return 1;
 const t=Math.sqrt(1-sin2);return .5*(((eta*c-t)/(eta*c+t))**2+((c-eta*t)/(c+eta*t))**2);
}
export const dielectric=(c,ior=1.5)=>interfaceF(c,1/ior);
export function ggxD(c,roughness) {const a=Math.max(.02,roughness*roughness),q=c*c*(a*a-1)+1;return a*a/(Math.PI*q*q);}
export function smithG(c,roughness) {if(c<=0)return 0;const a=Math.max(.02,roughness*roughness);return 2*c/(c+Math.sqrt(a*a+(1-a*a)*c*c));}
// Conservative mixture: diffuse and dielectric GGX each have a fixed half share.
// Every lobe is reciprocal and individually bounded; no empirical highlight boost.
export function bsdf(n,v,l,color,roughness,ior=1.5) {
 const nv=dot(n,v),nl=dot(n,l);if(nv<=0||nl<=0)return [0,0,0];
 const h=normalize(v.map((x,i)=>x+l[i]));
 const spec=dielectric(Math.max(0,dot(v,h)),ior)*ggxD(Math.max(0,dot(n,h)),roughness)*smithG(nv,roughness)*smithG(nl,roughness)/(4*nv*nl);
 return color.map(c=>(c/Math.PI+spec)*.5);
}
export function bsdfPDF(n,v,l,r) {
 if(dot(n,l)<=0||dot(n,v)<=0)return 0;const h=normalize(v.map((x,i)=>x+l[i])),vh=dot(v,h);
 return .5*dot(n,l)/Math.PI+.5*ggxD(Math.max(0,dot(n,h)),r)*Math.max(0,dot(n,h))/(4*Math.max(1e-9,vh));
}
export function frame(n) {const t=normalize(cross(Math.abs(n[1])>.9?[1,0,0]:[0,1,0],n));return [t,cross(n,t)];}
export function sampleBSDF(n,v,r,choose,u,phi) {
 const [t,b]=frame(n),spec=choose>=.5,a=Math.max(.02,r*r);
 const c=spec?Math.sqrt((1-u)/(1+(a*a-1)*u)):Math.sqrt(1-u),s=Math.sqrt(Math.max(0,1-c*c)),p=phi*2*Math.PI;
 const h=n.map((x,i)=>x*c+(t[i]*Math.cos(p)+b[i]*Math.sin(p))*s);
 const direction=spec?h.map((x,i)=>2*dot(v,h)*x-v[i]):h;
 return {direction,pdf:bsdfPDF(n,v,direction,r)};
}
export const powerHeuristic=(a,b)=>a*a/Math.max(1e-30,a*a+b*b);
export function filmic(x) {return x*(x+.1)/(x*x+.6*x+.1);}
export function displayColor(linear,exposure=0,toneMap='filmic') {
 const rgb=linear.map(x=>Math.max(0,x)*2**exposure),y=dot(rgb,[.2126,.7152,.0722]);
 const mapped=toneMap==='filmic'?filmic(y):y/(1+y),scaled=rgb.map(x=>x*mapped/Math.max(y,1e-20));
 const maximum=Math.max(...scaled),s=maximum>1?(1-mapped)/(maximum-mapped):1;
 return scaled.map(x=>{const c=Math.max(0,Math.min(1,mapped+(x-mapped)*s));return c<=.0031308?12.92*c:1.055*c**(1/2.4)-.055;});
}
export function lightFrame(light) {
 const yaw=light.yaw*Math.PI/180,pitch=light.pitch*Math.PI/180,n=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];
 const [t,b]=frame(n);return {n,t,b};
}
export function lightUniforms(transport) {
 const data=new Float32Array(4*16);
 transport?.lights.forEach((l,i)=>{const {n,t}=lightFrame(l);data.set([l.x,l.y,l.z,l.enabled?l.intensity:0,...n,l.width,...t,l.height,l.red,l.green,l.blue,0],i*16);});return data;
}
export function transportUniforms(t) {return t?[1,t.bounces,t.exposure,t.toneMap==='filmic'?1:0,t.sun,t.sky,t.roughness,t.ior,t.lights.length,0,0,0]:new Array(12).fill(0);}
