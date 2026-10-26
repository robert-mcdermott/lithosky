// SPDX-License-Identifier: Apache-2.0
// Integer hashes from Jarzynski and Olano, "Hash Functions for GPU Rendering", JCGT 9(3), 2020.

fn pcg2d(seed: vec2u) -> vec2u {
    var v = seed * 1664525u + 1013904223u;
    v.x += v.y * 1664525u;
    v.y += v.x * 1664525u;
    v = v ^ (v >> vec2u(16u));
    v.x += v.y * 1664525u;
    v.y += v.x * 1664525u;
    v = v ^ (v >> vec2u(16u));
    return v;
}

fn pcg3d(seed: vec3u) -> vec3u {
    var v = seed * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v = v ^ (v >> vec3u(16u));
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

fn pcg4d(seed: vec4u) -> vec4u {
    var v = seed * 1664525u + 1013904223u;
    v.x += v.y * v.w;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v.w += v.y * v.z;
    v = v ^ (v >> vec4u(16u));
    v.x += v.y * v.w;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v.w += v.y * v.z;
    return v;
}

// Maps the top 24 bits of a hash to [0, 1).
fn unitFloat(value: u32) -> f32 {
    return f32(value >> 8u) * (1.0 / 16777216.0);
}

fn unitFloat2(value: vec2u) -> vec2f {
    return vec2f(value >> vec2u(8u)) * (1.0 / 16777216.0);
}

fn unitFloat4(value: vec4u) -> vec4f {
    return vec4f(value >> vec4u(8u)) * (1.0 / 16777216.0);
}
