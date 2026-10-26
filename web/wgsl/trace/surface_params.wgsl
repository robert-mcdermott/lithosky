// SPDX-License-Identifier: Apache-2.0
// The scene's surface uniform: the biome palette, its limits and the water's waves.

struct Surface {
    rockDark: vec4f,
    rockLight: vec4f,
    band: vec4f,
    scree: vec4f,
    soilLush: vec4f,
    soilDry: vec4f,
    // rgb: painted canopy colour; w: how much of the suitable land is forest
    forest: vec4f,
    sand: vec4f,
    snow: vec4f,
    // snow line (m), tree line (m), moisture (0..1), water waves (0..1)
    limits: vec4f,
    // x: formation thickness (m), matching the canyon landform's ledges
    // y: share of conifers below the tree line (they take over near it)
    // z: scrub amount (0..1); w: meadow grass height (m)
    strata: vec4f,
}
