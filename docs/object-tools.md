# Add, place and transform objects

Wave 3 slice 8 adds original **Box, Sphere, Cylinder and Cone** solids. Choose a
shape beside the viewport, then **Add** at the camera's aim target or **Place in
view** and click terrain or water. Placement puts the primitive's bottom at the
chosen point. When terrain and water are hidden, placement uses the Y=0 working
plane. Escape cancels placement without editing the document.

Objects are real geometry in WebGPU and WebGL raster previews, live lighting,
ray-traced stills and PNG export. They occlude each other and terrain, cast traced
shadows, appear in water reflections/refraction and participate in bounded light
transport. With current rendering their starter finishes are opaque rough dielectrics; older
scenes retain their lighting model until explicitly upgraded. Material assignment
and painting remain slice 9 work; these primitives are not a vegetation library.

## Selection and editing

Open **Objects** to select a named object. Shift, Ctrl or Command-click adds or
removes a selection in the list or with **Select in view**. **Multi-select** in
the Objects panel provides the same operation on touch screens; its dialog stays
open while selecting. Clear leaves every object unchanged. Names, tool mode,
selection and helpers never enter the exported image.

Use **Move, Rotate or Scale**, or W/E/R while the viewport or object list is
focused. Drag an axis handle. World and local axes apply to moving and rotating;
scale handles use local axes. The white central scale handle scales uniformly.
Multiple objects rotate/scale around their shared pivot. A single object uses its
origin; grouping a selection puts the group's origin at the selection center.
Selected ancestors are applied once, even if their children are also selected.

**Snap** applies dragging increments: 0.5 scene units, 15 degrees, or 0.1 changes
in scale factor. The Transform inspector supplies exact numeric local position,
X/Y/Z rotation and scale. Position and rotation are relative to the parent group.
For a selection, choose an axis and enter an adjustment: a movement distance,
rotation angle or positive scale factor, then **Apply adjustment**. Arrow keys
adjust that axis using the entered step; Shift multiplies it by ten. Exact numeric
adjustments do not require snapping.

A drag is one Undo step. Escape, pointer loss or resizing during a drag restores
the previous scene and its redo branch. Switching to an object tool cancels active
focus/region picking so those tools cannot intercept a handle. Escape from an idle
object tool returns to camera orbit. Existing camera pan/orbit and sculpting remain
available in their own modes.

**Edit objects** contains these commands:

- **Copy/Paste** uses a private object clipboard in this window. Ctrl/Command-C/V
  work with the view or object list focused; text editing keeps normal shortcuts.
  The clipboard includes selected subtrees and remaps every copied ID/parent link.
  Paste offsets copies by one unit in X and Z. Core scene components are retained
  rather than copied. No OS clipboard permission or service is needed.
- **Duplicate** (Ctrl/Command-D) copies the current selection in one transaction.
- **Group selection** groups primitives or primitive-only groups while keeping
  their world pose. Parenting and dissolving groups also keep world pose.
- **Delete** or Backspace deletes selected primitives/lights. Deleting a group
  dissolves it and keeps its children, consistent with the earlier Objects editor.
  Undo restores identities, links, poses and flags.
- **Align X/Y/Z** aligns selected origins to the last selected object's origin on
  that world axis. Other axes and rotations remain unchanged.
- **Drop to terrain** places each selected root's conservative bounds on the
  highest of a 5×5 set of terrain samples beneath its footprint. It is a placement
  aid using the 128² preview field, not a physical collision solver. Fine final
  terrain can differ; inspect and adjust on steep slopes or overhang-like shapes.

New objects, parameters, groups and transforms survive `.lithosky` save/open and
autosave/recovery. Imported heightmap containers keep their original samples and
checksums. Regenerating terrain keeps unrelated objects and their authored poses.

## Transform limits

Primitives have independent positive X/Y/Z scales. Groups scale uniformly, so
nested rotated geometry remains representable without shear. Multi-selection
scaling is uniform; individual primitive scale handles change a local dimension.
Mirroring, zero scale and shear are rejected. These limits are shown in the
inspector and enforced by both validators.

Terrain, water, environment and the active camera use their existing editors.
Area lights retain their position/direction/size controls and can be copied or
duplicated; they do not have primitive transform handles in this slice. Groups
containing those components are organizational and cannot be transformed. The
command boundary rejects unsupported operations atomically and explains why.

Locks apply to all editing routes, including numeric input, handles, shortcuts,
parent transforms and group commands. A locked descendant prevents transforming
its parent. Hidden objects remain available in Objects but do not render or pick.

## Representation, rendering and budgets

The first add/transform command creates **v12** in the same Undo step. V1–v11
documents retain their format until an appropriate edit. V12 keeps the v11 entity
graph, adds primitive and transform components, and stores each property once.
Transforms use positive TRS with column vectors: scale, then X, Y, Z rotations,
then translation (`T × Rz × Ry × Rx × S`). World matrices multiply parent to child;
normals use the inverse transpose. Raster geometry, picking and ray intersections
share this model. See [scene format](scene-format.md).

Final and live rendering intersect closed unit solids analytically. Local rays
retain world-distance parameters. Quadratics shift the origin toward closest
approach to avoid distant-ray cancellation; tips and exact box corners use stable
normal conventions. Every shadow, bounce and water ray sees the same geometry.
Primitives keep their own color/roughness instead of inheriting terrain geology.

Raster previews tessellate the same shapes (24 radial segments; 12 sphere bands).
Curved silhouettes approximate analytic final geometry. Raster lighting remains
approximate and does not cast object shadows; **Live lighting preview** uses the
same solid, shadow, lighting and water kernels as final rendering at up to 320 px.
Helper outlines/handles are separate 2D canvases and never enter either image.

Limits remain 64 entities and eight group ancestors, with at most 32 primitives
and four area lights. Local positions are ±128 units, rotations ±180°, local
scales 0.05–16, compounded world scales 0.01–64 and conservative world extents
±256 units. The maximum primitive preview is 16,896 triangles / **1,824,768 bytes**
(32 spheres). Analytic records require **3,072 bytes** for 32 primitives, plus a
96-byte empty placeholder when none exist. A bounded linear scan avoids mesh/BVH
dependencies. Main rendering uses eight storage bindings, within the existing
baseline device budget. Terrain and image buffers retain their separate limits.

Raster terrain and objects have separate reusable buffers. Object edits upload
only object vertices; the Objects list reuses its DOM during pose changes.
Object edits rebuild only the small preview object buffers, reuse the terrain
worker/heightfield, and invalidate lighting/final images when pixels change.
Selection, names and clipboard reads preserve a finished render.

## Original study and verification

[Shore observatory](site/assets/shore-observatory.lithosky) combines all four
shapes, a primitive group, a separate authored area light and lake reflections.
It is an imagined construction, not a claim of photographic landscape quality.
The product gallery includes the original still, its 16-sample live preview,
a rotated-group still and the workspace screenshot. All are app captures.

`tests/spatial.test.mjs` covers independent geometric cases, affine invariants,
reparenting, locks, ancestor deduplication, clipboard IDs, alignment, terrain
placement, budgets and cancel/redo. Shared Go/JS fixtures reject invalid v12
documents. Portable imported-heightmap and restart recovery tests include v12.
`tests/browser-solids.mjs` compares actual GPU hits/normals against CPU references
and checks traced shadows/material separation at the 32-object budget.
`tests/browser-spatial.mjs` exercises real handles, snapping, numeric/keyboard
routes, Undo/Escape, copy/paste, groups, file/recovery, PNG equality, WebGL editing
and compact touch layouts. The capture runner repeats these workflows and records
source, scene, image, device, memory and timing provenance:

```sh
node docs/capture/spatial-run.mjs http://127.0.0.1:PORT
```

Use disposable app/browser data and run GPU captures serially. The photographic
quality gate and native Windows/Linux release checks remain open.
