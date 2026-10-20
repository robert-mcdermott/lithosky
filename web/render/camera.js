// SPDX-License-Identifier: Apache-2.0
// Camera and sun math. World units are metres: +x east, +y up, -z north.
// A scene camera is { position, target, focalLength } with a 36 mm wide sensor.

const RADIANS = Math.PI / 180;
const SENSOR_WIDTH_MM = 36;
const MIN_DISTANCE = 20;
const MAX_DISTANCE = 120000;
const MAX_PITCH = 89 * RADIANS;

const subtract = (a, b) => a.map((value, i) => value - b[i]);
const add = (a, b) => a.map((value, i) => value + b[i]);
const scale = (a, s) => a.map(value => value * s);
const length = a => Math.hypot(...a);
const normalize = a => scale(a, 1 / length(a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Vertical half-angle tangent for a focal length; the sensor's long side spans the wide edge.
export function tanHalfFov(focalLength, aspect) {
  return SENSOR_WIDTH_MM / Math.max(1, aspect) / (2 * focalLength);
}

// The basis the tracer needs: position, unit right/up/forward, aspect and field of view.
export function cameraFrame(camera, aspect) {
  const forward = normalize(subtract(camera.target, camera.position));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return {
    position: camera.position,
    target: camera.target,
    right,
    up,
    forward,
    aspect,
    tanHalfFov: tanHalfFov(camera.focalLength, aspect),
  };
}

// Yaw (radians, around +y) and pitch (radians above horizontal) of the eye seen from the target.
export function orbitAngles(camera) {
  const offset = subtract(camera.position, camera.target);
  const distance = length(offset);
  return {
    yaw: Math.atan2(offset[0], offset[2]),
    pitch: Math.asin(Math.max(-1, Math.min(1, offset[1] / distance))),
    distance,
  };
}

function placeEye(target, yaw, pitch, distance) {
  const flat = Math.cos(pitch) * distance;
  return [target[0] + Math.sin(yaw) * flat, target[1] + Math.sin(pitch) * distance, target[2] + Math.cos(yaw) * flat];
}

// Rotates the eye around the target.
export function orbit(camera, deltaYaw, deltaPitch) {
  const { yaw, pitch, distance } = orbitAngles(camera);
  const nextPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch + deltaPitch));
  return { ...camera, position: placeEye(camera.target, yaw + deltaYaw, nextPitch, distance) };
}

// Turns the view in place: the target swings around the eye.
export function look(camera, deltaYaw, deltaPitch) {
  const offset = subtract(camera.target, camera.position);
  const distance = length(offset);
  const yaw = Math.atan2(offset[0], offset[2]) - deltaYaw;
  const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, Math.asin(offset[1] / distance) + deltaPitch));
  return { ...camera, target: placeEye(camera.position, yaw, pitch, distance) };
}

// Slides eye and target together, in screen right/up units of metres.
export function pan(camera, right, up, aspect = 1) {
  const frame = cameraFrame(camera, aspect);
  const shift = add(scale(frame.right, right), scale(frame.up, up));
  return { ...camera, position: add(camera.position, shift), target: add(camera.target, shift) };
}

// Moves the eye toward (factor < 1) or away from (factor > 1) the target.
export function dolly(camera, factor) {
  const offset = subtract(camera.position, camera.target);
  const distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, length(offset) * factor));
  return { ...camera, position: add(camera.target, scale(normalize(offset), distance)) };
}

// Moves eye and target along the view direction by `metres`.
export function advance(camera, metres) {
  const forward = normalize(subtract(camera.target, camera.position));
  const shift = scale(forward, metres);
  return { ...camera, position: add(camera.position, shift), target: add(camera.target, shift) };
}

export function distanceToTarget(camera) {
  return length(subtract(camera.position, camera.target));
}

// Azimuth is clockwise from north.
export function sunDirection(elevationDegrees, azimuthDegrees) {
  const elevation = elevationDegrees * RADIANS;
  const azimuth = azimuthDegrees * RADIANS;
  return [
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    -Math.cos(azimuth) * Math.cos(elevation),
  ];
}
