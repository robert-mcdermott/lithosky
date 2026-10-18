# Changelog

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
