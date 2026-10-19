// SPDX-License-Identifier: Apache-2.0
// The alpine height function in world metres. The near tile and the far field both
// evaluate it, so the horizon continues the same landforms.

#include "terrain/noise.wgsl"
#include "terrain/gullies.wgsl"

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
}

fn seedOffset(seed: u32) -> vec2f {
    let h = pcg2d(vec2u(seed, seed ^ 0x5bd1e995u));
    return (unitFloat2(h) - 0.5) * 400.0;
}

// Height of the glacial trough that keeps the Alpine quiet camera above the valley floor.
fn valleyMask(world: vec2f, shape: TerrainShape) -> vec2f {
    let local = world - shape.valleyOrigin;
    let along = dot(local, shape.valleyDirection);
    let across = local.x * shape.valleyDirection.y - local.y * shape.valleyDirection.x;
    let settled = smoothstep(-2500.0, 4000.0, along);
    let meander = fbm(vec2f(along / 6000.0, 3.7), 3u, shape.seed + 17u) * 1600.0 * settled;
    let width = shape.valleyWidth * (1.0 + 0.35 * fbm(vec2f(along / 4000.0, 9.1), 2u, shape.seed + 23u));
    let trough = 1.0 - smoothstep(0.3 * width, width, abs(across + meander));
    let start = smoothstep(-6000.0, -2500.0, along);
    let end = 1.0 - smoothstep(shape.valleyLength * 0.6, shape.valleyLength, along);
    return vec2f(trough * start * end, along);
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

    let height = centre.x + detail * 0.6 + worn.height;
    let fromCamera = world - shape.curvatureOrigin;
    return height - dot(fromCamera, fromCamera) / (2.0 * EARTH_RADIUS_M);
}
