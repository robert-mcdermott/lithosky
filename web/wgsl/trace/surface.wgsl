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
    roughness: f32,
    wetness: f32,
    snow: f32,
    land: Landform,
}

// Dielectric reflectance at normal incidence (rock, soil, snow, water films).
const SURFACE_F0: f32 = 0.04;

fn pixelFootprint(depth: f32) -> f32 {
    return depth * 2.0 * frame.tanHalfFov / f32(frame.height);
}

// `primary` marks camera-ray hits, which get the full material and detail normals.
fn shadePoint(position: vec3f, field: u32, depth: f32, primary: bool) -> SurfacePoint {
    var point: SurfacePoint;
    point.position = position;
    let gradient = sceneGradient(position.xz, field);
    let baseNormal = normalize(vec3f(-gradient.x, 1.0, -gradient.y));
    point.land = landformAt(position, baseNormal, field);
    let material = terrainMaterial(position, baseNormal, point.land, primary);
    point.albedo = material.albedo;
    point.roughness = material.roughness;
    point.wetness = material.wetness;
    point.snow = material.snow;
    var coarsest = 2.0 * fields.near.spacing;
    if (field == FIELD_FAR) {
        coarsest = 2.0 * fields.far.spacing;
    }
    let rockiness = saturate(point.land.slope * 4.0);
    let footprint = pixelFootprint(depth);
    var detail = vec2f(0.0);
    if (primary) {
        let bare = (1.0 - point.snow) * (1.0 - 0.6 * point.wetness);
        detail = detailGradient(position.xz, footprint, coarsest, (0.4 + 0.8 * rockiness) * (1.0 - 0.7 * point.snow));
        detail += rockDetailGradient(position, gradient, footprint, rockiness * bare);
    }
    point.normal = normalize(vec3f(-gradient.x - detail.x, 1.0, -gradient.y - detail.y));
    return point;
}

fn surfaceOffset(point: SurfacePoint, depth: f32) -> vec3f {
    let lift = 0.05 + depth * 2e-5;
    return point.position + point.normal * lift + vec3f(0.0, lift, 0.0);
}

// Lambertian diffuse plus a GGX specular lobe (Smith masking, Schlick Fresnel), so wet rock
// and snow catch the light while dry ground stays matte.
fn surfaceBrdf(point: SurfacePoint, view: vec3f, light: vec3f) -> vec3f {
    let normal = point.normal;
    let nl = max(dot(normal, light), 0.0);
    let nv = max(dot(normal, view), 1e-3);
    let halfway = normalize(light + view);
    let nh = max(dot(normal, halfway), 0.0);
    let vh = max(dot(view, halfway), 0.0);
    let alpha = max(point.roughness * point.roughness, 0.02);
    let alpha2 = alpha * alpha;
    let d = alpha2 / (PI * pow(nh * nh * (alpha2 - 1.0) + 1.0, 2.0));
    let k = alpha * 0.5;
    let g = (nl / (nl * (1.0 - k) + k)) * (nv / (nv * (1.0 - k) + k));
    let fresnel = SURFACE_F0 + (1.0 - SURFACE_F0) * pow(1.0 - vh, 5.0);
    let specular = d * g * fresnel / max(4.0 * nl * nv, 1e-4);
    return point.albedo * INV_PI * (1.0 - fresnel) + vec3f(specular);
}

fn directSun(point: SurfacePoint, depth: f32, view: vec3f) -> vec3f {
    let direction = sampleCone(frame.sunDirection, frame.sunCosRadius, sample2());
    let cosine = dot(point.normal, direction);
    if (cosine <= 0.0) {
        return vec3f(0.0);
    }
    let shadow = traceScene(surfaceOffset(point, depth), direction, SHADOW_DISTANCE, SHADOW_EFFORT);
    if (shadow.field != FIELD_NONE || shadow.t == TRACE_EXHAUSTED) {
        return vec3f(0.0);
    }
    let brdf = surfaceBrdf(point, view, direction);
    return brdf * cosine * sunlightAt(point.position) * cloudShadow(point.position);
}

fn limitLuminance(value: vec3f, limit: f32) -> vec3f {
    let luminance = dot(value, vec3f(0.2126, 0.7152, 0.0722));
    if (luminance > limit) {
        return value * (limit / luminance);
    }
    return value;
}
