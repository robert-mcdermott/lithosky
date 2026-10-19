# Visual-quality record

## W3.S2 — resolve the landform

Development build 0.3.0-dev.2 introduces final geometry independent of the
interactive preview. This is a geometric-detail milestone, not the completed
photographic-quality target. The next slice addresses per-hit geological surfaces.

Original scene: [Sunlit ridges](site/assets/sunlit-ridges.lithosky), seed 9837,
1024² source cells, fixed camera/physical sun/materials, 960 × 540, 32 samples.
These are unretouched application exports; no generated marketing imagery or
third-party textures are used. The scene uses existing terrain and surface tools.

### Draft — 128² cells

![Draft terrain](site/assets/terrain-128.png)

### Fine — 1024² cells

![Fine terrain](site/assets/terrain-1024.png)

[View the 512² middle tier](site/assets/terrain-512.png). At native image size,
compare the central distant ridge and right-hand mountains: Fine resolves smaller
crests, gullies and the shadows they cast. The foreground still looks too smooth
and the rock is too uniform. Lighting/exposure and material richness remain below
the product target. Geometry alone does not make this scene photographic.

### Measured cost

Local Chrome 155 on Apple Metal 3, macOS arm64. Times include UI interaction,
fresh final worker generation/preparation, shader setup, tracing and readback.
These are individual observations, not a cross-device benchmark or timing promise.

| Final cells | Triangles | End-to-end time |
|---|---:|---:|
| 128² | 32,768 | 4.79 s |
| 512² | 524,288 | 7.25 s |
| 1024² | 2,097,152 | 9.01 s |

Detailed is the default; Fine needs about 48.1 MiB of vertex storage on both the
CPU during preparation and GPU during rendering, plus image/hierarchy/atmosphere
and worker resources. See [rendering budgets](rendering.md).

### Correctness and provenance

The [capture record](site/assets/terrain-captures.json) includes the scene,
source/image hashes, hardware/browser and measurements. All 816 CPU/GPU
intersection probes at 128²/256²/512²/1024² pass the 0.002-unit tolerance; worst
observed error is below 0.00001 units. The isolated preparation timings reuse the
worker source cache after the first tier, so they are not cold-start comparisons.

An independent analytic fixture places an eight-unit ridge between Draft vertices:
Draft misses the ridge, while Fine hits its peak and grazing silhouette. Plane,
edge, parallel, source-cap, cancellation and sculpt-replay fixtures also pass.
Browser checks cover cancellation during preparation, scene edits invalidating
pending work, injected large-buffer allocation failure and successful retry.

Reproduce with an isolated rebuilt app:

```sh
PLAYWRIGHT_CLI=/path/to/playwright-cli node docs/capture/detail-run.mjs http://127.0.0.1:PORT
```

Open the downloaded scene and select the desired Terrain detail, image size and
sample count; transient render settings are not stored in scene files. Inspect
[the revised roadmap](../ROADMAP.md) for the subsequent material/light/sky gates.

## W3.S3 — geological surfaces

Development build 0.3.0-dev.3 adds solid per-hit geological definitions.
The original [Weathered highlands scene](site/assets/weathered-highlands.lithosky)
uses the same seed, geometry, camera, sun and 32 samples at 960 × 540 for the
paired views below; only the geological model is enabled/removed. Source settings,
saved-scene checks and image hashes are in the
[material capture record](site/assets/material-captures.json).

Simple:

![Simple surface](site/assets/material-simple.png)

Geological:

![Geological surface](site/assets/material-geology.png)

### Foreground — native 256 × 128 crops

Simple:

![Simple foreground](site/assets/material-simple-foreground.png)

Geological:

![Geological foreground](site/assets/material-geology-foreground.png)

### Middle — native 256 × 128 crops

Simple:

![Simple middle](site/assets/material-simple-middle.png)

Geological:

![Geological middle](site/assets/material-geology-middle.png)

### Horizon — native 256 × 128 crops

Simple:

![Simple horizon](site/assets/material-simple-horizon.png)

Geological:

![Geological horizon](site/assets/material-geology-horizon.png)

The new model breaks up the previously uniform stone with layered tone, angular
joints, mineral grain and bump relief. Soil and snow have distinct variation and
roughness. Review at native size: the geometry silhouettes are unchanged, and
fine texture attenuates toward the horizon. The image still has simplified light,
deep shadows and a restrained sky; it does not meet the complete photographic
target. Full transport, glossy response and exposure remain W3.S4.

### Material reference views

These closer views use the same camera, 60° daylight sun and terrain with three
different presets; water is disabled to expose the surface. Their light and camera
differ from the paired landscape views and are recorded per image in the manifest.

[Rock](site/assets/material-rock.png) · [Ground](site/assets/material-ground.png) ·
[Snow](site/assets/material-snow.png). These are original, unretouched application
exports, not downloaded textures or generated marketing images.

### Local observations

Apple Metal 3 / Chrome 155 on macOS arm64. Fine (1024²), 960 × 540, 32 samples;
individual end-to-end observations include worker preparation, pipeline setup,
tracing and readback. Some CPU checks ran during capture, so these are neither
isolated GPU timings nor general performance guarantees.

| View | End-to-end time |
|---|---:|
| simple | 6.79 s |
| geology | 6.39 s |
| rock | 6.14 s |
| ground | 6.15 s |
| snow | 7.09 s |

The shader material probe compares 400 samples (3,200 scalar outputs) across five
presets, both palettes, several seeds including the maximum value and several footprints with the
CPU evaluator. Maximum observed absolute difference is below 0.000055 against a
0.003 tolerance. Unit checks independently verify gradients, joint search, normal
limits, filtering continuity and rough-diffuse reciprocity/integrated reflectance.
The diffuse tests do not establish conservation for the entire bumped integrator.

Reproduce using `docs/capture/material-run.mjs` against an isolated rebuilt app.
See [geological surface controls and limits](geological-surfaces.md).
