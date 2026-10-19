// SPDX-License-Identifier: Apache-2.0
// Min/max pyramid over a height texture. Level 0 cell (i, j) bounds the bilinear patch
// between vertices (i, j) and (i + 1, j + 1); each higher level bounds 2 x 2 children.

@group(0) @binding(0) var sourceLevel: texture_2d<f32>;
@group(0) @binding(1) var destination: texture_storage_2d<rg32float, write>;

@compute @workgroup_size(8, 8)
fn baseLevel(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(destination);
    if (id.x >= size.x || id.y >= size.y) {
        return;
    }
    let last = vec2i(size) - 1;
    let cell = vec2i(id.xy);
    let h00 = textureLoad(sourceLevel, cell, 0).r;
    let h10 = textureLoad(sourceLevel, min(cell + vec2i(1, 0), last), 0).r;
    let h01 = textureLoad(sourceLevel, min(cell + vec2i(0, 1), last), 0).r;
    let h11 = textureLoad(sourceLevel, min(cell + vec2i(1, 1), last), 0).r;
    let low = min(min(h00, h10), min(h01, h11));
    let high = max(max(h00, h10), max(h01, h11));
    textureStore(destination, cell, vec4f(low, high, 0.0, 0.0));
}

@compute @workgroup_size(8, 8)
fn reduceLevel(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(destination);
    if (id.x >= size.x || id.y >= size.y) {
        return;
    }
    let child = vec2i(id.xy) * 2;
    let a = textureLoad(sourceLevel, child, 0).rg;
    let b = textureLoad(sourceLevel, child + vec2i(1, 0), 0).rg;
    let c = textureLoad(sourceLevel, child + vec2i(0, 1), 0).rg;
    let d = textureLoad(sourceLevel, child + vec2i(1, 1), 0).rg;
    let low = min(min(a.x, b.x), min(c.x, d.x));
    let high = max(max(a.y, b.y), max(c.y, d.y));
    textureStore(destination, vec2i(id.xy), vec4f(low, high, 0.0, 0.0));
}
