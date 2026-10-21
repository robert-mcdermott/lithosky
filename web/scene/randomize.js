// SPDX-License-Identifier: Apache-2.0
// Randomize, one lab at a time: a seeded draw of pleasing settings for that lab only, kept
// to ranges that tend to make good pictures. The same seed always gives the same scene.

import { BIOME, LOOK, SKY } from './variants.js';

// A small, fast seeded generator (mulberry32) returning numbers in [0, 1).
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value, step) => Math.round(value / step) * step;
const fixed = (value, step) => Number(round(value, step).toFixed(6));

function tools(random) {
  const between = (low, high, step) => fixed(low + (high - low) * random(), step);
  const pick = list => list[Math.floor(random() * list.length) % list.length];
  return { between, pick };
}

export const RANDOMIZERS = {
  terrain(scene, random) {
    const { between } = tools(random);
    return {
      ...scene,
      terrain: {
        ...scene.terrain,
        seed: Math.floor(random() * 100000),
        relief: between(1800, 4800, 50),
        drainage: between(0.6, 1.8, 0.05),
        rills: between(0.5, 1.6, 0.05),
        talus: between(0.5, 1.5, 0.05),
      },
    };
  },

  // Mostly low, raking light, which flatters landforms; now and then a high sun.
  light(scene, random) {
    const { between } = tools(random);
    const low = random() < 0.8;
    const elevation = low ? between(-1, 16, 0.1) : between(18, 50, 0.1);
    return {
      ...scene,
      sun: { ...scene.sun, elevation, azimuth: between(0, 359.5, 0.5) },
      atmosphere: {
        ...scene.atmosphere,
        haze: between(0.6, 2.2, 0.05),
        fog: random() < 0.45 ? 0 : between(0.2, 1.6, 0.05),
      },
    };
  },

  sky(scene, random) {
    const { between, pick } = tools(random);
    const [, , sky] = pick(SKY.options);
    const clouds = { ...scene.clouds, ...sky, seed: Math.floor(random() * 100000) };
    if (clouds.coverage > 0) {
      clouds.coverage = fixed(Math.min(1, Math.max(0.05, clouds.coverage + between(-0.12, 0.12, 0.01))), 0.01);
    }
    return { ...scene, clouds };
  },

  ground(scene, random) {
    const { between, pick } = tools(random);
    const snowLine = between(1400, 3400, 25);
    return {
      ...scene,
      surface: {
        ...scene.surface,
        biome: pick(BIOME.options)[2],
        snowLine,
        treeLine: fixed(Math.min(snowLine - 300, between(800, 1900, 25)), 25),
        moisture: between(0.1, 0.9, 0.01),
        strata: between(0.1, 0.9, 0.01),
      },
      water: { ...scene.water, waves: between(0, 0.5, 0.01) },
    };
  },

  camera(scene, random) {
    const { pick } = tools(random);
    return { ...scene, camera: { ...scene.camera, focalLength: pick([18, 21, 24, 28, 35, 50, 70, 85]) } };
  },

  image(scene, random) {
    const { between, pick } = tools(random);
    return {
      ...scene,
      image: {
        ...scene.image,
        look: pick(LOOK.options)[2],
        autoExposure: true,
        exposure: 0,
        warmth: between(-0.3, 0.4, 0.02),
        bloom: between(0.1, 0.55, 0.01),
        vignette: between(0.05, 0.45, 0.01),
        grain: between(0, 0.25, 0.01),
      },
    };
  },
};

// A new scene with lab `id` randomized from `seed`; other labs' settings stay as they were.
export function randomize(id, scene, seed) {
  const randomizer = RANDOMIZERS[id];
  return randomizer ? randomizer(scene, seededRandom(seed)) : scene;
}
