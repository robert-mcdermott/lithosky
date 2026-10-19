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

Status: draft, awaiting owner review.
