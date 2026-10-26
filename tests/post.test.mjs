// SPDX-License-Identifier: Apache-2.0
// Post-processing helpers and image settings.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { denoiseMix } from '../web/render/post.js';
import { BIOMES, BIOME_IDS, surfaceUniform } from '../web/render/biomes.js';
import { LIVE_QUALITY } from '../web/render/renderer.js';
import { CLOUD_DEFAULTS, IMAGE_DEFAULTS, SURFACE_DEFAULTS, cloudSettingsOf, defaultScene, imageSettingsOf, surfaceSettingsOf } from '../web/scene/document.js';

test('denoising fades out as samples accumulate', () => {
  assert.ok(denoiseMix(1) > 0.8);
  let previous = denoiseMix(1);
  for (const samples of [4, 16, 64, 256]) {
    const mix = denoiseMix(samples);
    assert.ok(mix < previous, `mix decreases at ${samples} samples`);
    assert.ok(mix >= 0 && mix <= 1);
    previous = mix;
  }
  assert.equal(denoiseMix(1024), 0);
});

test('image settings fill in defaults without overriding the scene', () => {
  const scene = defaultScene();
  scene.image = { exposure: 0.5, look: 'soft' };
  const image = imageSettingsOf(scene);
  assert.equal(image.exposure, 0.5);
  assert.equal(image.look, 'soft');
  assert.equal(image.bloom, IMAGE_DEFAULTS.bloom);
  assert.equal(image.autoExposure, true);
});

test('a scene without clouds has a clear sky', () => {
  const scene = defaultScene();
  delete scene.clouds;
  const clouds = cloudSettingsOf(scene);
  assert.equal(clouds.coverage, 0);
  assert.equal(clouds.cirrus, 0);
  assert.deepEqual(clouds, { ...CLOUD_DEFAULTS });
  scene.clouds = { ...CLOUD_DEFAULTS, coverage: 0.5 };
  assert.equal(cloudSettingsOf(scene).coverage, 0.5);
});

test('every biome in the schema has a complete palette', () => {
  const schema = JSON.parse(fs.readFileSync('internal/scene/schema.json', 'utf8'));
  assert.deepEqual(schema.properties.surface.properties.biome.enum, BIOME_IDS);
  for (const id of BIOME_IDS) {
    const biome = BIOMES[id];
    for (const key of ['rockDark', 'rockLight', 'band', 'scree', 'soilLush', 'soilDry', 'forest', 'sand', 'snow']) {
      assert.equal(biome[key].length, 3, `${id}.${key}`);
      assert.ok(biome[key].every(value => value >= 0 && value <= 1), `${id}.${key} is an albedo`);
    }
    assert.ok(biome.conifers >= 0 && biome.conifers <= 1, `${id}.conifers is a share`);
  }
});

test('the surface uniform carries the scene limits and waves', () => {
  const scene = defaultScene();
  scene.surface = { ...SURFACE_DEFAULTS, snowLine: 3000, moisture: 0.8 };
  scene.water = { waves: 0.6 };
  const floats = new Float32Array(surfaceUniform(scene));
  assert.equal(floats.length, 44);
  assert.equal(floats[36], 3000);
  assert.ok(Math.abs(floats[38] - 0.8) < 1e-6);
  assert.ok(Math.abs(floats[39] - 0.6) < 1e-6);
  assert.equal(surfaceSettingsOf(defaultScene()).biome, 'alpine');
  // strata.y: the biome's share of conifers, which the tree bake reads.
  assert.ok(Math.abs(floats[41] - BIOMES.alpine.conifers) < 1e-6);
  scene.surface = { ...scene.surface, biome: 'alien' };
  assert.equal(new Float32Array(surfaceUniform(scene))[41], 0);
});

test('sky colour 0 is Earth\'s Rayleigh scattering, and the tint shifts it between blue and gold', async () => {
  const { rayleighFor } = await import('../web/render/sky.js');
  const earth = rayleighFor(0);
  assert.ok(Math.abs(earth[0] - 5.802e-3) < 2e-5 && Math.abs(earth[1] - 13.558e-3) < 1e-9 && Math.abs(earth[2] - 33.1e-3) < 5e-5);
  const deep = rayleighFor(-1);
  const golden = rayleighFor(1);
  assert.equal(deep[1], earth[1], 'green stays put');
  assert.ok(deep[2] / deep[0] > earth[2] / earth[0], 'lower tints are bluer');
  assert.ok(golden[0] > golden[2], 'the highest tint scatters red more than blue');
});

test('the live view stops at a finite target, and Draft costs less than Full', () => {
  const { draft, full } = LIVE_QUALITY;
  for (const quality of [draft, full]) {
    assert.ok(Number.isInteger(quality.samples) && quality.samples > 0);
  }
  assert.ok(draft.longEdge < full.longEdge);
  assert.ok(draft.bounces < full.bounces);
  assert.ok(draft.samples < full.samples);
  const html = fs.readFileSync('web/index.html', 'utf8');
  const choices = [...html.matchAll(/name="live-quality" value="(\w+)"/g)].map(match => match[1]);
  assert.deepEqual(choices, Object.keys(LIVE_QUALITY));
});

