# Lithosky

A local landscape studio for natural and imagined worlds. A single Go executable
contains the frontend and backend and opens a desktop-style browser window with
no address bar. Original code and procedural content are Apache-2.0 licensed.

**Status: wave 2, slice 1 — layered terrain and worker generation.** Compose
seeded terrain with camera, water, light and palette controls; open/save versioned
`.lithosky` scenes, undo/redo edits and recover local autosaves. Render a still
with traced terrain, sun/sky lighting and calm-water reflection/refraction, then
export PNG. WebGPU powers final rendering; WebGL 2 supplies a fallback preview.
The generated site and six-platform packaging are implemented. Native Windows/Linux
release checks remain pending, so v0.1.0 is not yet tagged or published. See the
[roadmap](ROADMAP.md) and [release gates](docs/releases.md).

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

## Terrain layers

**Build with layers** creates a new landform from rolling hills (fBm), ridges,
domain warp and terraces. Add, reorder, disable and tune up to eight layers;
Undo restores the previous composition. Save/open and recovery preserve the stack.
Generation runs in a cancellable worker with 256²–2048² cell budgets. Preview and
stills currently use a shared 128² mesh. See [terrain authoring](docs/terrain.md)
for controls, cache behavior and memory/render limits.

## Render and export

Choose **Render image** for a progressive 16:9 still at 640 × 360 or 960 × 540,
with 8–64 samples per pixel. **Cancel render** keeps the last complete sample;
**Export PNG** saves it in sRGB. Visual edits clear the old render; renaming keeps it.
Rendering is bounded and local, with no external libraries or services. This first tracer uses
simple sky and water approximations; physical atmosphere, waves and vegetation
come later. See [rendering](docs/rendering.md) for controls, limits and validation.

## Scene files and recovery

**Open…** reads a scene file; **Save scene** downloads a new `.lithosky` file.
Use Undo/Redo for scene, water and camera edits. Local autosaves persist outside
the temporary browser profile. At startup, restore a prior snapshot or choose
**Keep this scene**. Wait for “Recovery saved on this device” before closing;
errors and conflicting tabs pause autosave visibly. Named downloads are your
portable backups. See [scene format and recovery](docs/scene-format.md) for the
schema, storage locations, keyboard shortcuts and failure behavior.

## Website and distribution

Three original starter scenes are shared by the app and downloadable gallery.
Choose **Start with a scene** on any screen size; the Quick guide explains camera
controls and the path from a scene to a still.

`npm run site` generates the four-page product site into `dist/site/`, validates
its links and capture provenance, and copies only public assets. `npm run site:serve`
previews it locally. See [site workflow](docs/site/README.md) for capture and publishing.

`go run ./tools/release --version 0.2.0-dev.1 --out dist/releases/0.2.0-dev.1`
builds six archives with notices, starters, build metadata and checksums.
Use `go run ./tools/release --verify dist/releases/0.2.0-dev.1` to check them.
See [packaging and release readiness](docs/releases.md); these commands do not publish.

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
| `docs/site/`, `docs/capture/` | Generated product site and real app capture workflow |
| `tools/release/` | Standard-library archive builder and verifier |
| `docs/` | Architecture, licensing, validation and release readiness |

[Architecture](docs/architecture.md) · [Licensing](docs/licensing.md) · [Apache-2.0](LICENSE)
