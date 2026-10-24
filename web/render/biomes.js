// SPDX-License-Identifier: Apache-2.0
// Biomes: the palettes and limits the landform-driven materials use. A scene picks a biome
// and adjusts its snow line, tree line, moisture and strata; the shader reads one uniform.
// Colours are linear albedo.

import { StructWriter } from '../gpu/struct.js';
import { surfaceSettingsOf } from '../scene/document.js';

export const BIOMES = Object.freeze({
  alpine: {
    name: 'Alpine',
    rockDark: [0.075, 0.072, 0.066],
    rockLight: [0.25, 0.235, 0.215],
    band: [0.36, 0.3, 0.24],
    scree: [0.27, 0.255, 0.23],
    soilLush: [0.07, 0.11, 0.035],
    soilDry: [0.17, 0.155, 0.08],
    forest: [0.014, 0.022, 0.014],
    sand: [0.3, 0.27, 0.21],
    snow: [0.86, 0.88, 0.92],
    forestAmount: 1,
    snowAmount: 1,
  },
  desert: {
    name: 'Desert',
    rockDark: [0.24, 0.1, 0.05],
    rockLight: [0.6, 0.33, 0.18],
    band: [0.72, 0.52, 0.34],
    scree: [0.45, 0.25, 0.13],
    soilLush: [0.2, 0.19, 0.1],
    soilDry: [0.55, 0.38, 0.22],
    forest: [0.06, 0.07, 0.035],
    sand: [0.7, 0.5, 0.31],
    snow: [0.85, 0.84, 0.82],
    forestAmount: 0.08,
    snowAmount: 0,
  },
  volcanic: {
    name: 'Volcanic',
    rockDark: [0.025, 0.024, 0.026],
    rockLight: [0.11, 0.1, 0.1],
    band: [0.22, 0.1, 0.05],
    scree: [0.06, 0.055, 0.052],
    soilLush: [0.04, 0.07, 0.025],
    soilDry: [0.12, 0.1, 0.07],
    forest: [0.012, 0.02, 0.012],
    sand: [0.045, 0.043, 0.042],
    snow: [0.85, 0.87, 0.9],
    forestAmount: 0.4,
    snowAmount: 1,
  },
  arctic: {
    name: 'Arctic',
    rockDark: [0.07, 0.075, 0.08],
    rockLight: [0.26, 0.27, 0.28],
    band: [0.2, 0.2, 0.21],
    scree: [0.22, 0.22, 0.22],
    soilLush: [0.12, 0.12, 0.07],
    soilDry: [0.2, 0.18, 0.13],
    forest: [0.02, 0.03, 0.02],
    sand: [0.25, 0.24, 0.22],
    snow: [0.88, 0.9, 0.94],
    forestAmount: 0,
    snowAmount: 1,
  },
  alien: {
    name: 'Imagined',
    rockDark: [0.1, 0.04, 0.12],
    rockLight: [0.42, 0.22, 0.46],
    band: [0.12, 0.36, 0.4],
    scree: [0.32, 0.18, 0.36],
    soilLush: [0.03, 0.2, 0.17],
    soilDry: [0.38, 0.28, 0.14],
    forest: [0.2, 0.03, 0.07],
    sand: [0.55, 0.45, 0.65],
    snow: [0.78, 0.9, 0.96],
    forestAmount: 0.6,
    snowAmount: 1,
  },
});

export const BIOME_IDS = Object.keys(BIOMES);

// Rock formations are this thick by default; canyon country steps into CANYON_FORMATIONS
// ledges over its relief (as in terrain/generator.wgsl), and the bands follow them.
const STRATA_THICKNESS = 34;
const CANYON_FORMATIONS = 12;

function strataThickness(terrain) {
  return terrain?.landform === 'canyon' ? terrain.relief / CANYON_FORMATIONS : STRATA_THICKNESS;
}

// Writes the surface uniform (11 vec4) for a scene: palette, limits, water waves and the
// thickness of rock formations.
export function surfaceUniform(scene) {
  const settings = surfaceSettingsOf(scene);
  const biome = BIOMES[settings.biome] ?? BIOMES.alpine;
  return new StructWriter(176)
    .f32(...biome.rockDark, settings.strata)
    .f32(...biome.rockLight, 0)
    .f32(...biome.band, 0)
    .f32(...biome.scree, 0)
    .f32(...biome.soilLush, 0)
    .f32(...biome.soilDry, 0)
    .f32(...biome.forest, biome.forestAmount)
    .f32(...biome.sand, 0)
    .f32(...biome.snow, biome.snowAmount)
    .f32(settings.snowLine, settings.treeLine, settings.moisture, settings.waves)
    .f32(strataThickness(scene.terrain), 0, 0, 0)
    .buffer;
}
