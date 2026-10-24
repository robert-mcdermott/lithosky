// SPDX-License-Identifier: Apache-2.0
// Renders the hero shots (the H1–H6 presets in web/scenes/presets.json) through the studio's
// own export path and composes a contact sheet for slice reviews.
//
//   go build -o bin/lithosky . && ./bin/lithosky --window=browser --no-open --port 8123
//   node bench/hero.mjs --url http://127.0.0.1:8123 [--label w4s3] [--samples 256] [--only H1,H3|all]
//
// Each shot renders at 1920 px wide with --samples samples (default 256). Writes PNGs,
// contact-sheet.png and timings.json to bench/out/<label>/ (git-ignored). Needs Playwright
// and Chrome.

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
const label = option('label', 'hero');
const samples = Number(option('samples', 256));
const only = option('only', '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);
const outDir = path.resolve('bench/out', label);
fs.mkdirSync(outDir, { recursive: true });

// The hero shots by default; --only picks any presets by id (all for every preset).
const presets = JSON.parse(fs.readFileSync('web/scenes/presets.json', 'utf8'))
  .filter(preset => (only.length === 0 ? /^H\d$/.test(preset.id) : only.includes('all') || only.includes(preset.id)));

async function openStudio(browser) {
  // A 16:9 viewport, so exports come out 1920 x 1080.
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', error => console.log('[studio error]', error.message));
  page.on('console', message => {
    if (message.type() === 'error') {
      console.log('[studio console]', message.text());
    }
  });
  await page.goto(`${base}/`);
  await page.waitForFunction(() => window.lithosky?.renderer, null, { timeout: 60000 });
  return page;
}

async function renderPreset(page, preset) {
  const buildStart = Date.now();
  await page.evaluate(scene => window.lithosky.open(scene), preset.scene);
  const built = () => {
    const stats = window.lithosky.renderer.stats;
    return !window.lithosky.renderer.terrain.busy && !stats.building;
  };
  await page.waitForTimeout(200);
  await page.waitForFunction(built, null, { timeout: 120000, polling: 250 });
  const buildSeconds = (Date.now() - buildStart) / 1000;
  const renderStart = Date.now();
  const dataUrl = await page.evaluate(async count => {
    const blob = await window.lithosky.renderer.capture({ longEdge: 1920, samples: count });
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }, samples);
  const renderSeconds = (Date.now() - renderStart) / 1000;
  return { dataUrl, buildSeconds, renderSeconds };
}

// Three columns by two rows of 960x540 tiles, each labelled with its shot name.
async function composeContactSheet(browser, shots) {
  const page = await browser.newPage();
  const tiles = shots.map(shot => ({
    title: `${shot.id} ${shot.name}`,
    url: `data:image/png;base64,${fs.readFileSync(shot.file).toString('base64')}`,
  }));
  const dataUrl = await page.evaluate(async items => {
    const columns = 3;
    const width = 960;
    const height = 540;
    const canvas = document.createElement('canvas');
    canvas.width = columns * width;
    canvas.height = Math.ceil(items.length / columns) * height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#111';
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (const [index, item] of items.entries()) {
      const image = new Image();
      image.src = item.url;
      await image.decode();
      const x = (index % columns) * width;
      const y = Math.floor(index / columns) * height;
      context.drawImage(image, x, y, width, height);
      context.fillStyle = 'rgba(0, 0, 0, 0.55)';
      context.fillRect(x, y, width, 40);
      context.fillStyle = '#fff';
      context.font = '600 22px system-ui, sans-serif';
      context.fillText(item.title, x + 14, y + 28);
    }
    return canvas.toDataURL('image/png');
  }, tiles);
  await page.close();
  const file = path.join(outDir, 'contact-sheet.png');
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return file;
}

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
const report = { date: new Date().toISOString(), base, label, samples, shots: [] };
try {
  const page = await openStudio(browser);
  for (const preset of presets) {
    const result = await renderPreset(page, preset);
    const file = path.join(outDir, `${preset.id}.png`);
    fs.writeFileSync(file, Buffer.from(result.dataUrl.split(',')[1], 'base64'));
    report.shots.push({
      id: preset.id,
      name: preset.name,
      file,
      buildSeconds: result.buildSeconds,
      renderSeconds: result.renderSeconds,
    });
    console.log(`${preset.id} ${preset.name}: build ${result.buildSeconds.toFixed(1)} s, ${samples} spp in ${result.renderSeconds.toFixed(1)} s`);
  }
  await page.close();
  if (report.shots.length > 0) {
    report.contactSheet = await composeContactSheet(browser, report.shots);
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(outDir, 'timings.json'), JSON.stringify(report, null, 2));
console.log(`wrote ${outDir}`);
