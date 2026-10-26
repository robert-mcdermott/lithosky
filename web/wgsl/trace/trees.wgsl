// SPDX-License-Identifier: Apache-2.0
// Procedural plants on the near tile. Each level-0 cell may hold one tree or shrub. The
// forest bake (canopy.wgsl) plants them from the forest map and the scene's surface into
// the tree map, one texel per cell; a hash of the cell places the plant within it and sets
// its spread. A crown can lean over the eight cells around its own, so the traversal tests
// the plants the reach map lists for each cell and keeps the nearest crown hit until the
// ray reaches the cell it lies in. The canopy pyramid bounds the crowns and the grass, so
// rays only descend where something stands.
//   conifer    a cone from a short trunk to the tip
//   broadleaf  an ellipsoid crown on a trunk
//   shrub      a low, wide ellipsoid clump, traced while it spans a few pixels
// Grass is a thin layer over meadow ground near the camera (grass.wgsl).
// Including modules declare `fields`, `surface`, `treeMap`, `reachMap`, `detailNoise` and
// `cloudSampler`.

#include "common/constants.wgsl"
#include "common/hash.wgsl"
#include "terrain/forest.wgsl"
#include "trace/fields.wgsl"
#include "trace/surface_params.wgsl"
#include "trace/heightfield.wgsl"
#include "trace/grass.wgsl"

const KIND_NONE: u32 = 0u;
const KIND_BROADLEAF: u32 = 1u;
const KIND_CONIFER: u32 = 2u;
const KIND_SHRUB: u32 = 3u;

struct Tree {
    centre: vec2f,
    // Height of the foot, set slightly into the slope.
    base: f32,
    height: f32,
    radius: f32,
    kind: u32,
}

const NOWHERE: vec2i = vec2i(-1000000, -1000000);

// Nearest crown hit found by the current trace, and the cell of its plant.
var<private> treeBest: f32;
var<private> treeBestCell: vec2i;
// Set when a near-field trace returns a crown or grass hit rather than the ground.
var<private> treeHit: bool;
var<private> grassHit: bool;
// A plant traces ignore: the one being lit, whose own crown can't shade its sunlit side.
var<private> treeSkip: vec2i = NOWHERE;
// Cleared for rays whose result plants barely change: fog shadows and second-order light.
var<private> treesWanted: bool = true;
// Set for shadow rays, which can stop at any crown rather than the nearest.
var<private> anyHit: bool = false;
// The current ray's pixel footprint at distance t is x + y t metres. BIG keeps crowns solid
// and leaves out shrubs and grass.
var<private> rayFootprint: vec2f = vec2f(BIG, 0.0);

fn treesEnabled() -> bool {
    return fields.canopyReady != 0u && treesWanted;
}

fn footprintAt(t: f32) -> f32 {
    return rayFootprint.x + rayFootprint.y * max(t, 0.0);
}

// Forest cover (0..1) from the land's inputs (a forest map texel, see terrain/forest.wgsl),
// the ground height and the scene's tree line, moisture and biome. `jitter` (about ±0.5)
// makes clearing edges ragged. The materials paint it; on the near tile it sets each cell's
// chance of holding a tree.
fn forestDensity(land: vec4f, height: f32, jitter: f32) -> f32 {
    let treeLine = surface.limits.y;
    let moisture = surface.limits.z;
    let below = 1.0 - smoothstep(treeLine - 200.0, treeLine + 150.0, height + land.a * 350.0);
    let clearings = smoothstep(-0.15, 0.05, land.b + jitter * 0.15 + (moisture - 0.5) * 0.3);
    // In wet climates trees cling to steeper slopes.
    let slope = 1.0 - smoothstep(0.2 + 0.1 * moisture, 0.32 + 0.1 * moisture, land.r);
    return slope * below * clearings * land.g * surface.forest.w;
}

// A near cell's chance of holding a tree: stands close up well before cover is complete.
fn treeChance(density: f32) -> f32 {
    return smoothstep(0.0, 0.55, density);
}

// Below the snow line, with its own noise; snow covers shrubs and grass above it.
fn belowSnow(land: vec4f, height: f32) -> f32 {
    return 1.0 - smoothstep(surface.limits.x - 250.0, surface.limits.x + 50.0, height + land.a * 350.0);
}

// Shrub cover (0..1) where the forest leaves room: the biome's scrub in patches between the
// stands, densest in the belt around the tree line. Drier climates carry it far above the
// tree line. `forest` is the spot's tree cover (treeChance).
fn scrubDensity(land: vec4f, height: f32, forest: f32, jitter: f32) -> f32 {
    let treeLine = surface.limits.y;
    let moisture = surface.limits.z;
    let h = height + land.a * 350.0;
    let top = max(treeLine + 300.0, mix(treeLine + 650.0, surface.limits.x - 200.0, 1.0 - moisture));
    let range = 1.0 - smoothstep(top - 300.0, top, h);
    let belt = smoothstep(treeLine - 450.0, treeLine - 50.0, h);
    let slope = 1.0 - smoothstep(0.3, 0.45, land.r);
    let patches = smoothstep(-0.2, 0.2, jitter * 0.5 - land.b * 0.6);
    return surface.strata.z * slope * land.g * (1.0 - forest) * range * mix(0.35, 1.0, belt) * patches
        * belowSnow(land, height);
}

// A near cell's chance of holding a shrub, where no tree grows.
fn shrubChance(density: f32) -> f32 {
    return smoothstep(0.0, 0.6, density);
}

// Height (m) of the meadow grass: the biome's grass on gentle ground below the grass line,
// shorter where it is dry and under trees.
fn grassHeight(land: vec4f, height: f32, forest: f32) -> f32 {
    let grassLine = surface.limits.y + 550.0;
    let moisture = surface.limits.z;
    let gentle = 1.0 - smoothstep(0.12, 0.25, land.r);
    let below = 1.0 - smoothstep(grassLine - 200.0, grassLine + 200.0, height + land.a * 250.0);
    return surface.strata.w * gentle * below * (0.45 + 0.55 * moisture) * land.g * (1.0 - 0.85 * forest)
        * belowSnow(land, height);
}

// The widest crowns, at full spread.
const TREE_MAX_RADIUS: f32 = 4.8;
const SHRUB_MAX_RADIUS: f32 = 3.4;
const TREE_SALT: u32 = 0x9E37u;
const SHAPE_SALT: u32 = 0x51EDu;

fn treeRandom(cell: vec2i, salt: u32) -> vec4f {
    let bits = pcg4d(vec4u(bitcast<vec2u>(cell), salt, 0x7EEu));
    return vec4f(bits >> vec4u(8u)) * (1.0 / 16777216.0);
}

// Where the plant in `cell` would stand, before anything decides whether it grows.
fn treeCentre(cell: vec2i, pick: vec4f) -> vec2f {
    return fields.near.origin + (vec2f(cell) + 0.1 + 0.8 * pick.yz) * fields.near.spacing;
}

// Squared horizontal distance from the ray's line to `centre`.
fn rayGap2(centre: vec2f, origin: vec3f, direction: vec3f) -> f32 {
    let across = direction.xz;
    let reach = dot(across, across);
    var closest = 0.0;
    if (reach > 1e-8) {
        closest = dot(centre - origin.xz, across) / reach;
    }
    let gap = origin.xz + across * closest - centre;
    return dot(gap, gap);
}

// Spread (0..1) from the low bits of the cell's hash, so it doesn't follow the clearing jitter.
fn crownRadius(height: f32, kind: u32, pick: vec4f) -> f32 {
    let spread = 0.8 + 0.4 * fract(pick.w * 16.0);
    switch (kind) {
        case KIND_CONIFER: {
            return clamp(0.2 * height, 1.3, 3.4) * spread;
        }
        case KIND_SHRUB: {
            return clamp(1.3 * height, 0.8, 2.8) * spread;
        }
        default: {
            return clamp(0.32 * height, 1.8, 4.0) * spread;
        }
    }
}

// A tree map texel (rg32uint): the base height's float bits, then the kind in the low two
// bits and the height in centimetres above them.
fn packTree(base: f32, height: f32, kind: u32) -> vec2u {
    return vec2u(bitcast<u32>(base), kind | (u32(round(height * 100.0)) << 2u));
}

// A reach map texel (r32uint): bits 0-8 mark the trees and bits 9-17 the shrubs whose crowns
// reach the cell, bit (dy + 1) * 3 + dx + 1 for the plant at (dx, dy); bits 18-24 hold the
// cell's grass height in centimetres.
fn packReach(trees: u32, shrubs: u32, grass: f32) -> u32 {
    return trees | (shrubs << 9u) | (min(u32(round(grass * 100.0)), 127u) << 18u);
}

fn reachTrees(bits: u32) -> u32 {
    return bits & 0x1FFu;
}

fn reachShrubs(bits: u32) -> u32 {
    return (bits >> 9u) & 0x1FFu;
}

fn reachGrass(bits: u32) -> f32 {
    return f32((bits >> 18u) & 0x7Fu) * 0.01;
}

fn cellReach(cell: vec2i) -> u32 {
    let last = vec2i(i32(fields.near.size) - 1);
    return textureLoad(reachMap, clamp(cell, vec2i(0), last), 0).r;
}

// Grass heights at the corners of level-0 `cell` (h00, h10, h01, h11), taken from the cell
// and its +x, +z and diagonal neighbours; `reaching` is the cell's own reach texel.
fn cellGrass(cell: vec2i, reaching: u32) -> vec4f {
    return vec4f(
        reachGrass(reaching),
        reachGrass(cellReach(cell + vec2i(1, 0))),
        reachGrass(cellReach(cell + vec2i(0, 1))),
        reachGrass(cellReach(cell + vec2i(1, 1))),
    );
}

// The plant in near cell `cell`; kind KIND_NONE when there is none.
fn plantedTree(cell: vec2i, pick: vec4f) -> Tree {
    var tree: Tree;
    tree.height = 0.0;
    tree.kind = KIND_NONE;
    if (any(cell < vec2i(0)) || any(cell >= vec2i(i32(fields.near.size)))) {
        return tree;
    }
    let bits = textureLoad(treeMap, cell, 0).rg;
    tree.base = bitcast<f32>(bits.x);
    tree.kind = bits.y & 3u;
    tree.height = f32(bits.y >> 2u) * 0.01;
    tree.centre = treeCentre(cell, pick);
    tree.radius = crownRadius(tree.height, tree.kind, pick);
    return tree;
}

fn treeAt(cell: vec2i) -> Tree {
    return plantedTree(cell, treeRandom(cell, TREE_SALT));
}

// Conifer crowns run from 15% of the height to the tip. Ellipsoid crowns are given as
// (centre, vertical semi-axis) in fractions of the height: broadleaf crowns sit on a trunk,
// shrubs rest on the ground. Trunks reach into the crown.
const CONIFER_CROWN: f32 = 0.85;
const BROADLEAF_SHAPE: vec2f = vec2f(0.58, 0.4);
const SHRUB_SHAPE: vec2f = vec2f(0.5, 0.5);
const TRUNK_TOP: f32 = 0.3;

fn ellipsoidShape(tree: Tree) -> vec2f {
    return select(BROADLEAF_SHAPE, SHRUB_SHAPE, tree.kind == KIND_SHRUB);
}

// Height of the crown's lowest point above the base, as a fraction of the height.
fn crownBottom(tree: Tree) -> f32 {
    if (tree.kind == KIND_CONIFER) {
        return 1.0 - CONIFER_CROWN;
    }
    let shape = ellipsoidShape(tree);
    return shape.x - shape.y;
}

// A crown is porous once a pixel covers less than this share of its radius: rays march
// into it through clumps of foliage and the gaps between them (foliageAt). Smaller crowns,
// and trunks thinner than a pixel, stay solid or are skipped. Shrubs whose radius is under
// about a pixel are left to the ground's painted scrub.
const POROUS_CROWN: f32 = 0.25;
const SHRUB_FOOTPRINT: f32 = 0.8;
const CROWN_STEPS: u32 = 6u;
// Clumps about a metre across: the cloud detail noise tiles every 4 m.
const FOLIAGE_TILE: f32 = 4.0;

fn trunkRadius(tree: Tree) -> f32 {
    if (tree.kind == KIND_SHRUB) {
        return 0.0;
    }
    return clamp(0.018 * tree.height, 0.15, 0.4);
}

// How deep `p` lies in the crown: 0 on its surface, 1 on its axis.
fn crownDepth(tree: Tree, p: vec3f) -> f32 {
    if (tree.kind == KIND_CONIFER) {
        let below = tree.base + tree.height - p.y;
        let radius = max(below * tree.radius / (CONIFER_CROWN * tree.height), 0.01);
        return saturate(1.0 - length(p.xz - tree.centre) / radius);
    }
    let shape = ellipsoidShape(tree);
    let squash = tree.radius / (shape.y * tree.height);
    let q = (p - vec3f(tree.centre.x, tree.base + shape.x * tree.height, tree.centre.y)) * vec3f(1.0, squash, 1.0);
    return saturate(1.0 - length(q) / tree.radius);
}

// Foliage at `p`: clumps from the cloud detail noise, denser towards the crown's axis.
// Shrub twigs clump at under a third of the size.
fn foliageAt(tree: Tree, p: vec3f) -> bool {
    let tile = select(FOLIAGE_TILE, FOLIAGE_TILE * 0.3, tree.kind == KIND_SHRUB);
    let detail = textureSampleLevel(detailNoise, cloudSampler, p / tile, 0.0);
    let clump = detail.g * 0.7 + detail.b * 0.3;
    return clump > mix(0.55, 0.28, crownDepth(tree, p));
}

// Entry and exit distances of the ray through the crown's shape (relative to `closest`), or
// an empty span. `o` is the ray's point of closest approach relative to the conifer's tip or
// the ellipsoid's centre.
fn crownSpan(tree: Tree, o: vec3f, direction: vec3f) -> vec2f {
    var span = vec2f(BIG, -BIG);
    if (tree.kind == KIND_CONIFER) {
        let crown = CONIFER_CROWN * tree.height;
        let k = tree.radius / crown;
        let k2 = k * k;
        let a = dot(direction.xz, direction.xz) - k2 * direction.y * direction.y;
        let b = 2.0 * (dot(o.xz, direction.xz) - k2 * o.y * direction.y);
        let c = dot(o.xz, o.xz) - k2 * o.y * o.y;
        let discriminant = b * b - 4.0 * a * c;
        if (discriminant >= 0.0 && abs(a) > 1e-9) {
            let root = sqrt(discriminant);
            for (var i = 0u; i < 2u; i++) {
                let s = (-b + select(root, -root, i == 0u)) / (2.0 * a);
                let y = o.y + s * direction.y;
                if (y <= 0.0 && y >= -crown) {
                    span = vec2f(min(span.x, s), max(span.y, s));
                }
            }
        }
        // The flat underside.
        if (abs(direction.y) > 1e-6) {
            let s = (-crown - o.y) / direction.y;
            let q = o.xz + direction.xz * s;
            if (dot(q, q) <= tree.radius * tree.radius) {
                span = vec2f(min(span.x, s), max(span.y, s));
            }
        }
        return span;
    }
    let squash = tree.radius / (ellipsoidShape(tree).y * tree.height);
    let q = o * vec3f(1.0, squash, 1.0);
    let d = direction * vec3f(1.0, squash, 1.0);
    let a = dot(d, d);
    let b = 2.0 * dot(q, d);
    let c = dot(q, q) - tree.radius * tree.radius;
    let discriminant = b * b - 4.0 * a * c;
    if (discriminant >= 0.0) {
        let root = sqrt(discriminant);
        span = vec2f(-b - root, -b + root) / (2.0 * a);
    }
    return span;
}

// Nearest hit on the crown, or the trunk when it is wide enough to see, at or beyond
// `tMin`; TRACE_MISS when the ray passes.
fn intersectTree(tree: Tree, origin: vec3f, direction: vec3f, tMin: f32) -> f32 {
    // Reject rays that pass outside the crown's radius, then solve from the point of closest
    // approach so the quadratics stay small.
    let across = direction.xz;
    let reach = dot(across, across);
    var closest = 0.0;
    if (reach > 1e-8) {
        closest = dot(tree.centre - origin.xz, across) / reach;
    }
    let gap = origin.xz + across * closest - tree.centre;
    let r2 = tree.radius * tree.radius;
    let miss2 = dot(gap, gap);
    if (miss2 > r2) {
        return TRACE_MISS;
    }
    let footprint = footprintAt(closest);
    let trunk = trunkRadius(tree);
    let trunked = footprint < trunk * 2.0;
    // Rays that cross the crown's cylinder wholly above or below it miss.
    if (reach > 1e-8) {
        let half = sqrt((r2 - miss2) / reach);
        let y0 = origin.y + direction.y * (closest - half);
        let y1 = origin.y + direction.y * (closest + half);
        let bottom = tree.base + select(crownBottom(tree) * tree.height, 0.0, trunked);
        if (min(y0, y1) > tree.base + tree.height || max(y0, y1) < bottom) {
            return TRACE_MISS;
        }
    }
    let start = origin + direction * closest;
    var o = start - vec3f(tree.centre.x, tree.base + tree.height, tree.centre.y);
    if (tree.kind != KIND_CONIFER) {
        o = start - vec3f(tree.centre.x, tree.base + ellipsoidShape(tree).x * tree.height, tree.centre.y);
    }
    let span = crownSpan(tree, o, direction) + closest;
    var best = BIG;
    if (trunked && miss2 < trunk * trunk && reach > 1e-8) {
        let s = closest - sqrt((trunk * trunk - miss2) / reach);
        let y = origin.y + direction.y * s;
        if (s >= tMin && y >= tree.base && y <= tree.base + TRUNK_TOP * tree.height) {
            best = s;
        }
    }
    if (span.y < tMin || span.x >= best) {
        return select(TRACE_MISS, best, best < BIG);
    }
    let entry = max(span.x, tMin);
    if (footprint > tree.radius * POROUS_CROWN) {
        return entry;
    }
    let exit = min(span.y, best);
    let step = (exit - entry) / f32(CROWN_STEPS);
    for (var i = 0u; i < CROWN_STEPS; i++) {
        let t = entry + step * (f32(i) + 0.5);
        if (foliageAt(tree, origin + direction * t)) {
            return t;
        }
    }
    return select(TRACE_MISS, best, best < BIG);
}

fn testTree(cell: vec2i, origin: vec3f, direction: vec3f, tMin: f32, shrub: bool) {
    if (all(cell == treeSkip)) {
        return;
    }
    // The hash alone places the plant: rays that pass wide of it skip the tree map.
    let pick = treeRandom(cell, TREE_SALT);
    let centre = treeCentre(cell, pick);
    let widest = select(TREE_MAX_RADIUS, SHRUB_MAX_RADIUS, shrub);
    if (rayGap2(centre, origin, direction) > widest * widest) {
        return;
    }
    let tree = plantedTree(cell, pick);
    if (tree.kind == KIND_NONE) {
        return;
    }
    if (shrub) {
        // Each shrub hands over to the painted scrub at its own distance, so there's no seam.
        let along = dot(centre - origin.xz, direction.xz) / max(dot(direction.xz, direction.xz), 1e-8);
        let handover = tree.radius * SHRUB_FOOTPRINT * (0.6 + 0.8 * fract(pick.w * 37.0));
        if (footprintAt(along) > handover) {
            return;
        }
    }
    let t = intersectTree(tree, origin, direction, tMin);
    if (t >= 0.0 && t < treeBest) {
        treeBest = t;
        treeBestCell = cell;
    }
}

// Tests the plants the reach map lists for level-0 `cell`; shrubs only while the ray's
// pixels are small enough for any of them.
fn visitTrees(cell: vec2i, reaching: u32, origin: vec3f, direction: vec3f, tMin: f32, tCell: f32) {
    var trees = reachTrees(reaching);
    while (trees != 0u) {
        let index = firstTrailingBit(trees);
        trees &= trees - 1u;
        testTree(cell + vec2i(i32(index % 3u) - 1, i32(index / 3u) - 1), origin, direction, tMin, false);
    }
    if (footprintAt(tCell) > SHRUB_MAX_RADIUS * SHRUB_FOOTPRINT * 1.4) {
        return;
    }
    var shrubs = reachShrubs(reaching);
    while (shrubs != 0u) {
        let index = firstTrailingBit(shrubs);
        shrubs &= shrubs - 1u;
        testTree(cell + vec2i(i32(index % 3u) - 1, i32(index / 3u) - 1), origin, direction, tMin, true);
    }
}
