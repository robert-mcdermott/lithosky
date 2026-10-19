// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {entityScene,sceneView,entityCommand,editScene,entityState,kindOf} from '../web/scene/entities.js';
import {defaultScene,legacyScene,validateScene,serializeScene,parseScene,renderState,upgradeScene} from '../web/scene/document.js';
import {geometryKey,renderKey,TerrainCache} from '../web/scene/generation.js';
import {areaLightDefaults} from '../web/lighting/model.js';
import {pickEntity,lightCorners} from '../web/scene/entity-picking.js';
import {cameraRay} from '../web/camera/model.js';
import {History} from '../web/scene/history.js';
const schema=JSON.parse(fs.readFileSync(new URL('../internal/scene/schema.json',import.meta.url))),validate=s=>validateScene(s,schema),fast={yieldControl:async()=>{}};
const h=()=>new History(entityScene(defaultScene()),validate);
test('legacy and current scenes migrate without modifying component data or rendering',()=>{
 const scenes=[legacyScene(),defaultScene(),...JSON.parse(fs.readFileSync(new URL('../web/scenes/compositions.json',import.meta.url))).map(s=>s.scene)];
 for(const original of scenes){const before=structuredClone(original),next=entityScene(original);validate(next);assert.deepEqual(original,before);assert.deepEqual(sceneView(next),before);assert.equal(renderKey(renderState(next)),renderKey(renderState(before)));assert.deepEqual(parseScene(serializeScene(next,schema),schema),next);const reordered=JSON.parse(JSON.stringify(next,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort()):v));validate(reordered);assert.equal(kindOf(reordered.entities.find(n=>n.id==='terrain-main')),'terrain');}
});
test('legacy control adapter preserves identities through terrain/camera/model edits and light changes',()=>{
 const history=h();history.edit(s=>editScene(s,v=>{v.lighting.transport.lights.push(areaLightDefaults(),{...areaLightDefaults(),name:'Second'});}));let lights=history.value.entities.filter(n=>kindOf(n)==='light'),ids=lights.map(n=>n.id);
 history.edit(s=>editScene(s,v=>{v.terrain.seed=72;v.camera.lens.roll=13;v.lighting.transport.lights[0].name='Key';v.lighting.transport.lights.reverse();}));assert.deepEqual(history.value.entities.filter(n=>kindOf(n)==='light').map(n=>n.id),ids.slice().reverse());assert.equal(sceneView(history.value).terrain.seed,72);assert.equal(history.value.entities.find(n=>n.id===ids[0]).name,'Key');
 history.edit(s=>editScene(s,v=>v.lighting.transport.lights.splice(0,1)));assert.equal(history.value.entities.filter(n=>kindOf(n)==='light').length,1);assert.equal(history.value.entities.find(n=>kindOf(n)==='light').id,ids[0]);
 history.edit(s=>upgradeScene(s));assert.equal(history.value.version,11);history.undo();assert.equal(history.value.version,11);
});
test('entity metadata commands use one history transaction, preserve redo and do not invalidate pixels',()=>{
 const history=h(),before=renderKey(renderState(history.value));history.edit(s=>entityCommand(s,'rename','terrain-main','My peaks'));assert.equal(renderKey(renderState(history.value)),before);history.edit(s=>entityCommand(s,'add-group',null,null,'group-a'));history.edit(s=>entityCommand(s,'parent','terrain-main','group-a'));assert.equal(renderKey(renderState(history.value)),before);history.undo();assert.equal(history.value.entities.find(n=>n.id==='terrain-main').parent,'');history.redo();assert.equal(history.value.entities.find(n=>n.id==='terrain-main').parent,'group-a');history.edit(s=>entityCommand(s,'delete','group-a'));assert.equal(history.value.entities.find(n=>n.id==='terrain-main').parent,'');assert.equal(history.value.entities.some(n=>n.id==='group-a'),false);
});
test('locks reject actual component edits, regeneration, deletion and grouping through shared commands',()=>{
 const history=h();history.edit(s=>entityCommand(s,'add-group',null,null,'group-a'));history.edit(s=>entityCommand(s,'parent','terrain-main','group-a'));history.edit(s=>entityCommand(s,'locked','group-a',true));const before=history.value;
 for(const change of [s=>editScene(s,v=>v.terrain.seed++),s=>editScene(s,v=>v.terrain={...v.terrain,seed:9}),s=>entityCommand(s,'rename','terrain-main','No'),s=>entityCommand(s,'visible','terrain-main',false),s=>entityCommand(s,'parent','terrain-main',''),s=>entityCommand(s,'delete','group-a')]){assert.throws(()=>history.edit(change),/locked/);assert.deepEqual(history.value,before);}
 history.edit(s=>entityCommand(s,'locked','group-a',false));history.edit(s=>editScene(s,v=>v.terrain.seed++));assert.notDeepEqual(history.value,before);
 history.edit(s=>entityCommand(s,'locked','camera-main',true));assert.throws(()=>history.edit(s=>editScene(s,v=>v.camera.yaw+=.1)),/locked/);
 history.edit(s=>entityCommand(s,'add-group',null,null,'group-b'));history.edit(s=>entityCommand(s,'locked','terrain-main',true));const lockedChild=history.value;
 assert.throws(()=>history.edit(s=>entityCommand(s,'parent','group-a','group-b')),/locked/);assert.deepEqual(history.value,lockedChild);
});
test('visibility propagates independently of authored enabled flags and preserves source terrain',async()=>{
 const scene=entityScene(defaultScene());entityCommand(scene,'add-group',null,null,'group-a');entityCommand(scene,'parent','terrain-main','group-a');entityCommand(scene,'parent','water-main','group-a');const cache=new TerrainCache(),original=renderState(scene);await cache.build(original,fast);const base=cache.base,field=cache.field;
 entityCommand(scene,'visible','group-a',false);assert.equal(entityState(scene,'terrain-main').visible,false);const hidden=renderState(scene),result=await cache.build(hidden,fast);assert.equal(hidden.terrainVisible,false);assert.equal(hidden.waterEnabled,false);assert.equal(result.mesh.length,0);assert.equal(cache.base,base);assert.equal(cache.field,field);assert.equal(sceneView(scene).water.enabled,true);
 entityCommand(scene,'visible','water-main',false);entityCommand(scene,'visible','group-a',true);assert.equal(renderState(scene).waterEnabled,false);entityCommand(scene,'visible','terrain-main',false);entityCommand(scene,'visible','water-main',true);const water=await cache.build(renderState(scene),fast);assert.ok(water.mesh.length>0);for(let i=1;i<water.mesh.length;i+=9)assert.equal(water.mesh[i],sceneView(scene).water.level);
 assert.notEqual(geometryKey(original),geometryKey(hidden));entityCommand(scene,'visible','environment-main',false);assert.equal(renderState(scene).transport.sun,0);assert.equal(renderState(scene).transport.sky,0);
});
test('CPU viewport selection respects land/water occlusion, visibility and area light rectangles',async()=>{
 const scene=entityScene(defaultScene()),state=renderState(scene),cache=new TerrainCache();await cache.build(state,fast);const result=pickEntity(scene,state,cache.field,16/9,.5,.5);assert.ok(['terrain-main','water-main'].includes(result));entityCommand(scene,'visible','terrain-main',false);entityCommand(scene,'visible','water-main',false);assert.equal(pickEntity(scene,renderState(scene),cache.field,16/9,.5,.5),'environment-main');
 const ray=cameraRay(state,16/9,.5,.5),p=ray.origin.map((x,i)=>x+ray.direction[i]*2);editScene(scene,v=>v.lighting.transport.lights.push({...areaLightDefaults(),x:p[0],y:p[1],z:p[2],yaw:0,pitch:90,width:4,height:4}));const light=scene.entities.find(n=>kindOf(n)==='light');assert.equal(pickEntity(scene,renderState(scene),cache.field,16/9,.5,.5),light.id);assert.equal(lightCorners(light.components.areaLight).length,4);entityCommand(scene,'locked',light.id,true);assert.equal(pickEntity(scene,renderState(scene),cache.field,16/9,.5,.5),light.id);assert.equal(pickEntity(scene,state,cache.field,16/9,-1,0),null);
});
test('shared malformed graph fixtures agree with the schema and semantic bounds',()=>{for(const f of JSON.parse(fs.readFileSync(new URL('./fixtures/entities.json',import.meta.url)))){if(f.valid)validate(f.scene);else assert.throws(()=>validate(f.scene),f.name);}});
