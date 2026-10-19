# Product website

The original static product site is generated from this directory. Source is
committed with the app; generated output belongs under ignored `dist/site/` or
an explicitly selected external build directory. This task does not publish a
site or claim that a binary release exists.

```sh
npm run site
npm run site:check
npm run site:serve
```

Open the printed loopback URL (default port 8124). No dependencies or npm install
are needed. `node docs/site/build.mjs /tmp/lithosky-site` selects another output.
The generator refuses to overwrite an unrecognized directory and refuses repo
output outside `dist/`. A recognized generated directory is replaced as a unit
only after the new build passes validation. Do not put hand-edited files there.

- `pages/`: landing, install, guide and gallery content fragments.
- `assets/site.css`: original styling; system fonts, no remote assets or scripts.
- `assets/*.png`: actual unretouched image exports and an application screenshot.
- `assets/*.lithosky`: scene files exported by the app for the same captures.
- `assets/captures.json`: scene settings, dimensions, sample counts, build version,
  browser, capture date and SHA-256 provenance.
- `build.mjs`: layout, navigation, catalog-driven gallery, asset copy and checks.
- `check.mjs`: local links, anchors, images, duplicate IDs and subpath-safe URLs.

The site version comes from `main.go`; the canonical starter catalog is
`web/scenes/studies.json`. Generated relative links support either domain-root
hosting or a project subpath. No canonical public hostname is assumed.

## Refresh captures

Use an installed Chrome and Playwright CLI as development tools. Build the app,
run it with disposable recovery data, and pass its loopback URL to the capture
runner:

```sh
go build -trimpath -o /tmp/lithosky-capture .
/tmp/lithosky-capture --no-open --data-dir /tmp/lithosky-capture-data
# In another terminal, substitute the printed port:
node docs/capture/run.mjs http://127.0.0.1:PORT
```

Set `PLAYWRIGHT_CLI=/absolute/path/to/playwright-cli` if it is not on PATH. The
runner owns and closes its isolated browser session; stop the app server after
capture. Windows users can build a temporary `.exe` and use local temporary paths.

Capture uses the real study picker, Render image, Export PNG and Save scene
controls at 960 × 540 and 64 samples. It also captures the studio. The runner
compares served assets with the checkout before rendering and refuses a stale
embedded binary. It verifies downloaded scene settings and records hashes; the
site build rejects stale source, mismatched scenes or changed image bytes.
Captures must be refreshed after changes to the listed app/render sources or
version. Gallery images may differ numerically across GPUs.

The original heightmap examples are generated with `go run ./tools/examples`.
They are data downloads, separate from the three render captures.

All captures are original Lithosky procedural content under Apache-2.0. No stock,
generated promotional imagery, third-party fonts or copied reference-app assets
are used. The hero crops a real export in CSS; full exports are linked in the
gallery. CSS study swatches in the app are illustrations, not renderer captures.

## Validate and publish later

`npm test` includes generation and broken-link/anchor guards. The Playwright CLI
callback `tests/browser-site.mjs` checks all pages at desktop/mobile sizes,
keyboard navigation, scene download, image loading and same-origin assets.
Open the generated site in a CLI session and pass this file to `run-code`, as in
the rendering validation instructions in `../rendering.md`.

For publication, copy only the validated contents of `dist/site/` into a separate
site deployment checkout (for example a `gh-pages` branch). Review that diff
before committing/pushing it. Preserve `.nojekyll`. Do not publish the source
checkout, private research, recovery data or release artifacts as website files.
The packaging workflow uploads a site artifact for review; it never deploys it.
Before advertising a release, update the install page and changelog to the actual
published status, refresh captures if necessary, and rerun validation.

The guide also offers the original `assets/daylight.lithosky` v6 atmosphere scene.
It is checked against the shared scene schema by the site test. The three gallery starters now use the current v9 models, including physical
atmosphere and lake optics. Older downloadable comparison scenes retain their
explicit models.

The gallery also includes an original final-terrain detail comparison. After
rebuilding the app, run `node docs/capture/detail-run.mjs http://127.0.0.1:PORT`
(with `PLAYWRIGHT_CLI` pointing to an installed CLI). It checks CPU/GPU intersections
at four tiers, preparation cancellation and scene-edit invalidation, then exports
identical-camera 128²/512²/1024² images and `terrain-captures.json`. Site builds
verify source/scene/image hashes and image dimensions; rerun this capture after
render-affecting sources change. Scene files do not store transient render tiers.

Geological material comparisons use `docs/capture/material-run.mjs` with the same
isolated app/CLI workflow. It captures matching landscape views, rock/ground/snow
reference views and unscaled 256×128 crops, verifies saved scene content, and runs
actual CPU/GPU material probes. Builds validate source/scene/image provenance in
`material-captures.json`; rerun all capture commands after render sources
change. The original Weathered highlands scene uses opt-in v7 surfaces.

Lake comparisons use `node docs/capture/water-run.mjs http://127.0.0.1:PORT`.
The Silver basin v9 scene provides classic/calm/ripple/clear/grazing exports and
a 256-sample comparison. The source/scene/image hashes, settings, device/timings
and real GPU water probes are verified by the site builder.
