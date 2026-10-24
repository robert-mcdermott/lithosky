// SPDX-License-Identifier: Apache-2.0
// Terrain parameters: what the user (or a scene) controls. Everything the GPU pipeline
// needs is derived from these plus a placement, so the same settings give the same terrain.

// The landforms the generator can make.
export const LANDFORMS = Object.freeze(['alpine', 'canyon']);

export const TERRAIN_DEFAULTS = Object.freeze({
  landform: 'alpine',
  seed: 1847,
  // Peak relief of the procedural generator, in metres.
  relief: 3200,
  // Multipliers on the default erosion strength; 0 turns a stage off.
  drainage: 1,
  rills: 1,
  talus: 1,
});

const LIMITS = {
  seed: [0, 0xffffffff],
  relief: [200, 8000],
  drainage: [0, 3],
  rills: [0, 3],
  talus: [0, 3],
};

// Returns a complete, validated settings object. Unknown keys and out-of-range or
// non-numeric values throw, so a bad scene never reaches the GPU.
export function terrainSettings(overrides = {}) {
  const settings = { ...TERRAIN_DEFAULTS };
  for (const [key, value] of Object.entries(overrides)) {
    if (key === 'landform') {
      if (!LANDFORMS.includes(value)) {
        throw new TypeError(`Unknown landform "${value}".`);
      }
      settings.landform = value;
      continue;
    }
    if (!(key in LIMITS)) {
      throw new TypeError(`Unknown terrain setting "${key}".`);
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`Terrain setting "${key}" must be a finite number.`);
    }
    const [low, high] = LIMITS[key];
    if (value < low || value > high) {
      throw new RangeError(`Terrain setting "${key}" must be between ${low} and ${high}.`);
    }
    settings[key] = value;
  }
  if (!Number.isInteger(settings.seed)) {
    throw new TypeError('Terrain seed must be an integer.');
  }
  return Object.freeze(settings);
}

// Whether two settings objects need a full regeneration (rather than identical output).
export function sameTerrain(a, b) {
  return a.landform === b.landform && Object.keys(LIMITS).every(key => a[key] === b[key]);
}
