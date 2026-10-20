// SPDX-License-Identifier: Apache-2.0
// Turns the accumulated sums into averages the post passes can filter:
//   color        mean radiance, and the variance of that mean's luminance in alpha
//   guideNormal  first-hit normal and distance
//   guideAlbedo  first-hit albedo

#include "post/params.wgsl"

@group(0) @binding(0) var<uniform> params: PostParams;
@group(0) @binding(1) var<storage, read> accumulation: array<vec4f>;
@group(0) @binding(2) var<storage, read> guides: array<vec4f>;
@group(0) @binding(3) var color: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var guideNormal: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var guideAlbedo: texture_storage_2d<rgba16float, write>;

// Half-float storage tops out near 65504.
const HALF_MAX: f32 = 60000.0;

@compute @workgroup_size(8, 8)
fn resolve(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= params.width || id.y >= params.height) {
        return;
    }
    let index = id.y * params.width + id.x;
    let sum = accumulation[index];
    let count = max(sum.w, 1.0);
    let mean = sum.rgb / count;
    let albedoSum = guides[index * 2u];
    let normalSum = guides[index * 2u + 1u];
    let luminance = postLuminance(mean);
    let variance = max(albedoSum.w / count - luminance * luminance, 0.0) / count;
    textureStore(color, id.xy, vec4f(min(mean, vec3f(HALF_MAX)), min(variance, HALF_MAX)));
    let normal = normalSum.xyz / max(length(normalSum.xyz), 1e-6);
    textureStore(guideNormal, id.xy, vec4f(normal, normalSum.w / count));
    textureStore(guideAlbedo, id.xy, vec4f(albedoSum.rgb / count, 1.0));
}
