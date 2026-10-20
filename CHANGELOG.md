# Changelog

## 0.5.0-dev.1 — wave 5 slice 1 (local development)

- A new studio layout: the image fills the window, with a thin top bar and a rail of
  seven labs: Scenes, Terrain, Light, Sky, Ground & water, Camera and Image. One drawer
  opens at a time, with a gallery first, then a few controls; rarely used options are
  folded under Advanced.
- Galleries are rendered by the real renderer:
  - Light (time of day), Sky (clouds), Ground (biomes), Camera (lenses) and Image
    (looks) show the current view with each choice applied
  - they render in the background without disturbing the view's refinement
  - Scenes shows thumbnails rendered through the export path
- Top bar: the title, undo and redo, a File menu (New scene, Open, Save), a help
  popover and the Render button. Render picks size and quality, then saves a PNG.
- Keyboard: 1–7 open labs, Esc closes the drawer, H hides the interface.
- Restyled controls:
  - each value sits above a full-width slider, rounded and with units
  - switches replace checkboxes
- Exports and thumbnails no longer disturb the view's exposure.

## 0.4.0-dev.6 — wave 4 slice 6 (local development)

- Terrain materials placed by the landform (erosion and exposure masks):
  - bedrock in level strata: thick formations of irregular height, each with its own
    tone, carrying thinner beds
  - scree on talus slopes
  - gravel in stream beds
  - meadow with tussocks, dry patches and rock outcrops on knolls
  - forest with crowns and clearings below the tree line
  - sand on shores, and on dry washes in arid biomes (wet biomes grow meadow there)
  - snow held on gentle, hollow, sheltered and north-facing ground
- Wet ground darkens and turns glossy. Rock, snow, wet ground and sand each have their
  own roughness and catch GGX sun highlights.
- Five biomes: Alpine, Desert, Volcanic, Arctic and Imagined.
- Lakes have wind-driven waves at several scales and foam along the shore.
- New Ground & water panel: biome, snow line, tree line, moisture, rock layers and
  waves.
- Distant cloud decks run on to the horizon, which removes a thin bright line under
  overcast skies.
- Hero presets have biomes. H4 is a banded desert canyon, H5 a choppy arctic shore,
  and H6 an imagined world.
- Bounce and reflection rays skip fine material detail. Materials add 6–21% per
  sample over slice 5.

## 0.4.0-dev.5 — wave 4 slice 5 (local development)

- Volumetric clouds in a planet-curved shell:
  - weather-map coverage, cloud type from flat layers to towers, and height profiles
  - tileable Perlin-Worley and Worley noise generated on the GPU
  - lighting from a sun light-march, a two-lobe phase function, multiple-scattering
    octaves, Beer-powder (fading out sunward, for silver linings), and sky and ground
    light
  - a wind-stretched cirrus veil at 9 km
- Clouds shadow the terrain, water and valley fog, so sun shafts break through gaps.
  They also show in lake reflections, fade with distance and dim the sky light
  under cover.
- Beyond the far-field terrain the planet's ground is shaded, which removes the
  bright line at the horizon.
- New Clouds panel: sky presets (Clear, Fair weather, Mackerel sky, Overcast, Storm
  towers, High cirrus), cover, layer-to-towers, cloud base, depth, density and
  cirrus, plus New sky.
- Hero presets have skies; H5 is now a low sun breaking through broken cloud.

## 0.4.0-dev.4 — wave 4 slice 4 (local development)

- A post pipeline on the GPU:
  - an edge-aware à-trous denoiser guided by first-hit albedo, normal and distance,
    which fades out as samples accumulate
  - six-level bloom, so the sun and bright haze glow
  - centre-weighted auto-exposure that eases between frames
- Image controls: auto exposure, exposure compensation, warmth, glow, vignette,
  grain, and Rich, Natural, Cinematic (ACES), Soft and Black & white looks.
- Path decisions use an 8-dimensional R-sequence for less noise per sample.
- Water reflections take their haze from the aerial-perspective LUT.
- Presets retuned for metered exposure. The golden-hour and dawn foregrounds are no
  longer murky.

## 0.4.0-dev.3 — wave 4 slice 3 (local development)

- The app is now a full-window, progressively path-traced view with a compact
  panel. It has presets, terrain, sun and sky, lens and image controls; orbit, pan,
  zoom and fly navigation; undo/redo; autosave and recovery; Open/Save; and PNG
  export at up to 3840 px.
- New renderer in `web/render/`. It uses one persistent WebGPU device and direct
  heightfield tracing, and renders at half resolution while the camera moves.
- Scenes reset to a clean version 1 format, defined once in
  `internal/scene/schema.json` (3.9 KB, down from 272 KB); older scene files no
  longer open.
- Rock fracture and strata detail sharpen close slopes, and gullies now come and go
  across slopes.
- The legacy renderer, its form-based UI, the old scene versions and the old
  product site are removed.

## 0.4.0-dev.2 — wave 4 slice 2 (local development)

- GPU stream-power drainage (depression filling, multiple-flow-direction area,
  semi-implicit incision, talus) carves valley networks on the near tile and the
  far field. Droplets add gullies and scree, and heightmap import feeds the same
  pipeline.

## 0.4.0-dev.1 — wave 4 slice 1 (local development)

- A rendering spike proved GPU erosion and direct heightfield path tracing about
  13x faster than the legacy renderer. Hero-shot benchmark and baseline added.

## 0.3.0-dev.9 — wave 3 slice 9 (local development)

- Add separate perspective/top/front/side editor views and frame selection, with
  shared projection for picking, placement, handles, sculpting and painting.
- Add named camera snapshot bookmarks and explicit use of a perspective editor
  view as the active render camera; keep temporary navigation out of files/history.
- Add per-object procedural/solid material assignment, linear tint and finish edits,
  plus bounded terrain material painting/erasing shared by preview/live/final.
- Add blank, terrain-canvas and original garden templates, v13 persistence, strict
  Go/JS validation, portable recovery and an original authoring gallery.
- Validate complete browser workflows, GPU material/mask agreement, export equality
  and WebGL layouts. Photographic acceptance and native release checks remain open.

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
