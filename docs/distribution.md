# Lithosky — landscape studio

This archive contains the standalone executable, license notices, and three
original .lithosky starter scene files. The executable embeds its frontend,
shaders and starter catalog; it runs without the source checkout. BUILD.json
records the version, platform, build toolchain, source commit, dirty-worktree
status and executable SHA-256. A dirty build is a development artifact.

## Launch

Extract the archive first. On macOS/Linux, run `./lithosky` from its folder.
On Windows, run `lithosky.exe` (or `.\lithosky.exe` in PowerShell).
An installed compatible Chromium-family browser supplies the desktop-style
window with no tabs or address bar. The browser is not bundled. These initial
packages are unsigned and not notarized; OS approval may be required for a
trusted download. Do not disable system-wide security protections.

Use `--browser /path/to/browser/executable` to select a browser, `--no-open` to
print the local address, or `--window=browser` to explicitly use a regular tab.
The default port is chosen automatically. Close the app window to stop its
server; use Ctrl+C when running with `--no-open` or `--window=browser`.

Final rendering requires WebGPU and enabled graphics acceleration. WebGL 2 is a
fallback for preview only. If graphics fail, select Automatic and Retry graphics
under Graphics & compatibility. The scene remains editable and saveable.

## First image

Choose a starter scene. Drag to orbit; scroll to zoom. With the view focused,
arrow keys orbit, +/− zoom, and Home resets the camera. Adjust height, water and
sun. Render image progressively traces a 16:9 still at 640 × 360 or 960 × 540,
with 8–64 samples. Cancel retains the last complete sample. Export PNG saves
that image; visual scene edits clear the old render; renaming keeps it.

Save scene downloads a portable .lithosky file; Open restores it. Save creates
a new download, not an update to an earlier file. Undo/Redo applies to scene
and camera edits. Autosave keeps local recovery snapshots in the OS user
configuration directory under Lithosky (override with `--data-dir`). Wait for
“Recovery saved on this device” before closing. Use named downloads as backups.

## Scope and licensing

This first renderer provides bounded terrain, simple sun/sky lighting, and calm
water reflection/refraction. Physical atmosphere, weather, vegetation, waves,
sculpting, animation and production image sizes are future work. GPU results and
speed vary; no photorealistic-quality or universal graphics support claim is made.

Original code, shaders, documentation and starter content are Apache-2.0:
see LICENSE and NOTICE. The Go runtime/standard library is included under the
terms in GO-LICENSE. No third-party application libraries or remote assets are
included. The installed browser and graphics driver are separate prerequisites.

Source and documentation: https://github.com/robert-mcdermott/lithosky

Build with layers creates v2 terrain from fBm, ridges, domain warp and terraces.
Generation runs in a cancellable worker at 256²–2048² cells; preview and stills
currently use a shared 128² mesh. Existing v1 scenes open unchanged.

Layered terrain supports Raise, Lower, Smooth and Flatten. Drag and release to
apply one undoable stroke; arrow keys position the brush and Space applies it.
Escape discards an unfinished stroke. V3 files retain up to 32 strokes of 24
marks each; Clear sculpting is undoable. The history snapshot budget is 4 MiB.

Choose Customize surface for height/slope material rules or Rock, Snow, Sand and
Ground presets. Color detail adds local seeded variation. Customized surfaces
save as v4, preserving the original or layered/sculpted terrain; earlier scene
versions remain supported. The preview and tracer share the same surface mesh.
