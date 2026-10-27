# Licensing and provenance

Original Lithosky code, documentation, shaders and starter scenes are Apache-2.0. The
repository includes the complete license and the attribution notice.

## Third-party material

| Material | Source | Terms |
|---|---|---|
| AgX tone mapping (`web/wgsl/display/agx.wgsl`) | Ported from three.js; its contrast curve comes from Google Filament | MIT (three.js) and Apache-2.0 (Filament); NOTICE carries the text and credits |
| Sky LUTs, PCG hashes, orthonormal basis, droplet erosion, stream-power drainage | Implemented from the publications NOTICE lists | No code copied |
| Go runtime and standard library | Compiled into the binary | BSD-style terms in `third_party/GO-LICENSE`, embedded with LICENSE and NOTICE and printed by `lithosky --licenses`. The release builder checks the copy matches the toolchain, and the verifier checks every executable carries the notices |

There are no fonts, images, models, datasets or learned weights in the application. The
browser is supplied by the user and is not redistributed.

## Adding dependencies or assets

Before accepting a dependency or asset, record:

- its exact version or hash
- its source and SPDX license
- copyright, modifications and redistribution obligations
- transitive contents

Then:

- Prefer reviewed Apache-2.0, MIT, BSD, ISC or CC0 material, and preserve required
  notices in NOTICE.
- Never ship unknown, noncommercial, no-derivatives or incompatible copyleft material.
- Keep competitive notes in the ignored `product_research/` folder, and keep other
  products' names out of committed code, UI and docs.

References: [license text](https://www.apache.org/licenses/LICENSE-2.0) and
[third-party license policy](https://www.apache.org/legal/resolved.html).
