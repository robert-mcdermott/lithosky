// SPDX-License-Identifier: Apache-2.0
// Analytic erosion detail. A Gabor-like sum of cosine stripes, oriented across the fall line,
// carves gullies and spurs that run downhill. Each octave steers by the slope including the
// octaves above it, so finer gullies branch off the sides of coarser ones. Because it is
// analytic, the far field gets the same worn look as the simulated near tile.

#include "common/constants.wgsl"
#include "common/hash.wgsl"

// Stripes across `across` (unit vector) at unit wavelength. Returns (value, d/dx, d/dy).
fn stripeNoise(p: vec2f, across: vec2f, seed: u32) -> vec3f {
    let cell = floor(p);
    let f = p - cell;
    var sum = vec3f(0.0);
    var weights = 0.0;
    for (var j = -1; j <= 2; j++) {
        for (var i = -1; i <= 2; i++) {
            let key = bitcast<vec2u>(vec2i(cell) + vec2i(i, j)) + vec2u(seed, seed * 0x27d4eb2du);
            let jitter = unitFloat2(pcg2d(key)) - 0.5;
            let offset = f - vec2f(f32(i), f32(j)) - jitter;
            let weight = exp(-2.0 * dot(offset, offset));
            let phase = dot(offset, across) * TWO_PI;
            sum += vec3f(cos(phase), -sin(phase) * TWO_PI * across) * weight;
            weights += weight;
        }
    }
    return sum / weights;
}

struct Gullies {
    height: f32,
    gradient: vec2f,
}

// Adds gully octaves from `wavelength` down to `finest` metres onto a surface whose
// gradient (metres per metre) is `gradient`. Gullies only form on slopes.
fn gullies(world: vec2f, gradient: vec2f, wavelength: f32, amplitude: f32, finest: f32, seed: u32) -> Gullies {
    var result: Gullies;
    result.height = 0.0;
    result.gradient = gradient;
    var size = wavelength;
    var height = amplitude;
    for (var octave = 0u; octave < 8u; octave++) {
        if (size < finest) {
            break;
        }
        let steepness = length(result.gradient);
        let downhill = result.gradient / max(steepness, 1e-6);
        let across = vec2f(-downhill.y, downhill.x);
        let stripes = stripeNoise(world / size, across, seed + octave * 7919u);
        let strength = smoothstep(0.05, 0.45, steepness) * height;
        result.height += stripes.x * strength;
        result.gradient += stripes.yz * (strength / size);
        size *= 0.5;
        height *= 0.42;
    }
    return result;
}
