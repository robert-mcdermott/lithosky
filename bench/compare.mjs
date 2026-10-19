// SPDX-License-Identifier: Apache-2.0
// Stacks the same shots from two capture runs (before above, after below) for slice reviews.
//
//   node bench/compare.mjs --before bench/out --after bench/out/w4s2 --out bench/out/w4s2/compare
//
// Every PNG present in both folders is compared, scaled to 1920x1080 per row, with labels.
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

const before = path.resolve(option('before', 'bench/out'));
const after = path.resolve(option('after', ''));
const outDir = path.resolve(option('out', path.join(after, 'compare')));
const beforeLabel = option('before-label', path.basename(before));
const afterLabel = option('after-label', path.basename(after));
fs.mkdirSync(outDir, { recursive: true });

const pngs = folder => new Set(fs.readdirSync(folder).filter(name => name.endsWith('.png')));
const afterShots = pngs(after);
const shots = [...pngs(before)].filter(name => afterShots.has(name)).sort();
if (shots.length === 0) {
  throw new Error(`No PNG names appear in both ${before} and ${after}.`);
}

const toUrl = file => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  for (const shot of shots) {
    const rows = [
      { label: `${beforeLabel} · ${shot}`, url: toUrl(path.join(before, shot)) },
      { label: `${afterLabel} · ${shot}`, url: toUrl(path.join(after, shot)) },
    ];
    const dataUrl = await page.evaluate(async items => {
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080 * items.length;
      const context = canvas.getContext('2d');
      for (const [row, item] of items.entries()) {
        const image = new Image();
        image.src = item.url;
        await image.decode();
        context.drawImage(image, 0, row * 1080, 1920, 1080);
        context.fillStyle = 'rgba(0, 0, 0, 0.55)';
        context.fillRect(0, row * 1080, 1920, 44);
        context.fillStyle = '#fff';
        context.font = '600 24px system-ui, sans-serif';
        context.fillText(item.label, 16, row * 1080 + 31);
      }
      return canvas.toDataURL('image/png');
    }, rows);
    const file = path.join(outDir, shot);
    fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('wrote', file);
  }
} finally {
  await browser.close();
}
