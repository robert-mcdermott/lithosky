// SPDX-License-Identifier: Apache-2.0
export const MAX_SCENE_BYTES = 16 * 1024;
export function defaultScene() {
  return { format: 'lithosky', version: 1, title: 'Alpine quiet',
    terrain: { generator: 'terrain-v1', seed: 1847, elevation: 1, palette: 'natural' },
    camera: { yaw: 0.28, pitch: 0.3, distance: 23 },
    water: { enabled: true, level: 0.25 }, lighting: { sunElevation: 38 } };
}

// Only the vocabulary in the bundled schema is implemented. User-supplied
// schemas, references, external resources and coercions are never evaluated.
export function validateScene(value, schema) {
  if (value?.version !== 1) throw new Error('Unsupported scene version. This build opens version 1 only.');
  function check(value, rule, path) {
    const fail = message => { throw new Error(`${path}: ${message}`); };
    switch (rule.type) {
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
  return structuredClone(value);
}
export function parseScene(text, schema) {
  if (new TextEncoder().encode(text).length > MAX_SCENE_BYTES) throw new Error('Scene exceeds 16 KiB.');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('Invalid scene JSON.'); }
  return validateScene(value, schema);
}
export function serializeScene(scene, schema) { return JSON.stringify(validateScene(scene, schema), null, 2) + '\n'; }
export function renderState(scene) {
  return { ...scene.terrain, ...scene.camera, sun: scene.lighting.sunElevation, waterEnabled: scene.water.enabled, waterLevel: scene.water.level };
}
export function wrapYaw(yaw) { return ((yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; }
