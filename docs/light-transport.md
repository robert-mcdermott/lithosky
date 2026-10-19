# Light transport and color

Choose **Use studio lighting** under **Light transport & color**. This opts the
scene into format v8 and the bounded path integrator. Existing v1–v7 files retain
their classic render path. Undo, scene save, portable heightmap files and recovery
include lighting. **Use classic lighting** removes these settings and chooses the
minimum format that preserves the remaining scene features.

Exposure is in stops: +1 doubles linear light before display. **Filmic** has a
soft toe and shoulder; **Soft neutral** uses luminance Reinhard. Sun and sky
strength are independent; zero disables either source. Sky strength also scales
camera-segment atmospheric in-scattering. Terrain light bounces
selects one through four surface vertices (default three). One still includes
direct lighting and both sky sampling strategies, but no terrain interreflection.
Geological surfaces supply their roughness; Simple surface roughness controls
other terrain. Index of refraction controls the rough dielectric lobe.

Add up to four named rectangular area lights. Position X/Y/Z, direction azimuth
and elevation, width, height, radiance and linear RGB are editable. North is −Z,
east +X and up +Y; negative elevation points the emitter downward. These are
one-sided emitters with opaque backs. Disabling or zeroing a light removes its
emission and rectangle. Lights can illuminate and occlude terrain, reflect in
water and appear in the camera. They are authored numerically for now; picking
and transform handles belong to W3.S7–S8. The immediate raster preview remains approximate. WebGPU live lighting uses the
final kernels at coarse resolution and includes these lights; render a still for
final detail and export.

## Surface transport

All equations are implemented here from mathematical definitions, without copied
source or external rendering libraries. The terrain BRDF is a conservative,
reciprocal 50:50 mixture of Lambertian diffuse and single-scattering isotropic
Trowbridge–Reitz (GGX) dielectric reflection with separable Smith masking and
exact unpolarized dielectric Fresnel. This is a bounded mixture of two surfaces,
not a full layered coating or a spectral material model. Each component has at
most unit hemispherical reflectance, so their convex mixture cannot create light.
The mixture intentionally loses energy: a white diffuse input is not a perfectly
white, lossless material. Microfacet multiple scattering is not compensated.
Roughness maps to alpha = max(0.02, roughness²).

Sampling mixes cosine-weighted diffuse and projected GGX normal distributions,
with the reflection Jacobian in the PDF. Backfacing samples are null events,
not resampled or renormalized. Direct sun is a separate delta-light estimator.
At every surface vertex one uniform-hemisphere sky sample and one uniformly
selected area-light sample complement one BSDF continuation. The power heuristic
combines the appropriate solid-angle PDFs, including the light-selection
probability. BSDF rays hitting emitters or escaping to the sky receive the matching
MIS weight. The last vertex still evaluates the complementary sky/emitter sample,
so the depth limit does not silently halve direct light. A solar disk is visible
to the camera; indirect environment evaluation excludes it because the directional
sun is evaluated separately.

The existing bounded heightfield hierarchy handles shadow and continuation rays.
Sun/sky visibility uses the full terrain bounds, including tall imported ranges;
it is not cut off at an arbitrary distance inside the heightfield.
Every path has at most four terrain vertices. Buffers add 48 uniform bytes and a
fixed 256-byte light array; tiles, readback, cancellation and device-loss handling
retain their previous bounds. There is no firefly clamp or denoiser hiding energy
errors. The flat-normal furnace and quadrature tests cover the BRDF; actual GPU
probes check evaluation, sampling, PDFs, color and representative furnace cases.
Bump normals are bounded and below-geometry rays rejected. Those measures are
approximate shading-normal handling, not a proof of whole-scene conservation.

## Linear working space and PNG transform

Working values are nonnegative, scene-referred linear RGB with sRGB/Rec.709
primaries and D65 white. Procedural material colors are authored reflectances,
not encoded display bytes. The three-band atmosphere is an RGB approximation;
its normalized solar irradiance is not a calibrated spectral camera exposure.
Area-light RGB is linear emitted radiance in the same relative units.

Accumulate linear radiance first. Unlike the classic physical-atmosphere path,
studio transport applies no hidden ×4 exposure. Apply the saved exposure as
2^EV, then compute luminance Y = 0.2126 R + 0.7152 G + 0.0722 B. The original
filmic curve is `Y (Y + 0.1) / (Y² + 0.6 Y + 0.1)`; Soft neutral uses `Y/(1+Y)`.
Scale RGB by mappedY/Y. If a channel exceeds one, compress saturation toward
mappedY until all channels fit, preserving mapped luminance. Both curves are
monotonic, map zero to zero and approach one without a hard highlight cutoff.
Apply the standard piecewise sRGB transfer once, quantize to 8-bit RGBA, and use
those same bytes for canvas and PNG. Extremely bright values can still round to
255; an 8-bit PNG cannot retain arbitrary HDR detail. There is no HDR export yet.

## Current limits and references

Terrain interreflection is new, but transport remains deliberately bounded. Water
still uses a single reflected/refracted branch pair with absorption tint; studio
lighting upgrades its interface to exact dielectric Fresnel, including total
internal reflection. Terrain continuation rays do not recursively intersect water.
Atmospheric attenuation is evaluated on the camera-to-first-hit segment, including
camera-to-water. Secondary air and area-light segments omit atmospheric transport. The sky LUT remains tied to the observer altitude.
No denoising, emitter importance hierarchy, spectral transport or full
multiple-scattering atmosphere is claimed. Low samples can remain visibly noisy.
Water refinement is W3.S5; physical camera and larger exports are W3.S6.

Mathematical references: [microfacet distribution and masking](https://pbr-book.org/4ed/Reflection_Models/Roughness_Using_Microfacet_Theory),
[MIS and path continuation](https://pbr-book.org/4ed/Light_Transport_I_Surface_Reflection/A_Better_Path_Tracer),
[area emission and sampling](https://pbr-book.org/4ed/Light_Sources/Area_Lights).
These references inform the equations; their code and images are not distributed.
