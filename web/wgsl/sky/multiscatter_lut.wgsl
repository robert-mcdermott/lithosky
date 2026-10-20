// SPDX-License-Identifier: Apache-2.0
// Multiple-scattering LUT (Hillaire 2020, section 5.5). For each altitude and sun angle,
// 64 directions estimate second-order light L2 and the transfer factor f_ms; the infinite
// series of higher orders is then L2 / (1 - f_ms). One workgroup computes one texel.

#include "sky/transmittance.wgsl"

@group(0) @binding(0) var<uniform> atmosphere: Atmosphere;
@group(0) @binding(1) var transmittanceLut: texture_2d<f32>;
@group(0) @binding(2) var skySampler: sampler;
@group(0) @binding(3) var multiScatterOut: texture_storage_2d<rgba16float, write>;

const DIRECTIONS: u32 = 64u;
const STEPS: u32 = 20u;

var<workgroup> sharedLuminance: array<vec3f, 64>;
var<workgroup> sharedTransfer: array<vec3f, 64>;

fn laneDirection(lane: u32) -> vec3f {
    let cosTheta = 1.0 - 2.0 * (f32(lane % 8u) + 0.5) / 8.0;
    let phi = TWO_PI * (f32(lane / 8u) + 0.5) / 8.0;
    let sinTheta = sqrt(max(1.0 - cosTheta * cosTheta, 0.0));
    return vec3f(sinTheta * cos(phi), cosTheta, sinTheta * sin(phi));
}

@compute @workgroup_size(1, 1, 64)
fn buildMultiScatter(@builtin(workgroup_id) group: vec3u, @builtin(local_invocation_index) lane: u32) {
    let uv = (vec2f(group.xy) + 0.5) / MULTISCATTER_SIZE;
    let cosSun = subUvToUnit(uv.x, MULTISCATTER_SIZE) * 2.0 - 1.0;
    let height = saturate(subUvToUnit(uv.y, MULTISCATTER_SIZE));
    let radius = mix(atmosphere.bottomRadius + 0.01, atmosphere.topRadius - 0.01, height);
    let origin = vec3f(0.0, radius, 0.0);
    let sun = vec3f(0.0, cosSun, sqrt(max(1.0 - cosSun * cosSun, 0.0)));
    let direction = laneDirection(lane);

    let groundDistance = raySphere(origin, direction, atmosphere.bottomRadius);
    let hitsGround = groundDistance > 0.0;
    var rayLength = max(raySphere(origin, direction, atmosphere.topRadius), 0.0);
    if (hitsGround) {
        rayLength = groundDistance;
    }
    let stepLength = rayLength / f32(STEPS);
    var luminance = vec3f(0.0);
    var transfer = vec3f(0.0);
    var throughput = vec3f(1.0);
    for (var i = 0u; i < STEPS; i++) {
        let position = origin + direction * ((f32(i) + 0.5) * stepLength);
        let medium = sampleMedium(length(position) - atmosphere.bottomRadius);
        let stepTransmittance = exp(-medium.extinction * stepLength);
        let extinction = max(medium.extinction, vec3f(1e-7));
        let source = medium.scattering * INV_FOUR_PI * sunTransmittance(position, sun);
        luminance += throughput * (source - source * stepTransmittance) / extinction;
        transfer += throughput * (medium.scattering - medium.scattering * stepTransmittance) / extinction;
        throughput *= stepTransmittance;
    }
    if (hitsGround) {
        let ground = origin + direction * rayLength;
        let up = normalize(ground);
        let lit = sunTransmittance(ground + up * 0.002, sun) * saturate(dot(up, sun));
        luminance += throughput * lit * atmosphere.groundAlbedo * INV_PI;
    }

    sharedLuminance[lane] = luminance;
    sharedTransfer[lane] = transfer;
    workgroupBarrier();
    for (var stride = 32u; stride > 0u; stride = stride >> 1u) {
        if (lane < stride) {
            sharedLuminance[lane] += sharedLuminance[lane + stride];
            sharedTransfer[lane] += sharedTransfer[lane + stride];
        }
        workgroupBarrier();
    }
    if (lane == 0u) {
        let secondOrder = sharedLuminance[0] / f32(DIRECTIONS);
        let transferFactor = sharedTransfer[0] / f32(DIRECTIONS);
        let multiple = secondOrder / (vec3f(1.0) - transferFactor);
        textureStore(multiScatterOut, group.xy, vec4f(multiple, 1.0));
    }
}
