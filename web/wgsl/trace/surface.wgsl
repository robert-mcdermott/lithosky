// SPDX-License-Identifier: Apache-2.0
// Shading a terrain hit: material, detail normal, and sun next-event estimation over the
// finite solar disk (soft shadows). Including modules declare the tracer bindings.

const MAX_DISTANCE: f32 = 250000.0;
const SHADOW_DISTANCE: f32 = 60000.0;
const SHADOW_EFFORT: f32 = 0.6;
const BOUNCE_EFFORT: f32 = 0.5;
const INDIRECT_LIMIT: f32 = 1.5;

struct SurfacePoint {
    position: vec3f,
    normal: vec3f,
    albedo: vec3f,
    land: Landform,
}

fn pixelFootprint(depth: f32) -> f32 {
    return depth * 2.0 * frame.tanHalfFov / f32(frame.height);
}

fn shadePoint(position: vec3f, field: u32, depth: f32) -> SurfacePoint {
    var point: SurfacePoint;
    point.position = position;
    let gradient = sceneGradient(position.xz, field);
    let baseNormal = normalize(vec3f(-gradient.x, 1.0, -gradient.y));
    point.land = landformAt(position, baseNormal, field);
    point.albedo = terrainAlbedo(position, point.land);
    var coarsest = 2.0 * fields.near.spacing;
    if (field == FIELD_FAR) {
        coarsest = 2.0 * fields.far.spacing;
    }
    let rockiness = saturate(point.land.slope * 4.0);
    let footprint = pixelFootprint(depth);
    let snowless = 1.0 - smoothstep(0.75, 0.85, point.albedo.g);
    var detail = detailGradient(position.xz, footprint, coarsest, 0.4 + 0.8 * rockiness);
    detail += rockDetailGradient(position, gradient, footprint, rockiness * snowless);
    point.normal = normalize(vec3f(-gradient.x - detail.x, 1.0, -gradient.y - detail.y));
    return point;
}

fn surfaceOffset(point: SurfacePoint, depth: f32) -> vec3f {
    let lift = 0.05 + depth * 2e-5;
    return point.position + point.normal * lift + vec3f(0.0, lift, 0.0);
}

fn directSun(point: SurfacePoint, depth: f32) -> vec3f {
    let direction = sampleCone(frame.sunDirection, frame.sunCosRadius, sample2());
    let cosine = dot(point.normal, direction);
    if (cosine <= 0.0) {
        return vec3f(0.0);
    }
    let shadow = traceScene(surfaceOffset(point, depth), direction, SHADOW_DISTANCE, SHADOW_EFFORT);
    if (shadow.field != FIELD_NONE || shadow.t == TRACE_EXHAUSTED) {
        return vec3f(0.0);
    }
    return point.albedo * INV_PI * cosine * sunlightAt(point.position);
}

fn limitLuminance(value: vec3f, limit: f32) -> vec3f {
    let luminance = dot(value, vec3f(0.2126, 0.7152, 0.0722));
    if (luminance > limit) {
        return value * (limit / luminance);
    }
    return value;
}
