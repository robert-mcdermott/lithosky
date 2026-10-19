// SPDX-License-Identifier: Apache-2.0
// Original seeded solid textures and analytic gradients; no sampled textures.
struct GeoDefinition { material:vec4f, rules:vec4f, geology:vec4f, finish:vec4f, seed:u32 }
struct GeoSurface { color:vec3f, normal:vec3f, roughness:f32 }
fn geoWeight(x:f32)->f32{return 1-smoothstep(.25,.75,x);}
fn geoHash(c:vec3i,seed:u32)->f32 {
  var h=(u32(c.x)*0x1f123bb5u) ^ (u32(c.y)*0x5f356495u) ^ (u32(c.z)*0x6c8e9cf5u) ^ seed;
  h=(h^(h>>16u))*0x7feb352du;h=(h^(h>>15u))*0x846ca68bu;
  return f32((h^(h>>16u))>>8u)/16777216;
}
fn geoNoise(p:vec3f,seed:u32)->vec4f {
  let c=vec3i(floor(p));let t=fract(p);let f=t*t*t*(t*(t*6-15)+10);let df=30*t*t*(t-1)*(t-1);
  var result=vec4f(0);
  for(var corner=0u;corner<8u;corner++) {
    let bits=vec3u(corner&1u,(corner>>1u)&1u,(corner>>2u)&1u);let on=bits>vec3u(0);
    let w=select(vec3f(1)-f,f,on);let derivative=select(-df,df,on);
    let h=geoHash(c+vec3i(bits),seed);
    result+=h*vec4f(derivative.x*w.y*w.z,w.x*derivative.y*w.z,w.x*w.y*derivative.z,w.x*w.y*w.z);
  }
  return result;
}
fn geoFiltered(p:vec3f,footprint:f32,seed:u32)->vec4f {
  let w=geoWeight(footprint);if(w<=0){return vec4f(0,0,0,.5);}
  let n=geoNoise(p,seed);return vec4f(n.xyz*w,.5+(n.w-.5)*w);
}
fn geoGrain(p:vec3f,footprint:f32,seed:u32)->vec4f {
  var result=vec4f(0,0,0,.5);var frequency=5.0;var amplitude=.55;
  for(var i=0u;i<4u;i++) {
    let n=geoFiltered(p*frequency,footprint*frequency,seed+i*1013u);
    result+=vec4f(n.xyz*frequency,(n.w-.5))*amplitude;frequency*=2;amplitude*=.5;
  }
  return result;
}
fn geoJoints(p:vec3f,seed:u32)->vec4f {
  let cell=vec3i(floor(p));var first=1e30;var second=1e30;var a=vec3f(0);var b=vec3f(0);
  for(var z=-1;z<=1;z++){for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){
    let c=cell+vec3i(x,y,z);
    let site=vec3f(c)+vec3f(.35)+.3*vec3f(geoHash(c,seed),geoHash(c,seed+1013u),geoHash(c,seed+2026u));
    let distance=dot(p-site,p-site);
    if(distance<first){second=first;b=a;first=distance;a=site;}else if(distance<second){second=distance;b=site;}
  }}}
  let separation=length(a-b);return vec4f((a-b)/separation,(second-first)/(2*separation));
}
fn evaluateGeologicalMaterial(definition:GeoDefinition,p:vec3f,normal:vec3f,footprint:f32)->GeoSurface {
  let material=definition.material;let rules=definition.rules;let g=definition.geology;let finish=definition.finish;
  let factor=finish.y/g.x;let q=p*factor;let fp=max(0.0,footprint)*factor;
  let broad=geoFiltered(q*.55,fp*.55,definition.seed+911u);
  let grain=geoGrain(q,fp,definition.seed+1777u);
  let jointWeight=geoWeight(fp*3.5);var crack=vec4f(0,0,0,1);
  if(jointWeight>0){crack=geoJoints(q*3.5+vec3f(19.3,-8.1,7.7),definition.seed+3929u);}
  let phase=dot(q,vec3f(.42,40,.2))+broad.w*3;
  let phaseGradient=vec3f(.42,40,.2)+broad.xyz*1.65;
  let bandWeight=geoWeight(fp*length(phaseGradient)/6.2831853);let band=sin(phase)*bandWeight;
  let soft=.018+min(fp*.35,.12);let t=clamp((crack.w-.012)/soft,0.0,1.0);
  let fissure=.12+(1-t*t*(3-2*t)-.12)*jointWeight;
  let fissureDerivative=select(0.0,-6*t*(1-t)/soft*jointWeight,t>0 && t<1);
  let strength=material.w;let variation=clamp(.5+(grain.w-.5)*3,0.0,1.0);let stoneMix=clamp(broad.w*.8+variation*.2,0.0,1.0);
  var rock=mix(vec3f(.12,.15,.16),vec3f(.56,.46,.32),stoneMix);
  rock*=1+(.12*band*g.y+(grain.w-.5)*2.4*strength-.18*fissure*g.z);
  let soil=mix(vec3f(.045,.065,.018),vec3f(.23,.29,.07),clamp(broad.w+(grain.w-.5)*strength,0.0,1.0));
  let sand=mix(vec3f(.3,.21,.10),vec3f(.62,.48,.27),clamp(.5+(grain.w-.5)*strength*1.5,0.0,1.0));
  let snow=vec3f(.82,.87,.9)*(1+(grain.w-.5)*strength*.15);
  var weights=vec4f(0);
  if(material.y<.5) {
    let slope=acos(clamp(normal.y,0.0,1.0))*57.2957795;
    let r=smoothstep(rules.z-rules.w*8,rules.z+rules.w*8,slope+(broad.w-.5)*strength*12);
    let height=p.y+(broad.w-.5)*strength*.6;
    let a=1-smoothstep(rules.y-rules.w,rules.y+rules.w,height);
    let b=smoothstep(rules.x-rules.w,rules.x+rules.w,height)*(1-r);
    weights=vec4f((1-r)*(1-a)*(1-b),r*(1-b),(1-r)*a*(1-b),b);
  } else {
    switch u32(material.y) {case 1u:{weights.y=1;}case 2u:{weights.w=1;}case 3u:{weights.z=1;}default:{weights.x=1;}}
  }
  var color=soil*weights.x+rock*weights.y+sand*weights.z+snow*weights.w;
  if(material.z>.5){color=vec3f(color.x*1.12+color.z*.15,color.y*.62,color.z*1.3+color.x*.45);}
  let gradient=factor*g.w*(grain.xyz*(.035*weights.y+.012*weights.x+.008*weights.z+.002*weights.w)+weights.y*(phaseGradient*cos(phase)*bandWeight*g.y*.002-crack.xyz*3.5*fissureDerivative*g.z*.001));
  let tangent=gradient-normal*dot(gradient,normal);let limit=min(1.0,.75/max(length(tangent),.00001));
  return GeoSurface(clamp(color,vec3f(0),vec3f(.98)),normalize(normal-tangent*limit),clamp(finish.x+(grain.w-.5)*.2+weights.w*.12,.05,1.0));
}
fn geologicalSurface(p:vec3f,normal:vec3f,footprint:f32)->GeoSurface {
  return evaluateGeologicalMaterial(GeoDefinition(config.material,config.rules,config.geology,config.finish,config.image.w),p,normal,footprint);
}
fn roughDiffuse(n:vec3f,view:vec3f,light:vec3f,roughness:f32)->f32 {
  let v=clamp(dot(n,view),0.0,1.0);let l=clamp(dot(n,light),0.0,1.0);if(v<=0 || l<=0){return 0;}
  let sv=sqrt(max(0.0,1-v*v));let sl=sqrt(max(0.0,1-l*l));
  let azimuth=select(0.0,max(0.0,(dot(view,light)-v*l)/max(sv*sl,1e-6)),sv*sl>1e-6);
  let sigma2=roughness*roughness*1.44;let A=1-.5*sigma2/(sigma2+.33);let B=.45*sigma2/(sigma2+.09);
  return A+B*azimuth*max(sv,sl)*min(sv/max(v,.0001),sl/max(l,.0001));
}
@compute @workgroup_size(64)
fn materialProbe(@builtin(global_invocation_id) id:vec3u) {
  if(id.x*2u>=arrayLength(&probes)){return;}
  let p=rays[id.x*2u];let n=normalize(rays[id.x*2u+1u].xyz);let m=geologicalSurface(p.xyz,n,p.w);
  probes[id.x*2u]=vec4f(m.color,m.roughness);
  probes[id.x*2u+1u]=vec4f(m.normal,roughDiffuse(m.normal,normalize(vec3f(.2,1,.3)),normalize(vec3f(-.6,1,.4)),m.roughness));
}
