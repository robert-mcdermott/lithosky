// SPDX-License-Identifier: Apache-2.0
// Exponential height fog over the valleys, with terrain-shadowed sunlight (light shafts).
// The optical depth along a ray has a closed form, so the in-scattering sample is drawn
// in proportion to density times transmittance and needs only one shadow ray.

const FOG_ALBEDO: f32 = 0.9;
const FOG_ANISOTROPY: f32 = 0.55;
const FOG_SHADOW_EFFORT: f32 = 0.5;
const FOG_SHADOW_DISTANCE: f32 = 40000.0;

struct FogSample {
    inscatter: vec3f,
    transmittance: f32,
}

fn fogDensityAt(height: f32) -> f32 {
    return frame.fogDensity * exp(-(height - frame.fogHeight) * frame.fogFalloff);
}

fn fogOpticalDepth(origin: vec3f, direction: vec3f, depth: f32) -> f32 {
    let start = fogDensityAt(origin.y);
    let k = direction.y * frame.fogFalloff;
    if (abs(k * depth) < 1e-4) {
        return start * depth;
    }
    return start * (1.0 - exp(-k * depth)) / k;
}

// Distance along the ray at which the fog optical depth reaches `opticalDepth`.
fn fogDistanceAt(origin: vec3f, direction: vec3f, opticalDepth: f32) -> f32 {
    let start = fogDensityAt(origin.y);
    let k = direction.y * frame.fogFalloff;
    if (abs(k) < 1e-9) {
        return opticalDepth / start;
    }
    return -log(max(1.0 - opticalDepth * k / start, 1e-12)) / k;
}

fn henyeyGreenstein(cosTheta: f32, g: f32) -> f32 {
    let g2 = g * g;
    return INV_FOUR_PI * (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * cosTheta, 1e-4), 1.5);
}

fn fogScatter(origin: vec3f, direction: vec3f, depth: f32) -> FogSample {
    var result: FogSample;
    result.inscatter = vec3f(0.0);
    result.transmittance = 1.0;
    if (frame.fogDensity <= 0.0) {
        return result;
    }
    let total = fogOpticalDepth(origin, direction, depth);
    if (total < 1e-5) {
        return result;
    }
    let transmittance = exp(-total);
    let opticalDepth = -log(1.0 - sample2().x * (1.0 - transmittance));
    let t = min(fogDistanceAt(origin, direction, opticalDepth), depth);
    let position = origin + direction * t;

    var sun = vec3f(0.0);
    let shadow = traceScene(position, frame.sunDirection, FOG_SHADOW_DISTANCE, FOG_SHADOW_EFFORT);
    if (shadow.field == FIELD_NONE) {
        let phase = henyeyGreenstein(dot(direction, frame.sunDirection), FOG_ANISOTROPY);
        sun = sunlightAt(position) * phase * cloudShadow(position);
    }
    var ambientDirection = uniformSphere(random2());
    ambientDirection.y = abs(ambientDirection.y);
    let ambient = cloudySky(ambientDirection) * 0.7;
    result.inscatter = (1.0 - transmittance) * FOG_ALBEDO * (sun + ambient);
    result.transmittance = transmittance;
    return result;
}
