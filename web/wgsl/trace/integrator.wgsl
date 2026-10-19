// SPDX-License-Identifier: Apache-2.0
// Progressive path tracer: one sample per pixel per dispatch, accumulated on the GPU.
// Sun next-event estimation over the finite solar disk gives soft shadows; bounces sample
// the cosine hemisphere and pick up the sky-view LUT when they escape.

#include "trace/frame.wgsl"
#include "trace/sampling.wgsl"
#include "sky/atmosphere.wgsl"
#include "trace/scene.wgsl"
#include "trace/sky.wgsl"
#include "trace/fog.wgsl"
#include "trace/material.wgsl"
#include "trace/surface.wgsl"
#include "trace/water.wgsl"

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<uniform> atmosphere: Atmosphere;
@group(0) @binding(2) var<uniform> fields: Fields;
@group(0) @binding(3) var nearHeight: texture_2d<f32>;
@group(0) @binding(4) var nearPyramid: texture_2d<f32>;
@group(0) @binding(5) var farHeight: texture_2d<f32>;
@group(0) @binding(6) var farPyramid: texture_2d<f32>;
@group(0) @binding(7) var masks: texture_2d<f32>;
@group(0) @binding(8) var transmittanceLut: texture_2d<f32>;
@group(0) @binding(9) var skyViewLut: texture_2d<f32>;
@group(0) @binding(10) var aerialScatter: texture_3d<f32>;
@group(0) @binding(11) var aerialTransmittance: texture_3d<f32>;
@group(0) @binding(12) var skySampler: sampler;
@group(0) @binding(13) var<storage, read_write> accumulation: array<vec4f>;

const VIEW_IMAGE: u32 = 0u;
const VIEW_ALBEDO: u32 = 1u;
const VIEW_FLOW: u32 = 2u;
const VIEW_SEDIMENT: u32 = 3u;
const VIEW_CURVATURE: u32 = 4u;
const VIEW_NORMAL: u32 = 5u;

fn debugColour(point: SurfacePoint) -> vec3f {
    switch (frame.viewMode) {
        case VIEW_ALBEDO: {
            return point.albedo;
        }
        case VIEW_FLOW: {
            return vec3f(0.05, 0.1, 0.2) + vec3f(0.2, 0.6, 1.0) * point.land.flow;
        }
        case VIEW_SEDIMENT: {
            let deposit = vec3f(1.0, 0.75, 0.35) * point.land.sediment;
            return vec3f(0.08) + deposit + vec3f(0.2, 0.45, 1.0) * point.land.erosion;
        }
        case VIEW_CURVATURE: {
            return vec3f(0.5 + 0.5 * point.land.fine, 0.5, 0.5 - 0.5 * point.land.fine);
        }
        default: {
            return point.normal * 0.5 + 0.5;
        }
    }
}

fn tracePath(origin: vec3f, direction: vec3f) -> vec3f {
    var radiance = vec3f(0.0);
    var throughput = vec3f(1.0);
    var rayOrigin = origin;
    var rayDirection = direction;
    for (var bounce = 0u; bounce <= frame.bounces; bounce++) {
        let effort = select(BOUNCE_EFFORT, 1.0, bounce == 0u);
        let hit = traceScene(rayOrigin, rayDirection, MAX_DISTANCE, effort);
        if (bounce == 0u) {
            let water = waterDistance(rayOrigin, rayDirection);
            if (water > 0.0 && (hit.field == FIELD_NONE || water < hit.t)) {
                if (frame.viewMode != VIEW_IMAGE) {
                    return vec3f(0.1, 0.25, 0.45);
                }
                let aerial = aerialPerspective(rayDirection, water);
                let fog = fogScatter(rayOrigin, rayDirection, water);
                let surface = shadeWater(rayOrigin + rayDirection * water, rayDirection, water);
                return aerial.luminance + fog.inscatter + aerial.transmittance * fog.transmittance * surface;
            }
        }
        if (hit.field == FIELD_NONE) {
            if (bounce == 0u) {
                let sky = skyRadiance(rayDirection) + sunDisk(rayDirection);
                let fog = fogScatter(rayOrigin, rayDirection, MAX_DISTANCE);
                radiance += sky * fog.transmittance + fog.inscatter;
            } else {
                radiance += limitLuminance(throughput * skyRadiance(rayDirection), INDIRECT_LIMIT);
            }
            break;
        }
        let position = rayOrigin + rayDirection * hit.t;
        let point = shadePoint(position, hit.field, hit.t);
        if (bounce == 0u) {
            if (frame.viewMode != VIEW_IMAGE) {
                return debugColour(point);
            }
            let aerial = aerialPerspective(rayDirection, hit.t);
            let fog = fogScatter(rayOrigin, rayDirection, hit.t);
            radiance += aerial.luminance + fog.inscatter;
            throughput *= aerial.transmittance * fog.transmittance;
        }
        var direct = throughput * directSun(point, hit.t);
        if (bounce > 0u) {
            direct = limitLuminance(direct, INDIRECT_LIMIT);
        }
        radiance += direct;
        if (bounce == frame.bounces) {
            break;
        }
        rayOrigin = surfaceOffset(point, hit.t);
        rayDirection = cosineHemisphere(point.normal, random2());
        throughput *= point.albedo;
    }
    return radiance;
}

@compute @workgroup_size(8, 8)
fn render(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= frame.width || id.y >= frame.height) {
        return;
    }
    seedRandom(id.xy, frame.sampleIndex, frame.seed);
    let pixel = vec2f(id.xy) + pixelJitter(id.xy, frame.sampleIndex);
    let resolution = vec2f(f32(frame.width), f32(frame.height));
    let ndc = vec2f(pixel.x / resolution.x * 2.0 - 1.0, 1.0 - pixel.y / resolution.y * 2.0);
    var radiance = tracePath(frame.cameraPosition, cameraDirection(ndc));
    if (!all(radiance >= vec3f(0.0)) || !all(radiance < vec3f(1e6))) {
        radiance = vec3f(0.0);
    }
    let index = id.y * frame.width + id.x;
    if (frame.sampleIndex == 0u) {
        accumulation[index] = vec4f(radiance, 1.0);
    } else {
        accumulation[index] += vec4f(radiance, 1.0);
    }
}
