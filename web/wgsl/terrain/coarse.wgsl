// SPDX-License-Identifier: Apache-2.0
// Moves terrain between a fine grid and the coarse grid the drainage solver runs on.
//   downsample  fine base heights -> coarse heights (box-filtered), plus a pristine copy
//   difference  coarse eroded - coarse pristine: what drainage carved, in metres
//   apply       fine heights = fine base + upsampled carving; also upsamples drainage area

#include "common/constants.wgsl"
#include "terrain/grid.wgsl"

struct CoarseParams {
    fine: FieldGrid,
    coarse: FieldGrid,
}

@group(0) @binding(0) var<uniform> params: CoarseParams;
@group(0) @binding(1) var<storage, read> fineBase: array<f32>;
@group(0) @binding(2) var<storage, read> coarseHeight: array<f32>;
@group(0) @binding(3) var<storage, read> coarsePristine: array<f32>;
@group(0) @binding(4) var<storage, read> coarseArea: array<f32>;
@group(0) @binding(5) var<storage, read> coarseCarving: array<f32>;
@group(0) @binding(6) var<storage, read_write> coarseOut: array<f32>;
@group(0) @binding(7) var<storage, read_write> pristineOut: array<f32>;
@group(0) @binding(8) var<storage, read_write> carvingOut: array<f32>;
@group(0) @binding(9) var<storage, read_write> heightFixed: array<i32>;
@group(0) @binding(10) var<storage, read_write> drainageOut: array<f32>;

fn fineAt(position: vec2f) -> f32 {
    let last = i32(params.fine.size) - 1;
    let base = clamp(vec2i(floor(position)), vec2i(0), vec2i(last - 1));
    let f = clamp(position - vec2f(base), vec2f(0.0), vec2f(1.0));
    let size = params.fine.size;
    let h00 = fineBase[gridIndex(vec2u(base), size)];
    let h10 = fineBase[gridIndex(vec2u(base + vec2i(1, 0)), size)];
    let h01 = fineBase[gridIndex(vec2u(base + vec2i(0, 1)), size)];
    let h11 = fineBase[gridIndex(vec2u(base + vec2i(1, 1)), size)];
    return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}

struct CoarseTaps {
    indices: vec4u,
    weights: vec4f,
}

// The four coarse vertices around a world position and their bilinear weights.
fn coarseTaps(world: vec2f) -> CoarseTaps {
    let position = (world - params.coarse.origin) / params.coarse.spacing;
    let last = i32(params.coarse.size) - 1;
    let base = clamp(vec2i(floor(position)), vec2i(0), vec2i(last - 1));
    let f = clamp(position - vec2f(base), vec2f(0.0), vec2f(1.0));
    let size = params.coarse.size;
    var taps: CoarseTaps;
    taps.indices = vec4u(
        gridIndex(vec2u(base), size),
        gridIndex(vec2u(base + vec2i(1, 0)), size),
        gridIndex(vec2u(base + vec2i(0, 1)), size),
        gridIndex(vec2u(base + vec2i(1, 1)), size),
    );
    taps.weights = vec4f((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
    return taps;
}

fn carvingAt(taps: CoarseTaps) -> f32 {
    let values = vec4f(
        coarseCarving[taps.indices.x],
        coarseCarving[taps.indices.y],
        coarseCarving[taps.indices.z],
        coarseCarving[taps.indices.w],
    );
    return dot(values, taps.weights);
}

fn areaAt(taps: CoarseTaps) -> f32 {
    let values = vec4f(
        coarseArea[taps.indices.x],
        coarseArea[taps.indices.y],
        coarseArea[taps.indices.z],
        coarseArea[taps.indices.w],
    );
    return dot(values, taps.weights);
}

@compute @workgroup_size(8, 8)
fn downsample(@builtin(global_invocation_id) id: vec3u) {
    let size = params.coarse.size;
    if (id.x >= size || id.y >= size) {
        return;
    }
    let world = gridWorld(id.xy, params.coarse);
    let centre = (world - params.fine.origin) / params.fine.spacing;
    let ratio = params.coarse.spacing / params.fine.spacing;
    var sum = 0.0;
    for (var j = 0; j < 4; j++) {
        for (var i = 0; i < 4; i++) {
            let offset = (vec2f(f32(i), f32(j)) - 1.5) * 0.25 * ratio;
            sum += fineAt(centre + offset);
        }
    }
    let index = gridIndex(id.xy, size);
    coarseOut[index] = sum / 16.0;
    pristineOut[index] = sum / 16.0;
}

@compute @workgroup_size(8, 8)
fn difference(@builtin(global_invocation_id) id: vec3u) {
    let size = params.coarse.size;
    if (id.x >= size || id.y >= size) {
        return;
    }
    let index = gridIndex(id.xy, size);
    carvingOut[index] = coarseHeight[index] - coarsePristine[index];
}

@compute @workgroup_size(8, 8)
fn apply(@builtin(global_invocation_id) id: vec3u) {
    let size = params.fine.size;
    if (id.x >= size || id.y >= size) {
        return;
    }
    let world = gridWorld(id.xy, params.fine);
    let index = gridIndex(id.xy, size);
    let taps = coarseTaps(world);
    let height = fineBase[index] + carvingAt(taps);
    heightFixed[index] = i32(round(height * FIXED_SCALE));
    drainageOut[index] = areaAt(taps);
}
