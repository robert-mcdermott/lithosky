// SPDX-License-Identifier: Apache-2.0
// Renders the Scenes gallery thumbnails: every preset in web/scenes/presets.json through the
// studio's own export path, saved as web/scenes/thumbnails/<id>.jpg (shipped with the app).
//
//   go build -o bin/lithosky . && ./bin/lithosky --window=browser --no-open --port 8123
//   node bench/thumbnails.mjs --url http://127.0.0.1:8123 [--only H1,H3] [--samples 256]
//
// Rebuild the binary afterwards so it embeds the new images. Needs Playwright and Chrome.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    return require(path.join(globalRoot, 'playwright'));
  }
}

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const base = option('url', 'http://127.0.0.1:8123');
const samples = Number(option('samples', 256));
const only = option('only', '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);
// Twice the gallery tile's width, for sharp tiles on high-density displays.
const LONG_EDGE = 480;
const outDir = path.resolve('web/scenes/thumbnails');
fs.mkdirSync(outDir, { recursive: true });

const presets = JSON.parse(fs.readFileSync('web/scenes/presets.json', 'utf8'))
  .filter(preset => only.length === 0 || only.includes(preset.id));

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
try {
  // A 16:9 viewport, so thumbnails match the gallery tiles.
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', error => console.log('[studio error]', error.message));
  await page.goto(`${base}/`);
  await page.waitForFunction(() => window.lithosky?.renderer, null, { timeout: 60000 });
  for (const preset of presets) {
    await page.evaluate(scene => window.lithosky.open(scene), preset.scene);
    await page.waitForTimeout(200);
    await page.waitForFunction(() => !window.lithosky.renderer.terrain.busy && !window.lithosky.renderer.stats.building,
      null, { timeout: 120000, polling: 250 });
    const dataUrl = await page.evaluate(async ({ longEdge, count }) => {
      const blob = await window.lithosky.renderer.capture({ longEdge, samples: count, type: 'image/jpeg', quality: 0.86 });
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    }, { longEdge: LONG_EDGE, count: samples });
    const file = path.join(outDir, `${preset.id}.jpg`);
    fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`wrote ${path.relative(process.cwd(), file)} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
  }
} finally {
  await browser.close();
}
