// SPDX-License-Identifier: Apache-2.0
// Camera navigation and sun direction math.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advance, cameraFrame, distanceToTarget, dolly, look, lookAt, orbit, orbitAngles, pan, sunAngles, sunDirection,
  tanHalfFov, viewHeading, viewRay,
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

test('sun angles invert the sun direction', () => {
  for (const [elevation, azimuth] of [[6, 314], [45, 90], [-3, 180], [70, 0.5]]) {
    const angles = sunAngles(sunDirection(elevation, azimuth));
    assert.ok(near(angles.elevation, elevation, 1e-9), `elevation ${elevation}`);
    assert.ok(near(angles.azimuth, azimuth, 1e-9), `azimuth ${azimuth}`);
  }
});

test('the view ray through the centre is the forward axis, and corners span the field of view', () => {
  const aspect = 16 / 9;
  const frame = cameraFrame(camera, aspect);
  assert.ok(nearVector(viewRay(camera, aspect, 0, 0), frame.forward));
  const corner = viewRay(camera, aspect, 1, 1);
  const along = corner.map((value, i) => value / (corner[0] * frame.forward[0] + corner[1] * frame.forward[1] + corner[2] * frame.forward[2]));
  const right = along[0] * frame.right[0] + along[1] * frame.right[1] + along[2] * frame.right[2];
  const up = along[0] * frame.up[0] + along[1] * frame.up[1] + along[2] * frame.up[2];
  assert.ok(near(right, frame.tanHalfFov * aspect, 1e-9));
  assert.ok(near(up, frame.tanHalfFov, 1e-9));
});

test('the view heading follows the camera and its field of view follows the lens', () => {
  const north = viewHeading(camera, 16 / 9);
  assert.ok(near(north.heading, 0, 1e-9) || near(north.heading, 360, 1e-9), 'the preset camera looks north');
  const east = viewHeading({ position: [0, 100, 0], target: [1000, 100, 0], focalLength: 36 }, 1);
  assert.ok(near(east.heading, 90, 1e-9));
  assert.ok(near(east.fieldOfView, 53.13010235415598, 1e-9), '36 mm on a square frame is about 53°');
});

test('look at turns the eye toward a point without moving it', () => {
  const turned = lookAt(camera, [500, 300, 2000]);
  assert.deepEqual(turned.position, camera.position);
  assert.deepEqual(turned.target, [500, 300, 2000]);
  assert.equal(lookAt(camera, camera.position), camera, 'a point at the eye is ignored');
});
