// SPDX-License-Identifier: Apache-2.0
// Sky, sun and aerial-perspective lookups for the tracer.
// Including modules declare `atmosphere`, `frame`, the sky LUTs and `skySampler`.

#include "sky/transmittance.wgsl"
#include "sky/skyview_mapping.wgsl"

const AERIAL_SLICES: f32 = 32.0;

fn cameraRadius() -> f32 {
    return atmosphere.bottomRadius + atmosphere.cameraAltitude;
}

// Sky luminance seen from the camera altitude, without the sun disk.
fn skyRadiance(direction: vec3f) -> vec3f {
    let uv = skyViewUv(direction, cameraRadius());
    return textureSampleLevel(skyViewLut, skySampler, uv, 0.0).rgb;
}

// The solar disk with simple limb darkening, attenuated by the air toward the camera.
fn sunDisk(direction: vec3f) -> vec3f {
    let cosAngle = dot(direction, frame.sunDirection);
    if (cosAngle < frame.sunCosRadius) {
        return vec3f(0.0);
    }
    let solidAngle = TWO_PI * (1.0 - frame.sunCosRadius);
    let offset = sqrt(max(1.0 - cosAngle * cosAngle, 0.0)) / sin(frame.sunRadius);
    let limb = 1.0 - 0.6 * (1.0 - sqrt(max(1.0 - offset * offset, 0.0)));
    let origin = vec3f(0.0, cameraRadius(), 0.0);
    let transmittance = sunTransmittance(origin, direction);
    return frame.sunIlluminance / solidAngle * limb * transmittance;
}

const DISTANT_GROUND_ALBEDO: f32 = 0.1;

// Light reflected by the planet's surface beyond the far-field terrain, for rays that pass
// over the last ridge and still meet the ground before the horizon. The sky-view LUT
// already holds the air in front of that ground; this adds the ground itself.
// The ground stands at the landform's level (a high plateau, or near sea level), so the
// far field doesn't end in a step down to a sliver of bright horizon.
fn distantGroundRadius() -> f32 {
    return min(atmosphere.bottomRadius + fields.horizonHeight * 0.001, cameraRadius() - 0.01);
}

// Distance in metres to the ground beyond the far field along a sky ray, or MAX_DISTANCE.
fn distantGroundDistance(direction: vec3f) -> f32 {
    let t = raySphere(vec3f(0.0, cameraRadius(), 0.0), direction, distantGroundRadius());
    return select(MAX_DISTANCE, t * 1000.0, t > 0.0);
}

fn distantGround(direction: vec3f) -> vec3f {
    let origin = vec3f(0.0, cameraRadius(), 0.0);
    let groundRadius = distantGroundRadius();
    let t = raySphere(origin, direction, groundRadius);
    if (t <= 0.0) {
        return vec3f(0.0);
    }
    let ground = origin + direction * t;
    let up = normalize(ground);
    let sun = sunTransmittance(ground, frame.sunDirection) * frame.sunIlluminance * max(dot(up, frame.sunDirection), 0.0);
    let irradiance = sun + skyRadiance(vec3f(0.0, 1.0, 0.0)) * PI * 0.5;
    // Transmittance from the camera down to the ground, as a ratio of upward lookups.
    let fromGround = transmittanceAt(groundRadius, dot(up, -direction));
    let fromCamera = transmittanceAt(cameraRadius(), -direction.y);
    let toGround = saturate(fromGround / max(fromCamera, vec3f(1e-6)));
    return DISTANT_GROUND_ALBEDO * INV_PI * irradiance * toGround;
}

// Sun illuminance reaching a world point after the atmosphere (terrain shadows not included).
fn sunlightAt(world: vec3f) -> vec3f {
    let position = planetPosition(world, frame.cameraPosition);
    return frame.sunIlluminance * sunTransmittance(position, frame.sunDirection);
}

struct Aerial {
    luminance: vec3f,
    transmittance: vec3f,
}

fn aerialPerspective(direction: vec3f, depth: f32) -> Aerial {
    let forward = max(dot(direction, frame.cameraForward), 1e-4);
    let x = dot(direction, frame.cameraRight) / forward / (frame.tanHalfFov * frame.aspect);
    let y = dot(direction, frame.cameraUp) / forward / frame.tanHalfFov;
    let uv = vec2f(0.5 + 0.5 * x, 0.5 - 0.5 * y);
    let slice = sqrt(depth / frame.aerialDistance) * AERIAL_SLICES - 1.0;
    let w = (clamp(slice, 0.0, AERIAL_SLICES - 1.0) + 0.5) / AERIAL_SLICES;
    let coordinate = vec3f(uv, w);
    var result: Aerial;
    result.luminance = textureSampleLevel(aerialScatter, skySampler, coordinate, 0.0).rgb;
    result.transmittance = textureSampleLevel(aerialTransmittance, skySampler, coordinate, 0.0).rgb;
    if (slice < 0.0) {
        let fraction = saturate(slice + 1.0);
        result.luminance *= fraction;
        result.transmittance = mix(vec3f(1.0), result.transmittance, fraction);
    }
    return result;
}
