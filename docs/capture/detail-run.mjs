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
const cli=process.env.PLAYWRIGHT_CLI||'playwright-cli',run=args=>execFileSync(cli,['--session','lithosky-detail-capture',...args],{encoding:'utf8',maxBuffer:16*1024*1024});
try {
  run(['open',url.href,'--browser','chrome','--headed']);
  const callback=fs.readFileSync(join(root,'docs/capture/detail-browser.mjs'),'utf8').replace('__OUTPUT__',JSON.stringify(out)).replace('__SCENE__',fs.readFileSync(join(out,'sunlit-ridges.lithosky'),'utf8'));
  const result=run(['run-code',callback]),match=/### Result\n([\s\S]*?)\n### Ran Playwright code/.exec(result);
  if(!match)throw Error(result);
  const report=JSON.parse(match[1]);
  if(sourceHash(root)!==before)throw Error('Sources changed during capture.');
  const scene=fs.readFileSync(join(out,'sunlit-ridges.lithosky'));
  if(JSON.stringify(JSON.parse(scene))!==JSON.stringify(report.diagnostics.scene))throw Error('Scene changed during capture.');
  for(const record of report.records)record.sha256=digest(fs.readFileSync(join(out,'terrain-'+record.detail+'.png')));
  const manifest={sourceHash:before,sceneSHA256:digest(scene),capturedAt:new Date().toISOString(),...report};
  fs.writeFileSync(join(out,'terrain-captures.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(report));
}catch(error){console.error(error.stdout||error.message);process.exitCode=1;}finally{run(['close']);}
