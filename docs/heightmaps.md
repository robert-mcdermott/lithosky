# Heightmaps and portable terrain assets

**Import heightmap…** accepts an opaque 16-bit grayscale PNG or a `.heightmap`
bundle. Supported square image dimensions are 129, 257, 513, 1025 and 2049 samples
(one more than 128, 256, 512, 1024 or 2048 cells). RGB, alpha, 8-bit images and
other sizes are rejected rather than silently converted or resampled. Import
replaces the current landform as one undoable edit. Camera, water, lighting,
palette and existing surface settings remain; the previous sculpt log is replaced
with an empty log on the imported base. Imported terrain can be sculpted and
colored with the same tools. Build with layers replaces it with procedural terrain.

## Scale and orientation

For a plain PNG, expand **PNG import scale** before importing:

- **Black height / White height:** base heights corresponding to sample codes
  0 / 65535, within −64…64. Black height must not exceed White height. Equal
  values represent a flat surface. Mountain height starts at 1 for plain PNG.
- **Metres per scene unit:** 0.001…100000, descriptive scale preserved in exports.
  The render patch still spans 64 × 64 scene units. The displayed physical width
  is `64 × metresPerUnit`; this metadata does not resize the camera, water or mesh.
- Rows increase in Z from −32 to +32; columns increase in X from −32 to +32.
  There is no automatic image rotation, geographic projection or georeferencing.

Heightmap bundles carry their own scale, resolution, orientation and Mountain
height multiplier. Their metadata overrides the plain-PNG import controls.
Terrain seed affects procedural surface detail on an imported map, not its heights.

## Export and precision

**Export heightmap** downloads `terrain.heightmap`, a ZIP containing `height.png`
and `scale.json`. Unzip it to use the PNG in another tool, or import the bundle
directly into Lithosky to retain scale. The PNG contains base heights before
Mountain height scaling, including completed sculpt strokes and excluding water,
materials and lighting. The scale metadata records the Mountain height multiplier.

Unsculpted imported maps export their original unsigned 16-bit sample bytes, even
when a very narrow height range is indistinguishable at Float32 render precision.
Procedural/sculpted grids are quantized over their actual minimum and maximum;
the error is at most half a 16-bit step, plus Float32 rounding when decoded.
Flat grids export zero codes with equal minimum/maximum. PNG values are read as
numeric heights with no browser canvas, color conversion or gamma correction.
The byte order follows the [PNG sample specification](https://www.w3.org/TR/PNG-DataRep.html).
Go's standard [PNG codec](https://pkg.go.dev/image/png) handles compression and CRCs.

The v1 generator exports 129² samples. Its analytic normals become sampled normals
when imported; this is an explicit terrain conversion, not a bitwise render-image
promise. Layered and imported grids export their current authoring resolution.
Preview remains 128². Final geometry supports up to 1024² cells, capped by the
imported source resolution; choosing a larger tier does not invent source detail.

## Portable scene files

**Save scene** keeps procedural scenes as JSON. For imported terrain (v5, or v6
with physical atmosphere),
`.lithosky` is a ZIP with exactly `scene.json` and `heightmap.bin`. The manifest is
at most 128 KiB; the asset is row-major unsigned 16-bit big-endian height samples,
with `(resolution + 1)² × 2` bytes. The manifest's lowercase SHA-256 reference
must match those bytes. An imported-terrain JSON manifest alone is not a portable scene and is
rejected by Open; missing samples are never fetched from external locations.

Open validates the entire container and asset before changing the scene. Older
JSON files remain supported without automatic upgrades. Importing a heightmap
into a v1 scene migrates it to v5 explicitly; Undo returns to v1. Scene containers
include all required samples and can be reopened with an empty recovery directory.

## Validation and storage limits

PNG and container inputs are limited to 20 MiB. Decoded height assets are at most
8,396,802 bytes (2049² × 2). PNG dimensions/depth are checked before pixel
allocation. Archive directories are checked before entry allocation: exactly two
entries, at most 4 KiB of directory data, and at most 1 KiB of archive comment.
ZIP64 and split archives are unsupported. Only Store/Deflate compression and the
exact expected names are accepted; duplicates, unknown entries, directories,
symlinks, encrypted members, absolute paths and traversal names are rejected.
Each entry is bounded before and during decompression; CRC, sample dimensions,
metadata ranges and SHA-256 are checked. Nothing is extracted to archive-supplied
filesystem paths. Large import/export operations are serialized in the server.

The worker holds the original sample bytes alongside its Float32 grid; maximum
raw storage is about 8 MiB. Export may add another 8 MiB output copy. This adds
up to 16 MiB to the existing approximately 63 MiB maximum terrain typed-array
allowance, excluding browser/GC/HTTP/GPU overhead. Go codec/archive buffers are
separate, with each input, decoded asset and output bounded as above. A geometry
edit cancels an active export worker; late import/export results cannot replace
newer edits. Undo and autosave contain small asset references, not sample arrays.

Imported assets are committed before their referencing recovery snapshot, under
`height-<sha256>.bin` in the chosen recovery directory. Writes use temporary files,
sync and rename. Reads reject symlinks, missing bytes and checksum failures.
Recovery skips broken references and can fall back to the prior valid snapshot.
Autosave remains a bounded JSON request, including when the samples exceed the
browser keepalive payload limit. Asset operations require the per-launch session
token; writes additionally require the exact local Origin.

Assets are retained for older recovery generations, other app processes and Undo.
There is no automatic asset garbage collection in this slice: importing many
maps increases disk use, including an upload whose result becomes stale. Save a
portable scene before cleaning a recovery directory, and do not remove individual
assets while snapshots still reference them. A portable scene is independent of
that directory; a recovery JSON snapshot by itself is not.

## Original examples and checks

The [Terraced basin heightmap](site/assets/terraced-basin.heightmap) contains a
16-bit PNG and metadata for a 640 m-wide terrain. The [portable scene](site/assets/terraced-basin.lithosky)
includes its surface, camera and water settings. The [PNG](site/assets/terraced-basin.png)
and [scale JSON](site/assets/terraced-basin-scale.json) are also available separately.
These fixtures are original Apache-2.0 procedural content. Rebuild them with
`go run ./tools/examples`; that command writes only these four example assets.

Go tests cover all supported PNG sizes, 16-bit codes, malformed dimensions/CRCs,
unsafe and oversized archives, missing assets, store restart and recovery fallback.
Node tests cover quantization, sampled decoding, v1 migration, history size and
worker cache reuse. `tests/browser-heightmaps.mjs` exercises real file controls,
portable reopen, malformed inputs, edit races, recovery, rendered output and
mobile WebGL. See [validation](validation.md) for actual results and release gates.
