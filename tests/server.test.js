import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaticServer } from '../scripts/server.mjs';
let server,base;
test.before(async()=>{server=createStaticServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;});
test.after(()=>new Promise(resolve=>server.close(resolve)));
test('serves the app and modules with correct types',async()=>{
  for(const [path,type]of[['/','text/html'],['/src/simulation.js','text/javascript'],['/data/coast.json','application/json'],['/styles.css','text/css']]){
    const r=await fetch(base+path);assert.equal(r.status,200);assert.ok(r.headers.get('content-type').startsWith(type));
  }
});
test('does not serve repository internals or path traversals',async()=>{
  for(const path of ['/.git/config','/package.json','/scripts/server.mjs','/src/../../package.json','/data/%2e%2e%2fpackage.json','/src/%5c..%5cpackage.json','/missing'])assert.equal((await fetch(base+path)).status,404);
});
test('HEAD returns headers without a body and writes are rejected',async()=>{
  const head=await fetch(base,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');assert.ok(Number(head.headers.get('content-length'))>0);
  assert.equal((await fetch(base,{method:'POST'})).status,405);
});
test('malformed percent encoding returns 400',async()=>{assert.equal((await fetch(base+'/src/%E0%A4%A')).status,400);});
