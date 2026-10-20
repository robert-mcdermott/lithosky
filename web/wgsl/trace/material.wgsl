// SPDX-License-Identifier: Apache-2.0
// Landform-driven materials over a biome palette. The erosion masks say where each layer
// belongs; noise only breaks up the boundaries:
//   bedrock  banded strata, stained where runoff flows, on steep and eroded ground
//   scree    on talus slopes where material was deposited
//   gravel   wet stream beds along the drainage network
//   meadow   gentle ground below the grass line, lusher where it is wet
//   forest   gentle ground below the tree line, with crowns and clearings
//   sand     shores and dry washes
//   snow     above the snow line, held on gentle, shaded (north-facing) and hollow ground
// Each material also returns a roughness and a wetness for specular shading.
// Including modules declare `surface`, `fields`, `masks`, `exposureMasks` and `skySampler`.

#include "terrain/noise.wgsl"

struct Surface {
    rockDark: vec4f,
    rockLight: vec4f,
    band: vec4f,
    scree: vec4f,
    soilLush: vec4f,
    soilDry: vec4f,
    forest: vec4f,
    sand: vec4f,
    snow: vec4f,
    // snow line (m), tree line (m), moisture (0..1), water waves (0..1)
    limits: vec4f,
    spare: vec4f,
}

struct Landform {
    slope: f32,
    height: f32,
    flow: f32,
    sediment: f32,
    erosion: f32,
    fine: f32,
    broad: f32,
    openness: f32,
    wetness: f32,
}

struct Material {
    albedo: vec3f,
    roughness: f32,
    wetness: f32,
    snow: f32,
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
    land.openness = 1.0;
    land.wetness = 0.0;
    if (field == FIELD_NEAR) {
        let mask = sampleMasks(world.xz);
        land.flow = mask.r;
        land.sediment = max(mask.g * 2.0 - 1.0, 0.0);
        land.erosion = max(1.0 - mask.g * 2.0, 0.0);
        land.fine = mask.b * 2.0 - 1.0;
        land.broad = mask.a * 2.0 - 1.0;
        let exposure = sampleExposure(world.xz);
        land.openness = exposure.r;
        land.wetness = exposure.g;
    } else {
        land.sediment = 0.25 * (1.0 - smoothstep(0.08, 0.25, land.slope));
    }
    return land;
}

// Conifer crowns about 8 m across: 1 on a crown, 0 in the gaps between trees.
fn forestCrowns(world: vec2f) -> f32 {
    return smoothstep(-0.1, 0.25, fbm(world / 8.0, 2u, 443u));
}

// Tone (0..1) of the sedimentary bed at stratigraphic position `phase`, counted in beds. Each
// bed has its own tone, grading into the next only at its top, so contacts read as lines.
fn bedTone(phase: f32, salt: u32) -> f32 {
    let bed = floor(phase);
    let index = bitcast<u32>(i32(bed));
    let current = unitFloat(pcg2d(vec2u(index, salt)).x);
    let next = unitFloat(pcg2d(vec2u(index + 1u, salt)).x);
    return mix(current, next, smoothstep(0.85, 1.0, phase - bed));
}

// `detailed` adds the fine texture camera rays see; bounce and reflection rays skip it, since
// they only need the material's average colour and roughness.
fn terrainMaterial(world: vec3f, normal: vec3f, land: Landform, detailed: bool) -> Material {
    let variation = fbm(world.xz / 260.0, 3u, 401u);
    let grain = fbm(world.xz / 37.0, 2u, 409u);
    let patches = fbm(world.xz / 300.0, 3u, 419u);
    var fleck = 0.0;
    var tussocks = 0.0;
    var dryPatches = 0.4;
    var crowns = 0.5;
    var knolls = 0.0;
    if (detailed) {
        fleck = fbm(world.xz / 9.0, 2u, 431u);
        tussocks = fbm(world.xz / 3.2, 2u, 447u);
        dryPatches = smoothstep(-0.1, 0.4, fbm(world.xz / 21.0, 2u, 449u));
        crowns = forestCrowns(world.xz);
        knolls = fbm(world.xz / 14.0, 3u, 451u);
    }
    let snowLine = surface.limits.x;
    let treeLine = surface.limits.y;
    let moisture = surface.limits.z;
    let grassLine = treeLine + 550.0;

    // Bedrock: level strata, gently warped and tilted. Thick formations of irregular height,
    // each with its own tone, carry thinner beds; boundaries stay continuous across a face.
    let banding = surface.rockDark.w;
    let layerHeight = 34.0 + 18.0 * fbm(world.xz / 900.0, 2u, 433u);
    let warp = fbm(world.xz / 700.0, 2u, 437u) * 60.0 + world.x * 0.012;
    let phase = (world.y + warp) / layerHeight + grain * 0.08;
    let formation = bedTone(phase, 433u);
    let beds = bedTone(phase * 3.3 + 0.37, 457u);
    let tone = saturate(0.5 + variation * 1.5 + fleck * 0.25);
    var rock = mix(surface.rockDark.rgb, surface.rockLight.rgb, tone);
    rock = mix(rock, surface.band.rgb, smoothstep(0.4, 0.8, formation) * banding * 0.75);
    rock *= mix(1.0, 0.72 + 0.56 * formation, banding * 0.7);
    rock *= 1.0 + (beds - 0.5) * 0.3 * banding;
    rock *= 1.0 - 0.35 * smoothstep(0.25, 0.6, land.flow);

    let scree = surface.scree.rgb * (0.82 + 0.36 * fleck);
    let dryness = saturate((land.height - grassLine + 900.0) / 1300.0 + grain * 0.8 + fleck * 0.3
        + 0.5 - moisture - land.wetness * 0.8);
    // Grass in tussocks and dry patches at a few scales, so meadows keep texture up close.
    let grassTone = saturate(dryness + dryPatches * 0.35 - 0.1);
    let meadow = mix(surface.soilLush.rgb, surface.soilDry.rgb, grassTone) * (0.7 + 0.3 * fleck + 0.35 * tussocks);
    let forest = surface.forest.rgb * mix(0.55, 1.7, crowns);
    let gravel = surface.scree.rgb * 0.32 * (0.8 + 0.4 * fleck);
    let sand = surface.sand.rgb * (0.88 + 0.24 * grain);

    let ridge = max(-land.fine, 0.0);
    let hollow = max(land.fine, 0.0);
    let steep = land.slope + ridge * 0.06 - hollow * 0.04;
    let screeWeight = saturate(land.sediment * 2.5) * (1.0 - smoothstep(0.26, 0.4, land.slope));
    let meadowHeight = 1.0 - smoothstep(grassLine - 200.0, grassLine + 200.0, land.height + grain * 250.0);
    // Rock pokes through thin soil on ridges and knolls.
    let outcrop = smoothstep(0.3, 0.55, knolls * 0.6 + ridge * 2.5 + land.erosion * 0.4);
    let meadowWeight = (1.0 - smoothstep(0.1, 0.22, steep)) * meadowHeight * (0.35 + 0.65 * moisture) * (1.0 - 0.85 * outcrop);
    let forestHeight = 1.0 - smoothstep(treeLine - 200.0, treeLine + 150.0, land.height + variation * 350.0);
    let clearings = smoothstep(-0.15, 0.05, patches + (crowns - 0.5) * 0.15 + (moisture - 0.5) * 0.3);
    let forestCover = clearings * (1.0 - smoothstep(0.35, 0.6, land.flow)) * surface.forest.w;
    let forestSlope = 1.0 - smoothstep(0.2, 0.32, steep);
    let forestWeight = forestSlope * forestHeight * forestCover * (1.0 - screeWeight * 0.7);
    let gravelWeight = smoothstep(0.72, 0.95, land.flow) * (1.0 - smoothstep(0.04, 0.12, land.slope)) * 0.8;
    let shore = 1.0 - smoothstep(0.5, 4.0, land.height - fields.waterLevel + grain * 2.0);
    // Dry washes only where the climate is dry; wetter biomes grow meadow on the same fans.
    let wash = land.sediment * saturate(1.0 - moisture * 1.6) * (1.0 - smoothstep(0.05, 0.15, land.slope)) * 1.5;
    let sandWeight = saturate(max(shore, wash));

    // Snow settles on gentle, shaded and hollow ground first; steep faces shed it.
    let northFacing = -normal.z;
    let shelter = 1.0 - land.openness;
    let snowHeight = land.height + hollow * 300.0 + land.broad * 250.0 + variation * 350.0
        + northFacing * 220.0 + shelter * 200.0;
    let snowSlope = 1.0 - smoothstep(0.3, 0.5, steep);
    let snowWeight = smoothstep(snowLine - 150.0, snowLine + 150.0, snowHeight) * snowSlope * surface.snow.w;

    var material: Material;
    var albedo = mix(rock, scree, screeWeight);
    var roughness = mix(0.72, 0.85, screeWeight);
    albedo = mix(albedo, meadow, meadowWeight);
    roughness = mix(roughness, 0.92, meadowWeight);
    albedo = mix(albedo, forest, forestWeight);
    roughness = mix(roughness, 0.95, forestWeight);
    albedo = mix(albedo, gravel, gravelWeight);
    albedo = mix(albedo, sand, sandWeight);
    roughness = mix(roughness, 0.7, sandWeight);
    let wet = saturate(max(land.wetness * 0.8, gravelWeight)) * (1.0 - snowWeight);
    // A water film darkens and smooths whatever it covers.
    albedo *= mix(1.0, 0.55, wet);
    roughness = mix(roughness, 0.22, wet);
    material.albedo = mix(albedo, surface.snow.rgb * (0.96 + 0.08 * fleck), snowWeight);
    material.roughness = mix(roughness, 0.42, snowWeight);
    material.wetness = wet;
    material.snow = snowWeight;
    return material;
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

// Rock relief below the heightfield's resolution: ridged fracture creases plus strata ledges
// that steepen and flatten the slope along contour lines. Octaves finer than a few pixels fade.
fn rockDetailGradient(world: vec3f, slopeGradient: vec2f, footprint: f32, strength: f32) -> vec2f {
    var gradient = vec2f(0.0);
    var wavelength = 28.0;
    var amplitude = 2.6 * strength;
    for (var octave = 0u; octave < 6u; octave++) {
        let fade = smoothstep(2.0 * footprint, 6.0 * footprint, wavelength);
        if (fade <= 0.0) {
            break;
        }
        // Ridged noise: |n| has creases where n crosses zero.
        let n = gradientNoise(world.xz / wavelength, 701u + octave);
        gradient += sign(n.x) * n.yz * (amplitude / wavelength) * fade;
        wavelength *= 0.45;
        amplitude *= 0.42;
    }
    let layer = 8.0 + 4.0 * fbm(world.xz / 450.0, 2u, 733u);
    let strataFade = smoothstep(1.5 * footprint, 5.0 * footprint, layer);
    let phase = world.y / layer + 1.5 * fbm(world.xz / 220.0, 2u, 739u);
    gradient += slopeGradient * cos(phase * TWO_PI) * 0.45 * strength * strataFade;
    return gradient;
}
