// SPDX-License-Identifier: Apache-2.0
// Gallery choices that keep the terrain: times of day, skies, biomes, lenses and looks.
// Each option is [id, label, value]; `apply(scene, value)` returns a new scene with that
// choice made, and `current(scene)` names the option the scene matches, if any.

import { BIOMES, BIOME_IDS } from '../render/biomes.js';

const matches = (settings, wanted) => Object.entries(wanted).every(([key, value]) => settings?.[key] === value);

// Sun height with the haze and valley fog that suit it.
export const LIGHT = {
  options: [
    ['dawn', 'Dawn', { elevation: 1.5, haze: 1.6, fog: 1.2 }],
    ['morning', 'Morning', { elevation: 14, haze: 1, fog: 0.4 }],
    ['midday', 'Midday', { elevation: 55, haze: 0.8, fog: 0 }],
    ['afternoon', 'Afternoon', { elevation: 28, haze: 1, fog: 0 }],
    ['golden', 'Golden hour', { elevation: 6, haze: 1.3, fog: 0.2 }],
    ['sunset', 'Sunset', { elevation: 0.8, haze: 1.8, fog: 0.3 }],
  ],
  apply: (scene, { elevation, haze, fog }) => ({
    ...scene,
    sun: { ...scene.sun, elevation },
    atmosphere: { ...scene.atmosphere, haze, fog },
  }),
  current: scene => LIGHT.options.find(([, , { elevation, haze, fog }]) => scene.sun.elevation === elevation
    && matches(scene.atmosphere, { haze, fog }))?.[0],
};

export const SKY = {
  options: [
    ['clear', 'Clear', { coverage: 0, cirrus: 0 }],
    ['fair', 'Fair weather', { coverage: 0.36, type: 0.5, altitude: 3800, thickness: 1400, density: 0.85, cirrus: 0.15 }],
    ['mackerel', 'Mackerel sky', { coverage: 0.55, type: 0.22, altitude: 5200, thickness: 600, density: 0.8, cirrus: 0.1 }],
    ['overcast', 'Overcast', { coverage: 0.95, type: 0.1, altitude: 2400, thickness: 900, density: 1.2, cirrus: 0 }],
    ['storm', 'Storm towers', { coverage: 0.7, type: 0.95, altitude: 1900, thickness: 7000, density: 1.5, cirrus: 0.3 }],
    ['cirrus', 'High cirrus', { coverage: 0.08, type: 0.5, altitude: 4200, thickness: 1200, density: 0.9, cirrus: 0.8 }],
  ],
  apply: (scene, sky) => ({ ...scene, clouds: { ...scene.clouds, ...sky } }),
  current: scene => SKY.options.find(([, , sky]) => matches(scene.clouds, sky))?.[0],
};

export const BIOME = {
  options: BIOME_IDS.map(id => [id, BIOMES[id].name, id]),
  apply: (scene, biome) => ({ ...scene, surface: { ...scene.surface, biome } }),
  current: scene => scene.surface?.biome,
};

export const LENS = {
  options: [
    [18, 'Ultra wide'],
    [24, 'Wide'],
    [35, 'Classic'],
    [50, 'Natural'],
    [85, 'Portrait'],
    [135, 'Telephoto'],
  ].map(([focal, name]) => [String(focal), `${name} · ${focal} mm`, focal]),
  apply: (scene, focalLength) => ({ ...scene, camera: { ...scene.camera, focalLength } }),
  current: scene => String(scene.camera.focalLength),
};

export const LOOK = {
  options: [
    ['punchy', 'Rich'],
    ['none', 'Natural'],
    ['cinematic', 'Cinematic'],
    ['soft', 'Soft'],
    ['mono', 'Black & white'],
  ].map(([id, label]) => [id, label, id]),
  apply: (scene, look) => ({ ...scene, image: { ...scene.image, look } }),
  current: scene => scene.image?.look,
};
