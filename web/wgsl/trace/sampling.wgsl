// SPDX-License-Identifier: Apache-2.0
// Random numbers and direction sampling for the path tracer.

#include "common/constants.wgsl"
#include "common/hash.wgsl"

var<private> randomState: vec4u;
var<private> pixelKey: vec2u;
var<private> sampleNumber: u32;
var<private> dimension: u32;

// R_8 sequence (Roberts, "The Unreasonable Effectiveness of Quasirandom Sequences", 2018):
// component j of point n is frac(n * alpha_j), alpha_j = phi_8^-(j+1), in 0.32 fixed point.
// Each path decision takes the next pair of components, so the decisions stay jointly
// well spread instead of being shifted copies of one sequence.
const SEQUENCE_ALPHAS = array<u32, 8>(
    3958238938u, 3647910312u, 3361911662u, 3098335500u,
    2855423889u, 2631556713u, 2425240877u, 2235100342u,
);

fn seedRandom(pixel: vec2u, sampleIndex: u32, seed: u32) {
    randomState = vec4u(pixel, sampleIndex, seed * 0x01000193u);
    pixelKey = pixel;
    sampleNumber = sampleIndex;
    dimension = 0u;
}

// The next two quasirandom numbers for this path, with a per-pixel random rotation so
// neighbouring pixels decorrelate. After four pairs it falls back to white noise.
fn sample2() -> vec2f {
    if (dimension >= 8u) {
        return random2();
    }
    let rotation = pcg3d(vec3u(pixelKey, dimension * 0x9E3779B9u + 0x632BE5ABu)).xy;
    let value = vec2u(sampleNumber * SEQUENCE_ALPHAS[dimension], sampleNumber * SEQUENCE_ALPHAS[dimension + 1u]);
    dimension += 2u;
    return unitFloat2(value + rotation);
}

fn random2() -> vec2f {
    randomState.w += 1u;
    return unitFloat2(pcg4d(randomState).xy);
}

fn random1() -> f32 {
    return random2().x;
}

// R2 low-discrepancy sequence with a per-pixel Cranley-Patterson rotation, in fixed point.
fn pixelJitter(pixel: vec2u, sampleIndex: u32) -> vec2f {
    let sequence = vec2u(sampleIndex * 3242174889u, sampleIndex * 2447445414u);
    return unitFloat2(sequence + pcg2d(pixel));
}

// Duff et al., "Building an Orthonormal Basis, Revisited", JCGT 6(1), 2017.
fn basisAround(normal: vec3f) -> mat3x3f {
    let s = select(-1.0, 1.0, normal.z >= 0.0);
    let a = -1.0 / (s + normal.z);
    let b = normal.x * normal.y * a;
    let tangent = vec3f(1.0 + s * normal.x * normal.x * a, s * b, -s * normal.x);
    let bitangent = vec3f(b, s + normal.y * normal.y * a, -normal.y);
    return mat3x3f(tangent, bitangent, normal);
}

fn cosineHemisphere(normal: vec3f, u: vec2f) -> vec3f {
    let radius = sqrt(u.x);
    let phi = TWO_PI * u.y;
    let local = vec3f(radius * cos(phi), radius * sin(phi), sqrt(max(1.0 - u.x, 0.0)));
    return normalize(basisAround(normal) * local);
}

// Uniform direction inside a cone of half-angle acos(cosMax) around `axis`.
fn sampleCone(axis: vec3f, cosMax: f32, u: vec2f) -> vec3f {
    let cosTheta = 1.0 - u.x * (1.0 - cosMax);
    let sinTheta = sqrt(max(1.0 - cosTheta * cosTheta, 0.0));
    let phi = TWO_PI * u.y;
    let local = vec3f(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
    return normalize(basisAround(axis) * local);
}

fn uniformSphere(u: vec2f) -> vec3f {
    let cosTheta = 1.0 - 2.0 * u.x;
    let sinTheta = sqrt(max(1.0 - cosTheta * cosTheta, 0.0));
    let phi = TWO_PI * u.y;
    return vec3f(sinTheta * cos(phi), cosTheta, sinTheta * sin(phi));
}
