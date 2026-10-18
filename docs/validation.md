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
