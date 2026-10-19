// SPDX-License-Identifier: Apache-2.0
struct Paint {values:array<vec4f,4096>}
@group(0) @binding(11) var<uniform> painted:Paint;
override paintEnabled:bool=false;
fn paintAt(p:vec2f)->vec4f {
 if(!paintEnabled){return vec4f(0);}let uv=clamp((p+32)/64*63,vec2f(0),vec2f(63));let ij=min(vec2u(floor(uv)),vec2u(62));let f=uv-vec2f(ij);let i=ij.y*64u+ij.x;
 return mix(mix(painted.values[i],painted.values[i+1u],f.x),mix(painted.values[i+64u],painted.values[i+65u],f.x),f.y);
}
fn applyPaint(weights:vec4f,p:vec2f)->vec4f {let m=paintAt(p);return weights*(1-dot(m,vec4f(1)))+m.wxzy;}
fn authoredSurface(h:Hit,p:vec3f,n:vec3f,footprint:f32)->GeoSurface {
 if(h.material.x<.5){return geologicalSurface(p,n,footprint);}
 if(h.material.x<1.5){return GeoSurface(h.color,n,h.material.y);}
 let def=GeoDefinition(vec4f(2,h.material.x-1,0,h.material.w),vec4f(5.4,.6,39,.6),vec4f(h.material.z,.65,.55,.6),vec4f(h.material.y,1,0,0),0u);
 var result=evaluateGeologicalMaterial(def,p,n,footprint);result.color*=h.color;return result;
}
@compute @workgroup_size(64)
fn paintProbe(@builtin(global_invocation_id) id:vec3u){if(id.x>=arrayLength(&probes)){return;}probes[id.x]=paintAt(rays[id.x*2u].xz);}
@compute @workgroup_size(64)
fn objectMaterialProbe(@builtin(global_invocation_id) id:vec3u){if(id.x*2u>=arrayLength(&probes)){return;}let o=solids[0];let p=rays[id.x*2u];let n=normalize(rays[id.x*2u+1u].xyz);let h=Hit(0,n,o.color.xyz,n,vec4f(1+o.finish.y,o.finish.x,o.finish.z,o.finish.w));let m=authoredSurface(h,p.xyz,n,p.w);probes[id.x*2u]=vec4f(m.color,m.roughness);probes[id.x*2u+1u]=vec4f(m.normal,1);}
