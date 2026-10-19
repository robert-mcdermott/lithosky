// SPDX-License-Identifier: Apache-2.0
// Turns the fixed-point erosion state into the float height texture the tracer reads.
// Erosion fades out near the tile border and the border blends into the far field,
// so the near tile meets the procedural horizon without a step.

#include "common/constants.wgsl"
#include "terrain/grid.wgsl"

struct ResolveParams {
    near: FieldGrid,
    far: FieldGrid,
    erosionFade: f32,
    farBlend: f32,
    padding0: f32,
    padding1: f32,
}

@group(0) @binding(0) var<uniform> params: ResolveParams;
@group(0) @binding(1) var<storage, read> heightFixed: array<i32>;
@group(0) @binding(2) var<storage, read> baseHeight: array<f32>;
@group(0) @binding(3) var farHeight: texture_2d<f32>;
@group(0) @binding(4) var nearHeight: texture_storage_2d<r32float, write>;

fn farHeightAt(world: vec2f) -> f32 {
    let position = (world - params.far.origin) / params.far.spacing;
    let base = vec2i(floor(position));
    let f = position - floor(position);
    let last = vec2i(i32(params.far.size) - 1);
    let h00 = textureLoad(farHeight, clamp(base, vec2i(0), last), 0).r;
    let h10 = textureLoad(farHeight, clamp(base + vec2i(1, 0), vec2i(0), last), 0).r;
    let h01 = textureLoad(farHeight, clamp(base + vec2i(0, 1), vec2i(0), last), 0).r;
    let h11 = textureLoad(farHeight, clamp(base + vec2i(1, 1), vec2i(0), last), 0).r;
    return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}

@compute @workgroup_size(8, 8)
fn resolve(@builtin(global_invocation_id) id: vec3u) {
    let size = params.near.size;
    if (id.x >= size || id.y >= size) {
        return;
    }
    let index = id.y * size + id.x;
    let eroded = f32(heightFixed[index]) * INV_FIXED_SCALE;
    let base = baseHeight[index];
    let edge = f32(min(min(id.x, id.y), min(size - 1u - id.x, size - 1u - id.y)));
    let erosionWeight = smoothstep(0.0, params.erosionFade, edge);
    let near = base + (eroded - base) * erosionWeight;
    let far = farHeightAt(gridWorld(id.xy, params.near));
    let height = mix(far, near, smoothstep(0.0, params.farBlend, edge));
    textureStore(nearHeight, id.xy, vec4f(height, 0.0, 0.0, 0.0));
}
