// SPDX-License-Identifier: Apache-2.0
// The scene is two traced heightfields: the eroded near tile and a coarse far field that
// continues the same generator to the horizon. A ray uses the far field everywhere outside
// the near tile's footprint and the near tile inside it.
// Including modules declare `fields`, the near/far height and pyramid textures, `masks`
// and `skySampler`.

#include "trace/heightfield.wgsl"

struct Fields {
    near: FieldGrid,
    far: FieldGrid,
    nearLevels: u32,
    farLevels: u32,
    nearSteps: u32,
    farSteps: u32,
    waterLevel: f32,
    padding0: f32,
    padding1: f32,
    padding2: f32,
}

const FIELD_NEAR: u32 = 0u;
const FIELD_FAR: u32 = 1u;
const FIELD_NONE: u32 = 2u;

struct SceneHit {
    t: f32,
    field: u32,
}

// Parametric span [t0, t1] of the ray over the near tile's footprint (empty when t0 >= t1).
fn nearSpan(origin: vec3f, direction: vec3f, tMax: f32) -> vec2f {
    let low = fields.near.origin;
    let high = fields.near.origin + vec2f(f32(fields.near.size - 1u) * fields.near.spacing);
    let start = origin.xz;
    let slope = direction.xz;
    var t0 = 0.0;
    var t1 = tMax;
    for (var axis = 0u; axis < 2u; axis++) {
        if (abs(slope[axis]) > 1e-9) {
            let ta = (low[axis] - start[axis]) / slope[axis];
            let tb = (high[axis] - start[axis]) / slope[axis];
            t0 = max(t0, min(ta, tb));
            t1 = min(t1, max(ta, tb));
        } else if (start[axis] < low[axis] || start[axis] > high[axis]) {
            return vec2f(1.0, 0.0);
        }
    }
    return vec2f(t0, t1);
}

fn traceNear(origin: vec3f, direction: vec3f, t0: f32, t1: f32, steps: u32) -> f32 {
    return traceField(nearPyramid, nearHeight, fields.near, fields.nearLevels, origin, direction, t0, t1, steps);
}

fn traceFar(origin: vec3f, direction: vec3f, t0: f32, t1: f32, steps: u32) -> f32 {
    return traceField(farPyramid, farHeight, fields.far, fields.farLevels, origin, direction, t0, t1, steps);
}

fn sceneHit(t: f32, field: u32) -> SceneHit {
    if (t >= 0.0) {
        return SceneHit(t, field);
    }
    return SceneHit(t, FIELD_NONE);
}

// `effort` scales the step budgets: 1 for camera and bounce rays, less for shadow rays.
fn traceScene(origin: vec3f, direction: vec3f, tMax: f32, effort: f32) -> SceneHit {
    let nearSteps = u32(f32(fields.nearSteps) * effort);
    let farSteps = u32(f32(fields.farSteps) * effort);
    let span = nearSpan(origin, direction, tMax);
    if (span.x >= span.y) {
        return sceneHit(traceFar(origin, direction, 0.0, tMax, farSteps), FIELD_FAR);
    }
    if (span.x > 0.0) {
        let before = traceFar(origin, direction, 0.0, span.x, farSteps);
        if (before >= 0.0) {
            return SceneHit(before, FIELD_FAR);
        }
    }
    let inside = traceNear(origin, direction, span.x, span.y, nearSteps);
    if (inside >= 0.0 || inside == TRACE_EXHAUSTED) {
        return sceneHit(inside, FIELD_NEAR);
    }
    return sceneHit(traceFar(origin, direction, span.y, tMax, farSteps), FIELD_FAR);
}

fn insideNear(world: vec2f) -> bool {
    let position = (world - fields.near.origin) / fields.near.spacing;
    let extent = f32(fields.near.size - 1u);
    return all(position >= vec2f(0.0)) && all(position <= vec2f(extent));
}

fn sceneHeight(world: vec2f) -> f32 {
    if (insideNear(world)) {
        return bilinearHeight(nearHeight, fields.near, world);
    }
    return bilinearHeight(farHeight, fields.far, world);
}

// Height gradient from central differences one vertex apart, smoother than the patch facets.
fn sceneGradient(world: vec2f, field: u32) -> vec2f {
    var spacing = fields.far.spacing;
    if (field == FIELD_NEAR) {
        spacing = fields.near.spacing;
    }
    let dx = vec2f(spacing, 0.0);
    let dz = vec2f(0.0, spacing);
    if (field == FIELD_NEAR) {
        let east = bilinearHeight(nearHeight, fields.near, world + dx);
        let west = bilinearHeight(nearHeight, fields.near, world - dx);
        let south = bilinearHeight(nearHeight, fields.near, world + dz);
        let north = bilinearHeight(nearHeight, fields.near, world - dz);
        return vec2f(east - west, south - north) / (2.0 * spacing);
    }
    let east = bilinearHeight(farHeight, fields.far, world + dx);
    let west = bilinearHeight(farHeight, fields.far, world - dx);
    let south = bilinearHeight(farHeight, fields.far, world + dz);
    let north = bilinearHeight(farHeight, fields.far, world - dz);
    return vec2f(east - west, south - north) / (2.0 * spacing);
}

fn sampleMasks(world: vec2f) -> vec4f {
    let position = (world - fields.near.origin) / fields.near.spacing;
    let uv = (position + 0.5) / f32(fields.near.size);
    return textureSampleLevel(masks, skySampler, uv, 0.0);
}

// Sky openness (r) and wetness (g) from the terrain's exposure masks.
fn sampleExposure(world: vec2f) -> vec4f {
    let position = (world - fields.near.origin) / fields.near.spacing;
    let uv = (position + 0.5) / f32(fields.near.size);
    return textureSampleLevel(exposureMasks, skySampler, uv, 0.0);
}
