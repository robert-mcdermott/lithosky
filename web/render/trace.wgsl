// SPDX-License-Identifier: Apache-2.0
struct Config {
  eye: vec4f, right: vec4f, up: vec4f, forward: vec4f, light: vec4f, fog: vec4f,
  bounds: vec4f, // minimum height, maximum height, water enabled, water level
  image: vec4u, // width, height, sample index, seed
  tile: vec4u,
  atmosphere: vec4f, // enabled, origin altitude km, km/unit, aerosol multiplier
  atmosphereExtra: vec4f, // ozone multiplier, observer altitude km
  material:vec4f, rules:vec4f, geology:vec4f, finish:vec4f,
  transport:vec4f, transportExtra:vec4f, transportLights:vec4f,
  water:vec4f, waterExtra:vec4f,
}
struct Vertex { position: vec4f, normal: vec4f, color: vec4f }
struct Hit { t: f32, normal: vec3f, color: vec3f, geometric: vec3f }
@group(0) @binding(0) var<uniform> config: Config;
@group(0) @binding(1) var<storage, read> vertices: array<Vertex>;
@group(0) @binding(2) var<storage, read_write> accumulation: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> pixels: array<u32>;
@group(0) @binding(4) var<storage, read_write> invalid: atomic<u32>;
@group(0) @binding(5) var<storage, read> rays: array<vec4f>;
@group(0) @binding(6) var<storage, read_write> probes: array<vec4f>;
@group(0) @binding(7) var<storage, read> hierarchy: array<vec2f>;
override grid: u32 = 128u;
const blockSize=8u;
override useHierarchy: bool = true;
fn miss() -> Hit { return Hit(1e6,vec3f(0,1,0),vec3f(0),vec3f(0,1,0)); }
fn triangle(o: vec3f, d: vec3f, ia: u32, ib: u32, ic: u32, limit: f32) -> Hit {
  let a=vertices[ia]; let b=vertices[ib]; let c=vertices[ic];
  let e1=b.position.xyz-a.position.xyz; let e2=c.position.xyz-a.position.xyz;
  let p=cross(d,e2); let det=dot(e1,p);
  if (abs(det)<1e-8) { return miss(); }
  let v=o-a.position.xyz; let u=dot(v,p)/det; let q=cross(v,e1); let w=dot(d,q)/det; let t=dot(e2,q)/det;
  if (u < -1e-5 || w < -1e-5 || u+w > 1.00001 || t < .001 || t > limit) { return miss(); }
  return Hit(t,normalize(a.normal.xyz*(1-u-w)+b.normal.xyz*u+c.normal.xyz*w),
    clamp(a.color.xyz*(1-u-w)+b.color.xyz*u+c.color.xyz*w,vec3f(0),vec3f(1)),normalize(cross(e1,e2)));
}
fn cells(o: vec3f, d: vec3f, limit: f32, lo: vec3f, hi: vec3f, first: vec2i, last: vec2i) -> Hit {
  var near=.001; var far=limit;
  for (var axis=0u; axis<3u; axis++) {
    if (abs(d[axis])<1e-8) { if (o[axis]<lo[axis] || o[axis]>hi[axis]) { return miss(); } }
    else { let a=(lo[axis]-o[axis])/d[axis]; let b=(hi[axis]-o[axis])/d[axis]; near=max(near,min(a,b)); far=min(far,max(a,b)); }
  }
  if (far<near) { return miss(); }
  let cellSize=64.0/f32(grid);
  var cell=clamp(vec2i(floor((o.xz+d.xz*near+32)/cellSize)),first,last-vec2i(1));
  let step=select(vec2i(-1),vec2i(1),d.xz>=vec2f(0));
  var delta=vec2f(1e30); var next=vec2f(1e30);
  for (var axis=0u; axis<2u; axis++) {
    let dir=d[axis*2u];
    if (abs(dir)>=1e-8) {
      delta[axis]=cellSize/abs(dir);
      next[axis]=(f32(cell[axis]+select(0,1,step[axis]>0))*cellSize-32-o[axis*2u])/dir;
    }
  }
  // At most 18 cell steps per 8² leaf, or 2 * grid + 2 for the linear diagnostic.
  let maxSteps=u32(last.x-first.x+last.y-first.y+2);
  for (var iteration=0u; iteration<maxSteps; iteration++) {
    let end=min(far,min(next.x,next.y)); let a=u32(cell.y)*(grid+1u)+u32(cell.x);
    var h=triangle(o,d,a,a+grid+1u,a+1u,end+1e-4);
    let second=triangle(o,d,a+1u,a+grid+1u,a+grid+2u,end+1e-4);
    if (second.t<h.t) { h=second; }
    if (h.t<1e6 && h.t>=near-1e-4) { return h; }
    if (end>=far) { return miss(); }
    let advance=next<=next.yx;
    if (advance.x) { cell.x+=step.x; next.x+=delta.x; }
    if (advance.y) { cell.y+=step.y; next.y+=delta.y; }
    if (any(cell<first) || any(cell>=last)) { return miss(); }
  }
  return miss();
}
fn terrain(o: vec3f, d: vec3f, limit: f32) -> Hit {
  let lo=vec3f(-32,config.bounds.x-.001,-32); let hi=vec3f(32,config.bounds.y+.001,32);
  if (!useHierarchy) { return cells(o,d,limit,lo,hi,vec2i(0),vec2i(i32(grid))); }
  var near=.001; var far=limit;
  for (var axis=0u; axis<3u; axis++) {
    if (abs(d[axis])<1e-8) { if (o[axis]<lo[axis] || o[axis]>hi[axis]) { return miss(); } }
    else { let a=(lo[axis]-o[axis])/d[axis]; let b=(hi[axis]-o[axis])/d[axis]; near=max(near,min(a,b)); far=min(far,max(a,b)); }
  }
  if (far<near) { return miss(); }
  let blocks=grid/blockSize;let blockCell=64.0/f32(blocks);
  var block=clamp(vec2i(floor((o.xz+d.xz*near+32)/blockCell)),vec2i(0),vec2i(i32(blocks)-1));
  let step=select(vec2i(-1),vec2i(1),d.xz>=vec2f(0));
  var delta=vec2f(1e30); var next=vec2f(1e30);
  for (var axis=0u; axis<2u; axis++) {
    let dir=d[axis*2u];
    if (abs(dir)>=1e-8) { delta[axis]=blockCell/abs(dir);next[axis]=(f32(block[axis]+select(0,1,step[axis]>0))*blockCell-32-o[axis*2u])/dir; }
  }
  // At most 2 * blocks + 2 crossings; each leaf contains 8² cells.
  for (var iteration=0u; iteration<blocks*2u+2u; iteration++) {
    let end=min(far,min(next.x,next.y));let heights=hierarchy[u32(block.y)*blocks+u32(block.x)];
    let y0=o.y+d.y*near;let y1=o.y+d.y*end;
    if (max(y0,y1)>=heights.x-.001 && min(y0,y1)<=heights.y+.001) {
      let corner=vec2f(block)*blockCell-32;
      let h=cells(o,d,min(limit,end+1e-4),vec3f(corner.x,heights.x-.001,corner.y),vec3f(corner.x+blockCell,heights.y+.001,corner.y+blockCell),block*8,(block+vec2i(1))*8);
      if (h.t<1e6) { return h; }
    }
    if (end>=far) { return miss(); }
    let advance=next<=next.yx;
    if (advance.x) { block.x+=step.x;next.x+=delta.x; }
    if (advance.y) { block.y+=step.y;next.y+=delta.y; }
    if (any(block<vec2i(0)) || any(block>=vec2i(i32(blocks)))) { return miss(); }
    near=end;
  }
  return miss();
}
fn random(seed: ptr<function,u32>) -> f32 {
  *seed=(*seed ^ (*seed>>16u))*2246822519u;
  *seed=(*seed ^ (*seed>>13u))*3266489917u; *seed=*seed ^ (*seed>>16u);
  return f32(*seed>>8u)/16777216.0;
}
fn sky(d: vec3f) -> vec3f {
  if(config.atmosphere.x>.5){return physicalSky(d);}
  let upper=mix(vec3f(.22,.42,.8),vec3f(.38,.23,.6),select(0.0,1.0,config.fog.x<.5));
  let horizon=config.fog.xyz*1.3;
  return mix(horizon,upper,pow(max(d.y,0.0),.6)) + vec3f(5,4.5,3.5)*pow(max(dot(d,config.light.xyz),0.0),3000.0);
}
fn cosineDirection(n: vec3f, seed: ptr<function,u32>) -> vec3f {
  let u=random(seed); let phi=6.2831853*random(seed);
  let helper=select(vec3f(0,1,0),vec3f(1,0,0),abs(n.y)>.9);
  let tangent=normalize(cross(helper,n)); let bitangent=cross(n,tangent);
  return normalize(tangent*(sqrt(u)*cos(phi))+bitangent*(sqrt(u)*sin(phi))+n*sqrt(1-u));
}
fn land(o: vec3f, d: vec3f, h: Hit, seed: ptr<function,u32>, prior:f32) -> vec3f {
  if(config.transport.x>.5){return transportLand(o,d,h,seed,prior);}
  if (h.t>=1e6) { return sky(d); }
  let p=o+d*h.t; var n=select(-h.normal,h.normal,dot(d,h.geometric)<0);
  let geometric=select(-h.geometric,h.geometric,dot(d,h.geometric)<0);
  var color=h.color;var roughness=0.0;
  let geological=config.material.x>.5;
  if(geological) {
    // Isotropic surface-area ray-cone estimate, widened at grazing angles. Water
    // rays include their preceding path; no screen-space UVs or texture seams.
    let footprint=clamp((prior+h.t)*.96/f32(config.image.y)/sqrt(max(abs(dot(d,geometric)),.12)),.00025,4.0);
    let base=select(-n,n,dot(n,geometric)>=0);let surface=geologicalSurface(p,base,footprint);
    n=surface.normal;color=surface.color;roughness=surface.roughness;
    if(dot(n,geometric)<.1){n=normalize(n+geometric*(.1-dot(n,geometric)));}
  }
  let start=p+geometric*.003;
  color=dampShore(color,p);
  let sun=config.light.xyz;
  var visibility=select(0.0,1.0,terrain(start,sun,150).t>=1e6);
  if(geological && dot(sun,geometric)<=0){visibility=0;}
  let ambient=cosineDirection(n,seed);
  let open=select(0.0,1.0,dot(ambient,geometric)>0 && terrain(start,ambient,150).t>=1e6);
  var directResponse=1.0;var ambientResponse=1.0;
  if(geological){directResponse=roughDiffuse(n,-d,sun,roughness);ambientResponse=roughDiffuse(n,-d,ambient,roughness);}
  if(config.atmosphere.x>.5){return color*(skyScattering(ambient)*open*ambientResponse+pointSun(p)*max(dot(n,sun),0.0)*visibility*directResponse/3.14159265);}
  let radiance=color*(sky(ambient)*open*ambientResponse + vec3f(2.8,2.6,2.2)*max(dot(n,sun),0.0)*visibility*directResponse);
  // Preserve the legacy artistic atmosphere for pre-v6 scenes.
  return mix(radiance,sky(d)*.7,1-exp(-h.t*.009));
}
fn fresnel(c: f32, eta: f32) -> f32 {
  if (eta*eta*(1-c*c)>=1) { return 1; }
  let r=(1-eta)/(1+eta); return r*r+(1-r*r)*pow(1-c,5.0);
}
fn trace(o: vec3f, d: vec3f, seed: ptr<function,u32>) -> vec3f {
  let ground=terrain(o,d,1e6);
  if(config.transport.x>.5){
    var limit=ground.t;
    if(config.bounds.z>.5&&abs(d.y)>1e-8){let t=(config.bounds.w-o.y)/d.y;if(t>.001&&all(abs((o+d*t).xz)<=vec2f(32))){limit=min(limit,t);}}
    let e=emitter(o,d,limit);if(e.index<4u){let light=areaLights[e.index];return aerial(o,d,e.t,light.color.xyz*light.position.w*select(0.0,1.0,dot(d,light.normal.xyz)<0));}
  }
  if(config.water.x>.5&&config.bounds.z>.5){return lakeTrace(o,d,ground,seed);}
  if (config.bounds.z<.5 || abs(d.y)<1e-8) { return aerial(o,d,select(ground.t,0.0,ground.t>=1e6),land(o,d,ground,seed,0)); }
  let waterT=(config.bounds.w-o.y)/d.y; let p=o+d*waterT;
  if (waterT<.001 || waterT>=ground.t || any(abs(p.xz)>vec2f(32))) { return aerial(o,d,select(ground.t,0.0,ground.t>=1e6),land(o,d,ground,seed,0)); }
  let entering=d.y<0; let n=select(vec3f(0,-1,0),vec3f(0,1,0),entering);
  let eta=select(1.333,1/1.333,entering); let f=select(fresnel(clamp(-dot(n,d),0.0,1.0),eta),interfaceF(clamp(-dot(n,d),0.0,1.0),eta),config.transport.x>.5);
  let reflected=reflect(d,n); let ro=p+n*.003;
  var color=f*land(ro,reflected,terrain(ro,reflected,1e6),seed,waterT);
  if (f<1) {
    let transmitted=refract(d,n,eta); let to=p-n*.003; let hit=terrain(to,transmitted,1e6);
    let distance=select(waterT,min(hit.t,80.0),entering);
    let absorption=select(vec3f(.12,.045,.025),vec3f(.045,.09,.025),config.fog.x<.5);
    let transmittance=exp(-absorption*distance);
    color+=(1-f)*(land(to,transmitted,hit,seed,waterT)*transmittance+vec3f(.025,.11,.13)*(1-transmittance));
  }
  return aerial(o,d,waterT,color);
}
fn display(linear: vec3f) -> vec3f {
  let mapped=linear/(vec3f(1)+linear);
  return select(1.055*pow(mapped,vec3f(1/2.4))-.055,12.92*mapped,mapped<=vec3f(.0031308));
}
@compute @workgroup_size(8,8)
fn render(@builtin(global_invocation_id) id: vec3u) {
  let xy=id.xy+config.tile.xy;
  if (any(id.xy>=config.tile.zw) || any(xy>=config.image.xy)) { return; }
  let index=xy.y*config.image.x+xy.x;
  var seed=(index+1u)*747796405u+(config.image.z+1u)*2891336453u+config.image.w;
  let uv=(vec2f(xy)+vec2f(random(&seed),random(&seed)))/vec2f(config.image.xy)*2-1;
  let d=normalize(config.forward.xyz+config.right.xyz*(uv.x*.48*config.eye.w)-config.up.xyz*(uv.y*.48));
  var radiance=trace(config.eye.xyz,d,&seed);
  if(config.atmosphere.x>.5&&config.transport.x<.5){radiance*=4;} // Fixed development exposure for normalized solar irradiance.
  if (!all(radiance>=vec3f(0)) || !all(radiance<vec3f(1e6))) { atomicAdd(&invalid,1u); radiance=vec3f(0); }
  let count=f32(config.image.z);
  let average=(accumulation[index].xyz*count+radiance)/(count+1);
  accumulation[index]=vec4f(average,1);
  let rgb=vec3u(round(clamp(select(display(average),transportDisplay(average),config.transport.x>.5),vec3f(0),vec3f(1))*255));
  pixels[index]=rgb.x | (rgb.y<<8u) | (rgb.z<<16u) | 0xff000000u;
}
// CPU/GPU parity diagnostics use the exact traversal and display functions above.
@compute @workgroup_size(64)
fn probe(@builtin(global_invocation_id) id: vec3u) {
  if (id.x>=arrayLength(&probes)) { return; }
  let h=terrain(rays[id.x*2u].xyz,rays[id.x*2u+1u].xyz,1e6);
  probes[id.x]=vec4f(h.t,display(vec3f(.18)).x,fresnel(.5,1/1.333),fresnel(.1,1.333));
}
