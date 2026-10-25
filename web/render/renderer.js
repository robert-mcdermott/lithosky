// SPDX-License-Identifier: Apache-2.0
// The viewport renderer: one persistent WebGPU device driving terrain builds, sky LUTs, the
// progressive path tracer and the display. Frames are queued without CPU waits; completion
// callbacks only bound how far ahead the CPU runs, so edits show up within a frame or two.

import { createDevice } from '../gpu/device.js';
import { PLACEMENT } from '../terrain/placement.js';
import { aspectOf, imageSettingsOf, terrainSettingsOf } from '../scene/document.js';
import { sameTerrain } from '../terrain/settings.js';
import { Terrain } from '../terrain/terrain.js';
import { cameraFrame, sunDirection, viewRay } from './camera.js';
import { Clouds } from './clouds.js';
import { Display } from './display.js';
import { Forest } from './forest.js';
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
// A region renders at full output resolution up to this many samples, a few per frame.
const REGION_SAMPLES = 1024;
const REGION_SAMPLES_PER_FRAME = 2;
const REGION_MAX_PIXELS = 4_000_000;

// First-hit distance the tracer stores for rays that reach the sky.
const SKY_DEPTH = 300000;

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
    const [sky, forest] = await Promise.all([Sky.create(device, tracer.frameBuffer), Forest.create(device, terrain)]);
    return new Renderer({ adapter, device, canvas, terrain, tracer, sky, display, post, clouds, forest }, scene);
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
    this.forest.update(scene);
    this.tracer.bind(this.terrain, this.sky, this.clouds, this.forest);
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
    if (this.sideRender) {
      // Applied when the export or gallery batch finishes and the view's scene is back.
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
      || (previous.atmosphere.tint ?? 0) !== (scene.atmosphere.tint ?? 0)
      || previous.sun.azimuth !== scene.sun.azimuth
      || previous.atmosphere.haze !== scene.atmosphere.haze;
    const cameraChanged = JSON.stringify(previous.camera) !== JSON.stringify(scene.camera);
    const fogChanged = previous.atmosphere.fog !== scene.atmosphere.fog;
    const cloudsChanged = JSON.stringify(previous.clouds ?? null) !== JSON.stringify(scene.clouds ?? null);
    if (cloudsChanged) {
      this.clouds.update(scene);
    }
    // The surface uniform also carries the formation thickness, which follows the terrain.
    const surfaceOf = s => JSON.stringify([s.surface ?? null, s.water ?? null, s.terrain.landform ?? null, s.terrain.relief]);
    const surfaceChanged = surfaceOf(previous) !== surfaceOf(scene);
    if (surfaceChanged) {
      this.tracer.writeSurface(scene);
      this.forest.update(scene);
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
    for (const tracer of [this.tracer, this.thumbnailTracer, this.regionParts?.tracer]) {
      tracer?.writeFields();
    }
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
    // Any change to the image retires a region render.
    if (this.region) {
      this.region = null;
      this.stats.region = null;
    }
  }

  // Renders part of the view at full output resolution and shows it over the view, until
  // the scene, camera or window changes. `rect` is in canvas UV (x0, y0, x1, y1); null
  // removes it.
  setRegion(rect) {
    if (!rect) {
      this.region = null;
      this.stats.region = null;
      this.emit();
      return;
    }
    if (!this.regionParts) {
      const tracer = new Tracer(this.device, this.tracer.pipeline);
      tracer.bind(this.terrain, this.sky, this.clouds, this.forest);
      this.regionParts = { tracer, display: new Display(this.device, this.display.context, this.display.pipelines) };
    }
    const output = this.outputSize();
    const width = (rect[2] - rect[0]) * output[0];
    const height = (rect[3] - rect[1]) * output[1];
    const fit = Math.min(1, Math.sqrt(REGION_MAX_PIXELS / Math.max(1, width * height)));
    this.regionParts.tracer.writeSurface(this.scene);
    this.region = { rect, size: [Math.max(1, Math.round(width * fit)), Math.max(1, Math.round(height * fit))], samples: 0, shown: -1 };
    this.stats.region = { samples: 0, target: REGION_SAMPLES };
    this.emit();
  }

  // A few more region samples, then the region drawn over the view (which was just drawn).
  renderRegion(aspect) {
    const region = this.region;
    const { tracer, display } = this.regionParts;
    if (tracer.width !== region.size[0] || tracer.height !== region.size[1]) {
      tracer.setSize(...region.size);
    }
    const [x0, y0, x1, y1] = region.rect;
    const view = { ...this.view(aspect), window: [x0 + x1 - 1, 1 - (y0 + y1), x1 - x0, y1 - y0] };
    for (let i = 0; i < REGION_SAMPLES_PER_FRAME && region.samples < REGION_SAMPLES; i++) {
      tracer.sample(view, region.samples);
      region.samples++;
    }
    if (region.shown !== region.samples) {
      // The view's metered exposure, so the region matches what's around it.
      display.bind(this.post.run(tracer, region.samples, { meterBlend: 0 }), this.post);
      region.shown = region.samples;
    }
    display.presentRegion(this.image(), region.rect);
    this.stats.region.samples = region.samples;
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
    this.sky.write(view.sunDirection, SUN_ILLUMINANCE, this.scene.atmosphere.haze, altitudeKm, this.scene.atmosphere.tint ?? 0);
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
    if (this.region && !this.terrain.busy) {
      this.renderRegion(size[0] / size[1]);
    }
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

  // Renders `samples` at `longEdge` pixels (the scene's image shape) and returns an image blob
  // (PNG unless `type` says otherwise). A tracer of its own does the work, so the view keeps
  // its samples. With `preview`, the render refines in the viewport as it goes. Aborting
  // `signal` stops it between batches.
  async capture({ longEdge = 2560, samples = 256, onProgress = () => {}, type = 'image/png', quality, preview = false, signal } = {}) {
    if (this.terrain.busy || this.stats.building) {
      throw new Error('Wait for the terrain to finish building.');
    }
    if (this.paused) {
      throw new Error('Another render is in progress.');
    }
    this.paused = true;
    this.sideRender = true;
    await this.device.queue.onSubmittedWorkDone();
    this.post.saveMeter();
    const size = sizeForLongEdge(aspectOf(this.scene), longEdge);
    const tracer = new Tracer(this.device, this.tracer.pipeline);
    tracer.bind(this.terrain, this.sky, this.clouds, this.forest);
    tracer.writeSurface(this.scene);
    tracer.setSize(...size);
    try {
      const view = this.view(size[0] / size[1]);
      this.rebuildSky(view);
      for (let index = 0; index < samples; index++) {
        tracer.sample(view, index);
        if ((index + 1) % EXPORT_BATCH === 0 || index + 1 === samples) {
          if (preview) {
            this.display.bind(this.post.run(tracer, index + 1, { meterBlend: 1 }), this.post);
            this.display.present(this.image());
          }
          await this.device.queue.onSubmittedWorkDone();
          signal?.throwIfAborted();
          onProgress((index + 1) / samples);
        }
      }
      this.display.bind(this.post.run(tracer, samples, { meterBlend: 1 }), this.post);
      return await this.display.capture(this.image(), size, { type, quality });
    } finally {
      this.post.release(...size, tracer);
      tracer.release();
      this.finishSideRender();
    }
  }

  // Puts the view's sky and exposure back after an export or gallery batch, restarts the
  // frame loop and applies any edit made meanwhile.
  finishSideRender() {
    this.post.restoreMeter();
    this.rebuildSky(this.view(this.tracer.width / this.tracer.height));
    this.sideRender = false;
    this.paused = false;
    requestAnimationFrame(this.frame);
    const queued = this.queuedScene;
    this.queuedScene = null;
    if (queued) {
      this.setScene(queued.scene, { moving: queued.moving });
    }
  }

  // The terrain point under a view position (u, v in 0..1 across the canvas), from the
  // first-hit distance the tracer keeps for the denoiser. Null over the sky.
  async pick(u, v) {
    const tracer = this.tracer;
    if (!tracer.accumulation || this.sampleIndex === 0 || this.paused) {
      return null;
    }
    const x = Math.min(tracer.width - 1, Math.max(0, Math.floor(u * tracer.width)));
    const y = Math.min(tracer.height - 1, Math.max(0, Math.floor(v * tracer.height)));
    const index = y * tracer.width + x;
    const readback = this.device.createBuffer({ size: 32, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = this.device.createCommandEncoder({ label: 'pick' });
    encoder.copyBufferToBuffer(tracer.accumulation, index * 16, readback, 0, 16);
    encoder.copyBufferToBuffer(tracer.guides, (index * 2 + 1) * 16, readback, 16, 16);
    this.device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const values = new Float32Array(readback.getMappedRange().slice(0));
    readback.unmap();
    readback.destroy();
    const samples = values[3];
    const depth = values[7] / Math.max(samples, 1);
    // Edges that mix terrain and sky average to a long distance; treat them as sky.
    if (samples <= 0 || !(depth < SKY_DEPTH * 0.5)) {
      return null;
    }
    const aspect = tracer.width / tracer.height;
    const ndcX = ((x + 0.5) / tracer.width) * 2 - 1;
    const ndcY = 1 - ((y + 0.5) / tracer.height) * 2;
    const direction = viewRay(this.scene.camera, aspect, ndcX, ndcY);
    return this.scene.camera.position.map((value, i) => value + direction[i] * depth);
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
    this.sideRender = true;
    await this.device.queue.onSubmittedWorkDone();
    this.post.saveMeter();
    if (!this.thumbnailTracer) {
      this.thumbnailTracer = new Tracer(this.device, this.tracer.pipeline);
      // Variants can change the biome and tree line, so they plant their own trees.
      this.thumbnailForest = new Forest(this.device, this.terrain, this.forest.pipelines);
      this.thumbnailTracer.bind(this.terrain, this.sky, this.clouds, this.thumbnailForest);
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
          this.thumbnailForest.update(scene);
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
      this.finishSideRender();
    }
    return results;
  }
}
