# Scene files and recovery

Procedural `.lithosky` files are UTF-8 JSON limited to 128 KiB; v5–v9 asset-backed
files use a portable ZIP container limited to 20 MiB. This build opens v1
legacy landscapes, v2 layered terrain, v3 sculpted terrain, v4 surface materials, v5 imported heightmaps, v6 atmosphere and v7 geological surfaces v8 studio light transport/color, and v9 lake optics. The authoritative
[JSON Schema](../internal/scene/schema.json) is
embedded in the Go binary and served at `/api/scene-schema`. Small independent
Go/JavaScript validators implement only its bundled vocabulary. They use the
same acceptance fixtures; they never fetch schemas or execute scene content.

```json
{
  "format": "lithosky",
  "version": 1,
  "title": "Alpine quiet",
  "terrain": {
    "generator": "terrain-v1",
    "seed": 1847,
    "elevation": 1,
    "palette": "natural"
  },
  "camera": {"yaw": 0.28, "pitch": 0.3, "distance": 23},
  "water": {"enabled": true, "level": 0.25},
  "lighting": {"sunElevation": 38}
}
```

| Field | Contract |
|---|---|
| `format`, `version` | Exactly `lithosky`, integer `1` |
| `title` | 1–80 Unicode code points |
| `terrain.generator` | `terrain-v1`; fixes the current procedural algorithm |
| `terrain.seed` | Integer 0–4294967295 |
| `terrain.elevation` | 0.4–1.7 |
| `terrain.palette` | `natural` or `otherworld` |
| `camera.yaw` | Radians, −π to π; interactive orbit wraps |
| `camera.pitch` | Radians, 0.08–1.2 |
| `camera.distance` | 10–48 scene units |
| `water.enabled`, `water.level` | Boolean visibility, −3 to 5 scene units |
| `lighting.sunElevation` | 5–85 degrees; approximate preview lighting |

All fields are required; additional properties, coercion, nulls and nonfinite
numbers are rejected. Version 1 uses the fixed 64×64 terrain fixture, a camera
orbit target of `[0, 1.8, -4]`, and the existing perspective projection. Water is
an opaque preview surface. Those interpretation rules belong to this version;
future generator/camera changes need an explicit format migration or identifier.
There was no released file format before v1. Unknown versions and generator IDs
fail without changing the open scene. No implicit downgrade strips future data.

## Version 2 layered terrain

V2 keeps the root, camera, water and lighting fields above, but requires version
`2` and generator `layers-v1`. Terrain also requires `resolution` (one of
256, 512, 1024, 2048) and `layers` (1–8 entries). Each layer requires:

- `kind`: `fbm`, `ridge`, `warp` or `terrace`.
- `enabled`: boolean; disabled entries are retained in files.
- `strength`: 0–1; `scale`: 0.25–8; `octaves`: integer 1–8.

All layer fields are required, including octaves for terraces (retained but not
used). Scale means noise-frequency multiplier, or terrace step height. Unknown
fields/kinds, empty stacks and unsupported budgets fail validation. The bundled
schema uses `oneOf` for version branches and bounded arrays for layers; both
validators implement these rules. See [terrain](terrain.md) for interpretation.

Opening v1 does not migrate it. **Build with layers** explicitly replaces its
landform and upgrades to v2 as an undoable edit. Starter selection can replace a
v2 composition with a v1 study. There is no automatic conversion of layered
heights to the legacy generator, and older builds reject v2 rather than lose data.

## Version 3 sculpted terrain

V3 requires version `3` and the v2 layered terrain fields, plus `terrain.sculpt`.
This is an ordered array of 0–32 strokes; each stroke requires exactly:

- `tool`: `raise`, `lower`, `smooth` or `flatten`.
- `radius`: 0.5–8 scene units; `strength`: 0.05–1.
- `height`: −64 to 64, the fixed flatten target before Mountain height scaling.
  It is retained but unused for the other tools.
- `points`: 1–24 pairs `[x,z]`, each coordinate within −32 to 32.

The first applied stroke upgrades v2 to v3 as one undoable edit. Clearing strokes
keeps v3 with an empty array. V1 must first be explicitly replaced with layered
terrain through Build with layers. No automatic upgrade changes existing files.
Older builds reject v3. The [sculpt contract](terrain.md#sculpting) fixes replay
order and brush math; parameters are saved instead of dense height assets.

The file/body cap increases from 16 to 128 KiB for these bounded stroke records.
Serialization uses readable JSON, falling back to compact JSON if needed to stay
within the file cap. The largest valid stroke log's compact autosave request stays
below 60 KiB, leaving space under the browser's keepalive body budget. HTTP writes
are bounded to the scene cap plus 1 KiB of envelope; recovery reads share the cap.

## Version 4 surface materials

V4 requires version `4`, a new root `surface` object and either the original
v1 terrain fields or all v3 layered/sculpted terrain fields. The explicit
**Customize surface** action preserves the current generator; layered terrain
without sculpting receives an empty stroke list. Opening older files does not
upgrade them. Building layers or sculpting a v4 scene retains its surface settings
and version. Older builds reject v4 instead of stripping those settings.

Every `surface` property is required; unknown properties are rejected:

| Property | Contract |
|---|---|
| `preset` | `rules`, `rock`, `snow`, `sand` or `ground` |
| `snowHeight`, `sandHeight` | −64…64 world-height units, after elevation scaling |
| `rockSlope` | 0…90 degrees from the vertical smooth normal |
| `blend` | 0.05…4 transition softness |
| `detail` | 0…1 color variation strength |
| `detailScale` | 0.25…4 world-space frequency multiplier |

Single-material presets retain rule values for switching back. Detail affects
color only. The [surface interpretation](terrain.md#surface-materials) is fixed
by v4. No images, remote textures or executable shader content enter scene files.
The 128 KiB file limit and bounded compact recovery payload continue to apply.

## Version 5 imported terrain

V5 uses generator heightmap-v1, retains seed/elevation/palette, and requires a
resolution (128, 256, 512, 1024 or 2048 cells), a sculpt array and an asset reference.
The reference is a 64-character lowercase SHA-256 string. Minimum and maximum
base heights are finite within −64…64, with minimum ≤ maximum. Metres per scene
unit is finite within 0.001…100000. The JSON properties are named asset, minimum,
maximum and metersPerUnit. An optional root surface object uses the v4 contract.

The manifest retains the 128 KiB limit. A portable scene contains exactly
scene.json and heightmap.bin, with no external URLs or paths. Its raw unsigned
16-bit big-endian sample count and checksum must match the manifest. Both the
Go and JavaScript validators enforce reference syntax and range relationships in
addition to the bundled schema. Open rejects bare v5 manifests. Recovery uses
small JSON manifests referencing immutable local assets; the two formats have
different portability guarantees. See [heightmap format and storage](heightmaps.md).

## Version 6 atmosphere

V6 requires an atmosphere object with model earth-single-v1 and mode manual or
geographic. All manual and geographic fields are retained when switching modes.
Its terrain is original v1, sculpt-capable layered v3, or imported v5; an optional
surface uses the v4 contract. Imported v6 scenes use the same two-entry portable
container as v5; procedural v6 scenes remain JSON. Rendering derives the geographic
sun direction without changing stored manual values.

Bounds: sunElevation −18…90°, sunAzimuth 0…360°, latitude −90…90°, longitude
−180…180°, year 2000…2100, day 1…366 (366 only in leap years), utcMinutes
0…1439, altitude 0…10000 metres, metresPerUnit 1…1000, aerosols 0…5 and ozone
0…2. Year/day/minutes are integers. Go and JS reject missing/unknown fields and
non-leap day 366. See [atmosphere contracts](atmosphere.md). Enabling this model is
an explicit undoable upgrade; subsequent terrain/material edits retain v6.

## Open, save and history

**Open…** reads a local file with the browser picker. Byte size, container contents, UTF-8 and schema
are checked before applying anything. Failed imports do not mutate scene or undo
history. A file that finishes loading after another edit is rejected for retry,
so delayed reads cannot silently erase new work. Open and Restore are undoable.

**Save scene** (Ctrl/⌘ S) downloads a complete JSON file named from the scene title.
The browser decides the download destination and any duplicate-name suffix. It
does not overwrite an earlier scene file in place. The UI says “Download
requested”; it cannot confirm that a user accepted a browser download dialog.
Open also has Ctrl/⌘ O. Procedural files contain parameters only. V5 and asset-backed v6 containers additionally include one
validated height asset. External URLs, filesystem paths and scripts are forbidden.

Undo/Redo use Ctrl/⌘ Z, Ctrl/⌘ Shift Z, or Ctrl Y, except within text/number fields
where native text undo is retained. Pointer camera drags, repeated camera keys,
wheel bursts and slider gestures become single edits. At most 100 undo/redo
snapshots are retained within a combined 4 MiB budget
(including an active gesture baseline), counted as two bytes per string code unit.
Oldest undo entries are discarded first; if necessary, farthest redo entries are
discarded next. The current scene is separate. Snapshots contain validated scene
JSON, never dense grids. One released sculpt stroke is one history entry. New
edits clear the redo branch; history is not saved in
project/recovery files. GPU backend changes are workspace preferences, not edits.

## Local autosave

Default directory: Go's user configuration directory plus `Lithosky`:

- macOS: `~/Library/Application Support/Lithosky`
- Windows: `%AppData%/Lithosky`
- Linux: `$XDG_CONFIG_HOME/Lithosky`, or `~/.config/Lithosky`

Use `--data-dir /path/to/directory` to choose a different location. This directory
is separate from the temporary browser profile and persists across launches.
New directories use mode 0700 and snapshot files 0600 where OS permissions apply.
Do not select a shared directory for private work.

On startup, existing snapshots are offered for explicit restoration. **Keep this
scene** continues with the current view. Until a choice is made, edits remain in
memory and autosave is paused. With no prior recovery, autosave starts on the
first edit. Restoring does not delete the source snapshot.

Autosave waits about 650 ms after edits, with one write in flight. Pending state
is coalesced to the latest edit. Failed requests pause autosave and keep their
payload; Retry first retries that request, then saves newer edits. Watch for
**Recovery saved on this device** before closing. A close/reload warning is
requested when edited state has neither completed autosave nor requested a file
download; browsers control whether the warning appears. Unacknowledged edits
can be lost in a crash. A named scene download remains the durable user backup.

Each process creates a random recovery ID. Each successful write uses a new
numbered filename, writes/syncs/closes a `.pending` file, then renames it to a
previously unused `.lithosky` name. Current and previous committed generations
are retained for that process; orphan `.pending` files are ignored. If the latest
published file is damaged, recovery reads the previous valid generation and
labels it accordingly. Directory syncing is best effort on platforms that do
not support it; sudden power-loss durability depends on OS/filesystem behavior.

Different launches cannot overwrite each other's recovery IDs. Tabs within one
launch use a revision check: a stale write returns a conflict and pauses autosave.
Download that tab's scene before reloading/restoring the newer recovery. An
identical retry of the last accepted write is idempotent, including when the
original response was lost. Old session snapshots are retained; the chooser
shows the newest 50 sessions. With Lithosky closed, unwanted recovery and orphan
`.pending` files can be removed from the data directory manually.

## HTTP boundary

All endpoints inherit exact loopback Host/Origin and Fetch Metadata checks.
`GET /api/session` supplies a per-launch token and revision to the local UI.
Recovery list/read and autosave require `X-Lithosky-Session`. Writes also require
an explicit same Origin, JSON media type and bounded body. There is no CORS grant.
The local user's other processes are within the trust boundary.

`PUT /api/autosave` accepts only `{expectedRevision, scene}` and writes only to
this process's recovery ID. `GET /api/recovery` lists valid snapshots;
`GET /api/recovery/<id>` accepts only an opaque 32-character lowercase hex ID.
The storage root is confined with `os.Root`; clients cannot supply filesystem
paths. This API is internal, not the future automation interface.

## V7 geological surfaces

V7 requires `surface.geology` with model `geology-v1` and bounded scale,
strata, fractures, bump and roughness. It retains the prior surface preset and
height/slope controls, accepts the three existing terrain families, and optionally
includes atmosphere. Imported samples use the existing portable container.
Removing atmosphere or changing terrain cannot downgrade a geological scene.
Switching to a simple surface explicitly removes geology and chooses the minimum
supported format for the remaining features. Undo restores the earlier definition.
No generator algorithm, terrain sample, camera or existing v1–v6 file is silently
upgraded when opened. The material definition is independent of terrain buffers.

## V8 studio lighting

V8 requires `lighting.transport`, model `path-v1`, one to four bounce vertices,
bounded exposure/roughness/IOR/sun/sky strengths and a filmic or Reinhard curve.
It accepts all three terrain families; surface, geology and atmosphere are
optional. At most four rectangular lights each have a name, enabled flag,
position, azimuth/elevation, size, radiance and linear RGB. Unknown fields, invalid
numbers, unsupported models and oversized arrays are rejected identically in Go
and JavaScript. Lighting survives terrain conversion/import, sculpt, atmosphere
and surface changes. Save/recovery, history budgets and portable assets retain
their existing limits. Removing studio lighting chooses the minimum format for
the remaining capabilities. See [light transport](light-transport.md).

## V9 lake optics

V9 requires `water.optics` with model `lake-v1`, metresPerUnit [1, 10000],
density [0.1, 8], ripples [0, 1], wavelength [0.1, 8] and shore [0, 0.5]. All
are required finite numbers. Studio lighting, atmosphere and geological surfaces
remain independently optional. All three terrain families, portable assets,
history and recovery retain their existing bounds. Disabling lake optics chooses
the minimum format preserving the remaining capabilities. Opening v1–v8 is
unchanged; an explicit undoable upgrade adds missing current models. New/default
scenes and starter studies use v9. See [lake optics](water.md).
