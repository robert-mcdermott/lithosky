// SPDX-License-Identifier: Apache-2.0
// Direct heightfield ray tracing: a min/max pyramid skips empty space, then each level-0
// cell is intersected exactly as a bilinear patch. No triangles are built. With trees, a
// canopy pyramid (the ground or the crowns over it, whichever is higher) bounds the skips
// instead, and level-0 cells also test the trees growing in and around them (trees.wgsl).

#include "common/constants.wgsl"
#include "terrain/grid.wgsl"

const TRACE_MISS: f32 = -1.0;
const TRACE_EXHAUSTED: f32 = -2.0;

fn loadVertex(heights: texture_2d<f32>, cell: vec2i, size: u32) -> f32 {
    let last = vec2i(i32(size) - 1);
    return textureLoad(heights, clamp(cell, vec2i(0), last), 0).r;
}

fn bilinearHeight(heights: texture_2d<f32>, grid: FieldGrid, world: vec2f) -> f32 {
    let position = (world - grid.origin) / grid.spacing;
    let base = vec2i(floor(position));
    let f = position - floor(position);
    let h00 = loadVertex(heights, base, grid.size);
    let h10 = loadVertex(heights, base + vec2i(1, 0), grid.size);
    let h01 = loadVertex(heights, base + vec2i(0, 1), grid.size);
    let h11 = loadVertex(heights, base + vec2i(1, 1), grid.size);
    return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}

// Smallest root of a s^2 + b s + c = 0 within [0, limit], or TRACE_MISS. Assumes c > 0.
fn firstRoot(a: f32, b: f32, c: f32, limit: f32) -> f32 {
    if (abs(a) < 1e-12) {
        if (b >= 0.0) {
            return TRACE_MISS;
        }
        let s = -c / b;
        return select(TRACE_MISS, s, s <= limit);
    }
    let discriminant = b * b - 4.0 * a * c;
    if (discriminant < 0.0) {
        return TRACE_MISS;
    }
    let q = -0.5 * (b + select(-1.0, 1.0, b >= 0.0) * sqrt(discriminant));
    let r0 = q / a;
    let r1 = c / q;
    let near = min(r0, r1);
    let far = max(r0, r1);
    if (near >= 0.0 && near <= limit) {
        return near;
    }
    if (far >= 0.0 && far <= limit) {
        return far;
    }
    return TRACE_MISS;
}

// Exact hit with the bilinear patch over level-0 `cell`. `start` is the ray's grid position
// at the cell entry, `slope` its grid units per metre, `y0` its height there.
fn intersectPatch(heights: texture_2d<f32>, size: u32, cell: vec2i, start: vec2f, slope: vec2f,
                  y0: f32, dy: f32, limit: f32) -> f32 {
    let h00 = loadVertex(heights, cell, size);
    let h10 = loadVertex(heights, cell + vec2i(1, 0), size);
    let h01 = loadVertex(heights, cell + vec2i(0, 1), size);
    let h11 = loadVertex(heights, cell + vec2i(1, 1), size);
    let local = start - vec2f(cell);
    let ex = h10 - h00;
    let ez = h01 - h00;
    let twist = h00 - h10 - h01 + h11;
    let surface0 = h00 + ex * local.x + ez * local.y + twist * local.x * local.y;
    let surface1 = ex * slope.x + ez * slope.y + twist * (local.x * slope.y + local.y * slope.x);
    let surface2 = twist * slope.x * slope.y;
    let gap = y0 - surface0;
    if (gap <= 0.0) {
        return 0.0;
    }
    return firstRoot(-surface2, dy - surface1, gap, limit);
}

// First hit distance in [tStart, tEnd], TRACE_MISS, or TRACE_EXHAUSTED when out of steps.
// With `trees`, sets `treeHit` when the hit is a crown.
fn traceField(pyramid: texture_2d<f32>, canopy: texture_2d<f32>, heights: texture_2d<f32>,
              grid: FieldGrid, levels: u32, origin: vec3f, direction: vec3f, tStart: f32,
              tEnd: f32, maxSteps: u32, trees: bool) -> f32 {
    treeHit = false;
    treeBest = BIG;
    let gridOrigin = (origin.xz - grid.origin) / grid.spacing;
    let gridSlope = direction.xz / grid.spacing;
    let extent = f32(grid.size - 1u);
    let moving = abs(gridSlope) > vec2f(1e-9);
    let inverse = select(vec2f(0.0), 1.0 / gridSlope, moving);
    let nudge = select(vec2f(0.0), sign(gridSlope) * 1e-3, moving);

    // Clip to the grid footprint.
    var t0 = tStart;
    var t1 = tEnd;
    for (var axis = 0u; axis < 2u; axis++) {
        if (moving[axis]) {
            let ta = (0.0 - gridOrigin[axis]) * inverse[axis];
            let tb = (extent - gridOrigin[axis]) * inverse[axis];
            t0 = max(t0, min(ta, tb));
            t1 = min(t1, max(ta, tb));
        } else if (gridOrigin[axis] < 0.0 || gridOrigin[axis] > extent) {
            return TRACE_MISS;
        }
    }
    // Clip to the slab below the highest point.
    let top = levels - 1u;
    var highest = textureLoad(pyramid, vec2i(0), top).g;
    if (trees) {
        highest = textureLoad(canopy, vec2i(0), top).r;
    }
    if (direction.y > 0.0) {
        t1 = min(t1, (highest - origin.y) / direction.y);
    } else if (direction.y < 0.0 && origin.y > highest) {
        t0 = max(t0, (highest - origin.y) / direction.y);
    } else if (origin.y > highest) {
        return TRACE_MISS;
    }
    if (t0 >= t1) {
        return TRACE_MISS;
    }

    var t = t0;
    var level = min(top, 6u);
    for (var iteration = 0u; iteration < maxSteps; iteration++) {
        if (t >= t1) {
            if (treeBest <= t1) {
                treeHit = true;
                return treeBest;
            }
            return TRACE_MISS;
        }
        let cellSize = f32(1u << level);
        let position = gridOrigin + gridSlope * t;
        let cell = floor((position + nudge) / cellSize);
        let boundary = (cell + select(vec2f(0.0), vec2f(1.0), gridSlope > vec2f(0.0))) * cellSize;
        let crossing = select(vec2f(BIG), (boundary - gridOrigin) * inverse, moving);
        let tExit = min(min(crossing.x, crossing.y), t1);
        var ceiling: f32;
        if (trees) {
            ceiling = textureLoad(canopy, vec2i(cell), level).r;
        } else {
            ceiling = textureLoad(pyramid, vec2i(cell), level).g;
        }
        // A straight ray is lowest at one end of its span inside the cell.
        let rayLow = min(origin.y + direction.y * t, origin.y + direction.y * tExit);
        if (rayLow > ceiling) {
            t = tExit;
            level = min(level + 1u, top);
            continue;
        }
        if (level > 0u) {
            level -= 1u;
            continue;
        }
        var ground = ceiling;
        if (trees) {
            ground = textureLoad(pyramid, vec2i(cell), 0).g;
        }
        var hit = BIG;
        if (rayLow <= ground) {
            let y0 = origin.y + direction.y * t;
            let s = intersectPatch(heights, grid.size, vec2i(cell), position, gridSlope, y0, direction.y, tExit - t);
            if (s >= 0.0) {
                hit = t + s;
            }
        }
        let reaching = select(0u, canopyReach(ceiling), trees);
        if (reaching != 0u) {
            visitTrees(vec2i(cell), reaching, origin, direction, t0);
            if (treeBest < hit && (treeBest <= tExit || (anyHit && treeBest <= t1))) {
                treeHit = true;
                return treeBest;
            }
        }
        if (hit < BIG) {
            return hit;
        }
        t = tExit;
        level = min(1u, top);
    }
    return TRACE_EXHAUSTED;
}
