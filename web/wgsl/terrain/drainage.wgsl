// SPDX-License-Identifier: Apache-2.0
// Stream-power drainage on a coarse height grid. Each iteration:
//   fill        Planchon-Darboux depression filling, so every cell drains to the border
//   share       how much of each cell's drainage area leaves toward each lower neighbour
//   accumulate  multiple-flow-direction drainage area (gather form, one hop per iteration)
//   incise      semi-implicit stream-power incision: dh/dt = -K A^m S, toward the receiver
//   relax       talus relaxation so incised valley walls stay below a critical slope
// Drainage area converges over iterations while the surface evolves, as in GPU stream-power
// terrain methods. Filled cells (lakes) route water but are not incised.
// Algorithm references: Planchon and Darboux, "A fast, simple and versatile algorithm to fill
// the depressions of digital elevation models", Catena 46, 2001; Braun and Willett, "A very
// efficient O(n), implicit and parallel method to solve the stream power equation", 2013.

const BIG_HEIGHT: f32 = 1.0e9;

struct DrainageParams {
    size: u32,
    cellSize: f32,
    fillSlope: f32,
    flowExponent: f32,
    incision: f32,
    areaExponent: f32,
    talusSlope: f32,
    talusRate: f32,
}

@group(0) @binding(0) var<uniform> params: DrainageParams;
@group(0) @binding(1) var<storage, read> heightIn: array<f32>;
@group(0) @binding(2) var<storage, read> filledIn: array<f32>;
@group(0) @binding(3) var<storage, read> areaIn: array<f32>;
@group(0) @binding(4) var<storage, read> shareIn: array<f32>;
@group(0) @binding(5) var<storage, read_write> heightOut: array<f32>;
@group(0) @binding(6) var<storage, read_write> filledOut: array<f32>;
@group(0) @binding(7) var<storage, read_write> areaOut: array<f32>;
@group(0) @binding(8) var<storage, read_write> shareOut: array<f32>;

const NEIGHBOURS = array<vec2i, 8>(
    vec2i(-1, -1), vec2i(0, -1), vec2i(1, -1), vec2i(-1, 0),
    vec2i(1, 0), vec2i(-1, 1), vec2i(0, 1), vec2i(1, 1),
);

const DISTANCES = array<f32, 8>(
    1.41421356, 1.0, 1.41421356, 1.0,
    1.0, 1.41421356, 1.0, 1.41421356,
);

fn cellIndex(cell: vec2i) -> u32 {
    return u32(cell.y) * params.size + u32(cell.x);
}

fn inside(cell: vec2i) -> bool {
    return all(cell >= vec2i(0)) && all(cell < vec2i(i32(params.size)));
}

fn onBorder(cell: vec2i) -> bool {
    let last = i32(params.size) - 1;
    return cell.x == 0 || cell.y == 0 || cell.x == last || cell.y == last;
}

// Starts a drainage solve: borders hold their height, the interior starts "full".
@compute @workgroup_size(8, 8)
fn begin(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= params.size || id.y >= params.size) {
        return;
    }
    let cell = vec2i(id.xy);
    let index = cellIndex(cell);
    filledOut[index] = select(BIG_HEIGHT, heightIn[index], onBorder(cell));
    areaOut[index] = 1.0;
}

// One Planchon-Darboux sweep: filled = max(height, lowest neighbour + a small slope).
@compute @workgroup_size(8, 8)
fn fill(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= params.size || id.y >= params.size) {
        return;
    }
    let cell = vec2i(id.xy);
    let index = cellIndex(cell);
    let height = heightIn[index];
    if (onBorder(cell)) {
        filledOut[index] = height;
        return;
    }
    var lowest = BIG_HEIGHT;
    for (var n = 0u; n < 8u; n++) {
        let neighbour = cell + NEIGHBOURS[n];
        lowest = min(lowest, filledIn[cellIndex(neighbour)] + params.fillSlope * DISTANCES[n]);
    }
    filledOut[index] = max(height, min(lowest, filledIn[index]));
}

fn flowWeight(drop: f32, distance: f32) -> f32 {
    return pow(max(drop, 0.0) / distance, params.flowExponent);
}

// Each cell's area divided by the total weight of its downhill neighbours.
@compute @workgroup_size(8, 8)
fn share(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= params.size || id.y >= params.size) {
        return;
    }
    let cell = vec2i(id.xy);
    let index = cellIndex(cell);
    let level = filledIn[index];
    var total = 0.0;
    for (var n = 0u; n < 8u; n++) {
        let neighbour = cell + NEIGHBOURS[n];
        if (inside(neighbour)) {
            total += flowWeight(level - filledIn[cellIndex(neighbour)], DISTANCES[n]);
        }
    }
    shareOut[index] = select(0.0, areaIn[index] / total, total > 0.0);
}

// Area = the cell itself plus every uphill neighbour's share that flows into it.
@compute @workgroup_size(8, 8)
fn accumulate(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= params.size || id.y >= params.size) {
        return;
    }
    let cell = vec2i(id.xy);
    let index = cellIndex(cell);
    let level = filledIn[index];
    var area = 1.0;
    for (var n = 0u; n < 8u; n++) {
        let neighbour = cell + NEIGHBOURS[n];
        if (inside(neighbour)) {
            let neighbourIndex = cellIndex(neighbour);
            area += shareIn[neighbourIndex] * flowWeight(filledIn[neighbourIndex] - level, DISTANCES[n]);
        }
    }
    areaOut[index] = area;
}

// Semi-implicit incision toward the steepest receiver on the filled surface.
@compute @workgroup_size(8, 8)
fn incise(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= params.size || id.y >= params.size) {
        return;
    }
    let cell = vec2i(id.xy);
    let index = cellIndex(cell);
    let height = heightIn[index];
    let level = filledIn[index];
    // Borders are base level; filled depressions are lakes and do not incise.
    if (onBorder(cell) || level > height + 0.01) {
        heightOut[index] = height;
        return;
    }
    var steepest = 0.0;
    var receiver = index;
    var distance = 1.0;
    for (var n = 0u; n < 8u; n++) {
        let neighbourIndex = cellIndex(cell + NEIGHBOURS[n]);
        let slope = (level - filledIn[neighbourIndex]) / DISTANCES[n];
        if (slope > steepest) {
            steepest = slope;
            receiver = neighbourIndex;
            distance = DISTANCES[n];
        }
    }
    if (receiver == index) {
        heightOut[index] = height;
        return;
    }
    let base = min(heightIn[receiver], height);
    let factor = params.incision * pow(areaIn[index], params.areaExponent) / distance;
    heightOut[index] = (height + factor * base) / (1.0 + factor);
}

// Talus relaxation in gather form: race-free and mass-conserving.
@compute @workgroup_size(8, 8)
fn relax(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= params.size || id.y >= params.size) {
        return;
    }
    let cell = vec2i(id.xy);
    let index = cellIndex(cell);
    let height = heightIn[index];
    var change = 0.0;
    for (var n = 0u; n < 8u; n++) {
        let neighbour = cell + NEIGHBOURS[n];
        if (!inside(neighbour)) {
            continue;
        }
        let limit = params.talusSlope * params.cellSize * DISTANCES[n];
        let drop = height - heightIn[cellIndex(neighbour)];
        change += max(-drop - limit, 0.0) - max(drop - limit, 0.0);
    }
    heightOut[index] = height + params.talusRate * change;
}
