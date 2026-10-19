# Hero shots

These six fixed compositions are the benchmark every slice is judged against (see
[the roadmap](../../ROADMAP.md#hero-shots)). Tests prove correctness; these images
prove progress.

| File | Shot | Aim |
|---|---|---|
| `H1-alpine-lake-golden-hour.lithosky` | Alpine lake, golden hour | Eroded peaks, warm rim light, blue shadowed valleys, a near-mirror lake, layered haze |
| `H2-snow-peaks-cumulus.lithosky` | Snow peaks under cumulus | Snow in hollows and on lee slopes, bare rock on ridges, cumulus and cloud shadows |
| `H3-misty-valley-dawn.lithosky` | Misty valley at dawn | Ridgelines fading into low fog, light shafts, a soft pastel sky |
| `H4-desert-canyon-sunset.lithosky` | Desert canyon at sunset | Stratified rock, talus, sand in washes, warm bounce light in the shadows |
| `H5-stormy-coast.lithosky` | Stormy coast | Storm towers with a low sun breaking through, wet rock, rough water |
| `H6-imagined-world.lithosky` | Imagined world | An alien palette with coherent light, a second sun or a ringed planet |

The current files are v10 scenes for the legacy renderer. Their terrain and cameras come
from the curated Wave 3 studies, and sun, haze and surfaces are set toward each shot. The
legacy renderer has no clouds, fog volumes or erosion, so H2, H3 and H5 can only
approximate their aims. When W4.S3 replaces the renderer, re-author each shot in the new
scene format with the same intent. Keep each shot's composition stable after that, so
side-by-sides stay comparable.

## Rendering

```bash
go build -o bin/lithosky . && ./bin/lithosky --window=browser --no-open --port 8123
```

```bash
node bench/hero.mjs --url http://127.0.0.1:8123 --label baseline-legacy
```

| Option | Effect |
|---|---|
| (default) | 2048 px long edge, 64 spp, 1024² terrain; about a minute per shot with the legacy renderer |
| `--quick` | 960 px, 16 spp, 512² terrain, for framing |
| `--only H1,H3` | Render a subset |

Output goes to the git-ignored `bench/out/<label>/`: one PNG per shot, `contact-sheet.png`
and `timings.json`. The harness needs Playwright and Chrome.

## Review

At the end of each image slice:

1. Render with the slice's label, for example `--label w4s2`.
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
