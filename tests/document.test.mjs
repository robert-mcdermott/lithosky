// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultScene, validateScene, parseScene, serializeScene, renderState, MAX_SCENE_BYTES } from '../web/scene/document.js';
import { createTerrain } from '../web/scene/terrain.js';
import { History } from '../web/scene/history.js';
import { Autosave } from '../web/scene/autosave.js';
const schema = JSON.parse(readFileSync(new URL('../internal/scene/schema.json', import.meta.url)));
const validate = value => validateScene(value, schema);
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/scenes.json', import.meta.url)));
for (const fixture of fixtures) test('shared schema: ' + fixture.name, () => {
  if (fixture.valid) assert.deepEqual(parseScene(serializeScene(fixture.scene,schema),schema),fixture.scene);
  else assert.throws(() => validate(fixture.scene));
});
test('reject malformed, oversized, prototype fields and nonfinite numbers', () => {
  for (const text of ['{', '{} {}', ' '.repeat(MAX_SCENE_BYTES+1)]) assert.throws(() => parseScene(text,schema));
  const scene=defaultScene(); scene.camera.yaw=Infinity; assert.throws(()=>validate(scene));
  assert.throws(()=>parseScene(JSON.stringify(defaultScene()).replace('"camera":','"__proto__":{},"camera":'),schema));
});
test('complete scene round trip preserves geometry, water and camera', () => {
  const scene=defaultScene();scene.water.level=2;scene.camera.yaw=1;scene.terrain.seed=87654;
  const loaded=parseScene(serializeScene(scene,schema),schema);
  assert.deepEqual(createTerrain(renderState(loaded),16),createTerrain(renderState(scene),16));
  scene.water.enabled=false;
  assert.notDeepEqual(createTerrain(renderState(loaded),16),createTerrain(renderState(scene),16));
});
test('history groups drag, branches redo, bounds snapshots, rejects invalid import without touching work', () => {
  const h=new History(defaultScene(),validate,2);
  h.begin(); for(let i=0;i<10;i++)h.edit(s=>s.terrain.seed=i); h.end();
  assert.equal(h.past.length,1);h.undo();assert.equal(h.value.terrain.seed,1847);h.redo();assert.equal(h.value.terrain.seed,9);
  const before=h.value;assert.throws(()=>h.replace({version:2}));assert.deepEqual(h.value,before);
  h.undo();h.edit(s=>s.water.level=1);assert.equal(h.canRedo,false);
  h.edit(s=>s.water.level=2);h.edit(s=>s.water.level=3);assert.equal(h.past.length,2);
  const copy=h.value;copy.title='mutated';assert.notEqual(h.value.title,copy.title);
});
test('autosave serializes requests and saves newest pending state', async () => {
  const calls=[];let release;
  const saver=new Autosave(async (scene,revision)=>{calls.push([scene.terrain.seed,revision]);if(calls.length===1)await new Promise(r=>release=r);return revision+1},0,()=>{},100000);
  saver.enqueue(defaultScene());const first=saver.flush();await Promise.resolve();
  const next=defaultScene();next.terrain.seed=5;saver.enqueue(next);next.terrain.seed=6;saver.enqueue(next);
  assert.equal(calls.length,1);release();await first;await saver.flush();
  assert.deepEqual(calls,[[1847,0],[6,1]]);assert.equal(saver.unsaved,false);
});
test('autosave failure retains data and retries uncertain request before new edits', async () => {
  const calls=[];let fail=true;
  const saver=new Autosave(async (scene,revision)=>{calls.push([scene.terrain.seed,revision]);if(fail)throw new Error('offline');return revision+1},0,()=>{},100000);
  saver.enqueue(defaultScene());await saver.flush();assert.equal(saver.unsaved,true);
  const next=defaultScene();next.terrain.seed=42;saver.enqueue(next);assert.equal(calls.length,1);
  fail=false;await saver.retry();await saver.flush();
  assert.deepEqual(calls,[[1847,0],[1847,0],[42,1]]);assert.equal(saver.unsaved,false);
});
