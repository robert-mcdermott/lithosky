# Geological surfaces

Choose **Use geological surface** under Terrain surface. Keep the height/slope
rules or select Rock, Ground, Sand or Snow. Geological definitions are opt-in;
older scenes retain their simple vertex surfaces until explicitly changed. Use
**Use simple surface** to remove the new model; Undo restores it.

Feature scale sets the size in scene units: larger values make broader features.
Rock strata and Rock fractures control layering and angular joints. Color detail
sets grain/mottling variation; Bump detail controls lighting relief independently.
Surface roughness changes the rough diffuse response. Atmospheric metres per unit
does not rescale the pattern. Detail frequency remains a simple-surface control;
geological surfaces use Feature scale instead, preserving the old frequency for
switching back. Natural earth and Otherworld palettes are both supported.

Preview retains the lightweight 128² vertex mesh with filtered material colors.
Final stills evaluate the solid material at each terrain hit, independently of
triangle density. Bump detail changes the shading normal, not the silhouette,
terrain intersections or the saved heightmap. Use terrain detail/sculpting for
actual landform changes. Object assignment will build on this definition when the
scene editor arrives; this slice does not add scene objects.

## Original procedural model

`web/material/geology.js` and its WGSL counterpart implement the same pure
point/normal/footprint/definition evaluation. There are no downloaded textures,
models, image assets or external libraries. Authored linear reflectances blend
soil, stone, sand and snow using the unperturbed slope and height. Low-frequency
variation softens mask boundaries. Solid 3D value noise supplies multiscale grain
and mineral mottling; continuous warped layers supply strata. Interior-jittered
cell sites define angular rock joints via nearest-site bisectors. Analytic
noise/joint derivatives supply a tangent-space surface gradient. Limiting that
gradient to 0.75 keeps the perturbed normal within about 37° of the base normal.

The integrator further keeps the shading normal in the geometric hemisphere and
rejects illumination crossing the geometric surface. This prevents bump normals
from creating light leaks through the underlying triangles. It does not provide
true microgeometry displacement or micro-occlusion. The rough diffuse angular
response uses the Oren–Nayar approximation, with a bounded roughness-to-angle
mapping. Glossy GGX, full indirect light and transport/exposure work remain W3.S4.

The implementation is original. Mathematical background is documented in
[the bump-mapping derivation](https://www.pbr-book.org/3ed-2018/Materials/Bump_Mapping),
[texture sampling and antialiasing](https://www.pbr-book.org/4ed/Textures_and_Materials/Texture_Sampling_and_Antialiasing)
and [Oren–Nayar reflection](https://www.pbr-book.org/3ed-2018/Reflection_Models/Microfacet_Models).
No source code or assets from those references are bundled.

## Filtering and limits

An isotropic ray-cone footprint grows with path length and projected surface area.
Water reflection/refraction includes the preceding camera-to-water distance.
Noise octaves fade toward their mean as their frequency becomes unresolved;
strata and joint detail use corresponding attenuation. Fully filtered octaves
skip noise work. Resolved joints and bumps remain attached to world coordinates
as the camera moves, without mesh UVs or projection seams.

This is an approximate procedural filter, not full ray differentials or an
anisotropic texture integrator. Very oblique views and refractive magnification
can need better filtering. Fine normals are averaged rather than represented as
a full microfacet distribution; the material remains an artistic approximation
of geology. Rough-diffuse energy tests cover flat unit normals; they do not prove
energy conservation for the complete bumped, water and atmosphere integrator.

The definition occupies 64 additional uniform bytes (240 bytes total). It adds
no texture buffers or geometry. Evaluation has fixed four-octave grain and a
27-site joint search; expensive unresolved detail is skipped. Actual cost depends
on visible land, projected scale and GPU. Vertex-color previews and fine final
geometry retain their existing memory budgets. Scene v7 retains the original
128 KiB JSON and 20 MiB portable-container limits.

## Verification

Unit tests compare analytic gradients with finite differences, a 27-site joint
search with an independent 125-site search, unit-normal and reflectance bounds,
filtering limits/continuity, rough-diffuse reciprocity and integrated reflectance,
geometry/hierarchy preservation and format migration. Shared acceptance fixtures
cover Go and JavaScript validation, including malformed geological definitions.

`tests/browser-geology-probe.mjs` compares actual shader albedo, roughness, normals
and angular response with CPU values across all presets, both palettes, extreme
seeds and several footprints. `tests/browser-geology.mjs` exercises editing,
undo, JSON/portable open/save, recovery, sculpting, imports/conversion, sky changes,
render invalidation/cancellation and mobile WebGL editing.

`docs/capture/material-run.mjs` records original matching-camera landscape renders,
native-pixel foreground/middle/horizon crops and rock/ground/snow reference views.
It verifies unchanged scene content and source/image hashes. See
[visual-quality record](visual-quality.md) for the images and measured costs.
