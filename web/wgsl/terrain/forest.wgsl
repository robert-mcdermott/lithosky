// SPDX-License-Identifier: Apache-2.0
// The land's side of forest cover, shared by the mask bake, the forest bake
// (trace/canopy.wgsl) and the materials. The forest map (one texel per near cell) holds:
//   r = steepness: slope, steeper on crests and gentler in hollows
//   g = ground: 0 in stream beds, on loose scree and at the shore, 1 elsewhere
//   b = clearing noise, about [-1, 1]
//   a = tree-line noise, about [-1, 1]
// The scene's tree line, moisture and biome decide how many trees grow (forestDensity in
// trace/trees.wgsl).

fn forestSteepness(slope: f32, fine: f32) -> f32 {
    return slope + max(-fine, 0.0) * 0.06 - max(fine, 0.0) * 0.04;
}

// Valley floors drain large areas, so only the wettest flow (stream channels) stays bare.
fn forestGround(slope: f32, flow: f32, sediment: f32) -> f32 {
    let scree = saturate(sediment * 2.5) * (1.0 - smoothstep(0.26, 0.4, slope));
    return (1.0 - smoothstep(0.7, 0.92, flow)) * (1.0 - scree * 0.7);
}

// Whether any scene could grow a tree on this texel: the slope, ground and clearing limits
// at their most permissive (wettest climate, raggedest edge). The bake skips the rest.
fn forestPossible(land: vec4f) -> bool {
    return land.r < 0.42 && land.g > 0.01 && land.b > -0.38;
}
