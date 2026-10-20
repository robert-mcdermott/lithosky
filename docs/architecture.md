# Architecture

## Runtime

One Go executable embeds the web app (`web/`) with `embed.FS`. It serves it on an
ephemeral `127.0.0.1` port and opens an installed Chromium-family browser in app-window
mode with a temporary profile. When that window closes, the server stops and the profile
is removed.

| Option | Effect |
|---|---|
| `--window=browser` | Uses the default browser instead |
| `--no-open` | Serves until Ctrl+C without opening a window |

There are no accounts, telemetry, CDNs or remote assets. The browser and the GPU driver
are the only runtime prerequisites.

## Rendering

Everything visual runs in WebGPU on one persistent device:

| Module | Role |
|---|---|
| `web/terrain/` | Generates and erodes the terrain on the GPU (see its README) |
| `web/render/renderer.js` | The frame loop: terrain build stages, sky LUTs, tracing and display |
| `web/render/tracer.js` | The progressive path tracer: one full-frame sample per dispatch into a GPU accumulation buffer |
| `web/render/sky.js` | Physical sky LUTs (Hillaire 2020): transmittance, multiple scattering, sky view and aerial perspective |
| `web/render/clouds.js` | Cloud noise textures and weather map (generated on the GPU); the cloud march, lighting and shadows are in `web/wgsl/clouds/` |
| `web/render/biomes.js` | Biome palettes and limits, written to one surface uniform; the landform-driven materials that read it are in `web/wgsl/trace/material.wgsl` |
| `web/render/post.js` | GPU post passes: resolve, an edge-aware à-trous denoiser guided by first-hit albedo, normal and distance, six-level bloom, and an auto-exposure meter |
| `web/render/display.js` | Exposure (metered or manual), white balance, looks (AgX, ACES, soft, mono), vignette, grain and sRGB; stretches a smaller render to the canvas; PNG capture |
| `web/render/camera.js` | Camera basis, orbit, pan, dolly and sun direction |
| `web/wgsl/` | All shaders, joined by a small `#include` step (`web/gpu/device.js`) |

Some properties of the tracer and frame loop:

- **No triangles.** The tracer intersects the heightfields directly: min/max mip
  pyramids skip empty space, then exact bilinear-patch hits.
- **Lighting.** Sun next-event estimation uses the finite solar disk. Bounces sample the
  sky-view LUT, and haze uses the aerial-perspective LUT at true kilometre distances.
- **Materials.** Erosion and exposure masks place each layer; surfaces shade with
  Lambert plus GGX specular, by roughness and wetness. Camera rays get the fine
  texture and detail normals; bounce and reflection rays use the average material.
- **Responsive loop.** Frames are queued without CPU waits. While the camera moves the
  image renders at half resolution, then refines.
- **Export.** Export renders the same scene at the chosen size and sample count through
  the same kernels, then reads back once.

## Studio

`web/app.js` wires the scene, history, autosave, navigation, files and export to the
interface: a top bar, a rail of seven labs and one drawer at a time.

| Module | Role |
|---|---|
| `web/ui/labs.js` | The labs: each drawer's gallery, controls and Advanced fold |
| `web/ui/controls.js` | Sliders (one undo step per drag), switches, choices, folds and picture galleries |
| `web/ui/thumbnails.js` | Gallery thumbnails cached by scene |
| `web/scene/variants.js` | Gallery choices that keep the terrain: times of day, skies, biomes, lenses and looks |
| `web/ui/icons.js` | Line icons |

Gallery thumbnails come from the real renderer. `Renderer.renderVariants` traces small
JPEGs of variant scenes with a second, small tracer, so the view keeps its accumulated
samples. Only the shared sky LUTs, cloud settings and exposure meter are put back after
each batch, and edits made during a batch are applied when it finishes. The Scenes
gallery uses JPEGs in `web/scenes/thumbnails/`, rendered through the export path by
`bench/thumbnails.mjs`.

## Scenes

A scene is one small JSON document (format `lithosky`, version 1):

- terrain settings
- camera
- sun
- atmosphere
- image settings
- optional clouds, surface (biome and limits) and water settings

Its single definition is `internal/scene/schema.json`. The Go server validates every
file, autosave and project against it, and the browser validates against the same file.

| Feature | Where | How |
|---|---|---|
| Undo/redo | `web/scene/history.js` | Snapshots whole scenes; a drag or slider gesture is one step |
| Autosave and recovery | `web/scene/autosave.js` | Posts to the server, which keeps recovery generations on disk |
| Saved files (`.lithosky`) | — | Plain JSON, or a small verified zip when the scene references an imported heightmap |

Nothing has been released yet, so there are no migrations; versioning starts at the first
public release.

## Local security

The server binds only `127.0.0.1`. Requests must carry the exact Host, a same-origin
`Origin` (for writes) and `Sec-Fetch-Site`. Recovery and project routes need a per-launch
session token. Assets are served with a strict Content Security Policy. Scene and
heightmap inputs are size-limited and validated before use.
