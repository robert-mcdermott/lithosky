// SPDX-License-Identifier: Apache-2.0
// Renders the product site's gallery: the built-in scenes through the studio's own export
// path, saved as site/gallery/<id>.jpg, plus a larger hero image.
//
//   go build -o bin/lithosky . && ./bin/lithosky --window=browser --no-open --port 8123
//   node bench/gallery.mjs --url http://127.0.0.1:8123 [--only H4,red-planet] [--samples 512]
//
// Needs Playwright and Chrome.

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
const samples = Number(option('samples', 512));
const only = option('only', '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);
const LONG_EDGE = 1600;
// The hero image at the top of the page, and its size.
const HERO = { id: 'H4', longEdge: 2400 };
const SKIP = new Set(['overview']);
const outDir = path.resolve('site/gallery');
fs.mkdirSync(outDir, { recursive: true });

const presets = JSON.parse(fs.readFileSync('web/scenes/presets.json', 'utf8'))
  .filter(preset => !SKIP.has(preset.id))
  .filter(preset => only.length === 0 || only.includes(preset.id));

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', error => console.log('[studio error]', error.message));
  await page.goto(`${base}/`);
  await page.waitForFunction(() => window.lithosky?.renderer, null, { timeout: 60000 });
  const save = async (file, longEdge) => {
    const dataUrl = await page.evaluate(async ({ size, count }) => {
      const blob = await window.lithosky.renderer.capture({ longEdge: size, samples: count, type: 'image/jpeg', quality: 0.88 });
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    }, { size: longEdge, count: samples });
    fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`wrote ${path.relative(process.cwd(), file)} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
  };
  for (const preset of presets) {
    await page.evaluate(scene => window.lithosky.open(scene), preset.scene);
    await page.waitForTimeout(200);
    await page.waitForFunction(() => !window.lithosky.renderer.terrain.busy && !window.lithosky.renderer.stats.building,
      null, { timeout: 120000, polling: 250 });
    await save(path.join(outDir, `${preset.id}.jpg`), LONG_EDGE);
    if (preset.id === HERO.id) {
      await save(path.join(outDir, 'hero.jpg'), HERO.longEdge);
    }
  }
} finally {
  await browser.close();
}
