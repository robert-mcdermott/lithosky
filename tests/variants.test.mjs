// SPDX-License-Identifier: Apache-2.0
// Gallery choices: every option, applied to every preset, makes a valid scene that the
// gallery then shows as selected, and leaves the terrain alone (so it renders from the
// current view without a rebuild).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { SURFACE_DEFAULTS, WATER_DEFAULTS, cloudSettingsOf, imageSettingsOf, terrainSettingsOf, validateScene } from '../web/scene/document.js';
import { BIOME, LENS, LIGHT, LOOK, SKY } from '../web/scene/variants.js';

const schema = JSON.parse(fs.readFileSync('internal/scene/schema.json', 'utf8'));
const presets = JSON.parse(fs.readFileSync('web/scenes/presets.json', 'utf8'));

// The studio's validation: a valid scene with every optional group filled in.
function validate(scene) {
  const valid = validateScene(scene, schema);
  valid.image = imageSettingsOf(valid);
  valid.clouds = cloudSettingsOf(valid);
  valid.surface = { ...SURFACE_DEFAULTS, ...valid.surface };
  valid.water = { ...WATER_DEFAULTS, ...valid.water };
  return valid;
}

const GALLERIES = { LIGHT, SKY, BIOME, LENS, LOOK };

test('gallery options make valid scenes that read back as selected', () => {
  for (const preset of presets) {
    const scene = validate(preset.scene);
    for (const [name, gallery] of Object.entries(GALLERIES)) {
      const ids = new Set();
      for (const [id, label, value] of gallery.options) {
        assert.ok(label, `${name} ${id} has a label`);
        assert.ok(!ids.has(id), `${name} ids are unique`);
        ids.add(id);
        const variant = validate(gallery.apply(scene, value));
        assert.equal(gallery.current(variant), id, `${preset.id} ${name} ${id}`);
        assert.deepEqual(terrainSettingsOf(variant), terrainSettingsOf(scene), `${name} ${id} keeps the terrain`);
      }
    }
  }
});

test('applying an option leaves the original scene untouched', () => {
  const scene = validate(presets[0].scene);
  const before = JSON.stringify(scene);
  for (const gallery of Object.values(GALLERIES)) {
    for (const [, , value] of gallery.options) {
      gallery.apply(scene, value);
    }
  }
  assert.equal(JSON.stringify(scene), before);
});
