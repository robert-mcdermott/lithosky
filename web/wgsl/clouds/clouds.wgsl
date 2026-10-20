// SPDX-License-Identifier: Apache-2.0
// Volumetric clouds in a shell around the planet, after Schneider, "The Real-Time
// Volumetric Cloudscapes of Horizon Zero Dawn" (SIGGRAPH 2015) and "Nubis" (2017):
//   shape     weather-map coverage x height profile, eroded by Perlin-Worley then Worley noise
//   lighting  a short march toward the sun, Beer-powder, a two-lobe phase function and a
//             multiple-scattering approximation (Wrenninge, "Oz: The Great and Volumetric",
//             2013), plus sky light from above
//   cirrus    a thin wispy layer at 9 km
// Positions are planet-frame kilometres (see planetPosition). Each sample marches few,
// jittered steps; progressive accumulation integrates them into smooth clouds.
// Including modules declare `clouds`, `weatherMap`, `shapeNoise`, `detailNoise`,
// `cloudSampler`, `atmosphere`, `frame` and the sky lookups.

// Altitudes, thicknesses and scales are kilometres; extinction is per kilometre at density 1.
struct Clouds {
    coverage: f32,
    cloudType: f32,
    baseAltitude: f32,
    thickness: f32,
    extinction: f32,
    cirrus: f32,
    weatherExtent: f32,
    shapeScale: f32,
    seedOffset: vec2f,
    detailScale: f32,
    enabled: u32,
}

const CLOUD_MAX_DISTANCE: f32 = 200.0;
// Density fades out over the far part of the march so the layer never ends in a hard edge.
const CLOUD_FADE_START: f32 = 120.0;
const CLOUD_VIEW_STEPS: u32 = 40u;
const CLOUD_LIGHT_STEPS: u32 = 5u;
const CLOUD_SHADOW_STEPS: u32 = 6u;
const CIRRUS_ALTITUDE: f32 = 9.0;
const CLOUD_ALBEDO: f32 = 0.98;
const CLOUD_AMBIENT: f32 = 0.55;

struct CloudSample {
    inscatter: vec3f,
    transmittance: f32,
    // Transmittance-weighted mean distance of the scattered light, for aerial perspective.
    distance: f32,
}

fn cloudsActive() -> bool {
    return clouds.enabled == 1u;
}

fn cloudRemap(value: f32, low: f32, high: f32, newLow: f32, newHigh: f32) -> f32 {
    return newLow + (value - low) / max(high - low, 1e-5) * (newHigh - newLow);
}

// Fraction of cloud allowed at height fraction h for a type in 0..1:
// 0 stratus (a thin low band), 0.5 cumulus (rounded heaps), 1 cumulonimbus (tall towers).
fn heightProfile(h: f32, cloudType: f32) -> f32 {
    let stratus = smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.18, 0.35, h));
    let cumulus = smoothstep(0.0, 0.12, h) * (1.0 - smoothstep(0.4, 0.9, h));
    let towers = smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.82, 1.0, h));
    if (cloudType < 0.5) {
        return mix(stratus, cumulus, cloudType * 2.0);
    }
    return mix(cumulus, towers, cloudType * 2.0 - 1.0);
}

// World kilometres (x east, altitude, z south) of a planet-frame point.
fn cloudWorld(position: vec3f) -> vec3f {
    let altitude = length(position) - atmosphere.bottomRadius;
    return vec3f(frame.cameraPosition.x * 0.001 + position.x, altitude, frame.cameraPosition.z * 0.001 + position.z);
}

// Cloud density (0..1) at a planet-frame point. `detailed` adds the edge erosion.
fn cloudDensity(position: vec3f, detailed: bool) -> f32 {
    let world = cloudWorld(position);
    let h = (world.y - clouds.baseAltitude) / clouds.thickness;
    if (h <= 0.0 || h >= 1.0) {
        return 0.0;
    }
    let uv = world.xz / clouds.weatherExtent + 0.5;
    let weather = textureSampleLevel(weatherMap, cloudSampler, uv, 0.0);
    let coverage = saturate(clouds.coverage * (0.35 + 1.3 * weather.r));
    if (coverage <= 0.01) {
        return 0.0;
    }
    let cloudType = saturate(clouds.cloudType + (weather.g - 0.5) * 0.35);
    let shapePoint = vec3f(world.x + clouds.seedOffset.x, world.y, world.z + clouds.seedOffset.y);
    let shape = textureSampleLevel(shapeNoise, cloudSampler, shapePoint / clouds.shapeScale, 0.0);
    let lowFrequency = shape.g * 0.625 + shape.b * 0.25 + shape.a * 0.125;
    let base = cloudRemap(shape.r, lowFrequency - 1.0, 1.0, 0.0, 1.0) * heightProfile(h, cloudType);
    let shaped = saturate(cloudRemap(base, 1.0 - coverage, 1.0, 0.0, 1.0)) * coverage;
    if (!detailed || shaped <= 0.0) {
        return shaped;
    }
    let detail = textureSampleLevel(detailNoise, cloudSampler, shapePoint / clouds.detailScale, 0.0);
    let highFrequency = detail.r * 0.625 + detail.g * 0.25 + detail.b * 0.125;
    let erosion = mix(highFrequency, 1.0 - highFrequency, saturate(h * 4.0));
    return saturate(cloudRemap(shaped, erosion * 0.35, 1.0, 0.0, 1.0));
}

// Up to two [near, far] spans (km) where the ray lies inside the cloud shell.
struct ShellSpans {
    first: vec2f,
    second: vec2f,
}

fn sphereSpan(origin: vec3f, direction: vec3f, radius: f32) -> vec2f {
    let b = dot(origin, direction);
    let c = dot(origin, origin) - radius * radius;
    let discriminant = b * b - c;
    if (discriminant < 0.0) {
        return vec2f(1.0, -1.0);
    }
    let root = sqrt(discriminant);
    return vec2f(-b - root, -b + root);
}

fn shellSpans(origin: vec3f, direction: vec3f, limit: f32) -> ShellSpans {
    var spans: ShellSpans;
    spans.first = vec2f(1.0, -1.0);
    spans.second = vec2f(1.0, -1.0);
    let bottom = atmosphere.bottomRadius + clouds.baseAltitude;
    let outer = sphereSpan(origin, direction, bottom + clouds.thickness);
    if (outer.y <= 0.0) {
        return spans;
    }
    let start = max(outer.x, 0.0);
    let end = min(outer.y, limit);
    let inner = sphereSpan(origin, direction, bottom);
    if (inner.x > inner.y || inner.y <= start || inner.x >= end) {
        spans.first = vec2f(start, end);
        return spans;
    }
    spans.first = vec2f(start, min(max(inner.x, start), end));
    spans.second = vec2f(max(inner.y, start), end);
    return spans;
}

// Cheap optical depth toward the sun from a point inside the clouds.
fn lightOpticalDepth(position: vec3f) -> f32 {
    var depth = 0.0;
    var stepLength = clouds.thickness * 0.06;
    var travelled = stepLength * 0.5;
    for (var i = 0u; i < CLOUD_LIGHT_STEPS; i++) {
        depth += cloudDensity(position + frame.sunDirection * travelled, false) * stepLength;
        stepLength *= 1.8;
        travelled += stepLength;
    }
    return depth * clouds.extinction;
}

fn cloudPhase(cosTheta: f32, g: f32) -> f32 {
    return mix(henyeyGreenstein(cosTheta, g), henyeyGreenstein(cosTheta, -0.25 * g), 0.25);
}

// Radiance scattered toward the viewer per unit extinction at a cloud point.
fn cloudLight(position: vec3f, density: f32, cosTheta: f32) -> vec3f {
    let opticalDepth = lightOpticalDepth(position);
    var scatter = 0.0;
    var a = 1.0;
    var b = 1.0;
    var c = 1.0;
    // Octaves of weaker, less forward-peaked scattering that reach deeper stand in for the
    // light bounced many times inside the cloud.
    for (var octave = 0u; octave < 4u; octave++) {
        scatter += a * cloudPhase(cosTheta, 0.8 * c) * exp(-b * opticalDepth);
        a *= 0.55;
        b *= 0.25;
        c *= 0.5;
    }
    // Beer-powder darkens thin edges seen away from the sun; toward the sun those same edges
    // glow (the silver lining), so the effect fades out as the view turns sunward.
    let powder = 1.0 - exp(-2.0 * density * clouds.extinction * 0.08);
    let powderAmount = 0.6 * (1.0 - saturate(cosTheta * 1.5));
    let sun = sunTransmittance(position, frame.sunDirection) * frame.sunIlluminance;
    let height = saturate((cloudWorld(position).y - clouds.baseAltitude) / clouds.thickness);
    let skyLight = skyRadiance(vec3f(0.0, 1.0, 0.0)) * CLOUD_AMBIENT * (0.5 + 0.5 * height);
    // Sunlit ground bounces warm light into cloud bases.
    let groundLight = sun * max(frame.sunDirection.y, 0.0) * 0.06 * (1.0 - height);
    return CLOUD_ALBEDO * (sun * scatter * mix(1.0, powder, powderAmount) * 2.0 + skyLight + groundLight);
}

fn marchSpan(state: ptr<function, CloudSample>, origin: vec3f, direction: vec3f, span: vec2f, steps: u32) {
    if (span.y <= span.x || (*state).transmittance < 0.01) {
        return;
    }
    let spanLength = min(span.y, CLOUD_MAX_DISTANCE) - span.x;
    if (spanLength <= 0.0) {
        return;
    }
    let stepLength = spanLength / f32(steps);
    let cosTheta = dot(direction, frame.sunDirection);
    var t = span.x + stepLength * random1();
    for (var i = 0u; i < steps; i++) {
        let position = origin + direction * t;
        let fade = 1.0 - smoothstep(CLOUD_FADE_START, CLOUD_MAX_DISTANCE, t);
        let density = cloudDensity(position, true) * fade;
        if (density > 0.0) {
            let extinction = density * clouds.extinction;
            let stepTransmittance = exp(-extinction * stepLength);
            let source = cloudLight(position, density, cosTheta);
            let gained = (*state).transmittance * (1.0 - stepTransmittance);
            (*state).inscatter += source * gained;
            (*state).distance += t * gained;
            (*state).transmittance *= stepTransmittance;
            if ((*state).transmittance < 0.01) {
                break;
            }
        }
        t += stepLength;
    }
}

// The thin cirrus veil, lit by the sun from behind and the sky from above.
fn cirrusLayer(state: ptr<function, CloudSample>, origin: vec3f, direction: vec3f, limit: f32) {
    if (clouds.cirrus <= 0.0 || (*state).transmittance < 0.01) {
        return;
    }
    let span = sphereSpan(origin, direction, atmosphere.bottomRadius + CIRRUS_ALTITUDE);
    let t = select(span.y, span.x, span.x > 0.0);
    if (t <= 0.0 || t > min(limit, 400.0)) {
        return;
    }
    let world = cloudWorld(origin + direction * t);
    // Wind-stretched along a diagonal and domain-warped, so the veil breaks into wisps.
    let wind = mat2x2f(0.87, 0.5, -0.5, 0.87) * world.xz;
    let warp = textureSampleLevel(shapeNoise, cloudSampler, vec3f(wind / 90.0, 0.71), 0.0).gb - 0.5;
    let streak = vec3f(wind.x / 45.0 + warp.x * 0.6 + clouds.seedOffset.x * 0.01, 0.37, wind.y / 16.0 + warp.y * 0.8);
    let wisps = textureSampleLevel(shapeNoise, cloudSampler, streak, 0.0);
    let fine = textureSampleLevel(detailNoise, cloudSampler, streak * vec3f(4.0, 1.0, 2.0), 0.0).r;
    let amount = saturate((wisps.g * 0.6 + wisps.b * 0.2 + fine * 0.2 - 0.5) * 3.0) * clouds.cirrus;
    let opticalDepth = amount * 0.6;
    if (opticalDepth <= 0.0) {
        return;
    }
    let position = origin + direction * t;
    let sun = sunTransmittance(position, frame.sunDirection) * frame.sunIlluminance;
    let cosTheta = dot(direction, frame.sunDirection);
    let light = sun * cloudPhase(cosTheta, 0.6) * 1.5 + skyRadiance(vec3f(0.0, 1.0, 0.0)) * 0.6;
    let gained = (*state).transmittance * (1.0 - exp(-opticalDepth));
    (*state).inscatter += light * gained;
    (*state).distance += t * gained;
    (*state).transmittance *= exp(-opticalDepth);
}

// Past the marched range, a broken layer seen edge-on closes up into a continuous deck. Rays
// that reach the layer out there see that deck, so the clouds run on to the horizon
// instead of stopping at a band of clear sky.
fn farDeck(state: ptr<function, CloudSample>, origin: vec3f, direction: vec3f, limit: f32) {
    if (clouds.coverage <= 0.0 || (*state).transmittance < 0.01) {
        return;
    }
    // Shaded just inside the side of the layer the ray enters: the bases from below, the tops
    // from above, matching what the marched clouds show nearer in.
    let bottom = atmosphere.bottomRadius + clouds.baseAltitude;
    let below = length(origin) < bottom + clouds.thickness * 0.5;
    let entry = sphereSpan(origin, direction, bottom + clouds.thickness * select(0.85, 0.15, below));
    let t = select(entry.y, entry.x, entry.x > 0.0);
    if (t <= CLOUD_FADE_START || t > limit) {
        return;
    }
    let ground = raySphere(origin, direction, atmosphere.bottomRadius);
    if (ground > 0.0 && ground < t) {
        return;
    }
    // Takes over as the marched clouds fade out.
    let opacity = (1.0 - exp(-4.0 * clouds.coverage)) * smoothstep(CLOUD_FADE_START, CLOUD_MAX_DISTANCE, t);
    let position = origin + direction * t;
    let light = cloudLight(position, 0.5, dot(direction, frame.sunDirection));
    let gained = (*state).transmittance * opacity;
    (*state).inscatter += light * gained;
    (*state).distance += t * gained;
    (*state).transmittance *= 1.0 - opacity;
}

// Clouds along a ray from world point `origin` (metres) up to `limit` metres.
fn traceClouds(origin: vec3f, direction: vec3f, limit: f32, steps: u32) -> CloudSample {
    var result: CloudSample;
    result.inscatter = vec3f(0.0);
    result.transmittance = 1.0;
    result.distance = 0.0;
    if (!cloudsActive()) {
        return result;
    }
    let start = planetPosition(origin, frame.cameraPosition);
    let limitKm = limit * 0.001;
    let spans = shellSpans(start, direction, limitKm);
    marchSpan(&result, start, direction, spans.first, steps);
    marchSpan(&result, start, direction, spans.second, steps);
    // An open-sky ray (no terrain within the march) may meet the deck far beyond it.
    farDeck(&result, start, direction, select(limitKm, 1e5, limitKm >= CLOUD_MAX_DISTANCE));
    cirrusLayer(&result, start, direction, limitKm);
    let gathered = 1.0 - result.transmittance;
    result.distance = select(0.0, result.distance / gathered * 1000.0, gathered > 1e-4);
    return result;
}

// Sunlight that passes the clouds above a world point (0..1).
fn cloudShadow(world: vec3f) -> f32 {
    if (!cloudsActive()) {
        return 1.0;
    }
    let start = planetPosition(world, frame.cameraPosition);
    let spans = shellSpans(start, frame.sunDirection, CLOUD_MAX_DISTANCE);
    let span = select(spans.first, spans.second, spans.first.y <= spans.first.x);
    if (span.y <= span.x) {
        return 1.0;
    }
    let stepLength = (span.y - span.x) / f32(CLOUD_SHADOW_STEPS);
    var depth = 0.0;
    var t = span.x + stepLength * random1();
    for (var i = 0u; i < CLOUD_SHADOW_STEPS; i++) {
        depth += cloudDensity(start + frame.sunDirection * t, false) * stepLength;
        t += stepLength;
    }
    // Thick clouds still pass some light scattered forward through them.
    let opticalDepth = depth * clouds.extinction;
    let direct = exp(-opticalDepth);
    return direct + (1.0 - direct) * 0.22 * exp(-opticalDepth * 0.03);
}

// Sky light under clouds: the more cover, the more the clear sky gives way to grey cloud light.
fn cloudySky(direction: vec3f) -> vec3f {
    let clear = skyRadiance(direction);
    if (!cloudsActive()) {
        return clear;
    }
    let cover = clouds.coverage * clouds.coverage * 0.85;
    let overcast = skyRadiance(vec3f(0.0, 1.0, 0.0)) * 0.7 + frame.sunIlluminance * 0.012 * max(frame.sunDirection.y, 0.0);
    return mix(clear, overcast * (1.0 - 0.45 * clouds.coverage), cover * saturate(direction.y * 4.0 + 0.3));
}

// Composites clouds over a background that already carries its own atmosphere.
fn overClouds(background: vec3f, direction: vec3f, layer: CloudSample) -> vec3f {
    if (layer.transmittance >= 0.999) {
        return background;
    }
    let air = aerialPerspective(direction, layer.distance);
    let gathered = 1.0 - layer.transmittance;
    return background * layer.transmittance + layer.inscatter * air.transmittance + air.luminance * gathered;
}
