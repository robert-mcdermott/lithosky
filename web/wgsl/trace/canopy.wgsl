// SPDX-License-Identifier: Apache-2.0
// The forest bake, run when the terrain or the scene's surface changes:
//   plantTrees    decides each near cell's tree, or else its shrub, from the forest map, the
//                 surface and the vegetation paint, and writes it to the tree map (trees.wgsl)
//   bakeCanopy    for each cell, the reach map (which of the 3 x 3 trees and shrubs reach
//                 the cell, its grass height and its tree cover) and the canopy bound: the higher of the
//                 ground plus the grass over it and the highest point of any crown over it. A
//                 crown leaning in from a neighbour only counts as high as its shape stands
//                 over the cell's edge.
//   reduceCanopy  each higher level takes the highest of 2 x 2 children
// Rays then only descend into the canopy where something actually stands.

#include "trace/trees.wgsl"

@group(0) @binding(0) var<uniform> fields: Fields;
@group(0) @binding(1) var<uniform> surface: Surface;
@group(0) @binding(2) var nearHeight: texture_2d<f32>;
@group(0) @binding(3) var forestMap: texture_2d<f32>;
@group(0) @binding(4) var canopyOut: texture_storage_2d<r32float, write>;
@group(0) @binding(5) var sourceLevel: texture_2d<f32>;
@group(0) @binding(6) var treeOut: texture_storage_2d<rg32uint, write>;
@group(0) @binding(7) var treeMap: texture_2d<u32>;
// The tracer's foliage noise and reach map (trees.wgsl); the bake never reads them.
@group(0) @binding(8) var detailNoise: texture_3d<f32>;
@group(0) @binding(9) var cloudSampler: sampler;
@group(0) @binding(10) var reachOut: texture_storage_2d<r32uint, write>;
@group(0) @binding(11) var reachMap: texture_2d<u32>;
// The vegetation paint over the near tile (scene/paint.js), level / 15 per texel.
@group(0) @binding(12) var paintMap: texture_2d<f32>;

const PAINT_NEUTRAL: f32 = 8.0;

fn paintTexel(texel: vec2i) -> f32 {
    let last = vec2i(textureDimensions(paintMap)) - 1;
    return textureLoad(paintMap, clamp(texel, vec2i(0), last), 0).r;
}

// The paint at `world`: 0 leaves the land as it is, below 0 clears (to -1, nothing grows)
// and above 0 plants (to 1, full forest).
fn paintAt(world: vec2f) -> f32 {
    let extent = fields.near.spacing * f32(fields.near.size - 1u);
    let texel = (world - fields.near.origin) / extent * vec2f(textureDimensions(paintMap)) - 0.5;
    let base = vec2i(floor(texel));
    let f = texel - floor(texel);
    let top = mix(paintTexel(base), paintTexel(base + vec2i(1, 0)), f.x);
    let bottom = mix(paintTexel(base + vec2i(0, 1)), paintTexel(base + vec2i(1, 1)), f.x);
    let level = mix(top, bottom, f.y) * 15.0 - PAINT_NEUTRAL;
    return select(level / 7.0, level / PAINT_NEUTRAL, level < 0.0);
}

// The forest density and tree cover (treeChance) at a cell, with the paint applied: planting
// raises the density towards full wherever a tree can stand (off the water, cliffs and
// stream beds), clearing lowers the cover. `jitter` makes clearing edges ragged.
fn paintedForest(land: vec4f, ground: f32, paint: f32, jitter: f32) -> vec2f {
    var density = 0.0;
    if (forestPossible(land)) {
        density = forestDensity(land, ground, jitter);
    }
    if (paint > 0.0) {
        let room = land.g * (1.0 - smoothstep(0.35, 0.5, land.r)) * 0.9;
        density = mix(density, max(density, room), paint);
    }
    return vec2f(density, treeChance(density) * (1.0 + min(paint, 0.0)));
}

fn cellCentre(cell: vec2i) -> vec2f {
    return fields.near.origin + (vec2f(cell) + 0.5) * fields.near.spacing;
}

// The plant for `cell`, packed (zero when nothing grows there).
fn growTree(cell: vec2i) -> vec2u {
    let last = i32(fields.near.size) - 2;
    if (any(cell > vec2i(last))) {
        return vec2u(0u);
    }
    let land = textureLoad(forestMap, cell, 0);
    let ground = textureLoad(nearHeight, cell, 0).r;
    let pick = treeRandom(cell, TREE_SALT);
    let shape = treeRandom(cell, SHAPE_SALT);
    let centre = treeCentre(cell, pick);
    let paint = paintAt(centre);
    let painted = paintedForest(land, ground, paint, pick.w - 0.5);
    let density = painted.x;
    let forest = painted.y;
    if (pick.x < forest) {
        // Smaller where cover thins and towards the tree line; conifers take over near it.
        let treeLine = surface.limits.y;
        let altitude = 1.0 - smoothstep(treeLine - 900.0, treeLine + 150.0, ground);
        let height = mix(9.0, 24.0, shape.x) * (0.55 + 0.45 * density) * (0.45 + 0.55 * altitude) * surface.plants.x;
        let coniferChance = mix(surface.strata.y, 1.0, smoothstep(treeLine - 700.0, treeLine - 150.0, ground));
        let base = bilinearHeight(nearHeight, fields.near, centre) - 0.3;
        return packTree(base, height, select(KIND_BROADLEAF, KIND_CONIFER, shape.z < coniferChance));
    }
    let scrub = scrubDensity(land, ground, forest, pick.w - 0.5) * (1.0 + min(paint, 0.0));
    if (shape.y < shrubChance(scrub)) {
        let height = mix(0.5, 2.0, shape.x) * (0.65 + 0.35 * scrub) * surface.plants.x;
        let base = bilinearHeight(nearHeight, fields.near, centre) - 0.1;
        return packTree(base, height, KIND_SHRUB);
    }
    return vec2u(0u);
}

@compute @workgroup_size(8, 8)
fn plantTrees(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(treeOut);
    if (id.x >= size.x || id.y >= size.y) {
        return;
    }
    textureStore(treeOut, vec2i(id.xy), vec4u(growTree(vec2i(id.xy)), 0u, 0u));
}

fn groundHigh(cell: vec2i) -> f32 {
    let size = fields.near.size;
    let h00 = loadVertex(nearHeight, cell, size);
    let h10 = loadVertex(nearHeight, cell + vec2i(1, 0), size);
    let h01 = loadVertex(nearHeight, cell + vec2i(0, 1), size);
    let h11 = loadVertex(nearHeight, cell + vec2i(1, 1), size);
    return max(max(h00, h10), max(h01, h11));
}

// The tree cover on `cell` (with the paint), and its grass, thinned where the forest stands.
fn cellCover(cell: vec2i) -> vec2f {
    let land = textureLoad(forestMap, cell, 0);
    let ground = textureLoad(nearHeight, cell, 0).r;
    let forest = paintedForest(land, ground, paintAt(cellCentre(cell)), 0.0).y;
    let grass = grassHeight(land, ground, forest);
    return vec2f(forest, select(0.0, grass, grass >= 0.03));
}

fn plantGrass(cell: vec2i) -> f32 {
    return cellCover(cell).y;
}

@compute @workgroup_size(8, 8)
fn bakeCanopy(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(canopyOut);
    if (id.x >= size.x || id.y >= size.y) {
        return;
    }
    let cell = vec2i(id.xy);
    let ground = groundHigh(cell);
    let cover = cellCover(cell);
    let grass = cover.y;
    // The grass over the cell blends towards its +x, +z and diagonal neighbours' (grass.wgsl).
    let tallest = max(max(grass, plantGrass(cell + vec2i(1, 0))), max(plantGrass(cell + vec2i(0, 1)), plantGrass(cell + vec2i(1, 1))));
    let low = fields.near.origin + vec2f(cell) * fields.near.spacing;
    let high = low + vec2f(fields.near.spacing);
    var top = ground + tallest + select(0.0, 0.01, tallest > 0.0);
    var trees = 0u;
    var shrubs = 0u;
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            let neighbour = cell + vec2i(dx, dy);
            let tree = plantedTree(neighbour, treeRandom(neighbour, TREE_SALT));
            if (tree.kind == KIND_NONE) {
                continue;
            }
            // How far the crown's axis stands from the cell.
            let reach = length(tree.centre - clamp(tree.centre, low, high));
            if (reach >= tree.radius) {
                continue;
            }
            var crown: f32;
            if (tree.kind == KIND_CONIFER) {
                crown = tree.base + tree.height - reach * (CONIFER_CROWN * tree.height / tree.radius);
            } else {
                let shape = ellipsoidShape(tree);
                let falloff = sqrt(1.0 - (reach / tree.radius) * (reach / tree.radius));
                crown = tree.base + (shape.x + shape.y * falloff) * tree.height;
            }
            top = max(top, max(crown + 0.05, ground + 0.01));
            let bit = 1u << u32((dy + 1) * 3 + dx + 1);
            if (tree.kind == KIND_SHRUB) {
                shrubs |= bit;
            } else {
                trees |= bit;
            }
        }
    }
    textureStore(canopyOut, cell, vec4f(top, 0.0, 0.0, 0.0));
    textureStore(reachOut, cell, vec4u(packReach(trees, shrubs, grass, cover.x), 0u, 0u, 0u));
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
