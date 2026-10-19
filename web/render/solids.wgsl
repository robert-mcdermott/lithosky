// SPDX-License-Identifier: Apache-2.0
// Analytic closed unit solids. The unnormalised local ray retains world t.
struct Solid {inverse:mat4x4f,color:vec4f,finish:vec4f}
@group(0) @binding(10) var<storage,read> solids:array<Solid>;
override solidCount:u32=0u;
fn solidRoots(a:f32,b:f32,c:f32)->vec2f {
 if(abs(a)<1e-12){if(abs(b)<1e-12){return vec2f(-1e30);}return vec2f(-c/b);}
 let delta=b*b-4*a*c;if(delta<0){return vec2f(-1e30);}
 let q=-.5*(b+select(1.0,-1.0,b<0)*sqrt(delta));if(q==0){return vec2f(-b/(2*a));}return vec2f(q/a,c/q);
}
fn solidHit(index:u32,origin:vec3f,direction:vec3f,limit:f32)->Hit {
 let object=solids[index];let o=(object.inverse*vec4f(origin,1)).xyz;let d=(object.inverse*vec4f(direction,0)).xyz;let shape=u32(object.color.w);
 var distance=limit;var normal=vec3f(0);var found=false;
 if(shape==0u){
  var near=-1e30;var far=1e30;var entering=vec3f(0);var leaving=vec3f(0);
  for(var i=0u;i<3u;i++){
   if(abs(d[i])<1e-12){if(abs(o[i])>.5){return miss();}}
   else{var a=(-.5-o[i])/d[i];var b=(.5-o[i])/d[i];var an=vec3f(0);var bn=vec3f(0);an[i]=-1;bn[i]=1;if(a>b){let t=a;a=b;b=t;let n=an;an=bn;bn=n;}if(a>near){near=a;entering=an;}if(b<far){far=b;leaving=bn;}}
  }
  if(near<=far){if(near>.001&&near<distance){distance=near;normal=entering;found=true;}else if(far>.001&&far<distance){distance=far;normal=leaving;found=true;}}
 }else if(shape==1u){
  let shift=-dot(o,d)/dot(d,d);let v=o+d*shift;let roots=solidRoots(dot(d,d),2*dot(v,d),dot(v,v)-.25);
  for(var i=0u;i<2u;i++){let t=roots[i]+shift;if(t>.001&&t<distance){distance=t;normal=v+d*roots[i];found=true;}}
 }else{
  let shift=-dot(o,d)/dot(d,d);let v=o+d*shift;let cone=shape==3u;let k=select(0.0,.25,cone);let q=.5-v.y;
  let roots=solidRoots(dot(d.xz,d.xz)-k*d.y*d.y,2*(dot(v.xz,d.xz)+k*q*d.y),dot(v.xz,v.xz)-select(.25,k*q*q,cone));
  for(var i=0u;i<2u;i++){let t=roots[i]+shift;let p=v+d*roots[i];if(t>.001&&t<distance&&p.y>=-.5&&p.y<=.5){distance=t;normal=vec3f(p.x,select(0.0,.25*(.5-p.y),cone),p.z);if(cone&&dot(p.xz,p.xz)<1e-10&&abs(p.y-.5)<1e-5){normal=vec3f(0,1,0);}found=true;}}
  if(cone&&abs(d.y)>1e-12){let t=(.5-o.y)/d.y;let p=o+d*t;if(t>.001&&t<distance&&dot(p.xz,p.xz)<1e-10){distance=t;normal=vec3f(0,1,0);found=true;}}
  if(abs(d.y)>1e-12){for(var i=0u;i<select(2u,1u,cone);i++){let y=select(-.5,.5,i==1u);let t=(y-o.y)/d.y;let p=o+d*t;if(t>.001&&t<distance&&dot(p.xz,p.xz)<=.25000001){distance=t;normal=vec3f(0,sign(y),0);found=true;}}}
 }
 if(found&&shape==0u){let p=o+d*distance;for(var i=0u;i<3u;i++){if(abs(abs(p[i])-.5)<1e-5){normal=vec3f(0);normal[i]=sign(p[i]);break;}}}
 if(!found){return miss();}if(dot(normal,normal)<1e-15){normal=vec3f(0,1,0);}
 let n=normalize((transpose(object.inverse)*vec4f(normal,0)).xyz);
 return Hit(distance,n,object.color.xyz,n,vec4f(1+object.finish.y,object.finish.x,object.finish.z,object.finish.w));
}
fn terrain(o:vec3f,d:vec3f,limit:f32)->Hit {
 var hit=terrainField(o,d,limit);
 for(var i=0u;i<solidCount;i++){let candidate=solidHit(i,o,d,min(limit,hit.t));if(candidate.t<hit.t){hit=candidate;}}
 return hit;
}
@compute @workgroup_size(64)
fn solidProbe(@builtin(global_invocation_id) id:vec3u){
 if(id.x>=arrayLength(&probes)){return;}var hit=miss();
 for(var i=0u;i<solidCount;i++){let candidate=solidHit(i,rays[id.x*2u].xyz,rays[id.x*2u+1u].xyz,hit.t);if(candidate.t<hit.t){hit=candidate;}}
 probes[id.x]=vec4f(hit.t,hit.normal);
}
