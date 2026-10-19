// SPDX-License-Identifier: Apache-2.0
// Thermal (talus) erosion in gather form. Every cell moves material toward lower neighbours
// when the drop exceeds a talus angle. Loose sediment slips at the scree angle; bare rock
// only fails above a much steeper angle, so cliffs survive and feed scree fans below them.
// Each cell reads snapshots and writes only itself, so the pass is race-free and conserves mass.

#include "common/constants.wgsl"

struct ThermalParams {
    size: u32,
    cellSize: f32,
    rate: f32,
    screeTangent: f32,
    rockTangent: f32,
    looseDepth: f32,
    padding0: f32,
    padding1: f32,
}

@group(0) @binding(0) var<uniform> params: ThermalParams;
@group(0) @binding(1) var<storage, read> heightSnapshot: array<i32>;
@group(0) @binding(2) var<storage, read> sedimentSnapshot: array<i32>;
@group(0) @binding(3) var<storage, read_write> heightFixed: array<i32>;
@group(0) @binding(4) var<storage, read_write> sediment: array<i32>;

const NEIGHBOURS = array<vec2i, 8>(
    vec2i(-1, -1), vec2i(0, -1), vec2i(1, -1), vec2i(-1, 0),
    vec2i(1, 0), vec2i(-1, 1), vec2i(0, 1), vec2i(1, 1),
);

// Material in metres that slides from a cell to a neighbour `drop` metres lower.
fn slide(drop: f32, separation: f32, looseness: f32) -> f32 {
    let rock = max(drop - params.rockTangent * separation, 0.0);
    let scree = max(drop - params.screeTangent * separation, 0.0) * looseness;
    return params.rate * max(rock, scree);
}

fn mobility(sedimentFixed: i32) -> f32 {
    return clamp(f32(sedimentFixed) * INV_FIXED_SCALE / params.looseDepth, 0.0, 1.0);
}

@compute @workgroup_size(8, 8)
fn relax(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= params.size || id.y >= params.size) {
        return;
    }
    let cell = vec2i(id.xy);
    let last = i32(params.size) - 1;
    let index = id.y * params.size + id.x;
    let height = f32(heightSnapshot[index]) * INV_FIXED_SCALE;
    let ownMobility = mobility(sedimentSnapshot[index]);
    var change = 0.0;
    for (var n = 0u; n < 8u; n++) {
        let neighbour = clamp(cell + NEIGHBOURS[n], vec2i(0), vec2i(last));
        let neighbourIndex = u32(neighbour.y) * params.size + u32(neighbour.x);
        let neighbourHeight = f32(heightSnapshot[neighbourIndex]) * INV_FIXED_SCALE;
        let separation = params.cellSize * length(vec2f(NEIGHBOURS[n]));
        let drop = height - neighbourHeight;
        let outgoing = slide(drop, separation, ownMobility);
        let incoming = slide(-drop, separation, mobility(sedimentSnapshot[neighbourIndex]));
        change += incoming - outgoing;
    }
    let amount = i32(round(change * FIXED_SCALE));
    heightFixed[index] = heightSnapshot[index] + amount;
    sediment[index] = sedimentSnapshot[index] + amount;
}
