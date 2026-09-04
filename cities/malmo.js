'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// STADSADAPTER: Malmö
// ─────────────────────────────────────────────────────────────────────────────
// KONTRAKTET (samma som cities/goteborg.js och cities/sundbyberg.js): exportera en
// factory som tar de delade hjälparna och returnerar
// { id, prefix, hantera(reqUrl, req, res) -> bool }.
// hantera() svarar true om vägen togs om hand. Allt utanför `prefix` rörs aldrig.
//
// KÄLLA: gis.malmo.se/arcgis (ArcGIS Server 11.3). INGEN nyckel, ingen inloggning.
// Samma data publiceras av kommunen som öppna data på opendata.malmo.se med
// attributbeskrivningar — de två parkeringsdatamängderna ägs av Fastighets- och
// gatukontoret (gis.fgk@malmo.se) och uppdaterades senast dagen före den här filen
// skrevs. Vi läser ArcGIS-vägen för att den tar bbox och svarar med GeoJSON direkt.
//
// ═══ DET SOM SKILJER MALMÖ FRÅN ALLA ANDRA STÄDER ═══════════════════════════
// **Städningen går efter DATUM I MÅNADEN, inte veckodag.** Kommunen kallar det
// *miljöparkering*: «Parkering förbjuden klockan 18.00 - 22.00 den 23:e i månaden.»
// Fältet `day` är 1–30 och `tiden` ett av tre fönster (0800-1200, 1200-1600,
// 1800-2200). Verifierat mot skylt på Stora Nygatan 2026-09-04: skylten säger
// «18–22, gäller den 23:a varje månad» — siffra för siffra som datan.
//
// Adaptern översätter det till ETT nytt fält, `MONTH_DAY`, som den delade koden
// grindar på i cleaningActiveOn(). Städer utan fältet beter sig exakt som förr.
// Eftersom den 23:e kan infalla på vilken veckodag som helst levereras samma
// städposter i ALLA sju dagsfacken; det är datumgrinden som avgör, inte facket.
//
// ═══ FÄLLOR (alla ger tyst fel svar, inte felmeddelande) ═════════════════════
// 1. AXELORDNING. `inSR=4326` + esriGeometryEnvelope tolkas som **lng,lat**.
//    Verifierat mot Stortorget: rätt ordning gav 233 avgiftssträckor, och
//    koordinaterna kom tillbaka som 12.998 / 55.607 (dvs lng först).
// 2. LAGERNAMNEN LJUGER. Lagret heter «Miljöparkeringar» men innehåller
//    trafikföreskrifter, och lagret «Parkeingsavgifter» (kommunens stavfel) är
//    avgiftssträckorna. Gå aldrig på namnet — läs fälten.
// 3. `value` ÄR PLATSTYP, INTE REGELN. Det tog mig två försök att se. Mätt
//    geometriskt 2026-09-04: «Parkering, avgift» ligger på en avgiftslinje i
//    100 % av 581 fall, «Förbud mot att parkera fordon» i 1,8 % av 114. Fältet
//    beskriver alltså vad platsen ÄR; `copy_value` beskriver städregeln.
// 4. GATUNAMN SAKNAS på både avgifts- och städlagret. De härleds ur kommunens
//    egna vägmittlinjer — se harledNamn() och varningen där.
//
// ═══ VAD MALMÖ INTE PUBLICERAR (kontrollerat över sex värdar 2026-09-04) ═════
// gis.malmo.se (619 lager, 5 895 fält), opendata.malmo.se (172 datamängder),
// stadsatlas.malmo.se (GeoServer + QGIS), geo.malmo.se, malmo.maps.arcgis.com.
//   · LASTPLATSER. Hela kommunen har fyra poster. En lastplats 9–18 på Stora
//     Nygatan ligger i datan som vanlig avgiftsparkering. Mätt mot Stockholms
//     riktiga data är lastplats 7,4 % av innerstadens gatulängd — och 0 av 713
//     gäller kl 02 eller 23. Luckan är alltså ett DAGTIDSfenomen och hotar inte
//     natt-löftet. Den står i stadens disclaimer.
//   · TIDSGRÄNSENS VÄRDE. Registret vet att 37 sträckor är «Parkering,
//     tidsbegränsad» men aldrig om det är 30 min eller 2 tim → vi sätter inget.
//   · FÖRBUD utanför städgatorna, och cykelparkering med stoppförbud.
// Brev till gis.fgk@malmo.se ligger i MALMO_BREV.md.

module.exports = function skapaMalmo(delade) {
  const { https, keepAliveAgent, segDistM, send } = delade;

  const HOST = 'gis.malmo.se';
  const BAS  = '/arcgis/rest/services';
  const RUT_TTL = 10 * 60 * 1000;      // sökrutor cachas kort, bara för lägesväxling
  const RUT_MAX = 60;

  const LAGER = {
    avgift: 'FGK/Parkster/MapServer/0',                    // 1 682 sträckor: taxa, boendezon
    stad:   'FGK/Parkster/MapServer/1',                    // 2 297 miljöparkeringar (städ)
    oregl:  'FGK/Trafik_visninsgstjanster/MapServer/0',    // 7 645 oreglerade, med gatunamn
    vagar:  'Geodata/Vagar_mittlinjer/MapServer/0'         // 70 234 vägmittlinjer, fält NAME
  };

  // ── Hämtning ───────────────────────────────────────────────────────────────
  // resultRecordCount sätts högt men ÄNDLIGT. Appens sökruta är 250 m och ger
  // några hundra poster; taket finns för att en absurd bbox inte ska kunna dra
  // hem hela kommunen. Träffas taket är svaret avkortat UTAN felmeddelande från
  // ArcGIS — därför loggar vi det i stället för att tiga.
  const TAK = 2000;

  function hamtaJson(vag) {
    return new Promise((ok, nej) => {
      const r = https.request({ hostname: HOST, path: vag, method: 'GET', agent: keepAliveAgent },
        resp => {
          if (resp.statusCode !== 200) { resp.resume(); return nej(new Error('HTTP ' + resp.statusCode)); }
          let bit = '';
          resp.setEncoding('utf8');
          resp.on('data', d => bit += d);
          resp.on('end', () => { try { ok(JSON.parse(bit)); } catch (e) { nej(e); } });
        });
      r.on('error', nej);
      r.setTimeout(20000, () => r.destroy(new Error('timeout')));
      r.end();
    });
  }

  function fragaLager(lager, bbox, falt = '*') {
    const [aLng, aLat, bLng, bLat] = bbox;
    const q = `f=geojson&where=1%3D1&outFields=${encodeURIComponent(falt)}&outSR=4326`
            + `&geometry=${aLng},${aLat},${bLng},${bLat}&geometryType=esriGeometryEnvelope`
            + `&inSR=4326&spatialRel=esriSpatialRelIntersects&returnGeometry=true`
            + `&resultRecordCount=${TAK}`;
    return hamtaJson(`${BAS}/${lager}/query?${q}`).then(d => {
      const f = (d && d.features) || [];
      if (f.length >= TAK) console.warn(`[Malmö] ${lager}: svaret nådde taket ${TAK} – sökrutan är för stor`);
      return f;
    });
  }

  // ── Geometrihjälpare ───────────────────────────────────────────────────────
  const linjerUr = f => {
    const g = (f && f.geometry) || {};
    if (g.type === 'LineString') return [g.coordinates || []];
    if (g.type === 'MultiLineString') return g.coordinates || [];
    return [];
  };
  const punkterUr = f => {
    const ut = [];
    for (const l of linjerUr(f)) for (const p of l) if (Array.isArray(p) && p.length >= 2) ut.push(p);
    return ut;
  };

  // ── Gatunamn ur vägmittlinjerna ────────────────────────────────────────────
  // ⚠️ HÄRLETT, INTE HÄMTAT. Varken avgifts- eller städlagret bär gatunamn, men
  // kortets rubrik OCH städschemats uppslag hänger på det. Metoden: rösta med tre
  // punkter längs sträckan (början, mitten, slutet) och ta den vanligaste
  // träffen; lika röster avgörs av kortaste avstånd.
  //
  // Mätt på fyra provsträckor i centrala Malmö 2026-09-04: ENTYDIGT svar på två,
  // tvetydigt på två (en 95 m lång sträcka låg 13 m från Västergatan i ena änden
  // och 6 m från Lilla Bruksgatan i andra). Röstningen finns just för de fallen,
  // men den gör dem inte säkra — därför taket nedan: hittar vi ingen väg inom
  // NAMN_MAX_M lämnar vi namnet TOMT i stället för att sätta närmaste gissning.
  // Tomt namn ger ett namnlöst kort; ett FEL namn hade kopplat sträckan till en
  // annan gatas städschema, vilket är den farliga varianten.
  const NAMN_MAX_M = 30;

  function byggVagIndex(vagar) {
    const segment = [];
    for (const v of vagar) {
      const namn = ((v.properties && v.properties.NAME) || '').trim();
      if (!namn) continue;
      for (const l of linjerUr(v))
        for (let i = 0; i < l.length - 1; i++) segment.push({ namn, a: l[i], b: l[i + 1] });
    }
    return segment;
  }

  function narmasteNamn(segment, pt) {
    let bast = null, bastD = Infinity;
    for (const s of segment) {
      const d = segDistM(pt[1], pt[0], s.a, s.b);
      if (d < bastD) { bastD = d; bast = s.namn; }
    }
    return bastD <= NAMN_MAX_M ? { namn: bast, d: bastD } : null;
  }

  function harledNamn(segment, f) {
    const p = punkterUr(f);
    if (!p.length || !segment.length) return '';
    const prov = [p[0], p[Math.floor(p.length / 2)], p[p.length - 1]];
    const roster = new Map();
    for (const q of prov) {
      const t = narmasteNamn(segment, q);
      if (!t) continue;
      const rad = roster.get(t.namn) || { n: 0, d: Infinity };
      rad.n++; rad.d = Math.min(rad.d, t.d);
      roster.set(t.namn, rad);
    }
    let vinnare = '', bast = null;
    roster.forEach((v, k) => {
      if (!bast || v.n > bast.n || (v.n === bast.n && v.d < bast.d)) { bast = v; vinnare = k; }
    });
    return vinnare;
  }

  // ── Städdata (miljöparkering) ──────────────────────────────────────────────
  // «1800 - 2200» → 1800 / 2200. Kommunen skriver alltid HHMM med mellanslag runt
  // bindestrecket, men vi litar inte på det: en rad vi inte kan läsa slängs, den
  // gissas aldrig till ett klockslag.
  function tolkaTiden(s) {
    const m = /^\s*(\d{3,4})\s*-\s*(\d{3,4})\s*$/.exec(String(s || ''));
    if (!m) return null;
    const a = +m[1], b = +m[2];
    if (!(a >= 0 && a <= 2359 && b >= 0 && b <= 2359)) return null;
    return { start: a, slut: b };
  }

  function byggStadFeatures(stadRaa, segment) {
    const ut = [];
    for (const f of stadRaa) {
      const p = f.properties || {};
      const tid = tolkaTiden(p.tiden);
      const dag = parseInt(p.day, 10);
      // Utan BÅDE datum och fönster kan regeln inte tidsättas. Då är den värdelös
      // som varning och farlig som tystnad — vi tar inte med den alls.
      if (!tid || !(dag >= 1 && dag <= 31)) continue;
      ut.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          STREET_NAME: harledNamn(segment, f),
          START_TIME: tid.start,
          END_TIME:   tid.slut,
          // Det nya fältet. Se cleaningActiveOn() i index.html.
          MONTH_DAY:  dag,
          // Malmös miljöparkering har ingen säsong och ingen veckoparitet —
          // fälten sätts uttryckligen till null så att den delade koden läser
          // "ingen begränsning", inte "okänt".
          START_MONTH: null, START_DAY: null, END_MONTH: null, END_DAY: null,
          ODD_WEEKS: null, EVEN_WEEKS: null,
          CITATION: p.gid_ltf != null ? String(p.gid_ltf) : '',
          MALMO_PLATSTYP: String(p.value || '').trim()
        }
      });
    }
    return ut;
  }

  // ── Tillåten parkering ─────────────────────────────────────────────────────
  // Två källor slås ihop till P_TILLATEN-formen:
  //   avgift  → «P Avgift» / «P Avgift, boende», med kommunens pristext ordagrant
  //   oregl   → «P», 24-timmarsregeln, med gatunamn direkt ur `gatudel`
  //
  // MAX_HOURS sätts till 24 på de oreglerade och lämnas TOMT på avgiftssträckorna.
  // Båda är avsiktliga och båda är lästa utanför datan:
  //   · Oreglerad = ingen lokal föreskrift → trafikförordningens 24-timmarsregel.
  //     Bekräftat i verkligheten 2026-09-04 på Arkitektgatan och Dybäcksgatan:
  //     inga skyltar, och EasyPark hittar ingen zon. 24 tim > en natt → grönt.
  //   · Avgift: Malmö stad skriver «I Malmö betalar du för parkering dygnet runt,
  //     alla dagar i veckan». Taxan är regleringen, det finns ingen tidsgräns att
  //     publicera. Tomt fält betyder här alltså "ingen gräns", inte "vet inte" —
  //     det är enda stället i den här filen där tystnad tolkas, och det är läst
  //     hos kommunen, inte gissat ur datan.
  function byggTillaten(avgiftRaa, oreglRaa, segment) {
    const ut = [];

    for (const f of avgiftRaa) {
      const p = f.properties || {};
      const boende = p.boendeomradekod && String(p.boendeomradekod).trim() !== 'Ingen';
      ut.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          STREET_NAME: harledNamn(segment, f),
          VEHICLE: 'fordon',
          VF_PLATS_TYP: boende ? 'P Avgift, boende' : 'P Avgift',
          PARKING_RATE: String(p.taxa || '').trim(),
          MALMO_BOENDEZON: boende ? String(p.boendeomradekod).trim() : '',
          MAX_MINUTES: null, MAX_HOURS: null, MAX_DAYS: null,
          START_TIME: null, END_TIME: null, START_WEEKDAY: '', DAY_TYPE: '',
          START_MONTH: null, START_DAY: null, END_MONTH: null, END_DAY: null,
          // Stockholms signal för äkta korttidsficka. Malmö har den inte, och
          // ett hittepåvärde hade fått appen att måla blått på lös grund.
          VF_METER: null,
          CITATION: ''
        }
      });
    }

    for (const f of oreglRaa) {
      const p = f.properties || {};
      // Utgången reglering. `aktiv_till` satt = posten gäller inte längre;
      // 1 021 av 7 645 är utgångna och skulle annars ritas som giltiga.
      if (p.aktiv_till) continue;
      const regel = String(p.trafikregel || '').trim();
      // «Ogiltig avgift» (1 post) är en anteckning om ett datafel hos kommunen,
      // inte en parkeringsregel. Den ritas inte.
      if (regel !== '24h-regeln' && regel !== 'Lastplats') continue;
      const lastplats = regel === 'Lastplats';
      ut.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          // `gatudel` ser ut som «Rosagatan (10001) (Karinsgatan - Axgatan)».
          // Namnet är allt före första parentesen — här slipper vi härledningen.
          STREET_NAME: String(p.gatudel || '').split('(')[0].trim(),
          VEHICLE: 'fordon',
          VF_PLATS_TYP: lastplats ? '7' : 'P',
          PARKING_RATE: '',
          MAX_MINUTES: null,
          MAX_HOURS: lastplats ? null : 24,
          MAX_DAYS: null,
          START_TIME: null, END_TIME: null, START_WEEKDAY: '', DAY_TYPE: '',
          START_MONTH: null, START_DAY: null, END_MONTH: null, END_DAY: null,
          VF_METER: null,
          CITATION: ''
        }
      });
    }

    return ut;
  }

  // ── Sökrute-cache ──────────────────────────────────────────────────────────
  const rutor = new Map();
  const nyckelFor = b => b.map(v => v.toFixed(5)).join(',');
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

  // Ett anrop hämtar allt en sökruta behöver. Vägnätet (70 234 poster i hela
  // kommunen) hämtas ALDRIG i sin helhet — bara rutans egna vägar, just för att
  // kunna sätta gatunamn. Det är därför den här filen inte har någon stadscache.
  function hamtaRuta(bbox) {
    const k = nyckelFor(bbox);
    const traff = ruteCache(k);
    if (traff) return Promise.resolve({ data: traff, varm: true });
    return Promise.all([
      fragaLager(LAGER.avgift, bbox),
      fragaLager(LAGER.stad,   bbox),
      fragaLager(LAGER.oregl,  bbox),
      fragaLager(LAGER.vagar,  bbox, 'NAME')
    ]).then(([avgift, stad, oregl, vagar]) => {
      const segment = byggVagIndex(vagar);
      const data = {
        stad:     byggStadFeatures(stad, segment),
        tillaten: byggTillaten(avgift, oregl, segment)
      };
      spara(k, data);
      return { data, varm: false };
    });
  }

  const fel = (res, kod, txt) => { res.writeHead(kod, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(txt); };

  function tolkaBbox(s) {
    const d = String(s || '').split(',').map(Number).slice(0, 4);
    return d.length === 4 && d.every(Number.isFinite) ? d : null;
  }

  // ── Vägar ──────────────────────────────────────────────────────────────────
  function hantera(reqUrl, req, res) {
    // Städdata i EXAKT samma svarsform som Stockholms /servicedagar-bbox.
    // Malmös regel hänger på DATUM, inte veckodag, så samma poster levereras i
    // alla efterfrågade dagsfack. Klientens cleaningActiveOn grindar på MONTH_DAY.
    if (reqUrl.pathname === '/malmo/servicedagar-bbox') {
      const flera = reqUrl.searchParams.has('dagar');
      const dagar = flera
        ? (reqUrl.searchParams.get('dagar') || '').split(',').map(s => parseInt(s, 10))
        : [0];
      const bbox = tolkaBbox(reqUrl.searchParams.get('bbox'));
      if (!bbox || (flera && (!dagar.length || dagar.some(d => !(d >= 0 && d <= 6)))))
        return fel(res, 400, 'bbox=minLng,minLat,maxLng,maxLat krävs (och dagar=0-6)'), true;
      hamtaRuta(bbox).then(({ data, varm }) => {
        const fc = () => ({ type: 'FeatureCollection', features: data.stad });
        const kropp = flera ? { dagar: Object.fromEntries(dagar.map(d => [d, fc()])) } : fc();
        send(req, res, 200, 'application/json; charset=utf-8',
             Buffer.from(JSON.stringify(kropp)), varm ? 'HIT' : 'MISS');
      }).catch(e => fel(res, 502, 'Malmös städdata otillgänglig: ' + e.message));
      return true;
    }

    // Parkering i P_TILLATEN-form. WGS84 i grader — klientens toLatLng klarar
    // både det och SWEREF99 (den skiljer på |x| > 1000), så ingen omprojicering.
    if (reqUrl.pathname === '/malmo/wfs-tillaten') {
      const bbox = tolkaBbox(reqUrl.searchParams.get('BBOX') || reqUrl.searchParams.get('bbox'));
      if (!bbox) return fel(res, 400, 'BBOX=minLng,minLat,maxLng,maxLat krävs'), true;
      hamtaRuta(bbox).then(({ data, varm }) => {
        send(req, res, 200, 'application/json; charset=utf-8',
             Buffer.from(JSON.stringify({ type: 'FeatureCollection', features: data.tillaten })),
             varm ? 'HIT' : 'MISS');
      }).catch(e => fel(res, 502, 'Malmös parkeringsdata otillgänglig: ' + e.message));
      return true;
    }

    // Schema-uppslag: samma kontrakt som /schedule, men raderna bär `monthDay`
    // i stället för `day`. Klientens scheduleText skriver då «Servas den 23:e
    // varje månad 18–22» i stället för «Servas onsdagar …».
    if (reqUrl.pathname === '/malmo/schedule') {
      const lat  = parseFloat(reqUrl.searchParams.get('lat'));
      const lng  = parseFloat(reqUrl.searchParams.get('lng'));
      const name = (reqUrl.searchParams.get('name') || '').toLowerCase().trim();
      if (!isFinite(lat) || !isFinite(lng) || !name) return fel(res, 400, 'lat/lng/name krävs'), true;
      const d = 300 / 111320, dLng = 300 / (111320 * Math.cos(lat * Math.PI / 180));
      const bbox = [lng - dLng, lat - d, lng + dLng, lat + d];
      hamtaRuta(bbox).then(({ data, varm }) => {
        const seen = new Set(), schedule = [];
        for (const f of data.stad) {
          const p = f.properties;
          if ((p.STREET_NAME || '').toLowerCase().trim() !== name) continue;
          let traff = false;
          for (const l of linjerUr(f)) {
            for (let i = 0; i < l.length - 1; i++)
              if (segDistM(lat, lng, l[i], l[i + 1]) <= 25) { traff = true; break; }
            if (traff) break;
          }
          if (!traff) continue;
          const k = p.MONTH_DAY + '_' + p.START_TIME + '_' + p.END_TIME;
          if (seen.has(k)) continue;
          seen.add(k);
          schedule.push({ monthDay: p.MONTH_DAY, s: p.START_TIME, e: p.END_TIME });
        }
        send(req, res, 200, 'application/json; charset=utf-8',
             Buffer.from(JSON.stringify({ schedule })), varm ? 'HIT' : 'MISS');
      }).catch(e => fel(res, 502, 'Malmös schema otillgängligt: ' + e.message));
      return true;
    }

    return false;
  }

  return { id: 'malmo', prefix: '/malmo/', hantera };
};
