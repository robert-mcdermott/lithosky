# Validation record

## Wave 1, slice 1 (historical)

Validated 2026-10-18 on macOS arm64, Go 1.26.6 and Node 22.17.0.
Current version: `0.1.0-dev.1`. This is a completed foundation slice, not the
v0.1.0 release. No rendering-speed or photorealistic-quality claim is made.

## Automated checks — passed

- `go test ./...`: HTTP Host/Origin/Fetch Metadata boundaries, read-only methods,
  traversal/missing paths, HEAD behavior, module MIME and CSP; app-window argument
  isolation and executable launch failure.
- `go test -race ./...` and `go vet ./...`.
- `node --test tests/renderer.test.mjs`: eight tests for backend selection,
  initialization errors, explicit compatibility/no-GPU modes, deterministic
  terrain, bounded geometry resolution and orthonormal camera data.
- `CGO_ENABLED=0 go build -trimpath` for darwin, linux and windows on amd64 and
  arm64. Cross-compilation is not native execution validation.
- `git diff --check`; private research files remain ignored; no former product
  name or competing landscape product name in commit-eligible source/docs.

## Browser and executable checks — passed locally

Used an isolated installed Chrome session through Playwright CLI. The compiled
binary ran from `/tmp`, outside the repository, serving embedded assets only.

1. WebGPU pipeline compiles and renders a visible landscape, with zero console
   errors or warnings. Scene selection and camera changes alter viewport pixels.
2. WebGL 2 renders the same shared terrain data; switching keeps the edited seed.
3. Disabling the GPU displays the explanatory state. Controls still work.
4. Injected a null adapter and a rejected device request: automatic WebGL fallback.
5. Injected unavailable WebGPU and WebGL contexts: explanatory no-GPU state.
6. Destroyed an actual active WebGPU device: automatic WebGL fallback, seed kept.
7. Lost the WebGL context through its testing extension: no-GPU state; Retry
   graphics returns to WebGPU with the same edited seed.
8. Quick guide opens/closes; viewport is keyboard operable; narrow 390 px layout
   has no horizontal overflow. This is not a full accessibility audit.
9. Browser resource entries all use the local loopback origin. No external app
   assets are requested. This does not audit background traffic from the browser.
10. Launched the compiled app in default app-window mode. Verified `--app` URL,
    a distinct temporary profile, successful local API response, and server exit
    plus profile removal when that spawned browser process closed.

Visual inspection covered the default WebGPU terrain, the imagined palette in
WebGL 2 and the narrow layout. Local screenshots are in ignored
`output/playwright/`; they are QA evidence, not release gallery assets.

## Reproduce the browser checks

Build and run `./bin/lithosky --no-open`, then open its printed URL in a browser.
Change a seed, open Graphics & compatibility, switch WebGL 2 → Disable GPU →
Automatic, and verify the seed survives. Orbit/zoom with mouse and keyboard.
Use browser development tools to simulate device/context loss, null adapter and
request-device rejection, then Retry. Run from another working directory to
verify no source files are required. Launch without `--no-open` to check the
isolated app-window lifecycle.

## Slice 1 limits at completion

Windows/Linux binaries compiled here but have not been run on those systems.
Other browser engines and integrated/discrete GPU combinations remain untested.
The CI workflow has been authored but has not run on a remote CI service.
Startup failures and loss are covered; no sustained GPU stress/performance test
has been performed. An isolated browser profile is removed on normal application
shutdown; an OS kill or crash can leave a temporary profile behind.

The current surface is an opaque preview with approximate lighting and haze.
There is no path tracer, scene save/autosave, image export, physical water,
weather, vegetation or generated product site yet. W1.S2 next adds versioned
scene files, undo and recovery; W1.S3 adds the first progressive tracer; W1.S4
owns packaging, site generation and release readiness.

## Wave 1, slice 2 — scene documents and recovery

Validated 2026-10-18 on macOS arm64, Go 1.26.6 and Node 22.17.0.
Build: `0.1.0-dev.2`. Slice 2 is complete; wave 1 is not yet a release.

Automated checks passed:

- All Go tests, including race detection, plus `go vet ./...`.
- 34 JavaScript tests via `npm test`, including 21 shared schema fixtures used
  by both validators, complete scene/geometry round trips, invalid imports,
  bounded grouped history, serialized autosaves and retries after lost responses.
- Server tests for token and Origin enforcement, JSON media type, body limits,
  invalid/trailing/unknown input, stale revision conflicts and scoped recovery reads.
- Storage tests for pre-publication write failure, orphan pending files, corrupt
  newest-generation fallback, restart recovery, retention, idempotency and
  concurrent writers. Failed requests leave the last valid snapshot untouched.
- Six cgo-free cross-builds: macOS/Linux/Windows on amd64 and arm64. Native
  Windows/Linux filesystem behavior remains to be validated on those platforms.

Browser checks passed in isolated Chrome through Playwright CLI:

- Seed, title, water visibility/level, palette and camera edits; Undo/Redo;
  a multi-input slider drag is undone as one action.
- Save downloads a valid named scene containing the edited camera and all
  settings; Open restores it, and Open itself can be undone and redone.
- Malformed, oversized and unsupported-version files are rejected without
  changing the working seed/scene.
- Reload presents recovery; Restore recovers the edited scene and resumes
  autosave. A forced SIGKILL followed by a new server process also recovers the
  acknowledged scene from the same isolated data directory.
- A second tab with a stale revision cannot overwrite the newer saved seed.
- WebGL backend changes preserve the scene; a 390 px layout has no horizontal
  overflow. Visual inspection covered the document controls and recovery banner.
- Final browser console contained zero errors/warnings. Screenshots are retained
  in ignored `output/playwright/`. Tests used `/tmp` recovery data, not user data.

Limits: autosave preserves acknowledged snapshots, not every keystroke before a
crash. Power-loss guarantees vary by filesystem; directory sync is best effort.
Named Save downloads a new file, rather than updating one in place. History is
limited to 100 in-memory edits. See [scene format](scene-format.md) for recovery
retention, data locations and conflict handling. The remote CI matrix has not
been executed here. Ray tracing, image export and the product site remain W1.S3
and W1.S4 work.

## Wave 1, slice 3 — progressive rendering and PNG export

Validated 2026-10-18 on macOS arm64, Go 1.26.6, Node 22.17.0 and Chrome
155.0.0.0. Build: `0.1.0-dev.3`. WebGPU reported vendor `apple`, architecture
`metal-3`; device/model description was not exposed. Slice 3 is complete; the
v0.1.0 release still requires slice 4.

Automated checks passed:

- All Go tests with race detection, `go vet ./...`, and 40 JavaScript tests.
- CPU heightfield traversal versus exhaustive triangle intersection for vertical,
  grazing, parallel, boundary, inside and underside rays; bounded shadow distance.
- Exact shared dry-preview/final positions, normals, colors and triangle diagonals.
- Fresnel reflection/transmission weights, total internal reflection, finite
  display conversion and complete, nonoverlapping bounded dispatch coverage.
- Six cgo-free cross-builds: macOS/Linux/Windows, amd64 and arm64. This validates
  compilation and asset embedding, not native execution on Windows/Linux.
- `git diff --check`; no application dependencies or external assets added.

The repeatable Playwright CLI callback in `tests/browser-render.mjs` passed
against the compiled executable running outside the repository, using isolated
`/tmp` recovery data and embedded assets with no test route interception:

- 1,024 GPU/CPU intersection comparisons across seeds 1847, 972, 42107 and
  4294967295. Largest absolute hit-distance difference: 0.0000108 scene units
  (gate: 0.002); hit/miss classifications agreed.
- GPU sRGB/Reinhard conversion and Fresnel diagnostics matched CPU values within
  1e-6, including total internal reflection.
- Complete progressive renders at both supported image sizes. PNG signature and
  dimensions checked independently; every decoded RGBA byte equaled the displayed
  canvas. Preview/render toggle worked.
- Cancellation after a complete sample preserved an exportable result and stopped
  further accumulation. Cancellation during adapter initialization yielded no
  image. Scene edits cleared in-flight accumulation; undo restored the scene.
- An edit during delayed PNG encoding prevented a stale download.
- Injected device-request failure and destruction of an active render device
  produced actionable status, preserved scene state and allowed a successful retry.
- Water disabled/enabled changed image pixels; high/low terrain, water and sun
  settings plus close/low and distant/high cameras produced finite nonempty images.
  The low-camera fixture includes a camera below the water plane.
- WebGL 2 fallback disabled final rendering with an explanation; Automatic restored
  availability. Narrow 390 px layout had no horizontal document overflow.
- Zero browser errors or warnings during the final regression run.

Observed end-to-end times (including setup and progressive readback, not isolated
GPU timings) in the final local regression run:

| Scene | Image | Samples | Time |
|---|---|---|---|
| Default Alpine quiet, seed 1847, natural palette, water enabled | 640 × 360 | 8 | 0.5 s |
| Same seed/camera, otherworld palette, water disabled | 960 × 540 | 8 | 0.8 s |

These are single-machine smoke measurements, not a benchmark suite or performance
promise. No discrete GPU, non-Apple integrated GPU, other browser engine or native
Windows/Linux rendering has been validated here. Dispatch sizes are bounded, but
latency and watchdog behavior remain device dependent. Images are not promised to
be bitwise identical across GPUs. Visual inspection covered the natural render,
water reflections and the narrow UI; local evidence is in ignored
`output/playwright/`. [Rendering](rendering.md) documents the simple lighting/water
model and color pipeline. Physical atmosphere, advanced materials and production
image sizes remain future work. Remote CI has not been run in this session.

## Wave 1, slice 4 — starter scenes, generated site and distribution

Implemented and locally validated 2026-10-18, build `0.1.0-dev.4`, on macOS arm64
with Go 1.26.6, Node 22.17.0 and Chrome 155.0.0.0 (WebGPU: Apple / metal-3).
Native Windows/Linux acceptance is pending; no release tag, remote workflow run
or site publication has been performed. See [release gates](releases.md).

Local automated checks passed:

- All Go tests with race detection and `go vet ./...`. The new native smoke test
  builds and starts the executable outside the checkout, compares every served
  embedded asset, saves and recovers a scene across process termination, and
  verifies app-window arguments, profile cleanup and server exit with a helper
  browser process. This test is included in the three-OS CI matrix.
- 43 JavaScript tests, including schema-valid portable starters, preservation of
  the default scene, invalid/duplicate catalog rejection, site generation,
  output-directory protection, and broken local image/anchor detection.
- Four generated pages with 84 checked links and nine image references. Gallery
  scene settings, 960 × 540 PNG dimensions, 64 samples, image SHA-256s, capture
  version and source hashes all matched the committed capture manifest.
- Six cgo-free archives built for macOS/Linux/Windows, amd64/arm64. Verification
  checked outer checksums, executable hashes/modes, exact archive members, license
  notices and all three portable scenes. Unit checks reject tampered executable
  bytes and missing notices and confirm deterministic archive ordering/timestamps.
- `go list -m all` reported only Lithosky; no application libraries were added.
  Private research, binaries, generated site and local QA evidence remain ignored.

Browser checks passed using Playwright CLI:

- All three scenes selected through the actual app controls, rendered and exported
  at 960 × 540 / 64 samples. Their downloaded scene files matched the canonical
  catalog. Original PNGs, the studio screenshot and capture provenance are tracked
  in `docs/site/assets/`; no promotional imagery was substituted for app output.
- The slice 3 GPU regression suite passed again: 1,024 CPU/GPU intersection probes,
  PNG pixel equality, cancellation, scene-edit/encoding races, device loss and
  retry, finite water/camera extremes and WebGL fallback. Zero browser errors.
- Mobile starter selection applied the correct seed/water settings; Undo restored
  the preceding scene. A .lithosky file downloaded from the product gallery opened
  in the app and selected the matching study. The camera tutorial opened correctly.
- Site home/install/guide/gallery checked at 1440 and 390 px: all images decoded,
  no document overflow, working camera-section anchor and keyboard focus, working
  scene download, zero browser errors/warnings, and no off-origin asset requests.
  Visual inspection covered desktop/mobile landing pages and actual gallery PNGs.

The extracted macOS arm64 archive was also launched from `/tmp` with isolated
recovery storage and a real installed Chromium app window. Its API reported the
correct version; the spawned command used the app URL and a temporary profile.
Closing that browser process stopped the server and removed its profile.

Limits: this is a local macOS distribution smoke test, not a clean-machine test
on all platforms. Windows/Linux binaries were cross-built and archives inspected;
they were not executed here. The authored native CI jobs still need a recorded
remote run, and real browser/GPU checks on those platforms remain release gates.
No signing/notarization, public hosting or release publication occurred. W1.S4
implementation is committed independently; the open acceptance checks keep wave 1
in progress and are not silently deferred into wave 2.

## Wave 2, slice 1 — layered terrain and worker generation

Completed locally on 2026-10-18, build `0.2.0-dev.1`, macOS arm64, Go 1.26.6,
Node 22.17 and Chrome 155 with Apple Metal 3 graphics. This is slice validation;
wave 1 native Windows/Linux release gates remain open.

- `npm test`: all 66 tests pass. Shared Go/JavaScript scene fixtures cover v1/v2,
  version/generator mismatches, missing/unknown layer fields, layer count and
  parameter/resolution bounds. Fixed Float32 SHA-256 fixtures cover seeds 0,
  1847 and 4294967295. Composition order, disabled layers and negative terraces
  are checked independently.
- Terrain tests allocate every supported scalar grid through 2048² cells,
  verify bounded storage, cancel partial generation, reject stale worker results,
  exercise worker errors/retry and check height/surface invalidation separately.
  Legacy preview and traced buffers match exactly, including a water boundary
  at a rounded vertex height. Disabled-layer settings and scene metadata retain
  visual resources; camera/light changes submit no terrain job.
- `go test -race ./...` and `go vet ./...` pass. The standalone binary smoke
  runs outside the checkout, verifies every embedded asset (including workers),
  checks authenticated persistence/restart, and tests launcher process cleanup.
- `tests/browser-terrain.mjs` passes: layer addition/edit/toggle/reorder/undo,
  v2 file download/reopen and autosave/recovery, selective invalidation, 2048²
  cancellation, injected worker startup failure and successful retry, PNG export,
  WebGL fallback and 390-pixel mobile layout. No page errors. Desktop/mobile
  screenshots and a layered PNG were visually inspected in ignored
  `output/playwright/`.
- The tested four-layer 2048² generation/retry took roughly 1.3–1.6 seconds,
  with 160–188 animation frames observed during that interval. This is a local
  observation, not a cross-device performance guarantee. The largest scalar
  grid is 16.02 MiB; the documented generation typed-array working allowance is
  about 45 MiB, excluding browser/GC/GPU overhead.
- For 100 layered vertical probe rays, CPU/GPU hit distances differed by at most
  0.00000191 scene units. The layered 640 × 360 / eight-sample still completed in
  about 0.4 seconds locally, with finite output.
- `tests/browser-render.mjs` also passes: 1,024 legacy GPU intersection probes
  (worst difference about 0.0000108 units), PNG decode/display pixel equality,
  cancellation during initialization and accumulation, stale export rejection,
  initialization failure/device loss/retry, extreme water/camera fixtures and
  compatibility fallback. Eight-sample 640/960 renders took about 0.5/0.8 seconds.
- All three original gallery images were recaptured at 960 × 540 / 64 samples;
  their image hashes remain unchanged. The studio screenshot and capture source
  provenance were refreshed. `npm run site` and `npm run site:check` pass for
  four pages, 85 local links and nine image references. The guide describes
  layered terrain and its current render limit.

Generation resolution and render resolution remain separate: layered grids span
256²–2048² cells, but both preview and final output use the same 128² mesh.
High-resolution traversal, sculpting and heightmap files belong to later slices.
No dependency was added, no private research was committed, and no release,
website deployment or remote CI run was performed.

## Wave 2, slice 2 — terrain sculpting and bounded history

Completed locally on 2026-10-18, build `0.2.0-dev.2`, macOS arm64, Go 1.26.6,
Node 22.17 and Chrome 155 with Apple Metal 3 graphics. Wave 1 native
Windows/Linux release gates remain open.

- `npm test`: all 90 tests pass. New coverage checks localized raise/lower,
  flatten convergence, symmetric smoothing, edge handling, immutable source
  grids, cancellation, spatial stroke spacing, height clamps, exact replay after
  undo/redo/reopen, camera picking and projection, and finite material colors in
  deep sculpted depressions. Shared scene fixtures cover the v3 contract and
  invalid tools, coordinates, parameter ranges, stroke counts and mark counts.
- `go test -race ./...` and `go vet ./...` pass. The standalone executable smoke
  test includes embedded assets and authenticated recovery. A full 32-stroke,
  24-mark-per-stroke document exceeding the former 16 KiB limit survives save,
  store restart and exact canonical recovery. The smoke test requires loopback
  socket access; its sandbox-denied attempt passed when rerun with that access.
- `tests/browser-sculpt.mjs` passes: a real pointer drag creates one undoable
  stroke without moving the camera; SHA-256 comparisons confirm exact rendered
  heightfield restoration through Undo/Redo. Escape, pointer cancellation and
  window blur discard staged strokes. Keyboard lower/smooth/flatten operations
  alter the heightfield. File download/reopen, clear/undo, autosave/recovery,
  stroke-limit enforcement, WebGL sculpting and 390-pixel mobile layout pass.
  An eight-sample 640 × 360 sculpted still completed in about 0.5 seconds.
  No page errors occurred. Desktop/mobile controls and rendered output were
  visually inspected; local evidence remains in ignored `output/playwright/`.
- Memory tests exercise 2048² sculpting and long edit/undo/redo/group/branch
  sequences. History snapshots stay within 4 MiB and 100 entries. Scene logs
  allow at most 32 strokes with 24 spatial marks each; full logs fit the
  128 KiB file limit and compact recovery payloads remain below 60 KiB. The
  largest generation typed-array working allowance is approximately 63 MiB,
  excluding browser/GC/GPU overhead. Sculpt edits reuse the pristine noise grid.
- `tests/browser-terrain.mjs` passes again: layer edits, worker cancellation,
  retry, persistence, selective invalidation and compatibility checks. The
  tested 2048² generation took about 1.4 seconds with 168 animation frames;
  layered CPU/GPU probe distances differed by at most 0.00000191 scene units.
- `tests/browser-render.mjs` passes again: 1,024 legacy intersection probes
  (worst difference about 0.0000108 units), PNG decode/display pixel equality,
  cancellation, initialization/device-loss recovery, stale export rejection,
  water/camera extremes and WebGL/mobile fallback. No page errors occurred.
- The three original gallery renders were recaptured at 960 × 540 / 64 samples
  with unchanged image hashes. The studio screenshot and source provenance were
  refreshed from the final build. `npm run site` and `npm run site:check` pass:
  four pages, 85 local links and nine image references.

Strokes apply on release; the terrain-following outline previews their footprint
while dragging. Sculpting requires layered terrain. Generation supports
256²–2048² cells, while preview and final tracing still share the 128² mesh.
These are local results, not cross-platform performance guarantees. No dependency
was added, private research committed, site published or release created.

## Wave 2, slice 3 — surface materials and hierarchical traversal

Completed locally on 2026-10-18, build `0.2.0-dev.3`, macOS arm64, Go 1.26.6,
Node 22.17 and Chrome 155 with Apple Metal 3 graphics. Native Windows/Linux
release gates remain open.

Final checks passed: all 115 JavaScript tests, `go test -race ./...` and
`go vet ./...`. The standalone smoke test verifies the final embedded assets
and recovery lifecycle. `npm run site` and `npm run site:check` validate four
pages, 86 local links and nine image references. All three gallery renders were
recaptured at 960 × 540 / 64 samples with unchanged image hashes; the studio
screenshot and final source provenance were refreshed.

Material checks cover height/slope blending, all four base presets, both palettes,
seeded detail repeatability, finite reflectance at extreme heights, and continuity
at transitions. Worker checks confirm material edits reuse pristine/sculpted
heights and hierarchy bounds while preview and final vertex positions, normals
and colors agree. Shared Go/JavaScript fixtures accept v4 original and sculpted
terrain and reject missing, unknown, out-of-range and incorrectly typed surface
fields. Full sculpt logs with v4 materials fit the file and compact autosave
budgets; authenticated save and recovery-store restart preserve their exact
canonical scene data.

CPU hierarchy tests compare exhaustive triangles for silhouette, grazing,
boundary, inside and finite shadow rays, plus a deterministic 2,000-ray sweep
against linear traversal. A single-cell peak remains visible at grazing angles.
Every block encloses all rounded vertices including shared edges. Bounds require
2,048 bytes; traversal visits at most 34 blocks and 18 cells per intersected
block. The 128² render field uses 798,768 vertex bytes. Existing generation
budgets remain unchanged; render allocations add only the 2 KiB bounds buffer.

`tests/browser-materials.mjs` passed on the final build: surface enable/preset/rule
edits, numeric validation, undo/redo, layer conversion with retained materials,
sculpting, v4 download/reopen, autosave/recovery, stale-render invalidation and
mobile WebGL editing. Recovery assertions wait for the asynchronous restore to
complete. The stale legacy sculpt hint discovered after restoring layered terrain
was fixed and checked. Desktop/mobile controls and the actual exported material
render were visually inspected. No page errors occurred.

The GPU comparison used 734 rays on each of three fields (2,202 rays per traversal
route), including camera silhouettes, near-horizontal rays, block edges and a
single-cell peak. Maximum CPU/GPU hit-distance difference was 0.00000946 scene
units. Hierarchical and linear routes produced identical RGBA pixels on all
three eight-sample 640 × 360 renders.

| Fixture | Linear fine-cell tests | Hierarchical fine-cell tests | Linear render median | Hierarchical render median |
|---|---:|---:|---:|---:|
| Original terrain | 18,559 | 2,520 | 376.5 ms | 318.4 ms |
| Sculpted material scene | 12,236 | 3,041 | 330.1 ms | 317.5 ms |
| Single-cell peak | 28,505 | 1,213 | 409.9 ms | 284.5 ms |

Counts cover the diagnostic rays, not all image rays. Timings are the final
local run: both routes warmed once, then three timed pairs with alternating order.
They include dispatch, readback and JavaScript scheduling and exclude compilation.
Earlier runs varied, including a slower hierarchical result on ordinary terrain;
these figures are observations, not a universal speedup or cross-device promise.
The stable result is fewer fine-cell tests with matching geometry and output.

The existing browser suites also passed with the final traversal:

- Renderer: 1,024 legacy intersection probes, PNG pixel equality, cancellation,
  initialization failure, device loss/retry, stale export rejection, water/camera
  extremes and WebGL/mobile fallback. Worst hit-distance difference was about
  0.0000108 units; eight-sample 640/960 renders took roughly 0.4/0.8 seconds.
- Terrain worker: layer editing, selective invalidation, persistence,
  cancellation/failure/retry, 2048² generation and UI responsiveness. The largest
  grid took about 1.42 seconds with 171 animation frames observed. Layered GPU
  parity differed by at most 0.00000191 units.
- Sculpting: pointer and keyboard tools, Escape/pointer/focus cancellation,
  exact heightfield undo/redo, clear/restore, file/recovery persistence, stroke
  caps and mobile WebGL. The sculpted eight-sample still took about 0.4 seconds.

Preview and final geometry remain the same 128² mesh. Procedural detail changes
vertex reflectance, not geometry or normals; high-resolution rendered geometry,
texture/bump mapping and physical material BRDFs are outside this slice. No
application dependency was added, private research committed, release published
or remote CI run performed. W2.S4 has not started.

## Wave 2, slice 4 — heightmap interchange and portable assets

Validated 2026-10-18 on macOS arm64, Go 1.26.6, Node 22.17.0 and Chrome
155 with Apple Metal 3. Current source: `0.2.0-dev.4`. All four wave 2 slices
are implemented locally. The native Windows/Linux release gates remain open;
this is not a published v0.2.0 release.

Passed `go test -race ./...`, `go vet ./...`, all 130 Node tests, and
`git diff --check`. The generated site passes checks for four pages, 91 links
and nine images. The three existing gallery renders and studio screenshot were
recaptured from the final embedded build with matching source/version provenance.
Original Terraced basin PNG, scale JSON, heightmap bundle and portable scene
examples are generated by `go run ./tools/examples` and included in the site.

Precision checks cover every supported grid from 129² through 2049² samples.
The Go PNG codec preserves the unsigned 16-bit values exactly. JavaScript
procedural/sculpted export stays within half a 16-bit quantization step plus
Float32 rounding. Unsculpted imported samples remain byte-identical even when a
narrow range collapses in Float32. Flat terrain is handled explicitly. Metadata
rejects missing/null fields, unknown fields and invalid ranges. Shared Go/JS
fixtures cover v5 and preserve versions 1–4. Full sculpt logs with v5 assets and
surface settings remain below 60 KiB as compact autosave JSON; raw samples never
enter undo snapshots or autosave bodies.

Malformed-input coverage includes oversized/truncated PNGs, invalid dimensions
and CRCs, mismatched scale dimensions, missing/duplicate archive members,
traversal/absolute/backslash paths, symlinks, oversized decompressed manifests,
corrupt hashes and forged directory entry counts. ZIP entry tables are bounded
before allocation. A short `FuzzOpen` smoke run passed (three seeds, ten fuzz
executions); this is not extensive fuzz coverage. Server checks cover session
authentication, exact write Origin, methods and missing assets. Recovery tests
cover store restart, exact asset bytes, corrupt-asset rejection and fallback to
an older valid snapshot.

`tests/browser-heightmaps.mjs` passed against the final build:

- Export/import of the v1 starter explicitly produces v5 with unchanged camera
  and scale; Undo/Redo restores both versions. Unsculpted re-export/re-import
  preserves the asset SHA-256.
- Plain PNG import uses the entered scale. A bundle uses its own metadata even
  when plain-PNG controls are empty. Imported terrain supports sculpting and
  material editing without dropping its asset reference.
- Save produces a 132,969-byte portable scene; reopening preserves every scene
  value and sample reference. A separate final-build launch with an empty asset
  store opened that saved file and rendered it successfully.
- Invalid heightmap/project inputs leave the current scene intact. A delayed
  import cannot replace a newer scene edit. Autosave and recovery restore the
  imported terrain. Canonical JSON key ordering no longer affects starter-scene
  recognition.
- An eight-sample 640 × 360 imported-terrain still completed in about 0.4 seconds
  on this machine. PNG output and desktop/mobile controls were visually inspected.
  Heightmap export also works in mobile WebGL mode; no horizontal overflow or
  page errors occurred. These timings are observations, not performance promises.

Existing browser material, terrain, sculpt and renderer suites also passed.
The traversal comparison retained identical pixels across its linear and
hierarchical routes and a maximum CPU/GPU hit error below 0.0000108 scene units.
The 2048² worker test took about 1.42 seconds with 170 animation frames observed.
Legacy JSON open, recovery, render cancellation, device loss/retry, PNG export,
stale-result rejection and mobile fallback remain covered. The material browser
check now waits for asynchronous file-open completion before asserting controls.

Preview and final geometry still use the shared 128² render mesh. Metres per
scene unit is descriptive metadata, not geographic placement or mesh resizing.
Original asset storage adds up to about 8 MiB to the worker, with another 8 MiB
copy during export, beyond the existing terrain typed-array budget. Server
codec/archive buffers are separately bounded. Assets are retained for Undo and
recovery; no disk garbage collector was introduced. See [heightmap contracts](heightmaps.md).
No application dependencies were added, private research committed, release
published or remote CI run performed. Wave 3 has not started.

## Wave 3, slice 1 — physical sun and atmosphere

Validated 2026-10-18 on macOS arm64, Go 1.26.6, Node 22.17.0 and Chrome
155 / Apple Metal 3. Development build: `0.3.0-dev.1`. W3.S1 is locally
implemented; W3.S2 has not started. Existing native Windows/Linux release gates
remain open, and no release or publication is implied.

Passed `go test -race ./...`, `go vet ./...`, all 160 Node tests and
`git diff --check`. Site generation/checks cover four pages, 93 links and nine
images. The final embedded build supplied refreshed, source-verified captures.
The three original gallery scenes retain their artistic sky; the guide describes
the opt-in physical model and provides the schema-validated Daylight basin v6
scene. No application dependency or third-party code/asset was added.

### Numerical reference checks

The tests compare original numerical integration with the published analytic
atmosphere reference cases described in [atmosphere.md](atmosphere.md). For the
reference vertical ray, transmittance is 0.886936612 versus 0.886933231 expected;
phase-weighted radiance is 20.75785607 versus 20.75805056 expected (under 0.001%
relative error). The reverse vertical ray without aerosols also passes its
closed-form comparison. Phase functions integrate to one within 0.000002.
These are single-scattering reference cases, not measured Earth-sky accuracy.

Earth transmittance LUT samples at sea level, horizon, 2 km and 10 km agree with
4,096-segment reference integration within 0.0002 absolute transmittance. Sky
samples at zenith, horizon and an oblique angle agree with denser 512-segment
view / 1,024-segment sun integration within 0.0001 absolute normalized radiance.
Additional tests cover vacuum/zero-distance identity, ozone/aerosol attenuation,
planet shadow, night output, the azimuth seam, leap years and finite polar values.
The NOAA solar approximation differs from the published NREL example by about
0.2095° elevation and 0.1369° azimuth (test tolerance 0.3°); no ephemeris-level
precision is claimed.

### Actual browser/GPU checks

`tests/browser-atmosphere.mjs` passes manual/geographic positioning, leap-day
handling, v1 and unsculpted-v2 upgrades, Undo/Redo, v6 JSON download/open and
recovery. Imported heightmap scenes retain v6 through material/sculpt edits and
portable download/open; converting them to layers preserves atmosphere settings.
Invalidating a finished render disables its stale export. Cancellation during
preparation returns to an editable state; retry and a −18° night render succeed.
Mobile WebGL allows atmosphere editing/saving, with no horizontal overflow or
page errors. Desktop/mobile controls and exported physical-atmosphere stills
were visually inspected.

Eleven actual GPU diagnostics compare uploaded transmittance, sky radiance and
aerial-perspective evaluation with CPU values. Maximum absolute difference is
about 0.00000192. This caught a driver-dependent signed-zero `atan2` result at
cardinal directions; the shader now handles that limit explicitly. Browser tests
also caught and fixed a mode selector reading its value after control refresh.
The final migration review added normalization of unsculpted v2 layer stacks to
the v6 sculpt-capable terrain contract. Full v6 sculpt/material/asset manifests
remain below the compact 60 KiB autosave allowance.

An eight-sample 640 × 360 atmosphere render took about 1.0–1.1 seconds including
lookup preparation in the isolated local run. A direct Node table build took
about 0.6 seconds. Tables occupy exactly 393,216 bytes on CPU and GPU; row batches
yield to the UI, cancellation is checked during preparation, and each visible air
segment uses at most 16 GPU integration segments. These are bounded-work and
local timing observations, not cross-device performance guarantees.

All existing browser suites also passed: renderer, materials, terrain, sculpting
and heightmaps. Legacy traversal/PNG comparisons still agree; the largest legacy
CPU/GPU hit difference remains about 0.0000108 scene units. The material diagnostic
retains identical pixels between linear and hierarchical traversal. Terrain
2048² generation took about 1.38 seconds with 166 animation frames observed.
Some runs overlapped gallery capture; their timing is not an isolated benchmark.

### Limits

The physical model is opt-in single scattering in three approximate spectral
bands, with normalized solar irradiance and fixed development exposure. It omits
multiple scattering, ground bounce into the sky, terrain shadows within air,
stars/moon and calibrated spectral colorimetry. Secondary sky rays reuse the
camera-altitude table. Water remains the previous simplified model; preview
haze is approximate. The 128² geometry and existing export sizes remain unchanged.
No native Windows/Linux execution, remote CI run, release tag or publication was
performed. W3.S2 material/color work remains a separate slice.

## Studio scrolling and dropdown follow-up

Validated on macOS arm64 with Chrome 155. `tests/browser-layout.mjs` checks
1728×1117, 1440×900, 1024×600, 768×700, 601×700, 600×700, 390×844 and 320×568.
Desktop panels stay inside the frame without document overflow; inspector wheel
input at its boundary does not move the page. Mobile uses document scrolling,
with no panel scroll containers or horizontal overflow. Resizing from a scrolled
phone layout back to desktop restores the fixed frame.

Actual option rectangles remain next to their controls and within the viewport
for scene, image-size, sample, atmosphere and graphics menus, including controls
deep inside both panels. Escape restores control focus, keyboard and pointer
selection work, and a physical-atmosphere still completes with export enabled.
The quick guide remains accessible. No page errors occurred. Desktop menu and
mobile screenshots were inspected; the product-site studio capture was refreshed.

Menus progressively use the browser's [customizable native select](https://developer.chrome.com/blog/a-customizable-select)
with its built-in anchor positioning and top-layer picker. Unsupported browsers
retain their native select. The native CSS fallback was exercised in Chrome;
Safari/Firefox and native Windows/Linux menus were not tested. No dependency,
scene format or rendering change is included in this follow-up.

`npm test` passes all 160 tests; `go test ./...` passes. The embedded binary was
rebuilt. Fresh gallery capture passed scene/hash verification, and site build
and link checks passed (four pages, 93 links, nine images). `git diff --check`
passes.

## Collapsible workspace panels

The header's Scenes and Controls buttons independently hide/reopen their panels.
Grid columns release the hidden panel's width, and the existing resize observer
updates the preview. Hidden panels leave the focus order; each toggle exposes its
controlled panel and expanded state. Reopening restores the panel scroll offset.
Layout state belongs to the current window and resets on reload. Compact layouts
continue to use the scene picker instead of the scene sidebar; Controls remains
available on phones.

`tests/browser-panels.mjs` passes on Chrome 155/macOS: independent collapse,
reclaimed/restored width, preview backing-size updates, Space/Enter operation,
expanded-state attributes, restored inspector scrolling, retained terrain edits
and a finished exportable render. It checks open/closed controls at nine widths
from 320 to 1728 pixels, including breakpoint boundaries. The existing
`tests/browser-layout.mjs` also passes on the final build. Collapsed desktop and
compact-header screenshots were visually inspected; no page errors occurred.

All 160 JavaScript tests and Go tests pass. The binary was rebuilt, gallery
capture verified scene/source hashes, and site build/check passes with four
pages, 93 links and nine images. `git diff --check` passes.

## Wave 3, slice 2 — detailed final terrain

Development build `0.3.0-dev.2`, validated on macOS arm64/Chrome 155/Apple Metal 3.
The revised roadmap puts explicit image-quality gates around geometry, surfaces,
transport/color and composition, with night skies and earlier erosion milestones.
W3.S2 implements independent final geometry; W3.S3 per-hit geological surfaces has
not started. Wave 3's photographic-quality gate remains open.

### Geometry, lifecycle and resource checks

Six new tests cover a narrow eight-unit ridge that falls between Draft vertices,
its grazing silhouette, analytic sloped planes, edge/parallel/miss rays, source
resolution caps, rejected allocation tiers, cooperative preparation cancellation,
legacy Draft parity and sculpt replay/undo without changing the preview cache.
Final CPU and WGSL traversal derive stride, cell size, hierarchy shape and loop
bounds from the validated 128/256/512/1024 grid. Fine has 2,097,152 triangles,
50,430,000 vertex bytes and 131,072 hierarchy bytes. GPU storage/buffer limits
are checked before the terrain buffer is allocated. Final work uses its own
worker and device; termination/disposal releases their owned resources.

The reproducible `docs/capture/detail-run.mjs` check passes 816 CPU/GPU rays at
all four tiers. Worst observed hit-distance error is about 0.00000949 scene
units against a 0.002 tolerance. It passes immediate preparation cancellation,
scene-edit invalidation, injected large-buffer allocation failure, retry and
three complete exports. At 960×540/32 samples, observed end-to-end times were
4.80 s Draft, 7.26 s Detailed and 9.01 s Fine. Timings include fresh worker
preparation and readback; these are local observations, not general guarantees.
The isolated per-tier preparation measurements reuse the source cache after
the first tier and must not be compared as cold-start timings.

### Integrated validation and visual review

All 166 JavaScript tests pass. `go test -race ./...`, `go vet ./...`, binary
rebuild and `git diff --check` pass. Actual browser suites pass for the renderer,
terrain, sculpting, materials, heightmaps, atmosphere, responsive layout and
collapsible panels. Legacy CPU/GPU traversal error remains below 0.000011 units;
linear/hierarchical diagnostic images retain identical pixels. Imported portable
scenes, sculpted/material scenes, recovery, GPU loss/fallback and cancellation
remain functional with the new Detailed default.

Original unretouched Sunlit ridges exports compare the same seed, camera, surface,
physical sunlight, resolution and samples at Draft/Detailed/Fine. Fine visibly
resolves smaller ridge crests, gullies and their shadows. The surface remains
visibly too uniform and smooth for the photographic target; finer geological
shading and improved transport/exposure remain subsequent slices. See
[visual-quality record](visual-quality.md) for images and measured costs.

Both capture manifests pass source/scene/image provenance checks. The rebuilt
site passes four pages, 100 links and 11 image references. Desktop/mobile site
browser checks pass navigation, image decoding, scene downloads, keyboard access,
no horizontal overflow and no external asset requests. The comparison uses equal
image widths on desktop and stacks on phones. Original scene/captures and the
studio were visually inspected. No new dependencies or third-party assets were
added. Native Windows/Linux execution, release tags and publication remain pending.

## Wave 3, slice 3 — geological surface materials

Development build `0.3.0-dev.3`, validated locally on macOS arm64, Chrome 155 and
Apple Metal 3. W3.S3 is complete locally; W3.S4 transport/light/exposure has not
started. The broader photographic-quality and native release gates remain open.

### Material correctness and filtering

Original CPU and WGSL evaluators consume a material definition, world-space
point, unit normal, footprint and seed. The shader's explicit `GeoDefinition`
interface supports later object assignment without terrain-specific texture code.
Solid grain, warped strata and angular nearest-site joints supply reflectance and
analytic bump gradients; terrain positions, normals and hierarchy remain intact.
Unresolved noise work is skipped. New uniform data totals 64 additional bytes;
no texture storage, external assets or dependencies were added.

Seven new unit tests check noise gradients against finite differences, 27-site
joint search against an independent 125-site search, joint gradients, normal and
reflectance bounds, filtering continuity/limits, rough-diffuse reciprocity and
integrated reflectance, geometry preservation, migration and format round trips.
Ten shared acceptance fixtures add valid v7 artistic/physical, layered and imported
scenes plus malformed-model/range/missing-field cases. Both validators pass them.
Flat-normal rough-diffuse integrated reflectance is bounded by 1.001 in the tested
quadrature. This does not establish energy conservation of the full bumped/water/
atmosphere integrator; those transport concerns remain W3.S4.

The actual GPU material probe compares 400 samples and 3,200 scalar outputs
(albedo, roughness, normal and angular response) with CPU values across five
presets, both palettes, maximum/bounded seeds and multiple footprints. Maximum
absolute error is about 0.00005436 against a 0.003 tolerance. Fixed limits bound
procedural work; grazing/refraction filtering remains an isotropic approximation.

### Editing, persistence and renderer lifecycle

`tests/browser-geology.mjs` passes opt-in v1→v7 migration and Undo/Redo, invalid
numeric input rejection, JSON save/open, atmosphere enable/removal, layered
conversion, sculpting, heightmap import, portable save/open and recovery. All
retain geological definitions and v7 as needed. Returning to a simple surface
selects the appropriate earlier format and is undoable. Material edits invalidate
stale exports; preparation cancellation returns to an editable state. Mobile
WebGL retains material editing without horizontal overflow or page errors.

All existing browser suites pass: renderer, terrain, sculpting, materials,
heightmaps, atmosphere, layout and panels. The final reusable-shader build was
also rechecked through renderer lifecycle and geological workflow suites, GPU
material probes and all three capture workflows. Traversal/atmosphere tolerances
remain unchanged; linear/hierarchical diagnostic images retain identical pixels.
The three original starter PNG hashes and the three terrain-comparison PNG hashes
match the preceding implementation, confirming the legacy render path is intact.

### Images and integration

The original Weathered highlands scene provides equal-camera/light/geometry
simple/geological landscape exports at 960×540, Fine terrain and 32 samples.
Unscaled 256×128 foreground, middle-distance and horizon crops retain the exact
exported pixels. Rock/ground/snow reference views use the same closer camera and
60° daylight sun with water disabled; those settings differ from the landscape
and are recorded per image. Saved-scene content and source/scene/image hashes
are checked during capture/build. Images and the desktop gallery were visually
inspected. Earlier rounded/overstated fracture patterns were revised to subtler
angular joints before the final captures.

Current individual end-to-end observations were about 6.4 s for the geological
landscape and 6.1–7.1 s for the close reference views. They include preparation,
shader setup, tracing and readback and are not general performance guarantees.
Material texture/relief is visible, but light/exposure, deep shadows and sky
richness still limit photographic credibility. See [visual-quality record](visual-quality.md)
and [geological surface documentation](geological-surfaces.md).

All 183 JavaScript tests pass. Go race tests/static checks, binary rebuild and
`git diff --check` pass. The site passes four pages, 112 links and 16 image
references, plus desktop/mobile browser navigation, image decoding, scene
download, keyboard, overflow and same-origin checks. No release tag, publication
or native Windows/Linux execution was performed.

## Wave 3, slice 4 — light transport and color

Completed locally as `0.3.0-dev.4`. Studio lighting opts into v8 without changing
classic v1–v7 renders. The conservative Lambertian/GGX dielectric mixture,
exact water-interface Fresnel, one-to-four-vertex terrain interreflection, power
heuristic MIS, up to four authored rectangular lights, saved exposure and filmic
or luminance Reinhard display are implemented without additional dependencies.
See [transport equations, working space and limits](light-transport.md).

All 199 JavaScript tests pass. Shared Go/JavaScript fixtures cover v8 and reject
missing transport, unknown fields, extra lights, unsupported curves, fractional
bounce depth, out-of-range exposure/color/size and future versions. CPU tests
cover 36 white-furnace configurations at 32,768 directions each, reciprocity,
independent hemisphere quadrature versus BSDF sampling, MIS normalization,
monotonic/gamut-bounded display and stable light frames. Go race tests, static
analysis and the binary rebuild pass.

Actual WebGPU checks on Apple Metal 3 / Chrome 155 compare 256 evaluation cases
(2,048 scalars) with the CPU reference: worst normalized error 0.00000449 against
0.002. Another 3,072 generated directions check sampling, PDF, BSDF and water
Fresnel; worst normalized error 0.003094 against 0.005. Twelve representative GPU
furnace cases return reflectance 0.472–0.840; this conservative mixture is
intentionally energy-losing. These checks do not prove global conservation with
perturbed shading normals or photographic quality.

Six isolated emitter renders verify zero light with the source off or facing
away, illumination with it facing down, spatial movement with X, reduced light
with reduced size and increased light with radiance. At identical settings their
mean display values are 0, 55.52, 0, 53.21, 7.49 and 75.95 respectively. This
record is included in `lighting-captures.json` and is reproducible with
`tests/browser-lighting-energy.mjs`.

Five original unretouched 960 × 540, 64-sample, 1024²-terrain lighting exports
record exact scene/image/source hashes, settings and histogram statistics. Same
scene/camera/surface/sun comparisons separate classic versus studio display,
one versus three terrain vertices, one extra exposure stop and a named warm
rectangular fill. All five contain zero completely black or completely white
pixels. Their 1st/50th/99th percentile display luminance values are:

| Study | p01 / p50 / p99 | End-to-end observation |
|---|---|---|
| Classic | 15 / 95 / 133 | 12.29 s |
| One vertex | 21 / 120 / 175 | 13.04 s |
| Three vertices | 24 / 121 / 175 | 18.17 s |
| Exposure +1 | 37 / 158 / 206 | 17.61 s |
| Warm area fill | 46 / 125 / 175 | 20.93 s |

These are local observations including preparation, shader setup, tracing and
readback, not general performance promises. Grain at low sample counts, smooth
landforms/material transitions, the clear sky, limited water and incomplete
indirect air/water transport still limit realism. The images were inspected;
numerical checks do not replace the W3.S6 integrated visual review.

Prior material, terrain and starter-gallery captures were refreshed against the
final source hash; the previous terrain/material composition and classic render path are preserved.
GPU floating-point rounding can change isolated display bytes. The new
site build/check passes four pages, 126 links and 20 image references. Native
Windows/Linux release execution remains pending. No release tag or publication
is implied, and W3.S5 has not started.

The seventh isolated-light case enables the physical atmosphere while sun, sky
and the emitter are zero (water disabled). Its output is exactly black. This
catches the corrected sky-strength scaling of camera-segment in-scattering.
Legacy atmosphere diagnostics still pass 11 cases with worst error 0.00000192.

Browser workflow checks pass v8 migration, numeric validation, four-light bounds,
selection/edit/removal, Undo/Redo, scene JSON, portable imported terrain,
recovery, surface/sky/terrain conversions, rendering, cancellation and stale-image
invalidation. WebGL editing and 390px layouts remain usable. The legacy renderer
passes 1,024 intersection probes, canvas/PNG byte equality, initialization and
device-loss failure/retry, partial cancellation, water extremes and editing during
render/export. Layout checks cover eight sizes from 320px to 1728px, anchored
pickers, keyboard/native fallback, panel collapse/scroll restoration and retained
scene/render state, with no unexpected browser errors.

The generated site passes all four pages at 1440px and 390px, decoding every
image, navigation, scene download, keyboard focus, overflow and local-resource
checks. Decoding the exported comparison PNGs independently confirms 342,635 of
518,400 pixels brighten by more than half a display-luminance code with terrain
interreflection. Mean gain is 1.79 codes; exposure +1 adds 31.87 codes on average
and reduces no pixel by more than half a code. `browser-lighting-images.mjs`
reproduces this comparison using permitted same-origin image decoding under the
site's restrictive CSP. These are image-behavior checks, not a perceptual-quality
score.

Sun/sky occlusion in the new path uses the full terrain bounds. A custom tall
heightfield diagnostic finds a hit at 171.918 scene units, verifies that it blocks
light, and verifies a second direction remains open to the sky. This protects
against the inherited 150-unit visibility cutoff leaking light through tall
imported terrain. The traversal still terminates at the bounded heightfield;
it does not step through empty unbounded space.

An independent decoded-PNG check against the previous committed 1024² terrain
benchmark finds exactly one changed color channel, by one 8-bit code. This is
consistent with floating-point shader rounding; the composition is unchanged.

## Wave 3, slice 5 — lake optics and rendering workflow (2026-10-18)

Local development build 0.3.0-dev.5, macOS arm64, Apple Metal 3 / Chrome 155,
Go 1.26.6 and Node 22.17. The records in prior slice sections are historical;
refreshed capture manifests record the current source and timings. Native
Windows/Linux release execution and the integrated W3.S6 visual gate remain open.

- Shared Go/JavaScript fixtures accept current v9 scenes and reject malformed
  optical parameters. Unit checks cover Beer–Lambert identity/multiplicativity,
  depth/scale/density, exact Fresnel/TIR, bounded filtered normals, preservation
  of the actual sun vector, one-step upgrade/Undo/Redo, all terrain families,
  serialization and terrain cache reuse.
- Actual GPU water probes compare 256 rays / 2,048 scalar values against CPU
  transmission, Fresnel and filtered-normal references; worst absolute error is
  0.00000457 (tolerance 0.0001). Six illumination/extreme-water cases include
  above-water, submerged, grazing and TIR rays. Every tested dark-scene channel
  is exactly zero. No additive water glow remains in the v9 path.
- Browser workflows pass old-scene upgrade, Undo/Redo, numerical water edits,
  JSON save/reopen and local recovery, idle lighting preview, cancellation with
  retained complete samples, water-edit stale-export invalidation and WebGL
  fallback. Four layouts from 320px to 1440px keep file actions accessible with
  no horizontal overflow. Existing eight-size dropdown and collapsible-panel
  checks also pass, retaining scene and finished-render state.
- The renderer regression passes 1,024 legacy terrain intersections (worst
  distance error below 0.000011), PNG/canvas byte equality, pending-PNG edit
  invalidation, initialization failure, cancellation, injected device loss/retry,
  larger image dimensions, extreme legacy water/camera fixtures and WebGL fallback.
- Unfiltered progressive noise comparison at 640 × 360 / 512² terrain uses the
  same scene, camera, material and exposure, comparing 8- and 64-sample prefixes
  against the 256-sample result over x80–559/y80–329. Display-code RMSE falls
  from 2.452 to 0.823. This is a convergence check, not an independent-reference
  variance estimate or a perceptual-quality score. No denoiser smooths the output.

The original Silver basin scene and six unretouched 960 × 540 / 1024² exports
compare classic/calm/ripple/clear/grazing water and 64 versus 256 samples.
`water-captures.json` records every scene, source/image hashes, GPU probes,
noise check, device and timings. Public prior lighting/material/terrain/starter
captures are refreshed as part of the slice. Site generation checks their
provenance; the water gallery describes model limits explicitly.

The supplied Alpine scene was reproduced privately without modifying the original
or committing user data. The upgraded output preserves terrain, camera, water
level and actual sunlight. Water remains visible as water in the displayed and
exported still. The comparison confirms the specific repair, not photographic
quality. Remaining limits include procedural material repetition, finite-patch
horizon artifacts, single-scattering sky/water approximations, no refracted
area-light bed illumination, and absent clouds/vegetation/denoising.

Final local checks: **211 JavaScript tests pass**, `go test -race ./...` and
`go vet ./...` pass. The generated site builds/checks four pages, 139 links and
22 image references with current provenance. Portable v9 imported-terrain files
round-trip their full samples and scene metadata deterministically; legacy asset
recovery tests use an explicit stable v1 fixture rather than the evolving gallery.

The adapted older-format browser workflows also pass atmosphere, geology,
studio/area lighting, heightmap import/export, sculpting, terrain layers and
material editing/recovery. These now open an explicit v1 fixture where they test
legacy migrations; the actual starter catalog remains v9. Three legacy material
fixtures compare 2,202 actual GPU rays and hierarchical versus linear traversal:
worst hit error is below 0.000010 and rendered pixels match exactly. Fine-cell
CPU tests fall from 18,559/12,236/28,505 to 2,520/3,041/1,213 respectively.

Current original water capture observations, including preparation/shader/readback:
classic 14.09 s, calm 13.57 s, ripples 13.70 s, clear 13.56 s, grazing 13.98 s
(all 64 samples), and 47.58 s for the identical ripple scene at 256 samples.
These local observations are not cross-device performance guarantees.

The generated site passes browser checks at 1440px and 390px on all four pages,
including every image decode, local-resource policy, navigation, keyboard focus
and scene download. The refreshed lighting PNG comparison still passes positive
bounce/exposure contributions with no exposure-induced luminance drop beyond the
rounding tolerance. The final private Alpine still completes at 960 × 540 /
1024² in 12.3 s at 64 samples and 44.2 s at 256 samples on this machine.
