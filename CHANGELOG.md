# Changelog

## 0.6.0 — Forests and meadows

Gathers Wave 6 (vegetation and distribution), and is the first release with standalone
executables and one-line installers. The development entries below record each slice.
See [the release notes](docs/release-notes/0.6.0.md).

- The Scenes thumbnails and the site gallery are rendered again, now with vegetation.
  The site gallery swaps Forest lake for Meadow, evening, and the site describes
  forests, meadows and the Plants lab.
- A release candidate's draft (a tag such as `v0.7.0-rc.1`) uses the notes of the
  release it leads to. Its install commands name the candidate and use its own
  installers, since a prerelease is never "latest".
- The hero shots are rescored with vegetation (`bench/hero/scores.md`).

## 0.6.0-dev.5 — wave 6 slice 5 (local development)

- **Plants lab** (the eighth lab, key 6):
  - **Gallery** rendered from your view: Natural, Conifer forest, Broadleaf woods,
    Meadows, Scrubland, Bare.
  - **Sliders:** Forest, Tree size, Tree mix (broadleaf to conifer), Shrubs and Grass,
    each relative to the biome's own vegetation.
  - **Randomize** draws new vegetation settings.
  - Saved as an optional `vegetation` group in the scene (format v1, additive). Scenes
    without it look as before.
- **Paint vegetation in the view.** In the Plants lab, pick Plant, Clear or Restore,
  then drag:
  - **Plant** grows full forest wherever a tree can stand.
  - **Clear** removes trees and shrubs, leaving meadow.
  - **Restore** returns the land to its own cover.

  Right- or ⇧-drag still moves the camera. A circle shows the brush on the ground. Each
  stroke is one undo step. The paint is a 512 × 512 mask over the near tile, stored
  run-length encoded in the scene (`vegetation.paint`). Ground colour follows the
  painted cover too.
- **Close-range foliage.** Trees and shrubs within about 100 m are made of individual
  leaves and needle clusters: discs facing every way in a 16 cm grid inside the crown.
  Conifers grow in tiers of branches and broadleaf crowns in lumps. Near crowns let light
  through their gaps and shade themselves.
- About 1–7% more per sample than 0.6.0-dev.4 on H1, H3, Forest lake and Meadow.

## 0.6.0-dev.4 — wave 6 slice 4 (local development)

- **Meadow grass near the camera.** Grass is now a traced layer over meadow ground,
  shaped into tussocks with gaps and leaning with the wind.
  - Within a few metres, rays meet individual blades: one per 1.8 cm square, tapered
    and each with its own lean.
  - Further out, the same grass is a soft, self-shadowing layer that rays sample
    collisions through. Backlit grass glows.
  - The grass fades into the meadow material once a pixel spans more than a few
    centimetres, so high views cost nothing extra.
- **Shrubs** grow where the forest leaves room: in patches between stands, densest in
  the belt around the tree line, and far above it in dry climates (desert scrub). They
  are low, porous clumps, traced while they span a few pixels and painted into the ground
  beyond.
- **Wind-combed meadows.** The meadow material gains streaks along the wind.
- Each biome sets a scrub amount and a grass height (alpine 0.5 and 0.4 m, desert 0.8
  and 0.25 m, arctic 0.6 and 0.15 m). Snow covers both above the snow line.
- New preset **Meadow, evening**: eye level in H1's lakeside meadow, backlit by a low
  sun, with conifers along the shore.
- On the hero shots, which see no traced grass, this costs 9–12% per sample over
  0.6.0-dev.3. The plant bake still takes about 5 ms.

## 0.6.0-dev.3 — wave 6 slice 3 (local development)

- **The live view stops when it's done.** It used to keep path-tracing indefinitely
  after every edit, keeping the GPU busy. Now it traces to a sample target, lets
  auto-exposure settle, and does no GPU work until something changes. Exposure and
  look changes redraw without re-tracing.
- **Draft and Full live quality**, in the top bar (or press F), remembered between
  sessions:
  - **Draft** (default): 1280 px, one bounce, 32 passes, finished in about a second or
    two after an edit
  - **Full:** 1920 px, two bounces like the final render, 512 passes

  Render and the region preview (R) still produce full quality.
- The view takes at most 8 samples per frame, which leaves the GPU room for the rest of
  the desktop, and does nothing while the window is hidden or minimised.
- The status shows progress towards the target (`18 / 32 passes`) and `done` when the
  view has stopped.

## 0.6.0-dev.2 — wave 6 slice 2 (local development)

- **Traced forests.** The near tile (16 km) grows procedural trees that the path tracer
  intersects directly: conifers (cones) and broadleaf trees (ellipsoids), with trunks
  up close. Each 7.8 m terrain cell may hold one tree, placed and sized from a hash of
  the cell, so no geometry is stored. Crowns lean over neighbouring cells, so forests
  close up without a visible grid.
- **Placement** follows the land and the scene: slope, drainage, scree, the shore,
  clearings, the tree line and moisture, with smaller trees towards the tree line.
  Each biome sets its share of conifers (alpine 75%, Imagined 0%); conifers take over
  near the tree line. Valley floors now carry forest down to the streams, which stay
  bare.
- **Light.** Trees cast and receive soft sun shadows, darken the forest floor below
  them and show in lake reflections. Broadleaf crowns pass some light to their shaded
  side. Near crowns are porous: rays pass through gaps between clumps of foliage,
  which gives ragged silhouettes and dappled shadows.
- The ground under traced trees is a needle-and-litter forest floor. The far field
  keeps the painted canopy.
- **Speed.** A forest bake (about 5 ms) runs once the terrain is built and whenever
  the biome, tree line or moisture changes. It packs each cell's tree into a tree map
  and builds a canopy pyramid that bounds the crowns, so rays only descend into the
  canopy where trees stand. Trees cost about +35% per sample on the forested heroes
  (H1, H3, Forest lake).
- Exports, region renders and variant thumbnails all trace the trees. Thumbnails
  re-bake for each variant's biome and tree line.

## 0.6.0-dev.1 — wave 6 slice 1 (local development)

- Releases are now six standalone executables (`lithosky-OS-ARCH`, with `.exe` on
  Windows) and a `SHA256SUMS` manifest. They replace the tar.gz/zip archives.
  `tools/release` builds and verifies that layout. The verifier checks each
  executable's format and CPU, notices, version and checksum, and refuses
  unlisted, missing or altered files.
- `lithosky --licenses` prints LICENSE, NOTICE and the Go runtime's licence
  (`third_party/GO-LICENSE`), which every executable now carries.
- One-line installers:
  - `install.sh` (`curl … | sh`) for macOS and Linux
  - `install.ps1` (`irm … | iex`) for Windows

  They verify the checksum and the executable's version before an atomic install
  for the current user, with no admin rights needed. `--from`/`-From` installs from
  downloaded files and clears the browser download flag after checking.
- Pushing a `v*` tag runs the new **Release** workflow:
  - it checks the tag against `main.go` and the changelog, then tests, builds and
    verifies
  - it creates a draft release with the executables, `SHA256SUMS`, the notes and
    install instructions
- CI tests both installers on macOS, Linux and Windows (including a tampered file
  being refused), and installs the latest published release once one has
  standalone executables.
- **Publish site** deploys when `site/` changes on `main`. It failed before because
  Pages was never switched on for the repository; `docs/releases.md` has the
  one-time command.
- New `docs/INSTALLING.md`. The README and the site's Download section show the
  one-line installs. The archive README (`docs/distribution.md`) is gone.

## 0.5.0 — First Light

The first public release. It gathers Wave 4 (the visual core) and Wave 5 (the studio).
The development entries below record each slice. See
[the release notes](docs/release-notes/0.5.0.md).

- Scene format version 1 is frozen. `tests/fixtures/v1/` holds every built-in scene and
  a minimal one, and every future build must open them. A test fails if the schema
  removes or narrows anything.
- New product site in `site/`, with a gallery rendered by the app through
  `bench/gallery.mjs`. A manual **Publish site** workflow puts it on GitHub Pages.
- The packaged README describes the new studio.
- The release packaging workflow defaults to 0.5.0.

## 0.5.0-dev.4 — wave 5 slice 4 (local development)

- Canyon country, a second landform (Terrain lab → Landform):
  - a high plateau broken into mesas, buttes and benches
  - a main gorge with a river along the view
  - stepped walls: each rock formation stands as a cliff or weathers back into a
    ledge
  - distant mountain ranges on the horizon
  - rock colour bands follow the same formations, so each cliff keeps its tone
  - erosion keeps canyon cliffs steep
- Storm clouds: towering cloud gathers into separate cells. Towers billow and narrow
  as they climb, and grow smooth, flat anvils that drift downwind. Low cover leaves
  a few lone thunderheads.
- Sky colour (Light lab): changes how the air scatters light, from deep blue
  through Earth to golden, and the haze over distant land follows.
- Fog and clouds on open-sky rays stop at the distant ground, which removes a hazy
  band at the horizon.
- Forest clings to steeper slopes in wet climates. Level ground no longer shows rock
  bands.
- Thirteen built-in scenes, with new thumbnails:
  - new: Canyon at dawn, Thunderhead, Red planet, Winter fjord, Forest lake and Mesas
  - H4 is now a true canyon
  - H3 has cool shadows and a dawn-lit wall
  - H5 has backlit storm towers
- `bench/hero.mjs --only` renders any preset by id (or `all`).

## 0.5.0-dev.3 — wave 5 slice 3 (local development)

- Framing:
  - the image shape is part of the scene: 16:9, 3:2, 4:5 (portrait), 1:1 or 21:9
  - the view shows that frame, as large as fits, on a dark mat
  - a narrower frame slides clear of the open drawer
  - renders save in the scene's shape, not the window's
- Framing guides (rule of thirds or golden ratio), from the Camera lab or the G key.
- Saved views:
  - the Camera lab keeps a strip of camera bookmarks, each rendered as a thumbnail
  - clicking a view flies the camera there
  - double-click a name to rename it; × removes it
  - views are saved with the scene (up to 24)
- First run:
  - a welcome card offers the built-in scenes and the three steps (pick, shape,
    render)
  - a tip then points at the labs
  - Help can show the welcome again
- Each lab's ? explains it in a line, and every control has a hover hint.
- Plain-language labels, for example:
  - Mountain height, River carving, Loose rock
  - Cloud shape (flat, heaped, towering), High wisps
  - Brightness, Dark corners, Film grain, Zoom
- The status shows passes instead of samples.

## 0.5.0-dev.2 — wave 5 slice 2 (local development)

- Values are tactile:
  - drag any value sideways to change it (Shift for fine)
  - click a value to type a number; units are understood, so "60" in a percentage
    means 60%
- Light lab:
  - a sky dome: drag the sun around the compass and toward the zenith
  - a wedge on the dome shows which way the camera looks
  - Option/Alt-drag in the view, or the target button, puts the sun where you point
- Double-click the terrain to orbit around that point. The view turns to it smoothly.
- Every lab except Scenes has a Randomize button. It's seeded, undoable, and changes
  only that lab's settings, within ranges that tend to make good pictures.
- Render happens in place:
  - the image refines in the viewport, with a progress ring, time left and Cancel
  - the PNG then saves
  - the view keeps its own refinement, because exports use a tracer of their own
- Region renders: press R (or the Region button) and drag a box. The box renders at
  full output resolution, up to 1024 samples, over the view until anything changes.

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
