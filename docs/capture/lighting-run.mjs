// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';
import {digest,sourceHash,renderSources} from './source.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),url=new URL(process.argv[2]||'');
if(url.hostname!=='127.0.0.1'||url.protocol!=='http:')throw Error('Use an isolated loopback app.');
const before=sourceHash(root),out=join(root,'docs/site/assets');
for(const source of renderSources.filter(s=>s.startsWith('web/'))) {
  const response=await fetch(new URL(source.slice(4),url),{signal:AbortSignal.timeout(10000)});
  if(!response.ok||digest(new Uint8Array(await response.arrayBuffer()))!==digest(fs.readFileSync(join(root,source))))throw Error('Rebuild stale asset: '+source);
}
const cli=process.env.PLAYWRIGHT_CLI||'playwright-cli',run=args=>execFileSync(cli,['--session','lithosky-lighting-capture',...args],{encoding:'utf8',maxBuffer:16*1024*1024});
try {
  run(['open',url.href,'--browser','chrome','--headed']);
  const callback=fs.readFileSync(join(root,'docs/capture/lighting-browser.mjs'),'utf8').replace('__OUTPUT__',JSON.stringify(out)).replace('__SCENE__',fs.readFileSync(join(out,'radiant-highlands.lithosky'),'utf8'));
  const result=run(['run-code',callback]),match=/### Result\n([\s\S]*?)\n### Ran Playwright code/.exec(result);
  if(!match)throw Error(result);
  const report=JSON.parse(match[1]);
  const probeResult=run(['run-code',fs.readFileSync(join(root,'tests/browser-lighting-probe.mjs'),'utf8')]);
  const probes=/### Result\n([\s\S]*?)\n### Ran Playwright code/.exec(probeResult);if(!probes)throw Error(probeResult);
  report.probes=JSON.parse(probes[1]);
  const energyResult=run(['run-code',fs.readFileSync(join(root,'tests/browser-lighting-energy.mjs'),'utf8')]);
  const energy=/### Result\n([\s\S]*?)\n### Ran Playwright code/.exec(energyResult);if(!energy)throw Error(energyResult);
  report.emitterTests=JSON.parse(energy[1]);
  if(sourceHash(root)!==before)throw Error('Sources changed during capture.');
  const scene=fs.readFileSync(join(out,'radiant-highlands.lithosky'));

  for(const record of report.records)record.sha256=digest(fs.readFileSync(join(out,record.name+'.png')));
  const manifest={sourceHash:before,sceneSHA256:digest(scene),capturedAt:new Date().toISOString(),...report};
  fs.writeFileSync(join(out,'lighting-captures.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({captures:report.records.map(({name,milliseconds})=>({name,milliseconds})),probes:report.probes,hardware:report.hardware,errors:report.errors}));
}catch(error){console.error(error.stdout||error.message);process.exitCode=1;}finally{run(['close']);}
