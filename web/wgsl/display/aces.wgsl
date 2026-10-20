// SPDX-License-Identifier: Apache-2.0
// ACES filmic tone mapping: Stephen Hill's fit of the ACES reference rendering and output
// transforms (sRGB -> AP1 -> RRT/ODT fit -> sRGB). Algorithm from public descriptions;
// WGSL matrices are column-major.

const ACES_INPUT = mat3x3f(
    vec3f(0.59719, 0.07600, 0.02840),
    vec3f(0.35458, 0.90834, 0.13383),
    vec3f(0.04823, 0.01566, 0.83777),
);

const ACES_OUTPUT = mat3x3f(
    vec3f(1.60475, -0.10208, -0.00327),
    vec3f(-0.53108, 1.10813, -0.07276),
    vec3f(-0.07367, -0.00605, 1.07602),
);

fn acesCurve(value: vec3f) -> vec3f {
    let a = value * (value + 0.0245786) - 0.000090537;
    let b = value * (0.983729 * value + 0.4329510) + 0.238081;
    return a / b;
}

// Linear sRGB scene light in, linear sRGB display light in [0, 1] out.
fn acesToneMap(linearSrgb: vec3f) -> vec3f {
    let fitted = acesCurve(ACES_INPUT * max(linearSrgb, vec3f(0.0)));
    return clamp(ACES_OUTPUT * fitted, vec3f(0.0), vec3f(1.0));
}
