// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, sourceHash, renderSources } from './source.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const url=new URL(process.argv[2]||'');
if(url.hostname!=='127.0.0.1'||url.protocol!=='http:') throw new Error('Capture requires an isolated loopback app instance.');
const out=join(root,'docs/site/assets'), cli=process.env.PLAYWRIGHT_CLI||'playwright-cli';
const session='lithosky-capture';
const run=args=>execFileSync(cli,['--session',session,...args],{encoding:'utf8',maxBuffer:16*1024*1024});
fs.mkdirSync(out,{recursive:true});
const before=sourceHash(root);
for(const source of renderSources.filter(name=>name.startsWith('web/'))) {
  const response=await fetch(new URL(source.slice(4),url),{signal:AbortSignal.timeout(10000)});
  if(!response.ok || digest(new Uint8Array(await response.arrayBuffer()))!==digest(fs.readFileSync(join(root,source)))) throw new Error('The running binary has stale assets. Rebuild before capturing: '+source);
}
try {
  run(['open',url.href,'--browser','chrome','--headed']);
  const callback=fs.readFileSync(join(root,'docs/capture/browser.mjs'),'utf8').replace('__OUTPUT__',JSON.stringify(out));
  const result=run(['run-code',callback]);
  const match=/### Result\n([\s\S]*?)\n### Ran Playwright code/.exec(result);
  if(!match) throw new Error(result);
  const data=JSON.parse(match[1]);
  const version=/var version = "([^"]+)"/.exec(fs.readFileSync(join(root,'main.go'),'utf8'))[1];
  if(data.build.version!==version) throw new Error('Rebuild the app before capturing: version differs.');
  for(const record of data.records) {
    const scene=JSON.parse(fs.readFileSync(join(out,record.id+'.lithosky')));
    if(JSON.stringify(scene)!==JSON.stringify(record.scene)) throw new Error('Downloaded scene differs from starter: '+record.id);
    record.sha256=digest(fs.readFileSync(join(out,record.id+'.png')));
  }
  if(sourceHash(root)!==before) throw new Error('Source changed during capture. Rebuild and capture again.');
  const manifest={version,browser:data.browser,capturedAt:new Date().toISOString(),sourceHash:sourceHash(root),records:data.records,studioSHA256:digest(fs.readFileSync(join(out,'studio.png')))};
  fs.writeFileSync(join(out,'captures.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log('Captured three 960 × 540 renders, their scenes, and the studio screenshot.');
} finally { run(['close']); }
