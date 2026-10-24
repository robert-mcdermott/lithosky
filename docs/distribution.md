# Lithosky — landscape studio

Lithosky makes landscape pictures: eroded mountains, canyon country, luminous skies and
real clouds, path traced on your GPU. Everything runs on your computer.

This archive contains:

- the standalone executable
- license notices
- the built-in scenes as `.lithosky` files in `scenes/`

The executable embeds its interface, shaders and scenes, and runs without the source
checkout. `BUILD.json` records the version, platform, toolchain, source commit and the
executable's SHA-256.

## Launch

Extract the archive first.

- **macOS/Linux:** run `./lithosky` from its folder.
- **Windows:** run `lithosky.exe`.

An installed Chromium-family browser (Chrome, Edge, Brave or Chromium) draws the window;
it is not bundled. Rendering needs WebGPU with graphics acceleration enabled. Packages are
unsigned, so your OS may ask you to approve them. Don't disable system-wide security
protections.

| Option | Effect |
|---|---|
| `--browser /path/to/browser` | Chooses the browser |
| `--no-open` | Only prints the local address |
| `--window=browser` | Opens a regular tab |
| `--data-dir /path` | Moves the recovery snapshots |

Close the app window to stop the server, or press Ctrl+C when running with `--no-open`.

## Making a picture

1. **Pick a scene.** The first time you start Lithosky, a welcome card shows the
   built-in scenes. Later, open the Scenes lab.
2. **Shape it.** The rail on the left opens seven labs:

   | Lab | What it changes |
   |---|---|
   | Scenes | Which landscape you start from |
   | Terrain | Landform (alpine or canyon), mountain height, rivers, gullies, loose rock |
   | Light | Time of day, the sun (drag it on the dome), haze, valley fog, sky colour |
   | Sky | Clouds, from clear to storm towers |
   | Ground & water | Biome, snow line, tree line, moisture, rock layers, waves |
   | Camera | Lens, image shape, framing guides, saved views |
   | Image | Look, brightness, warmth, glow, dark corners, film grain |

   Each lab opens with a gallery of your own view under each choice. Drag any value
   sideways to adjust it, or click it to type a number. The dice in a lab's header
   randomizes that lab.
3. **Frame it.**

   | Input | Action |
   |---|---|
   | Drag | Orbit |
   | Shift-drag or right-drag | Pan |
   | Scroll | Zoom |
   | W A S D, Q E | Fly |
   | Double-click | Orbit around that spot |
   | Option/Alt-drag | Put the sun where you point |
   | R, then drag | Preview an area at full quality |
   | G | Framing guides |
   | H | Hide the interface |

4. **Render.** Render refines the picture in place and saves a PNG in the scene's
   image shape, up to 3840 px on the long edge.

The **File** menu saves and opens `.lithosky` scenes. Undo and Redo (⌘Z/⇧⌘Z, or Ctrl
on Windows and Linux) cover every edit. Autosave keeps recovery snapshots in your user
configuration folder under Lithosky. Terrain → Advanced imports a 16-bit grayscale PNG
heightmap (129–2049 px square).

Scene files use format version 1, which is frozen: later versions of Lithosky keep
opening them.

## Licensing

Original code, shaders, documentation and built-in scenes are Apache-2.0: see LICENSE
and NOTICE. NOTICE also credits the ported AgX tone-mapping code. The Go runtime and
standard library are included under the terms in GO-LICENSE. There are no remote
assets. The browser and graphics driver are separate prerequisites.

Source: https://github.com/robert-mcdermott/lithosky
