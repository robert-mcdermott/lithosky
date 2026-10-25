// SPDX-License-Identifier: Apache-2.0
// The forest bake, run when the terrain or the scene's surface changes:
//   plantTrees    decides each near cell's tree from the forest map and the surface, and
//                 packs it into the tree map (trees.wgsl)
//   bakeCanopy    for each cell, the higher of its ground and the highest point of any crown
//                 over it (a crown leaning in from a neighbour only counts as high as its
//                 shape stands over the cell's edge), carrying which of the 3 x 3 trees
//                 reach the cell (packCanopy in trees.wgsl)
//   reduceCanopy  each higher level takes the highest of 2 x 2 children
// Rays then only descend into the canopy where trees actually stand.

#include "trace/trees.wgsl"

@group(0) @binding(0) var<uniform> fields: Fields;
@group(0) @binding(1) var<uniform> surface: Surface;
@group(0) @binding(2) var nearHeight: texture_2d<f32>;
@group(0) @binding(3) var forestMap: texture_2d<f32>;
@group(0) @binding(4) var canopyOut: texture_storage_2d<r32float, write>;
@group(0) @binding(5) var sourceLevel: texture_2d<f32>;
@group(0) @binding(6) var treeOut: texture_storage_2d<r32uint, write>;
@group(0) @binding(7) var treeMap: texture_2d<u32>;
// The tracer's foliage noise (trees.wgsl); the bake never samples it.
@group(0) @binding(8) var detailNoise: texture_3d<f32>;
@group(0) @binding(9) var cloudSampler: sampler;

// The packed tree for `cell`, or 0 when nothing grows there.
fn growTree(cell: vec2i) -> u32 {
    let last = i32(fields.near.size) - 2;
    if (any(cell > vec2i(last))) {
        return 0u;
    }
    let land = textureLoad(forestMap, cell, 0);
    if (!forestPossible(land)) {
        return 0u;
    }
    let ground = textureLoad(nearHeight, cell, 0).r;
    let pick = treeRandom(cell, TREE_SALT);
    let density = forestDensity(land, ground, pick.w - 0.5);
    if (pick.x >= treeChance(density)) {
        return 0u;
    }
    let shape = treeRandom(cell, 0x51EDu);
    // Smaller where cover thins and towards the tree line; conifers take over near it.
    let treeLine = surface.limits.y;
    let altitude = 1.0 - smoothstep(treeLine - 900.0, treeLine + 150.0, ground);
    let height = mix(9.0, 24.0, shape.x) * (0.55 + 0.45 * density) * (0.45 + 0.55 * altitude);
    let coniferChance = mix(surface.strata.y, 1.0, smoothstep(treeLine - 700.0, treeLine - 150.0, ground));
    let base = bilinearHeight(nearHeight, fields.near, treeCentre(cell, pick)) - 0.3;
    return packTree(base, height, shape.z < coniferChance);
}

@compute @workgroup_size(8, 8)
fn plantTrees(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(treeOut);
    if (id.x >= size.x || id.y >= size.y) {
        return;
    }
    textureStore(treeOut, vec2i(id.xy), vec4u(growTree(vec2i(id.xy)), 0u, 0u, 0u));
}

fn groundHigh(cell: vec2i) -> f32 {
    let size = fields.near.size;
    let h00 = loadVertex(nearHeight, cell, size);
    let h10 = loadVertex(nearHeight, cell + vec2i(1, 0), size);
    let h01 = loadVertex(nearHeight, cell + vec2i(0, 1), size);
    let h11 = loadVertex(nearHeight, cell + vec2i(1, 1), size);
    return max(max(h00, h10), max(h01, h11));
}

@compute @workgroup_size(8, 8)
fn bakeCanopy(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(canopyOut);
    if (id.x >= size.x || id.y >= size.y) {
        return;
    }
    let cell = vec2i(id.xy);
    let ground = groundHigh(cell);
    let low = fields.near.origin + vec2f(cell) * fields.near.spacing;
    let high = low + vec2f(fields.near.spacing);
    var top = ground;
    var reaching = 0u;
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            let neighbour = cell + vec2i(dx, dy);
            let tree = plantedTree(neighbour, treeRandom(neighbour, TREE_SALT));
            if (tree.height <= 0.0) {
                continue;
            }
            // How far the crown's axis stands from the cell.
            let reach = length(tree.centre - clamp(tree.centre, low, high));
            if (reach >= tree.radius) {
                continue;
            }
            var crown: f32;
            if (tree.conifer) {
                crown = tree.base + tree.height - reach * (CONIFER_CROWN * tree.height / tree.radius);
            } else {
                let falloff = sqrt(1.0 - (reach / tree.radius) * (reach / tree.radius));
                crown = tree.base + (BROADLEAF_CENTRE + BROADLEAF_DEPTH * falloff) * tree.height;
            }
            top = max(top, crown + 0.05);
            reaching |= 1u << u32((dy + 1) * 3 + dx + 1);
        }
    }
    textureStore(canopyOut, cell, vec4f(packCanopy(top, reaching), 0.0, 0.0, 0.0));
}

@compute @workgroup_size(8, 8)
fn reduceCanopy(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(canopyOut);
    if (id.x >= size.x || id.y >= size.y) {
        return;
    }
    let child = vec2i(id.xy) * 2;
    let a = textureLoad(sourceLevel, child, 0).r;
    let b = textureLoad(sourceLevel, child + vec2i(1, 0), 0).r;
    let c = textureLoad(sourceLevel, child + vec2i(0, 1), 0).r;
    let d = textureLoad(sourceLevel, child + vec2i(1, 1), 0).r;
    textureStore(canopyOut, vec2i(id.xy), vec4f(max(max(a, b), max(c, d)), 0.0, 0.0, 0.0));
}
