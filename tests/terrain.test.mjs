// SPDX-License-Identifier: Apache-2.0
// CPU-side checks for the GPU terrain module: settings validation, heightmap sample
// normalization and the WGSL include step.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { expandIncludes } from '../web/gpu/device.js';
import { normalizeSamples } from '../web/terrain/heightmap.js';
import { TERRAIN_DEFAULTS, sameTerrain, terrainSettings } from '../web/terrain/settings.js';

test('terrain settings default and merge overrides', () => {
  assert.deepEqual({ ...terrainSettings() }, { ...TERRAIN_DEFAULTS });
  const settings = terrainSettings({ seed: 42, drainage: 2 });
  assert.equal(settings.seed, 42);
  assert.equal(settings.drainage, 2);
  assert.equal(settings.relief, TERRAIN_DEFAULTS.relief);
  assert.ok(Object.isFrozen(settings));
});

test('terrain settings reject unknown, non-finite and out-of-range values', () => {
  assert.throws(() => terrainSettings({ erosion: 1 }), /Unknown terrain setting/);
  assert.throws(() => terrainSettings({ relief: Number.NaN }), /finite number/);
  assert.throws(() => terrainSettings({ relief: '3200' }), /finite number/);
  assert.throws(() => terrainSettings({ drainage: 4 }), RangeError);
  assert.throws(() => terrainSettings({ seed: -1 }), RangeError);
  assert.throws(() => terrainSettings({ seed: 1.5 }), /integer/);
});

test('sameTerrain compares every setting', () => {
  const a = terrainSettings({ seed: 7 });
  assert.ok(sameTerrain(a, terrainSettings({ seed: 7 })));
  assert.ok(!sameTerrain(a, terrainSettings({ seed: 7, rills: 0 })));
});

test('heightmap samples normalize big-endian 16-bit values to 0..1', () => {
  const raw = new Uint8Array([0x00, 0x00, 0xff, 0xff, 0x80, 0x00]);
  const samples = normalizeSamples(raw);
  assert.equal(samples.length, 3);
  assert.equal(samples[0], 0);
  assert.equal(samples[1], 1);
  assert.ok(Math.abs(samples[2] - 32768 / 65535) < 1e-6);
  assert.throws(() => normalizeSamples(new Uint8Array(3)), /16-bit/);
});

test('shader includes expand depth-first and only once', async () => {
  const files = {
    'main.wgsl': '#include "a.wgsl"\n#include "b.wgsl"\nfn main() {}',
    'a.wgsl': '#include "common.wgsl"\nfn a() {}',
    'b.wgsl': '#include "common.wgsl"\nfn b() {}',
    'common.wgsl': 'const C: f32 = 1.0;',
  };
  const code = await expandIncludes('main.wgsl', async name => files[name]);
  assert.equal(code.match(/const C/g).length, 1);
  assert.ok(code.indexOf('const C') < code.indexOf('fn a()'));
  assert.ok(code.indexOf('fn a()') < code.indexOf('fn b()'));
});

test('every shader include in web/wgsl resolves to a file', async () => {
  const root = path.resolve('web/wgsl');
  const read = async name => fs.readFileSync(path.join(root, name), 'utf8');
  const shaders = fs.readdirSync(root, { recursive: true }).filter(name => name.endsWith('.wgsl'));
  assert.ok(shaders.length > 20);
  for (const shader of shaders) {
    await assert.doesNotReject(expandIncludes(shader, read), `includes of ${shader}`);
  }
});
