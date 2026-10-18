# Changelog

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
