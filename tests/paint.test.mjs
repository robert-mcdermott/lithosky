// SPDX-License-Identifier: Apache-2.0
// Vegetation paint: the run-length encoding round-trips, stays small for brush strokes, and
// rejects damaged data; the brush paints towards its target with a soft edge.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validateScene } from '../web/scene/document.js';
import {
  BRUSH_TARGETS, NEUTRAL, PAINT_LIMIT, PAINT_SIZE, decodePaint, encodePaint, isNeutral, neutralPaint, paintDab, paintTexel,
} from '../web/scene/paint.js';

const schema = JSON.parse(fs.readFileSync('internal/scene/schema.json', 'utf8'));

test('neutral paint encodes to a few bytes and decodes back', () => {
  const data = encodePaint(neutralPaint());
  assert.ok(data.length < 16, data);
  const levels = decodePaint(data);
  assert.equal(levels.length, PAINT_SIZE * PAINT_SIZE);
  assert.ok(isNeutral(levels));
});

test('brush strokes round-trip and stay well under the scene limit', () => {
  const levels = neutralPaint();
  // A few dozen strokes of every kind across the tile.
  for (let i = 0; i < 40; i++) {
    const mode = ['plant', 'clear', 'restore'][i % 3];
    for (let step = 0; step < 30; step++) {
      paintDab(levels, 30 + i * 11 + step * 3, 40 + ((i * 37) % 400) + step * 2, 4 + (i % 7), mode);
    }
  }
  assert.ok(!isNeutral(levels));
  const data = encodePaint(levels);
  assert.deepEqual(decodePaint(data), levels);
  assert.ok(data.length < PAINT_LIMIT / 4, `${data.length} characters`);
  const scene = {
    format: 'lithosky', version: 1, title: 'Painted',
    terrain: { seed: 1, relief: 3200, drainage: 1, rills: 1, talus: 1 },
    camera: { position: [0, 860, 6000], target: [0, 180, 3800], focalLength: 21 },
    sun: { elevation: 6, azimuth: 314 },
    atmosphere: { haze: 1.6, fog: 0.5 },
    image: { exposure: 0, look: 'punchy' },
    vegetation: { forest: 1, paint: { resolution: PAINT_SIZE, data } },
  };
  assert.equal(validateScene(scene, schema).vegetation.paint.data, data);
});

test('a dab is full strength in its middle and fades at its edge', () => {
  const levels = neutralPaint();
  assert.ok(paintDab(levels, 100, 100, 10, 'plant'));
  assert.equal(levels[100 * PAINT_SIZE + 100], BRUSH_TARGETS.plant);
  const edge = levels[100 * PAINT_SIZE + 109];
  assert.ok(edge > NEUTRAL && edge < BRUSH_TARGETS.plant, `edge level ${edge}`);
  assert.equal(levels[100 * PAINT_SIZE + 115], NEUTRAL);
  assert.ok(!paintDab(levels, 100, 100, 3, 'plant'), 'painting the same again changes nothing');
  // Restoring at full strength over the whole dab (70% of 16 covers its radius of 10).
  paintDab(levels, 100, 100, 16, 'restore');
  assert.ok(isNeutral(levels));
});

test('damaged paint is refused', () => {
  const good = encodePaint(neutralPaint());
  assert.throws(() => decodePaint('%%%'), /base64/);
  assert.throws(() => decodePaint(btoa(String.fromCharCode(0x80))), /damaged/);
  assert.throws(() => decodePaint(btoa(atob(good) + atob(good))), /damaged/);
  assert.throws(() => decodePaint(btoa(String.fromCharCode(0x8f))), /damaged/);
});

test('world positions map onto the near tile', () => {
  assert.deepEqual(paintTexel(-8000, -8000, [-8000, -8000], 16000), [0, 0]);
  assert.deepEqual(paintTexel(0, 8000, [-8000, -8000], 16000), [PAINT_SIZE / 2, PAINT_SIZE]);
});
