// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaultScene,validateScene,renderState} from '../web/scene/document.js';
import {entityScene,entityCommand,editScene} from '../web/scene/entities.js';
import {authorScene,spatialCommand,copySelection,selectionPivot} from '../web/scene/spatial-editor.js';
import {compose,multiply,inverse,decompose,worldMatrix,point,unit,transformDefaults} from '../web/scene/spatial.js';
import {SHAPES,intersectPrimitive,primitiveMesh,primitiveUniforms,primitiveBudget} from '../web/scene/primitives.js';
import {History} from '../web/scene/history.js';
import {renderKey,geometryKey,TerrainCache} from '../web/scene/generation.js';
const schema=JSON.parse(fs.readFileSync(new URL('../internal/scene/schema.json',import.meta.url))),validate=s=>validateScene(s,schema),near=(a,b,t=1e-7)=>a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<t,`${a} != ${b}`));
function setup(){const history=new History(defaultScene(),validate);const run=(c,ids,v)=>{let result;history.edit(s=>result=spatialCommand(s,c,ids,v));return result;};return {history,run};}
test('positive TRS inverses, hierarchy and decomposition preserve points and reject shear',()=>{
 for(const rotation of [[23,41,-67],[90,90,37],[-20,-90,15],[180,-180,180]]){const t={position:[13,-4,21],rotation,scale:[.2,3,8]},m=compose(t);near(point(inverse(m),point(m,[3,5,7])),[3,5,7]);near(compose(decompose(m)),m);}
 const m=multiply(compose({position:[0,0,0],rotation:[0,45,0],scale:[1,1,2]}),compose({position:[0,0,0],rotation:[0,30,0],scale:[1,1,1]}));assert.throws(()=>decompose(m),/shear/);
});
test('all closed solids have independent expected entry, exit, caps and transformed normals',()=>{
 for(const shape of SHAPES){const object={shape,matrix:compose(transformDefaults())};assert.equal(intersectPrimitive(object,[0,0,2],[0,0,-1]).t,shape==='cone'?1.75:1.5);assert.ok(intersectPrimitive(object,[0,0,0],[0,1,0]));assert.equal(intersectPrimitive(object,[2,0,0],[0,1,0]),null);const bottom=intersectPrimitive(object,[0,-2,0],[0,1,0]);assert.equal(bottom.t,1.5);near(bottom.normal,[0,-1,0]);}
 const m=compose({position:[6,7,-3],rotation:[23,41,12],scale:[2,3,.5]}),origin=point(m,[0,0,2]),direction=unit(point(m,[0,0,-1],0));const h=intersectPrimitive({shape:'sphere',matrix:m},origin,direction);near(origin.map((x,i)=>x+direction[i]*h.t),point(m,[0,0,.5]));assert.ok(Math.abs(Math.hypot(...h.normal)-1)<1e-9);
 for(const shape of SHAPES){const mesh=primitiveMesh([{matrix:m,shape,color:[.4,.5,.6],roughness:.65}]);for(let i=0;i<mesh.length;i+=9){const p=point(inverse(m),[...mesh.slice(i,i+3)]),r=Math.hypot(p[0],p[2]),boundary=shape==='box'?Math.abs(Math.max(...p.map(Math.abs))-.5):shape==='sphere'?Math.abs(Math.hypot(...p)-.5):shape==='cylinder'?Math.min(Math.abs(Math.abs(p[1])-.5),Math.abs(r-.5)):Math.min(Math.abs(p[1]+.5),Math.abs(r-.5*(.5-p[1])));assert.ok(boundary<.00001,'Preview vertex left the analytic surface');assert.ok(Math.abs(Math.hypot(...mesh.slice(i+3,i+6))-1)<.00001);}}
 const budget=primitiveBudget(Array.from({length:32},()=>({shape:'sphere'})));assert.equal(budget.triangles,32*528);assert.equal(budget.previewBytes,1824768);assert.equal(budget.analyticBytes,3072);assert.equal(primitiveUniforms([]).byteLength,96);assert.throws(()=>primitiveUniforms(new Array(33)),/budget/);
});
test('adding preserves existing scene data and terrain cache keys; grouping/reparenting preserves world pose',()=>{
 const {history,run}=setup(),old=history.value,key=geometryKey(renderState(old)),[a]=run('add',[],{shape:'box',position:[2,0,3]}),[b]=run('add',[],{shape:'sphere',position:[-2,0,-1]});assert.equal(history.value.version,12);assert.equal(geometryKey(renderState(history.value)),key);assert.deepEqual(entityScene(old).entities,history.value.entities.filter(n=>!n.components.primitive));
 const before=[a,b].map(id=>worldMatrix(history.value,id)),[group]=run('group-selection',[a,b]);[a,b].forEach((id,i)=>near(worldMatrix(history.value,id),before[i]));run('transform',[group],{mode:'rotate',axis:1,amount:35});run('transform',[group],{mode:'scale',amount:1.5,uniform:true});const world=worldMatrix(history.value,a);history.edit(s=>entityCommand(s,'parent',a,''));near(worldMatrix(history.value,a),world);history.undo();history.edit(s=>entityCommand(s,'delete',group));near(worldMatrix(history.value,a),world);assert.ok(history.value.entities.find(n=>n.id===b));
 history.edit(s=>editScene(s,v=>v.terrain.seed++));assert.ok(history.value.entities.find(n=>n.id===a));
});
test('locked descendants and unsupported transforms reject whole commands without changing history',()=>{
 const {history,run}=setup(),[a]=run('add',[],{shape:'cone',position:[0,0,0]}),[group]=run('group-selection',[a]);history.edit(s=>entityCommand(s,'locked',a,true));const old=history.value;assert.throws(()=>run('transform',[group],{mode:'move',axis:0,amount:1}),/locked/);assert.deepEqual(history.value,old);assert.throws(()=>run('transform',['terrain-main'],{mode:'move',axis:0,amount:1}),/existing controls/);history.edit(s=>entityCommand(s,'locked',a,false));run('set-transform',[group],transformDefaults());history.edit(s=>entityCommand(s,'parent','water-main',group));assert.throws(()=>run('transform',[group],{mode:'rotate',axis:1,amount:10}),/existing controls/);
 const legacy=entityScene(defaultScene());entityCommand(legacy,'add-group',null,null,'protected-group');entityCommand(legacy,'locked','protected-group',true);spatialCommand(legacy,'add',[],{shape:'sphere',position:[0,0,0]});validate(legacy);assert.ok(legacy.entities.find(n=>n.id==='protected-group').locked);
});
test('multi transforms apply selected ancestors once; copy/paste remaps IDs and delete is undoable',()=>{
 const {history,run}=setup(),[a]=run('add',[],{shape:'box',position:[0,0,0]}),[b]=run('add',[],{shape:'cylinder',position:[3,0,0]}),[group]=run('group-selection',[a,b]),start=worldMatrix(history.value,a);run('transform',[group,a],{mode:'move',axis:0,amount:2});near(worldMatrix(history.value,a).slice(12,15),start.slice(12,15).map((x,i)=>x+(i===0?2:0)));
 const copy=copySelection(history.value,[group,a]),[duplicate]=run('paste',[],copy);assert.notEqual(duplicate,group);assert.equal(new Set(history.value.entities.map(n=>n.id)).size,history.value.entities.length);const children=history.value.entities.filter(n=>n.parent===duplicate);assert.equal(children.length,2);assert.ok(children.every(n=>n.id!==a&&n.id!==b));assert.equal(copy.nodes.find(n=>n.id===a).parent,group);const before=history.value;run('delete-selection',[children[0].id]);history.undo();assert.deepEqual(history.value,before);
});
test('local axes, alignment, conservative terrain placement and cancel/redo use full transactions',async()=>{
 const {history,run}=setup(),[a]=run('add',[],{shape:'box',position:[0,0,0]}),[b]=run('add',[],{shape:'sphere',position:[3,0,4]});run('set-transform',[a],{position:[0,1,0],rotation:[0,90,0],scale:[2,2,2]});run('transform',[a],{mode:'move',axis:0,space:'local',amount:2});near(worldMatrix(history.value,a).slice(12,15),[0,1,-2]);run('align',[a,b],{axis:0});assert.equal(selectionPivot(history.value,[a])[0],3);
 const cache=new TerrainCache();await cache.build(renderState(history.value),{yieldControl:async()=>{}});run('drop',[a],{field:cache.field});assert.ok(worldMatrix(history.value,a)[13]>0);const before=history.value;history.undo();const redo=history.future.slice();history.begin();run('transform',[a],{mode:'move',axis:0,amount:4});assert.ok(history.cancel());assert.deepEqual(history.future,redo);history.redo();assert.deepEqual(history.value,before);
});
test('v12 shared fixtures enforce schema, graph, primitive count and compounded world budgets',()=>{for(const f of JSON.parse(fs.readFileSync(new URL('./fixtures/spatial.json',import.meta.url)))){if(f.valid)validate(f.scene);else assert.throws(()=>validate(f.scene),f.name);}});
