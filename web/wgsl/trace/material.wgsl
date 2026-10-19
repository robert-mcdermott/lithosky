// SPDX-License-Identifier: Apache-2.0
// Landform-driven materials. Slope, height and the erosion masks decide where rock, scree,
// meadow, forest, gravel and snow belong; noise only breaks up the boundaries.

#include "terrain/noise.wgsl"

const SNOW_LINE: f32 = 1850.0;
const GRASS_LINE: f32 = 1650.0;
const TREE_LINE: f32 = 1150.0;

struct Landform {
    slope: f32,
    height: f32,
    flow: f32,
    sediment: f32,
    erosion: f32,
    fine: f32,
    broad: f32,
}

fn landformAt(world: vec3f, normal: vec3f, field: u32) -> Landform {
    var land: Landform;
    land.slope = 1.0 - normal.y;
    land.height = world.y;
    land.flow = 0.0;
    land.sediment = 0.0;
    land.erosion = 0.0;
    land.fine = 0.0;
    land.broad = 0.0;
    if (field == FIELD_NEAR) {
        let mask = sampleMasks(world.xz);
        land.flow = mask.r;
        land.sediment = max(mask.g * 2.0 - 1.0, 0.0);
        land.erosion = max(1.0 - mask.g * 2.0, 0.0);
        land.fine = mask.b * 2.0 - 1.0;
        land.broad = mask.a * 2.0 - 1.0;
    } else {
        land.sediment = 0.25 * (1.0 - smoothstep(0.08, 0.25, land.slope));
    }
    return land;
}

// Conifer crowns about 8 m across: 1 on a crown, 0 in the gaps between trees.
fn forestCrowns(world: vec2f) -> f32 {
    return smoothstep(-0.1, 0.25, fbm(world / 8.0, 2u, 443u));
}

fn terrainAlbedo(world: vec3f, land: Landform) -> vec3f {
    let variation = fbm(world.xz / 260.0, 3u, 401u);
    let grain = fbm(world.xz / 37.0, 2u, 409u);
    let fleck = fbm(world.xz / 9.0, 2u, 431u);
    let patches = fbm(world.xz / 300.0, 3u, 419u);

    // Banded rock, darkened where runoff stains it.
    let strata = sin(world.y / 17.0 + variation * 6.0 + grain * 1.5) * 0.5 + 0.5;
    let tone = saturate(0.5 + variation * 1.6 + fleck * 0.25 + (strata - 0.5) * 0.35);
    let stain = 1.0 - 0.35 * smoothstep(0.25, 0.6, land.flow);
    let rock = mix(vec3f(0.11, 0.1, 0.09), vec3f(0.3, 0.28, 0.25), tone) * stain;
    let scree = vec3f(0.26, 0.245, 0.22) * (0.85 + 0.3 * fleck);
    let meadowLush = vec3f(0.085, 0.12, 0.04);
    let meadowDry = vec3f(0.17, 0.155, 0.08);
    let dryness = saturate((land.height - 600.0) / 1300.0 + grain * 0.8 + fleck * 0.3);
    let meadow = mix(meadowLush, meadowDry, dryness) * (0.8 + 0.4 * fleck);
    let crowns = forestCrowns(world.xz);
    let forest = mix(vec3f(0.012, 0.018, 0.012), vec3f(0.04, 0.06, 0.032), crowns);
    // Stream beds: wet gravel, darker than the surrounding ground.
    let gravel = vec3f(0.07, 0.072, 0.065) * (0.8 + 0.4 * fleck);
    let snow = vec3f(0.86, 0.88, 0.92);
    let shore = vec3f(0.09, 0.085, 0.07) * (0.85 + 0.3 * grain);

    let ridge = max(-land.fine, 0.0);
    let hollow = max(land.fine, 0.0);
    let steep = land.slope + ridge * 0.06 - hollow * 0.04;
    let screeWeight = saturate(land.sediment * 2.5) * (1.0 - smoothstep(0.26, 0.38, land.slope));
    let meadowHeight = 1.0 - smoothstep(GRASS_LINE - 200.0, GRASS_LINE + 200.0, land.height + grain * 250.0);
    let meadowWeight = (1.0 - smoothstep(0.1, 0.2, steep)) * meadowHeight;
    let forestHeight = 1.0 - smoothstep(TREE_LINE - 200.0, TREE_LINE + 150.0, land.height + variation * 350.0);
    let clearings = smoothstep(-0.15, 0.05, patches + (crowns - 0.5) * 0.15);
    let forestCover = clearings * (1.0 - smoothstep(0.35, 0.6, land.flow));
    let forestSlope = 1.0 - smoothstep(0.2, 0.32, steep);
    let forestWeight = forestSlope * forestHeight * forestCover * (1.0 - screeWeight * 0.7);
    let gravelWeight = smoothstep(0.72, 0.95, land.flow) * (1.0 - smoothstep(0.04, 0.12, land.slope)) * 0.8;
    let snowHeight = land.height + hollow * 300.0 + land.broad * 250.0 + variation * 350.0;
    let snowSlope = 1.0 - smoothstep(0.28, 0.42, steep);
    let snowWeight = smoothstep(SNOW_LINE - 150.0, SNOW_LINE + 150.0, snowHeight) * snowSlope;
    let shoreWeight = 1.0 - smoothstep(0.5, 4.0, land.height - fields.waterLevel + grain * 2.0);

    var albedo = mix(rock, scree, screeWeight);
    albedo = mix(albedo, meadow, meadowWeight);
    albedo = mix(albedo, forest, forestWeight);
    albedo = mix(albedo, gravel, gravelWeight);
    albedo = mix(albedo, shore, shoreWeight);
    return mix(albedo, snow, snowWeight);
}

// Sub-texel relief added to the shading normal; octaves finer than a few pixels fade out.
fn detailGradient(world: vec2f, footprint: f32, coarsest: f32, strength: f32) -> vec2f {
    var gradient = vec2f(0.0);
    var wavelength = coarsest;
    var amplitude = coarsest * 0.035 * strength;
    for (var octave = 0u; octave < 5u; octave++) {
        let fade = smoothstep(2.0 * footprint, 6.0 * footprint, wavelength);
        if (fade <= 0.0) {
            break;
        }
        let n = gradientNoise(world / wavelength, 601u + octave);
        gradient += n.yz * (amplitude / wavelength) * fade;
        wavelength *= 0.4;
        amplitude *= 0.4;
    }
    return gradient;
}
