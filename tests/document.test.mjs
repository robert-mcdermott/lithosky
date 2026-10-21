// SPDX-License-Identifier: Apache-2.0
// Scene documents (version 1), presets and undo history.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { ASPECTS, aspectOf, defaultScene, terrainSettingsOf, validateScene } from '../web/scene/document.js';
import { History } from '../web/scene/history.js';

const schema = JSON.parse(fs.readFileSync('internal/scene/schema.json', 'utf8'));
const fixtures = JSON.parse(fs.readFileSync('tests/fixtures/scenes.json', 'utf8'));
const presets = JSON.parse(fs.readFileSync('web/scenes/presets.json', 'utf8'));
const validate = scene => validateScene(scene, schema);

test('shared fixtures agree with the Go validator', () => {
  for (const fixture of fixtures) {
    if (fixture.valid) {
      assert.deepEqual(validate(fixture.scene), fixture.scene, fixture.name);
    } else {
      assert.throws(() => validate(fixture.scene), Error, fixture.name);
    }
  }
});

test('older and newer versions get a clear message', () => {
  const scene = { ...defaultScene(), version: 13 };
  assert.throws(() => validate(scene), /version 1 only/);
});

test('a camera needs a target away from its position', () => {
  const scene = defaultScene();
  scene.camera.target = [...scene.camera.position];
  assert.throws(() => validate(scene), /target must differ/);
});

test('the default scene and every preset validate', () => {
  validate(defaultScene());
  assert.ok(presets.length >= 6);
  const ids = new Set();
  for (const preset of presets) {
    assert.ok(!ids.has(preset.id), `duplicate preset ${preset.id}`);
    ids.add(preset.id);
    validate(preset.scene);
  }
  for (const hero of ['H1', 'H2', 'H3', 'H4', 'H5', 'H6']) {
    assert.ok(ids.has(hero), `missing hero preset ${hero}`);
  }
});

test('terrain settings come from the scene terrain', () => {
  const scene = defaultScene();
  scene.terrain.drainage = 2;
  scene.terrain.heightmap = { asset: 'a'.repeat(64), resolution: 512 };
  const settings = terrainSettingsOf(scene);
  assert.equal(settings.drainage, 2);
  assert.equal(settings.seed, scene.terrain.seed);
  assert.ok(!('heightmap' in settings));
});

test('a gesture is one undo step and cancel restores the start', () => {
  const history = new History(defaultScene(), validate);
  history.begin();
  for (const elevation of [10, 20, 30]) {
    history.edit(scene => {
      scene.sun.elevation = elevation;
    });
  }
  history.end();
  assert.equal(history.value.sun.elevation, 30);
  assert.ok(history.undo());
  assert.equal(history.value.sun.elevation, defaultScene().sun.elevation);
  assert.ok(history.redo());
  assert.equal(history.value.sun.elevation, 30);

  history.begin();
  history.edit(scene => {
    scene.sun.elevation = 45;
  });
  assert.ok(history.cancel());
  assert.equal(history.value.sun.elevation, 30);
});

test('invalid edits are rejected and leave the scene unchanged', () => {
  const history = new History(defaultScene(), validate);
  assert.throws(() => history.edit(scene => {
    scene.terrain.relief = 99999;
  }));
  assert.equal(history.value.terrain.relief, defaultScene().terrain.relief);
  assert.equal(history.canUndo, false);
});

test('history respects its snapshot budget', () => {
  const history = new History(defaultScene(), validate, 5);
  for (let seed = 1; seed <= 12; seed++) {
    history.edit(scene => {
      scene.terrain.seed = seed;
    });
  }
  assert.equal(history.past.length, 5);
});

test('the image shape defaults to 16:9 and every shape the schema allows has an aspect', () => {
  assert.equal(aspectOf(defaultScene()), 16 / 9);
  assert.equal(aspectOf({ ...defaultScene(), image: { exposure: 0, look: 'none', aspect: '4:5' } }), 0.8);
  assert.deepEqual(Object.keys(ASPECTS).sort(), [...schema.properties.image.properties.aspect.enum].sort());
});

test('a saved view needs a target away from its position', () => {
  const scene = defaultScene();
  scene.cameras = [{ name: 'Lake', position: [0, 860, 6000], target: [0, 180, 3800], focalLength: 21 }];
  validate(scene);
  scene.cameras.push({ name: 'Broken', position: [1, 2, 3], target: [1, 2, 3], focalLength: 35 });
  assert.throws(() => validate(scene), /cameras\[1\]: the target must differ/);
});
