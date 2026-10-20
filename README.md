# Lithosky

A local landscape studio for eroded mountains, luminous skies, haze and water. One Go
executable serves the app and opens it in a desktop-style browser window. Everything
renders on your GPU with WebGPU. There are no accounts, telemetry or remote assets.
Original code and content are Apache-2.0.

**Status:** Wave 4 (visual core) is complete (v0.4.0). Wave 5 (the studio) is in
progress. See the [roadmap](ROADMAP.md).
Highlights:

- **Terrain.** Generated and eroded on the GPU, with stream-power drainage, droplets
  and talus.
- **Rendering.** The path-traced view fills the window and refines in about a second.
- **Sky.** A physical sky with aerial perspective, and volumetric clouds that shadow
  the land.
- **Ground and water.** Materials placed by the landform: banded strata, scree,
  meadow, forest, gravel, sand and snow. Five biomes; wet ground and snow catch
  specular light; lakes have wind waves and shoreline foam.
- **Image.** A GPU denoiser, glow, auto-exposure and photographic looks.

- **Studio.** Seven labs, each a drawer with a rendered gallery and a few controls.

Nothing has been released yet.

## Build and run

Go 1.26 or newer is required to build. There are no third-party Go modules, JavaScript
packages or build steps.

```sh
go build -trimpath -o bin/lithosky .
./bin/lithosky
```

| Option | Effect |
|---|---|
| `--window=browser` | Uses a regular browser tab |
| `--no-open` | Prints the local address; serves until Ctrl+C |
| `--browser /path/to/browser` | Chooses the browser for the app window |
| `--data-dir /path` | Moves the recovery snapshots |

The default app-window mode needs an installed Chromium-family browser with WebGPU.

## Using it

The image fills the window. Pick a lab from the rail on the left; its drawer opens with a
gallery first, then a few controls. Galleries show your current view with each choice
applied, rendered by the real renderer.

| Lab | Gallery | Controls |
|---|---|---|
| Scenes | built-in scenes | |
| Terrain | | seed, relief, drainage, gullies, scree, Erode more; heightmap import under Advanced |
| Light | time of day | sun height and direction, haze, valley fog |
| Sky | cloud types | cover, layers to towers, cloud base, depth, density, cirrus, New sky |
| Ground & water | biomes | snow line, tree line, moisture, rock layers, waves |
| Camera | lenses | focal length |
| Image | looks | auto exposure, exposure, warmth, glow, vignette, grain; debug views under Advanced |

| Input | Action |
|---|---|
| Drag | Orbit |
| Shift-drag or right-drag | Pan |
| Scroll | Zoom |
| W A S D, Q E | Fly |
| 1–7 | Open a lab |
| Esc | Close the lab |
| H | Hide or show the interface |
| Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z | Undo, redo |
| Cmd/Ctrl+S | Save |

**Render** saves a PNG at up to 3840 px. The **File** menu has New scene, Open and Save
(a `.lithosky` scene).

## Development

```sh
go test ./...
go vet ./...
npm test
```

Benchmark hero shots render through the app's own export path:

```sh
node bench/hero.mjs --url http://127.0.0.1:8123 --label <name>
```

Layout screenshots for studio reviews, and the Scenes gallery thumbnails (rerun it
after changing `web/scenes/presets.json`, then rebuild):

```sh
node bench/ui.mjs --url http://127.0.0.1:8123 --label <name> [--lab light]
node bench/thumbnails.mjs --url http://127.0.0.1:8123
```

See [bench/hero/README.md](bench/hero/README.md) for how they are reviewed. The
architecture is in [docs/architecture.md](docs/architecture.md), and the terrain
pipeline in [web/terrain/README.md](web/terrain/README.md).
