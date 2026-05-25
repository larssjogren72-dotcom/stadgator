const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT = process.env.PORT || 3456;

http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  if (reqUrl.pathname.startsWith('/proxy/')) {
    // Proxy → openparking.stockholm.se (parkeringsregler)
    const apiPath = reqUrl.pathname.replace('/proxy/', '/LTF-Tolken/v1/');
    const target  = apiPath + '?' + reqUrl.searchParams.toString();
    forward('openparking.stockholm.se', target, res);

  } else if (reqUrl.pathname.startsWith('/wfs/')) {
    // Proxy → openstreetgs.stockholm.se (WFS zonlager)
    const wfsPath = reqUrl.pathname.replace('/wfs/', '/geoservice/api/');
    const target  = wfsPath + '?' + reqUrl.searchParams.toString();
    forward('openstreetgs.stockholm.se', target, res);

  } else {
    // Servera statiska filer (index.html)
    const filePath = path.join(
      __dirname,
      reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname
    );
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
      res.setHeader('Content-Type', types[path.extname(filePath)] || 'text/plain');
      res.writeHead(200);
      res.end(data);
    });
  }

}).listen(PORT, () => console.log(`Städgator: http://localhost:${PORT}`));

function forward(hostname, path, res) {
  const proxyReq = https.request({ hostname, path, method: 'GET' }, (proxyRes) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'application/json');
    res.writeHead(proxyRes.statusCode);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (err) => { res.writeHead(502); res.end(JSON.stringify({ error: err.message })); });
  proxyReq.end();
}
