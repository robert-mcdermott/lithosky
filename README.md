# Lithosky

A local landscape studio for natural and imagined worlds. A single Go executable
contains the frontend and backend and opens a desktop-style browser window with
no address bar. Original code and procedural content are Apache-2.0 licensed.

**Status: wave 1, slice 1 — development foundation.** Interactive seeded terrain,
camera orbit/zoom, mountain height, sunlight and natural/otherworld palettes run
in WebGPU or WebGL 2. This is a raster preview, not a photorealistic ray tracer.
Saving, physical water, clouds, vegetation and image export are planned in the
[wave-and-slice roadmap](ROADMAP.md). Edits currently live only in memory.

## Build and run

Go 1.26 or newer is required to build. There are no third-party Go modules,
JavaScript packages, frontend build steps or required network services.

```sh
go build -trimpath -o bin/lithosky .
./bin/lithosky
```

Move the binary anywhere; its assets are embedded. The default app-window mode
requires an installed Chromium-family browser. The launcher creates a temporary
isolated profile, waits for its browser process to exit, stops the server and
removes the profile. It does not install or bundle a browser. Only Lithosky's
local requests are required; the browser itself is separate software.

```sh
./bin/lithosky --browser '/path/to/browser/executable'
./bin/lithosky --window=browser  # Explicit regular browser mode
./bin/lithosky --no-open         # Print loopback URL; serve until Ctrl+C
./bin/lithosky --port=8123       # Default 0 chooses an available loopback port
./bin/lithosky --version
```

If app-window mode cannot launch, an error explains the options. The app never
silently opens an address bar. Browser mode and `--no-open` run until Ctrl+C.
The server accepts only its exact `127.0.0.1` origin and port. There are no
outgoing application requests, accounts, telemetry or remote assets.

## Preview controls

Choose a study, edit its seed, adjust height/light and select a palette. Drag to
orbit and scroll to zoom. With the view focused, arrow keys orbit, +/− zoom and
Home resets. **Graphics & compatibility** can force WebGL 2, disable the GPU or
retry after failure. GPU failure preserves the current in-memory parameters.

## Development

Go and Node 22+ suffice; no npm installation is needed.

```sh
go test ./...
go test -race ./...
go vet ./...
node --test tests/renderer.test.mjs
```

Rebuild after frontend edits. CI builds/tests on macOS, Windows and Linux; GPU and
app-window behavior need real-platform checks beyond compilation.
[Validation](docs/validation.md) records what has actually been checked.

| Location | Responsibility |
|---|---|
| `main.go` | Embedded assets, CLI and lifecycle |
| `internal/server/` | Loopback origin protection and read-only HTTP routes |
| `internal/desktop/` | Isolated app-window launcher |
| `web/scene/` | Shared terrain fixture and camera |
| `web/render/` | Selection, WebGPU and WebGL 2 backends |
| `web/app.js` | Interaction and GPU recovery |
| `docs/` | Architecture, licensing, validation; product site in W1.S4 |

[Architecture](docs/architecture.md) · [Licensing](docs/licensing.md) · [Apache-2.0](LICENSE)
