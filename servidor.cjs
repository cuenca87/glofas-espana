const http = require('http');
const fs = require('fs');
const path = require('path');
const mime = { '.html':'text/html', '.json':'application/json', '.png':'image/png', '.js':'text/javascript' };
http.createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const full = path.join(process.cwd(), p);
  fs.readFile(full, (err,data)=>{
    if (err) { res.writeHead(404); res.end('not found: ' + full); return; }
    res.writeHead(200, {'Content-Type': mime[path.extname(full)] || 'application/octet-stream'});
    res.end(data);
  });
}).listen(8744, ()=>console.log('listening on 8744'));
