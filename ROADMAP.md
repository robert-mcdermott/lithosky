# Lithosky roadmap

Updated 2026-10-20. The course correction after Wave 3 replaced the previous
Wave 4–10 plan, which remains in git history.

**Status:** Wave 4 is complete and merged (v0.4.0). Wave 5 (studio and First
Light) is in progress on `wave5`. W5.S1 (layout and labs) and W5.S2 (tactile controls)
are done; W5.S3 (framing, cameras and onboarding) is next.

## North star

Lithosky makes landscape images people want to share: eroded mountains,
luminous skies, haze and clouds, water and light. A preset should get a user
there in minutes, and everything should be art-directable from there. **Image
quality, and the joy of making the image, are the product.** Files, recovery
and packaging exist to serve that.

These foundations stay the same:

- one Go executable that embeds the web app
- local only: no account, telemetry or remote assets
- WebGPU rendering in the browser
- Apache-2.0 licensing

## Where we are after Wave 3

**Solid:**

- binary and app-window launcher
- loopback server with Host/Origin checks
- recovery store and project container
- 16-bit heightmap import and release tooling
- undo/autosave and an entity/selection model
- physical camera math

**Not good enough:** the images and the studio. The causes:

- Terrain is CPU value noise with no erosion, triangulated in a fixed 6.4 km
  patch. Mountains read as noise, faceted up close, with a finite horizon.
- There are no clouds, the sky uses single scattering, and the small world
  leaves almost no aerial perspective.
- Materials come from height/slope thresholds plus blotch noise, not from the
  landform.
- Shadows are crushed, the tone curve is flat and the defaults are dull.
- Rendering runs at about 1 M paths/s, with CPU synchronization after every
  64×32 tile. That is too slow to art-direct.
- The UI is a scrolling form where the image covers about a third of the
  window, behind 80 numeric text fields.

**Decision:** keep the shell and rebuild the image core and the studio. The
previous Wave 4 plan (clouds on the current renderer) is replaced by the Wave 4
below, which rebuilds the image core first and adds clouds in W4.S5.

## Working agreements

1. **The picture is the acceptance test.** Every slice ends with a
   side-by-side of the hero shots against the previous slice, reviewed by the
   project owner. Studio slices use layout screenshots instead. Unit tests
   prove correctness; they never prove progress.
2. **Gates block.** Don't start the next slice while the current visual gate
   is open. Fix the picture first.
3. **No compatibility before release.** Nothing is published, so there are no
   users to migrate.
   - The scene format resets to a clean v1 at First Light.
   - Delete migrations and legacy shading branches.
   - Versioning starts at the first public release.
4. **Readable code.**
   - One statement per line, descriptive names, at most about 120 columns.
   - WGSL is split into modules joined by a small include step.
   - Probe and diagnostic entry points go in test-only modules, never in
     production kernels.
5. **Lean docs.**
   - Keep README, ARCHITECTURE, ROADMAP, and one short page per subsystem.
     Update a page when its behavior changes.
   - No per-slice validation prose, capture JSON or committed evidence images.
   - Benchmark output goes in git-ignored `bench/out/`. A few hero images may
     be committed at release.
6. **Adopt, don't reinvent.**
   - Port permissively licensed (MIT/BSD/Apache-2.0/CC0) reference
     implementations where they exist, such as multiple-scattering sky LUTs,
     cloud noise and AgX.
   - Check the license when adopting, and record attribution in NOTICE.
   - We own the integration, not every equation.
7. **Art direction is first-class.** The foundation is physically based, but
   defaults, presets and artistic controls are chosen by eye. A beautiful
   default beats a correct but dull one.
8. **Speed is a feature.** The viewport *is* the progressive path tracer.
   - For bare terrain plus sky at 1080p on an Apple M-series or RTX
     3060-class GPU, a recognizable image appears in ≤0.5 s and a clean one in
     ≤10 s.
   - Clouds get their own measured budget.
   - Interaction lowers resolution and never blocks.

## Hero shots

These six fixed compositions are the benchmark. Each lives in `bench/hero/` as
a scene file, a camera and a short rubric. A headless harness renders them at
1920×1080 and records time, samples, device and browser.

| # | Shot | What "good" looks like |
|---|---|---|
| H1 | Alpine lake, golden hour | Eroded peaks with drainage and scree fans; warm rim light against blue shadowed valleys; a near-mirror lake with shore detail; at least three distinct haze layers |
| H2 | Snow peaks under cumulus | Snow settled in hollows and on lee slopes, rock bare on ridges; cumulus with bright tops and dark bases; cloud shadows on the terrain |
| H3 | Misty valley at dawn | Ridgelines fading into low fog; light shafts through gaps; a soft pastel sky |
| H4 | Desert canyon at sunset | Stratified rock, talus slopes, sand in washes; deep warm bounce light in the shadows |
| H5 | Stormy coast | Dark storm towers with a low sun breaking through; wet rock; rough water |
| H6 | Imagined world | Alien palette, a second sun or a ringed planet, light that stays physically coherent |

**Rubric.** At the end of each image slice, the owner scores every shot from 1
to 5 on eight criteria: landform, sky, depth/atmosphere, light and shadow,
materials, water, noise and artifacts, and composition. The First Light target
is no score below 4 on H1–H4.

## Waves and slices

The cadence is the same as Waves 1–3:

- one branch per wave
- at least one commit per slice on that branch
- one pull request per wave into `main`

| Wave | Branch | Focus | Outcome |
|---|---|---|---|
| 4 | `wave4` | Visual core | The new renderer replaces the old one: eroded terrain, a progressive viewport, sky, clouds and materials |
| 5 | `wave5` | Studio and First Light | A viewport-first studio and the first public release, v0.5.0 |

`wave5` was cut from `main` after the Wave 4 merge.

## Wave 4: Visual core

### W4.S1: Visual core spike and benchmark

**Done (0791036).** The standalone `web/spike/spike.html` proved the
direction, and the owner reviewed the side-by-side:

- GPU terrain generation and droplet/thermal erosion at 2048² over 16 km
- a 196 km far field
- min/max-pyramid heightfield tracing
- Hillaire sky LUTs, height fog and AgX

Measured on an Apple M4 at 1080p:

| Measure | Spike | Previous renderer |
|---|---|---|
| Throughput | 32–47 M paths/s | 2.4–3.1 M paths/s (about 13× slower) |
| First sample after an edit | 0.1–0.16 s | — |
| Clean image | about 10 s | — |
| Full erosion | 3.3 s | — |

Also done:

- Added hero scenes H1–H6 to `bench/hero/`, with a rubric guide and a
  scores sheet.
- Added `bench/hero.mjs`, which renders the shots and composes a contact
  sheet. It produced the legacy "before" baseline.
- `/spike/` serves its directory index, which fixed a failing smoke test.
- Evidence images are no longer committed; `bench/out/` is git-ignored.

The old site assets stay in place until the W5.S5 site rebuild. The current
site build verifies their checksums, and deleting them would not shrink git
history.

**Gate:** baseline images and timings exist, and the owner agrees to the
rubric. Scores go in [bench/hero/scores.md](bench/hero/scores.md).

### W4.S2: Production terrain and erosion

**Done.** Terrain lives in `web/terrain/` (see its README) and every shader in
`web/wgsl/`. A stream-power drainage solve on a 1024² grid (16 m) carves
connected valley networks: depression filling, multiple-flow-direction area,
semi-implicit incision and talus. A 768² solve does the same for the 196 km far
field. The analytic gully noise is reduced to fine detail, and 1.6 M droplets
add gullies and scree. Heightmap import feeds the same pipeline. A full build
takes 3.5 s of GPU time and finishes 4–5 s after page load, rendered live. The
W4.S1 vs W4.S2 side-by-sides are made with `bench/compare.mjs`.

Original plan, for reference:

Tasks:

- **Promote the pipeline.** Move generation and erosion out of `web/spike/`
  into a production terrain module with a clean interface: parameters and
  seed in, textures out, deterministic. Until W4.S3 makes the new tracer the
  viewport, exercise it through the spike page; the legacy studio keeps its
  CPU terrain.
- **Real drainage.** Add a coarse-grid erosion pass (or the virtual-pipe
  model) before the fine 2048² droplet pass. Branching drainage at kilometre
  scale should come from simulation, with the spike's analytic gully noise
  reduced to fine detail.
- **Far field.** Erode the far field at lower resolution so that middle-
  distance ranges match the tile.
- **Generators.** Gradient noise, derivative-damped fBm, ridged multifractal,
  domain warp and terraces, plus heightmap import into the same pipeline.
- **Masks.** Flow accumulation, deposition, wetness, slope, curvature and
  exposure/occlusion, stored as textures. Materials (W4.S6) and later
  scattering consume them.

**Gate:**

- Rendered through the spike page at the W4.S1 spike cameras, the mountains
  read as eroded in an owner side-by-side against the W4.S1 spike: simulated
  branching drainage, sharp incised ridges and talus at the base of slopes.
- Eroding a 2048² terrain takes seconds, not minutes.

### W4.S3: The spike's tracer becomes the viewport

**Done.** The app is now a full-window progressive render with a compact panel,
built on `web/render/` and a clean version 1 scene format whose schema the server
and browser share. The legacy renderer, its UI, old scene versions, the old site
and `web/spike/` are removed. Exports render H1–H6 at 1920 × 1080 in 3–6 s at 96
samples. Rock fracture and strata detail sharpen close slopes. The viewport
denoiser, sky importance sampling and blue-noise sampling moved to W4.S4. The W3
primitives return with the object tools in W5.S3.

Original plan, for reference:

- **Replace the renderer.** Move the spike's tracer into `web/render/` as the
  studio viewport and final renderer. Delete the old tracer, the triangle
  heightfield, the legacy shading branches, CPU value-noise terrain and
  `web/spike/`.
- **Connect terrain to scenes.** Store the W4.S2 terrain parameters in the
  scene document. Erode becomes a seeded, undoable scene operation that
  autosaves. Re-author the hero scenes in the new format with the same
  intent.
- **One render loop.** One persistent device, a full-frame dispatch every
  animation frame, and accumulation and display on the GPU. Read back only for
  export. Interaction lowers resolution and never blocks.
- **Sharp foregrounds.** Close slopes are soft in the spike, because the
  texture has 7.8 m texels. Add smoother (bicubic) height reconstruction plus
  procedural displacement and normal detail near the camera.
- **Sampling.**
  - blue-noise or low-discrepancy sequences
  - importance-sampled sky, replacing the spike's cosine sampling
  - a firefly clamp
- **Denoising.** An edge-aware à-trous viewport denoiser driven by albedo,
  normal and depth.
- Re-attach the W3 analytic primitives and the physical camera (depth of
  field, framing, region render).

**Gate:**

- The speed budget is met and recorded in the real app.
- Ground-level 1:1 foreground crops are sharp and show no faceting.
- The old renderer code is gone.

### W4.S4: Sky, atmosphere and light

**Done.** `web/render/post.js` runs four post stages on the GPU:

- **Resolve** turns the accumulated sums into averages plus denoise guides.
- **Denoise** runs four edge-aware à-trous passes (albedo, normal, distance and
  variance-scaled luminance stops), blended away as samples accumulate.
- **Bloom** is six levels deep.
- **Meter** measures a centre-weighted mean for auto-exposure.

The display adds exposure compensation, warmth, vignette, grain and five looks:
AgX natural and rich, ACES cinematic, soft, and black & white. Path decisions use
an 8-dimensional R-sequence. Water reflections take their haze from the
aerial-perspective LUT. The presets are retuned, and H1 and H3 now show depth
layering with lit shadows. The sun disk already had limb darkening.

Changed from the plan:

- Sky importance sampling was dropped. Cosine bounces plus the denoiser already
  converge cleanly, and the sun is sampled directly.
- The moon moves to the night-and-weather work.
- Artistic sky tint moves to the Wave 5 studio controls.

Writing denoise guides costs about 8–25% more per sample. In exchange, a
16-sample denoised view looks like a raw 128-sample one.

Original plan, for reference:

- **Sampling and noise (moved from W4.S3).**
  - an edge-aware à-trous viewport denoiser (albedo, normal and depth guides)
  - importance-sampled sky
  - blue-noise or low-discrepancy sequences

- **Correct haze everywhere.** Bounce rays and reflections use the
  aerial-perspective LUT at the hit point. This replaces the camera-altitude
  sky view and the analytic haze in the spike.
- **Atmosphere.**
  - haze layers and tuned light shafts
  - a sun disk with limb darkening, and a moon
  - artistic sky tint controls
- **Image pipeline.**
  - an ACES option alongside AgX
  - auto-exposure and white balance
  - bloom/glare, vignette and subtle grain
  - a handful of looks
- **Defaults.** Golden-hour presets, with haze on by default. Fix the murky
  shadowed foregrounds in the spike's golden-hour shot.

**Gate:**

- H1 and H3 show clear depth layering, with lit shadows rather than crushed
  ones.
- The owner scores sky and atmosphere at least 4.

### W4.S5: Volumetric clouds

**Done.** The cloud system lives in `web/render/clouds.js` and
`web/wgsl/clouds/`:

- **Shell.** A planet-curved shell with weather-map coverage and a type that
  runs from flat layers to towers.
- **Noise.** Tileable Perlin-Worley shape noise and Worley detail noise,
  generated on the GPU.
- **Lighting.** A sun light-march, a two-lobe phase function and
  multiple-scattering octaves. Beer-powder fades out sunward, so backlit edges
  glow.
- **Cirrus.** A wind-stretched veil at 9 km.
- **Shadows.** Clouds shadow the terrain, water and fog, so light shafts come
  through the gaps.
- **Reflections and distance.** Clouds appear in lake reflections and fade with
  distance through the aerial-perspective LUT.
- **Sky light.** Cover dims the sky light.

Distant planet ground beyond the far field removes the old horizon line. The
panel has six sky presets and a New sky button. Clouds add 0–33% per sample
depending on how much cloudy sky is in frame.

Known gap: the storm preset gives broken, backlit cloud rather than true
cumulonimbus (anvils and towering columns). Modelling those needs dedicated
shapes, which belong with the weather work.

Original plan, for reference:

- **Cloud layers.**
  - a weather map for coverage and type
  - 3D Perlin-Worley base noise and Worley detail noise, generated on the GPU
  - height profiles for cumulus, stratocumulus and cumulonimbus
  - a 2D cirrus layer
- **Lighting.**
  - a light march toward the sun, with Beer-powder
  - a dual-lobe phase function and a multiple-scattering approximation
  - ambient light from the sky LUT
- **Integration.** Cloud shadows on terrain and in fog; clouds take part in
  aerial perspective.
- **Presets.** Fair-weather cumulus, overcast, storm towers, mackerel sky and
  sunset cirrus, plus a seeded "new sky" button.

**Gate:**

- The H2 and H5 skies read as photographic to the owner.
- No banding.
- The cost is recorded.

### W4.S6: Materials from landform, and water

**Done.** Materials live in `web/wgsl/trace/material.wgsl`, with the biome
palettes in `web/render/biomes.js`:

- **Layers.** The erosion and exposure masks place every layer:
  - bedrock in level strata (irregular formations carrying thinner beds)
  - scree on talus
  - gravel in stream beds
  - meadow with tussocks, dry patches and outcrops
  - forest with crowns and clearings
  - sand on shores and dry washes
  - snow by altitude, slope, aspect, hollows and shelter
- **Wetness.** Wet ground darkens and smooths.
- **Shading.** Lambert plus GGX specular, with roughness per material.
- **Biomes.** Alpine, Desert, Volcanic, Arctic and Imagined.
- **Panel.** A Ground & water panel with biome, snow line, tree line,
  moisture, rock layers and waves.
- **Water.** Multi-octave, wind-driven wave normals and shoreline foam, on top
  of the existing depth colour and traced reflections.
- **Clouds.** A far cloud deck carries the clouds on to the horizon, removing
  the bright line under overcast skies (seen in H4 since W4.S5).

Fine texture and detail normals apply to camera rays only. Materials add
6–21% per sample over W4.S5.

Known gaps:

- Material presets with rendered thumbnails moved to the W5.S1 preset
  galleries. Biomes are the material presets for now.
- Meadows in shadowed foreground stay soft at 1:1. Real grass needs the
  vegetation wave.

Original plan, for reference:

The spike's materials are albedo-only, picked from slope, height and the
masks.

Tasks:

- **Terrain materials.** Layered materials driven by the W4.S2 masks:
  - stratified bedrock
  - scree where material is deposited
  - sediment in channels
  - soil and grass on gentle, wet slopes
  - snow placed by normal, altitude, aspect and concavity
  - wet darkening near water
- **Shading.** Specular response (GGX) and roughness for rock, snow and wet
  surfaces.
- **Detail.** Macro variation, plus filtered multi-scale detail and normals
  that fade with distance.
- **Material presets**, with thumbnails rendered by the real renderer.
- **Water.**
  - sky reflection through the LUTs
  - multi-octave wave normals and depth colour
  - shoreline foam and wet sand

**Gate:**

- 1:1 foreground crops read as rock, scree, snow and grass, not as noise.
- Materials score at least 4 on H1 and H4.

**Wave 4 is done** when every slice gate has passed and the `wave4` pull
request is merged. Tag it v0.4.0. It is not published. The draft end-of-wave
scores are in `bench/hero/scores.md`, waiting for the owner.

## Wave 5: Studio and First Light

Wave 4 made images worth sharing. Wave 5 makes them easy and enjoyable to
make, then ships v0.5.0.

The design principles for every studio slice:

- **The image is the interface.**
  - The full-bleed viewport fills the window.
  - Chrome is a thin top bar and a lab rail, both quiet and dark.
  - Drawers float over the image and close out of the way.
  - The page never scrolls.
- **Labs, not forms.**
  - Each lab is a focused drawer: a gallery first, then a few controls.
  - Gallery thumbnails are rendered by the real renderer. Where a choice
    doesn't change the terrain, the thumbnails show the current view with
    that choice applied.
  - Advanced options stay folded away.
- **Tactile controls.**
  - Sliders and scrubbable values with units and sensible ranges, shown
    rounded ("39°", not 39.381955…).
  - A time-of-day dial and a sun you can drag on a sky dome or directly in the
    view.
  - Click to focus, and camera bookmarks as a filmstrip.
- **Joy.**
  - A Randomize button per lab, seeded and undoable.
  - One big Render button.
  - Region renders by dragging a marquee.
- **Plain language.** Short labels and no paragraphs inside panels.
  Explanations live in help popovers.

| Slice | Name | Outcome |
|---|---|---|
| W5.S1 | Layout and labs | Viewport-first layout, lab rail and drawers, rendered galleries |
| W5.S2 | Tactile controls | Scrubbable values, sun dome and drag, click to focus, Randomize, in-place and region renders |
| W5.S3 | Framing, cameras and onboarding | Aspect and framing guides, camera filmstrip, first-run path, help |
| W5.S4 | Preset pack and visual gaps | Ten or more presets at rubric target; canyon terraces, sky tint, storm clouds |
| W5.S5 | First Light (v0.5.0) | Site gallery, format freeze, native release checks, packaging |

### W5.S1: Layout and labs

**Done.** The layout is in `web/index.html` and `web/app.css`, and the labs are in
`web/ui/`:

- **Chrome.** A top bar (title, undo/redo, File menu, help, Render) and a rail of
  seven labs, each with one drawer.
- **Live galleries.** Light, Sky, Ground & water, Camera and Image show the current
  view with each choice applied. `Renderer.renderVariants` renders them with a second,
  small tracer, so the view keeps refining. A batch of six takes about 0.5 s (Apple
  M4, Chrome).
- **Scenes gallery.** Thumbnails rendered by `bench/thumbnails.mjs`.
- **Keyboard and controls.** The keyboard shortcuts and restyled controls.
- **Screenshots.** `bench/ui.mjs` writes the layout screenshots to `bench/out/w5s1/`.

Known gaps:

- The Terrain lab has no gallery. Terrain variants need a rebuild each (about
  5 s); the Terrain lab's Randomize (W5.S2) covers exploring for now.
- After editing presets, rerun `bench/thumbnails.mjs` to refresh the Scenes
  thumbnails.

Original plan, for reference:

Tasks:

- **Top bar.**
  - the scene title
  - undo and redo
  - a File menu: New, Open, Save
  - a quiet status readout and a help popover
  - the primary Render button
- **Lab rail with seven labs**, one drawer open at a time:
  - **Scenes:** the preset gallery
  - **Terrain:** seed, relief, erosion and heightmap import
  - **Light:** time-of-day gallery, sun, haze and fog
  - **Sky:** cloud gallery and cloud controls
  - **Ground & water:** biome gallery, snow line, tree line, moisture, rock
    layers and waves
  - **Camera:** lens gallery and lens
  - **Image:** look gallery, exposure, warmth, glow, vignette, grain, plus
    debug views under Advanced
- **Galleries rendered by the real renderer.**
  - Light, Sky, Ground, Camera and Image galleries render live, small, from
    the current view, in the background when a drawer opens.
  - Scene thumbnails are rendered by `bench/thumbnails.mjs` through the export
    path and ship with the app.
- **Keyboard.** `1`–`7` open labs, `Esc` closes the drawer, and `H` hides the
  interface.
- **Controls.** Restyle them: label and value above a full-width slider,
  values rounded with units.
- **Screenshots.** Layout screenshots from `bench/ui.mjs`.

**Gate:** the owner signs off on layout screenshots at 1440×900 and
2560×1440.

### W5.S2: Tactile controls and direct manipulation

**Done.**

- **Scrub and type.** Values scrub when dragged (Shift for fine) and turn into a
  field when clicked. Each lab's units parse typed values.
- **Sun.** The Light lab has a sky dome (`web/ui/sundome.js`): drag the sun, and a
  wedge shows the view. Option/Alt-drag in the view, or the target button, puts the
  sun where you point.
- **Focus.** Double-click focus reads the tracer's first-hit distance
  (`Renderer.pick`).
- **Randomize.** Per lab, in `web/scene/randomize.js`: seeded, undoable, and
  limited to the lab's own settings.
- **In-place render.** Render refines in the viewport with a progress ring, time
  left and Cancel. Exports use their own tracer, so the view keeps its samples.
- **Region renders.** R plus a drag renders a box at full resolution through a
  frame `window`, drawn over the view with its exposure.

Changes from the plan:

- The time-of-day dial became the sky dome plus the Light lab's time-of-day
  gallery. The dome sets both sun angles directly and shows the light relative
  to the view, which a time dial can't.

Known gaps:

- Renders aren't bit-identical between runs: two exports of the same scene differ
  slightly in fine terrain detail (PSNR about 38 dB). The likely cause is the
  order of atomic adds in the GPU droplet erosion, which predates this slice.
  Exact repeatability belongs with the W5.S5 format freeze.

Original plan, for reference:

Tasks:

- **Scrubbing.** Drag a value to change it, or click to type.
- **Sun.**
  - a time-of-day dial for the Light lab
  - drag the sun in the view
- **Focus and Randomize.**
  - click the terrain to set the orbit pivot
  - a seeded, undoable Randomize per lab
- **In-place render.**
  - Render refines the image in the viewport with a progress ring, then saves.
  - Drag a marquee to render a region at full quality.

**Gate:** the owner can light and frame a scene without typing a number.

### W5.S3: Framing, cameras and onboarding

Tasks:

- **Framing.**
  - the image aspect is part of the scene: 16:9, 3:2, 4:5, 1:1 and 21:9
  - a framing mat, plus thirds and golden-ratio guides
  - exports use the scene aspect, not the window's
- **Cameras.** Camera bookmarks as a filmstrip, with thumbnails.
- **Onboarding.**
  - a first-run path that starts from a preset
  - help popovers
  - a plain-language pass over every label

Objects (boulders, primitives, imported meshes) need a mesh path in the new
tracer. They move to the "Rocks and objects" wave after First Light.

**Gate:** three first-time users each get from launch to a shareable image in 5
minutes or less, without docs.

### W5.S4: Preset pack and visual gaps

Tasks:

- **Close the Wave 4 rubric gaps:**
  - canyon landforms (terraces, mesas and cliff bands) for H4
  - shadow fill and wall materials for H3
  - artistic sky tint
  - true cumulonimbus for storm skies
- **Presets.** Ten or more built-in presets that meet the rubric, with
  thumbnails.

**Gate:** no hero-shot score below 4 on H1–H4, and every built-in preset is
signed off.

### W5.S5: First Light (v0.5.0)

Tasks:

- A site gallery regenerated from real renders.
- Freeze scene format v1.
- Close the native Windows/Linux release checks.
- Release notes and packaging.

**Gate:** the definition of done below, plus the First Light rubric target.

## After First Light

These are re-sequenced by visual impact and become Waves 6 and later:

1. **Vegetation and scattering.** Procedural trees, shrubs and grass with
   instancing, mask-driven scatter and a paint brush. Landscapes without
   vegetation hit a ceiling quickly, so this comes first.
2. **Rocks and objects.** Procedural boulders, glTF import, a mesh BVH and
   CSG primitives.
3. **Oceans and coastlines.** A spectral ocean, foam, beaches and coastal
   geology.
4. **Night and weather.** Stars, the Milky Way, moonlight and twilight, plus
   rain, snow and mist.
5. **Production output.**
   - tiled 4K/8K, EXR with AOVs and a denoiser (audited before adoption)
   - a render queue
   - panorama and sky export
6. **Automation.** A command API, an MCP server and a Python client. This can
   come earlier, because the Go server already exists.
7. **Animation.** Keyframes, camera paths and frame sequences.
8. **Imagined worlds.** SDF arches, overhangs and floating landforms, and
   planetary vistas.

## Definition of done (every slice)

- The owner has reviewed and accepted the hero-shot side-by-side (layout
  screenshots for studio slices), and the rubric scores are recorded.
- Timings are recorded with device, browser, resolution and samples.
- Tests for changed behavior pass, and the Go server, security and recovery
  tests stay green.
- Docs are updated only where behavior changed.

## Foundation delivered in Waves 1–3

- **W1:**
  - embedded Go server and app-window launcher
  - versioned scenes with undo and recovery
  - a first progressive WebGPU tracer with PNG export
  - packaging and the generated site
- **W2:** layered terrain, sculpting, slope/height materials and 16-bit
  heightmap interchange.
- **W3:**
  - a single-scattering atmosphere and detailed final-terrain tiers
  - geological surface shading and bounded light transport with area lights
  - lake optics, and a physical camera with depth of field
  - an entity/selection model, primitives with transform tools, editor views
    and camera bookmarks

The native Windows/Linux release checks from Wave 1 remain open and are
closed in W5.S5.
