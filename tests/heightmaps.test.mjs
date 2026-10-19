// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {quantizeHeights,decodeHeightSamples,exportSamples,importedTerrain} from '../web/scene/heightmaps.js';
import {TerrainCache,generateHeights} from '../web/scene/generation.js';
import {legacyScene as defaultScene,sceneKey,renderState,validateScene,serializeScene,parseScene} from '../web/scene/document.js';
import {History} from '../web/scene/history.js';
import {sculptHeights} from '../web/scene/sculpt.js';
const schema=JSON.parse(readFileSync(new URL('../internal/scene/schema.json',import.meta.url))),fast={yieldControl:async()=>{}};
test('quantization stays within half a 16-bit step plus Float32 rounding at every budget',()=>{
 for(const resolution of [128,256,512,1024,2048]){
  const heights=Float32Array.from({length:(resolution+1)**2},(_,i)=>Math.sin(i*.013)*7-2),q=quantizeHeights(heights,resolution),state={resolution,minimum:q.minimum,maximum:q.maximum},decoded=decodeHeightSamples(q.raw,state),error=(q.maximum-q.minimum)/65535/2+1e-6;
  assert.equal(q.raw.byteLength,heights.length*2);for(let i=0;i<heights.length;i++)assert.ok(Math.abs(heights[i]-decoded[i])<=error);
 }
});
test('unsculpted export preserves all 16-bit codes, even when narrow ranges collapse in Float32',()=>{
 const resolution=256,raw=new Uint8Array((resolution+1)**2*2),v=new DataView(raw.buffer);for(let i=0;i<raw.length/2;i++)v.setUint16(i*2,i%65536,false);
 const state={generator:'heightmap-v1',resolution,minimum:63.999999,maximum:64,sculpt:[],metersPerUnit:12,elevation:1.5};
 const heights=decodeHeightSamples(raw,state),cache={base:{raw},effective:{heights,resolution}},result=exportSamples(cache,state);
 assert.deepEqual(result.raw,raw);assert.notEqual(result.raw,raw);assert.equal(result.scale.metersPerUnit,12);assert.equal(result.scale.elevation,1.5);
 const flat=quantizeHeights(new Float32Array(129**2).fill(-2),128);assert.equal(flat.minimum,-2);assert.equal(flat.maximum,-2);assert.ok(flat.raw.every(x=>x===0));
 assert.throws(()=>decodeHeightSamples(new Uint8Array(2),state));assert.throws(()=>quantizeHeights(new Float32Array(129**2).fill(Infinity),128));
});
test('v1 to asset-backed scene migration is undoable and assets never enter history or JSON',async()=>{
 const original=defaultScene(),history=new History(original,s=>validateScene(s,schema)),scale={resolution:128,minimum:-2,maximum:8,metersPerUnit:10,elevation:1};
 history.edit(scene=>{scene.version=5;scene.terrain=importedTerrain(scene.terrain,'a'.repeat(64),scale);});
 assert.deepEqual(history.value.camera,original.camera);assert.deepEqual(history.value.water,original.water);
 assert.ok(serializeScene(history.value,schema).length<2000);assert.deepEqual(parseScene(serializeScene(history.value,schema),schema),history.value);
 history.undo();assert.deepEqual(history.value,original);history.redo();assert.equal(history.value.version,5);assert.ok(history.snapshotBytes<4000);
 const heights=new Float32Array(129**2),sculpted=await sculptHeights(heights,128,[{tool:'raise',radius:2,strength:1,height:0,points:[[0,0]]}],fast);assert.equal(sculpted[64*129+64],1);
});
test('imported worker path decodes samples once and reuses them for surface changes',async()=>{
 const raw=new Uint8Array(129**2*2);raw[0]=255;raw[1]=255;
 const state=renderState({...defaultScene(),version:5,terrain:importedTerrain(defaultScene().terrain,'a'.repeat(64),{resolution:128,minimum:-2,maximum:8,elevation:1,metersPerUnit:1})});
 const original=globalThis.fetch;let reads=0;
 globalThis.fetch=async url=>url==='/api/session'?{ok:true,json:async()=>({token:'test'})}:{ok:true,arrayBuffer:async()=>{reads++;return raw.buffer.slice(0);}};
 try{
  const cache=new TerrainCache(),first=await cache.build(state,fast);assert.equal(cache.base.heights[0],8);assert.equal(cache.base.heights[1],-2);assert.equal(first.resolution,128);
  const next=await cache.build({...state,palette:'otherworld'},fast);assert.equal(next.noiseChanged,false);assert.equal(reads,1);
  const exported=exportSamples(cache,state);assert.deepEqual(exported.raw,raw);
  globalThis.fetch=async()=>({ok:false});await assert.rejects(generateHeights(state,fast),/authenticate/);
 }finally{globalThis.fetch=original;}
});

test('scene identity survives canonical JSON ordering without hiding edits',()=>{
 const scene=defaultScene(),reordered=JSON.parse(sceneKey(scene));
 assert.equal(sceneKey(scene),sceneKey(reordered));
 reordered.camera.distance+=1;assert.notEqual(sceneKey(scene),sceneKey(reordered));
});
