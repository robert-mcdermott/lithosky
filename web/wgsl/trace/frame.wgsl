// SPDX-License-Identifier: Apache-2.0
// Per-frame camera, sun and sampling state shared by the tracer and the aerial LUT.
// World units are metres, +y up, +x east, -z north.

struct Frame {
    cameraPosition: vec3f,
    tanHalfFov: f32,
    cameraRight: vec3f,
    aspect: f32,
    cameraUp: vec3f,
    aerialDistance: f32,
    cameraForward: vec3f,
    sampleIndex: u32,
    sunDirection: vec3f,
    sunCosRadius: f32,
    sunIlluminance: vec3f,
    fogDensity: f32,
    fogHeight: f32,
    fogFalloff: f32,
    width: u32,
    height: u32,
    viewMode: u32,
    bounces: u32,
    seed: u32,
    sunRadius: f32,
}

fn cameraDirection(ndc: vec2f) -> vec3f {
    let right = frame.cameraRight * (ndc.x * frame.tanHalfFov * frame.aspect);
    let up = frame.cameraUp * (ndc.y * frame.tanHalfFov);
    return normalize(frame.cameraForward + right + up);
}
