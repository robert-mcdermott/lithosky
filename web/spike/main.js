// SPDX-License-Identifier: Apache-2.0
// Lithosky visual spike: GPU terrain with erosion, a direct heightfield path tracer, a
// Hillaire sky and AgX, all on one persistent device with no per-frame CPU waits.

import { alpineQuiet, overviewCamera, sunDirection } from './camera.js';
import { buildControls } from './controls.js';
import { Display } from './display.js';
import { createDevice } from '../gpu/device.js';
import { SUN_ANGULAR_RADIUS, Sky } from './sky.js';
import { importHeightmap } from '../terrain/heightmap.js';
import { terrainSettings } from '../terrain/settings.js';
import { FAR_SIZE, FAR_SPACING, NEAR_EXTENT, Terrain } from '../terrain/terrain.js';
import { Tracer } from './tracer.js';

const WIDTH = 1920;
const HEIGHT = 1080;
const TERRAIN_STAGES_PER_FRAME = 4;
const MAX_SAMPLES_PER_FRAME = 12;
const MAX_FRAMES_IN_FLIGHT = 2;
const FOG_HEIGHT = 250;
const FOG_FALLOFF = 1 / 180;
const FOG_DENSITY = 1 / 8000;
const SUN_ILLUMINANCE = [1, 1, 1];

const GOLDEN_HOUR = { sunElevation: 6, sunAzimuth: 298, haze: 1.6, fog: 0.5, exposure: 1.8, look: 'punchy' };

// The study's own midday sun needs less exposure than golden hour.
const ALPINE_QUIET_LIGHT = { exposure: -0.5, fog: 0.3 };

const DEFAULTS = {
  ...GOLDEN_HOUR,
  seed: 1847,
  relief: 3200,
  drainage: 1,
  rills: 1,
  camera: 'alpine',
  viewMode: 0,
  bounces: 2,
};

const TERRAIN_KEYS = ['seed', 'relief', 'drainage', 'rills'];

const VIEW_OPTIONS = [[0, 'Image'], [1, 'Albedo'], [2, 'Flow'], [3, 'Sediment'], [4, 'Curvature'], [5, 'Normals']];
const CAMERA_OPTIONS = [['alpine', 'Alpine quiet'], ['overview', 'Overview']];
const LOOK_OPTIONS = [['none', 'AgX'], ['punchy', 'AgX punchy']];

const degrees = value => `${value.toFixed(1)}°`;
const plain = value => value.toFixed(2);

function placeTerrain(camera) {
  const cameraXZ = [camera.position[0], camera.position[2]];
  const heading = [camera.forward[0], camera.forward[2]];
  const length = Math.hypot(...heading);
  const direction = heading.map(value => value / length);
  const ahead = NEAR_EXTENT / 2 - 2000;
  const centre = cameraXZ.map((value, i) => value + direction[i] * ahead);
  const farHalf = (FAR_SIZE - 1) * FAR_SPACING / 2;
  return {
    cameraXZ,
    centre,
    nearOrigin: centre.map(value => value - NEAR_EXTENT / 2),
    farOrigin: cameraXZ.map(value => value - farHalf),
    valleyOrigin: [camera.target[0], camera.target[2]],
    valleyDirection: direction,
  };
}

function showError(error) {
  const message = document.getElementById('message');
  message.textContent = error.message;
  message.hidden = false;
  console.error(error);
}

async function start() {
  const canvas = document.getElementById('view');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const { adapter, device } = await createDevice();
  device.lost.then(info => showError(new Error(`The GPU device was lost: ${info.message}`)));
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  const study = await alpineQuiet(WIDTH / HEIGHT);
  const placement = placeTerrain(study.camera);
  const cameras = {
    alpine: study.camera,
    overview: overviewCamera(study.camera, placement.centre, WIDTH / HEIGHT),
  };
  const terrainFrom = values => terrainSettings({
    seed: values.seed,
    relief: values.relief,
    drainage: values.drainage,
    rills: values.rills,
  });
  const [terrain, tracer] = await Promise.all([
    Terrain.create(device, placement, terrainFrom(DEFAULTS)),
    Tracer.create(device, WIDTH, HEIGHT),
  ]);
  const sky = await Sky.create(device, tracer.frameBuffer);
  tracer.bind(terrain, sky);
  const display = await Display.create(device, context, format, tracer.accumulation, WIDTH, HEIGHT);

  const state = { ...DEFAULTS };
  const stats = {
    adapter: adapter.info?.description || adapter.info?.vendor || 'unknown',
    samples: 0,
    completedSamples: 0,
    convergeSeconds: 0,
    erosionSeconds: null,
    pathsPerSecond: 0,
    samplesPerFrame: 1,
    firstSampleSeconds: null,
  };
  let sampleIndex = 0;
  let resetTime = performance.now();
  let terrainDirty = true;
  let skyDirty = true;
  let erosionStart = 0;
  let erosionActive = false;

  const view = () => ({
    camera: cameras[state.camera],
    sunDirection: sunDirection(state.sunElevation, state.sunAzimuth),
    sunRadius: SUN_ANGULAR_RADIUS,
    sunIlluminance: SUN_ILLUMINANCE,
    fogDensity: FOG_DENSITY * state.fog,
    fogHeight: FOG_HEIGHT,
    fogFalloff: FOG_FALLOFF,
    viewMode: state.viewMode,
    bounces: state.bounces,
    seed: state.seed,
  });

  const resetAccumulation = () => {
    sampleIndex = 0;
    stats.samplesPerFrame = 1;
    resetTime = performance.now();
    stats.completedSamples = 0;
    stats.firstSampleSeconds = null;
  };

  const apply = (key, value) => {
    state[key] = value;
    if (TERRAIN_KEYS.includes(key)) {
      terrainDirty = true;
    } else if (key === 'viewMode' || key === 'exposure' || key === 'look') {
      if (key === 'viewMode') {
        resetAccumulation();
      }
    } else {
      skyDirty = true;
    }
  };

  const erodeMore = () => {
    if (terrain.busy) {
      return;
    }
    terrain.erodeMore(0.5);
    erosionStart = performance.now();
    erosionActive = true;
    stats.erosionSeconds = null;
  };

  const heightmapInput = document.createElement('input');
  heightmapInput.type = 'file';
  heightmapInput.accept = '.png,.heightmap,application/zip';
  heightmapInput.hidden = true;
  document.body.append(heightmapInput);
  heightmapInput.addEventListener('change', async () => {
    const file = heightmapInput.files[0];
    heightmapInput.value = '';
    if (!file) {
      return;
    }
    try {
      const heights = await importHeightmap(file);
      terrain.setHeightmap({ ...heights, base: 150, relief: state.relief });
      terrainDirty = true;
      setValues({ camera: 'overview' });
    } catch (error) {
      showError(error);
    }
  });
  const useProcedural = () => {
    terrain.clearHeightmap();
    terrainDirty = true;
  };

  const studyLight = { ...ALPINE_QUIET_LIGHT, sunElevation: study.sun.elevation, sunAzimuth: study.sun.azimuth };
  let syncControls = () => {};
  const setValues = values => {
    for (const [key, value] of Object.entries(values)) {
      apply(key, value);
    }
    syncControls(values);
  };

  const specs = [
    { key: 'sunElevation', label: 'Sun elevation', min: -2, max: 45, step: 0.1, live: true, format: degrees },
    { key: 'sunAzimuth', label: 'Sun azimuth', min: 0, max: 360, step: 0.5, live: true, format: degrees },
    { key: 'haze', label: 'Haze', min: 0, max: 5, step: 0.05, live: true, format: plain },
    { key: 'fog', label: 'Valley fog', min: 0, max: 4, step: 0.05, live: true, format: plain },
    { key: 'exposure', label: 'Exposure', min: -4, max: 4, step: 0.1, live: true, format: v => `${v.toFixed(1)} EV` },
    { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, format: v => String(v) },
    { key: 'relief', label: 'Relief', min: 800, max: 6000, step: 50, format: v => `${Math.round(v)} m` },
    { key: 'drainage', label: 'Drainage', min: 0, max: 3, step: 0.05, format: v => `${v.toFixed(2)}×` },
    { key: 'rills', label: 'Rills', min: 0, max: 3, step: 0.05, format: v => `${v.toFixed(2)}×` },
    { type: 'button', label: 'Erode more', action: erodeMore },
    { type: 'button', label: 'Heightmap…', action: () => heightmapInput.click() },
    { type: 'button', label: 'Procedural', action: useProcedural },
    { key: 'camera', label: 'Camera', type: 'choice', options: CAMERA_OPTIONS, parse: String },
    { key: 'viewMode', label: 'View', type: 'choice', options: VIEW_OPTIONS, parse: Number },
    { key: 'look', label: 'Look', type: 'choice', options: LOOK_OPTIONS, parse: String },
    { type: 'button', label: 'Golden hour', action: () => setValues(GOLDEN_HOUR) },
    { type: 'button', label: 'Alpine quiet light', action: () => setValues(studyLight) },
    { type: 'button', label: 'Save PNG', action: () => savePng() },
  ];
  syncControls = buildControls(document.getElementById('controls'), specs, state, apply);
  const statsLine = document.getElementById('stats');

  async function savePng() {
    const url = await display.capturePng(state);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lithosky-spike-${state.seed}.png`;
    link.click();
  }

  const updateStats = now => {
    const seconds = (now - resetTime) / 1000;
    stats.samples = sampleIndex;
    stats.convergeSeconds = seconds;
    const erosion = erosionActive ? ` · building terrain ${Math.round(terrain.progress * 100)}%` : '';
    const rate = (stats.pathsPerSecond / 1e6).toFixed(1);
    statsLine.textContent = `${stats.completedSamples} spp · ${seconds.toFixed(1)} s · ${rate} M paths/s${erosion}`;
  };

  let paused = false;

  // Times each stage on its own, with the render loop paused. Used by the bench harness.
  const profile = async () => {
    paused = true;
    const time = async work => {
      await device.queue.onSubmittedWorkDone();
      const begin = performance.now();
      work();
      await device.queue.onSubmittedWorkDone();
      return performance.now() - begin;
    };
    const lighting = view();
    const timings = {
      terrainBuildMs: await time(() => {
        terrain.generate(terrainFrom(state));
        while (terrain.step()) {
          // Queue every stage at once; the timer waits for the GPU to finish them all.
        }
      }),
      skyMs: await time(() => sky.rebuild()),
      sampleMs: await time(() => tracer.sample(lighting, 1)),
      presentMs: await time(() => display.present(state)),
    };
    terrainDirty = true;
    paused = false;
    requestAnimationFrame(frame);
    return timings;
  };

  // Frames are queued without CPU waits; completion callbacks only bound how far ahead
  // the CPU may run, so slider changes show up within a frame or two.
  let framesInFlight = 0;

  const adaptSamples = latency => {
    if (terrain.busy || erosionActive) {
      stats.samplesPerFrame = 1;
    } else if (latency < 25 && stats.samplesPerFrame < MAX_SAMPLES_PER_FRAME) {
      stats.samplesPerFrame++;
    } else if (latency > 60 && stats.samplesPerFrame > 1) {
      stats.samplesPerFrame--;
    }
  };

  const frame = now => {
    if (paused) {
      return;
    }
    if (framesInFlight >= MAX_FRAMES_IN_FLIGHT) {
      requestAnimationFrame(frame);
      return;
    }
    if (terrainDirty) {
      terrainDirty = false;
      terrain.generate(terrainFrom(state));
      erosionStart = performance.now();
      erosionActive = true;
      stats.erosionSeconds = null;
      resetAccumulation();
    }
    if (terrain.busy) {
      for (let i = 0; i < TERRAIN_STAGES_PER_FRAME; i++) {
        terrain.step();
      }
      resetAccumulation();
      if (!terrain.busy) {
        device.queue.onSubmittedWorkDone().then(() => {
          stats.erosionSeconds = (performance.now() - erosionStart) / 1000;
          erosionActive = false;
        });
      }
    }
    if (skyDirty) {
      skyDirty = false;
      const lighting = view();
      tracer.writeFrame(lighting, 0);
      const altitude = lighting.camera.position[1] / 1000;
      sky.write(lighting.sunDirection, SUN_ILLUMINANCE, state.haze, altitude);
      sky.rebuild();
      resetAccumulation();
    }
    const lighting = view();
    for (let i = 0; i < stats.samplesPerFrame; i++) {
      tracer.sample(lighting, sampleIndex);
      sampleIndex++;
    }
    display.present(state);
    framesInFlight++;
    const submitted = sampleIndex;
    const epoch = resetTime;
    const submittedAt = performance.now();
    device.queue.onSubmittedWorkDone().then(() => {
      framesInFlight--;
      const finished = performance.now();
      adaptSamples(finished - submittedAt);
      if (epoch !== resetTime) {
        return;
      }
      const seconds = (finished - epoch) / 1000;
      stats.completedSamples = submitted;
      stats.firstSampleSeconds ??= seconds;
      stats.pathsPerSecond = submitted * WIDTH * HEIGHT / Math.max(seconds, 1e-3);
    });
    updateStats(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  window.spike = {
    state,
    stats,
    set: setValues,
    erode: erodeMore,
    get eroding() {
      return terrain.busy || erosionActive;
    },
    capture: () => display.capturePng(state),
    restart: resetAccumulation,
    profile,
  };
}

start().catch(showError);
