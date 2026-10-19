// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateStudies } from '../web/scene/studies.js';
import { defaultScene, parseScene, serializeScene } from '../web/scene/document.js';
const schema=JSON.parse(fs.readFileSync(new URL('../internal/scene/schema.json',import.meta.url)));
const source=JSON.parse(fs.readFileSync(new URL('../web/scenes/studies.json',import.meta.url)));
test('starter scenes validate and round-trip as current files; defaults use the current renderer',()=>{
  const studies=validateStudies(source,schema);
  assert.deepEqual(studies[0].scene,defaultScene());
  assert.equal(new Set(studies.map(s=>s.scene.terrain.seed)).size,3);
  for(const study of studies) assert.deepEqual(parseScene(serializeScene(study.scene,schema),schema),study.scene);
  studies[0].scene.title='Changed'; assert.equal(source[0].scene.title,'Alpine quiet');
});
test('invalid or ambiguous starter catalogs are rejected',()=>{
  assert.throws(()=>validateStudies([],schema));
  assert.throws(()=>validateStudies([source[0],source[0],source[2]],schema));
  const invalid=structuredClone(source);invalid[1].scene.camera.pitch=10;assert.throws(()=>validateStudies(invalid,schema));
});
