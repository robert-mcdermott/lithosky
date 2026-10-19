// SPDX-License-Identifier: Apache-2.0
// Original bounded transport implementation; equations and limits in docs/light-transport.md.
struct Area {position:vec4f,normal:vec4f,tangent:vec4f,color:vec4f}
@group(0) @binding(9) var<storage,read> areaLights:array<Area>;
const PI=3.141592653589793;
fn interfaceF(c:f32,eta:f32)->f32 {
 let sin2=eta*eta*(1-c*c);if(sin2>=1){return 1;}let t=sqrt(1-sin2);
 let s=(eta*c-t)/(eta*c+t);let p=(c-eta*t)/(c+eta*t);return .5*(s*s+p*p);
}
fn dielectricF(c:f32,ior:f32)->f32 {
 let t=sqrt(max(0.0,1-(1-c*c)/(ior*ior)));
 let s=(c-ior*t)/(c+ior*t);let p=(ior*c-t)/(ior*c+t);return .5*(s*s+p*p);
}
fn distribution(c:f32,r:f32)->f32 {let a=max(.02,r*r);let q=c*c*(a*a-1)+1;return a*a/(PI*q*q);}
fn masking(c:f32,r:f32)->f32 {if(c<=0){return 0;}let a=max(.02,r*r);return 2*c/(c+sqrt(a*a+(1-a*a)*c*c));}
fn surfaceBSDF(n:vec3f,v:vec3f,l:vec3f,color:vec3f,r:f32)->vec3f {
 let nv=dot(n,v);let nl=dot(n,l);if(nv<=0||nl<=0){return vec3f(0);}
 let h=normalize(v+l);let spec=dielectricF(max(0.0,dot(v,h)),config.transportExtra.w)*distribution(max(0.0,dot(n,h)),r)*masking(nv,r)*masking(nl,r)/(4*nv*nl);
 return .5*(color/PI+vec3f(spec));
}
fn surfacePDF(n:vec3f,v:vec3f,l:vec3f,r:f32)->f32 {
 if(dot(n,v)<=0||dot(n,l)<=0){return 0;}let h=normalize(v+l);let nh=max(0.0,dot(n,h));
 return .5*dot(n,l)/PI+.5*distribution(nh,r)*nh/(4*max(1e-9,dot(v,h)));
}
fn tangentTo(n:vec3f)->vec3f {return normalize(cross(select(vec3f(0,1,0),vec3f(1,0,0),abs(n.y)>.9),n));}
fn hemisphere(n:vec3f,u:f32,phi:f32)->vec3f {let t=tangentTo(n);return normalize(n*u+sqrt(max(0.0,1-u*u))*(cos(phi)*t+sin(phi)*cross(n,t)));}
fn sampleSurface(n:vec3f,v:vec3f,r:f32,seed:ptr<function,u32>)->vec3f {
 let spec=random(seed)>=.5;let u=random(seed);let phi=2*PI*random(seed);let a=max(.02,r*r);
 let c=select(sqrt(1-u),sqrt((1-u)/(1+(a*a-1)*u)),spec);let h=hemisphere(n,c,phi);
 return select(h,reflect(-v,h),spec);
}
fn mis(a:f32,b:f32)->f32 {return a*a/max(1e-30,a*a+b*b);}
fn environment(d:vec3f)->vec3f {
 if(config.atmosphere.x>.5){return skyScattering(d)*config.transportExtra.y;}
 let upper=mix(vec3f(.22,.42,.8),vec3f(.38,.23,.6),select(0.0,1.0,config.fog.x<.5));
 return mix(config.fog.xyz*1.3,upper,pow(max(d.y,0.0),.6))*config.transportExtra.y;
}
struct EmitterHit {t:f32,index:u32}
fn emitter(o:vec3f,d:vec3f,limit:f32)->EmitterHit {
 var result=EmitterHit(limit,4u);
 for(var i=0u;i<u32(config.transportLights.x);i++) {
  let light=areaLights[i];if(light.position.w<=0){continue;}
  let den=dot(d,light.normal.xyz);if(abs(den)<1e-7){continue;}
  let distance=dot(light.position.xyz-o,light.normal.xyz)/den;let p=o+d*distance-light.position.xyz;
  if(distance>.001&&distance<result.t&&abs(dot(p,light.tangent.xyz))<=light.normal.w*.5&&abs(dot(p,cross(light.normal.xyz,light.tangent.xyz)))<=light.tangent.w*.5){result=EmitterHit(distance,i);}
 }
 return result;
}
fn emitterPDF(p:vec3f,d:vec3f,hit:EmitterHit)->f32 {
 let light=areaLights[hit.index];let cosine=abs(dot(light.normal.xyz,d));
 return hit.t*hit.t/max(1e-12,cosine*light.normal.w*light.tangent.w*config.transportLights.x);
}
fn visible(o:vec3f,d:vec3f,limit:f32)->bool {return terrain(o,d,limit).t>=1e6&&emitter(o,d,limit).index==4u;}
fn distantVisible(o:vec3f,d:vec3f)->bool {return visible(o,d,1e6);}
fn transportLand(origin:vec3f,direction:vec3f,initial:Hit,seed:ptr<function,u32>,prior:f32)->vec3f {
 var o=origin;var d=direction;var hit=initial;var result=vec3f(0);var throughput=vec3f(1);var previousPDF=0.0;var distance=prior;
 for(var depth=0u;depth<4u;depth++) {
  let lightHit=emitter(o,d,hit.t);
  if(lightHit.index<4u) {
   let light=areaLights[lightHit.index];
   if(dot(d,light.normal.xyz)<0){let w=select(1.0,mis(previousPDF,emitterPDF(o,d,lightHit)),depth>0u);result+=throughput*light.color.xyz*light.position.w*w;}
   break;
  }
  if(hit.t>=1e6) {
   if(depth==0u){result+=throughput*environment(d);if(dot(d,config.light.xyz)>cos(.004675)&&config.atmosphere.x>.5){result+=throughput*atmosphereSun(config.atmosphereExtra.y,d.y)*config.transportExtra.x/(PI*.004675*.004675);}}
   else {result+=throughput*environment(d)*mis(previousPDF,1/(2*PI));}
   break;
  }
  let p=o+d*hit.t;distance+=hit.t;
  let g=select(-hit.geometric,hit.geometric,dot(d,hit.geometric)<0);var n=select(-hit.normal,hit.normal,dot(d,hit.normal)<0);
  var color=hit.color;var roughness=select(config.transportExtra.z,hit.material.y,hit.material.x>.5);
  if(config.material.x>.5&&hit.material.x<.5) {
   let footprint=clamp(distance*(2*config.right.w)/f32(config.region.w)/sqrt(max(abs(dot(d,g)),.12)),.00025,4.0);
   let surface=geologicalSurface(p,n,footprint);n=surface.normal;color=surface.color;roughness=surface.roughness;
  }
  // Limit shading-normal excursions and reject transport below the actual surface.
  color=dampShore(color,p);
  if(dot(n,g)<.2){n=normalize(n+g*(.2-dot(n,g)));}
  if(dot(n,-d)<=.001){n=g;}
  let start=p+g*.003;let view=-d;let sun=config.light.xyz;
  if(dot(sun,g)>0&&dot(sun,n)>0&&distantVisible(start,sun)) {
   var solar=vec3f(2.8,2.6,2.2)*PI;
   if(config.atmosphere.x>.5){solar=pointSun(p);}
   result+=throughput*surfaceBSDF(n,view,sun,color,roughness)*dot(n,sun)*solar*config.transportExtra.x;
  }
  // One uniform-hemisphere environment sample; paired with the BSDF continuation.
  let skyDirection=hemisphere(n,random(seed),2*PI*random(seed));let skyPDF=1/(2*PI);
  if(dot(skyDirection,g)>0&&distantVisible(start,skyDirection)) {
   result+=throughput*surfaceBSDF(n,view,skyDirection,color,roughness)*dot(n,skyDirection)*environment(skyDirection)*mis(skyPDF,surfacePDF(n,view,skyDirection,roughness))/skyPDF;
  }
  if(config.transportLights.x>0) {
   let index=min(u32(random(seed)*config.transportLights.x),u32(config.transportLights.x)-1u);let light=areaLights[index];
   let point=light.position.xyz+(random(seed)-.5)*light.normal.w*light.tangent.xyz+(random(seed)-.5)*light.tangent.w*cross(light.normal.xyz,light.tangent.xyz);
   let delta=point-start;let distanceToLight=length(delta);let l=delta/distanceToLight;let cosine=-dot(light.normal.xyz,l);
   if(light.position.w>0&&cosine>0&&dot(l,n)>0&&dot(l,g)>0&&visible(start,l,max(.001,distanceToLight-.006))) {
    let pdf=distanceToLight*distanceToLight/(cosine*light.normal.w*light.tangent.w*config.transportLights.x);
    result+=throughput*surfaceBSDF(n,view,l,color,roughness)*dot(n,l)*light.color.xyz*light.position.w*mis(pdf,surfacePDF(n,view,l,roughness))/pdf;
   }
  }
  let next=sampleSurface(n,view,roughness,seed);let pdf=surfacePDF(n,view,next,roughness);
  if(pdf<=1e-9||dot(next,g)<=0){break;}
  throughput*=surfaceBSDF(n,view,next,color,roughness)*max(0.0,dot(n,next))/pdf;
  previousPDF=pdf;o=start;d=next;hit=terrain(o,d,1e6);
  // Terminal vertices still include complementary BSDF sky/emitter samples for MIS.
  if(depth+1u>=u32(config.transport.y)) {
   let e=emitter(o,d,hit.t);
   if(e.index<4u){let light=areaLights[e.index];if(dot(d,light.normal.xyz)<0){result+=throughput*light.color.xyz*light.position.w*mis(pdf,emitterPDF(o,d,e));}}
   else if(hit.t>=1e6){result+=throughput*environment(d)*mis(pdf,skyPDF);}
   break;
  }
 }
 return result;
}
fn filmicCurve(x:f32)->f32 {return x*(x+.1)/(x*x+.6*x+.1);}
fn transportDisplay(linear:vec3f)->vec3f {
 let rgb=max(vec3f(0),linear)*exp2(config.transport.z);let y=dot(rgb,vec3f(.2126,.7152,.0722));
 let mapped=select(y/(1+y),filmicCurve(y),config.transport.w>.5);let scaled=rgb*mapped/max(y,1e-20);
 let maximum=max(scaled.x,max(scaled.y,scaled.z));var saturation=1.0;
 if(maximum>1){saturation=(1-mapped)/(maximum-mapped);}
 let c=clamp(vec3f(mapped)+(scaled-vec3f(mapped))*saturation,vec3f(0),vec3f(1));
 return select(1.055*pow(c,vec3f(1/2.4))-.055,12.92*c,c<=vec3f(.0031308));
}
@compute @workgroup_size(64)
fn transportProbe(@builtin(global_invocation_id) id:vec3u) {
 if(id.x*2u>=arrayLength(&probes)){return;}
 let a=rays[id.x*2u];let v=rays[id.x*2u+1u].xyz;let l=a.xyz;
 probes[id.x*2u]=vec4f(surfaceBSDF(vec3f(0,1,0),v,l,vec3f(1),a.w),surfacePDF(vec3f(0,1,0),v,l,a.w));
 probes[id.x*2u+1u]=vec4f(transportDisplay(abs(l)),dielectricF(clamp(v.y,0.0,1.0),config.transportExtra.w));
}

@compute @workgroup_size(64)
fn transportSampleProbe(@builtin(global_invocation_id) id:vec3u) {
 if(id.x*2u>=arrayLength(&probes)){return;}
 let a=rays[id.x*2u];let v=rays[id.x*2u+1u].xyz;var seed=id.x+1u;
 let l=sampleSurface(vec3f(0,1,0),v,a.w,&seed);let pdf=surfacePDF(vec3f(0,1,0),v,l,a.w);
 probes[id.x*2u]=vec4f(l,pdf);probes[id.x*2u+1u]=vec4f(surfaceBSDF(vec3f(0,1,0),v,l,vec3f(1),a.w),interfaceF(abs(v.y),a.x));
}

@compute @workgroup_size(64)
fn shadowProbe(@builtin(global_invocation_id) id:vec3u) {
 if(id.x>=arrayLength(&probes)){return;}let o=rays[id.x*2u].xyz;let d=rays[id.x*2u+1u].xyz;
 probes[id.x]=vec4f(terrain(o,d,1e6).t,select(0.0,1.0,distantVisible(o,d)),0,0);
}
