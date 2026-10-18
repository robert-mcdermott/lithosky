# Terrain authoring

Wave 2, slice 1 adds original seeded noise and up to eight ordered terrain layers.
Choose **Build with layers** in the inspector to create a new landform. This is
an explicit replacement, saved as scene v2; Undo restores the original v1 scene.
Existing starter scenes keep their original generator and appearance.

## Layer controls

Layers run from top to bottom. Enable/disable, edit, reorder and remove them with
ordinary controls; all edits participate in scene history, files and recovery.
One layer must remain, but all layers can be disabled for flat terrain.

| Kind | Effect | Parameters |
|---|---|---|
| Rolling hills (fBm) | Add normalized signed fractal value noise | Strength 0–1, frequency scale 0.25–8, 1–8 octaves |
| Ridges | Add normalized ridged noise | Same controls as hills |
| Domain warp | Displace the coordinates used by subsequent noise layers | Strength 0–1, frequency scale 0.25–8, 1–8 octaves |
| Terraces | Blend the accumulated height toward continuous flat ledges | Strength 0–1, step height 0.25–8 scene units |

Each noise octave doubles frequency and halves amplitude. Base frequency is
0.09 times the frequency scale. Hills and ridges contribute up to eight scene
units times strength; signed hills can subtract height. Warp uses independent
seeded X/Z signals with a maximum displacement of 12 units times strength per
axis. Enabled layer order determines seed offsets. Terraces operate on negative
heights too; a smooth transition occupies the last 35% of each step. Mountain
height scales the completed terrain. The `layers-v1` identifier fixes these rules.
A warp at the bottom or a terrace above all height-producing layers has no effect.

## Budgets and rendering

Terrain covers 64 × 64 scene units. Generation resolution counts cells, with one
extra edge sample per axis. Dense storage is scalar Float32 height data; no full
triangle soup or per-sample color/normal arrays are allocated at this resolution.

| Cells per axis | Scalar samples | Height storage | Estimated generation working budget |
|---|---:|---:|---:|
| 256 | 66,049 | 0.25 MiB | 13 MiB |
| 512 | 263,169 | 1.00 MiB | 15 MiB |
| 1024 | 1,050,625 | 4.01 MiB | 21 MiB |
| 2048 | 4,198,401 | 16.02 MiB | 45 MiB |

The budget allows two grids during replacement and 12 MiB for reduced samples,
surface/preview buffers and transfer copies. It is an application typed-array
budget, not a bound on browser process memory, garbage collection or GPU memory.
Only one generation job runs at a time. Inputs are bounded by both scene
validators, and unsupported grid sizes are rejected before allocation.

**Preview and final rendering still use 128 × 128 cells (32,768 triangles).**
Their positions come from the same reduced grid, and normals use bilinear samples
of the dense field at ±0.08 units. High generation resolution can improve normals
but does not increase rendered silhouette detail yet. Higher-resolution traced
geometry needs the hierarchical traversal planned in W2.S3. These generation
budgets do not promise 2048² rendered geometry. Version 1 uses its original analytic
samples and normals, preserving legacy render buffers.

## Worker ownership and invalidation

An embedded module worker owns dense heights and cached terrain surfaces. The
main thread receives only the bounded preview mesh and, when changed, the traced
field. The tracer consumes that same prepared field, avoiding synchronous
regeneration on the main thread. Dense grids are regenerated from parameters
on reopen; they are not included in files or undo snapshots.

| Edit | Work invalidated |
|---|---|
| Seed, enabled layer content/order, generation resolution | Heights, surface, preview, final accumulation |
| Mountain height or palette | Surface, preview, final accumulation; cached heights reused |
| Water enable/level | Preview and final accumulation; traced terrain surface reused |
| Camera or sunlight | View uniforms and final accumulation; no terrain job |
| Scene title | Metadata only; rendered image retained |
| Disabled layer settings | No terrain job; scene parameters still saved |

Generation reports progress in row chunks. A replacement job or **Cancel terrain**
terminates an active worker, releasing its cache; request identities reject late
messages. A canceled or failed job leaves the preceding preview visible and
blocks final rendering until **Regenerate terrain** succeeds. Scene settings,
Undo, Save and recovery remain usable. Completed idle workers retain their cache
for later surface/water edits. Page exit terminates the worker.

## Validation

`npm test` checks fixed Float32 seed hashes, noise composition, negative-height
terraces, legacy buffer equality, all four allocation budgets, partial-generation
cancellation, cache invalidation, and late-result/error/retry handling. Shared
Go/JavaScript fixtures validate both scene versions and malformed layer payloads.

For actual browser tests, build and start with an isolated `--data-dir`, then use
the Playwright CLI with `tests/browser-terrain.mjs` as the `run-code` callback.
It checks controls, undo/reorder, cache reuse, save/open/recovery, 2048² cancel/retry
and UI responsiveness, layered CPU/GPU traversal, still export, WebGL and mobile.
`tests/browser-render.mjs` covers the existing tracer regression suite. Browser
checks need a working WebGPU device; Node tests alone do not prove GPU support.
