// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, normalize } from '../web/scene/terrain.js';
import { cameraRay } from '../web/scene/sculpt-view.js';
import { createHeightfield, buildHierarchy, cellTriangles, intersectTriangle, intersectHeightfield, intersectLinear } from '../web/render/heightfield.js';
const field=createHeightfield(defaults);
function exact(field,origin,direction,limit=1e6) {
  let closest=null;
  for(let z=0;z<128;z++)for(let x=0;x<128;x++)for(const tri of cellTriangles(field,x,z)) {
    const h=intersectTriangle(origin,direction,...tri,closest?.t??limit);if(h)closest=h;
  }
  return closest;
}
function agree(a,b,tolerance=1e-4) {assert.equal(!!a,!!b);if(a)assert.ok(Math.abs(a.t-b.t)<tolerance,JSON.stringify({a,b}));}
test('2 KiB hierarchy encloses every rounded triangle, including shared block edges',()=>{
  assert.equal(field.hierarchy.byteLength,2048);
  for(let bz=0;bz<16;bz++)for(let bx=0;bx<16;bx++) {
    const [low,high]=field.hierarchy.subarray((bz*16+bx)*2,(bz*16+bx)*2+2);
    for(let z=bz*8;z<=bz*8+8;z++)for(let x=bx*8;x<=bx*8+8;x++) {
      const h=field.vertices[(z*129+x)*12+1];assert.ok(h>=low&&h<=high);
    }
  }
});
test('hierarchy matches exhaustive silhouette, grazing, boundary, inside and finite shadow rays',()=>{
  const rays=[];
  for(const pitch of [.08,.3,1.2])for(let i=0;i<8;i++)rays.push(cameraRay({...defaults,pitch},16/9,i/7,.35+i%3*.1));
  for(const x of [-32,-28,0,28,32])for(const dx of [-1,0,1])rays.push({origin:[x,2,-28],direction:normalize([dx,1e-6,1])});
  rays.push({origin:[0,field.vertices[(64*129+64)*12+1],0],direction:[0,1,0]});
  for(const {origin,direction} of rays) {
    const h=intersectHeightfield(field,origin,direction);agree(h,exact(field,origin,direction));
    agree(h,intersectLinear(field,origin,direction));
    if(h){assert.equal(intersectHeightfield(field,origin,direction,h.t-.002),null);agree(h,intersectHeightfield(field,origin,direction,h.t+.002));}
  }
});
test('a one-cell peak remains visible and empty blocks skip fine triangle tests',()=>{
  const f={vertices:field.vertices.slice(),low:0,high:10};
  for(let i=1;i<f.vertices.length;i+=12)f.vertices[i]=0;
  f.vertices[(64*129+64)*12+1]=10;f.hierarchy=buildHierarchy(f);
  for(const y of [0.001,5,9.999,10,10.001]) {
    const o=[-40,y,0],d=[1,0,0];agree(intersectHeightfield(f,o,d),exact(f,o,d));
  }
  const linear={},hierarchical={},o=[-40,9,8],d=[1,0,0];
  assert.equal(intersectLinear(f,o,d,1e6,null,linear),null);
  assert.equal(intersectHeightfield(f,o,d,1e6,hierarchical),null);
  assert.equal(linear.cells,128);assert.equal(hierarchical.cells??0,0);assert.equal(hierarchical.blocks,16);
});
test('deterministic ray sweep matches linear traversal and bounds cell work',()=>{
  for(let i=0;i<2000;i++) {
    const o=[Math.sin(i*13.17)*40,i%17-4,Math.cos(i*7.97)*40],d=normalize([Math.sin(i),Math.cos(i*3)*.2,Math.cos(i)]),stats={};
    agree(intersectHeightfield(field,o,d,1e6,stats),intersectLinear(field,o,d));
    assert.ok((stats.blocks??0)<=34);assert.ok((stats.cells??0)<=34*18);
  }
});
