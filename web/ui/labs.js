// SPDX-License-Identifier: Apache-2.0
// The seven labs. Each is a drawer: a gallery first, then a few controls, with rarely used
// options folded away. Galleries whose choices keep the terrain show the current view with
// each choice applied (`variants`); the Scenes gallery uses thumbnails shipped with the app.

import { VIEW_MODES } from '../render/renderer.js';
import { BIOME, LENS, LIGHT, LOOK, SKY } from '../scene/variants.js';
import { button, choice, element, fold, gallery, heading, iconButton, toggle } from './controls.js';

const degrees = value => `${Math.round(value)}°`;
const times = value => `${value.toFixed(2)}×`;
const plain = value => value.toFixed(2);
const percent = value => `${Math.round(value * 100)}%`;
const metres = value => `${Math.round(value).toLocaleString('en-US')} m`;
const kilometres = value => `${(value / 1000).toFixed(1)} km`;
const signed = value => `${value > 0 ? '+' : ''}${Math.round(value * 100)}`;

// studio: { history, edit, replace, validate, bind(fn), sliderFor(spec), renderer, presets,
// actions: { erodeMore, importHeightmap, proceduralTerrain, setViewMode } }.
export function buildLabs(studio) {
  const { edit, bind, sliderFor } = studio;

  // A lab: its gallery (if any), then its controls.
  function lab(spec, ...controls) {
    const node = element('div', 'lab');
    if (spec.gallery) {
      if (spec.galleryTitle) {
        node.append(heading(spec.galleryTitle));
      }
      node.append(spec.gallery.node);
    }
    const body = element('div', 'lab-controls');
    body.append(...controls);
    node.append(body);
    return { ...spec, node };
  }

  // A gallery of variant scenes (see scene/variants.js) rendered from the current view.
  function variantGallery({ options, apply, current }) {
    const view = gallery(options.map(([id, label]) => ({ id, label })), id => {
      const [, , value] = options.find(([key]) => key === id);
      edit(draft => Object.assign(draft, apply(draft, value)));
    });
    bind(scene => view.select(current(scene)));
    return {
      gallery: view,
      variants: scene => options.map(([id, , value]) => ({ id, scene: apply(scene, value) })),
    };
  }

  // --- Scenes ----------------------------------------------------------------------------
  const presetScenes = studio.presets.map(preset => ({ preset, json: JSON.stringify(studio.validate(preset.scene)) }));
  const scenesGallery = gallery(studio.presets.map(preset => ({
    id: preset.id,
    label: preset.name,
    image: `scenes/thumbnails/${preset.id}.jpg`,
  })), id => {
    const preset = studio.presets.find(entry => entry.id === id);
    studio.replace(studio.validate(preset.scene));
  });
  bind(scene => {
    const json = JSON.stringify(scene);
    scenesGallery.select(presetScenes.find(entry => entry.json === json)?.preset.id);
  });
  const scenes = lab({ id: 'scenes', title: 'Scenes', icon: 'scenes', gallery: scenesGallery });

  // --- Terrain ---------------------------------------------------------------------------
  const seedValue = element('output', 'seed-value');
  bind(scene => {
    seedValue.textContent = scene.terrain.seed;
  });
  const reseed = seed => edit(draft => {
    draft.terrain.seed = seed;
  });
  const seedRow = element('div', 'control seed');
  const seedName = element('span', 'control-name', 'Seed');
  const seedButtons = element('span', 'seed-buttons');
  seedButtons.append(
    iconButton('previous', 'Previous seed', () => reseed(Math.max(0, studio.history.value.terrain.seed - 1))),
    seedValue,
    iconButton('next', 'Next seed', () => reseed(studio.history.value.terrain.seed + 1)),
    iconButton('dice', 'Random seed', () => reseed(Math.floor(Math.random() * 100000))),
  );
  seedRow.append(seedName, seedButtons);
  const terrainMore = fold('Advanced');
  const heightmapRow = element('div', 'row');
  heightmapRow.append(
    button('Import heightmap…', studio.actions.importHeightmap),
    button('Back to procedural', studio.actions.proceduralTerrain),
  );
  terrainMore.body.append(heightmapRow);
  const erodeRow = element('div', 'row');
  erodeRow.append(button('Erode more', studio.actions.erodeMore));
  const terrain = lab({ id: 'terrain', title: 'Terrain', icon: 'terrain' },
    seedRow,
    sliderFor({ path: 'terrain.relief', label: 'Relief', min: 800, max: 6000, step: 50, format: metres }),
    sliderFor({ path: 'terrain.drainage', label: 'Drainage', min: 0, max: 3, step: 0.05, format: times }),
    sliderFor({ path: 'terrain.rills', label: 'Gullies', min: 0, max: 3, step: 0.05, format: times }),
    sliderFor({ path: 'terrain.talus', label: 'Scree', min: 0, max: 3, step: 0.05, format: times }),
    erodeRow,
    terrainMore.node,
  );

  // --- Light -----------------------------------------------------------------------------
  const light = lab({ id: 'light', title: 'Light', icon: 'light', galleryTitle: 'Time of day', ...variantGallery(LIGHT) },
    sliderFor({ path: 'sun.elevation', label: 'Sun height', min: -5, max: 70, step: 0.1, live: true, format: degrees }),
    sliderFor({ path: 'sun.azimuth', label: 'Sun direction', min: 0, max: 360, step: 0.5, live: true, format: degrees }),
    sliderFor({ path: 'atmosphere.haze', label: 'Haze', min: 0, max: 5, step: 0.05, live: true, format: plain }),
    sliderFor({ path: 'atmosphere.fog', label: 'Valley fog', min: 0, max: 4, step: 0.05, live: true, format: plain }),
  );

  // --- Sky -------------------------------------------------------------------------------
  const skyMore = element('div', 'row');
  skyMore.append(button('New sky', () => edit(draft => {
    draft.clouds.seed = Math.floor(Math.random() * 100000);
  })));
  const sky = lab({ id: 'sky', title: 'Sky', icon: 'sky', galleryTitle: 'Clouds', ...variantGallery(SKY) },
    sliderFor({ path: 'clouds.coverage', label: 'Cover', min: 0, max: 1, step: 0.01, live: true, format: percent }),
    sliderFor({ path: 'clouds.type', label: 'Layers to towers', min: 0, max: 1, step: 0.01, live: true, format: plain }),
    sliderFor({ path: 'clouds.altitude', label: 'Cloud base', min: 300, max: 9000, step: 50, live: true, format: kilometres }),
    sliderFor({ path: 'clouds.thickness', label: 'Depth', min: 100, max: 10000, step: 50, live: true, format: kilometres }),
    sliderFor({ path: 'clouds.density', label: 'Density', min: 0, max: 3, step: 0.05, live: true, format: plain }),
    sliderFor({ path: 'clouds.cirrus', label: 'Cirrus', min: 0, max: 1, step: 0.01, live: true, format: percent }),
    skyMore,
  );

  // --- Ground & water --------------------------------------------------------------------
  const ground = lab({ id: 'ground', title: 'Ground & water', icon: 'ground', galleryTitle: 'Biome', ...variantGallery(BIOME) },
    sliderFor({ path: 'surface.snowLine', label: 'Snow line', min: 0, max: 9000, step: 25, live: true, format: metres }),
    sliderFor({ path: 'surface.treeLine', label: 'Tree line', min: 0, max: 9000, step: 25, live: true, format: metres }),
    sliderFor({ path: 'surface.moisture', label: 'Moisture', min: 0, max: 1, step: 0.01, live: true, format: percent }),
    sliderFor({ path: 'surface.strata', label: 'Rock layers', min: 0, max: 1, step: 0.01, live: true, format: percent }),
    sliderFor({ path: 'water.waves', label: 'Waves', min: 0, max: 1, step: 0.01, live: true, format: percent }),
  );

  // --- Camera ----------------------------------------------------------------------------
  const camera = lab({ id: 'camera', title: 'Camera', icon: 'camera', galleryTitle: 'Lens', ...variantGallery(LENS) },
    sliderFor({ path: 'camera.focalLength', label: 'Focal length', min: 14, max: 200, step: 1, live: true, format: v => `${Math.round(v)} mm` }),
  );

  // --- Image -----------------------------------------------------------------------------
  const autoExposure = toggle({ label: 'Auto exposure' }, checked => edit(draft => {
    draft.image.autoExposure = checked;
  }));
  bind(scene => autoExposure.set(scene.image.autoExposure));
  const imageMore = fold('Advanced');
  const show = choice({
    label: 'Show',
    options: [['image', 'Image'], ['albedo', 'Colour only'], ['flow', 'Drainage'], ['sediment', 'Sediment'],
      ['curvature', 'Curvature'], ['normals', 'Normals']],
  }, value => studio.actions.setViewMode(VIEW_MODES[value]));
  imageMore.body.append(show.node);
  const image = lab({ id: 'image', title: 'Image', icon: 'image', galleryTitle: 'Look', ...variantGallery(LOOK) },
    autoExposure.node,
    sliderFor({ path: 'image.exposure', label: 'Exposure', min: -4, max: 4, step: 0.1, live: true, format: v => `${v > 0 ? '+' : ''}${v.toFixed(1)} EV` }),
    sliderFor({ path: 'image.warmth', label: 'Warmth', min: -1, max: 1, step: 0.02, live: true, format: signed }),
    sliderFor({ path: 'image.bloom', label: 'Glow', min: 0, max: 1, step: 0.01, live: true, format: percent }),
    sliderFor({ path: 'image.vignette', label: 'Vignette', min: 0, max: 1, step: 0.01, live: true, format: percent }),
    sliderFor({ path: 'image.grain', label: 'Grain', min: 0, max: 1, step: 0.01, live: true, format: percent }),
    imageMore.node,
  );

  return [scenes, terrain, light, sky, ground, camera, image];
}
