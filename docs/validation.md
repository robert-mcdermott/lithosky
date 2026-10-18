# Wave 1, slice 1 validation

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

## Limits and next work

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
