// SPDX-License-Identifier: Apache-2.0
// Fills height grids.
//   generateNear    the editable tile: procedural, or an imported heightmap; seeds erosion
//   generateCoarse  a plain height buffer on any grid (the far field's drainage grid)
//   generateFar     the far-field texture: procedural heights plus the carving its
//                   coarse drainage solve produced

#include "terrain/generator.wgsl"
#include "terrain/grid.wgsl"

const SOURCE_PROCEDURAL: u32 = 0u;
const SOURCE_HEIGHTMAP: u32 = 1u;

struct SourceParams {
    mode: u32,
    base: f32,
    relief: f32,
    padding: f32,
}

@group(0) @binding(0) var<uniform> shape: TerrainShape;
@group(0) @binding(1) var<uniform> grid: FieldGrid;
@group(0) @binding(2) var<storage, read_write> baseHeight: array<f32>;
@group(0) @binding(3) var<storage, read_write> heightFixed: array<i32>;
@group(0) @binding(4) var farHeight: texture_storage_2d<r32float, write>;
@group(0) @binding(5) var<uniform> carvingGrid: FieldGrid;
@group(0) @binding(6) var<storage, read> carving: array<f32>;
@group(0) @binding(7) var<uniform> source: SourceParams;
@group(0) @binding(8) var sourceHeight: texture_2d<f32>;

// Imported heights (0..1) stretched over the whole tile, bilinear.
fn heightmapAt(cell: vec2u) -> f32 {
    let samples = textureDimensions(sourceHeight);
    let position = vec2f(cell) / f32(grid.size - 1u) * vec2f(samples - 1u);
    let base = min(vec2u(floor(position)), samples - 2u);
    let f = position - vec2f(base);
    let h00 = textureLoad(sourceHeight, base, 0).r;
    let h10 = textureLoad(sourceHeight, base + vec2u(1u, 0u), 0).r;
    let h01 = textureLoad(sourceHeight, base + vec2u(0u, 1u), 0).r;
    let h11 = textureLoad(sourceHeight, base + vec2u(1u, 1u), 0).r;
    let normalized = mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
    let world = gridWorld(cell, grid);
    let fromCamera = world - shape.curvatureOrigin;
    return source.base + normalized * source.relief - dot(fromCamera, fromCamera) / (2.0 * EARTH_RADIUS_M);
}

fn carvingAt(world: vec2f) -> f32 {
    let position = (world - carvingGrid.origin) / carvingGrid.spacing;
    let last = i32(carvingGrid.size) - 1;
    let base = clamp(vec2i(floor(position)), vec2i(0), vec2i(last - 1));
    let f = clamp(position - vec2f(base), vec2f(0.0), vec2f(1.0));
    let size = carvingGrid.size;
    let h00 = carving[gridIndex(vec2u(base), size)];
    let h10 = carving[gridIndex(vec2u(base + vec2i(1, 0)), size)];
    let h01 = carving[gridIndex(vec2u(base + vec2i(0, 1)), size)];
    let h11 = carving[gridIndex(vec2u(base + vec2i(1, 1)), size)];
    return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}

@compute @workgroup_size(8, 8)
fn generateNear(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= grid.size || id.y >= grid.size) {
        return;
    }
    var height: f32;
    if (source.mode == SOURCE_HEIGHTMAP) {
        height = heightmapAt(id.xy);
    } else {
        height = alpineHeight(gridWorld(id.xy, grid), shape);
    }
    let index = gridIndex(id.xy, grid.size);
    baseHeight[index] = height;
    heightFixed[index] = i32(round(height * FIXED_SCALE));
}

@compute @workgroup_size(8, 8)
fn generateCoarse(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= grid.size || id.y >= grid.size) {
        return;
    }
    baseHeight[gridIndex(id.xy, grid.size)] = alpineHeight(gridWorld(id.xy, grid), shape);
}

@compute @workgroup_size(8, 8)
fn generateFar(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= grid.size || id.y >= grid.size) {
        return;
    }
    let world = gridWorld(id.xy, grid);
    let height = alpineHeight(world, shape) + carvingAt(world);
    textureStore(farHeight, id.xy, vec4f(height, 0.0, 0.0, 0.0));
}
