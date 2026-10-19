// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateScene} from '../web/scene/document.js';
import { buildSite } from '../docs/site/build.mjs';
import { checkSite } from '../docs/site/check.mjs';
test('site generates all pages and portable scenes with checked capture provenance',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lithosky-site-test-'));
  try{
    const out=path.join(dir,'site'),report=buildSite(out);assert.equal(report.pages,4);assert.ok(report.images>=8);
    for(const id of ['alpine','highland','distant']) assert.equal(JSON.parse(fs.readFileSync(path.join(out,'scenes',id+'.lithosky'))).format,'lithosky');
    const daylight=JSON.parse(fs.readFileSync(path.join(out,'assets/daylight.lithosky'))),schema=JSON.parse(fs.readFileSync(new URL('../internal/scene/schema.json',import.meta.url)));
    assert.equal(validateScene(daylight,schema).version,6);
    const radiant=JSON.parse(fs.readFileSync(path.join(out,'assets/radiant-highlands.lithosky')));assert.equal(validateScene(radiant,schema).version,8);assert.equal(radiant.lighting.transport.bounces,3);
    const lake=JSON.parse(fs.readFileSync(path.join(out,'assets/silver-basin.lithosky')));assert.equal(validateScene(lake,schema).version,9);assert.equal(lake.water.optics.model,'lake-v1');
    for(const id of ['mountain','coast','snow']){const composition=JSON.parse(fs.readFileSync(path.join(out,'assets',id+'-composition.lithosky')));assert.equal(validateScene(composition,schema).version,10);assert.equal(composition.camera.lens.model,'thin-lens-v1');}
    const camera=JSON.parse(fs.readFileSync(path.join(out,'assets/camera-captures.json')));assert.equal(camera.records.length,14);assert.ok(camera.diagnostics.regions.every(r=>r.different===0));
    const editable=JSON.parse(fs.readFileSync(path.join(out,'assets/editable-basin.lithosky')));assert.equal(validateScene(editable,schema).version,11);assert.ok(editable.entities.some(n=>n.components.group));const entities=JSON.parse(fs.readFileSync(path.join(out,'assets/entity-captures.json')));assert.equal(entities.gpu.migrationDifferences,0);assert.ok(entities.workflow.groupLocks);
    const observatory=JSON.parse(fs.readFileSync(path.join(out,'assets/shore-observatory.lithosky')));assert.equal(validateScene(observatory,schema).version,12);assert.equal(observatory.entities.filter(n=>n.components.primitive).length,5);const spatial=JSON.parse(fs.readFileSync(path.join(out,'assets/spatial-captures.json')));assert.equal(spatial.gpu.rays,1024);assert.ok(spatial.workflow.cancelPreservesRedo&&spatial.workflow.pngPixelEquality&&spatial.workflow.objectUploadsOnly);
    const garden=JSON.parse(fs.readFileSync(path.join(out,'assets/stone-garden.lithosky')));assert.equal(validateScene(garden,schema).version,13);assert.ok(garden.bookmarks.length&&garden.entities.some(n=>n.components.surface?.paint?.length));for(const id of ['blank','canvas','garden'])assert.equal(validateScene(JSON.parse(fs.readFileSync(path.join(out,'scenes',id+'.lithosky'))),schema).version,13);const workspace=JSON.parse(fs.readFileSync(path.join(out,'assets/workspace-captures.json')));assert.equal(workspace.gpu.maskRays,1024);assert.ok(workspace.workflow.pngMatches&&workspace.workflow.paintCancelRedo&&workspace.workflow.bookmarks);
    assert.equal(buildSite(out).links,report.links);
    fs.appendFileSync(path.join(out,'index.html'),'<a href="guide.html#nonexistent">Bad link</a>');assert.throws(()=>checkSite(out),/missing anchor/);
    buildSite(out);fs.rmSync(path.join(out,'assets','alpine.png'));assert.throws(()=>checkSite(out),/missing local target/);
    const protectedDir=path.join(dir,'unrelated');fs.mkdirSync(protectedDir);fs.writeFileSync(path.join(protectedDir,'keep'),'precious');
    assert.throws(()=>buildSite(protectedDir),/unrecognized/);assert.equal(fs.readFileSync(path.join(protectedDir,'keep'),'utf8'),'precious');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
