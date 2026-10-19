// SPDX-License-Identifier: Apache-2.0
// Earth atmosphere model for the sky LUTs, following Hillaire, "A Scalable and Production
// Ready Sky and Atmosphere Rendering Technique", EGSR 2020. Distances are kilometres.
// A module that includes this file declares `atmosphere` and the LUT bindings it reads.

#include "common/constants.wgsl"

struct Atmosphere {
    rayleighScattering: vec3f,
    rayleighScaleHeight: f32,
    mieScattering: f32,
    mieAbsorption: f32,
    mieScaleHeight: f32,
    mieAnisotropy: f32,
    ozoneAbsorption: vec3f,
    ozoneCentre: f32,
    bottomRadius: f32,
    topRadius: f32,
    groundAlbedo: f32,
    ozoneHalfWidth: f32,
    sunDirection: vec3f,
    sunAngularRadius: f32,
    sunIlluminance: vec3f,
    cameraAltitude: f32,
}

const TRANSMITTANCE_SIZE: vec2f = vec2f(256.0, 64.0);
const MULTISCATTER_SIZE: f32 = 32.0;
const SKY_VIEW_SIZE: vec2f = vec2f(192.0, 108.0);

struct Medium {
    scattering: vec3f,
    extinction: vec3f,
    rayleigh: vec3f,
    mie: f32,
}

fn sampleMedium(altitude: f32) -> Medium {
    let h = max(altitude, 0.0);
    let rayleighDensity = exp(-h / atmosphere.rayleighScaleHeight);
    let mieDensity = exp(-h / atmosphere.mieScaleHeight);
    let ozoneDensity = max(0.0, 1.0 - abs(h - atmosphere.ozoneCentre) / atmosphere.ozoneHalfWidth);
    let rayleigh = atmosphere.rayleighScattering * rayleighDensity;
    let mie = atmosphere.mieScattering * mieDensity;
    let mieExtinction = (atmosphere.mieScattering + atmosphere.mieAbsorption) * mieDensity;
    let ozone = atmosphere.ozoneAbsorption * ozoneDensity;
    var medium: Medium;
    medium.scattering = rayleigh + vec3f(mie);
    medium.extinction = rayleigh + vec3f(mieExtinction) + ozone;
    medium.rayleigh = rayleigh;
    medium.mie = mie;
    return medium;
}

fn rayleighPhase(cosTheta: f32) -> f32 {
    return 3.0 / (16.0 * PI) * (1.0 + cosTheta * cosTheta);
}

// Cornette-Shanks phase function for aerosols.
fn miePhase(cosTheta: f32, g: f32) -> f32 {
    let g2 = g * g;
    let denominator = pow(max(1.0 + g2 - 2.0 * g * cosTheta, 1e-4), 1.5);
    return 3.0 / (8.0 * PI) * (1.0 - g2) * (1.0 + cosTheta * cosTheta) / ((2.0 + g2) * denominator);
}

// Nearest non-negative distance from `origin` (relative to the planet centre) to a sphere, or -1.
fn raySphere(origin: vec3f, direction: vec3f, radius: f32) -> f32 {
    let b = dot(origin, direction);
    let c = dot(origin, origin) - radius * radius;
    let discriminant = b * b - c;
    if (discriminant < 0.0) {
        return -1.0;
    }
    let root = sqrt(discriminant);
    let near = -b - root;
    if (near >= 0.0) {
        return near;
    }
    let far = -b + root;
    if (far >= 0.0) {
        return far;
    }
    return -1.0;
}

// Distance to the ground if the ray hits it, otherwise to the top of the atmosphere.
fn distanceToBoundary(origin: vec3f, direction: vec3f) -> f32 {
    let ground = raySphere(origin, direction, atmosphere.bottomRadius);
    if (ground > 0.0) {
        return ground;
    }
    return max(raySphere(origin, direction, atmosphere.topRadius), 0.0);
}

fn unitToSubUv(unit: f32, resolution: f32) -> f32 {
    return (unit + 0.5 / resolution) * (resolution / (resolution + 1.0));
}

fn subUvToUnit(uv: f32, resolution: f32) -> f32 {
    return (uv - 0.5 / resolution) * (resolution / (resolution - 1.0));
}

// Bruneton's transmittance parameterisation: (radius, cos zenith) <-> uv.
fn transmittanceUv(radius: f32, cosZenith: f32) -> vec2f {
    let top = atmosphere.topRadius;
    let bottom = atmosphere.bottomRadius;
    let horizon = sqrt(top * top - bottom * bottom);
    let rho = sqrt(max(radius * radius - bottom * bottom, 0.0));
    let discriminant = radius * radius * (cosZenith * cosZenith - 1.0) + top * top;
    let toTop = max(0.0, -radius * cosZenith + sqrt(max(discriminant, 0.0)));
    let shortest = top - radius;
    let longest = rho + horizon;
    let xMu = (toTop - shortest) / (longest - shortest);
    let xR = rho / horizon;
    return vec2f(unitToSubUv(xMu, TRANSMITTANCE_SIZE.x), unitToSubUv(xR, TRANSMITTANCE_SIZE.y));
}

fn transmittanceParameters(uv: vec2f) -> vec2f {
    let xMu = subUvToUnit(uv.x, TRANSMITTANCE_SIZE.x);
    let xR = subUvToUnit(uv.y, TRANSMITTANCE_SIZE.y);
    let top = atmosphere.topRadius;
    let bottom = atmosphere.bottomRadius;
    let horizon = sqrt(top * top - bottom * bottom);
    let rho = horizon * xR;
    let radius = sqrt(rho * rho + bottom * bottom);
    let shortest = top - radius;
    let longest = rho + horizon;
    let toTop = shortest + xMu * (longest - shortest);
    var cosZenith = 1.0;
    if (toTop > 0.0) {
        cosZenith = (horizon * horizon - rho * rho - toTop * toTop) / (2.0 * radius * toTop);
    }
    return vec2f(radius, clamp(cosZenith, -1.0, 1.0));
}

fn multiScatterUv(radius: f32, cosSunZenith: f32) -> vec2f {
    let height = (radius - atmosphere.bottomRadius) / (atmosphere.topRadius - atmosphere.bottomRadius);
    let u = unitToSubUv(saturate(cosSunZenith * 0.5 + 0.5), MULTISCATTER_SIZE);
    let v = unitToSubUv(saturate(height), MULTISCATTER_SIZE);
    return vec2f(u, v);
}

// Position of a world point (metres, camera-relative xz) in the planet frame, in kilometres.
fn planetPosition(world: vec3f, cameraWorld: vec3f) -> vec3f {
    let offset = (world - cameraWorld) * 0.001;
    return vec3f(offset.x, atmosphere.bottomRadius + atmosphere.cameraAltitude + offset.y, offset.z);
}
