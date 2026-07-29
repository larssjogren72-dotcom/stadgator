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

// ── Appversion ───────────────────────────────────────────────────────────────
// Stämplas in i index.html vid SERVERING. Filen skickas redan med no-store, så
// stämpeln är alltid färsk och kräver inget byggsteg.
// Varför: en användarrapport måste gå att knyta till exakt den kod personen såg.
// Innan detta fanns bara ett sätt att veta vad som låg live – hämta parkspot.se och
// söka efter funktionsnamn i HTML:en.
// Källa i tur och ordning: plattformens env-variabel → lokal git → okänd.
// (Flera namn provas: vi vet inte säkert vilken Railway sätter, och det ska inte
// spela roll. Startloggen nedan visar vilken som faktiskt användes.)
const VERSION_ENV = ['RAILWAY_GIT_COMMIT_SHA', 'RAILWAY_GIT_COMMIT', 'SOURCE_VERSION',
                     'GIT_COMMIT', 'COMMIT_SHA', 'HEROKU_SLUG_COMMIT'];
let APP_SHA = '', APP_SRC = '';
for (const k of VERSION_ENV) {
  const v = (process.env[k] || '').trim();
  if (v) { APP_SHA = v; APP_SRC = 'env:' + k; break; }
}
if (!APP_SHA) {
  try {
    APP_SHA = require('child_process')
      .execSync('git rev-parse HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    APP_SRC = 'git';
  } catch { APP_SRC = 'okänd'; }
}
const APP_VERSION = APP_SHA ? APP_SHA.slice(0, 7) : 'okänd';
const APP_BUILT   = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
console.log(`[ParkSpot] Version ${APP_VERSION} (${APP_SRC}) · server startad ${APP_BUILT}`);

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

// ── Städschema (alla 7 veckodagar, per-segment) ──────────────────────────────
// Kortet ska ALLTID kunna visa "Servas onsdagar 09–14" på RÄTT sträcka. En lång gata
// (t.ex. Dalagatan) har olika scheman på olika segment → vi matchar klientens klickade
// punkt (lat/lng + gatunamn) mot cleaning-SEGMENT ≤25 m, EXAKT som flödenas clean.near().
// De tunga ~14 MB (7 dagar) stannar server-side (cachat 6h); klienten får ett pyttesvar.
const SCHED_API_DAYS = ['söndag','måndag','tisdag','onsdag','torsdag','fredag','lördag']; // index = JS getDay()
const SCHED_TTL = 6 * 60 * 60 * 1000;
let schedFeats = null, schedTs = 0, schedInflight = null;
// Samma 7 dagar en gång till, men i GeoJSON-form med ENBART de fält klienten läser.
// Byggs i samma loop som schedFeats (ingen extra hämtning) och serveras bbox-filtrerat
// av /servicedagar-bbox. Klienten hämtade tidigare HELA stadens schema per veckodag:
// uppmätt 1962 + 2084 kB för Nu-lägets två dagar. Bbox-filtrerat blir samma två dagar
// 51 kB i Vasastan, och hela veckan 104 kB.
let schedGeo = null;
const SCHED_GEO_FALT = ['STREET_NAME','START_TIME','END_TIME',
                        'START_MONTH','START_DAY','END_MONTH','END_DAY','ADDRESS'];

function fetchServicedayJSON(apiDay) {
  return new Promise((resolve) => {
    let p = `/LTF-Tolken/v1/servicedagar/weekday/${encodeURIComponent(apiDay)}?outputFormat=json`;
    if (API_KEY) p += `&apiKey=${encodeURIComponent(API_KEY)}`;
    const chunks = [];
    const r = https.request({ hostname: 'openparking.stockholm.se', port: 443, path: p, method: 'GET' }, (resp) => {
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { resolve(null); } });
    });
    r.on('error', () => resolve(null));
    r.setTimeout(20000, () => r.destroy());
    r.end();
  });
}

// Bygg feature-listan för alla 7 dagar (cachat 6h, single-flight). Säsong filtreras
// vid REQUEST (med dagens datum) så cachen är datum-oberoende.
function buildSchedule() {
  if (schedFeats && Date.now() - schedTs < SCHED_TTL) return Promise.resolve(schedFeats);
  if (schedInflight) return schedInflight;
  schedInflight = (async () => {
    const out = [];
    const geo = [[], [], [], [], [], [], []];   // per veckodag, trimmad GeoJSON
    for (let day = 0; day < 7; day++) {
      const j = await fetchServicedayJSON(SCHED_API_DAYS[day]);
      const feats = (j && (Array.isArray(j) ? j : j.features)) || [];
      for (const f of feats) {
        const p = f.properties || {}, g = f.geometry;
        const name = (p.STREET_NAME || '').toLowerCase().trim();
        if (!g) continue;
        const lines = g.type === 'LineString' ? [g.coordinates]
                    : g.type === 'MultiLineString' ? g.coordinates : [];
        if (!lines.length) continue;
        let minLng=Infinity, minLat=Infinity, maxLng=-Infinity, maxLat=-Infinity;
        for (const ln of lines) for (const c of ln) {
          if (Math.abs(c[0]) > 1000) continue;   // servicedagar = WGS84; hoppa ev. avvikare
          if (c[0]<minLng) minLng=c[0]; if (c[0]>maxLng) maxLng=c[0];
          if (c[1]<minLat) minLat=c[1]; if (c[1]>maxLat) maxLat=c[1];
        }
        const bb = [minLng, minLat, maxLng, maxLat];
        // GeoJSON-formen först, och UTAN namnkravet. Egenskaperna behåller ORIGINALNAMN och
        // versaler så att klientens befintliga städlogik (cleaningActiveOn, buildCleaningMatcher,
        // 25 m-matchningen) fungerar helt orörd – det är den beprövade koden.
        // ⚠️ Namnlösa städposter MÅSTE med: Morgon-flödet ritar dem ("Gata" som reservnamn) och
        // cleaningFeatureInReach bryr sig inte om namn. Att ärva /schedule:s namnkrav gav en
        // uppmätt regression på 2 features i Gamla Stan.
        const props = {};
        for (const k of SCHED_GEO_FALT) if (p[k] != null) props[k] = p[k];
        geo[day].push({ type: 'Feature', properties: props, geometry: g, _bb: bb });
        // schedFeats används av /schedule, som slår upp på gatunamn → namnlösa är oanvändbara där.
        if (!name) continue;
        out.push({ name, day, s: p.START_TIME, e: p.END_TIME,
                   sm: p.START_MONTH, sd: p.START_DAY, em: p.END_MONTH, ed: p.END_DAY,
                   lines, bb });
      }
    }
    schedFeats = out; schedGeo = geo; schedTs = Date.now(); schedInflight = null;
    console.log(`[ParkSpot] Städschema byggt: ${out.length} features (7 dagar)`);
    return out;
  })();
  return schedInflight;
}

// Punkt→segment-distans i meter – IDENTISK med klientens distPointToSegment(LL).
function distPtSeg(px, py, ax, ay, bx, by) {
  const dx = bx-ax, dy = by-ay, lenSq = dx*dx + dy*dy;
  if (lenSq === 0) return Math.hypot(px-ax, py-ay);
  const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / lenSq));
  return Math.hypot(px - (ax+t*dx), py - (ay+t*dy));
}
function segDistM(lat, lng, a, b) {   // a,b = [lng,lat] (WGS84); origo i a (= klientens metod)
  const mLat = 111320, mLng = 111320 * Math.cos(a[1] * Math.PI / 180);
  const px = (lng - a[0]) * mLng, py = (lat - a[1]) * mLat;
  const bx = (b[0] - a[0]) * mLng, by = (b[1] - a[1]) * mLat;
  return distPtSeg(px, py, 0, 0, bx, by);
}
function inSeasonNow(p, date) {        // = klientens cleaningActiveOn
  if (p.sm == null) return true;
  const md = (m,d) => m*100 + (d||1);
  const cur = md(date.getMonth()+1, date.getDate());
  const a = md(p.sm, p.sd), b = md(p.em, p.ed);
  return a <= b ? (cur >= a && cur <= b) : (cur >= a || cur <= b);
}

http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  // www.parkspot.se → parkspot.se (301). Kanonisk är icke-www; undvik 404/duplicat på www.
  const host = (req.headers.host || '').toLowerCase();
  if (host.startsWith('www.')) {
    res.writeHead(301, { Location: 'https://' + host.slice(4) + req.url });
    return res.end();
  }

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

  } else if (reqUrl.pathname === '/servicedagar-bbox') {
    // Städdata för EN veckodag, begränsat till sökrutan. Svarar i samma GeoJSON-form som
    // /proxy/servicedagar/weekday/{dag}, så klienten kan byta URL utan att röra sin logik.
    // ?dag=<0-6 eller svenskt namn>&bbox=minLng,minLat,maxLng,maxLat
    // ?dag=  → EN veckodag, svar = FeatureCollection (samma form som gamla proxyn)
    // ?dagar=→ FLERA veckodagar i ETT anrop, svar = { dagar: { "1": FeatureCollection, … } }
    //          Sju separata anrop för "nästa städning inom en vecka" vore sju rundturer.
    const tolkaDag = s => { s = (s || '').toLowerCase().trim();
      return /^\d$/.test(s) ? +s : SCHED_API_DAYS.indexOf(s); };
    const flera = reqUrl.searchParams.has('dagar');
    const dagar = flera ? (reqUrl.searchParams.get('dagar') || '').split(',').map(tolkaDag)
                        : [tolkaDag(reqUrl.searchParams.get('dag'))];
    const bbox = (reqUrl.searchParams.get('bbox') || '').split(',').map(Number);
    if (!dagar.length || dagar.some(d => !(d >= 0 && d <= 6)) ||
        bbox.length !== 4 || bbox.some(v => !isFinite(v))) {
      res.setHeader('Access-Control-Allow-Origin', '*'); res.writeHead(400);
      res.end(JSON.stringify({ error: 'dag/dagar (0-6 eller veckodagsnamn) och bbox=minLng,minLat,maxLng,maxLat krävs' }));
      return;
    }
    const warm = !!schedGeo;
    buildSchedule().then(() => {
      const [aLng, aLat, bLng, bLat] = bbox;
      // Behåll varje feature vars egen bbox SKÄR rutan – samma semantik som WFS BBOX, så en
      // gata som sträcker sig ut ur rutan följer med i sin helhet (viktigt för 25 m-matchningen).
      const utsnitt = d => ({ type: 'FeatureCollection',
        features: (schedGeo && schedGeo[d] || [])
          .filter(f => !(f._bb[2] < aLng || f._bb[0] > bLng || f._bb[3] < aLat || f._bb[1] > bLat))
          .map(f => ({ type: f.type, properties: f.properties, geometry: f.geometry })) });
      const kropp = flera
        ? { dagar: Object.fromEntries(dagar.map(d => [d, utsnitt(d)])) }
        : utsnitt(dagar[0]);
      send(res, 200, 'application/json; charset=utf-8',
           Buffer.from(JSON.stringify(kropp)), warm ? 'HIT' : 'MISS');
    }).catch(() => {
      res.setHeader('Access-Control-Allow-Origin', '*'); res.writeHead(502);
      res.end(JSON.stringify({ error: 'städschema otillgängligt' }));
    });

  } else if (reqUrl.pathname === '/schedule') {
    // Veckoschema för EN klickad punkt: ?lat=&lng=&name= → { schedule:[{day,s,e}] }.
    // Matchar punkt mot cleaning-segment ≤25 m med samma namn (= flödenas clean.near).
    const lat  = parseFloat(reqUrl.searchParams.get('lat'));
    const lng  = parseFloat(reqUrl.searchParams.get('lng'));
    const name = (reqUrl.searchParams.get('name') || '').toLowerCase().trim();
    if (!isFinite(lat) || !isFinite(lng) || !name) {
      res.setHeader('Access-Control-Allow-Origin', '*'); res.writeHead(400);
      res.end(JSON.stringify({ error: 'lat/lng/name krävs' })); return;
    }
    const warm = !!schedFeats;
    buildSchedule().then(feats => {
      const today = new Date();
      const mLng  = 111320 * Math.cos(lat * Math.PI / 180);
      const dLat  = 25/111320 + 1e-4, dLng = 25/mLng + 1e-4;   // bbox-marginal ~25 m
      const seen = new Set(), schedule = [];
      for (const f of (feats || [])) {
        if (f.name !== name) continue;
        const bb = f.bb;
        if (lng < bb[0]-dLng || lng > bb[2]+dLng || lat < bb[1]-dLat || lat > bb[3]+dLat) continue;
        if (!inSeasonNow(f, today)) continue;
        let hit = false;
        for (const ln of f.lines) { for (let i=0; i<ln.length-1; i++) { if (segDistM(lat, lng, ln[i], ln[i+1]) <= 25) { hit = true; break; } } if (hit) break; }
        if (!hit) continue;
        const k = f.day+'_'+f.s+'_'+f.e;
        if (!seen.has(k)) { seen.add(k); schedule.push({ day: f.day, s: f.s, e: f.e }); }
      }
      send(res, 200, 'application/json; charset=utf-8', Buffer.from(JSON.stringify({ schedule })), warm ? 'HIT' : 'MISS');
    }).catch(() => {
      res.setHeader('Access-Control-Allow-Origin', '*'); res.writeHead(502);
      res.end(JSON.stringify({ error: 'schema otillgängligt' }));
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

  } else if (/^\/(parkering|billigare-parkering|parkering-over-natten|stadgator|parkering-nara|parkeringshus-stockholm|parkeringstaxor-stockholm|stadgator-stockholm|parkering-over-natten-stockholm|sommar-parkering-stockholm|parking-in-stockholm|om-parkspot|en)(\/[a-z0-9\-]+)?\/?$/i.test(reqUrl.pathname)) {
    // SEO-sidor (statiska, genererade i seo/site/) – egna URL:er, rör ej appen.
    const rel = reqUrl.pathname.replace(/\/+$/, '');
    const seoFile = path.join(__dirname, 'seo', 'site', rel + '.html');
    fs.readFile(seoFile, (err, data) => {
      if (err) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.writeHead(404); res.end('<h1>404</h1><p><a href="/">Till ParkSpot</a></p>'); return; }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.writeHead(200);
      res.end(data);
    });

  } else if (reqUrl.pathname === '/version') {
    // Vilken kod kör just nu? Läsbart för både människa och skript (deploy-kontroll).
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.writeHead(200);
    res.end(JSON.stringify({ version: APP_VERSION, sha: APP_SHA || null, källa: APP_SRC, startad: APP_BUILT }));

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
      // App-skalet (index.html) får ALDRIG cachas – annars kör webbläsaren kvar gammal
      // kod efter en deploy/ändring (stale-JS-fällan slog till flera ggr trots no-cache).
      // no-store = webbläsaren sparar aldrig svaret → omöjligt att servera gammal JS.
      // Kostar försumbart: en liten single-file-HTML per laddning.
      let body = data;
      if (ext === '.html' || reqUrl.pathname === '/') {
        res.setHeader('Cache-Control', 'no-store, must-revalidate');
        // Stämpla in versionen. Går bara på HTML och bara på platshållarna – inget byggsteg.
        body = Buffer.from(String(data)
          .split('__APP_VERSION__').join(APP_VERSION)
          .split('__APP_BUILT__').join(APP_BUILT), 'utf8');
      }
      res.writeHead(200);
      res.end(body);
    });
  }

}).listen(PORT, () => {
  console.log(`Städgator: http://localhost:${PORT}`);
  fetchPhus();        // förvärm p-hus-cachen i bakgrunden (källan är seg ~30s)
  buildSchedule().catch(() => {});   // förvärm städschemat (7 dagar) → första kortet snabbt
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
