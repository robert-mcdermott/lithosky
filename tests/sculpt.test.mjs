// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sculptHeights,extendStroke,MAX_DABS,MAX_STROKES} from '../web/scene/sculpt.js';
import {TerrainCache,terrainBudget} from '../web/scene/generation.js';
import {materialDefaults} from '../web/scene/materials.js';
import {History,HISTORY_BYTES} from '../web/scene/history.js';
import {defaultScene,renderState,validateScene,parseScene,serializeScene,MAX_SCENE_BYTES} from '../web/scene/document.js';
import {layeredTerrain} from '../web/scene/noise.js';
import {cameraRay,pickTerrain,projectPoint,fieldHeight} from '../web/scene/sculpt-view.js';
const fast={yieldControl:async()=>{}},schema=JSON.parse(readFileSync(new URL('../internal/scene/schema.json',import.meta.url)));
const valid=s=>validateScene(s,schema);
const scene=()=>{const s=defaultScene();s.version=3;s.terrain=layeredTerrain(s.terrain);s.terrain.sculpt=[];return s;};
const stroke=(tool='raise',points=[[0,0]])=>({tool,radius:3,strength:.5,height:2,points});
test('raise/lower affect only the brush, flatten converges without overshoot, source stays immutable',async()=>{
  const n=256,a=new Float32Array((n+1)**2),center=128*(n+1)+128;
  const raised=await sculptHeights(a,n,[stroke()],fast),lowered=await sculptHeights(a,n,[stroke('lower')],fast);
  assert.equal(raised[center],.5);assert.equal(lowered[center],-.5);assert.ok(a.every(v=>v===0));
  for(let z=0;z<=n;z++)for(let x=0;x<=n;x++)if(Math.hypot(x/4-32,z/4-32)>=3)assert.equal(raised[z*(n+1)+x],0);
  const flat=await sculptHeights(raised,n,[stroke('flatten')],fast);assert.equal(flat[center],1.25);
  assert.ok(flat.every(v=>v>=0&&v<=2));
});
test('smooth reads an immutable neighborhood, preserves constant fields and treats edges safely',async()=>{
  const n=256,a=new Float32Array((n+1)**2),center=128*(n+1)+128;a[center]=9;
  const s={...stroke('smooth'),strength:1};const result=await sculptHeights(a,n,[s],fast);
  assert.equal(result[center],1);assert.equal(result[center-2],result[center+2]);assert.equal(result[center-2*(n+1)],result[center+2*(n+1)]);
  const constant=new Float32Array(a.length).fill(-4);
  const edge=await sculptHeights(constant,n,[{...s,points:[[-32,-32],[32,32]]}],fast);assert.deepEqual(edge,constant);
});
test('height clamps and maximum brush/resolution are bounded; invalid work is rejected',async()=>{
  const n=2048,a=new Float32Array((n+1)**2).fill(64);
  const result=await sculptHeights(a,n,[{...stroke('smooth'),radius:8,points:[[32,32]]},stroke()],fast);
  assert.ok(result.every(v=>v===64));assert.equal(result.byteLength,terrainBudget(n).heightBytes);assert.ok(terrainBudget(n).peakBytes<63*1048576);
  for(const bad of [{...stroke(),radius:9},{...stroke(),points:[[33,0]]},{...stroke(),strength:Infinity},{...stroke(),points:Array(25).fill([0,0])},{...stroke(),tool:'script'}])await assert.rejects(sculptHeights(a,n,[bad],fast));
  await assert.rejects(sculptHeights(a,n,Array(33).fill(stroke()),fast));await assert.rejects(sculptHeights(a,4096,[],fast));
});
test('replay cancellation leaves the pristine field untouched and never returns partial output',async()=>{
  const n=256,a=new Float32Array((n+1)**2),abort=new AbortController();let events=0;
  await assert.rejects(sculptHeights(a,n,[stroke('raise',[[0,0],[1,1]])],{...fast,signal:abort.signal,onProgress:()=>{events++;abort.abort();}}),{name:'AbortError'});
  assert.equal(events,1);assert.ok(a.every(v=>v===0));
});
test('spatial sampling ignores event frequency and stops at the per-stroke cap',()=>{
  const a=stroke('raise',[]),b=stroke('raise',[]);a.radius=b.radius=2;
  extendStroke(a,[-20,0]);extendStroke(a,[-15.8,0]);
  extendStroke(b,[-20,0]);for(let i=1;i<=42;i++)extendStroke(b,[-20+i*.1,0]);
  assert.deepEqual(a.points,b.points);
  extendStroke(a,[32,32]);assert.equal(a.points.length,MAX_DABS);extendStroke(a,[-32,-32]);assert.equal(a.points.length,MAX_DABS);
});
test('undo/redo and save/reopen restore identical sculpt heights and surfaces, reusing pristine noise',async()=>{
  const history=new History(scene(),valid),cache=new TerrainCache();const initial=await cache.build(renderState(history.value),fast),base=cache.base;
  history.edit(s=>s.terrain.sculpt.push(stroke()));history.edit(s=>s.terrain.sculpt.push(stroke('smooth')));
  const edited=await cache.build(renderState(history.value),fast),heights=cache.effective.heights.slice();assert.equal(edited.noiseChanged,false);assert.equal(cache.base,base);
  history.undo();history.undo();const undone=await cache.build(renderState(history.value),fast);assert.deepEqual(undone.field,initial.field);
  history.redo();history.redo();const redone=await cache.build(renderState(history.value),fast);assert.deepEqual(cache.effective.heights,heights);assert.deepEqual(redone.field,edited.field);
  const reopened=parseScene(serializeScene(history.value,schema),schema),fresh=new TerrainCache();const loaded=await fresh.build(renderState(reopened),fast);assert.deepEqual(loaded.field,edited.field);assert.deepEqual(fresh.effective.heights,heights);
});
test('snapshot bytes stay bounded through long edit/undo/redo/group/branch sequences',()=>{
  const history=new History(scene(),valid,100,4096);
  for(let i=0;i<40;i++){history.edit(s=>s.title='Name '+i);assert.ok(history.snapshotBytes<=4096);}
  assert.ok(history.past.length<40);
  while(history.canUndo){history.undo();assert.ok(history.snapshotBytes<=4096);}
  while(history.canRedo){history.redo();assert.ok(history.snapshotBytes<=4096);}
  history.begin();for(let i=0;i<10;i++)history.edit(s=>s.title='Grouped '+i);history.end();history.undo();assert.equal(history.value.title,'Name 39');
  history.edit(s=>s.title='Branched');assert.equal(history.canRedo,false);assert.ok(history.snapshotBytes<=4096);assert.equal(HISTORY_BYTES,4*1048576);
});
test('largest sculpt document fits file and keepalive budgets and empty v3 strokes retain v2 geometry',async()=>{
  const s=scene(),point=[1.2345678901234567e-200,-1.2345678901234567e-200];
  s.terrain.sculpt=Array.from({length:MAX_STROKES},()=>stroke('smooth',Array.from({length:MAX_DABS},()=>point)));
  const text=serializeScene(s,schema);assert.ok(new TextEncoder().encode(text).length<=MAX_SCENE_BYTES);
  assert.ok(new TextEncoder().encode(JSON.stringify({expectedRevision:999999,scene:s})).length<60*1024);
  assert.deepEqual(parseScene(text,schema),s);
  const v4={...s,version:4,surface:materialDefaults()};
  assert.deepEqual(parseScene(serializeScene(v4,schema),schema),v4);
  assert.ok(new TextEncoder().encode(JSON.stringify({expectedRevision:999999,scene:v4})).length<60*1024);
  const original=scene(),cache=new TerrainCache();const v3=await cache.build(renderState(original),fast);delete original.terrain.sculpt;original.version=2;
  assert.deepEqual(v3.field,(await new TerrainCache().build(renderState(original),fast)).field);
});
test('picking and brush projection agree with the camera and visible triangle surface',async()=>{
  const state=renderState(scene()),{field}=await new TerrainCache().build(state,fast);
  const hit=pickTerrain(field,state,16/9,.5,.5);assert.ok(hit);const screen=projectPoint(state,16/9,hit);assert.ok(Math.abs(screen[0]-.5)<1e-6&&Math.abs(screen[1]-.5)<1e-6);
  assert.ok(Math.abs(fieldHeight(field,hit[0],hit[2])-hit[1])<.0001);
  assert.equal(pickTerrain(field,state,16/9,-1,.5),null);assert.ok(Math.abs(Math.hypot(...cameraRay(state,16/9,.5,.5).direction)-1)<1e-6);
});
test('sculpted depressions keep artistic reflectance in the physical storage range',async()=>{
  const s=scene();s.terrain.palette='otherworld';s.terrain.sculpt=[{...stroke('flatten'),height:-64,strength:1,points:[[0,0]]}];
  const {field}=await new TerrainCache().build(renderState(s),fast);
  for(let i=0;i<field.vertices.length;i+=12)for(let c=8;c<11;c++)assert.ok(field.vertices[i+c]>=0&&field.vertices[i+c]<=1);
});
