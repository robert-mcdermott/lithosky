// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, createTerrain, normalize } from '../web/scene/terrain.js';
import { createHeightfield, cellTriangles, intersectTriangle, intersectHeightfield, fresnel, displayChannel, GRID, MAX_STEPS } from '../web/render/heightfield.js';
import { validateRenderOptions, renderTiles, TILE_WIDTH, TILE_HEIGHT } from '../web/render/tracer.js';

const field=createHeightfield(defaults);
test('final vertices, normals, colors and triangle diagonal match dry preview',()=>{
  const preview=createTerrain({...defaults,waterEnabled:false});
  for (const [x,z] of [[0,0],[64,64],[127,127],[24,71]]) {
    const triangles=cellTriangles(field,x,z);
    const offset=(z*GRID+x)*54;
    assert.deepEqual(triangles.flat(2),[0,9,18,27,36,45].flatMap(i=>Array.from(preview.slice(offset+i,offset+i+3))));
    for (const [v,index] of [[0,z*129+x],[1,(z+1)*129+x],[2,z*129+x+1]]) {
      assert.deepEqual(Array.from(preview.slice(offset+v*9+3,offset+v*9+6)),Array.from(field.vertices.slice(index*12+4,index*12+7)));
      assert.deepEqual(Array.from(preview.slice(offset+v*9+6,offset+v*9+9)),Array.from(field.vertices.slice(index*12+8,index*12+11)));
    }
  }
});
test('vertical, boundary, parallel, inside and grazing rays agree with exhaustive triangles',()=>{
  const triangles=[];
  for(let z=0;z<GRID;z++) for(let x=0;x<GRID;x++) triangles.push(...cellTriangles(field,x,z));
  const rays=[
    [[0,30,0],[0,-1,0]], [[32,30,32],[0,-1,0]], [[-32,30,-32],[0,-1,0]],
    [[32,30,-32],[0,-1,0]], [[0,-20,0],[0,1,0]], [[40,30,0],[0,-1,0]],
    [[0,30,0],[1,0,0]], [[-40,2,0],[1,0,0]], [[0,4,40],[0,0,-1]],
    [[32,4,0],[-1,0,0]], [[0,30,0],[0,1,0]], [[0,4,0],[1,.000001,0]],
  ];
  for(let i=0;i<24;i++) rays.push([[Math.sin(i*3)*40,6+i%6,Math.cos(i*7)*40],normalize([Math.cos(i),-.2,Math.sin(i)])]);
  for(const [o,d] of rays) {
    const expected=triangles.reduce((best,tri)=>{const hit=intersectTriangle(o,d,...tri);return hit && (!best || hit.t<best.t)?hit:best;},null);
    const actual=intersectHeightfield(field,o,d);
    assert.equal(!!actual,!!expected,JSON.stringify({o,d,actual,expected}));
    if(actual) { assert.ok(Math.abs(actual.t-expected.t)<1e-4); assert.ok(actual.steps<=MAX_STEPS); }
  }
});
test('shadow distance limits do not report objects beyond the light',()=>{
  const o=[0,30,0],d=[0,-1,0],hit=intersectHeightfield(field,o,d);
  assert.ok(hit); assert.equal(intersectHeightfield(field,o,d,hit.t-.01),null);
  assert.ok(intersectHeightfield(field,o,d,hit.t+.01));
});
test('dielectric weights conserve energy, include total internal reflection and normal reflectance',()=>{
  assert.ok(Math.abs(fresnel(1,1/1.333)-.0203731878)<1e-9);
  assert.equal(fresnel(.1,1.333),1);
  for(const eta of [1/1.333,1.333]) for(let i=0;i<=100;i++) {
    const f=fresnel(i/100,eta); assert.ok(Number.isFinite(f)&&f>=0&&f<=1);
    for(const attenuation of [0,.1,.5,1]) assert.ok(f+(1-f)*attenuation<=1+1e-12);
  }
});
test('display uses Reinhard followed by sRGB transfer with finite bounded output',()=>{
  assert.equal(displayChannel(0),0);
  assert.ok(Math.abs(displayChannel(.18)-.4269461)<1e-6);
  assert.ok(Math.abs(displayChannel(1)-.735356983)<1e-9);
  let previous=-1;
  for(const radiance of [0,.001,.01,.18,1,10,10000]) { const v=displayChannel(radiance); assert.ok(v>=previous&&v<=1); previous=v; }
  for(const invalid of [-1,NaN,Infinity]) assert.throws(()=>displayChannel(invalid));
});
test('render limits reject oversized or malformed jobs; tiles cover each pixel once',()=>{
  for(const [width,height] of [[640,360],[960,540]]) {
    validateRenderOptions({width,height,samples:16});
    const coverage=new Uint8Array(width*height);
    for(const [x,y,w,h] of renderTiles(width,height)) {
      assert.ok(w*h<=TILE_WIDTH*TILE_HEIGHT);
      for(let row=y;row<y+h;row++) for(let col=x;col<x+w;col++) coverage[row*width+col]++;
    }
    assert.ok(coverage.every(n=>n===1));
  }
  for(const options of [{width:4000,height:2250,samples:16},{width:640,height:360,samples:100000},{width:640,height:361,samples:16},{width:NaN,height:360,samples:16}]) assert.throws(()=>validateRenderOptions(options));
});
