// SPDX-License-Identifier: Apache-2.0
// Aerial-perspective LUT: a 32 x 32 x 32 froxel volume over the camera frustum holding
// in-scattered light and transmittance from the camera to each slice. Slices are spaced
// quadratically out to `frame.aerialDistance`, so distant ranges get true-kilometre haze.

#include "sky/scattering.wgsl"
#include "trace/frame.wgsl"

@group(0) @binding(0) var<uniform> atmosphere: Atmosphere;
@group(0) @binding(1) var<uniform> frame: Frame;
@group(0) @binding(2) var transmittanceLut: texture_2d<f32>;
@group(0) @binding(3) var multiScatterLut: texture_2d<f32>;
@group(0) @binding(4) var skySampler: sampler;
@group(0) @binding(5) var aerialScatterOut: texture_storage_3d<rgba16float, write>;
@group(0) @binding(6) var aerialTransmittanceOut: texture_storage_3d<rgba16float, write>;

const AERIAL_SIZE: u32 = 32u;
const STEPS_PER_SLICE: u32 = 2u;

@compute @workgroup_size(8, 8)
fn buildAerial(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= AERIAL_SIZE || id.y >= AERIAL_SIZE) {
        return;
    }
    let uv = (vec2f(id.xy) + 0.5) / f32(AERIAL_SIZE);
    let direction = cameraDirection(vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0));
    let origin = vec3f(0.0, atmosphere.bottomRadius + atmosphere.cameraAltitude, 0.0);
    let cosTheta = dot(direction, atmosphere.sunDirection);
    let farthest = frame.aerialDistance * 0.001;
    var segment = emptySegment();
    var previous = 0.0;
    for (var slice = 0u; slice < AERIAL_SIZE; slice++) {
        let fraction = f32(slice + 1u) / f32(AERIAL_SIZE);
        let depth = farthest * fraction * fraction;
        let stepLength = (depth - previous) / f32(STEPS_PER_SLICE);
        for (var k = 0u; k < STEPS_PER_SLICE; k++) {
            let t = previous + (f32(k) + 0.5) * stepLength;
            accumulateStep(&segment, origin + direction * t, stepLength, cosTheta);
        }
        previous = depth;
        let cell = vec3u(id.xy, slice);
        textureStore(aerialScatterOut, cell, vec4f(segment.luminance, 1.0));
        textureStore(aerialTransmittanceOut, cell, vec4f(segment.transmittance, 1.0));
    }
}
