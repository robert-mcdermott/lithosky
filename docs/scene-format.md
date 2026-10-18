# Scene files and recovery

Wave 1, slice 2 introduces `.lithosky`: a UTF-8 JSON document, version 1, limited
to 16 KiB. The authoritative [JSON Schema](../internal/scene/schema.json) is
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

## Open, save and history

**Open…** reads a local file with the browser picker. Byte size, UTF-8 and schema
are checked before applying anything. Failed imports do not mutate scene or undo
history. A file that finishes loading after another edit is rejected for retry,
so delayed reads cannot silently erase new work. Open and Restore are undoable.

**Save scene** (Ctrl/⌘ S) downloads a complete JSON file named from the scene title.
The browser decides the download destination and any duplicate-name suffix. It
does not overwrite an earlier scene file in place. The UI says “Download
requested”; it cannot confirm that a user accepted a browser download dialog.
Open also has Ctrl/⌘ O. Files contain parameters only, with no external URLs,
paths, scripts, textures or additional assets.

Undo/Redo use Ctrl/⌘ Z, Ctrl/⌘ Shift Z, or Ctrl Y, except within text/number fields
where native text undo is retained. Pointer camera drags, repeated camera keys,
wheel bursts and slider gestures become single edits. Up to 100 scene snapshots
are retained in memory. New edits clear the redo branch; history is not saved in
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
