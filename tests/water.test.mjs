// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {waterDefaults,waterTransmittance,waterNormal,waterUniforms} from '../web/water/model.js';
import {interfaceF} from '../web/lighting/model.js';
import {legacyScene,defaultScene,upgradeScene,currentRendering,renderState,validateScene,serializeScene,parseScene,sceneKey,updateSceneVersion} from '../web/scene/document.js';
import {atmosphereFromLegacy,sunDirection} from '../web/atmosphere/solar.js';
import {frameUniforms} from '../web/scene/terrain.js';
import {layeredTerrain} from '../web/scene/noise.js';
import {importedTerrain} from '../web/scene/heightmaps.js';
import {History} from '../web/scene/history.js';
import {geometryKey,renderKey,TerrainCache} from '../web/scene/generation.js';
import {validateRenderOptions} from '../web/render/tracer.js';
const schema=JSON.parse(fs.readFileSync(new URL('../internal/scene/schema.json',import.meta.url))),near=(a,b,e=1e-10)=>assert.ok(Math.abs(a-b)<e,`${a} vs ${b}`);
test('homogeneous attenuation obeys identity, reciprocity, multiplicativity and depth/scale/density',()=>{
 const w=waterDefaults();assert.deepEqual(waterTransmittance(0,w),[1,1,1]);
 for(const length of [.001,.1,1,10,1000]) {
  const t=waterTransmittance(length,w),half=waterTransmittance(length/2,w);
  t.forEach((v,i)=>{assert.ok(v>=0&&v<=1);near(v,half[i]*half[i]);});assert.ok(t[0]<=t[1]&&t[1]<=t[2]);
  waterTransmittance(length,{...w,density:2}).forEach((v,i)=>near(v,t[i]*t[i]));
  waterTransmittance(length,{...w,metresPerUnit:200}).forEach((v,i)=>near(v,t[i]*t[i]));
 }
 near(waterTransmittance(.1,w)[0],Math.exp(-.56));
 assert.deepEqual(Array.from(waterUniforms(null)),Array(8).fill(0));assert.equal(waterUniforms(w).byteLength,32);
});
test('exact water Fresnel handles grazing and total internal reflection',()=>{
 near(interfaceF(1,1/1.333),((1-1.333)/(1+1.333))**2);assert.equal(interfaceF(0,1/1.333),1);assert.equal(interfaceF(.1,1.333),1);
 for(let i=0;i<100;i++){const f=interfaceF(i/100,1/1.333);assert.ok(f>=0&&f<=1);near(f+(1-f),1);}
});
test('ripple normals are bounded, deterministic, filtered, and vanish for calm water',()=>{
 const w=waterDefaults();for(let i=0;i<100;i++) {const n=waterNormal(i*.13,i*-.2,w);near(Math.hypot(...n),1);assert.ok(n[1]>.98);assert.deepEqual(n,waterNormal(i*.13,i*-.2,w));}
 assert.deepEqual(waterNormal(3,4,{...w,ripples:0}).map(v=>v||0),[0,1,0]);
 const far=waterNormal(3,4,w,4);near(far[1],1);near(far[0],0);near(far[2],0);
});
test('new defaults and starter scenes enable current models; legacy opening does not silently upgrade',()=>{
 assert.ok(currentRendering(defaultScene()));assert.equal(defaultScene().version,9);validateScene(defaultScene(),schema);
 const old=legacyScene();assert.equal(parseScene(serializeScene(old,schema),schema).version,1);
 for(const study of JSON.parse(fs.readFileSync(new URL('../web/scenes/studies.json',import.meta.url))))assert.ok(currentRendering(validateScene(study.scene,schema)));
});
test('one undoable upgrade preserves terrain, camera, water settings and actual sunlight',()=>{
 for(const elevation of [5,12,25,38,85]) {
  const old=legacyScene();old.lighting.sunElevation=elevation;
  const h=new History(old,s=>validateScene(s,schema));const before=frameUniforms(renderState(old),16/9);
  h.edit(upgradeScene);assert.equal(h.value.version,9);assert.deepEqual(h.value.terrain,old.terrain);assert.deepEqual(h.value.camera,old.camera);assert.equal(h.value.water.level,old.water.level);assert.equal(h.value.water.enabled,old.water.enabled);
  const after=frameUniforms(renderState(h.value),16/9);for(let i=16;i<19;i++)near(before[i],after[i],1e-7);
  const direction=sunDirection(atmosphereFromLegacy(elevation));direction.forEach((v,i)=>near(v,before[16+i],1e-7));
  const key=sceneKey(h.value);h.edit(upgradeScene);assert.equal(sceneKey(h.value),key);h.undo();assert.deepEqual(h.value,old);h.redo();assert.equal(sceneKey(h.value),key);
 }
});
test('v9 optical fields survive serialization and reject malformed parameters; optional capabilities can be disabled',()=>{
 const s=defaultScene();assert.deepEqual(parseScene(serializeScene(s,schema),schema),s);
 for(const [key,value] of [['density',0],['ripples',2],['wavelength',0],['metresPerUnit',Infinity],['shore',-.1],['model','external']]){const invalid=structuredClone(s);invalid.water.optics[key]=value;assert.throws(()=>validateScene(invalid,schema));}
 for(const key of Object.keys(s.water.optics)){const invalid=structuredClone(s);delete invalid.water.optics[key];assert.throws(()=>validateScene(invalid,schema));}
 delete s.lighting.transport;delete s.atmosphere;delete s.surface;updateSceneVersion(s);assert.equal(s.version,9);validateScene(s,schema);delete s.water.optics;updateSceneVersion(s);assert.equal(s.version,1);
});
test('water changes invalidate the image and reuse terrain heights and field',async()=>{
 const state=renderState(defaultScene()),cache=new TerrainCache(),fast={yieldControl:async()=>{}};await cache.build(state,fast);
 const next=structuredClone(state);next.waterOptics.density=2;assert.notEqual(geometryKey(next),geometryKey(state));assert.notEqual(renderKey(next),renderKey(state));const result=await cache.build(next,fast);assert.equal(result.heightsChanged,false);assert.equal(result.surfaceChanged,false);assert.equal(result.field,null);
});
test('bounded sampling and private lighting-preview dimensions are distinct from export options',()=>{
 for(const samples of [8,16,32,64,128,256])validateRenderOptions({width:960,height:540,samples});
 validateRenderOptions({width:320,height:180,samples:16,preview:true});assert.throws(()=>validateRenderOptions({width:320,height:180,samples:16}));assert.throws(()=>validateRenderOptions({width:960,height:540,samples:16,preview:true}));
});

test('water optics survives terrain conversions without downgrading the scene',()=>{
 const s=defaultScene(),water=structuredClone(s.water);s.terrain=layeredTerrain(s.terrain);updateSceneVersion(s);validateScene(s,schema);assert.equal(s.version,9);assert.deepEqual(s.water,water);
 s.terrain=importedTerrain(s.terrain,'a'.repeat(64),{resolution:128,minimum:-2,maximum:8,elevation:1,metersPerUnit:100});updateSceneVersion(s);validateScene(s,schema);assert.equal(s.version,9);assert.deepEqual(s.water,water);
});
