// SPDX-License-Identifier: Apache-2.0
// Camera navigation and sun direction math.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advance, cameraFrame, distanceToTarget, dolly, look, orbit, orbitAngles, pan, sunDirection, tanHalfFov,
} from '../web/render/camera.js';

const camera = { position: [0, 860, 6000], target: [0, 180, 3800], focalLength: 21 };
const near = (a, b, epsilon = 1e-6) => Math.abs(a - b) < epsilon;
const nearVector = (a, b, epsilon = 1e-6) => a.every((value, i) => near(value, b[i], epsilon));
const length = v => Math.hypot(...v);

test('the camera frame is orthonormal and looks at the target', () => {
  const frame = cameraFrame(camera, 16 / 9);
  for (const axis of [frame.right, frame.up, frame.forward]) {
    assert.ok(near(length(axis), 1));
  }
  assert.ok(near(frame.right[1], 0), 'right stays level');
  assert.ok(frame.up[1] > 0, 'up points up');
  assert.ok(frame.forward[2] < 0, 'looks north toward the target');
});

test('a wider frame keeps the 36 mm sensor across its long edge', () => {
  assert.ok(near(tanHalfFov(36, 1), 0.5));
  assert.ok(near(tanHalfFov(36, 2), 0.25));
  assert.ok(near(tanHalfFov(36, 0.5), 0.5), 'portrait uses the full height');
});

test('orbit keeps the distance and clamps the pitch', () => {
  const before = distanceToTarget(camera);
  const turned = orbit(camera, 0.7, 0.2);
  assert.ok(near(distanceToTarget(turned), before, 1e-6 * before));
  assert.deepEqual(turned.target, camera.target);
  const top = orbit(camera, 0, 10);
  assert.ok(orbitAngles(top).pitch < Math.PI / 2);
});

test('look turns the view in place', () => {
  const turned = look(camera, 0.3, -0.1);
  assert.deepEqual(turned.position, camera.position);
  assert.ok(near(distanceToTarget(turned), distanceToTarget(camera), 1e-3));
});

test('pan moves eye and target together', () => {
  const moved = pan(camera, 100, 50, 16 / 9);
  const shiftEye = moved.position.map((value, i) => value - camera.position[i]);
  const shiftTarget = moved.target.map((value, i) => value - camera.target[i]);
  assert.ok(nearVector(shiftEye, shiftTarget));
  assert.ok(near(length(shiftEye), Math.hypot(100, 50), 1e-6));
});

test('dolly scales the distance within limits', () => {
  assert.ok(near(distanceToTarget(dolly(camera, 0.5)), distanceToTarget(camera) * 0.5, 1e-6));
  assert.ok(distanceToTarget(dolly(camera, 1e-9)) >= 20);
  assert.ok(distanceToTarget(dolly(camera, 1e9)) <= 120000);
});

test('advance moves along the view without changing it', () => {
  const moved = advance(camera, 500);
  assert.ok(near(distanceToTarget(moved), distanceToTarget(camera), 1e-6));
  assert.ok(moved.position[2] < camera.position[2]);
});

test('sun azimuth runs clockwise from north', () => {
  assert.ok(nearVector(sunDirection(0, 0), [0, 0, -1]));
  assert.ok(nearVector(sunDirection(0, 90), [1, 0, 0]));
  assert.ok(nearVector(sunDirection(90, 123), [0, 1, 0], 1e-6));
});
