'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// STADSADAPTER: Sundbyberg
// ─────────────────────────────────────────────────────────────────────────────
// Flyttad ut ur server.js 2026-08-26. Ingen logik ändrad – bara ramen är ny.
//
// VARFÖR EGEN FIL: adaptern var 283 av server.js 1004 rader, alltså 28 % av
// serverfilen för EN stad. Med den här strukturen kan stadskod aldrig råka
// blandas in i en kärn-commit (filerna är olika), och stad nummer tre blir en
// fil att kopiera i stället för ett block att väva in.
//
// KONTRAKTET: exportera en factory som tar de delade hjälparna och returnerar
//   { id, prefix, hantera(reqUrl, req, res) -> bool }
// hantera() returnerar true om vägen togs om hand, annars false.
// Allt utanför `prefix` rör adaptern aldrig.
//
// Källa: gis.sundbyberg.se (öppen ArcGIS REST, ingen nyckel).
// ⚠ LICENS: servern är öppen men Sundbyberg publicerar 0 datamängder på
// dataportal.se → åtkomlig ≠ licensierad. Måste klaras med kommunen före drift.

module.exports = function skapaSundbyberg(delade) {
  const { https, fs, path, keepAliveAgent, segDistM, SCHED_API_DAYS, send, rot } = delade;
  const __dirname = rot;   // gatunamnsfilen ligger kvar i projektroten/pilot/

// ISOLERAD OCH ADDITIV. Rör inte en enda Stockholm-väg: allt nedan lever under
// /sbg/* och har egen cache. Syftet är att bevisa att en ANNAN kommuns data kan
// översättas till EXAKT samma GeoJSON-kontrakt som /servicedagar-bbox redan
// levererar, så att klienten i förlängningen inte behöver ändras alls.
// Källa: gis.sundbyberg.se (öppen ArcGIS REST, ingen nyckel).
// OBS licens: servern är öppen men Sundbyberg publicerar 0 datamängder på
// dataportal.se → åtkomlig ≠ licensierad. Måste klaras med kommunen före drift.
// Gatunamn per OBJECTID, förgenererad av pilot/bygg-sbg-gatunamn.js.
// Sundbybergs data saknar namnfält, och appens TRE städmatchare är alla nycklade på
// STREET_NAME – utan namn kastas varenda städpost tyst (mätt: 55 av 55, 0 träffar).
// Städ- och zonlagren delar OBJECTID OCH geometri, så samma uppslag ger båda samma
// namn → exakt koppling utan risk att fånga grannagatans schema.
// Saknas filen fungerar allt annat som förut, bara utan städkoppling.
let SBG_GATUNAMN = {};
try {
  SBG_GATUNAMN = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'pilot', 'sbg-gatunamn.json'), 'utf8').replace(/^﻿/, ''));
  const n = Object.values(SBG_GATUNAMN).filter(Boolean).length;
  console.log(`[Pilot] Sundbyberg-gatunamn: ${n} av ${Object.keys(SBG_GATUNAMN).length} OID har namn`);
} catch {
  console.log('[Pilot] Sundbyberg-gatunamn saknas (kör: node pilot/bygg-sbg-gatunamn.js) – städkoppling av');
}
const sbgGata = oid => SBG_GATUNAMN[oid] || null;

const SBG_HOST  = 'gis.sundbyberg.se';
const SBG_BAS   = '/arcgis/rest/services/Sundbybergskartan_trafik/MapServer';
const SBG_LAGER = [70, 169];        // 70 = vintersäsong, 169 = året runt. 168 är TOMT.
const SBG_TTL   = 6 * 60 * 60 * 1000;
let sbgCache = null, sbgTs = 0, sbgInflight = null;

// ⚠ VECKODAGSSKALOR: Sundbybergs ArcGIS räknar 0 = måndag. JS getDay() (och
// SCHED_API_DAYS ovan) räknar 0 = söndag. Utan konverteringen läses tisdag som
// onsdag – tyst och fel. Detta är kärnan i vad ett stads-adapterlager måste göra.
const sbgDagTillJs = arc => (arc + 1) % 7;

// Tid-koder → HHMM, samma format som Stockholms START_TIME/END_TIME (0 = 00:00, 600 = 06:00).
const SBG_TID = { 1:[0,600], 2:[600,900], 3:[800,1600], 4:[0,2400], 6:[800,1200], 7:[800,1500], 8:[1200,1500] };
// Servicedatum-koder → säsongsfönster (månad*100+dag), samma semantik som cleaningActiveOn.
const SBG_SASONG = { 1:[1101,515], 2:[1101,331], 3:'alltid', 5:'ejJuli' };

function sbgHamtaLager(id) {
  return new Promise((resolve) => {
    const q = `?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=json`;
    const chunks = [];
    const r = https.request({ hostname: SBG_HOST, port: 443, path: SBG_BAS + '/' + id + '/query' + q,
                              method: 'GET', agent: keepAliveAgent }, (resp) => {
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { resolve(null); } });
    });
    r.on('error', () => resolve(null));
    r.setTimeout(20000, () => r.destroy());
    r.end();
  });
}

// Bygger 7 dagar i Stockholm-kontraktets form. Säsong filtreras vid REQUEST (som
// Stockholm-schemat), så cachen är datum-oberoende.
function sbgBygg() {
  if (sbgInflight) return sbgInflight;
  if (sbgCache && Date.now() - sbgTs < SBG_TTL) return Promise.resolve(sbgCache);
  sbgInflight = (async () => {
    const geo = [[], [], [], [], [], [], []];
    const svar = await Promise.all(SBG_LAGER.map(sbgHamtaLager));
    for (const j of svar) {
      for (const f of (j && j.features) || []) {
        const a = f.attributes || {};
        // Lager 70 lagrar Servicedag som HELTAL, lager 169 som STRÄNG – tvinga typen.
        const arcDag = a.Servicedag == null ? null : parseInt(a.Servicedag, 10);
        const tid = SBG_TID[a.Tid];
        const paths = (f.geometry && f.geometry.paths) || [];
        if (arcDag == null || !tid || !paths.length) continue;
        const dagar = arcDag === 7 ? [0,1,2,3,4,5,6] : [sbgDagTillJs(arcDag)];
        for (const linje of paths) {
          if (linje.length < 2) continue;
          let minLng=Infinity, minLat=Infinity, maxLng=-Infinity, maxLat=-Infinity;
          for (const c of linje) {
            if (c[0]<minLng) minLng=c[0]; if (c[0]>maxLng) maxLng=c[0];
            if (c[1]<minLat) minLat=c[1]; if (c[1]>maxLat) maxLat=c[1];
          }
          for (const d of dagar) {
            geo[d].push({
              type: 'Feature',
              properties: {
                // Namnet kommer från OSM via OBJECTID-tabellen, inte från kommunen.
                // Utan det kastar appens städmatchare posten (se SBG_GATUNAMN ovan).
                STREET_NAME: sbgGata(a.OBJECTID),
                START_TIME: tid[0], END_TIME: tid[1],
                ADDRESS: '<Adress saknas>',
                // Additiva Sundbyberg-fält (krockar inte med Stockholms nycklar).
                SBG_OID: a.OBJECTID, SBG_ZON: a.Parkeringszon_taxa,
                SBG_PLATSER: a.Antal_p_platser, SBG_AVGIFT_TID: a.Avgift_tid,
                SBG_MOBILKOD: a.Mobilkod_taxa, SBG_SASONG: a.Servicedatum
              },
              geometry: { type: 'LineString', coordinates: linje },
              _bb: [minLng, minLat, maxLng, maxLat],
              _sasong: a.Servicedatum
            });
          }
        }
      }
    }
    sbgCache = geo; sbgTs = Date.now();
    return geo;
  })().finally(() => { sbgInflight = null; });
  return sbgInflight;
}

// ── PILOT: Sundbybergs Parkeringszoner → P_TILLATEN-formad GeoJSON ───────────
// Appen ritar gator ur LTFR_P_TILLATEN_GEOM och förväntar sig geometri i SWEREF99
// (EPSG:3011), INTE WGS84 – toAllowedSegment lagrar den som linesSweref.
// Sundbybergs data ligger redan i 3011 nativt. Men bbox från klienten kommer i 4326.
// Ingen proj4 finns server-side, så vi hämtar samma lager i BÅDA projektionerna
// (två anrop, cachade 6h) och parar ihop dem på OBJECTID: 4326 för bbox-filtrering,
// 3011 för geometrin som skickas ut.
// Lagren som tillsammans utgör Sundbybergs motsvarighet till LTFR_P_TILLATEN_GEOM.
// I Stockholm ligger bil/MC/RH/cykel i SAMMA lager och skiljs åt av fältet VEHICLE.
// Sundbyberg har dem som separata lager utan fordonsfält → adaptern sätter VEHICLE och
// VF_PLATS_TYP till exakt de värden appens predikat letar efter:
//   isMcExclusive  → MC_VEHICLES  = motorcykel | mc | moped-klass1
//   isRhPlats      → /rörelsehindrad/i i VF_PLATS_TYP, eller RH_VEHICLES
//   isCykelPlats   → CYKEL_VEHICLES = cykel | moped-klass2
//   ändamålsplats → NUMERISK VF_PLATS_TYP ('7' = Lastplats, se ANDAMAL_LABELS i index.html)
const SBG_TILLATEN_LAGER = [
  { id:166, vehicle:'fordon',         platsTyp:null,                                 zon:true  },
  { id: 67, vehicle:'motorcykel',     platsTyp:'Reserverad p-plats motorcykel',      zon:false },
  { id: 68, vehicle:'rörelsehindrade',platsTyp:'Reserverad p-plats rörelsehindrade', zon:false },
  { id:164, vehicle:'cykel',          platsTyp:'Reserverad p-plats cykel',           zon:false },
  // Lastplatser: ett "hål" som pausar gatans angivelser på sin sträcka (R3 i
  // PARKERINGSREGLER-SKYLTAR.md). Stockholm bär dem i P_TILLATEN med numerisk
  // VF_PLATS_TYP, så vi mappar dit och slipper nytt appbegrepp helt.
  // Uppmätt 2026-08-25: 74 st, varav 7 ligger inuti en p-zon och 18 gäller natten.
  { id: 69, vehicle:'fordon',         platsTyp:'7',                                  zon:false, lastplats:true },
];

// Sundbyberg lägger lastplatsens villkor som FRITEXT i Lastplats_information.
// Census över alla 74 (2026-08-25): "06-16" ×35 · tomt ×12 · "Ständig" ×6 ·
// "07:00-10:00 Vardagar" ×3 · "06-16 Vardagar" ×2 · "06-21" ×2 · "07-14" ×2 ·
// "07:00-10:00 Fredagar" ×2 · och enstaka "Tisdag 06-16", "00-06", "08-18", "0-22 meter".
const SBG_VECKODAGAR = ['söndag','måndag','tisdag','onsdag','torsdag','fredag','lördag'];
function sbgLastplatsVillkor(txt) {
  const s = String(txt ?? '').trim();
  // ⚠️ "0-22 meter" är en STRÄCKA (tilläggstavla T1), inte ett klockslag. Läses den som
  // 00–22 blir natten felaktigt fri. Meter-fall får därför okänd tid, inte påhittad.
  const harMeter = /meter/i.test(s);
  const m = harMeter ? null : s.match(/(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?/);

  // Känd tid → använd den. "Ständig", tomt eller enbart meter → gäller HELA DYGNET.
  // Det är appens egen försiktighetsprincip för just den här funktionen ("vi flaggar
  // hellre en lastplats för mycket än släpper igenom en aktiv", index.html ~3001).
  // De 12 tomma är tvetydiga – kan vara ständiga, kan vara oregistrerade. Att gissa
  // "ingen begränsning" vore att gissa åt det håll som kostar användaren en bot.
  const kandTid = !!m;
  const start = m ? (+m[1] * 100 + (+(m[2] || 0))) : 0;
  const slut  = m ? (+m[3] * 100 + (+(m[4] || 0))) : 2400;

  const dayType = /vardag/i.test(s) ? 'vardag' : null;
  // (ar) som EGEN grupp – annars kräver mönstret minst "tisdaga" och missar bara "Tisdag".
  // Datan har båda formerna: "Fredagar"/"Måndagar" men "Tisdag 06-16".
  let weekday = null;
  if (!dayType) for (let i = 0; i < 7; i++)
    if (new RegExp(SBG_VECKODAGAR[i] + '(ar)?\\b', 'i').test(s)) { weekday = SBG_VECKODAGAR[i]; break; }

  return { start, slut, dayType, weekday, kandTid };
}
let sbgZonCache = null, sbgZonTs = 0, sbgZonInflight = null;
const SBG_ZONNAMN = { 18:'E', 19:'D', 20:'C', 21:'B', 22:'A' };
const SBG_ZONPRIS = { A:45, B:30, C:20, D:35, E:15 };   // verifierat mot sundbyberg.se

function sbgHamtaLagerSR(id, outSR) {
  return new Promise((resolve) => {
    const q = `?where=1%3D1&outFields=*&returnGeometry=true&outSR=${outSR}&f=json`;
    const chunks = [];
    const r = https.request({ hostname: SBG_HOST, port: 443, path: SBG_BAS + '/' + id + '/query' + q,
                              method: 'GET', agent: keepAliveAgent }, (resp) => {
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { resolve(null); } });
    });
    r.on('error', () => resolve(null));
    r.setTimeout(20000, () => r.destroy());
    r.end();
  });
}

// Cykelparkeringen är PUNKTER (143 st), inte linjer. Appen kräver linesSweref för att
// överhuvudtaget se en plats (toAllowedSegment → featureLines), och använder första
// punkten som nålens läge. Punkten är den äkta uppgiften; den korta linjen är bara en
// bärare av samma koordinat, i storleksordningen av ett faktiskt cykelställ.
const SBG_PUNKT_LANGD_M = 3;
function sbgPunktTillLinje(g) {
  const p = (g.points && g.points[0]) || (g.x != null ? [g.x, g.y] : null);
  if (!p) return null;
  const h = SBG_PUNKT_LANGD_M / 2;          // SWEREF99 är i meter → rakt av
  return [[p[0] - h, p[1]], [p[0] + h, p[1]]];
}
// Plockar ut linjer ur en ArcGIS-geometri oavsett om den är polyline eller punkt.
function sbgLinjer(g) {
  if (!g) return [];
  if (g.paths) return g.paths.filter(l => l.length >= 2);
  const l = sbgPunktTillLinje(g);
  return l ? [l] : [];
}

function sbgByggZoner() {
  if (sbgZonInflight) return sbgZonInflight;
  if (sbgZonCache && Date.now() - sbgZonTs < SBG_TTL) return Promise.resolve(sbgZonCache);
  sbgZonInflight = (async () => {
    const ut = [];
    for (const lag of SBG_TILLATEN_LAGER) {
      const [j4326, j3011] = await Promise.all([
        sbgHamtaLagerSR(lag.id, 4326), sbgHamtaLagerSR(lag.id, 3011)]);
      // OBJECTID → bbox i WGS84 (bara för filtrering; geometrin tas från 3011-svaret)
      const bboxPerOid = new Map();
      for (const f of (j4326 && j4326.features) || []) {
        let minLng=Infinity, minLat=Infinity, maxLng=-Infinity, maxLat=-Infinity;
        for (const linje of sbgLinjer(f.geometry)) for (const c of linje) {
          if (c[0]<minLng) minLng=c[0]; if (c[0]>maxLng) maxLng=c[0];
          if (c[1]<minLat) minLat=c[1]; if (c[1]>maxLat) maxLat=c[1];
        }
        if (isFinite(minLng)) bboxPerOid.set(f.attributes.OBJECTID, [minLng, minLat, maxLng, maxLat]);
      }
      let n = 0, nKandTid = 0, nOkandTid = 0;
      for (const f of (j3011 && j3011.features) || []) {
        const a = f.attributes || {};
        const bb = bboxPerOid.get(a.OBJECTID);
        const linjer = sbgLinjer(f.geometry);
        if (!bb || !linjer.length) continue;
        const zon  = lag.zon ? (SBG_ZONNAMN[Math.round(a.Parkeringszon_taxa)] || null) : null;
        const pris = zon ? SBG_ZONPRIS[zon] : null;
        const last = lag.lastplats ? sbgLastplatsVillkor(a.Lastplats_information) : null;
        if (last) { if (last.kandTid) nKandTid++; else nOkandTid++; }
        for (const linje of linjer) {
          ut.push({
            type: 'Feature',
            properties: {
              // Minsta uppsättning som toAllowedSegment läser. Allt annat lämnas null
              // så appens heuristiker (besöksficka, ändamålsplats, säsong) inte utlöses
              // på gissade värden – Sundbyberg har helt enkelt inte de begreppen.
              VEHICLE: lag.vehicle,
              VF_PLATS_TYP: lag.platsTyp || (pris != null ? 'P Avgift' : 'P'),
              PARKING_RATE: pris != null ? String(pris) : null,
              VF_METER: null, VF_PLATSER: a.Antal_p_platser ?? null,
              // Bara lastplatser bär tidsvillkor. Övriga lager lämnas null, som förut.
              START_TIME:    last ? last.start   : null,
              END_TIME:      last ? last.slut    : null,
              DAY_TYPE:      last ? last.dayType : null,
              START_WEEKDAY: last ? last.weekday : null,
              SBG_LASTPLATS_INFO: last ? (a.Lastplats_information ?? null) : undefined,
              // Samma OBJECTID-uppslag som städlagret → identiskt namn på båda sidor.
              // OBS: bara zonlagret (166) delar OID med städlagren; MC/RH/cykel har
              // egna OID-serier och får därför oftast null. Det är korrekt – de är
              // egna ytor, inte samma sträcka som en bilplats.
              STREET_NAME: lag.zon ? sbgGata(a.OBJECTID) : null,
              SBG_OID: a.OBJECTID, SBG_LAGER: lag.id, SBG_ZON: zon, SBG_PRIS: pris,
              SBG_AVGIFT_TID: a.Avgift_tid ?? null, SBG_MOBILKOD: a.Mobilkod_taxa ?? null
            },
            geometry: { type: 'LineString', coordinates: linje },   // SWEREF99 EPSG:3011
            _bb: bb
          });
          n++;
        }
      }
      console.log(`[Pilot] Sundbyberg lager ${lag.id} (${lag.vehicle}): ${n} segment`
        + (lag.lastplats ? `  · lastplats: ${nKandTid} med känt tidsfönster, `
                         + `${nOkandTid} utan (behandlas som hela dygnet)` : ''));
    }
    sbgZonCache = ut; sbgZonTs = Date.now();
    return ut;
  })().finally(() => { sbgZonInflight = null; });
  return sbgZonInflight;
}

// Gäller säsongen på datumet d? Samma årsskifts-wrap som Stockholms städsäsonger.
function sbgSasongAktiv(kod, d) {
  const spec = SBG_SASONG[kod];
  if (!spec) return false;
  if (spec === 'alltid') return true;
  if (spec === 'ejJuli') return d.getMonth() !== 6;
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  const [a, b] = spec;
  return a <= b ? (md >= a && md <= b) : (md >= a || md <= b);
}

  // ── Vägar ──────────────────────────────────────────────────────────────────
  function hantera(reqUrl, req, res) {
    if (reqUrl.pathname === '/sbg/schedule') {
    // PILOT: samma kontrakt som Stockholms /schedule – { schedule:[{day,s,e,vilande?,sm?,sd?}] }.
    // Möjligt först sedan adaptern fyller STREET_NAME (pilot/sbg-gatunamn.json); uppslaget
    // sker på namn + 25 m, exakt som Stockholm. Vilande säsonger följer med, av samma skäl
    // som där: annars påstår kortet "ingen registrerad servicedag" om en vinterstädad gata.
    const lat  = parseFloat(reqUrl.searchParams.get('lat'));
    const lng  = parseFloat(reqUrl.searchParams.get('lng'));
    const name = (reqUrl.searchParams.get('name') || '').toLowerCase().trim();
    if (!isFinite(lat) || !isFinite(lng) || !name) {
      res.setHeader('Access-Control-Allow-Origin', '*'); res.writeHead(400);
      res.end(JSON.stringify({ error: 'lat/lng/name krävs' })); return true;
    }
    const varmS = !!sbgCache;
    sbgBygg().then(geo => {
      const idag = new Date();
      const mLng = 111320 * Math.cos(lat * Math.PI / 180);
      const dLat = 25/111320 + 1e-4, dLng = 25/mLng + 1e-4;
      const seen = new Set(), schedule = [];
      for (let dag = 0; dag < 7; dag++) {
        for (const f of geo[dag] || []) {
          const p = f.properties || {};
          if ((p.STREET_NAME || '').toLowerCase().trim() !== name) continue;
          const bb = f._bb;
          if (lng < bb[0]-dLng || lng > bb[2]+dLng || lat < bb[1]-dLat || lat > bb[3]+dLat) continue;
          const linje = f.geometry.coordinates;
          let traff = false;
          for (let i = 0; i < linje.length - 1; i++) {
            if (segDistM(lat, lng, linje[i], linje[i+1]) <= 25) { traff = true; break; }
          }
          if (!traff) continue;
          const aktiv = sbgSasongAktiv(f._sasong, idag);
          const k = dag+'_'+p.START_TIME+'_'+p.END_TIME+'_'+(aktiv?'a':'v');
          if (seen.has(k)) continue;
          seen.add(k);
          if (aktiv) schedule.push({ day: dag, s: p.START_TIME, e: p.END_TIME });
          else {
            // Säsongens startmånad/dag ur kommunens kodlista, i samma form som Stockholm.
            const spec = SBG_SASONG[f._sasong];
            const start = Array.isArray(spec) ? spec[0] : null;      // t.ex. 1101
            schedule.push({ day: dag, s: p.START_TIME, e: p.END_TIME, vilande: true,
                            sm: start ? Math.floor(start/100) : null,
                            sd: start ? start % 100 : null });
          }
        }
      }
      send(req, res, 200, 'application/json; charset=utf-8',
           Buffer.from(JSON.stringify({ schedule })), varmS ? 'HIT' : 'MISS');
    }).catch(() => {
      res.setHeader('Access-Control-Allow-Origin', '*'); res.writeHead(502);
      res.end(JSON.stringify({ error: 'Sundbybergs schema otillgängligt' }));
    });

      return true;
    }
    if (reqUrl.pathname === '/sbg/wfs-tillaten') {
    // PILOT: Sundbybergs parkeringszoner i P_TILLATEN-form (SWEREF99), så appens
    // befintliga fetchLayer/toAllowedSegment kan läsa dem utan att ändras.
    // ?BBOX=minLng,minLat,maxLng,maxLat[,EPSG:4326] – samma sträng klienten redan bygger.
    const rawBbox = reqUrl.searchParams.get('BBOX') || reqUrl.searchParams.get('bbox') || '';
    const bbox = rawBbox.split(',').slice(0, 4).map(Number);
    if (bbox.length !== 4 || bbox.some(v => !isFinite(v))) {
      res.setHeader('Access-Control-Allow-Origin', '*'); res.writeHead(400);
      res.end(JSON.stringify({ error: 'BBOX=minLng,minLat,maxLng,maxLat krävs' }));
      return true;
    }
    const varmZ = !!sbgZonCache;
    sbgByggZoner().then(list => {
      const [aLng, aLat, bLng, bLat] = bbox;
      const features = list
        .filter(f => !(f._bb[2] < aLng || f._bb[0] > bLng || f._bb[3] < aLat || f._bb[1] > bLat))
        .map(f => ({ type: f.type, properties: f.properties, geometry: f.geometry }));
      send(req, res, 200, 'application/json; charset=utf-8',
           Buffer.from(JSON.stringify({ type: 'FeatureCollection', features })), varmZ ? 'HIT' : 'MISS');
    }).catch(() => {
      res.setHeader('Access-Control-Allow-Origin', '*'); res.writeHead(502);
      res.end(JSON.stringify({ error: 'Sundbybergs zondata otillgänglig' }));
    });

      return true;
    }
    if (reqUrl.pathname === '/sbg/servicedagar-bbox') {
    // PILOT: Sundbybergs städdata i EXAKT samma svarsform som /servicedagar-bbox.
    // Ligger sist i kedjan → kan omöjligt skugga någon befintlig Stockholm-väg.
    // ?dag=<0-6, JS-skala 0=söndag, eller svenskt namn>&bbox=minLng,minLat,maxLng,maxLat
    // Stödjer BÅDE ?dag= (en dag → FeatureCollection) och ?dagar=0,1,…  (flera dagar →
    // { dagar: { "0": FeatureCollection, … } }), exakt som Stockholms motsvarighet.
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
      return true;
    }
    const varm = !!sbgCache;
    sbgBygg().then(geo => {
      const [aLng, aLat, bLng, bLat] = bbox;
      const idag = new Date();
      const utsnitt = d => ({ type: 'FeatureCollection',
        features: (geo[d] || [])
          .filter(f => sbgSasongAktiv(f._sasong, idag))
          .filter(f => !(f._bb[2] < aLng || f._bb[0] > bLng || f._bb[3] < aLat || f._bb[1] > bLat))
          .map(f => ({ type: f.type, properties: f.properties, geometry: f.geometry })) });
      const kropp = flera
        ? { dagar: Object.fromEntries(dagar.map(d => [d, utsnitt(d)])) }
        : utsnitt(dagar[0]);
      send(req, res, 200, 'application/json; charset=utf-8',
           Buffer.from(JSON.stringify(kropp)), varm ? 'HIT' : 'MISS');
    }).catch(() => {
      res.setHeader('Access-Control-Allow-Origin', '*'); res.writeHead(502);
      res.end(JSON.stringify({ error: 'Sundbybergs data otillgänglig' }));
    });

      return true;
    }
    return false;
  }

  return { id: 'sundbyberg', prefix: '/sbg/', hantera };
};
