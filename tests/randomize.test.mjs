// SPDX-License-Identifier: Apache-2.0
// Per-lab Randomize: valid scenes, repeatable from a seed, and limited to its own lab.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { SURFACE_DEFAULTS, WATER_DEFAULTS, cloudSettingsOf, imageSettingsOf, validateScene } from '../web/scene/document.js';
import { RANDOMIZERS, randomize, seededRandom } from '../web/scene/randomize.js';

const schema = JSON.parse(fs.readFileSync('internal/scene/schema.json', 'utf8'));
const presets = JSON.parse(fs.readFileSync('web/scenes/presets.json', 'utf8'));

function validate(scene) {
  const valid = validateScene(scene, schema);
  valid.image = imageSettingsOf(valid);
  valid.clouds = cloudSettingsOf(valid);
  valid.surface = { ...SURFACE_DEFAULTS, ...valid.surface };
  valid.water = { ...WATER_DEFAULTS, ...valid.water };
  return valid;
}

// The scene groups each lab may change.
const OWNS = {
  terrain: ['terrain'],
  light: ['sun', 'atmosphere'],
  sky: ['clouds'],
  ground: ['surface', 'water'],
  camera: ['camera'],
  image: ['image'],
};

test('the seeded generator is repeatable and stays in [0, 1)', () => {
  const a = seededRandom(42);
  const b = seededRandom(42);
  for (let i = 0; i < 1000; i++) {
    const value = a();
    assert.equal(value, b());
    assert.ok(value >= 0 && value < 1);
  }
  assert.notEqual(seededRandom(1)(), seededRandom(2)());
});

test('every lab randomizes into valid scenes and touches only its own settings', () => {
  assert.deepEqual(Object.keys(RANDOMIZERS).sort(), Object.keys(OWNS).sort());
  const scene = validate(presets[0].scene);
  for (const [id, owned] of Object.entries(OWNS)) {
    let changed = false;
    for (let seed = 1; seed <= 200; seed++) {
      const result = validate(randomize(id, scene, seed));
      for (const key of Object.keys(scene)) {
        if (!owned.includes(key)) {
          assert.deepEqual(result[key], scene[key], `${id} leaves ${key} alone`);
        }
      }
      changed ||= owned.some(key => JSON.stringify(result[key]) !== JSON.stringify(scene[key]));
    }
    assert.ok(changed, `${id} changes something`);
  }
});

test('the same seed gives the same scene', () => {
  const scene = validate(presets[0].scene);
  for (const id of Object.keys(RANDOMIZERS)) {
    assert.deepEqual(randomize(id, scene, 7), randomize(id, scene, 7));
  }
  assert.equal(randomize('scenes', scene, 7), scene, 'labs without a randomizer leave the scene as is');
});

test('the tree line stays below the snow line', () => {
  const scene = validate(presets[0].scene);
  for (let seed = 1; seed <= 300; seed++) {
    const { surface } = randomize('ground', scene, seed);
    assert.ok(surface.treeLine < surface.snowLine);
  }
});
