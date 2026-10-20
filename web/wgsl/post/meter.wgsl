// SPDX-License-Identifier: Apache-2.0
// Exposure meter: the centre-weighted geometric mean luminance of the HDR image, from a
// 64 x 36 grid of taps reduced by one workgroup. The result eases toward the new value by
// `meterBlend` so camera moves don't make the exposure jump.
// exposure[0] holds the smoothed mean luminance; exposure[1] marks it as initialised.

#include "post/params.wgsl"

@group(0) @binding(0) var<uniform> params: PostParams;
@group(0) @binding(1) var hdr: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> exposure: array<f32>;

const GRID: vec2u = vec2u(64u, 36u);
const THREADS: u32 = 256u;
// Keeps the sun disk and dark corners from dominating the average.
const MIN_LUMINANCE: f32 = 1e-4;
const MAX_LUMINANCE: f32 = 40.0;

var<workgroup> logSums: array<f32, 256>;
var<workgroup> weightSums: array<f32, 256>;

@compute @workgroup_size(256)
fn meter(@builtin(local_invocation_index) thread: u32) {
    var logSum = 0.0;
    var weightSum = 0.0;
    let size = vec2f(f32(params.width), f32(params.height));
    for (var index = thread; index < GRID.x * GRID.y; index += THREADS) {
        let cell = vec2f(f32(index % GRID.x), f32(index / GRID.x));
        let uv = (cell + 0.5) / vec2f(GRID);
        let pixel = vec2i(uv * size);
        let luminance = clamp(postLuminance(textureLoad(hdr, pixel, 0).rgb), MIN_LUMINANCE, MAX_LUMINANCE);
        let fromCentre = (uv - 0.5) * vec2f(size.x / size.y, 1.0);
        let weight = 1.0 - 0.6 * saturate(length(fromCentre) / 0.9);
        logSum += log(luminance) * weight;
        weightSum += weight;
    }
    logSums[thread] = logSum;
    weightSums[thread] = weightSum;
    workgroupBarrier();
    for (var stride = THREADS / 2u; stride > 0u; stride /= 2u) {
        if (thread < stride) {
            logSums[thread] += logSums[thread + stride];
            weightSums[thread] += weightSums[thread + stride];
        }
        workgroupBarrier();
    }
    if (thread == 0u) {
        let mean = exp(logSums[0] / weightSums[0]);
        let previous = exposure[0];
        let blend = select(1.0, params.meterBlend, exposure[1] > 0.5);
        exposure[0] = mix(previous, mean, blend);
        exposure[1] = 1.0;
    }
}
