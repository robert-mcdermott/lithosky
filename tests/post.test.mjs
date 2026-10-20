// SPDX-License-Identifier: Apache-2.0
// Post-processing helpers and image settings.

import assert from 'node:assert/strict';
import test from 'node:test';
import { denoiseMix } from '../web/render/post.js';
import { IMAGE_DEFAULTS, defaultScene, imageSettingsOf } from '../web/scene/document.js';

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
