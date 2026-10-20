// SPDX-License-Identifier: Apache-2.0
// The viewport renderer: one persistent WebGPU device driving terrain builds, sky LUTs, the
// progressive path tracer and the display. Frames are queued without CPU waits; completion
// callbacks only bound how far ahead the CPU runs, so edits show up within a frame or two.

import { createDevice } from '../gpu/device.js';
import { PLACEMENT } from '../terrain/placement.js';
import { imageSettingsOf, terrainSettingsOf } from '../scene/document.js';
import { sameTerrain } from '../terrain/settings.js';
import { Terrain } from '../terrain/terrain.js';
import { cameraFrame, sunDirection } from './camera.js';
import { Clouds } from './clouds.js';
import { Display } from './display.js';
import { Post } from './post.js';
import { SUN_ANGULAR_RADIUS, Sky } from './sky.js';
import { Tracer } from './tracer.js';

const MAX_FRAMES_IN_FLIGHT = 2;
const MAX_SAMPLES_PER_FRAME = 12;
const TERRAIN_STAGES_PER_FRAME = 4;
// Longest edge of the settled image; camera moves render at half that.
const VIEW_LONG_EDGE = 1920;
const MOVING_SCALE = 0.5;
const SETTLE_MS = 180;
const EXPORT_BATCH = 8;

const FOG_HEIGHT = 250;
const FOG_FALLOFF = 1 / 180;
const FOG_DENSITY = 1 / 8000;
const SUN_ILLUMINANCE = [1, 1, 1];
const BOUNCES = 2;

export const VIEW_MODES = Object.freeze({ image: 0, albedo: 1, flow: 2, sediment: 3, curvature: 4, normals: 5 });

// Shrinks [width, height] so its longest edge is at most `longEdge`.
function fitLongEdge(width, height, longEdge) {
  const scale = Math.min(1, longEdge / Math.max(width, height));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

// A size with the given aspect whose longest edge is exactly `longEdge`.
function sizeForLongEdge(aspect, longEdge) {
  if (aspect >= 1) {
    return [longEdge, Math.max(1, Math.round(longEdge / aspect))];
  }
  return [Math.max(1, Math.round(longEdge * aspect)), longEdge];
}

export class Renderer {
  static async create(canvas, scene) {
    const { adapter, device } = await createDevice();
    const context = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });
    const settings = terrainSettingsOf(scene);
    const [terrain, tracer, display, post, clouds] = await Promise.all([
      Terrain.create(device, PLACEMENT, settings),
      Tracer.create(device),
      Display.create(device, context, format),
      Post.create(device),
      Clouds.create(device),
    ]);
    const sky = await Sky.create(device, tracer.frameBuffer);
    return new Renderer({ adapter, device, canvas, terrain, tracer, sky, display, post, clouds }, scene);
  }

  constructor(parts, scene) {
    Object.assign(this, parts);
    this.scene = scene;
    this.viewMode = VIEW_MODES.image;
    this.listeners = new Set();
    this.lost = null;
    this.device.lost.then(info => {
      this.lost = info.message || 'The GPU device was lost.';
      this.emit();
    });
    this.clouds.update(scene);
    this.tracer.writeSurface(scene);
    this.tracer.bind(this.terrain, this.sky, this.clouds);
    this.stats = {
      adapter: this.adapter.info?.description || this.adapter.info?.vendor || 'unknown',
      samples: 0,
      seconds: 0,
      pathsPerSecond: 0,
      terrainSeconds: null,
      building: true,
      progress: 0,
      renderSize: [1, 1],
    };
    this.sampleIndex = 0;
    this.resetTime = performance.now();
    this.samplesPerFrame = 1;
    this.framesInFlight = 0;
    this.skyDirty = true;
    this.movingUntil = 0;
    this.paused = false;
    this.buildStart = performance.now();
    this.terrain.generate(this.terrain.settings);
    this.frame = this.frame.bind(this);
  }

  // Called with stats after each frame and on state changes.
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) {
      listener(this.stats, this);
    }
  }

  start() {
    requestAnimationFrame(this.frame);
  }

  // Applies a scene. Terrain rebuilds only when its settings or heightmap changed.
  setScene(scene, { moving = false } = {}) {
    if (this.variantBatch) {
      // Applied when the gallery batch finishes and the view's own scene is back.
      this.queuedScene = { scene, moving };
      return;
    }
    const previous = this.scene;
    this.scene = scene;
    const settings = terrainSettingsOf(scene);
    if (!sameTerrain(settings, this.terrain.settings)) {
      this.rebuildTerrain(settings);
    }
    const skyChanged = previous.sun.elevation !== scene.sun.elevation
      || previous.sun.azimuth !== scene.sun.azimuth
      || previous.atmosphere.haze !== scene.atmosphere.haze;
    const cameraChanged = JSON.stringify(previous.camera) !== JSON.stringify(scene.camera);
    const fogChanged = previous.atmosphere.fog !== scene.atmosphere.fog;
    const cloudsChanged = JSON.stringify(previous.clouds ?? null) !== JSON.stringify(scene.clouds ?? null);
    if (cloudsChanged) {
      this.clouds.update(scene);
    }
    const surfaceOf = s => JSON.stringify([s.surface ?? null, s.water ?? null]);
    const surfaceChanged = surfaceOf(previous) !== surfaceOf(scene);
    if (surfaceChanged) {
      this.tracer.writeSurface(scene);
    }
    if (skyChanged || cameraChanged) {
      this.skyDirty = true;
    }
    if (moving) {
      this.movingUntil = performance.now() + SETTLE_MS;
    }
    if (skyChanged || cameraChanged || fogChanged || cloudsChanged || surfaceChanged) {
      this.resetAccumulation();
    }
  }

  rebuildTerrain(settings = this.terrain.settings) {
    this.terrain.generate(settings);
    this.buildStart = performance.now();
    this.stats.building = true;
    this.stats.terrainSeconds = null;
    this.resetAccumulation();
  }

  erodeMore() {
    if (this.terrain.busy) {
      return;
    }
    this.terrain.erodeMore(0.5);
    this.buildStart = performance.now();
    this.stats.building = true;
    this.stats.terrainSeconds = null;
  }

  setHeightmap(heights) {
    this.terrain.setHeightmap({ ...heights, base: 150, relief: this.terrain.settings.relief });
    this.rebuildTerrain();
  }

  clearHeightmap() {
    this.terrain.clearHeightmap();
    this.rebuildTerrain();
  }

  setViewMode(mode) {
    this.viewMode = mode;
    this.resetAccumulation();
  }

  resetAccumulation() {
    this.sampleIndex = 0;
    this.samplesPerFrame = 1;
    this.resetTime = performance.now();
    this.stats.samples = 0;
  }

  outputSize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    return [width, height];
  }

  view(aspect) {
    const scene = this.scene;
    return {
      camera: cameraFrame(scene.camera, aspect),
      sunDirection: sunDirection(scene.sun.elevation, scene.sun.azimuth),
      sunRadius: SUN_ANGULAR_RADIUS,
      sunIlluminance: SUN_ILLUMINANCE,
      fogDensity: FOG_DENSITY * scene.atmosphere.fog,
      fogHeight: FOG_HEIGHT,
      fogFalloff: FOG_FALLOFF,
      viewMode: this.viewMode,
      bounces: BOUNCES,
      seed: scene.terrain.seed,
    };
  }

  image() {
    return { ...imageSettingsOf(this.scene), viewMode: this.viewMode };
  }

  rebuildSky(view) {
    this.tracer.writeFrame(view, 0);
    const altitudeKm = view.camera.position[1] / 1000;
    this.sky.write(view.sunDirection, SUN_ILLUMINANCE, this.scene.atmosphere.haze, altitudeKm);
    this.sky.rebuild();
  }

  // Keeps the canvas backing store matched to its CSS size.
  syncCanvas() {
    const [width, height] = this.outputSize();
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.resetAccumulation();
    }
    return [width, height];
  }

  renderSize(output, now) {
    const settled = fitLongEdge(output[0], output[1], VIEW_LONG_EDGE);
    if (now < this.movingUntil) {
      return settled.map(value => Math.max(1, Math.round(value * MOVING_SCALE)));
    }
    return settled;
  }

  adaptSamples(latency) {
    if (this.terrain.busy) {
      this.samplesPerFrame = 1;
    } else if (latency < 25 && this.samplesPerFrame < MAX_SAMPLES_PER_FRAME) {
      this.samplesPerFrame++;
    } else if (latency > 60 && this.samplesPerFrame > 1) {
      this.samplesPerFrame--;
    }
  }

  frame(now) {
    if (this.paused || this.lost) {
      return;
    }
    requestAnimationFrame(this.frame);
    if (this.framesInFlight >= MAX_FRAMES_IN_FLIGHT) {
      return;
    }
    const output = this.syncCanvas();
    const size = this.renderSize(output, now);
    if (size[0] !== this.tracer.width || size[1] !== this.tracer.height) {
      this.tracer.setSize(...size);
      this.resetAccumulation();
    }
    if (this.terrain.busy) {
      for (let i = 0; i < TERRAIN_STAGES_PER_FRAME; i++) {
        this.terrain.step();
      }
      this.resetAccumulation();
      if (!this.terrain.busy) {
        const started = this.buildStart;
        this.device.queue.onSubmittedWorkDone().then(() => {
          this.stats.terrainSeconds = (performance.now() - started) / 1000;
          this.stats.building = false;
          this.emit();
        });
      }
    }
    const view = this.view(size[0] / size[1]);
    if (this.skyDirty) {
      this.skyDirty = false;
      this.rebuildSky(view);
      this.resetAccumulation();
    }
    for (let i = 0; i < this.samplesPerFrame; i++) {
      this.tracer.sample(view, this.sampleIndex);
      this.sampleIndex++;
    }
    this.display.bind(this.post.run(this.tracer, this.sampleIndex), this.post);
    this.display.present(this.image());
    this.trackCompletion(size);
  }

  trackCompletion(size) {
    this.framesInFlight++;
    const submitted = this.sampleIndex;
    const epoch = this.resetTime;
    const submittedAt = performance.now();
    this.device.queue.onSubmittedWorkDone().then(() => {
      this.framesInFlight--;
      const finished = performance.now();
      this.adaptSamples(finished - submittedAt);
      this.stats.progress = this.terrain.progress;
      if (epoch === this.resetTime) {
        const seconds = (finished - epoch) / 1000;
        this.stats.samples = submitted;
        this.stats.seconds = seconds;
        this.stats.pathsPerSecond = submitted * size[0] * size[1] / Math.max(seconds, 1e-3);
        this.stats.renderSize = size;
      }
      this.emit();
    });
  }

  // Renders `samples` at `longEdge` pixels (the view's aspect) and returns an image blob
  // (PNG unless `type` says otherwise).
  async capture({ longEdge = 2560, samples = 256, onProgress = () => {}, type = 'image/png', quality } = {}) {
    if (this.terrain.busy) {
      throw new Error('Wait for the terrain to finish building.');
    }
    this.paused = true;
    await this.device.queue.onSubmittedWorkDone();
    this.post.saveMeter();
    try {
      const output = this.outputSize();
      const size = sizeForLongEdge(output[0] / output[1], longEdge);
      this.tracer.setSize(...size);
      const view = this.view(size[0] / size[1]);
      this.rebuildSky(view);
      for (let index = 0; index < samples; index++) {
        this.tracer.sample(view, index);
        if ((index + 1) % EXPORT_BATCH === 0 || index + 1 === samples) {
          await this.device.queue.onSubmittedWorkDone();
          onProgress((index + 1) / samples);
        }
      }
      this.display.bind(this.post.run(this.tracer, samples, { meterBlend: 1 }), this.post);
      const blob = await this.display.capture(this.image(), size, { type, quality });
      this.post.release(...size);
      return blob;
    } finally {
      this.resume();
    }
  }

  // Small JPEG renders of variant scenes for the galleries: the current terrain under other
  // light, skies, materials, lenses or looks. Returns one blob per scene, or null where a
  // scene needs different terrain. A second, small tracer does the work, so the view keeps
  // its accumulated samples; only the shared sky LUTs and cloud settings are put back.
  async renderVariants(scenes, { width = 288, height = 162, samples = 32 } = {}) {
    if (this.terrain.busy || this.stats.building || this.lost || this.paused) {
      return null;
    }
    this.paused = true;
    this.variantBatch = true;
    await this.device.queue.onSubmittedWorkDone();
    this.post.saveMeter();
    if (!this.thumbnailTracer) {
      this.thumbnailTracer = new Tracer(this.device, this.tracer.pipeline);
      this.thumbnailTracer.bind(this.terrain, this.sky, this.clouds);
    }
    const tracer = this.thumbnailTracer;
    tracer.setSize(width, height);
    const current = this.scene;
    const results = [];
    try {
      let traced = null;
      for (const scene of scenes) {
        if (!sameTerrain(terrainSettingsOf(scene), this.terrain.settings)) {
          results.push(null);
          continue;
        }
        // Variants that differ only in image settings share one trace.
        const key = JSON.stringify({ ...scene, title: null, image: null });
        if (key !== traced) {
          traced = key;
          this.scene = scene;
          this.clouds.update(scene);
          tracer.writeSurface(scene);
          const view = { ...this.view(width / height), viewMode: VIEW_MODES.image };
          this.rebuildSky(view);
          for (let index = 0; index < samples; index++) {
            tracer.sample(view, index);
          }
          this.display.bind(this.post.run(tracer, samples, { meterBlend: 1 }), this.post);
        }
        const image = { ...imageSettingsOf(scene), viewMode: VIEW_MODES.image };
        results.push(await this.display.capture(image, [width, height], { type: 'image/jpeg', quality: 0.86 }));
      }
    } finally {
      this.scene = current;
      this.clouds.update(current);
      this.rebuildSky(this.view(this.tracer.width / this.tracer.height));
      this.post.restoreMeter();
      this.variantBatch = false;
      this.paused = false;
      requestAnimationFrame(this.frame);
      const queued = this.queuedScene;
      this.queuedScene = null;
      if (queued) {
        this.setScene(queued.scene, { moving: queued.moving });
      }
    }
    return results;
  }

  // Restarts the view after a side render.
  resume() {
    this.post.restoreMeter();
    this.paused = false;
    this.skyDirty = true;
    this.resetAccumulation();
    this.tracer.setSize(1, 1);
    requestAnimationFrame(this.frame);
  }
}
