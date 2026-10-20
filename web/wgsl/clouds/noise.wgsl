// SPDX-License-Identifier: Apache-2.0
// Cloud noise, generated once on the GPU (after Schneider, "The Real-Time Volumetric
// Cloudscapes of Horizon Zero Dawn", SIGGRAPH 2015):
//   generateShape   128^3: r = Perlin-Worley, g/b/a = Worley fBm at 4, 8 and 16 cells
//   generateDetail  32^3:  r/g/b = Worley fBm at 2, 4 and 8 cells
//   generateWeather 1024^2 over the cloud region: r = coverage, g = cloud-type variation
// The 3D textures tile seamlessly, so the clouds repeat without seams across the sky.

#include "common/constants.wgsl"
#include "common/hash.wgsl"
#include "terrain/noise.wgsl"

struct WeatherParams {
    seed: u32,
    extent: f32,
    padding0: f32,
    padding1: f32,
}

@group(0) @binding(0) var shapeOut: texture_storage_3d<rgba8unorm, write>;
@group(0) @binding(1) var detailOut: texture_storage_3d<rgba8unorm, write>;
@group(0) @binding(2) var weatherOut: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> weather: WeatherParams;

fn wrapCell(cell: vec3i, period: i32) -> vec3i {
    return ((cell % period) + period) % period;
}

// Inverted distance to the nearest feature point of a periodic cellular grid.
fn worley(p: vec3f, period: i32, salt: u32) -> f32 {
    let scaled = p * f32(period);
    let cell = vec3i(floor(scaled));
    var nearest = 1e9;
    for (var z = -1; z <= 1; z++) {
        for (var y = -1; y <= 1; y++) {
            for (var x = -1; x <= 1; x++) {
                let neighbour = cell + vec3i(x, y, z);
                let key = bitcast<vec3u>(wrapCell(neighbour, period)) + vec3u(salt, salt * 7u, salt * 13u);
                let feature = vec3f(neighbour) + vec3f(pcg3d(key) >> vec3u(8u)) / 16777216.0;
                let offset = feature - scaled;
                nearest = min(nearest, dot(offset, offset));
            }
        }
    }
    return 1.0 - saturate(sqrt(nearest));
}

fn worleyFbm(p: vec3f, period: i32, salt: u32) -> f32 {
    return worley(p, period, salt) * 0.625
        + worley(p, period * 2, salt + 1u) * 0.25
        + worley(p, period * 4, salt + 2u) * 0.125;
}

fn latticeGradient3(cell: vec3i, period: i32) -> vec3f {
    let h = pcg3d(bitcast<vec3u>(wrapCell(cell, period)) + vec3u(0x51u, 0x9du, 0x3fu));
    return normalize(vec3f(h >> vec3u(8u)) / 8388608.0 - 1.0);
}

// Periodic 3D gradient noise in about [-1, 1].
fn perlin3(p: vec3f, period: i32) -> f32 {
    let scaled = p * f32(period);
    let cell = vec3i(floor(scaled));
    let f = scaled - floor(scaled);
    let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    var corners: array<f32, 8>;
    for (var i = 0u; i < 8u; i++) {
        let offset = vec3i(i32(i & 1u), i32((i >> 1u) & 1u), i32((i >> 2u) & 1u));
        corners[i] = dot(latticeGradient3(cell + offset, period), f - vec3f(offset));
    }
    let x00 = mix(corners[0], corners[1], u.x);
    let x10 = mix(corners[2], corners[3], u.x);
    let x01 = mix(corners[4], corners[5], u.x);
    let x11 = mix(corners[6], corners[7], u.x);
    return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z) * 1.15;
}

fn perlinFbm(p: vec3f, period: i32) -> f32 {
    var sum = 0.0;
    var amplitude = 0.5;
    var cells = period;
    for (var octave = 0; octave < 4; octave++) {
        sum += perlin3(p, cells) * amplitude;
        amplitude *= 0.5;
        cells *= 2;
    }
    return sum * 0.5 + 0.5;
}

fn remap(value: f32, low: f32, high: f32, newLow: f32, newHigh: f32) -> f32 {
    return newLow + (value - low) / (high - low) * (newHigh - newLow);
}

@compute @workgroup_size(4, 4, 4)
fn generateShape(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(shapeOut);
    if (any(id >= size)) {
        return;
    }
    let p = (vec3f(id) + 0.5) / vec3f(size);
    let perlin = perlinFbm(p, 4);
    let cells = worleyFbm(p, 4, 11u);
    let perlinWorley = saturate(remap(perlin, 0.0, 1.0, cells, 1.0));
    textureStore(shapeOut, id, vec4f(perlinWorley, cells, worleyFbm(p, 8, 23u), worleyFbm(p, 16, 37u)));
}

@compute @workgroup_size(4, 4, 4)
fn generateDetail(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(detailOut);
    if (any(id >= size)) {
        return;
    }
    let p = (vec3f(id) + 0.5) / vec3f(size);
    textureStore(detailOut, id, vec4f(worleyFbm(p, 2, 51u), worleyFbm(p, 4, 61u), worleyFbm(p, 8, 71u), 1.0));
}

@compute @workgroup_size(8, 8)
fn generateWeather(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(weatherOut);
    if (any(id.xy >= size)) {
        return;
    }
    // Kilometres across the region; cloud fields a few kilometres across, grouped in larger systems.
    let km = (vec2f(id.xy) + 0.5) / vec2f(size) * weather.extent;
    let systems = fbm(km / 60.0, 3u, weather.seed + 3u) * 0.5 + 0.5;
    let fields = fbm(km / 9.0, 4u, weather.seed + 7u) * 0.5 + 0.5;
    let coverage = saturate(fields * 0.75 + systems * 0.45 - 0.1);
    let variation = fbm(km / 25.0, 3u, weather.seed + 13u) * 0.5 + 0.5;
    textureStore(weatherOut, id.xy, vec4f(coverage, variation, 0.0, 1.0));
}
