// SPDX-License-Identifier: Apache-2.0
// Shows the accumulated radiance: average, expose in EV, AgX, then the sRGB transfer curve.

#include "display/agx.wgsl"

struct Display {
    width: u32,
    height: u32,
    exposure: f32,
    viewMode: u32,
    look: u32,
    padding0: u32,
    padding1: u32,
    padding2: u32,
}

@group(0) @binding(0) var<uniform> display: Display;
@group(0) @binding(1) var<storage, read> accumulation: array<vec4f>;

@vertex
fn fullScreen(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
    let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
    return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

fn srgbEncode(value: vec3f) -> vec3f {
    let low = value * 12.92;
    let high = 1.055 * pow(value, vec3f(1.0 / 2.4)) - 0.055;
    return select(high, low, value <= vec3f(0.0031308));
}

@fragment
fn present(@builtin(position) position: vec4f) -> @location(0) vec4f {
    let pixel = min(vec2u(position.xy), vec2u(display.width - 1u, display.height - 1u));
    let sum = accumulation[pixel.y * display.width + pixel.x];
    let radiance = sum.rgb / max(sum.w, 1.0);
    if (display.viewMode != 0u) {
        return vec4f(srgbEncode(saturate(radiance)), 1.0);
    }
    let shown = agxToneMap(radiance * display.exposure, display.look);
    return vec4f(srgbEncode(shown), 1.0);
}
