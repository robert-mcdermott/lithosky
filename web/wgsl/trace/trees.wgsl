// SPDX-License-Identifier: Apache-2.0
// Procedural trees on the near tile. Each level-0 cell may hold one tree. The forest bake
// (canopy.wgsl) plants them from the forest map and the scene's surface into the tree map,
// one packed texel per cell; a hash of the cell places the tree within it and sets its
// spread. A crown can lean over the eight cells around its own, so the traversal tests a
// cell's 3 x 3 neighbourhood (the canopy pyramid records which of them reach each cell) and
// keeps the nearest crown hit until the ray reaches the cell it lies in. The canopy pyramid
// also bounds the crowns, so rays only descend where trees stand.
//   conifer    a cone from a short trunk to the tip
//   broadleaf  an ellipsoid crown
// Including modules declare `fields`, `surface`, `treeMap`, `detailNoise` and `cloudSampler`.

#include "common/constants.wgsl"
#include "common/hash.wgsl"
#include "terrain/forest.wgsl"
#include "trace/fields.wgsl"
#include "trace/surface_params.wgsl"
#include "trace/heightfield.wgsl"

struct Tree {
    centre: vec2f,
    // Height of the trunk's foot, set slightly into the slope.
    base: f32,
    height: f32,
    radius: f32,
    conifer: bool,
}

const NOWHERE: vec2i = vec2i(-1000000, -1000000);

// Nearest crown hit found by the current trace, and the cell of its tree.
var<private> treeBest: f32;
var<private> treeBestCell: vec2i;
// Set when a near-field trace returns a crown hit rather than the ground.
var<private> treeHit: bool;
// A tree traces ignore: the one being lit, whose own crown can't shade its sunlit side.
var<private> treeSkip: vec2i = NOWHERE;
// Cleared for rays whose result trees barely change: fog shadows and second-order light.
var<private> treesWanted: bool = true;
// Set for shadow rays, which can stop at any crown rather than the nearest.
var<private> anyHit: bool = false;

fn treesEnabled() -> bool {
    return fields.canopyReady != 0u && surface.forest.w > 0.0 && treesWanted;
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

// The widest crown (broadleaf, at full spread).
const TREE_MAX_RADIUS: f32 = 4.8;
const TREE_SALT: u32 = 0x9E37u;

fn treeRandom(cell: vec2i, salt: u32) -> vec4f {
    let bits = pcg4d(vec4u(bitcast<vec2u>(cell), salt, 0x7EEu));
    return vec4f(bits >> vec4u(8u)) * (1.0 / 16777216.0);
}

// Where the tree in `cell` would stand, before anything decides whether it grows.
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
fn crownRadius(height: f32, conifer: bool, pick: vec4f) -> f32 {
    let spread = 0.8 + 0.4 * fract(pick.w * 16.0);
    if (conifer) {
        return clamp(0.2 * height, 1.3, 3.4) * spread;
    }
    return clamp(0.32 * height, 1.8, 4.0) * spread;
}

// A tree map texel holds the base height's float bits with the low 9 bits replaced by the
// height in decimetres (8 bits; 0 means no tree) and a conifer flag. Dropping those bits
// lowers the base by under 0.13 m below 4 km.
fn packTree(base: f32, height: f32, conifer: bool) -> u32 {
    let code = clamp(u32(round(height * 10.0)), 1u, 255u);
    return (bitcast<u32>(base) & ~0x1FFu) | (code << 1u) | select(0u, 1u, conifer);
}

// A level-0 canopy texel holds the bound's float bits with the low 9 bits replaced by which
// of the 3 x 3 trees reach the cell: bit (dy + 1) * 3 + dx + 1 for the tree at (dx, dy).
// The bound is rounded up so it stays above everything in the cell.
fn packCanopy(top: f32, reaching: u32) -> f32 {
    var bits = (bitcast<u32>(top) & ~0x1FFu) | reaching;
    if (bitcast<f32>(bits) < top) {
        bits += 0x200u;
    }
    return bitcast<f32>(bits);
}

fn canopyReach(texel: f32) -> u32 {
    return bitcast<u32>(texel) & 0x1FFu;
}

// The tree planted in near cell `cell`; height 0 when there is none.
fn plantedTree(cell: vec2i, pick: vec4f) -> Tree {
    var tree: Tree;
    tree.height = 0.0;
    if (any(cell < vec2i(0)) || any(cell >= vec2i(i32(fields.near.size)))) {
        return tree;
    }
    let bits = textureLoad(treeMap, cell, 0).r;
    tree.height = f32((bits >> 1u) & 0xFFu) * 0.1;
    tree.base = bitcast<f32>(bits & ~0x1FFu);
    tree.conifer = (bits & 1u) != 0u;
    tree.centre = treeCentre(cell, pick);
    tree.radius = crownRadius(tree.height, tree.conifer, pick);
    return tree;
}

fn treeAt(cell: vec2i) -> Tree {
    return plantedTree(cell, treeRandom(cell, TREE_SALT));
}

// Conifer crowns run from 15% of the height to the tip; broadleaf crowns are ellipsoids
// centred at 58% with a vertical semi-axis of 40%. Trunks reach into the crown.
const CONIFER_CROWN: f32 = 0.85;
const BROADLEAF_CENTRE: f32 = 0.58;
const BROADLEAF_DEPTH: f32 = 0.4;
const TRUNK_TOP: f32 = 0.3;

// A crown is porous once a pixel covers less than this share of its radius: rays march
// into it through clumps of foliage and the gaps between them (foliageAt). Smaller crowns,
// and trunks thinner than a pixel, stay solid or are skipped.
const POROUS_CROWN: f32 = 0.25;
const CROWN_STEPS: u32 = 6u;
// Clumps about a metre across: the cloud detail noise tiles every 4 m.
const FOLIAGE_TILE: f32 = 4.0;

// The current ray's pixel footprint at distance t is x + y t metres; BIG keeps crowns solid.
var<private> rayFootprint: vec2f = vec2f(BIG, 0.0);

fn trunkRadius(tree: Tree) -> f32 {
    return clamp(0.018 * tree.height, 0.15, 0.4);
}

// How deep `p` lies in the crown: 0 on its surface, 1 on its axis.
fn crownDepth(tree: Tree, p: vec3f) -> f32 {
    if (tree.conifer) {
        let below = tree.base + tree.height - p.y;
        let radius = max(below * tree.radius / (CONIFER_CROWN * tree.height), 0.01);
        return saturate(1.0 - length(p.xz - tree.centre) / radius);
    }
    let squash = tree.radius / (BROADLEAF_DEPTH * tree.height);
    let q = (p - vec3f(tree.centre.x, tree.base + BROADLEAF_CENTRE * tree.height, tree.centre.y)) * vec3f(1.0, squash, 1.0);
    return saturate(1.0 - length(q) / tree.radius);
}

// Foliage at `p`: clumps from the cloud detail noise, denser towards the crown's axis.
fn foliageAt(tree: Tree, p: vec3f) -> bool {
    let detail = textureSampleLevel(detailNoise, cloudSampler, p / FOLIAGE_TILE, 0.0);
    let clump = detail.g * 0.7 + detail.b * 0.3;
    return clump > mix(0.55, 0.28, crownDepth(tree, p));
}

// Entry and exit distances of the ray through the crown's shape (relative to `closest`), or
// an empty span.
fn crownSpan(tree: Tree, o: vec3f, direction: vec3f) -> vec2f {
    var span = vec2f(BIG, -BIG);
    if (tree.conifer) {
        let crown = CONIFER_CROWN * tree.height;
        let k = tree.radius / crown;
        let k2 = k * k;
        // `o` is relative to the tip here.
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
    // `o` is relative to the ellipsoid's centre here.
    let squash = tree.radius / (BROADLEAF_DEPTH * tree.height);
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
    let footprint = rayFootprint.x + rayFootprint.y * max(closest, 0.0);
    let trunk = trunkRadius(tree);
    let trunked = footprint < trunk * 2.0;
    // Rays that cross the crown's cylinder wholly above or below it miss.
    if (reach > 1e-8) {
        let half = sqrt((r2 - miss2) / reach);
        let y0 = origin.y + direction.y * (closest - half);
        let y1 = origin.y + direction.y * (closest + half);
        let bottom = tree.base + select(0.15 * tree.height, 0.0, trunked);
        if (min(y0, y1) > tree.base + tree.height || max(y0, y1) < bottom) {
            return TRACE_MISS;
        }
    }
    let start = origin + direction * closest;
    var o = start - vec3f(tree.centre.x, tree.base + tree.height, tree.centre.y);
    if (!tree.conifer) {
        o = start - vec3f(tree.centre.x, tree.base + BROADLEAF_CENTRE * tree.height, tree.centre.y);
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

fn testTree(cell: vec2i, origin: vec3f, direction: vec3f, tMin: f32) {
    if (all(cell == treeSkip)) {
        return;
    }
    // The hash alone places the tree: rays that pass wide of it skip the tree map.
    let pick = treeRandom(cell, TREE_SALT);
    if (rayGap2(treeCentre(cell, pick), origin, direction) > TREE_MAX_RADIUS * TREE_MAX_RADIUS) {
        return;
    }
    let tree = plantedTree(cell, pick);
    if (tree.height <= 0.0) {
        return;
    }
    let t = intersectTree(tree, origin, direction, tMin);
    if (t >= 0.0 && t < treeBest) {
        treeBest = t;
        treeBestCell = cell;
    }
}

// Tests the trees whose crowns reach level-0 `cell` (canopyReach).
fn visitTrees(cell: vec2i, reaching: u32, origin: vec3f, direction: vec3f, tMin: f32) {
    var bits = reaching;
    while (bits != 0u) {
        let index = firstTrailingBit(bits);
        bits &= bits - 1u;
        testTree(cell + vec2i(i32(index % 3u) - 1, i32(index / 3u) - 1), origin, direction, tMin);
    }
}
