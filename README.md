# Lithosky

A local landscape studio for natural and imagined worlds. A single Go executable
contains the frontend and backend and opens a desktop-style browser window with
no address bar. Original code and procedural content are Apache-2.0 licensed.

**Status: wave 1, slice 2 — scene documents and recovery.** Interactive seeded
terrain, camera orbit/zoom, water level, sunlight and natural/otherworld palettes
run in WebGPU or WebGL 2. Open/save versioned `.lithosky` scenes, undo/redo edits,
and restore local autosaves across launches. This is a raster preview; ray
tracing and image export are the next slice in the [roadmap](ROADMAP.md).

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
./bin/lithosky --data-dir /path/to/recovery  # Optional recovery directory
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

## Scene files and recovery

**Open…** reads a scene file; **Save scene** downloads a new `.lithosky` file.
Use Undo/Redo for scene, water and camera edits. Local autosaves persist outside
the temporary browser profile. At startup, restore a prior snapshot or choose
**Keep this scene**. Wait for “Recovery saved on this device” before closing;
errors and conflicting tabs pause autosave visibly. Named downloads are your
portable backups. See [scene format and recovery](docs/scene-format.md) for the
schema, storage locations, keyboard shortcuts and failure behavior.

## Development

Go and Node 22+ suffice; no npm installation is needed.

```sh
go test ./...
go test -race ./...
go vet ./...
npm test
```

Rebuild after frontend edits. CI builds/tests on macOS, Windows and Linux; GPU and
app-window behavior need real-platform checks beyond compilation.
[Validation](docs/validation.md) records what has actually been checked.

| Location | Responsibility |
|---|---|
| `main.go` | Embedded assets, CLI and lifecycle |
| `internal/server/` | Loopback protection and authenticated recovery routes |
| `internal/scene/`, `internal/recovery/` | Shared schema, validation and snapshot storage |
| `internal/desktop/` | Isolated app-window launcher |
| `web/scene/` | Scene model, history, autosave queue, terrain and camera |
| `web/render/` | Selection, WebGPU and WebGL 2 backends |
| `web/app.js` | Interaction and GPU recovery |
| `docs/` | Architecture, licensing, validation; product site in W1.S4 |

[Architecture](docs/architecture.md) · [Licensing](docs/licensing.md) · [Apache-2.0](LICENSE)
