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

## Terrain detail

**Terrain detail** selects Draft (128²), Detailed (512², the default), or Fine
(1024²). The preview stays at 128². Final geometry is prepared in a separate
cancelable worker, including the saved sculpt strokes and surface rules. Layered
and imported terrain are capped at their source resolution: a 256² source stays
256² even when Fine is selected. The original analytic generator is evaluated at
the requested resolution. The actual final cell/triangle count is shown after
preparation. Generation resolution, final geometry detail, image dimensions and
sample count are different controls. More samples do not create missing geometry.

These choices are transient render settings; scene files remain v1–v7. Draft
retains the previous mesh and shading. The new default can change the appearance
of existing scenes without changing their saved parameters. A failed detailed job
reports an error and allows retry at a lower tier; it never silently downgrades.

## What the tracer does

- A bounded heightfield spans −32 to 32 in X and Z. Preview and final geometry
  sample the same landform, triangle convention, camera and surface rules at
  different resolutions. Simple V4 surface detail remains per vertex. Opt-in v7 geological definitions
  evaluate at every ray hit with filtered solid grain/strata/joints, bounded bump
  normals and rough diffuse response; see [geological surfaces](geological-surfaces.md).
  Fine geometry improves silhouettes independently of material detail.
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

At 960 × 540 the three image buffers total about 11.87 MiB. Geometry adds:

| Final cells | Triangles | Vertex buffer | Hierarchy |
|---|---:|---:|---:|
| 128² | 32,768 | 0.762 MiB | 2 KiB |
| 256² (source cap) | 131,072 | 3.023 MiB | 8 KiB |
| 512² | 524,288 | 12.047 MiB | 32 KiB |
| 1024² | 2,097,152 | 48.094 MiB | 128 KiB |

Atmosphere adds 384 KiB. These figures exclude preview resources and driver
overhead. Preparation also owns a separate worker's generation/sculpt cache
(up to the documented 63 MiB authoring budget) plus the final vertex/hierarchy
arrays. Transfer moves those arrays to the main thread; the worker is terminated
after preparation or cancellation, and final GPU buffers are destroyed after the
job. CPU upload arrays and image snapshots add to process memory; this is not a
browser-RSS limit. Fine is not intended as a small-memory-device default. Limits are checked before buffer creation. The final job owns a separate device so a tracing failure
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

The preview worker retains its 128² mesh. A final-render worker independently
rebuilds the saved landform and prepares the requested trace tier from the dense
source, including sculpting and imported samples. Draft buffers remain unchanged.
See [terrain authoring](terrain.md). Scene-title edits
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

## Detailed terrain benchmark

See [visual-quality comparisons](visual-quality.md) for the original Sunlit ridges
scene, unretouched Draft/Detailed/Fine renders, GPU intersection checks and recorded
preparation/render costs. Run `docs/capture/detail-run.mjs` against an isolated
rebuilt app to reproduce the captures and manifest.

Opt-in geology adds 64 uniform bytes and fixed bounded procedural work per land
hit, without texture buffers or geometry displacement. Surface-area ray-cone
filtering is approximate; normal/transport limitations are documented in the
[geological surface notes](geological-surfaces.md). Old v1–v6 surfaces remain unchanged.
