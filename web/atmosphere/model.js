// SPDX-License-Identifier: Apache-2.0
// Original implementation of spherical single-scattering transport. Kilometres.
// Equations, constants and reference cases: docs/atmosphere.md.
export const TW=256, TH=64, SW=128, SH=64, SKY_OFFSET=TW*TH;
export const LUT_BYTES=(TW*TH+SW*SH)*16;
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function earthModel(settings={}) {
  return {radius:6360,top:6420,rayleigh:[.005802,.013558,.0331],mie:.003996*(settings.aerosols??1),extinction:.00444*(settings.aerosols??1),ozone:[.000650,.001881,.000085].map(x=>x*(settings.ozone??1)),rayleighHeight:8,mieHeight:1.2,g:.8};
}
export function densities(h,m) {return [Math.exp(-Math.max(0,h)/m.rayleighHeight),Math.exp(-Math.max(0,h)/m.mieHeight),Math.max(0,1-Math.abs(h-25)/15)];}
export function coefficients(h,m) {const [r,a,o]=densities(h,m);return {rayleigh:m.rayleigh.map(x=>x*r),mie:m.mie*a,extinction:m.rayleigh.map((x,i)=>x*r+m.extinction*a+m.ozone[i]*o)};}
export function groundHit(h,mu,m) {const r=m.radius+h;return mu<0&&r*r*(1-mu*mu)<=m.radius*m.radius;}
export function boundary(h,mu,m) {
  const r=m.radius+h,b=groundHit(h,mu,m)?m.radius:m.top,root=Math.sqrt(Math.max(0,r*r*(mu*mu-1)+b*b));
  return Math.max(0,-r*mu+(b===m.radius?-root:root));
}
export function transmittance(h,mu,m,steps=256) {
  if(groundHit(h,mu,m))return [0,0,0];
  const distance=boundary(h,mu,m),r=m.radius+h,tau=[0,0,0];
  // Quadratic segments resolve low-altitude density at steep viewing angles.
  for(let i=0;i<steps;i++) {const a=distance*(i/steps)**2,b=distance*((i+1)/steps)**2,d=(a+b)/2,alt=Math.sqrt(r*r+d*d+2*r*mu*d)-m.radius,c=coefficients(alt,m);for(let k=0;k<3;k++)tau[k]+=c.extinction[k]*(b-a);}
  return tau.map(x=>Math.exp(-x));
}
export const rayleighPhase=nu=>3*(1+nu*nu)/(16*Math.PI);
export const miePhase=(nu,g=.8)=>3*(1-g*g)*(1+nu*nu)/(8*Math.PI*(2+g*g)*(1+g*g-2*g*nu)**1.5);
export function sample2D(data,offset,w,h,u,v) {
  const x=clamp(u,0,1)*(w-1),y=clamp(v,0,1)*(h-1),ix=Math.min(w-2,Math.floor(x)),iy=Math.min(h-2,Math.floor(y)),fx=x-ix,fy=y-iy;
  return [0,1,2].map(k=>{const at=(a,b)=>data[(offset+b*w+a)*4+k];return (at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy;});
}
// Horizon-relative coordinates keep the planet-shadow discontinuity out of LUT cells.
export function transUV(h,mu,m) {const r=m.radius+h,horizon=-Math.sqrt(Math.max(0,1-(m.radius/r)**2));return [Math.sqrt(clamp((mu-horizon)/(1-horizon),0,1)),Math.sqrt(clamp(h/(m.top-m.radius),0,1))];}
export function lookupTrans(data,h,mu,m) {
  h=clamp(h,0,m.top-m.radius);if(groundHit(h,mu,m))return [0,0,0];
  return sample2D(data,0,TW,TH,...transUV(h,mu,m));
}
// Scattering radiance per unit extraterrestrial solar irradiance; phases included.
export function integrate(h,d,sun,m,sunTrans,steps=64,limit=Infinity) {
  const mu=d[1],r=m.radius+h,nu=clamp(d.reduce((v,x,i)=>v+x*sun[i],0),-1,1),length=Math.min(limit,boundary(h,mu,m));
  const radiance=[0,0,0],T=[1,1,1],pr=rayleighPhase(nu),pm=miePhase(nu,m.g);
  for(let i=0;i<steps;i++) {
    const a=length*(i/steps)**2,b=length*((i+1)/steps)**2,t=(a+b)/2,ds=b-a,p=[d[0]*t,r+d[1]*t,d[2]*t],radius=Math.hypot(...p),alt=radius-m.radius;
    const c=coefficients(alt,m),sunMu=p.reduce((v,x,k)=>v+x*sun[k],0)/radius,light=sunTrans(alt,sunMu);
    for(let k=0;k<3;k++) {const attenuation=Math.exp(-c.extinction[k]*ds),weight=c.extinction[k]>0?(1-attenuation)/c.extinction[k]:ds;radiance[k]+=T[k]*light[k]*(c.rayleigh[k]*pr+c.mie*pm)*weight;T[k]*=attenuation;}
  }
  return {radiance,transmittance:T};
}
export const directionUV=d=>[(Math.atan2(d[0],-d[2])+Math.PI)/(2*Math.PI),(Math.sign(d[1])*Math.sqrt(Math.abs(d[1]))+1)/2];
export const uvDirection=(u,v)=>{const a=u*2*Math.PI-Math.PI,q=2*v-1,mu=q*Math.abs(q),r=Math.sqrt(Math.max(0,1-mu*mu));return [Math.sin(a)*r,mu,-Math.cos(a)*r];};
export async function buildAtmosphere(settings,eyeHeight,sun,{signal,yieldControl=()=>new Promise(r=>setTimeout(r,0))}={}) {
  const m=earthModel(settings),data=new Float32Array(LUT_BYTES/4),check=()=>{if(signal?.aborted)throw new DOMException('Atmosphere preparation canceled.','AbortError');};
  for(let y=0;y<TH;y++) {
    check();const h=(y/(TH-1))**2*60,r=m.radius+h,horizon=-Math.sqrt(Math.max(0,1-(m.radius/r)**2));
    for(let x=0;x<TW;x++){const mu=Math.min(1,horizon+1e-9+(1-horizon)*(x/(TW-1))**2);data.set(transmittance(h,mu,m),4*(y*TW+x));}
    if(y%8===0)await yieldControl();
  }
  const height=clamp(settings.altitude/1000+eyeHeight*settings.metresPerUnit/1000,.001,59);
  for(let y=0;y<SH;y++) {
    check();for(let x=0;x<SW;x++){const d=uvDirection(x/(SW-1),y/(SH-1)),sample=integrate(height,d,sun,m,(h,mu)=>lookupTrans(data,h,mu,m));data.set(sample.radiance,4*(SKY_OFFSET+y*SW+x));}
    if(y%4===0)await yieldControl();
  }
  check();return {data,height};
}
