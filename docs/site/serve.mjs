// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const root=fs.realpathSync(path.resolve(process.argv[2]||'dist/site'));
const port=Number(process.argv[3]||8124);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.lithosky':'application/json','.txt':'text/plain; charset=utf-8'};
const server=http.createServer((req,res)=>{
  try {
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const requested=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
    const target=fs.realpathSync(requested);
    if(!target.startsWith(root+path.sep)||!fs.statSync(target).isFile()) throw new Error('missing');
    res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
    if(req.method==='HEAD')res.end();else fs.createReadStream(target).pipe(res);
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log('Site preview: http://127.0.0.1:'+server.address().port));
