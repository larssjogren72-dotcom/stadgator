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

// ── Server-side cache (TTL + minnesgräns + single-flight) ────────────────────
// Stockholms data ändras långsamt och är identisk för alla användare → cacha
// upstream-svar så N användares identiska anrop blir 1 anrop. Skyddar API-nyckeln.
const CACHE      = new Map();            // key -> { body:Buffer, type, expires }
const INFLIGHT   = new Map();            // key -> [res, …]  (koalescering)
const CACHE_TTL  = 6 * 60 * 60 * 1000;   // 6 h
const CACHE_MAX  = 64 * 1024 * 1024;     // 64 MB total
const ENTRY_MAX  = 30 * 1024 * 1024;     // cacha ej svar > 30 MB
let   cacheBytes = 0, HITS = 0, MISSES = 0;

function cacheGet(key) {
  const e = CACHE.get(key);
  if (!e) return null;
  if (Date.now() > e.expires) { CACHE.delete(key); cacheBytes -= e.body.length; return null; }
  CACHE.delete(key); CACHE.set(key, e);  // LRU-touch (flytta sist)
  return e;
}
function cacheSet(key, body, type) {
  if (body.length > ENTRY_MAX) return;
  while (cacheBytes + body.length > CACHE_MAX && CACHE.size) {   // evicta äldsta
    const k = CACHE.keys().next().value, o = CACHE.get(k);
    CACHE.delete(k); cacheBytes -= o.body.length;
  }
  CACHE.set(key, { body, type, expires: Date.now() + CACHE_TTL });
  cacheBytes += body.length;
}

// ── P-hus (Stockholm Parkering) – dedikerad förvärmd cache ────────────────────
// Källan svarar extremt långsamt (~30s) och saknar CORS. Vi hämtar i bakgrunden
// vid start + håller varmt i 6h. Single-flight: samtidiga väntare delar ett anrop.
let phusBody = null, phusTs = 0, phusInflight = null;
const phusType   = 'application/json; charset=utf-8';
const PHUS_TTL   = 6 * 60 * 60 * 1000;   // 6 h
const PHUS_FETCH_TIMEOUT = 60000;        // källan är seg – ge den 60s

function fetchPhus() {
  if (phusInflight) return phusInflight;
  phusInflight = new Promise((resolve) => {
    const t0 = Date.now();
    const req = https.request({
      hostname: 'api.stockholmparkering.se', port: 8084,
      path: '/SparkInfartsParkeringService.svc/GetAllAnlaggningParkeringsInfo', method: 'GET'
    }, (r) => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        if (r.statusCode === 200) {
          phusBody = Buffer.concat(chunks); phusTs = Date.now();
          console.log(`[ParkSpot] P-hus hämtade ${Math.round(phusBody.length/1024)} kB på ${Date.now()-t0} ms`);
        }
        phusInflight = null; resolve(phusBody);
      });
    });
    req.on('error', (e) => { console.warn('[ParkSpot] P-hus fel:', e.message); phusInflight = null; resolve(phusBody); });
    req.setTimeout(PHUS_FETCH_TIMEOUT, () => req.destroy(new Error('phus timeout')));
    req.end();
  });
  return phusInflight;
}

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

  } else if (reqUrl.pathname === '/phus') {
    // Stockholm Parkering (p-hus). Källan är MYCKET långsam (TTFB ~30s) + saknar CORS.
    // Egen förvärmd cache (6h) + single-flight → användarna får alltid datan direkt.
    const fresh = phusBody && (Date.now() - phusTs < PHUS_TTL);
    if (fresh) { send(res, 200, phusType, phusBody, 'HIT'); }
    else fetchPhus().then(body => {
      if (body) send(res, 200, phusType, body, 'MISS');
      else { res.setHeader('Access-Control-Allow-Origin','*'); res.writeHead(502); res.end(JSON.stringify({ error: 'p-hus otillgängligt just nu' })); }
    });

  } else if (reqUrl.pathname === '/cache-stats') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({
      entries: CACHE.size,
      bytesMB: +(cacheBytes / 1048576).toFixed(1),
      hits: HITS, misses: MISSES,
      hitRate: (HITS + MISSES) ? +(HITS / (HITS + MISSES) * 100).toFixed(1) : 0
    }));

  } else if (reqUrl.pathname === '/robots.txt') {
    res.setHeader('Content-Type', 'text/plain');
    res.writeHead(200);
    res.end('User-agent: *\nAllow: /\nSitemap: https://parkspot.se/sitemap.xml\n');

  } else if (reqUrl.pathname === '/sitemap.xml') {
    res.setHeader('Content-Type', 'application/xml');
    res.writeHead(200);
    const lastmod = new Date().toISOString().slice(0, 10);
    let seoUrls = [];
    try { seoUrls = JSON.parse(fs.readFileSync(path.join(__dirname, 'seo', 'pages.json'), 'utf8')); } catch {}
    const seoXml = seoUrls.map(p =>
      `  <url>\n    <loc>${p.loc}</loc>\n    <lastmod>${p.lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`
    ).join('\n');
    res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://parkspot.se/</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n${seoXml}\n</urlset>`);

  } else if (/^\/(parkering|billigare-parkering|parkering-over-natten|stadgator|parkering-nara|parkeringshus-stockholm|parkeringstaxor-stockholm|stadgator-stockholm|parkering-over-natten-stockholm|sommar-parkering-stockholm|parking-in-stockholm)(\/[a-z0-9\-]+)?\/?$/i.test(reqUrl.pathname)) {
    // SEO-sidor (statiska, genererade i seo/site/) – egna URL:er, rör ej appen.
    const rel = reqUrl.pathname.replace(/\/+$/, '');
    const seoFile = path.join(__dirname, 'seo', 'site', rel + '.html');
    fs.readFile(seoFile, (err, data) => {
      if (err) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.writeHead(404); res.end('<h1>404</h1><p><a href="/">Till ParkSpot</a></p>'); return; }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.writeHead(200);
      res.end(data);
    });

  } else {
    // Servera statiska filer (index.html)
    const filePath = path.join(
      __dirname,
      reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname
    );
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
                      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                      '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon' };
      const ext = path.extname(filePath);
      res.setHeader('Content-Type', types[ext] || 'text/plain');
      // App-skalet (index.html) får aldrig cachas hårt – annars kör webbläsaren kvar
      // gammal kod efter en deploy (och efter lokala ändringar). must-revalidate.
      if (ext === '.html' || reqUrl.pathname === '/') res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      res.writeHead(200);
      res.end(data);
    });
  }

}).listen(PORT, () => {
  console.log(`Städgator: http://localhost:${PORT}`);
  fetchPhus();   // förvärm p-hus-cachen i bakgrunden (källan är seg ~30s)
});

function send(res, status, type, body, cacheState) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', type);
  res.setHeader('X-Cache', cacheState);
  res.writeHead(status);
  res.end(body);
}

function forward(hostname, upstreamPath, res, port = 443) {
  const key = hostname + ':' + port + upstreamPath;

  // 1) Cache-träff → svara direkt
  const cached = cacheGet(key);
  if (cached) { HITS++; return send(res, 200, cached.type, cached.body, 'HIT'); }

  // 2) Single-flight: pågår redan en hämtning för samma nyckel → vänta in den
  const waiting = INFLIGHT.get(key);
  if (waiting) { waiting.push(res); return; }
  INFLIGHT.set(key, [res]);
  MISSES++;

  const flush = (status, type, body, state) => {
    const list = INFLIGHT.get(key) || []; INFLIGHT.delete(key);
    // Originalanropet (i=0) gjorde upstream-anropet; övriga delade det → COALESCED.
    list.forEach((r, i) => send(r, status, type, body, i === 0 ? state : 'COALESCED'));
  };

  // 3) Hämta upstream, buffra, cacha (om 200), svara alla väntande
  const proxyReq = https.request({ hostname, port, path: upstreamPath, method: 'GET' }, (proxyRes) => {
    const chunks = [], type = proxyRes.headers['content-type'] || 'application/json';
    proxyRes.on('data', c => chunks.push(c));
    proxyRes.on('end', () => {
      const body = Buffer.concat(chunks);
      if (proxyRes.statusCode === 200) cacheSet(key, body, type);
      flush(proxyRes.statusCode, type, body, 'MISS');
    });
  });
  proxyReq.on('error', (err) => {
    const list = INFLIGHT.get(key) || []; INFLIGHT.delete(key);
    list.forEach(r => { r.writeHead(502); r.end(JSON.stringify({ error: err.message })); });
  });
  proxyReq.setTimeout(20000, () => proxyReq.destroy(new Error('upstream timeout')));
  proxyReq.end();
}
