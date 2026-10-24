// SPDX-License-Identifier: Apache-2.0
// Sedimentary formations, shared by the canyon landform (which steps the land into cliffs
// and ledges) and the rock materials (which colour them), so painted bands line up with
// the ledges they form. Layers are level, gently warped and tilted, and vary in thickness.
// Including modules include "terrain/noise.wgsl".

fn strataWarp(xz: vec2f) -> f32 {
    return fbm(xz / 700.0, 2u, 437u) * 60.0 + xz.x * 0.012;
}

// Thickness of the formations at a place, around `base` metres.
fn strataThickness(xz: vec2f, base: f32) -> f32 {
    return base * (1.0 + 0.5 * fbm(xz / 900.0, 2u, 433u));
}

// Position in the stack, counted in formations: the integer part names the formation.
fn strataPhase(xz: vec2f, height: f32, base: f32) -> f32 {
    return (height + strataWarp(xz)) / strataThickness(xz, base);
}

// How resistant a formation is (0..1). Hard formations stand as cliffs; soft ones weather
// back into slopes.
fn formationHardness(formation: f32) -> f32 {
    let index = bitcast<u32>(i32(formation));
    return smoothstep(0.35, 0.65, unitFloat(pcg2d(vec2u(index, 0x9e37u)).x));
}

// Steps a height into ledges: each formation is a flat bench (its top) and a rise to the
// next, steep where the formation is hard.
fn terraced(xz: vec2f, height: f32, base: f32) -> f32 {
    let thickness = strataThickness(xz, base);
    let warp = strataWarp(xz);
    let phase = (height + warp) / thickness;
    let formation = floor(phase);
    let riser = mix(0.7, 0.14, formationHardness(formation));
    let rise = smoothstep(1.0 - riser, 1.0, phase - formation);
    return (formation + rise) * thickness - warp;
}
