# Rendering spike

A standalone page that tests the Wave 4 renderer against the legacy studio renderer. It
started in W4.S1. Since W4.S2 its terrain comes from the production module in
[`web/terrain/`](../terrain/README.md), and every shader lives in `web/wgsl/`. W4.S3
moves the tracer, sky and display into the app and deletes this folder.

```bash
go build -o bin/lithosky . && ./bin/lithosky --window=browser
```

Open `/spike/` on the address Lithosky prints; it forwards to `spike.html`. WebGPU is
required.

## What it does

| Stage | Where | Notes |
|---|---|---|
| Terrain | `web/terrain/`, `web/wgsl/terrain/` | 2048² over 16 km, with a 196 km far field. Stream-power drainage carves valley networks, and droplets and talus add gullies and scree. See the [terrain README](../terrain/README.md). |
| Tracing | `web/wgsl/trace/heightfield.wgsl` | A min/max mip pyramid built on the GPU, then exact bilinear-patch hits. No triangles. |
| Sky | `web/wgsl/sky/` | Hillaire 2020 transmittance, multi-scattering, sky-view and 32³ aerial-perspective LUTs, out to 160 km. |
| Light | `integrator.wgsl`, `surface.wgsl`, `fog.wgsl`, `water.wgsl` | Sun NEE over a 0.27° disk, two cosine-sampled sky bounces, height fog with terrain-shadowed in-scattering, and a lake with traced reflections. |
| Materials | `web/wgsl/trace/material.wgsl` | Rock, scree, meadow, forest, wet stream beds, shore and snow, chosen from slope, height, flow, deposition and curvature. |
| Display | `web/wgsl/display/` | Exposure in EV, then AgX (Filament/three.js port), optionally with the "punchy" look. |

There is one persistent device. Each animation frame queues a full-frame 1 spp dispatch
into a GPU accumulation buffer, followed by a render pass. Nothing is read back except for
PNG export. A terrain build runs four stages per frame, and the view keeps updating while
it does.

The camera is Alpine quiet's (`web/scenes/studies.json`), converted to metres.

| Control | Effect |
|---|---|
| **Alpine quiet light** | The study's own sun (39.4°, 233°), for a matched comparison |
| **Overview** | A high oblique view over the eroded tile |
| **View** | Shows the masks; **Flow** shows the drainage network |
| **Relief**, **Drainage**, **Rills** | Rebuild the terrain |
| **Erode more** | Continues the drainage solve from where it stopped |
| **Heightmap…** | Imports a 16-bit PNG or `.heightmap` bundle as the near tile |
| **Procedural** | Returns to the generator |

## Timings

Measured on 2026-10-19 on an Apple M4 (10-core GPU) with Chrome 155, headless, at
1920×1080, using `node bench/capture-spike.mjs --url http://127.0.0.1:8123`.

| Step | W4.S1 | W4.S2 |
|---|---|---|
| Full terrain build, GPU time | 0.3 s generate + 3.3 s erosion | 3.5 s (far drainage, near drainage, droplets) |
| Page load to finished terrain, rendered live | 3.5–5.9 s | 4.2–4.6 s |
| Sky LUT rebuild | 0.6 ms | 0.9 ms |
| One 1080p sample (fog, water, 2 bounces) | 52–55 ms | 55–59 ms |
| Samples at 10 s | 155–225 spp | 165–222 spp |
| Throughput | 32–47 M paths/s | 36–46 M paths/s |

The legacy renderer takes 49–62 s for Alpine quiet at 2048×1152, 64 spp, with 1024²
terrain: about 2.4–3.1 M paths/s.

Captures go to the git-ignored `bench/out/<label>/`. `node bench/compare.mjs` stacks two
runs for review.

## Known gaps

- **Soft foreground.** Close slopes are soft at the tile's 7.8 m texels. Materials are
  albedo-only Lambertian, with no specular rock or snow. These belong to W4.S3 and W4.S6.
- **Approximate haze in bounces.** Bounce rays use the sky-view LUT from the camera
  altitude, and reflections get an analytic haze rather than the aerial LUT (W4.S4).
- **Heightmap edges.** An imported heightmap meets the procedural far field abruptly at
  the tile edge.
- **Missing pieces.** There is no denoiser, cloud layer or camera control beyond the two
  presets.
