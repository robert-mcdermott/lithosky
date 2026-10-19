// SPDX-License-Identifier: Apache-2.0
// AgX tone mapping. Ported from three.js r170 AgXToneMapping (MIT, Copyright 2010-2024
// three.js authors), which follows Filament (Apache-2.0) and Blender's AgX with Rec.2020
// primaries. The 7th-order contrast fit and the punchy look come from Filament's ToneMapper.cpp,
// adapted there from Benjamin Wrensch's minimal AgX. See NOTICE.
// GLSL mat3(vec3, ...) and WGSL mat3x3f(vec3f, ...) are both column-major.

const LINEAR_SRGB_TO_REC2020 = mat3x3f(
    vec3f(0.6274, 0.0691, 0.0164),
    vec3f(0.3293, 0.9195, 0.0880),
    vec3f(0.0433, 0.0113, 0.8956),
);

const LINEAR_REC2020_TO_SRGB = mat3x3f(
    vec3f(1.6605, -0.1246, -0.0182),
    vec3f(-0.5876, 1.1329, -0.1006),
    vec3f(-0.0728, -0.0083, 1.1187),
);

const AGX_INSET = mat3x3f(
    vec3f(0.856627153315983, 0.137318972929847, 0.11189821299995),
    vec3f(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
    vec3f(0.0482516061458583, 0.101439036467562, 0.811302368396859),
);

const AGX_OUTSET = mat3x3f(
    vec3f(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
    vec3f(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
    vec3f(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405),
);

// log2(2^-10 * 0.18) and log2(2^6.5 * 0.18)
const AGX_MIN_EV: f32 = -12.47393;
const AGX_MAX_EV: f32 = 4.026069;

const AGX_LOOK_PUNCHY: u32 = 1u;

fn agxContrast(x: vec3f) -> vec3f {
    let x2 = x * x;
    let x4 = x2 * x2;
    let x6 = x4 * x2;
    return -17.86 * x6 * x
        + 78.01 * x6
        - 126.7 * x4 * x
        + 92.06 * x4
        - 28.72 * x2 * x
        + 4.361 * x2
        - 0.1718 * x
        + 0.002857;
}

// Filament's "punchy" ASC CDL look, applied after the AgX sigmoid.
fn agxLook(value: vec3f, look: u32) -> vec3f {
    if (look != AGX_LOOK_PUNCHY) {
        return value;
    }
    let luma = dot(value, vec3f(0.2126, 0.7152, 0.0722));
    let graded = pow(max(value, vec3f(0.0)), vec3f(1.35));
    return luma + 1.4 * (graded - luma);
}

// Linear sRGB scene light in, linear sRGB display light in [0, 1] out.
fn agxToneMap(linearSrgb: vec3f, look: u32) -> vec3f {
    var color = LINEAR_SRGB_TO_REC2020 * max(linearSrgb, vec3f(0.0));
    color = AGX_INSET * color;
    color = max(color, vec3f(1e-10));
    color = (log2(color) - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV);
    color = clamp(color, vec3f(0.0), vec3f(1.0));
    color = agxContrast(color);
    color = agxLook(color, look);
    color = AGX_OUTSET * color;
    color = pow(max(color, vec3f(0.0)), vec3f(2.2));
    color = LINEAR_REC2020_TO_SRGB * color;
    return clamp(color, vec3f(0.0), vec3f(1.0));
}
