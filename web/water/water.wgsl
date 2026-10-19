// SPDX-License-Identifier: Apache-2.0
// Original bounded lake implementation. No textures or external shader code.
const WATER_IOR=1.333;
fn lakeExtinction()->vec3f {return vec3f(.056,.017,.010)*config.water.y*config.water.z;}
fn lakeScattering()->vec3f {return vec3f(.001,.003,.004)*config.water.y*config.water.z;}
fn lakeTransmission(distance:f32)->vec3f {return exp(-lakeExtinction()*max(0.0,distance));}
fn lakeNormal(p:vec3f,footprint:f32)->vec3f {
 var slope=vec2f(0);
 let directions=array<vec2f,3>(vec2f(.8,.6),vec2f(-.45,.893),vec2f(.97,-.24));
 let frequencies=array<f32,3>(1,2.17,4.61);let amplitudes=array<f32,3>(.09,.055,.025);let phases=array<f32,3>(.4,2.3,4.1);
 for(var i=0u;i<3u;i++) {let k=2*PI*frequencies[i]/config.waterExtra.x;let weight=exp(-.5*k*k*footprint*footprint);slope+=directions[i]*amplitudes[i]*config.water.w*weight*cos(dot(p.xz,directions[i])*k+phases[i]);}
 return normalize(vec3f(-slope.x,1,-slope.y));
}
fn dampShore(color:vec3f,p:vec3f)->vec3f {
 if(config.water.x<.5||config.bounds.z<.5||config.waterExtra.y<=0){return color;}
 let damp=1-smoothstep(config.bounds.w,config.bounds.w+config.waterExtra.y,p.y);
 return color*mix(1.0,.62,damp);
}
fn lakeSun(p:vec3f)->vec3f {
 var solar=vec3f(2.8,2.6,2.2)*PI;if(config.atmosphere.x>.5){solar=pointSun(p);}
 if(config.transport.x>.5){solar*=config.transportExtra.x;}
 return solar;
}
fn lakeSky(d:vec3f)->vec3f {if(config.transport.x>.5){return environment(d);}if(config.atmosphere.x>.5){return skyScattering(d);}return sky(d);}
// Upward water direction corresponding to an incoming direction in air.
fn belowDirection(air:vec3f)->vec3f {return -refract(-air,vec3f(0,1,0),1/WATER_IOR);}
fn lakeVisibility(p:vec3f,l:vec3f,air:vec3f)->f32 {
 let distance=max(0.0,(config.bounds.w-p.y)/max(l.y,.001));
 let surface=p+l*distance;
 if(any(abs(surface.xz)>vec2f(32))){return 0;}
 if(terrain(p+vec3f(0,.002,0),l,max(.001,distance-.003)).t<1e6){return 0;}
 return select(0.0,1.0,distantVisible(surface+vec3f(0,.003,0),air));
}
fn lakeBed(o:vec3f,d:vec3f,h:Hit,prior:f32)->vec3f {
 if(h.t>=1e6){return vec3f(0);}
 let p=o+d*h.t;let g=select(-h.geometric,h.geometric,dot(d,h.geometric)<0);var n=select(-h.normal,h.normal,dot(d,h.normal)<0);var color=h.color;
 if(config.material.x>.5&&h.material.x<.5) {let footprint=clamp((prior+h.t)*(2*config.right.w)/f32(config.region.w)/sqrt(max(abs(dot(d,g)),.12)),.00025,4.0);let surface=geologicalSurface(p,n,footprint);color=surface.color;n=surface.normal;}
 if(dot(n,g)<.2){n=normalize(n+g*(.2-dot(n,g)));}
 color*=.62;var result=vec3f(0);let depth=max(0.0,config.bounds.w-p.y);let sun=config.light.xyz;
 if(sun.y>0) {
  let l=belowDirection(sun);let transmission=1-interfaceF(sun.y,1/WATER_IOR);
  result+=color/PI*max(0.0,dot(n,l))*lakeSun(p)*transmission*sun.y/l.y*lakeTransmission(depth/l.y)*lakeVisibility(p,l,sun);
 }
 // Fixed projected-area quadrature keeps shallow beds stable at low sample counts.
 // The refractive solid-angle Jacobian is air.y/(ior² * water.y).
 for(var i=0u;i<6u;i++) {
  let mu=sqrt((f32(i)+.5)/6);let phi=f32(i)*2.39996323;
  let air=vec3f(sqrt(1-mu*mu)*cos(phi),mu,sqrt(1-mu*mu)*sin(phi));let l=belowDirection(air);
  let incident=lakeSky(air)*(1-interfaceF(mu,1/WATER_IOR))*PI/(6*l.y);
  result+=color/PI*max(0.0,dot(n,l))*incident*lakeTransmission(depth/l.y)*lakeVisibility(p,l,air);
 }
 return result;
}
fn lakeMedium(o:vec3f,d:vec3f,distance:f32)->vec3f {
 // Four bounded integration cells; truncation follows 12 optical depths of the
 // least attenuated channel. Scattering is illumination-dependent, never emissive.
 let length=min(distance,12/min(lakeExtinction().x,min(lakeExtinction().y,lakeExtinction().z)));
 let step=length/4;var result=vec3f(0);let sun=config.light.xyz;
 for(var i=0u;i<4u;i++) {
  let t=(f32(i)+.5)*step;let p=o+d*t;let depth=max(0.0,config.bounds.w-p.y);var source=vec3f(0);
  if(sun.y>0) {let l=belowDirection(sun);source+=lakeSun(p)*(1-interfaceF(sun.y,1/WATER_IOR))*sun.y/l.y*lakeTransmission(depth/l.y)*lakeVisibility(p,l,sun)/(4*PI);}
  // Hemispherical sky approximation with the refractive radiance scale. This is
  // single scattering, not a full multiple-scattering volume/path integrator.
  let air=vec3f(0,1,0);let skySolidAngle=.5*(1-sqrt(1-1/(WATER_IOR*WATER_IOR)));
  source+=lakeSky(air)*WATER_IOR*WATER_IOR*skySolidAngle*(1-interfaceF(1,1/WATER_IOR))*lakeTransmission(depth)*lakeVisibility(p,air,air);
  let segment=(lakeTransmission(f32(i)*step)-lakeTransmission(f32(i+1u)*step))/lakeExtinction();
  result+=source*lakeScattering()*segment;
 }
 return result;
}
fn lakeUnder(o:vec3f,d:vec3f,h:Hit,prior:f32)->vec3f {
 let distance=min(h.t,1000.0);
 return lakeBed(o,d,h,prior)*lakeTransmission(distance)+lakeMedium(o,d,distance);
}
fn lakeTrace(o:vec3f,d:vec3f,h:Hit,seed:ptr<function,u32>)->vec3f {
 let under=o.y<config.bounds.w;
 var t=1e6;if(abs(d.y)>1e-8){let candidate=(config.bounds.w-o.y)/d.y;if(candidate>.001&&all(abs((o+d*candidate).xz)<=vec2f(32))){t=candidate;}}
 if(t>=h.t||t>=1e6) {
  if(under){return lakeUnder(o,d,h,0);}
  return aerial(o,d,select(h.t,0.0,h.t>=1e6),land(o,d,h,seed,0));
 }
 let p=o+d*t;var n=lakeNormal(p,clamp(t*(2*config.right.w)/f32(config.region.w)/max(abs(d.y),.12),.00025,4.0));
 if(under){n=vec3f(0,-1,0);}
 // Bump-only ripples never send an above-water reflection below the mean plane.
 if(!under&&(dot(-d,n)<=0||reflect(d,n).y<=.001)){n=vec3f(0,1,0);}
 let eta=select(1/WATER_IOR,WATER_IOR,under);let f=interfaceF(clamp(-dot(n,d),0.0,1.0),eta);
 let reflected=reflect(d,n);let ro=p+select(vec3f(0,.003,0),vec3f(0,-.003,0),under);let rh=terrain(ro,reflected,1e6);
 var color=vec3f(0);if(under){color=f*lakeUnder(ro,reflected,rh,t);}else{color=f*land(ro,reflected,rh,seed,t);}
 if(f<1) {
  let transmitted=refract(d,n,eta);let to=p-select(vec3f(0,.003,0),vec3f(0,-.003,0),under);let hit=terrain(to,transmitted,1e6);
  if(under){color+=(1-f)*land(to,transmitted,hit,seed,t)*WATER_IOR*WATER_IOR;}
  else {color+=(1-f)*lakeUnder(to,transmitted,hit,t)/(WATER_IOR*WATER_IOR);}
 }
 if(under){return color*lakeTransmission(t)+lakeMedium(o,d,t);}
 return aerial(o,d,t,color);
}
@compute @workgroup_size(64)
fn waterProbe(@builtin(global_invocation_id) id:vec3u) {
 if(id.x*2u>=arrayLength(&probes)){return;}
 let a=rays[id.x*2u];let b=rays[id.x*2u+1u];
 probes[id.x*2u]=vec4f(lakeTransmission(a.w),interfaceF(clamp(b.y,0.0,1.0),1/WATER_IOR));
 probes[id.x*2u+1u]=vec4f(lakeNormal(a.xyz,b.x),interfaceF(clamp(b.y,0.0,1.0),WATER_IOR));
}
@compute @workgroup_size(64)
fn waterRayProbe(@builtin(global_invocation_id) id:vec3u) {
 if(id.x>=arrayLength(&probes)){return;}let o=rays[id.x*2u].xyz;let d=normalize(rays[id.x*2u+1u].xyz);var seed=id.x+1u;
 let h=terrain(o,d,1e6);probes[id.x]=vec4f(trace(o,d,&seed),h.t);
}
