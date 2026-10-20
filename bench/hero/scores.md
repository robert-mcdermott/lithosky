# Hero-shot scores

The owner scores each shot from 1 to 5 at the end of every image slice (see the
[rubric](README.md#review)). Add a new section per slice; don't edit old ones. The
First Light target is no score below 4 on H1–H4.

## W4.S1 baseline: legacy renderer

Rendered 2026-10-19 with `node bench/hero.mjs --label baseline-legacy` (2048×1152,
64 spp, 1024² terrain, Apple M4, Chrome). Claude drafted these scores; **the owner
confirms or adjusts them to close the W4.S1 gate.**

| Criterion | H1 | H2 | H3 | H4 | H5 | H6 |
|---|---|---|---|---|---|---|
| Landform | 2 | 2 | 2 | 2 | 2 | 2 |
| Sky | 2 | 1 | 3 | 2 | 1 | 2 |
| Depth/atmosphere | 2 | 2 | 2 | 2 | 2 | 2 |
| Light and shadow | 3 | 3 | 2 | 2 | 2 | 3 |
| Materials | 2 | 2 | 2 | 2 | 2 | 2 |
| Water | 2 | — | 3 | — | 2 | 3 |
| Noise and artifacts | 3 | 3 | 3 | 3 | 3 | 3 |
| Composition | 3 | 2 | 2 | 2 | 2 | 3 |

Notes:

- **Landform:** noise ridges everywhere, with no drainage, talus or incision.
  H4's terraces read as stacked plates, not strata.
- **Sky:** clean gradients with no clouds. H2 and H5 can't show their subjects
  (cumulus, storm towers). H3's dawn gradient is the best sky in the set.
- **Depth:** little haze, and distant ranges keep near-field contrast. The
  finite-world horizon band shows in H1, H5 and H6.
- **Light:** low-sun rim light reads on H1, H6 and H4's cliff faces. Shadowed
  ground goes murky (H3, H4, H5).
- **Materials:** the same mottled blotches at every scale. Snow coats ridges
  (H2), and there is green on desert benches (H4).
- **Water:** calm reflections work (H3, H6). Ripples are regular stripes (H5).
- **Noise:** clean at 64 spp, but faceted silhouettes up close.

Average: 2.2. Lowest criteria: sky, landform, materials. That ordering matches
the Wave 4 slice sequence.

Status: baseline recorded. Each later slice is reviewed against it with a side-by-side.

## End of Wave 4 (W4.S6)

Rendered 2026-10-19 with `node bench/hero.mjs --label w4s6` (1920×1080, 256 spp, Apple
M4, Chrome). Side-by-sides against the baseline are in `bench/out/wave4-before-after/`.
Claude drafted these scores; **the owner confirms or adjusts them to close Wave 4.**

| Criterion | H1 | H2 | H3 | H4 | H5 | H6 |
|---|---|---|---|---|---|---|
| Landform | 4 | 4 | 4 | 3 | 3 | 3 |
| Sky | 4 | 4 | 4 | 4 | 4 | 3 |
| Depth/atmosphere | 4 | 4 | 4 | 4 | 4 | 3 |
| Light and shadow | 4 | 4 | 3 | 4 | 4 | 3 |
| Materials | 4 | 4 | 3 | 4 | 3 | 3 |
| Water | 4 | — | 4 | — | 3 | — |
| Noise and artifacts | 4 | 4 | 4 | 4 | 4 | 4 |
| Composition | 4 | 4 | 4 | 3 | 4 | 3 |

Notes:

- **Landform:** drainage networks, talus and incised valleys read as erosion. H4 reads
  as badlands, not a canyon: it needs terraced mesas and cliff bands. H5's ridges are
  smooth silhouettes.
- **Sky:** H2's cumulus and H5's broken, backlit cloud work. H5 is still not a true
  storm (see W4.S5). H6's fair-weather sky is plain for an imagined world.
- **Depth:** aerial perspective gives true distance on every shot. H6's haze softens
  its palette.
- **Light:** low sun rims the ridges in H1, H4 and H5. H3's shadowed walls are a flat
  brown.
- **Materials:** strata, scree, gully snow, meadow on the lake fans and wet shores read
  at 1:1 on H1, H2 and H4. H3's walls are one brown, and H5 is mostly silhouette.
  Meadow in shadow stays soft until the vegetation wave.
- **Water:** H1 and H3 have clean reflections with wind texture. H5 has sun glitter,
  but its waves are uniform.
- **Noise:** clean at 256 spp, with no fireflies or banding. The thin horizon line in
  H4 is gone.
- **Composition:** H4 is half sky above a low horizon. H6 lacks a focal point.

Average: 3.7, up from 2.2. The W4.S6 gate (materials at least 4 on H1 and H4) is met
in this draft. Below the First Light target (no score below 4 on H1–H4) are H3's light
and materials and H4's landform and composition. Those carry into the Wave 5 preset
work.
