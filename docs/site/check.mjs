// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Deliberately checks our generated static HTML subset, not arbitrary web HTML.
export function checkSite(directory) {
  const root=path.resolve(directory), files=fs.readdirSync(root).filter(n=>n.endsWith('.html'));
  const documents=new Map(), problems=[]; let links=0,images=0;
  for(const file of files) {
    const html=fs.readFileSync(path.join(root,file),'utf8'), ids=new Set();
    for(const [,id] of html.matchAll(/\bid="([^"]+)"/g)) { if(ids.has(id)) problems.push(file+': duplicate id '+id);ids.add(id); }
    if((html.match(/<h1\b/g)||[]).length!==1) problems.push(file+': expected one h1');
    if(/\{\{[^}]+\}\}/.test(html)) problems.push(file+': unexpanded template');
    documents.set(file,{html,ids});
  }
  for(const [file,{html}] of documents) {
    for(const tag of html.matchAll(/<(?:a|link|img)\b[^>]*>/g)) {
      const match=/\b(?:href|src)="([^"]+)"/.exec(tag[0]);if(!match) continue;
      const value=match[1].replaceAll('&amp;','&'); links++;
      if(tag[0].startsWith('<img')) { images++;if(!/\balt="[^"]*"/.test(tag[0])) problems.push(file+': image needs alt text'); }
      const url=new URL(value,'https://local.invalid/'+file);
      if(url.origin!=='https://local.invalid') { if(url.protocol!=='https:') problems.push(file+': unsupported URL '+value);continue; }
      if(value.startsWith('/')) problems.push(file+': root-relative URL breaks subpath hosting: '+value);
      const target=decodeURIComponent(url.pathname.slice(1))||'index.html';
      const resolved=path.resolve(root,target);
      if(!resolved.startsWith(root+path.sep) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) { problems.push(file+': missing local target '+value);continue; }
      if(url.hash && !documents.get(target)?.ids.has(decodeURIComponent(url.hash.slice(1)))) problems.push(file+': missing anchor '+value);
    }
  }
  if(problems.length) throw new Error(problems.join('\n'));
  return {pages:files.length,links,images};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) console.log(checkSite(process.argv[2]||'dist/site'));
