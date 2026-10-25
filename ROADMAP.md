# Lithosky roadmap

Updated 2026-10-24. The course correction after Wave 3 replaced the previous
Wave 4–10 plan, which remains in git history.

**Status:** Waves 4 and 5 are merged and tagged (v0.4.0 and v0.5.0, First Light).
Wave 6 (vegetation and distribution) is in progress on `wave6`. W6.S1 (distribution)
and W6.S2 (forests) are done; W6.S3 (shrubs, grass and ground cover) is next.

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
| 6 | `wave6` | Vegetation and distribution | Forests, shrubs and grass placed by the land; one-line installers and checksummed executable releases; v0.6.0 |

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

The old site was removed in W4.S3; W5.S5 builds a new one from real renders.

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
primitives return with the "Rocks and objects" wave after First Light.

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
  Exact repeatability was attempted in W5.S5 and moved after First Light.

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

**Done.**

- **Framing.**
  - `image.aspect` (16:9, 3:2, 4:5, 1:1, 21:9) sets the frame the view shows and
    the shape every render saves
  - a narrower frame slides clear of the drawer
  - thirds and golden-ratio guides overlay it
- **Saved views.** `cameras` holds up to 24 saved views, shown in the Camera lab as
  a rendered filmstrip. Clicking one flies there. Views can be renamed and
  removed.
- **Onboarding.**
  - a welcome card with the scenes on first run, then a tip at the labs
  - a line of help per lab and a hover hint per control
  - a plain-language pass over the labels

Not done here: the gate itself. Three first-time users each getting to a
shareable image in 5 minutes needs the owner to run the sessions.

Original plan, for reference:

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

**Done.**

- **Canyon landform.** `landform: canyon` builds a plateau with mesas, buttes and
  benches, a river gorge, and distant ranges. Its formations
  (`web/wgsl/terrain/strata.wgsl`) step slopes into cliffs and ledges. The rock
  materials colour the same formations, and steeper erosion limits keep the
  cliffs.
- **Storm clouds.** Towering cloud forms separate cells, whose towers narrow,
  billow and grow downwind anvils. Low cover leaves lone thunderheads.
- **Sky colour.** `atmosphere.tint` changes the Rayleigh exponent, so the sky and
  the haze shift together.
- **Fixes.**
  - Fog and clouds on sky rays stop at the distant ground, which raises to the
    landform's level.
  - Forest grows on steeper wet slopes.
  - Rock bands fade on level ground.
- **Presets.** Thirteen scenes with new thumbnails. H3, H4 and H5 were retuned,
  and six scenes are new.

Known gaps:

- **H3's walls** are still mostly bare rock (materials scored 3 in the draft).
  Real forest needs the vegetation wave.
- **Storm anvils** show best from afar; nearby cells read as big cumulus.
- **H6** is unchanged.
- **Timings this slice are unreliable**, because other work loaded the machine.

Original plan, for reference:

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

**Done.**

- **Format v1 frozen.** `tests/fixtures/v1/` holds every built-in scene, a minimal
  scene and the frozen schema. Go and JS tests open the corpus, and
  `tests/format.test.mjs` fails if the schema removes or narrows anything.
- **Site.** `site/` is a static product page with a gallery of 12 scenes and a hero
  image rendered by `bench/gallery.mjs`, plus a studio screenshot. The manual
  **Publish site** workflow deploys it to Pages.
- **Release checks.**
  - All six archives build and verify locally.
  - CI's native smoke is green on macOS, Windows and Linux for every Wave 5 slice
    (the latest is run 39903802028).
  - `docs/releases.md` lists the owner's real-browser checks and the publishing steps.
- **Release.** Version 0.5.0, a changelog entry, release notes
  (`docs/release-notes/0.5.0.md`) and a new packaged README.

Not done here: anything that needs Windows or Linux hardware, a real browser on those
systems, or publishing. Those are the owner's steps in `docs/releases.md`.

The rubric target is not met in the draft scores: H3's materials score 3, against a
target of no score below 4 on H1–H4 (see W5.S4). The owner decides whether to release
with that or wait for vegetation.

Original plan, for reference:

Tasks:

- **Freeze scene format v1.**
  - Write down the compatibility promise.
  - Keep a corpus of v1 scenes (every built-in scene plus a minimal one) that
    every future build must open, in Go and JavaScript.
  - Add a test that the schema only grows: no removed fields, narrowed ranges or
    dropped choices.
- **Site.** A static product page in `site/` with a gallery rendered by the real
  renderer through `bench/gallery.mjs`. A manual Pages workflow publishes it only
  when the owner runs it.
- **Release checks.**
  - Build and verify all six archives locally.
  - Record the green native CI smoke on macOS, Windows and Linux.
  - Keep a checklist for the owner's real-browser checks on each OS.
- **Release.** Version 0.5.0, a changelog entry, release notes, and a rewrite of
  the packaged README for the new studio. Tagging and publishing remain the
  owner's actions.

Repeatable renders are not part of this release. Making droplet erosion
order-independent (each batch reading a snapshot) piled droplets into the same
cells and broke the terrain, so it needs per-cell limits and retuning. That work
is listed after First Light.

**Gate:** the definition of done below, plus the First Light rubric target.

## Wave 6: Vegetation and distribution

Landscapes without vegetation hit a ceiling quickly; H3's bare walls are the clearest
case in the rubric. Wave 6 grows forests, shrubs and grass from the same masks that
place the materials. It also makes Lithosky easy to install and update, following
the pattern proven in cytoweave and proteoscope.

| Slice | Name | Outcome |
|---|---|---|
| W6.S1 | Distribution | Executable releases with `SHA256SUMS`, tag-driven draft releases, one-line installers, and a site that deploys |
| W6.S2 | Forests | Instanced procedural trees traced in the renderer, placed by landform and biome |
| W6.S3 | Shrubs, grass and ground cover | Near-field grass and shrubs, meadow detail, distance blending |
| W6.S4 | Vegetation lab and painting | Density, species and size controls, and a brush to paint or clear vegetation |
| W6.S5 | Release v0.6.0 | Hero rescoring (H3 to target), presets and gallery with vegetation, shipped through the new pipeline |

### W6.S1: Distribution

**Done.**

- **Release format.** `tools/release` builds six executables and `SHA256SUMS`, and
  verifies them: checksums, Mach-O/ELF/PE format and CPU, notices, version, and
  that this computer's executable runs.
- **Licences.** `lithosky --licenses` prints the embedded notices.
- **Installers.** `install.sh` and `install.ps1` are adapted from the proteoscope
  installers. `--from`/`-From` installs from local files.
- **Workflows.**
  - Release: a tag push produces a draft release.
  - CI: the installers are tested on all three OSes, including a tampered file
    being refused.
  - Publish site: deploys on changes to `site/`.
- **Docs.** `docs/INSTALLING.md`, a rewritten `docs/releases.md`, and the README
  and site Download sections.

`install.sh` was tested here on macOS. It installs and reinstalls, refuses a tampered
binary and a manifest without its entry, and strips the quarantine flag. `install.ps1`
can only be exercised by CI on Windows (there's no PowerShell on the development
Mac).

Still the owner's steps:

- switch Pages on once
- the gate's tagged release candidate through both installers on each OS

**Why the site didn't deploy.** The Publish site run (40122465338) failed in
`actions/configure-pages`. GitHub returned Not Found because the repository has no
Pages site configured. The workflow's `GITHUB_TOKEN` can't create one: Pages has to
be switched on once, with GitHub Actions as the source, in Settings → Pages or
through the API.

Tasks:

- **Release format.** Six raw executables (`lithosky-darwin-arm64`,
  `lithosky-darwin-amd64`, `lithosky-linux-amd64`, `lithosky-linux-arm64`,
  `lithosky-windows-amd64.exe`, `lithosky-windows-arm64.exe`) plus a `SHA256SUMS`
  manifest, replacing the tar.gz/zip archives. `tools/release` builds and verifies
  that layout locally.
- **Licence notices in the binary.** `lithosky --licenses` prints LICENSE, NOTICE
  and the Go licence, because the archives that carried them go away.
- **Tag-driven releases.** Pushing `vX.Y.Z` runs a Release workflow that:
  - checks the tag, `main.go` and the `CHANGELOG.md` section agree
  - runs the tests, cross-compiles and writes `SHA256SUMS`
  - creates a **draft** release with that version's changelog section

  The owner reviews the draft and publishes it.
- **Installers.**
  - `install.sh` for macOS and Linux, run as `curl … | sh`.
  - `install.ps1` for Windows, run as `irm … | iex`.
  - Each downloads the binary and `SHA256SUMS`, verifies the checksum, runs the
    binary's `--version` check, then installs it atomically. That's
    `~/.local/bin/lithosky` with no sudo, or a per-user folder on Windows with a
    PATH update.
  - Each accepts `--version` and `--install-dir` (or the matching environment
    variables).
- **Installer CI.** CI installs the latest published release with the current
  scripts, on macOS, Linux and Windows (Windows PowerShell and PowerShell 7).
- **Docs.** `docs/INSTALLING.md` covers release files, one-line installs, checking
  by hand, upgrading, uninstalling and building from source. The README and the
  site's Download section show the one-line installs.
- **Site.** Publish site deploys on pushes to `main` that touch `site/`, as well as
  by hand, once Pages is switched on.

**Gate:**

- A tagged release candidate installs and launches through both installers on
  macOS, Linux and Windows.
- A tampered binary or manifest is refused.
- The site is live.

### W6.S2: Forests

**Done.** H1 and H3 read as forested at 1:1 (side-by-sides with Wave 5 are in
`bench/out/w6s2/compare/`). The draft scores put H3's materials at 4, waiting for the
owner (`bench/hero/scores.md`).

- **Trees in the traversal.** Each level-0 near cell (7.8 m) may hold one tree. Its
  position and spread come from a hash of the cell; whether it grows, its height and
  its kind come from a tree map. Crowns lean over the eight neighbouring cells. Each
  canopy texel records which neighbouring trees reach its cell, and the heightfield
  traversal tests only those, keeping the nearest crown hit until the ray reaches it.
- **Forest bake** (`web/render/forest.js`, `web/wgsl/trace/canopy.wgsl`, about 5 ms):
  - plants the tree map from the terrain's forest map (slope, drainage, scree, shore,
    clearing and tree-line noise, baked with the masks) and the scene's surface
  - builds a canopy pyramid, the higher of the ground and any crown over each cell, which
    the near traversal uses instead of the ground pyramid
  - runs when the terrain or surface changes. The view's tracer, exports and region
    renders share one forest, and variant thumbnails have their own.
- **Shapes and shading.** Conifer cones and broadleaf ellipsoids, sized by density,
  altitude and biome (`conifers` share in the biome table). Trunks appear once they're
  a couple of pixels wide. Crowns wider than a few pixels are porous: rays march into
  them against the cloud detail noise. Foliage is shaded with clump-tilted normals and
  darker inner and lower foliage. Broadleaf crowns pass light to their shaded side.
- **Placement change.** The drainage term now only clears stream channels (flow above
  0.7), so valley floors carry forest. This applies to the painted canopy too.
- **Cost.** Measured as the fastest of five runs, trees on against off, 64 spp at
  1920×1080: +36% on H1, +37% on H3 and +37% on Forest lake. That is a little over the
  +30% aim. The timings on this machine varied by up to 2× between runs. Trees are left
  out of fog shadows, second bounces and bounce-point sun rays, and shadow rays stop at
  the first crown.

Not done, or different from the plan:

- Trees don't fade into the painted canopy with distance. They're traced across the
  whole 16 km near tile and stop at its edge, where the far field's painted canopy
  takes over. In the heroes that edge is about 8–15 km out, where a tree is under two
  pixels wide.
- Shapes are still simple up close: no branch tiers or drooping skirts, and no snow on
  branches. W6.S4's lab is the place for species variety.
- Trees vanish while the terrain builds and return when the bake runs.

Tasks:

- **Trees as instances.** Procedural conifer and broadleaf shapes (cones,
  ellipsoids and trunks) on a jittered grid, so the tracer finds the trees near a
  ray by stepping cell by cell rather than storing geometry.
- **Placement.** The masks that place forest today decide where trees stand:
  tree line, slope, moisture, drainage, snow and biome. Clearings and edges stay
  natural.
- **Light.** Trees cast and receive shadows, show in water, fade into the canopy
  texture with distance, and keep the materials' forest colour far away.

**Gate:** H1 and H3 read as forested up close at 1:1, and H3's materials score at
least 4.

### W6.S3: Shrubs, grass and ground cover

Tasks:

- Grass and shrubs near the camera (procedural blades and clumps or shells),
  blending into the meadow material with distance.
- Wind-combed meadows, and scrub for desert and arctic biomes.

**Gate:** 1:1 foreground crops of meadows read as grass, not noise.

### W6.S4: Vegetation lab and painting

Tasks:

- A Vegetation lab:
  - a species gallery per biome, rendered from the current view
  - density, tree size and mix
  - Randomize
- A brush that paints or clears vegetation in the view, stored in the scene as
  an asset. This is additive in format v1, like heightmaps.

**Gate:** the owner can clear a meadow or plant a forest edge without leaving the
view.

### W6.S5: Release v0.6.0

Tasks:

- Rescore the hero shots with vegetation; H1–H4 reach the First Light target.
- Refresh the presets, thumbnails and site gallery.
- Release through the new pipeline: tag, review the draft release, publish, and
  check both installers.

**Gate:** the definition of done below, plus no hero score below 4 on H1–H4.

## After Wave 6

These are re-sequenced by visual impact and become Waves 7 and later:

1. **Rocks and objects.** Procedural boulders, glTF import, a mesh BVH and
   CSG primitives.
2. **Oceans and coastlines.** A spectral ocean, foam, beaches and coastal
   geology.
3. **Night and weather.** Stars, the Milky Way, moonlight and twilight, plus
   rain, snow and mist.
4. **Production output.**
   - tiled 4K/8K, EXR with AOVs and a denoiser (audited before adoption)
   - a render queue
   - panorama and sky export
5. **Automation.** A command API, an MCP server and a Python client. This can
   come earlier, because the Go server already exists.
6. **Animation.** Keyframes, camera paths and frame sequences.
7. **Imagined worlds.** SDF arches, overhangs and floating landforms, and
   planetary vistas.

Also queued: repeatable terrain builds, meaning order-independent droplet
erosion with per-cell limits, so a saved scene always renders the same pixels.

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
