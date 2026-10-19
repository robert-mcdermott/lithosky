// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bsdf,bsdfPDF,sampleBSDF,dielectric,interfaceF,displayColor,filmic,powerHeuristic,lightFrame,lightUniforms,transportDefaults,areaLightDefaults,normalize,dot} from '../web/lighting/model.js';
import {legacyScene as defaultScene,renderState,updateSceneVersion,validateScene,serializeScene,parseScene} from '../web/scene/document.js';
import {geometryKey,renderKey} from '../web/scene/generation.js';
import {layeredTerrain} from '../web/scene/noise.js';
const schema=JSON.parse(fs.readFileSync(new URL('../internal/scene/schema.json',import.meta.url)));
const radical=(i)=>{let x=0,s=.5;while(i){x+=(i&1)*s;i>>>=1;s*=.5;}return x;};
test('white furnace: reciprocal diffuse/GGX mixture never creates energy, including grazing views and low roughness',()=>{
 const n=[0,1,0],count=32768;
 for(const r of [.1,.3,.65,1])for(const mu of [1,.5,.05])for(const ior of [1.1,1.5,2.5]) {
  const v=[Math.sqrt(1-mu*mu),mu,0];let energy=0;
  for(let i=0;i<count;i++) {const {direction:l,pdf}=sampleBSDF(n,v,r,(i%2)*.5,(Math.floor(i/2)+.5)/(count/2),radical(Math.floor(i/2)));if(pdf)energy+=bsdf(n,v,l,[1,1,1],r,ior)[0]*l[1]/pdf/count;}
  assert.ok(energy>.3&&energy<=1.005,`${r}/${mu}/${ior}: ${energy}`);
 }
 const a=normalize([.4,1,.2]),b=normalize([-.7,1,.3]);
 for(const r of [.1,.65,1])assert.ok(bsdf(n,a,b,[.4,.6,.8],r).every((v,i)=>Math.abs(v-bsdf(n,b,a,[.4,.6,.8],r)[i])<1e-12));
 assert.deepEqual(bsdf(n,a,[0,-1,0],[1,1,1],.5),[0,0,0]);assert.ok(Math.abs(dielectric(1)-.04)<1e-14);assert.equal(dielectric(0),1);assert.equal(interfaceF(.1,1.333),1);assert.ok(interfaceF(.8,1.333)<1);
});
test('independent hemisphere quadrature agrees with BSDF mixture sampling including rejected specular directions',()=>{
 const n=[0,1,0],v=normalize([1,.5,0]),r=.65,N=65536;let quadrature=0,sampled=0;
 for(let i=0;i<N;i++) {
  const y=(i+.5)/N,p=2*Math.PI*radical(i),s=Math.sqrt(1-y*y),l=[s*Math.cos(p),y,s*Math.sin(p)];quadrature+=bsdf(n,v,l,[1,1,1],r)[0]*y*2*Math.PI/N;
  const hit=sampleBSDF(n,v,r,(i%2)*.5,(Math.floor(i/2)+.5)/(N/2),radical(Math.floor(i/2)));if(hit.pdf)sampled+=bsdf(n,v,hit.direction,[1,1,1],r)[0]*hit.direction[1]/hit.pdf/N;
 }
 assert.ok(Math.abs(sampled-quadrature)<.002,`${sampled} / ${quadrature}`);
 assert.equal(bsdfPDF(n,v,[0,-1,0],r),0);
});
test('MIS weights form a partition and do not duplicate constant environment energy',()=>{
 const N=65536;let result=0;for(let i=0;i<N;i++) {const y=(i+.5)/N,p=1/(2*Math.PI),q=y/Math.PI;result+=y/Math.PI*powerHeuristic(p,q)/p/N;const c=Math.sqrt(y),b=c/Math.PI;result+=powerHeuristic(b,p)/N;assert.ok(Math.abs(powerHeuristic(p,q)+powerHeuristic(q,p)-1)<1e-14);}
 assert.ok(Math.abs(result-1)<.00001,result);
});
test('filmic display is monotonic, retains bright highlight gradation, maps black exactly, and contains saturated colors',()=>{
 assert.deepEqual(displayColor([0,0,0]),[0,0,0]);let last=-1;
 for(let i=-16;i<24;i+=.1){const x=2**i,value=filmic(x);assert.ok(value>last&&value<1);last=value;}
 for(const rgb of [[1e5,0,0],[.18,.18,.18],[.1,4,.6],[0,0,1e5]])for(const ev of [-8,0,8])for(const curve of ['filmic','reinhard'])assert.ok(displayColor(rgb,ev,curve).every(x=>Number.isFinite(x)&&x>=0&&x<=1));
 assert.ok(displayColor([.18,.18,.18],1)[0]>displayColor([.18,.18,.18],0)[0]);
 assert.ok(displayColor([4,4,4])[0]<displayColor([16,16,16])[0]);
});
test('area-light frames remain orthonormal at poles and light buffers have a fixed budget',()=>{
 for(const pitch of [-90,-55,0,90])for(const yaw of [-180,0,180]){const f=lightFrame({...areaLightDefaults(),pitch,yaw});assert.ok(Math.abs(dot(f.n,f.t))<1e-12);assert.ok(Math.abs(Math.hypot(...f.n)-1)<1e-12);assert.ok(Math.abs(Math.hypot(...f.b)-1)<1e-12);}
 const t=transportDefaults();t.lights.push(areaLightDefaults());const values=lightUniforms(t);assert.equal(values.byteLength,256);assert.equal(values[3],2);t.lights[0].enabled=false;assert.equal(lightUniforms(t)[3],0);
});
test('v8 lighting round-trips and survives terrain/material upgrades without rebuilding geometry',()=>{
 const s=defaultScene(),before=renderState(s);s.lighting.transport=transportDefaults();s.lighting.transport.lights=[areaLightDefaults()];updateSceneVersion(s);assert.equal(s.version,8);validateScene(s,schema);
 assert.equal(geometryKey(before),geometryKey(renderState(s)));assert.notEqual(renderKey(before),renderKey(renderState(s)));
 assert.deepEqual(parseScene(serializeScene(s,schema),schema),s);s.terrain=layeredTerrain(s.terrain);updateSceneVersion(s);validateScene(s,schema);
 delete s.lighting.transport;updateSceneVersion(s);assert.equal(s.version,3);
});
