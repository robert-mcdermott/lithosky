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
| 256 | 66,049 | 0.25 MiB | 15 MiB |
| 512 | 263,169 | 1.00 MiB | 18 MiB |
| 1024 | 1,050,625 | 4.01 MiB | 27 MiB |
| 2048 | 4,198,401 | 16.02 MiB | 63 MiB |

The budget allows three grids (pristine, sculpted and replacement) and 14 MiB
for reduced samples, smoothing scratch, surface/preview buffers and transfer copies. It is an application typed-array
budget, not a bound on browser process memory, garbage collection or GPU memory.
Only one generation job runs at a time. Inputs are bounded by both scene
validators, and unsupported grid sizes are rejected before allocation.

**Preview and final rendering still use 128 × 128 cells (32,768 triangles).**
Their positions come from the same reduced grid, and normals use bilinear samples
of the dense field at ±0.08 units. High generation resolution can improve normals
but does not increase rendered silhouette detail yet. Higher-resolution traced
geometry needs additional geometry/upload budgets beyond the hierarchy introduced
in W2.S3. These generation
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
| Sculpt strokes | Replay from cached pristine heights; surface, preview and final accumulation |
| Mountain height | Surface and hierarchy bounds, preview, final accumulation; cached heights reused |
| Palette or material settings | Surface colors, preview, final accumulation; heights and hierarchy bounds reused |
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

## Sculpting

Choose Build with layers first, then select Raise, Lower, Smooth or Flatten.
A brush outline follows the visible terrain surface. Drag to stage a stroke;
release applies it as one edit. Escape, pointer cancellation, lost capture or
window focus loss discards an unfinished stroke. The terrain updates after
release, so large grids do not require a worker job for every pointer event.

With the landscape focused, arrow keys move the brush by 0.5 scene units
(Shift: 2 units), Home returns it to X/Z zero, and Space or Enter applies one
mark. Brush X/Z fields and Apply brush provide another keyboard/touch route.
Switch to Orbit camera to restore drag/arrow camera controls; the wheel still
zooms. Picking uses the rendered terrain triangles, including terrain below
water; hide water to see submerged edits.

Raise/lower add/subtract strength in base-height units at the brush center.
Flatten blends toward the terrain height at the beginning of the stroke. Smooth
blends toward a nine-tap average at 0.5-unit spacing, reading each mark's immutable
local patch before writing. All tools use radial weight `(1 - distance²/radius²)²`
inside the brush. Outputs clamp to −64…64 base-height units. Mountain height
scales the result, so later elevation edits also scale sculpting.

Stroke marks are spaced at 0.35 × radius and stored to four decimal places;
extra pointer events do not add strength. Each stroke has at most 24 marks and
a scene holds at most 32 strokes. Limits stop new marks/strokes visibly; no old
sculpted work is silently discarded. Clear sculpting removes the stroke list and
is undoable. There is no baking/exporting a dense sculpted asset in this slice.
Changing layers, seed or resolution replays the retained strokes on the new base.

The worker keeps pristine heights separate from sculpted heights. Each edit or
undo deterministically replays the bounded list, yielding between marks. No dense
per-stroke snapshots are retained; undo therefore restores the same Float32 values
without multiplying heightfield memory by the history length. Smooth scratch is
at most about 1.2 MiB at 2048². Cancel terrain stops generation/replay while keeping
the saved stroke list; regenerate or Undo to continue. Scene v3 persists the list.

Undo history stores bounded strings under a separate 4 MiB budget (100 entries
maximum). These are application data budgets, not total process-memory limits.
Preview and tracing remain at 128² cells: brush radii start at 0.5 units, but fine
features can still be underrepresented at the current render-mesh resolution.

## Surface materials

Choose **Customize surface** on any terrain. This explicitly adds material rules
and saves as v4, preserving the generator and sculpted geometry. Undo restores
the preceding scene. Legacy v1–v3 files keep their original palette rules unless
customized. **Surface preset** selects either height/slope rules or a uniform
Rock, Snow, Sand or Ground base material. Both Natural earth and Otherworld
palettes supply original linear reflectance colors.

Height/slope rules blend ground into sand below Sand height, expose rock on steep
slopes, then add snow above Snow height on gentler slopes. Heights are measured
after Mountain height scaling. Slope is the angle of the smooth normal from
vertical, in degrees. The smoothstep transition spans threshold ± softness for
height and threshold ± (8 × softness) degrees for slope. Snow weight is reduced
by the rock weight; steep rock remains exposed above the snow line. Sand and snow
heights can overlap intentionally; snow is applied last.

**Color detail** modulates reflectance using two seeded value-noise frequencies
with weights 0.7/0.3 and at most ±45% variation at full strength. **Detail frequency**
scales their world-space coordinates. Zero detail gives the preset colors without
variation. Detail is evaluated at render vertices and interpolated identically
by preview and tracing. It does not displace geometry or perturb normals; this
slice does not provide subpixel textures, bump mapping or physical material BRDFs.
All reflectance channels stay within [0,1]. These are artistic surface controls.

## Hierarchical traversal

The worker builds 16 × 16 block bounds over the shared 128² render mesh. Each
block contains 8 × 8 cells and encloses all 9 × 9 rounded vertex heights, including
shared edges. Two Float32 values per block require exactly 2 KiB. Surface-color
edits reuse these bounds; height changes rebuild them. Worker-to-UI transfers copy
the bounds with the field, and the final render uploads them to a storage buffer.
The existing 14 MiB surface/transfer allowance includes these small buffers.

A ray clips to the root terrain box and traverses blocks in X/Z order. Its height
interval across each block is compared with the block bounds. Empty intervals
skip all enclosed cells. Otherwise the ray clips to that block and tests its
triangles in cell order, using the original triangle routine. Conservative 0.001
height padding and existing intersection tolerances preserve boundary/grazing
hits. At most 34 block steps and 18 fine-cell steps per intersected block are
possible. Camera, shadow, sky-occlusion, water and CPU picking rays share this
hierarchy. GPU tracing retains a linear diagnostic mode for parity/benchmarks.

The hierarchy accelerates the current shared mesh; it does not increase its
128² resolution. See [rendering](rendering.md) and [measured validation](validation.md)
for image budgets, comparisons and limitations.

## Validation

`npm test` checks fixed Float32 seed hashes, noise composition, negative-height
terraces, legacy buffer equality, all four allocation budgets, partial-generation
cancellation, cache invalidation, and late-result/error/retry handling. Shared
Go/JavaScript fixtures validate all four scene versions and malformed layer, sculpt
and material payloads.

For actual browser tests, build and start with an isolated `--data-dir`, then use
the Playwright CLI with `tests/browser-terrain.mjs` as the `run-code` callback.
It checks controls, undo/reorder, cache reuse, save/open/recovery, 2048² cancel/retry
and UI responsiveness, layered CPU/GPU traversal, still export, WebGL and mobile.
`tests/browser-sculpt.mjs` checks pointer/keyboard brushes, cancellation, exact
undo, persistence/recovery, stroke limits, rendering and mobile WebGL.
`tests/browser-materials.mjs` checks surface editing, v4 save/recovery, WebGL/mobile,
GPU grazing/silhouette probes and comparative traversal render times/pixels.
`tests/browser-render.mjs` covers the existing tracer regression suite. Browser
checks need a working WebGPU device; Node tests alone do not prove GPU support.
