# Terrain

The GPU terrain module from W4.S2. Settings and a placement go in; height, pyramid and
mask textures come out. Everything runs in WebGPU compute, and the CPU only queues work.

| File | Role |
|---|---|
| `settings.js` | Validated parameters: seed, relief, and drainage, rill and talus strength |
| `terrain.js` | Builds the textures as a staged job |
| `heightmap.js` | Imports 16-bit PNG or `.heightmap` heightmaps through the local server |
| `../wgsl/terrain/*.wgsl` | Generator, drainage, droplets, thermal, masks and pyramids |

## Pipeline

`generate(settings)` queues the stages below; call `step()` once or more per frame until
`busy` is false. `erodeMore()` continues the near drainage solve from its current state.

1. **Far field.** The procedural generator runs on a 768² grid (about 256 m cells) across
   196 km. A drainage solve carves it, and the carving is added to the 4096² far height
   texture (48 m) used for the horizon.
2. **Near tile.** 2048² heights over 16 km (7.8 m), from the generator or an imported
   heightmap, are box-filtered onto a 1024² drainage grid (about 16 m).
3. **Drainage.** Each stream-power iteration:
   - fills depressions with a Planchon-Darboux sweep, so every cell drains
   - routes multiple-flow-direction drainage area
   - incises toward each cell's steepest receiver semi-implicitly
     (`dh = -K A^0.5 S`)
   - relaxes slopes above 42°

   Filled cells are lakes: they route water but are not incised. Rivers grade their
   valleys while hillslopes barely change.
4. **Apply.** The carving is upsampled onto the 2048² tile.
5. **Droplets.** 1.6 M fine droplets with talus relaxation cut gullies and leave scree and
   deposits.
6. **Resolve.** Heights are resolved, then the masks and min/max pyramid are rebuilt.

The procedural generator combines several shapes:

- ridged multifractal ranges
- derivative-damped fBm
- domain warp
- fine slope-aligned gully detail
- a glacial trough with a lake basin placed along the camera's view

## Outputs

| Texture | Contents |
|---|---|
| `nearHeight`, `nearPyramid` | 2048² heights (r32float) and their min/max mips |
| `farHeight`, `farPyramid` | 4096² far-field heights and their min/max mips |
| `masks` (rgba16float) | flow (drainage area or droplet water, log), signed deposition, fine curvature, broad curvature |
| `exposure` (rgba16float) | sky openness over about 500 m, wetness |

## Limits

- Concurrent droplets race on shared heights, so repeated builds differ very slightly.
  The drainage solve is deterministic.
- Erosion fades out over the outer 48 cells of the tile, and the tile blends into the far
  field over 64 cells.
- The full build costs about 3.5 s of GPU time on an Apple M4.
