const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT = process.env.PORT || 3456;

// Server-side Stockholm-API-nyckel: env-variabel (Railway) eller lokal .apikey-fil.
// Sätts den → användaren behöver INGEN egen nyckel. Saknas den → fallback till
// klientens nyckel (gammalt beteende, för lokal utveckling).
let API_KEY = (process.env.STHLM_API_KEY || '').trim();
if (!API_KEY) {
  try { API_KEY = fs.readFileSync(path.join(__dirname, '.apikey'), 'utf8').trim(); } catch {}
}
console.log(API_KEY ? '[ParkSpot] Server-API-nyckel laddad – användare behöver ingen egen.'
                    : '[ParkSpot] Ingen server-nyckel – faller tillbaka på klientens nyckel.');

http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  if (reqUrl.pathname.startsWith('/proxy/')) {
    // Proxy → openparking.stockholm.se (parkeringsregler). Nyckel = apiKey-param.
    const apiPath = reqUrl.pathname.replace('/proxy/', '/LTF-Tolken/v1/');
    if (API_KEY) reqUrl.searchParams.set('apiKey', API_KEY);   // injicera server-nyckel
    const target  = apiPath + '?' + reqUrl.searchParams.toString();
    forward('openparking.stockholm.se', target, res);

  } else if (reqUrl.pathname.startsWith('/wfs/')) {
    // Proxy → openstreetgs.stockholm.se (WFS). Nyckel = path-segment /geoservice/api/{key}/...
    let wfsPath;
    if (API_KEY) {
      const afterKey = reqUrl.pathname.replace(/^\/wfs\/[^/]+/, '');   // ta bort klientens nyckelsegment
      wfsPath = `/geoservice/api/${API_KEY}${afterKey}`;              // injicera server-nyckel
    } else {
      wfsPath = reqUrl.pathname.replace('/wfs/', '/geoservice/api/'); // fallback: klientnyckel
    }
    const target  = wfsPath + '?' + reqUrl.searchParams.toString();
    forward('openstreetgs.stockholm.se', target, res);

  } else if (reqUrl.pathname === '/robots.txt') {
    res.setHeader('Content-Type', 'text/plain');
    res.writeHead(200);
    res.end('User-agent: *\nAllow: /\nSitemap: https://parkspot.se/sitemap.xml\n');

  } else if (reqUrl.pathname === '/sitemap.xml') {
    res.setHeader('Content-Type', 'application/xml');
    res.writeHead(200);
    res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://parkspot.se/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>`);

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
