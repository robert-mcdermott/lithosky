// SPDX-License-Identifier: Apache-2.0
// The procedural height functions in world metres, one per landform: alpine ranges or
// canyon country. The near tile and the far field both evaluate them, so the horizon
// continues the same landforms.

#include "terrain/noise.wgsl"
#include "terrain/gullies.wgsl"
#include "terrain/strata.wgsl"

const LANDFORM_ALPINE: u32 = 0u;
const LANDFORM_CANYON: u32 = 1u;

const EARTH_RADIUS_M: f32 = 6360000.0;

struct TerrainShape {
    seed: u32,
    finestWavelength: f32,
    relief: f32,
    valleyWidth: f32,
    valleyOrigin: vec2f,
    valleyDirection: vec2f,
    curvatureOrigin: vec2f,
    valleyFloor: f32,
    valleyLength: f32,
    landform: u32,
    padding0: u32,
    padding1: u32,
    padding2: u32,
}

fn seedOffset(seed: u32) -> vec2f {
    let h = pcg2d(vec2u(seed, seed ^ 0x5bd1e995u));
    return (unitFloat2(h) - 0.5) * 400.0;
}

// The valley along the view: the alpine glacial trough, or the canyon's main gorge.
// Returns (trough weight, distance along, distance from the meandering centre line, width).
fn valleyMask(world: vec2f, shape: TerrainShape) -> vec4f {
    let local = world - shape.valleyOrigin;
    let along = dot(local, shape.valleyDirection);
    let across = local.x * shape.valleyDirection.y - local.y * shape.valleyDirection.x;
    let settled = smoothstep(-2500.0, 4000.0, along);
    let meander = fbm(vec2f(along / 6000.0, 3.7), 3u, shape.seed + 17u) * 1600.0 * settled;
    let width = shape.valleyWidth * (1.0 + 0.35 * fbm(vec2f(along / 4000.0, 9.1), 2u, shape.seed + 23u));
    let offset = abs(across + meander);
    let trough = 1.0 - smoothstep(0.3 * width, width, offset);
    let start = smoothstep(-6000.0, -2500.0, along);
    let end = 1.0 - smoothstep(shape.valleyLength * 0.6, shape.valleyLength, along);
    return vec4f(trough * start * end, along, offset, width * start * end);
}

const RANGE_WAVELENGTH: f32 = 9000.0;
const WORN_SCALE: f32 = 2.5;

// Octaves whose wavelength stays above the finest one the grid can hold.
fn octavesDownTo(wavelength: f32, finest: f32) -> u32 {
    return u32(clamp(floor(log2(wavelength / finest)) + 1.0, 1.0, 12.0));
}

// Octaves finer than this are "detail": they survive the valley carve.
const LANDFORM_WAVELENGTH: f32 = 600.0;

// Mountain height before the valley carve, from octaves down to `finest` metres.
fn rangeHeight(p: vec2f, q: vec2f, finest: f32, shape: TerrainShape) -> f32 {
    let ridgedOctaves = octavesDownTo(RANGE_WAVELENGTH, finest);
    let wornOctaves = octavesDownTo(RANGE_WAVELENGTH / WORN_SCALE, finest);
    let ridges = ridgedMultifractal(q, ridgedOctaves, shape.seed);
    let worn = dampedFbm(q * WORN_SCALE + vec2f(5.0, 5.0), wornOctaves, shape.seed) * 0.5 + 0.5;
    let massif = smoothstep(-0.45, 0.55, fbm(p * 0.33 + vec2f(11.0, 4.0), 3u, shape.seed + 7u));
    let peaks = ridges * 0.75 + worn * 0.25;
    return shape.relief * (0.55 + 0.45 * massif) * peaks;
}

struct Domain {
    p: vec2f,
    q: vec2f,
}

fn domainAt(world: vec2f, shape: TerrainShape) -> Domain {
    var domain: Domain;
    domain.p = world / RANGE_WAVELENGTH + seedOffset(shape.seed);
    let warpX = fbm(domain.p * 0.6 + vec2f(3.1, 7.7), 3u, shape.seed);
    let warpY = fbm(domain.p * 0.6 + vec2f(-8.3, 1.9), 3u, shape.seed);
    domain.q = domain.p + 0.5 * vec2f(warpX, warpY);
    return domain;
}

// Large landform with the glacial trough carved in: (height, trough weight).
fn carvedLandform(world: vec2f, shape: TerrainShape) -> vec2f {
    let domain = domainAt(world, shape);
    let landform = rangeHeight(domain.p, domain.q, max(LANDFORM_WAVELENGTH, shape.finestWavelength), shape);
    let valley = valleyMask(world, shape);
    // A shallow basin a few kilometres down the valley holds the lake.
    let basin = smoothstep(-1500.0, 0.0, valley.y) * (1.0 - smoothstep(2500.0, 5000.0, valley.y));
    let rise = max(valley.y, 0.0) * 0.012 + landform * 0.02 - basin * LAKE_DEPTH;
    let troughFloor = shape.valleyFloor + rise;
    return vec2f(mix(landform, min(landform, troughFloor), valley.x), valley.x);
}

const LAKE_DEPTH: f32 = 45.0;
const GULLY_WAVELENGTH: f32 = 450.0;
const GULLY_AMPLITUDE: f32 = 35.0;
const SLOPE_PROBE: f32 = 30.0;

fn alpineHeight(world: vec2f, shape: TerrainShape) -> f32 {
    let centre = carvedLandform(world, shape);
    let east = carvedLandform(world + vec2f(SLOPE_PROBE, 0.0), shape).x;
    let west = carvedLandform(world - vec2f(SLOPE_PROBE, 0.0), shape).x;
    let south = carvedLandform(world + vec2f(0.0, SLOPE_PROBE), shape).x;
    let north = carvedLandform(world - vec2f(0.0, SLOPE_PROBE), shape).x;
    let gradient = vec2f(east - west, south - north) / (2.0 * SLOPE_PROBE);

    // Fine range octaves keep their texture on the trough walls but fade on its floor.
    let domain = domainAt(world, shape);
    let full = rangeHeight(domain.p, domain.q, shape.finestWavelength, shape);
    let coarse = rangeHeight(domain.p, domain.q, max(LANDFORM_WAVELENGTH, shape.finestWavelength), shape);
    let detail = (full - coarse) * (1.0 - 0.75 * centre.y);
    let worn = gullies(world, gradient, GULLY_WAVELENGTH, GULLY_AMPLITUDE, shape.finestWavelength, shape.seed);
    // Gullies come and go across a slope instead of combing all of it evenly.
    let gullyCover = smoothstep(-0.25, 0.45, fbm(world / 2400.0 + vec2f(31.0, 17.0), 3u, shape.seed + 41u));

    let height = centre.x + detail * 0.6 + worn.height * (0.25 + 1.1 * gullyCover);
    let fromCamera = world - shape.curvatureOrigin;
    return height - dot(fromCamera, fromCamera) / (2.0 * EARTH_RADIUS_M);
}

// Canyon country: a high plateau broken into mesas and buttes, benches stepping down to
// lowland floors, and a main canyon with a river along the view. Every slope steps into
// cliffs and ledges by formation (see strata.wgsl); drainage and droplets then cut the side
// canyons and flute the walls. `relief` is the plateau's height above the lowlands.
const CANYON_FIELD_WAVELENGTH: f32 = 6400.0;
const CANYON_LOWLAND: f32 = 0.08;
const CANYON_FORMATIONS: f32 = 12.0;
// The main gorge is narrower than the alpine trough; its river is a channel of about this
// half-width in metres, with dry benches either side.
const CANYON_GORGE_WIDTH: f32 = 0.6;
const CANYON_RIVER: f32 = 70.0;
// Mountain ranges start this far (m) from the gorge, beyond the editable tile.
const CANYON_RANGES_FROM: f32 = 26000.0;

fn canyonHeight(world: vec2f, shape: TerrainShape) -> f32 {
    let domain = domainAt(world, shape);
    let finest = max(shape.finestWavelength, 300.0);
    // Uplands where the field is high; ragged noise makes the rims wander.
    let field = fbm(domain.q * (RANGE_WAVELENGTH / CANYON_FIELD_WAVELENGTH) + vec2f(2.3, 8.1),
        octavesDownTo(CANYON_FIELD_WAVELENGTH, finest), shape.seed + 51u);
    let ragged = fbm(world / 900.0, 3u, shape.seed + 53u) * 0.07;
    let rise = field + ragged;
    let bench = smoothstep(-0.24, -0.13, rise);
    let plateau = smoothstep(0.05, 0.15, rise);
    var level = 0.4 * bench + 0.6 * plateau;
    // Buttes: small remnants of the plateau standing out on the benches.
    let butte = smoothstep(0.6, 0.68, fbm(world / 1300.0 + vec2f(7.0, 3.0), 2u, shape.seed + 59u));
    level = max(level, butte * bench * 0.92);
    // The main gorge cuts down through everything along the view.
    let valley = valleyMask(world, shape);
    let gorgeWidth = max(valley.w * CANYON_GORGE_WIDTH, 1.0);
    let gorge = (1.0 - smoothstep(0.12 * gorgeWidth, gorgeWidth, valley.z)) * step(1.0, valley.w);
    level *= 1.0 - gorge;
    // Slight swells on the benches and plateau, small enough that tops stay level.
    let swell = fbm(domain.p * 2.0 + vec2f(4.0, 1.0), 3u, shape.seed + 61u) * 0.012 * level;
    let lowland = shape.valleyFloor + shape.relief * CANYON_LOWLAND * (1.0 - gorge);
    let shaped = lowland + shape.relief * (level * (1.0 - CANYON_LOWLAND) + swell);
    let stepped = mix(shaped, terraced(world, shaped, shape.relief / CANYON_FORMATIONS), 0.9);
    // On the gorge floor a narrow river runs just below the water line, between dry benches.
    let gorgeFloor = shape.valleyFloor + 40.0 * smoothstep(CANYON_RIVER, CANYON_RIVER * 2.5, valley.z);
    let floored = mix(stepped, gorgeFloor, gorge * gorge);
    // Rock texture below the formation scale.
    let detail = fbm(world / 180.0, octavesDownTo(180.0, max(shape.finestWavelength, 20.0)), shape.seed + 67u) * 5.0;
    // Far out, isolated mountain ranges rise above the plateau and give the horizon a
    // skyline, as the peaks around the Colorado Plateau do.
    let distance = length(world - shape.valleyOrigin);
    let remote = smoothstep(CANYON_RANGES_FROM, CANYON_RANGES_FROM * 1.8, distance);
    let massifs = smoothstep(0.15, 0.45, fbm(world / 22000.0 + vec2f(13.0, 5.0), 2u, shape.seed + 71u));
    let peaks = ridgedMultifractal(domain.q * 0.7 + vec2f(9.0, 2.0), octavesDownTo(RANGE_WAVELENGTH / 0.7, finest), shape.seed + 73u);
    let ranges = shape.relief * 1.3 * peaks * massifs * remote;
    let fromCamera = world - shape.curvatureOrigin;
    return floored + ranges + detail - dot(fromCamera, fromCamera) / (2.0 * EARTH_RADIUS_M);
}

fn terrainHeight(world: vec2f, shape: TerrainShape) -> f32 {
    if (shape.landform == LANDFORM_CANYON) {
        return canyonHeight(world, shape);
    }
    return alpineHeight(world, shape);
}
