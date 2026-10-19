# Changelog

## 0.3.0-dev.8 — wave 3 slice 8 (local development)

- Add original closed box/sphere/cylinder/cone primitives in raster, live and final
  rendering, with analytic intersections, shared transforms, occlusion, traced
  shadows, water reflections/refraction and independent starter finishes.
- Add v12 transforms, Add/place, move/rotate/scale handles, world/local axes,
  snapping, exact numeric and keyboard edits, multi-selection and uniform groups.
- Add atomic duplicate/copy/paste/delete, grouping, alignment and terrain placement;
  preserve world pose during parenting and enforce locks through parent transforms.
- Keep each gesture in one Undo step; cancel restores the scene and redo branch.
  Preserve scene/asset recovery and WebGL editing within measured object budgets.
- Add an original observatory study, reproducible GPU/editor evidence and guides.
  Composition views/material assignment remain slice 9. Photographic acceptance
  and native-platform release checks remain open.

## 0.3.0-dev.7 — wave 3 slice 7 (local development)

- Add a versioned entity/component scene model with stable IDs, strict graph
  validation and portable asset/recovery support; old scenes retain their models.
- Add searchable Objects, viewport picking, selection-driven inspection,
  names, visibility, locks, groups, reparenting and light duplication/deletion.
- Enforce inherited locks through the common editing command path. Apply
  inherited visibility to raster, live lighting, final rays and picking.
- Keep selection/guides outside saved scene data and exported images. Add
  original editing examples, GPU/workflow evidence and product-site guidance.
- Transform handles/primitives remain in the next slice. Photographic visual
  acceptance and native-platform release gates remain open.

## 0.3.0-dev.6 — wave 3 slice 6 (local development)

- Add a saved v10 thin-lens camera, focal length, aperture/focus, roll, pan target
  and landscape/portrait/square framing; old files retain their pinhole view.
- Trace depth of field in live/final rendering, pick focus on terrain/water and
  cancel camera drags without retaining accidental edits.
- Add full-frame-consistent region rendering/export and bounded 2K output;
  report pixel dimensions and image-buffer cost before rendering.
- Add an optional diffuse distant-ground background, original 2K composition
  studies, native-pixel crops and reproducible camera/GPU/workflow capture records.
- Complete the integrated image review; geological/snow/horizon defects remain.
  Photographic quality and native-platform release gates remain open.

## 0.3.0-dev.5 — wave 3 slice 5 (local development)

- Add saved v9 lake optics: incoming/view attenuation, refracted bed illumination,
  light-dependent single scattering, filtered normal ripples and damp shores.
- Enable current models in new/default starter scenes; retain old files unchanged
  and offer one undoable rendering upgrade preserving actual sunlight direction.
- Add a cancellable shared-kernel WebGPU lighting preview; retain immediate raster
  feedback and WebGL fallback. Keep desktop scene file actions visible.
- Extend sampling to 256, label samples separately from geometry detail, and add
  original water/noise comparisons with strict capture provenance.
- Native release gates and integrated photographic-quality review remain open.

## v0.3.0 — unreleased

Earlier development build: 0.3.0-dev.3. Wave 3, slice 3:

- Opt-in per-hit geological surfaces with original solid rock strata, angular joints, soil/snow variation and bump detail.
- Filtered multiscale detail, world-space mapping and bounded normal perturbations; rough diffuse response uses spatially varying roughness.
- Geological surface controls and reusable CPU/WGSL material evaluation; WebGPU/WebGL previews retain filtered vertex colors.
- V7 scenes preserve the material through sculpting, terrain conversion, atmosphere changes, portable heightmaps and recovery; legacy formats remain supported.
- Original landscape/material comparisons and near/middle/horizon crops from actual renderer output; shader/reference, filtering and energy checks.

Wave 3, slice 2:

- Visual-quality roadmap: detailed terrain, per-hit surfaces, lighting/exposure and measured image reviews take priority; night skies gain a dedicated slice.
- Independent Draft (128²), Detailed (512², default) and Fine (1024²) final terrain; lightweight preview retained.
- Cancellable final preparation replays sculpting and respects imported/layered source resolution.
- CPU/GPU traversal scales to over two million terrain triangles with explicit memory checks.
- Original same-camera terrain comparisons, reproducible capture records and regression tests.
- Existing files remain compatible; Draft retains the previous mesh. No photorealistic-quality claim yet.

Wave 3, slice 1:

- Opt-in physical Earth sky, Rayleigh/Mie scattering, ozone absorption and aerial perspective.
- Offline manual/geographic sun direction with latitude, longitude and UTC date controls.
- Bounded transmittance/sky lookup tables, cancelable preparation and GPU reference checks.
- V6 scenes preserve atmosphere across terrain edits, portable heightmaps, undo and recovery.
- Published analytic atmosphere and solar reference comparisons; single-scattering limits documented.

Studio UI follow-up:

- Independent Scenes and Controls panel toggles reclaim workspace width and preserve edits/renders.

- Fixed desktop scroll ownership: workspace and settings scroll inside the app frame.
- Anchored, themed dropdown menus in supporting browsers, with native fallback.
- Preserved single-page mobile scrolling and added responsive/keyboard browser checks.

## v0.2.0 — unreleased

Development build: 0.2.0-dev.4. Wave 2, slice 4:

- 16-bit grayscale PNG import/export with height, orientation and physical-scale metadata.
- Portable v5 scene containers include checksummed height samples; v1–v4 remain supported.
- Imported terrain works with sculpting, materials, undo and local recovery.
- Immutable asset storage, bounded codecs/archive parsing and referential recovery validation.
- Original Terraced basin heightmap/scene examples, guide and site updates.
- Starter recognition compares scene content independently of JSON property order.

Wave 2, slice 3:

- Editable height/slope surface rules and rock, snow, sand and ground presets.
- Original seeded color detail shared by preview and final rendering.
- V4 scenes retain surface settings on original or layered/sculpted terrain;
  older documents preserve their existing appearance until explicitly customized.
- A two-level terrain hierarchy skips empty 8 × 8-cell blocks using 2 KiB of bounds.
- CPU/exhaustive/GPU grazing-ray and silhouette checks, preview/final alignment
  tests and comparative render/memory benchmarks.

Wave 2, slice 2:

- Raise/lower/smooth/flatten brushes with terrain picking, cursor outline and keyboard controls.
- One undoable edit per released stroke; Escape/pointer cancellation discard staged work.
- V3 scene files persist bounded sculpt strokes; v1/v2 documents remain supported.
- Worker replay reuses procedural noise; smoothing reads immutable local patches.
- Undo/redo snapshots are capped at 4 MiB and 100 entries; grids stay out of history.
- Scalar scene files capped at 128 KiB; up to 32 strokes with 24 marks per stroke.
- Artistic reflectance is clamped for deep sculpted depressions.

Wave 2, slice 1:

- Original fBm, ridge, domain-warp and terrace library; up to eight ordered layers.
- Cancellable worker generation, progress/retry and 256²–2048² cell budgets.
- Height/surface/preview caching; camera and light edits reuse terrain geometry.
- Strict v2 scene files and recovery for layers, with unchanged v1 scene support.
- Shared worker-prepared 128² preview/trace mesh; higher render geometry is deferred.
- Layer controls, history, deterministic fixtures, budget and browser validation.

Native wave 1 release checks remain open. No release is tagged or published.

## v0.1.0 — unreleased

The first landscape loop: launch locally, compose a scene, save it, render a
progressive still and export PNG. Development build: 0.1.0-dev.4.

- Single Go executable with embedded frontend and an isolated browser app window.
- Seeded terrain, camera orbit/zoom, sun, water level and two artistic palettes.
- WebGPU preview and progressive tracer; WebGL 2 fallback preview.
- Calm-water reflection/refraction, traced terrain shadows and simple sky lighting.
- PNG export at 640 × 360 or 960 × 540, 8–64 samples, cancellation and edit reset.
- Validated v1 scene files, undo/redo, local recovery and three portable starters.
- Generated product site with real exported images and a camera/scene guide.
- Six platform archive targets, checksums and bundled license notices.

Release readiness remains subject to native Windows/Linux smoke and desktop/GPU
checks. Cross-compilation and local macOS tests do not satisfy those gates.
Packages are unsigned. Physical atmosphere, clouds, weather, vegetation,
advanced materials and larger image exports remain future work.
