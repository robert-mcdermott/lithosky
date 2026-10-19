# Objects, selection and groups

Wave 3 slice 7 adds the editable scene foundation. Open **Objects** beside the
view, or switch the left library from Scenes to Objects. On compact screens,
Objects opens a dialog. Search names or types; arrow keys navigate the list.
Select an object to show its properties in the inspector. **Inspect** reopens
the Controls panel if needed. **Clear** returns to the complete control set.

**Select in view** picks the nearest visible terrain, water surface or area-light
rectangle. A click on unobstructed sky selects Sun & sky. Locked objects remain
selectable but cannot be edited. Hidden objects remain available in the list.
The active camera is selected in the list because the view looks through it.
Escape with the view focused clears selection and returns to orbit. Camera
navigation and sculpting retain their own controls; switching to a sculpt brush
leaves selection mode. Focus picking and region picking also leave it.

Picking uses a central, unblurred camera ray and the current 128² preview field;
fine final geometry and depth of field can differ at small features. List and
viewport selection refer to the same entity ID. Dashed bounds and light-rectangle
guides are editor overlays. Terrain occludes picking of a light behind it; use
the Objects list to select occluded lights. Guides never enter PNG export.

## Author an object

- **Object name** changes its list/inspector label. Names can repeat; stable IDs
  distinguish entities. Names do not change pixels or invalidate a finished render.
- **Visible** controls preview and final rendering. A hidden parent hides its
  descendants without replacing their own visibility or enabled settings.
  Water/area-light component enablement remains independently saved.
- **Locked** protects parameters, names, visibility, parenting and deletion.
  Locked parents protect descendants. Select the parent to unlock it; a child
  cannot override an ancestor lock. Read-only export and rendering remain available.
- **New group** creates an empty organizational group. Choose **Parent group**
  on another object to place it there. Primitive-only groups now support uniform transforms; see [object tools](object-tools.md).
- **Delete** removes an area light or dissolves a group, promoting its children
  to that group's parent. Locked descendants prevent regrouping/deletion. Core
  terrain, water, environment and active camera are retained; hide supported
  components rather than deleting them.
- **Duplicate light** copies the existing renderable area-light definition under
  a new identity. At most four area lights are supported. Add/edit lights with
  the existing light controls; their identities survive other scene edits.

The active camera always remains visible and outside groups. Its lock protects
saved camera navigation and lens edits. Move/rotate/scale handles, primitives, multi-selection and clipboard operations
are available in [slice 8 object tools](object-tools.md). Additional editor cameras
are available in [composition workspace](composition-workspace.md). This foundation does not present proxy geometry as a rendered object.

Every authored command uses validation and the shared Undo history. A lock is
enforced at the command boundary, including keyboard navigation, sculpt commits,
heightmap replacement and seed/layer regeneration. Disabling an HTML control is
only a convenience, not the enforcement mechanism. Undo/Redo can restore earlier
locks and scene states. Explicit scene/preset replacement is a whole-document
operation; it is not a targeted edit of a locked component.

## Persistence and compatibility

Opening v1–v10 keeps that format and its rendering interpretation. Selection,
search, tree expansion, panel layout and tool mode are workspace state. They do
not migrate, dirty or autosave a document. The first authored metadata command
creates a v11 entity document in the same Undo transaction as the edit.

V11 stores component data once, inside entities. The existing controls use a
temporary legacy-shaped adapter; this is not a second saved copy. Terrain,
surface, water, camera, environment and area-light data retain their values and
model identifiers. In particular, moving to entities does not silently enable a
new atmosphere, lens, material or lighting model. Component editing retains IDs,
group membership, visibility, locks and unrelated authored data.

Save/open, autosave/recovery and portable heightmap containers preserve the
graph and its asset references. Go asset discovery reads the terrain component,
so the container still embeds one checksummed immutable heightmap. Scene size
remains 128 KiB; the portable container remains bounded at 20 MiB. The graph is
limited to 64 entities, eight group ancestors and four area lights. Both validators
reject duplicate/unsafe IDs, missing core roles, malformed components, dangling
or cyclic parents, unsupported camera parenting/visibility and excessive budgets.
See [the v11 format](scene-format.md).

## Original example and verification

[Editable basin](site/assets/editable-basin.lithosky) groups named highlands and
lake components while retaining an independent warm area light and saved camera.
The group can be hidden, locked and restored without losing parameters. The
[render](site/assets/entity-basin.png), [hidden-group view](site/assets/entity-hidden.png)
and [workspace screenshot](site/assets/entity-studio.png) are original captures.
They demonstrate editing behavior; the photographic-quality gate remains open.

`tests/entities.test.mjs` checks migration, renderer/cache equivalence, stable IDs,
commands/history, lock bypass attempts, visibility and CPU picking. Go and JS
share valid/malformed graph fixtures in `tests/fixtures/entities.json`. Go also
checks imported v11 container round trips. `tests/browser-entities.mjs` exercises
selection/render preservation, migration/Undo, grouping, lock enforcement,
viewport picking, light duplication/deletion, save/reopen/recovery, compact
layouts and WebGL editing. `tests/browser-entity-rendering.mjs` verifies actual
shader migration parity, hidden-terrain misses, dark environment and independent
area lights. Use disposable app data and browser profiles for these workflows.

Reproduce the public capture record with:

```sh
node docs/capture/entity-run.mjs http://127.0.0.1:PORT
```

Set `PLAYWRIGHT_CLI` to an installed CLI or the documented wrapper. Rebuild the
isolated app first. The capture checks embedded asset hashes, workflow/GPU
results, scene/image hashes and an Undo round trip. Site generation rejects stale
or mismatched evidence. Captures are serial GPU runs, not parallel benchmarks.

The [composition workspace](composition-workspace.md) adds separate editor views,
frame selection, camera snapshots, object finishes, terrain paint and blank templates
in v13, completing the local manual composition loop.
