# Lake optics

Wave 3 slice 5 introduces the original `lake-v1` model, saved as optional
`water.optics` in scene v9. New scenes and starter studies enable geological
surfaces, physical atmosphere, studio lighting and lake optics together. Opening
an older document leaves its saved models intact. **Upgrade rendering** adds the
missing models in one undoable edit, retaining the terrain, camera, water level,
existing material/light edits and actual sunlight direction. It does not overwrite
the original file. Save scene downloads a new file.

## Controls and rendering

- **Water metres per scene unit** defines optical scale independently of heightmap
  and atmosphere metadata. The default is 100. Match these scales for a coherent
  physical interpretation; changing water scale changes optics, not geometry.
- **Water optical density** scales absorption and suspended-particle scattering.
  Lower values reveal the bed farther from shore. It is not an opacity slider.
- **Ripple strength / wavelength** control three static analytic normal waves.
  They perturb reflection/refraction, not surface height. Their slopes are bounded
  and filtered by the ray footprint to reduce distant aliasing. Zero strength
  produces calm water. Large displaced waves, animated oceans and caustics are
  later work.
- **Damp shore width** darkens the land-side material transition near water level.
  It changes reflectance without moving the shoreline or painting a white foam
  band. Submerged bed reflectance is also reduced.

The mean interface is bounded to the same 64 × 64 patch as the terrain. Reflection
and refraction use exact unpolarized dielectric Fresnel with index 1.333, Snell's
law and total internal reflection. Above-water reflections never follow a bump
normal into the wrong side of the mean plane. The interface splits into one
reflected and one transmitted branch; it is not an arbitrarily recursive water
path tracer. Transmission includes the radiance `1 / ior²` factor on exit to air.

Homogeneous RGB absorption is `[0.055, 0.014, 0.006] / m`; scattering is
`[0.001, 0.003, 0.004] / m`, both multiplied by density. These are original artistic
lake coefficients, not claims of measured spectral water. Beer–Lambert
transmittance is `exp(-(absorption + scattering) * distance_in_metres)`. The bed
receives refracted sun and a six-direction projected-area sky quadrature, with
Fresnel transmission, incoming-path attenuation and terrain occlusion. The view
back through the water is attenuated separately. The bed no longer receives the
ordinary dry-land shader's unrestricted illumination.

Four bounded integration cells add illumination-dependent single scattering.
They use refracted sunlight and an approximate sky source within the refracted sky solid angle, with
terrain shadows and incoming/outgoing extinction. Scattering truncates after
twelve optical depths in the least attenuated band. It cannot emit light when
all scene illumination is zero. This quadrature and sky approximation are biased;
multiple water scattering, underwater interreflection, refracted area-light
illumination of the bed, displaced-interface shadows and caustics are absent.
Area lights can appear in the above-water reflected path. Underwater camera rays
are bounded and support attenuation/TIR, but are not a full diving-camera model.

The implementation is original. Mathematical references are
[beam transmittance](https://pbr-book.org/4ed/Volume_Scattering/Transmittance) and
[dielectric interfaces](https://pbr-book.org/4ed/Reflection_Models/Dielectric_BSDF).
No source code, images or assets from those references are bundled.

## Preview, samples and export

WebGPU **Live lighting preview** uses the exact final lighting, water, atmosphere
and display kernels at 320 × 180, 16 samples, with the 128² interactive terrain.
During gestures, the immediate raster view remains available; after a short idle
period it is replaced by the lighting study. Editing cancels stale preview work.
Starting a final still cancels it. The preview never becomes an exportable still.
It is a coarse lighting check: finer final geometry and additional samples still
change silhouettes, shorelines and noise. WebGL 2 retains the approximate raster
preview and scene editing/saving, with final rendering unavailable.

Final rendering offers 8–256 samples. Samples reduce stochastic noise; Terrain
detail changes geometry. There is no denoiser or hidden smoothing filter. A
completed low-sample image can remain noisy. PNG export contains exactly the
displayed final pixels, with the saved scene's color transform. Save/Open and
Undo/Redo stay visible as the desktop workspace scrolls.

## Reproducible comparisons

`docs/site/assets/silver-basin.lithosky` is an original current-model scene.
`docs/capture/water-run.mjs` produces classic/calm/ripple/clear/grazing studies at
960 × 540, 64 samples and 1024² final cells, plus the identical ripple scene at
256 samples. Source, scene and image hashes, hardware, timings and actual GPU
parity probes are recorded in `water-captures.json`. The site rejects stale
comparisons. See [visual quality](visual-quality.md) and [validation](validation.md).

Numerical checks establish attenuation/Fresnel invariants and finite outputs.
They do not establish photographic quality. The finite terrain edge, procedural
material repetition, single-scattering sky/volume approximations and absent
clouds/vegetation remain visible limitations.
