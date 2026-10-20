// SPDX-License-Identifier: Apache-2.0
// Shows the accumulated radiance: average, expose in EV, AgX, then the sRGB transfer curve.
// The rendered image (render size) is stretched over the output with bilinear filtering.

#include "display/agx.wgsl"

struct Display {
    outputWidth: u32,
    outputHeight: u32,
    renderWidth: u32,
    renderHeight: u32,
    exposure: f32,
    viewMode: u32,
    look: u32,
    padding: u32,
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

fn averaged(pixel: vec2i) -> vec3f {
    let last = vec2i(i32(display.renderWidth) - 1, i32(display.renderHeight) - 1);
    let clamped = clamp(pixel, vec2i(0), last);
    let sum = accumulation[u32(clamped.y) * display.renderWidth + u32(clamped.x)];
    return sum.rgb / max(sum.w, 1.0);
}

// Bilinear lookup of the rendered image at output pixel centre `position`.
fn renderedAt(position: vec2f) -> vec3f {
    let renderSize = vec2f(f32(display.renderWidth), f32(display.renderHeight));
    let outputSize = vec2f(f32(display.outputWidth), f32(display.outputHeight));
    let source = position * renderSize / outputSize - 0.5;
    let base = vec2i(floor(source));
    let f = source - floor(source);
    let top = mix(averaged(base), averaged(base + vec2i(1, 0)), f.x);
    let bottom = mix(averaged(base + vec2i(0, 1)), averaged(base + vec2i(1, 1)), f.x);
    return mix(top, bottom, f.y);
}

@fragment
fn present(@builtin(position) position: vec4f) -> @location(0) vec4f {
    let radiance = renderedAt(position.xy);
    if (display.viewMode != 0u) {
        return vec4f(srgbEncode(saturate(radiance)), 1.0);
    }
    let shown = agxToneMap(radiance * display.exposure, display.look);
    return vec4f(srgbEncode(shown), 1.0);
}
