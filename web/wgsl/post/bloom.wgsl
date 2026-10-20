// SPDX-License-Identifier: Apache-2.0
// Bloom: a chain of half-size downsamples, then tent-filtered upsamples that add each level
// back in (after Jimenez, "Next Generation Post Processing in Call of Duty: Advanced
// Warfare", SIGGRAPH 2014). The first downsample clamps very bright taps so the sun disk
// spreads into a soft glow rather than flooding the frame.
//   downsample  source -> destination at half size
//   upsample    destination = downsampled level + tent(next smaller upsampled level)

@group(0) @binding(0) var<uniform> bloomPass: BloomPass;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var smaller: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;
@group(0) @binding(4) var destination: texture_storage_2d<rgba16float, write>;

struct BloomPass {
    firstLevel: u32,
    padding0: u32,
    padding1: u32,
    padding2: u32,
}

const FIRST_LEVEL_CLAMP: f32 = 400.0;

fn tap(uv: vec2f) -> vec3f {
    let value = textureSampleLevel(source, linearSampler, uv, 0.0).rgb;
    if (bloomPass.firstLevel == 1u) {
        return min(value, vec3f(FIRST_LEVEL_CLAMP));
    }
    return value;
}

fn group4(a: vec3f, b: vec3f, c: vec3f, d: vec3f) -> vec4f {
    return vec4f((a + b + c + d) * 0.25, 1.0);
}

@compute @workgroup_size(8, 8)
fn downsample(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(destination);
    if (id.x >= size.x || id.y >= size.y) {
        return;
    }
    let texel = 1.0 / vec2f(textureDimensions(source));
    let uv = (vec2f(id.xy) + 0.5) / vec2f(size);
    let a = tap(uv + texel * vec2f(-2.0, -2.0));
    let b = tap(uv + texel * vec2f(0.0, -2.0));
    let c = tap(uv + texel * vec2f(2.0, -2.0));
    let d = tap(uv + texel * vec2f(-1.0, -1.0));
    let e = tap(uv + texel * vec2f(1.0, -1.0));
    let f = tap(uv + texel * vec2f(-2.0, 0.0));
    let g = tap(uv);
    let h = tap(uv + texel * vec2f(2.0, 0.0));
    let i = tap(uv + texel * vec2f(-1.0, 1.0));
    let j = tap(uv + texel * vec2f(1.0, 1.0));
    let k = tap(uv + texel * vec2f(-2.0, 2.0));
    let l = tap(uv + texel * vec2f(0.0, 2.0));
    let m = tap(uv + texel * vec2f(2.0, 2.0));
    let centre = group4(d, e, i, j);
    let topLeft = group4(a, b, f, g);
    let topRight = group4(b, c, g, h);
    let bottomLeft = group4(f, g, k, l);
    let bottomRight = group4(g, h, l, m);
    let value = centre.rgb * 0.5 + (topLeft.rgb + topRight.rgb + bottomLeft.rgb + bottomRight.rgb) * 0.125;
    textureStore(destination, id.xy, vec4f(value, 1.0));
}

@compute @workgroup_size(8, 8)
fn upsample(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(destination);
    if (id.x >= size.x || id.y >= size.y) {
        return;
    }
    let uv = (vec2f(id.xy) + 0.5) / vec2f(size);
    let texel = 1.0 / vec2f(textureDimensions(smaller));
    var blurred = vec3f(0.0);
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            let weight = select(1.0, 2.0, dx == 0) * select(1.0, 2.0, dy == 0) / 16.0;
            let offset = vec2f(f32(dx), f32(dy)) * texel;
            blurred += textureSampleLevel(smaller, linearSampler, uv + offset, 0.0).rgb * weight;
        }
    }
    let current = textureLoad(source, vec2i(id.xy), 0).rgb;
    textureStore(destination, id.xy, vec4f(current + blurred, 1.0));
}
