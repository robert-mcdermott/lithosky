// SPDX-License-Identifier: Apache-2.0
// Derived landform masks for materials and later scattering.
// masks:
//   r = flow: drainage area from the coarse solve, or droplet water, whichever is larger (log)
//   g = net deposition, signed: above 0.5 deposits and talus, below 0.5 eroded bedrock
//   b = fine curvature (positive in gullies and hollows, negative on crests)
//   a = broad curvature over about 120 m
// exposure:
//   r = sky openness over about 500 m (1 on open crests, low in gorges and hollows)
//   g = wetness: high flow on gentle ground, and ground just above the water line
//   b, a = unused

#include "common/constants.wgsl"
#include "terrain/grid.wgsl"

struct MaskParams {
    grid: FieldGrid,
    flowUnit: f32,
    sedimentDepth: f32,
    fineCurvature: f32,
    broadCurvature: f32,
    drainageUnit: f32,
    waterLevel: f32,
    padding0: f32,
    padding1: f32,
}

@group(0) @binding(0) var<uniform> params: MaskParams;
@group(0) @binding(1) var height: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> sediment: array<i32>;
@group(0) @binding(3) var<storage, read> flow: array<u32>;
@group(0) @binding(4) var masks: texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<storage, read> drainage: array<f32>;
@group(0) @binding(6) var exposure: texture_storage_2d<rgba16float, write>;

const OPENNESS_DIRECTIONS: u32 = 8u;
const OPENNESS_STEPS: u32 = 6u;

fn heightAt(cell: vec2i) -> f32 {
    let last = vec2i(i32(params.grid.size) - 1);
    return textureLoad(height, clamp(cell, vec2i(0), last), 0).r;
}

// Laplacian at a given spacing in cells, in 1/metre.
fn curvature(cell: vec2i, reach: i32) -> f32 {
    let centre = heightAt(cell);
    let east = heightAt(cell + vec2i(reach, 0));
    let west = heightAt(cell - vec2i(reach, 0));
    let south = heightAt(cell + vec2i(0, reach));
    let north = heightAt(cell - vec2i(0, reach));
    let spacing = f32(reach) * params.grid.spacing;
    return (east + west + south + north - 4.0 * centre) / (spacing * spacing);
}

// Mean cosine of the horizon elevation in eight directions, sampled 2..64 cells out.
fn openness(cell: vec2i) -> f32 {
    let centre = heightAt(cell);
    var total = 0.0;
    for (var d = 0u; d < OPENNESS_DIRECTIONS; d++) {
        let angle = f32(d) * TWO_PI / f32(OPENNESS_DIRECTIONS);
        let direction = vec2f(cos(angle), sin(angle));
        var steepest = 0.0;
        var reach = 2.0;
        for (var s = 0u; s < OPENNESS_STEPS; s++) {
            let rise = heightAt(cell + vec2i(round(direction * reach))) - centre;
            steepest = max(steepest, rise / (reach * params.grid.spacing));
            reach *= 2.0;
        }
        total += 1.0 / sqrt(1.0 + steepest * steepest);
    }
    return total / f32(OPENNESS_DIRECTIONS);
}

@compute @workgroup_size(8, 8)
fn buildMasks(@builtin(global_invocation_id) id: vec3u) {
    let size = params.grid.size;
    if (id.x >= size || id.y >= size) {
        return;
    }
    let cell = vec2i(id.xy);
    let index = id.y * size + id.x;
    let droplets = log2(1.0 + f32(flow[index]) / params.flowUnit) / 8.0;
    let rivers = log2(max(drainage[index], 1.0)) / params.drainageUnit;
    let water = saturate(max(droplets, rivers));
    let net = tanh(f32(sediment[index]) * INV_FIXED_SCALE / params.sedimentDepth);
    let fine = tanh(curvature(cell, 2) * params.fineCurvature);
    let broad = tanh(curvature(cell, 8) * params.broadCurvature);
    textureStore(masks, id.xy, vec4f(water, net * 0.5 + 0.5, fine * 0.5 + 0.5, broad * 0.5 + 0.5));

    let east = heightAt(cell + vec2i(1, 0));
    let west = heightAt(cell - vec2i(1, 0));
    let south = heightAt(cell + vec2i(0, 1));
    let north = heightAt(cell - vec2i(0, 1));
    let slope = length(vec2f(east - west, south - north)) / (2.0 * params.grid.spacing);
    let aboveWater = heightAt(cell) - params.waterLevel;
    let shoreline = 1.0 - smoothstep(0.0, 6.0, aboveWater);
    let wet = saturate(water * 1.4 - slope * 1.5) + shoreline * step(0.0, aboveWater);
    textureStore(exposure, id.xy, vec4f(openness(cell), saturate(wet), 0.0, 0.0));
}
