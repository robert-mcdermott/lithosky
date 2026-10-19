// SPDX-License-Identifier: Apache-2.0
// Derived landform masks for materials:
//   r = flow accumulation (log of droplet water passing each vertex)
//   g = net deposition, signed: above 0.5 deposits and talus, below 0.5 eroded bedrock
//   b = fine curvature (positive in gullies and hollows, negative on crests)
//   a = broad curvature over about 120 m, a cheap exposure term

#include "common/constants.wgsl"
#include "terrain/grid.wgsl"

struct MaskParams {
    grid: FieldGrid,
    flowUnit: f32,
    sedimentDepth: f32,
    fineCurvature: f32,
    broadCurvature: f32,
}

@group(0) @binding(0) var<uniform> params: MaskParams;
@group(0) @binding(1) var height: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> sediment: array<i32>;
@group(0) @binding(3) var<storage, read> flow: array<u32>;
@group(0) @binding(4) var masks: texture_storage_2d<rgba16float, write>;

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

@compute @workgroup_size(8, 8)
fn buildMasks(@builtin(global_invocation_id) id: vec3u) {
    let size = params.grid.size;
    if (id.x >= size || id.y >= size) {
        return;
    }
    let cell = vec2i(id.xy);
    let index = id.y * size + id.x;
    let water = log2(1.0 + f32(flow[index]) / params.flowUnit) / 8.0;
    let net = tanh(f32(sediment[index]) * INV_FIXED_SCALE / params.sedimentDepth);
    let fine = tanh(curvature(cell, 2) * params.fineCurvature);
    let broad = tanh(curvature(cell, 8) * params.broadCurvature);
    let value = vec4f(saturate(water), net * 0.5 + 0.5, fine * 0.5 + 0.5, broad * 0.5 + 0.5);
    textureStore(masks, id.xy, value);
}
