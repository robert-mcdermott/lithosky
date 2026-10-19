# Lithosky roadmap

Updated 2026-10-19. This is a course correction after Wave 3. It replaces the
previous Wave 4–10 plan, which remains in git history.

**Status:** Wave 4 in progress. W4.S1 and W4.S2 are complete; W4.S3 (the new
tracer becomes the viewport) is next.

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

Wave 5 may start once W4.S3 lands, because the studio needs the new viewport.
At that point, cut `wave5` from `wave4`. Merge `wave4` into `wave5` as the
later Wave 4 slices land.

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

The old site assets stay in place until the W5.S4 site rebuild. The current
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

Tasks:

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

The spike already has the Hillaire LUTs, height fog with terrain-shadowed
in-scattering, and AgX.

Tasks:

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

Tasks:

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
request is merged. Tag it v0.4.0. It is not published.

## Wave 5: Studio and First Light

The design principles for every studio slice:

- **The image is the interface.**
  - The full-bleed viewport fills at least 75% of the window.
  - The page never scrolls.
  - The chrome is dark and quiet.
- **Labs, not forms.**
  - Top-level labs: Terrain, Sky & Light, Materials, Water, Camera and Render.
  - Each lab is a focused drawer: a preset gallery with real rendered
    thumbnails first, then controls.
  - Advanced options stay folded away.
- **Tactile controls.**
  - Sliders and scrubbable values with units and sensible ranges, shown
    rounded ("39°", not 39.381955…).
  - A time-of-day dial and a sun you can drag on a sky dome or directly in the
    view.
  - Click to focus, and camera bookmarks as a filmstrip.
- **Joy.**
  - A Randomize button per lab, seeded and undoable.
  - A nano-preview and one big Render button.
  - Region renders by dragging a marquee.
- **Plain language.** Short labels and no paragraphs inside panels.
  Explanations live in help popovers.

### W5.S1: Layout and labs

Tasks:

- Replace the scrolling form with the viewport-first layout.
- Build the lab drawers.
- Build the preset galleries, with thumbnails rendered by the real renderer.
- Retire the old `index.html`, `app.js` and `styles.css` panels.

**Gate:** the owner signs off on layout screenshots at 1440×900 and
2560×1440.

### W5.S2: Tactile controls and direct manipulation

Tasks:

- Sliders and scrubbable values with units and rounded display.
- A time-of-day dial and a draggable sun.
- Click to focus.
- Per-lab Randomize.
- The nano-preview, the big Render button and the region marquee.

**Gate:** the owner can light and frame a scene without typing a number.

### W5.S3: Objects, cameras and onboarding

Tasks:

- Rebuild the object list and transform tools inside the new layout, reusing
  the W3 entity and history model.
- Build the camera bookmark filmstrip.
- Add a first-run path that starts from a preset.
- Do a plain-language pass over every label.

**Gate:** three first-time users each get from launch to a shareable image in 5
minutes or less, without docs.

### W5.S4: First Light (v0.5.0)

Tasks:

- Ten or more built-in presets that meet the rubric.
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
closed in W5.S4.
