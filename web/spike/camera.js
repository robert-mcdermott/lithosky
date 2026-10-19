// SPDX-License-Identifier: Apache-2.0
// The "Alpine quiet" camera from web/scenes/studies.json, in metres, so the spike frames
// the same view as the current renderer.

const RADIANS = Math.PI / 180;

const subtract = (a, b) => a.map((value, i) => value - b[i]);
const scale = (a, s) => a.map(value => value * s);
const normalize = a => scale(a, 1 / Math.hypot(...a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function orbitEye(target, yaw, pitch, distance) {
  const flat = Math.cos(pitch) * distance;
  return [
    Math.sin(yaw) * flat + target[0],
    Math.sin(pitch) * distance + target[1],
    Math.cos(yaw) * flat + target[2],
  ];
}

export function lookAt(eye, target, aspect, tanHalfFov, rollDegrees = 0) {
  const forward = normalize(subtract(target, eye));
  const level = normalize(cross(forward, [0, 1, 0]));
  const tilt = cross(level, forward);
  const roll = rollDegrees * RADIANS;
  const right = level.map((x, i) => x * Math.cos(roll) + tilt[i] * Math.sin(roll));
  const up = tilt.map((x, i) => x * Math.cos(roll) - level[i] * Math.sin(roll));
  return { position: eye, target, right, up, forward, aspect, tanHalfFov };
}

// The same orbit as cameraFrame() in web/camera/model.js, converted from scene units to metres.
export function orbitCamera(camera, aspect) {
  const lens = camera.lens;
  const metres = lens.metresPerUnit;
  const target = scale([lens.targetX, lens.targetY, lens.targetZ], metres);
  const eye = orbitEye(target, camera.yaw, camera.pitch, camera.distance * metres);
  const tanHalfFov = 36 / Math.max(1, aspect) / (2 * lens.focalLength);
  return lookAt(eye, target, aspect, tanHalfFov, lens.roll ?? 0);
}

// A high oblique view over the eroded tile, from the same heading as `camera`.
export function overviewCamera(camera, tileCentre, aspect) {
  const yaw = Math.atan2(-camera.forward[0], -camera.forward[2]);
  const target = [tileCentre[0], 900, tileCentre[1]];
  const eye = orbitEye(target, yaw, 0.62, 15000);
  return lookAt(eye, target, aspect, camera.tanHalfFov);
}

export async function alpineQuiet(aspect) {
  const response = await fetch(new URL('../scenes/studies.json', import.meta.url));
  const studies = await response.json();
  const scene = studies.find(study => study.id === 'alpine').scene;
  return {
    title: scene.title,
    camera: orbitCamera(scene.camera, aspect),
    sun: { elevation: scene.atmosphere.sunElevation, azimuth: scene.atmosphere.sunAzimuth },
  };
}

// +x east, -z north, azimuth clockwise from north (web/atmosphere/solar.js convention).
export function sunDirection(elevationDegrees, azimuthDegrees) {
  const elevation = elevationDegrees * RADIANS;
  const azimuth = azimuthDegrees * RADIANS;
  return [
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    -Math.cos(azimuth) * Math.cos(elevation),
  ];
}
