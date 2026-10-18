# Lithosky implementation roadmap

Status: wave 3, slices 1–2 complete locally; native release gates remain open.
Updated 2026-10-18. Each wave produces one minor release; a completed slice is not a released version. No calendar estimates
until the rendering spikes have measurements. The private PRD is input, not a
contract. Research and comparisons stay in ignored `product_research/`.

## Product direction

An offline landscape studio for composing beautiful natural and imagined worlds:
terrain, mountains, water, vegetation, atmosphere, clouds and weather. A single
Go executable embeds the UI, shaders and starter scenes. An installed compatible
browser supplies the desktop window without tabs or an address bar. No account,
telemetry, CDN, external service or runtime package installation is required.

Own the small, stable core: scene model, procedural terrain, rendering kernels,
GPU adapters, desktop launcher and site generator. Evaluate specialist codecs or
denoisers individually; maintaining a complex codec just to avoid a dependency
can cost more than a reviewed, pinned permissive implementation. All original
work is Apache-2.0; dependency and asset provenance is a release gate.

## Decisions from the review

- Use native JavaScript modules and browser APIs initially; no frontend framework,
  bundler, package tree or Go modules beyond the standard library. Add tooling only
  for demonstrated maintenance needs.
- Prefer WebGPU for compute, storage buffers and explicit GPU scheduling. Provide
  WebGL 2 preview from the same scene. No automatic translation of WGSL to GLSL;
  isolate both backend implementations behind a narrow renderer interface.
- WebGL can implement ray tracing in fragment shaders. Keeping final rendering
  WebGPU-only is a scope decision, not a claim that WebGL cannot trace rays.
  Neither backend guarantees portable hardware ray tracing; measure software
  traversal before promising performance. See [architecture](docs/architecture.md).
- Probe adapters, devices and pipeline creation; an API property alone is not a
  capability test. Recover from GPU loss without discarding the scene. With no
  GPU API, retain the UI and an actionable explanation.
- Start with bounded terrain, simple water and a small tracer. Choose megakernel
  versus wavefront using timings; do not commit to queues before profiling.
- Defer the PRD's million-instance target, 4096² reference scene, neural denoiser,
  FFT ocean, erosion and multi-format import until their owning releases.
- Distinguish artistic preview from physically based final output. No promise of
  bitwise GPU reproducibility across devices, browsers or driver versions.
- Accessibility, local-server protection, licensing and save recovery are early
  work, not polish at the end.

## Wave 1 → v0.1.0 — A small, complete landscape loop

Release outcome: launch, compose a simple mountain-and-water scene, save and
reopen it, render a progressive ray-traced still and export PNG. A polished
product site describes exactly what this release supports.

| Slice | Focus and deliverables | Acceptance gate | Status |
|---|---|---|---|
| W1.S1 | Foundation: Apache license, build/test workflow, embedded Go server, app-window launch, original studio UI, shared seeded terrain fixture, working WebGPU and WebGL 2 preview, explicit no-GPU state | Binary runs outside source directory; no external asset requests; camera and terrain controls work; initialization failure and device/context loss preserve state; HTTP boundary and fallback tests pass | Implemented; validation in docs/validation.md |
| W1.S2 | Versioned scene model and files: `.lithosky` JSON v1, schema, strict bounds, camera/terrain/water/lighting, undo/redo, open/save, local autosave and recovery | Round-trip a scene and seed; reject malformed/oversized/newer unsupported files without overwriting work; recover after interrupted save | Complete; validation in docs/validation.md |
| W1.S3 | First final renderer: bounded heightfield intersection, simple water plane with reflection/refraction, sun/sky lighting, progressive WebGPU compute tracer, accumulation reset, cancel and PNG export | CPU intersection fixtures agree within tolerance; finite radiance and energy checks; same scene drives preview and final; exported image dimensions and color transform verified; GPU dispatches bounded | Complete; validation in docs/validation.md |
| W1.S4 | Presets, distribution and generated site: three original starter scenes, camera tutorial, static site generator in `docs/site/`, landing/install/guide/gallery pages, screenshot capture, binary packaging and checksums | Site link/image/anchor checks; real app screenshots; no unreleased-feature claims; clean-machine smoke on macOS/Windows/Linux; license notices bundled | Implemented and locally validated; native Windows/Linux acceptance pending (docs/releases.md) |

W1.S1 deliberately demonstrates a raster terrain preview, not photorealistic
rendering. W1.S3 must pass before v0.1.0 is tagged. If tracing feasibility fails,
keep the release open and revise the implementation rather than relabel preview
as a final renderer. The product site follows the reviewed repository-generated
pattern, with source in the main branch and build output separated from source;
publication belongs to the release workflow.

## Wave 2 → v0.2.0 — Terrain authoring and surface detail

Depends on wave 1's scene and renderer contracts. Wave 2 work is explicitly
requested while the documented native Windows/Linux release checks remain open.
W2.S1–S4 are complete and locally validated; see [terrain authoring](docs/terrain.md)
and [validation](docs/validation.md). Wave 2 implementation is complete locally; v0.2.0 remains unreleased while
the native platform release gates remain open.

| Slice | Focus | Acceptance gate |
|---|---|---|
| W2.S1 | Own noise library: fBm, ridges, domain warp, terraces and composable terrain layers; worker generation; 256²–2048² budgets | Seed fixtures stable; cancellation works; edits invalidate only affected resources |
| W2.S2 | Sculpt raise/lower/smooth/flatten with undo and bounded snapshots | Undo restores the heightfield; pointer/keyboard tools and memory caps tested |
| W2.S3 | Slope/height material rules, rock/snow/sand/ground presets, procedural detail, hierarchical terrain traversal | Grazing-ray and silhouette tests; preview/final alignment; memory and render benchmarks |
| W2.S4 | 16-bit heightmap import/export, scale metadata and hardened asset container evolution | Round-trip precision; malformed assets rejected; migration from v1; site and examples updated |

## Wave 3 → v0.3.0 — Detailed terrain, believable surfaces and light

W3.S1 is implemented and locally validated; see [atmosphere](docs/atmosphere.md)
and [validation](docs/validation.md). The first physical atmosphere is explicitly
single scattering with three spectral bands; it does not claim multiple scattering
or calibrated spectral color. Native release gates remain open. W3.S2 is complete locally; see
[visual-quality comparisons](docs/visual-quality.md) and [validation](docs/validation.md).
W3.S3 geological surfaces is next and has not started.

| Slice | Focus | Acceptance gate |
|---|---|---|
| W3.S1 | Physical sun/atmosphere LUTs, Rayleigh/Mie/ozone and aerial perspective; manual sun plus geographic positioning | Compare representative radiance/transmittance against published reference data |
| W3.S2 | Detailed final terrain: independent 128²/512²/1024² tracing tiers, worker preparation, scalable traversal, source-resolution limits and an original ridge benchmark | Thin ridges survive final geometry; CPU/GPU intersection agreement at all tiers; cancel/retry and device budgets; identical-camera before/after renders with recorded cost |
| W3.S3 | Materials evaluated at ray hits: multiscale rock strata/fractures, soil/snow variation, filtered bump normals and roughness, coherent world-space mapping | Close-up rock reads as rock rather than smooth colored plastic; aliasing/normal-energy checks; near/middle/far crops and material reference scenes |
| W3.S4 | Energy-conserving diffuse/GGX/dielectric transport, indirect terrain light, MIS, area lights, exposure and filmic color controls | White-furnace and sampling tests; no clipped/chalky highlights or crushed shadows in benchmark scenes; documented linear working space and export transform |
| W3.S5 | Water absorption/refraction, depth color, ripples and shoreline transitions | Fresnel/attenuation tests plus convincing shallow/deep water and grazing shoreline examples |
| W3.S6 | Physical camera, depth of field, render region, bounded 2K export with landscape/portrait framing, curated daylight/golden-hour compositions and integrated quality review | Original mountain/coast/snow gallery passes the visual rubric below; reproducible scenes and measured budgets; no claim of photorealism from numerical tests alone |

Final geometry must no longer inherit the interactive preview's resolution cap.
W3.S2 establishes this foundation; W3.S3–S4 must deliver the surface and lighting
quality that geometry alone cannot supply. Attractive bare landscapes are a Wave 3
release gate, before vegetation or clouds can hide weaknesses.

## Wave 4 → v0.4.0 — Dramatic skies, stars and weather

| Slice | Focus | Acceptance gate |
|---|---|---|
| W4.S1 | Own bounded volume/noise library, layered cloud coverage and density presets | Density/majorant bounds tested; no GPU watchdog resets on reference fixtures |
| W4.S2 | Cloud lighting, fog banks, shafts and preview temporal reprojection | Volume transmittance fixtures; camera-motion ghosting and convergence measured |
| W4.S3 | Night sky: seeded stellar field with stable angular sizes/brightness, Milky Way structure, moon phases/light and twilight transitions; photographic and artistic intensity controls | Stars remain stable across resolution/camera changes; no temporal sparkle; believable moonlit terrain and night exposure; original assets and documented celestial approximations |
| W4.S4 | Art-directed weather states: clear, overcast, storm, mist; rain/snow visual effects | Effects compose coherently with sky/water/terrain; preview approximations labeled |
| W4.S5 | Memory tiers, volume sampling improvements and weather gallery | Integrated and discrete GPU timings; graceful quality reduction; release/site refresh |

## Wave 5 → v0.5.0 — Geological detail and living landscapes

| Slice | Focus | Acceptance gate |
|---|---|---|
| W5.S1 | Hydraulic/thermal erosion, sediment/flow masks and physically scaled terrain controls | Conservation/stability fixtures; visible drainage and talus structure in original mountain benchmarks; cancellation and memory limits |
| W5.S2 | Erosion-informed surfaces/scattering and tiled-terrain experiments | Seam tests; coherent rock/soil placement; consistent scale from foreground to horizon |
| W5.S3 | Primitives, procedural rocks and bounded mesh import; worker BLAS/TLAS | Intersection tests and import fuzz fixtures; stable transforms and instance bounds |
| W5.S4 | Procedural trees and grass, seeds, LOD and foliage materials | All bundled geometry original; silhouettes and memory measured at distance |
| W5.S5 | Rule/paint scattering, altitude/slope masks, spacing and density budgets | Deterministic scatter and undo; instance caps based on measured device budgets |
| W5.S6 | Forest/meadow/coast examples, picking, object editing and performance work | Large-scene benchmark and recovery; gallery from actual rendered scenes |

## Wave 6 → v0.6.0 — Oceans and expansive coastlines

| Slice | Focus | Acceptance gate |
|---|---|---|
| W6.S1 | Large coastal terrain, distant landforms and bounded streaming/LOD | Stable silhouettes and shadows across detail transitions; measured memory and traversal budgets |
| W6.S2 | Coastal geology, beaches, wet sand and coherent shoreline masks | Natural transitions across tide/water levels; close-up and distant coast reference scenes |
| W6.S3 | Spectral ocean with wind/fetch controls, foam and shoreline detail | Spectrum tests; bounded displacement/traversal; optical behavior checks |
| W6.S4 | Quality/performance presets and examples | Measured cost for combined ocean/cloud/vegetation scene; release/site refresh |

## Wave 7 → v0.7.0 — Futuristic and imagined landscapes

Artistic choices remain opt-in; natural defaults continue to work.

| Slice | Focus | Acceptance gate |
|---|---|---|
| W7.S1 | Alien palettes, emissive minerals, stylized skies, secondary celestial lights | Explicit artistic controls; energy/color behavior documented |
| W7.S2 | SDF formations, arches and floating landforms within bounded scene regions | Robust intersection and normal fixtures; GPU loop bounds and undo |
| W7.S3 | Planetary vistas and original futuristic preset collection | Distinctive original assets; usability test from blank scene to shareable image |
| W7.S4 | Composition polish and release | Natural and imagined scene regression gallery; site refresh |

## Wave 8 → v0.8.0 — Production stills

| Slice | Focus | Acceptance gate |
|---|---|---|
| W8.S1 | Adaptive sampling, tiled 4K/8K rendering and durable job checkpoints | Resume equivalence within documented tolerance; tiled borders seamless |
| W8.S2 | Optional denoising after code, weights and transitive license audit | Measured quality/memory benefit; raw render always available; no required download |
| W8.S3 | HDR/EXR and AOVs; panorama/orthographic cameras, sky export | Independent decoder round trips; color metadata and dimensions verified |
| W8.S4 | Queue, asset provenance manifest and release | Crash recovery; disk/memory limits; SBOM and website reflect shipped artifacts |

## Wave 9 → v0.9.0 — Automation and animation

| Slice | Focus | Acceptance gate |
|---|---|---|
| W9.S1 | Versioned command API, recipes and opt-in local automation | Same validation and undo as UI; authentication and origin tests |
| W9.S2 | Stdio MCP, thin Python client (managed with uv), browser-driven batch rendering | Script/interactive scene equivalence; cancellation and explicit runtime prerequisites |
| W9.S3 | Keyframes, camera paths, deterministic frame sequences | Restartable frame jobs; temporal noise documented; no mandatory video encoder |
| W9.S4 | Automation examples and release | End-to-end batch tests; audit and guides updated |

## Wave 10 → v0.10.0 — Release candidate quality

| Slice | Focus | Acceptance gate |
|---|---|---|
| W10.S1 | Usability, keyboard/accessibility and onboarding audit | New users reach a shareable image; keyboard paths and contrast pass |
| W10.S2 | Cross-device rendering, memory budgets, loss recovery and file migrations | Published tested hardware/browser matrix and known limits |
| W10.S3 | Packaging, signing where available, dependency/asset audit and documentation | Clean installs, checksums, full notices, migration/recovery rehearsals |
| W10.S4 | Stabilization and release candidate | All release blockers closed; site uses verified renders and supported claims |

A v1.0.0 stability milestone follows successful v0.10.x release candidates; it is
not another wave with a conflicting numbering rule. Later research: native
headless rendering, spectral transport, path guiding, geospatial sources, rivers,
advanced caustics and interchange formats. Native GPU libraries are optional and
must not silently turn the standard distribution into a multi-file runtime.

## Visual-quality policy

The ambition is photographic credibility for natural scenes and exceptional,
art-directed beauty for imagined worlds. Neither is claimed solely because a
renderer uses ray tracing, passes unit tests, or runs on modern hardware.

- Prioritize resolved landform detail, believable surfaces, light/exposure and
  composition before expanding the feature list. Each rendering slice ships an
  original reproducible example that demonstrates its visible improvement.
- Maintain fixed-camera/seed comparisons, full images and 1:1 foreground,
  middle-distance and horizon crops. Record build, geometry tier, image size,
  samples, device, preparation/render times and memory. Do not hide regressions
  with changed exposure, camera, postprocessing or generated marketing imagery.
- Review geology/silhouette, material scale/variation, lighting/highlight retention,
  atmospheric depth, water/shorelines, aliasing/noise and composition separately.
  Tests establish correctness; rendered-image review establishes visual progress.
- Wave 3 must show convincing unpopulated daylight landscapes; Wave 4 adds
  dramatic but coherent cloudscapes, twilight and moonlit/starry scenes. Later
  waves must preserve those standards as vegetation, erosion and oceans arrive.
- Preserve a natural photographic mode. Dramatic sky colors, exaggerated celestial
  effects and other artistic choices are explicit options, not unexplained physical
  claims. Original presets should be beautiful without expert parameter tuning.
- Keep third-party reference images and competitive notes in ignored
  `product_research/`; commit only original/licensed assets and generic quality
  criteria. Do not ship the supplied reference image or product comparisons.
- A wave's visual gate stays open when outputs are technically valid but visibly
  unconvincing. Publish limitations candidly and use user review to calibrate
  artistic quality; do not label unfinished output indistinguishable from photography.

## Definition of done for every wave

All slices accepted, tests appropriate to changed behavior pass, scene migration
and recovery remain sound, performance recorded with scene/seed/resolution/sample
count/device/browser/build, security and license inventories updated, docs and
site regenerated from real outputs, and release notes clearly distinguish final
rendering from approximate preview. Targets such as 60 fps or 4K render times are
hypotheses until measured; no hardware tier is inferred solely from a GPU name.
