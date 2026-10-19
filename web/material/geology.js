// SPDX-License-Identifier: Apache-2.0
// Original world-space procedural surfaces. Values and derivatives mirror WGSL.
export const geologyDefaults=()=>({model:'geology-v1',scale:1,strata:.65,fractures:.55,bump:.6,roughness:.7});
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const norm=a=>{const l=Math.hypot(...a)||1;return a.map(x=>x/l);};
const mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export const frequencyWeight=x=>1-smooth(.25,.75,x);
export function hash3(x,y,z,seed) {
  let h=Math.imul(x,0x1f123bb5)^Math.imul(y,0x5f356495)^Math.imul(z,0x6c8e9cf5)^seed;
  h=Math.imul(h^(h>>>16),0x7feb352d);h=Math.imul(h^(h>>>15),0x846ca68b);
  return ((h^(h>>>16))>>>8)/16777216;
}
export function noiseGradient(p,seed) {
  const cell=p.map(Math.floor),t=p.map((x,i)=>x-cell[i]);
  const f=t.map(x=>x*x*x*(x*(x*6-15)+10)),df=t.map(x=>30*x*x*(x-1)*(x-1));
  const result=[0,0,0,0];
  for(let corner=0;corner<8;corner++) {
    const bits=[corner&1,(corner>>1)&1,(corner>>2)&1];
    const w=bits.map((b,i)=>b?f[i]:1-f[i]),d=bits.map((b,i)=>(b?1:-1)*df[i]);
    const h=hash3(cell[0]+bits[0],cell[1]+bits[1],cell[2]+bits[2],seed);
    result[0]+=h*d[0]*w[1]*w[2];result[1]+=h*w[0]*d[1]*w[2];result[2]+=h*w[0]*w[1]*d[2];result[3]+=h*w[0]*w[1]*w[2];
  }
  return result;
}
export function filteredNoise(p,footprint,seed) {
  const w=frequencyWeight(footprint);if(w===0)return [0,0,0,.5];
  const v=noiseGradient(p,seed);
  return [v[0]*w,v[1]*w,v[2]*w,.5+(v[3]-.5)*w];
}
function grainAt(p,footprint,seed) {
  const result=[0,0,0,.5];let frequency=5,amplitude=.55;
  for(let i=0;i<4;i++) {
    const n=filteredNoise(p.map(x=>x*frequency),footprint*frequency,(seed+Math.imul(i,1013))>>>0);
    for(let k=0;k<3;k++)result[k]+=n[k]*frequency*amplitude;
    result[3]+=(n[3]-.5)*amplitude;frequency*=2;amplitude*=.5;
  }
  return result;
}
// Distance/gradient to the nearest Voronoi bisector. Interior-jittered sites
// keep the nearest two within the 27-cell neighborhood; no lookup textures.
export function jointGradient(p,seed) {
  const cell=p.map(Math.floor);let first=Infinity,second=Infinity,a,b;
  for(let z=-1;z<=1;z++)for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++) {
    const c=[cell[0]+x,cell[1]+y,cell[2]+z];
    const site=c.map((v,k)=>v+.35+.3*hash3(...c,(seed+Math.imul(k,1013))>>>0));
    const distance=site.reduce((sum,v,k)=>sum+(p[k]-v)**2,0);
    if(distance<first){second=first;b=a;first=distance;a=site;}else if(distance<second){second=distance;b=site;}
  }
  const separation=Math.hypot(...a.map((v,k)=>v-b[k]));
  return [...a.map((v,k)=>(v-b[k])/separation),(second-first)/(2*separation)];
}
// Pure material evaluation: no terrain/cache/camera access. This definition can
// later be assigned to an object using the same world-space point/normal inputs.
export function evaluateGeology(material,p,normal,footprint,seed=0,palette='natural') {
  const g=material.geology,factor=1/g.scale,q=p.map(x=>x*factor),fp=Math.max(0,footprint)*factor;
  const macro=filteredNoise(q.map(x=>x*.55),fp*.55,(seed+911)>>>0);
  const grain=grainAt(q,fp,(seed+1777)>>>0);
  const jointWeight=frequencyWeight(fp*3.5);
  const crack=jointWeight>0?jointGradient(q.map((x,i)=>x*3.5+[19.3,-8.1,7.7][i]),(seed+3929)>>>0):[0,0,0,1];
  const phase=dot(q,[.42,40,.2])+macro[3]*3;
  const phaseGradient=[.42+macro[0]*1.65,40+macro[1]*1.65,.2+macro[2]*1.65];
  const bandWeight=frequencyWeight(fp*Math.hypot(...phaseGradient)/6.2831853);
  const band=Math.sin(phase)*bandWeight;
  const width=.012,soft=.018+Math.min(fp*.35,.12),t=clamp((crack[3]-width)/soft);
  const fissure=.12+(1-t*t*(3-2*t)-.12)*jointWeight;
  const fissureDerivative=t>0&&t<1?-6*t*(1-t)/soft*jointWeight:0;
  const strength=material.detail;
  const variation=clamp(.5+(grain[3]-.5)*3),stoneMix=clamp(macro[3]*.8+variation*.2);
  let rock=mix([.12,.15,.16],[.56,.46,.32],stoneMix);
  const stain=1+(.12*band*g.strata+(grain[3]-.5)*2.4*strength-.18*fissure*g.fractures);
  rock=rock.map(x=>x*stain);
  const soil=mix([.045,.065,.018],[.23,.29,.07],clamp(macro[3]+(grain[3]-.5)*strength));
  const sand=mix([.3,.21,.10],[.62,.48,.27],clamp(.5+(grain[3]-.5)*strength*1.5));
  const snow=[.82,.87,.9].map(x=>x*(1+(grain[3]-.5)*strength*.15));
  let weights=[0,0,0,0];const presets=['ground','rock','sand','snow'];
  if(material.preset==='rules') {
    const slope=Math.acos(clamp(normal[1]))*180/Math.PI;
    const r=smooth(material.rockSlope-material.blend*8,material.rockSlope+material.blend*8,slope+(macro[3]-.5)*strength*12);
    const h=p[1]+(macro[3]-.5)*strength*.6;
    const a=1-smooth(material.sandHeight-material.blend,material.sandHeight+material.blend,h);
    const b=smooth(material.snowHeight-material.blend,material.snowHeight+material.blend,h)*(1-r);
    weights=[(1-r)*(1-a)*(1-b),r*(1-b),(1-r)*a*(1-b),b];
  } else weights[presets.indexOf(material.preset)]=1;
  let color=[0,0,0];[soil,rock,sand,snow].forEach((c,j)=>{color=color.map((x,k)=>x+c[k]*weights[j]);});
  if(palette==='otherworld')color=[color[0]*1.12+color[2]*.15,color[1]*.62,color[2]*1.3+color[0]*.45];
  const gradient=[0,1,2].map(k=>factor*g.bump*(
    grain[k]*(.035*weights[1]+.012*weights[0]+.008*weights[2]+.002*weights[3])+
    weights[1]*(phaseGradient[k]*Math.cos(phase)*bandWeight*g.strata*.002-crack[k]*3.5*fissureDerivative*g.fractures*.001)));
  const tangent=gradient.map((x,k)=>x-normal[k]*dot(gradient,normal)),length=Math.hypot(...tangent),limit=Math.min(1,.75/Math.max(length,.00001));
  const bumped=norm(normal.map((x,k)=>x-tangent[k]*limit));
  return {color:color.map(x=>clamp(x,0,.98)),normal:bumped,roughness:clamp(g.roughness+(grain[3]-.5)*.2+weights[3]*.12,.05,1),weights};
}
// Oren–Nayar angular factor relative to Lambertian. Geometric hemisphere checks
// are the caller's responsibility; the final integrator performs them explicitly.
export function roughDiffuse(n,view,light,roughness) {
  const v=clamp(dot(n,view)),l=clamp(dot(n,light));if(v<=0||l<=0)return 0;
  const sv=Math.sqrt(Math.max(0,1-v*v)),sl=Math.sqrt(Math.max(0,1-l*l));
  const azimuth=sv*sl>1e-6?Math.max(0,(dot(view,light)-v*l)/(sv*sl)):0;
  const sigma2=(roughness*1.2)**2,A=1-.5*sigma2/(sigma2+.33),B=.45*sigma2/(sigma2+.09);
  return A+B*azimuth*Math.max(sv,sl)*Math.min(sv/Math.max(v,.0001),sl/Math.max(l,.0001));
}
export function materialUniforms(state) {
  const m=state.materials,g=m?.geology;if(!g)return new Float32Array(16);
  return new Float32Array([1,['rules','rock','snow','sand','ground'].indexOf(m.preset),Number(state.palette==='otherworld'),m.detail,
    m.snowHeight,m.sandHeight,m.rockSlope,m.blend,g.scale,g.strata,g.fractures,g.bump,g.roughness,1,0,0]);
}
