# Hero shots

These six fixed compositions are the benchmark every slice is judged against (see
[the roadmap](../../ROADMAP.md#hero-shots)). Tests prove correctness; these images
prove progress.

| Preset | Shot | Aim |
|---|---|---|
| `H1` | Alpine lake, golden hour | Eroded peaks, warm rim light, blue shadowed valleys, a near-mirror lake, layered haze |
| `H2` | Snow peaks under cumulus | Snow in hollows and on lee slopes, bare rock on ridges, cumulus and cloud shadows |
| `H3` | Misty valley at dawn | Ridgelines fading into low fog, light shafts, a soft pastel sky |
| `H4` | Desert canyon at sunset | Stratified rock, talus, sand in washes, warm bounce light in the shadows |
| `H5` | Stormy coast | Storm towers with a low sun breaking through, wet rock, rough water |
| `H6` | Imagined world | An alien palette with coherent light, a second sun or a ringed planet |

The shots are the `H1`–`H6` entries in [web/scenes/presets.json](../../web/scenes/presets.json),
so they also appear in the app under **Start from**. Some aims (clouds, oceans, desert and
alien materials) wait for later slices. Keep each shot's composition stable so
side-by-sides stay comparable.

The W4.S1 baseline was rendered with the legacy renderer. Those images (in
`bench/out/baseline-legacy/`) and their scores in [scores.md](scores.md) are the "before"
picture.

## Rendering

```bash
go build -o bin/lithosky . && ./bin/lithosky --window=browser --no-open --port 8123
```

```bash
node bench/hero.mjs --url http://127.0.0.1:8123 --label w4s3
```

Each shot renders through the app's own export path at 1920 × 1080:

| Option | Effect |
|---|---|
| `--samples N` | Sets samples per pixel (default 256) |
| `--only H1,H3` | Renders a subset |

Output goes to the git-ignored `bench/out/<label>/`: one PNG per shot, `contact-sheet.png`
and `timings.json`. `node bench/compare.mjs --before <dir> --after <dir>` stacks two runs.
The scripts need Playwright and Chrome.

## Review

At the end of each image slice:

1. Render with the slice's label, for example `--label w4s3`.
2. Compare its contact sheet with the previous slice's.
3. Have the owner score every shot from 1 to 5 on the criteria below.
4. Record the scores in [scores.md](scores.md).

The slice's gate passes only when the owner accepts the images.

| Criterion | Ask |
|---|---|
| Landform | Do the mountains read as shaped by water, ice and gravity, or as noise? |
| Sky | Does the sky have color, gradation and, where intended, clouds? |
| Depth/atmosphere | Do near, middle and far separate through haze and contrast? |
| Light and shadow | Are highlights held, shadows lit by sky and bounce, and the sun direction readable? |
| Materials | Do rock, scree, snow, grass, sand and water read as themselves up close? |
| Water | Do reflection, transparency, shoreline and surface texture look right? |
| Noise and artifacts | Is it free of grain, facets, banding, seams and edge-of-world tells? |
| Composition | Does the frame lead the eye and feel intentional? |

1 means broken or absent, 3 means acceptable for a hobby renderer, and 5 means convincing
as a photograph or a finished painting. The First Light target is no score below 4 on H1–H4.
