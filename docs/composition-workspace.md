# Composition workspace

Wave 3 slice 9 adds a full authoring route: start blank, place primitives, shape
and paint terrain, assign finishes, compose through a camera, and save/reopen
both the scene and the rendered image. All examples and material definitions are
original. The photographic landscape acceptance gate remains open.

## Choose a starting point

**Start with a scene** and the Scenes library include three authoring templates:

- **Blank studio** starts with hidden flat terrain and hidden water. Add objects
  at the aim target or Place in view on the Y=0 working plane. Terrain, water,
  lighting and the render camera remain available in Objects.
- **Terrain canvas** starts with flat, visible, layered terrain. Raise, lower,
  smooth or flatten it with Sculpt terrain, then paint broad material regions.
- **Stone garden** combines original forms, assigned rock finishes, painted
  ground, an authored light and a camera bookmark. Every part remains editable.

Choosing a template replaces the document in one Undo step. Generating a new seed,
editing layers, sculpting and painting preserve unrelated placed objects, groups,
material assignments and camera bookmarks. Existing templates/studies and v1–v12
files remain supported and retain their rendering models.

## Work in editor views

**Editor view** offers Render camera, Perspective editor, Top (XZ), Front (XY)
and Side (ZY). The last three use orthographic projection: parallel edges stay
parallel. Picking, placement, object handles, outlines, sculpting and painting
use the same editor projection as the raster image, in WebGPU and WebGL.

**Render camera** retains the earlier behavior: navigation edits the saved active
camera, with Undo. Every other view is temporary editor state. Navigation there
changes neither the saved camera nor scene history and preserves an existing
finished image for export. Drag to orbit in Perspective editor; Shift-drag pans.
Drag pans in orthographic views. Scroll zooms; arrow keys pan; +/− zoom. Escape
cancels an editor navigation drag and restores its starting view.

Select visible geometry and choose **Frame selection** or focus the view and
press **F**. This opens/adjusts an editor view around the selection without
changing the render camera. **Use this view for render** copies a perspective
editor composition to the active camera in one Undo step. Orthographic views are
editing aids and cannot be saved as render cameras. The active camera keeps the
existing perspective/thin-lens model and its validated pose/lens limits.

Rendering, Show render, focus picking and region selection return to the Render
camera. Live lighting runs from that camera; it pauses while a separate editor
view is active. Editor guides and selection helpers never enter live/final pixels
or PNG export. A view switch can stop an in-progress render; a completed image
remains exportable until a scene or render-setting edit invalidates it.

## Save camera bookmarks

Expand **Camera bookmarks**, enter a name, and choose **Save camera bookmark**.
A bookmark is a named snapshot of the current perspective camera, including lens,
focus and framing. Up to eight snapshots are stored in the scene.

Choose a Saved camera and **Use for render** to copy its snapshot to the active
render camera. **Replace bookmark** stores the current camera and entered name
in that snapshot. **Delete bookmark** removes it; Undo restores it. Snapshots
are deliberately independent: editing the active camera does not silently change
a previously saved bookmark. A locked render camera rejects Apply/Use commands;
bookmark management does not alter the camera itself.

## Assign object materials

Select primitives or groups containing primitives, then use **Object material**
in Controls. Choose Solid dielectric, Stratified rock, Snow, Sandstone or Earth.
Changing the finish assigns its original default tint/roughness; subsequent edits
change only the chosen property. A multi-selection applies that property to all
selected primitives. For a mixed selection the fields initially show the first
primitive’s values. Locks on any affected primitive reject the whole command.

**Material tint** is shown as sRGB and converted to linear reflectance for
rendering. For procedural finishes it multiplies the original surface colors.
**Object roughness**, **Object feature scale** and **Object color detail** control
that object's appearance. Geological color, filtered bump normals and roughness
are evaluated at actual ray hits in live/final rendering, including secondary and
water rays. Raster previews show broad seeded color variation with approximate
lighting. Patterns use world coordinates; moving an object can change the part
of the procedural pattern covering it. These are opaque dielectric finishes;
transparency, metals, mesh UVs and arbitrary shader graphs are outside this slice.

## Paint terrain materials

Select Terrain or clear the selection, show the terrain, and choose a **Material
brush**: rock, snow, sand, ground or Erase to terrain rules. Drag on land and
release to apply one stroke. Escape, pointer loss, focus loss or resizing cancels
an unfinished stroke. Radius and strength determine broad, soft material regions.
Use Brush X/Z and **Apply material brush**, or arrow keys and Space/Enter with
the view focused, for a keyboard/numeric route. Clear terrain paint is undoable.

Paint blends over height/slope rules or the selected base preset. Erasing restores
those rules; it does not remove terrain geometry. Painting enables geological
surfaces as needed. Using simple surfaces explicitly removes paint, in the same
Undo step. Paint uses world XZ coordinates, so it follows the land after sculpting,
heightmap changes or regeneration. It does not paint objects or water. The brush
picks terrain directly; switch to a top view when other scene surfaces obscure it.

Saved data contains at most 32 vector strokes, 32 points per stroke and 512 points
total. Continuous segments have a smooth radial falloff. The derived 64 × 64
four-channel mask is bilinearly sampled by both CPU preview and GPU ray shading.
It occupies 65,536 bytes in a second uniform binding; the renderer retains eight
storage bindings. This is a broad art-direction mask, not a fine texture-painting
system. Color, bump and roughness use the same painted material weights. Dense
mask pixels are derived rather than embedded in files, history or recovery.

## Files and validation

The first bookmark/material/paint command upgrades the document to v13 in its
own Undo step. v13 extends v12 with camera snapshot records, optional primitive
finish definitions and optional terrain paint strokes. Each component and assigned
value has one owner. Unknown fields, invalid bookmark IDs/names, unsupported
finishes, out-of-bounds strokes and excess budgets are rejected by Go and JS.
The existing 128 KiB document, 4 MiB history and portable heightmap budgets apply.

Original authoring captures and the downloadable Stone garden scene are in the
product gallery. `tests/composition.test.mjs` checks projection/ray invariants,
framing, normalized/erased masks, cache reuse, snapshots, locks and compatibility.
Shared fixtures exercise both validators; portable asset and restart recovery
checks include v13. `tests/browser-workspace.mjs` exercises the complete UI route;
`tests/browser-authoring.mjs` compares actual GPU masks and finishes to CPU values.
The capture runner records source/scene/image hashes and actual device results.
Native Windows/Linux release validation and the photographic quality gate remain
open; editor completeness does not close either gate.
