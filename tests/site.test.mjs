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
    assert.equal(buildSite(out).links,report.links);
    fs.appendFileSync(path.join(out,'index.html'),'<a href="guide.html#nonexistent">Bad link</a>');assert.throws(()=>checkSite(out),/missing anchor/);
    buildSite(out);fs.rmSync(path.join(out,'assets','alpine.png'));assert.throws(()=>checkSite(out),/missing local target/);
    const protectedDir=path.join(dir,'unrelated');fs.mkdirSync(protectedDir);fs.writeFileSync(path.join(protectedDir,'keep'),'precious');
    assert.throws(()=>buildSite(protectedDir),/unrecognized/);assert.equal(fs.readFileSync(path.join(protectedDir,'keep'),'utf8'),'precious');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
