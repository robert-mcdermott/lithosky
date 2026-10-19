// SPDX-License-Identifier: Apache-2.0
// GPU droplet hydraulic erosion after H. T. Beyer, "Implementation of a method for hydraulic
// erosion" (2015): sediment capacity grows with slope, speed and water.
// Each invocation runs one droplet. Heights and sediment are 16.16 fixed-point metres
// updated with atomics; concurrent droplets may read slightly stale heights, which is fine.

#include "common/constants.wgsl"
#include "common/hash.wgsl"

struct DropletParams {
    size: u32,
    batchSeed: u32,
    dropletCount: u32,
    lifetime: u32,
    stepCells: f32,
    radius: f32,
    inertia: f32,
    capacity: f32,
    minSlope: f32,
    erodeRate: f32,
    depositRate: f32,
    evaporation: f32,
    gravity: f32,
    cellSize: f32,
    maxSpeed: f32,
    flowWeight: f32,
}

@group(0) @binding(0) var<uniform> params: DropletParams;
@group(0) @binding(1) var<storage, read_write> heightFixed: array<atomic<i32>>;
@group(0) @binding(2) var<storage, read_write> sediment: array<atomic<i32>>;
@group(0) @binding(3) var<storage, read_write> flow: array<atomic<u32>>;

fn cellIndex(cell: vec2i) -> u32 {
    let clamped = clamp(cell, vec2i(0), vec2i(i32(params.size) - 1));
    return u32(clamped.y) * params.size + u32(clamped.x);
}

fn loadHeight(cell: vec2i) -> f32 {
    return f32(atomicLoad(&heightFixed[cellIndex(cell)])) * INV_FIXED_SCALE;
}

// Bilinear height in metres at a position in grid units.
fn sampleHeight(position: vec2f) -> f32 {
    let base = vec2i(floor(position));
    let f = position - floor(position);
    let h00 = loadHeight(base);
    let h10 = loadHeight(base + vec2i(1, 0));
    let h01 = loadHeight(base + vec2i(0, 1));
    let h11 = loadHeight(base + vec2i(1, 1));
    return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}

// Adds material in metres to a grid vertex and records it as loose sediment.
fn addMaterial(cell: vec2i, metres: f32) {
    let inside = all(cell >= vec2i(0)) && all(cell < vec2i(i32(params.size)));
    if (!inside) {
        return;
    }
    let index = u32(cell.y) * params.size + u32(cell.x);
    let amount = i32(round(metres * FIXED_SCALE));
    atomicAdd(&heightFixed[index], amount);
    atomicAdd(&sediment[index], amount);
}

fn depositAt(position: vec2f, metres: f32) {
    let base = vec2i(floor(position));
    let f = position - floor(position);
    addMaterial(base, metres * (1.0 - f.x) * (1.0 - f.y));
    addMaterial(base + vec2i(1, 0), metres * f.x * (1.0 - f.y));
    addMaterial(base + vec2i(0, 1), metres * (1.0 - f.x) * f.y);
    addMaterial(base + vec2i(1, 1), metres * f.x * f.y);
}

// Removes material over a cone-shaped brush so channels get width instead of pits.
fn erodeAround(position: vec2f, metres: f32) {
    let reach = i32(ceil(params.radius));
    let centre = vec2i(floor(position));
    var total = 0.0;
    for (var dy = -reach; dy <= reach; dy++) {
        for (var dx = -reach; dx <= reach; dx++) {
            let offset = vec2f(centre + vec2i(dx, dy)) - position;
            total += max(0.0, 1.0 - length(offset) / params.radius);
        }
    }
    if (total <= 0.0) {
        return;
    }
    for (var dy = -reach; dy <= reach; dy++) {
        for (var dx = -reach; dx <= reach; dx++) {
            let cell = centre + vec2i(dx, dy);
            let weight = max(0.0, 1.0 - length(vec2f(cell) - position) / params.radius);
            if (weight > 0.0) {
                addMaterial(cell, -metres * weight / total);
            }
        }
    }
}

fn slopeAt(position: vec2f, footprint: f32) -> vec2f {
    let half = 0.5 * footprint;
    let east = sampleHeight(position + vec2f(half, 0.0));
    let west = sampleHeight(position - vec2f(half, 0.0));
    let south = sampleHeight(position + vec2f(0.0, half));
    let north = sampleHeight(position - vec2f(0.0, half));
    return vec2f(east - west, south - north) / (footprint * params.cellSize);
}

@compute @workgroup_size(64)
fn erode(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= params.dropletCount) {
        return;
    }
    let random = pcg3d(vec3u(id.x, params.batchSeed, 0x2545F491u));
    let limit = f32(params.size) - 2.0;
    var position = vec2f(1.0) + unitFloat2(random.xy) * (limit - 1.0);
    var direction = vec2f(0.0);
    var speed = 1.0;
    var water = 1.0;
    var load = 0.0;
    let stepLength = params.stepCells * params.cellSize;

    for (var life = 0u; life < params.lifetime; life++) {
        let height = sampleHeight(position);
        let gradient = slopeAt(position, params.stepCells);
        direction = direction * params.inertia - gradient * (1.0 - params.inertia);
        let directionLength = length(direction);
        if (directionLength < 1e-6) {
            let angle = unitFloat(pcg2d(vec2u(id.x, life)).x) * TWO_PI;
            direction = vec2f(cos(angle), sin(angle));
        } else {
            direction = direction / directionLength;
        }
        let next = position + direction * params.stepCells;
        if (any(next < vec2f(1.0)) || any(next > vec2f(limit))) {
            break;
        }
        atomicAdd(&flow[cellIndex(vec2i(round(position)))], u32(water * params.flowWeight));

        let drop = height - sampleHeight(next);
        let slope = drop / stepLength;
        let capacity = max(slope, params.minSlope) * speed * water * params.capacity;
        if (drop < 0.0 || load > capacity) {
            var deposit = (load - capacity) * params.depositRate;
            if (drop < 0.0) {
                deposit = min(-drop, load);
            }
            load -= deposit;
            depositAt(position, deposit);
        } else {
            let erosion = min((capacity - load) * params.erodeRate, drop);
            erodeAround(position, erosion);
            load += erosion;
        }
        let energy = speed * speed + drop / params.cellSize * params.gravity;
        speed = min(sqrt(max(energy, 0.0)), params.maxSpeed);
        water *= 1.0 - params.evaporation;
        position = next;
    }
}
