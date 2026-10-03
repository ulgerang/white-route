import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8'};
export function createStaticServer(root=projectRoot){
  return http.createServer(async(req,res)=>{
    const respond=(code,text)=>{res.writeHead(code,{'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:text);};
    if(!['GET','HEAD'].includes(req.method)){respond(405,'Method not allowed');return;}
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const relative=pathname==='/'?'index.html':pathname.slice(1);
      if(pathname.includes('\\')||pathname.includes('\0')||relative.split('/').some(p=>p==='..'||p==='.')||!(['index.html','styles.css'].includes(relative)||relative.startsWith('src/')||relative.startsWith('data/'))){respond(404,'Not found');return;}
      const resolved=await realpath(path.join(root,relative)),base=await realpath(root);
      if(!resolved.startsWith(base+path.sep)||!mime[path.extname(resolved)]||!(await stat(resolved)).isFile()){respond(404,'Not found');return;}
      const body=await readFile(resolved);
      res.writeHead(200,{'Content-Type':mime[path.extname(resolved)],'Content-Length':body.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
      res.end(req.method==='HEAD'?undefined:body);
    }catch(error){respond(error instanceof URIError?400:error.code==='ENOENT'||error.code==='ENOTDIR'?404:500,'Unable to serve file');}
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),value=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
  const port=Number(value('--port',process.env.PORT||5173)),host=value('--host','127.0.0.1');
  if(!Number.isInteger(port)||port<1||port>65535||!host){console.error('Usage: npm run dev -- --port 5173 --host 127.0.0.1');process.exit(1);}
  const server=createStaticServer(args.includes('--dist')?path.join(projectRoot,'dist'):projectRoot);
  server.on('error',error=>{console.error(`Server failed: ${error.message}`);process.exitCode=1;});
  server.listen(port,host,()=>console.log(`WHITE ROUTE: http://${host.includes(':')?`[${host}]`:host}:${port}`));
}
