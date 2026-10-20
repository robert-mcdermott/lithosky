// SPDX-License-Identifier: Apache-2.0
// The studio: a full-window progressive render with a compact control panel. Every edit
// goes through History (undo/redo) and Autosave (crash recovery); the renderer picks up the
// resulting scene.

import { advance, distanceToTarget, dolly, orbit, pan, tanHalfFov } from './render/camera.js';
import { Renderer, VIEW_MODES } from './render/renderer.js';
import { Autosave } from './scene/autosave.js';
import { defaultScene, imageSettingsOf, validateScene } from './scene/document.js';
import { History } from './scene/history.js';
import { importHeightmap, loadHeightmap } from './terrain/heightmap.js';
import { button, choice, element, section, slider, toggle } from './ui/controls.js';

const $ = id => document.getElementById(id);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ORBIT_SPEED = 0.004;
const WHEEL_SPEED = 0.0015;
const WHEEL_SETTLE_MS = 300;

const degrees = value => `${Math.round(value)}°`;
const times = value => `${value.toFixed(2)}×`;
const plain = value => value.toFixed(2);

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
    return valid;
  };
  const history = new History(presets[0]?.scene ?? defaultScene(), validate);
  const canvas = $('view');
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

  // --- Panel -------------------------------------------------------------------------

  const panel = $('panel');

  // live: edits apply while dragging. Otherwise (terrain) they apply on release.
  function sliderFor(spec) {
    let pending = null;
    const handle = slider(spec, {
      begin: () => history.begin(),
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
      },
    });
    bindings.push(scene => handle.set(get(scene, spec.path)));
    return handle.node;
  }

  const presetSection = section('Start from');
  const presetGrid = element('div', 'presets');
  for (const preset of presets) {
    presetGrid.append(button(preset.name, () => replace(validate(preset.scene))));
  }
  presetSection.body.append(presetGrid);

  const terrainSection = section('Terrain');
  const seedLabel = element('span', 'control-name');
  bindings.push(scene => {
    seedLabel.textContent = `Seed ${scene.terrain.seed}`;
  });
  const reseed = seed => edit(draft => {
    draft.terrain.seed = seed;
  });
  terrainSection.body.append(
    element('div', 'row'),
    sliderFor({ path: 'terrain.relief', label: 'Relief', min: 800, max: 6000, step: 50, format: v => `${Math.round(v)} m` }),
    sliderFor({ path: 'terrain.drainage', label: 'Drainage', min: 0, max: 3, step: 0.05, format: times }),
    sliderFor({ path: 'terrain.rills', label: 'Gullies', min: 0, max: 3, step: 0.05, format: times }),
    sliderFor({ path: 'terrain.talus', label: 'Scree', min: 0, max: 3, step: 0.05, format: times }),
  );
  const seedRow = terrainSection.body.firstChild;
  seedRow.append(
    seedLabel,
    button('Previous', () => reseed(Math.max(0, history.value.terrain.seed - 1))),
    button('Next', () => reseed(history.value.terrain.seed + 1)),
    button('Random', () => reseed(Math.floor(Math.random() * 100000))),
  );
  terrainSection.body.append(element('div', 'row'));
  terrainSection.body.lastChild.append(
    button('Erode more', () => renderer.erodeMore()),
    button('Heightmap…', () => $('heightmap-file').click()),
    button('Procedural', () => edit(draft => {
      delete draft.terrain.heightmap;
    })),
  );

  const skySection = section('Sun & sky');
  skySection.body.append(
    sliderFor({ path: 'sun.elevation', label: 'Sun height', min: -5, max: 70, step: 0.1, live: true, format: degrees }),
    sliderFor({ path: 'sun.azimuth', label: 'Sun direction', min: 0, max: 360, step: 0.5, live: true, format: degrees }),
    sliderFor({ path: 'atmosphere.haze', label: 'Haze', min: 0, max: 5, step: 0.05, live: true, format: plain }),
    sliderFor({ path: 'atmosphere.fog', label: 'Valley fog', min: 0, max: 4, step: 0.05, live: true, format: plain }),
  );

  const cameraSection = section('Camera');
  cameraSection.body.append(
    sliderFor({ path: 'camera.focalLength', label: 'Lens', min: 14, max: 200, step: 1, live: true, format: v => `${Math.round(v)} mm` }),
  );

  const imageSection = section('Image');
  const look = choice({
    label: 'Look',
    options: [['punchy', 'Rich'], ['none', 'Natural'], ['cinematic', 'Cinematic'], ['soft', 'Soft'], ['mono', 'Black & white']],
  }, value => edit(draft => {
    draft.image.look = value;
  }));
  bindings.push(scene => look.set(scene.image.look));
  const autoExposure = toggle({ label: 'Auto exposure' }, checked => edit(draft => {
    draft.image.autoExposure = checked;
  }));
  bindings.push(scene => autoExposure.set(scene.image.autoExposure));
  const show = choice({
    label: 'Show',
    options: [['image', 'Image'], ['albedo', 'Colour'], ['flow', 'Drainage'], ['sediment', 'Sediment'],
      ['curvature', 'Curvature'], ['normals', 'Normals']],
  }, value => renderer.setViewMode(VIEW_MODES[value]));
  const amount = value => `${Math.round(value * 100)}%`;
  imageSection.body.append(
    look.node,
    autoExposure.node,
    sliderFor({ path: 'image.exposure', label: 'Exposure', min: -4, max: 4, step: 0.1, live: true, format: v => `${v > 0 ? '+' : ''}${v.toFixed(1)} EV` }),
    sliderFor({ path: 'image.warmth', label: 'Warmth', min: -1, max: 1, step: 0.02, live: true, format: v => `${v > 0 ? '+' : ''}${Math.round(v * 100)}` }),
    sliderFor({ path: 'image.bloom', label: 'Glow', min: 0, max: 1, step: 0.01, live: true, format: amount }),
    sliderFor({ path: 'image.vignette', label: 'Vignette', min: 0, max: 1, step: 0.01, live: true, format: amount }),
    sliderFor({ path: 'image.grain', label: 'Grain', min: 0, max: 1, step: 0.01, live: true, format: amount }),
    show.node,
  );

  panel.append(presetSection.node, terrainSection.node, skySection.node, cameraSection.node, imageSection.node);

  // --- Camera navigation -------------------------------------------------------------

  const aspect = () => canvas.clientWidth / Math.max(1, canvas.clientHeight);
  const moveCamera = change => edit(draft => {
    draft.camera = change(draft.camera);
  }, { moving: true });

  let drag = null;
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', event => {
    canvas.focus();
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('dragging');
    drag = { x: event.clientX, y: event.clientY, panning: event.shiftKey || event.button === 2 };
    history.begin();
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag) {
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (drag.panning) {
      const camera = history.value.camera;
      const metresPerPixel = 2 * distanceToTarget(camera) * tanHalfFov(camera.focalLength, aspect()) / canvas.clientHeight;
      moveCamera(c => pan(c, -dx * metresPerPixel, dy * metresPerPixel, aspect()));
    } else {
      moveCamera(c => orbit(c, -dx * ORBIT_SPEED, dy * ORBIT_SPEED));
    }
  });
  const endDrag = () => {
    if (drag) {
      drag = null;
      canvas.classList.remove('dragging');
      history.end();
      apply();
    }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  let wheelTimer = null;
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    if (wheelTimer === null) {
      history.begin();
    }
    clearTimeout(wheelTimer);
    moveCamera(c => dolly(c, Math.exp(event.deltaY * WHEEL_SPEED)));
    wheelTimer = setTimeout(() => {
      wheelTimer = null;
      history.end();
      apply();
    }, WHEEL_SETTLE_MS);
  }, { passive: false });

  // W/S move along the view, A/D strafe, Q/E sink and rise; speed follows the view distance.
  const held = new Set();
  let lastFly = 0;
  const fly = now => {
    if (held.size === 0) {
      history.end();
      apply();
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
  $('undo').addEventListener('click', () => {
    if (history.undo()) {
      apply();
    }
  });
  $('redo').addEventListener('click', () => {
    if (history.redo()) {
      apply();
    }
  });
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

  // --- Export ------------------------------------------------------------------------

  const dialog = $('export-dialog');
  let exporting = false;
  $('export-image').addEventListener('click', () => dialog.showModal());
  dialog.addEventListener('cancel', event => {
    if (exporting) {
      event.preventDefault();
    }
  });
  $('export-start').addEventListener('click', async () => {
    if (exporting) {
      return;
    }
    exporting = true;
    const progress = $('export-progress');
    progress.hidden = false;
    progress.value = 0;
    $('export-start').disabled = true;
    $('export-cancel').disabled = true;
    try {
      const blob = await renderer.capture({
        longEdge: Number($('export-size').value),
        samples: Number($('export-samples').value),
        onProgress: value => {
          progress.value = value;
        },
      });
      download(blob, fileName(history.value.title, 'png'));
      dialog.close();
    } catch (error) {
      showMessage(error);
    } finally {
      exporting = false;
      progress.hidden = true;
      $('export-start').disabled = false;
      $('export-cancel').disabled = false;
    }
  });

  // --- Status, shortcuts and recovery ------------------------------------------------

  renderer.subscribe(stats => {
    if (renderer.lost) {
      $('status').textContent = renderer.lost;
    } else if (stats.building) {
      $('status').textContent = `Building terrain ${Math.round(stats.progress * 100)}%`;
    } else {
      const rate = (stats.pathsPerSecond / 1e6).toFixed(0);
      $('status').textContent = `${stats.samples} samples · ${stats.seconds.toFixed(1)} s · ${rate} M paths/s`;
    }
  });

  document.addEventListener('keydown', event => {
    const command = event.metaKey || event.ctrlKey;
    if (!command || event.target instanceof HTMLInputElement) {
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

  $('toggle-panel').addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    $('toggle-panel').setAttribute('aria-expanded', String(!panel.hidden));
  });

  window.addEventListener('beforeunload', () => {
    void autosave.flush();
  });

  apply({ save: false });

  try {
    const { records } = await (await api('/api/recovery')).json();
    const latest = records?.[0];
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
    open: scene => replace(validate(scene)),
    presets,
  };
}

start().catch(showMessage);
