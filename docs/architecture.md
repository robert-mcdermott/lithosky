# Architecture decisions

## Runtime and ownership

One Go executable embeds the web frontend with `embed.FS`. Go's standard library
owns CLI parsing, a loopback HTTP listener and desktop launch. Native ES modules
own UI and scene state. WebGPU and WebGL preview backends plus a WebGPU compute tracer consume
the shared generated terrain. There is no package install, CDN, font download, remote asset or network
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

Preview remains a seeded raster fixture with altitude colors, direct lighting and
haze, drawn only when parameters, camera or viewport size change. W1.S3 adds a
bounded WebGPU compute kernel with grid traversal, sun/sky illumination, a simple
reflective/refractive water plane and progressive linear accumulation. It owns a
separate device and disposes its buffers at job end. Tile completion gates further
submission; every scene edit cancels and invalidates pending output. PNG uses the
same tone-mapped sRGB pixels as the displayed still. The v1 scene stays independent
of transient render options. See [rendering](rendering.md) for the algorithm,
resource budgets, approximations and reproducible GPU checks.

## Scene and project boundaries

Scene state is independent of the renderer. W1.S2 provides a validated versioned
`.lithosky` JSON schema, grouped undo/redo, browser open/download and persistent
recovery generations. Both validators consume the same embedded schema. See
[scene format and recovery](scene-format.md) for storage and failure semantics. Later asset containers must
bound expanded size, reject traversal/symlinks and migrate explicitly. Seeds
stabilize procedural generation; GPU images use numerical tolerances and record
renderer/browser/device/build, not a promise of universal bitwise equivalence.

## Local security

Bind only `127.0.0.1`, validate the exact Host and Origin, reject cross-site Fetch
Metadata, and serve embedded assets only. Content security policy permits local
scripts/styles/connects, forbids framing and external content. Recovery reads/writes
require a per-launch session token. Writes require an explicit same Origin,
bounded JSON body and a matching autosave revision. Storage uses a confined
directory and generated filenames; clients cannot pass paths. Named files are
opened/downloaded through the browser rather than an arbitrary-path server API.
Loopback HTTP is eligible as a trustworthy local context for WebGPU.
[Secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts).

## Product site

Generate static HTML from repository-owned content and layouts, with locally
stored assets and screenshots captured from the real app. Keep output outside
source; validate links, anchors, images and release references. Build before
publication and never advertise planned functionality as shipped. W1.S4 implements this in `docs/site/` with capture provenance in `docs/capture/`.
The standard-library archive builder/verifier lives in `tools/release/`; native
smoke CI precedes package artifacts. Site deployment and release publication remain
separate from generation. See [release readiness](releases.md).
