// SPDX-License-Identifier: Apache-2.0
// Screenshots of the studio layout at the review sizes, for studio slice sign-offs.
//
//   go build -o bin/lithosky . && ./bin/lithosky --window=browser --no-open --port 8123
//   node bench/ui.mjs --url http://127.0.0.1:8123 [--label w5s1] [--sizes 1440x900,2560x1440]
//                     [--lab sky] [--settle 6]
//
// Opens the studio at each size, optionally opens a lab, lets the view refine for --settle
// seconds and writes <label>/<width>x<height>[-<lab>].png under bench/out/ (git-ignored).
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
    if (lab) {
      await page.evaluate(id => window.lithosky.openLab?.(id), lab);
    }
    await page.waitForTimeout(settle * 1000);
    const file = path.join(outDir, `${width}x${height}${lab ? `-${lab}` : ''}.png`);
    await page.screenshot({ path: file });
    console.log(`wrote ${file}`);
    await page.close();
  }
} finally {
  await browser.close();
}
