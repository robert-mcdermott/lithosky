# Lithosky roadmap

Updated 2026-10-19. This is a course correction after Wave 3. It replaces the
previous Wave 4–10 plan, which remains in git history.

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

**Decision:** keep the shell and rebuild the image core and the studio. Wave 4
as previously planned (clouds on the current renderer) is cancelled; its goals
move into V3–V4 below.

## Working agreements

1. **The picture is the acceptance test.** Every milestone ends with a
   side-by-side of the hero shots against the previous milestone, reviewed by
   the project owner. Unit tests prove correctness; they never prove progress.
2. **Gates block.** Don't start the next milestone while the current visual
   gate is open. Fix the picture first.
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

**Rubric.** At each milestone the owner scores every shot from 1 to 5 on eight
criteria: landform, sky, depth/atmosphere, light and shadow, materials, water,
noise and artifacts, and composition. The First Light target is no score below
4 on H1–H4.

## Milestones

The work runs on two tracks:

- **Track A (image)** runs V1 to V5 in order.
- **Track B (studio)** starts after V2, once the new viewport exists.

### V0: Reset and benchmark

Tasks:

- Tag the current state `legacy-renderer-w3`.
- Add `bench/` with:
  - the hero scenes (approximated with today's renderer for now)
  - a headless capture harness
  - a side-by-side comparison page
- Render the H1–H6 baseline. This is the "before" picture.
- Stop committing evidence images. Move `docs/site/assets` captures out of
  the tree, keeping only what the site needs.

**Gate:** baseline images and timings exist, and the owner agrees to the
rubric.

### V1: GPU terrain with erosion

This is the biggest single visual win.

Tasks:

- **Generation.** Generate terrain in WebGPU compute, in real-world metres, as
  float textures: 2048² by default, 4096² on capable devices.
- **Generators.** Gradient noise, derivative-damped fBm, ridged multifractal,
  domain warp, terraces and heightmap import.
- **Erosion.**
  - Hydraulic erosion, using a GPU droplet model or the virtual-pipe model.
  - Thermal (talus) erosion.
  - Both run interactively with a live preview behind an Erode control, and
    are undoable.
- **Derived masks.** Flow accumulation, deposition, wetness, slope, curvature
  and exposure/occlusion, stored as textures. Materials (V5) and later
  scattering consume them.
- Retire CPU value-noise generation.

**Gate:**

- H1 and H2 silhouettes read as eroded mountains in an owner side-by-side:
  branching drainage, sharp incised ridges and talus at the base of slopes.
- Eroding a 2048² terrain takes seconds, not minutes.

### V2: Progressive tracer as the viewport

Tasks:

- **One render loop.** One persistent device, a full-frame dispatch every
  animation frame, and accumulation and display on the GPU. Read back to the
  CPU only for export.
- **Direct heightfield tracing.** Trace the heightfield straight from the
  texture, with no triangulation:
  - a min/max mip pyramid, rebuilt on the GPU after each edit
  - bilinear-patch refinement
- **Far terrain.** Continue the terrain procedurally beyond the editable tile
  out to 100 km or more, so the horizon is always landforms in haze, never an
  edge.
- **Sampling.**
  - low-discrepancy or blue-noise sequences
  - sun next-event estimation with a finite disk, for soft shadows
  - importance-sampled sky
  - 2–3 bounces, with a firefly clamp
- **Denoising.** An edge-aware à-trous viewport denoiser driven by albedo,
  normal and depth. Final-render denoising comes later.
- Re-attach the W3 analytic primitives to the new tracer, then delete the old
  tracer, the triangle heightfield and the legacy shading branches.

**Gate:**

- The speed budget is met and recorded.
- 1:1 foreground crops show no faceting.
- The old renderer code is gone.

### V3: Sky, atmosphere and light

Tasks:

- **Sky.** A physical sky with multiple scattering: transmittance,
  multiple-scattering, sky-view and aerial-perspective LUTs on the GPU (the
  Hillaire 2020 method), at true kilometre distances.
- **Haze.** Height fog and haze layers with in-scattering, and shadowed light
  shafts.
- **Sun and moon.** A sun disk with limb darkening, a moon, and artistic sky
  tint controls.
- **Image pipeline.**
  - AgX tone mapping by default, with an ACES option
  - exposure in EV, with optional auto-exposure
  - white balance, bloom/glare, vignette and subtle grain
  - a handful of looks
- **Defaults.** Golden-hour presets, with haze on by default.

**Gate:**

- H1 and H3 show clear depth layering, with lit shadows rather than crushed
  ones.
- The owner scores sky and atmosphere at least 4.

### V4: Volumetric clouds

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

### V5: Materials from landform, and water

Tasks:

- **Terrain materials.** Layered materials driven by the V1 masks:
  - stratified bedrock
  - scree where material is deposited
  - sediment in channels
  - soil and grass on gentle, wet slopes
  - snow placed by normal, altitude, aspect and concavity
  - wet darkening near water
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

### V6: The studio (Track B, starts after V2)

Design principles:

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

The existing object list and transform tools are rebuilt inside this layout,
reusing the entity and history model.

**Gate:**

- Three first-time users each get from launch to a shareable image in 5
  minutes or less, without docs.
- The owner signs off on layout screenshots at 1440×900 and 2560×1440.

### V7: First Light (v0.4.0)

Tasks:

- Ten or more built-in presets that meet the rubric.
- A site gallery regenerated from real renders.
- Freeze scene format v1.
- Release notes and packaging.

**Gate:** the definition of done below.

## After First Light

These are re-sequenced by visual impact:

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

## Definition of done (every milestone)

- The owner has reviewed and accepted the hero-shot side-by-side, and the
  rubric scores are recorded.
- Timings are recorded with device, browser, resolution and samples.
- Tests for changed behavior pass, and the Go server, security and recovery
  tests stay green.
- Docs are updated only where behavior changed.

## Foundation delivered in Waves 1–3

The tag `legacy-renderer-w3` preserves the previous detailed slice plans and
validation docs.

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
handled during V7.
