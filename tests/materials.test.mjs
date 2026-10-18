// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { materialColor, materialDefaults } from '../web/scene/materials.js';
import { defaults, normalize } from '../web/scene/terrain.js';
import { TerrainCache } from '../web/scene/generation.js';
import { layeredTerrain } from '../web/scene/noise.js';
const options={yieldControl:async()=>{}};
const state={...defaults,materials:{...materialDefaults(),detail:0}};
test('height/slope rules select sand, ground, rock and snow with smooth boundaries',()=>{
  const color=(h,n=[0,1,0])=>materialColor(0,0,h,n,state);
  assert.deepEqual(color(-2),[.5,.48,.34]);
  assert.deepEqual(color(3),[.28,.35,.26]);
  assert.deepEqual(color(10),[.82,.85,.82]);
  assert.deepEqual(color(10,normalize([1,.1,0])),[.39,.41,.37]);
  for(const h of [.6,5.4])assert.ok(color(h-.00001).every((c,i)=>Math.abs(c-color(h+.00001)[i])<.0001));
  const m=state.materials;
  assert.deepEqual(materialColor(0,0,10,[0,1,0],{...state,materials:{...m,snowHeight:20}}),[.28,.35,.26]);
});
test('all presets and palettes remain finite and bounded; procedural detail is seeded and repeatable',()=>{
  for(const preset of ['rules','rock','snow','sand','ground'])for(const palette of ['natural','otherworld']) {
    const s={...state,palette,materials:{...materialDefaults(),preset,detail:1}};
    for(const h of [-160,-64,0,64,160])for(const n of [[0,1,0],[1,0,0],normalize([1,.01,1])]) {
      const a=materialColor(1.234,-5.678,h,n,s);assert.ok(a.every(c=>Number.isFinite(c)&&c>=0&&c<=1));
      assert.deepEqual(a,materialColor(1.234,-5.678,h,n,s));
      assert.notDeepEqual(a,materialColor(1.234,-5.678,h,n,{...s,seed:s.seed+1}));
    }
    const flat={...s,materials:{...s.materials,detail:0}};
    assert.deepEqual(materialColor(0,0,3,[0,1,0],flat),materialColor(15,17,3,[0,1,0],flat));
  }
});
test('surface edits reuse noise, sculpted heights and hierarchy, and preserve preview/final alignment',async()=>{
  for(const terrain of [defaults,layeredTerrain(defaults)]) {
    const cache=new TerrainCache(),s={...defaults,...terrain,waterEnabled:false};
    const before=await cache.build(s,options),base=cache.base,effective=cache.effective,bounds=cache.hierarchy;
    const after=await cache.build({...s,materials:materialDefaults()},options);
    assert.equal(after.heightsChanged,false);assert.equal(after.surfaceChanged,true);
    assert.equal(cache.base,base);assert.equal(cache.effective,effective);assert.equal(cache.hierarchy,bounds);
    let changed=0;
    for(let i=0;i<after.field.vertices.length;i+=12) {
      assert.deepEqual(after.field.vertices.slice(i,i+8),before.field.vertices.slice(i,i+8));
      if(after.field.vertices[i+8]!==before.field.vertices[i+8])changed++;
    }
    assert.ok(changed>100);
    for(let z=0;z<128;z+=17)for(let x=0;x<128;x+=13) {
      const a=z*129+x,b=a+129,c=a+1,d=b+1;
      [a,b,c,c,b,d].forEach((index,j)=>{
        const v=after.field.vertices.subarray(index*12,index*12+12),m=after.mesh.subarray((z*128+x)*54+j*9,(z*128+x)*54+j*9+9);
        assert.deepEqual(Array.from(m),[...v.slice(0,3),...v.slice(4,7),...v.slice(8,11)]);
      });
    }
    await cache.build({...s,elevation:2,materials:materialDefaults()},options);assert.notEqual(cache.hierarchy,bounds);
  }
});
