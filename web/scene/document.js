// SPDX-License-Identifier: Apache-2.0
import {leapYear} from '../atmosphere/solar.js';
export const MAX_SCENE_BYTES = 128 * 1024;
export function defaultScene() {
  return { format: 'lithosky', version: 1, title: 'Alpine quiet',
    terrain: { generator: 'terrain-v1', seed: 1847, elevation: 1, palette: 'natural' },
    camera: { yaw: 0.28, pitch: 0.3, distance: 23 },
    water: { enabled: true, level: 0.25 }, lighting: { sunElevation: 38 } };
}

// Only the vocabulary in the bundled schema is implemented. User-supplied
// schemas, references, external resources and coercions are never evaluated.
export function validateScene(value, schema) {
  if (![1, 2, 3, 4, 5, 6].includes(value?.version)) throw new Error('Unsupported scene version. This build opens versions 1, 2, 3, 4, 5 and 6.');
  function check(value, rule, path) {
    const fail = message => { throw new Error(`${path}: ${message}`); };
    if (rule.oneOf) {
      const matches = rule.oneOf.filter(branch => { try { check(value, branch, path); return true; } catch { return false; } });
      if (matches.length !== 1) fail('does not match a supported scene format');
      return;
    }
    switch (rule.type) {
      case 'array':
        if (!Array.isArray(value) || value.length < rule.minItems || value.length > rule.maxItems) fail('array length is outside bounds');
        value.forEach((item, index) => check(item, rule.items, path + '[' + index + ']'));
        break;
      case 'object':
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected an object');
        for (const name of rule.required) if (!Object.hasOwn(value, name)) fail(`missing ${name}`);
        for (const [key, child] of Object.entries(value)) {
          if (!Object.hasOwn(rule.properties, key)) fail(`unknown field ${key}`);
          check(child, rule.properties[key], `${path}.${key}`);
        }
        break;
      case 'string':
        if (typeof value !== 'string') fail('expected text');
        if ([...value].length < (rule.minLength ?? 0) || [...value].length > (rule.maxLength ?? Infinity)) fail('text length is outside bounds');
        break;
      case 'integer': case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) fail('expected a finite number');
        if (rule.type === 'integer' && !Number.isInteger(value)) fail('expected an integer');
        if (value < rule.minimum || value > rule.maximum) fail('number is outside bounds');
        break;
      case 'boolean': if (typeof value !== 'boolean') fail('expected true or false'); break;
      default: fail('unsupported schema rule');
    }
    if (rule.enum && !rule.enum.includes(value)) fail('unsupported value');
  }
  check(value, schema, 'scene');
  if(value.terrain.generator==='heightmap-v1' && (!/^[a-f0-9]{64}$/.test(value.terrain.asset)||value.terrain.minimum>value.terrain.maximum))throw new Error('Invalid heightmap reference or range.');
  if(value.atmosphere && value.atmosphere.day===366 && !leapYear(value.atmosphere.year))throw new Error('Day 366 requires a leap year.');
  if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_SCENE_BYTES) throw new Error('Scene exceeds 128 KiB.');
  return structuredClone(value);
}
export function parseScene(text, schema) {
  if (new TextEncoder().encode(text).length > MAX_SCENE_BYTES) throw new Error('Scene exceeds 128 KiB.');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('Invalid scene JSON.'); }
  return validateScene(value, schema);
}
export function serializeScene(scene, schema) {
  const valid = validateScene(scene, schema), text = JSON.stringify(valid, null, 2) + '\n';
  return new TextEncoder().encode(text).length <= MAX_SCENE_BYTES ? text : JSON.stringify(valid) + '\n';
}
export function renderState(scene) {
  return { ...scene.terrain, materials: scene.surface, atmosphere: scene.atmosphere, ...scene.camera, sun: scene.lighting.sunElevation, waterEnabled: scene.water.enabled, waterLevel: scene.water.level };
}
export function wrapYaw(yaw) { return ((yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; }

// JSON property order is not scene content (Go recovery canonicalizes keys).
export function sceneKey(scene) {
  return JSON.stringify(scene,(key,value)=>value && typeof value==='object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))) : value);
}
