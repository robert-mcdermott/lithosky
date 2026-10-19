# Camera and composition

New scenes use the saved `thin-lens-v1` camera. Older scenes open with their
original pinhole framing. **Use photographic camera** adds the lens in one
undoable edit, preserving that projection exactly with depth of field disabled.
Rendering upgrades and camera upgrades are independent operations.

Under **Camera & composition**, choose 16:9, 3:2 landscape, 2:3 portrait or square.
Set focal length (10–300 mm), roll, and the aim target. Drag to orbit around that
target; Shift-drag or Shift-arrow keys translate it in the image plane. Scroll
or +/− changes camera distance. A released drag is one Undo step; Escape or lost
pointer capture restores its start. Home resets orbit/target/roll and retains
the lens, frame and focus settings. Raster, live lighting, final output, sculpt
picking and focus picking use the same projection. Raster clipping spans
0.05–512 scene units; final rays intersect the bounded terrain directly.

The virtual sensor has a **36 mm long edge**, cropped to the saved frame.
The vertical half angle is `atan(sensorHeight / (2 * focalLength))`.
At 16:9, 21.09375 mm reproduces the old vertical projection factor 0.48.
Changing framing crops the sensor; it does not stretch a finished image.

## Focus and aperture

**Depth of field** samples an ideal circular thin lens. Focal length and
f-number determine aperture radius `focalLength / (2 * fNumber)`. Camera metres
per scene unit converts aperture and focus distance to scene coordinates. The
focus distance is measured along the optical axis to a plane perpendicular to
the camera’s forward direction. Rays from all aperture positions meet at that
plane. **Pick focus in view** selects terrain or water with a central ray;
Escape cancels selection. Numeric focus remains available.

F-number is 0.7–64; focus is 0.01–10,000,000 metres. At landscape distances,
physical apertures usually produce very little blur. A wider aperture, longer
lens or close subject makes it visible. The camera scale is explicit: match
atmosphere and water scales for coherent natural scenes. Imported heightmap
metadata does not silently rescale these settings. Aperture controls blur;
exposure remains the separately saved lighting EV. This is a thin-lens model,
without lens distortion, aberrations, diffraction, shutter/motion blur or
calibrated camera response. WebGL raster preview remains sharp; WebGPU live
lighting and final stills trace the aperture.

The implementation is original. The thin-lens geometry is described in
[Physically Based Rendering, Projective Camera Models](https://pbr-book.org/4ed/Cameras_and_Film/Projective_Camera_Models).
No code, textures or scene assets were copied from that reference.

## Output and render region

Choose a 640, 960, 1280, 1600 or 2048-pixel long edge. Dimensions round the short
edge to the nearest integer: 2048 × 1152 at 16:9, 2048 × 1365 at 3:2,
1365 × 2048 at 2:3, and 2048² square. The live lighting preview fits the frame
within a 320-pixel long edge. Final output supports 8–256 samples per pixel.

**Render a region** accepts left/top/width/height percentages, or **Drag region
in view** selects a rectangle. Escape restores the previous selection. A crop
retains full-frame projection, material footprints and global pixel/sample
seeds. It produces exactly the corresponding pixels of a full render at the
same settings, including depth of field. The finished crop overlays that part
of the preview; **Export PNG** exports only the crop and labels its filename
`-region`. No selection border or preview pixels enter the export.

Region, output size, sample count and terrain detail are temporary render
settings. Lens and framing are authored scene data, saved/recovered/undoable
as v10. Unsupported or malformed lenses are rejected by both validators.
Opening v1–v9 does not add a camera or alter the saved landscape.

GPU image buffers require 24 bytes per output pixel (accumulation, display and
readback). A full 2048² image needs 96 MiB, plus up to 48.1 MiB of Fine terrain
vertices, hierarchy, atmosphere, preview, CPU copies and driver overhead.
These are allocation budgets, not process-memory limits. Regions allocate only
their own output pixels. Allocation failure remains visible; retry a smaller
frame or region. Tile-level cancellation retains only complete samples.

## Distant ground and current image quality

The optional **Natural horizon** control supplies diffuse spherical ground
radiance behind the finite terrain. It adds an approximate solar/sky-lit ground
background to the single-scattering sky LUT. New scenes enable it at 0.12
reflectance; old documents retain their appearance. It is not distant editable
terrain, a physical ocean extension, or multiple atmospheric scattering. A
finite-world horizon transition can still be visible.

The original mountain, coast and snow scenes are composition studies, available
in the starting panel and generated gallery. Their settings and unretouched
exports are reproducible. The integrated review and remaining visual defects
are recorded in [visual quality](visual-quality.md). The photographic release
gate remains open; the camera does not create missing geological structure,
clouds or realistic surface variation.

## Verification

`tests/camera.test.mjs` checks focus-plane convergence, projection/picking across
all frames, exact legacy projection, schema/round trips, cache invalidation,
output/region bounds and cancelable history. `tests/browser-camera.mjs` compares
4,096 actual shader scalars against the CPU reference, checks full/crop pixel
equality with and without aperture sampling, and allocates/renders a complete
sample in all three 2K orientations. `tests/browser-camera-ui.mjs` exercises
upgrade/Undo, pan/cancel, focus, save/reopen/recovery, portrait PNG, region export,
small-screen layout and WebGL editing. Use only a disposable loopback app.

`docs/capture/camera-run.mjs` repeats these checks and records original scene
exports, native-pixel crops, capture hashes, GPU/browser, timing and image-buffer
budgets. See [site capture workflow](site/README.md).
