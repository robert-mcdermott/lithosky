// SPDX-License-Identifier: Apache-2.0
// A calm lake: the horizontal plane y = fields.waterLevel wherever the terrain lies below it.
// Reflections are traced. Below the surface the water absorbs red first, so shallows show
// the bottom and deep water turns dark teal.

const WATER_F0: f32 = 0.02;
const WATER_ETA: f32 = 1.333;
const WATER_ABSORPTION: vec3f = vec3f(0.5, 0.13, 0.09);
const WATER_BODY: vec3f = vec3f(0.006, 0.02, 0.022);
const LAKE_BED: vec3f = vec3f(0.12, 0.11, 0.09);
const RIPPLE_SLOPE: f32 = 0.01;
const REFLECTION_LIMIT: f32 = 6.0;

fn waterDistance(origin: vec3f, direction: vec3f) -> f32 {
    if (direction.y >= 0.0 || origin.y <= fields.waterLevel) {
        return -1.0;
    }
    return (fields.waterLevel - origin.y) / direction.y;
}

// Faint wind ripples, stretched across the valley, fading below a pixel.
fn rippleGradient(world: vec2f, footprint: f32) -> vec2f {
    var gradient = vec2f(0.0);
    var size = 7.0;
    var slope = RIPPLE_SLOPE;
    for (var octave = 0u; octave < 3u; octave++) {
        let fade = smoothstep(footprint, 4.0 * footprint, size);
        let n = gradientNoise(world / size * vec2f(1.0, 2.5), 701u + octave);
        gradient += n.yz * slope * fade;
        size *= 0.45;
        slope *= 0.8;
    }
    return gradient;
}

// Haze over a reflected path, fading toward the sky behind the reflected point.
fn hazeOver(radiance: vec3f, direction: vec3f, origin: vec3f, span: f32) -> vec3f {
    let medium = sampleMedium(origin.y * 0.001);
    let transmittance = exp(-medium.extinction * span * 0.001);
    return radiance * transmittance + skyRadiance(direction) * (1.0 - transmittance);
}

fn reflectionRadiance(origin: vec3f, direction: vec3f, travelled: f32) -> vec3f {
    let hit = traceScene(origin, direction, MAX_DISTANCE, BOUNCE_EFFORT);
    if (hit.field == FIELD_NONE) {
        return limitLuminance(skyRadiance(direction) + sunDisk(direction), REFLECTION_LIMIT);
    }
    let point = shadePoint(origin + direction * hit.t, hit.field, travelled + hit.t);
    let skyLight = skyRadiance(normalize(point.normal + vec3f(0.0, 1.0, 0.0))) * 0.8;
    let lit = directSun(point, travelled + hit.t) + point.albedo * skyLight;
    return hazeOver(lit, direction, origin, hit.t);
}

fn shadeWater(position: vec3f, direction: vec3f, depth: f32) -> vec3f {
    let ripple = rippleGradient(position.xz, pixelFootprint(depth));
    let normal = normalize(vec3f(-ripple.x, 1.0, -ripple.y));
    let cosine = clamp(-dot(direction, normal), 0.0, 1.0);
    let fresnel = WATER_F0 + (1.0 - WATER_F0) * pow(1.0 - cosine, 5.0);
    var reflected = reflect(direction, normal);
    reflected.y = abs(reflected.y);
    let lifted = position + vec3f(0.0, 0.05, 0.0);
    let mirror = reflectionRadiance(lifted, reflected, depth);

    let shadow = traceScene(lifted, frame.sunDirection, SHADOW_DISTANCE, SHADOW_EFFORT);
    let sunVisible = select(0.0, 1.0, shadow.field == FIELD_NONE && shadow.t != TRACE_EXHAUSTED);
    let sunlight = sunlightAt(position) * max(frame.sunDirection.y, 0.0) * sunVisible;
    let irradiance = sunlight + skyRadiance(vec3f(0.0, 1.0, 0.0)) * PI * 0.6;

    let waterDepth = max(fields.waterLevel - sceneHeight(position.xz), 0.0);
    let cosRefracted = sqrt(max(1.0 - (1.0 - cosine * cosine) / (WATER_ETA * WATER_ETA), 0.04));
    let path = waterDepth * (1.0 + 1.0 / cosRefracted);
    let throughWater = exp(-WATER_ABSORPTION * path);
    let bed = LAKE_BED * INV_PI * irradiance * throughWater;
    let body = WATER_BODY * irradiance * (vec3f(1.0) - throughWater);
    return fresnel * mirror + (1.0 - fresnel) * (bed + body);
}
