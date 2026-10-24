// SPDX-License-Identifier: Apache-2.0
// Scene format v1 is frozen as of 0.5.0 (First Light). Every file in tests/fixtures/v1/
// must keep opening, and the schema may only grow: new optional fields, wider ranges and
// more choices, never removed fields, new required ones, narrower ranges or fewer choices.
// tests/fixtures/v1/ itself never changes.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  ATMOSPHERE_DEFAULTS, SURFACE_DEFAULTS, WATER_DEFAULTS, aspectOf, cloudSettingsOf, imageSettingsOf, terrainSettingsOf,
  validateScene,
} from '../web/scene/document.js';

const FROZEN = 'tests/fixtures/v1';
const schema = JSON.parse(fs.readFileSync('internal/scene/schema.json', 'utf8'));
const frozenSchema = JSON.parse(fs.readFileSync(path.join(FROZEN, 'schema.json'), 'utf8'));
const corpus = fs.readdirSync(FROZEN).filter(name => name.endsWith('.lithosky'));

test('every frozen v1 scene opens, with defaults filled in as the studio does', () => {
  assert.ok(corpus.length >= 14, 'the corpus holds every built-in scene and a minimal one');
  for (const name of corpus) {
    const scene = validateScene(JSON.parse(fs.readFileSync(path.join(FROZEN, name), 'utf8')), schema);
    imageSettingsOf(scene);
    cloudSettingsOf(scene);
    terrainSettingsOf(scene);
    assert.ok(aspectOf(scene) > 0, name);
    assert.ok({ ...SURFACE_DEFAULTS, ...scene.surface }.biome, name);
    assert.ok({ ...WATER_DEFAULTS, ...scene.water }.waves >= 0, name);
    assert.ok(Number.isFinite({ ...ATMOSPHERE_DEFAULTS, ...scene.atmosphere }.tint), name);
  }
});

// Whether `current` accepts everything `frozen` accepted. Returns the problems found.
function compatible(frozen, current, where) {
  const problems = [];
  if (!current) {
    return [`${where}: removed`];
  }
  if (frozen.type !== current.type) {
    problems.push(`${where}: type ${frozen.type} became ${current.type}`);
  }
  if (frozen.enum) {
    const missing = frozen.enum.filter(value => !(current.enum ?? []).includes(value));
    if (current.enum && missing.length) {
      problems.push(`${where}: choices removed: ${missing.join(', ')}`);
    }
  }
  for (const [key, wider] of [['minimum', (a, b) => b <= a], ['maximum', (a, b) => b >= a],
    ['minItems', (a, b) => b <= a], ['maxItems', (a, b) => b >= a],
    ['minLength', (a, b) => b <= a], ['maxLength', (a, b) => b >= a]]) {
    if (frozen[key] !== undefined && current[key] !== undefined && !wider(frozen[key], current[key])) {
      problems.push(`${where}: ${key} narrowed from ${frozen[key]} to ${current[key]}`);
    }
    // A bound the frozen schema didn't have could reject old files.
    if (frozen[key] === undefined && current[key] !== undefined) {
      problems.push(`${where}: new ${key}`);
    }
  }
  if (frozen.type === 'object') {
    const newlyRequired = (current.required ?? []).filter(key => !(frozen.required ?? []).includes(key));
    if (newlyRequired.length) {
      problems.push(`${where}: newly required: ${newlyRequired.join(', ')}`);
    }
    for (const [key, rule] of Object.entries(frozen.properties ?? {})) {
      problems.push(...compatible(rule, current.properties?.[key], `${where}.${key}`));
    }
  }
  if (frozen.type === 'array' && frozen.items) {
    problems.push(...compatible(frozen.items, current.items, `${where}[]`));
  }
  return problems;
}

test('the scene schema only grows from the frozen v1 schema', () => {
  assert.deepEqual(compatible(frozenSchema, schema, 'scene'), []);
});

test('the compatibility check catches breaking changes', () => {
  const broken = structuredClone(frozenSchema);
  delete broken.properties.sun;
  broken.properties.image.properties.look.enum.pop();
  broken.properties.atmosphere.properties.haze.maximum = 1;
  broken.properties.terrain.required.push('landform');
  const problems = compatible(frozenSchema, broken, 'scene');
  assert.ok(problems.some(problem => problem.includes('scene.sun: removed')));
  assert.ok(problems.some(problem => problem.includes('choices removed')));
  assert.ok(problems.some(problem => problem.includes('haze: maximum narrowed')));
  assert.ok(problems.some(problem => problem.includes('newly required: landform')));
});
