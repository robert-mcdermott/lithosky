# Rendering stills

Choose **Render image** to trace the current scene. Preview and output use a
16:9 camera frame. Choose 640 × 360 or 960 × 540, with 8, 16, 32 or 64 samples per
pixel. More samples reduce antialiasing and sky-occlusion noise. The image updates
after every complete sample. **Show preview / Show render** compares the two.

**Cancel render** keeps the last complete sample for **Export PNG**. Canceling
before the first sample produces no exportable image. Visual changes, including
those made through open/restore or undo/redo, clear the image and stop its job.
Changing render settings or switching the preview backend also clears it. A late GPU result or PNG
encoder callback cannot publish an image from the old scene.

**Export PNG** downloads a new opaque 8-bit sRGB image at the selected dimensions.
The filename includes dimensions and completed samples. It contains exactly the
image pixels, without controls or viewport labels. **Save scene** remains a
separate operation. Image settings and accumulation are transient; they do not
change the scene document or survive app shutdown.

Final rendering requires WebGPU. WebGL 2 continues to supply the interactive
preview and scene editing. If final rendering fails, its image is discarded and
the scene stays editable. Retry rendering, or use **Graphics & compatibility →
Automatic → Retry graphics** if necessary.

## What the first tracer does

- A 128 × 128 bounded heightfield, spanning −32 to 32 in X and Z, uses the same
  seeded heights, triangle diagonals, smooth normals, palette rules and camera
  as preview. V4 height/slope rules and seeded color detail also share the exact
  vertex reflectances. These values act as linear reflectance in the tracer.
- Ray/box clipping followed by a two-level hierarchy skips empty 8 × 8-cell
  blocks, then tests two triangles per remaining cell.
  Zero direction components, boundary starts, underside rays and parallel rays
  are handled explicitly. Each traversal stops within 34 blocks and 18 cells per block.
  Triangle intersections use a minimum distance of 0.001 scene units; secondary rays are
  offset 0.003 units to reduce self-intersection.
- Terrain receives a directional sun with traced shadows, plus one cosine-weighted
  sky visibility sample. Camera jitter supplies antialiasing. There are no
  recursive diffuse bounces or indirect light from other terrain surfaces.
- Calm water is a finite plane over the same X/Z extent, with index of refraction
  1.333. Reflection and refraction share Fresnel weights; total internal reflection
  uses weight one. A simple exponential tint attenuates the transmitted branch.
  Rays first test submerged terrain, so terrain in front of water occludes it.
- Radiance accumulates in linear floating point. A fixed Reinhard mapping
  `L / (1 + L)` followed by the piecewise sRGB transfer creates display/export
  bytes. Display and export use the same bytes, with no second gamma conversion.
  Negative, nonfinite or extreme (≥ 1e6) sample radiance increments an error
  counter; readback rejects the image instead of exporting an invalid result.

The preview's water is an opaque flattened grid, so its shoreline is approximate.
The final plane intersects the original submerged terrain. Legacy sky and aerial haze
are artistic approximations. Opt-in v6 atmosphere adds physical single scattering,
sunlight attenuation and aerial perspective; see [atmosphere](atmosphere.md).
The water model follows one interface; it does not simulate repeated internal
bounces, full underwater transport, caustics, waves or a physical ocean boundary.
Terrain outside the bounded patch is empty. No clouds, vegetation, denoising,
multiple atmospheric scattering, exposure controls or photorealistic-quality guarantee are
included in this slice. The [roadmap](../ROADMAP.md) assigns those later work.

## Resource and lifecycle limits

The first renderer is one original compute kernel, with at most seven terrain
traversals per pixel sample. A dispatch covers at most 64 × 32 pixels in 8 × 8
workgroups. Only one dispatch is in flight; the next tile waits for GPU completion
and checks cancellation. Completed image readback occurs once per sample. Work
ends after the selected sample count; there is no idle render loop. These are
work bounds, not a hardware-independent latency or watchdog guarantee.

At 960 × 540 the accumulation, output, readback and vertex buffers total about
12.6 MiB plus 2 KiB of block bounds and, with atmosphere enabled, 384 KiB of
lookup tables. This excludes preview resources and driver
overhead. Limits are checked before buffer creation. The final job owns a separate device so a tracing failure
can leave the preview intact. All job buffers and its device are destroyed on
completion, cancellation or failure. Every new job starts fresh accumulation;
scene changes also advance a generation guard covering asynchronous creation,
readback and PNG encoding.

## Validation

`npm test` checks CPU traversal against exhaustive triangles, shared preview/final
geometry, optical weights, display conversion and exact tile coverage. GPU checks
must run in a real compatible browser; they are not covered by headless unit CI.

`tests/browser-render.mjs` is a callback for Playwright CLI `run-code`, requiring
an already-open page pointing at a disposable app instance. It edits scenes,
downloads a PNG and injects failures; do not run it against your working scene.
For example, from the repository, with a locally available `playwright-cli`:

```sh
go build -o /tmp/lithosky-check .
/tmp/lithosky-check --no-open --port 8123 --data-dir /tmp/lithosky-render-check
```

In another terminal:

```sh
playwright-cli --session render-check open http://127.0.0.1:8123 --browser chrome --headed
node --input-type=module <<'JS'
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
execFileSync('playwright-cli', [
  '--session', 'render-check', 'run-code',
  fs.readFileSync('tests/browser-render.mjs', 'utf8'),
], { stdio: 'inherit' });
JS
playwright-cli --session render-check close
```

The CLI is a development tool, not an application dependency. The callback checks
1,024 CPU/GPU intersections (0.002 unit tolerance), GPU color/Fresnel parity,
completed and canceled renders, PNG signature/dimensions and decoded pixel equality,
scene-edit invalidation including pending PNG encoding, initialization failure,
device loss and retry, water/extreme-camera fixtures, WebGL fallback and narrow
layout. See [validation record](validation.md) for actual machine results.

## Layered terrain input

W2.S1 passes a worker-prepared heightfield to the tracer. Legacy v1 buffers stay
unchanged. Layered v2 scenes generate 256²–2048² scalar grids, then reduce them
to the same 128² preview/trace mesh. Higher generation resolution does not yet
increase silhouette detail. See [terrain authoring](terrain.md). Scene-title edits
retain the current still; visual edits invalidate it.

## Traversal comparisons

`tests/browser-materials.mjs` compares the default hierarchy with the retained
linear diagnostic on original terrain, a sculpted material scene and a single-cell
peak. It checks CPU/GPU hit distances for grazing, silhouette and boundary rays,
counts CPU fine-cell tests, and compares rendered pixels. Timings exclude shader
compilation and take the median of three eight-sample renders after warming both
routes once; the timed pairs alternate traversal order.
They include dispatch/readback and JavaScript scheduling; they are end-to-end
local timings, not isolated GPU timestamps. Test fixtures use the same seeds,
geometry and 640 × 360 camera for both traversal routes.

The diagnostic selects the route through WGSL's pipeline-overridable constant;
it is not a scene setting. See the [WebGPU pipeline constants specification](https://www.w3.org/TR/webgpu/#dictdef-gpuprogrammablestage).
Actual counts, timings and tested hardware are recorded in [validation](validation.md).
