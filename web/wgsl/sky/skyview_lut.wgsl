// SPDX-License-Identifier: Apache-2.0
// Sky-view LUT: sky luminance around the camera, parameterised by view zenith (dense near the
// horizon) and azimuth relative to the sun (dense near the sun), as in Hillaire 2020.

#include "sky/scattering.wgsl"
#include "sky/skyview_mapping.wgsl"

@group(0) @binding(0) var<uniform> atmosphere: Atmosphere;
@group(0) @binding(1) var transmittanceLut: texture_2d<f32>;
@group(0) @binding(2) var multiScatterLut: texture_2d<f32>;
@group(0) @binding(3) var skySampler: sampler;
@group(0) @binding(4) var skyViewOut: texture_storage_2d<rgba16float, write>;

const SKY_VIEW_STEPS: u32 = 40u;

@compute @workgroup_size(8, 8)
fn buildSkyView(@builtin(global_invocation_id) id: vec3u) {
    if (any(vec2f(id.xy) >= SKY_VIEW_SIZE)) {
        return;
    }
    let radius = atmosphere.bottomRadius + atmosphere.cameraAltitude;
    let origin = vec3f(0.0, radius, 0.0);
    let direction = skyViewDirection((vec2f(id.xy) + 0.5) / SKY_VIEW_SIZE, radius);
    let rayLength = distanceToBoundary(origin, direction);
    let cosTheta = dot(direction, atmosphere.sunDirection);
    var segment = emptySegment();
    // Quadratic spacing keeps samples dense in the thick air near the camera.
    for (var i = 0u; i < SKY_VIEW_STEPS; i++) {
        let a = f32(i) / f32(SKY_VIEW_STEPS);
        let b = f32(i + 1u) / f32(SKY_VIEW_STEPS);
        let start = rayLength * a * a;
        let end = rayLength * b * b;
        accumulateStep(&segment, origin + direction * (0.5 * (start + end)), end - start, cosTheta);
    }
    textureStore(skyViewOut, id.xy, vec4f(segment.luminance, 1.0));
}
