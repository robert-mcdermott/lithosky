// SPDX-License-Identifier: Apache-2.0
// The studio: a full-window progressive render under a thin top bar and a rail of labs.
// Every edit goes through History (undo/redo) and Autosave (crash recovery); the renderer
// picks up the resulting scene, and open galleries re-render their thumbnails from it.

import { advance, distanceToTarget, dolly, lookAt, orbit, pan, sunAngles, tanHalfFov, viewHeading, viewRay } from './render/camera.js';
import { Renderer } from './render/renderer.js';
import { Autosave } from './scene/autosave.js';
import { ATMOSPHERE_DEFAULTS, SURFACE_DEFAULTS, WATER_DEFAULTS, aspectOf, cloudSettingsOf, defaultScene, imageSettingsOf, validateScene } from './scene/document.js';
import { History } from './scene/history.js';
import { RANDOMIZERS, randomize } from './scene/randomize.js';
import { importHeightmap, loadHeightmap } from './terrain/heightmap.js';
import { element, gallery, iconButton, slider } from './ui/controls.js';
import { icon } from './ui/icons.js';
import { buildLabs } from './ui/labs.js';
import { SUN_LIMITS } from './ui/sundome.js';
import { Thumbnails } from './ui/thumbnails.js';

const $ = id => document.getElementById(id);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ORBIT_SPEED = 0.004;
const WHEEL_SPEED = 0.0015;
const WHEEL_SETTLE_MS = 300;
// Galleries re-render this long after the last edit or camera move settles.
const GALLERY_DELAY_MS = 450;
// A double-click turns the view to the clicked point over this long; a saved view flies
// into place over a little longer.
const FOCUS_MS = 280;
const FLY_MS = 520;
const GUIDE_MODES = ['none', 'thirds', 'golden'];

// Viewer preferences that aren't part of the scene. Storage can be unavailable; the studio
// works without it.
function remembered(key, fallback) {
  try {
    return localStorage.getItem(`lithosky.${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}

function remember(key, value) {
  try {
    localStorage.setItem(`lithosky.${key}`, value);
  } catch {
    // Preferences are a convenience only.
  }
}

let token = null;

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Could not load ${path} (${response.status}).`);
  }
  return response.json();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'X-Lithosky-Session': token, ...options.headers },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    throw new Error((await response.text()).trim() || `Request failed (${response.status}).`);
  }
  return response;
}

function showMessage(error) {
  const message = $('message');
  message.textContent = error?.message ?? String(error);
  message.hidden = false;
  console.error(error);
  setTimeout(() => {
    message.hidden = true;
  }, 8000);
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = element('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function fileName(title, extension) {
  const slug = title.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return `${slug || 'landscape'}.${extension}`;
}

const get = (scene, path) => path.split('.').reduce((value, key) => value[key], scene);

function set(scene, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((value, key) => value[key], scene)[last] = value;
}

async function start() {
  const [schema, presets, session] = await Promise.all([
    fetchJson('/api/scene-schema'),
    fetchJson('scenes/presets.json'),
    fetchJson('/api/session'),
  ]);
  token = session.token;
  // Every scene in history carries the full set of image settings.
  const validate = scene => {
    const valid = validateScene(scene, schema);
    valid.image = imageSettingsOf(valid);
    valid.clouds = cloudSettingsOf(valid);
    valid.surface = { ...SURFACE_DEFAULTS, ...valid.surface };
    valid.water = { ...WATER_DEFAULTS, ...valid.water };
    valid.atmosphere = { ...ATMOSPHERE_DEFAULTS, ...valid.atmosphere };
    return valid;
  };
  const history = new History(presets[0]?.scene ?? defaultScene(), validate);
  const canvas = $('view');

  // The view takes the scene's image shape, as large as fits below the top bar; the rest of
  // the window is a dark mat. Guides and region boxes follow the frame.
  let framedAspect = null;
  function layoutFrame() {
    const aspect = aspectOf(history.value);
    framedAspect = aspect;
    const top = document.querySelector('.bar').getBoundingClientRect().bottom + 10;
    const narrow = window.innerWidth <= 760;
    const bottom = narrow ? 84 : 0;
    const roomWidth = window.innerWidth;
    const roomHeight = Math.max(100, window.innerHeight - top - bottom);
    const width = Math.min(roomWidth, roomHeight * aspect);
    const height = width / aspect;
    // A frame narrower than the window slides right, just enough to clear the rail and an
    // open drawer, when there's room; its size never changes, so the render carries on.
    let clear = 0;
    if (!narrow && !document.body.classList.contains('chrome-hidden')) {
      const drawerBox = $('drawer').hidden ? null : $('drawer').getBoundingClientRect();
      clear = (drawerBox ?? $('rail').getBoundingClientRect()).right + 10;
    }
    const left = Math.max((roomWidth - width) / 2, Math.min(clear, roomWidth - width));
    const box = [left, top + (roomHeight - height) / 2, width, height].map(Math.round);
    for (const node of [canvas, $('guides')]) {
      node.style.left = `${box[0]}px`;
      node.style.top = `${box[1]}px`;
      node.style.width = `${box[2]}px`;
      node.style.height = `${box[3]}px`;
    }
    document.body.classList.toggle('matted', width < roomWidth - 1 || height < roomHeight - 1);
  }
  layoutFrame();
  window.addEventListener('resize', layoutFrame);

  const renderer = await Renderer.create(canvas, history.value);
  renderer.start();

  const autosave = new Autosave(async (scene, revision) => {
    const response = await api('/api/autosave', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: revision, scene }),
    });
    return (await response.json()).revision;
  }, session.revision, () => {});

  // Heightmaps load asynchronously whenever the scene's reference changes.
  let heightmapKey = 'null';
  async function syncHeightmap(scene) {
    const reference = scene.terrain.heightmap ?? null;
    const key = JSON.stringify(reference);
    if (key === heightmapKey) {
      return;
    }
    heightmapKey = key;
    try {
      if (reference) {
        renderer.setHeightmap(await loadHeightmap(reference, token));
      } else {
        renderer.clearHeightmap();
      }
    } catch (error) {
      showMessage(error);
    }
  }

  const bindings = [];

  function apply({ moving = false, save = true } = {}) {
    const scene = history.value;
    if (aspectOf(scene) !== framedAspect) {
      layoutFrame();
    }
    renderer.setScene(scene, { moving });
    for (const bind of bindings) {
      bind(scene);
    }
    void syncHeightmap(scene);
    if (save) {
      autosave.enqueue(scene);
    }
    $('undo').disabled = !history.canUndo;
    $('redo').disabled = !history.canRedo;
    if (document.activeElement !== $('title')) {
      $('title').value = scene.title;
    }
  }

  function edit(change, options) {
    if (history.edit(change)) {
      apply(options);
    }
  }

  function replace(scene) {
    history.end();
    history.replace(scene);
    apply();
  }

  // --- Labs --------------------------------------------------------------------------

  // Camera drags, wheel zooms, flying and slider drags; galleries wait until they end.
  let interacting = 0;
  const startInteraction = () => {
    interacting++;
  };
  const endInteraction = () => {
    interacting = Math.max(0, interacting - 1);
    scheduleGallery();
  };

  // live: edits apply while dragging. Otherwise (terrain) they apply on release.
  function sliderFor(spec) {
    let pending = null;
    const handle = slider(spec, {
      begin: () => {
        history.begin();
        startInteraction();
      },
      input: value => {
        if (spec.live) {
          edit(draft => set(draft, spec.path, value), { moving: true });
        } else {
          pending = value;
        }
      },
      end: () => {
        if (!spec.live && pending !== null) {
          edit(draft => set(draft, spec.path, pending));
          pending = null;
        }
        history.end();
        apply();
        endInteraction();
      },
    });
    bindings.push(scene => handle.set(get(scene, spec.path)));
    return handle.node;
  }

  // A drag that edits the scene live and lands as one undo step.
  function gesture(change) {
    return {
      begin: () => {
        history.begin();
        startInteraction();
      },
      input: value => edit(draft => change(draft, value), { moving: true }),
      end: () => {
        history.end();
        apply();
        endInteraction();
      },
    };
  }

  const aspect = () => canvas.clientWidth / Math.max(1, canvas.clientHeight);

  // Framing guides over the view: none, rule of thirds or golden ratio (G cycles them).
  let guideMode = GUIDE_MODES.includes(remembered('guides', 'none')) ? remembered('guides', 'none') : 'none';
  function setGuides(mode) {
    guideMode = mode;
    $('guides').dataset.mode = mode;
    remember('guides', mode);
    for (const bind of bindings) {
      bind(history.value);
    }
  }
  $('guides').dataset.mode = guideMode;

  // Moves the camera smoothly to `view` (position, target, focal length) as one undo step.
  function flyTo(view, duration) {
    const start = history.value.camera;
    const end = { position: [...view.position], target: [...view.target], focalLength: view.focalLength };
    history.begin();
    startInteraction();
    const began = performance.now();
    const blend = (a, b, t) => a + (b - a) * t;
    const step = now => {
      const t = Math.min(1, (now - began) / duration);
      const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
      moveCamera(() => ({
        position: start.position.map((value, i) => blend(value, end.position[i], eased)),
        target: start.target.map((value, i) => blend(value, end.target[i], eased)),
        focalLength: Math.round(blend(start.focalLength, end.focalLength, eased) * 10) / 10,
      }));
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        moveCamera(() => end);
        history.end();
        apply();
        endInteraction();
      }
    };
    requestAnimationFrame(step);
  }

  // Placing the sun: the next drag in the view moves the sun to wherever it points.
  let placingSun = false;
  function setPlacingSun(on) {
    placingSun = on;
    canvas.classList.toggle('placing-sun', on);
    for (const bind of bindings) {
      bind(history.value);
    }
  }

  const labs = buildLabs({
    history,
    edit,
    replace,
    validate,
    presets,
    bind: binding => bindings.push(binding),
    sliderFor,
    gesture,
    viewHeading: camera => viewHeading(camera, aspect()),
    actions: {
      placeSun: () => setPlacingSun(!placingSun),
      placingSun: () => placingSun,
      flyTo: view => flyTo(view, FLY_MS),
      guides: () => guideMode,
      setGuides,
      erodeMore: () => renderer.erodeMore(),
      importHeightmap: () => $('heightmap-file').click(),
      proceduralTerrain: () => edit(draft => {
        delete draft.terrain.heightmap;
      }),
      setViewMode: mode => renderer.setViewMode(mode),
    },
  });

  const rail = $('rail');
  const drawer = $('drawer');
  const railButtons = new Map();
  labs.forEach((lab, index) => {
    const item = element('button', 'rail-item');
    item.type = 'button';
    item.title = `${lab.title} (${index + 1})`;
    item.setAttribute('aria-controls', 'drawer');
    item.setAttribute('aria-expanded', 'false');
    item.append(icon(lab.icon), element('span', 'rail-label', lab.title.split(' ')[0]));
    item.addEventListener('click', () => (openLab === lab ? closeLab() : showLab(lab)));
    rail.append(item);
    railButtons.set(lab, item);
  });
  $('drawer-close-slot').replaceWith(iconButton('close', 'Close (Esc)', () => closeLab()));
  const randomizeButton = iconButton('dice', 'Randomize', () => {
    const id = openLab?.id;
    if (RANDOMIZERS[id]) {
      const seed = Math.floor(Math.random() * 2 ** 32);
      edit(draft => Object.assign(draft, randomize(id, draft, seed)));
    }
  });
  $('drawer-randomize-slot').replaceWith(randomizeButton);

  let openLab = null;
  function showLab(lab) {
    openLab = lab;
    $('drawer-title').textContent = lab.title;
    randomizeButton.hidden = !RANDOMIZERS[lab.id];
    randomizeButton.title = `Randomize ${lab.title.toLowerCase()}`;
    $('drawer-body').replaceChildren(lab.node);
    drawer.hidden = false;
    for (const [entry, item] of railButtons) {
      item.classList.toggle('active', entry === lab);
      item.setAttribute('aria-expanded', String(entry === lab));
    }
    showCachedThumbnails();
    scheduleGallery(0);
    $('tip').hidden = true;
    layoutFrame();
  }
  function closeLab() {
    openLab = null;
    drawer.hidden = true;
    layoutFrame();
    for (const item of railButtons.values()) {
      item.classList.remove('active');
      item.setAttribute('aria-expanded', 'false');
    }
  }

  // Thumbnails for the open gallery: cached ones show at once, the rest render once the
  // view is still. A newer scene supersedes a batch that is still rendering.
  const thumbnails = new Thumbnails(renderer);
  let galleryTimer = null;
  let galleryBusy = false;
  function showCachedThumbnails() {
    if (!openLab?.variants) {
      return [];
    }
    const variants = openLab.variants(history.value);
    for (const variant of variants) {
      (variant.gallery ?? openLab.gallery).show(variant.id, thumbnails.get(variant.scene));
    }
    return variants;
  }
  function scheduleGallery(delay = GALLERY_DELAY_MS) {
    clearTimeout(galleryTimer);
    if (openLab?.variants) {
      galleryTimer = setTimeout(refreshGallery, delay);
    }
  }
  async function refreshGallery() {
    if (!openLab?.variants) {
      return;
    }
    if (galleryBusy || interacting > 0 || renderer.stats.building) {
      scheduleGallery();
      return;
    }
    const lab = openLab;
    const variants = showCachedThumbnails();
    if (variants.every(variant => thumbnails.get(variant.scene))) {
      return;
    }
    galleryBusy = true;
    let rendered = false;
    try {
      rendered = await thumbnails.render(variants.map(variant => variant.scene));
    } catch (error) {
      console.error(error);
    } finally {
      galleryBusy = false;
    }
    for (const variant of variants) {
      (variant.gallery ?? lab.gallery).show(variant.id, thumbnails.get(variant.scene));
    }
    const key = list => JSON.stringify(list.map(variant => [variant.id, variant.scene]));
    if (!rendered || lab !== openLab || key(lab.variants(history.value)) !== key(variants)) {
      scheduleGallery();
    }
  }
  bindings.push(() => {
    showCachedThumbnails();
    scheduleGallery();
  });

  // --- Camera navigation -------------------------------------------------------------

  const moveCamera = change => edit(draft => {
    draft.camera = change(draft.camera);
  }, { moving: true });

  let drag = null;
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', event => {
    canvas.focus();
    canvas.setPointerCapture(event.pointerId);
    if (regionMode) {
      startMarquee(event);
      return;
    }
    canvas.classList.add('dragging');
    drag = { x: event.clientX, y: event.clientY, panning: event.shiftKey || event.button === 2, sun: placingSun || event.altKey };
    history.begin();
    startInteraction();
    if (drag.sun) {
      moveSun(event);
    }
  });

  // The sun goes where the pointer looks.
  function moveSun(event) {
    const box = canvas.getBoundingClientRect();
    const ndcX = ((event.clientX - box.left) / box.width) * 2 - 1;
    const ndcY = 1 - ((event.clientY - box.top) / box.height) * 2;
    const { elevation, azimuth } = sunAngles(viewRay(history.value.camera, aspect(), ndcX, ndcY));
    edit(draft => {
      draft.sun.elevation = Math.round(Math.min(SUN_LIMITS.max, Math.max(SUN_LIMITS.min, elevation)) * 10) / 10;
      draft.sun.azimuth = Math.round(azimuth * 2) / 2;
    }, { moving: true });
  }
  canvas.addEventListener('pointermove', event => {
    if (marquee) {
      moveMarquee(event);
      return;
    }
    if (!drag) {
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (drag.sun) {
      moveSun(event);
    } else if (drag.panning) {
      const camera = history.value.camera;
      const metresPerPixel = 2 * distanceToTarget(camera) * tanHalfFov(camera.focalLength, aspect()) / canvas.clientHeight;
      moveCamera(c => pan(c, -dx * metresPerPixel, dy * metresPerPixel, aspect()));
    } else {
      moveCamera(c => orbit(c, -dx * ORBIT_SPEED, dy * ORBIT_SPEED));
    }
  });
  const endDrag = () => {
    if (marquee) {
      finishMarquee();
      return;
    }
    if (drag) {
      const placed = drag.sun && placingSun;
      drag = null;
      canvas.classList.remove('dragging');
      history.end();
      apply();
      endInteraction();
      if (placed) {
        setPlacingSun(false);
      }
    }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // Region renders: R (or the Region button), then drag a box. The box renders at full
  // resolution over the view until the scene or camera changes.
  let regionMode = false;
  let marquee = null;
  const regionButton = iconButton('region', 'Preview an area at full quality (R)', () => setRegionMode(!regionMode));
  $('region-button-slot').replaceWith(regionButton);
  function setRegionMode(on) {
    regionMode = on;
    canvas.classList.toggle('drawing-region', on);
    regionButton.setAttribute('aria-pressed', String(on));
  }
  const pointIn = event => {
    const box = canvas.getBoundingClientRect();
    return [Math.min(box.width, Math.max(0, event.clientX - box.left)), Math.min(box.height, Math.max(0, event.clientY - box.top))];
  };
  function startMarquee(event) {
    const start = pointIn(event);
    marquee = { start, end: start };
    renderer.setRegion(null);
    moveMarquee(event);
    $('marquee').hidden = false;
  }
  function placeBox(node, [x0, y0, x1, y1]) {
    const frame = canvas.getBoundingClientRect();
    node.style.left = `${frame.left + x0}px`;
    node.style.top = `${frame.top + y0}px`;
    node.style.width = `${x1 - x0}px`;
    node.style.height = `${y1 - y0}px`;
  }
  const marqueeBox = () => [
    Math.min(marquee.start[0], marquee.end[0]), Math.min(marquee.start[1], marquee.end[1]),
    Math.max(marquee.start[0], marquee.end[0]), Math.max(marquee.start[1], marquee.end[1]),
  ];
  function moveMarquee(event) {
    marquee.end = pointIn(event);
    placeBox($('marquee'), marqueeBox());
  }
  function finishMarquee() {
    const box = marqueeBox();
    marquee = null;
    $('marquee').hidden = true;
    setRegionMode(false);
    if (box[2] - box[0] < 16 || box[3] - box[1] < 16) {
      return;
    }
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    regionBox = box;
    renderer.setRegion([box[0] / width, box[1] / height, box[2] / width, box[3] / height]);
  }
  let regionBox = null;
  $('region-clear-slot').replaceWith(iconButton('close', 'Clear region (Esc)', () => renderer.setRegion(null)));
  renderer.subscribe(stats => {
    const frame = $('region-frame');
    if (!stats.region || !regionBox) {
      frame.hidden = true;
      return;
    }
    frame.hidden = false;
    placeBox(frame, regionBox);
    const { samples, target } = stats.region;
    $('region-label').textContent = samples >= target ? 'Full quality' : `${samples} / ${target}`;
  });

  // Double-click: orbit around the point under the pointer from now on.
  canvas.addEventListener('dblclick', async event => {
    const box = canvas.getBoundingClientRect();
    const point = await renderer.pick((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
    if (!point) {
      return;
    }
    const start = history.value.camera;
    const end = lookAt(start, point);
    if (end !== start) {
      flyTo(end, FOCUS_MS);
    }
  });

  let wheelTimer = null;
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    if (wheelTimer === null) {
      history.begin();
      startInteraction();
    }
    clearTimeout(wheelTimer);
    moveCamera(c => dolly(c, Math.exp(event.deltaY * WHEEL_SPEED)));
    wheelTimer = setTimeout(() => {
      wheelTimer = null;
      history.end();
      apply();
      endInteraction();
    }, WHEEL_SETTLE_MS);
  }, { passive: false });

  // W/S move along the view, A/D strafe, Q/E sink and rise; speed follows the view distance.
  const held = new Set();
  let lastFly = 0;
  const fly = now => {
    if (held.size === 0) {
      history.end();
      apply();
      endInteraction();
      return;
    }
    const seconds = Math.min(0.05, (now - lastFly) / 1000);
    lastFly = now;
    const camera = history.value.camera;
    const speed = Math.max(150, Math.min(4000, distanceToTarget(camera) * 0.8)) * seconds;
    const forward = (held.has('w') ? 1 : 0) - (held.has('s') ? 1 : 0);
    const right = (held.has('d') ? 1 : 0) - (held.has('a') ? 1 : 0);
    const up = (held.has('e') ? 1 : 0) - (held.has('q') ? 1 : 0);
    moveCamera(c => pan(advance(c, forward * speed), right * speed, up * speed, aspect()));
    requestAnimationFrame(fly);
  };
  canvas.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if (!'wasdqe'.includes(key) || key.length !== 1 || event.metaKey || event.ctrlKey) {
      return;
    }
    event.preventDefault();
    if (held.size === 0) {
      history.begin();
      startInteraction();
      lastFly = performance.now();
      held.add(key);
      requestAnimationFrame(fly);
    } else {
      held.add(key);
    }
  });
  canvas.addEventListener('keyup', event => held.delete(event.key.toLowerCase()));
  canvas.addEventListener('blur', () => held.clear());

  // --- Files and history -------------------------------------------------------------

  $('title').addEventListener('change', () => edit(draft => {
    draft.title = $('title').value.trim().slice(0, 80) || 'Untitled landscape';
  }));
  const undo = iconButton('undo', 'Undo (⌘Z)', () => {
    if (history.undo()) {
      apply();
    }
  });
  const redo = iconButton('redo', 'Redo (⇧⌘Z)', () => {
    if (history.redo()) {
      apply();
    }
  });
  undo.id = 'undo';
  redo.id = 'redo';
  $('history-buttons').append(undo, redo);
  $('brand').prepend(icon('brand'));

  // The File menu and the help popover close on Escape or a click elsewhere.
  const popups = [
    { button: $('file-menu'), panel: $('file-items') },
    { button: iconButton('help', 'Help', () => {}), panel: $('help') },
    { button: $('render'), panel: $('render-options') },
  ];
  $('help-button-slot').replaceWith(popups[1].button);
  const closePopups = except => {
    for (const popup of popups) {
      if (popup !== except) {
        popup.panel.hidden = true;
        popup.button.setAttribute('aria-expanded', 'false');
      }
    }
  };
  for (const popup of popups) {
    popup.button.addEventListener('click', event => {
      event.stopPropagation();
      closePopups(popup);
      popup.panel.hidden = !popup.panel.hidden;
      popup.button.setAttribute('aria-expanded', String(!popup.panel.hidden));
    });
  }
  document.addEventListener('click', event => {
    if (!event.target.closest('.menu-items, .popover, .render-progress')) {
      closePopups();
    }
  });
  $('file-items').addEventListener('click', () => closePopups());
  $('new-scene').addEventListener('click', () => replace(defaultScene()));
  $('open-scene').addEventListener('click', () => $('scene-file').click());
  $('scene-file').addEventListener('change', async () => {
    const file = $('scene-file').files[0];
    $('scene-file').value = '';
    if (!file) {
      return;
    }
    try {
      if (file.size > MAX_FILE_BYTES) {
        throw new Error('Scene files are limited to 20 MiB.');
      }
      const response = await api('/api/project/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: await file.arrayBuffer(),
      });
      replace(validate(await response.json()));
    } catch (error) {
      showMessage(error);
    }
  });
  $('save-scene').addEventListener('click', async () => {
    try {
      const scene = history.value;
      const response = await api('/api/project/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: JSON.stringify(scene),
      });
      download(await response.blob(), fileName(scene.title, 'lithosky'));
    } catch (error) {
      showMessage(error);
    }
  });
  $('heightmap-file').addEventListener('change', async () => {
    const file = $('heightmap-file').files[0];
    $('heightmap-file').value = '';
    if (!file) {
      return;
    }
    try {
      const { reference, size, samples } = await importHeightmap(file);
      heightmapKey = JSON.stringify(reference);
      renderer.setHeightmap({ size, samples });
      edit(draft => {
        draft.terrain.heightmap = reference;
      });
    } catch (error) {
      showMessage(error);
    }
  });

  // --- Render ------------------------------------------------------------------------

  // Render refines the final image in the viewport, with a progress ring and Cancel, then
  // saves it. Edits wait until it finishes.
  const RING = 2 * Math.PI * 15;
  let rendering = null;
  const progressText = $('render-text');
  const ring = $('render-ring');
  ring.style.strokeDasharray = `${RING}`;
  let progressTimer = null;
  function showProgress(text, fraction, finished = false) {
    clearTimeout(progressTimer);
    $('render-progress').hidden = false;
    $('render-progress').classList.toggle('finished', finished);
    $('render-cancel').hidden = finished;
    progressText.textContent = text;
    ring.style.strokeDashoffset = `${RING * (1 - fraction)}`;
    if (finished) {
      progressTimer = setTimeout(() => {
        $('render-progress').hidden = true;
      }, 3500);
    }
  }
  async function startRender() {
    if (rendering) {
      return;
    }
    closePopups();
    const options = $('render-options');
    const longEdge = Number(options.querySelector('input[name="export-size"]:checked').value);
    const samples = Number(options.querySelector('input[name="export-samples"]:checked').value);
    rendering = new AbortController();
    document.body.classList.add('rendering');
    const began = performance.now();
    showProgress('Starting…', 0);
    try {
      while (renderer.paused) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const blob = await renderer.capture({
        longEdge,
        samples,
        preview: true,
        signal: rendering.signal,
        onProgress: fraction => {
          const seconds = (performance.now() - began) / 1000;
          const left = fraction > 0.02 ? Math.max(0, Math.round(seconds / fraction * (1 - fraction))) : null;
          showProgress(`Rendering ${Math.round(fraction * 100)}%${left === null ? '' : ` · ${left} s left`}`, fraction);
        },
      });
      const name = fileName(history.value.title, 'png');
      download(blob, name);
      showProgress(`Saved ${name}`, 1, true);
    } catch (error) {
      if (error?.name === 'AbortError') {
        showProgress('Render cancelled', 0, true);
      } else {
        $('render-progress').hidden = true;
        showMessage(error);
      }
    } finally {
      rendering = null;
      document.body.classList.remove('rendering');
    }
  }
  $('render-start').addEventListener('click', startRender);
  $('render-cancel').addEventListener('click', () => rendering?.abort());

  // --- Status, shortcuts and recovery ------------------------------------------------

  renderer.subscribe(stats => {
    if (renderer.lost) {
      $('status').textContent = renderer.lost;
    } else if (stats.building) {
      $('status').textContent = `Building terrain ${Math.round(stats.progress * 100)}%`;
    } else {
      const rate = (stats.pathsPerSecond / 1e6).toFixed(0);
      $('status').textContent = `${stats.samples} passes · ${stats.seconds.toFixed(1)} s`;
      $('status').title = `Each pass adds one sample per pixel. ${rate} M paths/s at ${stats.renderSize.join(' × ')} on ${stats.adapter}`;
    }
  });

  const typing = target => target instanceof HTMLInputElement || target instanceof HTMLSelectElement
    || target instanceof HTMLTextAreaElement;
  document.addEventListener('keydown', event => {
    const command = event.metaKey || event.ctrlKey;
    if (!command) {
      if (event.altKey || typing(event.target)) {
        return;
      }
      if (rendering) {
        if (event.key === 'Escape') {
          rendering.abort();
        }
        return;
      }
      if (!welcome.hidden) {
        if (event.key === 'Escape') {
          closeWelcome();
        }
        return;
      }
      const key = event.key.toLowerCase();
      const number = Number(key);
      if (Number.isInteger(number) && number >= 1 && number <= labs.length) {
        const lab = labs[number - 1];
        if (openLab === lab) {
          closeLab();
        } else {
          showLab(lab);
        }
      } else if (key === 'escape') {
        closePopups();
        if (placingSun) {
          setPlacingSun(false);
        } else if (regionMode) {
          setRegionMode(false);
        } else if (renderer.region) {
          renderer.setRegion(null);
        } else {
          closeLab();
        }
      } else if (key === 'r') {
        setRegionMode(!regionMode);
      } else if (key === 'g') {
        setGuides(GUIDE_MODES[(GUIDE_MODES.indexOf(guideMode) + 1) % GUIDE_MODES.length]);
      } else if (key === 'h') {
        document.body.classList.toggle('chrome-hidden');
        layoutFrame();
      }
      return;
    }
    if (typing(event.target) || rendering) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'z') {
      event.preventDefault();
      if (event.shiftKey ? history.redo() : history.undo()) {
        apply();
      }
    } else if (key === 's') {
      event.preventDefault();
      $('save-scene').click();
    }
  });

  window.addEventListener('beforeunload', () => {
    void autosave.flush();
  });

  // --- Onboarding --------------------------------------------------------------------

  // First run (no saved work yet): a welcome card with the scenes to start from, then one
  // tip pointing at the labs. Help can bring the welcome back.
  const welcome = $('welcome');
  let welcomeScenes = null;
  let firstRun = false;
  function showWelcome() {
    closePopups();
    closeLab();
    if (!welcomeScenes) {
      welcomeScenes = gallery(presets.map(preset => ({
        id: preset.id,
        label: preset.name,
        image: `scenes/thumbnails/${preset.id}.jpg`,
      })), id => {
        replace(validate(presets.find(preset => preset.id === id).scene));
        closeWelcome();
      });
      welcomeScenes.node.classList.add('four');
      $('welcome-scenes').append(welcomeScenes.node);
    }
    welcome.hidden = false;
    welcome.querySelector('.tile-pick')?.focus();
  }
  function closeWelcome({ tip = true } = {}) {
    if (welcome.hidden) {
      return;
    }
    welcome.hidden = true;
    canvas.focus();
    if (tip && firstRun) {
      firstRun = false;
      $('tip').hidden = false;
    }
  }
  const closeTip = () => {
    $('tip').hidden = true;
  };
  $('welcome-close').addEventListener('click', () => closeWelcome());
  $('show-welcome').addEventListener('click', showWelcome);
  $('tip-close').addEventListener('click', closeTip);
  welcome.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeWelcome();
    }
  });

  // The drawer's ? shows a line about the open lab.
  $('drawer-help-slot').replaceWith(iconButton('help', 'About this lab', () => {
    drawer.classList.toggle('show-help');
  }));

  apply({ save: false });

  try {
    const { records } = await (await api('/api/recovery')).json();
    const latest = records?.[0];
    if (!latest) {
      firstRun = true;
      showWelcome();
    }
    if (latest) {
      $('recovery-time').textContent = new Date(latest.modified).toLocaleString();
      $('recovery').hidden = false;
      $('restore-recovery').addEventListener('click', async () => {
        $('recovery').hidden = true;
        try {
          replace(validate(await (await api(`/api/recovery/${latest.id}`)).json()));
        } catch (error) {
          showMessage(error);
        }
      }, { once: true });
      $('dismiss-recovery').addEventListener('click', () => {
        $('recovery').hidden = true;
      }, { once: true });
    }
  } catch {
    // Recovery is optional; the studio works without it.
  }

  window.lithosky = {
    renderer,
    history,
    get scene() {
      return history.value;
    },
    open: scene => {
      closeWelcome({ tip: false });
      replace(validate(scene));
    },
    dismissWelcome: () => {
      closeWelcome({ tip: false });
      closeTip();
    },
    openLab: id => {
      const lab = labs.find(entry => entry.id === id);
      if (lab) {
        showLab(lab);
      }
    },
    closeLab,
    setGuides,
    presets,
  };
}

start().catch(showMessage);
