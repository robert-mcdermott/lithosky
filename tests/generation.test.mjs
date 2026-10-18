// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { TerrainCache, generateHeights, terrainBudget, geometryKey, heightKey, renderKey } from '../web/scene/generation.js';
import { TerrainGenerator } from '../web/scene/generator.js';
import { defaults, createTerrain, heightAt } from '../web/scene/terrain.js';
import { createHeightfield } from '../web/render/heightfield.js';
import { renderState } from '../web/scene/document.js';
import { layeredTerrain, layeredHeight, newLayer, terrace, fractal } from '../web/scene/noise.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/terrain.json',import.meta.url)));
const fast={yieldControl:async()=>{}};
const layered=()=>renderState(fixture.scene);
for(const record of fixture.records) test('stable layered height bytes, seed '+record.seed,async()=>{
  const field=await generateHeights({...layered(),seed:record.seed},fast);
  const hash=createHash('sha256').update(new Uint8Array(field.heights.buffer)).digest('hex');
  assert.equal(hash,record.sha256);assert.ok(field.heights.every(Number.isFinite));
});
test('worker surfaces preserve legacy preview and traced field exactly',async()=>{
  for(const state of [defaults,{...defaults,seed:972,elevation:.7,palette:'otherworld',waterLevel:1.1},{...defaults,waterLevel:Math.fround(heightAt(0,0,defaults))}]) {
    const result=await new TerrainCache().build(state,fast);
    assert.deepEqual(result.mesh,createTerrain(state));assert.deepEqual(result.field,createHeightfield(state));
  }
});
test('noise composition is ordered, enabled layers compose and terraces work below zero',()=>{
  const state={...defaults,...layeredTerrain(defaults)};
  const before=layeredHeight(3.2,-7.1,state);
  assert.notEqual(before,layeredHeight(3.2,-7.1,{...state,layers:[...state.layers].reverse()}));
  const disabled={...newLayer('terrace'),enabled:false};
  assert.equal(before,layeredHeight(3.2,-7.1,{...state,layers:[disabled,...state.layers]}));
  assert.equal(terrace(-1.5,1,0),-1.5);assert.equal(terrace(-1.5,1,1),-2);
  for(const seed of [0,4294967295]) for(const x of [-13.5,0,8.2]) {
    assert.ok(Math.abs(fractal(x,4,seed,8))<=1);const r=fractal(x,4,seed,8,true);assert.ok(r>=0&&r<=1);
  }
  assert.equal(heightAt(3.2,-7.1,state),before);
});
test('all resolution budgets allocate bounded scalar grids; invalid budgets fail before generation',async()=>{
  for(const resolution of [256,512,1024,2048]) {
    const state={...layered(),resolution,layers:[{...newLayer(),octaves:1}]};
    const field=await generateHeights(state,fast),budget=terrainBudget(resolution);
    assert.equal(field.heights.byteLength,budget.heightBytes);assert.equal(field.samples.length,129**2*5);
    assert.ok(budget.peakBytes<45*1024*1024);
  }
  for(const resolution of [0,128,300,2048.5,4096,Infinity]) {
    assert.throws(()=>terrainBudget(resolution));await assert.rejects(()=>generateHeights({...layered(),resolution},fast));
  }
});
test('cancellation stops at a row checkpoint without publishing a partial grid',async()=>{
  const abort=new AbortController();let progress=0;
  await assert.rejects(generateHeights({...layered(),resolution:2048},{signal:abort.signal,onProgress:p=>{progress=p;abort.abort();},...fast}),{name:'AbortError'});
  assert.ok(progress>0&&progress<.01);
});
test('camera/light/title reuse geometry; palette/elevation reuse heights; water reuses traced surface',async()=>{
  const cache=new TerrainCache(),state=layered();await cache.build(state,fast);
  const base=cache.base,field=cache.field;
  const camera={...state,yaw:1,sun:20,title:'Renamed'};
  assert.equal(geometryKey(state),geometryKey(camera));
  const water=await cache.build({...state,waterLevel:3},fast);
  assert.equal(water.heightsChanged,false);assert.equal(water.surfaceChanged,false);assert.equal(water.field,null);assert.equal(cache.field,field);
  const palette=await cache.build({...state,palette:'otherworld'},fast);
  assert.equal(palette.heightsChanged,false);assert.equal(palette.surfaceChanged,true);assert.equal(cache.base,base);
  const elevated=await cache.build({...state,elevation:1.5},fast);assert.equal(elevated.heightsChanged,false);assert.equal(cache.base,base);
  assert.equal(heightKey(state),heightKey({...state,layers:[...state.layers,{...newLayer(),enabled:false}]}));
  assert.equal(renderKey(state),renderKey({...state,layers:[...state.layers,{...newLayer(),enabled:false}]}));
  assert.notEqual(renderKey(state),renderKey(camera));
  const next=await cache.build({...state,seed:22},fast);assert.equal(next.heightsChanged,true);assert.notEqual(cache.base,base);
});
test('latest worker job wins; cancellation, errors and retry cannot publish stale buffers',async()=>{
  const workers=[];const generator=new TerrainGenerator(()=>{const worker={postMessage(data){this.data=data;},terminate(){this.terminated=true;}};workers.push(worker);return worker;});
  const a=generator.generate(layered()),rejected=assert.rejects(a,{name:'AbortError'}),old=workers[0];
  const b=generator.generate({...layered(),seed:22});await rejected;assert.equal(old.terminated,true);
  old.onmessage({data:{id:old.data.id,result:{stale:true}}});
  const current=workers[1];current.onmessage({data:{id:current.data.id,result:{newest:true}}});assert.deepEqual(await b,{newest:true});
  const c=generator.generate(layered());current.onerror({message:'worker crashed'});await assert.rejects(c,/worker crashed/);
  const d=generator.generate(layered());const retried=workers[2];retried.onmessage({data:{id:retried.data.id,result:{recovered:true}}});assert.deepEqual(await d,{recovered:true});
  const e=generator.generate(layered());generator.cancel();await assert.rejects(e,{name:'AbortError'});
});
