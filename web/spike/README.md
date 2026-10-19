# Rendering spike

A standalone page that tests the V1–V3 direction from `ROADMAP.md` against the current
renderer. It does not use `web/render`, `web/lighting`, `web/atmosphere` or `web/material`.

```bash
go build -o bin/lithosky . && ./bin/lithosky --window=browser
```

Open `/spike/spike.html` on the address Lithosky prints. WebGPU is required.

`/spike/` does not work yet: Go's file server redirects `/spike/index.html` to `/spike/`, and
`internal/server/server.go` rejects directory paths. The spike leaves the server untouched, so
the page is `spike.html`; `index.html` forwards to it once the server serves directory index
pages. The proposed change, plus a `"/spike/"` → 200 case in `server_test.go`:

```go
if name == "" || strings.HasSuffix(name, "/") {
	name += "index.html"
}
```

## What it does

| Stage | Where | Notes |
|---|---|---|
| Terrain | `wgsl/terrain/generator.wgsl` | 2048² r32float over 16 km (7.8 m texels), metres. Gradient noise, domain warp, ridged multifractal, derivative-damped fBm, slope-aligned gully noise, a glacial trough and lake basin under the camera. |
| Erosion | `droplet.wgsl`, `thermal.wgsl` | 3.1 M GPU droplets in 24 batches (coarse, then fine), with fixed-point atomics. A thermal pass slides loose sediment at 35° and bare rock above 58°. It runs live behind **Erode**, and the erosion fades out toward the tile border. |
| Masks | `masks.wgsl` | Flow accumulation, signed deposition, and fine and broad curvature, in an rgba16f texture. |
| Far field | `generate.wgsl#generateFar` | The same generator on a 4096² grid at 48 m (196 km across), with Earth curvature, so the horizon is ranges in haze. |
| Tracing | `wgsl/trace/heightfield.wgsl` | A min/max mip pyramid built on the GPU, then exact bilinear-patch hits. No triangles. |
| Sky | `wgsl/sky/` | Hillaire 2020 transmittance, multi-scattering, sky-view and 32³ aerial-perspective LUTs, out to 160 km. |
| Light | `integrator.wgsl`, `surface.wgsl`, `fog.wgsl`, `water.wgsl` | Sun NEE over a 0.27° disk, two cosine-sampled sky bounces, height fog with terrain-shadowed in-scattering, and a lake with traced reflections. |
| Materials | `material.wgsl` | Rock, scree, meadow, forest, gravel, shore and snow, chosen from slope, height, flow, deposition and curvature. |
| Display | `wgsl/display/` | Exposure in EV, then AgX (Filament/three.js port), optionally with the "punchy" look. |

There is one persistent device. Each animation frame queues a full-frame 1 spp dispatch into
a GPU accumulation buffer, followed by a render pass. Nothing is read back except for PNG
export, and completion callbacks only limit the CPU to two frames ahead.

The camera is Alpine quiet's (`web/scenes/studies.json`), converted to metres.
**Alpine quiet light** sets the study's own sun (39.4°, 233°) for a matched comparison.
**Overview** is a high oblique view over the eroded tile. **View** shows the masks.

## Timings

Measured on 2026-10-19 on an Apple M4 (10-core GPU) with Chrome 155, headless, at
1920×1080, using `node bench/capture-spike.mjs --url http://127.0.0.1:8123 [--legacy]`.

| Step | Time |
|---|---|
| Generate near tile, far field and both pyramids | 0.28–0.31 s |
| One erosion batch (131k droplets + 2 thermal + rebuild) | 0.10 s |
| Full erosion (24 batches, rendered live) | 3.3 s |
| Page load to eroded terrain | 3.5–5.9 s |
| Sky LUT rebuild | 0.6 ms |
| One 1080p sample (paths with fog, water, 2 bounces) | 52–55 ms |
| First sample after an edit | 0.09–0.16 s |
| Samples at 0.5 s / 10 s | 6–10 / 155–225 spp |
| Throughput | 32–47 M paths/s |

The current renderer takes 49–62 s for Alpine quiet at 2048×1152, 64 spp, with 1024² terrain:
about 2.4–3.1 M paths/s. At 10 s the spike image is visually clean, with no denoiser.

Captures go to the git-ignored `bench/out/`:

- `side-by-side.png`: the current renderer above the spike at golden hour
- `side-by-side-matched-light.png`: the same comparison with the study's own sun
- `spike-*.png`
- `timings.json`

## Known gaps

- The droplet erosion is real, but at this scale the analytic gully noise carries most of the
  visible fall-line structure. Branching drainage at kilometre scale needs a coarse-grid
  erosion pass (or the pipe model) before the 2048² pass.
- The shadowed foreground is soft. Materials are albedo-only Lambertian, with no specular
  rock or snow.
- Bounce rays use the sky-view LUT from the camera altitude, and reflections get an analytic
  haze rather than the aerial LUT.
- The far field has no erosion simulation and is 48 m resolution. It is fine in haze, but
  smooth closer than about 10 km.
- There is no denoiser, cloud layer or camera control beyond the two presets.
