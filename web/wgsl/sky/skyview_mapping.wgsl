// SPDX-License-Identifier: Apache-2.0
// Sky-view LUT parameterisation (Hillaire 2020). The vertical axis splits at the horizon
// with quadratic spacing toward it; the horizontal axis is azimuth from the sun, quadratic
// toward the sun. The sky is symmetric about the sun's vertical plane, so 0..pi suffices.

fn sunAzimuth() -> f32 {
    return atan2(atmosphere.sunDirection.z, atmosphere.sunDirection.x);
}

fn horizonAngles(radius: f32) -> vec2f {
    let horizonDistance = sqrt(max(radius * radius - atmosphere.bottomRadius * atmosphere.bottomRadius, 0.0));
    let beta = acos(clamp(horizonDistance / radius, -1.0, 1.0));
    return vec2f(PI - beta, beta);
}

fn skyViewDirection(uv: vec2f, radius: f32) -> vec3f {
    let unit = vec2f(subUvToUnit(uv.x, SKY_VIEW_SIZE.x), subUvToUnit(uv.y, SKY_VIEW_SIZE.y));
    let angles = horizonAngles(radius);
    var viewZenith = 0.0;
    if (unit.y < 0.5) {
        let coord = 1.0 - 2.0 * unit.y;
        viewZenith = angles.x * (1.0 - coord * coord);
    } else {
        let coord = unit.y * 2.0 - 1.0;
        viewZenith = angles.x + angles.y * coord * coord;
    }
    let cosAzimuth = -(unit.x * unit.x * 2.0 - 1.0);
    let azimuth = sunAzimuth() + acos(clamp(cosAzimuth, -1.0, 1.0));
    let sinZenith = sin(viewZenith);
    return vec3f(sinZenith * cos(azimuth), cos(viewZenith), sinZenith * sin(azimuth));
}

fn skyViewUv(direction: vec3f, radius: f32) -> vec2f {
    let angles = horizonAngles(radius);
    let viewZenith = acos(clamp(direction.y, -1.0, 1.0));
    var v = 0.0;
    if (viewZenith < angles.x) {
        let coord = sqrt(max(1.0 - viewZenith / angles.x, 0.0));
        v = (1.0 - coord) * 0.5;
    } else {
        let coord = sqrt(max((viewZenith - angles.x) / angles.y, 0.0));
        v = coord * 0.5 + 0.5;
    }
    let horizontal = vec2f(direction.x, direction.z);
    let sunHorizontal = vec2f(atmosphere.sunDirection.x, atmosphere.sunDirection.z);
    let lengths = length(horizontal) * length(sunHorizontal);
    var cosAzimuth = 1.0;
    if (lengths > 1e-6) {
        cosAzimuth = dot(horizontal, sunHorizontal) / lengths;
    }
    let u = sqrt(saturate(0.5 - 0.5 * cosAzimuth));
    return vec2f(unitToSubUv(u, SKY_VIEW_SIZE.x), unitToSubUv(v, SKY_VIEW_SIZE.y));
}
