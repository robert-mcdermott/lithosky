// SPDX-License-Identifier: Apache-2.0
// Screenshots of the studio layout at the review sizes, for studio slice sign-offs.
//
//   go build -o bin/lithosky . && ./bin/lithosky --window=browser --no-open --port 8123
//   node bench/ui.mjs --url http://127.0.0.1:8123 [--label w5s1] [--sizes 1440x900,2560x1440]
//                     [--lab sky] [--aspect 4:5] [--guides thirds] [--welcome] [--settle 6]
//
// Opens the studio at each size, optionally sets the image shape and guides and opens a lab,
// lets the view refine for --settle seconds and writes <label>/<width>x<height>[-<name>].png
// under bench/out/ (git-ignored). The first-run welcome is dismissed unless --welcome.
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
const label = option('label', 'ui');
const lab = option('lab', '');
const aspect = option('aspect', '');
const guides = option('guides', '');
const welcome = process.argv.includes('--welcome');
const suffix = [lab, aspect.replace(':', 'x'), guides, welcome ? 'welcome' : ''].filter(Boolean).join('-');
const settle = Number(option('settle', 6));
const sizes = option('sizes', '1440x900,2560x1440')
  .split(',')
  .map(size => size.split('x').map(Number));
const outDir = path.resolve('bench/out', label);
fs.mkdirSync(outDir, { recursive: true });

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
try {
  for (const [width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', error => console.log('[studio error]', error.message));
    await page.goto(`${base}/`);
    await page.waitForFunction(() => window.lithosky?.renderer, null, { timeout: 60000 });
    await page.waitForFunction(() => !window.lithosky.renderer.stats.building, null, { timeout: 120000, polling: 250 });
    if (!welcome) {
      await page.evaluate(() => window.lithosky.dismissWelcome?.());
    }
    if (aspect) {
      await page.evaluate(shape => {
        const scene = structuredClone(window.lithosky.scene);
        scene.image.aspect = shape;
        window.lithosky.open(scene);
      }, aspect);
    }
    if (guides) {
      await page.evaluate(mode => window.lithosky.setGuides?.(mode), guides);
    }
    if (lab) {
      await page.evaluate(id => window.lithosky.openLab?.(id), lab);
    }
    await page.waitForTimeout(settle * 1000);
    const file = path.join(outDir, `${width}x${height}${suffix ? `-${suffix}` : ''}.png`);
    await page.screenshot({ path: file });
    console.log(`wrote ${file}`);
    await page.close();
  }
} finally {
  await browser.close();
}
