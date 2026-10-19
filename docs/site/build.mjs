// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, sourceHash } from '../capture/source.mjs';
import { validateScene } from '../../web/scene/document.js';
import { validateStudies, validateCompositions } from '../../web/scene/studies.js';
import { checkSite } from './check.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)), root=path.resolve(here,'../..');
export const escapeHTML=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const pages=[['index','Lithosky','Compose a landscape, trace the light, and keep the image. A local landscape studio.'],['install','Get started','Build and run the standalone Lithosky landscape studio.'],['guide','The field guide','From your first terrain seed to a ray-traced still.'],['gallery','Three starting points','Original landscapes rendered locally in Lithosky.']];
export function buildSite(destination=path.join(root,'dist/site')) {
  const out=path.resolve(destination);
  fs.mkdirSync(path.dirname(out),{recursive:true});
  const actual=fs.existsSync(out)?fs.realpathSync(out):path.join(fs.realpathSync(path.dirname(out)),path.basename(out));
  if(actual===root || (actual.startsWith(root+path.sep) && !actual.startsWith(path.join(root,'dist')+path.sep))) throw new Error('Site output inside this repository must be under dist/.');
  if(fs.existsSync(out) && (fs.lstatSync(out).isSymbolicLink() || !fs.statSync(out).isDirectory() || !fs.existsSync(path.join(out,'.lithosky-site')) || fs.readFileSync(path.join(out,'.lithosky-site'),'utf8')!=='Generated Lithosky site\n')) throw new Error('Refusing to replace an unrecognized output directory.');
  const version=/var version = "([^"]+)"/.exec(fs.readFileSync(path.join(root,'main.go'),'utf8'))[1];
  const schema=JSON.parse(fs.readFileSync(path.join(root,'internal/scene/schema.json')));
  const studies=validateStudies(JSON.parse(fs.readFileSync(path.join(root,'web/scenes/studies.json'))),schema);
  const compositions=validateCompositions(JSON.parse(fs.readFileSync(path.join(root,'web/scenes/compositions.json'))),schema);
  const captures=JSON.parse(fs.readFileSync(path.join(here,'assets/captures.json')));
  if(captures.version!==version || captures.sourceHash!==sourceHash(root)) throw new Error('Captures are stale. Rebuild the app and run docs/capture/run.mjs.');
  if(captures.records.length!==studies.length) throw new Error('Incomplete gallery captures.');
  for(const study of studies) {
    const capture=captures.records.find(c=>c.id===study.id), bytes=fs.readFileSync(path.join(here,'assets',study.id+'.png'));
    const scene=JSON.parse(fs.readFileSync(path.join(here,'assets',study.id+'.lithosky')));
    if(!capture || JSON.stringify(capture.scene)!==JSON.stringify(study.scene) || JSON.stringify(scene)!==JSON.stringify(study.scene) || capture.sha256!==digest(bytes) || capture.width!==960 || capture.height!==540 || capture.samples!==64 || capture.detail!==512) throw new Error('Capture provenance mismatch: '+study.id);
    if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.readUInt32BE(16)!==960 || bytes.readUInt32BE(20)!==540) throw new Error('Invalid gallery PNG: '+study.id);
  }
  if(captures.studioSHA256!==digest(fs.readFileSync(path.join(here,'assets/studio.png')))) throw new Error('Studio screenshot provenance mismatch.');
  const terrain=JSON.parse(fs.readFileSync(path.join(here,'assets/terrain-captures.json')));
  const terrainScene=fs.readFileSync(path.join(here,'assets/sunlit-ridges.lithosky'));
  validateScene(JSON.parse(terrainScene),schema);
  if(terrain.sourceHash!==sourceHash(root)||terrain.sceneSHA256!==digest(terrainScene)||terrain.records.length!==3)throw new Error('Terrain comparisons are stale. Run docs/capture/detail-run.mjs.');
  for(const detail of [128,512,1024]) {
    const record=terrain.records.find(r=>r.detail===detail),bytes=fs.readFileSync(path.join(here,'assets','terrain-'+detail+'.png'));
    if(!record||record.sha256!==digest(bytes)||record.width!==960||record.height!==540||record.samples!==32||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.readUInt32BE(16)!==960||bytes.readUInt32BE(20)!==540)throw new Error('Terrain comparison provenance mismatch: '+detail);
  }
  const materials=JSON.parse(fs.readFileSync(path.join(here,'assets/material-captures.json')));
  const materialScene=fs.readFileSync(path.join(here,'assets/weathered-highlands.lithosky'));
  validateScene(JSON.parse(materialScene),schema);
  const materialNames=['material-simple','material-geology','material-rock','material-ground','material-snow',...['simple','geology'].flatMap(kind=>['foreground','middle','horizon'].map(region=>'material-'+kind+'-'+region))];
  if(materials.sourceHash!==sourceHash(root)||materials.sceneSHA256!==digest(materialScene)||materials.records.length!==materialNames.length)throw new Error('Material captures are stale. Run docs/capture/material-run.mjs.');
  for(const name of materialNames) {
    const record=materials.records.find(r=>r.name===name),bytes=fs.readFileSync(path.join(here,'assets',name+'.png'));
    if(!record||record.sha256!==digest(bytes)||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.readUInt32BE(16)!==record.width||bytes.readUInt32BE(20)!==record.height)throw new Error('Material capture provenance mismatch: '+name);
    if(record.scene){validateScene(record.scene,schema);if(record.width!==960||record.height!==540||record.samples!==32||record.detail!==1024)throw new Error('Material capture settings mismatch: '+name);}
    else if(record.width!==256||record.height!==128||!record.parent||!record.crop)throw new Error('Material crop mismatch: '+name);
  }
  const lighting=JSON.parse(fs.readFileSync(path.join(here,'assets/lighting-captures.json')));
  const lightingScene=fs.readFileSync(path.join(here,'assets/radiant-highlands.lithosky'));
  validateScene(JSON.parse(lightingScene),schema);
  const lightingNames=['lighting-classic','lighting-direct','lighting-studio','lighting-exposure','lighting-area'];
  if(lighting.sourceHash!==sourceHash(root)||lighting.sceneSHA256!==digest(lightingScene)||lighting.records.length!==lightingNames.length||lighting.probes.scalars!==2048||lighting.probes.sampleRays!==3072||lighting.probes.worst>.002||lighting.probes.sampleWorst>.005||lighting.probes.furnace.some(x=>x>1.05)||lighting.emitterTests.length!==7||!lighting.probes.tallShadow?.occluded||!lighting.probes.tallShadow?.openSky||lighting.probes.tallShadow.distance<=150)throw new Error('Lighting captures are stale. Run docs/capture/lighting-run.mjs.');
  for(const name of lightingNames) {
    const r=lighting.records.find(r=>r.name===name),bytes=fs.readFileSync(path.join(here,'assets',name+'.png'));
    if(!r||r.sha256!==digest(bytes)||r.width!==960||r.height!==540||r.detail!==1024||r.samples!==64||r.statistics.blackPixels!==0||r.statistics.whitePixels!==0||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.readUInt32BE(16)!==960||bytes.readUInt32BE(20)!==540)throw new Error('Lighting capture provenance mismatch: '+name);
    validateScene(r.scene,schema);
  }
  const water=JSON.parse(fs.readFileSync(path.join(here,'assets/water-captures.json')));
  const waterScene=fs.readFileSync(path.join(here,'assets/silver-basin.lithosky'));validateScene(JSON.parse(waterScene),schema);
  const waterNames=['water-classic','water-calm','water-ripples','water-clear','water-grazing','water-clean'];
  if(water.sourceHash!==sourceHash(root)||water.sceneSHA256!==digest(waterScene)||water.records.length!==6||water.probes.scalars!==2048||water.probes.worst>.0001||water.probes.cases.length!==6||water.noise?.referenceSamples!==256||water.noise.errors[1].rmse>=water.noise.errors[0].rmse*.65||water.probes.cases.filter(c=>c.dark).some(c=>c.radiance.some(x=>x!==0)))throw Error('Water captures are stale. Run docs/capture/water-run.mjs.');
  for(const name of waterNames){const r=water.records.find(r=>r.name===name),bytes=fs.readFileSync(path.join(here,'assets',name+'.png'));if(!r||r.sha256!==digest(bytes)||r.width!==960||r.height!==540||r.detail!==1024||r.samples!==(name==='water-clean'?256:64)||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.readUInt32BE(16)!==960||bytes.readUInt32BE(20)!==540)throw Error('Water capture provenance mismatch: '+name);validateScene(r.scene,schema);}
  const camera=JSON.parse(fs.readFileSync(path.join(here,'assets/camera-captures.json')));
  const cameraNames=[...compositions.flatMap(s=>[s.id+'-composition',...['foreground','middle','horizon'].map(r=>s.id+'-composition-'+r)]),'camera-pinhole','camera-lens'];
  if(camera.sourceHash!==sourceHash(root)||camera.records.length!==14||camera.diagnostics.reports.length!==2||camera.diagnostics.reports.some(r=>r.scalars!==2048||r.worst>5e-5)||camera.diagnostics.regions.length!==2||camera.diagnostics.regions.some(r=>r.different!==0)||camera.diagnostics.large.length!==3||!camera.workflow.saveReopenRecovery||!camera.workflow.dragCancel||!camera.workflow.webglEditing||camera.workflow.errors.length)throw Error('Camera captures are stale. Run docs/capture/camera-run.mjs.');
  for(const name of cameraNames){const r=camera.records.find(r=>r.name===name),bytes=fs.readFileSync(path.join(here,'assets',name+'.png'));if(!r||r.sha256!==digest(bytes)||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.readUInt32BE(16)!==r.width||bytes.readUInt32BE(20)!==r.height)throw Error('Camera capture provenance mismatch: '+name);if(r.scene)validateScene(r.scene,schema);else if(r.width!==256||r.height!==128||!r.parent||!r.crop)throw Error('Invalid composition crop: '+name);}
  for(const s of compositions){const r=camera.records.find(r=>r.id===s.id),scene=JSON.parse(fs.readFileSync(path.join(here,'assets',s.id+'-composition.lithosky')));if(JSON.stringify(r.scene)!==JSON.stringify(s.scene)||JSON.stringify(scene)!==JSON.stringify(s.scene)||Math.max(r.width,r.height)!==2048||r.samples!==64||r.detail!==1024)throw Error('Composition provenance mismatch: '+s.id);}
  const compositionGallery=compositions.map(s=>{const r=camera.records.find(r=>r.id===s.id),name=s.id+'-composition';return `<article class="study"><a href="assets/${name}.png"><img src="assets/${name}.png" alt="${escapeHTML(s.description)} in Lithosky" width="${r.width}" height="${r.height}" loading="lazy"></a><h3>${escapeHTML(s.scene.title)}</h3><p>${r.width} × ${r.height} · 64 samples · 1024² terrain</p><p><a href="assets/${name}.lithosky" download>Download scene</a> · <a href="assets/${name}-foreground.png">Foreground crop</a> · <a href="assets/${name}-middle.png">Middle crop</a> · <a href="assets/${name}-horizon.png">Horizon crop</a></p></article>`;}).join('\n');
  const gallery=studies.map((s,i)=>`<article class="study" id="${s.id}"><a href="assets/${s.id}.png" aria-label="View ${escapeHTML(s.scene.title)} at full size"><img src="assets/${s.id}.png" alt="${escapeHTML(s.description)} rendered in Lithosky" width="960" height="540" loading="lazy"></a><div class="study-caption"><span class="number">0${i+1}</span><div><h2>${escapeHTML(s.scene.title)}</h2><p>${escapeHTML(s.description)}.</p><p class="small">Seed ${s.scene.terrain.seed} · 960 × 540 · 64 samples · 512² terrain</p><a href="scenes/${s.id}.lithosky" download>Open this starting point ↗</a></div></div></article>`).join('\n');
  const temp=fs.mkdtempSync(path.join(path.dirname(out),'.lithosky-site-'));
  try {
    fs.mkdirSync(path.join(temp,'assets'));fs.mkdirSync(path.join(temp,'scenes'));
    for(const name of ['camera-captures.json',...cameraNames.map(n=>n+'.png'),...compositions.map(s=>s.id+'-composition.lithosky')])fs.copyFileSync(path.join(here,'assets',name),path.join(temp,'assets',name));
    for(const name of ['silver-basin.lithosky','water-captures.json',...waterNames.map(n=>n+'.png'),'radiant-highlands.lithosky','lighting-captures.json',...lightingNames.map(n=>n+'.png'),'weathered-highlands.lithosky','material-captures.json',...materialNames.map(name=>name+'.png'),'sunlit-ridges.lithosky','terrain-128.png','terrain-512.png','terrain-1024.png','terrain-captures.json','site.css','studio.png','daylight.lithosky','terraced-basin.png','terraced-basin-scale.json','terraced-basin.heightmap','terraced-basin.lithosky',...studies.map(s=>s.id+'.png')]) fs.copyFileSync(path.join(here,'assets',name),path.join(temp,'assets',name));
    fs.copyFileSync(path.join(root,'web/favicon.svg'),path.join(temp,'assets/icon.svg'));
    for(const s of studies) fs.copyFileSync(path.join(here,'assets',s.id+'.lithosky'),path.join(temp,'scenes',s.id+'.lithosky'));
    for(const name of ['LICENSE','NOTICE']) fs.copyFileSync(path.join(root,name),path.join(temp,name+'.txt'));
    fs.copyFileSync(path.join(here,'assets/captures.json'),path.join(temp,'assets/captures.json'));
    for(const [id,title,description] of pages) {
      const content=fs.readFileSync(path.join(here,'pages',id+'.html'),'utf8').replaceAll('{{version}}',escapeHTML(version)).replaceAll('{{gallery}}',gallery).replaceAll('{{compositions}}',compositionGallery);
      const nav=pages.map(([key,label])=>`<a href="${key}.html"${key===id?' aria-current="page"':''}>${key==='index'?'Home':escapeHTML(label)}</a>`).join('');
      fs.writeFileSync(path.join(temp,id+'.html'),`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escapeHTML(description)}"><meta name="theme-color" content="#eeeede"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'"><title>${escapeHTML(title)}${id==='index'?' — Landscape studio':' · Lithosky'}</title><link rel="icon" href="assets/icon.svg" type="image/svg+xml"><link rel="stylesheet" href="assets/site.css"></head>
<body><a class="skip" href="#main">Skip to content</a><header class="site-header"><a class="brand" href="index.html"><img src="assets/icon.svg" width="30" height="30" alt="">lithosky<span>.</span></a><nav aria-label="Main navigation">${nav}</nav><a class="source-link" href="https://github.com/robert-mcdermott/lithosky">Source ↗</a></header>
<main id="main">${content}</main>
<footer><a class="brand" href="index.html">lithosky<span>.</span></a><p>A landscape studio, on your device.<br>Development build ${escapeHTML(version)} · Apache-2.0</p><div><a href="LICENSE.txt">License</a><a href="NOTICE.txt">Notice</a><a href="guide.html#limits">Capabilities &amp; limits</a></div></footer></body></html>\n`);
    }
    fs.writeFileSync(path.join(temp,'.nojekyll'),'');
    fs.writeFileSync(path.join(temp,'.lithosky-site'),'Generated Lithosky site\n');
    const report=checkSite(temp);
    if(fs.existsSync(out)) fs.rmSync(out,{recursive:true});
    fs.renameSync(temp,out);
    return {out,version,...report};
  } catch(error) { fs.rmSync(temp,{recursive:true,force:true});throw error; }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) console.log(JSON.stringify(buildSite(process.argv[2]),null,2));
