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
