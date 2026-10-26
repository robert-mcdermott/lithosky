// SPDX-License-Identifier: Apache-2.0
// The eight labs. Each is a drawer: a gallery first, then a few controls, with rarely used
// options folded away. Galleries whose choices keep the terrain show the current view with
// each choice applied (`variants`); the Scenes gallery uses thumbnails shipped with the app.

import { VIEW_MODES } from '../render/renderer.js';
import { BIOME, LENS, LIGHT, LOOK, PLANTS, SKY } from '../scene/variants.js';
import { button, choice, element, fold, gallery, heading, iconButton, parseNumber, segmented, slider, toggle } from './controls.js';
import { SUN_LIMITS, sunDome } from './sundome.js';

// Display formats with the matching parser for typed values (the controls show rounded
// values with units; typing "60" into a percentage means 60%).
const unit = (format, parse = parseNumber) => ({ format, parse });
const degrees = unit(v => `${Math.abs(v) < 10 && !Number.isInteger(v) ? v.toFixed(1) : Math.round(v)}°`);
const times = unit(v => `${v.toFixed(2)}×`);
const plain = unit(v => v.toFixed(2));
const percent = unit(v => `${Math.round(v * 100)}%`, text => parseNumber(text) / 100);
const metres = unit(v => `${Math.round(v).toLocaleString('en-US')} m`);
const kilometres = unit(v => `${(v / 1000).toFixed(1)} km`, text => {
  const number = parseNumber(text);
  return /km/i.test(text) || number < 100 ? number * 1000 : number;
});
const signed = unit(v => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`, text => parseNumber(text) / 100);
const leafToNeedle = unit(v => `${v < -0.05 ? 'More broadleaf' : v > 0.05 ? 'More conifers' : 'Biome mix'} · ${v > 0 ? '+' : ''}${Math.round(v * 100)}`,
  text => parseNumber(text) / 100);
const exposure = unit(v => `${v > 0 ? '+' : ''}${v.toFixed(1)} EV`);
const millimetres = unit(v => `${Math.round(v)} mm`);
const skyColour = unit(v => `${v < -0.3 ? 'Deep blue' : v < 0.25 ? 'Earth' : v < 0.7 ? 'Pale' : 'Golden'} · ${Math.round(v * 100)}`,
  text => parseNumber(text) / 100);
const cloudShape = unit(v => `${v < 0.3 ? 'Flat' : v < 0.65 ? 'Heaped' : 'Towering'} · ${Math.round(v * 100)}`,
  text => parseNumber(text) / 100);

// Saved camera views a scene can hold.
export const MAX_VIEWS = 24;

// The image shapes, with their everyday names.
const SHAPES = [
  ['16:9', '16:9', 'Widescreen'],
  ['3:2', '3:2', 'Classic photo'],
  ['4:5', '4:5', 'Portrait'],
  ['1:1', '1:1', 'Square'],
  ['21:9', '21:9', 'Cinema'],
];

const GUIDES = [
  ['none', 'None'],
  ['thirds', 'Thirds', 'Rule of thirds'],
  ['golden', 'Golden', 'Golden ratio'],
];

// studio: { history, edit, replace, validate, bind(fn), sliderFor(spec), gesture(change),
// viewHeading(camera), presets, actions: { erodeMore, importHeightmap, proceduralTerrain,
// setViewMode, placeSun, placingSun, flyTo, guides, setGuides, brush, setBrush, clearPaint } }.
export function buildLabs(studio) {
  const { edit, bind, sliderFor } = studio;

  // A lab: a line of help (shown from the drawer's ? button), its gallery (if any), then
  // its controls.
  function lab(spec, ...controls) {
    const node = element('div', 'lab');
    node.append(element('p', 'lab-help', spec.help));
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
      variants: scene => options.map(([id, , value]) => ({ id, gallery: view, scene: apply(scene, value) })),
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
  const scenes = lab({
    id: 'scenes',
    title: 'Scenes',
    icon: 'scenes',
    help: 'Built-in landscapes to start from. Picking one replaces the current scene; Undo brings it back.',
    gallery: scenesGallery,
  });

  // --- Terrain ---------------------------------------------------------------------------
  const seedValue = element('output', 'seed-value');
  bind(scene => {
    seedValue.textContent = scene.terrain.seed;
  });
  const reseed = seed => edit(draft => {
    draft.terrain.seed = seed;
  });
  const seedRow = element('div', 'control seed');
  const seedName = element('span', 'control-name', 'Variation');
  seedName.title = 'Each number is a different landscape with the same settings';
  const seedButtons = element('span', 'seed-buttons');
  seedButtons.append(
    iconButton('previous', 'Previous landscape', () => reseed(Math.max(0, studio.history.value.terrain.seed - 1))),
    seedValue,
    iconButton('next', 'Next landscape', () => reseed(studio.history.value.terrain.seed + 1)),
    iconButton('dice', 'Random landscape', () => reseed(Math.floor(Math.random() * 100000))),
  );
  seedRow.append(seedName, seedButtons);
  const terrainMore = fold('Advanced');
  const heightmapRow = element('div', 'row');
  heightmapRow.append(
    button('Import heightmap…', studio.actions.importHeightmap),
    button('Use generated terrain', studio.actions.proceduralTerrain),
  );
  terrainMore.body.append(heightmapRow);
  const erodeRow = element('div', 'row');
  const erode = button('Erode more', studio.actions.erodeMore);
  erode.title = 'Run more erosion on this landscape';
  erodeRow.append(erode);
  const landform = segmented({
    label: 'Landform',
    options: [['alpine', 'Alpine', 'Ranges carved by rivers and glaciers'], ['canyon', 'Canyon', 'A plateau of layered rock cut into canyons, mesas and buttes']],
  }, value => edit(draft => {
    draft.terrain.landform = value;
  }));
  bind(scene => landform.set(scene.terrain.landform ?? 'alpine'));
  const terrain = lab({
    id: 'terrain',
    title: 'Terrain',
    icon: 'terrain',
    help: 'The shape of the land. Changes here rebuild the terrain, which takes a few seconds.',
  },
    landform.node,
    seedRow,
    sliderFor({ path: 'terrain.relief', label: 'Mountain height', hint: 'How far the peaks rise above the valleys', min: 800, max: 6000, step: 50, ...metres }),
    sliderFor({ path: 'terrain.drainage', label: 'River carving', hint: 'How deeply rivers cut the valleys', min: 0, max: 3, step: 0.05, ...times }),
    sliderFor({ path: 'terrain.rills', label: 'Gullies', hint: 'Small channels running down the slopes', min: 0, max: 3, step: 0.05, ...times }),
    sliderFor({ path: 'terrain.talus', label: 'Loose rock', hint: 'Rock debris piled below cliffs', min: 0, max: 3, step: 0.05, ...times }),
    erodeRow,
    terrainMore.node,
  );

  // --- Light -----------------------------------------------------------------------------
  const dome = sunDome(studio.gesture((draft, sun) => {
    draft.sun.elevation = sun.elevation;
    draft.sun.azimuth = sun.azimuth;
  }));
  bind(scene => dome.set(scene.sun, studio.viewHeading(scene.camera)));
  const sunValues = element('div', 'pair');
  const placeSun = iconButton('target', 'Place the sun in the view (or ⌥-drag)', studio.actions.placeSun);
  placeSun.classList.add('place-sun');
  bind(() => placeSun.setAttribute('aria-pressed', String(studio.actions.placingSun())));
  sunValues.append(
    sliderFor({ path: 'sun.elevation', label: 'Height', hint: 'Degrees above the horizon', ...SUN_LIMITS, step: 0.1, live: true, compact: true, ...degrees }),
    sliderFor({ path: 'sun.azimuth', label: 'Direction', hint: 'Compass direction, clockwise from north', min: 0, max: 360, step: 0.5, live: true, compact: true, ...degrees }),
    placeSun,
  );
  const light = lab({
    id: 'light',
    title: 'Light',
    icon: 'light',
    help: 'Where the sun is and how the air looks. Drag the sun on the dome, or hold ⌥ and drag in the view.',
    galleryTitle: 'Time of day',
    ...variantGallery(LIGHT),
  },
    heading('Sun'),
    dome.node,
    sunValues,
    sliderFor({ path: 'atmosphere.haze', label: 'Haze', hint: 'Moisture and dust in the air; more haze softens distant ridges', min: 0, max: 5, step: 0.05, live: true, ...plain }),
    sliderFor({ path: 'atmosphere.fog', label: 'Valley fog', hint: 'Low mist that settles in the valleys', min: 0, max: 4, step: 0.05, live: true, ...plain }),
    sliderFor({ path: 'atmosphere.tint', label: 'Sky colour', hint: 'The colour of the air, from deep blue through Earth to golden; the haze over distant land follows it', min: -1, max: 1, step: 0.01, live: true, ...skyColour }),
  );

  // --- Sky -------------------------------------------------------------------------------
  const skyMore = element('div', 'row');
  const newClouds = button('New clouds', () => edit(draft => {
    draft.clouds.seed = Math.floor(Math.random() * 100000);
  }));
  newClouds.title = 'The same kind of sky with different clouds';
  skyMore.append(newClouds);
  const sky = lab({
    id: 'sky',
    title: 'Sky',
    icon: 'sky',
    help: 'Clouds. Pick a kind of sky, then shape it. Clouds cast shadows and show in the water.',
    galleryTitle: 'Clouds',
    ...variantGallery(SKY),
  },
    sliderFor({ path: 'clouds.coverage', label: 'Cover', hint: 'How much of the sky has cloud', min: 0, max: 1, step: 0.01, live: true, ...percent }),
    sliderFor({ path: 'clouds.type', label: 'Cloud shape', hint: 'From flat layers to heaped cumulus to towering storm clouds', min: 0, max: 1, step: 0.01, live: true, ...cloudShape }),
    sliderFor({ path: 'clouds.altitude', label: 'Cloud base', hint: 'Height of the cloud bottoms above sea level', min: 300, max: 9000, step: 50, live: true, ...kilometres }),
    sliderFor({ path: 'clouds.thickness', label: 'Thickness', hint: 'How deep the cloud layer is', min: 100, max: 10000, step: 50, live: true, ...kilometres }),
    sliderFor({ path: 'clouds.density', label: 'Density', hint: 'How solid the clouds look', min: 0, max: 3, step: 0.05, live: true, ...plain }),
    sliderFor({ path: 'clouds.cirrus', label: 'High wisps', hint: 'Thin ice clouds far above (cirrus)', min: 0, max: 1, step: 0.01, live: true, ...percent }),
    skyMore,
  );

  // --- Ground & water --------------------------------------------------------------------
  const ground = lab({
    id: 'ground',
    title: 'Ground & water',
    icon: 'ground',
    help: 'What the land is made of. Rock, scree, grass, forest, sand and snow go where the landform puts them.',
    galleryTitle: 'Biome',
    ...variantGallery(BIOME),
  },
    sliderFor({ path: 'surface.snowLine', label: 'Snow line', hint: 'Snow settles above this height', min: 0, max: 9000, step: 25, live: true, ...metres }),
    sliderFor({ path: 'surface.treeLine', label: 'Tree line', hint: 'Forest grows below this height', min: 0, max: 9000, step: 25, live: true, ...metres }),
    sliderFor({ path: 'surface.moisture', label: 'Moisture', hint: 'Wetter ground grows more grass; drier ground shows sand', min: 0, max: 1, step: 0.01, live: true, ...percent }),
    sliderFor({ path: 'surface.strata', label: 'Rock layers', hint: 'How strongly the rock shows bands of sediment', min: 0, max: 1, step: 0.01, live: true, ...percent }),
    sliderFor({ path: 'water.waves', label: 'Waves', hint: 'Wind on the water, from glassy to choppy', min: 0, max: 1, step: 0.01, live: true, ...percent }),
  );

  // --- Plants ----------------------------------------------------------------------------
  // The brush paints in the view: left-drag plants, clears or restores the land's own cover;
  // right- or ⇧-drag still moves the camera.
  const brushMode = segmented({
    label: 'Brush',
    options: [
      ['off', 'Off', 'Drag moves the camera'],
      ['plant', 'Plant', 'Drag in the view to plant forest'],
      ['clear', 'Clear', 'Drag in the view to clear trees and shrubs'],
      ['restore', 'Restore', 'Drag in the view to return the land to its own cover'],
    ],
  }, mode => studio.actions.setBrush({ mode }));
  bind(() => brushMode.set(studio.actions.brush().mode));
  const brushSize = slider({
    label: 'Brush size', hint: 'Radius of the brush on the ground', min: 30, max: 1500, step: 10, ...metres,
  }, { begin: () => {}, input: size => studio.actions.setBrush({ size }), end: () => {} });
  bind(() => brushSize.set(studio.actions.brush().size));
  const paintRow = element('div', 'row');
  const clearPaint = button('Remove all painting', studio.actions.clearPaint);
  bind(scene => {
    clearPaint.disabled = !scene.vegetation?.paint;
  });
  paintRow.append(clearPaint);
  const plants = lab({
    id: 'plants',
    title: 'Plants',
    icon: 'plants',
    help: 'Forests, shrubs and grass, where the land and the biome let them grow. Paint with the brush to plant or clear in places.',
    galleryTitle: 'Vegetation',
    ...variantGallery(PLANTS),
  },
    sliderFor({ path: 'vegetation.forest', label: 'Forest', hint: 'How much of the land the forest covers, compared with the biome', min: 0, max: 2, step: 0.05, ...times }),
    sliderFor({ path: 'vegetation.size', label: 'Tree size', hint: 'Height of the trees and shrubs', min: 0.5, max: 1.6, step: 0.05, ...times }),
    sliderFor({ path: 'vegetation.conifers', label: 'Tree mix', hint: 'From broadleaf trees to conifers; conifers still take over near the tree line', min: -1, max: 1, step: 0.05, ...leafToNeedle }),
    sliderFor({ path: 'vegetation.scrub', label: 'Shrubs', hint: 'Bushes between the forest and above it, compared with the biome', min: 0, max: 2, step: 0.05, ...times }),
    sliderFor({ path: 'vegetation.grass', label: 'Grass', hint: 'Height of the meadow grass, compared with the biome', min: 0, max: 2.5, step: 0.05, ...times }),
    heading('Paint'),
    brushMode.node,
    brushSize.node,
    paintRow,
  );

  // --- Camera ----------------------------------------------------------------------------
  const lenses = variantGallery(LENS);
  lenses.gallery.node.classList.add('three');
  const shape = segmented({ label: 'Shape', options: SHAPES }, aspect => edit(draft => {
    draft.image.aspect = aspect;
  }));
  bind(scene => shape.set(scene.image.aspect));
  const guides = segmented({ label: 'Guides', options: GUIDES }, mode => studio.actions.setGuides(mode));
  bind(() => guides.set(studio.actions.guides()));

  // Saved views: a filmstrip of camera bookmarks, rendered from where each one looks.
  const viewsGallery = gallery([], id => {
    const view = studio.history.value.cameras?.[Number(id)];
    if (view) {
      studio.actions.flyTo(view);
    }
  }, {
    remove: id => edit(draft => {
      draft.cameras.splice(Number(id), 1);
      if (draft.cameras.length === 0) {
        delete draft.cameras;
      }
    }),
    rename: (id, name) => edit(draft => {
      draft.cameras[Number(id)].name = name;
    }),
  });
  viewsGallery.node.classList.add('three', 'filmstrip');
  const noViews = element('p', 'empty', 'No saved views yet. Frame a shot you like, then save it here.');
  const saveView = button('Save this view', () => edit(draft => {
    const views = draft.cameras ?? [];
    const taken = new Set(views.map(view => view.name));
    let number = views.length + 1;
    while (taken.has(`View ${number}`)) {
      number++;
    }
    const { position, target, focalLength } = draft.camera;
    views.push({ name: `View ${number}`, position: [...position], target: [...target], focalLength });
    draft.cameras = views;
  }));
  let viewsKey = null;
  const sameView = (a, b) => a.focalLength === b.focalLength
    && a.position.every((value, i) => value === b.position[i]) && a.target.every((value, i) => value === b.target[i]);
  bind(scene => {
    const views = scene.cameras ?? [];
    const key = JSON.stringify(views.map(view => view.name));
    if (key !== viewsKey) {
      viewsKey = key;
      viewsGallery.setItems(views.map((view, i) => ({ id: String(i), label: view.name })));
    }
    noViews.hidden = views.length > 0;
    saveView.disabled = views.length >= MAX_VIEWS;
    const index = views.findIndex(view => sameView(view, scene.camera));
    viewsGallery.select(index >= 0 ? String(index) : null);
  });
  const viewVariants = scene => (scene.cameras ?? []).map((view, i) => ({
    id: String(i),
    gallery: viewsGallery,
    scene: { ...scene, camera: { position: view.position, target: view.target, focalLength: view.focalLength } },
  }));
  const saveRow = element('div', 'row');
  saveRow.append(saveView);
  const camera = lab({
    id: 'camera',
    title: 'Camera',
    icon: 'camera',
    help: 'Lens, image shape and saved views. Double-click the terrain to orbit around that spot.',
    galleryTitle: 'Lens',
    gallery: lenses.gallery,
    variants: scene => [...lenses.variants(scene), ...viewVariants(scene)],
  },
    sliderFor({ path: 'camera.focalLength', label: 'Zoom', hint: 'Lens focal length: low numbers are wide, high numbers are telephoto', min: 14, max: 200, step: 1, live: true, ...millimetres }),
    heading('Frame'),
    shape.node,
    guides.node,
    heading('Saved views'),
    viewsGallery.node,
    noViews,
    saveRow,
  );

  // --- Image -----------------------------------------------------------------------------
  const autoExposure = toggle({ label: 'Auto brightness' }, checked => edit(draft => {
    draft.image.autoExposure = checked;
  }));
  bind(scene => autoExposure.set(scene.image.autoExposure));
  const imageMore = fold('Advanced');
  const show = choice({
    label: 'Debug view',
    options: [['image', 'Image'], ['albedo', 'Colour only'], ['flow', 'Drainage'], ['sediment', 'Sediment'],
      ['curvature', 'Curvature'], ['normals', 'Normals']],
  }, value => studio.actions.setViewMode(VIEW_MODES[value]));
  imageMore.body.append(show.node);
  const image = lab({
    id: 'image',
    title: 'Image',
    icon: 'image',
    help: 'How the render becomes a picture: overall look, brightness, colour and finish.',
    galleryTitle: 'Look',
    ...variantGallery(LOOK),
  },
    autoExposure.node,
    sliderFor({ path: 'image.exposure', label: 'Brightness', hint: 'Exposure in stops (EV); with auto brightness on, an adjustment on top', min: -4, max: 4, step: 0.1, live: true, ...exposure }),
    sliderFor({ path: 'image.warmth', label: 'Warmth', hint: 'Cooler (blue) to warmer (amber)', min: -1, max: 1, step: 0.02, live: true, ...signed }),
    sliderFor({ path: 'image.bloom', label: 'Glow', hint: 'Light bleeding around the sun and bright haze', min: 0, max: 1, step: 0.01, live: true, ...percent }),
    sliderFor({ path: 'image.vignette', label: 'Dark corners', hint: 'Darkens the edges of the frame (vignette)', min: 0, max: 1, step: 0.01, live: true, ...percent }),
    sliderFor({ path: 'image.grain', label: 'Film grain', hint: 'Fine photographic grain', min: 0, max: 1, step: 0.01, live: true, ...percent }),
    imageMore.node,
  );

  return [scenes, terrain, light, sky, ground, plants, camera, image];
}
