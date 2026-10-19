# Lithosky

A local landscape studio for natural and imagined worlds. A single Go executable
contains the frontend and backend and opens a desktop-style browser window with
no address bar. Original code and procedural content are Apache-2.0 licensed.

**Status: wave 3, slice 8 — add, place and transform.** Compose
seeded terrain with camera, water, light and palette controls; open/save versioned
`.lithosky` scenes, undo/redo edits and recover local autosaves. Render a still
with traced terrain, sun/sky lighting and lake absorption/reflection/refraction, then
export PNG. WebGPU powers final rendering; WebGL 2 supplies a fallback raster preview.
The generated site and six-platform packaging are implemented. Native Windows/Linux
release checks remain pending, so v0.1.0 is not yet tagged or published. See the
[roadmap](ROADMAP.md) and [release gates](docs/releases.md).

The camera/export implementation is complete locally. The integrated image review
still finds visible geology, surface, snow and horizon defects; photographic
quality remains a release gate. See [the original render studies](docs/visual-quality.md).

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

New scenes use the current geology, atmosphere, studio lighting and lake models.
Older files open unchanged; **Upgrade rendering** enables missing models together
in one undo step, preserving the actual sun direction. See [lake optics](docs/water.md).

## Preview controls

Choose a study, edit its seed, adjust height/light and select a palette. Drag to
orbit, Shift-drag to pan and scroll to zoom. With the view focused, arrow keys orbit, Shift-arrow keys pan, +/− zoom and
Home resets. **Graphics & compatibility** can force WebGL 2, disable the GPU or
retry after failure. GPU failure preserves the current in-memory parameters.

## Objects and direct editing

Open **Objects** to select terrain, water, sun/sky, the active camera, area lights
and groups. **Select in view** picks visible surfaces; **Inspect** shows their
controls. Rename, hide, lock or group objects with Undo. Locks also protect
keyboard and procedural edits. Existing lights can be duplicated/deleted; groups
can be dissolved without deleting their children. On small screens Objects opens
a dialog. Selection and guides do not change saved data or PNGs.

The first authored object metadata command upgrades an old file to a v11 component graph,
preserving its rendering models. IDs, groups and properties survive files and
recovery. Add original primitives, place them in the view, use move/rotate/scale handles,
snap, group, align, duplicate and copy/paste objects. Transform edits save as v12;
see [object tools](docs/object-tools.md) for shortcuts, limits and original examples. See
[scene authoring](docs/scene-authoring.md).

## Terrain layers

Format numbers below are minimum versions for individual capabilities. Scenes
with authored object metadata save as v11 (v12 with primitives/transforms); other scenes retain their supported formats.

**Build with layers** creates a new landform from rolling hills (fBm), ridges,
domain warp and terraces. Add, reorder, disable and tune up to eight layers;
Undo restores the previous composition. Save/open and recovery preserve the stack.
Generation runs in a cancellable worker with 256²–2048² cell budgets. Preview remains 128². Final stills offer Draft (128²), Detailed (512², default),
and Fine (1024²), capped by source resolution for layered/imported terrain. See [terrain authoring](docs/terrain.md)
for controls, cache behavior and memory/render limits.

On layered terrain, choose **Raise**, **Lower**, **Smooth** or **Flatten**. Drag
on land and release to apply one undoable stroke. Arrow keys move the brush;
Space applies it; Escape cancels an unfinished stroke. Layered scenes with sculpting save as
v3 files (v4 with customized surfaces) and retain their strokes through recovery. History has a 4 MiB snapshot
budget; scenes allow 32 strokes of up to 24 marks each.

**Customize surface** blends sand, ground, rock and snow using height and slope
rules, or applies a single material preset. Tune transition softness and seeded
color detail; both palettes work with the rules. Procedural surface settings save as v4
scenes with the existing terrain and sculpting; imported terrain uses v5, v6
with atmosphere, v7 with geology, or v8 with studio lighting. Older scenes keep their appearance
until customized. Material changes reuse generated heights and traversal bounds.

**Use geological surface** adds original solid rock strata/joints, soil/snow
variation, filtered bump detail and roughness in final renders. Feature scale,
strata, fractures, bump and roughness are editable. These definitions save as
v7 or later; old scenes keep their simple materials. Raster preview colors remain
approximate; live lighting uses the final shading kernels. See [geological surfaces](docs/geological-surfaces.md).

**Import heightmap…** accepts 16-bit grayscale PNG or a heightmap bundle, with
explicit height and physical-scale metadata. Imported terrain supports sculpting
and materials. **Export heightmap** bundles a full-depth PNG with its scale;
**Save scene** embeds imported samples in a portable scene container. Older JSON
scenes remain supported. See [heightmaps and original examples](docs/heightmaps.md).

**Use physical atmosphere** adds a computed Earth sky, sunlight attenuation and
aerial perspective to rendered stills. Set sun direction manually or use latitude,
longitude and a UTC date. Atmosphere settings save as v6 with procedural or imported
terrain; older scenes keep their appearance. See [the atmosphere model](docs/atmosphere.md)
for controls, reference checks and single-scattering limits.

**Use studio lighting** adds bounded terrain interreflection, diffuse/GGX dielectric
materials, editable rectangular lights, exposure and filmic color controls. These
settings save as v8; earlier scenes retain classic lighting until enabled. See
[light transport and color](docs/light-transport.md) for the working space,
authoring controls, numerical checks and current limits.

## Render and export

Choose **Render image** for a progressive still up to 2048 pixels on its long edge,
with 8–256 samples per pixel. **Cancel render** keeps the last complete sample;
**Export PNG** saves it in sRGB. Visual edits clear the old render; renaming keeps it.
**Camera & composition** saves lens, focus, roll, aim target and landscape, portrait
or square framing. Optional depth of field uses a thin lens; landscape scenes usually
remain sharp. **Render a region** traces and exports a crop with the full image’s
framing and sampling. See [camera controls](docs/camera.md).
Rendering is bounded and local, with no external libraries or services. This first tracer uses
single-scattering atmosphere and lake optics; large waves and vegetation
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

Three original starters and three camera compositions are shared by the app and downloadable gallery.
Choose **Start with a scene** on any screen size; the Quick guide explains camera
controls and the path from a scene to a still.

`npm run site` generates the four-page product site into `dist/site/`, validates
its links and capture provenance, and copies only public assets. `npm run site:serve`
previews it locally. See [site workflow](docs/site/README.md) for capture and publishing.

`go run ./tools/release --version 0.3.0-dev.8 --out dist/releases/0.3.0-dev.8`
builds six archives with notices, starters, build metadata and checksums.
Use `go run ./tools/release --verify dist/releases/0.3.0-dev.8` to check them.
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
