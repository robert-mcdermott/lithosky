// SPDX-License-Identifier: Apache-2.0
// Fills a height grid from the alpine generator.
// generateNear seeds the erosion buffers; generateFar writes the far-field texture.

#include "terrain/generator.wgsl"
#include "terrain/grid.wgsl"

@group(0) @binding(0) var<uniform> shape: TerrainShape;
@group(0) @binding(1) var<uniform> grid: FieldGrid;
@group(0) @binding(2) var<storage, read_write> baseHeight: array<f32>;
@group(0) @binding(3) var<storage, read_write> heightFixed: array<i32>;
@group(0) @binding(4) var farHeight: texture_storage_2d<r32float, write>;

@compute @workgroup_size(8, 8)
fn generateNear(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= grid.size || id.y >= grid.size) {
        return;
    }
    let height = alpineHeight(gridWorld(id.xy, grid), shape);
    let index = gridIndex(id.xy, grid.size);
    baseHeight[index] = height;
    heightFixed[index] = i32(round(height * FIXED_SCALE));
}

@compute @workgroup_size(8, 8)
fn generateFar(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= grid.size || id.y >= grid.size) {
        return;
    }
    let height = alpineHeight(gridWorld(id.xy, grid), shape);
    textureStore(farHeight, id.xy, vec4f(height, 0.0, 0.0, 0.0));
}
