// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRenderer } from '../web/render/select.js';
import { createTerrain, defaults, frameUniforms, heightAt } from '../web/scene/terrain.js';

test('automatic selection initializes WebGPU and does not touch fallback', async () => {
  let fallback = false;
  const renderer = {};
  const selected = await selectRenderer('auto', { webgpu: async () => renderer, webgl2: () => { fallback = true; } });
  assert.equal(selected.renderer, renderer); assert.equal(selected.kind, 'webgpu'); assert.equal(fallback, false);
});
for (const reason of ['No GPU adapter was granted', 'Device request rejected', 'Shader compilation failed']) {
  test(`initialization failure falls back: ${reason}`, async () => {
    const selected = await selectRenderer('auto', { webgpu: async () => { throw new Error(reason); }, webgl2: () => ({}) });
    assert.equal(selected.kind, 'webgl2'); assert.ok(selected.reasons[0].includes(reason));
  });
}
test('all failed backends give an explicit no-GPU result', async () => {
  const fail = () => { throw new Error('unavailable'); };
  const result = await selectRenderer('auto', { webgpu: fail, webgl2: fail });
  assert.equal(result.kind, 'none'); assert.equal(result.renderer, null); assert.equal(result.reasons.length, 2);
});
test('forced compatibility and disabled modes never initialize WebGPU', async () => {
  const factories = { webgpu: () => { assert.fail('WebGPU must not run'); }, webgl2: () => ({}) };
  assert.equal((await selectRenderer('webgl2', factories)).kind, 'webgl2');
  assert.equal((await selectRenderer('none', factories)).kind, 'none');
});
test('terrain fixture is repeatable, changes with seed, and has finite normalized normals', () => {
  const a = createTerrain(defaults, 16), b = createTerrain(defaults, 16);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, createTerrain({ ...defaults, seed: 12345 }, 16));
  assert.equal(a.length, 16 * 16 * 6 * 9);
  assert.ok(a.every(Number.isFinite));
  for (let i = 0; i < a.length; i += 9) assert.ok(Math.abs(Math.hypot(a[i+3], a[i+4], a[i+5]) - 1) < 1e-6);
  assert.throws(() => createTerrain(defaults, 4096));
});
test('camera basis is orthonormal and uniform layout is finite', () => {
  const u = frameUniforms(defaults, 1.5);
  assert.equal(u.byteLength, 96); assert.ok(u.every(Number.isFinite));
  for (const offset of [4, 8, 12]) assert.ok(Math.abs(Math.hypot(...u.slice(offset, offset + 3)) - 1) < 1e-6);
  const dot = (a,b) => u[a]*u[b]+u[a+1]*u[b+1]+u[a+2]*u[b+2];
  assert.ok(Math.abs(dot(4,8)) < 1e-6); assert.ok(Math.abs(dot(8,12)) < 1e-6);
  assert.equal(heightAt(1, 2, defaults), heightAt(1, 2, { ...defaults }));
});
