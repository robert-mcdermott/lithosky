// SPDX-License-Identifier: Apache-2.0
// 2D gradient (Perlin) noise with analytic derivatives, plus the fractal sums built on it.

#include "common/constants.wgsl"
#include "common/hash.wgsl"

// Rotating each octave by about 37 degrees hides the lattice axes.
const OCTAVE_ROTATION: mat2x2f = mat2x2f(0.8, 0.6, -0.6, 0.8);

fn latticeGradient(cell: vec2i, seed: u32) -> vec2f {
    let key = bitcast<vec2u>(cell) + vec2u(seed * 0x9E3779B9u, seed * 0x85EBCA6Bu);
    let angle = unitFloat(pcg2d(key).x) * TWO_PI;
    return vec2f(cos(angle), sin(angle));
}

// Returns (value, d/dx, d/dy). The value spans about [-1, 1].
fn gradientNoise(p: vec2f, seed: u32) -> vec3f {
    let cell = vec2i(floor(p));
    let f = p - floor(p);
    let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    let du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
    let g00 = latticeGradient(cell, seed);
    let g10 = latticeGradient(cell + vec2i(1, 0), seed);
    let g01 = latticeGradient(cell + vec2i(0, 1), seed);
    let g11 = latticeGradient(cell + vec2i(1, 1), seed);
    let v00 = dot(g00, f);
    let v10 = dot(g10, f - vec2f(1.0, 0.0));
    let v01 = dot(g01, f - vec2f(0.0, 1.0));
    let v11 = dot(g11, f - vec2f(1.0, 1.0));
    let k = v00 - v10 - v01 + v11;
    let value = v00 + u.x * (v10 - v00) + u.y * (v01 - v00) + u.x * u.y * k;
    let lattice = g00 + u.x * (g10 - g00) + u.y * (g01 - g00) + u.x * u.y * (g00 - g10 - g01 + g11);
    let blend = du * (vec2f(v10 - v00, v01 - v00) + u.yx * k);
    return vec3f(value, lattice + blend) * 1.4;
}

// Plain fBm value, used for warps and large masks.
fn fbm(p: vec2f, octaves: u32, seed: u32) -> f32 {
    var q = p;
    var amplitude = 0.5;
    var sum = 0.0;
    for (var octave = 0u; octave < octaves; octave++) {
        sum += amplitude * gradientNoise(q, seed + octave).x;
        amplitude *= 0.5;
        q = OCTAVE_ROTATION * q * 2.03;
    }
    return sum;
}

// Derivative-damped fBm: octaves fade where the sum is already steep, which reads as
// worn slopes with detail kept in the hollows and on the crests.
fn dampedFbm(p: vec2f, octaves: u32, seed: u32) -> f32 {
    var q = p;
    var amplitude = 0.5;
    var sum = 0.0;
    var slope = vec2f(0.0);
    for (var octave = 0u; octave < octaves; octave++) {
        let n = gradientNoise(q, seed + 101u + octave);
        slope += n.yz;
        sum += amplitude * n.x / (1.0 + dot(slope, slope));
        amplitude *= 0.5;
        q = OCTAVE_ROTATION * q * 2.0;
    }
    return sum;
}

// Ridged multifractal (Musgrave): sharp crests whose detail is weighted by the octave above.
fn ridgedMultifractal(p: vec2f, octaves: u32, seed: u32) -> f32 {
    var q = p;
    var amplitude = 1.0;
    var weight = 1.0;
    var sum = 0.0;
    var total = 0.0;
    for (var octave = 0u; octave < octaves; octave++) {
        var signal = 1.0 - abs(gradientNoise(q, seed + 211u + octave).x);
        signal = signal * signal * weight;
        weight = clamp(signal * 1.8, 0.0, 1.0);
        sum += signal * amplitude;
        total += amplitude;
        amplitude *= 0.5;
        q = OCTAVE_ROTATION * q * 2.0;
    }
    return sum / total;
}
