// SPDX-License-Identifier: Apache-2.0
// The image pipeline, in order: denoised HDR radiance (stretched to the output with
// bilinear filtering), bloom, exposure (metered or manual), white balance, a tone-mapping
// look, vignette, the sRGB transfer curve, then film grain.

#include "display/agx.wgsl"
#include "display/aces.wgsl"

struct Display {
    outputWidth: u32,
    outputHeight: u32,
    viewMode: u32,
    look: u32,
    // Exposure multiplier: 2^EV when metered, the full manual scale otherwise.
    exposure: f32,
    autoExposure: u32,
    bloom: f32,
    warmth: f32,
    vignette: f32,
    grain: f32,
    grainSeed: u32,
    bloomLevels: f32,
    // Where the image sits in the output, in output UV (x0, y0, x1, y1): the whole output,
    // or a region rendered over the view.
    region: vec4f,
}

@group(0) @binding(0) var<uniform> display: Display;
@group(0) @binding(1) var hdr: texture_2d<f32>;
@group(0) @binding(2) var bloom: texture_2d<f32>;
@group(0) @binding(3) var imageSampler: sampler;
@group(0) @binding(4) var<storage, read> meter: array<f32>;

const LOOK_NATURAL: u32 = 0u;
const LOOK_RICH: u32 = 1u;
const LOOK_CINEMATIC: u32 = 2u;
const LOOK_SOFT: u32 = 3u;
const LOOK_MONO: u32 = 4u;

// Metered exposure maps the scene's mean luminance to this middle grey.
const KEY_VALUE: f32 = 0.2;

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

fn luma(value: vec3f) -> f32 {
    return dot(value, vec3f(0.2126, 0.7152, 0.0722));
}

// A gentle warm/cool shift that keeps luminance.
fn whiteBalance(value: vec3f, warmth: f32) -> vec3f {
    let gains = vec3f(1.0 + 0.12 * warmth, 1.0 + 0.015 * warmth, 1.0 - 0.14 * warmth);
    return value * gains / luma(gains);
}

fn toneMap(value: vec3f, look: u32) -> vec3f {
    switch (look) {
        case LOOK_RICH: {
            return agxToneMap(value, AGX_LOOK_PUNCHY);
        }
        case LOOK_CINEMATIC: {
            return acesToneMap(value * 0.6);
        }
        case LOOK_SOFT: {
            let base = agxToneMap(value, 0u);
            let muted = mix(vec3f(luma(base)), base, 0.85);
            return muted * 0.92 + 0.035;
        }
        case LOOK_MONO: {
            let base = agxToneMap(value, AGX_LOOK_PUNCHY);
            return vec3f(luma(base)) * vec3f(1.02, 1.0, 0.95);
        }
        default: {
            return agxToneMap(value, 0u);
        }
    }
}

fn grainNoise(pixel: vec2u) -> f32 {
    var h = (pixel.x * 0x8da6b343u) ^ (pixel.y * 0xd8163841u) ^ (display.grainSeed * 0xcb1ab31fu);
    h = (h ^ (h >> 15u)) * 0x2c1b3c6du;
    h = (h ^ (h >> 12u)) * 0x297a2d39u;
    h = h ^ (h >> 15u);
    return f32(h >> 8u) / 16777216.0 - 0.5;
}

@fragment
fn present(@builtin(position) position: vec4f) -> @location(0) vec4f {
    let outputSize = vec2f(f32(display.outputWidth), f32(display.outputHeight));
    let screen = position.xy / outputSize;
    let uv = (screen - display.region.xy) / (display.region.zw - display.region.xy);
    var color = textureSampleLevel(hdr, imageSampler, uv, 0.0).rgb;
    if (display.viewMode != 0u) {
        return vec4f(srgbEncode(saturate(color)), 1.0);
    }
    let glow = textureSampleLevel(bloom, imageSampler, uv, 0.0).rgb / display.bloomLevels;
    color = mix(color, glow, display.bloom);
    var exposure = display.exposure;
    if (display.autoExposure == 1u) {
        exposure *= KEY_VALUE / max(meter[0], 1e-4);
    }
    color = whiteBalance(color * exposure, display.warmth);
    var shown = toneMap(color, display.look);
    let fromCentre = (screen - 0.5) * vec2f(outputSize.x / outputSize.y, 1.0);
    let edge = length(fromCentre) / length(vec2f(outputSize.x / outputSize.y, 1.0) * 0.5);
    shown *= 1.0 - display.vignette * 0.55 * smoothstep(0.3, 1.0, edge);
    var encoded = srgbEncode(saturate(shown));
    encoded += grainNoise(vec2u(position.xy)) * display.grain * 0.045;
    return vec4f(saturate(encoded), 1.0);
}
