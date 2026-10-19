// SPDX-License-Identifier: Apache-2.0
import {transformControls} from './scene/transform-controls.js';
import {spatialCommand} from './scene/spatial-editor.js';
import {primitiveMesh} from './scene/primitives.js';
import {cameraControls} from './camera/controls.js';
import {entityControls} from './scene/entity-controls.js';
import {sceneView,editScene,entityCommand,entityScene,kindOf} from './scene/entities.js';
import {enableCamera} from './camera/model.js';
import {waterControls} from './water/controls.js';
import {lightingControls} from './lighting/controls.js';
import { atmosphereControls } from './atmosphere/controls.js';
import { heightmapControls } from './scene/heightmap-controls.js';
import { MAX_PROJECT_BYTES } from './scene/heightmaps.js';
import { frameUniforms } from './scene/terrain.js';
import { TerrainGenerator } from './scene/generator.js';
import { geometryKey, renderKey } from './scene/generation.js';
import { materialControls } from './scene/material-controls.js';
import { sculptControls } from './scene/sculpt-controls.js';
import { terrainControls } from './scene/terrain-controls.js';
import { selectRenderer } from './render/select.js';
import { createWebGPU } from './render/webgpu.js';
import { renderStudio } from './render/studio.js';
import { createWebGL } from './render/webgl.js';

import { defaultScene, validateScene, serializeScene, renderState, wrapYaw, sceneKey, upgradeScene, currentRendering } from './scene/document.js';
import { validateStudies,validateCompositions } from './scene/studies.js';
import { History } from './scene/history.js';
import { Autosave } from './scene/autosave.js';

const $ = id => document.getElementById(id);
// Layout choices never edit the scene or invalidate a finished render.
for (const [id, name] of [['scenes', 'Scenes'], ['controls', 'Controls']]) {
  const button = $('toggle-' + id), panel = $(button.getAttribute('aria-controls'));
  let scrollTop = 0;
  button.addEventListener('click', () => {
    if (!panel.hidden) {
      scrollTop = panel.scrollTop;
      if (panel.contains(document.activeElement)) button.focus();
    }
    panel.hidden = !panel.hidden;
    if (!panel.hidden) panel.scrollTop = scrollTop;
    button.setAttribute('aria-expanded', String(!panel.hidden));
    const label = (panel.hidden ? 'Show ' : 'Hide ') + name + ' panel';
    button.setAttribute('aria-label', label);
    button.title = label;
  });
}

async function main() {
const [schemaResponse, studiesResponse,compositionResponse] = await Promise.all([fetch('/api/scene-schema'), fetch('/scenes/studies.json'),fetch('/scenes/compositions.json')]);
if (!schemaResponse.ok) throw new Error('Cannot load the scene schema. Restart Lithosky.');
const schema = await schemaResponse.json();
if (!studiesResponse.ok) throw new Error('Cannot load starter scenes. Restart Lithosky.');
if(!compositionResponse.ok)throw Error('Cannot load composition studies. Restart Lithosky.');
const studies = [...validateStudies(await studiesResponse.json(), schema),...validateCompositions(await compositionResponse.json(),schema)];
for (const study of studies) {
  const option = document.createElement('option'); option.value = study.id; option.textContent = study.scene.title; $('study-select').append(option);
}
const history = new History(defaultScene(), scene => validateScene(scene, schema));
let state = renderState(history.value);
let autosave = null, session = null, autosaveEnabled = false, changed = false, editVersion = 0;
let downloaded = '', gestureTimer = null, connectingRecovery = false;
const viewport = $('viewport');
let mesh = null, field = null, terrainReady = false, active = null, activeKind = 'none';
const terrainGenerator = new TerrainGenerator();
let terrainEpoch = 0;
let generation = 0, redraw = 0;
const finalRender = renderStudio(() => state, () => history.value.title, () => field);
const controlScene=()=>sceneView(history.value);
const objects=entityControls({getScene:()=>history.value,getState:()=>state,getField:()=>field,command:objectCommand,viewport,finishGesture,onSelect:id=>{const g=entityScene(history.value),n=g.entities.find(n=>n.id===id);if(n&&kindOf(n)==='light'){objects.releaseLocks();lighting.select(g.entities.filter(n=>kindOf(n)==='light').findIndex(n=>n.id===id));objects.sync();}transforms.sync();}});
const transforms=transformControls({getScene:()=>history.value,getState:()=>state,getField:()=>terrainReady?field:null,objects,viewport,command:spatialEdit,begin:()=>{finishGesture();history.begin();},end:finishGesture,cancel:()=>{if(history.cancel())refresh();},prepareView:(keepRender=false)=>{camera.cancel();finalRender.cancelPicking();sculpt.cancel();if(!keepRender)finalRender.preview();}});
const heightmaps = heightmapControls({getScene:controlScene,getVersion:()=>editVersion,commit:discrete,request:assetRequest,generate:state=>terrainGenerator.generate(state,()=>{},'export'),isReady:()=>terrainReady});
const camera = cameraControls({getScene:controlScene,getState:()=>state,getField:()=>field,edit:discrete,viewport});
const water = waterControls(controlScene,discrete);
const lighting = lightingControls(controlScene,discrete,index=>{const g=entityScene(history.value);objects.select(g.entities.filter(n=>kindOf(n)==='light')[index]?.id??null);});
const atmosphere = atmosphereControls(controlScene,discrete);
const materials = materialControls(controlScene, discrete);
const layerControls = terrainControls(controlScene, discrete);
const sculpt = sculptControls({viewport,getState:()=>state,getField:()=>field,isReady:()=>terrainReady&&state.terrainVisible!==false&&activeKind!=='none',commit:discrete,prepareView:()=>finalRender.preview()});

function draw() {
  if (redraw) return;
  redraw = requestAnimationFrame(() => {
    redraw = 0;
    if (!active || !mesh) return;
    const canvas = active.canvas;
    const bounds = viewport.getBoundingClientRect();
    // A preview budget, not a claim about hardware performance.
    const scale = Math.min(devicePixelRatio || 1, 1.5, 1600 / Math.max(bounds.width, 1));
    const width = Math.max(1, Math.floor(bounds.width * scale)), height = Math.max(1, Math.floor(bounds.height * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    try { active.draw(frameUniforms(state, width / height)); sculpt.draw();objects.draw();transforms.draw(); }
    catch (error) { void startGraphics(activeKind === 'webgpu' ? 'webgl2' : 'none', [error.message]); }
  });
}

async function startGraphics(preference = $('graphics-mode').value, reasons = []) {
  const request = ++generation;
  finalRender.setAvailable(false);
  sculpt.cancel();active?.dispose(); active = null; activeKind = 'none';sculpt.sync();
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
  active = result.renderer; activeKind = result.kind;sculpt.sync();
  finalRender.setAvailable(activeKind === 'webgpu' && terrainReady, activeKind === 'webgpu' && !terrainReady ? 'Generate terrain before rendering this scene.' : undefined);
  $('backend').textContent = result.kind === 'none' ? 'Preview unavailable' : result.kind === 'webgpu' ? 'WebGPU' : 'WebGL 2';
  $('graphics-info').textContent = active?.details || 'No active graphics backend. Your scene settings are still available.';
  $('graphics-reasons').textContent = result.reasons.join(' · ');
  $('empty-state').hidden = !!active;
  $('empty-message').textContent = preference === 'none' && !reasons.length ? 'GPU preview is disabled. Select Automatic under Graphics & compatibility to return to your landscape.' : 'No working GPU preview is available. Enable graphics acceleration in your browser, then use Retry graphics. Your scene settings are preserved.';
  if (active) {
    viewport.append(active.canvas);
    try { if (mesh) active.setMesh(mesh);active.setObjects(primitiveMesh(state.primitives)); draw(); }
    catch (error) { return startGraphics(result.kind === 'webgpu' ? 'webgl2' : 'none', [error.message]); }
  }
  $('status').textContent = active ? `${$('backend').textContent} preview ready` : $('empty-message').textContent;
}

async function updateGeometry() {
  const ticket=++terrainEpoch;
  terrainReady=false;heightmaps.sync();sculpt.cancel();sculpt.sync();finalRender.setAvailable(false, 'Generating terrain before rendering…');
  $('cancel-terrain').disabled=false;$('retry-terrain').hidden=true;
  $('terrain-progress').value=0;
  $('terrain-status').textContent='Generating terrain… The previous preview stays visible.';
  try {
    const result=await terrainGenerator.generate(state, progress=>{if(ticket===terrainEpoch)$('terrain-progress').value=progress;});
    if(ticket!==terrainEpoch)return;
    mesh=result.mesh;if(result.field)field=result.field;terrainReady=true;heightmaps.sync();sculpt.sync();
    $('terrain-progress').value=1;
    $('terrain-status').textContent=result.heightsChanged?'Terrain ready.':result.surfaceChanged?'Surface updated · heights reused.':'Water updated · terrain surface reused.';
    $('geometry').textContent=`${result.resolution}² terrain cells · 128² preview mesh · 32,768 triangles`;
    finalRender.setAvailable(activeKind==='webgpu');
    if(active) {try {active.setMesh(mesh);active.setObjects(primitiveMesh(state.primitives));} catch(error) {void startGraphics(activeKind==='webgpu'?'webgl2':'none',[error.message]);}}
    draw();
  } catch(error) {
    if(ticket!==terrainEpoch)return;
    $('terrain-status').textContent=error.name==='AbortError'?'Generation canceled. Regenerate to preview these settings.':'Terrain generation failed: '+error.message;
    $('retry-terrain').hidden=false;
    finalRender.setAvailable(false, 'Generate terrain before rendering this scene.');
  } finally {if(ticket===terrainEpoch)$('cancel-terrain').disabled=true;}
}
$('cancel-terrain').addEventListener('click',()=>terrainGenerator.cancel());
$('retry-terrain').addEventListener('click',()=>void updateGeometry());
function syncControls() {
  const scene = controlScene();objects.releaseLocks();
  layerControls.sync();sculpt.sync();materials.sync();heightmaps.sync();atmosphere.sync();lighting.sync();water.sync();camera.sync();
  $('upgrade-rendering').hidden=currentRendering(scene);
  $('rendering-model').textContent=currentRendering(scene)?'Current rendering · geology, atmosphere, studio light and lake optics':'Custom / legacy rendering · upgrade to enable all current models';
  for (const key of ['seed', 'elevation', 'sun', 'palette']) $(key).value = state[key];
  $('scene-title').value = scene.title;
  $('scene-name').textContent = scene.title;
  $('water-enabled').checked = scene.water.enabled;
  $('water-level').value = scene.water.level;
  $('water-level').disabled = !scene.water.enabled;
  $('water-value').textContent = scene.water.level.toFixed(2);
  $('elevation-value').textContent = state.elevation.toFixed(2) + '×';
  $('sun-value').textContent = state.sun + '°';
  $('study-select').value = studies.find(study => sceneKey(history.value) === sceneKey(study.scene))?.id || '';
  $('undo').disabled = !history.canUndo; $('redo').disabled = !history.canRedo;
  document.querySelectorAll('.study').forEach(b => {
    const selected = sceneKey(history.value) === sceneKey(presetScene(b.dataset.preset));
    b.classList.toggle('active', selected); b.setAttribute('aria-pressed', String(selected));
  });
  objects.sync();transforms.sync();
}
function refresh() {
  const next = renderState(history.value);
  const objectsChanged=JSON.stringify(state.primitives??[])!==JSON.stringify(next.primitives??[]);
  const geometryChanged = geometryKey(state) !== geometryKey(next);
  const renderChanged=renderKey(state)!==renderKey(next);
  sculpt.cancel();state = next; syncControls();if(renderChanged)finalRender.invalidate();
  if (geometryChanged) updateGeometry(); else {if(objectsChanged&&active&&mesh){try{active.setObjects(primitiveMesh(state.primitives));}catch(error){void startGraphics(activeKind==='webgpu'?'webgl2':'none',[error.message]);}}draw();}
  changed = true; editVersion++;
  if (autosaveEnabled) autosave.enqueue(history.value);
}
function edit(change) { try {if(history.edit(scene=>editScene(scene,change))){refresh();return true;}return false;}catch(error){$('entity-status').textContent=error.message;syncControls();return false;} }
function objectCommand(command,id,value){if(Array.isArray(id))return spatialEdit(command==='delete'?'delete-selection':'batch',id,{command,value});finishGesture();try{let result;const changed=history.edit(scene=>{result=entityCommand(scene,command,id,value);});if(changed){refresh();$('entity-status').textContent='Object '+({rename:'renamed',visible:'visibility changed',locked:'lock changed',parent:'regrouped',delete:'deleted',duplicate:'duplicated','add-group':'group added'}[command]??'changed')+'. Undo restores the previous scene.';}return changed?result:false;}catch(error){$('entity-status').textContent=error.message;return false;}}
function spatialEdit(command,ids,value,base){if(!base)finishGesture();try{let result;const changed=history.edit(scene=>{if(base){for(const key of Object.keys(scene))delete scene[key];Object.assign(scene,structuredClone(base));}result=spatialCommand(scene,command,ids,value);});if(changed){refresh();$('entity-status').textContent='Objects updated. Undo restores the previous scene.';}return changed?result:false;}catch(error){$('entity-status').textContent=error.message;return false;}}
function finishGesture() { clearTimeout(gestureTimer); history.end(); syncControls(); }
function discrete(change) { finishGesture();return edit(change); }
function presetScene(key) { return structuredClone(studies.find(study => study.id === key).scene); }
$('upgrade-rendering').addEventListener('click',()=>discrete(upgradeScene));
$('study-select').addEventListener('change', () => {
  const key = $('study-select').value; if (!key) return;
  finishGesture(); if (history.replace(presetScene(key))) refresh();
});
document.querySelectorAll('.study').forEach(button => button.addEventListener('click', () => {
  finishGesture(); if (history.replace(presetScene(button.dataset.preset))) refresh();
}));
$('scene-title').addEventListener('change', () => {
  const title = $('scene-title').value.trim();
  if (!title || [...title].length > 80) { syncControls(); return; }
  discrete(scene => { scene.title = title; });
});
$('seed').addEventListener('change', () => {
  if (!$('seed').checkValidity() || $('seed').value === '') { syncControls(); return; }
  const value = Number($('seed').value); discrete(scene => { scene.terrain.seed = value; });
});
$('new-seed').addEventListener('click', () => discrete(scene => { scene.terrain.seed = crypto.getRandomValues(new Uint32Array(1))[0]; }));
for (const [id, apply] of [
  ['elevation', (scene, value) => { scene.terrain.elevation = value; }],
  ['sun', (scene, value) => { scene.lighting.sunElevation = value; }],
  ['water-level', (scene, value) => { scene.water.level = value; }],
]) {
  $(id).addEventListener('input', () => { history.begin(); edit(scene => apply(scene, Number($(id).value))); });
  for (const event of ['change', 'blur']) $(id).addEventListener(event, finishGesture);
}
$('palette').addEventListener('change', () => { const value = $('palette').value; discrete(scene => { scene.terrain.palette = value; }); });
$('water-enabled').addEventListener('change', () => { const value = $('water-enabled').checked; discrete(scene => { scene.water.enabled = value; }); });
$('graphics-mode').addEventListener('change', () => void startGraphics());
$('retry').addEventListener('click', () => void startGraphics());
function resetCamera() { discrete(scene => { const lens=scene.camera.lens;scene.camera={yaw:.28,pitch:.3,distance:23};if(lens)scene.camera.lens={...lens,targetX:0,targetY:1.8,targetZ:-4,roll:0}; }); }
$('reset-camera').addEventListener('click', resetCamera);
function travel(direction) { finishGesture(); if (history[direction]()) refresh(); }
$('undo').addEventListener('click', () => travel('undo'));
$('redo').addEventListener('click', () => travel('redo'));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function panCamera(scene,dx,dy) {enableCamera(scene);const f=frameUniforms(renderState(scene),viewport.clientWidth/Math.max(1,viewport.clientHeight)),scale=2*scene.camera.distance*f[7]/Math.max(1,viewport.clientHeight),l=scene.camera.lens;for(const [k,i,min,max]of [['targetX',0,-64,64],['targetY',1,-32,96],['targetZ',2,-64,64]])l[k]=clamp(l[k]+(-f[4+i]*dx+f[8+i]*dy)*scale,min,max);}
let pointer = null;
viewport.addEventListener('pointerdown', e => { if (e.button !== 0) return; finishGesture(); history.begin(); viewport.focus(); viewport.setPointerCapture(e.pointerId); pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, pan:e.shiftKey }; });
viewport.addEventListener('pointermove', e => {
  if (!pointer || pointer.id !== e.pointerId) return;
  if(pointer.pan){edit(scene=>panCamera(scene,e.clientX-pointer.x,e.clientY-pointer.y));}else edit(scene => { scene.camera.yaw = wrapYaw(scene.camera.yaw - (e.clientX - pointer.x) * 0.005); scene.camera.pitch = clamp(scene.camera.pitch + (e.clientY - pointer.y) * 0.004, scene.camera.lens?-1.4:.08,scene.camera.lens?1.4:1.2); });
  pointer.x = e.clientX; pointer.y = e.clientY;
});
viewport.addEventListener('pointerup',()=>{if(pointer){pointer=null;finishGesture();}});
function cancelCameraGesture(){if(!pointer)return;const id=pointer.id;pointer=null;if(history.cancel())refresh();if(viewport.hasPointerCapture(id))viewport.releasePointerCapture(id);}
for(const event of ['pointercancel','lostpointercapture'])viewport.addEventListener(event,cancelCameraGesture);
viewport.addEventListener('wheel', e => {
  e.preventDefault(); history.begin();
  edit(scene => { scene.camera.distance = clamp(scene.camera.distance * Math.exp(clamp(e.deltaY, -100, 100) * 0.001), scene.camera.lens ? .5 : 10, scene.camera.lens?128:48); });
  clearTimeout(gestureTimer); gestureTimer = setTimeout(finishGesture, 180);
}, { passive: false });
viewport.addEventListener('keydown', e => {
  if(e.key==='Escape'&&pointer){e.preventDefault();cancelCameraGesture();return;}
  if(e.shiftKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();history.begin();edit(scene=>panCamera(scene,e.key==='ArrowLeft'?-20:e.key==='ArrowRight'?20:0,e.key==='ArrowUp'?-20:e.key==='ArrowDown'?20:0));return;}
  const actions = {
    ArrowLeft: c => c.yaw = wrapYaw(c.yaw - 0.08), ArrowRight: c => c.yaw = wrapYaw(c.yaw + 0.08),
    ArrowUp: c => c.pitch = clamp(c.pitch + 0.06, c.lens?-1.4:.08, c.lens?1.4:1.2), ArrowDown: c => c.pitch = clamp(c.pitch - 0.06, c.lens?-1.4:.08, c.lens?1.4:1.2),
    '+': c => c.distance = Math.max(c.lens ? .5 : 10, c.distance - 1), '=': c => c.distance = Math.max(c.lens ? .5 : 10, c.distance - 1), '-': c => c.distance = Math.min(c.lens?128:48, c.distance + 1),
  };
  if (e.key === 'Home') { e.preventDefault(); resetCamera(); }
  if (actions[e.key]) { e.preventDefault(); history.begin(); edit(scene => actions[e.key](scene.camera)); }
});
viewport.addEventListener('keyup', finishGesture);
viewport.addEventListener('blur', finishGesture);

async function assetRequest(path,options={}) {
  const token=session?.token??(await (await fetch('/api/session')).json()).token;
  const response=await fetch(path,{method:'POST',...options,headers:{'Content-Type':'application/octet-stream','X-Lithosky-Session':token,...options.headers},signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error((await response.text()).trim());return response;
}
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'X-Lithosky-Session': session.token, ...options.headers }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error((await response.text()).trim());
  return response.json();
}
function autosaveStatus(kind, error = '') {
  $('autosave-status').textContent = ({ pending: 'Changes waiting to autosave…', saving: 'Autosaving…', saved: 'Recovery saved on this device', error: 'Autosave paused: ' + error })[kind];
  $('retry-autosave').hidden = kind !== 'error';
}
async function connectRecovery() {
  if (connectingRecovery) return;
  connectingRecovery = true;
  try {
    const response = await fetch('/api/session', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Cannot connect to recovery storage.');
    session = await response.json();
    const result = await api('/api/recovery');
    autosave = new Autosave(async (scene, expectedRevision) => {
      const result = await api('/api/autosave', { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision, scene }) });
      return result.revision;
    }, session.revision, autosaveStatus);
    if (result.records.length) {
      $('recovery-choice').replaceChildren(...result.records.map(record => {
        const option = document.createElement('option'); option.value = record.id;
        option.textContent = record.title + ' · ' + new Date(record.modified).toLocaleString() + (record.recoveredPrevious ? ' · previous valid snapshot' : '');
        return option;
      }));
      if (result.records.some(r => r.id === session.id)) $('recovery-choice').value = session.id;
      $('recovery-banner').hidden = false;
      $('autosave-status').textContent = 'Choose recovery or keep this scene to enable autosave.';
      if (result.skipped) $('recovery-note').textContent = 'Some damaged snapshots were skipped. Choose a valid recovery, or keep this scene.';
    } else {
      autosaveEnabled = true;
      $('autosave-status').textContent = result.skipped ? 'No valid recovery found. New edits will autosave.' : 'Autosave ready';
      if (changed) autosave.enqueue(history.value);
    }
    $('retry-autosave').hidden = true;
  } catch (error) { autosaveStatus('error', error.message); }
  finally { connectingRecovery = false; }
}
function enableAutosave() {
  autosaveEnabled = true; $('recovery-banner').hidden = true; autosave.enqueue(history.value);
}
$('start-fresh').addEventListener('click', () => { finishGesture(); enableAutosave(); });
$('restore-scene').addEventListener('click', async () => {
  const before = editVersion;
  for (const id of ['restore-scene', 'start-fresh', 'recovery-choice']) $(id).disabled = true;
  try {
    const recovered = validateScene(await api('/api/recovery/' + $('recovery-choice').value), schema);
    if (before !== editVersion) throw new Error('The scene changed while loading. Try Restore again.');
    finishGesture(); if (history.replace(recovered)) refresh(); enableAutosave();
    $('file-status').textContent = 'Recovery restored. Save scene to download a named file.';
  } catch (error) { $('file-status').textContent = error.message; }
  finally { for (const id of ['restore-scene', 'start-fresh', 'recovery-choice']) $(id).disabled = false; }
});
$('retry-autosave').addEventListener('click', () => { if (autosave) void autosave.retry(); else void connectRecovery(); });
$('open-scene').addEventListener('click', () => { finishGesture(); $('scene-file').click(); });
$('scene-file').addEventListener('change', async () => {
  const file = $('scene-file').files[0], before = editVersion;
  $('scene-file').value = ''; if (!file) return;
  $('open-scene').disabled = true;
  try {
    if (file.size > MAX_PROJECT_BYTES) throw new Error('Scene container exceeds 20 MiB.');
    const bytes=await file.arrayBuffer();
    const imported=validateScene(await (await assetRequest('/api/project/open',{body:bytes})).json(),schema);
    if (before !== editVersion) throw new Error('The scene changed while opening. Please open the file again.');
    finishGesture(); if (history.replace(imported)) refresh();
    $('file-status').textContent = 'Opened ' + file.name + '. Undo restores the previous scene.';
  } catch (error) { $('file-status').textContent = 'Could not open scene: ' + error.message; }
  finally { $('open-scene').disabled = false; }
});
async function downloadScene() {
  if($('save-scene').disabled)return;
  $('save-scene').disabled=true;
  try {
  finishGesture();
  const scene = history.value;
  const blob=sceneView(scene).terrain.generator==='heightmap-v1'?await (await assetRequest('/api/project/save',{body:serializeScene(scene,schema)})).blob():new Blob([serializeScene(scene,schema)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url;
  anchor.download = (scene.title.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'landscape') + '.lithosky';
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  downloaded = JSON.stringify(scene);
  $('file-status').textContent = 'Download requested: ' + anchor.download;
  }catch(error){$('file-status').textContent='Could not save scene: '+error.message;}finally{$('save-scene').disabled=false;}
}
$('save-scene').addEventListener('click', downloadScene);
window.addEventListener('keydown', e => {
  if (!e.ctrlKey && !e.metaKey) return;
  if (e.key.toLowerCase() === 's') { e.preventDefault(); downloadScene(); return; }
  if (e.key.toLowerCase() === 'o') { e.preventDefault(); $('open-scene').click(); return; }
  if (e.target.matches('input:not([type=range]), textarea, [contenteditable=true]')) return;
  if (e.key.toLowerCase() === 'z') { e.preventDefault(); travel(e.shiftKey ? 'redo' : 'undo'); }
  if (e.key.toLowerCase() === 'y') { e.preventDefault(); travel('redo'); }
});
window.addEventListener('beforeunload', e => {
  if (changed && downloaded !== JSON.stringify(history.value) && (!autosaveEnabled || autosave.unsaved)) { e.preventDefault(); e.returnValue = ''; }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && autosaveEnabled) { finishGesture(); void autosave.flush(); } });
void connectRecovery();
$('help').addEventListener('click', () => $('guide').showModal());
new ResizeObserver(draw).observe(viewport);
window.addEventListener('pagehide', () => { transforms.cancel();if (autosaveEnabled) void autosave.flush(); generation++; terrainEpoch++; sculpt.cancel(); terrainGenerator.cancel(); terrainReady=false; finalRender.invalidate('Render stopped.'); active?.dispose(); active = null; });
window.addEventListener('pageshow', e => { if (e.persisted) {void updateGeometry();void startGraphics();} });
void updateGeometry();
syncControls();
void startGraphics();
fetch('/api/info').then(r => { if (!r.ok) throw new Error('Build information unavailable'); return r.json(); }).then(info => { $('build-info').textContent = `Lithosky ${info.version}`; }).catch(() => { $('build-info').textContent = 'Lithosky · build information unavailable'; });

}
void main().catch(error => { $('file-status').textContent = error.message; $('autosave-status').textContent = 'Scene editor unavailable. Restart Lithosky.'; document.querySelectorAll('main button, main input, main select').forEach(el => { el.disabled = true; }); });
