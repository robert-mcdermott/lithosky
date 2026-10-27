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

## W5.S4: preset pack and visual gaps

Rendered 2026-10-22 with `node bench/hero.mjs --label w5s4` (1920×1080, 256 spp, Apple
M4, Chrome). The side-by-side against the end of Wave 4 is in `bench/out/w5s4/compare/`.
Claude drafted these scores; **the owner confirms or adjusts them and signs off the
presets.**

| Criterion | H1 | H2 | H3 | H4 | H5 | H6 |
|---|---|---|---|---|---|---|
| Landform | 4 | 4 | 4 | 5 | 3 | 3 |
| Sky | 4 | 4 | 4 | 4 | 4 | 3 |
| Depth/atmosphere | 4 | 4 | 4 | 4 | 4 | 3 |
| Light and shadow | 4 | 4 | 4 | 4 | 5 | 3 |
| Materials | 4 | 4 | 3 | 4 | 3 | 3 |
| Water | 4 | — | 4 | 4 | 4 | — |
| Noise and artifacts | 4 | 4 | 4 | 4 | 4 | 4 |
| Composition | 4 | 4 | 4 | 4 | 4 | 3 |

Notes:

- **H4** is now canyon country: stepped mesa walls framing a winding river, rims lit by
  the low sun, and a skyline of distant ranges. Benches show small ledges.
- **H5:** backlit storm towers and a dark cloud base overhead, with sun shafts.
- **H3:** cool blue shadows, a dawn-lit east wall and lit peaks. The walls are still
  mostly bare rock.
- **H6** is unchanged. It could use the new sky colour, or become the red planet.

New presets (drafts for the owner's sign-off):

| Preset | Draft |
|---|---|
| Canyon at dawn | Strong: lit mesa rims and a gorge. A little busy |
| Thunderhead | A towering cell with a small anvil, golden light. The land is dark |
| Red planet | A butterscotch sky over red, folded strata. Reads as another world |
| Winter fjord | Snow to the water, a lit peak, clean reflections |
| Forest lake, morning | Pleasant, but cool and fairly flat |
| Mesas | A layered mesa wall in afternoon light, strong banding |

Average H1–H6: 3.8, up from 3.7. Below the First Light target (no score below 4 on
H1–H4): H3 materials.

## W6.S2: forests

Rendered 2026-10-25 with `node bench/hero.mjs --label w6s2 --only H1,H2,H3,H4,H5,H6,forest-lake`
(1920×1080, 256 spp, Apple M4, Chrome). 1:1 side-by-sides against W5.S4 for H1 and H3
are in `bench/out/w6s2/compare/`. Claude drafted these scores; **the owner confirms or
adjusts them to close the W6.S2 gate.**

| Criterion | H1 | H2 | H3 | H4 | H5 | H6 |
|---|---|---|---|---|---|---|
| Landform | 4 | 4 | 4 | 5 | 3 | 3 |
| Sky | 4 | 4 | 4 | 4 | 4 | 3 |
| Depth/atmosphere | 4 | 4 | 4 | 4 | 4 | 3 |
| Light and shadow | 4 | 4 | 4 | 4 | 5 | 3 |
| Materials | 5 | 4 | 4 | 4 | 3 | 3 |
| Water | 4 | — | 4 | 4 | 4 | — |
| Noise and artifacts | 4 | 4 | 4 | 4 | 4 | 4 |
| Composition | 4 | 4 | 4 | 4 | 4 | 3 |

Notes:

- **H3:** the lower walls on both sides are forest down to the shore. At 1:1 they are
  individual conifers in stands broken by clearings and rock, where they were flat dark
  ground. The upper walls stay bare rock above the tree line. Materials: 3 → 4.
- **H1:** the lakeside floor and lower slopes carry forest with cast shadows in the low
  sun. The right shore keeps a meadow strip. Materials: 4 → 5.
- **H2, H4, H5:** no visible change (H2's slopes are above the tree line, H4 is
  desert, H5 is arctic).
- **H6:** the Imagined biome's magenta broadleaf canopy now reads as a forest of
  separate crowns.
- **Forest lake:** forested slopes with spiky conifer silhouettes on the ridgelines.

Average H1–H6: 3.9, up from 3.8. No score is below 4 on H1–H4: the First Light target is
met in this draft.

## W6.S4: grass and shrubs

Rendered 2026-10-26 with `node bench/hero.mjs --label w6s4 --only H1,H2,H3,H4,H5,H6,forest-lake,meadow`
(1920×1080, 256 spp, Apple M4, Chrome). The hero shots look as in W6.S2, because their
cameras are too high for traced grass, and the scores are unchanged. The slice's gate is
the new **Meadow, evening** preset. Its 1:1 crops are
`bench/out/w6s4/compare/meadow-foreground-1to1.png` and `meadow-middle-1to1.png`.
**The owner judges whether the foreground reads as grass.**

Draft notes on Meadow, evening:

- Backlit grass glows through the tussocks, and blade strands show in the lowest rows.
- Long shadows of the shoreline conifers fall across the meadow.
- The conifers read well as silhouettes against the lake. Close trees on the left are
  blotchy (a W6.S5 item).


## W6.S6: release v0.6.0

Rendered 2026-10-26 with `node bench/hero.mjs --label w6s6 --only H1,H2,H3,H4,H5,H6,forest-lake,meadow`
(1920×1080, 256 spp, Apple M4, Chrome), with all of Wave 6 (0.6.0). Claude drafted
these scores; **the owner confirms or adjusts them to close Wave 6.**

| Criterion | H1 | H2 | H3 | H4 | H5 | H6 |
|---|---|---|---|---|---|---|
| Landform | 4 | 4 | 4 | 5 | 3 | 3 |
| Sky | 4 | 4 | 4 | 4 | 4 | 3 |
| Depth/atmosphere | 4 | 4 | 4 | 4 | 4 | 3 |
| Light and shadow | 4 | 4 | 4 | 4 | 5 | 3 |
| Materials | 5 | 4 | 4 | 4 | 3 | 3 |
| Water | 4 | — | 4 | 4 | 4 | — |
| Noise and artifacts | 4 | 4 | 4 | 4 | 4 | 4 |
| Composition | 4 | 4 | 4 | 4 | 4 | 3 |

Notes:

- **H1–H4** look as they did in W6.S2. Their cameras are too far from the ground for the
  traced grass (W6.S4) and leaves (W6.S5). Stands, clearings and shadows match W6.S2 at
  1:1, apart from the small shifts every terrain build makes.
- **Meadow, evening:** the near conifers on the left now show tiers of branches instead
  of the blotchy clumps noted in W6.S4. Some mid-distance conifer tips look stippled
  against the bright sky, where the leaves take over from the clumps.
- **H5 and H6** keep their 3s. They're outside the gate and wait for oceans (H5) and
  imagined worlds (H6) after Wave 6.

Average H1–H6: 3.9, unchanged. No score is below 4 on H1–H4: the First Light target, and
this slice's gate, are met in this draft.
