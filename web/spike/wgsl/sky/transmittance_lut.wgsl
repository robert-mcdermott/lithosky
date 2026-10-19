// SPDX-License-Identifier: Apache-2.0
// Transmittance LUT: optical depth from any altitude to the top of the atmosphere.

#include "sky/atmosphere.wgsl"

@group(0) @binding(0) var<uniform> atmosphere: Atmosphere;
@group(0) @binding(1) var transmittanceOut: texture_storage_2d<rgba16float, write>;

const TRANSMITTANCE_STEPS: u32 = 40u;

@compute @workgroup_size(8, 8)
fn buildTransmittance(@builtin(global_invocation_id) id: vec3u) {
    if (any(vec2f(id.xy) >= TRANSMITTANCE_SIZE)) {
        return;
    }
    let parameters = transmittanceParameters((vec2f(id.xy) + 0.5) / TRANSMITTANCE_SIZE);
    let cosZenith = parameters.y;
    let origin = vec3f(0.0, parameters.x, 0.0);
    let direction = vec3f(sqrt(max(1.0 - cosZenith * cosZenith, 0.0)), cosZenith, 0.0);
    let rayLength = max(raySphere(origin, direction, atmosphere.topRadius), 0.0);
    let stepLength = rayLength / f32(TRANSMITTANCE_STEPS);
    var depth = vec3f(0.0);
    for (var i = 0u; i < TRANSMITTANCE_STEPS; i++) {
        let position = origin + direction * ((f32(i) + 0.5) * stepLength);
        let medium = sampleMedium(length(position) - atmosphere.bottomRadius);
        depth += medium.extinction * stepLength;
    }
    textureStore(transmittanceOut, id.xy, vec4f(exp(-depth), 1.0));
}
