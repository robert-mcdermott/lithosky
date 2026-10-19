// SPDX-License-Identifier: Apache-2.0
// Transmittance LUT reads. Including modules declare `transmittanceLut` and `skySampler`.

#include "sky/atmosphere.wgsl"

fn transmittanceAt(radius: f32, cosZenith: f32) -> vec3f {
    let uv = transmittanceUv(radius, cosZenith);
    return textureSampleLevel(transmittanceLut, skySampler, uv, 0.0).rgb;
}

// Transmittance from a planet-frame point toward `sun`, zero where the planet blocks it.
fn sunTransmittance(position: vec3f, sun: vec3f) -> vec3f {
    let radius = length(position);
    let cosSun = dot(position / radius, sun);
    if (raySphere(position, sun, atmosphere.bottomRadius) > 0.001) {
        return vec3f(0.0);
    }
    return transmittanceAt(radius, cosSun);
}
