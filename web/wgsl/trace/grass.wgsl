// SPDX-License-Identifier: Apache-2.0
// Meadow grass near the camera: a thin layer over the ground, shaped into tussocks with
// gaps between them. Its height runs bilinearly across each cell from the reach map's grass
// heights at the cell and its +x, +z and diagonal neighbours.
//   blades   within a few metres, while a pixel is a few millimetres: one leaning blade in
//            each 1.8 cm square. Measured from the blades' roots (the ray's ground position
//            less the wind's lean at its height) the blades stand nearly upright and the ray
//            stays straight, so a 2D walk tests one thin cone per square (traceBlades).
//   layer    further out, the same grass as a medium: rays find blades by free-flight
//            sampling, at about the blades' mean free path, with fewer towards the tips
//            (marchGrass). It converges to a soft, self-shadowing fringe with ragged
//            silhouettes, and fades out once a pixel spans more than a few centimetres,
//            where the meadow material carries on.
// It samples the cloud detail noise (`detailNoise`, `cloudSampler`); footprintAt is in
// trees.wgsl.

#include "trace/sampling.wgsl"

// Collisions per metre in the densest grass: a mean free path of about 5 cm, close to the
// blades' (3000 blades 6 mm wide per square metre).
const GRASS_DENSITY: f32 = 18.0;
const GRASS_STEPS: u32 = 48u;
// The layer fades out between these pixel footprints (m).
const GRASS_NEAR: f32 = 0.05;
const GRASS_FAR: f32 = 0.14;
// Blades lean this far (m per m of height) downwind.
const GRASS_LEAN: vec2f = vec2f(0.3, 0.11);
// One blade per square this wide (m), twice BLADE_WIDTH wide at its root and tapering to its
// tip; each leans up to BLADE_SWAY off the wind. Blades are traced while a pixel is narrower
// than BLADE_FAR.
const BLADE_CELL: f32 = 0.018;
const BLADE_SWAY: f32 = 0.15;
const BLADE_WIDTH: f32 = 0.003;
const BLADE_FAR: f32 = 0.004;
const BLADE_STEPS: u32 = 128u;

// The detail noise tiles, so each pattern blends two lookups, turned against each other and
// at scales that don't share a period, which hides the repeats.
const TURN_A: mat2x2f = mat2x2f(0.8, 0.6, -0.6, 0.8);
const TURN_B: mat2x2f = mat2x2f(0.28, -0.96, 0.96, 0.28);

// Tussocks about 0.75 m across: 1 on a tussock, 0 in the gaps. `.y` is a slower tone for
// the tussock's colour.
fn grassClumps(world: vec2f) -> vec2f {
    let a = textureSampleLevel(detailNoise, cloudSampler, vec3f(TURN_A * world / 3.0, 0.37), 0.0);
    let b = textureSampleLevel(detailNoise, cloudSampler, vec3f(TURN_B * world / 4.7, 0.71), 0.0);
    let tuft = (a.g * 0.75 + a.b * 0.25) * 0.6 + (b.g * 0.75 + b.b * 0.25) * 0.4;
    return vec2f(smoothstep(0.32, 0.72, tuft), a.r * 0.6 + b.r * 0.4);
}

// Height of the grass over `world` above the ground, given the cell's bilinear height.
fn grassTop(world: vec2f, height: f32) -> f32 {
    return height * (0.35 + 0.65 * grassClumps(world).x);
}

// How much of the layer at `world`, `above` metres up, is blade: strands about 4 cm apart,
// leaning with the wind.
fn grassBlades(world: vec2f, above: f32) -> f32 {
    let root = world - GRASS_LEAN * above;
    let a = textureSampleLevel(detailNoise, cloudSampler, vec3f(TURN_A * root / 0.35, 0.61), 0.0).b;
    let b = textureSampleLevel(detailNoise, cloudSampler, vec3f(TURN_B * root / 0.53, 0.23), 0.0).b;
    return smoothstep(0.4, 0.68, a * 0.55 + b * 0.45);
}

// The ray's height above the ground at the ends of [t0, t1] in level-0 cell `cell`, narrowed
// to where it runs below `tallest` (linear between the ends): (a, b, height at a, rate).
// An empty span has a >= b.
fn grassSpan(origin: vec3f, direction: vec3f, t0: f32, t1: f32, ground: vec4f, tallest: f32,
             start: vec2f, slope: vec2f, cell: vec2f) -> vec4f {
    let gap0 = origin.y + direction.y * t0 - patchHeight(ground, start + slope * t0 - cell);
    let gap1 = origin.y + direction.y * t1 - patchHeight(ground, start + slope * t1 - cell);
    let rate = (gap1 - gap0) / (t1 - t0);
    var a = t0;
    var b = t1;
    if (abs(rate) > 1e-6) {
        let top = t0 + (tallest - gap0) / rate;
        let bottom = t0 - gap0 / rate;
        a = max(a, min(top, bottom) - 0.05);
        b = min(b, max(top, bottom) + 0.05);
    } else if (gap0 < 0.0 || gap0 > tallest) {
        b = a;
    }
    return vec4f(a, b, gap0 + rate * (a - t0), rate);
}

// First blade the ray meets over [t0, t1] in level-0 cell `cell`, or BIG.
fn traceBlades(origin: vec3f, direction: vec3f, t0: f32, t1: f32, ground: vec4f, grass: vec4f,
               start: vec2f, slope: vec2f, cell: vec2f) -> f32 {
    let tallest = max(max(grass.x, grass.y), max(grass.z, grass.w));
    let span = grassSpan(origin, direction, t0, t1, ground, tallest, start, slope, cell);
    if (span.x >= span.y) {
        return BIG;
    }
    // The ray in root space: q(t) = ground position less the lean at its height.
    let qa = (origin + direction * span.x).xz - GRASS_LEAN * span.z;
    let qb = (origin + direction * span.y).xz - GRASS_LEAN * (span.z + span.w * (span.y - span.x));
    let along = qb - qa;
    let reach2 = max(dot(along, along), 1e-12);
    var square = vec2i(floor(qa / BLADE_CELL));
    let last = vec2i(floor(qb / BLADE_CELL));
    let stepping = vec2i(sign(along));
    let moving = abs(along) > vec2f(1e-9);
    let inverse = select(vec2f(0.0), 1.0 / along, moving);
    for (var i = 0u; i < BLADE_STEPS; i++) {
        let pick = unitFloat4(pcg4d(vec4u(bitcast<vec2u>(square), 0xB1ADEu, 0x6u)));
        let root = (vec2f(square) + 0.1 + 0.8 * pick.xy) * BLADE_CELL;
        let u0 = clamp(dot(root - qa, along) / reach2, 0.0, 1.0);
        // The blade's own lean off the wind, applied at the height the ray passes it.
        let sway = (fract(pick.zw * 7.31) - 0.5) * 2.0 * BLADE_SWAY;
        let leaned = root + sway * (span.z + span.w * (mix(span.x, span.y, u0) - span.x));
        let u = clamp(dot(leaned - qa, along) / reach2, 0.0, 1.0);
        let miss = length(qa + along * u - leaned);
        if (miss < BLADE_WIDTH) {
            let t = mix(span.x, span.y, u);
            let above = span.z + span.w * (t - span.x);
            let local = (root - fields.near.origin) / fields.near.spacing - cell;
            let clumps = grassClumps(root);
            let tip = patchHeight(grass, local) * (0.35 + 0.65 * clumps.x) * (0.55 + 0.45 * pick.z);
            if (pick.w < 0.35 + 0.65 * clumps.x && above > 0.0 && above < tip && miss < BLADE_WIDTH * (1.0 - above / tip)) {
                return t;
            }
        }
        if (all(square == last)) {
            return BIG;
        }
        // Step to the next square the ray crosses.
        let edge = (vec2f(square) + select(vec2f(0.0), vec2f(1.0), along > vec2f(0.0))) * BLADE_CELL;
        let crossing = select(vec2f(BIG), (edge - qa) * inverse, moving);
        if (crossing.x < crossing.y) {
            square.x += stepping.x;
        } else {
            square.y += stepping.y;
        }
    }
    return BIG;
}

// First collision with the grass over [t0, t1] in level-0 cell `cell`, or BIG when the ray
// passes through. `ground` and `grass` hold the patch's corner heights and the grass heights
// at the same corners; `start` and `slope` place the ray in grid units.
fn marchGrass(origin: vec3f, direction: vec3f, t0: f32, t1: f32, ground: vec4f, grass: vec4f,
              start: vec2f, slope: vec2f, cell: vec2f) -> f32 {
    if (footprintAt(t0) > GRASS_FAR || t1 <= t0) {
        return BIG;
    }
    // Blades up to the distance where a pixel outgrows them (varied per ray, so the handover
    // has no edge), the layer beyond.
    var layerStart = t0;
    let handover = (BLADE_FAR * (0.75 + 0.5 * random1()) - rayFootprint.x) / max(rayFootprint.y, 1e-9);
    if (handover > t0) {
        let blade = traceBlades(origin, direction, t0, min(t1, handover), ground, grass, start, slope, cell);
        if (blade < BIG || handover >= t1) {
            return blade;
        }
        layerStart = handover;
    }
    let tallest = max(max(grass.x, grass.y), max(grass.z, grass.w));
    let span = grassSpan(origin, direction, layerStart, t1, ground, tallest, start, slope, cell);
    let b = span.y;
    var t = span.x;
    for (var i = 0u; i < GRASS_STEPS; i++) {
        t -= log(1.0 - random1()) / GRASS_DENSITY;
        if (t >= b) {
            return BIG;
        }
        let p = origin + direction * t;
        let local = start + slope * t - cell;
        let above = p.y - patchHeight(ground, local);
        let top = grassTop(p.xz, patchHeight(grass, local));
        if (above < 0.0 || above >= top) {
            continue;
        }
        let fade = 1.0 - smoothstep(GRASS_NEAR, GRASS_FAR, footprintAt(t));
        let density = saturate(1.8 * (1.0 - above / top)) * (0.3 + 0.7 * grassBlades(p.xz, above)) * fade;
        if (random1() < density) {
            return t;
        }
    }
    return BIG;
}
