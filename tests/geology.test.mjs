// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {geologyDefaults,noiseGradient,evaluateGeology,roughDiffuse,materialUniforms} from '../web/material/geology.js';
import {materialDefaults} from '../web/scene/materials.js';
import {legacyScene as defaultScene,updateSceneVersion,validateScene,renderState,serializeScene,parseScene} from '../web/scene/document.js';
import {layeredTerrain} from '../web/scene/noise.js';
import {atmosphereDefaults} from '../web/atmosphere/solar.js';
import {TerrainCache} from '../web/scene/generation.js';
const schema=JSON.parse(fs.readFileSync(new URL('../internal/scene/schema.json',import.meta.url)));
const material=()=>({...materialDefaults(),geology:geologyDefaults()});
const normalize=a=>{const d=Math.hypot(...a);return a.map(x=>x/d);};
test('solid-noise analytic gradients agree with independent finite differences and remain continuous at cell edges',()=>{
  for(const seed of [0,9837,4294967295])for(const p of [[.37,-1.41,7.29],[-8.2,4.7,-3.1],[0,0,0],[1,2,-1]]) {
    const analytic=noiseGradient(p,seed),epsilon=1e-5;
    for(let axis=0;axis<3;axis++) {const lo=[...p],hi=[...p];lo[axis]-=epsilon;hi[axis]+=epsilon;const numeric=(noiseGradient(hi,seed)[3]-noiseGradient(lo,seed)[3])/(2*epsilon);assert.ok(Math.abs(numeric-analytic[axis])<1e-6);}
  }
  for(const x of [-1,0,1]) {const lo=noiseGradient([x-1e-6,.2,.3],17),hi=noiseGradient([x+1e-6,.2,.3],17);assert.ok(lo.every((v,i)=>Math.abs(v-hi[i])<1e-7));}
});
test('geological presets are seeded, reusable, bounded and have safe normal perturbations',()=>{
  for(const preset of ['rules','rock','sand','snow','ground'])for(const palette of ['natural','otherworld'])for(const seed of [0,4294967295])for(const p of [[-32,-64,32],[1.31,5.62,-7.2],[.01,64,-.7]]) {
    const n=normalize([.7,.2,-.1]),m={...material(),preset,detail:1,geology:{...geologyDefaults(),bump:1}},a=evaluateGeology(m,p,n,.001,seed,palette);
    assert.ok(a.color.every(x=>Number.isFinite(x)&&x>=0&&x<=.98));assert.ok(a.roughness>=.05&&a.roughness<=1);
    assert.ok(Math.abs(Math.hypot(...a.normal)-1)<1e-10);assert.ok(a.normal.reduce((s,x,i)=>s+x*n[i],0)>=.7999);
    assert.ok(Math.abs(a.weights.reduce((s,x)=>s+x,0)-1)<1e-10);
    assert.deepEqual(a,evaluateGeology(m,p,n,.001,seed,palette));
  }
  const m={...material(),preset:'rock'},p=[1.31,5.62,-7.2],n=[0,1,0];
  assert.notDeepEqual(evaluateGeology(m,p,n,.001,1),evaluateGeology(m,p,n,.001,2));
  assert.deepEqual(evaluateGeology({...m,geology:{...m.geology,bump:0}},p,n,.001).normal,n);
});
test('unresolved frequencies average out and finer footprints converge instead of changing material scale',()=>{
  const m={...material(),preset:'rock'},n=[0,1,0],p=[2.123,7.21,-8.15];
  assert.deepEqual(evaluateGeology(m,p,n,8,1),evaluateGeology(m,p,n,8,2));
  const fine=evaluateGeology(m,p,n,.0001,1),finer=evaluateGeology(m,p,n,.00001,1);assert.deepEqual(fine,finer);
  const a=evaluateGeology(m,p,n,.04,1),b=evaluateGeology(m,p,n,.040001,1);assert.ok(a.color.every((v,i)=>Math.abs(v-b.color[i])<.0001));
});
test('rough diffuse is reciprocal, reduces to Lambertian and has bounded integrated reflectance',()=>{
  const n=[0,1,0],light=normalize([.7,1,.2]),view=normalize([-.3,1,.2]);
  assert.equal(roughDiffuse(n,view,light,0),1);assert.equal(roughDiffuse(n,view,[0,-1,0],.7),0);
  for(const roughness of [.1,.5,1])assert.ok(Math.abs(roughDiffuse(n,view,light,roughness)-roughDiffuse(n,light,view,roughness))<1e-12);
  for(const roughness of [0,.5,1])for(const mu of [1,.5,.05]) {
    const view=[Math.sqrt(1-mu*mu),mu,0];let energy=0;
    for(let z=0;z<48;z++)for(let a=0;a<96;a++){const y=(z+.5)/48,phi=(a+.5)/96*2*Math.PI,r=Math.sqrt(1-y*y);energy+=roughDiffuse(n,view,[r*Math.cos(phi),y,r*Math.sin(phi)],roughness)*y*2/(48*96);}
    assert.ok(energy>=0&&energy<=1.001,`${roughness}, ${mu}: ${energy}`);
  }
});
test('v7 migration preserves geology through atmosphere, layers, imports and removal; legacy formats remain strict',()=>{
  let scene=defaultScene();scene.surface=material();updateSceneVersion(scene);assert.equal(scene.version,7);validateScene(scene,schema);
  scene.atmosphere=atmosphereDefaults();updateSceneVersion(scene);assert.equal(scene.version,7);validateScene(scene,schema);
  scene.terrain=layeredTerrain(scene.terrain);updateSceneVersion(scene);assert.deepEqual(scene.terrain.sculpt,[]);validateScene(scene,schema);
  scene.terrain={generator:'heightmap-v1',seed:1,elevation:1,palette:'natural',resolution:128,sculpt:[],asset:'a'.repeat(64),minimum:0,maximum:8,metersPerUnit:1};updateSceneVersion(scene);validateScene(scene,schema);assert.equal(scene.version,7);
  delete scene.atmosphere;updateSceneVersion(scene);assert.equal(scene.version,7);validateScene(scene,schema);
  assert.deepEqual(parseScene(serializeScene(scene,schema),schema),scene);
  const malformed=structuredClone(scene);malformed.version=6;assert.throws(()=>validateScene(malformed,schema));
  delete scene.surface.geology;updateSceneVersion(scene);assert.equal(scene.version,5);validateScene(scene,schema);
  assert.ok(materialUniforms({}).every(x=>x===0));
});
test('geological detail changes neither terrain positions nor hierarchy and final preparation stays bounded',async()=>{
  const scene=defaultScene(),cache=new TerrainCache(),options={yieldControl:async()=>{}};
  const before=await cache.build(renderState(scene),options);scene.surface=material();updateSceneVersion(scene);const after=await cache.build(renderState(scene),options);
  assert.equal(after.heightsChanged,false);assert.deepEqual(after.field.hierarchy,before.field.hierarchy);
  for(let i=0;i<before.field.vertices.length;i+=12)assert.deepEqual(after.field.vertices.slice(i,i+8),before.field.vertices.slice(i,i+8));
  const plain=await new TerrainCache().final(renderState({...scene,surface:undefined}),512,options),geological=await cache.final(renderState(scene),512,options);
  for(let i=0;i<plain.vertices.length;i+=12)assert.deepEqual(geological.vertices.slice(i,i+8),plain.vertices.slice(i,i+8));
});
test('angular joints agree with a wider independent nearest-site search and finite-difference gradients',async()=>{
  const {jointGradient,hash3}=await import('../web/material/geology.js');
  for(let i=0;i<48;i++) {
    const p=[Math.sin(i*1.3)*5,Math.cos(i*.7)*5,Math.sin(i*.9)*5],cell=p.map(Math.floor),sites=[];
    for(let z=-2;z<=2;z++)for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++) {
      const c=[cell[0]+x,cell[1]+y,cell[2]+z],site=c.map((v,k)=>v+.35+.3*hash3(...c,(9837+k*1013)>>>0));
      sites.push({site,d:site.reduce((s,v,k)=>s+(p[k]-v)**2,0)});
    }
    sites.sort((a,b)=>a.d-b.d);const [a,b]=sites,separation=Math.hypot(...a.site.map((v,k)=>v-b.site[k]));
    const v=jointGradient(p,9837);assert.ok(Math.abs(v[3]-(b.d-a.d)/(2*separation))<1e-10);
    const epsilon=1e-5;for(let axis=0;axis<3;axis++){const lo=[...p],hi=[...p];lo[axis]-=epsilon;hi[axis]+=epsilon;assert.ok(Math.abs((jointGradient(hi,9837)[3]-jointGradient(lo,9837)[3])/(2*epsilon)-v[axis])<1e-6);}
  }
});
