# Architecture decisions

## Runtime and ownership

One Go executable embeds the web frontend with `embed.FS`. Go's standard library
owns CLI parsing, a loopback HTTP listener and desktop launch. Native ES modules
own UI and scene state. Two small renderer backends consume the same generated
geometry. There is no package install, CDN, font download, remote asset or network
service at runtime. The installed browser and OS graphics driver remain runtime
prerequisites; a single binary does not bundle a browser.

Default launch uses an installed compatible browser's app-window mode with a
separate temporary profile. Its process is waited on, then the server shuts down
and the profile is removed. Missing app-window support produces a useful error;
`--window=browser` explicitly opts into the ordinary default browser. `--no-open`
serves until interrupted. Each launch chooses an ephemeral loopback port, so
instances do not fight over a fixed port or share profiles. Native window wrappers
would add platform runtime and build dependencies and are deferred.

## Rendering

WebGPU offers compute pipelines, storage buffers and explicit resource control,
which suit progressive tracing, erosion, volume integration and future ocean
simulation. This is an architectural advantage, not an unconditional speedup.
[WebGPU API documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API).

WebGL 2 supplies a broadly supported raster preview. A fragment-shader tracer is
possible, but maintaining final-render feature parity in two shader languages is
outside the initial scope. Separate WGSL and GLSL programs use common scene data.
[WebGL 2 API documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext).

Do not assume ray-tracing hardware is exposed by browser WebGPU. Plan software
intersection and acceleration; the standards discussion remains separate from
native backend extensions. [Ray-tracing proposal](https://github.com/gpuweb/gpuweb/issues/535).

Selection is WebGPU → WebGL 2 → an explanatory no-GPU state. A fresh canvas is
used per attempt because a canvas cannot switch context types. Selection must
survive missing API, null adapter, rejected device, pipeline failure and runtime
loss. Keep editable state on the CPU. Bound recovery; offer explicit retry after
falling back. [Adapter requests](https://developer.mozilla.org/en-US/docs/Web/API/GPU/requestAdapter)
and [device loss](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost).

W1.S1 is a seeded raster fixture with altitude colors, direct lighting and haze.
It is intentionally not a physical atmosphere or a ray tracer. Rendering occurs
only when parameters, camera or viewport size change. There is no idle render
loop. Future tracer resources belong to the backend, with explicit disposal and
accumulation invalidation on scene changes. Start with a bounded simple kernel;
measure before splitting work into wavefront queues.

## Scene and project boundaries

Scene state is independent of the renderer. W1.S2 adds a validated versioned
`.lithosky` JSON schema, undo and atomic save/recovery. Later asset containers must
bound expanded size, reject traversal/symlinks and migrate explicitly. Seeds
stabilize procedural generation; GPU images use numerical tolerances and record
renderer/browser/device/build, not a promise of universal bitwise equivalence.

## Local security

Bind only `127.0.0.1`, validate the exact Host and Origin, reject cross-site Fetch
Metadata, and serve embedded assets only. Content security policy permits local
scripts/styles/connects, forbids framing and external content. The foundation API
is read-only build information. Before file writes or automation in W1.S2, add
per-launch authenticated sessions, request size limits and scoped file access.
Loopback HTTP is eligible as a trustworthy local context for WebGPU.
[Secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts).

## Product site

Generate static HTML from repository-owned content and layouts, with locally
stored assets and screenshots captured from the real app. Keep output outside
source; validate links, anchors, images and release references. Build before
publication and never advertise planned functionality as shipped. W1.S4 owns
initial implementation and release distribution. No unrelated hosting service is
needed for this repository-based workflow.
