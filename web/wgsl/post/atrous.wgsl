// SPDX-License-Identifier: Apache-2.0
// Edge-avoiding a-trous denoising (after Dammertz et al., "Edge-Avoiding A-Trous Wavelet
// Transform for fast Global Illumination Filtering", HPG 2010, with the variance-guided
// luminance stop of Schied et al., SVGF, HPG 2017). Each pass is a 5x5 B3-spline kernel
// spread `step` pixels apart; weights fall off across normal, distance, albedo and
// luminance edges. The luminance stop scales with the estimated noise, so converged
// pixels stop blurring by themselves.
//   denoisePass  one pass, colorIn -> colorOut (variance propagated in alpha)
//   finish  blends the raw and filtered images into the HDR image the display reads

#include "post/params.wgsl"

@group(0) @binding(0) var<uniform> params: PostParams;
@group(0) @binding(1) var colorIn: texture_2d<f32>;
@group(0) @binding(2) var guideNormal: texture_2d<f32>;
@group(0) @binding(3) var guideAlbedo: texture_2d<f32>;
@group(0) @binding(4) var colorOut: texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var rawColor: texture_2d<f32>;

const KERNEL = array<f32, 3>(0.375, 0.25, 0.0625);
const NORMAL_POWER: f32 = 64.0;
const DEPTH_TOLERANCE: f32 = 0.015;
const ALBEDO_SHARPNESS: f32 = 10.0;
const LUMINANCE_SIGMA: f32 = 4.0;

fn inside(pixel: vec2i) -> bool {
    return all(pixel >= vec2i(0)) && pixel.x < i32(params.width) && pixel.y < i32(params.height);
}

// Variance blurred over 3x3 for a steadier luminance stop.
fn blurredVariance(pixel: vec2i) -> f32 {
    var sum = 0.0;
    var weights = 0.0;
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            let q = pixel + vec2i(dx, dy);
            if (inside(q)) {
                let w = select(0.25, 0.5, dx == 0) * select(0.25, 0.5, dy == 0);
                sum += textureLoad(colorIn, q, 0).a * w;
                weights += w;
            }
        }
    }
    return sum / weights;
}

@compute @workgroup_size(8, 8)
fn denoisePass(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= params.width || id.y >= params.height) {
        return;
    }
    let pixel = vec2i(id.xy);
    let centre = textureLoad(colorIn, pixel, 0);
    let normalDepth = textureLoad(guideNormal, pixel, 0);
    let albedo = textureLoad(guideAlbedo, pixel, 0).rgb;
    let luminance = postLuminance(centre.rgb);
    let luminanceScale = LUMINANCE_SIGMA * sqrt(blurredVariance(pixel)) + 1e-5;
    let depthScale = DEPTH_TOLERANCE * normalDepth.w * f32(params.step) + 1e-3;
    var sum = vec3f(0.0);
    var varianceSum = 0.0;
    var weights = 0.0;
    for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
            let q = pixel + vec2i(dx, dy) * i32(params.step);
            if (!inside(q)) {
                continue;
            }
            let tap = textureLoad(colorIn, q, 0);
            let qNormalDepth = textureLoad(guideNormal, q, 0);
            let qAlbedo = textureLoad(guideAlbedo, q, 0).rgb;
            let wNormal = pow(max(dot(normalDepth.xyz, qNormalDepth.xyz), 0.0), NORMAL_POWER);
            let wDepth = exp(-abs(normalDepth.w - qNormalDepth.w) / depthScale);
            let wAlbedo = exp(-length(albedo - qAlbedo) * ALBEDO_SHARPNESS);
            let wLuminance = exp(-abs(luminance - postLuminance(tap.rgb)) / luminanceScale);
            let w = KERNEL[abs(dx)] * KERNEL[abs(dy)] * wNormal * wDepth * wAlbedo * wLuminance;
            sum += tap.rgb * w;
            varianceSum += tap.a * w * w;
            weights += w;
        }
    }
    textureStore(colorOut, pixel, vec4f(sum / weights, varianceSum / (weights * weights)));
}

@compute @workgroup_size(8, 8)
fn finish(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= params.width || id.y >= params.height) {
        return;
    }
    let pixel = vec2i(id.xy);
    let raw = textureLoad(rawColor, pixel, 0).rgb;
    let filtered = textureLoad(colorIn, pixel, 0).rgb;
    textureStore(colorOut, pixel, vec4f(mix(raw, filtered, params.denoiseMix), 1.0));
}
