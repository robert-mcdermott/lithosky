// SPDX-License-Identifier: Apache-2.0
struct CameraRay {origin:vec3f,direction:vec3f}
fn lensRay(uv:vec2f,disk:vec2f)->CameraRay {
 var o=config.eye.xyz;var d=normalize(config.forward.xyz+config.right.xyz*(uv.x*config.right.w*config.eye.w)-config.up.xyz*(uv.y*config.right.w));
 if(config.lens.z>0){let radius=sqrt(disk.x)*config.lens.z;let angle=6.28318530718*disk.y;let focus=o+d*(config.lens.y/dot(d,config.forward.xyz));o+=radius*(cos(angle)*config.right.xyz+sin(angle)*config.up.xyz);d=normalize(focus-o);}
 return CameraRay(o,d);
}
@compute @workgroup_size(64)
fn cameraProbe(@builtin(global_invocation_id) id:vec3u) {
 if(id.x*2u>=arrayLength(&probes)){return;}let a=rays[id.x*2u];let ray=lensRay(a.xy*2-1,a.zw);
 probes[id.x*2u]=vec4f(ray.origin,ray.direction.x);probes[id.x*2u+1u]=vec4f(ray.direction.yz,config.right.w,config.lens.y);
}
