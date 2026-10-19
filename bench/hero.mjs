// SPDX-License-Identifier: Apache-2.0
// Renders the hero shots (bench/hero/*.lithosky) and composes a contact sheet for review.
//
//   go build -o bin/lithosky . && ./bin/lithosky --window=browser --no-open --port 8123
//   node bench/hero.mjs --url http://127.0.0.1:8123 [--label baseline-legacy] [--quick] [--only H1,H3]
//
// Default quality matches the W4.S1 baseline: 2048 px long edge, 64 spp, 1024² terrain
// (about a minute per shot with the legacy renderer). --quick renders 960 px, 16 spp, 512²
// for framing iterations. Writes to bench/out/<label>/ (git-ignored). Needs Playwright and Chrome.
//
// Only the legacy studio renderer exists today; W4.S3 points this at the new viewport renderer.

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
const label = option('label', 'baseline-legacy');
const quick = process.argv.includes('--quick');
const only = option('only', '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);
const quality = quick
  ? { size: '960', samples: '16', detail: '512' }
  : { size: '2048', samples: '64', detail: '1024' };

const heroDir = path.resolve('bench/hero');
const outDir = path.resolve('bench/out', label);
fs.mkdirSync(outDir, { recursive: true });

const scenes = fs
  .readdirSync(heroDir)
  .filter(name => name.endsWith('.lithosky'))
  .filter(name => only.length === 0 || only.some(id => name.startsWith(`${id}-`)))
  .sort();

async function openStudio(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', error => console.log('[studio error]', error.message));
  await page.goto(`${base}/`);
  const ready = () => !document.getElementById('render-start').disabled;
  await page.waitForFunction(ready, null, { timeout: 60000 });
  const keep = page.getByRole('button', { name: 'Keep this scene', exact: true });
  if (await keep.isVisible()) {
    await keep.click();
  }
  return page;
}

async function renderScene(page, file) {
  const name = path.basename(file);
  await page.setInputFiles('#scene-file', file);
  const opened = expected => document.getElementById('file-status').textContent.startsWith(expected);
  await page.waitForFunction(opened, `Opened ${name}`, { timeout: 60000 });
  // Let the terrain worker regenerate before the render prepares final geometry.
  await page.waitForTimeout(2500);
  await page.selectOption('#render-size', quality.size);
  await page.selectOption('#render-samples', quality.samples);
  await page.selectOption('#render-detail', quality.detail);
  const start = Date.now();
  await page.click('#render-start');
  const done = () => document.getElementById('render-status').textContent.startsWith('Complete.');
  await page.waitForFunction(done, null, { timeout: 900000, polling: 1000 });
  const seconds = (Date.now() - start) / 1000;
  const status = await page.textContent('#render-status');
  const dataUrl = await page.evaluate(() => document.getElementById('render-image').toDataURL('image/png'));
  return { seconds, status, dataUrl };
}

// Three columns by two rows of 960x540 tiles, each labelled with its shot name.
async function composeContactSheet(browser, shots) {
  const page = await browser.newPage();
  const tiles = shots.map(shot => ({
    title: shot.title,
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
const report = { date: new Date().toISOString(), base, label, renderer: 'legacy', quality, shots: [] };
try {
  const page = await openStudio(browser);
  for (const name of scenes) {
    const file = path.join(heroDir, name);
    const title = JSON.parse(fs.readFileSync(file, 'utf8')).title;
    const result = await renderScene(page, file);
    const image = path.join(outDir, name.replace('.lithosky', '.png'));
    fs.writeFileSync(image, Buffer.from(result.dataUrl.split(',')[1], 'base64'));
    report.shots.push({ scene: name, title, file: image, seconds: result.seconds, status: result.status });
    console.log(`${title}: ${result.status}`);
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
