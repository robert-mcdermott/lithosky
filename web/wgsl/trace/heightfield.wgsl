// SPDX-License-Identifier: Apache-2.0
// Direct heightfield ray tracing: a min/max pyramid skips empty space, then each level-0
// cell is intersected exactly as a bilinear patch. No triangles are built. With plants, a
// canopy pyramid (the ground or the crowns and grass over it, whichever is higher) bounds
// the skips instead, and level-0 cells also test the grass and the plants growing in and
// around them (trees.wgsl, grass.wgsl).

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

// The corner heights of level-0 `cell`'s patch: (h00, h10, h01, h11).
fn loadPatch(heights: texture_2d<f32>, size: u32, cell: vec2i) -> vec4f {
    return vec4f(
        loadVertex(heights, cell, size),
        loadVertex(heights, cell + vec2i(1, 0), size),
        loadVertex(heights, cell + vec2i(0, 1), size),
        loadVertex(heights, cell + vec2i(1, 1), size),
    );
}

// The patch's height at `local` (0..1 across the cell).
fn patchHeight(corners: vec4f, local: vec2f) -> f32 {
    return mix(mix(corners.x, corners.y, local.x), mix(corners.z, corners.w, local.x), local.y);
}

// Exact hit with a level-0 patch. `local` is the ray's position in the cell at its entry,
// `slope` its grid units per metre, `y0` its height there.
fn intersectPatch(corners: vec4f, local: vec2f, slope: vec2f, y0: f32, dy: f32, limit: f32) -> f32 {
    let h00 = corners.x;
    let h10 = corners.y;
    let h01 = corners.z;
    let h11 = corners.w;
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
// With `trees`, sets `treeHit` when the hit is a crown and `grassHit` when it is grass.
fn traceField(pyramid: texture_2d<f32>, canopy: texture_2d<f32>, heights: texture_2d<f32>,
              grid: FieldGrid, levels: u32, origin: vec3f, direction: vec3f, tStart: f32,
              tEnd: f32, maxSteps: u32, trees: bool) -> f32 {
    treeHit = false;
    grassHit = false;
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
        var reaching = 0u;
        var grass = vec4f(0.0);
        if (trees) {
            ground = textureLoad(pyramid, vec2i(cell), 0).g;
            // The canopy rises above the ground only where grass or a crown reaches the cell.
            if (ceiling > ground) {
                reaching = cellReach(vec2i(cell));
                if (footprintAt(t) < GRASS_FAR) {
                    grass = cellGrass(vec2i(cell), reaching);
                }
            }
        }
        let tallest = max(max(grass.x, grass.y), max(grass.z, grass.w));
        var hit = BIG;
        var grassy = false;
        if (rayLow <= ground + tallest) {
            let corners = loadPatch(heights, grid.size, vec2i(cell));
            if (rayLow <= ground) {
                let y0 = origin.y + direction.y * t;
                let s = intersectPatch(corners, position - cell, gridSlope, y0, direction.y, tExit - t);
                if (s >= 0.0) {
                    hit = t + s;
                }
            }
            if (tallest > 0.0) {
                let blade = marchGrass(origin, direction, t, min(hit, tExit), corners, grass, gridOrigin, gridSlope, cell);
                if (blade < hit) {
                    hit = blade;
                    grassy = true;
                }
            }
        }
        if ((reaching & 0x3FFFFu) != 0u) {
            visitTrees(vec2i(cell), reaching, origin, direction, t0, t);
            if (treeBest < hit && (treeBest <= tExit || (anyHit && treeBest <= t1))) {
                treeHit = true;
                return treeBest;
            }
        }
        if (hit < BIG) {
            grassHit = grassy;
            return hit;
        }
        t = tExit;
        level = min(1u, top);
    }
    return TRACE_EXHAUSTED;
}
