# Lithosky

A local landscape studio for eroded mountains, luminous skies, haze and water. One Go
executable serves the app and opens it in a desktop-style browser window. Everything
renders on your GPU with WebGPU. There are no accounts, telemetry or remote assets.
Original code and content are Apache-2.0.

**Status:** First Light (v0.5.0), the first public release, closes Wave 5 (the studio).
See the [release notes](docs/release-notes/0.5.0.md) and the [roadmap](ROADMAP.md).
Highlights:

- **Terrain.** Generated and eroded on the GPU, with stream-power drainage, droplets
  and talus. Two landforms: alpine ranges, or canyon country with mesas and stepped,
  layered walls.
- **Rendering.** The path-traced view fills the window and refines in about a second.
- **Sky.** A physical sky with aerial perspective and an adjustable air colour.
  Volumetric clouds, from fair-weather heaps to storm towers with anvils, shadow the
  land.
- **Ground and water.** Materials placed by the landform: banded strata, scree,
  meadow, forest, gravel, sand and snow. Five biomes; wet ground and snow catch
  specular light; lakes have wind waves and shoreline foam.
- **Image.** A GPU denoiser, glow, auto-exposure and photographic looks.

- **Studio.** Seven labs, each a drawer with a rendered gallery and a few controls.

The product page is in `site/`.

## Install

macOS and Linux:

```sh
curl --proto '=https' --tlsv1.2 -fsSL https://raw.githubusercontent.com/robert-mcdermott/lithosky/main/install.sh | sh
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/robert-mcdermott/lithosky/main/install.ps1 | iex
```

Each installer downloads the executable for your computer, checks it against the
release's `SHA256SUMS` and its own version, and installs it for your user, with no admin
rights needed. Then run `lithosky`. [Installing](docs/INSTALLING.md) covers versions,
other folders, offline installs, checking by hand, upgrading and uninstalling.

## Build and run from source

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
`lithosky --licenses` prints the licences of Lithosky and the Go runtime built into it.

## Using it

The view shows the picture exactly as it will be saved, in the scene's image shape
(16:9, 3:2, 4:5, 1:1 or 21:9, set in the Camera lab). The first time you start Lithosky, a
welcome card offers the built-in scenes to start from. Pick a lab from the rail on the
left; its drawer opens with a gallery first, then a few controls. Galleries show your current view with each choice
applied, rendered by the real renderer. The dice in a drawer's header randomizes that lab
(undoable). Drag any value sideways to adjust it, or click it to type a number.

| Lab | Gallery | Controls |
|---|---|---|
| Scenes | 13 built-in scenes | |
| Terrain | | landform (alpine or canyon), variation, mountain height, river carving, gullies, loose rock, Erode more; heightmap import under Advanced |
| Light | time of day | a sky dome to drag the sun around, sun height and direction, haze, valley fog, sky colour |
| Sky | cloud types | cover, cloud shape (flat to towering), cloud base, thickness, density, high wisps, New clouds |
| Ground & water | biomes | snow line, tree line, moisture, rock layers, waves |
| Camera | lenses, saved views | zoom, image shape, framing guides (thirds, golden ratio), Save this view |
| Image | looks | auto brightness, brightness, warmth, glow, dark corners, film grain; debug views under Advanced |

| Input | Action |
|---|---|
| Drag | Orbit |
| Shift-drag or right-drag | Pan |
| Scroll | Zoom |
| W A S D, Q E | Fly |
| Double-click | Orbit around the point under the pointer |
| Option/Alt-drag | Place the sun where you point |
| R, then drag | Preview an area at full quality |
| G | Cycle framing guides |
| 1–7 | Open a lab |
| Esc | Close the lab |
| H | Hide or show the interface |
| Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z | Undo, redo |
| Cmd/Ctrl+S | Save |

**Render** refines the image in place, with a progress ring and Cancel, then saves a PNG
in the scene's image shape, up to 3840 px on the long edge. The **File** menu has New scene, Open and Save (a `.lithosky` scene).

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

The product site's gallery (`site/gallery/`) renders the same way:

```sh
node bench/gallery.mjs --url http://127.0.0.1:8123
```

See [bench/hero/README.md](bench/hero/README.md) for how they are reviewed. The
architecture is in [docs/architecture.md](docs/architecture.md), and the terrain
pipeline in [web/terrain/README.md](web/terrain/README.md).
