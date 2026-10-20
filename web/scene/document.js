// SPDX-License-Identifier: Apache-2.0
// The scene document (format "lithosky", version 1): terrain settings, camera, sun,
// atmosphere and image. internal/scene/schema.json is the single definition; the Go server
// and this module both validate against it.

import { terrainSettings } from '../terrain/settings.js';

export const SCENE_VERSION = 1;
const HASH = /^[0-9a-f]{64}$/;

// Interprets the small schema vocabulary the scene schema uses. Untrusted schemas are never
// loaded; this is not a general JSON Schema engine.
function check(value, rule, path) {
  const fail = detail => {
    throw new Error(`${path}: ${detail}`);
  };
  switch (rule.type) {
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        fail('expected an object');
      }
      for (const key of rule.required ?? []) {
        if (!(key in value)) {
          fail(`missing ${key}`);
        }
      }
      for (const [key, child] of Object.entries(value)) {
        if (!(key in rule.properties)) {
          fail(`unknown field ${key}`);
        }
        check(child, rule.properties[key], `${path}.${key}`);
      }
      break;
    }
    case 'array': {
      if (!Array.isArray(value) || value.length < rule.minItems || value.length > rule.maxItems) {
        fail('array length is outside bounds');
      }
      value.forEach((item, index) => check(item, rule.items, `${path}[${index}]`));
      break;
    }
    case 'string': {
      if (typeof value !== 'string') {
        fail('expected text');
      }
      const length = [...value].length;
      if ((rule.minLength !== undefined && length < rule.minLength)
        || (rule.maxLength !== undefined && length > rule.maxLength)) {
        fail('text length is outside bounds');
      }
      break;
    }
    case 'number':
    case 'integer': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        fail('expected a finite number');
      }
      if (rule.type === 'integer' && !Number.isInteger(value)) {
        fail('expected an integer');
      }
      if ((rule.minimum !== undefined && value < rule.minimum)
        || (rule.maximum !== undefined && value > rule.maximum)) {
        fail('number is outside bounds');
      }
      break;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        fail('expected true or false');
      }
      break;
    }
    default:
      fail('unsupported schema rule');
  }
  if (rule.enum && !rule.enum.includes(value)) {
    fail('unsupported value');
  }
}

// Returns a deep copy of a valid scene, or throws an Error naming the first problem.
export function validateScene(value, schema) {
  if (value?.format === 'lithosky' && value.version !== SCENE_VERSION) {
    throw new Error(`This build opens scene version ${SCENE_VERSION} only.`);
  }
  check(value, schema, 'scene');
  const heightmap = value.terrain.heightmap;
  if (heightmap && !HASH.test(heightmap.asset)) {
    throw new Error('scene.terrain.heightmap.asset: invalid asset reference');
  }
  const [px, py, pz] = value.camera.position;
  const [tx, ty, tz] = value.camera.target;
  if (Math.hypot(tx - px, ty - py, tz - pz) < 1) {
    throw new Error('scene.camera: the target must differ from the position');
  }
  return structuredClone(value);
}

// Image settings older scenes may omit, and their defaults.
export const IMAGE_DEFAULTS = Object.freeze({
  autoExposure: true,
  bloom: 0.3,
  warmth: 0,
  vignette: 0.25,
  grain: 0.12,
});

// A scene without clouds has a clear sky.
export const CLOUD_DEFAULTS = Object.freeze({
  coverage: 0,
  type: 0.5,
  altitude: 3200,
  thickness: 1800,
  density: 1,
  cirrus: 0,
  seed: 1,
});

export function cloudSettingsOf(scene) {
  return { ...CLOUD_DEFAULTS, ...scene.clouds };
}

// Surface (biome) and water settings older scenes may omit.
export const SURFACE_DEFAULTS = Object.freeze({
  biome: 'alpine',
  snowLine: 2100,
  treeLine: 1250,
  moisture: 0.5,
  strata: 0.4,
});

export const WATER_DEFAULTS = Object.freeze({
  waves: 0.15,
});

// Surface settings plus the water's wave strength, as the material shader reads them.
export function surfaceSettingsOf(scene) {
  return { ...SURFACE_DEFAULTS, ...scene.surface, ...WATER_DEFAULTS, ...scene.water };
}

export function imageSettingsOf(scene) {
  return { ...IMAGE_DEFAULTS, ...scene.image };
}

export function terrainSettingsOf(scene) {
  const { seed, relief, drainage, rills, talus } = scene.terrain;
  return terrainSettings({ seed, relief, drainage, rills, talus });
}

// A lake in a glacial trough at golden hour: the default new scene.
export function defaultScene() {
  return {
    format: 'lithosky',
    version: SCENE_VERSION,
    title: 'Untitled landscape',
    terrain: { seed: 1847, relief: 3200, drainage: 1, rills: 1, talus: 1 },
    camera: { position: [0, 860, 6000], target: [0, 180, 3800], focalLength: 21 },
    sun: { elevation: 6, azimuth: 314 },
    atmosphere: { haze: 1.6, fog: 0.5 },
    image: { exposure: 0, look: 'punchy', ...IMAGE_DEFAULTS },
  };
}
