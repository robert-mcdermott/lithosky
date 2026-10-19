// SPDX-License-Identifier: Apache-2.0
// In-scattering shared by the sky-view and aerial-perspective passes.
// Including modules declare `transmittanceLut`, `multiScatterLut` and `skySampler`.

#include "sky/transmittance.wgsl"

fn multiScatterAt(position: vec3f) -> vec3f {
    let radius = length(position);
    let cosSun = dot(position / radius, atmosphere.sunDirection);
    let uv = multiScatterUv(radius, cosSun);
    return textureSampleLevel(multiScatterLut, skySampler, uv, 0.0).rgb;
}

// Luminance scattered toward the viewer per kilometre at `position`, for unit sun illuminance.
fn inScattering(position: vec3f, medium: Medium, cosTheta: f32) -> vec3f {
    let phaseRayleigh = rayleighPhase(cosTheta);
    let phaseMie = miePhase(cosTheta, atmosphere.mieAnisotropy);
    let sunlight = sunTransmittance(position, atmosphere.sunDirection);
    let single = (medium.rayleigh * phaseRayleigh + vec3f(medium.mie * phaseMie)) * sunlight;
    let multiple = multiScatterAt(position) * medium.scattering;
    return single + multiple;
}

struct Segment {
    luminance: vec3f,
    transmittance: vec3f,
}

fn emptySegment() -> Segment {
    var segment: Segment;
    segment.luminance = vec3f(0.0);
    segment.transmittance = vec3f(1.0);
    return segment;
}

// Adds one sample of length `stepLength` km, integrated analytically across the step
// (Hillaire's energy-conserving form).
fn accumulateStep(segment: ptr<function, Segment>, position: vec3f, stepLength: f32, cosTheta: f32) {
    let medium = sampleMedium(length(position) - atmosphere.bottomRadius);
    let stepTransmittance = exp(-medium.extinction * stepLength);
    let source = inScattering(position, medium, cosTheta) * atmosphere.sunIlluminance;
    let integral = (source - source * stepTransmittance) / max(medium.extinction, vec3f(1e-7));
    (*segment).luminance += (*segment).transmittance * integral;
    (*segment).transmittance *= stepTransmittance;
}
