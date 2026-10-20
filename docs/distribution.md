# Lithosky — landscape studio

This archive contains:

- the standalone executable
- license notices
- the built-in starter scenes as `.lithosky` files in `scenes/`

The executable embeds its interface, shaders and presets, and runs without the source
checkout. `BUILD.json` records the version, platform, toolchain, source commit and the
executable's SHA-256.

## Launch

Extract the archive first.

- **macOS/Linux:** run `./lithosky` from its folder.
- **Windows:** run `lithosky.exe`.

An installed Chromium-family browser supplies the window; it is not bundled. Packages are
unsigned, so your OS may ask you to approve them. Don't disable system-wide security
protections.

| Option | Effect |
|---|---|
| `--browser /path/to/browser` | Chooses the browser |
| `--no-open` | Only prints the local address |
| `--window=browser` | Opens a regular tab |

Close the app window to stop the server, or press Ctrl+C when running with `--no-open`.

Rendering needs WebGPU with graphics acceleration enabled.

## Making an image

1. Pick a starting point under **Start from**.
2. Shape the terrain: seed, relief, drainage, gullies and scree. Terrain rebuilds take a
   few seconds and you can watch them happen.
3. Set the sun, haze and valley fog.
4. Frame the view:

   | Input | Action |
   |---|---|
   | Drag | Orbit |
   | Shift-drag or right-drag | Pan |
   | Scroll | Zoom |
   | W A S D, Q E | Move |

5. **Export image** renders at 1920–3840 px with the quality you choose and saves a PNG.

**Save** downloads a `.lithosky` scene; **Open** restores it. Undo and Redo cover every
edit. Autosave keeps recovery snapshots in your user configuration folder under
Lithosky; `--data-dir` overrides the location. **Heightmap…** imports a 16-bit
grayscale PNG (129–2049 px square) as the terrain.

## Licensing

Original code, shaders, documentation and starter scenes are Apache-2.0: see LICENSE
and NOTICE. NOTICE also credits the ported AgX tone-mapping code. The Go runtime and
standard library are included under the terms in GO-LICENSE. There are no remote
assets. The browser and graphics driver are separate prerequisites.

Source: https://github.com/robert-mcdermott/lithosky
