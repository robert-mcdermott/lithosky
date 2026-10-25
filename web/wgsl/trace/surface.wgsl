// SPDX-License-Identifier: Apache-2.0
// Shading a terrain or tree hit: material, detail normal, and sun next-event estimation over
// the finite solar disk (soft shadows). Including modules declare the tracer bindings.

const MAX_DISTANCE: f32 = 250000.0;
const SHADOW_DISTANCE: f32 = 60000.0;
const SHADOW_EFFORT: f32 = 0.6;
const BOUNCE_EFFORT: f32 = 0.5;
const INDIRECT_LIMIT: f32 = 1.5;
// Share of sunlight a broadleaf crown passes to its shaded side.
const FOLIAGE_TRANSLUCENCY: f32 = 0.3;

struct SurfacePoint {
    position: vec3f,
    normal: vec3f,
    albedo: vec3f,
    roughness: f32,
    wetness: f32,
    snow: f32,
    land: Landform,
    // 0 for ground; for a crown, how much light its foliage lets through (1 broadleaf).
    foliage: f32,
    // The near cell of the tree hit (crowns only).
    tree: vec2i,
}

// Dielectric reflectance at normal incidence (rock, soil, snow, water films).
const SURFACE_F0: f32 = 0.04;

// Metres a pixel spans per metre of distance; a region render's pixels cover only its window
// of the view.
fn footprintSlope() -> f32 {
    return 2.0 * frame.tanHalfFov * frame.window.w / f32(frame.height);
}

fn pixelFootprint(depth: f32) -> f32 {
    return depth * footprintSlope();
}

// `primary` marks camera-ray hits, which get the full material and detail normals.
fn shadePoint(position: vec3f, field: u32, depth: f32, primary: bool) -> SurfacePoint {
    var point: SurfacePoint;
    point.position = position;
    let gradient = sceneGradient(position.xz, field);
    let baseNormal = normalize(vec3f(-gradient.x, 1.0, -gradient.y));
    point.land = landformAt(position, baseNormal, field);
    point.foliage = 0.0;
    point.tree = NOWHERE;
    let material = terrainMaterial(position, baseNormal, point.land, primary, field == FIELD_NEAR && treesEnabled());
    point.albedo = material.albedo;
    point.roughness = material.roughness;
    point.wetness = material.wetness;
    point.snow = material.snow;
    var coarsest = 2.0 * fields.near.spacing;
    if (field == FIELD_FAR) {
        coarsest = 2.0 * fields.far.spacing;
    }
    let rockiness = saturate(point.land.slope * 4.0);
    let footprint = pixelFootprint(depth);
    var detail = vec2f(0.0);
    if (primary) {
        let bare = (1.0 - point.snow) * (1.0 - 0.6 * point.wetness);
        detail = detailGradient(position.xz, footprint, coarsest, (0.4 + 0.8 * rockiness) * (1.0 - 0.7 * point.snow));
        detail += rockDetailGradient(position, gradient, footprint, rockiness * bare);
    }
    point.normal = normalize(vec3f(-gradient.x - detail.x, 1.0, -gradient.y - detail.y));
    return point;
}

// Shading for a tree hit: bark on the trunk; on the crown, the shape's normal tilted by
// foliage clumps, and a per-tree tone.
fn shadeTree(position: vec3f, cell: vec2i) -> SurfacePoint {
    let tree = treeAt(cell);
    let base = tree.base;
    var point: SurfacePoint;
    point.position = position;
    point.roughness = 0.85;
    point.wetness = 0.0;
    point.snow = 0.0;
    point.tree = cell;
    point.land = landformAt(position, vec3f(0.0, 1.0, 0.0), FIELD_NEAR);
    let axis = position.xz - tree.centre;
    if (dot(axis, axis) < pow(trunkRadius(tree) * 1.05, 2.0) && position.y < base + TRUNK_TOP * tree.height) {
        point.normal = normalize(vec3f(axis.x, 0.0, axis.y) + vec3f(1e-4, 0.0, 0.0));
        point.albedo = vec3f(0.07, 0.055, 0.042) * (0.8 + 0.4 * fract(position.y * 1.7));
        point.foliage = 0.0;
        return point;
    }
    var normal: vec3f;
    // 0 at the bottom of the crown, 1 at its top.
    var rise: f32;
    var leaves: vec3f;
    if (tree.conifer) {
        let crown = CONIFER_CROWN * tree.height;
        let p = position - vec3f(tree.centre.x, base + tree.height, tree.centre.y);
        let k = tree.radius / crown;
        if (p.y < -crown + 0.02) {
            normal = vec3f(0.0, -1.0, 0.0);
        } else {
            normal = normalize(vec3f(p.x, 1e-4 - k * k * p.y, p.z));
        }
        rise = saturate(1.0 + p.y / crown);
        leaves = surface.forest.rgb * 2.4;
    } else {
        let centre = vec3f(tree.centre.x, base + BROADLEAF_CENTRE * tree.height, tree.centre.y);
        let p = position - centre;
        let depth = BROADLEAF_DEPTH * tree.height;
        normal = normalize(vec3f(p.x / (tree.radius * tree.radius), p.y / (depth * depth), p.z / (tree.radius * tree.radius)));
        rise = saturate(0.5 + 0.5 * p.y / depth);
        leaves = surface.forest.rgb * vec3f(3.4, 3.8, 2.6);
    }
    let clump = textureSampleLevel(detailNoise, cloudSampler, position / 6.0, 0.0);
    point.normal = normalize(normal + (clump.rgb - 0.5) * 1.4);
    // Lower and inner foliage sits in the crown's own shade, which its shadow rays skip.
    let shade = mix(0.45, 1.0, rise) * mix(0.6, 1.25, clump.r) * mix(1.0, 0.35, crownDepth(tree, position));
    let tone = treeRandom(cell, 0x51EDu).w;
    point.albedo = leaves * shade * (0.75 + 0.5 * tone);
    // Broad leaves let more light through than needles.
    point.foliage = select(1.0, 0.5, tree.conifer);
    return point;
}

fn shadeHit(position: vec3f, hit: SceneHit, depth: f32, primary: bool) -> SurfacePoint {
    if (hit.field == FIELD_TREE) {
        return shadeTree(position, hit.tree);
    }
    return shadePoint(position, hit.field, depth, primary);
}

fn surfaceOffset(point: SurfacePoint, depth: f32) -> vec3f {
    let lift = 0.05 + depth * 2e-5;
    return point.position + point.normal * lift + vec3f(0.0, lift, 0.0);
}

// Lambertian diffuse plus a GGX specular lobe (Smith masking, Schlick Fresnel), so wet rock
// and snow catch the light while dry ground stays matte.
fn surfaceBrdf(point: SurfacePoint, view: vec3f, light: vec3f) -> vec3f {
    let normal = point.normal;
    let nl = max(dot(normal, light), 0.0);
    let nv = max(dot(normal, view), 1e-3);
    let halfway = normalize(light + view);
    let nh = max(dot(normal, halfway), 0.0);
    let vh = max(dot(view, halfway), 0.0);
    let alpha = max(point.roughness * point.roughness, 0.02);
    let alpha2 = alpha * alpha;
    let d = alpha2 / (PI * pow(nh * nh * (alpha2 - 1.0) + 1.0, 2.0));
    let k = alpha * 0.5;
    let g = (nl / (nl * (1.0 - k) + k)) * (nv / (nv * (1.0 - k) + k));
    let fresnel = SURFACE_F0 + (1.0 - SURFACE_F0) * pow(1.0 - vh, 5.0);
    let specular = d * g * fresnel / max(4.0 * nl * nv, 1e-4);
    return point.albedo * INV_PI * (1.0 - fresnel) + vec3f(specular);
}

// A crown's own tree is left out of its shadow ray: the shape is convex, so it can't shade
// its sunlit side, and its shaded side takes light through the foliage instead.
fn directSun(point: SurfacePoint, depth: f32, view: vec3f) -> vec3f {
    let direction = sampleCone(frame.sunDirection, frame.sunCosRadius, sample2());
    let cosine = dot(point.normal, direction);
    if (cosine <= 0.0 && point.foliage <= 0.0) {
        return vec3f(0.0);
    }
    treeSkip = point.tree;
    anyHit = true;
    rayFootprint = vec2f(pixelFootprint(depth), 0.0);
    let shadow = traceScene(surfaceOffset(point, depth), direction, SHADOW_DISTANCE, SHADOW_EFFORT);
    anyHit = false;
    treeSkip = NOWHERE;
    if (shadow.field != FIELD_NONE || shadow.t == TRACE_EXHAUSTED) {
        return vec3f(0.0);
    }
    var response: vec3f;
    if (cosine > 0.0) {
        response = surfaceBrdf(point, view, direction) * cosine;
    } else {
        response = point.albedo * INV_PI * (-cosine) * FOLIAGE_TRANSLUCENCY * point.foliage;
    }
    return response * sunlightAt(point.position) * cloudShadow(point.position);
}

fn limitLuminance(value: vec3f, limit: f32) -> vec3f {
    let luminance = dot(value, vec3f(0.2126, 0.7152, 0.0722));
    if (luminance > limit) {
        return value * (limit / luminance);
    }
    return value;
}
