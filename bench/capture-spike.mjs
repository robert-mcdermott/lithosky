// SPDX-License-Identifier: Apache-2.0
// Captures the rendering spike and the current renderer's "Alpine quiet" for a side-by-side.
//
//   go build -o bin/lithosky . && ./bin/lithosky --window=browser --no-open --port 8123
//   node bench/capture-spike.mjs --url http://127.0.0.1:8123 [--legacy] [--seconds 10]
//
// --legacy also renders the current renderer (2048x1152, 64 spp, 1024² terrain; about a minute).
// --legacy-only renders just that. Side-by-side images are composed whenever both exist.
//
// Writes PNGs and timings.json to bench/out/ (git-ignored). Needs Playwright and Chrome.

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
const seconds = Number(option('seconds', 10));
const outDir = path.resolve(option('out', 'bench/out'));
const legacyOnly = process.argv.includes('--legacy-only');
const withLegacy = legacyOnly || process.argv.includes('--legacy');
fs.mkdirSync(outDir, { recursive: true });

const savePng = (name, dataUrl) => {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return file;
};

async function waitForErosion(page) {
  await page.waitForFunction(() => window.spike, null, { timeout: 60000 });
  await page.waitForTimeout(300);
  const ready = () => !window.spike.eroding && window.spike.stats.erosionSeconds !== null;
  await page.waitForFunction(ready, null, { timeout: 180000 });
}

// Restarts accumulation, then samples the stats until `limit` seconds have passed.
async function converge(page, limit) {
  await page.evaluate(() => window.spike.restart());
  const marks = [];
  for (;;) {
    await page.waitForTimeout(250);
    const stats = await page.evaluate(() => ({ ...window.spike.stats }));
    marks.push({ seconds: stats.convergeSeconds, samples: stats.completedSamples });
    if (stats.convergeSeconds >= limit) {
      return { stats, marks };
    }
  }
}

async function captureSpike(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('console', message => console.log(`[spike ${message.type()}]`, message.text()));
  const loadStart = Date.now();
  await page.goto(`${base}/spike/spike.html`);
  await waitForErosion(page);
  const erodedAfter = (Date.now() - loadStart) / 1000;
  const profile = await page.evaluate(() => window.spike.profile());
  await waitForErosion(page);

  const shots = [
    { name: 'spike-golden-hour', settings: {} },
    {
      name: 'spike-alpine-quiet-light',
      settings: { sunElevation: 39.38, sunAzimuth: 233.13, exposure: -0.5, fog: 0.3 },
    },
    { name: 'spike-overview', settings: { camera: 'overview' } },
    { name: 'spike-overview-golden-hour', settings: { sunElevation: 6, sunAzimuth: 298, exposure: 1.8, fog: 0.5 } },
  ];
  const results = [];
  for (const shot of shots) {
    await page.evaluate(settings => window.spike.set(settings), shot.settings);
    const { stats, marks } = await converge(page, seconds);
    const file = savePng(`${shot.name}.png`, await page.evaluate(() => window.spike.capture()));
    const firstHalfSecond = marks.filter(mark => mark.seconds <= 0.5).at(-1)?.samples ?? 0;
    results.push({ ...shot, file, stats, samplesByHalfSecond: firstHalfSecond });
    console.log(`${shot.name}: ${stats.completedSamples} spp in ${stats.convergeSeconds.toFixed(1)} s`);
  }
  await page.close();
  return { erodedAfter, profile, results };
}

async function captureLegacy(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${base}/`);
  await page.waitForFunction(() => !document.getElementById('render-start').disabled, null, { timeout: 60000 });
  const keep = page.getByRole('button', { name: 'Keep this scene', exact: true });
  if (await keep.isVisible()) {
    await keep.click();
  }
  await page.selectOption('#study-select', 'alpine');
  await page.waitForTimeout(1500);
  await page.selectOption('#render-size', '2048');
  await page.selectOption('#render-samples', '64');
  await page.selectOption('#render-detail', '1024');
  const start = Date.now();
  await page.click('#render-start');
  const done = () => document.getElementById('render-status').textContent.startsWith('Complete.');
  await page.waitForFunction(done, null, { timeout: 900000, polling: 1000 });
  const elapsed = (Date.now() - start) / 1000;
  const status = await page.textContent('#render-status');
  const dataUrl = await page.evaluate(() => document.getElementById('render-image').toDataURL('image/png'));
  const file = savePng('legacy-alpine-quiet.png', dataUrl);
  await page.close();
  console.log(`legacy: ${status}`);
  return { file, elapsed, status, size: '2048x1152', samples: 64, terrain: '1024²' };
}

// Places the legacy render (scaled to 1920x1080) above the spike render.
async function composeSideBySide(browser, top, bottom, name) {
  const page = await browser.newPage();
  const toUrl = file => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  const dataUrl = await page.evaluate(async ([a, b]) => {
    const load = async url => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    };
    const images = [await load(a), await load(b)];
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 2160;
    const context = canvas.getContext('2d');
    images.forEach((image, row) => context.drawImage(image, 0, row * 1080, 1920, 1080));
    return canvas.toDataURL('image/png');
  }, [toUrl(top), toUrl(bottom)]);
  await page.close();
  return savePng(name, dataUrl);
}

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
const report = { date: new Date().toISOString(), base, seconds };
const spikeFile = name => path.join(outDir, `${name}.png`);
try {
  if (!legacyOnly) {
    report.spike = await captureSpike(browser);
  }
  if (withLegacy) {
    report.legacy = await captureLegacy(browser);
  }
  const legacy = spikeFile('legacy-alpine-quiet');
  const golden = spikeFile('spike-golden-hour');
  const matched = spikeFile('spike-alpine-quiet-light');
  if ([legacy, golden, matched].every(file => fs.existsSync(file))) {
    report.sideBySide = await composeSideBySide(browser, legacy, golden, 'side-by-side.png');
    report.sideBySideMatched = await composeSideBySide(browser, legacy, matched, 'side-by-side-matched-light.png');
  }
} finally {
  await browser.close();
}
const reportName = legacyOnly ? 'timings-legacy.json' : 'timings.json';
fs.writeFileSync(path.join(outDir, reportName), JSON.stringify(report, null, 2));
console.log(`wrote ${path.join(outDir, reportName)}`);
