// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFinalSurface,sampleHeights,TerrainCache} from '../web/scene/generation.js';
import {buildHierarchy,finalBudget,intersectHeightfield,intersectLinear} from '../web/render/heightfield.js';
import {defaults} from '../web/scene/terrain.js';
const fast={yieldControl:async()=>{}};
const dense=(resolution,fn)=>sampleHeights(Float32Array.from({length:(resolution+1)**2},(_,i)=>fn((i%(resolution+1))*64/resolution-32,Math.floor(i/(resolution+1))*64/resolution-32)),resolution);
const state={...defaults,generator:'heightmap-v1'};
test('a narrow ridge between preview vertices survives detailed final geometry',async()=>{
  const source=dense(1024,(x)=>8*Math.exp(-(((x-.125)/.025)**2)));
  const draft=await buildFinalSurface(source,state,128,fast),fine=await buildFinalSurface(source,state,1024,fast);
  const origin=[.125,20,-2],direction=[0,-1,0];
  assert.ok(intersectHeightfield(draft,origin,direction).t>19.99);
  assert.ok(Math.abs(intersectHeightfield(fine,origin,direction).t-12)<1e-6);
  // A grazing horizontal ray must also see the new ridge silhouette.
  assert.equal(intersectHeightfield(draft,[-1,4,-2],[1,0,0]),null);
  const hit=intersectHeightfield(fine,[-1,4,-2],[1,0,0]);assert.ok(hit&&hit.t>1&&hit.t<1.125);
  assert.equal(hit.t,intersectLinear(fine,[-1,4,-2],[1,0,0]).t);
});
test('all final tiers intersect a sloped plane including borders and parallel rays',async()=>{
  const source=dense(1024,(x,z)=>x*.125-z*.25+3);
  for(const grid of [128,256,512,1024]) {
    const field=await buildFinalSurface(source,state,grid,fast),budget=finalBudget(grid);
    assert.equal(field.vertices.byteLength,budget.verticesBytes);assert.equal(field.hierarchy.byteLength,budget.hierarchyBytes);
    for(const [x,z] of [[-32,-32],[32,32],[0,0],[.125,-.0625],[-16,8],[31.999,-31.999]]) {
      const expected=30-(x*.125-z*.25+3);
      for(const intersect of [intersectHeightfield,intersectLinear])assert.ok(Math.abs(intersect(field,[x,30,z],[0,-1,0]).t-expected)<1e-5);
    }
    assert.equal(intersectHeightfield(field,[33,30,0],[0,-1,0]),null);
    assert.equal(intersectHeightfield(field,[0,30,0],[1,0,0]),null);
    assert.ok(field.vertices.every(Number.isFinite));
    assert.deepEqual(field.hierarchy,buildHierarchy(field));
  }
});
test('final geometry respects source resolution and validates allocation tiers',async()=>{
  const source=dense(256,()=>0),field=await buildFinalSurface(source,state,1024,fast);
  assert.equal(field.resolution,256);
  for(const grid of [0,127,2048,Infinity,512.1])await assert.rejects(()=>buildFinalSurface(source,state,grid,fast),/resolution/);
  assert.ok(finalBudget(1024).verticesBytes<51*1024*1024);
});
test('final preparation cancels without publishing a partial field',async()=>{
  const source=dense(1024,()=>0),abort=new AbortController();let progress=0;
  await assert.rejects(()=>buildFinalSurface(source,state,1024,{...fast,signal:abort.signal,onProgress:p=>{progress=p;abort.abort();}}),{name:'AbortError'});
  assert.ok(progress>0&&progress<.01);
});
test('draft final retains legacy field; fine final samples the original analytic generator',async()=>{
  const cache=new TerrainCache(),preview=await cache.build(defaults,fast);
  const draft=await cache.final(defaults,128,fast);assert.deepEqual(draft,preview.field);
  const fine=await cache.final(defaults,512,fast);assert.equal(fine.resolution,512);
  assert.equal(cache.field.vertices.length,129**2*12);assert.equal(fine.vertices.length,513**2*12);
  assert.equal(fine.vertices[1],draft.vertices[1]);
});
test('final preparation replays sculpting without modifying the preview cache',async()=>{
  const plain={...defaults,generator:'layers-v1',resolution:256,layers:[],sculpt:[]};
  const sculpted={...plain,sculpt:[{tool:'raise',radius:2,strength:1,height:0,points:[[0,0]]}]};
  const cache=new TerrainCache(),preview=await cache.build(sculpted,fast),final=await cache.final(sculpted,1024,fast);
  assert.equal(final.resolution,256);assert.equal(intersectHeightfield(final,[0,10,0],[0,-1,0]).t,9);
  assert.deepEqual(cache.field,preview.field);
  const undone=await cache.final(plain,1024,fast);assert.equal(intersectHeightfield(undone,[0,10,0],[0,-1,0]).t,10);
});
