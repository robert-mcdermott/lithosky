// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceHash,digest,renderSources} from './source.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),out=join(root,'docs/site/assets'),url=new URL(process.argv[2]||''),before=sourceHash(root);
if(url.hostname!=='127.0.0.1'||url.protocol!=='http:')throw Error('Use an isolated loopback app.');
for(const file of renderSources.filter(n=>n.startsWith('web/'))){const r=await fetch(new URL(file.slice(4),url));if(!r.ok||digest(new Uint8Array(await r.arrayBuffer()))!==digest(fs.readFileSync(join(root,file))))throw Error('Rebuild stale asset: '+file);}
const cli=process.env.PLAYWRIGHT_CLI||'playwright-cli',run=args=>execFileSync(cli,['--session','lithosky-spatial-capture',...args],{encoding:'utf8',maxBuffer:16*1024*1024});
const callback=file=>{const result=run(['run-code',fs.readFileSync(join(root,file),'utf8').replace('__OUTPUT__',JSON.stringify(out)).replace('__SCENE__',fs.readFileSync(join(out,'shore-observatory.lithosky'),'utf8'))]),match=/### Result\n([\s\S]*?)\n### Ran Playwright code/.exec(result);if(!match)throw Error(result);return JSON.parse(match[1]);};
try{run(['open',url.href,'--browser','chrome','--headed']);console.log('Checking spatial editor workflow');const workflow=callback('tests/browser-spatial.mjs');console.log('Checking solid GPU kernels');const gpu=callback('tests/browser-solids.mjs');console.log('Capturing original solids study');const report=callback('docs/capture/spatial-browser.mjs');if(before!==sourceHash(root))throw Error('Sources changed during capture.');for(const r of report.records)r.sha256=digest(fs.readFileSync(join(out,r.name+'.png')));fs.writeFileSync(join(out,'spatial-captures.json'),JSON.stringify({sourceHash:before,sceneSHA256:digest(fs.readFileSync(join(out,'shore-observatory.lithosky'))),studioSHA256:digest(fs.readFileSync(join(out,'objects-studio.png'))),capturedAt:new Date().toISOString(),workflow,gpu,...report},null,2)+'\n');console.log(JSON.stringify({workflow,gpu,records:report.records.map(({name,milliseconds})=>({name,milliseconds})),changedPixels:report.changedPixels}));}catch(error){console.error(error.stdout||error.message);process.exitCode=1;}finally{run(['close']);}
