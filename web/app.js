// SPDX-License-Identifier: Apache-2.0
import { defaults, createTerrain, frameUniforms } from './scene/terrain.js';
import { selectRenderer } from './render/select.js';
import { createWebGPU } from './render/webgpu.js';
import { createWebGL } from './render/webgl.js';

const $ = id => document.getElementById(id);
const state = { ...defaults };
const viewport = $('viewport');
let mesh = createTerrain(state), active = null, activeKind = 'none';
let generation = 0, redraw = 0, rebuild = 0;

function draw() {
  if (redraw) return;
  redraw = requestAnimationFrame(() => {
    redraw = 0;
    if (!active) return;
    const canvas = active.canvas;
    const bounds = viewport.getBoundingClientRect();
    // A preview budget, not a claim about hardware performance.
    const scale = Math.min(devicePixelRatio || 1, 1.5, 1600 / Math.max(bounds.width, 1));
    const width = Math.max(1, Math.floor(bounds.width * scale)), height = Math.max(1, Math.floor(bounds.height * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    try { active.draw(frameUniforms(state, width / height)); }
    catch (error) { void startGraphics(activeKind === 'webgpu' ? 'webgl2' : 'none', [error.message]); }
  });
}

async function startGraphics(preference = $('graphics-mode').value, reasons = []) {
  const request = ++generation;
  active?.dispose(); active = null; activeKind = 'none';
  viewport.replaceChildren();
  $('backend').textContent = 'Starting graphics…';
  $('empty-message').textContent = 'Checking available graphics…';
  $('empty-state').hidden = false;
  let initializing = true;
  const losses = new Map();
  function lost(kind, message) {
    if (generation !== request) return;
    if (initializing) { losses.set(kind, message); return; }
    if (activeKind === kind) void startGraphics(kind === 'webgpu' ? 'webgl2' : 'none', [message]);
  }
  const result = await selectRenderer(preference, {
    webgpu: () => createWebGPU(document.createElement('canvas'), message => lost('webgpu', message)),
    webgl2: () => createWebGL(document.createElement('canvas'), message => lost('webgl2', message)),
  }, reasons);
  initializing = false;
  if (request !== generation) { result.renderer?.dispose(); return; }
  if (losses.has(result.kind)) {
    result.renderer?.dispose();
    return startGraphics(result.kind === 'webgpu' ? 'webgl2' : 'none', [...result.reasons, losses.get(result.kind)]);
  }
  active = result.renderer; activeKind = result.kind;
  $('backend').textContent = result.kind === 'none' ? 'Preview unavailable' : result.kind === 'webgpu' ? 'WebGPU' : 'WebGL 2';
  $('graphics-info').textContent = active?.details || 'No active graphics backend. Your scene settings are still available.';
  $('graphics-reasons').textContent = result.reasons.join(' · ');
  $('empty-state').hidden = !!active;
  $('empty-message').textContent = preference === 'none' && !reasons.length ? 'GPU preview is disabled. Select Automatic under Graphics & compatibility to return to your landscape.' : 'No working GPU preview is available. Enable graphics acceleration in your browser, then use Retry graphics. Your scene settings are preserved.';
  if (active) {
    viewport.append(active.canvas);
    try { active.setMesh(mesh); draw(); }
    catch (error) { return startGraphics(result.kind === 'webgpu' ? 'webgl2' : 'none', [error.message]); }
  }
  $('status').textContent = active ? `${$('backend').textContent} preview ready` : $('empty-message').textContent;
}

function updateGeometry() {
  if (rebuild) return;
  rebuild = requestAnimationFrame(() => {
    rebuild = 0; mesh = createTerrain(state);
    if (active) {
      try { active.setMesh(mesh); } catch (error) { void startGraphics(activeKind === 'webgpu' ? 'webgl2' : 'none', [error.message]); }
    }
    draw();
  });
}
function syncControls() {
  for (const key of ['seed', 'elevation', 'sun', 'palette']) $(key).value = state[key];
  $('elevation-value').textContent = `${state.elevation.toFixed(2)}×`;
  $('sun-value').textContent = `${state.sun}°`;
}
function markEdited() {
  document.querySelectorAll('.study').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
  $('scene-name').textContent = 'Your landscape';
}
$('seed').addEventListener('change', () => {
  if (!$('seed').checkValidity() || $('seed').value === '') { $('seed').value = state.seed; return; }
  state.seed = Number($('seed').value); markEdited(); updateGeometry();
});
$('new-seed').addEventListener('click', () => { state.seed = crypto.getRandomValues(new Uint32Array(1))[0]; syncControls(); markEdited(); updateGeometry(); });
$('elevation').addEventListener('input', () => { state.elevation = Number($('elevation').value); syncControls(); markEdited(); updateGeometry(); });
$('sun').addEventListener('input', () => { state.sun = Number($('sun').value); syncControls(); markEdited(); draw(); });
$('palette').addEventListener('change', () => { state.palette = $('palette').value; markEdited(); updateGeometry(); });
$('graphics-mode').addEventListener('change', () => void startGraphics());
$('retry').addEventListener('click', () => void startGraphics());
function resetCamera() { for (const key of ['yaw', 'pitch', 'distance']) state[key] = defaults[key]; draw(); }
$('reset-camera').addEventListener('click', resetCamera);
const presets = {
  alpine: { seed: 1847, elevation: 1, sun: 38, palette: 'natural', name: 'Alpine quiet' },
  highland: { seed: 972, elevation: 0.7, sun: 12, palette: 'natural', name: 'Evening highlands' },
  distant: { seed: 42107, elevation: 1.35, sun: 25, palette: 'otherworld', name: 'A distant world' },
};
document.querySelectorAll('.study').forEach(button => button.addEventListener('click', () => {
  const preset = presets[button.dataset.preset];
  Object.assign(state, defaults, preset); syncControls(); markEdited();
  button.classList.add('active'); button.setAttribute('aria-pressed', 'true');
  $('scene-name').textContent = preset.name; updateGeometry();
}));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
let pointer = null;
viewport.addEventListener('pointerdown', e => { if (e.button !== 0) return; viewport.focus(); viewport.setPointerCapture(e.pointerId); pointer = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
viewport.addEventListener('pointermove', e => {
  if (!pointer || pointer.id !== e.pointerId) return;
  state.yaw -= (e.clientX - pointer.x) * 0.005;
  state.pitch = clamp(state.pitch + (e.clientY - pointer.y) * 0.004, 0.08, 1.2);
  pointer.x = e.clientX; pointer.y = e.clientY; draw();
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) viewport.addEventListener(event, () => { pointer = null; });
viewport.addEventListener('wheel', e => { e.preventDefault(); state.distance = clamp(state.distance * Math.exp(clamp(e.deltaY, -100, 100) * 0.001), 10, 48); draw(); }, { passive: false });
viewport.addEventListener('keydown', e => {
  const actions = { ArrowLeft: () => state.yaw -= 0.08, ArrowRight: () => state.yaw += 0.08, ArrowUp: () => state.pitch = clamp(state.pitch + 0.06, 0.08, 1.2), ArrowDown: () => state.pitch = clamp(state.pitch - 0.06, 0.08, 1.2), '+': () => state.distance = Math.max(10, state.distance - 1), '=': () => state.distance = Math.max(10, state.distance - 1), '-': () => state.distance = Math.min(48, state.distance + 1), Home: resetCamera };
  if (actions[e.key]) { e.preventDefault(); actions[e.key](); draw(); }
});
$('help').addEventListener('click', () => $('guide').showModal());
new ResizeObserver(draw).observe(viewport);
window.addEventListener('pagehide', () => { generation++; active?.dispose(); active = null; });
window.addEventListener('pageshow', e => { if (e.persisted) void startGraphics(); });
$('geometry').textContent = `${(mesh.length / 27).toLocaleString()} triangles · Seeded terrain`;
syncControls();
void startGraphics();
fetch('/api/info').then(r => { if (!r.ok) throw new Error('Build information unavailable'); return r.json(); }).then(info => { $('build-info').textContent = `Lithosky ${info.version}`; }).catch(() => { $('build-info').textContent = 'Lithosky · build information unavailable'; });
