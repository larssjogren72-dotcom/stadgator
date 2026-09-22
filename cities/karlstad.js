'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// STADSADAPTER: Karlstad
// ─────────────────────────────────────────────────────────────────────────────
// KONTRAKTET (samma som cities/goteborg.js, malmo.js och uppsala.js): exportera en
// factory som tar de delade hjälparna och returnerar
//   { id, prefix, hantera(reqUrl, req, res) -> bool }
// hantera() svarar true om vägen togs om hand. Allt utanför `prefix` rörs aldrig.
//
// KÄLLA: gi.karlstad.se/geoserver (GeoServer WFS). INGEN nyckel, ingen inloggning.
// Samma lager som kommunens egen webbkarta läser.
// ⚠ LICENS: lagren ligger i arbetsytan `webbkartan`, INTE i `oppnadata` (där kommunen
// lägger det den publicerar som öppna data – parker, detaljplaner, stompunkter …). På
// Sveriges dataportal har Karlstad inget parkeringsdataset (sökt 2026-09-17). Åtkomligt
// ≠ licensierat – samma läge som Uppsala. Därför skriver appen «webbkarta», aldrig
// «öppna data», och frågan står först i KARLSTAD_BREV.md. Beslutet om drift är Lars.
//
// ═══ STÄDMODELLEN — DET FÖRSTA SOM SKA SÄGAS (NY_STAD.md steg 1b) ════════════
// Karlstad HAR städgator, och det är den starka sorten: kommunen kallar dem
// **servicedagar** (tidigare städdagar) och de är ett riktigt, skyltat
// parkeringsförbud. Kommunens egna ord, karlstad.se (sidan uppdaterad 2026-09-04):
//   «Servicedagarna innebär att det är parkeringsförbud på gatan under ett antal
//    timmar. Om servicedag med parkeringsförbud gäller står det på vägmärket vid
//    varje berörd gata.»
// Det är alltså INTE skötseldata av det slag Helsingborg och Gävle publicerar
// («gatusopning» utan förbud), och lagrets redigeringskopia heter också
// «Servicedagar - parkeringsförbud».
//
// Rytmen är Göteborgs: veckodag + klockslag + jämna/ojämna veckor. Fem fönster
// (05-07, 08-10, 10-12, 12-14, 13-15), per gatsida, i centrala Karlstad
// (22,6 km linje i en ruta på 4,4 × 4,5 km). INGEN säsong: samma dagar året runt,
// sopning på sommaren och plogning på vintern.
//
// ⚠ EN SAK ÄR TVÄRTEMOT STOCKHOLM: «Om servicedagen infaller på en röd dag gäller
// inte det tillfälliga parkeringsförbudet.» Stockholm har inget helgdagsundantag
// (7 av 7 föreskrifter lästa). Undantaget bärs därför av en stadsflagga i
// STADER_CFG (`stadUndantagRodaDagar`) och av arRodDag() i index.html – aldrig av
// en generell regel, som hade gjort Stockholms varningar fel.
//
// ═══ FÄLLOR (alla ger tyst fel svar, inte felmeddelande) ═════════════════════
// 1. ⚠ GRADER ÄR AVRUNDADE TILL TVÅ DECIMALER. srsName=EPSG:4326 ger [13.49, 59.37]
//    för HELA staden – ca 1 km fel. Det gäller alla utdataformat och båda
//    WFS-versionerna; avrundningen är serverns egen inställning (numDecimals=2) och
//    går inte att slå av utifrån. Därför hämtas ALLT i EPSG:3011 (meter) och
//    grader räknas fram här i filen, av tillTM/franTM nedan.
// 2. INGA GATUNAMN finns i något parkerings- eller städlager. Kontraktet kräver
//    STREET_NAME (kortets rubrik). Namnen är därför härledda EN gång, utanför
//    appen, ur kommunens adresslager och ligger i karlstad-gatunamn.json.
//    Uppslag på exakt nyckel (sträckans mittpunkt i hela meter); okänd nyckel ger
//    inget namn, aldrig ett gissat. Metoden är verifierad mot kommunens egen
//    publicerade gatulista: 75 av 79 gator (95 %). Se verktyg/bygg-karlstad-gatunamn.js.
// 3. KOPPLINGEN PARKERING → STÄDNING ÄR GEOMETRISK, inte via namn. Både lagren
//    saknar namn, så namnet kan inte vara nyckel. Uppmätt mot de 49 sträckor som
//    SJÄLVA bär förbudstexten: närmaste städlinje inom 8 m i medelavstånd gav rätt
//    schema i 44 fall, ingen träff i 2 och EN AVVIKELSE MELLAN KÄLLORNA i 3
//    (se KONFLIKT nedan).
// 4. 16 AV 200 STÄDSTRÄCKOR ÄR TOMMA (ingen dag, tid eller vecka). Nio ligger exakt
//    ovanpå en rad som har schema; sju rader på fyra linjer har inget schema alls.
//    De ritas inte: tomt betyder «vet inte», aldrig «inget förbud».
// 5. STAVNINGSKAOS i städlagret. Veckofältet säger «Jämna veckor», «Ojämna veckor»
//    och på en rad «Udda veckor» (samma sak). Klockslaget har elva stavningar för
//    fem fönster («kl 8-10», «08-10», «kl 05-07» …). Allt normaliseras; en stavning
//    som inte går att läsa ger ingen städpost.
//
// ═══ KONFLIKT MELLAN TVÅ AV KOMMUNENS EGNA KÄLLOR ════════════════════════════
// 49 parkeringssträckor bär förbudstexten i eget fält («torsdagar jämna veckor
// kl. 05-07»). I 3 av 49 säger den texten något ANNAT än städlinjen 1–6 m bort
// (t.ex. «måndagar jämna veckor kl. 10-12» mot städlinjens «Måndag jämna 8-10»).
// Vi vet inte vilken som gäller, och appen väljer därför INTE: båda fönstren visas.
// SKYLTRUNDAN 2026-09-18 (Lars, Street View): på BÅDA konfliktgatorna säger skylten
// samma sak som avgiftslagret – Vikengatan «Måndag jämn vecka 10–12» (juni 2022),
// Drottninggatan «Måndag jämn vecka 05–07» (maj 2024) – medan kommunens lista från
// sept 2026 säger som städlagret. Bilderna är äldre än listan, så frågan är öppen, men
// den visar att regeln behövs: med bara städlagret hade appen varnat fel dag.
// Kostnaden för att visa ett för mycket är en onödig flytt; kostnaden för att dölja
// ett riktigt är en bot. Samma avvägning som weekParityMatches gör i index.html.
//
// ═══ VAD KARLSTAD INTE PUBLICERAR (kontrollerat 2026-09-17) ══════════════════
//   · PARKERINGSFÖRBUD som eget lager, utanför servicedagarna. Samma lucka som i
//     alla städer utom Stockholm. En gata utan färg betyder «ingen uppgift».
//   · TIDSGRÄNS på 178 av 381 avgiftssträckor (47 %) – nästan bara gatuzonerna
//     (Grön, Gul, Blå), medan namngivna parkeringsområden har «1 vecka» och Röd zon
//     «120 min». Appen gör som i Stockholm: tystnad = ingen skyltad gräns, och
//     sträckan kan bli grön «Trygg över natten». ⚠ Rättat 2026-09-18: jag skrev först
//     att de blev blå – det gjorde de aldrig. Skyltrundan stöder det gröna: Vikengatan
//     och Trädgårdsgatan (båda Grön zon, tomt fält) har INGEN tidsgräns på skylten
//     (Street View juni 2022). Då gäller trafikförordningens allmänna regel.
//   · AVGIFTSFRI GATUPARKERING. Lagret finns bara i den inloggningsskyddade
//     `webbkartan_edit`-arbetsytan (HTTP 401). ⚠ Inventeringen 2026-09-15 skrev
//     «avgiftsfria lagret (401)» som om 401 vore ett ANTAL poster – det var
//     HTTP-koden. Rättat 2026-09-17.
//   · RÖRELSEHINDRADE OCH MC som linjer. De finns bara som punkter (70 respektive
//     4). En punkt har ingen utsträckning, och appen ritar sträckor – att göra en
//     linje av en punkt vore att hitta på geometri. RH- och MC-lägena är därför
//     tomma i Karlstad, och disclaimern säger det.
//   · OREGLERADE GATOR. Bara PARKABs avgiftssträckor finns; resten ritas inte.

const fs = require('fs');
const path = require('path');

module.exports = function skapaKarlstad(delade) {
  const { https, keepAliveAgent, send, segDistM, SCHED_API_DAYS } = delade;

  const HOST = 'gi.karlstad.se';
  const TTL = 6 * 60 * 60 * 1000;          // städ- och p-huslager ändras sällan
  const RUT_TTL = 10 * 60 * 1000;          // sökrutor: kort, bara för lägesväxling
  const RUT_MAX = 60;
  const TAK = 100000;

  const LAGER = {
    avgift: 'webbkartan:vy_parkab_parkeringsplatser_avgiftsbelagda',   // 381 linjer
    stad:   'webbkartan:vy_tg_tg_staddagar_parkeringsforbud',          // 200 linjer
    platser:'webbkartan:tg_tg_parkering_point'                         // 147 punkter
  };

  // ═══ KOORDINATER ═══════════════════════════════════════════════════════════
  // Ingen proj4 finns server-side (och projektet har med flit noll beroenden), så
  // Gauss–Krüger ligger här. EPSG:3011 = transversal Mercator, GRS80, centralmeridian
  // 18°, skala 1, falsk easting 150 000. Det är SAMMA definition som index.html
  // matar proj4 med – parkeringen levereras i 3011 precis som i alla andra städer,
  // och toLatLng ritar den.
  //
  // Karlstad ligger 4,5° väster om centralmeridianen, alltså långt utanför zonens
  // tänkta bruk (x blir negativt, ca −106 000). Det är matematiskt oproblematiskt:
  // avbildningen är exakt, bara skalan är sträckt ca 0,8 %. Klientens avstånd i
  // planet (12 m-närheten, täckningsgraden) blir därmed 12,1 m i verkligheten.
  // Formlerna är Lantmäteriets, och de prövas mot proj4 i test/karlstad-prov.js.
  const A = 6378137, F = 1 / 298.257222101;
  const LAMBDA0 = 18 * Math.PI / 180, K0 = 1, FE = 150000, FN = 0;
  const E2 = F * (2 - F);
  const N_ = F / (2 - F);
  const A_HAT = A / (1 + N_) * (1 + N_ * N_ / 4 + N_ * N_ * N_ * N_ / 64);

  // Grader → meter (EPSG:3011)
  function tillTM(lon, lat) {
    const phi = lat * Math.PI / 180, lambda = lon * Math.PI / 180;
    const e = Math.sqrt(E2);
    const A1 = E2, B1 = (5 * E2 * E2 - E2 * E2 * E2) / 6,
          C1 = (104 * E2 * E2 * E2 - 45 * Math.pow(E2, 4)) / 120, D1 = 1237 * Math.pow(E2, 4) / 1260;
    const sinPhi = Math.sin(phi);
    const phiStar = phi - sinPhi * Math.cos(phi) * (A1 + B1 * Math.pow(sinPhi, 2)
                  + C1 * Math.pow(sinPhi, 4) + D1 * Math.pow(sinPhi, 6));
    const dLambda = lambda - LAMBDA0;
    const xiPrim = Math.atan(Math.tan(phiStar) / Math.cos(dLambda));
    const etaPrim = Math.atanh(Math.cos(phiStar) * Math.sin(dLambda));
    const b1 = N_ / 2 - 2 * N_ * N_ / 3 + 5 * Math.pow(N_, 3) / 16 + 41 * Math.pow(N_, 4) / 180;
    const b2 = 13 * N_ * N_ / 48 - 3 * Math.pow(N_, 3) / 5 + 557 * Math.pow(N_, 4) / 1440;
    const b3 = 61 * Math.pow(N_, 3) / 240 - 103 * Math.pow(N_, 4) / 140;
    const b4 = 49561 * Math.pow(N_, 4) / 161280;
    const y = K0 * A_HAT * (xiPrim
            + b1 * Math.sin(2 * xiPrim) * Math.cosh(2 * etaPrim)
            + b2 * Math.sin(4 * xiPrim) * Math.cosh(4 * etaPrim)
            + b3 * Math.sin(6 * xiPrim) * Math.cosh(6 * etaPrim)
            + b4 * Math.sin(8 * xiPrim) * Math.cosh(8 * etaPrim)) + FN;
    const x = K0 * A_HAT * (etaPrim
            + b1 * Math.cos(2 * xiPrim) * Math.sinh(2 * etaPrim)
            + b2 * Math.cos(4 * xiPrim) * Math.sinh(4 * etaPrim)
            + b3 * Math.cos(6 * xiPrim) * Math.sinh(6 * etaPrim)
            + b4 * Math.cos(8 * xiPrim) * Math.sinh(8 * etaPrim)) + FE;
    void e;
    return [x, y];
  }
  // Meter (EPSG:3011) → grader [lon, lat]
  function franTM(x, y) {
    const xi = (y - FN) / (K0 * A_HAT);
    const eta = (x - FE) / (K0 * A_HAT);
    const d1 = N_ / 2 - 2 * N_ * N_ / 3 + 37 * Math.pow(N_, 3) / 96 - Math.pow(N_, 4) / 360;
    const d2 = N_ * N_ / 48 + Math.pow(N_, 3) / 15 - 437 * Math.pow(N_, 4) / 1440;
    const d3 = 17 * Math.pow(N_, 3) / 480 - 37 * Math.pow(N_, 4) / 840;
    const d4 = 4397 * Math.pow(N_, 4) / 161280;
    const xiPrim = xi
      - d1 * Math.sin(2 * xi) * Math.cosh(2 * eta)
      - d2 * Math.sin(4 * xi) * Math.cosh(4 * eta)
      - d3 * Math.sin(6 * xi) * Math.cosh(6 * eta)
      - d4 * Math.sin(8 * xi) * Math.cosh(8 * eta);
    const etaPrim = eta
      - d1 * Math.cos(2 * xi) * Math.sinh(2 * eta)
      - d2 * Math.cos(4 * xi) * Math.sinh(4 * eta)
      - d3 * Math.cos(6 * xi) * Math.sinh(6 * eta)
      - d4 * Math.cos(8 * xi) * Math.sinh(8 * eta);
    const phiStar = Math.asin(Math.sin(xiPrim) / Math.cosh(etaPrim));
    const dLambda = Math.atan(Math.sinh(etaPrim) / Math.cos(xiPrim));
    const A2 = E2 + E2 * E2 + E2 * E2 * E2 + Math.pow(E2, 4);
    const B2 = -(7 * E2 * E2 + 17 * E2 * E2 * E2 + 30 * Math.pow(E2, 4)) / 6;
    const C2 = (224 * E2 * E2 * E2 + 889 * Math.pow(E2, 4)) / 120;
    const D2 = -(4279 * Math.pow(E2, 4)) / 1260;
    const sinPs = Math.sin(phiStar);
    const phi = phiStar + sinPs * Math.cos(phiStar) * (A2 + B2 * Math.pow(sinPs, 2)
              + C2 * Math.pow(sinPs, 4) + D2 * Math.pow(sinPs, 6));
    return [(LAMBDA0 + dLambda) * 180 / Math.PI, phi * 180 / Math.PI];
  }

  // ═══ HTTP ══════════════════════════════════════════════════════════════════
  function hamta(vag) {
    return new Promise((ok, nej) => {
      const r = https.request({ hostname: HOST, path: vag, method: 'GET', agent: keepAliveAgent }, resp => {
        if (resp.statusCode !== 200) { resp.resume(); return nej(new Error('HTTP ' + resp.statusCode)); }
        let b = '';
        resp.setEncoding('utf8');
        resp.on('data', d => b += d);
        resp.on('end', () => ok(b));
      });
      r.on('error', nej);
      r.setTimeout(25000, () => r.destroy(new Error('timeout')));
      r.end();
    });
  }
  // ⚠ GeoServer svarar HTTP 200 med ett XML-undantag när något är fel med frågan.
  // Ett sådant svar ska bli ett fel här, inte «noll poster» längre ner i kedjan.
  function fragaLager(namn, bboxMeter) {
    const q = `service=WFS&version=1.1.0&request=GetFeature&typeName=${encodeURIComponent(namn)}`
            + `&outputFormat=application/json&srsName=EPSG:3011&maxFeatures=${TAK}`
            + (bboxMeter ? `&bbox=${bboxMeter.join(',')},EPSG:3011` : '');
    return hamta('/geoserver/ows?' + q).then(s => {
      let j;
      try { j = JSON.parse(s); }
      catch (e) { throw new Error('GeoServer svarade inte JSON: ' + s.slice(0, 160)); }
      if (j.exceptions || j.exceptionReport) throw new Error('GeoServer-undantag för ' + namn);
      return j.features || [];
    });
  }

  // ═══ GATUNAMN ══════════════════════════════════════════════════════════════
  // Tabellen byggs av verktyg/bygg-karlstad-gatunamn.js. Saknas den startar staden
  // ändå, utan rubriker på korten – ett namnlöst kort är sämre, men inte falskt.
  let GATUNAMN = {};
  try {
    const t = JSON.parse(fs.readFileSync(path.join(__dirname, 'karlstad-gatunamn.json'), 'utf8'));
    GATUNAMN = t.namn || {};
    console.log(`[Karlstad] gatunamn: ${Object.keys(GATUNAMN).length} sträckor namngivna (tabell byggd ${t.byggd})`);
  } catch (e) {
    console.warn('[Karlstad] gatunamnstabellen kunde inte läsas – korten blir namnlösa: ' + e.message);
  }
  const linjerUr = g => {
    if (!g) return [];
    if (g.type === 'LineString') return g.coordinates.length >= 2 ? [g.coordinates] : [];
    if (g.type === 'MultiLineString') return g.coordinates.filter(l => l.length >= 2);
    return [];
  };
  function namnFor(linjer) {
    let sx = 0, sy = 0, n = 0;
    for (const l of linjer) for (const c of l) { sx += c[0]; sy += c[1]; n++; }
    if (!n) return '';
    return GATUNAMN[Math.round(sx / n) + ',' + Math.round(sy / n)] || '';
  }

  // ═══ STÄDSCHEMA ════════════════════════════════════════════════════════════
  const VECKODAG = { 'måndag': 1, 'tisdag': 2, 'onsdag': 3, 'torsdag': 4, 'fredag': 5,
                     'lördag': 6, 'söndag': 0 };
  // «kl 8-10», «08-10», «kl 05-07», «10-12» → { s: 800, e: 1000 }
  function tolkaKlockslag(s) {
    const m = /(\d{1,2})\s*[-–]\s*(\d{1,2})/.exec(String(s || '').replace(/kl\.?/i, ''));
    if (!m) return null;
    const a = +m[1], b = +m[2];
    if (!(a >= 0 && a <= 24 && b >= 0 && b <= 24)) return null;
    return { s: a * 100, e: b * 100 };
  }
  // «Jämna veckor» | «Ojämna veckor» | «Udda veckor» (samma sak som ojämna)
  function tolkaVecka(s) {
    const v = String(s || '').toLowerCase().trim();
    if (v.startsWith('jämna')) return { ODD_WEEKS: false, EVEN_WEEKS: true };
    if (v.startsWith('ojämna') || v.startsWith('udda')) return { ODD_WEEKS: true, EVEN_WEEKS: false };
    return null;
  }

  let stadCache = null, stadTs = 0, stadInflight = null;
  function byggStad() {
    if (stadCache && Date.now() - stadTs < TTL) return Promise.resolve(stadCache);
    if (stadInflight) return stadInflight;
    stadInflight = (async () => {
      const fs_ = await fragaLager(LAGER.stad, null);
      const dagar = [[], [], [], [], [], [], []];
      let tomma = 0, olasliga = 0;
      for (const f of fs_) {
        const p = f.properties || {};
        const ls = linjerUr(f.geometry);
        if (!ls.length) { olasliga++; continue; }
        const dag = VECKODAG[String(p.veckodag || '').toLowerCase().trim()];
        const kl = tolkaKlockslag(p.klockslag);
        const vecka = tolkaVecka(p.vecka);
        // Tomrum är «vet inte», inte «inget förbud» – raden ritas inte alls.
        if (dag == null || !kl) { if (!p.veckodag && !p.klockslag) tomma++; else olasliga++; continue; }
        const namn = namnFor(ls);
        const bas = {
          STREET_NAME: namn,
          ADDRESS: '<Adress saknas>',
          START_TIME: kl.s, END_TIME: kl.e,
          // Ingen säsong i Karlstad: samma dagar året runt (sopning sommar, plogning
          // vinter). null, inte 1/1–31/12, annars skriver kortet ut en säsong som
          // inte är ett villkor.
          START_MONTH: null, START_DAY: null, END_MONTH: null, END_DAY: null,
          // Stadsneutrala paritetsfält – klientens weekParityMatches läser dem.
          // Saknas veckoangivelsen sätts båda false, vilket klienten tolkar som
          // «varje vecka» (den visar hellre en städning för mycket).
          ODD_WEEKS: vecka ? vecka.ODD_WEEKS : false,
          EVEN_WEEKS: vecka ? vecka.EVEN_WEEKS : false,
          KARLSTAD_KALLA: 'servicedagar'
        };
        for (const l of ls) {
          const grader = l.map(c => franTM(c[0], c[1]));
          dagar[dag].push({
            type: 'Feature', properties: bas,
            geometry: { type: 'LineString', coordinates: grader },
            _bb: grader.reduce((b, c) => [Math.min(b[0], c[0]), Math.min(b[1], c[1]),
                                          Math.max(b[2], c[0]), Math.max(b[3], c[1])],
                               [Infinity, Infinity, -Infinity, -Infinity]),
            _m: l                                   // meterversionen, för kopplingen nedan
          });
        }
      }
      // ── KONFLIKTREGELN: parkeringslagrets egen förbudstext läggs till ────────
      // Se KONFLIKT överst i filen. Säger en avgiftssträcka «måndagar jämna veckor
      // kl. 10-12» och ingen städlinje inom 10 m har EXAKT samma dag, tid och vecka,
      // blir texten en egen städpost på sträckans geometri. Klienten varnar då för
      // båda fönstren. Säger källorna samma sak läggs inget till – då vore det en
      // dubblett. Uppmätt 2026-09-17: av 49 texter lägger regeln till 4 – Vikengatan
      // (två sträckor, «10-12» mot städlagrets och kommunens lista «08-10»), en
      // Drottninggatan-sträcka («måndagar» mot städlagrets «onsdag») och en sträcka
      // helt utan städlinje inom 10 m. Provet i test/karlstad-prov.js vaktar Vikengatan.
      let tillagda = 0;
      try {
        const park = await fragaLager(LAGER.avgift, null);
        const dist = (x, y, l) => {
          let m = Infinity;
          for (let i = 0; i < l.length - 1; i++) {
            const [x1, y1] = l[i], [x2, y2] = l[i + 1];
            const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
            let t = l2 ? ((x - x1) * dx + (y - y1) * dy) / l2 : 0;
            t = Math.max(0, Math.min(1, t));
            m = Math.min(m, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
          }
          return m;
        };
        for (const f of park) {
          const fb = tolkaForbudstext((f.properties || {}).parkeringsforbud);
          if (!fb || fb.okand || fb.day == null) continue;
          const ls = linjerUr(f.geometry);
          if (!ls.length) continue;
          const jamn = fb.veckor === 'jämna';
          const lika = dagar[fb.day].some(c => c.properties.START_TIME === fb.s && c.properties.END_TIME === fb.e
            && c.properties.EVEN_WEEKS === jamn && c.properties.ODD_WEEKS === !jamn
            && ls.some(l => l.some(p => dist(p[0], p[1], c._m) <= 10)));
          if (lika) continue;
          const bas = {
            STREET_NAME: namnFor(ls), ADDRESS: '<Adress saknas>',
            START_TIME: fb.s, END_TIME: fb.e,
            START_MONTH: null, START_DAY: null, END_MONTH: null, END_DAY: null,
            ODD_WEEKS: !jamn, EVEN_WEEKS: jamn,
            KARLSTAD_KALLA: 'parkeringstext',
            KARLSTAD_TEXT: fb.text
          };
          for (const l of ls) {
            const grader = l.map(c => franTM(c[0], c[1]));
            dagar[fb.day].push({
              type: 'Feature', properties: bas,
              geometry: { type: 'LineString', coordinates: grader },
              _bb: grader.reduce((b, c) => [Math.min(b[0], c[0]), Math.min(b[1], c[1]),
                                            Math.max(b[2], c[0]), Math.max(b[3], c[1])],
                                 [Infinity, Infinity, -Infinity, -Infinity]),
              _m: l
            });
          }
          tillagda++;
        }
      } catch (e) {
        // Parkeringslagret är ett tillägg här, inte grunden. Faller det bort visas
        // städlagret ensamt – som före regeln – och felet syns i loggen.
        console.warn('[Karlstad] konfliktregeln kunde inte köras: ' + e.message);
      }

      const n = dagar.reduce((s, d) => s + d.length, 0);
      if (tillagda) console.log(`[Karlstad] ${tillagda} förbudstexter ur parkeringslagret lades till (oense med eller saknade städlinje)`);
      console.log(`[Karlstad] servicedagar: ${n} segment inlästa`
        + (tomma ? `, ${tomma} tomma rader utan schema (ritas inte)` : '')
        + (olasliga ? `, ${olasliga} oläsliga` : ''));
      stadCache = dagar; stadTs = Date.now();
      return dagar;
    })().finally(() => { stadInflight = null; });
    return stadInflight;
  }

  // ═══ PARKERING ═════════════════════════════════════════════════════════════
  // Avgiftsfältens värden är kommunens egna och stavas på femton sätt: «8 kr/h»,
  // «6kr/h», «12-14 kr/h», «13», «5-7». Enheten står i FÄLTNAMNET (timtaxa_dag =
  // kronor i timmen), så ett naket tal skrivs ut med den enheten – det är att läsa
  // fältet, inte att gissa. Ett värde som inte går att känna igen skrivs ut ORDAGRANT
  // som kommunen skrev det, aldrig omtolkat och aldrig bortkastat.
  function taxaText(v, enhet) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return '';
    if (/^ej tillämpligt$/i.test(s)) return '';
    if (/^fri parkering$/i.test(s)) return 'fritt';
    const m = /^(\d+(?:\s*[-–]\s*\d+)?)\s*(kr\/h|kr|kronor)?\s*$/i.exec(s);
    if (m) return m[1].replace(/\s*[-–]\s*/, '–') + ' ' + enhet;
    return s;                                    // okänd stavning – ordagrant
  }
  // «09-18 (09-15)» är skyltkonventionen: vardag, och inom parentes vardag före
  // sön- och helgdag. Vi TOLKAR den inte till ett förbudsfönster – avgiftstiden är
  // ett pris, inte en laglighet – utan skriver ut den som kommunen gjorde.
  function avgiftstidText(s) {
    const v = String(s || '').trim();
    if (!v || v === '00-24') return '';
    return v.replace(/(\d{2})-(\d{2})/g, '$1–$2');
  }
  function prisrad(p) {
    const dag = taxaText(p.timtaxa_dag, 'kr/tim');
    const natt = taxaText(p.timtaxa_natt, 'kr/tim');
    const dygn = taxaText(p.dygnstaxa, 'kr/dygn');
    const vecka = taxaText(p.veckotaxa, 'kr/vecka');
    const tid = avgiftstidText(p.avgiftstid);
    const bitar = [];
    if (dag) bitar.push(dag + (tid ? ' ' + tid : ''));
    if (natt) bitar.push(natt === 'fritt' ? 'fritt övrig tid' : natt + ' övrig tid');
    if (dygn) bitar.push(dygn);
    if (vecka) bitar.push(vecka);
    const zon = String(p.parkeringsomrade || '').trim();
    const txt = bitar.join(' · ');
    return zon ? (txt ? zon + ': ' + txt : zon) : txt;
  }
  // «1 vecka» | «120 min» | «1 dygn» | «Ej tillämpligt» | tomt
  // 178 av 381 är tomma. Tomt ger inga MAX_*-fält, och den delade koden behandlar det
  // som i Stockholm: ingen skyltad gräns, grönt är möjligt. Två skyltar i Grön zon med
  // tomt fält (Vikengatan, Trädgårdsgatan) saknar mycket riktigt gräns. Se toppen av filen.
  function tolkaMaxtid(s) {
    const v = String(s || '').trim().toLowerCase();
    if (!v || v === 'ej tillämpligt') return null;
    let m = /^(\d+)\s*min/.exec(v);            if (m) return { MAX_MINUTES: +m[1] };
    m = /^(\d+)\s*(tim|timmar|h)\b/.exec(v);   if (m) return { MAX_HOURS: +m[1] };
    m = /^(\d+)\s*dygn/.exec(v);               if (m) return { MAX_DAYS: +m[1] };
    m = /^(\d+)\s*veck/.exec(v);               if (m) return { MAX_DAYS: +m[1] * 7 };
    return { okand: v };
  }
  // Sträckans EGEN förbudstext: «torsdagar jämna veckor kl. 05-07».
  function tolkaForbudstext(s) {
    const t = String(s || '').trim();
    if (!t) return null;
    const m = /^(måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag)ar?\s+(jämna|ojämna|udda)\s+veckor\s+kl\.?\s*(\d{1,2})\s*[-–]\s*(\d{1,2})/i.exec(t);
    if (!m) return { okand: t };
    return {
      day: VECKODAG[m[1].toLowerCase()],
      s: +m[3] * 100, e: +m[4] * 100,
      veckor: /^jämna$/i.test(m[2]) ? 'jämna' : 'udda',
      text: t
    };
  }

  function byggPost(f) {
    const p = f.properties || {};
    const ls = linjerUr(f.geometry);
    if (!ls.length) return null;
    const props = {
      STREET_NAME: namnFor(ls),
      VEHICLE: 'fordon',
      // Alla 381 är PARKABs avgiftsplatser. `parkeringstyp` är tomt på 381 av 381,
      // så någon finare uppdelning finns inte att göra.
      VF_PLATS_TYP: 'P Avgift',
      PARKING_RATE: prisrad(p),
      MAX_MINUTES: null, MAX_HOURS: null, MAX_DAYS: null,
      START_TIME: null, END_TIME: null, START_WEEKDAY: '', DAY_TYPE: '',
      START_MONTH: null, START_DAY: null, END_MONTH: null, END_DAY: null,
      // Stockholms signal för äkta korttidsficka finns inte här. null, aldrig ett
      // hittepåvärde (NY_STAD.md avsnitt 4).
      VF_METER: null,
      VF_PLATSER: /^\d+$/.test(String(p.antal || '').trim()) ? +p.antal : null,
      CITATION: ''
    };
    const mt = tolkaMaxtid(p.max_ptid);
    if (mt && !mt.okand) Object.assign(props, mt);
    else if (mt && mt.okand) props.KONTROLLERA_SKYLT = 'Tidsgränsen står som «' + mt.okand + '» i stadens data och går inte att läsa – läs skylten.';
    const fb = tolkaForbudstext(p.parkeringsforbud);
    if (fb && !fb.okand) props.KARLSTAD_FORBUD = fb;
    return ls.map(l => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: l } }));
  }

  // ── Sökrute-cache ──────────────────────────────────────────────────────────
  const rutor = new Map();
  const nyckelFor = b => b.map(v => Math.round(v)).join(',');
  function ruteCache(k) {
    const t = rutor.get(k);
    if (!t) return null;
    if (Date.now() - t.nar > RUT_TTL) { rutor.delete(k); return null; }
    return t.data;
  }
  function spara(k, data) {
    if (rutor.size >= RUT_MAX) rutor.delete(rutor.keys().next().value);
    rutor.set(k, { nar: Date.now(), data });
  }

  // Sökrutan kommer i grader från klienten; lagret frågas i meter. Hörnen räknas om
  // och rutan görs omslutande – en roterad ruta blir aldrig mindre än originalet.
  function graderTillMeterBbox([aLng, aLat, bLng, bLat]) {
    const h = [tillTM(aLng, aLat), tillTM(bLng, aLat), tillTM(aLng, bLat), tillTM(bLng, bLat)];
    return [Math.min(...h.map(c => c[0])), Math.min(...h.map(c => c[1])),
            Math.max(...h.map(c => c[0])), Math.max(...h.map(c => c[1]))];
  }

  async function byggTillaten(bbox) {
    const mBox = graderTillMeterBbox(bbox);
    const k = nyckelFor(mBox);
    const traff = ruteCache(k);
    if (traff) return { features: traff, varm: true };
    const fs_ = await fragaLager(LAGER.avgift, mBox);
    const ut = [];
    let utan = 0;
    for (const f of fs_) {
      const poster = byggPost(f);
      if (poster) ut.push(...poster); else utan++;
    }
    console.log(`[Karlstad] tillåten: ${fs_.length} poster → ${ut.length} linjer` + (utan ? `, ${utan} utan ritbar geometri` : ''));
    spara(k, ut);
    return { features: ut, varm: false };
  }

  // ═══ PARKERINGSANLÄGGNINGAR ════════════════════════════════════════════════
  // Punktlagret bär åtta kategorier; bara de två som är en plats att ställa bilen på
  // när gatan är full tas med. «Laddstolpe», «Bussparkering», «Husbilsparkering» och
  // «Parkering för rörelsehindrade» hör inte hemma i en lista som föraren läser som
  // «hit kan jag åka i stället».
  const ANLAGGNING = /^(Parkeringshus|Parkeringsområden)$/i;
  // Kommunens taxafält är ibland en HTML-länk («<a href="…">Se taxa</a>»). Rå HTML
  // får aldrig nå kortet – texten plockas ut, länken kastas.
  const utanHtml = s => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim();

  let phusCache = null, phusTs = 0, phusInflight = null;
  function byggPhus() {
    if (phusCache && Date.now() - phusTs < TTL) return Promise.resolve(phusCache);
    if (phusInflight) return phusInflight;
    phusInflight = fragaLager(LAGER.platser, null).then(fs_ => {
      const ut = [];
      for (const f of fs_) {
        const p = f.properties || {};
        if (!ANLAGGNING.test(String(p.kategori || ''))) continue;
        const g = f.geometry;
        const c = g && g.type === 'Point' ? g.coordinates
                : g && g.type === 'MultiPoint' ? g.coordinates[0] : null;
        if (!c) continue;
        const [lng, lat] = franTM(c[0], c[1]);
        const pris = utanHtml(p.taxa);
        ut.push({
          Name: utanHtml(p.namn) || 'Parkering',
          Adress: null,
          Agare: /parkeringshus/i.test(p.kategori) ? 'Karlstads Parkerings AB' : null,
          Anlaggningstyp: /parkeringshus/i.test(p.kategori) ? 'Garage' : 'Ytparkering',
          // Kommunen publicerar INGEN kapacitet på anläggningarna. 0 betyder «ingen
          // uppgift» i klienten, som då inte skriver ut någon platssiffra.
          AntalBesokPlatser: 0,
          AdressLatitud: lat, AdressLongitud: lng,
          // Priset står i fritext och räknas INTE om till kr/tim här: «Se taxa» och
          // «Privat aktör» är inte tal. Hellre ingen prisrad än en gissad.
          BesokstaxaCollection: [], ZonkodCollection: [],
          KARLSTAD_PRISTEXT: /^se taxa$/i.test(pris) ? null : (pris || null),
          KARLSTAD_TIDSGRANS: utanHtml(p.tidsgrans) || null
        });
      }
      console.log(`[Karlstad] parkeringsanläggningar: ${ut.length} inlästa`);
      phusCache = ut; phusTs = Date.now();
      return ut;
    }).finally(() => { phusInflight = null; });
    return phusInflight;
  }

  // ═══ PRISSTEGEN (gatuzonerna) ══════════════════════════════════════════════
  // Karlstad har FYRA gatuzoner vars namn är färger, och de ligger i samma ordning
  // som appens prisskala: Röd dyrast → Blå billigast. Mätt 2026-09-20 på alla 381
  // avgiftssträckor: Röd 18, Gul 16, Grön 8, Blå 4 kr/tim.
  //
  // Priserna HÄRLEDS ur samma fält som platskortet läser – de skrivs aldrig in här.
  // En taxehöjning slår därför igenom av sig själv, precis som på kortet. De ~27
  // namngivna p-områdena (Sundstabadet, Karolinen …) hör inte hit: de är enskilda
  // anläggningar med eget pris, inte ett stadsomfattande steg, och priset står redan
  // på kortet. Zonytorna RITAS inte – de är parkeringsplatserna själva (355 av 381
  // sträckor ligger inne i en yta), inte en stadsdelskarta. Se projektminnet.
  const GATUZONER = ['Röd zon', 'Gul zon', 'Grön zon', 'Blå zon'];
  let stegCache = null, stegTs = 0, stegInflight = null;
  function byggPrissteg() {
    if (stegCache && Date.now() - stegTs < TTL) return Promise.resolve({ steg: stegCache, varm: true });
    if (stegInflight) return stegInflight;
    stegInflight = fragaLager(LAGER.avgift, null).then(fs_ => {
      const per = new Map(GATUZONER.map(z => [z, { zon: z, priser: new Map(), strackor: 0 }]));
      for (const f of fs_) {
        const p = f.properties || {};
        const rad = per.get(String(p.parkeringsomrade || '').trim());
        if (!rad) continue;
        rad.strackor++;
        const pris = taxaText(p.timtaxa_dag, 'kr/tim');
        if (pris) rad.priser.set(pris, (rad.priser.get(pris) || 0) + 1);
      }
      const steg = [];
      for (const rad of per.values()) {
        if (!rad.strackor || !rad.priser.size) continue;
        // Flera stavningar av samma pris ("8 kr/h" och "8") blir samma text via taxaText.
        // Står det ändå OLIKA priser i en zon skriver vi ut alla – hellre "8 kr/tim,
        // 10 kr/tim" än ett påhittat snitt.
        const priser = [...rad.priser.keys()].sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
        steg.push({ zon: rad.zon, pris: priser.join(', '), strackor: rad.strackor,
                    sortering: parseFloat(priser[0]) || 0 });
      }
      steg.sort((a, b) => b.sortering - a.sortering);       // dyrast först
      // Allt-eller-inget, av samma skäl som Uppsalas zoner: en stege där Gul saknas
      // ser ut som att Gul zon vore gratis.
      if (steg.length !== GATUZONER.length) {
        console.warn(`[Karlstad] prissteg: fick ${steg.length} av ${GATUZONER.length} zoner – visar ingen stege`);
        return { steg: [], varm: false };
      }
      console.log('[Karlstad] prissteg: ' + steg.map(s => `${s.zon} ${s.pris}`).join(' · '));
      stegCache = steg; stegTs = Date.now();
      return { steg, varm: false };
    }).finally(() => { stegInflight = null; });
    return stegInflight;
  }

  // ═══ VÄGAR ═════════════════════════════════════════════════════════════════
  const fel = (res, kod, txt) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(kod, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: txt }));
  };
  function tolkaBbox(s) {
    const d = String(s || '').split(',').map(Number).slice(0, 4);
    return d.length === 4 && d.every(Number.isFinite) ? d : null;
  }
  // Minsta avstånd från en punkt (meter) till en linje (meter).
  function punktTillLinje(x, y, linje) {
    let m = Infinity;
    for (let i = 0; i < linje.length - 1; i++) {
      const [x1, y1] = linje[i], [x2, y2] = linje[i + 1];
      const dx = x2 - x1, dy = y2 - y1;
      const l2 = dx * dx + dy * dy;
      let t = l2 ? ((x - x1) * dx + (y - y1) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      m = Math.min(m, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
    }
    return m;
  }
  const SCHEMA_RADIE = 30;        // meter kring destinationen

  function hantera(reqUrl, req, res) {
    // ── Städdata i EXAKT samma svarsform som Stockholms /servicedagar-bbox ──
    if (reqUrl.pathname === '/karlstad/servicedagar-bbox') {
      const tolkaDag = s => {
        s = (s || '').toLowerCase().trim();
        return /^\d$/.test(s) ? +s : SCHED_API_DAYS.indexOf(s);
      };
      const flera = reqUrl.searchParams.has('dagar');
      const dagar = flera ? (reqUrl.searchParams.get('dagar') || '').split(',').map(tolkaDag)
                          : [tolkaDag(reqUrl.searchParams.get('dag'))];
      const bbox = tolkaBbox(reqUrl.searchParams.get('bbox'));
      if (!dagar.length || dagar.some(d => !(d >= 0 && d <= 6)) || !bbox) {
        return fel(res, 400, 'dag/dagar (0-6 eller veckodagsnamn) och bbox=minLng,minLat,maxLng,maxLat krävs'), true;
      }
      const varm = !!stadCache;
      byggStad().then(geo => {
        const [aLng, aLat, bLng, bLat] = bbox;
        // Veckoparitet filtreras INTE här – den avgörs av klientens cleaningActiveOn
        // vid varje rendering, tillsammans med röd dag-undantaget.
        const utsnitt = d => ({
          type: 'FeatureCollection',
          features: (geo[d] || [])
            .filter(f => !(f._bb[2] < aLng || f._bb[0] > bLng || f._bb[3] < aLat || f._bb[1] > bLat))
            .map(f => ({ type: f.type, properties: f.properties, geometry: f.geometry }))
        });
        const kropp = flera ? { dagar: Object.fromEntries(dagar.map(d => [d, utsnitt(d)])) }
                            : utsnitt(dagar[0]);
        send(req, res, 200, 'application/json; charset=utf-8',
             Buffer.from(JSON.stringify(kropp)), varm ? 'HIT' : 'MISS');
      }).catch(e => { console.warn('[Karlstad] städdata:', e.message); fel(res, 502, 'Karlstads städdata otillgänglig'); });
      return true;
    }

    // ── Parkering i P_TILLATEN-form, meter (EPSG:3011) ─────────────────────
    if (reqUrl.pathname === '/karlstad/wfs-tillaten') {
      const bbox = tolkaBbox(reqUrl.searchParams.get('BBOX') || reqUrl.searchParams.get('bbox'));
      if (!bbox) return fel(res, 400, 'BBOX=minLng,minLat,maxLng,maxLat krävs'), true;
      byggTillaten(bbox).then(({ features, varm }) => {
        send(req, res, 200, 'application/json; charset=utf-8',
             Buffer.from(JSON.stringify({ type: 'FeatureCollection', features })), varm ? 'HIT' : 'MISS');
      }).catch(e => { console.warn('[Karlstad] tillåten:', e.message); fel(res, 502, 'Karlstads parkeringsdata otillgänglig'); });
      return true;
    }

    if (reqUrl.pathname === '/karlstad/zontaxor') {
      byggPrissteg().then(({ steg, varm }) => {
        send(req, res, 200, 'application/json; charset=utf-8',
             Buffer.from(JSON.stringify(steg)), varm ? 'HIT' : 'MISS');
      }).catch(e => { console.warn('[Karlstad] prissteg:', e.message); fel(res, 502, 'Karlstads zontaxor otillgängliga'); });
      return true;
    }
    if (reqUrl.pathname === '/karlstad/phus') {
      const varm = !!phusCache;
      byggPhus().then(list => {
        send(req, res, 200, 'application/json; charset=utf-8', Buffer.from(JSON.stringify(list)), varm ? 'HIT' : 'MISS');
      }).catch(e => { console.warn('[Karlstad] anläggningar:', e.message); fel(res, 502, 'Karlstads parkeringsanläggningar otillgängliga'); });
      return true;
    }

    // ── Schema-uppslag: samma kontrakt som /schedule ────────────────────────
    // { schedule:[{day,s,e,veckor?,kalla?}] }.
    //
    // ⚠ UPPSLAGET ÄR GEOMETRISKT, INTE PÅ NAMN. Båda lagren saknar gatunamn i
    // källan (våra namn är härledda), så namnet duger inte som nyckel. Finns ett
    // härlett namn på städlinjen OCH klienten skickade samma namn används det som
    // extra filter; annars avgör avståndet ensamt.
    if (reqUrl.pathname === '/karlstad/schedule') {
      const lat = parseFloat(reqUrl.searchParams.get('lat'));
      const lng = parseFloat(reqUrl.searchParams.get('lng'));
      const name = (reqUrl.searchParams.get('name') || '').toLowerCase().trim();
      if (!isFinite(lat) || !isFinite(lng)) return fel(res, 400, 'lat/lng krävs'), true;
      const varm = !!stadCache;
      byggStad().then(geo => {
        const [px, py] = tillTM(lng, lat);
        const nara = [];
        for (let dag = 0; dag < 7; dag++) {
          for (const f of geo[dag] || []) {
            const d = punktTillLinje(px, py, f._m);
            if (d <= SCHEMA_RADIE) nara.push({ dag, f, d });
          }
        }
        const medNamn = name ? nara.filter(x => (x.f.properties.STREET_NAME || '').toLowerCase().trim() === name) : [];
        const valda = medNamn.length ? medNamn : nara;
        const seen = new Set(), schedule = [];
        for (const { dag, f } of valda.sort((a, b) => a.d - b.d)) {
          const p = f.properties;
          const veckor = p.ODD_WEEKS && p.EVEN_WEEKS ? null
                       : p.ODD_WEEKS ? 'udda' : p.EVEN_WEEKS ? 'jämna' : null;
          const k = dag + '_' + p.START_TIME + '_' + p.END_TIME + '_' + veckor;
          if (seen.has(k)) continue;
          seen.add(k);
          // `kalla` bara på rader ur KONFLIKTREGELN (parkeringslagrets egen text). Har samma
          // sträcka rader från båda källorna vet kortet att kommunen säger två saker, och
          // skriver ut det i stället för att lista fönstren som om båda vore givna.
          schedule.push(p.KARLSTAD_KALLA === 'parkeringstext'
            ? { day: dag, s: p.START_TIME, e: p.END_TIME, veckor, kalla: 'parkeringstext' }
            : { day: dag, s: p.START_TIME, e: p.END_TIME, veckor });
        }
        send(req, res, 200, 'application/json; charset=utf-8',
             Buffer.from(JSON.stringify({ schedule })), varm ? 'HIT' : 'MISS');
      }).catch(e => { console.warn('[Karlstad] schema:', e.message); fel(res, 502, 'Karlstads schema otillgängligt'); });
      return true;
    }

    return false;
  }

  return { id: 'karlstad', prefix: '/karlstad/', hantera, _tillTM: tillTM, _franTM: franTM };
};
