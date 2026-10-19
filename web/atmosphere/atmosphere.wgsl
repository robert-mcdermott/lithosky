// SPDX-License-Identifier: Apache-2.0
// Spherical Earth transport; CPU LUT layout and equations live in model.js.
@group(0) @binding(8) var<storage,read> atmosphereLUT: array<vec4f>;
fn table(offset:u32,size:vec2u,uv:vec2f)->vec3f {
  let p=clamp(uv,vec2f(0),vec2f(1))*vec2f(size-vec2u(1));
  let i=min(vec2u(p),size-vec2u(2));let f=p-vec2f(i);let a=offset+i.y*size.x+i.x;
  return mix(mix(atmosphereLUT[a].xyz,atmosphereLUT[a+1u].xyz,f.x),mix(atmosphereLUT[a+size.x].xyz,atmosphereLUT[a+size.x+1u].xyz,f.x),f.y);
}
fn atmosphereSun(h:f32,mu:f32)->vec3f {
  let height=clamp(h,0.0,60.0);let r=6360+height;
  let horizon=-sqrt(max(0.0,1-pow(6360/r,2)));
  if(mu<horizon){return vec3f(0);}
  return table(0u,vec2u(256,64),vec2f(sqrt(clamp((mu-horizon)/(1-horizon),0.0,1.0)),sqrt(height/60)));
}
fn skyScattering(d:vec3f)->vec3f {
  var azimuth=atan2(d.x,-d.z);
  // Explicit cardinal limit avoids signed-zero atan2 differences on GPU drivers.
  if(abs(d.z)<1e-7){azimuth=select(-1.5707963268,1.5707963268,d.x>=0);}
  return table(16384u,vec2u(128,64),vec2f((azimuth+3.14159265)/6.2831853,(sign(d.y)*sqrt(abs(d.y))+1)/2));
}
fn physicalSky(d:vec3f)->vec3f {
  var color=skyScattering(d);
  // Solar angular radius 0.2678 degrees; irradiance integral of disk is one.
  if(dot(d,config.light.xyz)>cos(.004675)) {color+=atmosphereSun(config.atmosphereExtra.y,d.y)/(3.14159265*.004675*.004675);}
  return color;
}
fn phaseRayleigh(nu:f32)->f32 {return 3*(1+nu*nu)/(16*3.14159265);}
fn phaseMie(nu:f32)->f32 {return 3*(1-.8*.8)*(1+nu*nu)/(8*3.14159265*(2+.8*.8)*pow(1+.8*.8-1.6*nu,1.5));}
fn extinction(h:f32)->vec3f {
  return vec3f(.005802,.013558,.0331)*exp(-max(0.0,h)/8)+vec3f(.00444*config.atmosphere.w*exp(-max(0.0,h)/1.2))+vec3f(.000650,.001881,.000085)*config.atmosphereExtra.x*max(0.0,1-abs(h-25)/15);
}
fn pointSun(p:vec3f)->vec3f {
  let v=vec3f(p.x*config.atmosphere.z,6360+config.atmosphere.y+p.y*config.atmosphere.z,p.z*config.atmosphere.z);
  let r=length(v);return atmosphereSun(r-6360,dot(v/r,config.light.xyz));
}
fn aerial(o:vec3f,d:vec3f,distance:f32,color:vec3f)->vec3f {
  if(config.atmosphere.x<.5){return color;}
  let start=vec3f(o.x*config.atmosphere.z,6360+max(.001,config.atmosphere.y+o.y*config.atmosphere.z),o.z*config.atmosphere.z);
  let total=distance*config.atmosphere.z;let nu=clamp(dot(d,config.light.xyz),-1.0,1.0);
  var T=vec3f(1);var L=vec3f(0);
  // Bounded per-segment transport, only on the camera-to-first-hit air segment.
  for(var i=0u;i<16u;i++) {
    let a=total*pow(f32(i)/16,2);let b=total*pow(f32(i+1u)/16,2);let ds=b-a;
    let p=start+d*((a+b)/2);let r=length(p);let h=max(0.0,r-6360);
    let e=extinction(h);let stepT=exp(-e*ds);
    let scattering=vec3f(.005802,.013558,.0331)*exp(-h/8)*phaseRayleigh(nu)+vec3f(.003996*config.atmosphere.w*exp(-h/1.2)*phaseMie(nu));
    L+=T*atmosphereSun(h,dot(p/r,config.light.xyz))*scattering*(vec3f(1)-stepT)/max(e,vec3f(1e-9));T*=stepT;
  }
  let skyStrength=select(1.0,config.transportExtra.y,config.transport.x>.5);
  return color*T+L*skyStrength;
}
// Diagnostics exercise the same uploaded LUT, phases and attenuation as rendering.
@compute @workgroup_size(64)
fn atmosphereProbe(@builtin(global_invocation_id) id:vec3u) {
  if(id.x>=arrayLength(&probes)){return;}
  let a=rays[id.x*2u];let d=rays[id.x*2u+1u].xyz;
  var value=atmosphereSun(a.x,a.y);
  if(a.w==1){value=skyScattering(d);}
  if(a.w==2){value=aerial(a.xyz,d,10,vec3f(1));}
  probes[id.x]=vec4f(value,1);
}
