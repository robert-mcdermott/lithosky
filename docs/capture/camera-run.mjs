// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';
import {digest,sourceHash,renderSources} from './source.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),url=new URL(process.argv[2]||'');
if(url.hostname!=='127.0.0.1'||url.protocol!=='http:')throw Error('Use an isolated loopback app.');
const before=sourceHash(root),out=join(root,'docs/site/assets');
for(const source of renderSources.filter(s=>s.startsWith('web/'))){const r=await fetch(new URL(source.slice(4),url),{signal:AbortSignal.timeout(10000)});if(!r.ok||digest(new Uint8Array(await r.arrayBuffer()))!==digest(fs.readFileSync(join(root,source))))throw Error('Rebuild stale asset: '+source);}
const cli=process.env.PLAYWRIGHT_CLI||'playwright-cli',run=args=>execFileSync(cli,['--session','lithosky-camera-capture',...args],{encoding:'utf8',maxBuffer:16*1024*1024});
const callback=path=>{const result=run(['run-code',fs.readFileSync(join(root,path),'utf8').replace('__OUTPUT__',JSON.stringify(out))]),match=/### Result\n([\s\S]*?)\n### Ran Playwright code/.exec(result);if(!match)throw Error(result);return JSON.parse(match[1]);};
try{
 run(['open',url.href,'--browser','chrome','--headed']);
 const diagnostics=callback('tests/browser-camera.mjs'),workflow=callback('tests/browser-camera-ui.mjs'),report=callback('docs/capture/camera-browser.mjs');
 if(before!==sourceHash(root))throw Error('Sources changed during capture.');
 for(const r of report.records)r.sha256=digest(fs.readFileSync(join(out,r.name+'.png')));
 fs.writeFileSync(join(out,'camera-captures.json'),JSON.stringify({sourceHash:before,capturedAt:new Date().toISOString(),diagnostics,workflow,...report},null,2)+'\n');console.log(JSON.stringify({records:report.records.map(({name,milliseconds})=>({name,milliseconds})),diagnostics,workflow}));
}catch(error){console.error(error.stdout||error.message);process.exitCode=1;}finally{run(['close']);}
